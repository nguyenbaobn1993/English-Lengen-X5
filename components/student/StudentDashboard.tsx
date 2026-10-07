import React, { useState, useEffect } from 'react';
import { Assignment, ClassRoom, Student, Submission } from '../../types';
import {
  getClasses,
  getStudents,
  getAssignments,
  getAssignmentById,
  calculateDeadlineStatus,
  getStudentSubmission,
  subscribeToSync,
  isAssignmentForClass,
  forceCloudSyncNow
} from '../../services/assignmentService';
import { pullSubmissionsOnlyFromFirebase } from '../../services/firebaseService';
import { getCurrentUser } from '../../services/authService';
import { StudentLessonView } from './StudentLessonView';
import { StudentLeaderboardHonor } from './StudentLeaderboardHonor';
import { StudentChangePasswordModal } from './StudentChangePasswordModal';

export const StudentDashboard: React.FC = () => {
  const currentUser = getCurrentUser();
  const isStudentUser = currentUser?.role === 'student';
  const isTeacherUser = currentUser?.role === 'teacher';
  const isGenericStudent = isStudentUser && (currentUser?.username === 'hocsinh' || currentUser?.name === 'Học Sinh');

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassName, setSelectedClassName] = useState<string>(() => {
    // Học sinh luôn cố định theo lớp của tài khoản
    if (isStudentUser && currentUser?.className) {
      return currentUser.className;
    }
    const saved = localStorage.getItem('mrs_dung_active_class_name');
    if (saved) return saved;
    const cls = getClasses();
    return cls.length > 0 ? cls[0].name : '';
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [studentName, setStudentName] = useState<string>(() => {
    if (isStudentUser && currentUser?.name && currentUser?.name !== 'Học Sinh') {
      return currentUser.name;
    }
    return localStorage.getItem('mrs_dung_active_student_name') || '';
  });
  const [customNameInput, setCustomNameInput] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [submissionVersion, setSubmissionVersion] = useState<number>(0);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  // Active student object (scoped across whole component)
  const currentStudentObj = React.useMemo(() => {
    if (isStudentUser && !isGenericStudent && currentUser) {
      return currentUser;
    }
    if (!studentName) return undefined;
    const clean = studentName.trim().toLowerCase();
    return students.find(s => s.name === studentName || s.name.trim().toLowerCase() === clean);
  }, [isStudentUser, isGenericStudent, currentUser, studentName, students]);

  // Thông tin danh tính hiệu lực của học sinh (an toàn tuyệt đối tránh mất tên khi reload)
  const effectiveStudentName = (studentName || (isStudentUser ? currentUser?.name : '') || '').trim();
  const effectiveStudentId = currentStudentObj?.id || (isStudentUser && currentUser?.id !== 'student_chung' ? currentUser?.id : undefined);
  const effectiveEnglishName = (currentStudentObj as any)?.englishName;

  // Helper to format date header
  const formatDateHeader = (dateStr: string) => {
    if (!dateStr || dateStr === 'Chưa cập nhật ngày') return { label: 'Bài tập khác', isToday: false };
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;

      const parts = dateStr.split('-');
      const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;

      if (dateStr === todayStr) {
        return { label: `Hôm nay (Ngày ${formattedDate}) - Mới nhất`, isToday: true };
      }
      if (dateStr === yestStr) {
        return { label: `Hôm qua (Ngày ${formattedDate})`, isToday: false };
      }
      return { label: `Ngày ${formattedDate}`, isToday: false };
    } catch {
      return { label: dateStr, isToday: false };
    }
  };

  // Đảm bảo chỉ lấy bài tập thuộc về lớp đang chọn hoặc bài giao cho Toàn khối
  const filteredAssignments = React.useMemo(() => {
    return assignments.filter(assign => isAssignmentForClass(assign, selectedClassName, classes));
  }, [assignments, selectedClassName, classes]);

  // Group assignments by assignedDate, sorted newest date first
  const groupedAssignments = React.useMemo(() => {
    const filtered = filteredAssignments.filter(assign => {
      const submission = effectiveStudentName
        ? getStudentSubmission(assign.id, effectiveStudentName, effectiveStudentId, selectedClassName, assign.topic, assign.title, effectiveEnglishName)
        : undefined;
      const hasSubmitted = !!submission;
      if (filterStatus === 'pending') return !hasSubmitted;
      if (filterStatus === 'completed') return hasSubmitted;
      return true;
    });

    const groups: { [dateStr: string]: Assignment[] } = {};
    filtered.forEach(assign => {
      const key = assign.assignedDate || 'Chưa cập nhật ngày';
      if (!groups[key]) groups[key] = [];
      groups[key].push(assign);
    });

    return Object.entries(groups).sort((a, b) => {
      const timeA = new Date(a[0]).getTime();
      const timeB = new Date(b[0]).getTime();
      if (isNaN(timeA) || isNaN(timeB)) return b[0].localeCompare(a[0]);
      return timeB - timeA;
    });
  }, [filteredAssignments, effectiveStudentName, effectiveStudentId, selectedClassName, effectiveEnglishName, filterStatus, submissionVersion]);

  const completedCount = React.useMemo(() => {
    return filteredAssignments.filter(a =>
      effectiveStudentName && getStudentSubmission(a.id, effectiveStudentName, effectiveStudentId, selectedClassName, a.topic, a.title, effectiveEnglishName)
    ).length;
  }, [filteredAssignments, effectiveStudentName, effectiveStudentId, submissionVersion, selectedClassName, effectiveEnglishName]);

  const pendingCount = filteredAssignments.length - completedCount;

  const refreshData = () => {
    const cls = getClasses();
    setClasses(cls);

    let activeClsName = selectedClassName;
    // Nếu là học sinh đăng nhập, bắt buộc khóa chặt đúng lớp của học sinh
    if (isStudentUser && currentUser?.className) {
      activeClsName = currentUser.className;
    } else if (!activeClsName || !cls.some(c => c.name === activeClsName)) {
      activeClsName = cls.length > 0 ? cls[0].name : '';
    }

    if (activeClsName && activeClsName !== selectedClassName) {
      setSelectedClassName(activeClsName);
    }
    if (activeClsName) {
      localStorage.setItem('mrs_dung_active_class_name', activeClsName);
    }

    const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
    const activeClass = cls.find(c => c.name === activeClsName || norm(c.name) === norm(activeClsName)) || cls[0];
    if (activeClass) {
      setStudents(getStudents(activeClass.id));
    }
    // Get assignments filtered strictly for this class or ALL (sorted newest first)
    const assignList = getAssignments(activeClass?.id || activeClsName);
    setAssignments(assignList);
  };

  useEffect(() => {
    refreshData();

    // 1. Khi mở trang: kéo TOÀN BỘ dữ liệu (bài tập + bài nộp + tombstone "cho làm lại").
    // Trước đây trang học sinh chỉ kéo bài nộp, còn bài tập mới phải chờ vòng đồng bộ 60 giây
    // → học sinh bấm link cô gửi nhưng máy chưa có bài nên không mở được.
    forceCloudSyncNow().finally(() => {
      setSubmissionVersion(v => v + 1);
      refreshData();
    });

    // 2. Lắng nghe broadcast / sync events
    const unsubscribe = subscribeToSync((event) => {
      refreshData();
      setSubmissionVersion(v => v + 1);
    });

    // 3. Học sinh quay lại tab → đồng bộ toàn bộ (giới hạn 20 giây/lần)
    let lastFullSync = Date.now();
    const handleSyncCheck = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (Date.now() - lastFullSync < 20000) return;
        lastFullSync = Date.now();
        forceCloudSyncNow().finally(() => {
          setSubmissionVersion(v => v + 1);
          refreshData();
        });
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleSyncCheck);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleSyncCheck);
    }

    // 4. Polling dự phòng bài nộp (luồng realtime SSE trong initCloudSync đã nhận bài nộp tức thì).
    // 8 giây/lần tải lại toàn bộ bài nộp của cả trung tâm là quá nặng với mạng điện thoại của học sinh.
    const syncInterval = setInterval(() => {
      pullSubmissionsOnlyFromFirebase().then(newSubs => {
        if (newSubs.length > 0) {
          setSubmissionVersion(v => v + 1);
          refreshData();
        }
      });
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(syncInterval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleSyncCheck);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleSyncCheck);
      }
    };
  }, [selectedClassName]);

  // Check URL parameters for direct assignment link (e.g. from Zalo)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const targetAssignId = searchParams.get('assignmentId') || searchParams.get('assign');
      const targetClass = searchParams.get('class') || searchParams.get('className');
      if (targetClass) {
        setSelectedClassName(targetClass);
        localStorage.setItem('mrs_dung_active_class_name', targetClass);
      }
      if (targetAssignId && !selectedAssignment) {
        const found = getAssignmentById(targetAssignId) || assignments.find(a => a.id === targetAssignId);
        if (found) {
          if (found.targetClassName && found.targetClassName !== 'Tất cả các lớp') {
            setSelectedClassName(found.targetClassName);
            localStorage.setItem('mrs_dung_active_class_name', found.targetClassName);
          }
          setSelectedAssignment(found);
        }
      }
    } catch (e) {
      console.error('Error parsing URL params in StudentDashboard:', e);
    }
  }, [assignments, selectedAssignment]);

  const handleSelectClass = (clsName: string) => {
    setSelectedClassName(clsName);
    localStorage.setItem('mrs_dung_active_class_name', clsName);
    // Reset student if class changes
    setStudentName('');
    localStorage.removeItem('mrs_dung_active_student_name');
  };

  const handleSelectStudent = (name: string) => {
    setStudentName(name);
    localStorage.setItem('mrs_dung_active_student_name', name);
    setSubmissionVersion(v => v + 1);
  };

  const handleCustomNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNameInput.trim()) return;
    handleSelectStudent(customNameInput.trim());
    setCustomNameInput('');
  };

  // If a student is actively doing an assignment
  if (selectedAssignment && effectiveStudentName) {
    const effectiveClass = selectedClassName || currentUser?.className || selectedAssignment.targetClassName || 'Chưa phân lớp';

    return (
      <StudentLessonView
        assignment={selectedAssignment}
        studentName={effectiveStudentName}
        studentClass={effectiveClass}
        studentId={effectiveStudentId}
        onBack={() => {
          setSelectedAssignment(null);
          setSubmissionVersion(v => v + 1);
          refreshData();
          pullSubmissionsOnlyFromFirebase().then(() => {
            setSubmissionVersion(v => v + 1);
            refreshData();
          });
        }}
      />
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-sky-600 via-brand-600 to-sky-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              <span>🎒</span> GÓC HỌC TẬP HỌC SINH
            </div>
            <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight font-display">
              CHÀO MỪNG CON ĐẾN VỚI LEGEND X5!
            </h1>
            <p className="text-brand-100 text-sm sm:text-base font-medium mt-1">
              Xem danh sách bài tập cô giao theo ngày, hoàn thành bài tập và nhận ngay chứng nhận điểm cao nhé!
            </p>
          </div>

          {/* Student Status Tag */}
          {studentName ? (
            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 text-right">
              <p className="text-xs text-brand-100 uppercase font-bold">Học sinh đang học:</p>
              <p className="text-lg sm:text-xl font-black text-white">{studentName}</p>
              <p className="text-xs text-highlight-300 font-bold">{selectedClassName}</p>
              <div className="flex items-center justify-end gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(true)}
                  className="text-[11px] bg-white/20 hover:bg-white/30 text-white font-bold px-2 py-0.5 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                  title="Tự đổi mật khẩu của em"
                >
                  <span>🔑</span> Đổi MK
                </button>
                {!isStudentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentName('');
                      localStorage.removeItem('mrs_dung_active_student_name');
                    }}
                    className="text-[11px] text-white/80 hover:text-white underline font-bold cursor-pointer"
                  >
                    Đổi bạn khác
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white/20 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/30 text-xs font-bold text-yellow-200">
              ⚠️ Vui lòng chọn lớp và tên em bên dưới để bắt đầu làm bài nhé!
            </div>
          )}
        </div>
      </div>

      {/* Identity Banner / Selector */}
      {isStudentUser ? (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-3xl shadow-sm">
              {currentUser?.avatar || '🎒'}
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200 mb-1">
                <span>✓ Đã xác thực tài khoản học sinh</span>
              </div>
              <h2 className="text-xl font-black text-slate-900 leading-tight">
                {studentName || currentUser?.name || 'Học Sinh'}
              </h2>
              <p className="text-xs font-bold text-slate-500">
                Lớp: <span className="text-emerald-700 font-black">{selectedClassName}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowChangePasswordModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              title="Đổi mật khẩu tài khoản của em"
            >
              <span>🔑</span>
              <span>Đổi Mật Khẩu</span>
            </button>
            <span className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
              🎯 Đang hiển thị bài tập & kết quả của lớp {selectedClassName}
            </span>
          </div>
        </div>
      ) : (
        /* CHẾ ĐỘ XEM THỬ CỦA GIÁO VIÊN: Cho phép cô chuyển đổi xem thử từng lớp */
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border-2 border-brand-200 space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-800 text-[11px] font-bold border border-brand-200 mb-1">
                <span>👩‍🏫 Chế độ xem thử của Giáo viên</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                Đang Xem Giao Diện Học Sinh Lớp: <span className="text-brand-700 font-black">{selectedClassName}</span>
              </h3>
              <p className="text-xs text-slate-500">
                Hệ thống chỉ hiển thị các bài tập và bảng vinh danh thuộc về lớp đang chọn:
              </p>
            </div>

            {/* Các nút chọn lớp để cô giáo xem thử */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {classes.map(c => {
                const isSelected = c.name === selectedClassName;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectClass(c.name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-600 text-white shadow-md ring-2 ring-brand-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chọn học sinh trong lớp để cô giáo làm thử */}
          {students.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-500 whitespace-nowrap">Chọn học sinh trong {selectedClassName} để làm thử:</span>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {students.slice(0, 10).map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStudent(s.name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      s.name === studentName
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main 2-Column Responsive Layout:
          - Left Column (2/3 width = lg:col-span-8): Danh sách bài tập cập nhật theo ngày, sắp xếp mới nhất
          - Right Column (1/3 width = lg:col-span-4): BẢNG DANH SÁCH THÀNH TÍCH HỌC SINH CHĂM CHỈ ĐANG DẪN ĐẦU ĐIỂM CAO NHẤT
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 2/3 width (lg:col-span-8) - Assignments updated by date, newest first */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-brand-100 space-y-5">
            {/* Header & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base sm:text-lg font-black text-brand-900 uppercase tracking-tight flex items-center gap-2">
                  <span>📚</span> DANH SÁCH BÀI TẬP CẬP NHẬT THEO NGÀY ({assignments.length})
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Bài tập được sắp xếp theo thứ tự ngày mới nhất ở trên cùng • Chú ý thời hạn nộp bài nhé!
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start sm:self-auto text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterStatus === 'all'
                      ? 'bg-white text-brand-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({assignments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('pending')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterStatus === 'pending'
                      ? 'bg-white text-amber-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⏳ Chưa làm ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('completed')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterStatus === 'completed'
                      ? 'bg-white text-emerald-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ✅ Đã nộp ({completedCount})
                </button>
              </div>
            </div>

            {/* Assignment Groups by Date */}
            {groupedAssignments.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <div className="text-5xl">📖</div>
                <p className="font-bold text-base text-slate-600">
                  {filterStatus === 'pending'
                    ? 'Tuyệt vời! Con đã hoàn thành hết tất cả các bài tập hiện có.'
                    : filterStatus === 'completed'
                    ? 'Con chưa có bài tập nào đã hoàn thành.'
                    : `Hiện chưa có bài tập nào được giao cho ${selectedClassName}`}
                </p>
                <p className="text-xs text-slate-400">Thầy Cô sẽ sớm giao thêm bài mới. Hãy quay lại kiểm tra sau nhé!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedAssignments.map(([dateStr, items]) => {
                  const dateInfo = formatDateHeader(dateStr);
                  return (
                    <div key={dateStr} className="space-y-3">
                      {/* Date Group Header */}
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${dateInfo.isToday ? 'bg-emerald-500 animate-pulse' : 'bg-brand-500'}`} />
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                            <span>📅</span> {dateInfo.label}
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          {items.length} bài tập
                        </span>
                      </div>

                      {/* Assignment Cards in this date */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {items.map(assign => {
                          const submission = effectiveStudentName
                            ? getStudentSubmission(assign.id, effectiveStudentName, effectiveStudentId, selectedClassName, assign.topic, assign.title, effectiveEnglishName)
                            : undefined;
                          const hasSubmitted = !!submission;
                          const deadline = calculateDeadlineStatus(assign.dueDate, hasSubmitted);

                          return (
                            <div
                              key={assign.id}
                              className={`p-5 rounded-3xl border-2 transition-all flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md ${
                                hasSubmitted
                                  ? 'bg-emerald-50/40 border-emerald-200'
                                  : deadline.isDueSoon
                                  ? 'bg-amber-50/40 border-amber-300 ring-2 ring-amber-200'
                                  : deadline.isExpired
                                  ? 'bg-rose-50/20 border-rose-200'
                                  : 'bg-white border-slate-200 hover:border-brand-400'
                              }`}
                            >
                              <div>
                                {/* Status badge & dates */}
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {hasSubmitted ? (
                                      <>
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-sm">
                                          <span>✅</span> Đã nộp bài (Chỉ làm 1 lần)
                                        </span>
                                        {submission?.isLate && (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                            ⚠️ Nộp quá hạn (-2đ)
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className={`px-3 py-1 rounded-full text-xs font-black border ${deadline.badgeClass}`}>
                                        {deadline.status === 'due_soon' && '⏰ '}
                                        {deadline.status === 'expired' && '⛔ '}
                                        {deadline.status === 'active' && '⏳ '}
                                        {deadline.status === 'expired' ? 'Quá hạn (-2 điểm)' : deadline.label}
                                      </span>
                                    )}
                                    {assign.assignmentType === 'exam' && (
                                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 border border-indigo-300">
                                        📜 ĐỀ THI GỐC
                                      </span>
                                    )}
                                  </div>

                                  <span className="text-xs font-bold text-slate-500">
                                    {assign.targetClassId === 'ALL' || assign.targetClassName === 'Tất cả các lớp'
                                      ? '🌐 Toàn khối / Chung'
                                      : `🏫 ${selectedClassName}`}
                                  </span>
                                </div>

                                {/* Assignment Title */}
                                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-snug line-clamp-2">
                                  {assign.title}
                                </h4>

                                {/* Deadline countdown */}
                                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                  <span>⏱️ Hạn nộp:</span>
                                  <span className={deadline.isDueSoon ? 'text-amber-700 font-black' : deadline.isExpired ? 'text-rose-600 font-black' : 'text-slate-700'}>
                                    {new Date(assign.dueDate).toLocaleString('vi-VN')} ({deadline.remainingText})
                                  </span>
                                </div>

                                {/* Overdue penalty notice for pending submissions */}
                                {!hasSubmitted && deadline.isExpired && (
                                  <div className="mt-2 p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-1.5">
                                    <span>⚠️</span>
                                    <span>Quá hạn nộp: Con vẫn được làm bài nhưng hệ thống sẽ trừ 2 điểm khi nộp bài.</span>
                                  </div>
                                )}

                                {/* Teacher note */}
                                {assign.teacherNote && (
                                  <p className="mt-2 text-xs text-slate-500 italic bg-white/70 p-2.5 rounded-xl border border-slate-100 line-clamp-2">
                                    💬 <strong>Lời dặn:</strong> "{assign.teacherNote}"
                                  </p>
                                )}
                              </div>

                              {/* Bottom Action / Score */}
                              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                                {hasSubmitted ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">🏆</span>
                                    <div>
                                      <p className="text-xs font-bold text-emerald-800">
                                        Điểm của em: <span className="text-base font-black text-emerald-700">{submission.score.toFixed(1)}/10</span>
                                      </p>
                                      {submission.isLate && submission.rawScore !== undefined && (
                                        <p className="text-[10px] text-rose-600 font-bold">
                                          (Làm được: {submission.rawScore.toFixed(1)} - trừ 2đ quá hạn)
                                        </p>
                                      )}
                                      <p className="text-[10px] text-slate-500 font-semibold truncate max-w-[140px]">{submission.evaluation.text}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs font-bold text-slate-400">
                                    Chưa làm bài
                                  </span>
                                )}

                                <button
                                  onClick={() => {
                                    const activeName = (effectiveStudentName || studentName || '').trim();
                                    if (!activeName) {
                                      alert('Em ơi, vui lòng chọn tên của em ở khung phía trên trước khi làm bài nhé!');
                                      return;
                                    }
                                    if (!studentName && activeName) {
                                      setStudentName(activeName);
                                    }
                                    setSelectedAssignment(assign);
                                  }}
                                  className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5 ${
                                    hasSubmitted
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                      : deadline.isExpired
                                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                      : deadline.isDueSoon
                                      ? 'bg-amber-500 hover:bg-amber-600 text-white animate-bounce'
                                      : 'bg-brand-500 hover:bg-brand-600 text-white'
                                  }`}
                                >
                                  {hasSubmitted
                                    ? '🔒 Xem lại bài (Đã nộp)'
                                    : deadline.isExpired
                                    ? '🚀 Làm bài (Quá hạn -2đ)'
                                    : '🚀 Làm bài ngay'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: 1/3 width (lg:col-span-4) - Leaderboard of Hardworking Top Students */}
        <div className="lg:col-span-4 space-y-4">
          <StudentLeaderboardHonor
            initialClassId={selectedClassName}
            compact={true}
            lockClass={true}
            hideClassFilter={true}
            title={selectedClassName ? `BẢNG VÀNG THÀNH TÍCH - ${selectedClassName.toUpperCase()}` : undefined}
            subtitle={selectedClassName ? `Tuyên dương các em nỗ lực làm bài tập về nhà chăm chỉ và đạt điểm số cao nhất ${selectedClassName}!` : undefined}
          />
        </div>
      </div>

      {/* Name Selection Modal for Direct Link Entry */}
      {selectedAssignment && !studentName && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border-4 border-brand-200 space-y-5 animate-scale-up">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
                🎒
              </div>
              <h3 className="text-xl font-black text-brand-900">
                CHÀO MỪNG EM LÀM BÀI!
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Em đang mở bài tập: <strong className="text-brand-700">{selectedAssignment.title}</strong>
              </p>
              <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 font-bold">
                ⚠️ Lưu ý: Link cô giao mỗi học sinh chỉ được nộp bài 1 lần duy nhất!
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Chọn tên của em trong danh sách ({selectedClassName}):
              </label>
              <div className="max-h-52 overflow-y-auto space-y-1.5 p-1 border rounded-xl bg-slate-50/50">
                {students.map(std => (
                  <button
                    key={std.id}
                    onClick={() => handleSelectStudent(std.name)}
                    className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold bg-white hover:bg-brand-500 hover:text-white border border-slate-200 transition-all flex items-center justify-between group shadow-sm"
                  >
                    <span>{std.name}</span>
                    <span className="text-xs opacity-0 group-hover:opacity-100">Bắt đầu ➡️</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100">
                <form onSubmit={handleCustomNameSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Hoặc nhập họ tên của em..."
                    value={customNameInput}
                    onChange={(e) => setCustomNameInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-brand-400 outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shrink-0"
                  >
                    Vào bài
                  </button>
                </form>
              </div>
            </div>

            <div className="pt-1 text-center">
              <button
                onClick={() => setSelectedAssignment(null)}
                className="text-xs text-slate-400 hover:text-slate-600 underline font-medium"
              >
                Quay lại danh sách bài tập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Đổi Mật Khẩu Cho Học Sinh */}
      <StudentChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        initialClassName={selectedClassName || currentUser?.className}
        initialStudentName={studentName || currentUser?.name}
      />
    </div>
  );
};
