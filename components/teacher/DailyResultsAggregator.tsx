import React, { useState, useEffect, useMemo } from 'react';
import { Submission, DailySummary, Student } from '../../types';
import {
  getClasses,
  getStudents,
  getAssignments,
  getDailySummary,
  getTodayString,
  getSubmissions,
  subscribeToSync,
  isStudentMatch,
  normalizeStudentName,
  deleteSubmission
} from '../../services/assignmentService';

interface StudentResultItem {
  id: string;
  studentId?: string;
  studentName: string;
  englishName?: string;
  className: string;
  phone?: string;
  hasSubmitted: boolean;
  submission?: Submission;
  attemptCount?: number;
  allSubmissions?: Submission[];
}

export const DailyResultsAggregator: React.FC = () => {
  const [selectedDate, setSelectedDateState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_aggregator_date') || 'ALL';
    }
    return 'ALL';
  });
  const setSelectedDate = (d: string) => {
    setSelectedDateState(d);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_aggregator_date', d);
    }
  };

  const [selectedClassId, setSelectedClassIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_aggregator_class_id') || 'ALL';
    }
    return 'ALL';
  });
  const setSelectedClassId = (c: string) => {
    setSelectedClassIdState(c);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_aggregator_class_id', c);
    }
  };

  const [selectedAssignmentId, setSelectedAssignmentIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_aggregator_assign_id') || 'ALL';
    }
    return 'ALL';
  });
  const setSelectedAssignmentId = (a: string) => {
    setSelectedAssignmentIdState(a);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_aggregator_assign_id', a);
    }
  };

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [classes, setClasses] = useState(getClasses());
  const [assignments, setAssignments] = useState(getAssignments());
  const [searchStudent, setSearchStudent] = useState('');
  const [viewDetailSubmission, setViewDetailSubmission] = useState<Submission | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<StudentResultItem | null>(null);

  // Filter & Zalo states
  const [submissionStatusFilter, setSubmissionStatusFilterState] = useState<'ALL' | 'NOT_DONE' | 'DONE'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_teacher_aggregator_status_filter');
      if (saved === 'ALL' || saved === 'NOT_DONE' || saved === 'DONE') return saved;
    }
    return 'ALL';
  });
  const setSubmissionStatusFilter = (s: 'ALL' | 'NOT_DONE' | 'DONE') => {
    setSubmissionStatusFilterState(s);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_aggregator_status_filter', s);
    }
  };
  const [copiedZaloMsg, setCopiedZaloMsg] = useState(false);

  const refresh = () => {
    setClasses(getClasses());
    setAssignments(getAssignments());
    const data = getDailySummary(selectedDate, selectedClassId, selectedAssignmentId);
    setSummary(data);
  };

  const handleAllowRetake = (submission: Submission) => {
    if (confirm(`Cô có chắc chắn muốn cho phép học sinh "${submission.studentName}" làm lại bài tập "${submission.assignmentTitle || submission.topic}" không?\n\nSau khi cho phép, hệ thống sẽ mở khóa để học sinh có thể mở lại link và nộp bài làm mới.`)) {
      deleteSubmission(submission.id);
      setViewDetailSubmission(null);
      setSelectedDetailItem(null);
      refresh();
      alert(`Đã mở quyền làm lại thành công cho học sinh "${submission.studentName}"! Em có thể vào làm và nộp lại bài ngay bây giờ.`);
    }
  };

  const handleDeleteStudentSubmission = handleAllowRetake;

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToSync(() => {
      refresh();
    });
    return () => unsubscribe();
  }, [selectedDate, selectedClassId, selectedAssignmentId]);

  const setDateOffset = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${day}`);
  };

  // Helper to normalize class names for flexible matching (e.g., "8A1" <-> "Lớp 8A1")
  const normClassName = (str?: string) =>
    (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();

  // Selected class students (or all students if ALL classes)
  const targetClassObj = classes.find(c => c.name === selectedClassId || c.id === selectedClassId);
  const selectedAssignObj = assignments.find(a => a.id === selectedAssignmentId);

  // Scoped students: If a specific assignment is selected and it belongs to a specific class, scope to that class!
  let effectiveStudents: Student[] = [];
  if (selectedClassId !== 'ALL') {
    effectiveStudents = getStudents(targetClassObj?.id || selectedClassId);
  } else if (selectedAssignObj && selectedAssignObj.targetClassId && selectedAssignObj.targetClassId !== 'ALL') {
    effectiveStudents = getStudents(selectedAssignObj.targetClassId);
  } else if (selectedAssignObj && selectedAssignObj.targetClassName && selectedAssignObj.targetClassName !== 'Tất cả các lớp') {
    effectiveStudents = getStudents(selectedAssignObj.targetClassName);
  } else {
    effectiveStudents = getStudents();
  }

  // Smart Filter: Filter assignments belonging to the selected class
  const isAssignmentForClass = (a: any): boolean => {
    if (!selectedClassId || selectedClassId === 'ALL') return true;
    if (a.targetClassId === 'ALL' || a.targetClassName === 'Tất cả các lớp') return true;

    if (targetClassObj) {
      if (a.targetClassId === targetClassObj.id) return true;
      if (a.targetClassName === targetClassObj.name) return true;
      if (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes(targetClassObj.id) || a.targetClassIds.includes('ALL'))) return true;
      if (Array.isArray(a.targetClassNames) && a.targetClassNames.some((cn: string) => normClassName(cn) === normClassName(targetClassObj.name))) return true;
      if (normClassName(a.targetClassName) === normClassName(targetClassObj.name)) return true;
      if (a.targetClassName && normClassName(a.targetClassName).includes(normClassName(targetClassObj.name))) return true;
    }

    if (a.targetClassId === selectedClassId) return true;
    if (normClassName(a.targetClassName) === normClassName(selectedClassId)) return true;
    if (a.targetClassName && normClassName(a.targetClassName).includes(normClassName(selectedClassId))) return true;

    return false;
  };

  const classAssignments = assignments.filter(isAssignmentForClass);

  // Handle class filter change with auto-reset for assignment if not in class
  const handleClassFilterChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    if (newClassId === 'ALL') return;

    const targetObj = classes.find(c => c.name === newClassId || c.id === newClassId);
    const validAssigns = assignments.filter(a => {
      if (a.targetClassId === 'ALL' || a.targetClassName === 'Tất cả các lớp') return true;
      if (targetObj) {
        if (a.targetClassId === targetObj.id || a.targetClassName === targetObj.name) return true;
        if (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes(targetObj.id) || a.targetClassIds.includes('ALL'))) return true;
        if (Array.isArray(a.targetClassNames) && a.targetClassNames.some((cn: string) => normClassName(cn) === normClassName(targetObj.name))) return true;
        if (normClassName(a.targetClassName) === normClassName(targetObj.name)) return true;
      }
      if (a.targetClassId === newClassId || normClassName(a.targetClassName) === normClassName(newClassId)) return true;
      return false;
    });

    if (selectedAssignmentId !== 'ALL' && !validAssigns.some(a => a.id === selectedAssignmentId)) {
      setSelectedAssignmentId('ALL');
    }
  };

  // Submissions count breakdown by date (scoped to selected class / assignment)
  const allSubmissions = useMemo(() => getSubmissions(), [summary]);
  const todayStr = getTodayString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

  const scopedSubmissions = useMemo(() => {
    let list = (allSubmissions || []).filter(s => Boolean(s));
    if (selectedAssignmentId !== 'ALL') {
      list = list.filter(s => s && s.assignmentId === selectedAssignmentId);
    }
    if (selectedClassId !== 'ALL') {
      const targetClassNameNorm = targetClassObj ? normClassName(targetClassObj.name) : normClassName(selectedClassId);
      list = list.filter(s => {
        if (!s) return false;
        if (effectiveStudents.some(std => isStudentMatch(std, s))) return true;
        if (s.studentClass && normClassName(s.studentClass) === targetClassNameNorm) return true;
        return false;
      });
    }
    return list;
  }, [allSubmissions, selectedAssignmentId, selectedClassId, targetClassObj, effectiveStudents]);

  const allCount = scopedSubmissions.length;
  const todayCount = useMemo(() => scopedSubmissions.filter(s => s.submittedAt && s.submittedAt.startsWith(todayStr)).length, [scopedSubmissions, todayStr]);
  const yesterdayCount = useMemo(() => scopedSubmissions.filter(s => s.submittedAt && s.submittedAt.startsWith(yesterdayStr)).length, [scopedSubmissions, yesterdayStr]);

  // Build unified roster
  const rosterItems: StudentResultItem[] = [];
  const matchedSubIds = new Set<string>();

  const isClassSpecific = selectedClassId !== 'ALL' || (selectedAssignObj && selectedAssignObj.targetClassName && selectedAssignObj.targetClassName !== 'Tất cả các lớp');

  if (isClassSpecific) {
    // 1. Duyệt qua học sinh chính thức của lớp
    effectiveStudents.forEach(std => {
      // Tìm tất cả bài nộp của học sinh này trong ngày / bài tập đang chọn
      const stdSubs = (summary?.submissions || []).filter(s =>
        !matchedSubIds.has(s.id) && isStudentMatch(std, s)
      );

      if (stdSubs.length > 0) {
        stdSubs.forEach(s => matchedSubIds.add(s.id));
        const bestSub = stdSubs.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), stdSubs[0]);

        rosterItems.push({
          id: `std_${std.id}`,
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName,
          className: targetClassObj?.name || std.className || bestSub.studentClass,
          phone: std.phone,
          hasSubmitted: true,
          submission: bestSub,
          attemptCount: stdSubs.length,
          allSubmissions: stdSubs
        });
      } else {
        rosterItems.push({
          id: `std_${std.id}`,
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName,
          className: targetClassObj?.name || std.className || (selectedAssignObj ? selectedAssignObj.targetClassName : undefined),
          phone: std.phone,
          hasSubmitted: false
        });
      }
    });

    // 2. TẬN GỐC KHÔNG BỎ SÓT: Bổ sung bất kỳ bài nộp nào thuộc lớp này mà chưa có trong danh sách chính thức
    const targetNorm = normClassName(targetClassObj?.name || selectedClassId || selectedAssignObj?.targetClassName);
    const remainingClassSubs = (summary?.submissions || []).filter(s =>
      s && !matchedSubIds.has(s.id) && 
      (normClassName(s.studentClass) === targetNorm || s.studentClass === selectedClassId)
    );
    const guestMap = new Map<string, Submission[]>();
    remainingClassSubs.forEach(s => {
      if (!s) return;
      const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
      const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'guest');
      if (!guestMap.has(key)) guestMap.set(key, []);
      guestMap.get(key)!.push(s);
    });
    guestMap.forEach((subs) => {
      if (!subs || subs.length === 0) return;
      subs.forEach(s => { if (s && s.id) matchedSubIds.add(s.id); });
      const bestSub = subs.reduce((prev, curr) => ((curr?.score || 0) > (prev?.score || 0) ? curr : prev), subs[0]);
      if (!bestSub) return;
      rosterItems.push({
        id: `sub_${bestSub.id}`,
        studentId: bestSub.studentId,
        studentName: bestSub.studentName || 'Học Sinh',
        className: bestSub.studentClass || targetClassObj?.name || selectedClassId,
        hasSubmitted: true,
        submission: bestSub,
        attemptCount: subs.length,
        allSubmissions: subs
      });
    });
  } else {
    // TẤT CẢ CÁC LỚP:
    // 1. Duyệt qua tất cả học sinh chính thức
    effectiveStudents.forEach(std => {
      const stdSubs = (summary?.submissions || []).filter(s =>
        s && !matchedSubIds.has(s.id) && isStudentMatch(std, s)
      );

      if (stdSubs.length > 0) {
        stdSubs.forEach(s => { if (s && s.id) matchedSubIds.add(s.id); });
        const bestSub = stdSubs.reduce((prev, curr) => ((curr?.score || 0) > (prev?.score || 0) ? curr : prev), stdSubs[0]);
        rosterItems.push({
          id: `std_${std.id}`,
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName,
          className: std.className || bestSub?.studentClass,
          phone: std.phone,
          hasSubmitted: true,
          submission: bestSub,
          attemptCount: stdSubs.length,
          allSubmissions: stdSubs
        });
      } else {
        rosterItems.push({
          id: `std_${std.id}`,
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName,
          className: std.className,
          phone: std.phone,
          hasSubmitted: false
        });
      }
    });

    // 2. Các bài nộp chưa thuộc học sinh nào: gom nhóm theo tên để không tạo hàng trùng
    const remainingSubs = (summary?.submissions || []).filter(s => s && !matchedSubIds.has(s.id));
    const guestMap = new Map<string, Submission[]>();
    remainingSubs.forEach(s => {
      if (!s) return;
      const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh Vãng Lai';
      const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'guest');
      if (!guestMap.has(key)) guestMap.set(key, []);
      guestMap.get(key)!.push(s);
    });

    guestMap.forEach((subs) => {
      if (!subs || subs.length === 0) return;
      subs.forEach(s => { if (s && s.id) matchedSubIds.add(s.id); });
      const bestSub = subs.reduce((prev, curr) => ((curr?.score || 0) > (prev?.score || 0) ? curr : prev), subs[0]);
      if (!bestSub) return;
      rosterItems.push({
        id: `guest_${bestSub.id}`,
        studentId: bestSub.studentId,
        studentName: bestSub.studentName || 'Học Sinh',
        className: bestSub.studentClass || 'Chưa phân lớp',
        hasSubmitted: true,
        submission: bestSub,
        attemptCount: subs.length,
        allSubmissions: subs
      });
    });
  }

  const notDoneList = rosterItems.filter(item => !item.hasSubmitted);
  const doneList = rosterItems.filter(item => item.hasSubmitted);

  const filteredRoster = rosterItems.filter(item => {
    const matchSearch =
      item.studentName.toLowerCase().includes(searchStudent.toLowerCase()) ||
      item.className.toLowerCase().includes(searchStudent.toLowerCase()) ||
      (item.englishName && item.englishName.toLowerCase().includes(searchStudent.toLowerCase()));
    if (!matchSearch) return false;

    if (submissionStatusFilter === 'NOT_DONE') return !item.hasSubmitted;
    if (submissionStatusFilter === 'DONE') return item.hasSubmitted;
    return true;
  });

  // Copy Zalo list for not done
  const handleCopyNotDoneZalo = () => {
    if (notDoneList.length === 0) {
      alert('Tuyệt vời! Tất cả học sinh đã nộp bài tập.');
      return;
    }
    const className = targetClassObj ? targetClassObj.name : (selectedClassId !== 'ALL' ? selectedClassId : 'các lớp');
    const assignObj = assignments.find(a => a.id === selectedAssignmentId);
    const assignTitle = assignObj ? (assignObj.title || assignObj.topic) : 'Bài tập tiếng Anh';

    let text = `📢 THÔNG BÁO NHẮC NHỞ NỘP BÀI TẬP\n`;
    text += `🏫 Lớp: ${className}\n`;
    text += `📝 Bài tập: ${assignTitle}\n`;
    text += `📅 Ngày: ${selectedDate === 'ALL' ? 'Tất cả các ngày' : selectedDate}\n\n`;
    text += `Danh sách các bạn chưa nộp bài (${notDoneList.length} bạn):\n`;
    notDoneList.forEach((item, idx) => {
      text += `${idx + 1}. ${item.studentName} ${item.englishName ? `(${item.englishName})` : ''}\n`;
    });
    text += `\nKính nhờ quý phụ huynh nhắc nhở các em vào làm bài và nộp bài giúp cô nhé! Cô cảm ơn quý phụ huynh! ❤️`;

    navigator.clipboard.writeText(text);
    setCopiedZaloMsg(true);
    setTimeout(() => setCopiedZaloMsg(false), 3000);
  };

  const handleCopyIndividualReminder = (item: StudentResultItem) => {
    const assignObj = assignments.find(a => a.id === selectedAssignmentId);
    const assignTitle = assignObj ? (assignObj.title || assignObj.topic) : 'Bài tập tiếng Anh';
    let text = `Dạ Legend X5 xin gửi lời chào đến phụ huynh em ${item.studentName}${item.englishName ? ` (${item.englishName})` : ''} ạ!\n`;
    text += `Hiện tại con chưa hoàn thành bài tập "${assignTitle}". Nhờ phụ huynh nhắc con mở app làm bài và nộp bài sớm giúp cô nhé! Cô cảm ơn phụ huynh nhiều ạ! ❤️`;
    navigator.clipboard.writeText(text);
    alert(`Đã copy tin nhắn nhắc nhở cho phụ huynh em ${item.studentName}!`);
  };

  const exportCSV = () => {
    if (filteredRoster.length === 0) {
      alert('Chưa có dữ liệu danh sách để xuất file.');
      return;
    }

    const headers = ['STT', 'Họ Tên Học Sinh', 'E.NAME', 'Lớp', 'Trạng Thái', 'Bài Tập', 'Thời Gian Nộp', 'Điểm Số (/10)', 'Số Câu Đúng (/50)', 'Xếp Loại'];
    const rows = filteredRoster.map((item, idx) => {
      const s = item.submission;
      if (s) {
        return [
          idx + 1,
          `"${item.studentName}"`,
          `"${item.englishName || ''}"`,
          `"${item.className}"`,
          '"Đã nộp bài"',
          `"${s.assignmentTitle || s.topic}"`,
          `"${new Date(s.submittedAt).toLocaleString('vi-VN')}"`,
          s.score.toFixed(1),
          `${s.totalCorrect}/${s.totalQuestions}`,
          `"${s.evaluation?.text || 'Đã nộp'}"`
        ];
      }
      return [
        idx + 1,
        `"${item.studentName}"`,
        `"${item.englishName || ''}"`,
        `"${item.className}"`,
        '"Chưa nộp bài"',
        `"${selectedAssignmentId !== 'ALL' ? (assignments.find(a => a.id === selectedAssignmentId)?.title || 'Bài tập') : 'Chưa nộp'}"`,
        '"—"',
        '"—"',
        '"—"',
        '"Chưa làm bài"'
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Ket_Qua_Hoc_Tap_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Filters Card */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">📊</span>
              <h2 className="text-xl sm:text-2xl font-black text-brand-900">Tổng Hợp Kết Quả Học Tập Theo Ngày</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Theo dõi số bài nộp, điểm số trung bình và chi tiết kết quả của từng học sinh.
            </p>
          </div>

          <button
            onClick={exportCSV}
            disabled={!summary || summary.submissions.length === 0}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 shrink-0 self-start md:self-auto"
          >
            <span>📥</span> Xuất File Báo Cáo (CSV/Excel)
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Date Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-600">📅 Ngày nộp bài</label>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                selectedDate === 'ALL' ? 'bg-emerald-100 text-emerald-800' : 'bg-brand-100 text-brand-800'
              }`}>
                {selectedDate === 'ALL' ? '🌟 Tất cả các ngày' : selectedDate}
              </span>
            </div>
            <input
              type="date"
              value={selectedDate === 'ALL' ? '' : selectedDate}
              onChange={e => setSelectedDate(e.target.value || 'ALL')}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-slate-50"
              title={selectedDate === 'ALL' ? 'Đang chọn xem tất cả các ngày' : `Ngày: ${selectedDate}`}
            />
            <div className="flex gap-1 mt-1.5">
              <button
                type="button"
                onClick={() => setSelectedDate('ALL')}
                className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  selectedDate === 'ALL'
                    ? 'bg-brand-500 text-white shadow-sm ring-2 ring-brand-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Hiển thị bài nộp của học sinh từ tất cả các ngày"
              >
                <span>🌟 Tất cả</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  selectedDate === 'ALL' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {allCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDateOffset(0)}
                className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  selectedDate === todayStr
                    ? 'bg-brand-500 text-white shadow-sm ring-2 ring-brand-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Chỉ hiển thị bài nộp hôm nay"
              >
                <span>Hôm nay</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  selectedDate === todayStr ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {todayCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDateOffset(-1)}
                className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  selectedDate === yesterdayStr
                    ? 'bg-brand-500 text-white shadow-sm ring-2 ring-brand-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Chỉ hiển thị bài nộp hôm qua"
              >
                <span>Hôm qua</span>
                <span className={`text-[10px] px-1 rounded-full ${
                  selectedDate === yesterdayStr ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {yesterdayCount}
                </span>
              </button>
            </div>
          </div>

          {/* Class Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">🏫 Chọn Lớp Học</label>
            <select
              value={selectedClassId}
              onChange={e => handleClassFilterChange(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-slate-50"
            >
              <option value="ALL">-- Tất cả các lớp --</option>
              {classes.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Assignment Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">📝 Chọn Bài Tập</label>
            <select
              value={selectedAssignmentId}
              onChange={e => {
                const val = e.target.value;
                setSelectedAssignmentId(val);
                if (val !== 'ALL') {
                  setSelectedDate('ALL');
                  const assign = assignments.find(a => a.id === val);
                  if (assign) {
                    if (assign.targetClassId && assign.targetClassId !== 'ALL') {
                      const cls = classes.find(c => c.id === assign.targetClassId || normClassName(c.name) === normClassName(assign.targetClassName));
                      if (cls) setSelectedClassId(cls.name);
                    } else if (assign.targetClassName && assign.targetClassName !== 'Tất cả các lớp') {
                      const cls = classes.find(c => normClassName(c.name) === normClassName(assign.targetClassName));
                      if (cls) setSelectedClassId(cls.name);
                    }
                  }
                }
              }}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-slate-50"
            >
              <option value="ALL">
                {selectedClassId !== 'ALL' && targetClassObj
                  ? `-- Tất cả bài tập của ${targetClassObj.name} (${classAssignments.length}) --`
                  : '-- Tất cả bài tập --'}
              </option>
              {classAssignments.map(a => (
                <option key={a.id} value={a.id}>{a.title} ({a.assignedDate})</option>
              ))}
            </select>
          </div>

          {/* Search student */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">🔍 Tìm học sinh</label>
            <input
              type="text"
              value={searchStudent}
              onChange={e => setSearchStudent(e.target.value)}
              placeholder="Nhập tên học sinh..."
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none bg-slate-50"
            />
          </div>
        </div>
      </div>

      {/* Date Warning Banner: When filtered by a specific date has 0 submissions but other dates have submissions */}
      {selectedDate !== 'ALL' && allCount > 0 && (!summary || summary.submissions.length === 0) && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💡</span>
            <div>
              <p className="font-black text-sm sm:text-base">
                Ngày {selectedDate} chưa có bài nộp nào, nhưng đang có {allCount} bài đã nộp ở các ngày khác!
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Chuyển sang chế độ "Tất cả các ngày" để không bị bỏ sót bài nộp của học sinh.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate('ALL')}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all shrink-0 cursor-pointer flex items-center gap-2"
          >
            <span>🌟</span>
            <span>Xem Tất Cả Các Ngày ({allCount} bài)</span>
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div 
            onClick={() => setSubmissionStatusFilter('ALL')}
            className={`bg-white rounded-2xl p-5 shadow-lg border transition-all cursor-pointer hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-4 ${
              submissionStatusFilter === 'ALL' ? 'ring-2 ring-brand-500 border-brand-300' : 'border-brand-100'
            }`}
            title="Bấm để hiển thị tất cả học sinh"
          >
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center text-2xl shrink-0">
              👥
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-brand-900">{rosterItems.length}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sĩ số danh sách</p>
            </div>
          </div>

          <div 
            onClick={() => setSubmissionStatusFilter('DONE')}
            className={`bg-white rounded-2xl p-5 shadow-lg border transition-all cursor-pointer hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-4 ${
              submissionStatusFilter === 'DONE' ? 'ring-2 ring-emerald-500 border-emerald-300' : 'border-emerald-100'
            }`}
            title="Bấm để lọc danh sách các bạn đã nộp bài"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl shrink-0">
              ✅
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl sm:text-3xl font-black text-emerald-600">{doneList.length}</p>
                <span className="text-xs font-bold text-emerald-600">({rosterItems.length > 0 ? Math.round((doneList.length / rosterItems.length) * 100) : 0}%)</span>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đã nộp bài</p>
            </div>
          </div>

          <div 
            onClick={() => setSubmissionStatusFilter('NOT_DONE')}
            className={`bg-white rounded-2xl p-5 shadow-lg border transition-all cursor-pointer hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-4 ${
              submissionStatusFilter === 'NOT_DONE' ? 'ring-2 ring-rose-500 border-rose-300' : 'border-rose-100'
            }`}
            title="Bấm để lọc danh sách các bạn chưa nộp bài"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl shrink-0">
              ⚠️
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-rose-600">{notDoneList.length}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chưa làm bài</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-lg border border-blue-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl shrink-0">
              📈
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-blue-600">
                {summary.totalSubmitted > 0 ? summary.averageScore.toFixed(1) : '—'}
                <span className="text-xs font-normal text-slate-400">/10</span>
              </p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Điểm trung bình</p>
            </div>
          </div>
        </div>
      )}

      {/* Submissions & Roster Table */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h3 className="text-base font-black text-brand-900 uppercase tracking-tight">
              DANH SÁCH THEO LỚP: {selectedClassId === 'ALL' ? 'Tất Cả Các Lớp' : (targetClassObj ? targetClassObj.name : selectedClassId)} ({filteredRoster.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSubmissionStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  submissionStatusFilter === 'ALL'
                    ? 'bg-white text-brand-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({rosterItems.length})
              </button>
              <button
                type="button"
                onClick={() => setSubmissionStatusFilter('NOT_DONE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  submissionStatusFilter === 'NOT_DONE'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <span>⚠️ Chưa làm bài</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  submissionStatusFilter === 'NOT_DONE' ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-900'
                }`}>
                  {notDoneList.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSubmissionStatusFilter('DONE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  submissionStatusFilter === 'DONE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span>✅ Đã nộp</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  submissionStatusFilter === 'DONE' ? 'bg-white/20 text-white' : 'bg-emerald-200 text-emerald-900'
                }`}>
                  {doneList.length}
                </span>
              </button>
            </div>

            {/* Quick Copy Zalo Button */}
            {notDoneList.length > 0 && (
              <button
                type="button"
                onClick={handleCopyNotDoneZalo}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                title="Sao chép danh sách các bạn chưa làm để dán gửi Zalo phụ huynh"
              >
                <span>📋</span>
                <span>{copiedZaloMsg ? '✓ Đã Copy Danh Sách!' : 'Copy DS Chưa Nộp (Zalo)'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Banner */}
        {submissionStatusFilter !== 'ALL' && (
          <div className={`p-3 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold ${
            submissionStatusFilter === 'NOT_DONE' 
              ? 'bg-rose-50 border border-rose-200 text-rose-800' 
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{submissionStatusFilter === 'NOT_DONE' ? '⚠️' : '✅'}</span>
              <span>
                Đang lọc: Chỉ hiển thị {submissionStatusFilter === 'NOT_DONE' ? `danh sách ${notDoneList.length} bạn CHƯA LÀM BÀI` : `danh sách ${doneList.length} bạn ĐÃ NỘP BÀI`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSubmissionStatusFilter('ALL')}
              className="px-3 py-1 bg-white hover:bg-slate-100 rounded-xl shadow-xs text-slate-700 border border-slate-200 transition-all cursor-pointer font-bold"
            >
              ✕ Bỏ lọc (Xem tất cả)
            </button>
          </div>
        )}

        {filteredRoster.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <div className="text-4xl mb-2">
              {submissionStatusFilter === 'NOT_DONE' ? '🎉' : '📭'}
            </div>
            <p className="font-bold text-base">
              {submissionStatusFilter === 'NOT_DONE'
                ? 'Tuyệt vời! Tất cả học sinh trong bộ lọc đã nộp bài đầy đủ!'
                : 'Chưa có dữ liệu nào phù hợp với bộ lọc đã chọn'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {submissionStatusFilter !== 'ALL' ? (
                <button
                  onClick={() => setSubmissionStatusFilter('ALL')}
                  className="text-brand-600 hover:underline font-bold"
                >
                  Bấm vào đây để xem tất cả học sinh
                </button>
              ) : (
                'Khi học sinh làm bài xong và nộp, kết quả sẽ xuất hiện tự động tại đây!'
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-3">STT</th>
                  <th className="py-3 px-3">Học Sinh</th>
                  <th className="py-3 px-3">E.NAME</th>
                  <th className="py-3 px-3">Lớp</th>
                  <th className="py-3 px-3">Trạng Thái</th>
                  <th className="py-3 px-3">Thời Gian Nộp</th>
                  <th className="py-3 px-3 text-center">Số Câu Đúng</th>
                  <th className="py-3 px-3 text-center">Điểm Số</th>
                  <th className="py-3 px-3 text-center">Đánh Giá</th>
                  <th className="py-3 px-3 text-right">Chi Tiết / Nhắc Nhở</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRoster.map((item, idx) => {
                  const s = item.submission;
                  const isHigh = s ? s.score >= 8.5 : false;
                  const isExemplary = s ? s.score >= 9.0 : false;
                  return (
                    <tr
                      key={item.id || idx}
                      className={`transition-colors ${
                        !item.hasSubmitted
                          ? 'bg-rose-50/20 hover:bg-rose-50/40'
                          : isExemplary
                          ? 'bg-amber-50/40 hover:bg-amber-50/70 font-semibold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3.5 px-3 text-xs text-slate-400 font-bold">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          {isExemplary && <span title="Điểm xuất sắc">⭐</span>}
                          <span className={`font-black text-sm ${isExemplary ? 'text-amber-950' : 'text-slate-800'}`}>
                            {item.studentName}
                          </span>
                          {item.attemptCount && item.attemptCount > 1 && (
                            <span
                              title={`Đã làm bài ${item.attemptCount} lần (hiển thị điểm cao nhất)`}
                              className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200"
                            >
                              {item.attemptCount} lần làm
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-bold text-emerald-800">
                        {item.englishName || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs font-bold">
                          {item.className}
                        </span>
                      </td>
                      {/* Trạng Thái */}
                      <td className="py-3.5 px-3">
                        {item.hasSubmitted ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs w-fit">
                              <span>✅</span> Đã nộp
                            </span>
                            {selectedAssignmentId === 'ALL' && s && (
                              <span className="text-[10px] text-slate-500 font-medium truncate max-w-[160px]" title={s.assignmentTitle || s.topic}>
                                📝 {s.assignmentTitle || s.topic}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
                            <span>⚠️</span> Chưa làm
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-500">
                        {s ? (
                          <>
                            {new Date(s.submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {new Date(s.submittedAt).toLocaleDateString('vi-VN')}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center text-xs font-bold text-slate-600">
                        {s ? `${s.totalCorrect}/${s.totalQuestions}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {s ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className={`inline-block px-3 py-1 rounded-full font-black text-sm ${
                              isExemplary
                                ? 'bg-amber-400 text-amber-950 shadow-sm'
                                : isHigh
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.score >= 5
                                ? 'bg-blue-50 text-blue-800'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {s.score.toFixed(1)}
                            </span>
                            {s.isLate && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200 cursor-help"
                                title={`Nộp quá hạn: Điểm làm bài ${s.rawScore !== undefined ? s.rawScore.toFixed(1) : s.score.toFixed(1)}/10, bị trừ 2 điểm quá hạn`}
                              >
                                Quá hạn (-2đ)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 font-bold text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {s ? (
                          <span className="text-xs font-bold text-slate-700">
                            {s.evaluation?.emoji || '⭐'} {s.evaluation?.text || (s.score >= 5 ? 'Đạt' : 'Cố gắng')}
                          </span>
                        ) : (
                          <span className="text-xs text-rose-500 font-bold">Chưa có điểm</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {s ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedDetailItem(item);
                                setViewDetailSubmission(s);
                              }}
                              className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all cursor-pointer"
                            >
                              👁️ Xem bài
                            </button>
                            <button
                              onClick={() => handleAllowRetake(s)}
                              className="px-2 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                              title={`Cho phép em ${item.studentName} làm lại bài này`}
                            >
                              <span>🔄</span> Cho làm lại
                            </button>
                          </div>
                        ) : item.phone ? (
                          <button
                            onClick={() => handleCopyIndividualReminder(item)}
                            className="px-2.5 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-all shadow-2xs"
                            title={`Nhắc phụ huynh em ${item.studentName}`}
                          >
                            📱 Nhắc Zalo
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      {viewDetailSubmission && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-brand-900">Chi Tiết Bài Nộp: {viewDetailSubmission.studentName}</h3>
                <p className="text-xs text-slate-500 font-bold">{viewDetailSubmission.studentClass} • {viewDetailSubmission.assignmentTitle || viewDetailSubmission.topic}</p>
              </div>
              <button onClick={() => { setViewDetailSubmission(null); setSelectedDetailItem(null); }} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              {/* Multi-attempt selector if student submitted multiple times */}
              {selectedDetailItem?.allSubmissions && selectedDetailItem.allSubmissions.length > 1 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 space-y-1.5">
                  <p className="text-xs font-bold text-blue-900">
                    🔄 Học sinh này đã làm bài {selectedDetailItem.allSubmissions.length} lần. Chọn lần nộp để xem:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDetailItem.allSubmissions.map((att, attIdx) => {
                      const isCurrent = att.id === viewDetailSubmission.id;
                      return (
                        <button
                          key={att.id}
                          onClick={() => setViewDetailSubmission(att)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            isCurrent
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-blue-800 border border-blue-200 hover:bg-blue-100'
                          }`}
                        >
                          Lần {attIdx + 1}: {att.score.toFixed(1)}đ ({new Date(att.submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Score header */}
              <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-2xl p-4 text-center">
                <p className="text-4xl font-black">{viewDetailSubmission.score.toFixed(1)} / 10</p>
                <p className="text-sm font-bold text-brand-100 mt-1">
                  {viewDetailSubmission.evaluation?.emoji || '⭐'} {viewDetailSubmission.evaluation?.text || 'Đã nộp bài'}
                </p>
                <p className="text-xs text-brand-200 mt-1 italic">"{viewDetailSubmission.evaluation?.praise || 'Đã hoàn thành bài tập'}"</p>
              </div>

              {/* Skills Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Chi tiết điểm từng dạng bài:</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Trắc nghiệm:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.mc ?? 0}/10 đúng</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Bài đọc ABCD:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.readingMC ?? 0}/5 đúng</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Cách đọc khác:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.pronunciation ?? 0}/5 đúng</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Sắp xếp câu:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.scramble ?? 0}/10 đúng</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Dịch từ vựng:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.vocab ?? 0}/10 đúng</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Đúng/Sai:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.tf ?? 0}/10 đúng</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                    <span className="font-bold text-slate-600">Luyện nghe:</span>
                    <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.listen ?? 0}/5 đúng</span>
                  </div>
                  {viewDetailSubmission.skillScores?.fill !== undefined && viewDetailSubmission.skillScores?.fill > 0 && (
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                      <span className="font-bold text-slate-600">Điền từ:</span>
                      <span className="font-black text-brand-700">{viewDetailSubmission.skillScores?.fill} đúng</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission info */}
              <div className="text-xs text-slate-500 space-y-2 bg-slate-50 p-3.5 rounded-xl">
                {viewDetailSubmission.isLate && (
                  <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 font-bold flex items-start gap-2">
                    <span className="text-base shrink-0">⚠️</span>
                    <div>
                      <p className="font-black text-rose-900 uppercase">Bài nộp quá hạn (-2 điểm)</p>
                      <p className="text-[11px] font-medium text-rose-700 mt-0.5">
                        Điểm làm bài: {viewDetailSubmission.rawScore !== undefined ? viewDetailSubmission.rawScore.toFixed(1) : viewDetailSubmission.score.toFixed(1)}/10 — Đã tự động trừ 2 điểm quá hạn ➔ Điểm chính thức: {viewDetailSubmission.score.toFixed(1)}/10
                      </p>
                    </div>
                  </div>
                )}
                <p><strong>Thời gian nộp:</strong> {new Date(viewDetailSubmission.submittedAt).toLocaleString('vi-VN')}</p>
                <p><strong>Tổng số câu đúng:</strong> {viewDetailSubmission.totalCorrect} trên {viewDetailSubmission.totalQuestions} câu</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => handleAllowRetake(viewDetailSubmission)}
                className="flex-1 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-black rounded-xl text-xs sm:text-sm border border-amber-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                title="Mở quyền cho học sinh làm lại bài tập này"
              >
                <span>🔄</span> Cho phép làm lại bài
              </button>
              <button
                onClick={() => { setViewDetailSubmission(null); setSelectedDetailItem(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
