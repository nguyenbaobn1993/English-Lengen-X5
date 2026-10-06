import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Submission } from '../../types';
import { getSubmissions, subscribeToSync } from '../../services/assignmentService';

/**
 * Chuông thông báo bài nộp mới cho giáo viên.
 *
 * Nguồn dữ liệu là chính danh sách bài nộp đã được đồng bộ realtime (SSE + polling trong initCloudSync),
 * nên không cần thêm kết nối mạng riêng. "Đã xem đến lúc nào" được lưu trên từng máy của giáo viên.
 */

const LAST_SEEN_KEY = 'mrs_dung_notif_last_seen_at';
const MUTED_KEY = 'mrs_dung_notif_sound_muted';
const MAX_ITEMS = 40;

const readNumber = (key: string): number | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
};

const subTime = (s: Submission): number => {
  const t = new Date(s.submittedAt || 0).getTime();
  return isNaN(t) ? 0 : t;
};

const playBeep = () => {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 0.18].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
    setTimeout(() => ctx.close && ctx.close(), 800);
  } catch {
    // Trình duyệt chặn âm thanh khi chưa có thao tác người dùng → bỏ qua
  }
};

const formatTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} giờ trước`;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const AdminNotificationBell: React.FC = () => {
  const [lastSeenAt, setLastSeenAt] = useState<number>(() => {
    const saved = readNumber(LAST_SEEN_KEY);
    if (saved !== null) return saved;
    // Lần đầu dùng: không đánh dấu hàng trăm bài cũ là "mới"
    const now = Date.now();
    try { localStorage.setItem(LAST_SEEN_KEY, String(now)); } catch {}
    return now;
  });
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTED_KEY) === 'true'; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<Submission | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const recent = useMemo(() => {
    return [...getSubmissions()]
      .sort((a, b) => subTime(b) - subTime(a))
      .slice(0, MAX_ITEMS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const unread = recent.filter(s => subTime(s) > lastSeenAt);

  // Lắng nghe bài nộp mới từ luồng đồng bộ realtime
  useEffect(() => {
    return subscribeToSync(event => {
      if (
        event.type === 'submission_created' ||
        event.type === 'submission_deleted' ||
        event.type === 'submissions_updated' ||
        event.type === 'cloud_sync_completed'
      ) {
        setVersion(v => v + 1);
      }
    });
  }, []);

  // Phát hiện bài nộp vừa đến → hiện toast + chuông
  useEffect(() => {
    const ids = new Set(recent.map(s => s.id));
    if (knownIdsRef.current === null) {
      knownIdsRef.current = ids;
      return;
    }
    const fresh = recent.filter(s => !knownIdsRef.current!.has(s.id) && subTime(s) > lastSeenAt);
    knownIdsRef.current = ids;
    if (fresh.length > 0) {
      setToast(fresh[0]);
      if (!muted) playBeep();
    }
  }, [recent, lastSeenAt, muted]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  // Đóng dropdown khi bấm ra ngoài
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const markAllRead = () => {
    const newest = recent.length > 0 ? Math.max(Date.now(), subTime(recent[0])) : Date.now();
    setLastSeenAt(newest);
    try { localStorage.setItem(LAST_SEEN_KEY, String(newest)); } catch {}
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem(MUTED_KEY, String(next)); } catch {}
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all"
        title="Thông báo bài nộp mới"
      >
        <span className="text-base">🔔</span>
        {unread.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center ring-2 ring-brand-700">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,380px)] bg-white text-slate-800 rounded-2xl shadow-2xl border border-brand-100 z-[60] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-brand-50 border-b border-brand-100">
            <span className="font-black text-sm text-brand-800">Bài nộp mới ({unread.length})</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleMute} className="text-xs font-bold text-slate-500 hover:text-slate-800" title="Bật/tắt chuông">
                {muted ? '🔕 Đã tắt chuông' : '🔊 Chuông bật'}
              </button>
              {unread.length > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs font-bold text-brand-600 hover:text-brand-800">
                  Đánh dấu đã xem
                </button>
              )}
            </div>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {recent.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">Chưa có bài nộp nào.</li>
            )}
            {recent.map(s => {
              const isNew = subTime(s) > lastSeenAt;
              return (
                <li key={s.id} className={`px-4 py-3 text-sm ${isNew ? 'bg-amber-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold truncate">
                        {isNew && <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5 align-middle" />}
                        {s.studentName}
                        {s.studentClass && <span className="ml-1 text-xs font-semibold text-slate-500">({s.studentClass})</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{s.assignmentTitle || s.topic || 'Bài tập'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-brand-700">{typeof s.score === 'number' ? s.score : 0}/10</p>
                      <p className="text-[11px] text-slate-400">{formatTime(s.submittedAt)}</p>
                      {s.isLate && <p className="text-[10px] font-bold text-rose-600">Quá hạn</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-[calc(100vw-2rem)] w-[340px] bg-white text-slate-800 rounded-2xl shadow-2xl border-2 border-emerald-300 p-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📥</span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-sm text-emerald-700">Có bài nộp mới!</p>
              <p className="text-sm font-bold truncate">
                {toast.studentName}{toast.studentClass ? ` (${toast.studentClass})` : ''} – {typeof toast.score === 'number' ? toast.score : 0}/10
              </p>
              <p className="text-xs text-slate-500 truncate">{toast.assignmentTitle || toast.topic || 'Bài tập'}</p>
            </div>
            <button type="button" onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none">×</button>
          </div>
        </div>
      )}
    </div>
  );
};
