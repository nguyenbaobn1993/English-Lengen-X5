import { FirebaseConfig } from '../types';
import { appStorage } from './appStorage';
import { CENTER_FIREBASE, CENTER_FIREBASE_PROJECT_ID } from '../config/center';

const FIREBASE_CONFIG_KEY = 'mrs_dung_firebase_config';

/**
 * Cơ sở dữ liệu của trung tâm — lấy từ config/center (npm run setup hoặc biến môi trường Vercel).
 * Không có giá trị mặc định: trang chưa cấu hình sẽ hiện màn hình hướng dẫn kết nối.
 */
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: CENTER_FIREBASE.apiKey,
  authDomain: CENTER_FIREBASE_PROJECT_ID ? `${CENTER_FIREBASE_PROJECT_ID}.firebaseapp.com` : '',
  databaseURL: CENTER_FIREBASE.databaseURL,
  projectId: CENTER_FIREBASE_PROJECT_ID,
  storageBucket: CENTER_FIREBASE_PROJECT_ID ? `${CENTER_FIREBASE_PROJECT_ID}.firebasestorage.app` : '',
  messagingSenderId: '',
  appId: ''
};

export const getFirebaseConfig = (): FirebaseConfig => {
  if (typeof window === 'undefined') return DEFAULT_FIREBASE_CONFIG;
  try {
    const raw = appStorage.getItem(FIREBASE_CONFIG_KEY);
    if (!raw) return DEFAULT_FIREBASE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<FirebaseConfig>;
    return {
      ...DEFAULT_FIREBASE_CONFIG,
      ...parsed,
      databaseURL: parsed.databaseURL || DEFAULT_FIREBASE_CONFIG.databaseURL
    };
  } catch {
    return DEFAULT_FIREBASE_CONFIG;
  }
};

export const saveFirebaseConfig = (config: FirebaseConfig): void => {
  if (typeof window === 'undefined') return;
  appStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
};

export const clearFirebaseConfig = (): void => {
  if (typeof window === 'undefined') return;
  appStorage.removeItem(FIREBASE_CONFIG_KEY);
};

export const isFirebaseConfigured = (): boolean => {
  const cfg = getFirebaseConfig();
  // Cho phép thêm http://localhost để chạy thử với Firebase Emulator trên máy
  return !!(cfg && cfg.databaseURL && (cfg.databaseURL.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(cfg.databaseURL)));
};

/**
 * Format Realtime Database REST URL
 */
const getDatabaseEndpoint = (databaseURL: string, path: string): string => {
  const cleanBase = databaseURL.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '').replace(/\.json$/, '');
  return `${cleanBase}/${cleanPath}.json`;
};

// ==================== MỐC PHIÊN BẢN DỮ LIỆU (CHỈ TẢI LẠI BẢNG ĐÃ THAY ĐỔI) ====================
// Firebase gửi dữ liệu KHÔNG nén: bài tập ~3,3 MB + bài nộp ~1,1 MB. Trước đây mọi máy tải lại toàn bộ
// mỗi 60 giây (~400 MB/giờ trên điện thoại học sinh) → máy yếu / mạng yếu không tải xong, không thấy lớp, không thấy bài.
// Nay mỗi lần ghi, máy ghi đánh dấu mốc thời gian của bảng vào `_ping/rev` (vài trăm byte);
// máy khác đọc mốc này trước và chỉ tải lại những bảng lớn có mốc thay đổi.
const REV_PATH = '_ping/rev';
/** Bảng lớn: chỉ tải lại khi mốc thay đổi. Bảng nhỏ (lớp, danh sách đã xóa, lịch học...) vẫn tải mỗi lượt. */
const REV_GATED_PATHS = new Set([
  'assignments', 'submissions', 'students', 'monthly_reports', 'weekly_reports', 'annual_reports', 'attendance_records'
]);
/** Dù mốc không đổi, quá thời gian này vẫn tải lại thật (phòng máy chạy bản cũ ghi mà không đánh mốc). */
const REV_MAX_TRUST_MS = 30 * 60 * 1000;
const PULLED_REV_KEY = 'mrs_dung_pulled_rev_v1';

type PulledRev = Record<string, { rev: string; at: number }>;
let pulledRevCache: PulledRev | null = null;
const loadPulledRev = (): PulledRev => {
  if (pulledRevCache) return pulledRevCache;
  try { pulledRevCache = JSON.parse(localStorage.getItem(PULLED_REV_KEY) || '{}') || {}; } catch { pulledRevCache = {}; }
  return pulledRevCache!;
};
const markPulled = (path: string, rev: string) => {
  const map = loadPulledRev();
  map[path] = { rev, at: Date.now() };
  try { localStorage.setItem(PULLED_REV_KEY, JSON.stringify(map)); } catch {}
};
const revOf = (revs: Record<string, any> | null, path: string): string => String(revs?.[path] ?? 'none');

/** Đọc mốc phiên bản các bảng (null = không đọc được → coi như phải tải lại hết). */
const fetchRevisions = async (): Promise<Record<string, any> | null> => {
  const res = await fetchFromFirebaseStrict<any>(REV_PATH, 15000);
  if (!res.ok) return null;
  return res.data && typeof res.data === 'object' ? res.data : {};
};

/** Bảng lớn có cần tải lại không: mốc đổi, chưa từng tải, dữ liệu trên máy trống, hoặc đã quá lâu. */
const needsRefetch = (path: string, revs: Record<string, any> | null): boolean => {
  if (!REV_GATED_PATHS.has(path) || !revs) return true;
  const prev = loadPulledRev()[path];
  if (!prev || prev.rev !== revOf(revs, path)) return true;
  if (Date.now() - prev.at > REV_MAX_TRUST_MS) return true;
  try {
    const raw = appStorage.getItem(`mrs_dung_${path}`);
    if (!raw || raw === '[]') return true; // máy chưa có dữ liệu bảng này (vừa xóa bộ nhớ / chưa nạp kịp)
  } catch { return true; }
  return false;
};

