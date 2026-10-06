/**
 * CHẾ ĐỘ DEMO (tham quan không cần tài khoản, không cần Firebase)
 *
 * - Bật bằng nút "Tham quan bản demo" (hoặc /?demo=teacher | /?demo=student).
 * - Toàn bộ dữ liệu nằm trong tab trình duyệt hiện tại (sessionStorage + một IndexedDB riêng),
 *   tự xoá khi đóng tab. KHÔNG bao giờ chạm vào cơ sở dữ liệu thật của trung tâm.
 * - Một "Firebase giả" chạy ngay trong trình duyệt: chặn fetch / EventSource tới DEMO_URL.
 *
 * File này phải được import ĐẦU TIÊN trong index.tsx (trước mọi module đọc localStorage),
 * và không được import tĩnh module nào khác của app.
 */

export type DemoRole = 'teacher' | 'student';

export const DEMO_URL = 'https://demo.legend-x5.local';
export const DEMO_TEACHER_USERNAME = 'Legend X5';
export const DEMO_TEACHER_PASSWORD = 'demo';
const DEMO_FLAG_KEY = 'lx5_demo_role';
const DEMO_DB_KEY = 'lx5_demo_db';
const DEMO_SESSION_KEY = 'lx5_demo_session';
const DEMO_IDB_PREFIX = 'lx5_demo_store_';
const CURRENT_USER_KEY = 'mrs_dung_auth_current_user';

const hasWindow = typeof window !== 'undefined';

// Lấy sessionStorage gốc trước khi chuyển hướng localStorage
const realSession: Storage | null = hasWindow ? window.sessionStorage : null;

/** Bật demo theo tham số URL (?demo=teacher|student) */
if (hasWindow && realSession) {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('demo');
    if (q === 'teacher' || q === 'student') {
      realSession.clear();
      realSession.setItem(DEMO_FLAG_KEY, q);
      realSession.setItem(DEMO_SESSION_KEY, Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      params.delete('demo');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    }
  } catch {}
}

export const isDemoMode = (): boolean => {
  try { return !!realSession?.getItem(DEMO_FLAG_KEY); } catch { return false; }
};

export const getDemoRole = (): DemoRole | null => {
  try { return (realSession?.getItem(DEMO_FLAG_KEY) as DemoRole) || null; } catch { return null; }
};

/** Tên IndexedDB dùng cho demo (mỗi lượt demo một kho riêng) */
export const getDemoIdbName = (): string | null =>
  isDemoMode() ? DEMO_IDB_PREFIX + (realSession?.getItem(DEMO_SESSION_KEY) || 'x') : null;

/** Mở bản demo ở vai trò đã chọn (tải lại trang) */
export const startDemo = (role: DemoRole) => {
  window.location.href = `/?demo=${role}`;
};

/** Thoát demo: xoá sạch dữ liệu demo, quay về trang thật */
export const exitDemo = () => {
  const idb = getDemoIdbName();
  try { realSession?.clear(); } catch {}
  try { if (idb) window.indexedDB.deleteDatabase(idb); } catch {}
  window.location.href = '/';
};

/** Đổi vai trò trong lúc demo (giữ nguyên dữ liệu demo đang có) */
export const switchDemoRole = async (role: DemoRole) => {
  try {
    realSession?.setItem(DEMO_FLAG_KEY, role);
    await demoReady;
    const user = buildDemoUser(role);
    if (user) realSession?.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    realSession?.setItem('mrs_dung_user_role', role);
  } catch {}
  window.location.reload();
};

// ============================ "FIREBASE GIẢ" TRONG TRÌNH DUYỆT ============================
let tree: any = {};
let demoReady: Promise<void> = Promise.resolve();

const segs = (p: string) => p.split('/').filter(Boolean).map(decodeURIComponent);
const readPath = (p: string) => {
  let n = tree;
  for (const k of segs(p)) {
    if (n == null || typeof n !== 'object') return null;
    n = n[k];
  }
  return n === undefined ? null : n;
};
const prune = (v: any): any => {
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      v[k] = prune(v[k]);
      if (v[k] === null) delete v[k];
    }
    return Array.isArray(v) || Object.keys(v).length ? v : null;
  }
  return v === undefined ? null : v;
};
const writePath = (p: string, value: any) => {
  const ks = segs(p);
  const v = prune(value === undefined ? null : JSON.parse(JSON.stringify(value)));
  if (!ks.length) { tree = v || {}; return; }
  let n = tree;
  for (const k of ks.slice(0, -1)) {
    if (!n[k] || typeof n[k] !== 'object') n[k] = {};
    n = n[k];
  }
  if (v === null) delete n[ks[ks.length - 1]];
  else n[ks[ks.length - 1]] = v;
};

let persistTimer: any = null;
const persist = () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { realSession?.setItem(DEMO_DB_KEY, JSON.stringify(tree)); } catch {}
  }, 300);
};

// ---- EventSource giả (cập nhật trực tiếp) ----
type Listener = { path: string; es: FakeEventSource };
const listeners = new Set<Listener>();
const notify = (path: string, data: any, event: 'put' | 'patch' = 'put') => {
  const wp = '/' + segs(path).join('/');
  listeners.forEach(l => {
    const sp = '/' + segs(l.path).join('/');
    if (wp === sp || wp.startsWith(sp + '/') || sp === '/') {
      const rel = wp.slice(sp === '/' ? 0 : sp.length) || '/';
      l.es._emit(event, { path: rel, data });
    }
  });
};

class FakeEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  url: string;
  readyState = 0;
  withCredentials = false;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private entry: Listener;

  constructor(url: string) {
    super();
    this.url = url;
    const path = new URL(url).pathname.replace(/\.json$/, '');
    this.entry = { path, es: this };
    listeners.add(this.entry);
    demoReady.then(() => {
      if (this.readyState === 2) return;
      this.readyState = 1;
      this.onopen?.(new Event('open'));
      this._emit('put', { path: '/', data: readPath(path) });
    });
  }
  _emit(type: string, payload: any) {
    if (this.readyState === 2) return;
    const ev = new MessageEvent(type, { data: JSON.stringify(payload) });
    this.dispatchEvent(ev);
  }
  close() {
    this.readyState = 2;
    listeners.delete(this.entry);
  }
}

const jsonResponse = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const handleDemoRequest = async (url: URL, init?: RequestInit): Promise<Response> => {
  await demoReady;
  const method = (init?.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/\.json$/, '');
  const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : null;

  if (method === 'GET') {
    let v = readPath(path);
    if (url.searchParams.get('shallow') === 'true' && v && typeof v === 'object') {
      v = Object.fromEntries(Object.keys(v).map(k => [k, true]));
    }
    return jsonResponse(v);
  }
  if (method === 'PUT') {
    writePath(path, body); persist(); notify(path, body);
    return jsonResponse(body);
  }
  if (method === 'PATCH') {
    Object.entries(body || {}).forEach(([k, v]) => writePath(`${path}/${k}`, v));
    persist(); notify(path, body, 'patch');
    return jsonResponse(body);
  }
  if (method === 'POST') {
    const id = '-demo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    writePath(`${path}/${id}`, body); persist(); notify(`${path}/${id}`, body);
    return jsonResponse({ name: id });
  }
  if (method === 'DELETE') {
    writePath(path, null); persist(); notify(path, null);
    return jsonResponse(null);
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
};

// ---- Người dùng demo (đăng nhập tự động) ----
const buildDemoUser = (role: DemoRole): any => {
  if (role === 'teacher') {
    const rec = readPath('_ping/teacher_auth');
    return {
      id: 'teacher_dung',
      username: DEMO_TEACHER_USERNAME,
      role: 'teacher',
      name: 'Giáo viên Demo',
      avatar: '👩‍🏫',
      authStamp: rec?.updatedAt
    };
  }
  const students = Object.values(readPath('students') || {}) as any[];
  const s = students.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  if (!s) return null;
  return {
    id: s.id,
    username: s.username || s.name,
    role: 'student',
    name: s.name,
    avatar: s.avatar || '🎒',
    classId: s.classId,
    className: s.className
  };
};

// ============================ KHỞI ĐỘNG ============================
if (hasWindow && isDemoMode() && realSession) {
  // 1. Mọi dữ liệu "localStorage" của app trong demo chuyển sang sessionStorage (tự xoá khi đóng tab)
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => realSession });
  } catch (e) {
    console.warn('[demo] Không chuyển hướng được localStorage', e);
  }

  // 2. Trỏ app tới "Firebase giả"
  realSession.setItem('mrs_dung_firebase_config', JSON.stringify({ databaseURL: DEMO_URL, apiKey: '' }));

  // 3. Chặn fetch / EventSource tới DEMO_URL
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (raw.startsWith(DEMO_URL)) {
      const reqInit = init || (input instanceof Request ? { method: input.method } : undefined);
      return handleDemoRequest(new URL(raw), reqInit);
    }
    return nativeFetch(input as any, init);
  };
  const NativeES = window.EventSource;
  (window as any).EventSource = function (url: string | URL, cfg?: EventSourceInit) {
    const u = String(url);
    if (u.startsWith(DEMO_URL)) return new FakeEventSource(u);
    return new NativeES(u, cfg);
  } as any;
  Object.assign((window as any).EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });

  // 4. Nạp dữ liệu demo (tạo mới nếu tab mới mở demo), rồi đăng nhập sẵn
  demoReady = (async () => {
    const saved = realSession.getItem(DEMO_DB_KEY);
    if (saved) {
      try { tree = JSON.parse(saved) || {}; } catch { tree = {}; }
    } else {
      const { buildDemoDatabase } = await import('./demoSeed');
      tree = await buildDemoDatabase();
      realSession.setItem(DEMO_DB_KEY, JSON.stringify(tree));
    }
    // Dọn các kho IndexedDB của những lượt demo cũ
    try {
      const current = getDemoIdbName();
      const dbs = await (window.indexedDB as any).databases?.();
      (dbs || []).forEach((d: any) => {
        if (d?.name && d.name.startsWith(DEMO_IDB_PREFIX) && d.name !== current) window.indexedDB.deleteDatabase(d.name);
      });
    } catch {}
  })();
}

/** Gọi trước khi render: bảo đảm dữ liệu demo sẵn sàng và đã đăng nhập đúng vai trò */
export const prepareDemo = async (): Promise<void> => {
  if (!isDemoMode()) return;
  await demoReady;
  const role = getDemoRole();
  if (role && !realSession?.getItem(CURRENT_USER_KEY)) {
    const user = buildDemoUser(role);
    if (user) {
      realSession?.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      realSession?.setItem('mrs_dung_user_role', role);
      if (role === 'student') {
        realSession?.setItem('mrs_dung_selected_student', user.name);
        realSession?.setItem('mrs_dung_active_student_name', user.name);
        realSession?.setItem('mrs_dung_selected_class', user.className);
        realSession?.setItem('mrs_dung_active_class_name', user.className);
      }
    }
  }
};
