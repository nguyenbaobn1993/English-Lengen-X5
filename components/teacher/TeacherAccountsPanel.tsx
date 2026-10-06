import React, { useEffect, useState } from 'react';
import {
  TeacherAccount, listTeacherAccounts, createTeacherAccount, resetTeacherAccountPassword,
  setTeacherAccountDisabled, deleteTeacherAccount, changeOwnTeacherPassword
} from '../../services/teacherAccounts';
import { fetchTeacherAuth, verifyTeacherPassword } from '../../services/teacherAuth';
import { getCurrentUser, setCurrentUser } from '../../services/authService';
import { isDemoMode } from '../../services/demoBoot';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-brand-500';

/** Thao tác nhạy cảm phải nhập lại mật khẩu quản trị (bỏ qua ở bản demo) */
const confirmAdmin = async (action: string): Promise<boolean> => {
  if (isDemoMode()) return true;
  const pass = window.prompt(`🔒 ${action}\nNhập MẬT KHẨU QUẢN TRỊ để xác nhận:`);
  if (pass === null) return false;
  const res = await verifyTeacherPassword(pass);
  if (!res.ok) { alert(res.error || 'Mật khẩu quản trị không đúng.'); return false; }
  return true;
};

/** Quản trị: thêm / khóa / đặt lại mật khẩu / xóa giáo viên */
export const TeacherAccountsPanel = () => {
  const [list, setList] = useState<TeacherAccount[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ displayName: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await listTeacherAccounts();
    if (r === 'error') { setError('Không tải được danh sách giáo viên (kiểm tra kết nối cơ sở dữ liệu).'); setList([]); }
    else { setError(''); setList(r); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setMsg(null);
    if (!(await confirmAdmin(`Thêm giáo viên "${form.displayName || form.username}"`))) return;
    setBusy(true);
    const admin = await fetchTeacherAuth();
    const res = await createTeacherAccount(form.username, form.displayName, form.password, admin && admin !== 'error' ? admin.username : '');
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error || 'Không tạo được tài khoản.' }); return; }
    setMsg({ ok: true, text: `✓ Đã tạo tài khoản cho ${form.displayName || form.username}. Gửi tên đăng nhập & mật khẩu cho giáo viên để đăng nhập ở mục "Giáo Viên".` });
    setForm({ displayName: '', username: '', password: '' });
    load();
  };

  const handleReset = async (acc: TeacherAccount) => {
    const p = window.prompt(`Mật khẩu MỚI cho ${acc.displayName} (ít nhất 6 ký tự):`);
    if (p === null) return;
    if (!(await confirmAdmin(`Đặt lại mật khẩu cho ${acc.displayName}`))) return;
    const r = await resetTeacherAccountPassword(acc, p);
    setMsg(r.ok ? { ok: true, text: `✓ Đã đặt lại mật khẩu cho ${acc.displayName}. Máy của giáo viên này sẽ phải đăng nhập lại.` } : { ok: false, text: r.error || 'Lỗi' });
    load();
  };

  const handleToggle = async (acc: TeacherAccount) => {
    if (!(await confirmAdmin(`${acc.disabled ? 'Mở khóa' : 'Khóa'} tài khoản ${acc.displayName}`))) return;
    const ok = await setTeacherAccountDisabled(acc, !acc.disabled);
    setMsg(ok ? { ok: true, text: acc.disabled ? `✓ Đã mở khóa ${acc.displayName}.` : `✓ Đã khóa ${acc.displayName} — máy đang đăng nhập sẽ tự đăng xuất.` } : { ok: false, text: 'Không lưu được.' });
    load();
  };

  const handleDelete = async (acc: TeacherAccount) => {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản giáo viên "${acc.displayName}"? (Bài đã giao, học sinh, điểm số vẫn giữ nguyên)`)) return;
    if (!(await confirmAdmin(`Xóa tài khoản ${acc.displayName}`))) return;
    const ok = await deleteTeacherAccount(acc.id);
    setMsg(ok ? { ok: true, text: `✓ Đã xóa tài khoản ${acc.displayName}.` } : { ok: false, text: 'Không xóa được.' });
    load();
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl">
        <h4 className="font-black text-brand-900 text-sm mb-1">👥 Tài khoản giáo viên</h4>
        <p className="text-xs text-brand-800 leading-relaxed">
          Giáo viên đăng nhập ở mục <b>“Giáo Viên”</b> trên màn hình đăng nhập và dùng được mọi chức năng dạy học: soạn & giao bài bằng AI,
          chấm bài, quản lý học sinh, điểm danh, báo cáo. Chỉ <b>quản trị</b> mới thêm/khóa/xóa giáo viên, đổi mật khẩu quản trị và xác nhận xóa lớp.
        </p>
      </div>

      {/* Thêm giáo viên */}
      <div className="p-4 rounded-2xl border-2 border-slate-200 space-y-2.5">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">➕ Thêm giáo viên mới</p>
        <input className={inputCls} placeholder="Tên hiển thị – VD: Cô Ngọc Hà" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
        <input className={inputCls} placeholder="Tên đăng nhập – VD: ngocha" value={form.username} autoComplete="off" onChange={e => setForm({ ...form, username: e.target.value })} />
        <input className={inputCls} type="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" value={form.password} autoComplete="new-password" onChange={e => setForm({ ...form, password: e.target.value })} />
        <button
          type="button"
          disabled={busy || !form.username.trim() || form.password.trim().length < 6}
          onClick={handleCreate}
          className="w-full py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-black text-sm"
        >
          {busy ? '⏳ Đang tạo...' : '➕ Tạo tài khoản giáo viên'}
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{msg.text}</div>
      )}
      {error && <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}

      {/* Danh sách */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Danh sách giáo viên ({list?.length ?? '…'})</p>
        {list === null && <p className="text-xs text-slate-400">Đang tải...</p>}
        {list && list.length === 0 && !error && <p className="text-xs text-slate-400">Chưa có giáo viên nào ngoài tài khoản quản trị.</p>}
        {list?.map(acc => (
          <div key={acc.id} className={`p-3 rounded-xl border flex flex-wrap items-center gap-2 ${acc.disabled ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200'}`}>
            <div className="flex-1 min-w-[150px]">
              <div className="font-black text-sm text-slate-800">
                🧑‍🏫 {acc.displayName}
                {acc.disabled && <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px]">Đang khóa</span>}
              </div>
              <div className="text-[11px] text-slate-500">Đăng nhập: <b>{acc.username}</b> · tạo {new Date(acc.createdAt).toLocaleDateString('vi-VN')}</div>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => handleReset(acc)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold">🔑 Đặt lại MK</button>
              <button type="button" onClick={() => handleToggle(acc)} className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold">{acc.disabled ? '🔓 Mở khóa' : '🔒 Khóa'}</button>
              <button type="button" onClick={() => handleDelete(acc)} className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold">🗑️ Xóa</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Giáo viên (không phải quản trị) tự đổi mật khẩu của mình */
export const MyTeacherPasswordPanel = () => {
  const user = getCurrentUser();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (!user?.teacherAccountId) return;
    if (next !== again) { setMsg({ ok: false, text: 'Hai lần nhập mật khẩu mới không khớp.' }); return; }
    const r = await changeOwnTeacherPassword(user.teacherAccountId, cur, next);
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'Lỗi' }); return; }
    setCurrentUser({ ...user, authStamp: r.updatedAt });
    setCur(''); setNext(''); setAgain('');
    setMsg({ ok: true, text: '✓ Đã đổi mật khẩu. Các máy khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại.' });
  };

  return (
    <div className="space-y-3 font-sans">
      <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl">
        <h4 className="font-black text-brand-900 text-sm mb-1">🔐 Tài khoản của tôi</h4>
        <p className="text-xs text-brand-800">
          {user?.name} · đăng nhập: <b>{user?.username}</b>. Quên mật khẩu? Nhờ quản trị trung tâm đặt lại.
        </p>
      </div>
      <input className={inputCls} type="password" placeholder="Mật khẩu hiện tại" value={cur} onChange={e => setCur(e.target.value)} />
      <input className={inputCls} type="password" placeholder="Mật khẩu mới (ít nhất 6 ký tự)" value={next} autoComplete="new-password" onChange={e => setNext(e.target.value)} />
      <input className={inputCls} type="password" placeholder="Nhập lại mật khẩu mới" value={again} autoComplete="new-password" onChange={e => setAgain(e.target.value)} />
      <button type="button" onClick={save} disabled={!cur || next.length < 6} className="w-full py-3 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-black text-sm">
        💾 Đổi mật khẩu
      </button>
      {msg && (
        <div className={`p-3 rounded-xl text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{msg.text}</div>
      )}
    </div>
  );
};
