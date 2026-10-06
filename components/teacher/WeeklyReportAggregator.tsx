import React, { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import * as XLSX from 'xlsx';
import {
  ClassRoom,
  Student,
  WeeklyReportRecord,
  WeeklySessionConfig,
  StudentWeeklyScore
} from '../../types';
import {
  getClasses,
  getStudents,
  getWeeklyReports,
  saveWeeklyReport,
  calculateStudentWeeklyAverage,
  getClassSchedule,
  subscribeToSync
} from '../../services/assignmentService';

// Pastel session color palettes
const WEEKLY_PALETTES = [
  { bgHeader: 'bg-emerald-200 border-emerald-300 text-emerald-900', light: 'bg-emerald-50/50' },
  { bgHeader: 'bg-sky-200 border-sky-300 text-sky-900', light: 'bg-sky-50/50' },
  { bgHeader: 'bg-amber-200 border-amber-300 text-amber-900', light: 'bg-amber-50/50' },
  { bgHeader: 'bg-purple-200 border-purple-300 text-purple-900', light: 'bg-purple-50/50' },
  { bgHeader: 'bg-pink-200 border-pink-300 text-pink-900', light: 'bg-pink-50/50' },
  { bgHeader: 'bg-yellow-200 border-yellow-300 text-yellow-900', light: 'bg-yellow-50/50' },
];

const currentRealYear = new Date().getFullYear();
const currentRealMonth = new Date().getMonth() + 1;
const startAvailableYear = 2025;
const endAvailableYear = Math.max(2030, currentRealYear + 5);
const AVAILABLE_YEARS = Array.from({ length: endAvailableYear - startAvailableYear + 1 }, (_, i) => startAvailableYear + i);

export const WeeklyReportAggregator: React.FC = () => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(() => currentRealMonth);
  const [selectedYear, setSelectedYear] = useState<number>(() => currentRealYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [centerName, setCenterName] = useState<string>('ENGLISH LEGEND X5');

  // Sessions in this week
  const [sessions, setSessions] = useState<WeeklySessionConfig[]>([]);

  // Student scores table
  const [studentScores, setStudentScores] = useState<StudentWeeklyScore[]>([]);

  // Export states
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Modal: Add session
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('');

  // Load classes & init
  const refresh = () => {
    const cls = getClasses();
    setClasses(cls);
    const activeClassId = selectedClassId || (cls.length > 0 ? cls[0].id : '');
    setSelectedClassId(activeClassId);
  };

  useEffect(() => {
    refresh();
    const unsub = subscribeToSync(() => refresh());
    return () => unsub();
  }, []);

  // Compute week date label
  const getWeekLabel = (weekNum: number, month: number, year: number): string => {
    const startDay = (weekNum - 1) * 7 + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDay = Math.min(weekNum * 7, daysInMonth);
    const mStr = String(month).padStart(2, '0');
    return `Tuần ${weekNum} (${String(startDay).padStart(2, '0')}/${mStr} - ${String(endDay).padStart(2, '0')}/${mStr})`;
  };

  // Load or initialize weekly report when class, month, year, or week changes
  useEffect(() => {
    if (!selectedClassId) {
      setSessions([]);
      setStudentScores([]);
      return;
    }

    const currentClass = classes.find(c => c.id === selectedClassId);
    const allReports = getWeeklyReports(selectedClassId);
    const existing = allReports.find(
      r => r.month === selectedMonth && r.year === selectedYear && r.weekNumber === selectedWeek
    );

    const classStudents = getStudents(selectedClassId);

    if (existing) {
      setSessions(existing.sessions || []);
      if (existing.centerName && !existing.centerName.includes('FUTURE STARS')) {
        setCenterName(existing.centerName);
      } else {
        setCenterName('ENGLISH LEGEND X5');
      }

      // Merge existing scores with any newly added students
      const mergedScores: StudentWeeklyScore[] = classStudents.map(std => {
        const found = existing.studentScores?.find(s => s.studentId === std.id || s.studentName === std.name);
        if (found) {
          return {
            ...found,
            studentId: std.id,
            studentName: std.name,
            englishName: std.englishName || found.englishName || ''
          };
        }
        return {
          studentId: std.id,
          studentName: std.name,
          englishName: std.englishName || '',
          scores: {},
          averageScore: 0
        };
      });

      mergedScores.forEach(s => {
        s.averageScore = calculateStudentWeeklyAverage(s.scores);
      });

      setStudentScores(mergedScores);
    } else {
      // Tạo các buổi học theo đúng lịch học của lớp cho tuần này
      const sched = getClassSchedule(selectedClassId);
      const startDay = (selectedWeek - 1) * 7 + 1;
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDay = Math.min(selectedWeek * 7, daysInMonth);
      const mStr = String(selectedMonth).padStart(2, '0');
      const defaultColumns = [
        { key: 'vocab', label: 'Từ Vựng' },
        { key: 'test', label: 'Test' },
        { key: 'linkScore', label: 'điểm Link' }
      ];

      const weekSessions: WeeklySessionConfig[] = [];
      if (sched && sched.slots && sched.slots.length > 0) {
        for (let d = startDay; d <= endDay; d++) {
          const dt = new Date(selectedYear, selectedMonth - 1, d);
          const jsDay = dt.getDay(); // 0 = CN, 1 = T2...
          const dow = jsDay === 0 ? 1 : jsDay + 1;
          const matchingSlot = sched.slots.find(s => s.dayOfWeek === dow);
          if (matchingSlot) {
            weekSessions.push({
              id: `w_s_${selectedWeek}_${weekSessions.length + 1}`,
              name: `Buổi ${weekSessions.length + 1} (${matchingSlot.dayLabel})`,
              date: `${String(d).padStart(2, '0')}/${mStr}/${selectedYear}`,
              columns: defaultColumns
            });
          }
        }
      }

      // Fallback nếu tuần chưa có buổi nào khớp lịch
      if (weekSessions.length === 0) {
        const fallbackSlots = sched?.slots?.length ? sched.slots : [
          { dayLabel: 'Thứ 2', dayOfWeek: 2 },
          { dayLabel: 'Thứ 5', dayOfWeek: 5 }
        ];
        fallbackSlots.forEach((slot, idx) => {
          const dayNum = Math.min(startDay + idx * 3, daysInMonth);
          weekSessions.push({
            id: `w_s_${selectedWeek}_${idx + 1}`,
            name: `Buổi ${idx + 1} (${slot.dayLabel})`,
            date: `${String(dayNum).padStart(2, '0')}/${mStr}/${selectedYear}`,
            columns: defaultColumns
          });
        });
      }

      setSessions(weekSessions);

      const initialScores: StudentWeeklyScore[] = classStudents.map(std => ({
        studentId: std.id,
        studentName: std.name,
        englishName: std.englishName || '',
        scores: {},
        averageScore: 0
      }));

      setStudentScores(initialScores);
    }
  }, [selectedClassId, selectedMonth, selectedYear, selectedWeek, classes]);

  const currentClass = classes.find(c => c.id === selectedClassId);

  const [batchActionToast, setBatchActionToast] = useState<string | null>(null);

  const showBatchToast = (msg: string) => {
    setBatchActionToast(msg);
    setTimeout(() => setBatchActionToast(null), 3000);
  };

  // Handle score change - KEEPS EXACT TEACHER INPUT STRING
  const handleScoreChange = (
    studentIdx: number,
    sessionId: string,
    columnKey: string,
    rawVal: string
  ) => {
    const trimmed = rawVal.trim();
    if (trimmed.toLowerCase() === 'x') {
      rawVal = 'x';
    } else if (trimmed === '') {
      rawVal = '';
    } else {
      const parsed = parseFloat(trimmed.replace(',', '.'));
      if (!isNaN(parsed) && parsed > 10) {
        return; // Reject scores > 10
      }
    }

    const updated = [...studentScores];
    const std = { ...updated[studentIdx] };
    const currentScores = { ...(std.scores || {}) };
    const sessionObj = { ...(currentScores[sessionId] || {}) };

    sessionObj[columnKey] = rawVal;
    currentScores[sessionId] = sessionObj;
    std.scores = currentScores;
    std.averageScore = calculateStudentWeeklyAverage(currentScores);

    updated[studentIdx] = std;
    setStudentScores(updated);
  };

  // Copy current cell score to all students in this column
  const handleCopyScoreToColumn = (sessionId: string, columnKey: string, val: string | number) => {
    if (val === undefined || val === null || String(val).trim() === '') {
      alert('Vui lòng nhập điểm vào ô trước khi sao chép cho cả cột!');
      return;
    }
    const valStr = String(val).trim();
    const updated = studentScores.map(student => {
      const currentScores = { ...(student.scores || {}) };
      const sessionObj = { ...(currentScores[sessionId] || {}) };
      sessionObj[columnKey] = valStr;
      currentScores[sessionId] = sessionObj;
      return {
        ...student,
        scores: currentScores,
        averageScore: calculateStudentWeeklyAverage(currentScores)
      };
    });
    setStudentScores(updated);
    showBatchToast(`✓ Đã sao chép điểm "${valStr}" cho toàn bộ ${updated.length} học sinh trong cột!`);
  };

  // Quick fill column with prompted score
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
      const currentScores = { ...(student.scores || {}) };
      const sessionObj = { ...(currentScores[sessionId] || {}) };
      sessionObj[columnKey] = finalVal;
      currentScores[sessionId] = sessionObj;
      return {
        ...student,
        scores: currentScores,
        averageScore: calculateStudentWeeklyAverage(currentScores)
      };
    });
    setStudentScores(updated);
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

      const std = { ...updated[targetIdx] };
      const currentScores = { ...(std.scores || {}) };
      const sessionObj = { ...(currentScores[sessionId] || {}) };
      sessionObj[columnKey] = cleanVal;
      currentScores[sessionId] = sessionObj;
      std.scores = currentScores;
      std.averageScore = calculateStudentWeeklyAverage(currentScores);
      updated[targetIdx] = std;
      filledCount++;
    }

    setStudentScores(updated);
    showBatchToast(`✓ Đã dán thành công ${filledCount} điểm từ clipboard/Excel!`);
  };

  // Save report
  const handleSaveReport = () => {
    if (!currentClass) return;
    const reportId = `w_rep_${selectedClassId}_${selectedYear}_${selectedMonth}_w${selectedWeek}`;
    const record: WeeklyReportRecord = {
      id: reportId,
      classId: selectedClassId,
      className: currentClass.name,
      month: selectedMonth,
      year: selectedYear,
      weekNumber: selectedWeek,
      weekLabel: getWeekLabel(selectedWeek, selectedMonth, selectedYear),
      centerName,
      sessions,
      studentScores,
      updatedAt: new Date().toISOString()
    };

    saveWeeklyReport(record);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  // Add a session
  const handleAddSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    const newSession: WeeklySessionConfig = {
      id: `w_s_${Date.now()}`,
      name: newSessionName.trim(),
      date: newSessionDate.trim() || `${String(new Date().getDate()).padStart(2, '0')}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`,
      columns: [
        { key: 'vocab', label: 'Từ Vựng' },
        { key: 'test', label: 'Test' },
        { key: 'linkScore', label: 'điểm Link' }
      ]
    };

    setSessions([...sessions, newSession]);
    setShowAddSessionModal(false);
    setNewSessionName('');
    setNewSessionDate('');
  };

  // Delete a session
  const handleDeleteSession = (sessionId: string) => {
    if (!confirm('Cô có chắc chắn muốn xóa cột buổi học này?')) return;
    setSessions(sessions.filter(s => s.id !== sessionId));
  };

  // Quick generate schedule for week (Mon - Wed - Fri or Tue - Thu - Sat)
  const handleQuickSchedule = (type: '246' | '357') => {
    const startDay = (selectedWeek - 1) * 7 + 1;
    const mStr = String(selectedMonth).padStart(2, '0');
    const schedule = type === '246'
      ? [
          { name: 'Buổi 1 (Thứ 2)', d: startDay },
          { name: 'Buổi 2 (Thứ 4)', d: startDay + 2 },
          { name: 'Buổi 3 (Thứ 6)', d: startDay + 4 }
        ]
      : [
          { name: 'Buổi 1 (Thứ 3)', d: startDay + 1 },
          { name: 'Buổi 2 (Thứ 5)', d: startDay + 3 },
          { name: 'Buổi 3 (Thứ 7)', d: startDay + 5 }
        ];

    const newSessions: WeeklySessionConfig[] = schedule.map((item, idx) => ({
      id: `w_s_${selectedWeek}_${idx + 1}_${Date.now()}`,
      name: item.name,
      date: `${String(Math.min(item.d, 31)).padStart(2, '0')}/${mStr}/${selectedYear}`,
      columns: [
        { key: 'vocab', label: 'Từ Vựng' },
        { key: 'test', label: 'Test' },
        { key: 'linkScore', label: 'điểm Link' }
      ]
    }));

    setSessions(newSessions);
  };

  // Scroll table helpers
  const scrollTable = (offset: number) => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Export Image PNG (Zalo weekly card)
  const handleExportImage = async () => {
    if (!reportRef.current) return;
    try {
      setIsExportingImage(true);
      const fullWidth = Math.max(reportRef.current.scrollWidth, 1100);
      const dataUrl = await toPng(reportRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: fullWidth,
        style: {
          width: `${fullWidth}px`,
          maxWidth: 'none',
          overflow: 'visible'
        }
      });
      const link = document.createElement('a');
      link.download = `Bao_Cao_Tuan_${selectedWeek}_Thang_${selectedMonth}_${currentClass?.name || 'Lop'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      alert('Không thể xuất ảnh báo cáo tuần. Vui lòng thử lại.');
    } finally {
      setIsExportingImage(false);
    }
  };

  // Export as Excel (.xlsx)
  const handleExportExcel = () => {
    if (!currentClass) return;
    const headerRow1 = ['LỚP', 'HỌ VÀ TÊN', 'E.NAME'];
    sessions.forEach(s => {
      s.columns.forEach(col => {
        headerRow1.push(`${s.name} (${s.date}) - ${col.label}`);
      });
    });
    headerRow1.push('ĐIỂM TB TUẦN');

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
    XLSX.utils.book_append_sheet(wb, ws, `Báo cáo Tuần ${selectedWeek}`);
    XLSX.writeFile(wb, `Bao_cao_tuan_${selectedWeek}_thang_${selectedMonth}_${currentClass.name.replace(/\s+/g, '_')}.xlsx`);
  };

  // Sort students for Ranking
  const rankedStudents = [...studentScores]
    .filter(s => s.averageScore > 0)
    .sort((a, b) => b.averageScore - a.averageScore);

  const top1 = rankedStudents[0];
  const top2 = rankedStudents[1];
  const top3 = rankedStudents[2];

  const otherStudents = rankedStudents.slice(3);
  const half = Math.ceil(otherStudents.length / 2);
  const otherCol1 = otherStudents.slice(0, half);
  const otherCol2 = otherStudents.slice(half);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Action & Filter Toolbar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-brand-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Class Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Chọn Lớp Học
            </label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-emerald-500 outline-none shadow-sm"
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
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-emerald-500 outline-none shadow-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                const isCurrent = m === currentRealMonth && selectedYear === currentRealYear;
                return (
                  <option key={m} value={m}>
                    Tháng {m} {isCurrent ? '★ (Hiện tại)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Week Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Chọn Tuần
            </label>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(Number(e.target.value))}
              className="px-3.5 py-2.5 rounded-xl border border-emerald-300 text-sm font-black bg-emerald-50 text-emerald-900 focus:border-emerald-500 outline-none shadow-sm"
            >
              {[1, 2, 3, 4, 5].map(w => (
                <option key={w} value={w}>
                  {getWeekLabel(w, selectedMonth, selectedYear)}
                </option>
              ))}
            </select>
          </div>

          {/* Year Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Năm
            </label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-emerald-500 outline-none shadow-sm"
            >
              {AVAILABLE_YEARS.map(y => {
                const isCurrent = y === currentRealYear;
                return (
                  <option key={y} value={y}>
                    Năm {y} {isCurrent ? '★ (Hiện tại)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Schedule Dropdown */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => handleQuickSchedule('246')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-xs"
              title="Tạo lịch học T2-T4-T6 cho tuần này"
            >
              ⚡ Lịch T2-4-6
            </button>
            <button
              onClick={() => handleQuickSchedule('357')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-xs"
              title="Tạo lịch học T3-T5-T7 cho tuần này"
            >
              ⚡ Lịch T3-5-7
            </button>
          </div>

          <button
            onClick={() => setShowAddSessionModal(true)}
            className="px-3.5 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs sm:text-sm rounded-xl border border-brand-200 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <span>➕</span> Thêm Buổi
          </button>

          <button
            onClick={handleSaveReport}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <span>💾</span> {saveSuccessMsg ? '✓ Đã Lưu Báo Cáo!' : 'Lưu Báo Cáo'}
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <span>📊</span> Xuất Excel
          </button>

          <button
            onClick={handleExportImage}
            disabled={isExportingImage}
            className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>📸</span> {isExportingImage ? 'Đang xuất ảnh...' : 'Xuất Ảnh Báo Cáo Tuần (Gửi Zalo)'}
          </button>
        </div>
      </div>

      {/* Main Report Container to be exported as Image */}
      <div
        ref={reportRef}
        className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 overflow-x-auto min-w-[1000px]"
      >
        {/* Report Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 relative">
          <div className="flex items-center gap-3 w-1/4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl shadow-sm">
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
                  const newName = prompt('Nhập tên thương hiệu / trung tâm:', centerName);
                  if (newName && newName.trim()) setCenterName(newName.trim());
                }}
                className="text-[10px] text-emerald-600 hover:underline font-bold"
              >
                ✏️ Đổi tên
              </button>
            </div>
          </div>

          {/* Main Title Center */}
          <div className="text-center flex-1">
            <h1 className="text-2xl sm:text-3xl font-black text-emerald-900 tracking-tight uppercase font-display mb-2">
              BÁO CÁO KẾT QUẢ HỌC TẬP {getWeekLabel(selectedWeek, selectedMonth, selectedYear).toUpperCase()}
            </h1>
            <div className="flex items-center justify-center gap-3">
              <span className="px-4 py-1 rounded-full bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-sm">
                ★ {centerName} ★
              </span>
              <span className="px-4 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300 font-black text-xs uppercase tracking-wider shadow-sm">
                {currentClass ? currentClass.name : 'LỚP HỌC'}
              </span>
            </div>
          </div>

          <div className="w-1/4 flex justify-end items-center gap-2">
            <span className="text-3xl">🌟</span>
            <span className="text-3xl">🏆</span>
          </div>
        </div>

        {/* Scroll Helper */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <span>↔️</span>
            <span>Báo cáo tuần: <b className="text-emerald-700">{sessions.length} buổi học</b></span>
            <span className="text-slate-400 text-[11px] hidden sm:inline">(Cột Họ tên ghim cố định bên trái khi cuộn)</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => scrollTable(-250)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold"
            >
              ◀️ Cuộn trái
            </button>
            <button
              onClick={() => scrollTable(250)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold"
            >
              Cuộn phải ▶️
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div
          ref={tableScrollRef}
          className="border-2 border-slate-300 rounded-2xl overflow-x-auto overflow-y-visible shadow-sm bg-white relative max-w-full"
        >
          <table className="border-collapse text-center text-xs min-w-full">
            <thead>
              <tr className="border-b border-slate-300 font-black text-xs">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 bg-emerald-200 border-r border-slate-300 py-2 px-2 text-emerald-900 w-[50px] min-w-[50px]"
                >
                  {currentClass ? currentClass.name : 'LỚP'}
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[50px] z-30 bg-slate-100 border-r border-slate-300 py-2 px-3 text-slate-800 text-left w-[160px] min-w-[160px]"
                >
                  HỌ VÀ TÊN
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[210px] z-30 bg-slate-100 border-r-2 border-slate-400 py-2 px-2 text-slate-800 w-[95px] min-w-[95px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]"
                >
                  E.NAME
                </th>

                {sessions.map((s, sIdx) => {
                  const palette = WEEKLY_PALETTES[sIdx % WEEKLY_PALETTES.length];
                  return (
                    <th
                      key={s.id}
                      colSpan={s.columns.length}
                      className={`${palette.bgHeader} border-r border-slate-300 py-2 px-2 group relative whitespace-nowrap`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{s.name}</span>
                        <span className="text-[10px] opacity-80">({s.date})</span>
                        <button
                          onClick={() => handleDeleteSession(s.id)}
                          title="Xóa buổi này"
                          className="opacity-0 group-hover:opacity-100 text-rose-600 hover:text-rose-800 text-xs font-bold transition-opacity ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    </th>
                  );
                })}

                <th
                  rowSpan={2}
                  className="sticky right-0 z-30 bg-yellow-200 border-l-2 border-slate-400 py-2 px-3 text-amber-900 font-black w-[85px] min-w-[85px] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]"
                >
                  ĐIỂM TB TUẦN
                </th>
              </tr>

              <tr className="border-b-2 border-slate-300 text-[10px] font-bold text-slate-700 bg-slate-50">
                {sessions.map((s, sIdx) => {
                  const palette = WEEKLY_PALETTES[sIdx % WEEKLY_PALETTES.length];
                  return s.columns.map((col, cIdx) => (
                    <th
                      key={`${s.id}_${col.key}`}
                      className={`py-1.5 px-1 border-r border-slate-300 ${palette.light} text-center font-bold whitespace-nowrap group/header`}
                      style={{ minWidth: col.key === 'online' ? '68px' : '58px' }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{col.label}</span>
                        <button
                          type="button"
                          onClick={() => handleQuickFillColumn(s.id, col.key, col.label, s.name)}
                          title={`Điền đồng loạt điểm cho cột ${col.label} (${s.name})`}
                          className="opacity-0 group-hover/header:opacity-100 text-brand-700 hover:text-brand-900 bg-white/90 hover:bg-white px-1 py-0.5 rounded text-[10px] font-bold shadow-2xs transition-opacity cursor-pointer"
                        >
                          📋
                        </button>
                      </div>
                    </th>
                  ));
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {studentScores.length === 0 ? (
                <tr>
                  <td colSpan={25} className="py-8 text-center text-slate-400 font-medium">
                    Chưa có học sinh nào trong lớp. Vui lòng vào tab "Quản Lý Học Sinh" để thêm học sinh.
                  </td>
                </tr>
              ) : (
                studentScores.map((std, sIdx) => (
                  <tr key={std.studentId} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="sticky left-0 z-20 bg-white py-2 px-2 border-r border-slate-200 font-bold text-slate-400 text-[11px] w-[50px] min-w-[50px]">
                      {String(sIdx + 1).padStart(2, '0')}
                    </td>
                    <td className="sticky left-[50px] z-20 bg-white py-2 px-3 border-r border-slate-200 font-black text-slate-800 text-left text-xs whitespace-nowrap w-[160px] min-w-[160px]">
                      {std.studentName}
                    </td>
                    <td className="sticky left-[210px] z-20 bg-white py-2 px-2 border-r-2 border-slate-400 font-bold text-emerald-800 text-xs w-[95px] min-w-[95px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]">
                      {std.englishName || <span className="text-slate-300">—</span>}
                    </td>

                    {sessions.map((s, sessIdx) => {
                      const palette = WEEKLY_PALETTES[sessIdx % WEEKLY_PALETTES.length];
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
                              onChange={e => handleScoreChange(sIdx, s.id, col.key, e.target.value)}
                              onPaste={e => {
                                const text = e.clipboardData.getData('text');
                                if (text && text.includes('\n')) {
                                  e.preventDefault();
                                  handlePasteColumn(sIdx, s.id, col.key, text);
                                }
                              }}
                              placeholder="-"
                              className={`w-full h-8 text-center font-bold text-xs bg-transparent outline-none focus:bg-yellow-100 transition-colors ${
                                isAbsent ? 'text-rose-500 font-black' : isZero ? 'text-slate-400' : 'text-slate-800'
                              }`}
                            />
                            {/* Fast copy button on hover */}
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
                          </td>
                        );
                      });
                    })}

                    <td className="sticky right-0 z-20 bg-amber-50 py-2 px-2 border-l-2 border-slate-400 font-black text-xs text-blue-900 w-[85px] min-w-[85px] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">
                      {std.averageScore > 0 ? (
                        <span className={`inline-block px-2 py-0.5 rounded-lg ${
                          std.averageScore >= 9.0 ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' :
                          std.averageScore >= 8.0 ? 'bg-emerald-100 text-emerald-900' :
                          'text-slate-800'
                        }`}>
                          {std.averageScore.toFixed(2).replace('.', ',')}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Podium & Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
          {/* Left Podium (Top 1, 2, 3) */}
          <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-emerald-800 text-white text-center py-2.5 px-4 font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2">
              <span>★</span>
              <span>BẢNG VÀNG XUẤT SẮC TUẦN {selectedWeek}</span>
              <span>★</span>
            </div>

            <div className="p-4 grid grid-cols-3 gap-3 flex-1 items-end">
              {/* Top 1 */}
              <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[190px] shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-white font-black text-xl shadow-md border-2 border-white mb-2 relative">
                  1
                  <span className="absolute -bottom-2 text-xs">🎗️</span>
                </div>
                {top1 ? (
                  <>
                    <h4 className="font-black text-xs text-slate-900 leading-tight line-clamp-2">
                      {top1.studentName}
                    </h4>
                    <p className="text-[11px] font-bold text-amber-800 mt-0.5">
                      {top1.englishName || '—'}
                    </p>
                    <div className="mt-2 text-xl font-black text-rose-600 font-display">
                      {top1.averageScore.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-slate-300 italic">Chưa có dữ liệu</span>
                )}
              </div>

              {/* Top 2 */}
              <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[175px] shadow-sm">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-slate-400 to-slate-200 flex items-center justify-center text-white font-black text-lg shadow-md border-2 border-white mb-2 relative">
                  2
                  <span className="absolute -bottom-2 text-xs">🥈</span>
                </div>
                {top2 ? (
                  <>
                    <h4 className="font-black text-xs text-slate-900 leading-tight line-clamp-2">
                      {top2.studentName}
                    </h4>
                    <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                      {top2.englishName || '—'}
                    </p>
                    <div className="mt-2 text-lg font-black text-rose-600 font-display">
                      {top2.averageScore.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-slate-300 italic">Chưa có dữ liệu</span>
                )}
              </div>

              {/* Top 3 */}
              <div className="bg-amber-50/40 border-2 border-amber-200 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[160px] shadow-sm">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-white font-black text-base shadow-md border-2 border-white mb-2 relative">
                  3
                  <span className="absolute -bottom-2 text-xs">🥉</span>
                </div>
                {top3 ? (
                  <>
                    <h4 className="font-black text-xs text-slate-900 leading-tight line-clamp-2">
                      {top3.studentName}
                    </h4>
                    <p className="text-[11px] font-bold text-amber-900 mt-0.5">
                      {top3.englishName || '—'}
                    </p>
                    <div className="mt-2 text-base font-black text-rose-600 font-display">
                      {top3.averageScore.toFixed(2).replace('.', ',')}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-slate-300 italic">Chưa có dữ liệu</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Other Students */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-100 text-slate-800 text-center py-2.5 px-4 font-black text-xs tracking-wider uppercase border-b border-slate-200">
              DANH SÁCH HỌC VIÊN KHÁC TRONG TUẦN
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs flex-1">
              <div className="space-y-1.5">
                {otherCol1.map((std, idx) => (
                  <div
                    key={std.studentId}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-slate-400 text-[10px] w-5 text-right">
                        #{idx + 4}
                      </span>
                      <div className="truncate">
                        <span className="font-bold text-slate-800 truncate block">{std.studentName}</span>
                        {std.englishName && (
                          <span className="text-[10px] text-emerald-700 font-semibold">{std.englishName}</span>
                        )}
                      </div>
                    </div>
                    <span className="font-black text-rose-600 font-display text-sm shrink-0 ml-2">
                      {std.averageScore.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                {otherCol2.map((std, idx) => (
                  <div
                    key={std.studentId}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-slate-400 text-[10px] w-5 text-right">
                        #{half + idx + 4}
                      </span>
                      <div className="truncate">
                        <span className="font-bold text-slate-800 truncate block">{std.studentName}</span>
                        {std.englishName && (
                          <span className="text-[10px] text-emerald-700 font-semibold">{std.englishName}</span>
                        )}
                      </div>
                    </div>
                    <span className="font-black text-rose-600 font-display text-sm shrink-0 ml-2">
                      {std.averageScore.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend Footer */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-[11px] text-slate-500 space-y-1">
          <p className="font-bold text-slate-700">📌 Chú thích & Thang điểm đánh giá tuần:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><b>Video BTVN & BTVN:</b> Đánh giá kỹ năng phát âm, độ trôi chảy và hoàn thành bài tập về nhà.</li>
            <li><b>Kiểm tra bài cũ:</b> Đánh giá mức độ ghi nhớ từ vựng và cấu trúc ngữ pháp đã học.</li>
            <li><b>Điểm TB Tuần:</b> Tự động tính trung bình các đầu điểm có dữ liệu • Làm tròn 2 chữ số thập phân.</li>
          </ul>
        </div>
      </div>

      {/* Modal: Add Session */}
      {showAddSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <h3 className="text-lg font-black text-brand-900">➕ Thêm Buổi Học Trong Tuần</h3>
            <form onSubmit={handleAddSession} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tên Buổi (VD: Buổi 1, Buổi 2...)</label>
                <input
                  type="text"
                  required
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder="VD: Buổi 1 (Thứ 2)"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ngày học (dd/mm/yyyy)</label>
                <input
                  type="text"
                  value={newSessionDate}
                  onChange={e => setNewSessionDate(e.target.value)}
                  placeholder="VD: 04/08/2026"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSessionModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  Thêm Buổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Action Toast */}
      {batchActionToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-2 animate-bounce text-xs font-bold">
          <span className="text-base">📋</span>
          <span>{batchActionToast}</span>
        </div>
      )}
    </div>
  );
};
