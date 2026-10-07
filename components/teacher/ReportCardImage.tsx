import React from 'react';
import { createRoot } from 'react-dom/client';
import { toBlob } from 'html-to-image';
import { SKILL_LABELS, SkillKey, StudentReport } from '../../services/progressReport';

/**
 * PHIẾU BÁO CÁO KẾT QUẢ HỌC TẬP (ẢNH PNG) – theo mẫu của English Legend X5.
 * Dựng phiếu ngoài màn hình rồi chụp lại thành ảnh để tải về / dán vào Zalo.
 */

const W = 1055;
const NAVY = '#0b2a7a';
const BLUE = '#1554e8';
const GOLD = '#d99a0b';
const FONT = "'Nunito', 'Segoe UI', Arial, sans-serif";
const BRAND_FONT = "'Chakra Petch', 'Nunito', Arial, sans-serif";

const SKILL_STYLE: Record<SkillKey, { icon: string; color: string }> = {
  vocabulary: { icon: '📘', color: '#2f6bff' },
  grammar: { icon: '📗', color: '#1fa463' },
  reading: { icon: '📕', color: '#ef4b6c' },
  listening: { icon: '🎧', color: '#7c4dff' },
  speaking: { icon: '🎤', color: '#ff8a00' },
  writing: { icon: '✏️', color: '#16a5a5' }
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',');

const SectionTitle = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: `linear-gradient(90deg, ${NAVY}, ${BLUE})`, color: '#fff', borderRadius: '18px 18px 0 0', padding: '12px 18px', borderBottom: `3px solid ${GOLD}` }}>
    <span style={{ width: 44, height: 44, borderRadius: 999, background: 'linear-gradient(180deg,#ffe08a,#f5b301)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{icon}</span>
    <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.3 }}>{children}</span>
  </div>
);

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: '#ffffff', borderRadius: 18, boxShadow: '0 6px 20px rgba(11,42,122,.10)', border: '1px solid #e3ebff', overflow: 'hidden', ...style }}>{children}</div>
);

