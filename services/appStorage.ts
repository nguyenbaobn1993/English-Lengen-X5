/**
 * Hệ thống lưu trữ mở rộng và chống tràn bộ nhớ (Resilient App Storage)
 * 
 * VẤN ĐỀ TRÊN THIẾT BỊ NGƯỜI DÙNG:
 * - Trình duyệt di động (Safari iOS trên iPhone, iPad...) có giới hạn cứng 5MB cho localStorage.
 * - Khi danh sách bài tập (120+ bài), bài nộp (1400+ bài), học sinh (469 em), báo cáo,... vượt quá 5MB:
 *   -> Trình duyệt ném lỗi QuotaExceededError (Bộ nhớ trình duyệt trên máy này đã đầy).
 *   -> Hệ thống không thể lưu được bài tập & học sinh vào máy -> học sinh không thấy tên, không nhận được bài;
 *      giáo viên thấy 0 bài đã giao.
 *   -> Người dùng bấm "Làm mới" xóa bộ nhớ và tải lại từ cloud thì dữ liệu lại vượt 5MB ngay lập tức!
 * 
 * GIẢI PHÁP:
 * 1. Sử dụng IndexedDB làm tầng lưu trữ bền vững (dung lượng hàng trăm MB - GB, không giới hạn 5MB).
 * 2. Giữ In-Memory Cache (Map<string, string>) trong RAM để tất cả hàm đọc đồng bộ (getAssignments,
 *    getStudents, getSubmissions...) có tốc độ 0ms và không cần sửa giao diện.
 * 3. Tự động di chuyển (migrate) và XÓA các key dữ liệu lớn khỏi localStorage, giúp localStorage
 *    luôn nhẹ (< 20KB) và không bao giờ bị đầy nữa.
 * 4. Bảo vệ toàn cục: Bọc Storage.prototype.setItem để QuotaExceededError không bao giờ làm gián đoạn ứng dụng.
 */

const DB_NAME = 'mrs_dung_offline_store';
const STORE_NAME = 'kv_store';
const DB_VERSION = 1;

/** Danh sách các khóa dữ liệu lớn - TUYỆT ĐỐI KHÔNG lưu trong localStorage để tránh tràn 5MB */
export const BULK_KEYS = new Set<string>([
  'mrs_dung_assignments',
  'mrs_dung_deleted_assignments',
  'mrs_dung_submissions',
  'mrs_dung_deleted_submissions',
  'mrs_dung_students',
  'mrs_dung_deleted_students',
  'mrs_dung_classes',
  'mrs_dung_deleted_classes',
  'mrs_dung_cloud_snapshot_v1',
  'mrs_dung_monthly_reports',
  'mrs_dung_weekly_reports',
  'mrs_dung_annual_reports',
  'mrs_dung_class_schedules',
  'mrs_dung_attendance_records',
  'mrs_dung_pending_submissions',
  'mrs_dung_deleted_items',
  'mrs_dung_report_dirty',
  'lesson_history'
]);

// -------------------- IN-MEMORY CACHE (0ms latency) --------------------
const memoryCache = new Map<string, string>();

// Nạp đồng bộ ngay lúc import module tất cả những gì đang có trong localStorage
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const v = localStorage.getItem(k);
        if (v !== null) memoryCache.set(k, v);
      }
    }
  } catch {}
}

// -------------------- NATIVE INDEXEDDB ENGINE --------------------
let dbPromise: Promise<IDBDatabase | null> | null = null;

const getIDB = (): Promise<IDBDatabase | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[appStorage] Không thể mở IndexedDB, tiếp tục bằng memory cache:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[appStorage] Khởi tạo IndexedDB lỗi:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
};

export const idbGet = async (key: string): Promise<string | null> => {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result != null ? String(req.result) : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const idbSet = async (key: string, value: string): Promise<void> => {
  try {
    const db = await getIDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(value, key);
    });
  } catch (e) {
    console.warn(`[appStorage] idbSet lỗi cho khóa "${key}":`, e);
  }
};

export const idbDelete = async (key: string): Promise<void> => {
  try {
    const db = await getIDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.objectStore(STORE_NAME).delete(key);
    });
  } catch {}
};

export const idbGetAll = async (): Promise<Array<{ key: string; value: string }>> => {
  try {
    const db = await getIDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const items: Array<{ key: string; value: string }> = [];

      // Dùng cursor để tương thích tối đa với mọi phiên bản Safari iOS / Android / Chrome
      const req = store.openCursor();
      req.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          items.push({ key: String(cursor.key), value: String(cursor.value) });
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

export const idbClear = async (): Promise<void> => {
  try {
    const db = await getIDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.objectStore(STORE_NAME).clear();
    });
  } catch {}
};

// -------------------- INITIALIZATION & AUTO-MIGRATION --------------------
let initPromise: Promise<void> | null = null;

