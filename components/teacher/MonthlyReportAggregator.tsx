import React, { useState, useEffect, useRef } from 'react';
import { toPng, toBlob } from 'html-to-image';
import * as XLSX from 'xlsx';
import { ClassRoom, Student, MonthlyReport, MonthlySessionConfig, StudentMonthlyScore, ClassScheduleConfig } from '../../types';
import { fetchReportFromCloud, REPORT_MERGED_EVENT } from '../../services/firebaseService';
import {
  getClasses,
  getStudents,
  getMonthlyReports,
  saveMonthlyReport,
  calculateStudentMonthlyAverage,
  getClassSchedule,
  saveClassSchedule,
  subscribeToSync,
  syncLinkScoresForMonthlyReport,
  LINK_SCORE_SOURCE_KEY,
  generate8SessionsFromSchedule,
  isStudentMatch,
  parseScheduleFromText,
  formatScheduleSummary
} from '../../services/assignmentService';

// Pastel session colors matching the sample image exactly (8 pastel colors for 8 sessions)
/** Ô điểm Link cô tự nhập / dán / điền → đánh dấu 'manual' để đồng bộ không bao giờ ghi đè. Xóa trống → hệ thống được điền lại. */
const markLinkSource = (cols: Record<string, any>, columnKey: string, val: any) => {
  if (columnKey !== 'linkScore') return;
  if (String(val ?? '').trim() === '') delete cols[LINK_SCORE_SOURCE_KEY];
  else cols[LINK_SCORE_SOURCE_KEY] = 'manual';
};

const SESSION_PALETTES = [
  { bgHeader: 'bg-yellow-200 border-yellow-300 text-yellow-900', light: 'bg-yellow-50/50' },
  { bgHeader: 'bg-orange-200 border-orange-300 text-orange-900', light: 'bg-orange-50/50' },
  { bgHeader: 'bg-pink-200 border-pink-300 text-pink-900', light: 'bg-pink-50/50' },
  { bgHeader: 'bg-purple-200 border-purple-300 text-purple-900', light: 'bg-purple-50/50' },
  { bgHeader: 'bg-emerald-200 border-emerald-300 text-emerald-900', light: 'bg-emerald-50/50' },
  { bgHeader: 'bg-sky-200 border-sky-300 text-sky-900', light: 'bg-sky-50/50' },
  { bgHeader: 'bg-amber-200 border-amber-300 text-amber-900', light: 'bg-amber-50/50' },
  { bgHeader: 'bg-teal-200 border-teal-300 text-teal-900', light: 'bg-teal-50/50' },
];

const getDayLabelFromDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return '';
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0 = CN, 1 = T2...
  const shortNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return shortNames[dow] || '';
};

const getFullDayNameFromDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return '';
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const fullNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return fullNames[dow] || '';
};

// Date format conversion helpers
const convertDMYtoYMD = (dmy: string): string => {
  if (!dmy) return '';
  const parts = dmy.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return dmy;
};

const convertYMDtoDMY = (ymd: string): string => {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return ymd;
};

// Default 3 columns for each session: Từ Vựng, Test, điểm Link
const DEFAULT_SESSION_COLUMNS: MonthlySessionColumn[] = [
  { key: 'vocab', label: 'Từ Vựng' },
  { key: 'test', label: 'Test' },
  { key: 'linkScore', label: 'điểm Link' }
];

// Helper to get real current month and year
const getRealCurrentMonth = () => new Date().getMonth() + 1;
const getRealCurrentYear = () => new Date().getFullYear();

// Dynamic year options covering current year and future years
const currentRealYear = new Date().getFullYear();
const startAvailableYear = 2025;
const endAvailableYear = Math.max(2030, currentRealYear + 5);
const AVAILABLE_YEARS = Array.from({ length: endAvailableYear - startAvailableYear + 1 }, (_, i) => startAvailableYear + i);

interface MonthlyReportAggregatorProps {
  onOpenAnnualReport?: () => void;
}

