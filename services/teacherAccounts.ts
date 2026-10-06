/**
 * TÀI KHOẢN GIÁO VIÊN (ngoài tài khoản quản trị)
 *
 * - Tài khoản quản trị (chủ trung tâm) vẫn là `_ping/teacher_auth` như cũ.
 * - Giáo viên khác do quản trị tạo, lưu ở `_ping/teacher_accounts/<id>`, mật khẩu mã hóa PBKDF2.
 * - Giáo viên dùng mọi chức năng dạy học (soạn & giao bài, chấm, học sinh, điểm danh, báo cáo).
 *   Chỉ quản trị mới: thêm/xóa/khóa giáo viên, đổi mật khẩu quản trị, xác nhận xóa lớp.
 * - Khóa / xóa / đặt lại mật khẩu một giáo viên → máy của giáo viên đó tự đăng xuất trong ~1 phút.
 */
import { getFirebaseConfig } from './firebaseService';
import { hashTeacherPassword, normTeacherUsername } from './teacherAuth';

export interface TeacherAccount {
  id: string;
  username: string;
  displayName: string;
  salt: string;
  hash: string;
  iterations: number;
  disabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

const ACCOUNTS_PATH = '_ping/teacher_accounts';
const ITERATIONS = 120000;

const url = (sub = ''): string | null => {
  const cfg = getFirebaseConfig();
  if (!cfg.databaseURL) return null;
  const base = cfg.databaseURL.replace(/\/+$/, '');
  return `${base}/${ACCOUNTS_PATH}${sub ? `/${encodeURIComponent(sub)}` : ''}.json${cfg.apiKey ? `?auth=${cfg.apiKey}` : ''}`;
};

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

export const listTeacherAccounts = async (): Promise<TeacherAccount[] | 'error'> => {
  const u = url();
  if (!u) return 'error';
  try {
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) return 'error';
    const data = await res.json();
    return Object.values(data || {})
      .filter((x: any) => x && x.id && x.username)
      .sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt))) as TeacherAccount[];
  } catch {
    return 'error';
  }
};

export const getTeacherAccount = async (id: string): Promise<TeacherAccount | null | 'error'> => {
  const u = url(id);
  if (!u) return 'error';
  try {
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) return 'error';
    const data = await res.json();
    return data && data.id ? (data as TeacherAccount) : null;
  } catch {
    return 'error';
  }
};

const put = async (acc: TeacherAccount): Promise<boolean> => {
  const u = url(acc.id);
  if (!u) return false;
  try {
    const res = await fetch(u, { method: 'PUT', body: JSON.stringify(acc) });
    return res.ok;
  } catch {
    return false;
  }
};

const makeSecret = async (password: string) => {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return { salt, hash: await hashTeacherPassword(password, salt, ITERATIONS), iterations: ITERATIONS };
};

export const createTeacherAccount = async (
  username: string,
  displayName: string,
  password: string,
  adminUsername: string
): Promise<{ ok: boolean; error?: string }> => {
  const uname = username.trim();
  if (!uname) return { ok: false, error: 'Tên đăng nhập không được để trống.' };
  if (password.trim().length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  if (normTeacherUsername(uname) === normTeacherUsername(adminUsername)) {
    return { ok: false, error: 'Tên đăng nhập này trùng với tài khoản quản trị.' };
  }
  const list = await listTeacherAccounts();
  if (list === 'error') return { ok: false, error: 'Không kết nối được hệ thống.' };
  if (list.some(a => normTeacherUsername(a.username) === normTeacherUsername(uname))) {
    return { ok: false, error: 'Tên đăng nhập đã có giáo viên khác dùng.' };
  }
  const now = new Date().toISOString();
  const acc: TeacherAccount = {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    username: uname,
    displayName: displayName.trim() || uname,
    ...(await makeSecret(password)),
    disabled: false,
    createdAt: now,
    updatedAt: now
  };
  return (await put(acc)) ? { ok: true } : { ok: false, error: 'Không lưu được lên hệ thống.' };
};

export const resetTeacherAccountPassword = async (acc: TeacherAccount, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
  if (newPassword.trim().length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  const next = { ...acc, ...(await makeSecret(newPassword)), updatedAt: new Date().toISOString() };
  return (await put(next)) ? { ok: true } : { ok: false, error: 'Không lưu được lên hệ thống.' };
};

export const setTeacherAccountDisabled = async (acc: TeacherAccount, disabled: boolean): Promise<boolean> =>
  put({ ...acc, disabled, updatedAt: new Date().toISOString() });

export const deleteTeacherAccount = async (id: string): Promise<boolean> => {
  const u = url(id);
  if (!u) return false;
  try {
    const res = await fetch(u, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
};

/** Đăng nhập bằng tài khoản giáo viên (không phải quản trị) */
export const verifyTeacherAccount = async (
  username: string,
  password: string
): Promise<{ ok: boolean; account?: TeacherAccount; error?: string }> => {
  const list = await listTeacherAccounts();
  if (list === 'error') return { ok: false, error: 'Không kết nối được hệ thống để kiểm tra mật khẩu.' };
  const acc = list.find(a => normTeacherUsername(a.username) === normTeacherUsername(username));
  if (!acc) return { ok: false };
  const hash = await hashTeacherPassword(password, acc.salt, acc.iterations || ITERATIONS);
  if (hash !== acc.hash) return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu giáo viên không chính xác!' };
  if (acc.disabled) return { ok: false, error: 'Tài khoản giáo viên này đang bị khóa. Liên hệ quản trị trung tâm.' };
  return { ok: true, account: acc };
};

/** Giáo viên tự đổi mật khẩu của mình (cần mật khẩu hiện tại) */
export const changeOwnTeacherPassword = async (
  accountId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; updatedAt?: string; error?: string }> => {
  const acc = await getTeacherAccount(accountId);
  if (acc === 'error' || !acc) return { ok: false, error: 'Không tìm thấy tài khoản trên hệ thống.' };
  const hash = await hashTeacherPassword(currentPassword, acc.salt, acc.iterations || ITERATIONS);
  if (hash !== acc.hash) return { ok: false, error: 'Mật khẩu hiện tại không chính xác.' };
  if (newPassword.trim().length < 6) return { ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  const next = { ...acc, ...(await makeSecret(newPassword)), updatedAt: new Date().toISOString() };
  return (await put(next)) ? { ok: true, updatedAt: next.updatedAt } : { ok: false, error: 'Không lưu được lên hệ thống.' };
};
