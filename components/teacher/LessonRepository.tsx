import React, { useState, useEffect, useMemo } from 'react';
import { Assignment, ClassRoom, LessonPlan } from '../../types';
import {
  getAssignments,
  getClasses,
  getSubmissions,
  saveAssignment,
  deleteAssignment,
  getTodayString,
  subscribeToSync,
  updateAssignmentTitle
} from '../../services/assignmentService';
import { guardDestructiveAction } from '../../services/teacherAuth';
import { VocabularySection } from '../VocabularySection';
import { MegaChallenge } from '../MegaChallenge';
import { exportAssignmentToWord, exportAssignmentToPdf } from '../../utils/documentExport';

interface LessonRepositoryProps {
  onEditAssignment?: (assignment: Assignment) => void;
  onNavigateToCreate?: () => void;
}

export const LessonRepository: React.FC<LessonRepositoryProps> = ({
  onEditAssignment,
  onNavigateToCreate
}) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);

  // Filters & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilterState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_repo_class_filter') || 'ALL';
    }
    return 'ALL';
  });
  const setSelectedClassFilter = (c: string) => {
    setSelectedClassFilterState(c);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_repo_class_filter', c);
    }
  };

  const [dateFilter, setDateFilterState] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_repo_date_filter') as any;
      if (saved === 'ALL' || saved === 'TODAY' || saved === 'WEEK' || saved === 'MONTH' || saved === 'CUSTOM') return saved;
    }
    return 'ALL';
  });
  const setDateFilter = (df: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM') => {
    setDateFilterState(df);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_repo_date_filter', df);
    }
  };

  const [customDate, setCustomDateState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_repo_custom_date') || '';
    }
    return '';
  });
  const setCustomDate = (cd: string) => {
    setCustomDateState(cd);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_repo_custom_date', cd);
    }
  };

  const [viewMode, setViewModeState] = useState<'date_groups' | 'class_groups' | 'grid'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_repo_view_mode') as any;
      if (saved === 'date_groups' || saved === 'class_groups' || saved === 'grid') return saved;
    }
    return 'date_groups';
  });
  const setViewMode = (vm: 'date_groups' | 'class_groups' | 'grid') => {
    setViewModeState(vm);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_repo_view_mode', vm);
    }
  };

  // Modals state
  const [previewAssignment, setPreviewAssignment] = useState<Assignment | null>(null);
  const [reassignAssignment, setReassignAssignment] = useState<Assignment | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadData = () => {
    setAssignments(getAssignments());
    setClasses(getClasses());
    setSubmissions(getSubmissions());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToSync(() => {
      loadData();
    });
    return () => unsubscribe();
  }, []);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4500);
  };

  const handleCopyAssignmentLink = (assign: Assignment) => {
    try {
      const origin = window.location.origin || '';
      const pathname = window.location.pathname || '';
      const targetClassParam = assign.targetClassName && assign.targetClassName !== 'Tất cả các lớp' 
        ? `&class=${encodeURIComponent(assign.targetClassName)}` 
        : '';
      const link = `${origin}${pathname}?assign=${assign.id}${targetClassParam}`;
      
      const deadlineStr = assign.dueDate ? new Date(assign.dueDate).toLocaleString('vi-VN') : 'Theo thông báo';
      const classNameStr = assign.targetClassName || 'Toàn khối';

      const message = `📢 THÔNG BÁO BÀI TẬP TIẾNG ANH - LEGEND X5
📖 Bài tập: ${assign.title}
🏫 Dành cho: ${classNameStr}
⏰ Hạn nộp: ${deadlineStr}
${assign.teacherNote ? `💬 Lời dặn của cô: "${assign.teacherNote}"\n` : ''}
🔗 LINK LÀM BÀI TRỰC TUYẾN:
${link}

⚠️ QUY ĐỊNH BÀI LÀM:
- Mỗi học sinh CHỈ ĐƯỢC NỘP BÀI 1 LẦN DUY NHẤT.
- Sau khi bấm nộp bài, hệ thống sẽ tự động khóa và lưu điểm vào sổ theo dõi của Thầy Cô.
- Các em hãy ôn kỹ bài và kiểm tra thật cẩn thận trước khi nộp nhé!`;

      navigator.clipboard.writeText(message);
      showNotification(`📋 Đã sao chép link và nội dung giao bài cho ${classNameStr}! Cô có thể dán (Ctrl+V) vào nhóm Zalo của lớp.`);
    } catch (e) {
      alert('Không thể tự động sao chép link, vui lòng thử lại.');
    }
  };

  // Helper date calculations
  const todayStr = getTodayString();

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter(item => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchTopic = item.topic?.toLowerCase().includes(q);
        const matchGrammar = item.lessonPlan?.grammar?.topic?.toLowerCase().includes(q);
        const matchVocab = item.lessonPlan?.vocabulary?.some(v =>
          v.word.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)
        );
        if (!matchTitle && !matchTopic && !matchGrammar && !matchVocab) {
          return false;
        }
      }

      // 2. Class Filter
      if (selectedClassFilter !== 'ALL') {
        const matchDirect = item.targetClassId === selectedClassFilter;
        const matchInIds = Array.isArray(item.targetClassIds) && item.targetClassIds.includes(selectedClassFilter);
        const matchAll = item.targetClassId === 'ALL' || (Array.isArray(item.targetClassIds) && item.targetClassIds.includes('ALL'));
        const matchedClassObj = classes.find(c => c.id === selectedClassFilter);
        const matchInNames = matchedClassObj && Array.isArray(item.targetClassNames) && item.targetClassNames.includes(matchedClassObj.name);
        const matchNameStr = matchedClassObj && item.targetClassName && item.targetClassName.includes(matchedClassObj.name);

        if (!matchDirect && !matchInIds && !matchAll && !matchInNames && !matchNameStr) {
          return false;
        }
      }

      // 3. Date Filter
      if (dateFilter === 'TODAY') {
        if (item.assignedDate !== todayStr) return false;
      } else if (dateFilter === 'WEEK') {
        const itemDate = new Date(item.assignedDate || item.createdAt);
        const now = new Date();
        const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7 || diffDays < -1) return false;
      } else if (dateFilter === 'MONTH') {
        const itemDate = new Date(item.assignedDate || item.createdAt);
        const now = new Date();
        if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) {
          return false;
        }
      } else if (dateFilter === 'CUSTOM' && customDate) {
        if (item.assignedDate !== customDate) return false;
      }

      return true;
    });
  }, [assignments, searchQuery, selectedClassFilter, dateFilter, customDate, todayStr, classes]);

  // Group by Date for 'date_groups' view
  const assignmentsByDate = useMemo(() => {
    const groups: { [date: string]: Assignment[] } = {};
    filteredAssignments.forEach(a => {
      const d = a.assignedDate || (a.createdAt ? a.createdAt.split('T')[0] : 'Chưa xác định');
      if (!groups[d]) groups[d] = [];
      groups[d].push(a);
    });
    // Sort dates descending
    return Object.entries(groups).sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  }, [filteredAssignments]);

  // Group by Class for 'class_groups' view
  const assignmentsByClass = useMemo(() => {
    const groups: { [cls: string]: Assignment[] } = {};
    filteredAssignments.forEach(a => {
      const clsName = a.targetClassName || 'Chưa phân lớp';
      if (!groups[clsName]) groups[clsName] = [];
      groups[clsName].push(a);
    });
    return Object.entries(groups);
  }, [filteredAssignments]);

  // Total question counter for an assignment
  const getQuestionCount = (a: Assignment) => {
    const p = a.lessonPlan?.practice;
    if (!p) return 0;
    const m = p.megaTest;
    return (
      (m?.multipleChoice?.length || 0) +
      (m?.scramble?.length || 0) +
      (m?.readingMC?.length || 0) +
      (m?.pronunciation?.length || 0) +
      (m?.fillBlank?.length || 0) +
      (m?.vocabTranslation?.length || 0) +
      (m?.trueFalse?.length || 0) +
      (p?.listening?.length || 0)
    );
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Cô có chắc chắn muốn xóa tài liệu bài tập "${title}" khỏi kho không? Dữ liệu đã xóa sẽ không thể phục hồi.`)) {
      if (!(await guardDestructiveAction('assignment', title))) return;
      deleteAssignment(id);
      loadData();
      showNotification(`🗑️ Đã xóa bài tập "${title}" khỏi kho thành công!`);
    }
  };

  const handleRename = (id: string, currentTitle: string) => {
    const newTitle = window.prompt("Nhập tiêu đề mới cho bài tập:", currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      updateAssignmentTitle(id, newTitle.trim());
      loadData();
      showNotification(`✏️ Đã đổi tiêu đề thành "${newTitle.trim()}" thành công!`);
    }
  };

  // Helper formatting for Vietnamese date labels
  const formatDateLabel = (dateStr: string) => {
    if (dateStr === todayStr) return '✨ Hôm nay (' + formatDateDisplay(dateStr) + ')';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (dateStr === yesterdayStr) return '⏳ Hôm qua (' + formatDateDisplay(dateStr) + ')';
    return '📅 Ngày ' + formatDateDisplay(dateStr);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const totalQuestionsInRepo = useMemo(() => {
    return assignments.reduce((acc, a) => acc + getQuestionCount(a), 0);
  }, [assignments]);

  return (
    <div className="space-y-6 font-sans">
      {/* Toast thông báo thành công */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-emerald-400 font-bold text-sm sm:text-base flex items-center gap-3 animate-bounce">
          <span className="text-xl">🎉</span>
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner Kho Tài Liệu */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-brand-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-black uppercase tracking-wider">
              <span>📚</span> KHO TÀI LIỆU & BÀI GIẢNG ĐÃ SOẠN
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black uppercase tracking-tight font-display">
              NGÂN HÀNG BÀI TẬP LEGEND X5
            </h1>
            <p className="text-purple-100 text-sm sm:text-base font-medium max-w-2xl leading-relaxed">
              Toàn bộ bài giảng đã soạn được lưu trữ ngăn nắp theo từng lớp và từng ngày. Cô có thể tìm kiếm, xem lại giáo án đầy đủ, giao lại hoặc nhanh chóng giao bài cho lớp khác chỉ với 1 click!
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full lg:w-auto shrink-0">
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3.5 text-center border border-white/20 shadow-inner">
              <p className="text-2xl sm:text-3xl font-black">{assignments.length}</p>
              <p className="text-[10px] sm:text-xs text-purple-100 uppercase font-bold mt-0.5">Tài liệu đã soạn</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3.5 text-center border border-white/20 shadow-inner">
              <p className="text-2xl sm:text-3xl font-black">{classes.length}</p>
              <p className="text-[10px] sm:text-xs text-purple-100 uppercase font-bold mt-0.5">Lớp học phủ sóng</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3.5 text-center border border-white/20 shadow-inner">
              <p className="text-2xl sm:text-3xl font-black">{totalQuestionsInRepo}</p>
              <p className="text-[10px] sm:text-xs text-purple-100 uppercase font-bold mt-0.5">Câu hỏi bài tập</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3.5 text-center border border-white/20 shadow-inner">
              <p className="text-2xl sm:text-3xl font-black">{submissions.length}</p>
              <p className="text-[10px] sm:text-xs text-purple-100 uppercase font-bold mt-0.5">Lượt làm bài</p>
            </div>
          </div>
        </div>
      </div>

      {/* BỘ LỌC & TÌM KIẾM THEO LỚP, THEO NGÀY GỌN GÀNG */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-lg border border-slate-200 space-y-4">
        {/* Hàng 1: Ô tìm kiếm từ khóa + Nút tạo bài mới */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm bài tập theo tiêu đề, chủ đề, điểm ngữ pháp hoặc từ vựng..."
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold bg-slate-100 px-2 py-1 rounded-md"
              >
                ✕ Xóa
              </button>
            )}
          </div>

          {onNavigateToCreate && (
            <button
              onClick={onNavigateToCreate}
              className="px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <span>✨</span> Soạn Bài Mới Bằng AI
            </button>
          )}
        </div>

        {/* Hàng 2: Lọc theo Lớp học */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>🏫</span> LỌC THEO LỚP HỌC:
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Đang hiển thị: <strong className="text-purple-700">{filteredAssignments.length}</strong> bài tập
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedClassFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedClassFilter === 'ALL'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-200'
              }`}
            >
              <span>🌐</span> Tất cả các lớp ({assignments.length})
            </button>

            {classes.map(c => {
              // Count lessons assigned to this class
              const countForClass = assignments.filter(a =>
                a.targetClassId === 'ALL' ||
                a.targetClassId === c.id ||
                (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(c.id)) ||
                (Array.isArray(a.targetClassNames) && a.targetClassNames.includes(c.name)) ||
                (a.targetClassName && a.targetClassName.includes(c.name))
              ).length;

              const isSelected = selectedClassFilter === c.id;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClassFilter(c.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                  }`}
                >
                  <span>🏫</span>
                  <span>{c.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {countForClass}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hàng 3: Lọc theo Ngày & Chọn Chế độ hiển thị */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Lọc theo ngày */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1 mr-1">
              <span>📅</span> NGÀY:
            </span>

            <button
              onClick={() => { setDateFilter('ALL'); setCustomDate(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                dateFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Tất cả ngày
            </button>

            <button
              onClick={() => { setDateFilter('TODAY'); setCustomDate(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                dateFilter === 'TODAY' ? 'bg-brand-600 text-white border-brand-700' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Hôm nay
            </button>

            <button
              onClick={() => { setDateFilter('WEEK'); setCustomDate(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                dateFilter === 'WEEK' ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              7 ngày qua
            </button>

            <button
              onClick={() => { setDateFilter('MONTH'); setCustomDate(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                dateFilter === 'MONTH' ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Tháng này
            </button>

            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customDate}
                onChange={e => {
                  setCustomDate(e.target.value);
                  setDateFilter('CUSTOM');
                }}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-xl font-medium outline-none focus:border-purple-500 bg-white"
                title="Chọn ngày cụ thể"
              />
              {customDate && (
                <button
                  onClick={() => { setCustomDate(''); setDateFilter('ALL'); }}
                  className="text-[10px] text-slate-400 hover:text-rose-600 font-bold p-1"
                  title="Bỏ lọc ngày"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Chế độ gom nhóm / Xem */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
            <span className="text-[11px] font-bold text-slate-500 px-2">Xem theo:</span>
            <button
              onClick={() => setViewMode('date_groups')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'date_groups' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gom nhóm gọn gàng theo từng ngày giao"
            >
              📅 Theo Ngày
            </button>
            <button
              onClick={() => setViewMode('class_groups')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'class_groups' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gom nhóm theo từng lớp học"
            >
              🏫 Theo Lớp
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Xem dạng lưới tất cả bài"
            >
              🗂️ Lưới Thẻ
            </button>
          </div>
        </div>
      </div>

      {/* DANH SÁCH BÀI TẬP TRONG KHO */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center shadow-lg border border-slate-200 space-y-3">
          <div className="text-5xl">📖</div>
          <h3 className="text-lg font-black text-slate-800">Không tìm thấy tài liệu phù hợp trong kho</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            {searchQuery || selectedClassFilter !== 'ALL' || dateFilter !== 'ALL'
              ? 'Không có bài tập nào thỏa mãn bộ lọc hiện tại. Cô hãy thử xóa bớt từ khóa hoặc chọn "Tất cả các lớp".'
              : 'Kho tài liệu hiện đang trống. Cô hãy bấm "Soạn bài mới bằng AI" để bắt đầu biên soạn bài giảng nhé!'}
          </p>
          {(searchQuery || selectedClassFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedClassFilter('ALL');
                setDateFilter('ALL');
                setCustomDate('');
              }}
              className="mt-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              🔄 Đặt lại toàn bộ bộ lọc
            </button>
          )}
        </div>
      ) : viewMode === 'date_groups' ? (
        /* CHẾ ĐỘ 1: GOM NHÓM GỌN GÀNG THEO TỪNG NGÀY (MẶC ĐỊNH) */
        <div className="space-y-6">
          {assignmentsByDate.map(([dateKey, itemsOnDate]) => (
            <div key={dateKey} className="space-y-3">
              <div className="flex items-center justify-between border-b-2 border-purple-200 pb-2">
                <h3 className="text-sm sm:text-base font-black text-purple-900 flex items-center gap-2">
                  <span>{formatDateLabel(dateKey)}</span>
                </h3>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200">
                  {itemsOnDate.length} bài tập
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {itemsOnDate.map(assign => renderAssignmentCard(assign))}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'class_groups' ? (
        /* CHẾ ĐỘ 2: GOM NHÓM THEO TỪNG LỚP HỌC */
        <div className="space-y-6">
          {assignmentsByClass.map(([clsKey, itemsInClass]) => (
            <div key={clsKey} className="space-y-3">
              <div className="flex items-center justify-between border-b-2 border-emerald-200 pb-2">
                <h3 className="text-sm sm:text-base font-black text-emerald-900 flex items-center gap-2">
                  <span>🏫</span> Lớp: <span className="text-emerald-700">{clsKey}</span>
                </h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                  {itemsInClass.length} bài tập
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {itemsInClass.map(assign => renderAssignmentCard(assign))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* CHẾ ĐỘ 3: DẠNG LƯỚI TẤT CẢ THẺ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map(assign => renderAssignmentCard(assign))}
        </div>
      )}

      {/* MODAL 1: GIAO LẠI BÀI TẬP HOẶC GIAO CHO LỚP KHÁC */}
      {reassignAssignment && (
        <ReassignModal
          assignment={reassignAssignment}
          classes={classes}
          onClose={() => setReassignAssignment(null)}
          onSuccess={(newAssign, classNamesStr) => {
            setReassignAssignment(null);
            loadData();
            showNotification(`🚀 Đã giao lại bài tập "${newAssign.title}" cho ${classNamesStr} thành công!`);
          }}
        />
      )}

      {/* MODAL 2: XEM CHI TIẾT TOÀN BỘ BÀI HỌC (GIỐNG HỌC SINH KÈM MEGATEST) */}
      {previewAssignment && (
        <LessonPreviewModal
          assignment={previewAssignment}
          onClose={() => setPreviewAssignment(null)}
          onReassign={() => {
            const target = previewAssignment;
            setPreviewAssignment(null);
            setReassignAssignment(target);
          }}
          onAssignmentUpdated={(updated) => {
            setPreviewAssignment(updated);
            loadData();
          }}
        />
      )}
    </div>
  );

  // Helper render 1 thẻ bài tập gọn gàng
  function renderAssignmentCard(assign: Assignment) {
    const qCount = getQuestionCount(assign);
    const subCount = submissions.filter(s => s.assignmentId === assign.id).length;
    const vocabCount = assign.lessonPlan?.vocabulary?.length || 0;
    const grammarTopic = assign.lessonPlan?.grammar?.topic;
    const readingTitle = assign.lessonPlan?.reading?.title;

    // Check deadline status
    const isExpired = assign.dueDate && new Date(assign.dueDate).getTime() < Date.now();

    return (
      <div
        key={assign.id}
        className="bg-white rounded-2xl border-2 border-slate-100 hover:border-purple-300 shadow-sm hover:shadow-md transition-all flex flex-col justify-between p-5 space-y-4 relative group"
      >
        <div className="space-y-3">
          {/* Top badges: Lớp + Trạng thái hạn nộp + Loại bài */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-800 text-[11px] font-black border border-purple-200 flex items-center gap-1">
                <span>🏫</span> {assign.targetClassName || 'Tất cả các lớp'}
              </span>
              {assign.assignmentType === 'exam' && (
                <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 text-[10px] font-black border border-indigo-200">
                  📜 ĐỀ THI GỐC
                </span>
              )}
            </div>

            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
              isExpired
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {isExpired ? '⌛ Hết hạn nộp' : '🟢 Đang mở bài'}
            </span>
          </div>

          {/* Tiêu đề & Topic */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-black text-slate-900 text-base leading-snug line-clamp-2 group-hover:text-purple-700 transition-colors flex-1">
                {assign.title}
              </h4>
              <button
                type="button"
                onClick={() => handleRename(assign.id, assign.title)}
                className="p-1 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-colors shrink-0 cursor-pointer"
                title="Đổi tiêu đề bài giao"
              >
                ✏️
              </button>
            </div>
            {assign.topic && assign.topic !== assign.title && (
              <p className="text-xs text-slate-500 font-medium line-clamp-1 mt-0.5">
                Chủ đề: {assign.topic}
              </p>
            )}
          </div>

          {/* Điểm nhấn nội dung bài học / đề thi */}
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs text-slate-600 font-medium">
            {assign.assignmentType === 'exam' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-indigo-700 font-bold">📜 Đề thi bảo toàn gốc</span>
                <span>•</span>
                <span className="text-blue-600 font-bold">⚡ {assign.examData?.totalQuestions || qCount} câu hỏi</span>
                <span>•</span>
                <span className="text-amber-700 font-bold">🎯 Thang {assign.examData?.targetScale === 10 ? '10.0' : `${assign.examData?.originalMaxScore || 10}đ`}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-brand-600 font-bold">🔤 {vocabCount} từ vựng</span>
                  <span>•</span>
                  <span className="text-blue-600 font-bold">⚡ {qCount} câu bài tập</span>
                </div>
                {grammarTopic && (
                  <p className="line-clamp-1 text-[11px] text-slate-500">
                    ✨ <strong>Ngữ pháp:</strong> {grammarTopic}
                  </p>
                )}
                {readingTitle && (
                  <p className="line-clamp-1 text-[11px] text-slate-500">
                    📖 <strong>Đọc hiểu:</strong> {readingTitle}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Ngày giao & Tiến độ nộp bài */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>📅 Giao: {formatDateDisplay(assign.assignedDate)}</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
              {subCount} bài đã nộp
            </span>
          </div>

          {/* Lời dặn thầy cô (nếu có) */}
          {assign.teacherNote && (
            <p className="text-[11px] text-slate-400 italic line-clamp-1 border-l-2 border-brand-300 pl-2">
              "{assign.teacherNote}"
            </p>
          )}
        </div>

        {/* CÁC NÚT HÀNH ĐỘNG CHÍNH */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          {/* NÚT COPY LINK GIAO BÀI ZALO (CHỈ LÀM 1 LẦN) */}
          <button
            type="button"
            onClick={() => handleCopyAssignmentLink(assign)}
            className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer transform active:scale-98"
            title="Copy link kèm lời dặn để gửi vào nhóm Zalo (học sinh chỉ làm 1 lần)"
          >
            <span>📋</span> Copy Link Giao Bài Zalo (1 lần làm)
          </button>

          {/* NÚT QUAN TRỌNG NHẤT: GIAO LẠI / GIAO CHO LỚP KHÁC */}
          <button
            type="button"
            onClick={() => setReassignAssignment(assign)}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-sky-600 to-sky-600 hover:from-sky-700 hover:to-sky-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer transform active:scale-98"
          >
            <span>🔄</span> Giao Lại Hoặc Giao Cho Lớp Khác
          </button>

          {/* CÁC NÚT TẢI FILE WORD & XUẤT FILE PDF */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => exportAssignmentToWord(assign, true)}
              className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs border border-blue-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              title="Tải xuống đề bài & đáp án file Word (.doc)"
            >
              <span>📄</span> Tải Word
            </button>
            <button
              type="button"
              onClick={() => exportAssignmentToPdf(assign, true)}
              className="py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold text-xs border border-purple-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              title="Xuất file PDF hoặc in trực tiếp ra giấy A4"
            >
              <span>🖨️</span> Xuất PDF
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Nút xem chi tiết / làm thử */}
            <button
              type="button"
              onClick={() => setPreviewAssignment(assign)}
              className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 rounded-xl font-bold text-xs border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              title="Xem trọn vẹn giáo án và làm thử bài tập MegaChallenge"
            >
              <span>👁️</span> Xem bài
            </button>

            {/* Nút chỉnh sửa / nhân bản */}
            {onEditAssignment && (
              <button
                type="button"
                onClick={() => onEditAssignment(assign)}
                className="py-1.5 px-2.5 bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700 rounded-xl font-bold text-xs border border-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                title="Mở sang màn hình Soạn bài AI để chỉnh sửa thêm"
              >
                <span>✏️</span> Sửa
              </button>
            )}

            {/* Nút xóa */}
            <button
              type="button"
              onClick={() => handleDelete(assign.id, assign.title)}
              className="py-1.5 px-2.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl font-bold text-xs border border-slate-200 transition-colors flex items-center justify-center cursor-pointer"
              title="Xóa bài tập khỏi kho"
            >
              <span>🗑️</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
};

// ==================== MODAL GIAO LẠI / GIAO CHO LỚP KHÁC ====================
export interface ReassignModalProps {
  assignment: Assignment;
  classes: ClassRoom[];
  onClose: () => void;
  onSuccess: (newAssignment: Assignment, classNamesStr: string) => void;
}

export const ReassignModal: React.FC<ReassignModalProps> = ({
  assignment,
  classes,
  onClose,
  onSuccess
}) => {
  const [classMode, setClassMode] = useState<'custom' | 'all'>('custom');
  // Initialize with the first class, or an unassigned class if available
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(() => {
    // If the original was for a single class, pre-select the other classes or keep first class
    return classes.length > 0 ? [classes[0].id] : [];
  });

  const [assignedDate, setAssignedDate] = useState(getTodayString());
  const [dueDate, setDueDate] = useState(() => {
    // Tomorrow at 23:59
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const y = tmr.getFullYear();
    const m = String(tmr.getMonth() + 1).padStart(2, '0');
    const d = String(tmr.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T23:59`;
  });

  const [newTitle, setNewTitle] = useState(assignment.title);
  const [teacherNote, setTeacherNote] = useState(
    assignment.teacherNote || 'Bài tập ôn tập cô giao lại, các em hoàn thành cẩn thận nhé!'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleClass = (cId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(cId) ? prev.filter(id => id !== cId) : [...prev, cId]
    );
  };

  const selectAllClasses = () => {
    setSelectedClassIds(classes.map(c => c.id));
  };

  const clearAllClasses = () => {
    setSelectedClassIds([]);
  };

  // Quick deadline presets
  const applyPresetDeadline = (daysAhead: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysAhead);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    setDueDate(`${y}-${m}-${d}T23:59`);
  };

  const applyWeekendDeadline = () => {
    const target = new Date();
    const currentDay = target.getDay(); // 0 is Sunday, 6 is Saturday
    const daysUntilSunday = (7 - currentDay) % 7 || 7;
    target.setDate(target.getDate() + daysUntilSunday);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    setDueDate(`${y}-${m}-${d}T23:59`);
  };

  const selectedClasses = classMode === 'all'
    ? classes
    : classes.filter(c => selectedClassIds.includes(c.id));

  const handleConfirmReassign = () => {
    if (!newTitle.trim()) {
      alert('Cô hãy nhập tiêu đề bài tập nhé!');
      return;
    }

    if (classMode === 'custom' && selectedClassIds.length === 0) {
      alert('Cô hãy chọn ít nhất 1 lớp học để giao bài nhé!');
      return;
    }

    setIsSubmitting(true);

    try {
      const isAll = classMode === 'all';

      const targetClassNames = isAll
        ? ['Tất cả các lớp']
        : selectedClasses.map(c => c.name);

      const targetClassIds = isAll
        ? ['ALL', ...classes.map(c => c.id)]
        : selectedClasses.map(c => c.id);

      const targetClassId = isAll
        ? 'ALL'
        : (selectedClasses.length === 1 ? selectedClasses[0].id : 'MULTI');

      const targetClassName = isAll
        ? 'Tất cả các lớp'
        : targetClassNames.join(', ');

      const newAssignment: Assignment = {
        id: `assign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: newTitle.trim(),
        topic: assignment.topic || newTitle.trim(),
        assignedDate,
        dueDate,
        targetClassId,
        targetClassName,
        targetClassIds,
        targetClassNames,
        teacherNote: teacherNote.trim(),
        lessonPlan: assignment.lessonPlan,
        createdAt: new Date().toISOString()
      };

      saveAssignment(newAssignment);
      onSuccess(newAssignment, targetClassName);
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi lưu bài tập giao lại. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border-4 border-emerald-300 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 p-5 sm:p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl shrink-0">
              🔄
            </div>
            <div>
              <h3 className="font-black text-lg sm:text-xl uppercase tracking-tight">
                GIAO LẠI / GIAO CHO LỚP KHÁC
              </h3>
              <p className="text-emerald-100 text-xs font-medium mt-0.5">
                Sử dụng lại toàn bộ giáo án & bài tập đã soạn để giao cho các lớp mong muốn.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Thông tin tóm tắt bài tập gốc */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-emerald-900 uppercase">📄 BÀI TẬP GỐC ĐƯỢC CHỌN:</span>
              <span className="text-[11px] font-bold text-slate-500">
                Lớp đã từng giao: <strong>{assignment.targetClassName}</strong>
              </span>
            </div>
            <h4 className="font-black text-slate-900 text-sm sm:text-base">
              {assignment.title}
            </h4>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="px-2 py-0.5 bg-white rounded-md border border-emerald-200 font-bold text-emerald-700">
                🔤 {assignment.lessonPlan?.vocabulary?.length || 0} từ vựng
              </span>
              <span className="px-2 py-0.5 bg-white rounded-md border border-emerald-200 font-bold text-teal-700">
                ✨ {assignment.lessonPlan?.grammar?.topic || 'Ngữ pháp'}
              </span>
              <span className="px-2 py-0.5 bg-white rounded-md border border-emerald-200 font-bold text-blue-700">
                🚀 MegaChallenge sẵn sàng
              </span>
            </div>
          </div>

          {/* Tiêu đề bài tập */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
              📝 Tiêu Đề Bài Giao (Có thể chỉnh sửa nếu muốn):
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-emerald-500 outline-none bg-white shadow-xs"
            />
          </div>

          {/* BỘ CHỌN LỚP GIAO BÀI (TÙY CHỌN HOẶC TẤT CẢ) */}
          <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border-2 border-emerald-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <span>🏫</span> CHỌN CÁC LỚP NHẬN BÀI TẬP:
              </label>

              <div className="text-xs font-bold px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300">
                {classMode === 'all'
                  ? `🌐 Đang chọn: Tất cả các lớp (${classes.length} lớp)`
                  : `🎯 Đã chọn: ${selectedClasses.map(c => c.name).join(', ')} (${selectedClasses.length} lớp)`}
              </div>
            </div>

            {/* 2 Chế độ: Tùy chọn lớp (mặc định) vs Tất cả các lớp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setClassMode('custom')}
                className={`p-3 rounded-xl text-left border-2 transition-all flex items-center gap-2.5 cursor-pointer ${
                  classMode === 'custom'
                    ? 'bg-white border-emerald-500 shadow-sm ring-2 ring-emerald-200'
                    : 'bg-white/60 border-slate-200 text-slate-600'
                }`}
              >
                <span className="text-lg">{classMode === 'custom' ? '🎯' : '⚪'}</span>
                <div>
                  <div className="text-xs font-black text-slate-900">TÙY CHỌN LỚP GIAO BÀI</div>
                  <div className="text-[10px] text-slate-500">Tích chọn 1 lớp, 2 lớp hoặc nhiều lớp cụ thể</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setClassMode('all')}
                className={`p-3 rounded-xl text-left border-2 transition-all flex items-center gap-2.5 cursor-pointer ${
                  classMode === 'all'
                    ? 'bg-white border-emerald-500 shadow-sm ring-2 ring-emerald-200'
                    : 'bg-white/60 border-slate-200 text-slate-600'
                }`}
              >
                <span className="text-lg">{classMode === 'all' ? '🌐' : '⚪'}</span>
                <div>
                  <div className="text-xs font-black text-slate-900">GIAO CHO TẤT CẢ CÁC LỚP</div>
                  <div className="text-[10px] text-slate-500">Áp dụng toàn bộ {classes.length} lớp hiện có</div>
                </div>
              </button>
            </div>

            {/* Checkbox danh sách lớp khi chọn tùy chọn */}
            {classMode === 'custom' ? (
              <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Bấm chọn lớp học nhận bài:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllClasses}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded cursor-pointer"
                    >
                      ✓ Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={clearAllClasses}
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-600 bg-slate-100 px-2 py-0.5 rounded cursor-pointer"
                    >
                      ✕ Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {classes.map(c => {
                    const isSelected = selectedClassIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleClass(c.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition-all flex items-center gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm scale-102'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <span>{isSelected ? '☑️' : '⬜'}</span>
                        <span>{c.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {c.studentCount || 0} HS
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedClassIds.length === 0 && (
                  <p className="text-xs text-rose-600 font-bold mt-1">⚠️ Cô hãy bấm chọn ít nhất 1 lớp học nhé!</p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-emerald-100/50 rounded-xl text-xs text-emerald-800 font-medium">
                📢 Bài tập sẽ được gửi đồng loạt tới toàn bộ <strong>{classes.length} lớp</strong> ({classes.map(c => c.name).join(', ')}).
              </div>
            )}
          </div>

          {/* Thời gian giao & Hạn nộp bài */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                📅 Ngày Bắt Đầu Giao Bài:
              </label>
              <input
                type="date"
                value={assignedDate}
                onChange={e => setAssignedDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-emerald-500 outline-none bg-white shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                ⏰ Hạn Chót Nộp Bài (Deadline):
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-emerald-500 outline-none bg-white shadow-xs"
              />
            </div>

            {/* Quick deadline buttons */}
            <div className="col-span-full flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] font-bold text-slate-500 mr-1">Đặt nhanh hạn nộp:</span>
              <button
                type="button"
                onClick={() => applyPresetDeadline(1)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                ⚡ 24 Giờ (Ngày mai)
              </button>
              <button
                type="button"
                onClick={() => applyPresetDeadline(3)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                📅 3 Ngày tới
              </button>
              <button
                type="button"
                onClick={applyWeekendDeadline}
                className="text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                🏖️ Cuối tuần này (Chủ nhật)
              </button>
              <button
                type="button"
                onClick={() => applyPresetDeadline(7)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                🗓️ 1 Tuần tới
              </button>
            </div>
          </div>

          {/* Lời nhắn dặn học sinh */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
              💬 Lời Nhắn Dặn Học Sinh:
            </label>
            <input
              type="text"
              value={teacherNote}
              onChange={e => setTeacherNote(e.target.value)}
              placeholder="Lời nhắn dặn học sinh khi làm bài..."
              className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-emerald-500 outline-none bg-white shadow-xs"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Hủy Bỏ
          </button>

          <button
            type="button"
            onClick={handleConfirmReassign}
            disabled={isSubmitting || (classMode === 'custom' && selectedClassIds.length === 0)}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm sm:text-base shadow-lg transition-all flex items-center gap-2 cursor-pointer transform active:scale-98"
          >
            {isSubmitting ? (
              <span>Đang lưu...</span>
            ) : (
              <>
                <span>🚀</span> XÁC NHẬN GIAO BÀI CHO LỚP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== MODAL XEM TRỌN VẸN BÀI HỌC ====================
export interface LessonPreviewModalProps {
  assignment: Assignment;
  onClose: () => void;
  onReassign: () => void;
  onAssignmentUpdated?: (updated: Assignment) => void;
}

export const LessonPreviewModal: React.FC<LessonPreviewModalProps> = ({
  assignment,
  onClose,
  onReassign,
  onAssignmentUpdated
}) => {
  const [currentAssign, setCurrentAssign] = useState<Assignment>(assignment);

  useEffect(() => {
    setCurrentAssign(assignment);
  }, [assignment]);

  const handleUpdateMega = (newMega: any) => {
    if (!currentAssign?.lessonPlan) return;
    const updated: Assignment = {
      ...currentAssign,
      lessonPlan: {
        ...currentAssign.lessonPlan,
        practice: {
          ...currentAssign.lessonPlan.practice,
          megaTest: newMega
        }
      }
    };
    setCurrentAssign(updated);
    saveAssignment(updated);
    onAssignmentUpdated?.(updated);
  };

  const handleUpdateListening = (newListening: any) => {
    if (!currentAssign?.lessonPlan) return;
    const updated: Assignment = {
      ...currentAssign,
      lessonPlan: {
        ...currentAssign.lessonPlan,
        practice: {
          ...currentAssign.lessonPlan.practice,
          listening: newListening
        }
      }
    };
    setCurrentAssign(updated);
    saveAssignment(updated);
    onAssignmentUpdated?.(updated);
  };

  const lesson = currentAssign.lessonPlan;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-50 rounded-3xl max-w-5xl w-full max-h-[95vh] flex flex-col shadow-2xl border-4 border-purple-300 overflow-hidden">
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-purple-700 to-indigo-700 p-5 sm:p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl shrink-0">
              👁️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-white/20 rounded-md text-[11px] font-black uppercase">
                  {assignment.targetClassName}
                </span>
                <span className="text-xs text-purple-200">
                  Giao: {assignment.assignedDate}
                </span>
              </div>
              <h3 className="font-black text-lg sm:text-xl leading-snug mt-0.5">
                {assignment.title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportAssignmentToWord(assignment, true)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              title="Tải xuống đề bài kèm đáp án chi tiết file Word (.doc)"
            >
              <span>📄</span> Tải Word
            </button>

            <button
              type="button"
              onClick={() => exportAssignmentToPdf(assignment, true)}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              title="Mở trình in ấn A4 hoặc bấm Lưu dưới dạng PDF"
            >
              <span>🖨️</span> In / PDF
            </button>

            <button
              onClick={onReassign}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span> Giao Cho Lớp Khác
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Nội dung bài học hoặc đề thi */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Lời dặn thầy cô */}
          {assignment.teacherNote && (
            <div className="bg-brand-50 border-l-4 border-brand-500 p-4 rounded-2xl">
              <p className="text-xs font-black uppercase text-brand-800">💬 Lời Dặn Của Thầy Cô:</p>
              <p className="text-sm text-slate-700 italic mt-1">"{assignment.teacherNote}"</p>
            </div>
          )}

          {/* TRƯỜNG HỢP 1: ĐỀ THI GỐC BẢO TOÀN (PRESERVED EXAM) */}
          {assignment.assignmentType === 'exam' && assignment.examData ? (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                    <span>📜</span> ĐỀ THI GỐC BẢO TOÀN NỘI DUNG 100%
                  </div>
                  <p className="text-sm font-bold text-slate-700 mt-0.5">
                    Tổng cộng: {assignment.examData.totalQuestions} câu hỏi • Thang điểm: {assignment.examData.targetScale === 10 ? '10.0' : assignment.examData.originalMaxScore} • Thời gian: {assignment.examData.durationMinutes || 45} phút
                  </p>
                </div>
                <span className="px-3 py-1 bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs">
                  {assignment.examData.hasAnswerKey ? '🔑 Có sẵn đáp án gốc' : '🤖 AI đã giải chi tiết'}
                </span>
              </div>

              {assignment.examData.sections.map((sec, sIdx) => (
                <div key={sIdx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="border-b border-slate-100 pb-2">
                    <h5 className="font-black text-brand-900 text-sm sm:text-base">
                      Phần {sIdx + 1}: {sec.title}
                    </h5>
                    {sec.instruction && (
                      <p className="text-xs font-semibold text-slate-500 italic mt-0.5">{sec.instruction}</p>
                    )}
                  </div>

                  {sec.passage && (
                    <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs sm:text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                      <strong className="text-amber-900 block mb-1">📖 Bài đọc hiểu:</strong>
                      {sec.passage}
                    </div>
                  )}

                  <div className="space-y-3">
                    {sec.questions.map((q, qIdx) => (
                      <div key={q.id || qIdx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs sm:text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-brand-800">
                            {q.number || `Câu ${qIdx + 1}`} ({q.points}đ)
                          </span>
                          <span className="text-[11px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border">
                            {q.type}
                          </span>
                        </div>
                        <p className="font-bold text-slate-800">{q.questionText}</p>
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {q.options.map((opt, optIdx) => (
                              <div key={optIdx} className="p-2 bg-white rounded-lg border text-xs text-slate-700 font-medium">
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="p-2.5 bg-emerald-50 rounded-lg text-xs text-emerald-900 font-semibold space-y-0.5">
                          <div>
                            Đáp án chuẩn: <span className="font-black text-emerald-800">{q.correctAnswer}</span>
                            {q.alternativeAnswers && q.alternativeAnswers.length > 0 && (
                              <span className="text-slate-500 italic ml-2">(Chấp nhận: {q.alternativeAnswers.join(', ')})</span>
                            )}
                          </div>
                          {q.explanation && (
                            <p className="text-slate-600 font-normal italic">💡 {q.explanation}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* TRƯỜNG HỢP 2: BÀI HỌC THÔNG THƯỜNG */
            <>
              {/* PHẦN 1: TỪ VỰNG */}
              {lesson?.vocabulary && lesson.vocabulary.length > 0 && (
                <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200 space-y-3">
                  <h4 className="text-base font-black text-brand-900 uppercase flex items-center gap-2">
                    <span>🔤</span> PHẦN 1: TỪ VỰNG TIẾNG ANH ({lesson.vocabulary.length} từ)
                  </h4>
                  <VocabularySection items={lesson.vocabulary} topicTitle={lesson.topic} />
                </div>
              )}

              {/* PHẦN 2: NGỮ PHÁP */}
              {lesson?.grammar && (
                <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200 space-y-3">
                  <h4 className="text-base font-black text-brand-900 uppercase flex items-center gap-2">
                    <span>✨</span> PHẦN 2: NGỮ PHÁP QUAN TRỌNG
                  </h4>
                  <div className="bg-brand-50/50 p-4 rounded-2xl space-y-2">
                    <h5 className="font-black text-brand-700 text-base">{lesson.grammar.topic}</h5>
                    <p className="text-sm text-slate-700 leading-relaxed border-l-4 border-brand-500 pl-3">
                      {lesson.grammar.explanation}
                    </p>
                    {lesson.grammar.examples && lesson.grammar.examples.length > 0 && (
                      <div className="pt-2 space-y-1">
                        <span className="text-xs font-bold text-brand-600 uppercase">Ví dụ:</span>
                        {lesson.grammar.examples.map((ex, i) => (
                          <div key={i} className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-brand-100 italic">
                            💎 "{ex}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PHẦN 3: SIÊU THỬ THÁCH BÀI TẬP MEGATEST (55 CÂU HỎI) */}
              {lesson?.practice?.megaTest && (
                <div className="space-y-3">
                  <div className="bg-purple-900 text-white p-3 rounded-2xl flex items-center justify-between text-xs font-bold">
                    <span>🚀 BÀI TẬP MEGATEST HỌC SINH LÀM:</span>
                    <span className="bg-white/20 px-3 py-1 rounded-xl">Cô có thể làm thử trực tiếp</span>
                  </div>
                  <MegaChallenge
                    megaData={lesson.practice.megaTest}
                    listeningData={lesson.practice.listening}
                    isTeacher={true}
                    lessonContext={{
                      grade: currentAssign.grade,
                      topic: lesson.topic,
                      grammarTopic: lesson.grammar?.topic,
                      grammarStructure: lesson.grammar?.structure,
                      vocabulary: lesson.vocabulary?.map((v: any) => v.word || v.term).filter(Boolean),
                    }}
                    onUpdateMegaData={handleUpdateMega}
                    onUpdateListeningData={handleUpdateListening}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-medium">
            Hạn chót: <strong>{assignment.dueDate || 'Không giới hạn'}</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 text-xs transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              onClick={onReassign}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span> Giao Cho Lớp Khác
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
