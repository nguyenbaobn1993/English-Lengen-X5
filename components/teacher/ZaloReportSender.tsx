import React, { useEffect, useMemo, useState } from 'react';
import { getClasses, getStudents, subscribeToSync } from '../../services/assignmentService';
import {
  ReportPeriod, SkillKey, SKILL_LABELS, StudentReport, buildStudentReport, formatReportMessage,
  monthPeriod, rankOf, zaloPhone
} from '../../services/progressReport';
import { renderReportPng, reportFileName, downloadBlob, copyReportImage } from './ReportCardImage';

/**
 * GỬI NHẬN XÉT KẾT QUẢ HỌC TẬP QUA ZALO (miễn phí, bán tự động)
 * - App soạn sẵn nhận xét từng học sinh theo mẫu của trung tâm.
 * - Bấm "Gửi Zalo": nội dung được sao chép + mở khung chat Zalo của số phụ huynh → dán (Ctrl+V) và gửi.
 * - Zalo không cho gửi tự động tới số điện thoại từ tài khoản cá nhân; gửi hoàn toàn tự động cần
 *   Zalo Official Account + ZNS (có phí, cần xác thực doanh nghiệp) — chưa bật.
 */

const SENT_KEY = 'lx5_zalo_sent_v1';
const DRAFT_KEY = 'lx5_zalo_drafts_v1';
const EDITABLE_SKILLS: SkillKey[] = ['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing'];

interface Draft { comment?: string; focus?: string[]; skills?: Partial<Record<SkillKey, number | null>> }

const readJson = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } };
const writeJson = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const copyText = async (text: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
};

/** Áp bản sửa của giáo viên lên báo cáo tự tính */
const applyDraft = (r: StudentReport, d?: Draft): StudentReport => {
  if (!d) return r;
  const skills = { ...r.skills };
  Object.entries(d.skills || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || (v as any) === '') delete (skills as any)[k];
    else (skills as any)[k] = Math.max(0, Math.min(10, Number(v)));
  });
  const vals = Object.values(skills).filter((v): v is number => typeof v === 'number');
  const average = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  return {
    ...r, skills, average, rank: rankOf(average),
    comment: d.comment ?? r.comment,
    focus: d.focus && d.focus.length ? d.focus : r.focus
  };
};