const pendingRevBumps = new Set<string>();
let revBumpTimer: ReturnType<typeof setTimeout> | null = null;
/** Đánh dấu bảng vừa được ghi (gom nhiều lần ghi gần nhau thành 1 lần). */
const bumpRevision = (path: string) => {
  const top = String(path || '').replace(/^\/+/, '').split('/')[0];
  if (!top || top.startsWith('_')) return;
  pendingRevBumps.add(top);
  if (revBumpTimer) return;
  revBumpTimer = setTimeout(async () => {
    revBumpTimer = null;
    const paths = Array.from(pendingRevBumps);
    pendingRevBumps.clear();
    const cfg = getFirebaseConfig();
    if (!cfg || !cfg.databaseURL || paths.length === 0) return;
    const body: Record<string, any> = {};
    paths.forEach(p => { body[p] = { '.sv': 'timestamp' }; });
    try {
      await fetch(`${getDatabaseEndpoint(cfg.databaseURL, REV_PATH)}${cfg.apiKey ? `?auth=${cfg.apiKey}` : ''}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {}
  }, 300);
};

/** Thiết bị học sinh / chưa đăng nhập: không cần báo cáo, điểm danh (chỉ giáo viên dùng). */
const TEACHER_ONLY_PATHS = new Set(['monthly_reports', 'weekly_reports', 'annual_reports', 'attendance_records']);
const isTeacherDevice = (): boolean => {
  try {
    const raw = localStorage.getItem('mrs_dung_auth_current_user');
    return !!raw && JSON.parse(raw)?.role === 'teacher';
  } catch {
    return false;
  }
};

/**
 * Ghi dữ liệu lên Firebase Realtime Database qua REST API.
 *
 * - Nếu `data` là danh sách các mục có `id` (lớp, học sinh, bài tập, báo cáo...), hàm KHÔNG ghi đè
 *   cả danh sách nữa mà chỉ PATCH từng mục thay đổi theo khóa `id` (xem patchCollectionToFirebase).
 *   Trước đây mỗi máy PUT nguyên danh sách trong bộ nhớ của mình → máy nào có dữ liệu cũ sẽ xóa mất
 *   bài giao / học sinh / bài nộp mới của máy khác.
 * - `options.replace = true` giữ hành vi ghi đè toàn bộ (chỉ dùng cho "Xóa toàn bộ dữ liệu").
 */
export const syncToFirebaseIfConfigured = async (
  path: string,
  data: any,
  options: { replace?: boolean } = {}
): Promise<boolean> => {
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return false;

  if (!options.replace && isItemList(data)) {
    return patchCollectionToFirebase(path, data);
  }

  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, path);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${url}${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok && Array.isArray(data)) {
      rememberCloudItems(path, data.filter(x => x && x.id != null));
    }
    if (res.ok) bumpRevision(path);
    return res.ok;
  } catch (error) {
    console.warn(`Firebase sync for ${path} failed (app continues in offline/local mode):`, error);
    return false;
  }
};

/**
 * Fetch data from Firebase Realtime Database if configured
 */
export const fetchFromFirebaseIfConfigured = async <T>(path: string): Promise<T | null> => {
  const res = await fetchFromFirebaseStrict<T>(path);
  return res.ok ? res.data : null;
};

/**
 * Đọc dữ liệu và phân biệt rõ "đọc thành công nhưng trống" (ok: true, data: null)
 * với "đọc thất bại do mạng / lỗi máy chủ" (ok: false).
 * Nếu gộp chung hai trường hợp này, một lần rớt mạng sẽ bị hiểu nhầm là "Firebase trống"
 * và máy đó sẽ đẩy dữ liệu cũ của mình lên đè dữ liệu thật.
 * (Thời gian chờ 60 giây: bảng bài tập/bài nộp khá nặng, mạng 3G/4G yếu cần nhiều thời gian.)
 */
export const fetchFromFirebaseStrict = async <T>(
  path: string,
  timeoutMs = 60000
): Promise<{ ok: true; data: T | null } | { ok: false }> => {
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return { ok: false };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, path);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${url}${authParam}`, { signal: controller ? controller.signal : undefined });
    if (!res.ok) return { ok: false };
    return { ok: true, data: (await res.json()) as T | null };
  } catch (error) {
    console.warn(`Firebase fetch for ${path} failed:`, error);
    return { ok: false };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

// ==================== GHI THEO TỪNG MỤC (KEYED COLLECTIONS) ====================

/** Các bảng có danh sách "đã xóa" riêng: mục bị mất trên cloud mà không có tombstone là bị mất do lỗi → được phép đẩy lại. */
export const TOMBSTONED_COLLECTIONS = new Set(['classes', 'students', 'assignments']);

/**
 * Các bảng không bao giờ xóa mục trên cloud chỉ vì máy này không còn giữ mục đó.
 * Lớp / học sinh / bài tập bị xóa đã có danh sách "đã xóa" (tombstone) riêng để ẩn đi, nên bản ghi gốc được giữ lại
 * trên cloud → luôn khôi phục được. (Trước đây máy đang ẩn một lớp đã xóa sẽ xóa luôn bản ghi gốc khi lưu.)
 */
const NO_IMPLICIT_DELETE_COLLECTIONS = new Set(['submissions', ...TOMBSTONED_COLLECTIONS]);

// ==================== QUY TẮC "THAO TÁC SAU CÙNG CỦA GIÁO VIÊN QUYẾT ĐỊNH" ====================

const toTime = (v: any): number => {
  const t = new Date(v || 0).getTime();
  return isNaN(t) ? 0 : t;
};

/** Thời điểm giáo viên thay đổi bản ghi lần cuối (thêm / sửa / khôi phục). */
export const lastTeacherChangeTime = (record: any): number =>
  record ? Math.max(toTime(record.teacherModifiedAt), toTime(record.updatedAt), toTime(record.createdAt)) : 0;

/**
 * Bản ghi bị ẩn bởi dấu "đã xóa" khi lần xóa xảy ra SAU (hoặc cùng lúc) lần thay đổi cuối của bản ghi.
 * - Giáo viên xóa → luôn ẩn (thời điểm xóa được đặt sau lần sửa cuối, xem timeAfter).
 * - Giáo viên khôi phục / thêm lại cùng mã → luôn hiện (thời điểm sửa được đặt sau lần xóa),
 *   kể cả khi một máy cũ đẩy lại dấu "đã xóa" lỗi thời.
 */
export const isHiddenByTombstone = (record: any, tombstone: any): boolean => {
  if (!tombstone) return false;
  if (!record) return true;
  const deletedAt = toTime(tombstone.deletedAt);
  if (!deletedAt) return true;
  return deletedAt >= lastTeacherChangeTime(record);
};

/**
 * Trả về thời điểm (ISO) chắc chắn SAU các mốc cho trước, để thứ tự "sửa → xóa → khôi phục" luôn đúng
 * ngay cả khi các máy lệch đồng hồ.
 */
export const timeAfter = (...isoTimes: any[]): string => {
  const latest = Math.max(Date.now(), ...isoTimes.map(t => toTime(t) + 1));
  return new Date(latest).toISOString();
};

const isItemList = (data: any): data is any[] =>
  Array.isArray(data) && data.every(x => x && typeof x === 'object' && x.id !== undefined && x.id !== null && x.id !== '');

/** Khóa Firebase không được chứa . # $ [ ] / */
export const toFirebaseKey = (id: any): string => String(id).replace(/[.#$\[\]\/]/g, '_');

const itemTime = (item: any): number => {
  if (!item) return 0;
  const t = new Date(item.teacherModifiedAt || item.updatedAt || item.submittedAt || item.createdAt || item.date || 0).getTime();
  return isNaN(t) ? 0 : t;
};

/** Chuẩn hóa như Firebase lưu (bỏ null / mảng rỗng / object rỗng, sắp khóa) để so sánh nội dung. */
const canonical = (val: any): any => {
  if (val === null || val === undefined) return undefined;
  if (Array.isArray(val)) {
    const arr = val.map(canonical);
    return arr.every(v => v === undefined) ? undefined : arr.map(v => (v === undefined ? null : v));
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    Object.keys(val).sort().forEach(k => {
      const c = canonical(val[k]);
      if (c !== undefined) out[k] = c;
    });
    return Object.keys(out).length === 0 ? undefined : out;
  }
  return val;
};

const sameContent = (a: any, b: any): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Băm nội dung một mục (cyrb53) để so sánh nhanh mà không phải lưu cả bản sao dữ liệu. */
export const contentHash = (item: any): string => {
  const str = JSON.stringify(canonical(item)) || '';
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// ---------- "Ảnh chụp" nội dung cloud ở lần đồng bộ gần nhất (id → mã băm) ----------
// Dùng để biết mục nào CHÍNH MÁY NÀY vừa sửa (nội dung khác ảnh chụp) mà không cần dựa vào đồng hồ của máy.
// Trước đây việc chọn bản thắng dựa vào thời gian ghi trên từng máy: máy nào lệch giờ thì bản sửa bị coi là "cũ"
// và bị ghi đè → giáo viên sửa xong không lưu. Ảnh chụp được lưu lại để bản sửa lúc mất mạng vẫn được đẩy lên sau khi mở lại trang.
const SNAPSHOT_STORAGE_KEY = 'mrs_dung_cloud_snapshot_v1';
let snapshotCache: Record<string, Record<string, string>> | null = null;

const loadSnapshots = (): Record<string, Record<string, string>> => {
  if (snapshotCache) return snapshotCache;
  snapshotCache = {};
  try {
    const raw = appStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') snapshotCache = parsed;
    }
  } catch {
    snapshotCache = {};
  }
  return snapshotCache!;
};

const persistSnapshots = () => {
  try {
    if (snapshotCache) {
      appStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshotCache));
    }
  } catch (err) {
    console.warn('Không lưu được ảnh chụp đồng bộ:', err);
  }
};

/** Mã băm từng mục ở lần đồng bộ gần nhất; undefined nếu máy này chưa đồng bộ bảng này lần nào. */
export const getCloudSnapshot = (path: string): Record<string, string> | undefined => loadSnapshots()[path];

/**
 * Mỗi mục trong ảnh chụp lưu "mã băm nội dung @ thời điểm thay đổi cuối".
 * Thời điểm giúp nhận ra bản trên máy CŨ HƠN bản đã thấy trên cloud (bộ nhớ máy bị lỗi thời,
 * VD trình duyệt đầy bộ nhớ không ghi được dữ liệu mới) → không bao giờ đẩy bản cũ đó lên đè.
 */
const snapEntry = (item: any): string => `${contentHash(item)}@${lastTeacherChangeTime(item)}`;
export const snapEntryHash = (entry?: string): string | undefined => (entry ? entry.split('@')[0] : undefined);
export const snapEntryTime = (entry?: string): number => {
  if (!entry || !entry.includes('@')) return 0;
  const t = Number(entry.split('@')[1]);
  return isNaN(t) ? 0 : t;
};

/**
 * Bản trên máy có phải là bản giáo viên vừa sửa trên máy này (chưa lên cloud) hay không:
 * nội dung khác ảnh chụp VÀ không cũ hơn ảnh chụp. Bản cũ hơn = dữ liệu lỗi thời trên máy.
 */
export const isNewerLocalEdit = (item: any, entry?: string): boolean => {
  if (entry === undefined) return true;
  if (snapEntryHash(entry) === contentHash(item)) return false;
  return lastTeacherChangeTime(item) >= snapEntryTime(entry);
};

/** Ghi nhận toàn bộ nội dung cloud hiện tại của một bảng. */
export const rememberCloudItems = (path: string, items: any[]) => {
  const snap: Record<string, string> = {};
  items.forEach(it => {
    if (it && it.id !== undefined && it.id !== null) snap[String(it.id)] = snapEntry(it);
  });
  loadSnapshots()[path] = snap;
  persistSnapshots();
};

// ==================== BÁO CÁO ĐIỂM: GỘP TỪNG Ô KHI LƯU ====================

/** Bảng điểm giáo viên nhập theo từng ô → khi lưu luôn gộp từng ô với bản trên cloud (không ghi đè cả báo cáo). */
export const CELL_MERGE_COLLECTIONS = new Set(['monthly_reports', 'weekly_reports']);
export const REPORT_MERGED_EVENT = 'mrs_dung_report_merged';

const reportNameKey = (s: any): string =>
  `name:${String(s?.studentName || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()}`;
const reportStudentKey = (s: any): string => (s?.studentId ? `id:${s.studentId}` : reportNameKey(s));

/** Chỉ mục học sinh của một báo cáo: tra theo mã, nếu không có thì theo họ tên (báo cáo cũ lưu theo tên). */
const indexReportStudents = (list: any[]) => {
  const byId = new Map<string, any>();
  const byName = new Map<string, any>();
  (Array.isArray(list) ? list : []).forEach(s => {
    if (!s) return;
    if (s.studentId) byId.set(`id:${s.studentId}`, s);
    const nk = reportNameKey(s);
    if (!byName.has(nk)) byName.set(nk, s);
  });
  return (s: any) => (s?.studentId && byId.get(`id:${s.studentId}`)) || byName.get(reportNameKey(s));
};

const reportAverage = (scores: Record<string, Record<string, any>>): number => {
  const nums: number[] = [];
  Object.values(scores || {}).forEach(cols => {
    Object.values(cols || {}).forEach(v => {
      if (v === null || v === undefined) return;
      if (typeof v === 'number') { if (!isNaN(v)) nums.push(v); return; }
      const str = String(v).trim().replace(',', '.');
      if (!str || !/^-?\d+(\.\d+)?$/.test(str)) return;
      const n = parseFloat(str);
      if (!isNaN(n)) nums.push(n);
    });
  });
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
};

/**
 * Gộp hai phiên bản của cùng một báo cáo điểm theo TỪNG Ô:
 * - Ô có trên máy này (kể cả ô cô vừa xóa trống) → lấy giá trị trên máy.
 * - Ô chỉ có trên cloud (máy khác nhập, hoặc máy này chưa tải kịp) → giữ nguyên.
 * - Học sinh chỉ có ở một bên → giữ lại.
 * Nhờ vậy điểm giáo viên đã nhập không bao giờ bị mất vì một bản lưu thiếu ô.
 */
export const mergeReportCells = (cloud: any, local: any): any => {
  if (!cloud || typeof cloud !== 'object') return local;
  if (!local || typeof local !== 'object') return cloud;
  const merged: any = { ...cloud, ...local };
  if (!Array.isArray(local.sessions) || local.sessions.length === 0) merged.sessions = cloud.sessions;

  const findCloud = indexReportStudents(cloud.studentScores);
  const seen = new Set<any>();
  const out: any[] = [];
  (Array.isArray(local.studentScores) ? local.studentScores : []).forEach((ls: any) => {
    if (!ls) return;
    const cs = findCloud(ls);
    if (!cs || seen.has(cs)) { out.push(ls); return; }
    seen.add(cs);
    const scores: Record<string, Record<string, any>> = {};
    Object.entries(cs.scores || {}).forEach(([sid, cols]) => { scores[sid] = { ...(cols as any || {}) }; });
    Object.entries(ls.scores || {}).forEach(([sid, cols]) => { scores[sid] = { ...(scores[sid] || {}), ...(cols as any || {}) }; });
    out.push({ ...cs, ...ls, scores, averageScore: reportAverage(scores) });
  });
  (Array.isArray(cloud.studentScores) ? cloud.studentScores : []).forEach((cs: any) => {
    if (cs && !seen.has(cs)) out.push(cs);
  });
  merged.studentScores = out;
  return merged;
};

// ---- Ghi nhớ đúng những ô giáo viên vừa sửa trên máy này (chưa lên cloud) ----
type ReportDirty = { cells: Record<string, true>; sessions?: boolean; meta?: boolean };
const REPORT_DIRTY_KEY = 'mrs_dung_report_dirty_v1';
let reportDirtyCache: Record<string, Record<string, ReportDirty>> | null = null;
const loadReportDirty = () => {
  if (reportDirtyCache) return reportDirtyCache;
  try { reportDirtyCache = JSON.parse(appStorage.getItem(REPORT_DIRTY_KEY) || '{}') || {}; } catch { reportDirtyCache = {}; }
  return reportDirtyCache!;
};
const persistReportDirty = () => {
  try { appStorage.setItem(REPORT_DIRTY_KEY, JSON.stringify(reportDirtyCache || {})); } catch {}
};
const cellKey = (studentKey: string, sessionId: string, col: string) => `${studentKey}|${sessionId}|${col}`;

/**
 * So bản báo cáo trước và sau khi lưu trên máy này → ghi nhớ các ô / phần đã thay đổi.
 * Gọi ở mọi chỗ lưu báo cáo điểm (nhập ô, dán Excel, điền cả cột, đồng bộ điểm Link, đổi ngày/tên cột).
 */
export const recordReportEdits = (path: string, prevList: any[], nextList: any[]) => {
  if (!CELL_MERGE_COLLECTIONS.has(path)) return;
  const all = loadReportDirty();
  const byPath = all[path] || (all[path] = {});
  const prevById = new Map<string, any>((prevList || []).filter(r => r && r.id).map(r => [String(r.id), r]));
  (nextList || []).forEach(next => {
    if (!next || !next.id) return;
    const id = String(next.id);
    const prev = prevById.get(id);
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
    const d: ReportDirty = byPath[id] || { cells: {} };
    if (prev) {
      if (JSON.stringify(prev.sessions || []) !== JSON.stringify(next.sessions || [])) d.sessions = true;
      if (prev.centerName !== next.centerName || prev.className !== next.className) d.meta = true;
    } else {
      d.meta = true;
    }
    const findPrev = indexReportStudents(prev?.studentScores || []);
    (next.studentScores || []).forEach((ns: any) => {
      if (!ns) return;
      const sk = reportStudentKey(ns);
      const ps = findPrev(ns);
      const sids = new Set([...Object.keys(ns.scores || {}), ...Object.keys(ps?.scores || {})]);
      sids.forEach(sid => {
        const nCols = ns.scores?.[sid] || {};
        const pCols = ps?.scores?.[sid] || {};
        // Xét cả ô vừa thêm/sửa lẫn ô vừa bị gỡ (VD gỡ dấu "cô nhập" khi xóa trống ô điểm Link)
        new Set([...Object.keys(nCols), ...Object.keys(pCols)]).forEach(col => {
          const val = nCols[col];
          const pv = pCols[col];
          if (val === pv) return;
          if (val !== undefined && pv !== undefined && String(val) === String(pv)) return;
          d.cells[cellKey(sk, sid, col)] = true;
        });
      });
    });
    byPath[id] = d;
  });
  persistReportDirty();
};

/**
 * Gộp khi đẩy lên: bắt đầu từ bản MỚI NHẤT trên cloud, chỉ áp các ô giáo viên vừa sửa trên máy này.
 * (Không có thông tin ô vừa sửa → gộp từng ô, ưu tiên ô trên máy.)
 */
const mergeReportForPush = (path: string, cloud: any, local: any): any => {
  if (!cloud || typeof cloud !== 'object') return local;
  const dirty = loadReportDirty()[path]?.[String(local.id)];
  if (!dirty) return mergeReportCells(cloud, local);
  const merged: any = JSON.parse(JSON.stringify(cloud));
  merged.updatedAt = local.updatedAt || merged.updatedAt;
  if (dirty.sessions || !Array.isArray(merged.sessions) || merged.sessions.length === 0) merged.sessions = local.sessions;
  if (dirty.meta) {
    if (local.centerName !== undefined) merged.centerName = local.centerName;
    if (local.className !== undefined) merged.className = local.className;
  }
  merged.studentScores = Array.isArray(merged.studentScores) ? merged.studentScores : [];
  const findMerged = indexReportStudents(merged.studentScores);
  (local.studentScores || []).forEach((ls: any) => {
    if (!ls) return;
    const sk = reportStudentKey(ls);
    let ms = findMerged(ls);
    if (!ms) {
      ms = { ...ls, scores: {} };
      merged.studentScores.push(ms);
    } else if (ls.studentId && !ms.studentId) {
      // Báo cáo cũ lưu theo tên → bổ sung mã học sinh
      ms.studentId = ls.studentId;
    }
    ms.scores = ms.scores || {};
    const prefix = `${sk}|`;
    Object.keys(dirty.cells).forEach(k => {
      if (!k.startsWith(prefix)) return;
      const rest = k.slice(prefix.length);
      const sep = rest.indexOf('|');
      if (sep < 0) return;
      const sid = rest.slice(0, sep);
      const col = rest.slice(sep + 1);
      const val = ls.scores?.[sid]?.[col];
      const cols = { ...(ms.scores[sid] || {}) };
      if (val === undefined) delete cols[col];
      else cols[col] = val;
      ms.scores[sid] = cols;
    });
    ms.averageScore = reportAverage(ms.scores);
  });
  return merged;
};

/** Bản chụp danh sách ô "chờ gửi" của một báo cáo tại thời điểm gửi. */
const snapshotReportDirty = (path: string, id: string): ReportDirty | null => {
  const d = loadReportDirty()[path]?.[id];
  return d ? JSON.parse(JSON.stringify(d)) : null;
};

/**
 * Sau khi gửi thành công: chỉ bỏ khỏi danh sách "chờ gửi" đúng những ô đã gửi
 * (ô cô sửa trong lúc đang gửi vẫn được giữ để gửi ở lần sau).
 */
const clearReportDirty = (path: string, sent: Map<string, ReportDirty | null>) => {
  const byPath = loadReportDirty()[path];
  if (!byPath) return;
  sent.forEach((used, id) => {
    const cur = byPath[id];
    if (!cur) return;
    if (!used) { delete byPath[id]; return; }
    Object.keys(used.cells || {}).forEach(k => { delete cur.cells[k]; });
    if (used.sessions) delete cur.sessions;
    if (used.meta) delete cur.meta;
    if (Object.keys(cur.cells).length === 0 && !cur.sessions && !cur.meta) delete byPath[id];
  });
  persistReportDirty();
};

/** Cập nhật bản trên máy sau khi gộp, và báo cho màn hình đang mở hiển thị thêm các ô vừa nhận. */
const applyMergedReportsLocally = (path: string, mergedById: Map<string, any>) => {
  if (mergedById.size === 0) return;
  const key = `mrs_dung_${path}`;
  try {
    const list = JSON.parse(appStorage.getItem(key) || '[]');
    if (!Array.isArray(list)) return;
    const next = list.map((r: any) => (r && r.id && mergedById.has(String(r.id)) ? mergedById.get(String(r.id)) : r));
    mergedById.forEach((r, id) => { if (!next.some((x: any) => x && String(x.id) === id)) next.push(r); });
    appStorage.setItem(key, JSON.stringify(next));
  } catch (err) {
    console.warn(`Không cập nhật được ${key} sau khi gộp:`, err);
  }
  try {
    window.dispatchEvent(new CustomEvent(REPORT_MERGED_EVENT, { detail: { path, ids: Array.from(mergedById.keys()) } }));
  } catch {}
};

/**
 * Kiểm tra trên cloud một báo cáo (theo mã). Nếu có → gộp vào bản trên máy và trả 'exists';
 * cloud chưa có → 'absent'; không đọc được → 'error' (khi đó KHÔNG được tạo báo cáo mới đè lên).
 */
export const fetchReportFromCloud = async (path: string, id: string): Promise<'exists' | 'absent' | 'error'> => {
  const res = await fetchFromFirebaseStrict<any>(`${path}/${toFirebaseKey(id)}`);
  if (!res.ok) return 'error';
  if (!res.data || typeof res.data !== 'object') return 'absent';
  let local: any = null;
  try {
    const list = JSON.parse(appStorage.getItem(`mrs_dung_${path}`) || '[]');
    if (Array.isArray(list)) local = list.find((r: any) => r && String(r.id) === String(id)) || null;
  } catch {}
  const merged = local ? mergeReportCells(res.data, local) : res.data;
  applyMergedReportsLocally(path, new Map([[String(id), merged]]));
  return 'exists';
};

// ---- Dấu xóa cho các bảng không có danh sách "đã xóa" riêng (điểm danh, lịch học, báo cáo) ----
// Máy khác CHỈ xóa theo khi có dấu xóa (giáo viên thực sự bấm xóa). Mục biến mất mà KHÔNG có dấu xóa
// (bị reset, lỗi ghi đè...) được coi là mất do lỗi → máy nào còn giữ sẽ đẩy lên lại.
let deletionMarkers: Record<string, Record<string, any>> = {};
export const rememberDeletionMarkers = (raw: any) => {
  deletionMarkers = raw && typeof raw === 'object' ? raw : {};
};
export const hasDeletionMarker = (path: string, id: string): boolean => !!deletionMarkers?.[path]?.[toFirebaseKey(id)];
const writeDeletionMarkers = (path: string, deletedIds: string[], readdedIds: string[]) => {
  if (NO_IMPLICIT_DELETE_COLLECTIONS.has(path) || path.startsWith('deleted_')) return;
  const body: Record<string, any> = {};
  const now = new Date().toISOString();
  deletedIds.forEach(id => { body[toFirebaseKey(id)] = { id, deletedAt: now }; });
  // Cô tạo lại mục cùng mã (VD lưu lại điểm danh ngày đó) → gỡ dấu xóa cũ
  readdedIds.forEach(id => { if (hasDeletionMarker(path, id)) body[toFirebaseKey(id)] = null; });
  if (Object.keys(body).length === 0) return;
  patchFirebase(`deleted_items/${path}`, body).then(ok => {
    if (!ok) return;
    const m = deletionMarkers[path] || (deletionMarkers[path] = {});
    Object.entries(body).forEach(([k, v]) => { if (v === null) delete m[k]; else m[k] = v; });
  }).catch(() => {});
};

/**
 * Cloud bỗng mất phần lớn dữ liệu so với lần đồng bộ trước của máy này (≥ 3 mục và ≥ 50%),
 * VD do ai đó bấm "Reset dữ liệu" hoặc một máy lỗi ghi đè. Khi đó máy KHÔNG xóa dữ liệu của mình theo cloud
 * mà đẩy lên lại để khôi phục cho mọi máy.
 */
export const isMassDisappearance = (prevIds: Set<string> | undefined, cloudList: any[]): boolean => {
  if (!prevIds || prevIds.size < 3) return false;
  const cloudIds = new Set((cloudList || []).filter(x => x && x.id).map(x => String(x.id)));
  let missing = 0;
  prevIds.forEach(id => { if (!cloudIds.has(id)) missing++; });
  return missing >= 3 && missing / prevIds.size >= 0.5;
};

/** Báo cho giao diện biết máy này không lưu được dữ liệu (bộ nhớ trình duyệt đầy). */
export const STORAGE_PROBLEM_EVENT = 'mrs_dung_storage_problem';
export const reportStorageProblem = (key: string) => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STORAGE_PROBLEM_EVENT, { detail: { key, at: Date.now() } }));
    }
  } catch {}
};

