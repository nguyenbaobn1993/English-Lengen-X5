import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  ClassRoom,
  Student,
  ClassScheduleConfig,
  WeeklyTimeSlot,
  AttendanceRecord,
  AttendanceStudentItem,
  AttendanceStatus
} from '../../types';
import {
  getClasses,
  getStudents,
  getClassSchedule,
  getClassSchedules,
  saveClassSchedule,
  getAttendanceRecords,
  getAttendanceRecord,
  saveAttendanceRecord,
  deleteAttendanceRecord,
  subscribeToSync
} from '../../services/assignmentService';

const DAY_OPTIONS = [
  { value: 2, label: 'Thứ Hai', short: 'T2' },
  { value: 3, label: 'Thứ Ba', short: 'T3' },
  { value: 4, label: 'Thứ Tư', short: 'T4' },
  { value: 5, label: 'Thứ Năm', short: 'T5' },
  { value: 6, label: 'Thứ Sáu', short: 'T6' },
  { value: 7, label: 'Thứ Bảy', short: 'T7' },
  { value: 1, label: 'Chủ Nhật', short: 'CN' }
];

const getDayName = (dayNum: number): string => {
  const found = DAY_OPTIONS.find(d => d.value === dayNum);
  return found ? found.label : `Thứ ${dayNum}`;
};

const getDayNumFromDate = (dateStr: string): number => {
  if (!dateStr) return 1;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    const jsDay = dt.getDay(); // 0 = CN, 1 = T2, 2 = T3...
    return jsDay === 0 ? 1 : jsDay + 1;
  }
  const dt = new Date(dateStr);
  const jsDay = dt.getDay();
  return jsDay === 0 ? 1 : jsDay + 1;
};

export const parseScheduleSlotsFromDesc = (desc?: string, defaultRoom = 'Phòng A1'): WeeklyTimeSlot[] => {
  if (!desc || !desc.trim()) return [];
  const raw = desc.toLowerCase();

  let startTime = '17:30';
  let endTime = '19:00';
  const timeMatch = desc.match(/(\d{1,2})[h:](\d{2})?\s*[-–—]\s*(\d{1,2})[h:](\d{2})?/i);
  if (timeMatch) {
    const h1 = String(timeMatch[1]).padStart(2, '0');
    const m1 = timeMatch[2] ? String(timeMatch[2]).padStart(2, '0') : '00';
    const h2 = String(timeMatch[3]).padStart(2, '0');
    const m2 = timeMatch[4] ? String(timeMatch[4]).padStart(2, '0') : '00';
    startTime = `${h1}:${m1}`;
    endTime = `${h2}:${m2}`;
  }

  const dayMap = [
    { num: 1, name: 'Chủ Nhật', patterns: [/chủ nhật/i, /chu nhat/i, /\bcn\b/i] },
    { num: 2, name: 'Thứ Hai', patterns: [/thứ hai/i, /thu hai/i, /thứ 2\b/i, /thu 2\b/i, /\bt2\b/i] },
    { num: 3, name: 'Thứ Ba', patterns: [/thứ ba/i, /thu ba/i, /thứ 3\b/i, /thu 3\b/i, /\bt3\b/i] },
    { num: 4, name: 'Thứ Tư', patterns: [/thứ tư/i, /thu tu/i, /thứ 4\b/i, /thu 4\b/i, /\bt4\b/i] },
    { num: 5, name: 'Thứ Năm', patterns: [/thứ năm/i, /thu nam/i, /thứ 5\b/i, /thu 5\b/i, /\bt5\b/i] },
    { num: 6, name: 'Thứ Sáu', patterns: [/thứ sáu/i, /thu sau/i, /thứ 6\b/i, /thu 6\b/i, /\bt6\b/i] },
    { num: 7, name: 'Thứ Bảy', patterns: [/thứ bảy/i, /thu bay/i, /thứ 7\b/i, /thu 7\b/i, /\bt7\b/i] }
  ];

  const matched: WeeklyTimeSlot[] = [];
  dayMap.forEach(d => {
    if (d.patterns.some(p => p.test(raw))) {
      matched.push({
        id: `slot_${d.num}`,
        dayOfWeek: d.num,
        dayLabel: d.name,
        startTime,
        endTime,
        room: defaultRoom
      });
    }
  });

  return matched;
};

const getTodayDateStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const ScheduleAndAttendance: React.FC = () => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassId, setSelectedClassIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_schedule_class_id') || '';
    }
    return '';
  });
  const setSelectedClassId = (id: string) => {
    setSelectedClassIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_schedule_class_id', id);
    }
  };

  const [activeTab, setActiveTabState] = useState<'schedule' | 'attendance' | 'history'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_teacher_schedule_tab') as any;
      if (saved === 'schedule' || saved === 'attendance' || saved === 'history') return saved;
    }
    return 'attendance';
  });
  const setActiveTab = (tab: 'schedule' | 'attendance' | 'history') => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_schedule_tab', tab);
    }
  };

  // Schedule states
  const [scheduleConfig, setScheduleConfig] = useState<ClassScheduleConfig | null>(null);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(2);
  const [slots, setSlots] = useState<WeeklyTimeSlot[]>([]);
  const [defaultRoom, setDefaultRoom] = useState<string>('Phòng A1');
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);

  // Attendance states
  const [selectedDate, setSelectedDateState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_schedule_date') || getTodayDateStr();
    }
    return getTodayDateStr();
  });
  const setSelectedDate = (d: string) => {
    setSelectedDateState(d);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_schedule_date', d);
    }
  };
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceItems, setAttendanceItems] = useState<AttendanceStudentItem[]>([]);
  const [lessonTopic, setLessonTopic] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [attendanceSavedMsg, setAttendanceSavedMsg] = useState(false);

  // History states
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);

  // All schedules from storage/cloud
  const [allSchedules, setAllSchedules] = useState<ClassScheduleConfig[]>(() => getClassSchedules());
  const [showAllClasses, setShowAllClasses] = useState<boolean>(false);

  // Load classes and schedules
  const refreshClasses = () => {
    const cls = getClasses();
    setClasses(cls);
    setAllSchedules(getClassSchedules());
  };

  // Helper to get slots for any class
  const getClassSlots = (c: ClassRoom): WeeklyTimeSlot[] => {
    const sched = allSchedules.find(s => s.classId === c.id || (s.className && s.className.toLowerCase() === c.name.toLowerCase()));
    if (sched && sched.slots && sched.slots.length > 0) {
      return sched.slots;
    }
    return parseScheduleSlotsFromDesc(c.description);
  };

  // Day number for selected date (1 = CN, 2 = T2, 3 = T3, 4 = T4, ...)
  const currentDayNum = getDayNumFromDate(selectedDate);

  // Filter classes scheduled for the selected day
  const classesForSelectedDay = useMemo(() => {
    return classes.filter(c => {
      const classSlots = getClassSlots(c);
      return classSlots.some(s => s.dayOfWeek === currentDayNum);
    });
  }, [classes, allSchedules, currentDayNum]);

  // Other classes not scheduled on the selected day
  const otherClasses = useMemo(() => {
    const todayIds = new Set(classesForSelectedDay.map(c => c.id));
    return classes.filter(c => !todayIds.has(c.id));
  }, [classes, classesForSelectedDay]);

  // Auto-switch to first class only if no class is selected or selected class no longer exists
  useEffect(() => {
    if (!selectedClassId) {
      if (classesForSelectedDay.length > 0) {
        setSelectedClassId(classesForSelectedDay[0].id);
      } else if (classes.length > 0) {
        setSelectedClassId(classes[0].id);
      }
    } else {
      const exists = classes.some(c => c.id === selectedClassId);
      if (!exists && classes.length > 0) {
        setSelectedClassId(classesForSelectedDay.length > 0 ? classesForSelectedDay[0].id : classes[0].id);
      }
    }
  }, [classesForSelectedDay, classes]);

  useEffect(() => {
    refreshClasses();
    const unsub = subscribeToSync(() => refreshClasses());
    return () => unsub();
  }, []);

  // When selected class changes, load schedule, students, attendance, history
  useEffect(() => {
    if (!selectedClassId) return;

    // Load students
    const classStds = getStudents(selectedClassId);
    setStudents(classStds);

    // Load schedule
    const sched = getClassSchedule(selectedClassId);
    if (sched) {
      setScheduleConfig(sched);
      setSessionsPerWeek(sched.sessionsPerWeek || sched.slots.length || 2);
      setSlots(sched.slots || []);
      setDefaultRoom(sched.roomDefault || 'Phòng A1');
    } else {
      // Default: 2 sessions (T2 & T5)
      setScheduleConfig(null);
      setSessionsPerWeek(2);
      setSlots([
        { id: `slot_1`, dayOfWeek: 2, dayLabel: 'Thứ Hai', startTime: '17:30', endTime: '19:00', room: 'Phòng A1' },
        { id: `slot_2`, dayOfWeek: 5, dayLabel: 'Thứ Năm', startTime: '17:30', endTime: '19:00', room: 'Phòng A1' }
      ]);
      setDefaultRoom('Phòng A1');
    }

    // Load history
    const hist = getAttendanceRecords(selectedClassId);
    setHistoryRecords(hist);

    // Load attendance for current selectedDate
    loadAttendanceForDate(selectedClassId, selectedDate, classStds);
  }, [selectedClassId]);

  // Load attendance when selectedDate changes
  useEffect(() => {
    if (!selectedClassId) return;
    loadAttendanceForDate(selectedClassId, selectedDate, students);
  }, [selectedDate]);

  const loadAttendanceForDate = (classId: string, date: string, currentStudents: Student[]) => {
    const existing = getAttendanceRecord(classId, date);
    setSelectedStudentIds(new Set()); // Reset selections

    if (existing && existing.records && existing.records.length > 0) {
      // Merge with current students in case some were added/removed
      const map = new Map<string, AttendanceStudentItem>();
      existing.records.forEach(r => map.set(r.studentId, r));

      const merged: AttendanceStudentItem[] = currentStudents.map(s => {
        const found = map.get(s.id);
        if (found) {
          return {
            ...found,
            studentName: s.name,
            englishName: s.englishName,
            avatar: s.avatar,
            rollNumber: s.rollNumber
          };
        }
        return {
          studentId: s.id,
          studentName: s.name,
          englishName: s.englishName,
          avatar: s.avatar,
          rollNumber: s.rollNumber,
          status: 'present',
          note: ''
        };
      });
      setAttendanceItems(merged);
      setLessonTopic(existing.lessonTopic || '');
    } else {
      // Default all present
      const initList: AttendanceStudentItem[] = currentStudents.map(s => ({
        studentId: s.id,
        studentName: s.name,
        englishName: s.englishName,
        avatar: s.avatar,
        rollNumber: s.rollNumber,
        status: 'present',
        note: ''
      }));
      setAttendanceItems(initList);
      setLessonTopic('');
    }
  };

  // ==================== SCHEDULE ACTIONS ====================
  const handleApplyTemplate = (type: '2_t2_t5' | '2_t3_t6' | '2_t4_t7' | '3_t2_t4_t6' | '3_t3_t5_t7' | 'weekend') => {
    if (type === '2_t2_t5') {
      setSessionsPerWeek(2);
      setSlots([
        { id: `slot_${Date.now()}_1`, dayOfWeek: 2, dayLabel: 'Thứ Hai', startTime: '17:30', endTime: '19:00', room: defaultRoom },
        { id: `slot_${Date.now()}_2`, dayOfWeek: 5, dayLabel: 'Thứ Năm', startTime: '17:30', endTime: '19:00', room: defaultRoom }
      ]);
    } else if (type === '2_t3_t6') {
      setSessionsPerWeek(2);
      setSlots([
        { id: `slot_${Date.now()}_1`, dayOfWeek: 3, dayLabel: 'Thứ Ba', startTime: '17:30', endTime: '19:00', room: defaultRoom },
        { id: `slot_${Date.now()}_2`, dayOfWeek: 6, dayLabel: 'Thứ Sáu', startTime: '17:30', endTime: '19:00', room: defaultRoom }
      ]);
    } else if (type === '2_t4_t7') {
      setSessionsPerWeek(2);
      setSlots([
        { id: `slot_${Date.now()}_1`, dayOfWeek: 4, dayLabel: 'Thứ Tư', startTime: '18:00', endTime: '19:30', room: defaultRoom },
        { id: `slot_${Date.now()}_2`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '18:00', endTime: '19:30', room: defaultRoom }
      ]);
    } else if (type === '3_t2_t4_t6') {
      setSessionsPerWeek(3);
      setSlots([
        { id: `slot_${Date.now()}_1`, dayOfWeek: 2, dayLabel: 'Thứ Hai', startTime: '17:30', endTime: '19:00', room: defaultRoom },
        { id: `slot_${Date.now()}_2`, dayOfWeek: 4, dayLabel: 'Thứ Tư', startTime: '17:30', endTime: '19:00', room: defaultRoom },
        { id: `slot_${Date.now()}_3`, dayOfWeek: 6, dayLabel: 'Thứ Sáu', startTime: '17:30', endTime: '19:00', room: defaultRoom }
      ]);
    } else if (type === '3_t3_t5_t7') {
      setSessionsPerWeek(3);
      setSlots([
        { id: `slot_${Date.now()}_1`, dayOfWeek: 3, dayLabel: 'Thứ Ba', startTime: '17:30', endTime: '19:00', room: defaultRoom },
        { id: `slot_${Date.now()}_2`, dayOfWeek: 5, dayLabel: 'Thứ Năm', startTime: '17:30', endTime: '19:00', room: defaultRoom },
        { id: `slot_${Date.now()}_3`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '17:30', endTime: '19:00', room: defaultRoom }
      ]);
    } else if (type === 'weekend') {
      setSessionsPerWeek(2);
      setSlots([
        { id: `slot_${Date.now()}_1`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '08:30', endTime: '10:00', room: defaultRoom },
        { id: `slot_${Date.now()}_2`, dayOfWeek: 1, dayLabel: 'Chủ Nhật', startTime: '08:30', endTime: '10:00', room: defaultRoom }
      ]);
    }
  };

  const handleAddSlot = () => {
    const newSlot: WeeklyTimeSlot = {
      id: `slot_${Date.now()}`,
      dayOfWeek: 2,
      dayLabel: 'Thứ Hai',
      startTime: '17:30',
      endTime: '19:00',
      room: defaultRoom
    };
    setSlots(prev => [...prev, newSlot]);
    setSessionsPerWeek(prev => prev + 1);
  };

  const handleRemoveSlot = (slotId: string) => {
    setSlots(prev => prev.filter(s => s.id !== slotId));
    setSessionsPerWeek(prev => Math.max(1, prev - 1));
  };

  const handleUpdateSlot = (slotId: string, updates: Partial<WeeklyTimeSlot>) => {
    setSlots(prev =>
      prev.map(s => {
        if (s.id !== slotId) return s;
        const updated = { ...s, ...updates };
        if (updates.dayOfWeek !== undefined) {
          updated.dayLabel = getDayName(updates.dayOfWeek);
        }
        return updated;
      })
    );
  };

  const handleSaveSchedule = () => {
    const currentClass = classes.find(c => c.id === selectedClassId);
    if (!currentClass) return;

    const config: ClassScheduleConfig = {
      id: `sched_${selectedClassId}`,
      classId: selectedClassId,
      className: currentClass.name,
      sessionsPerWeek: slots.length,
      slots,
      roomDefault: defaultRoom,
      updatedAt: new Date().toISOString()
    };

    saveClassSchedule(config);
    setScheduleConfig(config);
    setScheduleSavedMsg(true);
    setTimeout(() => setScheduleSavedMsg(false), 3000);
  };

  // ==================== ATTENDANCE ACTIONS ====================
  // Check if current date matches a scheduled day of week
  const matchedSlot = slots.find(s => s.dayOfWeek === currentDayNum);

  // Single / Select-all toggles
  const handleToggleSelectAll = () => {
    if (selectedStudentIds.size === attendanceItems.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(attendanceItems.map(s => s.studentId)));
    }
  };

  const handleToggleSelectOne = (stdId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(stdId)) next.delete(stdId);
      else next.add(stdId);
      return next;
    });
  };

  // 1-Click: Mark ALL present
  const handleMarkAll = (status: AttendanceStatus) => {
    setAttendanceItems(prev => prev.map(item => ({ ...item, status })));
  };

  // Mark selected students
  const handleMarkSelected = (status: AttendanceStatus) => {
    if (selectedStudentIds.size === 0) return;
    setAttendanceItems(prev =>
      prev.map(item => (selectedStudentIds.has(item.studentId) ? { ...item, status } : item))
    );
    setSelectedStudentIds(new Set()); // Clear selection after applying
  };

  // Individual student status change
  const handleUpdateStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendanceItems(prev =>
      prev.map(item => (item.studentId === studentId ? { ...item, status } : item))
    );
  };

  const handleUpdateStudentNote = (studentId: string, note: string) => {
    setAttendanceItems(prev =>
      prev.map(item => (item.studentId === studentId ? { ...item, note } : item))
    );
  };

  // Compute summary metrics
  const totalStudents = attendanceItems.length;
  const presentCount = attendanceItems.filter(i => i.status === 'present').length;
  const excusedCount = attendanceItems.filter(i => i.status === 'absent_excused').length;
  const unexcusedCount = attendanceItems.filter(i => i.status === 'absent_unexcused').length;
  const lateCount = attendanceItems.filter(i => i.status === 'late').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  const handleSaveAttendance = () => {
    const currentClass = classes.find(c => c.id === selectedClassId);
    if (!currentClass) return;

    const record: AttendanceRecord = {
      id: `att_${selectedClassId}_${selectedDate}`,
      classId: selectedClassId,
      className: currentClass.name,
      date: selectedDate,
      dayOfWeek: currentDayNum,
      dayLabel: getDayName(currentDayNum),
      timeSlot: matchedSlot ? `${matchedSlot.startTime} - ${matchedSlot.endTime}` : '',
      lessonTopic: lessonTopic.trim(),
      records: attendanceItems,
      summary: {
        total: totalStudents,
        present: presentCount,
        absentExcused: excusedCount,
        absentUnexcused: unexcusedCount,
        late: lateCount,
        rate: attendanceRate
      },
      updatedAt: new Date().toISOString()
    };

    saveAttendanceRecord(record);
    setHistoryRecords(getAttendanceRecords(selectedClassId));
    setAttendanceSavedMsg(true);
    setTimeout(() => setAttendanceSavedMsg(false), 3000);
  };

  // Export attendance sheet to Excel
  const handleExportAttendanceExcel = () => {
    const currentClass = classes.find(c => c.id === selectedClassId);
    const className = currentClass?.name || 'LopHoc';

    const excelData = attendanceItems.map((item, idx) => {
      let statusText = 'Có mặt';
      if (item.status === 'absent_excused') statusText = 'Vắng có phép';
      else if (item.status === 'absent_unexcused') statusText = 'Vắng không phép';
      else if (item.status === 'late') statusText = 'Đi muộn';

      return {
        'STT': idx + 1,
        'Số BD': item.rollNumber || String(idx + 1).padStart(2, '0'),
        'Họ và Tên': item.studentName,
        'Tên Tiếng Anh': item.englishName || '',
        'Trạng Thái': statusText,
        'Ghi Chú': item.note || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DiemDanh');

    // Filename
    const filename = `DiemDanh_${className}_${selectedDate}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const currentClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-700 to-cyan-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              <span>🗓️</span> QUẢN TRỊ LỚP HỌC & ĐIỂM DANH
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight font-display">
              LỊCH HỌC & ĐIỂM DANH HỌC SINH
            </h1>
            <p className="text-teal-100 text-xs sm:text-sm font-medium mt-1">
              Thiết lập lịch học theo tuần (thứ mấy, mấy giờ) và điểm danh nhanh chóng với tính năng chọn 1 hoặc tất cả.
            </p>
          </div>

          {/* Class Picker */}
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20 flex flex-col gap-1 w-full md:w-auto min-w-[260px]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-teal-200 uppercase">Chọn Lớp Quản Lý:</label>
              {classesForSelectedDay.length > 0 && (
                <span className="text-[10px] bg-emerald-400/30 text-emerald-200 px-1.5 py-0.5 rounded font-bold">
                  {getDayName(currentDayNum)}: {classesForSelectedDay.length} lớp
                </span>
              )}
            </div>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="bg-white text-slate-900 font-black text-sm px-3 py-2 rounded-xl outline-none shadow-sm cursor-pointer"
            >
              {classesForSelectedDay.length > 0 && (
                <optgroup label={`⭐ Lớp học ${getDayName(currentDayNum)} (${classesForSelectedDay.length} lớp)`}>
                  {classesForSelectedDay.map(c => {
                    const cSlots = getClassSlots(c);
                    const daySlot = cSlots.find(s => s.dayOfWeek === currentDayNum);
                    const t = daySlot ? ` (${daySlot.startTime}-${daySlot.endTime})` : '';
                    return (
                      <option key={c.id} value={c.id}>
                        ★ {c.name}{t} ({c.studentCount || 0} HS)
                      </option>
                    );
                  })}
                </optgroup>
              )}
              <optgroup label={classesForSelectedDay.length > 0 ? "Các lớp học khác" : "Toàn bộ lớp học"}>
                {otherClasses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.studentCount || 0} HS)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'attendance'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">📋</span> Điểm Danh Học Sinh
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'schedule'
              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">📅</span> Lịch Học Của Lớp
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'history'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">📜</span> Lịch Sử Điểm Danh ({historyRecords.length})
        </button>
      </div>

      {/* ==================== TAB 1: ATTENDANCE TRACKING ==================== */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* LỚP HỌC THEO NGÀY THỰC TẾ (VÍ DỤ THỨ 4 HIỆN CÁC LỚP THỨ 4) */}
          <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-teal-500/30 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-800/50 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-2xl shadow-inner shrink-0">
                  📅
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-white font-display">
                      Lịch Học {getDayName(currentDayNum)}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-xs">
                      {classesForSelectedDay.length} lớp có lịch
                    </span>
                    {selectedDate === getTodayDateStr() && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-amber-950">
                        Hôm Nay
                      </span>
                    )}
                  </div>
                  <p className="text-teal-200/80 text-xs mt-0.5">
                    Hệ thống tự động lọc và hiển thị danh sách các lớp học theo ngày thực tế. Bấm vào lớp để điểm danh ngay!
                  </p>
                </div>
              </div>

              {/* Date quick switcher & toggle all */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20">
                  <span className="text-xs text-teal-200 mr-2 font-bold">Ngày:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer [color-scheme:dark]"
                  />
                </div>
                <button
                  onClick={() => setSelectedDate(getTodayDateStr())}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedDate === getTodayDateStr()
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  ⚡ Hôm nay
                </button>
                <button
                  onClick={() => setShowAllClasses(prev => !prev)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-teal-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="Bấm để xem danh sách toàn bộ 22 lớp học"
                >
                  <span>{showAllClasses ? '▲ Thu gọn' : '📂 Xem tất cả 22 lớp'}</span>
                </button>
              </div>
            </div>

            {/* Class Cards for Selected Day */}
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-teal-300 mb-2 flex items-center justify-between">
                <span>⚡ CÁC LỚP HỌC {getDayName(currentDayNum).toUpperCase()} ({classesForSelectedDay.length} LỚP):</span>
                <span className="text-[11px] font-normal text-teal-300/70 lowercase italic">
                  *đang chọn lớp {currentClass?.name}
                </span>
              </div>

              {classesForSelectedDay.length === 0 ? (
                <div className="p-4 bg-white/5 rounded-2xl border border-dashed border-teal-500/30 text-center text-teal-200 text-xs">
                  ℹ️ {getDayName(currentDayNum)} không có lớp nào theo lịch cố định. Cô có thể bấm <b>"📂 Xem tất cả 22 lớp"</b> ở trên để chọn lớp điểm danh bù.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {classesForSelectedDay.map(c => {
                    const isSelected = c.id === selectedClassId;
                    const cSlots = getClassSlots(c);
                    const daySlot = cSlots.find(s => s.dayOfWeek === currentDayNum) || cSlots[0];
                    const timeStr = daySlot ? `${daySlot.startTime} - ${daySlot.endTime}` : '';

                    // Attendance status for this class today
                    const attRecord = getAttendanceRecord(c.id, selectedDate);
                    const isTaken = !!(attRecord && attRecord.records && attRecord.records.length > 0);
                    const presentCount = isTaken ? attRecord.records.filter(r => r.status === 'present').length : 0;
                    const totalCount = isTaken ? attRecord.records.length : (c.studentCount || 0);

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClassId(c.id)}
                        className={`text-left p-3.5 rounded-2xl border transition-all relative overflow-hidden group cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-br from-teal-500 to-emerald-600 border-white text-white shadow-lg ring-2 ring-teal-300 scale-102'
                            : 'bg-white/10 hover:bg-white/15 border-white/10 text-white hover:border-teal-400/50'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute top-2 right-2 text-[10px] bg-white text-teal-800 font-black px-1.5 py-0.5 rounded-md shadow-xs animate-pulse">
                            Đang chọn
                          </span>
                        )}
                        <div className="font-black text-base sm:text-lg flex items-center gap-1.5">
                          <span>🏫</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <div className={`text-xs mt-1 font-semibold flex items-center gap-1 ${isSelected ? 'text-teal-100' : 'text-teal-300'}`}>
                          <span>⏰</span>
                          <span>{timeStr || 'Chưa xếp giờ'}</span>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 text-[11px]">
                          <span className={isSelected ? 'text-teal-100' : 'text-slate-300'}>
                            👥 {c.studentCount || 0} HS
                          </span>
                          {isTaken ? (
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              isSelected ? 'bg-white/30 text-white' : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                            }`}>
                              ✅ Đã điểm danh ({presentCount}/{totalCount})
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              isSelected ? 'bg-amber-400 text-amber-950 font-black' : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                            }`}>
                              ⏳ Chưa điểm danh
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Optional: All other classes if teacher expanded */}
            {showAllClasses && (
              <div className="pt-3 border-t border-teal-800/40 space-y-2 animate-fade-in">
                <div className="text-xs font-black uppercase tracking-wider text-teal-400">
                  📂 CÁC LỚP HỌC KHÁC ({otherClasses.length} LỚP - ĐIỂM DANH BÙ):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {otherClasses.map(c => {
                    const isSelected = c.id === selectedClassId;
                    const cSlots = getClassSlots(c);
                    const slotDesc = cSlots.map(s => s.dayLabel).join(', ');
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClassId(c.id)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white border-white shadow-md font-bold'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="font-bold truncate text-white">{c.name}</div>
                        <div className="text-[10px] text-teal-300/80 truncate mt-0.5">
                          {slotDesc || c.description || 'Lịch khác'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Controls & Date bar */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">
                    Ngày Điểm Danh:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="border border-slate-300 rounded-xl px-3 py-2 font-bold text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                    <button
                      onClick={() => setSelectedDate(getTodayDateStr())}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                    >
                      Hôm nay
                    </button>
                  </div>
                </div>

                {/* Status indicator for matched schedule */}
                <div className="pt-5">
                  {matchedSlot ? (
                    <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-xl text-xs font-bold">
                      <span>🟢</span>
                      <span>
                        {getDayName(currentDayNum)}: Khung giờ <b>{matchedSlot.startTime} - {matchedSlot.endTime}</b> ({matchedSlot.room || defaultRoom})
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-xl text-xs font-medium">
                      <span>ℹ️</span>
                      <span>{getDayName(currentDayNum)}: Không thuộc lịch cố định của lớp</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportAttendanceExcel}
                  className="px-4 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <span>📥</span> Xuất Excel Điểm Danh
                </button>
                <button
                  onClick={handleSaveAttendance}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <span>💾</span> Lưu Điểm Danh
                </button>
              </div>
            </div>

            {/* Lesson topic / note */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">
                Chủ Đề Buổi Học / Lời Dặn (Tùy chọn):
              </label>
              <input
                type="text"
                value={lessonTopic}
                onChange={e => setLessonTopic(e.target.value)}
                placeholder="Ví dụ: Unit 2 - Luyện phát âm & Kiểm tra bài cũ..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:border-teal-500 outline-none"
              />
            </div>

            {attendanceSavedMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
                <span>🎉</span> Đã lưu kết quả điểm danh thành công và đồng bộ đám mây!
              </div>
            )}
          </div>

            {/* Attendance Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center shadow-xs">
              <p className="text-2xl font-black text-slate-800">{totalStudents}</p>
              <p className="text-[11px] font-bold text-slate-400 uppercase">Sĩ số lớp</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 text-center shadow-xs">
              <p className="text-2xl font-black text-emerald-700">{presentCount} <span className="text-xs font-semibold">({attendanceRate}%)</span></p>
              <p className="text-[11px] font-bold text-emerald-700 uppercase">Có mặt</p>
            </div>
            <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200 text-center shadow-xs">
              <p className="text-2xl font-black text-sky-700">{excusedCount}</p>
              <p className="text-[11px] font-bold text-sky-700 uppercase">Vắng có phép</p>
            </div>
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-200 text-center shadow-xs">
              <p className="text-2xl font-black text-rose-700">{unexcusedCount}</p>
              <p className="text-[11px] font-bold text-rose-700 uppercase">Không phép</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-center shadow-xs col-span-2 sm:col-span-1">
              <p className="text-2xl font-black text-amber-700">{lateCount}</p>
              <p className="text-[11px] font-bold text-amber-700 uppercase">Đi muộn</p>
            </div>
          </div>

          {/* BULK ACTION TOOLBAR (Nút chọn 1 / Tất Cả) */}
          <div className="bg-slate-900 text-white rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.size === attendanceItems.length && attendanceItems.length > 0}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-bold">
                  {selectedStudentIds.size > 0
                    ? `Đã chọn ${selectedStudentIds.size}/${attendanceItems.length} học sinh`
                    : 'Chọn tất cả học sinh'}
                </span>
              </label>

              {selectedStudentIds.size > 0 && (
                <button
                  onClick={() => setSelectedStudentIds(new Set())}
                  className="text-xs text-slate-400 hover:text-white underline ml-2"
                >
                  Bỏ chọn
                </button>
              )}
            </div>

            {/* Action buttons: For selected or 1-Click for all */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedStudentIds.size > 0 ? (
                <>
                  <span className="text-xs text-teal-300 font-bold hidden sm:inline">Gán cho các bạn đã chọn:</span>
                  <button
                    onClick={() => handleMarkSelected('present')}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all"
                  >
                    ✅ Có mặt
                  </button>
                  <button
                    onClick={() => handleMarkSelected('absent_excused')}
                    className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-all"
                  >
                    📝 Có phép
                  </button>
                  <button
                    onClick={() => handleMarkSelected('absent_unexcused')}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-all"
                  >
                    ❌ Không phép
                  </button>
                  <button
                    onClick={() => handleMarkSelected('late')}
                    className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all"
                  >
                    ⏰ Đi muộn
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleMarkAll('present')}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
                  >
                    <span>⚡</span> Điểm danh TẤT CẢ Có Mặt
                  </button>
                  <button
                    onClick={() => handleMarkAll('absent_unexcused')}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
                  >
                    Đặt tất cả Vắng
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Student Attendance List */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.size === attendanceItems.length && attendanceItems.length > 0}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded text-teal-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 w-12 text-center">STT</th>
                    <th className="p-3">Học Sinh</th>
                    <th className="p-3 text-center">Trạng Thái Điểm Danh</th>
                    <th className="p-3 min-w-[200px]">Ghi Chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-800">
                  {attendanceItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                        Lớp chưa có học sinh nào. Vui lòng vào mục "Quản Lý Học Sinh Theo Lớp" để thêm học sinh.
                      </td>
                    </tr>
                  ) : (
                    attendanceItems.map((item, idx) => {
                      const isSelected = selectedStudentIds.has(item.studentId);
                      return (
                        <tr
                          key={item.studentId}
                          className={`transition-colors hover:bg-slate-50/80 ${
                            isSelected ? 'bg-teal-50/40' : ''
                          }`}
                        >
                          {/* Checkbox 1 */}
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(item.studentId)}
                              className="w-4 h-4 rounded text-teal-600 cursor-pointer"
                            />
                          </td>

                          {/* Roll number / STT */}
                          <td className="p-3 text-center font-mono text-xs text-slate-400">
                            {item.rollNumber || String(idx + 1).padStart(2, '0')}
                          </td>

                          {/* Student identity */}
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl shrink-0">{item.avatar || '🎒'}</span>
                              <div>
                                <p className="font-bold text-slate-900 leading-tight">
                                  {item.studentName}
                                </p>
                                {item.englishName && (
                                  <p className="text-xs text-teal-700 font-semibold">
                                    ★ {item.englishName}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Attendance Status Buttons */}
                          <td className="p-3 text-center">
                            <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateStudentStatus(item.studentId, 'present')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  item.status === 'present'
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                ✅ Có mặt
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStudentStatus(item.studentId, 'absent_excused')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  item.status === 'absent_excused'
                                    ? 'bg-sky-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                📝 Có phép
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStudentStatus(item.studentId, 'absent_unexcused')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  item.status === 'absent_unexcused'
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                ❌ Không phép
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStudentStatus(item.studentId, 'late')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  item.status === 'late'
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                ⏰ Muộn
                              </button>
                            </div>
                          </td>

                          {/* Note input */}
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.note || ''}
                              onChange={e => handleUpdateStudentNote(item.studentId, e.target.value)}
                              placeholder="Ghi chú (sốt, vào muộn 15p...)"
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500 bg-white"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: CLASS SCHEDULE CONFIG ==================== */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  📅 Lịch Học Định Kỳ Theo Tuần: <span className="text-teal-700">{currentClass?.name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quy định lớp học tuần mấy buổi, vào thứ mấy và khung giờ nào.
                </p>
              </div>

              <button
                onClick={handleSaveSchedule}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
              >
                <span>💾</span> Lưu Lịch Học Lớp
              </button>
            </div>

            {scheduleSavedMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
                <span>🎉</span> Đã lưu lịch học của lớp thành công & tự động cập nhật ngày 8 buổi học trong Báo Cáo Tháng!
              </div>
            )}

            {/* Quick Templates Buttons */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
                ⚡ Chọn Mẫu Lịch Học Phổ Biến (Tạo Nhanh 1-Click):
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyTemplate('2_t2_t5')}
                  className="px-3 py-2 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-xs font-bold rounded-xl transition-all"
                >
                  ⚡ 2 Buổi: Thứ 2 & Thứ 5 (17:30 - 19:00)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTemplate('2_t3_t6')}
                  className="px-3 py-2 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-xs font-bold rounded-xl transition-all"
                >
                  ⚡ 2 Buổi: Thứ 3 & Thứ 6 (17:30 - 19:00)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTemplate('2_t4_t7')}
                  className="px-3 py-2 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-xs font-bold rounded-xl transition-all"
                >
                  ⚡ 2 Buổi: Thứ 4 & Thứ 7 (18:00 - 19:30)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTemplate('3_t2_t4_t6')}
                  className="px-3 py-2 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-xs font-bold rounded-xl transition-all"
                >
                  ⚡ 3 Buổi: Thứ 2 - 4 - 6 (17:30 - 19:00)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTemplate('3_t3_t5_t7')}
                  className="px-3 py-2 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-xs font-bold rounded-xl transition-all"
                >
                  ⚡ 3 Buổi: Thứ 3 - 5 - 7 (17:30 - 19:00)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTemplate('weekend')}
                  className="px-3 py-2 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-xs font-bold rounded-xl transition-all"
                >
                  ⚡ Cuối Tuần: Thứ 7 & CN (08:30 - 10:00)
                </button>
              </div>
            </div>

            {/* Default Room input */}
            <div className="max-w-xs">
              <label className="block text-xs font-bold text-slate-600 mb-1">Phòng Học Mặc Định:</label>
              <input
                type="text"
                value={defaultRoom}
                onChange={e => setDefaultRoom(e.target.value)}
                placeholder="Ví dụ: Phòng A1, Phòng 202, Online Zoom..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:border-teal-500 outline-none"
              />
            </div>

            {/* Slots Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Danh Sách Các Buổi Học Trong Tuần ({slots.length} buổi):
                </label>
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="text-xs text-teal-700 font-bold hover:underline flex items-center gap-1"
                >
                  <span>➕</span> Thêm buổi học trong tuần
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="bg-teal-100 text-teal-800 text-xs font-bold px-2.5 py-1 rounded-lg">
                        Buổi {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="text-slate-400 hover:text-rose-600 text-xs font-bold transition-all"
                      >
                        ✕ Xóa buổi này
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Thứ trong tuần:
                        </label>
                        <select
                          value={slot.dayOfWeek}
                          onChange={e =>
                            handleUpdateSlot(slot.id, { dayOfWeek: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                        >
                          {DAY_OPTIONS.map(d => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Phòng học:
                        </label>
                        <input
                          type="text"
                          value={slot.room || defaultRoom}
                          onChange={e => handleUpdateSlot(slot.id, { room: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Giờ bắt đầu:
                        </label>
                        <input
                          type="time"
                          value={slot.startTime}
                          onChange={e => handleUpdateSlot(slot.id, { startTime: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Giờ kết thúc:
                        </label>
                        <input
                          type="time"
                          value={slot.endTime}
                          onChange={e => handleUpdateSlot(slot.id, { endTime: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly Timetable Preview Matrix */}
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
                👀 Thời Khóa Biểu Tuần Trực Quan Của Lớp:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-center">
                {DAY_OPTIONS.map(day => {
                  const matched = slots.filter(s => s.dayOfWeek === day.value);
                  const hasClass = matched.length > 0;
                  return (
                    <div
                      key={day.value}
                      className={`p-3 rounded-2xl border transition-all ${
                        hasClass
                          ? 'bg-teal-50 border-teal-300 shadow-xs'
                          : 'bg-slate-50/60 border-slate-200 opacity-60'
                      }`}
                    >
                      <p className={`text-xs font-black ${hasClass ? 'text-teal-800' : 'text-slate-500'}`}>
                        {day.label}
                      </p>
                      {hasClass ? (
                        <div className="mt-2 space-y-1">
                          {matched.map((m, i) => (
                            <div key={i} className="bg-white p-1.5 rounded-lg border border-teal-200 text-[10px]">
                              <p className="font-bold text-teal-900">{m.startTime} - {m.endTime}</p>
                              <p className="text-slate-500">{m.room || defaultRoom}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic mt-3">Nghỉ</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: ATTENDANCE HISTORY ==================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-black text-slate-800">
                📜 Lịch Sử Các Buổi Điểm Danh Của Lớp: <span className="text-teal-700">{currentClass?.name}</span>
              </h3>
              <span className="text-xs text-slate-400 font-bold">
                Tổng cộng: {historyRecords.length} buổi đã điểm danh
              </span>
            </div>

            {historyRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-2xl border border-slate-100">
                Chưa có buổi điểm danh nào được lưu cho lớp này. Hãy sang tab "Điểm Danh Học Sinh" để lưu buổi đầu tiên!
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {historyRecords.map(rec => (
                  <div
                    key={rec.id}
                    className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-3 rounded-xl transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800 text-sm">{rec.date}</span>
                        <span className="text-xs bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full">
                          {rec.dayLabel || getDayName(getDayNumFromDate(rec.date))}
                        </span>
                        {rec.timeSlot && (
                          <span className="text-xs text-slate-400 font-medium">⏰ {rec.timeSlot}</span>
                        )}
                      </div>
                      {rec.lessonTopic && (
                        <p className="text-xs text-slate-600 mt-1 italic">
                          📝 {rec.lessonTopic}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span>Sĩ số: <b>{rec.summary.total}</b></span>
                        <span className="text-emerald-600">Có mặt: <b>{rec.summary.present} ({rec.summary.rate}%)</b></span>
                        <span className="text-sky-600">Có phép: <b>{rec.summary.absentExcused}</b></span>
                        <span className="text-rose-600">Không phép: <b>{rec.summary.absentUnexcused}</b></span>
                        <span className="text-amber-600">Muộn: <b>{rec.summary.late}</b></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(rec.date);
                          setActiveTab('attendance');
                        }}
                        className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs font-bold transition-all"
                      >
                        ✏️ Mở & Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Bạn có chắc chắn muốn xóa dữ liệu điểm danh ngày ${rec.date}?`)) {
                            deleteAttendanceRecord(rec.id);
                            setHistoryRecords(getAttendanceRecords(selectedClassId));
                          }
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-all"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
