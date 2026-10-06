import React, { useState } from 'react';
import { LegendLogo, royalBg, BRAND_SLOGAN } from './Brand';
import { saveFirebaseConfig, testFirebaseConnection, DEFAULT_FIREBASE_CONFIG } from '../services/firebaseService';

/**
 * Trang chưa được gắn cơ sở dữ liệu của trung tâm (config/center.config.json trống, chưa có biến môi trường).
 * Không bao giờ tự kết nối vào cơ sở dữ liệu của trung tâm khác.
 */
export const DatabaseSetupNotice: React.FC = () => {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleTry = async (e: React.FormEvent) => {
    e.preventDefault();
    const databaseURL = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/.+\.(firebasedatabase\.app|firebaseio\.com)$/i.test(databaseURL)) {
      setMsg({ ok: false, text: 'Địa chỉ phải có dạng https://<ma-du-an>-default-rtdb.<vung>.firebasedatabase.app' });
      return;
    }
    setBusy(true);
    saveFirebaseConfig({ ...DEFAULT_FIREBASE_CONFIG, databaseURL, apiKey: apiKey.trim() });
    const res = await testFirebaseConnection();
    setBusy(false);
    setMsg({ ok: res.success, text: res.message });
    if (res.success) setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans" style={royalBg}>
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-5">
        <div className="text-center space-y-2">
          <LegendLogo className="w-16 h-16 mx-auto" />
          <p className="text-xs font-black tracking-widest text-brand-700">{BRAND_SLOGAN}</p>
          <h1 className="text-xl font-black text-slate-800">Trang chưa kết nối cơ sở dữ liệu của trung tâm</h1>
          <p className="text-sm text-slate-500">
            Mỗi trung tâm dùng một cơ sở dữ liệu Firebase riêng. Người cài đặt cần gắn địa chỉ Firebase của trung tâm
            trước khi giáo viên và học sinh sử dụng.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 space-y-2">
          <p className="font-black">Cách gắn cho MỌI máy (bắt buộc khi đưa lên web):</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Trên máy tính chứa code, chạy <code className="bg-white px-1 rounded">npm run setup</code> và nhập địa chỉ Firebase của trung tâm, rồi build / đưa lên lại.</li>
            <li>Hoặc trên Vercel: Settings → Environment Variables, thêm <code className="bg-white px-1 rounded">VITE_FIREBASE_DATABASE_URL</code> (và <code className="bg-white px-1 rounded">VITE_FIREBASE_API_KEY</code> nếu có), rồi Redeploy.</li>
          </ol>
          <p>Xem chi tiết trong file <code className="bg-white px-1 rounded">HUONG_DAN_TRUNG_TAM_MOI.md</code>.</p>
        </div>

        <form onSubmit={handleTry} className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thử kết nối trên RIÊNG máy này (để kiểm tra)</p>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://ten-du-an-default-rtdb.asia-southeast1.firebasedatabase.app"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
          />
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Web API Key (không bắt buộc)"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold text-sm disabled:opacity-50"
          >
            {busy ? 'Đang kiểm tra...' : 'Kết nối thử trên máy này'}
          </button>
          {msg && (
            <div className={`text-sm rounded-xl p-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
          )}
        </form>
      </div>
    </div>
  );
};