/** Các mục giáo viên vừa XÓA trên máy này (chỉ những mục này mới được xóa trên cloud). */
const pendingDeletions = new Map<string, Set<string>>();
export const markLocalDeletion = (path: string, ids: Iterable<string>) => {
  const set = pendingDeletions.get(path) || new Set<string>();
  for (const id of ids) set.add(String(id));
  pendingDeletions.set(path, set);
};

/** Thời điểm máy này ghi thành công từng mục (để lượt đồng bộ đang chạy không lấy bản cloud cũ đè lên bản vừa ghi). */
const recentPushes = new Map<string, Map<string, number>>();

export const getRecentPushTime = (path: string, id: string): number | undefined => recentPushes.get(path)?.get(id);

const updateSnapshotEntries = (path: string, changes: Record<string, any | null>) => {
  const all = loadSnapshots();
  const snap = all[path] || (all[path] = {});
  const pushes = recentPushes.get(path) || new Map<string, number>();
  recentPushes.set(path, pushes);
  const now = Date.now();
  Object.entries(changes).forEach(([id, item]) => {
    if (item === null) delete snap[id];
    else snap[id] = snapEntry(item);
    pushes.set(id, now);
  });
  persistSnapshots();
};

/** Đặt mã băm ảnh chụp cho một mục (dùng khi biết chắc cloud đã có đúng nội dung này). */
export const setSnapshotEntry = (path: string, item: any) => {
  const all = loadSnapshots();
  const snap = all[path] || (all[path] = {});
  snap[String(item.id)] = snapEntry(item);
  persistSnapshots();
};

