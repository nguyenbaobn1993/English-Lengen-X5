import React, { useState, useEffect } from 'react';
import { UserRole, AuthUser } from './types';
import { hasApiKey } from './services/geminiService';
import { initCloudSync, forceCloudSyncNow } from './services/assignmentService';
import { isFirebaseConfigured } from './services/firebaseService';
import { getCurrentUser, logout, isTeacherSessionValid } from './services/authService';
import { LoginScreen } from './components/LoginScreen';
import { DatabaseSetupNotice } from './components/DatabaseSetupNotice';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { StudentDashboard } from './components/student/StudentDashboard';
import { SettingsModal } from './components/SettingsModal';
import { LearningHistory } from './components/LearningHistory';
import { VisitCounter } from './components/VisitCounter';
import { StudentChangePasswordModal } from './components/student/StudentChangePasswordModal';
import { AdminNotificationBell } from './components/teacher/AdminNotificationBell';
import { UpdateBanner, StorageWarning } from './components/UpdateBanner';
import { startAutoUpdate } from './services/appUpdate';
import { LegendLogo, GoldText, BrandFooter, royalBg, BRAND_SLOGAN } from './components/Brand';

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const user = getCurrentUser();
    if (user) return user.role;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_user_role') as UserRole;
      if (saved === 'teacher' || saved === 'student') return saved;
    }
    return 'teacher'; // default role
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showStudentPassModal, setShowStudentPassModal] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [isHeaderSyncing, setIsHeaderSyncing] = useState(false);

  useEffect(() => {
    const cleanupCloudSync = initCloudSync();
    // Mọi máy đang mở trang tự lên phiên bản mới nhất sau mỗi lần deploy
    const cleanupAutoUpdate = startAutoUpdate();
    return () => {
      cleanupCloudSync();
      cleanupAutoUpdate();
    };
  }, []);

  useEffect(() => {
    const valid = hasApiKey();
    setHasKey(valid);
    if (!valid && currentRole === 'teacher' && currentUser) {
      // Prompt settings on launch for teacher if no key configured
      setShowSettings(true);
    }
  }, [currentRole, currentUser]);

  // Phiên quản trị chỉ hợp lệ khi đăng nhập bằng đúng mật khẩu hiện tại trên hệ thống.
  // Đăng nhập bằng mật khẩu cũ (88889999) hoặc sau khi cô đổi mật khẩu → máy đó tự đăng xuất.
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') return;
    let stopped = false;
    const check = async () => {
      const ok = await isTeacherSessionValid();
      if (!ok && !stopped) {
        logout();
        setCurrentUser(null);
        alert('Phiên đăng nhập quản trị đã hết hiệu lực (mật khẩu quản trị đã thay đổi). Cô vui lòng đăng nhập lại.');
      }
    };
    check();
    const timer = setInterval(check, 60000);
    return () => { stopped = true; clearInterval(timer); };
  }, [currentUser]);

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    localStorage.setItem('mrs_dung_user_role', role);
  };

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
    if (user.role === 'student' && user.name) {
      if (user.username !== 'hocsinh' && user.name !== 'Học Sinh') {
        localStorage.setItem('mrs_dung_selected_student', user.name);
        localStorage.setItem('mrs_dung_active_student_name', user.name);
        if (user.className) {
          localStorage.setItem('mrs_dung_selected_class', user.className);
          localStorage.setItem('mrs_dung_active_class_name', user.className);
        }
      }
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
  };

  // Chưa gắn cơ sở dữ liệu của trung tâm → hướng dẫn kết nối (không bao giờ dùng cơ sở dữ liệu của trung tâm khác)
  if (!isFirebaseConfigured()) {
    return <DatabaseSetupNotice />;
  }

  // If not logged in, show Login Screen
  if (!currentUser) {
    return (
      <>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
        <UpdateBanner />
        <StorageWarning />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col font-serif text-slate-900">
      {/* Header */}
      <header className="border-b-4 border-highlight-400/70 sticky top-0 z-50 shadow-xl font-sans" style={royalBg}>
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-4">
            <LegendLogo className="w-10 h-10 sm:w-12 sm:h-12" />
            <div className="flex flex-col">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold uppercase tracking-tight leading-tight whitespace-nowrap" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
                <span className="text-white">English </span><GoldText>Legend X5</GoldText>
              </h1>
              <span className="text-[8px] sm:text-[10px] font-black text-brand-200 uppercase tracking-[0.1em] sm:tracking-[0.15em] opacity-90 hidden sm:block">
                {BRAND_SLOGAN}
              </span>
            </div>
          </div>

          {/* Center: Role Switcher / Student Identity */}
          {currentUser.role === 'teacher' ? (
            <div className="flex items-center bg-brand-800/80 p-1 rounded-2xl border border-white/10 shadow-inner">
              <button
                onClick={() => handleRoleChange('teacher')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all ${
                  currentRole === 'teacher'
                    ? 'bg-brand-500 text-white shadow-lg scale-102 ring-2 ring-white/30'
                    : 'text-brand-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base">👩‍🏫</span>
                <span>Giáo Viên</span>
              </button>

              <button
                onClick={() => handleRoleChange('student')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all ${
                  currentRole === 'student'
                    ? 'bg-emerald-500 text-white shadow-lg scale-102 ring-2 ring-white/30'
                    : 'text-brand-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base">🎒</span>
                <span>Xem giao diện HS</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-800/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border border-white/10 text-white shadow-inner">
              <span className="text-base">{currentUser.avatar || '🎒'}</span>
              <span className="text-xs sm:text-sm font-black tracking-wide">Học Sinh: {currentUser.name}</span>
              {currentUser.className && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-[10px] font-bold hidden sm:inline-block">
                  {currentUser.className}
                </span>
              )}
            </div>
          )}

          {/* Right Action Icons */}
          <div className="flex items-center gap-2">
            {/* Compact Visit Counter */}
            <div className="hidden lg:block">
              <VisitCounter compact={true} />
            </div>

            {/* Firebase Connected / Cloud Sync Button */}
            {isFirebaseConfigured() && (
              <button
                onClick={async () => {
                  if (isHeaderSyncing) return;
                  setIsHeaderSyncing(true);
                  try {
                    await forceCloudSyncNow();
                  } finally {
                    setTimeout(() => setIsHeaderSyncing(false), 700);
                  }
                }}
                className="hidden sm:flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Đã kết nối Firebase Realtime Database. Bấm để đồng bộ ngay dữ liệu mới nhất từ đám mây!"
              >
                <span className={`text-xs ${isHeaderSyncing ? 'animate-spin inline-block' : 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'}`} />
                <span className="hidden md:inline">{isHeaderSyncing ? 'Đang đồng bộ...' : '🔥 Cloud Sync'}</span>
                <span className="md:hidden">{isHeaderSyncing ? '...' : '🔥 Sync'}</span>
              </button>
            )}

            {/* Chuông thông báo bài nộp mới (giáo viên) */}
            {currentUser.role === 'teacher' && <AdminNotificationBell />}

            {/* History Button */}
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all"
              title="Xem lịch sử học tập"
            >
              <span className="text-base">📊</span>
              <span className="hidden sm:inline">Lịch sử</span>
            </button>

            {/* Settings Button (For teacher) */}
            {currentUser.role === 'teacher' && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all"
                title="Cài đặt API & Đồng bộ"
              >
                <span className="text-base">⚙️</span>
                <span className="hidden sm:inline">Cài đặt</span>
                {!hasKey && (
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" title="Chưa có API key" />
                )}
              </button>
            )}

            {/* Student Change Password Button */}
            {currentUser.role === 'student' && (
              <button
                type="button"
                onClick={() => setShowStudentPassModal(true)}
                className="flex items-center gap-1.5 bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 border border-amber-400/40 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer"
                title="Tự đổi mật khẩu của em"
              >
                <span>🔑</span>
                <span className="hidden sm:inline">Đổi MK</span>
              </button>
            )}

            {/* User Profile Info & Logout */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/20">
              <div className="hidden sm:flex flex-col text-right text-white leading-tight">
                <span className="text-xs font-black truncate max-w-[120px]">{currentUser.name}</span>
                <span className="text-[9px] text-brand-200 uppercase font-semibold">
                  {currentUser.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-rose-500/80 hover:bg-rose-600 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1 shadow-sm"
                title="Đăng xuất khỏi hệ thống"
              >
                <span>🚪</span>
                <span className="hidden md:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace based on Active Role */}
      <main className="max-w-[1500px] mx-auto px-3 sm:px-6 py-6 sm:py-10 flex-grow w-full relative">
        {currentRole === 'teacher' && currentUser.role === 'teacher' ? (
          <TeacherDashboard
            onOpenSettings={() => setShowSettings(true)}
            onSwitchToStudent={() => handleRoleChange('student')}
          />
        ) : (
          <StudentDashboard />
        )}
      </main>

      {/* Thông báo có phiên bản mới (tự cập nhật lúc an toàn) */}
      <UpdateBanner />
      <StorageWarning />

      {/* Modals */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={() => setHasKey(hasApiKey())}
      />

      {showHistory && (
        <LearningHistory onClose={() => setShowHistory(false)} />
      )}

      {/* Modal: Đổi Mật Khẩu Cho Học Sinh */}
      {currentUser.role === 'student' && (
        <StudentChangePasswordModal
          isOpen={showStudentPassModal}
          onClose={() => setShowStudentPassModal(false)}
          initialClassName={currentUser.className}
          initialStudentName={currentUser.name}
        />
      )}

      {/* Footer: logo, slogan, đội ngũ (không có thông tin liên hệ) */}
      <BrandFooter>
        <VisitCounter compact={false} />
      </BrandFooter>
    </div>
  );
}

export default App;