export const ReportCard = ({ report }: { report: StudentReport }) => {
  const r = report;
  const skills: SkillKey[] = ['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing'];
  const name = `${r.student.name}${r.student.englishName ? ` (${r.student.englishName})` : ''}`;
  const focus = [...r.focus, 'Duy trì thói quen học và ôn tập tiếng Anh hằng ngày.'];

  return (
    <div style={{ width: W, fontFamily: FONT, color: '#1e2a44', background: 'linear-gradient(180deg,#f3f7ff 0%,#ffffff 40%,#f3f7ff 100%)' }}>
      {/* Dải đầu trang */}
      <div style={{ position: 'relative', padding: '26px 40px 30px', background: `radial-gradient(600px 220px at 85% 0%, rgba(150,215,255,.45), transparent 60%), linear-gradient(135deg, ${NAVY} 0%, ${BLUE} 60%, #0c3cc0 100%)`, borderBottom: `6px solid ${GOLD}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src="/brand/logo.jpg" alt="" style={{ width: 92, height: 92, borderRadius: 18, border: '2px solid #f5b301', objectFit: 'cover' }} />
          <div>
            <div style={{ fontFamily: BRAND_FONT, fontWeight: 700, fontSize: 40, lineHeight: 1, color: '#fff' }}>
              ENGLISH <span style={{ color: '#ffd76a' }}>LEGEND X5</span>
            </div>
            <div style={{ fontFamily: BRAND_FONT, fontWeight: 700, fontSize: 17, letterSpacing: 4, color: '#d9e8ff', marginTop: 10 }}>LEGEND X5 - CONNECT THE WORLD</div>
          </div>
          <div style={{ marginLeft: 'auto', color: '#fff', fontStyle: 'italic', fontSize: 22, lineHeight: 1.15, textAlign: 'right', opacity: 0.9, fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>
            More English<br />Brighter Future
          </div>
        </div>
      </div>

      {/* Tiêu đề */}
      <div style={{ textAlign: 'center', padding: '26px 40px 6px' }}>
        <div style={{ fontSize: 58, fontWeight: 900, color: NAVY, lineHeight: 1.05 }}>PHIẾU BÁO CÁO</div>
        <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.1, color: GOLD }}>🌿 KẾT QUẢ HỌC TẬP 🌿</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '8px 22px', borderRadius: 999, background: '#fff', border: '1px solid #d6e2ff', fontSize: 19 }}>
          📅 Thời gian đánh giá: <b style={{ color: NAVY }}>{r.period.label}</b>
        </div>
      </div>

      <div style={{ padding: '18px 30px 0' }}>
        {/* Thông tin học sinh */}
        <Card style={{ display: 'flex', padding: '16px 20px' }}>
          {[
            { icon: '👤', label: 'Họ và tên', value: name, flex: 1.5 },
            { icon: '🎓', label: 'Lớp', value: r.className, flex: 1 },
            { icon: '📅', label: 'Thời gian đánh giá', value: r.period.label, flex: 1.2 }
          ].map((it, i) => (
            <div key={i} style={{ flex: it.flex, display: 'flex', alignItems: 'center', gap: 14, paddingLeft: i ? 18 : 0, borderLeft: i ? '1px solid #e3ebff' : 'none' }}>
              <span style={{ width: 58, height: 58, flexShrink: 0, borderRadius: 999, background: `linear-gradient(180deg, ${BLUE}, ${NAVY})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{it.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, color: '#5b6b8c' }}>{it.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: NAVY }}>{it.value}</div>
              </div>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', gap: 22, marginTop: 22, alignItems: 'flex-start' }}>
          {/* Cột trái */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <Card>
              <SectionTitle icon="💬">1. NHẬN XÉT CHUNG</SectionTitle>
              <div style={{ padding: '18px 22px', fontSize: 18, lineHeight: 1.55, background: 'linear-gradient(180deg,#fffdf6,#ffffff)' }}>
                {r.comment.split(/\n{2,}/).map((p, i) => <p key={i} style={{ margin: i ? '12px 0 0' : 0 }}>{p}</p>)}
              </div>
            </Card>
            <Card>
              <SectionTitle icon="🎯">3. ĐỊNH HƯỚNG THỜI GIAN TỚI</SectionTitle>
              <div style={{ padding: '16px 20px', fontSize: 17 }}>
                <div style={{ marginBottom: 10 }}>Con nên ưu tiên:</div>
                {focus.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: '#f1f5ff', marginTop: i ? 8 : 0 }}>
                    <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 999, background: BLUE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900 }}>✓</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Cột phải */}
          <div style={{ flex: 1 }}>
            <Card>
              <SectionTitle icon="📊">2. KẾT QUẢ ĐÁNH GIÁ</SectionTitle>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {skills.map(k => {
                    const v = r.skills[k];
                    return (
                      <div key={k} style={{ border: '1px solid #e3ebff', borderRadius: 14, padding: '14px 6px', textAlign: 'center', background: '#fff' }}>
                        <div style={{ width: 50, height: 50, margin: '0 auto', borderRadius: 999, background: SKILL_STYLE[k].color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{SKILL_STYLE[k].icon}</div>
                        <div style={{ fontWeight: 800, fontSize: 17, marginTop: 8 }}>{SKILL_LABELS[k]}</div>
                        <div style={{ fontWeight: 900, fontSize: typeof v === 'number' ? 34 : 18, color: NAVY, marginTop: 2 }}>{typeof v === 'number' ? fmt(v) : '—'}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, padding: '16px 18px', borderRadius: 16, background: 'linear-gradient(180deg,#fff7df,#fff1c4)', border: '1px solid #f5d27a' }}>
                  <span style={{ fontSize: 46 }}>🏅</span>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 17 }}>Điểm trung bình</div>
                    <div style={{ fontSize: 46, fontWeight: 900, color: NAVY, lineHeight: 1.1 }}>{r.average === null ? '—' : fmt(r.average)}</div>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: '#f0cf78' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 17 }}>Xếp loại</div>
                    <div style={{ fontSize: r.rank.length > 10 ? 24 : 40, fontWeight: 900, color: BLUE, lineHeight: 1.15 }}>{r.rank}</div>
                  </div>
                </div>

                <div style={{ marginTop: 14, border: '1px solid #e3ebff', borderRadius: 14 }}>
                  {[
                    { icon: '🗓️', label: 'Chuyên cần', value: r.attendanceRate === null ? 'Chưa có dữ liệu điểm danh' : `${r.attendanceRate}% (${r.attendanceSessions} buổi)` },
                    { icon: '📝', label: 'Hoàn thành bài tập', value: r.completionRate === null ? 'Chưa có bài giao trong kỳ' : `${r.completionRate}% (${r.doneCount}/${r.assignedCount} bài)` }
                  ].map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderTop: i ? '1px solid #e3ebff' : 'none' }}>
                      <span style={{ fontSize: 28 }}>{it.icon}</span>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 18, color: NAVY }}>{it.label}</div>
                        <div style={{ fontSize: 17 }}>{it.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Lời nhắn */}
        <Card style={{ marginTop: 22 }}>
          <SectionTitle icon="💛">LỜI NHẮN TỪ TRUNG TÂM</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px' }}>
            <span style={{ fontSize: 54, color: '#f0cf78', lineHeight: 1, fontWeight: 900 }}>“</span>
            <div style={{ flex: 1, fontSize: 18, fontStyle: 'italic', lineHeight: 1.5 }}>
              Trung tâm tin rằng với sự đồng hành của gia đình và sự cố gắng của con, kết quả học tập trong thời gian tới sẽ tiếp tục được cải thiện.
            </div>
            <div style={{ color: NAVY, fontStyle: 'italic', fontSize: 20, textAlign: 'center', fontFamily: "'Segoe Script','Brush Script MT',cursive" }}>Together<br />for a Brighter<br />Future 💙</div>
          </div>
        </Card>
      </div>

      {/* Chân trang */}
      <div style={{ marginTop: 26, padding: '16px 40px', background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, borderTop: `5px solid ${GOLD}`, color: '#fff', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: BRAND_FONT, fontWeight: 700, letterSpacing: 4, fontSize: 16 }}>🌐 ENGLISH LEGEND X5 - CONNECT THE WORLD</div>
        <div style={{ fontSize: 14, textAlign: 'right', opacity: 0.9 }}>Better English<br />Brighter Opportunities</div>
      </div>
    </div>
  );
};

