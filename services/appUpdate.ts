import { useEffect } from 'react';

/**
 * TỰ ĐỘNG CẬP NHẬT PHIÊN BẢN TRÊN MỌI MÁY
 *
 * Mỗi lần deploy, Vercel tạo file mã nguồn mới (assets/main-xxxx.js). Máy nào đang mở trang
 * vẫn chạy bản cũ cho tới khi tải lại — và bản cũ có thể ghi đè dữ liệu theo cách sai.
 * Module này định kỳ hỏi Vercel xem đã có bản mới chưa; nếu có thì tự tải lại trang
 * vào thời điểm an toàn (không làm mất bài học sinh đang làm / nội dung cô đang soạn).
 */

const CHECK_INTERVAL_MS = 60 * 1000;
/** Không thao tác trong khoảng này → coi là rảnh, được phép tự tải lại */
const IDLE_BEFORE_RELOAD_MS = 60 * 1000;
/** Tối đa chờ khi đang bận (làm bài / soạn bài) trước khi chỉ còn cách nhắc bằng thông báo */
const RELOAD_GUARD_KEY = 'mrs_dung_update_reload_guard';

const BUILD_FILE_RE = /\/assets\/(main-[\w-]+\.js)/;

/** Mã phiên bản đang chạy = tên file mã nguồn của trang hiện tại (chỉ có khi chạy bản build thật). */
export const getRunningBuildId = (): string | null => {
  if (typeof document === 'undefined') return null;
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  for (const s of scripts) {
    const m = s.src.match(BUILD_FILE_RE);
    if (m) return m[1];
  }
  return null;
};

/** Hỏi Vercel phiên bản mới nhất (tải index.html, không dùng bộ nhớ đệm). */
export const fetchLatestBuildId = async (): Promise<string | null> => {
  try {
    const res = await fetch(`/?__v=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(BUILD_FILE_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

// ---------- Những việc đang dở, chưa được phép tải lại trang ----------
const blockers = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => { try { l(); } catch {} });

/** Đánh dấu một việc đang dở (VD: học sinh đang làm bài) để không tự tải lại trang. */
export const setUpdateBlocker = (key: string, reason: string | null) => {
  if (reason) blockers.set(key, reason);
  else blockers.delete(key);
  emit();
};

export const getUpdateBlockers = (): string[] => Array.from(blockers.values());

/** Hook tiện dụng: khi `active` = true thì chặn tự tải lại, kèm lý do hiển thị cho người dùng. */
export const useUpdateBlocker = (key: string, active: boolean, reason: string) => {
  useEffect(() => {
    setUpdateBlocker(key, active ? reason : null);
    return () => setUpdateBlocker(key, null);
  }, [key, active, reason]);
};

// ---------- Trạng thái cập nhật ----------
export interface UpdateState {
  runningBuild: string | null;
  latestBuild: string | null;
  updateAvailable: boolean;
  blockers: string[];
}

let state: UpdateState = { runningBuild: null, latestBuild: null, updateAvailable: false, blockers: [] };
const stateListeners = new Set<(s: UpdateState) => void>();
const publish = () => {
  state = { ...state, blockers: getUpdateBlockers() };
  stateListeners.forEach(l => { try { l(state); } catch {} });
};
listeners.add(publish);

export const subscribeUpdateState = (fn: (s: UpdateState) => void): (() => void) => {
  stateListeners.add(fn);
  fn(state);
  return () => { stateListeners.delete(fn); };
};

/** Tải lại ngay (có chốt chặn để không lặp vô hạn nếu CDN chưa kịp cập nhật). */
export const reloadToLatest = () => {
  try {
    const guard = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null');
    if (guard && guard.target === state.latestBuild && Date.now() - guard.at < 2 * 60 * 1000) {
      // Vừa tải lại vì đúng bản này mà vẫn chưa nhận được → đợi lần kiểm tra sau
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ target: state.latestBuild, at: Date.now() }));
  } catch {}
  window.location.reload();
};

let started = false;
let lastInteraction = Date.now();

/**
 * Bắt đầu theo dõi phiên bản. Gọi 1 lần ở gốc ứng dụng.
 * Quy tắc tự tải lại khi có bản mới:
 *  - Không có việc đang dở (bài đang làm, bài đang soạn...), VÀ
 *  - Trang đang ẩn (người dùng chuyển tab / tắt màn hình) HOẶC không thao tác ≥ 60 giây.
 * Nếu đang dở: hiện thông báo, tự cập nhật ngay khi việc dở kết thúc.
 */
export const startAutoUpdate = (): (() => void) => {
  if (typeof window === 'undefined' || started) return () => {};
  const running = getRunningBuildId();
  if (!running) return () => {}; // chạy ở chế độ phát triển (npm run dev) → không áp dụng
  started = true;
  state = { ...state, runningBuild: running };

  const markActive = () => { lastInteraction = Date.now(); };
  const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'input'];
  activityEvents.forEach(ev => window.addEventListener(ev, markActive, { passive: true }));

  const tryAutoReload = () => {
    if (!state.updateAvailable) return;
    if (getUpdateBlockers().length > 0) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const idle = Date.now() - lastInteraction >= IDLE_BEFORE_RELOAD_MS;
    if (hidden || idle) reloadToLatest();
  };

  const check = async () => {
    const latest = await fetchLatestBuildId();
    if (latest && latest !== running) {
      const wasAvailable = state.updateAvailable;
      state = { ...state, latestBuild: latest, updateAvailable: true };
      if (!wasAvailable) publish();
    }
    tryAutoReload();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') check();
    else tryAutoReload();
  };

  check();
  const timer = setInterval(check, CHECK_INTERVAL_MS);
  const idleTimer = setInterval(tryAutoReload, 15 * 1000);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  // Khi việc dở vừa kết thúc (VD học sinh nộp bài xong) → thử cập nhật
  const onBlockersChanged = () => setTimeout(tryAutoReload, 3000);
  listeners.add(onBlockersChanged);

  return () => {
    clearInterval(timer);
    clearInterval(idleTimer);
    activityEvents.forEach(ev => window.removeEventListener(ev, markActive));
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', check);
    window.removeEventListener('online', check);
    listeners.delete(onBlockersChanged);
    started = false;
  };
};