/** Danh sách id của mỗi bảng ở lần đồng bộ gần nhất (để nhận biết mục bị xóa ở máy khác). */
export const getLastKnownCloudIds = (path: string): Set<string> | undefined => {
  const snap = getCloudSnapshot(path);
  return snap ? new Set(Object.keys(snap)) : undefined;
};

/** Gom các mục trên cloud theo id (một id có thể nằm dưới khóa số "0","1"... do dữ liệu cũ lưu dạng mảng). */
const indexCloudCollection = (raw: any): Map<string, { keys: string[]; val: any }> => {
  const byId = new Map<string, { keys: string[]; val: any }>();
  if (!raw || typeof raw !== 'object') return byId;
  Object.entries(raw).forEach(([key, val]: [string, any]) => {
    if (!val || typeof val !== 'object' || val.id === undefined || val.id === null) return;
    const id = String(val.id);
    const entry = byId.get(id);
    if (!entry) {
      byId.set(id, { keys: [key], val });
    } else {
      entry.keys.push(key);
      if (itemTime(val) > itemTime(entry.val)) entry.val = val;
    }
  });
  return byId;
};

const patchFirebase = async (path: string, updates: Record<string, any>): Promise<boolean> => {
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return false;
  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, path);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${url}${authParam}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      console.warn(`Firebase PATCH for ${path} bị từ chối (HTTP ${res.status})`);
    } else {
      bumpRevision(path);
    }
    return res.ok;
  } catch (error) {
    console.warn(`Firebase PATCH for ${path} failed:`, error);
    return false;
  }
};

/**
 * Chuyển các mục đang nằm dưới khóa sai (khóa số "0","1"... của dữ liệu mảng cũ, hoặc trùng id) về khóa = id.
 * Chỉ dùng dữ liệu vừa đọc từ cloud + PATCH đa khóa (nguyên tử), nên không đụng tới mục của máy khác.
 */
export const migrateLegacyKeys = async (path: string, raw: any): Promise<void> => {
  const updates: Record<string, any> = {};
  indexCloudCollection(raw).forEach((entry, id) => {
    const fk = toFirebaseKey(id);
    if (entry.keys.length === 1 && entry.keys[0] === fk) return;
    entry.keys.forEach(k => {
      if (k !== fk) updates[k] = null;
    });
    updates[fk] = entry.val;
  });
  if (Object.keys(updates).length > 0) {
    await patchFirebase(path, updates);
  }
};

/**
 * Đồng bộ một danh sách lên cloud bằng PATCH theo từng id (không ghi đè cả bảng):
 * - Mục có nội dung khác ảnh chụp lần đồng bộ trước (= máy này vừa thêm/sửa) → ghi đúng mục đó.
 * - Mục có trong ảnh chụp nhưng máy này không còn giữ (= máy này vừa xóa) → xóa đúng mục đó.
 * - Mục máy này không sửa → không đụng tới, nên máy có dữ liệu cũ không thể đè bản mới của máy khác.
 * Không cần tải lại cả bảng trước khi ghi (trước đây mỗi lần lưu phải tải cả bảng, mạng yếu là lưu thất bại).
 */
export const patchCollectionToFirebase = async (path: string, list: any[]): Promise<boolean> => {
  const snap = getCloudSnapshot(path);

  if (snap) {
    const updates: Record<string, any> = {};
    const snapChanges: Record<string, any | null> = {};
    const localIds = new Set<string>();

    let skippedStale = 0;
    const isCellMerge = CELL_MERGE_COLLECTIONS.has(path);
    const dirtyByPath = isCellMerge ? (loadReportDirty()[path] || {}) : {};
    list.forEach(item => {
      const id = String(item.id);
      localIds.add(id);
      if (snapEntryHash(snap[id]) === contentHash(item)) return;
      // Bảng điểm: có ô cô vừa sửa → luôn đẩy (chỉ các ô đó được áp lên bản cloud, xem bên dưới)
      const hasDirtyCells = isCellMerge && !!dirtyByPath[id];
      // Bản trên máy cũ hơn bản đã thấy trên cloud → dữ liệu lỗi thời, KHÔNG đẩy lên đè
      if (!hasDirtyCells && !isNewerLocalEdit(item, snap[id])) {
        skippedStale++;
        return;
      }
      updates[toFirebaseKey(id)] = item;
      snapChanges[id] = item;
    });
    if (skippedStale > 0) {
      console.warn(`[Đồng bộ] Bỏ qua ${skippedStale} mục "${path}" cũ hơn dữ liệu trên cloud (không ghi đè).`);
    }

    // Bảng điểm: gộp TỪNG Ô với bản mới nhất trên cloud trước khi ghi (không ghi đè cả báo cáo)
    const mergedLocal = new Map<string, any>();
    const sentDirty = new Map<string, ReportDirty | null>();
    if (isCellMerge) {
      for (const id of Object.keys(snapChanges)) {
        const item = snapChanges[id];
        if (!item) continue;
        const fk = toFirebaseKey(id);
        const cloudItem = await fetchFromFirebaseStrict<any>(`${path}/${fk}`);
        if (!cloudItem.ok) {
          // Không đọc được bản trên cloud → không ghi mù; giữ nguyên trên máy để lần sau đẩy lại
          delete updates[fk];
          delete snapChanges[id];
          continue;
        }
        sentDirty.set(id, snapshotReportDirty(path, id));
        const merged = mergeReportForPush(path, cloudItem.data, item);
        updates[fk] = merged;
        snapChanges[id] = merged;
        if (!sameContent(merged, item)) mergedLocal.set(id, merged);
      }
    }

    // Chỉ xóa trên cloud đúng những mục giáo viên vừa bấm xóa trên máy này.
    // (Mục chỉ đơn giản là thiếu trên máy — VD bộ nhớ trình duyệt đầy — tuyệt đối không bị xóa.)
    const pending = pendingDeletions.get(path);
    const deletedNow: string[] = [];
    if (pending && !NO_IMPLICIT_DELETE_COLLECTIONS.has(path)) {
      pending.forEach(id => {
        if (localIds.has(id)) return;
        updates[toFirebaseKey(id)] = null;
        snapChanges[id] = null;
        deletedNow.push(id);
      });
    }

    if (Object.keys(updates).length === 0) return true;
    const ok = await patchFirebase(path, updates);
    // Chỉ cập nhật ảnh chụp khi ghi thành công. Nếu thất bại, lần đồng bộ sau vẫn nhận ra bản sửa và đẩy lại.
    if (ok) {
      updateSnapshotEntries(path, snapChanges);
      deletedNow.forEach(id => pending?.delete(id));
      writeDeletionMarkers(path, deletedNow, Object.keys(snapChanges).filter(id => snapChanges[id] !== null));
      if (isCellMerge) {
        clearReportDirty(path, sentDirty);
        applyMergedReportsLocally(path, mergedLocal);
      }
    }
    return ok;
  }

  // Máy này chưa đồng bộ bảng này lần nào (vừa mở trang): đọc cloud rồi chỉ ghi mục mới / mới hơn.
  const cloud = await fetchFromFirebaseStrict<any>(path);
  if (!cloud.ok) {
    // Không đọc được cloud → không ghi mù. Dữ liệu vẫn nằm trên máy và sẽ được đẩy lên ở lần đồng bộ sau.
    return false;
  }

  const cloudById = indexCloudCollection(cloud.data);
  const updates: Record<string, any> = {};

  cloudById.forEach((entry, id) => {
    const fk = toFirebaseKey(id);
    if (entry.keys.length === 1 && entry.keys[0] === fk) return;
    entry.keys.forEach(k => {
      if (k !== fk) updates[k] = null;
    });
    updates[fk] = entry.val;
  });

  const resultItems = new Map<string, any>();
  cloudById.forEach((entry, id) => resultItems.set(id, entry.val));

  const isCellMergeSlow = CELL_MERGE_COLLECTIONS.has(path);
  const slowMerged = new Map<string, any>();
  const slowSent = new Map<string, ReportDirty | null>();
  list.forEach(item => {
    const id = String(item.id);
    const cloudEntry = cloudById.get(id);
    if (isCellMergeSlow) slowSent.set(id, snapshotReportDirty(path, id));
    if (isCellMergeSlow && cloudEntry) {
      // Bảng điểm: gộp từng ô với bản trên cloud (không ghi đè cả báo cáo)
      const merged = mergeReportForPush(path, cloudEntry.val, item);
      if (!sameContent(merged, cloudEntry.val)) {
        updates[toFirebaseKey(id)] = merged;
        resultItems.set(id, merged);
      }
      if (!sameContent(merged, item)) slowMerged.set(id, merged);
      return;
    }
    if (!cloudEntry || (!sameContent(cloudEntry.val, item) && itemTime(item) >= itemTime(cloudEntry.val))) {
      updates[toFirebaseKey(id)] = item;
      resultItems.set(id, item);
    }
  });

  const ok = Object.keys(updates).length === 0 ? true : await patchFirebase(path, updates);
  if (ok) {
    rememberCloudItems(path, Array.from(resultItems.values()));
    if (isCellMergeSlow) {
      clearReportDirty(path, slowSent);
      applyMergedReportsLocally(path, slowMerged);
    }
  }
  return ok;
};