/** Dựng phiếu ngoài màn hình → ảnh PNG */
export const renderReportPng = async (report: StudentReport): Promise<Blob> => {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;z-index:-1;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<ReportCard report={report} />);
    // chờ React vẽ + logo tải xong + font sẵn sàng
    await new Promise(r => setTimeout(r, 80));
    const imgs = Array.from(host.querySelectorAll('img'));
    await Promise.all(imgs.map(img => (img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = () => res(null); }))));
    try { await (document as any).fonts?.ready; } catch {}
    const node = host.firstElementChild as HTMLElement;
    const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff', width: W, cacheBust: true });
    if (!blob) throw new Error('Không tạo được ảnh');
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
};

export const reportFileName = (r: StudentReport) => {
  const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  return `Phieu-bao-cao-${clean(r.student.name)}-${clean(r.period.label)}.png`;
};

export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/** Sao chép ảnh vào bộ nhớ tạm (dán thẳng vào Zalo). Dùng ClipboardItem với Promise để giữ quyền thao tác người dùng. */
export const copyReportImage = async (report: StudentReport): Promise<boolean> => {
  try {
    const CI = (window as any).ClipboardItem;
    if (!CI || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new CI({ 'image/png': renderReportPng(report) })]);
    return true;
  } catch {
    return false;
  }
};
