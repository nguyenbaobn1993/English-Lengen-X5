import React from 'react';
import { DEMO_TEACHER_PASSWORD, DEMO_TEACHER_USERNAME, exitDemo, getDemoRole, isDemoMode, startDemo, switchDemoRole } from '../services/demoBoot';

/** Thanh báo đang ở bản demo – luôn nằm trên cùng */
export const DemoBanner = () => {
  if (!isDemoMode()) return null;
  const role = getDemoRole();
  return (
    <div className="sticky top-0 z-[60] bg-gradient-to-r from-highlight-400 via-highlight-300 to-highlight-400 text-brand-900 font-sans shadow-md">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs font-bold">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-brand-900 text-highlight-300 font-black tracking-wider flex-shrink-0">BẢN DEMO</span>
          <span className="truncate">Dữ liệu mẫu chỉ nằm trên trình duyệt này và tự xoá khi đóng tab.</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => switchDemoRole(role === 'teacher' ? 'student' : 'teacher')}
            className="px-2.5 py-1 rounded-lg bg-brand-900 text-white hover:bg-brand-800"
          >
            {role === 'teacher' ? '🎒 Xem vai Học sinh' : '👩‍🏫 Xem vai Giáo viên'}
          </button>
          <button type="button" onClick={exitDemo} className="px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-brand-900 border border-brand-900/20">
            Thoát demo
          </button>
        </div>
      </div>
    </div>
  );
};

/** Thẻ "Tham quan bản demo" (màn hình đăng nhập / chưa gắn cơ sở dữ liệu) */
export const DemoEntryCard = ({ dark = true }: { dark?: boolean }) => (
  <div className={`rounded-2xl p-4 sm:p-5 border-2 font-sans ${dark ? 'bg-white/10 border-highlight-400/60 text-white backdrop-blur-md' : 'bg-highlight-300/20 border-highlight-400 text-brand-900'}`}>
    <div className="flex items-start gap-3">
      <span className="text-2xl">🧪</span>
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-base sm:text-lg">Tham quan bản demo</h3>
        <p className={`text-xs sm:text-sm mt-0.5 ${dark ? 'text-brand-100' : 'text-slate-600'}`}>
          Dùng thử đầy đủ quyền với dữ liệu mẫu (3 lớp, 24 học sinh, bài tập, điểm danh, báo cáo). Không cần tài khoản, không ảnh hưởng dữ liệu thật.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={() => startDemo('teacher')}
            className="py-2.5 rounded-xl font-black text-sm bg-gradient-to-b from-highlight-300 via-highlight-400 to-highlight-500 text-brand-900 shadow-lg hover:brightness-105 active:scale-95 transition"
          >
            👩‍🏫 Vai Giáo viên
          </button>
          <button
            type="button"
            onClick={() => startDemo('student')}
            className={`py-2.5 rounded-xl font-black text-sm active:scale-95 transition ${dark ? 'bg-white/15 hover:bg-white/25 border border-white/30' : 'bg-white hover:bg-slate-50 border border-brand-200'}`}
          >
            🎒 Vai Học sinh
          </button>
        </div>
        <p className={`text-[10px] mt-2 ${dark ? 'text-brand-200' : 'text-slate-500'}`}>
          Tài khoản demo: giáo viên <b>{DEMO_TEACHER_USERNAME}</b> / <b>{DEMO_TEACHER_PASSWORD}</b> · học sinh mật khẩu <b>123</b>
        </p>
      </div>
    </div>
  </div>
);
