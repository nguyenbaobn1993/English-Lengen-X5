import React, { useState, useEffect } from 'react';
import { UserRole, AuthUser, ClassRoom, Student } from '../types';
import {
  login,
  loginStudentSimple,
  loginStudentWithPassword,
  createStudentAccount,
  getSavedTeacherLogin,
  setSavedTeacherLogin,
  clearSavedTeacherLogin,
  getTeacherCredentials,
  loginTeacher,
  changeTeacherCredentials
} from '../services/authService';
import { getClasses, getStudents, subscribeToSync } from '../services/assignmentService';
import { StudentLeaderboardHonor } from './student/StudentLeaderboardHonor';
import { HeroCarousel, TeamShowcase, GoldText, LegendLogo, royalBg, BRAND_SLOGAN } from './Brand';
import { VisitCounter } from './VisitCounter';
import { StudentChangePasswordModal } from './student/StudentChangePasswordModal';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  // Default to student role
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modal to customize teacher credentials from login screen
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customCurrentPass, setCustomCurrentPass] = useState('');
  const [customNewUsername, setCustomNewUsername] = useState('');
  const [customNewPass, setCustomNewPass] = useState('');
  const [customConfirmPass, setCustomConfirmPass] = useState('');
  const [customErrorMsg, setCustomErrorMsg] = useState('');
  const [customSuccessMsg, setCustomSuccessMsg] = useState('');

  // Student specific selection state
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [studentClassName, setStudentClassName] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [studentPassword, setStudentPassword] = useState<string>('123');
  const [showStudentPassword, setShowStudentPassword] = useState<boolean>(false);
  const [classStudents, setClassStudents] = useState<Student[]>([]);

  // Student change password & create account modals
  const [showStudentChangePassword, setShowStudentChangePassword] = useState<boolean>(false);
  const [showCreateStudentModal, setShowCreateStudentModal] = useState<boolean>(false);
  const [newStudentRegName, setNewStudentRegName] = useState<string>('');
  const [newStudentRegClass, setNewStudentRegClass] = useState<string>('');
  const [createStudentError, setCreateStudentError] = useState<string>('');
  const [createStudentSuccess, setCreateStudentSuccess] = useState<string>('');

  // Load classes, students, and saved teacher credentials on mount + subscribe to sync
  useEffect(() => {
    const loadClassesAndUrlParams = () => {
      const cls = getClasses();
      setClasses(cls);

      let urlClass = '';
      let urlStudent = '';
      try {
        const search = new URLSearchParams(window.location.search);
        urlClass = search.get('class') || search.get('className') || '';
        urlStudent = search.get('student') || search.get('studentName') || search.get('name') || '';
      } catch {}

      if (urlClass) {
        const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
        const found = cls.find(c => c.name === urlClass || norm(c.name) === norm(urlClass));
        const activeName = found ? found.name : urlClass;
        setStudentClassName(activeName);
      } else if (cls.length > 0) {
        setStudentClassName(prev => {
          if (prev && cls.some(c => c.name === prev)) return prev;
          return cls[0].name;
        });
      }

      if (urlStudent) {
        setStudentName(urlStudent);
      }
    };

    loadClassesAndUrlParams();

    // Subscribe to cloud sync so classes appear automatically without manual refresh
    const unsubscribe = subscribeToSync((event) => {
      loadClassesAndUrlParams();
    });

    // Pre-load saved teacher login if present on device
    const saved = getSavedTeacherLogin();
    if (saved) {
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberMe(true);
    } else {
      // Không bao giờ điền sẵn mật khẩu giáo viên
      setUsername(getTeacherCredentials().username);
      setPassword('');
      setRememberMe(true);
    }

    return () => unsubscribe();
  }, []);

  // Synchronize student list whenever selected class or classes change
  useEffect(() => {
    if (!studentClassName) {
      setClassStudents([]);
      return;
    }
    const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
    const clsObj = classes.find(c => c.name === studentClassName || norm(c.name) === norm(studentClassName));
    if (clsObj) {
      setClassStudents(getStudents(clsObj.id));
    } else {
      setClassStudents(getStudents(studentClassName));
    }
  }, [studentClassName, classes]);

  // When class changes, update student list for suggestions
  const handleClassChange = (className: string) => {
    setStudentClassName(className);
    setStudentName('');
    setErrorMsg('');
  };

  // Switch role tabs - populate saved credentials if teacher
  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg('');
    if (role === 'teacher') {
      const saved = getSavedTeacherLogin();
      if (saved) {
        setUsername(saved.username);
        setPassword(saved.password);
        setRememberMe(true);
      } else {
        setUsername(getTeacherCredentials().username);
        setPassword('');
        setRememberMe(true);
      }
    } else {
      setUsername('');
      setPassword('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    if (selectedRole === 'teacher') {
      // Mật khẩu giáo viên kiểm tra trên hệ thống (dùng chung mọi máy, không có mật khẩu mặc định)
      const result = await loginTeacher(username, password);
      if (result.success && result.user) {
        if (rememberMe) {
          setSavedTeacherLogin(result.user.username, password, true);
        } else {
          clearSavedTeacherLogin();
        }
      }
      setIsLoading(false);
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMsg(result.error || 'Đăng nhập không thành công. Vui lòng thử lại!');
      }
      return;
    }

    setTimeout(() => {
      let result;
      if (selectedRole === 'student') {
        // Đăng nhập học sinh: Kiểm tra Lớp, Họ tên và Mật khẩu (mặc định 123)
        result = loginStudentWithPassword(studentClassName, studentName, studentPassword);
      } else {
        // Teacher login: supports customized credentials
        result = login(username, password, 'teacher');
        if (result.success && result.user) {
          if (rememberMe) {
            setSavedTeacherLogin(username, password, true);
          } else {
            clearSavedTeacherLogin();
          }
        }
      }

      setIsLoading(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMsg(result.error || 'Đăng nhập không thành công. Vui lòng thử lại!');
      }
    }, 150);
  };

  const handleCreateStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateStudentError('');
    setCreateStudentSuccess('');

    const res = createStudentAccount(newStudentRegName, newStudentRegClass);
    if (!res.success) {
      setCreateStudentError(res.error || 'Không thể tạo tài khoản học sinh!');
      return;
    }

    setCreateStudentSuccess(`✓ Đã tạo thành công tài khoản học sinh "${res.student?.name}"! Mật khẩu mặc định là 123.`);
    setStudentClassName(res.student?.className || newStudentRegClass);
    setStudentName(res.student?.name || newStudentRegName);
    setStudentPassword('123');

    setTimeout(() => {
      setShowCreateStudentModal(false);
      setCreateStudentSuccess('');
    }, 1500);
  };

  const handleSaveCustomCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomErrorMsg('');
    setCustomSuccessMsg('');

    const curPass = customCurrentPass.trim();
    if (!curPass) {
      setCustomErrorMsg('Vui lòng nhập mật khẩu hiện tại!');
      return;
    }

    const newU = customNewUsername.trim();
    const newP = customNewPass.trim();
    const confirmP = customConfirmPass.trim();

    if (!newU) {
      setCustomErrorMsg('Vui lòng nhập tên đăng nhập mới!');
      return;
    }
    if (!newP) {
      setCustomErrorMsg('Vui lòng nhập mật khẩu mới!');
      return;
    }
    if (newP.length < 6) {
      setCustomErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }
    if (newP !== confirmP) {
      setCustomErrorMsg('Xác nhận mật khẩu mới không trùng khớp!');
      return;
    }

    const res = await changeTeacherCredentials(curPass, newU, newP);
    if (!res.success) {
      setCustomErrorMsg(res.error || 'Không thể lưu tài khoản');
      return;
    }

    setUsername(newU);
    setPassword(newP);
    setSavedTeacherLogin(newU, newP, true);
    setRememberMe(true);

    setCustomSuccessMsg('✓ Đã đổi mật khẩu trên hệ thống — áp dụng cho mọi máy!');
    setTimeout(() => {
      setShowCustomModal(false);
      setCustomSuccessMsg('');
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-3 sm:p-6 lg:p-8 font-sans relative overflow-hidden" style={royalBg}>
      {/* Background Glow Decorations */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-highlight-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Ảnh bìa chiến binh + slogan */}
      <div className="w-full max-w-6xl mx-auto relative z-10 mb-6 sm:mb-8 space-y-4">
        <div className="flex items-center gap-3 text-white">
          <LegendLogo className="w-12 h-12 sm:w-14 sm:h-14" />
          <div className="min-w-0">
            <div className="text-lg sm:text-2xl font-bold uppercase leading-none whitespace-nowrap" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
              English <GoldText>Legend X5</GoldText>
            </div>
            <p className="text-[10px] sm:text-xs text-brand-200 font-bold tracking-widest mt-1">{BRAND_SLOGAN}</p>
          </div>
        </div>
        <HeroCarousel />
        <div className="text-center">
          <h2 className="text-2xl sm:text-4xl font-bold uppercase leading-tight" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
            <GoldText>Legend X5</GoldText> <span className="text-white">- Connect The World</span>
          </h2>
          <p className="text-sm sm:text-base text-brand-100 font-semibold mt-1">🌏 Kết nối thế giới bằng tiếng Anh</p>
        </div>
      </div>

      {/* Main Container: 2-column on desktop (Login Card + Honor Board Leaderboard), 1-column on mobile */}
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start relative z-10 my-auto">
        {/* Left Column: Login Card (col-span-12 lg:col-span-5) */}
        <div className="w-full lg:col-span-5 bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20 relative animate-fade-in">
          {/* Top Header Card */}
        <div className="p-6 sm:p-8 text-center text-white relative border-b-4 border-highlight-400/70" style={royalBg}>
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3">
            <LegendLogo className="w-full h-full" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase font-display">
            ENGLISH LEGEND X5
          </h1>
          <p className="text-xs sm:text-sm text-brand-100 font-medium mt-1">
            Hệ Thống Dạy & Học Tiếng Anh Thông Minh
          </p>
        </div>

        {/* Form Container */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Role Selection Tabs */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
              1. Chọn Vai Trò Đăng Nhập
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => handleRoleChange('student')}
                className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  selectedRole === 'student'
                    ? 'bg-white text-emerald-700 shadow-md scale-102 ring-2 ring-emerald-500/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-base">🎒</span>
                <span>Học Sinh</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange('teacher')}
                className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  selectedRole === 'teacher'
                    ? 'bg-white text-brand-700 shadow-md scale-102 ring-2 ring-brand-500/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-base">👩‍🏫</span>
                <span>Giáo Viên</span>
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {selectedRole === 'student' ? (
              <div className="space-y-4">
                {/* 1. Chọn Lớp Học Của Em */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    1. Chọn Lớp Học Của Em
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🏫
                    </span>
                    <select
                      value={studentClassName}
                      onChange={e => handleClassChange(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold bg-white text-slate-800 cursor-pointer"
                    >
                      {classes.length === 0 ? (
                        <option value="">-- Đang đồng bộ danh sách lớp... --</option>
                      ) : (
                        classes.map(c => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* 2. Chọn Hoặc Nhập Tên Học Sinh */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Chọn Hoặc Nhập Họ Và Tên Của Em
                  </label>

                  {/* Dropdown to pick student from roster if available */}
                  {classStudents.length > 0 && (
                    <div className="mb-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                          📋
                        </span>
                        <select
                          value={classStudents.some(s => s.name === studentName) ? studentName : ''}
                          onChange={e => {
                            setStudentName(e.target.value);
                            setErrorMsg('');
                          }}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-emerald-950 cursor-pointer"
                        >
                          <option value="">-- Bấm vào đây để chọn tên trong danh sách ({classStudents.length} học sinh) --</option>
                          {classStudents.map(s => (
                            <option key={s.id} value={s.name}>
                              {s.avatar || '👤'} {s.name} {s.englishName ? `(${s.englishName})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Input field */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🎒
                    </span>
                    <input
                      type="text"
                      required
                      value={studentName}
                      onChange={e => setStudentName(e.target.value)}
                      placeholder={classStudents.length > 0 ? "Hoặc tự gõ họ tên em vào đây..." : "Ví dụ: Nguyễn Minh Anh"}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                      autoComplete="off"
                      autoFocus
                    />
                  </div>

                  {/* Quick click suggestions if class has student list */}
                  {classStudents.length > 0 && (
                    <div className="mt-2.5">
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">
                        Hoặc bấm chọn nhanh tên của em:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-slate-50/80 rounded-xl border border-slate-100">
                        {classStudents.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setStudentName(s.name);
                              setErrorMsg('');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              studentName === s.name
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm scale-102 ring-2 ring-emerald-500/30'
                                : 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <span>{s.avatar || '👤'}</span>
                            <span>{s.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Mật Khẩu Đăng Nhập Học Sinh */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      3. Mật Khẩu Đăng Nhập
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowStudentChangePassword(true)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline transition-colors cursor-pointer"
                    >
                      🔑 Em muốn đổi mật khẩu?
                    </button>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🔒
                    </span>
                    <input
                      type={showStudentPassword ? 'text' : 'password'}
                      required
                      value={studentPassword}
                      onChange={e => setStudentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu (mặc định: 123)..."
                      className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm transition-all font-bold text-slate-900"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPassword(!showStudentPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                      tabIndex={-1}
                    >
                      {showStudentPassword ? '🙈' : '👁️'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1 text-[11px] border-t border-slate-100">
                    <span className="text-slate-500">
                      Mật khẩu mặc định: <b className="text-emerald-700 font-black">123</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewStudentRegClass(studentClassName || (classes[0]?.name || ''));
                        setNewStudentRegName('');
                        setCreateStudentError('');
                        setCreateStudentSuccess('');
                        setShowCreateStudentModal(true);
                      }}
                      className="text-brand-600 hover:text-brand-800 font-bold underline cursor-pointer"
                    >
                      ➕ Chưa có tên? Tạo tài khoản mới
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // TEACHER LOGIN: USERNAME & PASSWORD, NO AUTOFILL
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên đăng nhập Giáo Viên
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      👩‍🏫
                    </span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Nhập tên đăng nhập..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none text-sm transition-all font-medium"
                      autoComplete="off"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mật khẩu Giáo Viên
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🔒
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none text-sm transition-all font-medium"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-sm"
                      tabIndex={-1}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Change Credentials Link */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 cursor-pointer"
                    />
                    <span>Ghi nhớ trên thiết bị này</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const creds = getTeacherCredentials();
                      setCustomNewUsername(creds.username);
                      setCustomCurrentPass('');
                      setCustomNewPass('');
                      setCustomConfirmPass('');
                      setCustomErrorMsg('');
                      setCustomSuccessMsg('');
                      setShowCustomModal(true);
                    }}
                    className="text-[11px] font-bold text-brand-600 hover:text-brand-800 underline transition-colors cursor-pointer"
                  >
                    ⚙️ Đổi tài khoản / Mật khẩu
                  </button>
                </div>

                {rememberMe && username && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5 animate-fade-in">
                    <span>💾</span>
                    <span>Tài khoản đã được lưu trên thiết bị. Lần sau cô không cần nhập lại!</span>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-shake">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                selectedRole === 'teacher'
                  ? 'bg-brand-600 hover:bg-brand-700 active:scale-98 shadow-brand-500/30'
                  : 'bg-gradient-to-b from-highlight-300 via-highlight-400 to-highlight-500 !text-brand-900 hover:brightness-105 active:scale-98 shadow-highlight-400/30'
              } disabled:opacity-50`}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : selectedRole === 'student' ? (
                <>
                  <span>🚀</span>
                  <span>VÀO LÀM BÀI NGAY</span>
                </>
              ) : (
                <>
                  <span>🔐</span>
                  <span>ĐĂNG NHẬP GIÁO VIÊN</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Leaderboard of Hardworking Top Students (col-span-12 lg:col-span-7) */}
      <div className="w-full lg:col-span-7 space-y-4 animate-fade-in">
        <StudentLeaderboardHonor
          initialClassId={studentClassName || 'ALL'}
          title="BẢNG DANH SÁCH THÀNH TÍCH HỌC SINH CHĂM CHỈ ĐANG DẪN ĐẦU ĐIỂM CAO NHẤT"
          subtitle="Tuyên dương các em nỗ lực làm bài tập về nhà chăm chỉ và đạt điểm số cao nhất lớp Legend X5!"
        />

        {/* Real-time Learning Visit Statistics */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg">
          <VisitCounter compact={false} />
        </div>
      </div>
    </div>

      {/* Giới thiệu các thành viên tham gia */}
      <div className="w-full max-w-6xl mx-auto relative z-10 mt-6 sm:mt-8">
        <TeamShowcase />
        <p className="text-center text-[11px] text-brand-200/70 mt-6">© 2026 English Legend X5 • {BRAND_SLOGAN}</p>
      </div>

    {/* Modal: Customize Teacher Account & Password */}
    {showCustomModal && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-brand-100">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔐</span>
              <div>
                <h3 className="text-base font-black text-slate-900">Đổi Tài Khoản Giáo Viên</h3>
                <p className="text-xs text-slate-500">Tùy chỉnh tên đăng nhập & mật khẩu của cô</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="text-slate-400 hover:text-slate-600 font-bold p-1 text-lg"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSaveCustomCredentials} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật khẩu hiện tại (để xác nhận)
              </label>
              <input
                type="password"
                required
                value={customCurrentPass}
                onChange={e => setCustomCurrentPass(e.target.value)}
                placeholder="Nhập mật khẩu quản trị hiện tại..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên đăng nhập mới
              </label>
              <input
                type="text"
                required
                value={customNewUsername}
                onChange={e => setCustomNewUsername(e.target.value)}
                placeholder="Ví dụ: Legend X5 hoặc tên cô muốn..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={customNewPass}
                onChange={e => setCustomNewPass(e.target.value)}
                placeholder="Nhập mật khẩu mới (tối thiểu 4 ký tự)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nhập lại mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={customConfirmPass}
                onChange={e => setCustomConfirmPass(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-brand-500"
              />
            </div>

            {customErrorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{customErrorMsg}</span>
              </div>
            )}

            {customSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-1.5">
                <span>✓</span>
                <span>{customSuccessMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              >
                Lưu & Ghi Nhớ Ngay
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Modal: Đổi Mật Khẩu Học Sinh */}
    <StudentChangePasswordModal
      isOpen={showStudentChangePassword}
      onClose={() => setShowStudentChangePassword(false)}
      initialClassName={studentClassName}
      initialStudentName={studentName}
      onSuccess={(newPass) => {
        setStudentPassword(newPass);
      }}
    />

    {/* Modal: Tạo Tài Khoản Học Sinh Mới */}
    {showCreateStudentModal && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-emerald-100">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎒</span>
              <div>
                <h3 className="text-base font-black text-slate-900">Tạo Tài Khoản Học Sinh Mới</h3>
                <p className="text-xs text-slate-500">Mật khẩu mặc định ban đầu là 123</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateStudentModal(false)}
              className="text-slate-400 hover:text-slate-600 font-bold p-1 text-lg cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 leading-relaxed flex items-start gap-2">
            <span className="text-base shrink-0">💡</span>
            <div>
              Em chỉ cần nhập <b>Họ và tên</b> và chọn <b>Lớp học</b>. Mật khẩu khởi tạo mặc định là <b>123</b>. Sau khi tạo, em có thể tự đổi mật khẩu mới bất cứ lúc nào!
            </div>
          </div>

          <form onSubmit={handleCreateStudentSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Lớp học của em *
              </label>
              <select
                value={newStudentRegClass}
                onChange={e => setNewStudentRegClass(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white text-slate-800 outline-none focus:border-emerald-500 cursor-pointer"
              >
                {classes.length === 0 ? (
                  <option value="">Chưa có lớp</option>
                ) : (
                  classes.map(c => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Họ và tên của em *
              </label>
              <input
                type="text"
                required
                value={newStudentRegName}
                onChange={e => setNewStudentRegName(e.target.value)}
                placeholder="Ví dụ: Hoàng Sơn Tùng"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 placeholder:font-normal placeholder:text-slate-400"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                3. Mật khẩu mặc định
              </label>
              <div className="px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs font-mono font-bold text-emerald-900 flex items-center justify-between">
                <span>🔑 123</span>
                <span className="text-[11px] font-sans font-medium text-emerald-700">Mặc định ban đầu</span>
              </div>
            </div>

            {createStudentError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5 animate-shake">
                <span>⚠️</span>
                <span>{createStudentError}</span>
              </div>
            )}

            {createStudentSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-1.5">
                <span>✓</span>
                <span>{createStudentSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateStudentModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              >
                Tạo Tài Khoản & Vào Học
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
  );
};