export const ZaloReportSender = () => {
  const now = new Date();
  const [classes, setClasses] = useState(getClasses());
  const [classId, setClassId] = useState<string>(() => getClasses()[0]?.id || '');
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeLabel, setRangeLabel] = useState('');
  const [tick, setTick] = useState(0);
  const [sent, setSent] = useState<Record<string, Record<string, string>>>(() => readJson(SENT_KEY, {}));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => readJson(DRAFT_KEY, {}));
  const [editing, setEditing] = useState<StudentReport | null>(null);
  const [wizardIdx, setWizardIdx] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => subscribeToSync(() => { setClasses(getClasses()); setTick(t => t + 1); }), []);
  useEffect(() => { if (!classId && classes[0]) setClassId(classes[0].id); }, [classes, classId]);

  const period: ReportPeriod | null = useMemo(() => {
    if (mode === 'month') return monthPeriod(year, month);
    if (!from || !to || from > to) return null;
    const vi = (s: string) => s.split('-').reverse().join('/');
    return { from, to, label: rangeLabel.trim() || `${vi(from)} – ${vi(to)}` };
  }, [mode, month, year, from, to, rangeLabel]);

  const periodKey = period ? `${classId}|${period.from}|${period.to}` : '';
  const cls = classes.find(c => c.id === classId);

  const reports: StudentReport[] = useMemo(() => {
    if (!period || !cls) return [];
    return getStudents(cls.id)
      .filter(s => s.status !== 'dropped_out')
      .map(s => applyDraft(buildStudentReport(s, cls, period), drafts[`${periodKey}|${s.id}`]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.from, period?.to, period?.label, cls?.id, drafts, tick]);

  const sentMap = sent[periodKey] || {};
  const withPhone = reports.filter(r => zaloPhone(r.student.phone));
  const queue = withPhone.filter(r => !sentMap[r.student.id]);

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(''), 4500); };

  const markSent = (studentId: string, value: boolean) => {
    const next = { ...sent, [periodKey]: { ...(sent[periodKey] || {}) } };
    if (value) next[periodKey][studentId] = new Date().toISOString();
    else delete next[periodKey][studentId];
    setSent(next); writeJson(SENT_KEY, next);
  };

  /** Sao chép nội dung rồi mở khung chat Zalo của phụ huynh */
  const sendOne = async (r: StudentReport) => {
    const phone = zaloPhone(r.student.phone);
    if (!phone) { showToast(`⚠️ ${r.student.name} chưa có số điện thoại hợp lệ. Cập nhật ở mục Quản lý học sinh.`); return; }
    const ok = await copyText(formatReportMessage(r));
    window.open(`https://zalo.me/${phone}`, '_blank', 'noopener');
    markSent(r.student.id, true);
    showToast(ok
      ? `📋 Đã sao chép nhận xét của ${r.student.name}. Trong Zalo bấm Ctrl+V (hoặc giữ → Dán) rồi Gửi.`
      : `⚠️ Trình duyệt chặn sao chép tự động. Bấm "Xem & sửa" để sao chép thủ công.`);
  };

  const saveDraft = (studentId: string, d: Draft) => {
    const next = { ...drafts, [`${periodKey}|${studentId}`]: d };
    setDrafts(next); writeJson(DRAFT_KEY, next);
  };
  const resetDraft = (studentId: string) => {
    const next = { ...drafts }; delete next[`${periodKey}|${studentId}`];
    setDrafts(next); writeJson(DRAFT_KEY, next);
  };

  /** Tải phiếu báo cáo dạng ảnh PNG */
  const exportImage = async (r: StudentReport) => {
    if (busy) return;
    setBusy(r.student.id);
    try {
      downloadBlob(await renderReportPng(r), reportFileName(r));
      showToast(`🖼 Đã tải ảnh phiếu báo cáo của ${r.student.name}.`);
    } catch (e: any) {
      showToast(`⚠️ Không xuất được ảnh: ${e?.message || e}`);
    } finally { setBusy(''); }
  };

  const exportAllImages = async () => {
    if (busy || !reports.length) return;
    setBusy('ALL');
    let ok = 0;
    for (const r of reports) {
      showToast(`🖼 Đang xuất ảnh ${ok + 1}/${reports.length}: ${r.student.name}...`);
      try { downloadBlob(await renderReportPng(r), reportFileName(r)); ok++; } catch {}
      await new Promise(res => setTimeout(res, 400));
    }
    setBusy('');
    showToast(`🖼 Đã xuất ${ok}/${reports.length} ảnh phiếu báo cáo (trình duyệt có thể hỏi cho phép tải nhiều tệp).`);
  };

  /** Sao chép ẢNH phiếu báo cáo + mở Zalo → dán ảnh vào khung chat */
  const sendImage = async (r: StudentReport) => {
    const phone = zaloPhone(r.student.phone);
    if (!phone) { showToast(`⚠️ ${r.student.name} chưa có số điện thoại hợp lệ.`); return; }
    setBusy(r.student.id);
    const ok = await copyReportImage(r);
    setBusy('');
    window.open(`https://zalo.me/${phone}`, '_blank', 'noopener');
    markSent(r.student.id, true);
    showToast(ok
      ? `🖼 Đã sao chép ẢNH phiếu báo cáo của ${r.student.name}. Trong Zalo bấm Ctrl+V rồi Gửi.`
      : '⚠️ Trình duyệt chưa cho sao chép ảnh — dùng nút "🖼 Xuất ảnh" rồi gửi tệp ảnh vào Zalo.');
  };

  const copyAll = async () => {
    const text = reports.map(r => formatReportMessage(r)).join('\n\n────────────────────\n\n');
    const ok = await copyText(text);
    showToast(ok ? `📋 Đã sao chép nhận xét của ${reports.length} học sinh.` : '⚠️ Không sao chép được.');
  };

  const wizardReport = wizardIdx !== null ? queue[wizardIdx] : undefined;

  return (
    <div className="space-y-5 font-sans animate-fade-in">
      {/* Tiêu đề */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-brand-100 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📨</span>
          <h2 className="text-xl sm:text-2xl font-black text-brand-900">Gửi Nhận Xét Kết Quả Học Tập Qua Zalo</h2>
        </div>
        <p className="text-sm text-slate-500">
          App tự soạn nhận xét từng học sinh theo mẫu của trung tâm (điểm 5 kỹ năng, chuyên cần, hoàn thành bài tập, định hướng).
          Bấm <b>📨 Gửi Zalo</b> (dạng chữ) hoặc <b>🖼 Gửi ảnh</b> (phiếu báo cáo dạng ảnh): nội dung được sao chép và mở khung chat Zalo của số phụ huynh — cô chỉ cần <b>dán (Ctrl+V)</b> rồi <b>Gửi</b>. Nút <b>🖼 Xuất ảnh</b> tải phiếu về máy.
        </p>
        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
          ℹ️ Miễn phí, dùng Zalo cá nhân của cô. Zalo không cho gửi tin hoàn toàn tự động tới số điện thoại; muốn tự động 100% cần
          Zalo Official Account + ZNS (tính phí theo tin, cần xác thực doanh nghiệp) — hiện <b>chưa bật</b>.
        </div>

        {/* Bộ lọc */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <label className="text-xs font-black uppercase text-slate-500 space-y-1">
            <span>Lớp</span>
            <select value={classId} onChange={e => setClassId(e.target.value)} className="w-full p-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm text-slate-800 normal-case">
              {classes.length === 0 && <option value="">Chưa có lớp</option>}
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-black uppercase text-slate-500 space-y-1">
            <span>Kỳ đánh giá</span>
            <select value={mode} onChange={e => setMode(e.target.value as any)} className="w-full p-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm text-slate-800 normal-case">
              <option value="month">Theo tháng</option>
              <option value="range">Khoảng thời gian (học kỳ...)</option>
            </select>
          </label>
          {mode === 'month' ? (
            <>
              <label className="text-xs font-black uppercase text-slate-500 space-y-1">
                <span>Tháng</span>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full p-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm text-slate-800 normal-case">
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
                </select>
              </label>
              <label className="text-xs font-black uppercase text-slate-500 space-y-1">
                <span>Năm</span>
                <input type="number" value={year} onChange={e => setYear(Number(e.target.value) || now.getFullYear())} className="w-full p-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm text-slate-800" />
              </label>
            </>
          ) : (
            <>
              <label className="text-xs font-black uppercase text-slate-500 space-y-1">
                <span>Từ ngày – Đến ngày</span>
                <div className="flex gap-1">
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full p-2 rounded-xl border-2 border-slate-200 font-bold text-xs text-slate-800" />
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full p-2 rounded-xl border-2 border-slate-200 font-bold text-xs text-slate-800" />
                </div>
              </label>
              <label className="text-xs font-black uppercase text-slate-500 space-y-1">
                <span>Tên kỳ (tùy chọn)</span>
                <input value={rangeLabel} onChange={e => setRangeLabel(e.target.value)} placeholder="VD: Học kỳ 1 (2026–2027)" className="w-full p-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm text-slate-800 normal-case" />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Tổng quan + nút hàng loạt */}
      {period && cls && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-xl border border-brand-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200">👥 {reports.length} học sinh</span>
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">📱 {withPhone.length} có SĐT Zalo</span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">✅ Đã gửi {Object.keys(sentMap).length}</span>
            {reports.length - withPhone.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">⚠️ {reports.length - withPhone.length} thiếu / sai SĐT</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyAll} disabled={!reports.length} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm disabled:opacity-50">
              📋 Sao chép tất cả
            </button>
            <button type="button" onClick={exportAllImages} disabled={!reports.length || !!busy} className="px-4 py-2.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200 font-bold text-sm disabled:opacity-50">
              {busy === 'ALL' ? '⏳ Đang xuất ảnh...' : '🖼 Xuất ảnh cả lớp'}
            </button>
            <button
              type="button"
              onClick={() => setWizardIdx(0)}
              disabled={!queue.length}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-b from-highlight-300 via-highlight-400 to-highlight-500 text-brand-900 font-black text-sm shadow-md disabled:opacity-50"
            >
              ▶️ Gửi lần lượt ({queue.length} chưa gửi)
            </button>
          </div>
        </div>
      )}

      {!cls && <div className="bg-white rounded-3xl p-8 text-center text-slate-500 font-semibold">Chưa có lớp học nào. Hãy tạo lớp và thêm học sinh trước.</div>}
      {mode === 'range' && !period && <div className="bg-white rounded-3xl p-6 text-center text-slate-500 font-semibold">Chọn ngày bắt đầu và kết thúc của kỳ đánh giá.</div>}

      {/* Danh sách học sinh */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {reports.map(r => {
          const phone = zaloPhone(r.student.phone);
          const sentAt = sentMap[r.student.id];
          const edited = !!drafts[`${periodKey}|${r.student.id}`];
          return (
            <div key={r.student.id} className={`bg-white rounded-2xl p-4 border-2 shadow-sm ${sentAt ? 'border-emerald-300' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-black text-slate-800 truncate">{r.student.avatar || '🎒'} {r.student.name}{r.student.englishName ? <span className="text-slate-400 font-bold"> · {r.student.englishName}</span> : null}</div>
                  <div className={`text-xs font-bold ${phone ? 'text-slate-500' : 'text-rose-600'}`}>📱 {phone || (r.student.phone ? `${r.student.phone} (không hợp lệ)` : 'Chưa có SĐT phụ huynh')}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xl font-black text-brand-800">{r.average === null ? '—' : r.average.toString().replace('.', ',')}</div>
                  <div className="text-[10px] font-black uppercase text-slate-500">{r.rank}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] font-bold">
                {EDITABLE_SKILLS.filter(k => typeof r.skills[k] === 'number').map(k => (
                  <span key={k} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{SKILL_LABELS[k]} {String(r.skills[k]).replace('.', ',')}</span>
                ))}
                <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700">Chuyên cần {r.attendanceRate === null ? '—' : `${r.attendanceRate}%`}</span>
                <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">Bài tập {r.doneCount}/{r.assignedCount}</span>
                {edited && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">✏️ Đã sửa</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button type="button" onClick={() => setEditing(r)} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">👁 Xem & sửa</button>
                <button type="button" onClick={() => exportImage(r)} disabled={!!busy} className="px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200 font-bold text-xs disabled:opacity-50">{busy === r.student.id ? '⏳' : '🖼 Xuất ảnh'}</button>
                <button type="button" onClick={() => sendOne(r)} disabled={!phone} className="px-3 py-2 rounded-xl bg-[#0068ff] hover:bg-[#0055d4] text-white font-black text-xs disabled:opacity-40">📨 Gửi Zalo</button>
                <button type="button" onClick={() => sendImage(r)} disabled={!phone || !!busy} title="Sao chép ảnh phiếu báo cáo rồi mở Zalo" className="px-3 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 text-[#0055d4] font-black text-xs disabled:opacity-40">🖼 Gửi ảnh</button>
                {sentAt ? (
                  <button type="button" onClick={() => markSent(r.student.id, false)} className="ml-auto text-[11px] font-bold text-emerald-700 hover:underline" title="Bấm để đánh dấu lại là chưa gửi">
                    ✅ Đã gửi {new Date(sentAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </button>
                ) : (
                  <span className="ml-auto text-[11px] font-bold text-slate-400">Chưa gửi</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hộp xem & sửa */}
      {editing && (
        <EditReportModal
          report={editing}
          draft={drafts[`${periodKey}|${editing.student.id}`]}
          onClose={() => setEditing(null)}
          onSave={d => { saveDraft(editing.student.id, d); setEditing(null); showToast(`💾 Đã lưu nhận xét của ${editing.student.name}.`); }}
          onReset={() => { resetDraft(editing.student.id); setEditing(null); showToast('↺ Đã khôi phục nhận xét tự động.'); }}
          onCopy={async text => showToast((await copyText(text)) ? '📋 Đã sao chép nội dung.' : '⚠️ Không sao chép được.')}
          onExportImage={async rep => { try { downloadBlob(await renderReportPng(rep), reportFileName(rep)); showToast('🖼 Đã tải ảnh phiếu báo cáo.'); } catch (e: any) { showToast(`⚠️ Không xuất được ảnh: ${e?.message || e}`); } }}
          onCopyImage={async rep => showToast((await copyReportImage(rep)) ? '🖼 Đã sao chép ảnh — dán (Ctrl+V) vào Zalo.' : '⚠️ Trình duyệt chưa cho sao chép ảnh, hãy dùng Xuất ảnh.')}
        />
      )}

      {/* Gửi lần lượt */}
      {wizardIdx !== null && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="font-black text-brand-900">▶️ Gửi lần lượt {wizardReport ? `(${wizardIdx + 1}/${queue.length})` : ''}</div>
              <button type="button" onClick={() => setWizardIdx(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold">✕</button>
            </div>
            {wizardReport ? (
              <>
                <div className="p-4 space-y-2 overflow-y-auto">
                  <div className="font-black text-slate-800">{wizardReport.student.name} · 📱 {zaloPhone(wizardReport.student.phone)}</div>
                  <pre className="whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 font-sans text-slate-700 max-h-[50vh] overflow-y-auto">{formatReportMessage(wizardReport)}</pre>
                  <p className="text-[11px] text-slate-500">1) Bấm <b>Sao chép & mở Zalo</b> → 2) trong Zalo dán (Ctrl+V) và Gửi → 3) quay lại bấm <b>Em tiếp theo</b>.</p>
                </div>
                <div className="p-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                  <button type="button" onClick={() => setWizardIdx(i => (i === null ? null : i + 1))} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm">⏭ Bỏ qua</button>
                  <button type="button" onClick={() => sendImage(wizardReport)} disabled={!!busy} className="px-4 py-2.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-[#0055d4] font-black text-sm disabled:opacity-50">🖼 Ảnh & mở Zalo</button>
                  <button type="button" onClick={() => sendOne(wizardReport)} className="px-4 py-2.5 rounded-xl bg-[#0068ff] hover:bg-[#0055d4] text-white font-black text-sm">📨 Chữ & mở Zalo</button>
                  <button type="button" onClick={() => { markSent(wizardReport.student.id, true); /* hàng đợi tự rút ngắn → giữ nguyên chỉ số */ }} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm">✓ Em tiếp theo</button>
                </div>
              </>
            ) : (
              <div className="p-8 text-center space-y-3">
                <div className="text-4xl">🎉</div>
                <div className="font-black text-brand-900">Đã đi hết danh sách cần gửi!</div>
                <button type="button" onClick={() => setWizardIdx(null)} className="px-5 py-2.5 rounded-xl bg-brand-700 text-white font-black text-sm">Đóng</button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[110] max-w-md w-[92%] bg-slate-900 text-white text-sm font-bold px-4 py-3 rounded-2xl shadow-2xl">{toast}</div>
      )}
    </div>
  );
};

const EditReportModal = ({ report, draft, onClose, onSave, onReset, onCopy, onExportImage, onCopyImage }: {
  report: StudentReport;
  draft?: Draft;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onReset: () => void;
  onCopy: (text: string) => void;
  onExportImage: (r: StudentReport) => void;
  onCopyImage: (r: StudentReport) => void;
}) => {
  const [comment, setComment] = useState(report.comment);
  const [focus1, setFocus1] = useState(report.focus[0] || '');
  const [focus2, setFocus2] = useState(report.focus[1] || '');
  const [skills, setSkills] = useState<Record<SkillKey, string>>(() =>
    Object.fromEntries(EDITABLE_SKILLS.map(k => [k, typeof report.skills[k] === 'number' ? String(report.skills[k]) : ''])) as any);

  const toDraft = (): Draft => ({
    comment,
    focus: [focus1, focus2].map(s => s.trim()).filter(Boolean),
    skills: Object.fromEntries(EDITABLE_SKILLS.map(k => [k, skills[k].trim() === '' ? null : Number(skills[k].replace(',', '.'))]))
  });
  const previewReport = applyDraft(report, toDraft());
  const preview = formatReportMessage(previewReport);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="font-black text-brand-900">✏️ Nhận xét: {report.student.name} — {report.period.label}</div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold">✕</button>
        </div>
        <div className="grid md:grid-cols-2 gap-4 p-4 overflow-y-auto">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-black uppercase text-slate-500 mb-1">Điểm kỹ năng (thang 10, để trống = chưa có)</p>
              <div className="grid grid-cols-3 gap-2">
                {EDITABLE_SKILLS.map(k => (
                  <label key={k} className="text-[11px] font-bold text-slate-600">
                    {SKILL_LABELS[k]}
                    <input value={skills[k]} onChange={e => setSkills({ ...skills, [k]: e.target.value })} inputMode="decimal" className="w-full mt-0.5 p-2 rounded-lg border-2 border-slate-200 font-bold text-sm" />
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-xs font-black uppercase text-slate-500">
              1. Nhận xét chung
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={10} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 text-sm font-medium normal-case text-slate-800" />
            </label>
            <div className="space-y-1">
              <p className="text-xs font-black uppercase text-slate-500">3. Con nên ưu tiên</p>
              <input value={focus1} onChange={e => setFocus1(e.target.value)} className="w-full p-2 rounded-lg border-2 border-slate-200 text-sm" />
              <input value={focus2} onChange={e => setFocus2(e.target.value)} className="w-full p-2 rounded-lg border-2 border-slate-200 text-sm" />
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase text-slate-500 mb-1">Xem trước tin nhắn</p>
            <pre className="whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 font-sans text-slate-700 max-h-[65vh] overflow-y-auto">{preview}</pre>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          {draft && <button type="button" onClick={onReset} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm">↺ Khôi phục bản tự động</button>}
          <button type="button" onClick={() => onCopy(preview)} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm">📋 Sao chép chữ</button>
          <button type="button" onClick={() => onCopyImage(previewReport)} className="px-4 py-2.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-[#0055d4] font-bold text-sm">🖼 Sao chép ảnh</button>
          <button type="button" onClick={() => onExportImage(previewReport)} className="px-4 py-2.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200 font-bold text-sm">🖼 Xuất ảnh</button>
          <button type="button" onClick={() => onSave(toDraft())} className="px-4 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-black text-sm">💾 Lưu nhận xét</button>
        </div>
      </div>
    </div>
  );
};