export const MonthlyReportAggregator: React.FC<MonthlyReportAggregatorProps> = ({ onOpenAnnualReport }) => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassId, setSelectedClassIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_monthly_class_id') || '';
    }
    return '';
  });
  const setSelectedClassId = (id: string | ((prev: string) => string)) => {
    setSelectedClassIdState(prev => {
      const next = typeof id === 'function' ? id(prev) : id;
      if (typeof window !== 'undefined' && next) {
        localStorage.setItem('mrs_dung_monthly_class_id', next);
      }
      return next;
    });
  };

  const [selectedMonth, setSelectedMonthState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_monthly_month');
      if (saved) {
        const num = parseInt(saved, 10);
        if (num >= 1 && num <= 12) return num;
      }
    }
    return getRealCurrentMonth();
  });
  const setSelectedMonth = (m: number | ((prev: number) => number)) => {
    setSelectedMonthState(prev => {
      const next = typeof m === 'function' ? m(prev) : m;
      if (typeof window !== 'undefined') {
        localStorage.setItem('mrs_dung_monthly_month', String(next));
      }
      return next;
    });
  };

  const [selectedYear, setSelectedYearState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_monthly_year');
      if (saved) {
        const num = parseInt(saved, 10);
        if (num >= 2024 && num <= 2050) return num;
      }
    }
    return getRealCurrentYear();
  });
  const setSelectedYear = (y: number | ((prev: number) => number)) => {
    setSelectedYearState(prev => {
      const next = typeof y === 'function' ? y(prev) : y;
      if (typeof window !== 'undefined') {
        localStorage.setItem('mrs_dung_monthly_year', String(next));
      }
      return next;
    });
  };

  const [centerName, setCenterName] = useState<string>('ENGLISH LEGEND X5');
  const [isEditingCenter, setIsEditingCenter] = useState(false);

  // Sessions in this report (Exactly 8 sessions)
  const [sessions, setSessions] = useState<MonthlySessionConfig[]>([]);

  // Student scores table
  const [studentScores, setStudentScores] = useState<StudentMonthlyScore[]>([]);

  // Export states
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving'>('saved');
  const reportRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Dedicated Clean Export Ref & Preview Modal States
  const exportReportRef = useRef<HTMLDivElement>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageBlob, setPreviewImageBlob] = useState<Blob | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Auto-save and state reference guards to prevent data loss on class switch or blur
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedClassIdRef = useRef(selectedClassId);
  const selectedMonthRef = useRef(selectedMonth);
  const selectedYearRef = useRef(selectedYear);
  const centerNameRef = useRef(centerName);
  const sessionsRef = useRef(sessions);
  const studentScoresRef = useRef(studentScores);
  const classesRef = useRef(classes);

  useEffect(() => { selectedClassIdRef.current = selectedClassId; }, [selectedClassId]);
  useEffect(() => { selectedMonthRef.current = selectedMonth; }, [selectedMonth]);
  useEffect(() => { selectedYearRef.current = selectedYear; }, [selectedYear]);
  useEffect(() => { centerNameRef.current = centerName; }, [centerName]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { studentScoresRef.current = studentScores; }, [studentScores]);
  useEffect(() => { classesRef.current = classes; }, [classes]);

  // Synchronous immediate save of current class report
  const saveCurrentReportImmediately = (
    overrideScores?: StudentMonthlyScore[],
    overrideSessions?: MonthlySessionConfig[]
  ) => {
    const currentClassId = selectedClassIdRef.current;
    if (!currentClassId) return;
    const curClass = classesRef.current.find(c => c.id === currentClassId);
    if (!curClass) return;

    const scoresToSave = overrideScores || studentScoresRef.current;
    const sessionsToSave = overrideSessions || sessionsRef.current;
    if (!scoresToSave || scoresToSave.length === 0) return;

    const report: MonthlyReport = {
      id: `report_${currentClassId}_${selectedYearRef.current}_${selectedMonthRef.current}`,
      classId: currentClassId,
      className: curClass.name,
      month: selectedMonthRef.current,
      year: selectedYearRef.current,
      centerName: centerNameRef.current,
      sessions: sessionsToSave,
      studentScores: scoresToSave,
      updatedAt: new Date().toISOString()
    };
    saveMonthlyReport(report);
  };

  // Debounced auto-save (500ms) for background saving without lagging typing
  const triggerDebouncedAutoSave = (
    updatedScores: StudentMonthlyScore[],
    currentSessions: MonthlySessionConfig[]
  ) => {
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      saveCurrentReportImmediately(updatedScores, currentSessions);
      setAutoSaveStatus('saved');
    }, 500);
  };

  // Zoom & Font Size Control (Normal / Large / Extra Large) - default to 'large'
  const [tableZoom, setTableZoom] = useState<'normal' | 'large' | 'xl'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_report_zoom');
      if (saved === 'normal' || saved === 'large' || saved === 'xl') return saved;
    }
    return 'large'; // Default to large as requested by user ("chữ và số hơi nhỏ")
  });

  const handleTableZoomChange = (zoom: 'normal' | 'large' | 'xl') => {
    setTableZoom(zoom);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_report_zoom', zoom);
    }
  };

  // Modal: Sửa tên 3 đầu mục điểm (Từ Vựng, Test, điểm Link)
  const [showEditColumnsModal, setShowEditColumnsModal] = useState(false);
  const [targetColumnSessionId, setTargetColumnSessionId] = useState<'ALL' | string>('ALL');
  const [col1Label, setCol1Label] = useState('Từ Vựng');
  const [col2Label, setCol2Label] = useState('Test');
  const [col3Label, setCol3Label] = useState('điểm Link');

  // Quick single column rename modal
  const [quickRenameCol, setQuickRenameCol] = useState<{
    sessionId: string;
    sessionName: string;
    colIndex: number;
    colKey: string;
    currentLabel: string;
  } | null>(null);
  const [quickRenameInput, setQuickRenameInput] = useState('');
  const [quickRenameScope, setQuickRenameScope] = useState<'ALL' | 'SINGLE'>('ALL');

  // Modal: Edit all 8 session dates
  const [showEditDatesModal, setShowEditDatesModal] = useState(false);
  const [tempDates, setTempDates] = useState<{ id: string; name: string; date: string }[]>([]);

  // Quick edit single session date
  const [editingSingleSession, setEditingSingleSession] = useState<{ id: string; name: string; date: string } | null>(null);
  const [singleDateInput, setSingleDateInput] = useState('');

  // Quick schedule modal state (Sắp / Đổi Lịch Học Lớp Trực Tiếp)
  const [showQuickScheduleModal, setShowQuickScheduleModal] = useState(false);

  // Tải lại báo cáo từ bộ nhớ (sau khi nhận dữ liệu từ cloud)
  const [reportReloadTick, setReportReloadTick] = useState(0);
  const [scheduleDescInput, setScheduleDescInput] = useState('');

  // Load classes & report - never reset user's chosen class on sync
  const refresh = () => {
    const cls = getClasses();
    setClasses(cls);
    setSelectedClassId(prev => {
      if (prev && cls.some(c => c.id === prev)) {
        return prev; // Luôn bảo toàn lớp học người dùng đang chọn
      }
      const saved = typeof window !== 'undefined' ? (localStorage.getItem('mrs_dung_monthly_class_id') || '') : '';
      if (saved && cls.some(c => c.id === saved)) {
        return saved;
      }
      return cls.length > 0 ? cls[0].id : '';
    });
  };

  useEffect(() => {
    refresh();
    const unsub = subscribeToSync((event) => {
      if (
        event?.type === 'class_added' ||
        event?.type === 'class_updated' ||
        event?.type === 'class_deleted' ||
        event?.type === 'students_updated' ||
        event?.type === 'class_schedule_updated'
      ) {
        refresh();
      }
    });
    const handleBeforeUnload = () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      saveCurrentReportImmediately();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsub();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      saveCurrentReportImmediately();
    };
  }, []);

  // Flush before switching class, month, or year
  const handleClassChange = (newClassId: string) => {
    if (newClassId === selectedClassId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentReportImmediately();
    setSelectedClassId(newClassId);
  };

  const handleMonthChange = (newMonth: number) => {
    if (newMonth === selectedMonth) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentReportImmediately();
    setSelectedMonth(newMonth);
  };

  const handleYearChange = (newYear: number) => {
    if (newYear === selectedYear) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentReportImmediately();
    setSelectedYear(newYear);
  };

  // When class, month, or year changes -> load or initialize report with 8 sessions
  useEffect(() => {
    if (!selectedClassId) {
      setSessions([]);
      setStudentScores([]);
      return;
    }

    const currentClass = classes.find(c => c.id === selectedClassId);
    const allReports = getMonthlyReports(selectedClassId);
    const existing = allReports.find(r => r.month === selectedMonth && r.year === selectedYear);

    const classStudents = getStudents(selectedClassId);

    if (existing) {
      if (existing.centerName && !existing.centerName.includes('FUTURE STARS')) {
        setCenterName(existing.centerName);
      } else {
        setCenterName('ENGLISH LEGEND X5');
      }

      // Lấy lịch chuẩn 8 buổi học thực tế cho tháng và năm này
      const schedSessions = generate8SessionsFromSchedule(selectedClassId, selectedMonth, selectedYear);
      const classSched = getClassSchedule(selectedClassId);
      const schedSlots = classSched?.slots || [];
      const schedDaysOfWeek = schedSlots.map(s => s.dayOfWeek);

      // Kiểm tra xem các buổi học hiện có trong báo cáo có cần đồng bộ lại theo lịch chuẩn không:
      // 1. Số lượng buổi không đủ 8
      // 2. Có ngày học không thuộc tháng/năm đang chọn (sai lệch tháng/năm)
      // 3. Toàn bộ ngày trùng với danh sách fallback cũ [3, 6, 10, 13, 17, 20, 24, 27]
      // 4. Các ngày học chưa khớp với lịch chuẩn của lớp (trừ buổi đã được sửa thủ công isManualDate)
      const hasWrongMonthOrYear = !existing.sessions || existing.sessions.length !== 8 || existing.sessions.some(s => {
        if (!s.date) return true;
        const parts = s.date.split('/');
        if (parts.length !== 3) return true;
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        return m !== selectedMonth || y !== selectedYear;
      });

      const isOldStaticFallback = existing.sessions?.length === 8 && existing.sessions.every((s, i) => {
        const fallbackDays = [3, 6, 10, 13, 17, 20, 24, 27];
        const parts = s.date?.split('/');
        return parts && parseInt(parts[0], 10) === fallbackDays[i];
      });

      const hasScheduleMismatch = schedDaysOfWeek.length > 0 && (
        !existing.sessions ||
        existing.sessions.length !== 8 ||
        existing.sessions.some((s, idx) => !s.isManualDate && s.date !== schedSessions[idx]?.date)
      );

      const needsScheduleSync = hasWrongMonthOrYear || isOldStaticFallback || hasScheduleMismatch;

      let activeSessions: MonthlySessionConfig[];
      if (needsScheduleSync) {
        // Tự động cập nhật ngày học theo lịch chuẩn của lớp cho tháng và năm này, đồng thời bảo toàn tên cột tùy chỉnh!
        activeSessions = schedSessions.map((stdSess, idx) => {
          const oldSess = existing.sessions && existing.sessions[idx];
          const useDate = (oldSess?.isManualDate && oldSess.date) ? oldSess.date : stdSess.date;
          return {
            ...stdSess,
            date: useDate,
            isManualDate: oldSess?.isManualDate,
            columns: (oldSess?.columns && oldSess.columns.length === 3)
              ? oldSess.columns.map((col, cIdx) => ({
                  key: col.key || DEFAULT_SESSION_COLUMNS[cIdx]?.key || `col_${cIdx}`,
                  label: col.label || DEFAULT_SESSION_COLUMNS[cIdx]?.label || `Cột ${cIdx + 1}`
                }))
              : DEFAULT_SESSION_COLUMNS
          };
        });
      } else {
        // Bảo toàn ngày và cột nếu đã hợp lệ
        activeSessions = existing.sessions.map((s, idx) => ({
          ...s,
          date: s.date || schedSessions[idx]?.date || '',
          dayLabel: s.dayLabel || schedSessions[idx]?.dayLabel,
          timeSlot: s.timeSlot || schedSessions[idx]?.timeSlot,
          columns: (s.columns && s.columns.length === 3)
            ? s.columns.map((col, cIdx) => ({
                key: col.key || DEFAULT_SESSION_COLUMNS[cIdx]?.key || `col_${cIdx}`,
                label: col.label || DEFAULT_SESSION_COLUMNS[cIdx]?.label || `Cột ${cIdx + 1}`
              }))
            : DEFAULT_SESSION_COLUMNS
        }));
      }
      setSessions(activeSessions);

      // Merge existing scores with any newly added students and migrate keys
      const matchedExistingIds = new Set<string>();

      const mergedScores: StudentMonthlyScore[] = classStudents.map(std => {
        const found = existing.studentScores?.find(s => 
          (s.studentId && std.id && s.studentId === std.id) ||
          isStudentMatch(std, { studentId: s.studentId, studentName: s.studentName })
        );

        if (found) {
          if (found.studentId) matchedExistingIds.add(found.studentId);
          matchedExistingIds.add(found.studentName);

          const studentScoresObj = { ...(found.scores || {}) };
          // Map older keys s_day_i or s_i to s_buoi_i
          for (let i = 1; i <= 8; i++) {
            const buoiKey = `s_buoi_${i}`;
            if (!studentScoresObj[buoiKey]) {
              const fallbackVal = studentScoresObj[`s_day_${i}`] || studentScoresObj[`s_${i}`];
              if (fallbackVal) {
                studentScoresObj[buoiKey] = fallbackVal;
              }
            }
            if (studentScoresObj[buoiKey]) {
              const sCols = { ...studentScoresObj[buoiKey] };
              // Migrate old keys: video -> vocab, oldLesson -> test, btvn/online -> linkScore
              if (sCols['vocab'] === undefined) {
                if (sCols['tuVung'] !== undefined) sCols['vocab'] = sCols['tuVung'];
                else if (sCols['video'] !== undefined) sCols['vocab'] = sCols['video'];
              }
              if (sCols['test'] === undefined) {
                if (sCols['oldLesson'] !== undefined) sCols['test'] = sCols['oldLesson'];
              }
              if (sCols['linkScore'] === undefined) {
                if (sCols['diemLink'] !== undefined) sCols['linkScore'] = sCols['diemLink'];
                else if (sCols['btvn'] !== undefined) sCols['linkScore'] = sCols['btvn'];
                else if (sCols['online'] !== undefined) sCols['linkScore'] = sCols['online'];
              }
              studentScoresObj[buoiKey] = sCols;
            }
          }

          // Bảo toàn điểm vừa nhập trong ref bộ nhớ nếu có
          const inMemStudent = studentScoresRef.current.find(m => 
            (m.studentId && std.id && m.studentId === std.id) ||
            isStudentMatch(std, { studentId: m.studentId, studentName: m.studentName })
          );
          if (inMemStudent && inMemStudent.scores) {
            Object.keys(inMemStudent.scores).forEach(bKey => {
              studentScoresObj[bKey] = {
                ...(studentScoresObj[bKey] || {}),
                ...inMemStudent.scores[bKey]
              };
            });
          }

          return {
            ...found,
            studentId: std.id,
            studentName: std.name,
            englishName: std.englishName || found.englishName || '',
            scores: studentScoresObj
          };
        }

        // Học sinh mới thêm hoặc chưa có điểm trong file lưu: kiểm tra trong in-memory ref
        const inMemStudent = studentScoresRef.current.find(m => 
          (m.studentId && std.id && m.studentId === std.id) ||
          isStudentMatch(std, { studentId: m.studentId, studentName: m.studentName })
        );

        return {
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName || inMemStudent?.englishName || '',
          scores: inMemStudent?.scores || {},
          averageScore: inMemStudent?.averageScore || 0
        };
      });

      // BẢO TOÀN TUYỆT ĐỐI: Giữ lại tất cả học sinh đã có điểm trong báo cáo cũ dù danh sách lớp có thay đổi
      (existing.studentScores || []).forEach(existingStd => {
        const alreadyIncluded = 
          (existingStd.studentId && matchedExistingIds.has(existingStd.studentId)) ||
          matchedExistingIds.has(existingStd.studentName) ||
          mergedScores.some(m => 
            (m.studentId && existingStd.studentId && m.studentId === existingStd.studentId) ||
            isStudentMatch({ id: m.studentId, name: m.studentName }, { studentId: existingStd.studentId, studentName: existingStd.studentName })
          );

        if (!alreadyIncluded) {
          mergedScores.push(existingStd);
        }
      });

      // Recalculate average
      mergedScores.forEach(s => {
        s.averageScore = calculateStudentMonthlyAverage(s.scores);
      });

      // Tự động đồng bộ điểm Link từ các bài nộp trên app nếu ô điểm Link đang trống
      const syncResult = syncLinkScoresForMonthlyReport(
        selectedClassId,
        selectedMonth,
        selectedYear,
        activeSessions,
        mergedScores,
        false // không ghi đè điểm giáo viên đã sửa thủ công
      );

      setStudentScores(syncResult.updatedScores);
      // Tự động lưu lại nếu có điểm link mới được lấy về từ hệ thống hoặc vừa đồng bộ lịch học
      if (syncResult.syncedCount > 0 || needsScheduleSync) {
        saveMonthlyReport({
          id: `report_${selectedClassId}_${selectedYear}_${selectedMonth}`,
          classId: selectedClassId,
          className: currentClass?.name || 'Lớp học',
          month: selectedMonth,
          year: selectedYear,
          centerName: existing.centerName || 'ENGLISH LEGEND X5',
          sessions: activeSessions,
          studentScores: syncResult.updatedScores,
          updatedAt: new Date().toISOString()
        });
      }
    } else {
      // Create initial 8 sessions from schedule for this class
      const initial8 = generate8SessionsFromSchedule(selectedClassId, selectedMonth, selectedYear);
      setSessions(initial8);

      const initialScores: StudentMonthlyScore[] = classStudents.map(std => {
        const inMemStudent = studentScoresRef.current.find(m => 
          (m.studentId && std.id && m.studentId === std.id) ||
          isStudentMatch(std, { studentId: m.studentId, studentName: m.studentName })
        );
        return {
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName || inMemStudent?.englishName || '',
          scores: inMemStudent?.scores || {},
          averageScore: inMemStudent?.averageScore || 0
        };
      });

      // Tự động đồng bộ điểm Link từ bài làm hệ thống vào mẫu ban đầu
      const syncResult = syncLinkScoresForMonthlyReport(
        selectedClassId,
        selectedMonth,
        selectedYear,
        initial8,
        initialScores,
        false
      );

      setStudentScores(syncResult.updatedScores);

      // Máy này chưa có báo cáo của lớp/tháng này → HỎI CLOUD TRƯỚC khi tạo mẫu mới.
      // (Trước đây tạo và lưu ngay mẫu trống → có thể đè mất điểm cô đã nhập trên máy khác.)
      const reportId = `report_${selectedClassId}_${selectedYear}_${selectedMonth}`;
      let cancelled = false;
      fetchReportFromCloud('monthly_reports', reportId).then(result => {
        if (cancelled) return;
        if (result === 'exists') {
          // Đã có trên cloud → tải về hiển thị (giữ nguyên điểm cô vừa gõ nếu có)
          setReportReloadTick(t => t + 1);
        } else if (result === 'absent') {
          const latestScores = studentScoresRef.current.length > 0 ? studentScoresRef.current : syncResult.updatedScores;
          saveMonthlyReport({
            id: reportId,
            classId: selectedClassId,
            className: currentClass?.name || 'Lớp học',
            month: selectedMonth,
            year: selectedYear,
            centerName: 'ENGLISH LEGEND X5',
            sessions: sessionsRef.current.length > 0 ? sessionsRef.current : initial8,
            studentScores: latestScores,
            updatedAt: new Date().toISOString()
          });
        }
        // 'error' (mất mạng): không tạo mẫu mới đè lên; điểm cô gõ vẫn được lưu và gộp khi có mạng
      });
      return () => { cancelled = true; };
    }
  }, [selectedClassId, selectedMonth, selectedYear, classes, reportReloadTick]);

  // Khi máy nhận thêm ô điểm từ cloud (máy khác vừa nhập) → hiển thị ngay nếu cô không đang gõ dở
  useEffect(() => {
    const onMerged = (e: any) => {
      const detail = e?.detail || {};
      if (detail.path !== 'monthly_reports') return;
      const currentId = `report_${selectedClassIdRef.current}_${selectedYearRef.current}_${selectedMonthRef.current}`;
      if (!Array.isArray(detail.ids) || !detail.ids.includes(currentId)) return;
      if (autoSaveTimerRef.current) return; // đang có điểm chờ lưu → để lần lưu tới gộp, không làm gián đoạn
      setReportReloadTick(t => t + 1);
    };
    window.addEventListener(REPORT_MERGED_EVENT, onMerged);
    return () => window.removeEventListener(REPORT_MERGED_EVENT, onMerged);
  }, []);

  // Student filter inside monthly view
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState<'ALL' | 'NO_BTVN' | 'EXCELLENT'>('ALL');
  const [batchActionToast, setBatchActionToast] = useState<string | null>(null);

  const showBatchToast = (msg: string) => {
    setBatchActionToast(msg);
    setTimeout(() => setBatchActionToast(null), 3000);
  };

  const currentClass = classes.find(c => c.id === selectedClassId);

  // Handle inline score change using studentId - KEEPS EXACT TEACHER INPUT STRING
  const handleScoreChange = (
    studentId: string,
    sessionId: string,
    columnKey: string,
    rawVal: string
  ) => {
    const studentIndex = studentScores.findIndex(s => s.studentId === studentId);
    if (studentIndex === -1) return;

    const trimmed = rawVal.trim();
    if (trimmed.toLowerCase() === 'x') {
      rawVal = 'x';
    } else if (trimmed === '') {
      rawVal = '';
    } else {
      // Validate max 10
      const parsedNum = parseFloat(trimmed.replace(',', '.'));
      if (!isNaN(parsedNum) && parsedNum > 10) {
        return; // Reject scores greater than 10
      }
    }

    const updated = [...studentScores];
    const student = { ...updated[studentIndex] };
    const scores = { ...(student.scores || {}) };
    const sessionCols = { ...(scores[sessionId] || {}) };

    sessionCols[columnKey] = rawVal; // Store exact input
    markLinkSource(sessionCols, columnKey, rawVal);
    scores[sessionId] = sessionCols;
    student.scores = scores;
    student.averageScore = calculateStudentMonthlyAverage(scores);
    updated[studentIndex] = student;
    studentScoresRef.current = updated; // Đồng bộ ngay lập tức vào Ref để tránh race condition khi onBlur
    setStudentScores(updated);

    // Tự động lưu ngầm ngay khi giáo viên nhập điểm (sau 500ms)
    triggerDebouncedAutoSave(updated, sessions);
  };

  // Copy current cell value to all students in this column
  const handleCopyScoreToColumn = (sessionId: string, columnKey: string, val: string | number) => {
    if (val === undefined || val === null || String(val).trim() === '') {
      alert('Vui lòng nhập điểm vào ô trước khi sao chép cho cả cột!');
      return;
    }
    const valStr = String(val).trim();
    const updated = studentScores.map(student => {
      const scores = { ...(student.scores || {}) };
      const sessionCols = { ...(scores[sessionId] || {}) };
      sessionCols[columnKey] = valStr;
      markLinkSource(sessionCols, columnKey, valStr);
      scores[sessionId] = sessionCols;
      return {
        ...student,
        scores,
        averageScore: calculateStudentMonthlyAverage(scores)
      };
    });
    setStudentScores(updated);
    saveCurrentReportImmediately(updated, sessions);
    setAutoSaveStatus('saved');
    showBatchToast(`✓ Đã sao chép điểm "${valStr}" cho toàn bộ ${updated.length} học sinh trong cột!`);
  };

  // Quick fill column with a prompted score
  const handleQuickFillColumn = (sessionId: string, columnKey: string, colLabel: string, sessionName: string) => {
    const input = prompt(`Nhập điểm muốn điền đồng loạt cho toàn bộ học sinh ở cột "${colLabel}" - ${sessionName}:\n(Nhập số 0-10, có thể dùng số thập phân như 8.5 hoặc 8,5, hoặc 'x')`);
    if (input === null) return;
    const trimmed = input.trim();
    if (trimmed !== 'x' && trimmed !== 'X' && trimmed !== '') {
      const num = parseFloat(trimmed.replace(',', '.'));
      if (isNaN(num) || num < 0 || num > 10) {
        alert('Điểm không hợp lệ! Vui lòng nhập số từ 0 đến 10.');
        return;
      }
    }
    const finalVal = trimmed.toLowerCase() === 'x' ? 'x' : trimmed;
    const updated = studentScores.map(student => {
      const scores = { ...(student.scores || {}) };
      const sessionCols = { ...(scores[sessionId] || {}) };
      sessionCols[columnKey] = finalVal;
      markLinkSource(sessionCols, columnKey, finalVal);
      scores[sessionId] = sessionCols;
      return {
        ...student,
        scores,
        averageScore: calculateStudentMonthlyAverage(scores)
      };
    });
    setStudentScores(updated);
    saveCurrentReportImmediately(updated, sessions);
    setAutoSaveStatus('saved');
    showBatchToast(`✓ Đã điền đồng loạt "${trimmed}" cho cả cột!`);
  };

  // Handle paste multiple rows from Excel / Google Sheets
  const handlePasteColumn = (
    startStudentIndex: number,
    sessionId: string,
    columnKey: string,
    pastedText: string
  ) => {
    const lines = pastedText
      .split(/\r?\n/)
      .map(line => line.split('\t')[0].trim())
      .filter(l => l !== '');

    if (lines.length <= 1) return;

    const updated = [...studentScores];
    let filledCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const targetIdx = startStudentIndex + i;
      if (targetIdx >= updated.length) break;

      const rawVal = lines[i];
      let cleanVal = rawVal;
      if (rawVal.toLowerCase() === 'x') {
        cleanVal = 'x';
      } else {
        const num = parseFloat(rawVal.replace(',', '.'));
        if (isNaN(num) || num < 0 || num > 10) continue;
      }

      const student = { ...updated[targetIdx] };
      const scores = { ...(student.scores || {}) };
      const sessionCols = { ...(scores[sessionId] || {}) };
      sessionCols[columnKey] = cleanVal;
      markLinkSource(sessionCols, columnKey, cleanVal);
      scores[sessionId] = sessionCols;
      student.scores = scores;
      student.averageScore = calculateStudentMonthlyAverage(scores);
      updated[targetIdx] = student;
      filledCount++;
    }

    setStudentScores(updated);
    saveCurrentReportImmediately(updated, sessions);
    setAutoSaveStatus('saved');
    showBatchToast(`✓ Đã dán thành công ${filledCount} điểm từ clipboard/Excel!`);
  };

  // Quét và đồng bộ điểm Link từ các bài nộp trên hệ thống
  const handleManualSyncLinkScores = (force = false) => {
    const { updatedScores, syncedCount } = syncLinkScoresForMonthlyReport(
      selectedClassId,
      selectedMonth,
      selectedYear,
      sessions,
      studentScores,
      force
    );
    setStudentScores(updatedScores);
    saveCurrentReportImmediately(updatedScores, sessions);
    setAutoSaveStatus('saved');
    if (syncedCount > 0) {
      showBatchToast(`✓ Đã tự động cập nhật ${syncedCount} điểm Link từ bài làm trên hệ thống!`);
    } else {
      showBatchToast(`ℹ️ Tất cả điểm Link đã khớp với dữ liệu bài nộp trên hệ thống.`);
    }
  };

  // Đồng bộ điểm Link riêng cho một buổi học
  const handleSyncSingleColumnLink = (sessionId: string) => {
    const targetSession = sessions.find(s => s.id === sessionId);
    if (!targetSession) return;
    const targetIdx = sessions.findIndex(s => s.id === sessionId);

    // Đồng bộ với danh sách 8 buổi đầy đủ để tính đúng thứ tự index và ngày học
    const { updatedScores } = syncLinkScoresForMonthlyReport(
      selectedClassId,
      selectedMonth,
      selectedYear,
      sessions,
      studentScores,
      true // ghi đè điểm cột này
    );

    // Chỉ áp dụng kết quả đồng bộ cho riêng cột buổi học được chọn
    let syncedThisCol = 0;
    const merged = studentScores.map(origStd => {
      const updatedStd = updatedScores.find(u => u.studentId === origStd.studentId);
      if (!updatedStd) return origStd;
      const newColVal = updatedStd.scores?.[sessionId]?.['linkScore'];
      if (newColVal !== undefined && newColVal !== null && newColVal !== '') {
        syncedThisCol++;
        const newScores = {
          ...(origStd.scores || {}),
          [sessionId]: {
            ...(origStd.scores?.[sessionId] || {}),
            linkScore: newColVal
          }
        };
        return {
          ...origStd,
          scores: newScores,
          averageScore: calculateStudentMonthlyAverage(newScores)
        };
      }
      return origStd;
    });

    studentScoresRef.current = merged;
    setStudentScores(merged);
    saveCurrentReportImmediately(merged, sessions);
    setAutoSaveStatus('saved');
    showBatchToast(`✓ Đã đồng bộ ${syncedThisCol} điểm Link cho ${targetSession.name} (${targetSession.date})!`);
  };

  // Save report
  const handleSaveReport = () => {
    if (!selectedClassId || !currentClass) return;
    const report: MonthlyReport = {
      id: `report_${selectedClassId}_${selectedYear}_${selectedMonth}`,
      classId: selectedClassId,
      className: currentClass.name,
      month: selectedMonth,
      year: selectedYear,
      centerName,
      sessions,
      studentScores,
      updatedAt: new Date().toISOString()
    };
    saveMonthlyReport(report);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 2500);
  };

  // Date editing handlers
  const handleOpenEditDates = () => {
    setTempDates(sessions.map(s => ({ id: s.id, name: s.name, date: s.date })));
    setShowEditDatesModal(true);
  };

  const handleSaveEditDates = () => {
    const updated = sessions.map(s => {
      const match = tempDates.find(t => t.id === s.id);
      return match ? { ...s, date: match.date } : s;
    });
    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);
    setShowEditDatesModal(false);
    showBatchToast('✓ Đã cập nhật và lưu ngày 8 buổi học!');
  };

  const handleDirectSyncWithSchedule = () => {
    if (!confirm('Đặt lại ngày của 8 buổi học theo đúng lịch học thực tế của lớp trong tháng?')) return;
    const scheduleSessions = generate8SessionsFromSchedule(selectedClassId, selectedMonth, selectedYear);
    const updated = sessions.map((s, idx) => ({
      ...s,
      date: scheduleSessions[idx]?.date || s.date,
      dayLabel: scheduleSessions[idx]?.dayLabel || s.dayLabel,
      timeSlot: scheduleSessions[idx]?.timeSlot || s.timeSlot,
      isManualDate: false,
      columns: s.columns && s.columns.length === 3 ? s.columns : DEFAULT_SESSION_COLUMNS
    }));
    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);
    showBatchToast('✓ Đã đồng bộ ngày 8 buổi học theo lịch học của lớp!');
  };

  const handleOpenQuickScheduleModal = () => {
    const curClass = classes.find(c => c.id === selectedClassId);
    const sched = getClassSchedule(selectedClassId);
    setScheduleDescInput(curClass?.description || formatScheduleSummary(sched?.slots) || 'Thứ 2 & Thứ 5 (17:30 - 19:00)');
    setShowQuickScheduleModal(true);
  };

  const handleSaveQuickSchedule = () => {
    if (!selectedClassId) return;
    const curClass = classes.find(c => c.id === selectedClassId);
    const parsed = parseScheduleFromText(scheduleDescInput);
    if (!parsed || parsed.slots.length === 0) {
      alert('Vui lòng chọn hoặc nhập lịch học hợp lệ (Ví dụ: Thứ 3 & Thứ 6 (17:30 - 19:00))');
      return;
    }

    const config: ClassScheduleConfig = {
      id: `sched_${selectedClassId}`,
      classId: selectedClassId,
      className: curClass?.name || '',
      sessionsPerWeek: parsed.slots.length,
      slots: parsed.slots,
      roomDefault: 'Phòng A1',
      notes: `Lịch học ${curClass?.name || ''}`,
      updatedAt: new Date().toISOString()
    };

    saveClassSchedule(config);

    // Cập nhật ngay 8 buổi học trên màn hình hiện tại
    const newSessions = generate8SessionsFromSchedule(selectedClassId, selectedMonth, selectedYear);
    const updated = newSessions.map((stdSess, idx) => {
      const oldSess = sessions[idx];
      return {
        ...stdSess,
        columns: (oldSess?.columns && oldSess.columns.length === 3)
          ? oldSess.columns
          : DEFAULT_SESSION_COLUMNS
      };
    });

    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);

    setShowQuickScheduleModal(false);
    showBatchToast(`✓ Đã đổi lịch học thành: ${parsed.formattedSummary} và đồng bộ ngay 8 buổi học!`);
  };

  const handleOpenSingleDateEdit = (s: MonthlySessionConfig) => {
    setEditingSingleSession({ id: s.id, name: s.name, date: s.date });
    setSingleDateInput(s.date);
  };

  const handleSaveSingleDate = () => {
    if (!editingSingleSession) return;
    const newDate = singleDateInput.trim() || editingSingleSession.date;
    const updated = sessions.map(s => (s.id === editingSingleSession.id ? { ...s, date: newDate, isManualDate: true } : s));
    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);
    setEditingSingleSession(null);
    showBatchToast(`✓ Đã cập nhật ngày ${editingSingleSession.name}: ${newDate}`);
  };

  // ==================== COLUMN HEADERS EDITING ====================
  // Open modal to edit 3 column names
  const handleOpenEditAllColumns = (sessionId: 'ALL' | string = 'ALL') => {
    setTargetColumnSessionId(sessionId);
    const refCols = (sessionId === 'ALL' ? sessions[0]?.columns : sessions.find(s => s.id === sessionId)?.columns) || DEFAULT_SESSION_COLUMNS;
    setCol1Label(refCols[0]?.label || 'Từ Vựng');
    setCol2Label(refCols[1]?.label || 'Test');
    setCol3Label(refCols[2]?.label || 'điểm Link');
    setShowEditColumnsModal(true);
  };

  // Save 3 column names
  const handleSaveAllColumns = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const c1 = col1Label.trim() || 'Từ Vựng';
    const c2 = col2Label.trim() || 'Test';
    const c3 = col3Label.trim() || 'điểm Link';

    const updated = sessions.map(s => {
      if (targetColumnSessionId === 'ALL' || s.id === targetColumnSessionId) {
        const curCols = s.columns || DEFAULT_SESSION_COLUMNS;
        return {
          ...s,
          columns: [
            { ...curCols[0], label: c1 },
            { ...curCols[1], label: c2 },
            { ...curCols[2], label: c3 }
          ]
        };
      }
      return s;
    });

    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);
    setShowEditColumnsModal(false);
    showBatchToast(
      targetColumnSessionId === 'ALL'
        ? `✓ Đã cập nhật 3 đầu mục [${c1}, ${c2}, ${c3}] cho toàn bộ 8 buổi!`
        : `✓ Đã cập nhật 3 đầu mục điểm cho buổi học!`
    );
  };

  // Open quick single column rename
  const handleOpenQuickRenameCol = (
    sessionId: string,
    sessionName: string,
    colIndex: number,
    colKey: string,
    currentLabel: string
  ) => {
    setQuickRenameCol({ sessionId, sessionName, colIndex, colKey, currentLabel });
    setQuickRenameInput(currentLabel);
    setQuickRenameScope('ALL');
  };

  // Save quick single column rename
  const handleSaveQuickRenameCol = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickRenameCol) return;
    const newLabel = quickRenameInput.trim() || quickRenameCol.currentLabel;
    const { colIndex, sessionId } = quickRenameCol;

    const updated = sessions.map(s => {
      if (quickRenameScope === 'ALL' || s.id === sessionId) {
        const curCols = [...(s.columns || DEFAULT_SESSION_COLUMNS)];
        if (curCols[colIndex]) {
          curCols[colIndex] = { ...curCols[colIndex], label: newLabel };
        }
        return { ...s, columns: curCols };
      }
      return s;
    });

    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);
    setQuickRenameCol(null);
    showBatchToast(
      quickRenameScope === 'ALL'
        ? `✓ Đã đổi tên đầu mục thành "${newLabel}" cho cả 8 buổi học!`
        : `✓ Đã đổi tên đầu mục thành "${newLabel}"!`
    );
  };

  // Reset columns to default
  const handleResetColumnsToDefault = () => {
    if (!confirm('Khôi phục tên 3 đầu mục điểm về mặc định (Từ Vựng, Test, điểm Link) cho cả 8 buổi?')) return;
    const updated = sessions.map(s => ({
      ...s,
      columns: DEFAULT_SESSION_COLUMNS
    }));
    sessionsRef.current = updated;
    setSessions(updated);
    saveCurrentReportImmediately(studentScoresRef.current, updated);
    setShowEditColumnsModal(false);
    showBatchToast('✓ Đã khôi phục 3 đầu mục điểm về mặc định!');
  };

  // Table horizontal scrolling helpers
  const scrollTable = (offset: number) => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };
  const scrollToStart = () => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };
  const scrollToEnd = () => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ left: tableScrollRef.current.scrollWidth, behavior: 'smooth' });
    }
  };
  const scrollToDay = (sessionIndex: number) => {
    if (tableScrollRef.current) {
      // 3 columns * approx 60px = 180px per session
      const targetX = Math.max(0, (sessionIndex - 1) * 180);
      tableScrollRef.current.scrollTo({ left: targetX, behavior: 'smooth' });
    }
  };

  // Export as Image PNG with Preview Modal and Copy/Download options
  const handleExportImage = async () => {
    if (!exportReportRef.current) return;
    try {
      setIsExportingImage(true);
      // Wait for layout to settle
      await new Promise(resolve => setTimeout(resolve, 150));

      const targetEl = exportReportRef.current;
      const targetWidth = targetEl.scrollWidth || 1420;

      const dataUrl = await toPng(targetEl, {
        quality: 1,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        width: targetWidth,
        style: {
          width: `${targetWidth}px`,
          maxWidth: 'none',
          overflow: 'visible'
        }
      });

      let blob: Blob | null = null;
      try {
        blob = await toBlob(targetEl, {
          quality: 1,
          pixelRatio: 2.5,
          backgroundColor: '#ffffff',
          width: targetWidth,
          style: {
            width: `${targetWidth}px`,
            maxWidth: 'none',
            overflow: 'visible'
          }
        });
      } catch (bErr) {
        console.warn('toBlob error, will fallback to dataUrl fetching:', bErr);
      }

      setPreviewImageUrl(dataUrl);
      setPreviewImageBlob(blob);
      setCopySuccess(false);
      setShowPreviewModal(true);
    } catch (err) {
      console.error('Lỗi khi tạo ảnh báo cáo:', err);
      alert('Không thể tạo ảnh báo cáo. Vui lòng thử lại.');
    } finally {
      setIsExportingImage(false);
    }
  };

  // Copy Preview Image directly to Clipboard (for pasting into Zalo / Messenger)
  const handleCopyPreviewImage = async () => {
    try {
      let blobToCopy = previewImageBlob;
      if (!blobToCopy && previewImageUrl) {
        const res = await fetch(previewImageUrl);
        blobToCopy = await res.blob();
      }

      if (!blobToCopy) {
        alert('Không có dữ liệu ảnh để sao chép.');
        return;
      }

      if (navigator.clipboard && (window as any).ClipboardItem) {
        const item = new (window as any).ClipboardItem({ 'image/png': blobToCopy });
        await (navigator.clipboard as any).write([item]);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 4000);
      } else {
        throw new Error('ClipboardItem API không được hỗ trợ');
      }
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
      alert('Trình duyệt chưa hỗ trợ sao chép ảnh tự động hoặc chưa cấp quyền. Bạn có thể bấm "Tải Ảnh Về Máy" hoặc nhấp chuột phải vào ảnh chọn "Sao chép hình ảnh" (Copy image) để gửi qua Zalo.');
    }
  };

  // Download Preview Image as PNG
  const handleDownloadPreviewImage = () => {
    if (!previewImageUrl) return;
    const link = document.createElement('a');
    link.download = `Bao_Cao_Hoc_Tap_Thang_${selectedMonth}_${currentClass?.name || 'Lop'}.png`;
    link.href = previewImageUrl;
    link.click();
  };

  // Export as Excel (.xlsx)
  const handleExportExcel = () => {
    if (!currentClass) return;

    // Build headers
    const headerRow1 = ['LỚP', 'HỌ VÀ TÊN', 'E.NAME'];
    sessions.forEach(s => {
      s.columns.forEach(col => {
        headerRow1.push(`${s.name} (${s.date}) - ${col.label}`);
      });
    });
    headerRow1.push('ĐIỂM TB');

    // Build rows
    const dataRows = studentScores.map(std => {
      const row: any[] = [currentClass.name, std.studentName, std.englishName || ''];
      sessions.forEach(s => {
        s.columns.forEach(col => {
          const val = std.scores?.[s.id]?.[col.key];
          row.push(val !== undefined && val !== '' ? val : '');
        });
      });
      row.push(std.averageScore > 0 ? std.averageScore.toFixed(2).replace('.', ',') : '');
      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow1, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Báo cáo Tháng ${selectedMonth}`);
    XLSX.writeFile(wb, `Bao_cao_thang_${selectedMonth}_${currentClass.name}.xlsx`);
  };

  // Sort students for Ranking
  const rankedStudents = [...studentScores]
    .filter(s => s.averageScore > 0)
    .sort((a, b) => b.averageScore - a.averageScore);

  const top1 = rankedStudents[0];
  const top2 = rankedStudents[1];
  const top3 = rankedStudents[2];

  const otherStudents = rankedStudents.slice(3);

  // Divide other students into 2 columns
  const half = Math.ceil(otherStudents.length / 2);
  const otherCol1 = otherStudents.slice(0, half);
  const otherCol2 = otherStudents.slice(half);

  // Distinct legend labels for footer
  const distinctLegendLabels = Array.from(
    new Set(sessions.flatMap(s => s.columns.map(c => c.label.trim())))
  ).filter(Boolean);
  const finalLegendLabels = distinctLegendLabels.length > 0
    ? distinctLegendLabels.slice(0, 4)
    : ['Từ Vựng', 'Test', 'điểm Link'];

  // Filter student scores based on search & filter tab
  const displayedStudentScores = studentScores.filter(std => {
    const matchSearch = !studentSearch.trim() ||
      std.studentName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (std.englishName && std.englishName.toLowerCase().includes(studentSearch.toLowerCase()));
    if (!matchSearch) return false;

    if (studentFilter === 'NO_BTVN') {
      return sessions.some(s => {
        const val = std.scores?.[s.id]?.['linkScore'] ?? std.scores?.[s.id]?.['test'] ?? std.scores?.[s.id]?.['vocab'] ?? std.scores?.[s.id]?.['btvn'];
        return val === undefined || val === '' || val === 'x' || val === 0;
      });
    }
    if (studentFilter === 'EXCELLENT') {
      return std.averageScore >= 8.0;
    }
    return true;
  });

  // Dynamic font and dimensions configuration based on tableZoom
  const z = {
    normal: {
      cellHeight: 'h-9',
      inputFont: 'text-xs font-bold',
      nameFont: 'text-xs font-black text-slate-900',
      enameFont: 'text-xs font-bold text-emerald-800',
      subHeaderFont: 'text-xs font-bold text-slate-800',
      sessHeaderFont: 'text-xs font-black',
      thMainFont: 'text-xs font-black',
      colWidthSub: '76px',
      colWidthLink: '86px',
      sttWidth: '45px',
      nameWidth: '160px',
      enameWidth: '95px',
      avgWidth: '85px',
      avgFont: 'text-xs font-black',
    },
    large: { // Default
      cellHeight: 'h-10 sm:h-11',
      inputFont: 'text-sm sm:text-base font-black',
      nameFont: 'text-sm sm:text-base font-black text-slate-900',
      enameFont: 'text-xs sm:text-sm font-black text-emerald-800',
      subHeaderFont: 'text-xs sm:text-sm font-black text-slate-800',
      sessHeaderFont: 'text-sm sm:text-base font-black',
      thMainFont: 'text-sm sm:text-base font-black',
      colWidthSub: '84px',
      colWidthLink: '96px',
      sttWidth: '52px',
      nameWidth: '185px',
      enameWidth: '110px',
      avgWidth: '95px',
      avgFont: 'text-sm sm:text-base font-black',
    },
    xl: {
      cellHeight: 'h-12 sm:h-14',
      inputFont: 'text-base sm:text-lg font-black',
      nameFont: 'text-base sm:text-lg font-black text-slate-900',
      enameFont: 'text-sm sm:text-base font-black text-emerald-800',
      subHeaderFont: 'text-sm sm:text-base font-black text-slate-900',
      sessHeaderFont: 'text-base sm:text-lg font-black',
      thMainFont: 'text-base sm:text-lg font-black',
      colWidthSub: '98px',
      colWidthLink: '112px',
      sttWidth: '60px',
      nameWidth: '210px',
      enameWidth: '125px',
      avgWidth: '110px',
      avgFont: 'text-base sm:text-lg font-black',
    }
  }[tableZoom];

  return (
    <div className="space-y-6 font-sans">
      {/* Top Action & Filter Toolbar (Not printed in image) */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-brand-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Class Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Chọn Lớp Học
            </label>
            <select
              value={selectedClassId}
              onChange={e => handleClassChange(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-brand-500 outline-none shadow-sm cursor-pointer"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Month Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Tháng
            </label>
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(Number(e.target.value))}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-brand-500 outline-none shadow-sm cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                const isCurrent = m === getRealCurrentMonth() && selectedYear === getRealCurrentYear();
                return (
                  <option key={m} value={m}>
                    Tháng {m} {isCurrent ? '★ (Hiện tại)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Year Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Năm
            </label>
            <select
              value={selectedYear}
              onChange={e => handleYearChange(Number(e.target.value))}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-brand-500 outline-none shadow-sm cursor-pointer"
            >
              {AVAILABLE_YEARS.map(y => {
                const isCurrent = y === getRealCurrentYear();
                return (
                  <option key={y} value={y}>
                    Năm {y} {isCurrent ? '★ (Hiện tại)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Nút quay lại tháng hiện tại nếu đang ở tháng/năm khác */}
          {(selectedMonth !== getRealCurrentMonth() || selectedYear !== getRealCurrentYear()) ? (
            <button
              type="button"
              onClick={() => {
                handleMonthChange(getRealCurrentMonth());
                handleYearChange(getRealCurrentYear());
                showBatchToast(`📅 Đã chuyển về Tháng ${getRealCurrentMonth()}/${getRealCurrentYear()} (Hiện tại)`);
              }}
              className="px-3 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 self-end cursor-pointer"
              title="Quay lại tháng và năm hiện tại"
            >
              <span>📅</span> Về T{getRealCurrentMonth()}/{getRealCurrentYear()}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-800 text-xs font-black self-end shadow-2xs">
              <span>📅</span>
              <span>T{getRealCurrentMonth()}/{getRealCurrentYear()} (Hiện tại)</span>
            </div>
          )}

          {/* Auto-save status badge */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold self-end shadow-2xs">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${autoSaveStatus === 'saving' ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`}></span>
            <span className={autoSaveStatus === 'saving' ? 'text-amber-700 font-black' : 'text-emerald-700 font-black'}>
              {autoSaveStatus === 'saving' ? 'Đang lưu...' : '● Tự động lưu'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom & Font Size Controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
            <span className="text-slate-500 pl-2 pr-1 hidden sm:inline">🔍 Cỡ chữ:</span>
            <button
              type="button"
              onClick={() => handleTableZoomChange('normal')}
              className={`px-2.5 py-1.5 rounded-lg font-black transition-all ${
                tableZoom === 'normal'
                  ? 'bg-white text-brand-700 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cỡ chữ vừa"
            >
              Vừa
            </button>
            <button
              type="button"
              onClick={() => handleTableZoomChange('large')}
              className={`px-2.5 py-1.5 rounded-lg font-black transition-all ${
                tableZoom === 'large'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cỡ chữ lớn (dễ đọc, đề xuất)"
            >
              Lớn ⭐
            </button>
            <button
              type="button"
              onClick={() => handleTableZoomChange('xl')}
              className={`px-2.5 py-1.5 rounded-lg font-black transition-all ${
                tableZoom === 'xl'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cỡ chữ rất lớn (siêu rõ nét)"
            >
              Rất Lớn
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleManualSyncLinkScores(false)}
            className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs sm:text-sm rounded-xl border border-blue-200 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Tự động quét bài làm online trên hệ thống để cập nhật điểm Link cho học sinh"
          >
            <span>🔗</span> Đồng Bộ Điểm Link
          </button>

          <button
            type="button"
            onClick={handleOpenEditDates}
            className="px-3.5 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs sm:text-sm rounded-xl border border-brand-200 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Chỉnh sửa ngày học cho từng buổi trong 8 buổi"
          >
            <span>🗓️</span> Sửa Ngày 8 Buổi
          </button>

          <button
            type="button"
            onClick={() => handleOpenEditAllColumns('ALL')}
            className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs sm:text-sm rounded-xl border border-amber-300 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Tùy chỉnh tên 3 đầu mục điểm (Từ Vựng, Test, điểm Link) cho các buổi học"
          >
            <span>🏷️</span> Sửa Tên 3 Đầu Mục Điểm
          </button>

          <button
            type="button"
            onClick={handleDirectSyncWithSchedule}
            className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs sm:text-sm rounded-xl border border-indigo-200 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Đồng bộ lại ngày 8 buổi học theo đúng lịch học của lớp trong tháng"
          >
            <span>🔄</span> Đồng Bộ Lịch Học
          </button>

          <button
            type="button"
            onClick={handleOpenQuickScheduleModal}
            className="px-3.5 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs sm:text-sm rounded-xl border border-teal-300 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Xem và thay đổi lịch học cố định của lớp (sắp lớp), tự động áp dụng ngay cho 8 buổi học"
          >
            <span>🗓️</span> Sắp Lịch Học Lớp
          </button>

          <button
            type="button"
            onClick={handleSaveReport}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>💾</span> {saveSuccessMsg ? '✓ Đã Lưu Báo Cáo!' : 'Lưu Báo Cáo'}
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📊</span> Xuất Excel
          </button>

          <button
            type="button"
            onClick={handleExportImage}
            disabled={isExportingImage}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <span>📸</span> {isExportingImage ? 'Đang xuất ảnh...' : 'Xuất Ảnh Báo Cáo'}
          </button>

          {onOpenAnnualReport && (
            <button
              type="button"
              onClick={onOpenAnnualReport}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              title="Chuyển sang Bảng Tổng Hợp Cả Năm (12 tháng)"
            >
              <span>🗓️</span> Tổng Hợp Cả Năm
            </button>
          )}
        </div>
      </div>

      {/* Main Report Container to be exported as Image */}
      <div
        ref={reportRef}
        className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 overflow-x-auto min-w-[1100px]"
      >
        {/* Report Top Header (Identical to image) */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 relative">
          {/* Logo & Center Badge */}
          <div className="flex items-center gap-3 w-1/4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-2xl shadow-sm">
              👩‍🏫
            </div>
            <div>
              <h3 className="font-black text-sm text-brand-900 leading-tight font-display">
                {centerName}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Connect The World
              </p>
              <button
                onClick={() => {
                  const newName = prompt('Nhập tên lớp học / thương hiệu:', centerName);
                  if (newName && newName.trim()) setCenterName(newName.trim());
                }}
                className="text-[10px] text-brand-600 hover:underline font-bold"
              >
                ✏️ Đổi tên
              </button>
            </div>
          </div>

          {/* Main Title Center */}
          <div className="text-center flex-1">
            <h1 className="text-2xl sm:text-3xl font-black text-emerald-900 tracking-tight uppercase font-display mb-2">
              BÁO CÁO KẾT QUẢ HỌC TẬP THÁNG {selectedMonth}
            </h1>
            <div className="flex items-center justify-center gap-3">
              <span className="px-4 py-1 rounded-full bg-emerald-800 text-white font-black text-xs uppercase tracking-wider shadow-sm">
                ★ {centerName} ★
              </span>
              <span className="px-4 py-1 rounded-full bg-white text-emerald-800 border-2 border-emerald-700 font-black text-xs uppercase tracking-wider shadow-sm">
                {currentClass ? currentClass.name : 'LỚP HỌC'}
              </span>
            </div>
          </div>

          {/* Right Trophy / Graduation Cap Decoration */}
          <div className="w-1/4 flex justify-end items-center gap-2">
            <div className="text-right">
              <span className="text-3xl">🎓</span>
              <span className="text-3xl">🏆</span>
            </div>
          </div>
        </div>

        {/* Horizontal Scroll Controls & Helper Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/80 border border-slate-200 rounded-2xl text-xs shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <div>
              <span className="font-bold text-slate-800">
                Báo cáo tháng: <span className="text-blue-700 font-black">8 buổi học</span>
              </span>
              <span className="inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 bg-teal-100/90 text-teal-900 border border-teal-300 rounded-lg text-[11px] font-bold">
                <span>🗓️ Lịch học:</span>
                <strong>{currentClass?.description || formatScheduleSummary(getClassSchedule(selectedClassId)?.slots) || 'Thứ 2 & Thứ 5 (17:30 - 19:00)'}</strong>
                <button
                  type="button"
                  onClick={handleOpenQuickScheduleModal}
                  className="ml-1 text-teal-800 hover:text-teal-950 underline font-black cursor-pointer"
                  title="Đổi lịch học lớp và cập nhật ngay 8 buổi"
                >
                  [✏️ Đổi lịch]
                </button>
              </span>
            </div>
          </div>

          {/* Quick Jump & Edit Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenEditDates}
              className="px-2.5 py-1 bg-brand-100 hover:bg-brand-200 text-brand-800 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1"
            >
              <span>✏️</span> Sửa ngày 8 buổi
            </button>
            <button
              type="button"
              onClick={() => scrollToDay(1)}
              className="px-2.5 py-1 bg-blue-100/80 hover:bg-blue-200 text-blue-800 rounded-lg font-bold text-[11px] transition-all"
            >
              Buổi 1-4
            </button>
            <button
              type="button"
              onClick={() => scrollToDay(5)}
              className="px-2.5 py-1 bg-purple-100/80 hover:bg-purple-200 text-purple-800 rounded-lg font-bold text-[11px] transition-all"
            >
              Buổi 5-8
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={scrollToStart}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-95"
              title="Về buổi đầu tiên"
            >
              ⏮️ Buổi 1
            </button>
            <button
              type="button"
              onClick={() => scrollTable(-350)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1"
              title="Cuộn sang trái"
            >
              <span>◀️</span> Trái
            </button>
            <button
              type="button"
              onClick={() => scrollTable(350)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1"
              title="Cuộn sang phải"
            >
              Phải <span>▶️</span>
            </button>
            <button
              type="button"
              onClick={scrollToEnd}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-95"
              title="Đến buổi cuối cùng"
            >
              Buổi 8 ⏭️
            </button>
          </div>
        </div>

        {/* Search & Filter students in month */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
            <span className="text-slate-400">🔍</span>
            <input
              type="text"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Tìm học sinh theo tên hoặc E.Name trong tháng..."
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:border-brand-500 outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Lọc danh sách:</span>
            <button
              type="button"
              onClick={() => setStudentFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                studentFilter === 'ALL'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tất cả ({studentScores.length})
            </button>
            <button
              type="button"
              onClick={() => setStudentFilter('NO_BTVN')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${
                studentFilter === 'NO_BTVN'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <span>⚠️</span> Thiếu điểm / Chưa làm
            </button>
            <button
              type="button"
              onClick={() => setStudentFilter('EXCELLENT')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${
                studentFilter === 'EXCELLENT'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span>⭐</span> Điểm cao (≥ 8.0)
            </button>
          </div>
        </div>

        {/* Matrix Table with Sticky Columns and Horizontal Scroll */}
        <div
          ref={tableScrollRef}
          className="border-2 border-slate-300 rounded-2xl overflow-x-auto overflow-y-visible shadow-sm bg-white relative max-w-full"
          style={{ scrollbarWidth: 'thin' }}
        >
          <table className="border-collapse text-center min-w-full">
            {/* Header Row 1: Class & Sessions */}
            <thead>
              <tr className="border-b border-slate-300 font-black">
                {/* Class Column Header (Sticky Left) */}
                <th
                  rowSpan={2}
                  style={{ width: z.sttWidth, minWidth: z.sttWidth }}
                  className={`sticky left-0 z-30 bg-emerald-200 border-r border-slate-300 py-2.5 px-1 text-emerald-950 ${z.thMainFont}`}
                >
                  {currentClass ? currentClass.name : 'LỚP'}
                </th>
                <th
                  rowSpan={2}
                  style={{ left: z.sttWidth, width: z.nameWidth, minWidth: z.nameWidth }}
                  className={`sticky z-30 bg-slate-100 border-r border-slate-300 py-2.5 px-3 text-slate-800 text-left ${z.thMainFont}`}
                >
                  HỌ VÀ TÊN
                </th>
                <th
                  rowSpan={2}
                  style={{ left: `calc(${z.sttWidth} + ${z.nameWidth})`, width: z.enameWidth, minWidth: z.enameWidth }}
                  className={`sticky z-30 bg-slate-100 border-r-2 border-slate-400 py-2.5 px-2 text-slate-800 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.1)] ${z.thMainFont}`}
                >
                  E.NAME
                </th>

                {/* Session Columns (8 Sessions) */}
                {sessions.map((s, sIdx) => {
                  const palette = SESSION_PALETTES[sIdx % SESSION_PALETTES.length];
                  return (
                    <th
                      key={s.id}
                      colSpan={s.columns.length}
                      className={`${palette.bgHeader} border-r border-slate-300 py-2.5 px-2 group relative whitespace-nowrap`}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`font-black ${z.sessHeaderFont}`}>{s.name}</span>
                          <span className="text-xs opacity-90 font-bold">({s.date})</span>
                          <button
                            type="button"
                            onClick={() => handleOpenSingleDateEdit(s)}
                            title={`Sửa ngày buổi học này (${getFullDayNameFromDateStr(s.date)})`}
                            className="opacity-70 group-hover:opacity-100 text-blue-800 hover:text-blue-950 text-xs font-bold transition-opacity ml-0.5 bg-white/70 hover:bg-white px-1.5 py-0.5 rounded shadow-xs cursor-pointer"
                          >
                            ✏️
                          </button>
                        </div>
                        {getDayLabelFromDateStr(s.date) && (
                          <span
                            className="text-[10px] font-bold text-slate-700 bg-white/60 px-1.5 py-0.5 rounded shadow-2xs"
                            title={`Lịch học: ${getFullDayNameFromDateStr(s.date)} ${s.timeSlot ? `(${s.timeSlot})` : ''}`}
                          >
                            {getFullDayNameFromDateStr(s.date)}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* Final Column: ĐIỂM TB (Sticky Right) */}
                <th
                  rowSpan={2}
                  style={{ width: z.avgWidth, minWidth: z.avgWidth }}
                  className={`sticky right-0 z-30 bg-yellow-200 border-l-2 border-slate-400 py-2.5 px-2 text-amber-950 font-black shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.1)] ${z.thMainFont}`}
                >
                  ĐIỂM TB
                </th>
              </tr>

              {/* Header Row 2: Sub-columns under each session with inline rename & batch copy */}
              <tr className="border-b-2 border-slate-300 bg-slate-50">
                {sessions.map((s, sIdx) => {
                  const palette = SESSION_PALETTES[sIdx % SESSION_PALETTES.length];
                  return s.columns.map((col, cIdx) => (
                    <th
                      key={`${s.id}_${col.key}`}
                      className={`py-2 px-1 border-r border-slate-300 ${palette.light} text-center font-black whitespace-nowrap group/header`}
                      style={{ minWidth: col.key === 'linkScore' ? z.colWidthLink : z.colWidthSub }}
                    >
                      <div className="flex items-center justify-center gap-1 group/colheader">
                        {/* Clickable Column Header to Rename */}
                        <button
                          type="button"
                          onClick={() => handleOpenQuickRenameCol(s.id, s.name, cIdx, col.key, col.label)}
                          title={`Bấm vào đây hoặc biểu tượng bút chì để đổi tên đầu mục "${col.label}"`}
                          className={`hover:text-blue-900 hover:underline transition-colors flex items-center gap-0.5 font-black cursor-pointer ${z.subHeaderFont}`}
                        >
                          <span>{col.label}</span>
                          <span className="opacity-0 group-hover/header:opacity-100 text-[10px] text-amber-700 transition-opacity">✏️</span>
                        </button>

                        {col.key === 'linkScore' && (
                          <button
                            type="button"
                            onClick={() => handleSyncSingleColumnLink(s.id)}
                            title={`Đồng bộ điểm làm bài online từ hệ thống cho ${s.name} (giữ nguyên điểm cô đã nhập tay)`}
                            className="opacity-0 group-hover/header:opacity-100 text-blue-600 hover:text-blue-800 bg-white/95 hover:bg-white px-1 py-0.5 rounded text-[10px] font-bold shadow-2xs transition-opacity cursor-pointer ml-0.5"
                          >
                            🔄
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleQuickFillColumn(s.id, col.key, col.label, s.name)}
                          title={`Điền đồng loạt điểm cho cột ${col.label} (${s.name})`}
                          className="opacity-0 group-hover/header:opacity-100 text-brand-700 hover:text-brand-900 bg-white/95 hover:bg-white px-1 py-0.5 rounded text-[10px] font-bold shadow-2xs transition-opacity cursor-pointer"
                        >
                          📋
                        </button>
                      </div>
                    </th>
                  ));
                })}
              </tr>
            </thead>

            {/* Table Body: Student Rows */}
            <tbody className="divide-y divide-slate-200">
              {displayedStudentScores.length === 0 ? (
                <tr>
                  <td colSpan={sessions.reduce((acc, s) => acc + s.columns.length, 0) + 4} className="py-10 text-center text-slate-400 font-medium text-sm">
                    {studentScores.length === 0
                      ? 'Chưa có học sinh nào trong lớp. Vui lòng vào tab "Quản Lý Học Sinh" để thêm học sinh.'
                      : 'Không tìm thấy học sinh nào phù hợp với bộ lọc hiện tại.'}
                  </td>
                </tr>
              ) : (
                displayedStudentScores.map((std, sIdx) => (
                  <tr key={std.studentId} className="hover:bg-blue-50/30 transition-colors">
                    {/* STT (Sticky Left) */}
                    <td
                      style={{ width: z.sttWidth, minWidth: z.sttWidth }}
                      className={`sticky left-0 z-20 bg-white py-2 px-1 border-r border-slate-200 font-bold text-slate-400 ${z.inputFont}`}
                    >
                      {String(sIdx + 1).padStart(2, '0')}
                    </td>
                    {/* Họ và Tên (Sticky Left) */}
                    <td
                      style={{ left: z.sttWidth, width: z.nameWidth, minWidth: z.nameWidth }}
                      className={`sticky z-20 bg-white py-2 px-3 border-r border-slate-200 text-left whitespace-nowrap ${z.nameFont}`}
                    >
                      {std.studentName}
                    </td>
                    {/* E.NAME (Sticky Left) */}
                    <td
                      style={{ left: `calc(${z.sttWidth} + ${z.nameWidth})`, width: z.enameWidth, minWidth: z.enameWidth }}
                      className={`sticky z-20 bg-white py-2 px-2 border-r-2 border-slate-400 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.1)] ${z.enameFont}`}
                    >
                      {std.englishName || <span className="text-slate-300 font-normal">—</span>}
                    </td>

                    {/* Scores per session columns */}
                    {sessions.map((s, sessIdx) => {
                      const palette = SESSION_PALETTES[sessIdx % SESSION_PALETTES.length];
                      return s.columns.map(col => {
                        const val = std.scores?.[s.id]?.[col.key];
                        // Preserve exact input string entered by teacher
                        const displayVal = val !== undefined && val !== null ? String(val) : '';
                        const isAbsent = displayVal.toLowerCase() === 'x';
                        const isZero = displayVal === '0';

                        return (
                          <td
                            key={`${std.studentId}_${s.id}_${col.key}`}
                            className={`p-0 border-r border-slate-200 ${palette.light} relative group/cell`}
                          >
                            <input
                              type="text"
                              value={displayVal}
                              onChange={e => handleScoreChange(std.studentId, s.id, col.key, e.target.value)}
                              onBlur={() => {
                                saveCurrentReportImmediately(studentScoresRef.current, sessionsRef.current);
                                setAutoSaveStatus('saved');
                              }}
                              onPaste={e => {
                                const text = e.clipboardData.getData('text');
                                if (text && text.includes('\n')) {
                                  e.preventDefault();
                                  handlePasteColumn(sIdx, s.id, col.key, text);
                                }
                              }}
                              placeholder="-"
                              className={`w-full ${z.cellHeight} text-center ${z.inputFont} bg-transparent outline-none focus:bg-yellow-100 transition-colors ${
                                isAbsent ? 'text-rose-600 font-black' : isZero ? 'text-slate-400' : 'text-slate-900'
                              }`}
                            />
                            {/* Fast Copy Score Down to Column */}
                            {displayVal !== '' && (
                              <button
                                type="button"
                                onClick={() => handleCopyScoreToColumn(s.id, col.key, displayVal)}
                                title={`Sao chép điểm "${displayVal}" cho tất cả học sinh trong cột`}
                                className="hidden group-hover/cell:flex absolute -top-1.5 -right-1 bg-brand-600 hover:bg-brand-700 text-white rounded-full w-4 h-4 items-center justify-center text-[9px] shadow-sm z-10 transition-transform active:scale-90"
                              >
                                ↓
                              </button>
                            )}
                            {/* Link score online badge on hover */}
                            {col.key === 'linkScore' && displayVal !== '' && (() => {
                              const isAuto = (std.scores?.[s.id] as any)?.[LINK_SCORE_SOURCE_KEY] === 'auto';
                              return (
                                <span
                                  title={isAuto
                                    ? 'Điểm Link hệ thống tự điền từ bài làm online (sẽ tự cập nhật). Cô gõ điểm khác vào ô để giữ điểm của cô.'
                                    : 'Điểm Link cô nhập tay — không bao giờ bị đồng bộ ghi đè. Xóa trống ô nếu muốn hệ thống tự điền lại.'}
                                  className={`hidden group-hover/cell:block absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none ${isAuto ? 'text-blue-500' : 'text-amber-600'}`}
                                >
                                  {isAuto ? '🔗' : '✏️'}
                                </span>
                              );
                            })()}
                          </td>
                        );
                      });
                    })}

                    {/* ĐIỂM TB Column (Sticky Right) */}
                    <td
                      style={{ width: z.avgWidth, minWidth: z.avgWidth }}
                      className="sticky right-0 z-20 bg-amber-50 py-2 px-2 border-l-2 border-slate-400 font-black text-blue-900 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.1)]"
                    >
                      {std.averageScore > 0 ? (
                        <span className={`inline-block px-2.5 py-0.5 rounded-lg ${z.avgFont} ${
                          std.averageScore >= 9.0 ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-300' :
                          std.averageScore >= 8.0 ? 'bg-emerald-100 text-emerald-950' :
                          'text-slate-900'
                        }`}>
                          {std.averageScore.toFixed(2).replace('.', ',')}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Podium Ranking (Left) & Other Students (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
          {/* Left Column (5/12): BẢNG XẾP HẠNG HỌC SINH XUẤT SẮC */}
          <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Header Bar */}
            <div className="bg-emerald-800 text-white text-center py-2.5 px-4 font-black text-base tracking-wider uppercase flex items-center justify-center gap-2">
              <span>★</span>
              <span>BẢNG XẾP HẠNG HỌC SINH XUẤT SẮC</span>
              <span>★</span>
            </div>

            {/* Podium (Top 1, 2, 3) */}
            <div className="p-4 grid grid-cols-3 gap-3 flex-1 items-end">
              {/* Hạng 1 (Top 1 in yellow card) */}
              <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-3.5 text-center flex flex-col items-center justify-between min-h-[210px] shadow-sm">
                <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-white font-black text-2xl shadow-md border-2 border-white mb-2 relative">
                  1
                  <span className="absolute -bottom-2 text-sm">🎗️</span>
                </div>
                {top1 ? (
                  <>
                    <h4 className="font-black text-sm sm:text-base text-slate-900 leading-snug line-clamp-2">
                      {top1.studentName}
                    </h4>
                    <p className="text-xs sm:text-sm font-bold text-amber-900 mt-0.5">
                      {top1.englishName || '—'}
                    </p>
                    <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-600 font-display">
                      {top1.averageScore.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-slate-300 italic">Chưa có dữ liệu</span>
                )}
              </div>

              {/* Hạng 2 (Silver) */}
              <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-3.5 text-center flex flex-col items-center justify-between min-h-[185px] shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-slate-400 to-slate-200 flex items-center justify-center text-white font-black text-xl shadow-md border-2 border-white mb-2 relative">
                  2
                  <span className="absolute -bottom-2 text-sm">🎗️</span>
                </div>
                {top2 ? (
                  <>
                    <h4 className="font-black text-sm sm:text-base text-slate-900 leading-snug line-clamp-2">
                      {top2.studentName}
                    </h4>
                    <p className="text-xs sm:text-sm font-bold text-slate-700 mt-0.5">
                      {top2.englishName || '—'}
                    </p>
                    <div className="mt-2 text-xl sm:text-2xl font-black text-rose-600 font-display">
                      {top2.averageScore.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-slate-300 italic">Chưa có dữ liệu</span>
                )}
              </div>

              {/* Hạng 3 (Bronze) */}
              <div className="bg-orange-50/60 border-2 border-orange-300 rounded-2xl p-3.5 text-center flex flex-col items-center justify-between min-h-[170px] shadow-sm">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-700 to-amber-500 flex items-center justify-center text-white font-black text-lg shadow-md border-2 border-white mb-2 relative">
                  3
                  <span className="absolute -bottom-2 text-sm">🎗️</span>
                </div>
                {top3 ? (
                  <>
                    <h4 className="font-black text-sm sm:text-base text-slate-900 leading-snug line-clamp-2">
                      {top3.studentName}
                    </h4>
                    <p className="text-xs sm:text-sm font-bold text-amber-950 mt-0.5">
                      {top3.englishName || '—'}
                    </p>
                    <div className="mt-2 text-xl sm:text-2xl font-black text-rose-600 font-display">
                      {top3.averageScore.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-slate-300 italic">Chưa có dữ liệu</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column (7/12): DANH SÁCH HỌC VIÊN KHÁC */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Header Bar */}
            <div className="bg-emerald-800 text-white text-center py-2.5 px-4 font-black text-base tracking-wider uppercase">
              DANH SÁCH HỌC VIÊN KHÁC
            </div>

            {/* 2-Column List of Other Students */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 flex-1 overflow-y-auto max-h-[250px]">
              {otherStudents.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-sm text-slate-400 italic">
                  Chưa có thêm học viên nào khác có điểm trong danh sách.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {otherCol1.map(std => (
                      <div
                        key={std.studentId}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 text-sm"
                      >
                        <div className="truncate pr-2">
                          <span className="font-black text-slate-900">{std.studentName}</span>{' '}
                          {std.englishName && (
                            <span className="text-xs text-slate-500 font-bold">({std.englishName})</span>
                          )}
                        </div>
                        <span className="font-black text-blue-900 shrink-0 font-mono text-sm sm:text-base">
                          {std.averageScore.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {otherCol2.map(std => (
                      <div
                        key={std.studentId}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 text-sm"
                      >
                        <div className="truncate pr-2">
                          <span className="font-black text-slate-900">{std.studentName}</span>{' '}
                          {std.englishName && (
                            <span className="text-xs text-slate-500 font-bold">({std.englishName})</span>
                          )}
                        </div>
                        <span className="font-black text-blue-900 shrink-0 font-mono text-sm sm:text-base">
                          {std.averageScore.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer Legend (Exact match to sample image) */}
        <div className="pt-3 border-t-2 border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-600">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="text-blue-600 text-base">▶️</span>
              <span>Video BTVN: 0 - 10 điểm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-600 text-base">📖</span>
              <span>BTVN: 0 - 10 điểm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 text-base">📝</span>
              <span>Kiểm tra bài cũ: 0 - 10 điểm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-500 text-base">🏆</span>
              <span>Điểm thi đua trên lớp: 0 - 10 điểm</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-blue-900 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200">
            <span>⭐</span>
            <span className="font-black">Điểm TB tính từ các ô điểm có dữ liệu • Làm tròn 2 chữ số thập phân</span>
          </div>
        </div>
      </div>

      {/* Modal: Sắp / Đổi Lịch Học Lớp Trực Tiếp */}
      {showQuickScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-brand-900">🗓️ Sắp Lịch Học Cho Lớp: {currentClass?.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thay đổi lịch học sẽ tự động liên kết trực tiếp vào 8 buổi học trong báo cáo tháng & điểm danh
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Mẫu lịch phổ biến 1-Click */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">⚡ Chọn Mẫu Lịch Nhanh (1-Click):</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'T2 & T5 (17:30)', desc: 'Thứ 2 & Thứ 5 (17:30 - 19:00)' },
                  { label: 'T3 & T6 (17:30)', desc: 'Thứ 3 & Thứ 6 (17:30 - 19:00)' },
                  { label: 'T4 & T7 (18:00)', desc: 'Thứ 4 & Thứ 7 (18:00 - 19:30)' },
                  { label: 'T2 - 4 - 6 (17:30)', desc: 'Thứ 2 - 4 - 6 (17:30 - 19:00)' },
                  { label: 'T3 - 5 - 7 (17:30)', desc: 'Thứ 3 - 5 - 7 (17:30 - 19:00)' },
                  { label: 'T7 & CN (08:30)', desc: 'Thứ 7 & Chủ Nhật (08:30 - 10:00)' }
                ].map(tmpl => (
                  <button
                    key={tmpl.label}
                    type="button"
                    onClick={() => setScheduleDescInput(tmpl.desc)}
                    className={`px-3 py-2 text-xs rounded-xl font-bold border transition-all text-left ${
                      scheduleDescInput.trim() === tmpl.desc
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-200'
                    }`}
                  >
                    ⚡ {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tùy chỉnh lịch học */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-600">Lịch học chi tiết:</label>
              <input
                type="text"
                value={scheduleDescInput}
                onChange={e => setScheduleDescInput(e.target.value)}
                placeholder="VD: Thứ 3 & Thứ 6 (17:30 - 19:00)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 focus:border-teal-500 outline-none"
              />
              <p className="text-[11px] text-slate-500">
                💡 Nhập các thứ trong tuần (VD: Thứ 2 & Thứ 5, Thứ 3 & Thứ 6, T4-T7...) và khung giờ.
              </p>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowQuickScheduleModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveQuickSchedule}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <span>💾</span> Lưu & Áp Dụng Ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chỉnh Sửa Ngày Cho 8 Buổi Học */}
      {showEditDatesModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-brand-900">🗓️ Chỉnh Sửa Ngày Cho 8 Buổi Học</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tháng {selectedMonth}/{selectedYear} • Lớp {currentClass?.name || ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditDatesModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <span className="text-xs text-blue-900 font-bold">Lấy ngày tự động theo lịch của lớp:</span>
              <button
                type="button"
                onClick={() => {
                  const sched = generate8SessionsFromSchedule(selectedClassId, selectedMonth, selectedYear);
                  setTempDates(sched.map(s => ({ id: s.id, name: s.name, date: s.date })));
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition-all"
              >
                🔄 Đặt Lại Theo Lịch
              </button>
            </div>

            {/* List 8 sessions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tempDates.map((item, idx) => (
                <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-black text-brand-900">{item.name}</label>
                    <span className="text-[10px] text-slate-400 font-bold font-mono">{item.date}</span>
                  </div>
                  <div className="space-y-1">
                    <input
                      type="date"
                      value={convertDMYtoYMD(item.date)}
                      onChange={e => {
                        const newD = convertYMDtoDMY(e.target.value);
                        setTempDates(tempDates.map((t, i) => (i === idx ? { ...t, date: newD } : t)));
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold bg-white text-slate-800 outline-none focus:border-brand-500"
                    />
                    <input
                      type="text"
                      value={item.date}
                      onChange={e => {
                        const val = e.target.value;
                        setTempDates(tempDates.map((t, i) => (i === idx ? { ...t, date: val } : t)));
                      }}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-2.5 py-1 rounded-lg border border-slate-100 text-[11px] font-medium bg-white text-slate-600 outline-none focus:border-brand-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowEditDatesModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveEditDates}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-xl text-sm shadow-md transition-all"
              >
                💾 Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Sửa Ngày Cho 1 Buổi Học Riêng Lẻ */}
      {editingSingleSession && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-black text-brand-900">
                ✏️ Đổi Ngày Học: {editingSingleSession.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingSingleSession(null)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Chọn từ lịch:</label>
                <input
                  type="date"
                  value={convertDMYtoYMD(singleDateInput)}
                  onChange={e => setSingleDateInput(convertYMDtoDMY(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Hoặc nhập ngày (DD/MM/YYYY):</label>
                <input
                  type="text"
                  value={singleDateInput}
                  onChange={e => setSingleDateInput(e.target.value)}
                  placeholder="VD: 15/08/2026"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSingleSession(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveSingleDate}
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md"
              >
                💾 Cập Nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Sửa Tên 3 Đầu Mục Điểm Cho 8 Buổi Học */}
      {showEditColumnsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-brand-900 flex items-center gap-2">
                  <span>🏷️</span> Tùy Chỉnh Tên 3 Đầu Mục Điểm
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lớp {currentClass?.name || ''} • Tháng {selectedMonth}/{selectedYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditColumnsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Scope Selection */}
            <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200 space-y-2">
              <label className="block text-xs font-black text-amber-950 uppercase tracking-wide">
                Phạm vi áp dụng:
              </label>
              <div className="space-y-1.5 text-xs font-bold text-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="targetSession"
                    checked={targetColumnSessionId === 'ALL'}
                    onChange={() => setTargetColumnSessionId('ALL')}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Áp dụng cho <strong className="text-brand-700">TẤT CẢ 8 BUỔI HỌC</strong> trong tháng (Khuyên dùng)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="targetSession"
                    checked={targetColumnSessionId !== 'ALL'}
                    onChange={() => setTargetColumnSessionId(sessions[0]?.id || 's_buoi_1')}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Chỉ áp dụng cho riêng một buổi:</span>
                </label>
              </div>
              {targetColumnSessionId !== 'ALL' && (
                <select
                  value={targetColumnSessionId}
                  onChange={e => setTargetColumnSessionId(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2 bg-white rounded-xl border border-amber-300 text-xs font-bold text-slate-800 outline-none"
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.date})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 3 Column Label Inputs with Quick Chips */}
            <div className="space-y-4">
              {/* Column 1 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900">
                    Cột 1 <span className="text-slate-400 font-normal">(mặc định: Từ Vựng)</span>:
                  </label>
                  <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">Key: vocab</span>
                </div>
                <input
                  type="text"
                  value={col1Label}
                  onChange={e => setCol1Label(e.target.value)}
                  placeholder="Nhập tên cột 1..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-400 self-center">Gợi ý:</span>
                  {['Từ Vựng', 'Ngữ Pháp', 'Lý Thuyết', 'Nghe', 'Video BTVN'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCol1Label(chip)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                        col1Label === chip
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column 2 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900">
                    Cột 2 <span className="text-slate-400 font-normal">(mặc định: Test)</span>:
                  </label>
                  <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">Key: test</span>
                </div>
                <input
                  type="text"
                  value={col2Label}
                  onChange={e => setCol2Label(e.target.value)}
                  placeholder="Nhập tên cột 2..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-400 self-center">Gợi ý:</span>
                  {['Test', 'Bài Cũ', 'Mini Test', 'Kiểm Tra', 'Viết'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCol2Label(chip)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                        col2Label === chip
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column 3 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900">
                    Cột 3 <span className="text-slate-400 font-normal">(mặc định: điểm Link)</span>:
                  </label>
                  <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">Key: linkScore (Tự động đồng bộ bài tập online)</span>
                </div>
                <input
                  type="text"
                  value={col3Label}
                  onChange={e => setCol3Label(e.target.value)}
                  placeholder="Nhập tên cột 3..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-400 self-center">Gợi ý:</span>
                  {['điểm Link', 'BTVN', 'Làm App', 'Online', 'Nói (Speaking)'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCol3Label(chip)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                        col3Label === chip
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleResetColumnsToDefault}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              >
                🔄 Khôi phục mặc định
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditColumnsModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllColumns}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-xl text-sm shadow-md transition-all flex items-center gap-1.5"
                >
                  💾 Lưu Thay Đổi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Sửa Nhanh 1 Đầu Mục Điểm Cụ Thể */}
      {quickRenameCol && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-brand-900 flex items-center gap-1.5">
                  <span>✏️</span> Đổi Tên Đầu Mục Điểm
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  {quickRenameCol.sessionName} • Cột {quickRenameCol.colIndex + 1}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickRenameCol(null)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Nhập tên mới cho đầu mục:
                </label>
                <input
                  type="text"
                  value={quickRenameInput}
                  onChange={e => setQuickRenameInput(e.target.value)}
                  placeholder="VD: Từ Vựng, Ngữ Pháp, BTVN..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
                  autoFocus
                />
              </div>

              {/* Suggestions chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400">Chọn nhanh gợi ý:</span>
                <div className="flex flex-wrap gap-1.5">
                  {['Từ Vựng', 'Ngữ Pháp', 'Test', 'Bài Cũ', 'điểm Link', 'BTVN', 'Làm App', 'Nghe', 'Nói', 'Viết'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setQuickRenameInput(chip)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                        quickRenameInput === chip
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scope radio */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs font-bold text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quickScope"
                    checked={quickRenameScope === 'ALL'}
                    onChange={() => setQuickRenameScope('ALL')}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Áp dụng cho <strong className="text-brand-700">CẢ 8 BUỔI</strong> trong tháng</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quickScope"
                    checked={quickRenameScope === 'SINGLE'}
                    onChange={() => setQuickRenameScope('SINGLE')}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Chỉ áp dụng cho riêng {quickRenameCol.sessionName}</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuickRenameCol(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveQuickRenameCol}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-xl text-sm shadow-md transition-all"
              >
                💾 Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Action Toast */}
      {batchActionToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-brand-500/40 flex items-center gap-2 animate-bounce text-xs font-bold">
          <span className="text-base">📋</span>
          <span>{batchActionToast}</span>
        </div>
      )}
      {/* Modal: Xem Trước Ảnh Báo Cáo & Tùy Chọn Tải Về / Sao Chép */}
      {showPreviewModal && previewImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl shadow-xs">
                  📸
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-emerald-950">
                    Xem Trước Ảnh Báo Cáo Tháng {selectedMonth} - {currentClass?.name || ''}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Ảnh báo cáo định dạng chuẩn chuyên nghiệp, loại bỏ nút chỉnh sửa và thanh cuộn.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-base font-bold transition-all cursor-pointer"
                title="Đóng xem trước"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Scrollable High-Res Image Preview */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 flex items-start justify-center relative">
              {copySuccess && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-emerald-600 text-white font-bold px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 z-50 text-sm animate-bounce">
                  <span>✓</span>
                  <span>Đã sao chép ảnh vào bộ nhớ tạm! Cô có thể bấm Ctrl + V để dán trực tiếp vào Zalo.</span>
                </div>
              )}
              <img
                src={previewImageUrl}
                alt={`Báo cáo học tập tháng ${selectedMonth}`}
                className="max-w-full h-auto rounded-2xl shadow-xl border border-slate-300 bg-white"
              />
            </div>

            {/* Modal Footer: Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-white">
              <div className="text-xs text-slate-500 font-medium">
                💡 <span className="font-bold text-slate-700">Mẹo:</span> Bấm "Sao chép ảnh" để dán ngay vào Zalo (Ctrl + V) hoặc "Tải Xuất Ảnh" để lưu file ảnh (.png) về máy tính.
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyPreviewImage}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                    copySuccess
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <span>{copySuccess ? '✓' : '📋'}</span>
                  <span>{copySuccess ? 'Đã Sao Chép! (Dán Ctrl+V)' : 'Sao Chép Ảnh (Gửi Zalo)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPreviewImage}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>📥</span> Tải Xuất Ảnh Về Máy
                </button>

                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-all cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offscreen Clean Export Report Template (Strictly matches Image 2 - No pencils, no toolbar, no inputs, no scrollbars) */}
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '1420px',
          zIndex: -999,
          pointerEvents: 'none'
        }}
        aria-hidden="true"
      >
        <div
          ref={exportReportRef}
          style={{ width: '1420px', minWidth: '1420px', backgroundColor: '#ffffff' }}
          className="bg-white p-8 space-y-6 text-slate-900 font-sans"
        >
          {/* Top Header: Matching Image 2 */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-emerald-100 relative">
            {/* Left: Trophy + English Legend X5 */}
            <div className="flex items-center gap-3.5 w-1/4">
              <div className="w-14 h-14 rounded-2xl bg-[#15803d] flex items-center justify-center text-white shadow-md">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-2V3a1 1 0 00-1-1H8a1 1 0 00-1 1v1H5a3 3 0 00-3 3v2a5 5 0 004.5 4.96A6.002 6.002 0 0011 17.9V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.1a6.002 6.002 0 004.5-4.94A5 5 0 0022 9V7a3 3 0 00-3-3zM4 9V7a1 1 0 011-1h2v4.83A3.003 3.003 0 014 9zm16 0a3.003 3.003 0 01-3 1.83V6h2a1 1 0 011 1v2z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-black text-xl text-[#15803d] leading-tight font-display italic">
                  {centerName}
                </h3>
                <p className="text-[11px] text-emerald-700 font-black uppercase tracking-wider">
                  ENGLISH CLASS
                </p>
              </div>
            </div>

            {/* Center Title */}
            <div className="text-center flex-1">
              <h1 className="text-3xl font-black text-[#15803d] tracking-tight uppercase font-display mb-2">
                BÁO CÁO KẾT QUẢ HỌC TẬP THÁNG {selectedMonth}
              </h1>
              <div className="flex items-center justify-center gap-3">
                <span className="px-5 py-1.5 rounded-full bg-[#15803d] text-white font-black text-xs uppercase tracking-wider shadow-sm">
                  ★ {centerName} ★
                </span>
                <span className="px-5 py-1.5 rounded-full bg-white text-[#15803d] border-2 border-[#15803d] font-black text-xs uppercase tracking-wider shadow-sm">
                  LỚP {currentClass ? currentClass.name : ''}
                </span>
              </div>
            </div>

            {/* Right: Graduation Cap + Stars + Trophy */}
            <div className="w-1/4 flex justify-end items-center gap-3 text-right">
              <span className="text-amber-400 text-xl">⭐</span>
              <div className="relative">
                <svg className="w-14 h-14 text-[#15803d]" viewBox="0 0 64 64" fill="currentColor">
                  <path d="M32 8L2 22l30 14 26-12.13V38h4V22L32 8z"/>
                  <path d="M12 29.5V42c0 6.63 8.95 12 20 12s20-5.37 20-12V29.5L32 39 12 29.5z" opacity="0.85"/>
                </svg>
                <div className="absolute -bottom-1 -left-2 bg-amber-100 border border-amber-400 rounded px-1 text-[10px] font-bold text-amber-900 shadow-xs">
                  📜
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-400 flex items-center justify-center text-amber-600 shadow-sm text-2xl">
                🏆
              </div>
              <span className="text-amber-400 text-xl">✨</span>
            </div>
          </div>

          {/* Main Table: Static Clean Typography, No Pencils, No Inputs */}
          <div className="border-2 border-[#15803d] rounded-2xl overflow-hidden shadow-sm bg-white">
            <table className="w-full border-collapse text-center table-fixed">
              {/* Header Row 1 */}
              <thead>
                <tr className="border-b border-slate-300 font-black">
                  {/* Class Name (spans Họ và tên + E.NAME) */}
                  <th
                    colSpan={2}
                    className="bg-[#15803d] text-white border-r border-slate-300 py-3 px-3 uppercase text-sm font-black"
                    style={{ width: '280px' }}
                  >
                    LỚP {currentClass ? currentClass.name : ''}
                  </th>

                  {/* Sessions */}
                  {sessions.map((s, sIdx) => {
                    const palette = SESSION_PALETTES[sIdx % SESSION_PALETTES.length];
                    return (
                      <th
                        key={s.id}
                        colSpan={s.columns.length}
                        className={`${palette.bgHeader} border-r border-slate-300 py-2.5 px-1 font-black text-xs sm:text-sm whitespace-nowrap`}
                      >
                        {s.name.includes('học') ? s.name : s.name.replace('Buổi', 'Buổi học')}
                      </th>
                    );
                  })}

                  {/* ĐIỂM TB (spans 2 rows) */}
                  <th
                    rowSpan={2}
                    className="bg-[#15803d] text-white border-l border-slate-300 py-3 px-2 uppercase text-sm font-black align-middle"
                    style={{ width: '90px' }}
                  >
                    ĐIỂM TB
                  </th>
                </tr>

                {/* Header Row 2: Sub-columns */}
                <tr className="border-b-2 border-slate-300 bg-white font-black text-xs text-slate-800">
                  <th className="bg-white border-r border-slate-300 py-2 px-3 text-left font-black" style={{ width: '190px' }}>
                    HỌ VÀ TÊN
                  </th>
                  <th className="bg-white border-r border-slate-300 py-2 px-2 text-center font-black" style={{ width: '90px' }}>
                    E.NAME
                  </th>

                  {sessions.map((s, sIdx) => {
                    const palette = SESSION_PALETTES[sIdx % SESSION_PALETTES.length];
                    return s.columns.map((col) => (
                      <th
                        key={`${s.id}_${col.key}`}
                        className={`${palette.light} border-r border-slate-300 py-2 px-1 text-center font-black text-[11px] whitespace-nowrap`}
                      >
                        {col.label}
                      </th>
                    ));
                  })}
                </tr>
              </thead>

              {/* Body: All Students in class without filters */}
              <tbody className="divide-y divide-slate-200">
                {studentScores.map((std) => (
                  <tr key={std.studentId}>
                    {/* Họ và Tên */}
                    <td className="bg-white py-2 px-3 border-r border-slate-300 text-left font-black text-slate-900 text-xs truncate">
                      {std.studentName}
                    </td>
                    {/* E.Name */}
                    <td className="bg-white py-2 px-2 border-r border-slate-300 text-center font-black text-slate-900 text-xs truncate">
                      {std.englishName || ''}
                    </td>

                    {/* Scores */}
                    {sessions.map((s, sIdx) => {
                      const palette = SESSION_PALETTES[sIdx % SESSION_PALETTES.length];
                      return s.columns.map((col) => {
                        const val = std.scores?.[s.id]?.[col.key];
                        const displayVal = val !== undefined && val !== null ? String(val).trim() : '';
                        const isAbsent = displayVal.toLowerCase() === 'x';

                        return (
                          <td
                            key={`${std.studentId}_${s.id}_${col.key}`}
                            className={`py-1.5 px-0.5 border-r border-slate-300 ${palette.light} text-center font-black text-xs text-rose-600`}
                          >
                            {isAbsent ? 'x' : displayVal !== '' ? displayVal.replace('.', ',') : ''}
                          </td>
                        );
                      });
                    })}

                    {/* ĐIỂM TB */}
                    <td className="bg-emerald-50 py-2 px-2 border-l border-slate-300 text-center font-black text-slate-900 text-xs">
                      {std.averageScore > 0 ? std.averageScore.toFixed(2).replace('.', ',') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lower Section: Podium Ranking Left & Other Students Right */}
          <div className="grid grid-cols-12 gap-6 pt-2 items-stretch">
            {/* Left Box: ★ BẢNG XẾP HẠNG HỌC SINH XUẤT SẮC ★ */}
            <div className="col-span-6 bg-white rounded-2xl border-2 border-[#15803d] shadow-sm overflow-hidden flex flex-col">
              <div className="bg-[#15803d] text-white text-center py-2.5 px-4 font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2">
                <span>★</span>
                <span>BẢNG XẾP HẠNG HỌC SINH XUẤT SẮC</span>
                <span>★</span>
              </div>

              <div className="p-4 grid grid-cols-3 gap-3 flex-1 items-stretch bg-white">
                {/* Top 1 (Gold) */}
                <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-3.5 text-center flex flex-col items-center justify-between shadow-2xs">
                  {/* Medal 1 SVG */}
                  <div className="mb-2">
                    <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none">
                      <path d="M19 28L14 44L24 38L21 28" fill="#dc2626" />
                      <path d="M29 28L34 44L24 38L27 28" fill="#b91c1c" />
                      <circle cx="24" cy="20" r="15" fill="#facc15" stroke="#eab308" strokeWidth="2" />
                      <circle cx="24" cy="20" r="12" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
                      <text x="24" y="26" textAnchor="middle" fill="#713f12" fontSize="17" fontWeight="900" fontFamily="sans-serif">1</text>
                    </svg>
                  </div>
                  {top1 ? (
                    <>
                      <div className="font-black text-sm text-[#15803d] leading-tight mt-1 line-clamp-1">
                        {top1.studentName}
                      </div>
                      <div className="text-xs font-bold text-slate-700 mt-0.5">
                        {top1.englishName || '—'}
                      </div>
                      <div className="mt-2 text-3xl font-black text-rose-600 font-display">
                        {top1.averageScore.toFixed(2).replace('.', ',')}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Chưa có dữ liệu</span>
                  )}
                </div>

                {/* Top 2 (Silver) */}
                <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-3.5 text-center flex flex-col items-center justify-between shadow-2xs">
                  {/* Medal 2 SVG */}
                  <div className="mb-2">
                    <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none">
                      <path d="M19 28L14 44L24 38L21 28" fill="#2563eb" />
                      <path d="M29 28L34 44L24 38L27 28" fill="#1d4ed8" />
                      <circle cx="24" cy="20" r="15" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2" />
                      <circle cx="24" cy="20" r="12" fill="#f1f5f9" stroke="#64748b" strokeWidth="1" />
                      <text x="24" y="26" textAnchor="middle" fill="#1e293b" fontSize="17" fontWeight="900" fontFamily="sans-serif">2</text>
                    </svg>
                  </div>
                  {top2 ? (
                    <>
                      <div className="font-black text-sm text-[#15803d] leading-tight mt-1 line-clamp-1">
                        {top2.studentName}
                      </div>
                      <div className="text-xs font-bold text-slate-700 mt-0.5">
                        {top2.englishName || '—'}
                      </div>
                      <div className="mt-2 text-3xl font-black text-rose-600 font-display">
                        {top2.averageScore.toFixed(2).replace('.', ',')}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Chưa có dữ liệu</span>
                  )}
                </div>

                {/* Top 3 (Bronze) */}
                <div className="bg-orange-50/80 border-2 border-orange-300 rounded-2xl p-3.5 text-center flex flex-col items-center justify-between shadow-2xs">
                  {/* Medal 3 SVG */}
                  <div className="mb-2">
                    <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none">
                      <path d="M19 28L14 44L24 38L21 28" fill="#16a34a" />
                      <path d="M29 28L34 44L24 38L27 28" fill="#15803d" />
                      <circle cx="24" cy="20" r="15" fill="#ea580c" stroke="#c2410c" strokeWidth="2" />
                      <circle cx="24" cy="20" r="12" fill="#fed7aa" stroke="#9a3412" strokeWidth="1" />
                      <text x="24" y="26" textAnchor="middle" fill="#7c2d12" fontSize="17" fontWeight="900" fontFamily="sans-serif">3</text>
                    </svg>
                  </div>
                  {top3 ? (
                    <>
                      <div className="font-black text-sm text-[#15803d] leading-tight mt-1 line-clamp-1">
                        {top3.studentName}
                      </div>
                      <div className="text-xs font-bold text-slate-700 mt-0.5">
                        {top3.englishName || '—'}
                      </div>
                      <div className="mt-2 text-3xl font-black text-rose-600 font-display">
                        {top3.averageScore.toFixed(2).replace('.', ',')}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Chưa có dữ liệu</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Box: DANH SÁCH HỌC VIÊN KHÁC */}
            <div className="col-span-6 bg-white rounded-2xl border-2 border-[#15803d] shadow-sm overflow-hidden flex flex-col">
              <div className="bg-[#15803d] text-white text-center py-2.5 px-4 font-black text-sm tracking-wider uppercase">
                DANH SÁCH HỌC VIÊN KHÁC
              </div>

              <div className="p-4 bg-white flex-1 flex flex-col justify-center">
                {otherStudents.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400 italic">
                    Không có thêm học viên nào khác có điểm trong danh sách.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 border border-slate-200 rounded-xl overflow-hidden divide-x divide-slate-200">
                    {/* Column 1 */}
                    <div className="divide-y divide-slate-100">
                      {otherCol1.map(std => (
                        <div key={std.studentId} className="flex items-center justify-between py-1.5 px-3 text-xs bg-white">
                          <div className="truncate pr-2">
                            <span className="font-black text-slate-900">{std.studentName}</span>{' '}
                            {std.englishName && (
                              <span className="text-[11px] text-[#0284c7] font-bold">({std.englishName})</span>
                            )}
                          </div>
                          <span className="font-black text-rose-600 text-xs shrink-0 font-mono">
                            {std.averageScore.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Column 2 */}
                    <div className="divide-y divide-slate-100">
                      {otherCol2.map(std => (
                        <div key={std.studentId} className="flex items-center justify-between py-1.5 px-3 text-xs bg-white">
                          <div className="truncate pr-2">
                            <span className="font-black text-slate-900">{std.studentName}</span>{' '}
                            {std.englishName && (
                              <span className="text-[11px] text-[#0284c7] font-bold">({std.englishName})</span>
                            )}
                          </div>
                          <span className="font-black text-rose-600 text-xs shrink-0 font-mono">
                            {std.averageScore.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      ))}
                      {otherCol2.length === 0 && otherCol1.length > 0 && (
                        <div className="py-2 px-3 text-center text-xs text-slate-300 italic">—</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Legend: Exact Match to Image 2 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-3">
              {finalLegendLabels.map((lbl, idx) => {
                const icons = ['▶️', '📋', '📝', '🏆', '📚'];
                const icon = icons[idx % icons.length];
                return (
                  <div
                    key={lbl}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs"
                  >
                    <span className="text-sm">{icon}</span>
                    <span>{lbl}: 0 - 10 điểm</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 px-4 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
              <span className="text-amber-500 text-sm">⭐</span>
              <span className="font-black text-slate-800">
                Điểm TB tính từ các ô điểm có dữ liệu. Làm tròn 2 chữ số thập phân
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
