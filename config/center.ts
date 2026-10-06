/**
 * CƠ SỞ DỮ LIỆU CỦA TRUNG TÂM — gắn vào trang web lúc build (mọi máy dùng chung).
 *
 * Cách điền (chọn 1):
 *   1. Chạy `npm run setup` → nhập địa chỉ Firebase của trung tâm → tự tạo file config/center.config.json
 *   2. Hoặc đặt biến môi trường trên Vercel (Settings → Environment Variables):
 *        VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_API_KEY   (được ưu tiên hơn file json)
 */
import fileConfig from './center.config.json';

const env: Record<string, string | undefined> = ((import.meta as any).env || {}) as any;
const file: Record<string, string | undefined> = (fileConfig || {}) as any;
const pick = (envKey: string, fileKey: string): string => (env[envKey] || file[fileKey] || '').trim();

export const CENTER_FIREBASE = {
  databaseURL: pick('VITE_FIREBASE_DATABASE_URL', 'firebaseDatabaseURL').replace(/\/+$/, ''),
  apiKey: pick('VITE_FIREBASE_API_KEY', 'firebaseApiKey')
};

/** Mã dự án lấy từ địa chỉ cơ sở dữ liệu: https://<ma-du-an>-default-rtdb.<vung>.firebasedatabase.app */
export const CENTER_FIREBASE_PROJECT_ID = (() => {
  const m = CENTER_FIREBASE.databaseURL.match(/^https:\/\/([a-z0-9-]+?)(?:-default-rtdb)?\./i);
  return m ? m[1] : '';
})();
