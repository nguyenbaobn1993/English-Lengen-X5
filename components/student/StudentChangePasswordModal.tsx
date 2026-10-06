import React, { useState, useEffect } from 'react';
import { getClasses, getStudents } from '../../services/assignmentService';
import { changeStudentPasswordDirectly } from '../../services/authService';
import { ClassRoom, Student } from '../../types';

interface StudentChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassName?: string;
  initialStudentName?: string;
  onSuccess?: (newPassword: string) => void;
}

export const StudentChangePasswordModal: React.FC<StudentChangePasswordModalProps> = ({
  isOpen,
  onClose,
  initialClassName = '',
  initialStudentName = '',
  onSuccess,
}) => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(initialClassName);
  const [studentName, setStudentName] = useState<string>(initialStudentName);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [oldPassword, setOldPassword] = useState<string>('123');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showOldPassword, setShowOldPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync initial props when opened
  useEffect(() => {
    if (isOpen) {
      const cls = getClasses();
      setClasses(cls);

      const targetClass = initialClassName || (cls.length > 0 ? cls[0].name : '');
      setSelectedClass(targetClass);
      setStudentName(initialStudentName);
      setOldPassword('123');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg('');
      setSuccessMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialClassName, initialStudentName]);

  // Load students of selected class
  useEffect(() => {
    if (!selectedClass) {
      setClassStudents([]);
      return;
    }
    const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
    const clsObj = classes.find(c => c.name === selectedClass || norm(c.name) === norm(selectedClass));
    if (clsObj) {
      setClassStudents(getStudents(clsObj.id));
    } else {
      setClassStudents(getStudents(selectedClass));
    }
  }, [selectedClass, classes]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanName = studentName.trim();
    const cleanOldPass = oldPassword.trim();
    const cleanNewPass = newPassword.trim();
    const cleanConfirmPass = confirmPassword.trim();

    if (!selectedClass) {
      setErrorMsg('Vui lòng chọn lớp học của em!');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Vui lòng nhập hoặc chọn họ và tên của em!');
      return;
    }
    if (!cleanOldPass) {
      setErrorMsg('Vui lòng nhập mật khẩu cũ! (Mặc định ban đầu là 123)');
      return;
    }
    if (!cleanNewPass) {
      setErrorMsg('Vui lòng nhập mật khẩu mới!');
      return;
    }
    if (cleanNewPass.length < 1) {
      setErrorMsg('Mật khẩu mới không được để trống!');
      return;
    }
    if (cleanNewPass === cleanOldPass) {
      setErrorMsg('Mật khẩu mới phải khác với mật khẩu cũ!');
      return;
    }
    if (cleanNewPass !== cleanConfirmPass) {
      setErrorMsg('Mật khẩu xác nhận không trùng khớp với mật khẩu mới!');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = changeStudentPasswordDirectly(
        selectedClass,
        cleanName,
        cleanOldPass,
        cleanNewPass
      );

      if (!result.success) {
        setErrorMsg(result.error || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại!');
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg(result.message || '🎉 Đổi mật khẩu thành công!');
      if (onSuccess) {
        onSuccess(cleanNewPass);
      }

      // Automatically close modal after brief delay so user can read message
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 1600);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra, vui lòng thử lại sau!');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-scale-up relative max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-5 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-black text-sm flex items-center justify-center transition-all cursor-pointer"
            title="Đóng"
          >
            ✕
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl border border-white/30">
              🔑
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight leading-tight">
                Đổi Mật Khẩu Học Sinh
              </h3>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                Nhập mật khẩu cũ (mặc định 123) và đổi mật khẩu mới
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* Note */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
            <span className="text-base shrink-0">💡</span>
            <div>
              <b>Mật khẩu ban đầu mặc định là 123.</b>
              <div className="text-[11px] text-amber-800 mt-0.5">
                Em chỉ cần nhập <b>mật khẩu cũ</b> (mặc định 123) và nhập <b>mật khẩu mới</b> là xong nhé! Nếu em quên mật khẩu, hãy nhờ Thầy Cô cấp lại mật khẩu cho em.
              </div>
            </div>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2 animate-shake">
              <span className="text-base shrink-0">⚠️</span>
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-800 font-bold flex items-start gap-2">
              <span className="text-base shrink-0">✅</span>
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Class selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Lớp học của em
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setErrorMsg('');
                }}
                disabled={isSubmitting || !!initialClassName}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold bg-white text-slate-800 cursor-pointer disabled:bg-slate-100 disabled:text-slate-600"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Student Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Họ và tên của em
              </label>
              {classStudents.length > 0 && !initialStudentName ? (
                <div className="space-y-1.5">
                  <select
                    value={studentName}
                    onChange={e => {
                      setStudentName(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="">-- Bấm chọn tên của em ({classStudents.length} học sinh) --</option>
                    {classStudents.map(s => (
                      <option key={s.id} value={s.name}>
                        {s.avatar || '👤'} {s.name} {s.englishName ? `(${s.englishName})` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={studentName}
                    onChange={e => {
                      setStudentName(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Hoặc tự gõ họ tên em vào đây..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-medium text-slate-800"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={e => {
                    setStudentName(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting || !!initialStudentName}
                  placeholder="Ví dụ: Hoàng Sơn Tùng"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-600"
                />
              )}
            </div>

            {/* Old Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  3. Mật khẩu cũ
                </label>
                <span className="text-[11px] text-amber-700 font-semibold">
                  (Mặc định ban đầu là 123)
                </span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                  🔒
                </span>
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  required
                  value={oldPassword}
                  onChange={e => {
                    setOldPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting}
                  placeholder="Nhập mật khẩu cũ (mặc định là 123)..."
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  tabIndex={-1}
                >
                  {showOldPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                4. Mật khẩu mới
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                  ✨
                </span>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => {
                    setNewPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting}
                  placeholder="Nhập mật khẩu mới mà em muốn đặt..."
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  tabIndex={-1}
                >
                  {showNewPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                5. Nhập lại mật khẩu mới
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                  🔑
                </span>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting}
                  placeholder="Nhập lại mật khẩu mới để xác nhận..."
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Đang xử lý...</span>
                ) : (
                  <>
                    <span>✨ Lưu Mật Khẩu Mới</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentChangePasswordModal;
