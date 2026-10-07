import React, { useState, useEffect, useMemo } from 'react';
import { LessonPlan, Assignment, FallbackNotice, PreservedExam, ExamQuestion, ExamSection } from '../../types';
import { generateLessonPlan, fileToBase64, hasApiKey, extractExamFromDocument } from '../../services/geminiService';
import { getClasses, saveAssignment, getAssignments, deleteAssignment, getTodayString, getSubmissions, updateAssignmentTitle, subscribeToSync } from '../../services/assignmentService';
import { VocabularySection } from '../VocabularySection';
import { MegaChallenge } from '../MegaChallenge';
import { UploadZone } from '../UploadZone';
import { parseUploadedFile } from '../../utils/documentParser';
import { exportAssignmentToWord, exportAssignmentToPdf } from '../../utils/documentExport';
import { ReassignModal, LessonPreviewModal } from './LessonRepository';
import { useUpdateBlocker } from '../../services/appUpdate';
import { guardDestructiveAction } from '../../services/teacherAuth';

interface AssignmentCreatorProps {
  onOpenSettings: () => void;
  onAssignmentCreated?: () => void;
  onNavigateToRepository?: () => void;
  initialAssignment?: Assignment | null;
  onClearInitialAssignment?: () => void;
}

export const AssignmentCreator: React.FC<AssignmentCreatorProps> = ({
  onOpenSettings,
  onAssignmentCreated,
  onNavigateToRepository,
  initialAssignment,
  onClearInitialAssignment
}) => {
  const [plannerMode, setPlannerModeState] = useState<'topic' | 'text' | 'image' | 'exam'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_creator_planner_mode') as any;
      if (saved === 'topic' || saved === 'text' || saved === 'image' || saved === 'exam') return saved;
    }
    return 'topic';
  });
  const setPlannerMode = (mode: 'topic' | 'text' | 'image' | 'exam') => {
    setPlannerModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_creator_planner_mode', mode);
    }
  };
  const [topic, setTopic] = useState('');
  const [lessonText, setLessonText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'idle' | 'core' | 'practice'>('idle');
  const [fallbackInfo, setFallbackInfo] = useState<FallbackNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);

  // Preserved Exam States
  const [preservedExam, setPreservedExam] = useState<PreservedExam | null>(null);
  const [examTargetScale, setExamTargetScale] = useState<10 | 'original'>(10);
  const [examDuration, setExamDuration] = useState<number>(45);
  const [examRawInputMode, setExamRawInputMode] = useState<'upload' | 'text'>('upload');
  const [examPastedText, setExamPastedText] = useState('');
  const [showExamAnswerKey, setShowExamAnswerKey] = useState(true);

  // Cô đang soạn / đang tạo bài (chưa giao) → không tự tải lại trang để cập nhật phiên bản
  useUpdateBlocker(
    'teacher-creator',
    loading || !!lessonPlan || !!preservedExam || !!topic.trim() || !!lessonText.trim() || selectedFiles.length > 0 || !!examPastedText.trim(),
    'bài cô đang soạn'
  );

  // Assignment publish form
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignedDate, setAssignedDate] = useState(getTodayString());
  const [dueDate, setDueDate] = useState(() => {
    // Default deadline: tomorrow at 23:59
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const y = tmr.getFullYear();
    const m = String(tmr.getMonth() + 1).padStart(2, '0');
    const d = String(tmr.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T23:59`;
  });
  // Class assignment mode: 'custom' (Tùy chọn lớp - Mặc định) vs 'all' (Tất cả các lớp)
  const [classAssignmentMode, setClassAssignmentModeState] = useState<'custom' | 'all'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_creator_class_mode') as any;
      if (saved === 'custom' || saved === 'all') return saved;
    }
    return 'custom';
  });
  const setClassAssignmentMode = (mode: 'custom' | 'all') => {
    setClassAssignmentModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_creator_class_mode', mode);
    }
  };

  const classes = getClasses();
  // By default in custom mode, start with empty selection or restored selection
  const [selectedClassIds, setSelectedClassIdsState] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('mrs_dung_creator_selected_class_ids');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {}
    }
    return [];
  });
  const setSelectedClassIds = (ids: string[] | ((prev: string[]) => string[])) => {
    setSelectedClassIdsState(prev => {
      const next = typeof ids === 'function' ? ids(prev) : ids;
      if (typeof window !== 'undefined') {
        localStorage.setItem('mrs_dung_creator_selected_class_ids', JSON.stringify(next));
      }
      return next;
    });
  };
  const [teacherNote, setTeacherNote] = useState('Các em làm bài cẩn thận, nhớ nghe kỹ phần phát âm và đọc giải thích nhé!');
  const [publishedSuccess, setPublishedSuccess] = useState(false);

  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [submissionsCountMap, setSubmissionsCountMap] = useState<Record<string, number>>({});

  const refreshSubmissionsCount = () => {
    const subs = getSubmissions();
    const counts: Record<string, number> = {};
    for (let i = 0; i < subs.length; i++) {
      const aId = subs[i]?.assignmentId;
      if (aId) {
        counts[aId] = (counts[aId] || 0) + 1;
      }
    }
    setSubmissionsCountMap(counts);
  };

  useEffect(() => {
    setRecentAssignments(getAssignments());
    refreshSubmissionsCount();
    const unsub = subscribeToSync((event) => {
      if (
        event.type === 'assignment_created' ||
        event.type === 'assignment_updated' ||
        event.type === 'assignment_deleted' ||
        event.type === 'cloud_sync_completed'
      ) {
        setRecentAssignments(getAssignments());
      }
      if (
        event.type === 'submission_created' ||
        event.type === 'submission_deleted' ||
        event.type === 'submissions_updated' ||
        event.type === 'cloud_sync_completed'
      ) {
        refreshSubmissionsCount();
      }
    });
    return () => unsub();
  }, []);

  // Folder & Reassign states for recent assignments list
  const [activeFolderClassId, setActiveFolderClassId] = useState<string>('ALL');
  const [folderSortOrder, setFolderSortOrder] = useState<'asc' | 'desc'>('asc'); // 'asc' = từ cũ đến mới (mặc định)
  const [reassignTarget, setReassignTarget] = useState<Assignment | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Assignment | null>(null);
  const [folderToast, setFolderToast] = useState<string | null>(null);

  const handleAssignNextToClass = (classId: string, className: string) => {
    setClassAssignmentMode('custom');
    const matched = classes.find(c => c.id === classId || c.name === className);
    if (matched) {
      setSelectedClassIds([matched.id]);
    } else if (classId) {
      setSelectedClassIds([classId]);
    }
    setAssignmentTitle(`Bài tiếp theo - ${className}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setFolderToast(`✨ Đã chọn Thư mục lớp "${className}"! Cô hãy nhập chủ đề hoặc dán nội dung bài tiếp theo ở trên nhé.`);
    setTimeout(() => setFolderToast(null), 4500);
  };

  // Group recent assignments into class folders
  const classFolders = useMemo(() => {
    interface FolderItem {
      id: string;
      name: string;
      studentCount: number;
      assignments: Assignment[];
    }

    const folderMap = new Map<string, FolderItem>();

    // 1. Seed registered classes
    classes.forEach(c => {
      folderMap.set(c.id, {
        id: c.id,
        name: c.name,
        studentCount: c.studentCount || 0,
        assignments: []
      });
    });

    // 2. Distribute recent assignments into respective folders
    recentAssignments.forEach(assign => {
      let matched = false;

      // Check registered classes
      classes.forEach(c => {
        const directId = assign.targetClassId === c.id;
        const inIds = Array.isArray(assign.targetClassIds) && assign.targetClassIds.includes(c.id);
        const inNames = Array.isArray(assign.targetClassNames) && assign.targetClassNames.includes(c.name);
        const nameMatch = assign.targetClassName && (assign.targetClassName === c.name || assign.targetClassName.includes(c.name));
        const allMatch = assign.targetClassId === 'ALL' || (Array.isArray(assign.targetClassIds) && assign.targetClassIds.includes('ALL'));

        if (directId || inIds || inNames || nameMatch || allMatch) {
          const folder = folderMap.get(c.id);
          if (folder && !folder.assignments.some(a => a.id === assign.id)) {
            folder.assignments.push(assign);
            matched = true;
          }
        }
      });

      // Match custom class name if not in registered classes
      if (!matched && assign.targetClassName) {
        const cleanName = assign.targetClassName;
        const dynamicId = `folder_${cleanName.replace(/\s+/g, '_')}`;
        if (!folderMap.has(dynamicId)) {
          mapSetFolder(folderMap, dynamicId, cleanName);
        }
        const f = folderMap.get(dynamicId)!;
        if (!f.assignments.some(a => a.id === assign.id)) {
          f.assignments.push(assign);
          matched = true;
        }
      }

      // If still not matched, put in general folder
      if (!matched) {
        const genId = 'folder_general';
        if (!folderMap.has(genId)) {
          mapSetFolder(folderMap, genId, 'Bài tập chung');
        }
        const f = folderMap.get(genId)!;
        if (!f.assignments.some(a => a.id === assign.id)) {
          f.assignments.push(assign);
        }
      }
    });

    function mapSetFolder(m: Map<string, FolderItem>, id: string, name: string) {
      m.set(id, {
        id,
        name,
        studentCount: 0,
        assignments: []
      });
    }

    // 3. Sort assignments in each folder: 'asc' = từ cũ đến mới (mặc định), 'desc' = mới đến cũ
    const folders: FolderItem[] = [];
    folderMap.forEach(folder => {
      folder.assignments.sort((a, b) => {
        const timeA = new Date(a.assignedDate || a.createdAt || 0).getTime();
        const timeB = new Date(b.assignedDate || b.createdAt || 0).getTime();
        return folderSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      });
      if (folder.assignments.length > 0 || classes.some(c => c.id === folder.id)) {
        folders.push(folder);
      }
    });

    return folders;
  }, [classes, recentAssignments, folderSortOrder]);

  // Pre-fill if cloned or edited from LessonRepository
  useEffect(() => {
    if (initialAssignment) {
      setAssignmentTitle(initialAssignment.title ? `${initialAssignment.title} (Bản sao)` : '');
      setTopic(initialAssignment.topic || '');
      if (initialAssignment.assignmentType === 'exam' && initialAssignment.examData) {
        setPreservedExam(initialAssignment.examData);
        setPlannerMode('exam');
      } else {
        setLessonPlan(initialAssignment.lessonPlan || null);
      }
      if (initialAssignment.teacherNote) {
        setTeacherNote(initialAssignment.teacherNote);
      }
      if (initialAssignment.targetClassIds && initialAssignment.targetClassIds.length > 0) {
        if (initialAssignment.targetClassIds.includes('ALL') || initialAssignment.targetClassId === 'ALL') {
          setClassAssignmentMode('all');
        } else {
          setClassAssignmentMode('custom');
          setSelectedClassIds(initialAssignment.targetClassIds);
        }
      }
      if (onClearInitialAssignment) {
        onClearInitialAssignment();
      }
    }
  }, [initialAssignment]);

  const handleGenerateAI = async () => {
    if (!hasApiKey()) {
      onOpenSettings();
      setError('Cô vui lòng nhập API Key trước khi sử dụng tính năng tạo bài học AI nhé!');
      return;
    }

    const activeTopic = topic.trim() || assignmentTitle.trim();
    if (plannerMode === 'topic') {
      if (!activeTopic) {
        setError('Cô hãy nhập tiêu đề hoặc chủ đề bài học nhé!');
        return;
      }
      if (!topic.trim()) {
        setTopic(activeTopic);
      }
    }
    if (plannerMode === 'text' && !lessonText.trim()) {
      setError('Cô hãy dán nội dung bài học vào đây nhé!');
      return;
    }
    if (plannerMode === 'image' && selectedFiles.length === 0) {
      setError('Cô hãy chọn ít nhất một tấm ảnh tài liệu bài học nhé!');
      return;
    }
    if (plannerMode === 'exam') {
      if (examRawInputMode === 'upload' && selectedFiles.length === 0) {
        setError('Cô hãy chọn ít nhất một file đề thi (Word .docx, PDF hoặc Ảnh) nhé!');
        return;
      }
      if (examRawInputMode === 'text' && !examPastedText.trim()) {
        setError('Cô hãy dán nội dung đề thi vào ô văn bản nhé!');
        return;
      }
    }

    setLoading(true);
    setLoadingStage('core');
    setError(null);
    setFallbackInfo(null);
    setPublishedSuccess(false);

    // XỬ LÝ CHẾ ĐỘ ĐỀ THI GỐC (WORD / PDF / ẢNH)
    if (plannerMode === 'exam') {
      setPreservedExam(null);
      setLessonPlan(null);
      try {
        let parsedDoc;
        if (examRawInputMode === 'upload') {
          parsedDoc = await parseUploadedFile(selectedFiles[0]);
        } else {
          parsedDoc = {
            type: 'text' as const,
            text: examPastedText,
            fileName: 'Đề thi văn bản'
          };
        }

        const examData = await extractExamFromDocument(parsedDoc, {
          targetScale: examTargetScale,
          durationMinutes: examDuration,
          onFallbackNotice: (notice) => setFallbackInfo(notice)
        });

        setPreservedExam(examData);
        setAssignmentTitle(prev => prev.trim() ? prev : (examData.title || 'Đề kiểm tra tiếng Anh Legend X5'));
      } catch (err: any) {
        setError(err.message || 'Có lỗi xảy ra khi bóc tách đề thi. Cô hãy kiểm tra lại file đề thi nhé!');
      } finally {
        setLoading(false);
        setLoadingStage('idle');
      }
      return;
    }

    setLessonPlan(null);

    try {
      let base64Images: string[] = [];
      if (plannerMode === 'image' && selectedFiles.length > 0) {
        base64Images = await Promise.all(selectedFiles.map(file => fileToBase64(file)));
      }

      const data = await generateLessonPlan(
        plannerMode === 'topic' ? (topic || activeTopic) : undefined,
        plannerMode === 'text' ? lessonText : undefined,
        base64Images,
        (stage) => setLoadingStage(stage),
        (notice) => setFallbackInfo(notice)
      );

      setLessonPlan(data);
      setAssignmentTitle(prev => prev.trim() ? prev : (data.topic || topic || activeTopic || 'Bài tập tiếng Anh Legend X5'));
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi tạo bài giảng AI. Cô hãy kiểm tra lại kết nối hoặc API Key nhé!');
    } finally {
      setLoading(false);
      setLoadingStage('idle');
    }
  };

  const isAllMode = classAssignmentMode === 'all';

  const selectedClasses = isAllMode
    ? classes
    : classes.filter(c => selectedClassIds.includes(c.id));

  const toggleClass = (cId: string) => {
    setSelectedClassIds(prev => {
      if (prev.includes(cId)) {
        return prev.filter(id => id !== cId);
      } else {
        return [...prev, cId];
      }
    });
  };

  const selectAllClasses = () => {
    setSelectedClassIds(classes.map(c => c.id));
  };

  const clearAllSelectedClasses = () => {
    setSelectedClassIds([]);
  };

  const handlePublishAssignment = () => {
    if (!lessonPlan && !preservedExam) return;
    if (!assignmentTitle.trim()) {
      alert('Vui lòng nhập tên/tiêu đề bài tập!');
      return;
    }

    if (!isAllMode && selectedClassIds.length === 0) {
      alert('Cô hãy chọn ít nhất 1 lớp để giao bài nhé!');
      return;
    }

    const targetClassNames = isAllMode
      ? ['Tất cả các lớp']
      : selectedClasses.map(c => c.name);

    const targetClassIds = isAllMode
      ? ['ALL', ...classes.map(c => c.id)]
      : selectedClasses.map(c => c.id);

    const targetClassId = isAllMode
      ? 'ALL'
      : (selectedClasses.length === 1 ? selectedClasses[0].id : 'MULTI');

    const targetClassName = isAllMode
      ? 'Tất cả các lớp'
      : targetClassNames.join(', ');

    const fallbackLessonPlan: LessonPlan = lessonPlan || {
      topic: preservedExam?.title || assignmentTitle.trim(),
      vocabulary: [],
      grammar: { topic: preservedExam?.title || '', explanation: 'Đề kiểm tra bảo toàn nội dung gốc.', examples: [] },
      reading: { title: preservedExam?.title || '', passage: '', translation: '', comprehension: [] },
      homework: { title: '', description: '', instructions: '' },
      practice: { listening: [], megaTest: { multipleChoice: [], scramble: [], fillBlank: [], errorId: [], vocabTranslation: [], trueFalse: [], matching: [] } },
      teacherTips: 'Đề kiểm tra giữ nguyên 100% nội dung gốc.'
    };

    const newAssignment: Assignment = {
      id: `assign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: assignmentTitle.trim(),
      topic: preservedExam ? preservedExam.title : (fallbackLessonPlan.topic || assignmentTitle.trim()),
      assignedDate,
      dueDate,
      targetClassId,
      targetClassName,
      targetClassIds,
      targetClassNames,
      teacherNote: teacherNote.trim(),
      lessonPlan: fallbackLessonPlan,
      assignmentType: preservedExam ? 'exam' : 'lesson',
      examData: preservedExam || undefined,
      createdAt: new Date().toISOString()
    };

    saveAssignment(newAssignment);
    setRecentAssignments(getAssignments());
    setPublishedSuccess(true);
    if (onAssignmentCreated) onAssignmentCreated();

    // Reset form after short delay
    setTimeout(() => {
      setLessonPlan(null);
      setPreservedExam(null);
      setTopic('');
      setLessonText('');
      setExamPastedText('');
      setSelectedFiles([]);
      setPublishedSuccess(false);
    }, 2500);
  };

  const handleDeleteAssignment = async (id: string, title: string) => {
    if (confirm(`Cô có chắc chắn muốn xóa bài giao "${title}" không?`)) {
      if (!(await guardDestructiveAction('assignment', title))) return;
      deleteAssignment(id);
      setRecentAssignments(getAssignments());
    }
  };

  const handleRenameAssignment = (id: string, currentTitle: string) => {
    const newTitle = window.prompt("Nhập tiêu đề mới cho bài tập:", currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      updateAssignmentTitle(id, newTitle.trim());
      setRecentAssignments(getAssignments());
    }
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Box Soạn Bài Mới */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-brand-100 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">📝</span>
              <h2 className="text-xl sm:text-2xl font-black text-brand-900">Soạn Bài Học & Giao Bài Theo Ngày</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Tạo bài học chuẩn sách Global Success bằng AI, thiết lập hạn nộp và giao bài trực tiếp tới học sinh.
            </p>
          </div>
        </div>

        {/* PHẦN NHẬP TIÊU ĐỀ BÀI GIAO (HIỂN THỊ CHO HỌC SINH & THEO DÕI, QUẢN LÝ DỄ DÀNG) */}
        <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/40 to-brand-50/70 p-5 sm:p-6 rounded-3xl border-2 border-brand-300 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-sm sm:text-base font-black text-brand-900 uppercase tracking-wide flex items-center gap-2">
              <span className="text-xl">🏷️</span> TIÊU ĐỀ BÀI GIAO CHO HỌC SINH:
              <span className="text-rose-500 font-bold">*</span>
            </label>
            <span className="text-[11px] font-bold text-brand-700 bg-white px-3 py-1 rounded-full border border-brand-200 shadow-2xs self-start sm:self-auto">
              Hiển thị trên app học sinh, danh sách bài tập & bảng điểm danh
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={assignmentTitle}
              onChange={e => {
                const val = e.target.value;
                setAssignmentTitle(val);
                if (plannerMode === 'topic' && (!topic || topic === assignmentTitle)) {
                  setTopic(val);
                }
              }}
              placeholder="Nhập tiêu đề bài giao (Ví dụ: Phiếu bài tập số 1 - Unit 1, Bài kiểm tra 15 phút, Ôn tập từ vựng buổi 2...)"
              className="w-full pl-4 pr-10 py-3.5 text-base sm:text-lg font-black rounded-2xl border-2 border-brand-300 bg-white text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:border-brand-600 focus:ring-4 focus:ring-brand-100 outline-none transition-all shadow-xs"
            />
            {assignmentTitle && (
              <button
                type="button"
                onClick={() => setAssignmentTitle('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
                title="Xóa tiêu đề"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-500">Mẫu tiêu đề nhanh:</span>
            {[
              'Phiếu bài tập số 1',
              'Phiếu bài tập số 2',
              'Bài tập về nhà',
              'Đề kiểm tra 15 phút',
              'Đề thi giữa kì',
              'Ôn tập Từ vựng & Ngữ pháp'
            ].map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  const newT = assignmentTitle ? `${suggestion} - ${assignmentTitle}` : suggestion;
                  setAssignmentTitle(newT);
                  if (plannerMode === 'topic' && !topic) setTopic(newT);
                }}
                className="text-[11px] font-bold bg-white text-brand-700 hover:bg-brand-500 hover:text-white px-2.5 py-1 rounded-xl border border-brand-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Input Selector Tab */}
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 flex-wrap">
            {[
              { id: 'topic', label: 'Chủ đề', icon: '💡' },
              { id: 'text', label: 'Văn bản', icon: '📝' },
              { id: 'image', label: 'Hình ảnh SGK', icon: '📸' },
              { id: 'exam', label: 'Đề thi gốc (Word / PDF / Ảnh)', icon: '📜' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setPlannerMode(m.id as any);
                  setError(null);
                }}
                className={`flex-1 min-w-[120px] py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  plannerMode === m.id
                    ? 'bg-brand-500 text-white shadow-md'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                <span>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>

          <div>
            {plannerMode === 'topic' && (
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Nhập chủ đề bài học (VD: Unit 1: My New School, Animals, Daily Routines...)"
                className="w-full p-4 text-base sm:text-lg rounded-2xl border-2 border-brand-100 font-bold bg-brand-50/40 outline-none focus:border-brand-500 text-brand-900 transition-all"
              />
            )}

            {plannerMode === 'text' && (
              <textarea
                value={lessonText}
                onChange={e => setLessonText(e.target.value)}
                placeholder="Dán nội dung từ vựng, ngữ pháp hoặc bài đọc vào đây..."
                rows={5}
                className="w-full p-4 text-sm sm:text-base rounded-2xl border-2 border-brand-100 bg-brand-50/40 font-medium text-slate-700 outline-none focus:border-brand-500 transition-all resize-none"
              />
            )}

            {plannerMode === 'image' && (
              <UploadZone
                onFilesSelect={setSelectedFiles}
                isLoading={loading}
                fileCount={selectedFiles.length}
                selectedFiles={selectedFiles}
              />
            )}

            {plannerMode === 'exam' && (
              <div className="space-y-4 p-5 bg-indigo-50/60 rounded-3xl border-2 border-indigo-200">
                {/* Switch between file upload and paste text */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex bg-white p-1 rounded-xl border border-indigo-200 gap-1 text-xs font-bold shadow-xs">
                    <button
                      type="button"
                      onClick={() => setExamRawInputMode('upload')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        examRawInputMode === 'upload'
                          ? 'bg-brand-500 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📁 Tải tệp Word (.docx) / PDF / Ảnh
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamRawInputMode('text')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        examRawInputMode === 'text'
                          ? 'bg-brand-500 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📝 Dán văn bản đề thi
                    </button>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-black border border-amber-300">
                    <span>🛡️</span> Giữ nguyên 100% câu hỏi, định dạng & đáp án gốc
                  </div>
                </div>

                {examRawInputMode === 'upload' ? (
                  <UploadZone
                    onFilesSelect={setSelectedFiles}
                    isLoading={loading}
                    fileCount={selectedFiles.length}
                    selectedFiles={selectedFiles}
                    accept=".pdf,.docx,.doc,.txt,image/*"
                    title="Kéo thả hoặc nhấn để chọn file đề thi (Word .docx, PDF, Ảnh scan)"
                    subtitle="Hệ thống giữ nguyên toàn bộ nội dung câu hỏi, bảng đáp án sẵn & thang điểm của đề thi"
                  />
                ) : (
                  <textarea
                    value={examPastedText}
                    onChange={e => setExamPastedText(e.target.value)}
                    placeholder="Dán toàn bộ nội dung đề thi vào đây (bao gồm các phần, bài đọc, câu hỏi và bảng đáp án nếu có)..."
                    rows={6}
                    className="w-full p-4 text-sm sm:text-base rounded-2xl border-2 border-indigo-200 bg-white font-medium text-slate-700 outline-none focus:border-brand-500 transition-all resize-none shadow-inner"
                  />
                )}

                {/* Exam Settings: Score scale & Duration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="bg-white p-3.5 rounded-2xl border border-indigo-200 space-y-1.5">
                    <label className="block text-xs font-black text-indigo-950 uppercase tracking-wider">
                      🎯 Thang điểm chấm bài
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExamTargetScale(10)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                          examTargetScale === 10
                            ? 'bg-brand-500 text-white border-brand-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Thang điểm 10 (Chuẩn)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExamTargetScale('original')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                          examTargetScale === 'original'
                            ? 'bg-brand-500 text-white border-brand-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Thang điểm gốc của đề
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-indigo-200 space-y-1.5">
                    <label className="block text-xs font-black text-indigo-950 uppercase tracking-wider">
                      ⏱️ Thời gian làm bài
                    </label>
                    <select
                      value={examDuration}
                      onChange={e => setExamDuration(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-slate-50 outline-none focus:border-brand-500"
                    >
                      <option value={15}>15 phút (Kiểm tra 15p)</option>
                      <option value={30}>30 phút</option>
                      <option value={45}>45 phút (Kiểm tra 1 tiết)</option>
                      <option value={60}>60 phút (Giữa kỳ / Cuối kỳ)</option>
                      <option value={90}>90 phút (Đề thi HSG / Tuyển sinh)</option>
                      <option value={120}>Không giới hạn thời gian</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleGenerateAI}
            disabled={loading}
            className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white rounded-2xl font-black text-lg shadow-xl transition-all transform active:scale-98 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin text-xl">⏳</span>
                <span>
                  {plannerMode === 'exam'
                    ? 'Đang phân tích & trích xuất đề thi bảo toàn gốc 100%...'
                    : loadingStage === 'core'
                    ? 'Đang tạo lý thuyết & từ vựng chuẩn Global Success...'
                    : 'Đang tạo bộ bài tập MegaTest 50 câu...'}
                </span>
              </>
            ) : (
              <>
                <span>✨</span>{' '}
                {plannerMode === 'exam'
                  ? 'TRÍCH XUẤT ĐỀ THI BẢO TOÀN GỐC (WORD / PDF / ẢNH)'
                  : 'TẠO NỘI DUNG BÀI HỌC BẰNG AI'}
              </>
            )}
          </button>

          {/* Fallback notification */}
          {fallbackInfo && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>
                Model <strong>{fallbackInfo.fromModel}</strong> tạm thời quá tải. Hệ thống đã tự động chuyển sang <strong>{fallbackInfo.toModel}</strong> để tiếp tục xử lý mượt mà.
              </span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm space-y-2">
              <p className="font-bold flex items-center gap-2">
                <span>❗</span> {error}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onOpenSettings}
                  className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded-lg text-xs font-bold"
                >
                  🔑 Kiểm tra API Key
                </button>
                <button
                  onClick={handleGenerateAI}
                  className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-800 rounded-lg text-xs font-bold border border-rose-200"
                >
                  🔄 Thử lại
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Khung Xem Trước Đề Thi Gốc Bảo Toàn (Preserved Exam Preview) */}
      {preservedExam && (
        <div className="space-y-6 animate-fade-in font-sans">
          {/* Top Banner Thông Báo Đề Thi Gốc */}
          <div className="bg-gradient-to-r from-indigo-700 via-brand-800 to-indigo-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl sm:text-4xl bg-white/20 p-2.5 rounded-2xl">📜</span>
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-white/20 rounded-full text-[11px] font-black uppercase tracking-wider mb-1 text-amber-300">
                  <span>🛡️</span> ĐỀ THI BẢO TOÀN NỘI DUNG GỐC (100% ZERO-DISTORTION)
                </div>
                <h3 className="text-lg sm:text-2xl font-black">{preservedExam.title}</h3>
                <p className="text-xs sm:text-sm text-indigo-100 font-medium mt-0.5">
                  Bảo toàn 100% câu hỏi, thứ tự, bài đọc và thang điểm. Học sinh làm xong toàn đề sẽ được hệ thống chấm điểm tự động.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-white/15 backdrop-blur-sm p-2 rounded-2xl border border-white/20">
              <button
                type="button"
                onClick={() => setShowExamAnswerKey(!showExamAnswerKey)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                  showExamAnswerKey
                    ? 'bg-amber-400 text-brand-950 shadow'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {showExamAnswerKey ? '👁️ Đang hiện đáp án' : '🙈 Đang ẩn đáp án'}
              </button>

              <span className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black shadow">
                📝 {preservedExam.totalQuestions} câu hỏi
              </span>

              <span className="px-3 py-1.5 bg-amber-400 text-brand-950 rounded-xl text-xs font-black shadow">
                🎯 {preservedExam.targetScale === 10 ? 'Thang điểm 10.0' : `Thang điểm ${preservedExam.originalMaxScore}`}
              </span>
            </div>
          </div>

          {/* Chi tiết từng phần và câu hỏi của Đề thi */}
          <div className="space-y-6">
            {preservedExam.sections.map((sec, sIdx) => (
              <div key={sIdx} className="bg-white rounded-3xl p-6 shadow-xl border border-indigo-100 space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-brand-500 text-white rounded-xl text-xs font-black">
                      Phần {sIdx + 1}
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-brand-950">{sec.title}</h4>
                  </div>
                  {sec.instruction && (
                    <p className="text-xs font-semibold text-slate-500 italic">
                      {sec.instruction}
                    </p>
                  )}
                </div>

                {sec.passage && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs sm:text-sm text-slate-700 whitespace-pre-line font-medium leading-relaxed">
                    <span className="font-bold text-amber-800 block mb-1">📖 Bài đọc hiểu:</span>
                    {sec.passage}
                  </div>
                )}

                <div className="space-y-3">
                  {sec.questions.map((q, qIdx) => (
                    <div
                      key={q.id || qIdx}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-brand-100 text-brand-900 rounded-lg text-xs font-black">
                            {q.number || `Câu ${qIdx + 1}`}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            ({q.points} điểm)
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {q.type}
                        </span>
                      </div>

                      <p className="font-bold text-slate-800">{q.questionText}</p>

                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const isCorrect = showExamAnswerKey && (
                              q.correctAnswer.trim().toUpperCase().startsWith(['A', 'B', 'C', 'D'][optIdx]) ||
                              q.correctAnswer.trim() === opt.trim()
                            );
                            return (
                              <div
                                key={optIdx}
                                className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                  isCorrect
                                    ? 'bg-emerald-100 border-emerald-400 text-emerald-950 font-black'
                                    : 'bg-white border-slate-200 text-slate-700'
                                }`}
                              >
                                {opt}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {showExamAnswerKey && (
                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                          <div>
                            <strong>Đáp án chuẩn:</strong> <span className="font-black text-emerald-800">{q.correctAnswer}</span>
                            {q.alternativeAnswers && q.alternativeAnswers.length > 0 && (
                              <span className="text-slate-500 italic ml-2">
                                (Hoặc: {q.alternativeAnswers.join(', ')})
                              </span>
                            )}
                          </div>
                          {q.explanation && (
                            <p className="text-slate-600 italic">
                              💡 {q.explanation}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Form Thiết Lập Giao Bài Cho Đề Thi Gốc */}
          <div className="bg-gradient-to-br from-brand-50 via-white to-sky-50 p-6 sm:p-8 rounded-3xl border-4 border-brand-300 shadow-2xl space-y-6">
            <div className="border-b border-brand-100 pb-4">
              <h4 className="font-black text-brand-900 text-xl sm:text-2xl flex items-center gap-2">
                <span>🚀</span> THIẾT LẬP GIAO ĐỀ THI CHO HỌC SINH
              </h4>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Học sinh sẽ nhận được đề thi chuẩn 100% nội dung gốc, làm bài trực tuyến và tự động nhận điểm số sau khi nộp bài.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  📝 Tiêu Đề Đề Thi
                </label>
                <input
                  type="text"
                  value={assignmentTitle}
                  onChange={e => setAssignmentTitle(e.target.value)}
                  placeholder="Tên đề thi hiển thị cho học sinh..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  📅 Ngày Giao Bài
                </label>
                <input
                  type="date"
                  value={assignedDate}
                  onChange={e => setAssignedDate(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  ⏰ Hạn Chót Nộp Bài
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white shadow-xs"
                />
              </div>
            </div>

            {/* Lớp được giao */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  🏫 Lớp Nhận Đề Thi ({isAllMode ? 'Tất cả các lớp' : `${selectedClassIds.length} lớp đã chọn`})
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setClassAssignmentMode('all');
                      selectAllClasses();
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isAllMode
                        ? 'bg-brand-500 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    🌟 Tất cả các lớp
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassAssignmentMode('custom')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      !isAllMode
                        ? 'bg-brand-500 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    🎯 Tùy chọn từng lớp
                  </button>
                </div>
              </div>

              {!isAllMode && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  {classes.map(c => {
                    const isSelected = selectedClassIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleClass(c.id)}
                        className={`p-3 rounded-xl border-2 font-bold text-xs transition-all text-center flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-brand-500 border-brand-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{isSelected ? '✅' : '⚪'}</span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lời dặn dò */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                👩‍🏫 Lời Dặn Của Thầy Cô
              </label>
              <textarea
                value={teacherNote}
                onChange={e => setTeacherNote(e.target.value)}
                rows={2}
                placeholder="Lời dặn dò của cô dành cho học sinh..."
                className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-medium focus:border-brand-500 outline-none bg-white shadow-xs resize-none"
              />
            </div>

            {/* Nút Giao Đề Thi */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handlePublishAssignment}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg sm:text-xl shadow-xl transition-all transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                {publishedSuccess ? (
                  <>
                    <span>✅</span> ĐÃ GIAO ĐỀ THI THÀNH CÔNG!
                  </>
                ) : (
                  <>
                    <span>🚀</span> GIAO ĐỀ THI NGAY CHO HỌC SINH
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview bài học & Thiết lập giao bài */}
      {lessonPlan && !preservedExam && (() => {
        const totalQuestions = (lessonPlan.practice?.megaTest?.multipleChoice?.length || 0) +
          (lessonPlan.practice?.megaTest?.scramble?.length || 0) +
          (lessonPlan.practice?.megaTest?.fillBlank?.length || 0) +
          (lessonPlan.practice?.megaTest?.vocabTranslation?.length || 0) +
          (lessonPlan.practice?.megaTest?.trueFalse?.length || 0) +
          (lessonPlan.practice?.listening?.length || 0);

        return (
          <div className="space-y-8 animate-fade-in font-sans">
            {/* Thanh thông báo đồng bộ giao diện */}
            <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl bg-white/20 p-2 rounded-2xl">👁️</span>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-white/20 rounded-full text-[11px] font-black uppercase tracking-wider mb-1">
                    <span>✨</span> Giao diện xem trước của học sinh
                  </div>
                  <h3 className="text-lg sm:text-2xl font-black">Nội Dung Bài Học Đồng Bộ 100% Cho Học Sinh</h3>
                  <p className="text-xs sm:text-sm text-emerald-100 font-medium mt-0.5">
                    Cô có thể kiểm tra từng từ vựng, ngữ pháp, bài đọc và làm thử các bài tập trước khi giao.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black shrink-0 self-stretch sm:self-auto justify-center border border-white/20">
                <span>🚀</span> Tổng cộng {totalQuestions} câu bài tập sẵn sàng
              </div>
            </div>

            {/* Banner Tiêu Đề Bài Học (Giống hệt học sinh) */}
            <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border-4 border-brand-100 text-center space-y-4 relative overflow-hidden">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-50 rounded-full text-xs font-black text-brand-700 uppercase tracking-widest">
                <span>📖</span> BÀI HỌC THẦY CÔ GIAO
              </div>

              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-brand-900 uppercase font-display leading-tight">
                {assignmentTitle || lessonPlan.topic}
              </h1>

              {teacherNote && (
                <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium flex items-center gap-3 text-left">
                  <span className="text-2xl shrink-0">👩‍🏫</span>
                  <div>
                    <p className="font-bold text-xs uppercase tracking-wider text-amber-800">Lời dặn của Thầy Cô:</p>
                    <p className="mt-0.5 italic">"{teacherNote}"</p>
                  </div>
                </div>
              )}
            </div>

            {/* PHẦN 1: TỪ VỰNG CHUẨN GLOBAL SUCCESS (Giống hệt học sinh) */}
            <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-xl border border-brand-100">
              <VocabularySection items={lessonPlan.vocabulary || []} />
            </div>

            {/* PHẦN 2: NGỮ PHÁP QUAN TRỌNG (Giống hệt học sinh) */}
            {lessonPlan.grammar && (
              <div className="bg-highlight-400 p-4 sm:p-6 rounded-3xl shadow-xl border-4 border-white">
                <h2 className="text-base sm:text-xl font-black text-brand-900 uppercase tracking-tight mb-3 flex items-center gap-2">
                  <span className="text-2xl">✨</span> Ngữ Pháp Quan Trọng
                </h2>
                <div className="bg-white/95 p-4 sm:p-6 rounded-2xl shadow-md space-y-3">
                  <h3 className="text-lg sm:text-xl font-black text-brand-700">{lessonPlan.grammar.topic}</h3>
                  <p className="text-sm sm:text-base text-slate-700 leading-relaxed border-l-4 border-brand-500 pl-3">
                    {lessonPlan.grammar.explanation}
                  </p>
                  {lessonPlan.grammar.examples && lessonPlan.grammar.examples.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold text-brand-600 uppercase">Ví dụ minh họa:</h4>
                      <div className="grid gap-2">
                        {lessonPlan.grammar.examples.map((ex, i) => (
                          <div key={i} className="bg-brand-50 p-3 rounded-xl border border-brand-100 flex items-center gap-3">
                            <span className="text-lg">💎</span>
                            <p className="text-sm text-slate-700 italic font-medium">"{ex}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PHẦN 3: SIÊU THỬ THÁCH BÀI TẬP MEGATEST (55 CÂU HỎI) */}
            {lessonPlan.practice?.megaTest && (
              <div className="space-y-4">
                <div className="bg-brand-900/10 p-3 rounded-2xl flex items-center justify-between text-xs font-bold text-brand-900">
                  <span>🚀 PHẦN BÀI TẬP MEGATEST HỌC SINH SẼ LÀM:</span>
                  <span className="bg-brand-500 text-white px-3 py-1 rounded-xl">Cô có thể bấm làm thử từng câu</span>
                </div>
                <MegaChallenge
                  megaData={lessonPlan.practice.megaTest}
                  listeningData={lessonPlan.practice.listening}
                  isTeacher={true}
                  lessonContext={{
                    topic: lessonPlan.topic,
                    grammarTopic: lessonPlan.grammar?.topic,
                    grammarExplanation: lessonPlan.grammar?.explanation,
                    readingPassage: lessonPlan.reading?.passage
                  }}
                  onUpdateMegaData={(newMega) => {
                    setLessonPlan(prev => prev ? {
                      ...prev,
                      practice: {
                        ...prev.practice,
                        megaTest: newMega
                      }
                    } : prev);
                  }}
                  onUpdateListeningData={(newListening) => {
                    setLessonPlan(prev => prev ? {
                      ...prev,
                      practice: {
                        ...prev.practice,
                        listening: newListening
                      }
                    } : prev);
                  }}
                />
              </div>
            )}

            {/* Form Thiết Lập Giao Bài (Hỗ trợ chọn 1 lớp, 2 lớp, 3 lớp... hoặc Tất cả các lớp) */}
            <div className="bg-gradient-to-br from-brand-50 via-white to-sky-50 p-6 sm:p-8 rounded-3xl border-4 border-brand-300 shadow-2xl space-y-6">
              <div className="border-b border-brand-100 pb-4">
                <h4 className="font-black text-brand-900 text-xl sm:text-2xl flex items-center gap-2">
                  <span>🚀</span> THIẾT LẬP GIAO BÀI TẬP CHO HỌC SINH
                </h4>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                  Kiểm tra lại tiêu đề, thời hạn nộp và chọn chính xác các lớp áp dụng bài tập này.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    📝 Tiêu Đề Bài Tập
                  </label>
                  <input
                    type="text"
                    value={assignmentTitle}
                    onChange={e => setAssignmentTitle(e.target.value)}
                    placeholder="Tên bài tập hiển thị cho học sinh..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    📅 Ngày Giao Bài
                  </label>
                  <input
                    type="date"
                    value={assignedDate}
                    onChange={e => setAssignedDate(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    ⏰ Hạn Nộp Bài (Deadline)
                  </label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white shadow-xs"
                  />
                </div>

                {/* BỘ CHỌN LỚP GIAO BÀI (MỤC TÙY CHỌN LỚP HOẶC TẤT CẢ) */}
                <div className="col-span-full bg-slate-50/80 p-5 rounded-2xl border-2 border-brand-200 space-y-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-100 pb-3">
                    <div>
                      <label className="text-sm font-black uppercase tracking-wider text-brand-900 flex items-center gap-2">
                        <span>🏫</span> CHỌN ĐỐI TƯỢNG HỌC SINH GIAO BÀI:
                      </label>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Chọn tùy chỉnh theo từng lớp (1 lớp, 2 lớp, 3 lớp...) hoặc giao nhanh cho tất cả các lớp
                      </p>
                    </div>

                    {/* Badge hiển thị tóm tắt */}
                    <div className="text-xs font-bold px-3 py-1.5 rounded-xl bg-brand-100 text-brand-900 border border-brand-300 self-start sm:self-auto">
                      {isAllMode ? (
                        <span>🌐 Áp dụng: Tất cả các lớp ({classes.length} lớp)</span>
                      ) : selectedClasses.length > 0 ? (
                        <span>🎯 Đã chọn: {selectedClasses.map(c => c.name).join(', ')} ({selectedClasses.length} lớp)</span>
                      ) : (
                        <span className="text-rose-600 font-bold">⚠️ Chưa chọn lớp nào</span>
                      )}
                    </div>
                  </div>

                  {/* 2 TAB/MODE LỰA CHỌN CHÍNH: TÙY CHỌN LỚP (MẶC ĐỊNH) VS TẤT CẢ CÁC LỚP */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Mode 1: Tùy chọn lớp cụ thể (Mặc định) */}
                    <button
                      type="button"
                      onClick={() => setClassAssignmentMode('custom')}
                      className={`p-3.5 rounded-xl text-left border-2 transition-all flex items-start gap-3 ${
                        !isAllMode
                          ? 'bg-white border-brand-500 shadow-md ring-2 ring-brand-200'
                          : 'bg-white/60 border-slate-200 hover:border-brand-200 text-slate-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center mt-0.5 border-2 text-xs shrink-0 ${
                        !isAllMode ? 'border-brand-600 bg-brand-600 text-white font-bold' : 'border-slate-300 text-transparent'
                      }`}>
                        ✓
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                          <span>🎯</span> TÙY CHỌN LỚP GIAO BÀI
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                          Cô tích chọn 1 lớp, 2 lớp hoặc nhiều lớp cụ thể theo nhu cầu giảng dạy
                        </p>
                      </div>
                    </button>

                    {/* Mode 2: Áp dụng cho tất cả */}
                    <button
                      type="button"
                      onClick={() => setClassAssignmentMode('all')}
                      className={`p-3.5 rounded-xl text-left border-2 transition-all flex items-start gap-3 ${
                        isAllMode
                          ? 'bg-white border-brand-500 shadow-md ring-2 ring-brand-200'
                          : 'bg-white/60 border-slate-200 hover:border-brand-200 text-slate-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center mt-0.5 border-2 text-xs shrink-0 ${
                        isAllMode ? 'border-brand-600 bg-brand-600 text-white font-bold' : 'border-slate-300 text-transparent'
                      }`}>
                        ✓
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                          <span>🌐</span> GIAO CHO TẤT CẢ CÁC LỚP
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                          Tự động áp dụng cho toàn bộ {classes.length} lớp học hiện có
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* NỘI DUNG KHI CHỌN MODE TÙY CHỌN LỚP */}
                  {!isAllMode ? (
                    <div className="bg-white p-4 rounded-xl border border-brand-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Danh sách lớp học (Bấm để chọn / bỏ chọn):
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={selectAllClasses}
                            className="text-[11px] font-bold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            ✓ Chọn tất cả
                          </button>
                          <button
                            type="button"
                            onClick={clearAllSelectedClasses}
                            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            ✕ Bỏ chọn hết
                          </button>
                        </div>
                      </div>

                      {classes.length === 0 ? (
                        <p className="text-xs text-amber-600 font-medium italic">
                          Chưa có lớp học nào trong hệ thống. Cô hãy vào mục "Quản lý Lớp" để thêm lớp nhé!
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2.5 pt-1">
                          {classes.map(c => {
                            const isSelected = selectedClassIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleClass(c.id)}
                                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex items-center gap-2.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-200 scale-102'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'
                                }`}
                              >
                                <span className="text-base">{isSelected ? '☑️' : '⬜'}</span>
                                <span>{c.name}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {c.studentCount || 0} HS
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {selectedClassIds.length === 0 && (
                        <p className="text-xs text-rose-600 font-bold flex items-center gap-1 mt-1">
                          <span>⚠️</span> Cô hãy bấm chọn ít nhất 1 lớp học để giao bài nhé!
                        </p>
                      )}
                    </div>
                  ) : (
                    /* NỘI DUNG KHI CHỌN GIAO CHO TẤT CẢ CÁC LỚP */
                    <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-200 flex items-center gap-3">
                      <span className="text-2xl">📢</span>
                      <div className="text-xs text-emerald-900 leading-relaxed font-medium">
                        Bài tập này sẽ được giao đồng thời tới <strong>toàn bộ {classes.length} lớp</strong> ({classes.map(c => c.name).join(', ')}).
                        Tất cả học sinh thuộc các lớp này đều sẽ nhìn thấy bài và có thể làm bài tập ngay!
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-full">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                    💬 Lời Nhắn Dặn Của Thầy Cô Cho Học Sinh
                  </label>
                  <input
                    type="text"
                    value={teacherNote}
                    onChange={e => setTeacherNote(e.target.value)}
                    placeholder="Lời dặn học sinh làm bài..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none bg-white shadow-xs"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  onClick={handlePublishAssignment}
                  disabled={publishedSuccess || (!isAllMode && selectedClassIds.length === 0)}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xl shadow-xl transition-all transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {publishedSuccess ? (
                    <>
                      <span>✅</span> ĐÃ GIAO BÀI CHO HỌC SINH THÀNH CÔNG!
                    </>
                  ) : (
                    <>
                      <span>🚀</span> GIAO BÀI NGAY CHO HỌC SINH
                    </>
                  )}
                </button>

                {/* CÁC NÚT TẢI FILE WORD & XUẤT FILE PDF */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      exportAssignmentToWord({
                        id: `assign_${Date.now()}`,
                        title: assignmentTitle.trim() || 'Bài tập tiếng Anh Legend X5',
                        topic: lessonPlan.topic || assignmentTitle.trim(),
                        assignedDate,
                        dueDate,
                        targetClassId: isAllMode ? 'ALL' : (selectedClasses[0]?.id || 'ALL'),
                        targetClassName: isAllMode ? 'Tất cả các lớp' : selectedClasses.map(c => c.name).join(', '),
                        teacherNote,
                        lessonPlan,
                        createdAt: new Date().toISOString()
                      }, true);
                    }}
                    className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    title="Tải xuống đề bài và đáp án chi tiết định dạng Word (.doc)"
                  >
                    <span>📄</span> TẢI FILE WORD (.DOC)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      exportAssignmentToPdf({
                        id: `assign_${Date.now()}`,
                        title: assignmentTitle.trim() || 'Bài tập tiếng Anh Legend X5',
                        topic: lessonPlan.topic || assignmentTitle.trim(),
                        assignedDate,
                        dueDate,
                        targetClassId: isAllMode ? 'ALL' : (selectedClasses[0]?.id || 'ALL'),
                        targetClassName: isAllMode ? 'Tất cả các lớp' : selectedClasses.map(c => c.name).join(', '),
                        teacherNote,
                        lessonPlan,
                        createdAt: new Date().toISOString()
                      }, true);
                    }}
                    className="py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    title="Mở trình in ấn A4 hoặc bấm Lưu dưới dạng PDF"
                  >
                    <span>🖨️</span> XUẤT FILE PDF / IN ĐỀ A4
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DANH SÁCH BÀI TẬP ĐÃ GIAO THEO FOLDER TỪNG LỚP (TỪ CŨ ĐẾN MỚI) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border-2 border-brand-100 space-y-6">
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📂</span>
              <h3 className="text-lg sm:text-xl font-black text-brand-900 uppercase tracking-tight">
                DANH SÁCH BÀI TẬP ĐÃ GIAO THEO FOLDER TỪNG LỚP ({recentAssignments.length})
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              Phân loại bài tập gọn gàng vào từng thư mục lớp học, sắp xếp theo thứ tự tiến trình học (từ cũ đến mới).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sort order toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setFolderSortOrder('asc')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  folderSortOrder === 'asc'
                    ? 'bg-white text-emerald-700 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Sắp xếp bài tập từ ngày cũ nhất đến mới nhất theo tiến trình học"
              >
                🔼 Từ cũ đến mới (Chuẩn)
              </button>
              <button
                type="button"
                onClick={() => setFolderSortOrder('desc')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  folderSortOrder === 'desc'
                    ? 'bg-white text-brand-700 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Sắp xếp bài tập từ mới nhất đến cũ nhất"
              >
                🔽 Mới nhất trước
              </button>
            </div>

            {onNavigateToRepository && (
              <button
                onClick={onNavigateToRepository}
                className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>📚</span> Mở Kho Lưu Đầy Đủ →
              </button>
            )}
          </div>
        </div>

        {/* Toast nếu bấm Giao bài tiếp */}
        {folderToast && (
          <div className="p-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg animate-fadeIn">
            <span className="text-lg">🚀</span>
            <span>{folderToast}</span>
          </div>
        )}

        {/* Thanh chọn Thư mục Lớp (Folder Pills / Tabs) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-black text-slate-600 uppercase mr-1 flex items-center gap-1">
            <span>📁</span> THƯ MỤC:
          </span>

          <button
            type="button"
            onClick={() => setActiveFolderClassId('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeFolderClassId === 'ALL'
                ? 'bg-brand-500 text-white border-brand-600 shadow-md scale-102 ring-2 ring-brand-200'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-brand-300'
            }`}
          >
            <span>{activeFolderClassId === 'ALL' ? '📂' : '📁'}</span>
            <span>Tất cả thư mục lớp</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
              activeFolderClassId === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {recentAssignments.length}
            </span>
          </button>

          {classFolders.map(folder => {
            const isActive = activeFolderClassId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolderClassId(folder.id)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-102 ring-2 ring-emerald-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <span>{isActive ? '📂' : '📁'}</span>
                <span>{folder.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {folder.assignments.length} bài
                </span>
              </button>
            );
          })}
        </div>

        {/* Nội dung danh sách các Folder */}
        {recentAssignments.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <div className="text-4xl mb-2">📖</div>
            <p className="font-bold text-base">Chưa có bài tập nào được giao</p>
            <p className="text-xs text-slate-400 mt-1">Cô hãy soạn bài và nhấn "Giao bài ngay cho học sinh" ở trên nhé!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {classFolders
              .filter(folder => activeFolderClassId === 'ALL' || activeFolderClassId === folder.id)
              .map(folder => {
                if (folder.assignments.length === 0 && activeFolderClassId !== folder.id) return null;

                return (
                  <div
                    key={folder.id}
                    className="bg-slate-50/80 rounded-3xl border-2 border-slate-200 overflow-hidden shadow-sm hover:border-brand-300 transition-all space-y-4 p-5 sm:p-6"
                  >
                    {/* Header của Folder Lớp */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b-2 border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-2xl shadow-inner shrink-0">
                          📂
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-slate-900 text-base sm:text-lg">
                              Thư Mục: <span className="text-brand-700">{folder.name}</span>
                            </h4>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                              {folder.assignments.length} bài tập
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            {folder.studentCount > 0 ? `Sĩ số: ${folder.studentCount} học sinh • ` : ''}
                            Thứ tự sắp xếp: <strong className="text-emerald-700">{folderSortOrder === 'asc' ? 'Từ cũ đến mới (Bài 1 → Bài cuối)' : 'Từ mới nhất đến cũ'}</strong>
                          </p>
                        </div>
                      </div>

                      {/* NÚT GIAO BÀI TIẾP CHO LỚP NÀY */}
                      <button
                        type="button"
                        onClick={() => handleAssignNextToClass(folder.id, folder.name)}
                        className="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-sky-600 hover:from-sky-700 hover:to-sky-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto transform active:scale-98"
                        title="Tự động chọn lớp này và cuộn lên trên để soạn bài học tiếp theo"
                      >
                        <span>➕</span> Giao Bài Tiếp Cho Lớp Này
                      </button>
                    </div>

                    {/* Danh sách bài tập trong Folder (Sắp xếp từ cũ đến mới) */}
                    {folder.assignments.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-xs italic">
                        Thư mục lớp này chưa có bài tập nào. Cô hãy bấm "Giao bài tiếp cho lớp này" ở trên để soạn bài nhé!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                        {folder.assignments.map((assign, index) => {
                          const subsCount = submissionsCountMap[assign.id] || 0;
                          const seqNumber = folderSortOrder === 'asc' ? index + 1 : folder.assignments.length - index;

                          return (
                            <div
                              key={`${folder.id}_${assign.id}`}
                              className="bg-white p-5 rounded-2xl border-2 border-slate-200 hover:border-brand-400 transition-all space-y-3 shadow-sm hover:shadow-md flex flex-col justify-between"
                            >
                              <div className="space-y-2.5">
                                {/* Badge thứ tự bài học từ cũ đến mới */}
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="px-2.5 py-1 rounded-xl bg-brand-50 text-brand-800 text-xs font-black border border-brand-200 flex items-center gap-1">
                                    <span>🎯</span> Bài {seqNumber}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    📅 Giao: {assign.assignedDate}
                                  </span>
                                </div>

                                <div className="flex items-start justify-between gap-2">
                                  <h5 className="font-black text-slate-900 text-base leading-snug line-clamp-2 flex-1">
                                    {assign.title}
                                  </h5>
                                  <button
                                    type="button"
                                    onClick={() => handleRenameAssignment(assign.id, assign.title)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors shrink-0 cursor-pointer"
                                    title="Đổi tiêu đề bài giao"
                                  >
                                    ✏️
                                  </button>
                                </div>

                                {assign.topic && assign.topic !== assign.title && (
                                  <p className="text-xs text-slate-500 font-medium line-clamp-1">
                                    Chủ đề: {assign.topic}
                                  </p>
                                )}

                                {assign.teacherNote && (
                                  <p className="text-xs text-slate-500 italic line-clamp-1 border-l-2 border-brand-300 pl-2">
                                    "{assign.teacherNote}"
                                  </p>
                                )}

                                <div className="flex items-center justify-between text-xs pt-1">
                                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                    {subsCount} bài đã nộp
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    Hạn: {assign.dueDate ? assign.dueDate.split('T')[0] : 'Không hạn'}
                                  </span>
                                </div>
                              </div>

                              {/* CÁC NÚT THAO TÁC TRÊN BÀI TẬP */}
                              <div className="pt-3 border-t border-slate-100 space-y-2">
                                {/* NÚT GIAO LẠI CHO LỚP MỚI HOẶC LỚP ĐÃ GIAO */}
                                <button
                                  type="button"
                                  onClick={() => setReassignTarget(assign)}
                                  className="w-full py-2 px-3 bg-gradient-to-r from-sky-600 to-sky-600 hover:from-sky-700 hover:to-sky-700 text-white rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                  title="Giao lại bài này cho lớp đã giao hoặc giao sang lớp mới"
                                >
                                  <span>🔄</span> Giao Lại / Giao Lớp Mới
                                </button>

                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => exportAssignmentToWord(assign, true)}
                                    className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-xs border border-blue-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                    title="Tải Word (.doc)"
                                  >
                                    <span>📄</span> Tải Word
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => exportAssignmentToPdf(assign, true)}
                                    className="py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-bold text-xs border border-purple-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                    title="In PDF A4"
                                  >
                                    <span>🖨️</span> In / PDF
                                  </button>
                                </div>

                                <div className="flex items-center justify-between text-xs pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewTarget(assign)}
                                    className="text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>👁️</span> Xem bài
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAssignment(assign.id, assign.title)}
                                    className="text-slate-400 hover:text-rose-600 font-bold transition-colors cursor-pointer"
                                    title="Xóa bài tập"
                                  >
                                    🗑️ Xóa bài
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* MODAL GIAO LẠI / GIAO CHO LỚP KHÁC */}
      {reassignTarget && (
        <ReassignModal
          assignment={reassignTarget}
          classes={classes}
          onClose={() => setReassignTarget(null)}
          onSuccess={(newAssign, classNamesStr) => {
            setReassignTarget(null);
            setRecentAssignments(getAssignments());
            setFolderToast(`🚀 Đã giao lại bài "${newAssign.title}" cho ${classNamesStr} thành công!`);
            setTimeout(() => setFolderToast(null), 4000);
          }}
        />
      )}

      {/* MODAL XEM TRỌN VẸN BÀI HỌC */}
      {previewTarget && (
        <LessonPreviewModal
          assignment={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onReassign={() => {
            const t = previewTarget;
            setPreviewTarget(null);
            setReassignTarget(t);
          }}
        />
      )}
    </div>
  );
};
