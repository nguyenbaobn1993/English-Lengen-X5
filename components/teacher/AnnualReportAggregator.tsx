import React, { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import * as XLSX from 'xlsx';
import {
  ClassRoom,
  Student,
  AnnualReport,
  StudentAnnualScore
} from '../../types';
import {
  getClasses,
  getStudents,
  getAnnualReport,
  saveAnnualReport,
  buildOrAggregateAnnualReport,
  subscribeToSync
} from '../../services/assignmentService';

interface AnnualReportAggregatorProps {
  onBackToMonthly?: () => void;
}

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

const currentRealYear = new Date().getFullYear();
const startAvailableYear = 2024;
const endAvailableYear = Math.max(2030, currentRealYear + 5);
const AVAILABLE_YEARS = Array.from({ length: endAvailableYear - startAvailableYear + 1 }, (_, i) => startAvailableYear + i);

export const AnnualReportAggregator: React.FC<AnnualReportAggregatorProps> = ({ onBackToMonthly }) => {
  const [classes, setClasses] = useState<ClassRoom[]>(getClasses());
  const [selectedClassId, setSelectedClassIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_annual_class_id') || '';
    }
    return '';
  });
  const setSelectedClassId = (id: string | ((prev: string) => string)) => {
    setSelectedClassIdState(prev => {
      const next = typeof id === 'function' ? id(prev) : id;
      if (typeof window !== 'undefined' && next) {
        localStorage.setItem('mrs_dung_annual_class_id', next);
      }
      return next;
    });
  };

  const [selectedYear, setSelectedYearState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_annual_year');
      if (saved) {
        const num = parseInt(saved, 10);
        if (num >= 2024 && num <= 2050) return num;
      }
    }
    return currentRealYear;
  });
  const setSelectedYear = (y: number | ((prev: number) => number)) => {
    setSelectedYearState(prev => {
      const next = typeof y === 'function' ? y(prev) : y;
      if (typeof window !== 'undefined') {
        localStorage.setItem('mrs_dung_annual_year', String(next));
      }
      return next;
    });
  };

  const [report, setReport] = useState<AnnualReport | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK'>('ALL');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isExportingImg, setIsExportingImg] = useState(false);

  const reportCaptureRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reportStateRef = useRef<AnnualReport | null>(report);

  useEffect(() => {
    reportStateRef.current = report;
  }, [report]);

  // Synchronous immediate save
  const saveCurrentReportImmediately = (overrideReport?: AnnualReport) => {
    const rep = overrideReport || reportStateRef.current;
    if (!rep) return;
    saveAnnualReport({
      ...rep,
      updatedAt: new Date().toISOString()
    });
  };

  const triggerAutoSave = (updatedReport: AnnualReport) => {
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveCurrentReportImmediately(updatedReport);
      setAutoSaveStatus('saved');
    }, 500);
  };

  // Initialize selected class
  useEffect(() => {
    const cls = getClasses();
    setClasses(cls);
    setSelectedClassId(prev => {
      if (prev && cls.some(c => c.id === prev)) return prev;
      const saved = typeof window !== 'undefined' ? (localStorage.getItem('mrs_dung_annual_class_id') || '') : '';
      if (saved && cls.some(c => c.id === saved)) return saved;
      return cls.length > 0 ? cls[0].id : '';
    });
  }, []);

  // Flush before switching class or year
  const handleClassChange = (newClassId: string) => {
    if (newClassId === selectedClassId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentReportImmediately();
    setSelectedClassId(newClassId);
  };

  const handleYearChange = (newYear: number) => {
    if (newYear === selectedYear) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentReportImmediately();
    setSelectedYear(newYear);
  };

  // Load or aggregate annual report
  const loadReport = (forceReaggregate = false) => {
    if (!selectedClassId) return;
    if (forceReaggregate) {
      const fresh = buildOrAggregateAnnualReport(selectedClassId, selectedYear, true);
      setReport(fresh);
      saveAnnualReport(fresh);
      setAutoSaveStatus('saved');
      return;
    }

    const existing = getAnnualReport(selectedClassId, selectedYear);
    if (existing) {
      setReport(existing);
    } else {
      const generated = buildOrAggregateAnnualReport(selectedClassId, selectedYear, false);
      setReport(generated);
      saveAnnualReport(generated);
    }
  };

  useEffect(() => {
    loadReport();
    const unsubscribe = subscribeToSync((event) => {
      if (event.type === 'class_added' || event.type === 'class_updated' || event.type === 'class_deleted') {
        const cls = getClasses();
        setClasses(cls);
      }
    });
    return () => {
      unsubscribe();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      saveCurrentReportImmediately();
    };
  }, [selectedClassId, selectedYear]);

  const currentClass = classes.find(c => c.id === selectedClassId);

  // Chỉnh sửa điểm từng tháng trực tiếp trên bảng cả năm
  const handleMonthScoreChange = (studentId: string, month: number, rawVal: string) => {
    if (!report) return;

    let parsedScore: number | null = null;
    const trimmed = rawVal.trim().replace(',', '.');
    if (trimmed !== '' && trimmed.toLowerCase() !== 'x' && trimmed !== '-') {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num >= 0 && num <= 10) {
        parsedScore = Math.round(num * 100) / 100;
      } else if (num > 10) {
        return; // Không nhận điểm > 10
      }
    }

    const updatedStudentScores = report.studentScores.map(std => {
      if (std.studentId !== studentId) return std;

      const newMonthlyScores = { ...std.monthlyScores, [month]: parsedScore };
      const validScores = Object.values(newMonthlyScores).filter((s): s is number => typeof s === 'number' && s > 0);

      const annualAverage = validScores.length > 0
        ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
        : 0;

      let classification: StudentAnnualScore['classification'] = 'Cần cố gắng';
      if (annualAverage >= 9.0) classification = 'Xuất sắc';
      else if (annualAverage >= 8.0) classification = 'Giỏi';
      else if (annualAverage >= 6.5) classification = 'Khá';
      else if (annualAverage >= 5.0) classification = 'Trung bình';

      return {
        ...std,
        monthlyScores: newMonthlyScores,
        annualAverage,
        completedMonthsCount: validScores.length,
        classification
      };
    });

    // Cập nhật thứ hạng
    const sorted = [...updatedStudentScores].sort((a, b) => b.annualAverage - a.annualAverage);
    sorted.forEach((s, idx) => {
      s.rank = idx + 1;
    });

    const updatedReport: AnnualReport = {
      ...report,
      studentScores: sorted,
      updatedAt: new Date().toISOString()
    };

    setReport(updatedReport);
    triggerAutoSave(updatedReport);
  };

  // Handle remarks change for a student
  const handleRemarksChange = (studentId: string, remarks: string) => {
    if (!report) return;
    const updatedScores = report.studentScores.map(std =>
      std.studentId === studentId ? { ...std, teacherRemarks: remarks } : std
    );
    const updatedReport: AnnualReport = {
      ...report,
      studentScores: updatedScores,
      updatedAt: new Date().toISOString()
    };
    setReport(updatedReport);
    triggerAutoSave(updatedReport);
  };

  // Save report permanently
  const handleSave = () => {
    if (!report) return;
    setIsSaving(true);
    saveAnnualReport({
      ...report,
      updatedAt: new Date().toISOString()
    });
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccessMsg(true);
      setAutoSaveStatus('saved');
      setTimeout(() => setSaveSuccessMsg(false), 2500);
    }, 300);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!report || report.studentScores.length === 0) {
      alert('Chưa có dữ liệu học sinh để xuất file!');
      return;
    }

    const rows = report.studentScores.map((std, idx) => {
      const rowData: Record<string, any> = {
        'STT': idx + 1,
        'Họ và Tên': std.studentName,
        'Tên Tiếng Anh (E.Name)': std.englishName || '',
      };

      for (let m = 1; m <= 12; m++) {
        const val = std.monthlyScores[m];
        rowData[`Tháng ${m}`] = val !== null && val !== undefined ? val : '';
      }

      rowData['Điểm TB Cả Năm'] = std.annualAverage > 0 ? std.annualAverage : '';
      rowData['Xếp Loại Cả Năm'] = std.classification;
      rowData['Số Tháng Hoàn Thành'] = `${std.completedMonthsCount}/12`;
      rowData['Lời Phê của Giáo viên'] = std.teacherRemarks || '';

      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Báo Cáo Năm ${selectedYear}`);
    XLSX.writeFile(workbook, `Bao_Cao_Tong_Ket_Nam_${selectedYear}_${currentClass ? currentClass.name.replace(/\s+/g, '_') : 'Lop'}.xlsx`);
  };

  // Export report to Image (.png)
  const handleExportImage = async () => {
    if (!reportCaptureRef.current) return;
    try {
      setIsExportingImg(true);
      const dataUrl = await toPng(reportCaptureRef.current, {
        cacheBust: true,
        quality: 0.95,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `Tong_Ket_Nam_${selectedYear}_${currentClass ? currentClass.name.replace(/\s+/g, '_') : 'Lop'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Lỗi khi xuất ảnh báo cáo cả năm:', err);
      alert('Có lỗi khi tạo ảnh báo cáo. Vui lòng thử lại!');
    } finally {
      setIsExportingImg(false);
    }
  };

  // Filter students
  const filteredStudents = (report?.studentScores || []).filter(std => {
    const matchSearch =
      std.studentName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (std.englishName && std.englishName.toLowerCase().includes(studentSearch.toLowerCase()));
    if (!matchSearch) return false;

    if (classificationFilter === 'EXCELLENT') return std.classification === 'Xuất sắc';
    if (classificationFilter === 'GOOD') return std.classification === 'Giỏi' || std.classification === 'Xuất sắc';
    if (classificationFilter === 'NEEDS_WORK') return std.classification === 'Cần cố gắng' || std.classification === 'Trung bình';
    return true;
  });

  // Calculate metrics
  const totalStudents = report?.studentScores.length || 0;
  const validStudents = (report?.studentScores || []).filter(s => s.annualAverage > 0);
  const classAnnualAverage = validStudents.length > 0
    ? (validStudents.reduce((acc, s) => acc + s.annualAverage, 0) / validStudents.length).toFixed(2)
    : '0.00';
  const excellentAndGoodCount = (report?.studentScores || []).filter(s => s.classification === 'Xuất sắc' || s.classification === 'Giỏi').length;
  const excellentRate = totalStudents > 0 ? Math.round((excellentAndGoodCount / totalStudents) * 100) : 0;
  const topPerformer = report?.studentScores && report.studentScores.length > 0 ? report.studentScores[0] : null;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Controls Toolbar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-brand-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {onBackToMonthly && (
            <button
              type="button"
              onClick={onBackToMonthly}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>⬅️</span> Báo Cáo Tháng
            </button>
          )}

          {/* Class Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Chọn Lớp Học
            </label>
            <select
              value={selectedClassId}
              onChange={e => handleClassChange(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-brand-500 outline-none shadow-xs cursor-pointer"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Year Picker */}
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Năm Học
            </label>
            <select
              value={selectedYear}
              onChange={e => handleYearChange(Number(e.target.value))}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white text-slate-800 focus:border-brand-500 outline-none shadow-xs cursor-pointer"
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

          {/* Auto-save status badge */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold self-end shadow-2xs">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${autoSaveStatus === 'saving' ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`}></span>
            <span className={autoSaveStatus === 'saving' ? 'text-amber-700 font-black' : 'text-emerald-700 font-black'}>
              {autoSaveStatus === 'saving' ? 'Đang lưu...' : '● Tự động lưu'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadReport(true)}
            title="Quét lại toàn bộ dữ liệu 12 tháng từ các Báo Cáo Tháng và bài nộp để làm mới bảng"
            className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-all flex items-center gap-1.5 self-end cursor-pointer"
          >
            <span>🔄</span> Quét Lại Dữ Liệu
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>💾</span> {isSaving ? 'Đang lưu...' : saveSuccessMsg ? '✓ Đã Lưu Thành Công!' : 'Lưu Báo Cáo Năm'}
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs sm:text-sm rounded-xl border border-emerald-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📊</span> Xuất File Excel
          </button>

          <button
            type="button"
            onClick={handleExportImage}
            disabled={isExportingImg}
            className="px-3.5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📸</span> {isExportingImg ? 'Đang chụp ảnh...' : 'Xuất Ảnh Báo Cáo'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-lg border border-brand-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center text-2xl shrink-0">
            👥
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-brand-900">{totalStudents}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Học sinh trong lớp</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-lg border border-brand-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl shrink-0">
            📈
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-blue-600">
              {classAnnualAverage}
              <span className="text-xs font-normal text-slate-400">/10</span>
            </p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Điểm TB Cả Năm Của Lớp</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-lg border border-brand-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-2xl shrink-0">
            🏆
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-amber-500">
              {topPerformer && topPerformer.annualAverage > 0 ? topPerformer.annualAverage.toFixed(2) : '—'}
            </p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Thủ Khoa: {topPerformer ? topPerformer.studentName : '—'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-lg border border-brand-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl shrink-0">
            🌟
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600">{excellentRate}%</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tỉ Lệ Xuất Sắc & Giỏi</p>
          </div>
        </div>
      </div>

      {/* Main Report Container for Display & Capture */}
      <div ref={reportCaptureRef} className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 space-y-6">
        {/* Banner Header */}
        <div className="text-center pb-4 border-b border-slate-100 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-black uppercase tracking-wider mb-2">
            <span>🎓</span> BÁO CÁO TỔNG KẾT KẾT QUẢ HỌC TẬP CẢ NĂM
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-brand-900 tracking-tight font-display">
            {report?.centerName || 'ENGLISH LEGEND X5'} - NĂM {selectedYear}
          </h2>
          <p className="text-sm font-bold text-slate-500 mt-1">
            Lớp: <span className="text-emerald-700 font-black">{currentClass ? currentClass.name : '—'}</span> • Tổng hợp kết quả rèn luyện và tiến bộ của học sinh qua 12 tháng
          </p>
        </div>

        {/* Filter controls inside report view */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
            <span className="text-slate-400">🔍</span>
            <input
              type="text"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Tìm học sinh theo tên hoặc E.Name..."
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:border-brand-500 outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Lọc kết quả:</span>
            <button
              type="button"
              onClick={() => setClassificationFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                classificationFilter === 'ALL'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tất cả ({report?.studentScores.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setClassificationFilter('EXCELLENT')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 cursor-pointer ${
                classificationFilter === 'EXCELLENT'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span>⭐</span> Xuất Sắc (≥ 9.0)
            </button>
            <button
              type="button"
              onClick={() => setClassificationFilter('GOOD')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 cursor-pointer ${
                classificationFilter === 'GOOD'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span>✅</span> Giỏi trở lên (≥ 8.0)
            </button>
          </div>
        </div>

        {/* Matrix Table: 12 Months & Annual Summary */}
        <div className="border-2 border-slate-300 rounded-2xl overflow-x-auto shadow-sm bg-white">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr className="bg-gradient-to-r from-brand-700 via-brand-600 to-sky-700 text-white font-black text-xs">
                <th className="py-3 px-2 border-r border-white/20 w-[45px]">STT</th>
                <th className="py-3 px-3 border-r border-white/20 text-left min-w-[150px]">HỌ VÀ TÊN</th>
                <th className="py-3 px-2 border-r border-white/20 min-w-[90px]">E.NAME</th>
                {MONTH_NAMES.map((m, idx) => (
                  <th key={m} className="py-2.5 px-1.5 border-r border-white/20 min-w-[56px] text-[11px]">
                    T{idx + 1}
                  </th>
                ))}
                <th className="py-3 px-2 border-r border-white/20 bg-amber-400 text-amber-950 min-w-[85px]">
                  ĐIỂM TB NĂM
                </th>
                <th className="py-3 px-2 border-r border-white/20 min-w-[95px]">XẾP LOẠI</th>
                <th className="py-3 px-2 border-r border-white/20 min-w-[65px]">SỐ THÁNG</th>
                <th className="py-3 px-3 text-left min-w-[220px]">LỜI PHÊ TỔNG KẾT NĂM CỦA GIÁO VIÊN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={19} className="py-10 text-center text-slate-400 font-medium">
                    Chưa có học sinh hoặc chưa có dữ liệu phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((std, idx) => {
                  const isGold = std.annualAverage >= 9.0;
                  const isSilver = std.annualAverage >= 8.0 && !isGold;

                  return (
                    <tr
                      key={std.studentId}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        isGold ? 'bg-amber-50/40' : isSilver ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-2 font-bold text-slate-400 text-[11px] border-r border-slate-200">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-3 font-black text-slate-800 text-left whitespace-nowrap border-r border-slate-200">
                        <div className="flex items-center gap-1.5">
                          {idx === 0 && std.annualAverage > 0 && <span>🥇</span>}
                          {idx === 1 && std.annualAverage > 0 && <span>🥈</span>}
                          {idx === 2 && std.annualAverage > 0 && <span>🥉</span>}
                          <span>{std.studentName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 font-bold text-emerald-800 border-r border-slate-200">
                        {std.englishName || <span className="text-slate-300">—</span>}
                      </td>

                      {/* 12 Months Scores - Cho phép giáo viên chỉnh sửa trực tiếp */}
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                        const mScore = std.monthlyScores[m];
                        const displayVal = mScore !== null && mScore !== undefined ? String(mScore) : '';
                        return (
                          <td key={m} className="p-0 border-r border-slate-200 font-bold text-xs relative group/cell">
                            <input
                              type="text"
                              value={displayVal}
                              onChange={e => handleMonthScoreChange(std.studentId, m, e.target.value)}
                              onBlur={() => {
                                saveCurrentReportImmediately();
                                setAutoSaveStatus('saved');
                              }}
                              placeholder="-"
                              className={`w-full h-8 text-center text-xs font-bold bg-transparent outline-none focus:bg-yellow-100 hover:bg-slate-50 transition-colors ${
                                typeof mScore === 'number' && mScore >= 9.0
                                  ? 'text-amber-900 font-black'
                                  : typeof mScore === 'number' && mScore >= 8.0
                                  ? 'text-emerald-900 font-black'
                                  : 'text-slate-800'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Annual Average */}
                      <td className="py-3 px-2 bg-amber-50/80 border-r border-slate-200 font-black text-sm text-amber-950">
                        {std.annualAverage > 0 ? (
                          <span className={`inline-block px-2 py-0.5 rounded-lg ${
                            std.annualAverage >= 9.0
                              ? 'bg-amber-400 text-amber-950 shadow-xs'
                              : std.annualAverage >= 8.0
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'text-slate-800'
                          }`}>
                            {std.annualAverage.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>

                      {/* Classification */}
                      <td className="py-3 px-2 border-r border-slate-200 font-black text-xs">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${
                            std.classification === 'Xuất sắc'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : std.classification === 'Giỏi'
                              ? 'bg-emerald-100 text-emerald-900'
                              : std.classification === 'Khá'
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {std.classification}
                        </span>
                      </td>

                      {/* Completed Months */}
                      <td className="py-3 px-2 border-r border-slate-200 font-bold text-slate-500 text-xs">
                        {std.completedMonthsCount}/12
                      </td>

                      {/* Teacher's Annual Remarks */}
                      <td className="py-2 px-3 text-left">
                        <input
                          type="text"
                          value={std.teacherRemarks || ''}
                          onChange={e => handleRemarksChange(std.studentId, e.target.value)}
                          onBlur={() => {
                            saveCurrentReportImmediately();
                            setAutoSaveStatus('saved');
                          }}
                          placeholder="Nhập lời phê tổng kết cả năm của em..."
                          className="w-full px-2 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg outline-none transition-all font-medium text-slate-800"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Podium: Top 3 Performers of the Year */}
        <div className="bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 rounded-3xl p-6 text-white space-y-6">
          <div className="text-center">
            <span className="text-2xl">🏆</span>
            <h3 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-amber-300 font-display">
              BẢNG VÀNG VINH DANH HỌC SINH XUẤT SẮC CẢ NĂM {selectedYear}
            </h3>
            <p className="text-xs text-brand-200 mt-1 font-medium">
              Vinh danh những học sinh có thành tích xuất sắc và nỗ lực bền bỉ nhất trong năm
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-4 items-end">
            {/* Top 2 - Á Quân 1 */}
            {report?.studentScores && report.studentScores.length > 1 && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 text-center border border-white/20 flex flex-col items-center order-2 sm:order-1 h-56 justify-between">
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-800 font-black text-xl flex items-center justify-center shadow-lg border-2 border-white">
                  🥈
                </div>
                <div>
                  <p className="font-black text-base text-white">{report.studentScores[1].studentName}</p>
                  <p className="text-xs text-brand-200 font-bold">{report.studentScores[1].englishName || 'Á Quân 1'}</p>
                </div>
                <div className="bg-white/15 px-3 py-1.5 rounded-xl w-full">
                  <p className="text-xl font-black text-amber-300">
                    {report.studentScores[1].annualAverage > 0 ? report.studentScores[1].annualAverage.toFixed(2) : '—'}
                  </p>
                  <p className="text-[10px] text-slate-300 uppercase font-bold">Điểm TB Cả Năm</p>
                </div>
              </div>
            )}

            {/* Top 1 - Quán Quân */}
            {report?.studentScores && report.studentScores.length > 0 && (
              <div className="bg-gradient-to-b from-amber-400/30 to-amber-600/30 backdrop-blur-md rounded-3xl p-5 text-center border-2 border-amber-400 flex flex-col items-center order-1 sm:order-2 h-64 justify-between shadow-2xl scale-105">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-amber-950 font-black text-2xl flex items-center justify-center shadow-xl border-2 border-white animate-pulse">
                  👑
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase text-amber-300 tracking-wider">★ THỦ KHOA CỦA NĂM ★</p>
                  <p className="font-black text-lg text-white mt-0.5">{report.studentScores[0].studentName}</p>
                  <p className="text-xs text-amber-200 font-bold">{report.studentScores[0].englishName || 'Quán Quân'}</p>
                </div>
                <div className="bg-amber-400 text-amber-950 px-4 py-2 rounded-2xl w-full font-black shadow-md">
                  <p className="text-2xl">
                    {report.studentScores[0].annualAverage > 0 ? report.studentScores[0].annualAverage.toFixed(2) : '—'}
                  </p>
                  <p className="text-[10px] uppercase font-black">Điểm TB Cả Năm</p>
                </div>
              </div>
            )}

            {/* Top 3 - Á Quân 2 */}
            {report?.studentScores && report.studentScores.length > 2 && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 text-center border border-white/20 flex flex-col items-center order-3 h-52 justify-between">
                <div className="w-12 h-12 rounded-full bg-amber-700 text-white font-black text-xl flex items-center justify-center shadow-lg border-2 border-white">
                  🥉
                </div>
                <div>
                  <p className="font-black text-base text-white">{report.studentScores[2].studentName}</p>
                  <p className="text-xs text-brand-200 font-bold">{report.studentScores[2].englishName || 'Á Quân 2'}</p>
                </div>
                <div className="bg-white/15 px-3 py-1.5 rounded-xl w-full">
                  <p className="text-xl font-black text-amber-300">
                    {report.studentScores[2].annualAverage > 0 ? report.studentScores[2].annualAverage.toFixed(2) : '—'}
                  </p>
                  <p className="text-[10px] text-slate-300 uppercase font-bold">Điểm TB Cả Năm</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