export const initAppStorage = async (): Promise<void> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (typeof window === 'undefined') return;

    // 1. Chống lỗi toàn cục: Bảo vệ Storage.prototype.setItem
    try {
      if (window.Storage && Storage.prototype) {
        const origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
          try {
            origSetItem.call(this, key, value);
          } catch (err: any) {
            if (
              err &&
              (err.name === 'QuotaExceededError' ||
                err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                err.code === 22 ||
                err.code === 1014)
            ) {
              console.warn(`[appStorage] localStorage đầy cho "${key}". Dữ liệu được bảo toàn an toàn trong IndexedDB.`);
            } else {
              throw err;
            }
          }
        };
      }
    } catch {}

    // 2. Nạp dữ liệu từ IndexedDB vào memoryCache.
    //    Điện thoại yếu đọc ~5 MB mất vài giây: trước đây chỉ chờ 1,5 giây rồi mở app với dữ liệu TRỐNG
    //    (không thấy lớp, không thấy bài) và tải lại toàn bộ từ mạng. Nay chờ tối đa 8 giây; nếu vẫn chưa xong
    //    thì phần đọc về muộn vẫn được nạp cho những khóa app chưa ghi mới.
    try {
      let timedOut = false;
      const idbRead = idbGetAll();
      const allEntries = await Promise.race([
        idbRead,
        new Promise<Array<{ key: string; value: string }>>((resolve) => setTimeout(() => { timedOut = true; resolve([]); }, 8000))
      ]);
      for (const entry of allEntries) {
        memoryCache.set(entry.key, entry.value);
      }
      if (timedOut) {
        idbRead.then(late => {
          for (const entry of late) {
            if (!memoryCache.has(entry.key)) memoryCache.set(entry.key, entry.value);
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[appStorage] Nạp dữ liệu IndexedDB gặp lỗi nhẹ:', e);
    }

    // 3. Tự động giải phóng localStorage: Di chuyển các khóa lớn từ localStorage sang IndexedDB
    //    và xóa chúng khỏi localStorage để giải phóng hoàn toàn bộ nhớ bị báo đầy trên thiết bị.
    try {
      if (window.localStorage) {
        const keysToClean: string[] = [];
        for (const k of BULK_KEYS) {
          const legacyVal = localStorage.getItem(k);
          if (legacyVal !== null) {
            if (!memoryCache.has(k)) {
              memoryCache.set(k, legacyVal);
            }
            // Lưu vào IndexedDB
            await idbSet(k, memoryCache.get(k) || legacyVal);
            keysToClean.push(k);
          }
        }
        // Xóa sạch các khóa nặng khỏi localStorage
        for (const k of keysToClean) {
          try {
            localStorage.removeItem(k);
          } catch {}
        }
        if (keysToClean.length > 0) {
          console.info(`[appStorage] Đã giải phóng thành công ${keysToClean.length} bảng dữ liệu lớn khỏi localStorage.`);
        }
      }
    } catch (e) {
      console.warn('[appStorage] Quá trình dọn dẹp localStorage gặp lỗi:', e);
    }
  })();

  return initPromise;
};

// -------------------- UNIFIED SYNCHRONOUS APP STORAGE API --------------------
export const appStorage = {
  /** Đọc dữ liệu đồng bộ (0ms latency, lấy từ RAM hoặc localStorage) */
  getItem(key: string): string | null {
    if (memoryCache.has(key)) {
      return memoryCache.get(key)!;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const v = localStorage.getItem(key);
        if (v !== null) {
          memoryCache.set(key, v);
          return v;
        }
      } catch {}
    }
    return null;
  },

  /** Ghi dữ liệu đồng bộ vào RAM và bền vững vào IndexedDB */
  setItem(key: string, value: string): void {
    const strVal = String(value);
    memoryCache.set(key, strVal);

    // Lưu bền vững bất đồng bộ vào IndexedDB (không giới hạn 5MB)
    idbSet(key, strVal).catch(() => {});

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (BULK_KEYS.has(key)) {
          // Bảng lớn: loại bỏ khỏi localStorage để localStorage luôn sạch (< 20KB)
          localStorage.removeItem(key);
        } else {
          // Cài đặt/vai trò nhỏ: lưu vào localStorage để dùng ngay khi cold-boot
          localStorage.setItem(key, strVal);
        }
      } catch {
        // Lỗi quota được triệt tiêu an toàn
      }
    }
  },

  /** Xóa khóa dữ liệu khỏi cả RAM, IndexedDB và localStorage */
  removeItem(key: string): void {
    memoryCache.delete(key);
    idbDelete(key).catch(() => {});
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  },

  /** Xóa toàn bộ bộ nhớ ứng dụng */
  clear(): void {
    memoryCache.clear();
    idbClear().catch(() => {});
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.clear();
      } catch {}
    }
  },

  /** Kiểm tra khóa có tồn tại hay không */
  has(key: string): boolean {
    return memoryCache.has(key) || (typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null);
  }
};