/**
 * Xóa hẳn các mục theo id khỏi một bảng trên cloud (kể cả khi mục đang nằm dưới khóa số của mảng cũ).
 */
export const deleteItemsFromFirebaseCollection = async (path: string, ids: string[]): Promise<boolean> => {
  if (!ids || ids.length === 0) return true;
  const cloud = await fetchFromFirebaseStrict<any>(path);
  const updates: Record<string, any> = {};
  ids.forEach(id => { updates[toFirebaseKey(id)] = null; });
  if (cloud.ok) {
    const cloudById = indexCloudCollection(cloud.data);
    ids.forEach(id => {
      cloudById.get(String(id))?.keys.forEach(k => { updates[k] = null; });
    });
  }
  const ok = await patchFirebase(path, updates);
  if (ok && getCloudSnapshot(path)) {
    const changes: Record<string, null> = {};
    ids.forEach(id => { changes[String(id)] = null; });
    updateSnapshotEntries(path, changes);
  }
  return ok;
};

/**
 * Ghi (thêm/sửa) một mục đơn lẻ theo khóa id.
 */
export const putItemToFirebaseCollection = async (path: string, item: any): Promise<boolean> => {
  if (!item || item.id === undefined || item.id === null) return false;
  const ok = await patchFirebase(path, { [toFirebaseKey(item.id)]: item });
  if (ok && getCloudSnapshot(path)) updateSnapshotEntries(path, { [String(item.id)]: item });
  return ok;
};

/**
 * Test Firebase Realtime Database connection
 */
export const testFirebaseConnection = async (): Promise<{ success: boolean; message: string }> => {
  const cfg = getFirebaseConfig();
  if (!cfg.databaseURL) {
    return { success: false, message: 'Chưa cấu hình Realtime Database URL' };
  }
  try {
    const testEndpoint = getDatabaseEndpoint(cfg.databaseURL, '_ping/test');
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${testEndpoint}${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now(), client: 'Legend X5 App' })
    });
    if (res.ok) {
      return { success: true, message: 'Kết nối Firebase Realtime Database thành công! 🟢' };
    } else {
      const errText = await res.text();
      return { success: false, message: `Lỗi kết nối Firebase (HTTP ${res.status}): ${errText}` };
    }
  } catch (err: any) {
    return { success: false, message: `Không thể kết nối đến Firebase: ${err?.message || err}` };
  }
};

/**
 * Helper to safely convert Firebase response (Array or Object) to Array
 */
export const normalizeFirebaseList = (val: any): any[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'object') return Object.values(val).filter(Boolean);
  return [];
};

/**
 * Sync an individual submission directly to Firebase without overwriting other submissions
 * Includes automatic retry (up to 3 times) and pending offline queue
 */
export const syncSingleSubmissionToFirebase = async (submission: any, retryCount = 0): Promise<boolean> => {
  if (!submission || !submission.id) return false;
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return false;

  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, `submissions/${submission.id}`);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';

    // AbortController timeout (7s) ngăn treo kết nối trên mạng di động 4G yếu
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 7000) : null;

    const res = await fetch(`${url}${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
      signal: controller ? controller.signal : undefined
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      bumpRevision('submissions');
      // If was in pending queue, remove it
      removePendingSubmission(submission.id);

      // Đồng bộ thông báo sang Firebase /admin_notifications để giáo viên trên mọi thiết bị đều nhận được
      try {
        const notifUrl = getDatabaseEndpoint(cfg.databaseURL, `admin_notifications/${submission.id}`);
        fetch(`${notifUrl}${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `notif_${submission.id}`,
            submissionId: submission.id,
            studentName: submission.studentName,
            studentClass: submission.studentClass || '',
            assignmentTitle: submission.assignmentTitle || submission.topic || 'Bài tập',
            score: typeof submission.score === 'number' ? submission.score : 0,
            rawScore: submission.rawScore,
            isLate: !!submission.isLate,
            totalCorrect: submission.totalCorrect ?? 0,
            totalQuestions: submission.totalQuestions ?? 55,
            submittedAt: submission.submittedAt || new Date().toISOString(),
            isRead: false,
            createdAt: Date.now()
          })
        }).catch(() => {});
      } catch {}

      return true;
    }

    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return syncSingleSubmissionToFirebase(submission, retryCount + 1);
    }

    savePendingSubmission(submission);
    return false;
  } catch (error) {
    console.warn(`Firebase single submission sync attempt ${retryCount + 1} failed:`, error);
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return syncSingleSubmissionToFirebase(submission, retryCount + 1);
    }
    savePendingSubmission(submission);
    return false;
  }
};

const PENDING_SUBMISSIONS_KEY = 'mrs_dung_pending_submissions';

let pendingSyncInterval: any = null;

export const startPendingSyncQueue = () => {
  if (typeof window === 'undefined') return;
  if (pendingSyncInterval) return;
  pendingSyncInterval = setInterval(async () => {
    try {
      const raw = appStorage.getItem(PENDING_SUBMISSIONS_KEY);
      if (!raw) {
        clearInterval(pendingSyncInterval);
        pendingSyncInterval = null;
        return;
      }
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) {
        clearInterval(pendingSyncInterval);
        pendingSyncInterval = null;
        return;
      }
      await syncPendingSubmissions();
    } catch {
      // Quiet
    }
  }, 4000);
};

export const savePendingSubmission = (submission: any): void => {
  if (typeof window === 'undefined' || !submission || !submission.id) return;
  try {
    const raw = appStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    if (!list.some(s => s.id === submission.id)) {
      list.push(submission);
      appStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(list));
    }
    startPendingSyncQueue();
  } catch {}
};

export const removePendingSubmission = (submissionId: string): void => {
  if (typeof window === 'undefined' || !submissionId) return;
  try {
    const raw = appStorage.getItem(PENDING_SUBMISSIONS_KEY);
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    const filtered = list.filter(s => s.id !== submissionId);
    appStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(filtered));
  } catch {}
};

export const syncPendingSubmissions = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  try {
    const raw = appStorage.getItem(PENDING_SUBMISSIONS_KEY);
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return;

    for (const sub of list) {
      const ok = await syncSingleSubmissionToFirebase(sub, 2);
      if (ok) {
        removePendingSubmission(sub.id);
      }
    }
  } catch {}
};

// Listen to online event to flush pending submissions immediately
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingSubmissions();
  });
}

/**
 * Subscribe to Real-time Firebase RTDB events via native Server-Sent Events (SSE).
 * Delivers sub-second instant updates to Teacher Dashboard whenever any student submits.
 * Equipped with automatic reconnection, backoff, patch listener, and tab-focus restoration.
 */
