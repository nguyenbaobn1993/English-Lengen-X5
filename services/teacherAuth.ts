/**
 * Mật khẩu giáo viên lưu trên hệ thống (Firebase), dạng mã hóa PBKDF2 — không còn mật khẩu mặc định trong code.
 * - Đổi mật khẩu trên 1 máy → có hiệu lực trên mọi máy, các máy đang đăng nhập quản trị bị đăng xuất.
 * - Thao tác xóa nguy hiểm (xóa lớp, xóa nhiều học sinh / bài liên tiếp) phải nhập lại mật khẩu.
 */
import { getFirebaseConfig } from './firebaseService';

export interface TeacherAuthRecord {
  username: string;
  displayName?: string;
  salt: string;
  hash: string;
  iterations: number;
  updatedAt: string;
}

// Nhánh "_ping" là nhánh duy nhất quy tắc bảo mật hiện tại cho phép ghi tự do
const TEACHER_AUTH_PATH = '_ping/teacher_auth';
const DEFAULT_ITERATIONS = 120000;

const endpoint = (): string | null => {
  const cfg = getFirebaseConfig();
  if (!cfg.databaseURL) return null;
  const base = cfg.databaseURL.replace(/\/+$/, '');
  return `${base}/${TEACHER_AUTH_PATH}.json${cfg.apiKey ? `?auth=${cfg.apiKey}` : ''}`;
};

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{2}/g) || []).map(h => parseInt(h, 16)));

export const normTeacherUsername = (s?: string) => (s || '').trim().toLowerCase().replace(/[\.\s_-]/g, '');

export const hashTeacherPassword = async (password: string, saltHex: string, iterations = DEFAULT_ITERATIONS): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.trim()), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
};

/** null = chưa cài mật khẩu trên hệ thống; 'error' = không kết nối được */
export const fetchTeacherAuth = async (): Promise<TeacherAuthRecord | null | 'error'> => {
  const url = endpoint();
  if (!url) return 'error';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return 'error';
    const data = await res.json();
    if (!data || typeof data !== 'object' || !data.hash || !data.salt) return null;
    return data as TeacherAuthRecord;
  } catch {
    return 'error';
  }
};

export const verifyTeacherPassword = async (
  password: string,
  username?: string
): Promise<{ ok: boolean; record?: TeacherAuthRecord; error?: string }> => {
  const record = await fetchTeacherAuth();
  if (record === 'error') return { ok: false, error: 'Không kết nối được hệ thống để kiểm tra mật khẩu. Cô kiểm tra mạng rồi thử lại nhé!' };
  if (!record) return { ok: false, error: 'Hệ thống chưa cài mật khẩu quản trị. Cô cần đặt mật khẩu quản trị trước khi đăng nhập.' };
  if (username !== undefined && normTeacherUsername(username) !== normTeacherUsername(record.username)) {
    return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu giáo viên không chính xác!' };
  }
  const hash = await hashTeacherPassword(password, record.salt, record.iterations || DEFAULT_ITERATIONS);
  if (hash !== record.hash) return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu giáo viên không chính xác!' };
  return { ok: true, record };
};

export const setTeacherPasswordOnCloud = async (
  username: string,
  password: string,
  displayName?: string
): Promise<{ ok: boolean; record?: TeacherAuthRecord; error?: string }> => {
  const url = endpoint();
  if (!url) return { ok: false, error: 'Chưa cấu hình hệ thống.' };
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = toHex(saltBytes.buffer);
  const record: TeacherAuthRecord = {
    username: username.trim(),
    displayName: (displayName || 'Thầy cô Legend X5').trim(),
    salt,
    hash: await hashTeacherPassword(password, salt, DEFAULT_ITERATIONS),
    iterations: DEFAULT_ITERATIONS,
    updatedAt: new Date().toISOString()
  };
  try {
    const res = await fetch(url, { method: 'PUT', body: JSON.stringify(record) });
    if (!res.ok) return { ok: false, error: `Không lưu được mật khẩu lên hệ thống (lỗi ${res.status}).` };
    return { ok: true, record };
  } catch {
    return { ok: false, error: 'Không kết nối được hệ thống để lưu mật khẩu.' };
  }
};

// -------------------- Xác nhận lại mật khẩu cho thao tác xóa --------------------
const DESTRUCTIVE_LOG_KEY = 'mrs_dung_destructive_log_v1';
const BURST_WINDOW_MS = 5 * 60 * 1000;
const BURST_LIMIT = 3;

const readLog = (): Record<string, number[]> => {
  try { return JSON.parse(localStorage.getItem(DESTRUCTIVE_LOG_KEY) || '{}') || {}; } catch { return {}; }
};
const writeLog = (log: Record<string, number[]>) => {
  try { localStorage.setItem(DESTRUCTIVE_LOG_KEY, JSON.stringify(log)); } catch {}
};

const askPassword = async (message: string): Promise<boolean> => {
  const input = window.prompt(message);
  if (input === null) return false;
  const res = await verifyTeacherPassword(input);
  if (!res.ok) {
    alert(res.error || 'Mật khẩu không đúng. Thao tác đã bị hủy.');
    return false;
  }
  return true;
};

/**
 * Gọi TRƯỚC khi xóa. Trả về true nếu được phép xóa.
 * - kind 'class': luôn hỏi lại mật khẩu quản trị.
 * - kind 'student' / 'assignment': từ lần xóa thứ 3 trong 5 phút trở đi phải nhập mật khẩu (chống xóa hàng loạt).
 */
export const guardDestructiveAction = async (kind: 'class' | 'student' | 'assignment', label: string): Promise<boolean> => {
  const now = Date.now();
  const log = readLog();
  const recent = (log[kind] || []).filter(t => now - t < BURST_WINDOW_MS);
  const mustAsk = kind === 'class' || recent.length >= BURST_LIMIT - 1;
  if (mustAsk) {
    const msg = kind === 'class'
      ? `🔒 Xóa lớp "${label}" cần nhập lại MẬT KHẨU QUẢN TRỊ để xác nhận:`
      : `🔒 Cô vừa xóa nhiều mục liên tiếp. Nhập lại MẬT KHẨU QUẢN TRỊ để tiếp tục xóa "${label}":`;
    const ok = await askPassword(msg);
    if (!ok) return false;
    log[kind] = [now];
  } else {
    log[kind] = [...recent, now];
  }
  writeLog(log);
  return true;
};