export const subscribeToFirebaseRealtime = (onSubmissionChange: (submission: any) => void): (() => void) => {
  if (typeof window === 'undefined' || !('EventSource' in window)) return () => {};
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return () => {};

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimer: any = null;
  let retryDelay = 1000;

  const handlePayload = (payload: any) => {
    if (!payload) return;
    const { path, data } = payload;

    // Handle real-time deletion event from Firebase (e.g. teacher allows student to retake)
    if (data === null) {
      const cleanKey = path ? path.replace(/^\/+/, '').replace(/\.json$/, '') : '';
      if (cleanKey) {
        onSubmissionChange({ id: cleanKey, _deleted: true });
      }
      return;
    }

    // 1. Single submission directly: data has studentName
    if (typeof data === 'object') {
      // 2. Map of submissions (initial snapshot or full collection on path '/')
      // Batch handle to prevent synchronous loop that freezes browser main thread for 30s!
      if (path === '/' || path === '') {
        const batchItems: any[] = [];
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          if (val && typeof val === 'object') {
            const subId = val.id || key;
            if (subId && val.studentName) {
              batchItems.push({ ...val, id: subId });
            }
          }
        });
        onSubmissionChange({ _isBatch: true, items: batchItems });
        return;
      }

      const derivedId = data.id || (path ? path.replace(/^\/+/, '') : '');
      if (derivedId && data.studentName) {
        onSubmissionChange({ ...data, id: derivedId });
        return;
      }

      // 3. Nested path e.g. /sub_123
      if (path && path.startsWith('/')) {
        const cleanKey = path.substring(1);
        if (cleanKey && data.studentName) {
          onSubmissionChange({ ...data, id: data.id || cleanKey });
        }
      }
    }
  };

  const connect = () => {
    if (isClosed) return;
    try {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      const cleanBase = cfg.databaseURL.replace(/\/+$/, '');
      const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
      const streamUrl = `${cleanBase}/submissions.json${authParam}`;

      eventSource = new EventSource(streamUrl);

      const onMessage = (e: MessageEvent) => {
        if (isClosed) return;
        retryDelay = 1000; // Reset delay on successful data reception
        try {
          const payload = JSON.parse(e.data);
          handlePayload(payload);
        } catch (err) {
          console.debug('Firebase SSE parse error:', err);
        }
      };

      eventSource.addEventListener('put', onMessage);
      eventSource.addEventListener('patch', onMessage);

      eventSource.onerror = () => {
        if (isClosed) return;
        // If EventSource is closed or errored, force reconnect with backoff
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.5, 15000);
          connect();
        }, retryDelay);
      };
    } catch (err) {
      console.warn('Firebase EventSource connect error:', err);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    }
  };

  connect();

  // Watchdog & Reconnect on Tab Focus / Network Online
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && (!eventSource || eventSource.readyState === EventSource.CLOSED)) {
      connect();
    }
  };

  const handleOnline = () => {
    connect();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  // Periodic heartbeat watchdog every 15s to guarantee connection stays active
  const watchdog = setInterval(() => {
    if (isClosed) return;
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      connect();
    }
  }, 15000);

  return () => {
    isClosed = true;
    clearInterval(watchdog);
    clearTimeout(reconnectTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
};

/**
 * Super lightweight submissions fetch (~100ms) - only checks submissions
 * instead of pulling all 8 collections. Used for fast background synchronization.
 */
/** Thời điểm máy này tải thành công danh sách bài nộp từ cloud gần nhất */
let lastSubmissionsPullAt = 0;
let submissionsPullInFlight: Promise<boolean> | null = null;

/**
 * Đảm bảo danh sách bài nộp trên máy đủ mới (tải lại nếu lần tải trước quá `maxAgeMs`).
 * Dùng trước khi học sinh làm / nộp bài: máy mới mở chưa kịp tải bài nộp cũ sẽ không cho làm lại bài đã nộp.
 * Trả về true nếu dữ liệu đã được xác nhận với cloud.
 */
export const ensureFreshSubmissions = async (maxAgeMs = 30000, timeoutMs = 15000): Promise<boolean> => {
  if (Date.now() - lastSubmissionsPullAt < maxAgeMs) return true;
  if (!submissionsPullInFlight) {
    submissionsPullInFlight = pullSubmissionsOnlyFromFirebase()
      .then(() => Date.now() - lastSubmissionsPullAt < 60000)
      .catch(() => false)
      .finally(() => { submissionsPullInFlight = null; });
  }
  const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([submissionsPullInFlight, timeout]);
};

export const pullSubmissionsOnlyFromFirebase = async (): Promise<any[]> => {
  try {
    // Mốc bài nộp không đổi kể từ lần tải trước → dữ liệu trên máy đã đúng với cloud, không tải lại 1 MB
    // (dấu riêng 'submissions_quick': lượt nhanh chỉ nhận bài nộp MỚI, lượt đầy đủ mới cập nhật bài được sửa điểm)
    const revs = await fetchRevisions();
    const currentRev = revOf(revs, 'submissions');
    const marks = loadPulledRev();
    const fresh = (m?: { rev: string; at: number }) => !!m && m.rev === currentRev && Date.now() - m.at < REV_MAX_TRUST_MS;
    const rawLocalSubs = appStorage.getItem('mrs_dung_submissions');
    const hasLocal = !!rawLocalSubs && rawLocalSubs !== '[]';
    if (revs && hasLocal && (fresh(marks['submissions']) || fresh(marks['submissions_quick']))) {
      lastSubmissionsPullAt = Date.now();
      return [];
    }
    const res = await fetchFromFirebaseStrict<any>('submissions');
    if (!res.ok) return [];
    lastSubmissionsPullAt = Date.now();
    if (revs) markPulled('submissions_quick', currentRev);
    const raw = res.data;
    if (!raw) return [];
    const cloudSubmissions = normalizeFirebaseList(raw);
    if (!Array.isArray(cloudSubmissions) || cloudSubmissions.length === 0) return [];

    const rawLocal = appStorage.getItem('mrs_dung_submissions');
    let localList: any[] = [];
    try {
      if (rawLocal) localList = JSON.parse(rawLocal);
    } catch {
      localList = [];
    }
    if (!Array.isArray(localList)) localList = [];

    const rawDeletedSubs = appStorage.getItem('mrs_dung_deleted_submissions');
    let deletedSubsSet = new Set<string>();
    try {
      if (rawDeletedSubs) {
        const dList = JSON.parse(rawDeletedSubs);
        if (Array.isArray(dList)) {
          deletedSubsSet = new Set(dList.map((d: any) => String(d?.id || d)));
        }
      }
    } catch {}

    const localIdSet = new Set<string>();
    localList.forEach(l => {
      if (l && l.id) localIdSet.add(String(l.id));
    });

    const map = new Map<string, any>();
    const newFromCloud: any[] = [];

    cloudSubmissions.forEach(item => {
      if (item && item.id && !String(item.id).startsWith('sub_seed_') && !deletedSubsSet.has(String(item.id))) {
        const idStr = String(item.id);
        map.set(idStr, item);
        if (!localIdSet.has(idStr)) {
          newFromCloud.push(item);
        }
      }
    });

    let hasLocalOnly = false;
    localList.forEach(item => {
      if (item && item.id && !String(item.id).startsWith('sub_seed_') && !deletedSubsSet.has(String(item.id))) {
        const idStr = String(item.id);
        if (!map.has(idStr)) {
          map.set(idStr, item);
          hasLocalOnly = true;
        }
      }
    });

    // Only write to appStorage if there are brand-new submissions or missing items
    if (newFromCloud.length > 0 || hasLocalOnly || map.size !== localList.length) {
      const merged = Array.from(map.values());
      appStorage.setItem('mrs_dung_submissions', JSON.stringify(merged));
    }
    // Return array of new submissions so callers can trigger notifications
    return newFromCloud;
  } catch {
    return [];
  }
};

/**
 * Pull initial data from Firebase Realtime Database and synchronize with LocalStorage safely
 */
let pullAllInFlight: Promise<boolean> | null = null;
/** Nhiều nơi cùng gọi đồng bộ một lúc (mở trang, quay lại tab, hẹn giờ) → dùng chung một lượt tải. */
export const pullAllFromFirebase = (): Promise<boolean> => {
  if (!pullAllInFlight) {
    pullAllInFlight = pullAllFromFirebaseOnce().finally(() => { pullAllInFlight = null; });
  }
  return pullAllInFlight;
};

const pullAllFromFirebaseOnce = async (): Promise<boolean> => {
  try {
    // Mục nào máy này ghi thành công SAU thời điểm này thì dữ liệu cloud đọc được ở lượt này có thể đã cũ
    const pullStartedAt = Date.now();
    const PULL_PATHS = [
      'classes',
      'deleted_classes',
      'students',
      'deleted_students',
      'assignments',
      'deleted_assignments',
      'submissions',
      'deleted_submissions',
      'monthly_reports',
      'class_schedules',
      'attendance_records',
      // Trước đây 2 bảng này chỉ được ghi lên mà không bao giờ được tải về máy khác
      'weekly_reports',
      'annual_reports',
      // Dấu xóa của các bảng không có danh sách "đã xóa" riêng (điểm danh, lịch học, báo cáo...)
      'deleted_items'
    ];
    // Đọc mốc phiên bản TRƯỚC khi tải dữ liệu: bảng lớn không đổi thì bỏ qua lượt này (giữ nguyên dữ liệu trên máy).
    const revs = await fetchRevisions();
    const teacherDevice = isTeacherDevice();
    const skipped = new Set<string>(
      PULL_PATHS.filter(p => (!teacherDevice && TEACHER_ONLY_PATHS.has(p)) || !needsRefetch(p, revs))
    );
    const results = await Promise.all(
      PULL_PATHS.map(p => (skipped.has(p) ? Promise.resolve({ ok: false } as const) : fetchFromFirebaseStrict<any>(p)))
    );
    const okByPath = new Map<string, boolean>(PULL_PATHS.map((p, i) => [p, results[i].ok]));

    // Các bảng danh sách "đã xóa" là điều kiện để gộp an toàn: thiếu chúng thì không gộp bảng chính
    // (nếu không sẽ hồi sinh mục đã xóa). Bảng nào đọc lỗi thì bỏ qua RIÊNG bảng đó ở lượt này
    // — tuyệt đối không coi là "trống" rồi đẩy dữ liệu cũ của máy này lên đè cloud.
    const TOMBSTONE_DEPENDENCIES: Record<string, string[]> = {
      classes: ['deleted_classes'],
      students: ['deleted_students', 'deleted_classes'],
      assignments: ['deleted_assignments'],
      submissions: ['deleted_submissions', 'deleted_students', 'deleted_classes'],
      monthly_reports: ['deleted_items'],
      weekly_reports: ['deleted_items'],
      annual_reports: ['deleted_items'],
      class_schedules: ['deleted_items'],
      attendance_records: ['deleted_items']
    };
    const canMerge = (path: string): boolean =>
      !!okByPath.get(path) && (TOMBSTONE_DEPENDENCIES[path] || []).every(dep => okByPath.get(dep));

    const failedPaths = PULL_PATHS.filter(p => !okByPath.get(p) && !skipped.has(p));
    if (failedPaths.length > 0) {
      console.warn('Pull from Firebase: các bảng sau không tải được, sẽ thử lại ở lần đồng bộ sau:', failedPaths.join(', '));
    }

    const rawByPath = new Map<string, any>(PULL_PATHS.map((p, i) => [p, results[i].ok ? (results[i] as any).data : null]));
    if (okByPath.get('deleted_items')) rememberDeletionMarkers(rawByPath.get('deleted_items'));

    // Chuyển dữ liệu mảng cũ (khóa "0","1",...) sang khóa theo id, chỉ dựa trên dữ liệu vừa đọc từ cloud
    PULL_PATHS.forEach(p => {
      if (okByPath.get(p)) migrateLegacyKeys(p, rawByPath.get(p)).catch(() => {});
    });

    const [
      rawClasses,
      rawDeletedClasses,
      rawStudents,
      rawDeletedStudents,
      rawAssignments,
      rawDeletedAssignments,
      rawSubmissions,
      rawDeletedSubmissions,
      rawMonthlyReports,
      rawSchedules,
      rawAttendance,
      rawWeeklyReports,
      rawAnnualReports
    ] = PULL_PATHS.map(p => rawByPath.get(p));

    const cloudClasses = normalizeFirebaseList(rawClasses);
    const cloudDeletedClasses = normalizeFirebaseList(rawDeletedClasses);
    const cloudStudents = normalizeFirebaseList(rawStudents);
    const cloudDeletedStudents = normalizeFirebaseList(rawDeletedStudents);
    const cloudAssignments = normalizeFirebaseList(rawAssignments);
    const cloudDeletedAssignments = normalizeFirebaseList(rawDeletedAssignments);
    const cloudSubmissions = normalizeFirebaseList(rawSubmissions);
    const cloudDeletedSubmissions = normalizeFirebaseList(rawDeletedSubmissions);
    const cloudMonthlyReports = normalizeFirebaseList(rawMonthlyReports);
    const cloudSchedules = normalizeFirebaseList(rawSchedules);
    const cloudAttendance = normalizeFirebaseList(rawAttendance);
    const cloudWeeklyReports = normalizeFirebaseList(rawWeeklyReports);
    const cloudAnnualReports = normalizeFirebaseList(rawAnnualReports);

    /**
     * Hợp nhất danh sách tombstone (đã xóa) giữa máy này và cloud:
     * - Tombstone mới tạo trên máy này → đẩy lên.
     * - Tombstone từng có trên cloud nhưng nay không còn (máy khác đã khôi phục) → bỏ trên máy này.
     */
    const mergeTombstoneList = (localKey: string, path: string, cloudList: any[], cloudRecords: any[] = [], recordsPath?: string): any[] => {
      const cloudRecordById = new Map<string, any>(cloudRecords.filter(r => r && r.id).map(r => [String(r.id), r]));
      let localList: any[] = [];
      try {
        const raw = appStorage.getItem(localKey);
        if (raw) localList = JSON.parse(raw);
      } catch {
        localList = [];
      }
      if (!Array.isArray(localList)) localList = [];

      // Bảng này đọc lỗi ở lượt này → giữ nguyên danh sách trên máy, không ghi gì lên cloud
      if (!okByPath.get(path)) return localList.filter(d => d && d.id);
      // Bảng chính đi kèm không tải lượt này vì không đổi → bản trên máy chính là bản cloud lần tải trước
      if (recordsPath && skipped.has(recordsPath)) {
        try {
          const rawRecords = JSON.parse(appStorage.getItem(`mrs_dung_${recordsPath}`) || '[]');
          cloudRecords = Array.isArray(rawRecords) ? rawRecords : [];
        } catch {
          cloudRecords = [];
        }
      }

      const prevCloudIds = getLastKnownCloudIds(path);
      // Danh sách "đã xóa" trên cloud bỗng mất hàng loạt (bị reset) → không coi là "đã khôi phục", đẩy lại lên
      const tombMassLoss = isMassDisappearance(prevCloudIds, cloudList);
      const map = new Map<string, any>();
      cloudList.forEach(d => {
        if (d && d.id) map.set(String(d.id), d);
      });
      let hasNewToPush = false;
      localList.forEach(d => {
        if (!d || !d.id) return;
        const id = String(d.id);
        if (!map.has(id)) {
          if (!tombMassLoss && prevCloudIds && prevCloudIds.has(id)) return; // đã được khôi phục ở máy khác
          // Bản ghi trên cloud đã được khôi phục / sửa SAU lần xóa này → dấu xóa đã lỗi thời, không đẩy lại
          const rec = cloudRecordById.get(id);
          if (rec && !isHiddenByTombstone(rec, d)) return;
          hasNewToPush = true;
        }
        map.set(id, d);
      });
      const merged = Array.from(map.values());
      appStorage.setItem(localKey, JSON.stringify(merged));
      rememberCloudItems(path, cloudList.filter(d => d && d.id));
      if (hasNewToPush) {
        syncToFirebaseIfConfigured(path, merged);
      }
      return merged;
    };

    // 0. Đồng bộ & hợp nhất danh sách lớp đã xóa (tombstone)
    const mergedDeletedClasses = mergeTombstoneList('mrs_dung_deleted_classes', 'deleted_classes', cloudDeletedClasses, cloudClasses);
    const normClassName = (str?: string): string => {
      if (!str) return '';
      return str.toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
    };

    const normalizeStudentName = (str?: string): string => {
      if (!str) return '';
      return str
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const classTombById = new Map<string, any>(mergedDeletedClasses.map(d => [String(d.id), d]));

    // 0.1 Đồng bộ & hợp nhất danh sách bài tập đã xóa (tombstone)
    const mergedDeletedAssign = mergeTombstoneList('mrs_dung_deleted_assignments', 'deleted_assignments', cloudDeletedAssignments, cloudAssignments, 'assignments');
    const assignTombById = new Map<string, any>(mergedDeletedAssign.map(d => [String(d.id), d]));

    // 1. Đồng bộ & hợp nhất danh sách học sinh đã xóa vĩnh viễn (nghỉ học / tombstone)
    const mergedDeleted = mergeTombstoneList('mrs_dung_deleted_students', 'deleted_students', cloudDeletedStudents, cloudStudents, 'students');
    const studentTombById = new Map<string, any>(mergedDeleted.map(d => [String(d.id), d]));

    // 1.1 Đồng bộ & hợp nhất danh sách bài nộp đã xóa / cho phép làm lại (tombstone)
    const mergedDeletedSubs = mergeTombstoneList('mrs_dung_deleted_submissions', 'deleted_submissions', cloudDeletedSubmissions);
    const deletedSubIdsSet = new Set<string>(mergedDeletedSubs.map(d => String(d.id)));

    let hasNewData = false;

    const MOCK_CLASS_IDS = new Set(['class_6a1', 'class_6a2', 'class_7b1', 'class_8a1']);
    const MOCK_STUDENT_IDS = new Set(Array.from({ length: 17 }, (_, i) => `std_${i + 1}`));
    // Chỉ nhận diện đúng dữ liệu mẫu Pallas cũ (theo mã / tên lớp mẫu), không xóa nhầm mục giáo viên thêm có chữ "pallas"
    const isPallasSeed = (item: any): boolean =>
      /pallas/i.test(String(item?.id || '')) ||
      /pallas/i.test(String(item?.classId || '')) ||
      /^(lớp\s*)?pallas star$/i.test(String(item?.name || item?.className || '').trim());

    // Hồ sơ học sinh theo mã (cloud + máy) để quyết định bài nộp của em đã bị xóa có ẩn hay không
    const studentRecordById = new Map<string, any>();
    [...cloudStudents, ...(() => {
      try { const r = JSON.parse(appStorage.getItem('mrs_dung_students') || '[]'); return Array.isArray(r) ? r : []; } catch { return []; }
    })()].forEach(s => {
      if (s && s.id && lastTeacherChangeTime(s) >= lastTeacherChangeTime(studentRecordById.get(String(s.id)))) {
        studentRecordById.set(String(s.id), s);
      }
    });

    /**
     * Mục bị ẩn khi: là dữ liệu mẫu, hoặc bị giáo viên xóa SAU lần thay đổi cuối cùng (quy tắc "thao tác sau cùng quyết định").
     * Mục giáo viên thêm lại / khôi phục sau lần xóa luôn hiện — không phụ thuộc cờ teacherModified như trước.
     */
    const isMockItem = (key: string, item: any): boolean => {
      if (!item || !item.id) return true;
      if (isPallasSeed(item)) return true;
      const id = String(item.id);
      if (key === 'mrs_dung_classes') {
        return MOCK_CLASS_IDS.has(id) || isHiddenByTombstone(item, classTombById.get(id));
      }
      if (key === 'mrs_dung_students') {
        if (MOCK_STUDENT_IDS.has(id) || MOCK_CLASS_IDS.has(item.classId)) return true;
        if (isHiddenByTombstone(item, studentTombById.get(id))) return true;
        // Lớp bị xóa sau lần thay đổi cuối của học sinh → học sinh ẩn theo lớp
        return !!item.classId && isHiddenByTombstone(item, classTombById.get(String(item.classId)));
      }
      if (key === 'mrs_dung_submissions') {
        if (id.startsWith('sub_seed_') || deletedSubIdsSet.has(id)) return true;
        if (item.studentId && MOCK_STUDENT_IDS.has(item.studentId)) return true;
        const tomb = item.studentId ? studentTombById.get(String(item.studentId)) : undefined;
        return !!tomb && isHiddenByTombstone(studentRecordById.get(String(item.studentId)), tomb);
      }
      if (key === 'mrs_dung_assignments') {
        return id === 'assign_unit1_school' || isHiddenByTombstone(item, assignTombById.get(id));
      }
      return false;
    };

    // Helper to merge lists by id, preserving teacher edits and local unsaved changes
    const mergeById = (localKey: string, cloudList: any[], timeField: string = 'updatedAt'): boolean => {
      if (!Array.isArray(cloudList) && localKey !== 'mrs_dung_students') return false;
      const cloudPath = localKey.replace('mrs_dung_', '');
      // Bảng (hoặc danh sách "đã xóa" đi kèm) đọc lỗi ở lượt này → giữ nguyên dữ liệu trên máy
      if (!canMerge(cloudPath)) return false;

      const safeCloudList = Array.isArray(cloudList) ? cloudList : [];
      const rawLocal = appStorage.getItem(localKey);
      let localList: any[] = [];
      try {
        if (rawLocal) localList = JSON.parse(rawLocal);
      } catch {
        localList = [];
      }
      if (!Array.isArray(localList)) localList = [];

      // Ảnh chụp nội dung cloud ở lần đồng bộ trước: mục trên máy KHÁC ảnh chụp = máy này đã sửa mà chưa lên cloud.
      const baseSnap = getCloudSnapshot(cloudPath);
      // Bản sửa trên máy = khác ảnh chụp VÀ không cũ hơn ảnh chụp (bản cũ hơn là dữ liệu lỗi thời → nhận bản cloud)
      // Bảng điểm: báo cáo còn ô cô vừa sửa chưa gửi → luôn giữ bản trên máy (khi gửi sẽ gộp từng ô với cloud)
      const dirtyReports = CELL_MERGE_COLLECTIONS.has(cloudPath) ? (loadReportDirty()[cloudPath] || {}) : {};
      const hasUnsentCells = (item: any): boolean => !!dirtyReports[String(item.id)];
      const isLocallyEdited = (item: any): boolean =>
        hasUnsentCells(item) || (!!baseSnap && isNewerLocalEdit(item, baseSnap[String(item.id)]));
      const prevCloudIds = baseSnap ? new Set(Object.keys(baseSnap)) : undefined;
      // Bảng không có tombstone: mục từng có trên cloud mà nay biến mất nghĩa là máy khác đã xóa → bỏ trên máy này
      // CHỐNG MẤT HÀNG LOẠT: cloud bỗng mất phần lớn dữ liệu so với lần đồng bộ trước (VD bị "reset", lỗi ghi đè)
      // → KHÔNG xóa theo cloud, mà giữ dữ liệu trên máy và đẩy lên lại để khôi phục cho mọi máy.
      const massLoss = isMassDisappearance(prevCloudIds, safeCloudList);
      if (massLoss) {
        console.warn(`[Đồng bộ] Cloud "${cloudPath}" mất hàng loạt dữ liệu → giữ dữ liệu trên máy và khôi phục lên cloud.`);
      }
      const dropRemotelyDeleted = !massLoss && cloudPath !== 'submissions' && !TOMBSTONED_COLLECTIONS.has(cloudPath);

      const localIdSet = new Set(localList.filter(it => it && it.id).map(it => String(it.id)));
      const map = new Map<string, any>();
      safeCloudList.forEach(item => {
        if (item && item.id && !isMockItem(localKey, item)) {
          // Máy này vừa xóa mục này trên cloud trong lúc lượt đồng bộ đang tải → không lấy lại bản cũ
          const pushedAt = getRecentPushTime(cloudPath, String(item.id));
          if (pushedAt !== undefined && pushedAt >= pullStartedAt && !localIdSet.has(String(item.id))) {
            return;
          }
          map.set(String(item.id), item);
        }
      });

      let needPushUnsynced = false;
      const freshlyPushed: any[] = [];
      localList.forEach(item => {
        if (item && item.id && !isMockItem(localKey, item)) {
          const idStr = String(item.id);
          const cloudItem = map.get(idStr);
          const pushedAt = getRecentPushTime(cloudPath, idStr);
          if (pushedAt !== undefined && pushedAt >= pullStartedAt) {
            // Máy này vừa ghi mục này lên cloud trong lúc lượt đồng bộ đang tải → giữ bản trên máy
            map.set(idStr, item);
            freshlyPushed.push(item);
            return;
          }
          if (!cloudItem) {
            // Máy khác đã xóa mục này, còn máy này không sửa gì → xóa theo
            // Chỉ xóa theo khi có DẤU XÓA (giáo viên thực sự bấm xóa); mất mà không có dấu xóa → đẩy lại lên
            if (dropRemotelyDeleted && prevCloudIds && prevCloudIds.has(idStr) && !isLocallyEdited(item) && hasDeletionMarker(cloudPath, idStr)) {
              return;
            }
            map.set(idStr, item);
            needPushUnsynced = true;
          } else if (hasUnsentCells(item)) {
            // Bảng điểm có ô cô vừa sửa chưa gửi: giữ bản trên máy, khi gửi sẽ gộp từng ô với bản cloud
            map.set(idStr, item);
            if (!sameContent(item, cloudItem)) needPushUnsynced = true;
          } else if (baseSnap) {
            // Gộp 3 chiều, KHÔNG phụ thuộc đồng hồ của từng máy:
            // - Máy này đã sửa (khác ảnh chụp) → giữ bản sửa và đẩy lên.
            // - Máy này không sửa → nhận bản mới nhất từ cloud.
            if (isLocallyEdited(item)) {
              map.set(idStr, item);
              if (!sameContent(item, cloudItem)) needPushUnsynced = true;
            } else {
              map.set(idStr, cloudItem);
            }
          } else {
            // Lần đồng bộ đầu tiên trên máy này (chưa có ảnh chụp): dùng quy tắc thời gian như trước
            const localTeacherTime = item.teacherModified ? new Date(item.teacherModifiedAt || item[timeField] || item.updatedAt || 0).getTime() : 0;
            const cloudTeacherTime = cloudItem.teacherModified ? new Date(cloudItem.teacherModifiedAt || cloudItem[timeField] || cloudItem.updatedAt || 0).getTime() : 0;
            const localTime = new Date(item.teacherModifiedAt || item[timeField] || item.submittedAt || item.updatedAt || item.createdAt || 0).getTime();
            const cloudTime = new Date(cloudItem.teacherModifiedAt || cloudItem[timeField] || cloudItem.submittedAt || cloudItem.updatedAt || cloudItem.createdAt || 0).getTime();

            // ⭐️ NGUYÊN TẮC VÀNG: Luôn ưu tiên lưu lại thông tin cuối cùng do giáo viên thực hiện (sửa tên, thêm mới, sửa lớp...)
            if (item.teacherModified && !cloudItem.teacherModified) {
              map.set(idStr, item);
              needPushUnsynced = true;
            } else if (cloudItem.teacherModified && !item.teacherModified) {
              map.set(idStr, cloudItem);
            } else if (localTeacherTime > 0 || cloudTeacherTime > 0) {
              if (localTeacherTime >= cloudTeacherTime) {
                map.set(idStr, item);
                if (localTeacherTime > cloudTeacherTime) {
                  needPushUnsynced = true;
                }
              } else {
                map.set(idStr, cloudItem);
              }
            } else if (localTime >= cloudTime) {
              map.set(idStr, item);
              if (localTime > cloudTime) {
                needPushUnsynced = true;
              }
            } else {
              map.set(idStr, cloudItem);
            }
          }
        }
      });

      const merged = Array.from(map.values());
      const hasChanged =
        merged.length !== localList.length ||
        needPushUnsynced ||
        JSON.stringify(merged) !== JSON.stringify(localList);
      if (hasChanged) {
        try {
          appStorage.setItem(localKey, JSON.stringify(merged));
        } catch (err) {
          console.warn(`appStorage setItem failed for ${localKey}:`, err);
          reportStorageProblem(localKey);
          return false;
        }
      }

      // Ghi nhớ nội dung cloud hiện tại. Sau đó syncToFirebaseIfConfigured chỉ đẩy đúng các mục máy này đã sửa.
      rememberCloudItems(cloudPath, safeCloudList.filter(c => c && c.id));
      // Mục vừa ghi thành công trong lúc tải: cloud đã có đúng nội dung trên máy
      freshlyPushed.forEach(item => setSnapshotEntry(cloudPath, item));

      if (needPushUnsynced) {
        if (localKey === 'mrs_dung_submissions') {
          // Push only new submissions individually without overwriting the whole collection
          const safeCloudIds = new Set(safeCloudList.map(c => (c && c.id ? String(c.id) : '')));
          localList.forEach(item => {
            if (item && item.id && !isMockItem(localKey, item) && !deletedSubIdsSet.has(String(item.id)) && !safeCloudIds.has(String(item.id))) {
              syncSingleSubmissionToFirebase(item);
            }
          });
        } else {
          // Chỉ PATCH các mục mới/thay đổi, không ghi đè cả bảng
          syncToFirebaseIfConfigured(cloudPath, merged);
        }
      }
      return hasChanged;
    };

    if (mergeById('mrs_dung_classes', cloudClasses)) hasNewData = true;
    if (mergeById('mrs_dung_students', cloudStudents)) hasNewData = true;
    if (mergeById('mrs_dung_assignments', cloudAssignments)) hasNewData = true;
    if (mergeById('mrs_dung_submissions', cloudSubmissions, 'submittedAt')) hasNewData = true;
    // Bài nộp không tải vì mốc không đổi = dữ liệu trên máy đã khớp cloud
    if (canMerge('submissions') || skipped.has('submissions')) lastSubmissionsPullAt = Date.now();
    if (mergeById('mrs_dung_monthly_reports', cloudMonthlyReports)) hasNewData = true;
    if (mergeById('mrs_dung_class_schedules', cloudSchedules)) hasNewData = true;
    if (mergeById('mrs_dung_attendance_records', cloudAttendance, 'date')) hasNewData = true;
    if (mergeById('mrs_dung_weekly_reports', cloudWeeklyReports)) hasNewData = true;
    if (mergeById('mrs_dung_annual_reports', cloudAnnualReports)) hasNewData = true;

    // Ghi nhớ mốc của các bảng lớn vừa tải & gộp xong → lượt sau bỏ qua nếu mốc không đổi
    if (revs) {
      PULL_PATHS.forEach(p => {
        if (REV_GATED_PATHS.has(p) && !skipped.has(p) && canMerge(p)) markPulled(p, revOf(revs, p));
      });
    }

    /**
     * Tự dọn dấu "đã xóa / đã nghỉ" LỖI THỜI: bản ghi đã được giáo viên khôi phục / sửa SAU lần xóa
     * (nên đang hiện) mà dấu xóa cũ vẫn còn — thường do một máy chạy bản cũ đẩy ngược lên.
     * Dọn cả trên máy lẫn trên cloud để danh sách "Đã nghỉ học" luôn đúng.
     */
    const pruneSupersededTombstones = (tombKey: string, tombPath: string, recordKey: string, recordPath: string, recordCloud: any[]) => {
      if (!okByPath.get(tombPath) || !canMerge(recordPath)) return;
      try {
        const tombs: any[] = JSON.parse(appStorage.getItem(tombKey) || '[]');
        const localRecords: any[] = JSON.parse(appStorage.getItem(recordKey) || '[]');
        if (!Array.isArray(tombs) || tombs.length === 0) return;
        const recordById = new Map<string, any>();
        [...(Array.isArray(localRecords) ? localRecords : []), ...recordCloud].forEach(r => {
          if (r && r.id && lastTeacherChangeTime(r) >= lastTeacherChangeTime(recordById.get(String(r.id)))) {
            recordById.set(String(r.id), r);
          }
        });
        const superseded = tombs.filter(t => {
          const rec = t && t.id ? recordById.get(String(t.id)) : undefined;
          return !!rec && !isHiddenByTombstone(rec, t);
        });
        if (superseded.length === 0) return;
        const ids = new Set(superseded.map(t => String(t.id)));
        appStorage.setItem(tombKey, JSON.stringify(tombs.filter(t => !ids.has(String(t?.id)))));
        deleteItemsFromFirebaseCollection(tombPath, Array.from(ids)).catch(() => {});
        hasNewData = true;
      } catch {}
    };
    pruneSupersededTombstones('mrs_dung_deleted_students', 'deleted_students', 'mrs_dung_students', 'students', cloudStudents);
    pruneSupersededTombstones('mrs_dung_deleted_classes', 'deleted_classes', 'mrs_dung_classes', 'classes', cloudClasses);
    pruneSupersededTombstones('mrs_dung_deleted_assignments', 'deleted_assignments', 'mrs_dung_assignments', 'assignments', cloudAssignments);

    // Clean up any remaining admin_notifications key from local storage
    appStorage.removeItem('mrs_dung_admin_notifications');

    if (hasNewData) {
      try {
        const { invalidateAllCaches } = await import('./assignmentService');
        invalidateAllCaches();
      } catch {}
    }

    // Background push any offline pending submissions
    syncPendingSubmissions();

    return hasNewData;
  } catch (e) {
    console.warn('Pull from Firebase error:', e);
    return false;
  }
};

/**
 * Seed initial data to Firebase only if explicitly given non-empty real data
 */
export const seedFirebaseIfEmpty = async (defaultData: {
  classes: any[];
  students: any[];
  assignments: any[];
  submissions: any[];
}) => {
  try {
    // Chỉ seed khi ĐỌC THÀNH CÔNG và cloud thực sự trống. Trước đây nếu lần đọc bị lỗi mạng,
    // máy (kể cả máy học sinh) sẽ hiểu là "trống" và ghi đè lớp/học sinh/bài tập/bài nộp bằng dữ liệu cũ của nó.
    if (!defaultData.assignments || defaultData.assignments.length === 0) return;
    // Chỉ cần biết bảng có trống không → đọc danh sách khóa (shallow), không tải cả 3 MB bài tập
    const cfg = getFirebaseConfig();
    if (!cfg || !cfg.databaseURL) return;
    const shallowRes = await fetch(
      `${getDatabaseEndpoint(cfg.databaseURL, 'assignments')}?shallow=true${cfg.apiKey ? `&auth=${cfg.apiKey}` : ''}`
    );
    if (!shallowRes.ok) return;
    const keys = await shallowRes.json();
    const existingCount = keys && typeof keys === 'object' ? Object.keys(keys).length : 0;
    if (existingCount === 0) {
      await Promise.all([
        syncToFirebaseIfConfigured('classes', defaultData.classes || []),
        syncToFirebaseIfConfigured('students', defaultData.students || []),
        syncToFirebaseIfConfigured('assignments', defaultData.assignments || []),
        syncToFirebaseIfConfigured('submissions', defaultData.submissions || [])
      ]);
    }
  } catch (e) {
    console.warn('Seed Firebase skipped or failed:', e);
  }
};

