import React, { useState, useEffect, useMemo } from 'react';
import { Assignment, PreservedExam, Submission, ExamQuestion } from '../../types';
import { gradeExamSubmission, ExamGradeResult } from '../../services/geminiService';
import { saveSubmission, getStudentSubmission, isAssignmentOverdue } from '../../services/assignmentService';
import { useUpdateBlocker } from '../../services/appUpdate';
import { ensureFreshSubmissions } from '../../services/firebaseService';
import { sendToGoogleSheets } from '../../services/googleSheetsService';
import { saveLessonRecord, generateRecordId } from '../../services/historyService';
import { LessonCertificate } from '../LessonCertificate';
import { SubmissionSuccessModal } from './SubmissionSuccessModal';

interface StudentExamViewProps {
  assignment: Assignment;
  studentName: string;
  studentClass: string;
  studentId?: string;
  onBack: () => void;
}

export const StudentExamView: React.FC<StudentExamViewProps> = ({
  assignment,
  studentName,
  studentClass,
  studentId,
  onBack
}) => {
  const exam: PreservedExam | undefined = assignment.examData;

  // Kiểm tra đề thi có quá hạn nộp không
  const isOverdue = isAssignmentOverdue(assignment.dueDate);

  const [localSubmission, setLocalSubmission] = useState<Submission | null>(null);

  // Khi mở bài: xác nhận với cloud xem em đã nộp bài này chưa (kể cả nộp từ máy khác)
  const [cloudCheckVersion, setCloudCheckVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    ensureFreshSubmissions(0, 15000).then(() => { if (alive) setCloudCheckVersion(v => v + 1); });
    return () => { alive = false; };
  }, [assignment.id]);

  const existingSubmission = useMemo(() => {
    if (localSubmission) return localSubmission;
    return getStudentSubmission(
      assignment.id,
      studentName,
      studentId,
      studentClass,
      assignment.topic || exam?.title,
      assignment.title || exam?.title
    );
  }, [assignment.id, studentName, studentId, studentClass, assignment.topic, assignment.title, exam?.title, localSubmission, cloudCheckVersion]);

  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>(() => {
    if (existingSubmission && existingSubmission.examAnswers) {
      return existingSubmission.examAnswers;
    }
    return {};
  });

  const [isSubmitted, setIsSubmitted] = useState(Boolean(existingSubmission));
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Đang làm bài kiểm tra → không tự tải lại trang để cập nhật phiên bản (tránh mất bài)
  useUpdateBlocker('student-exam', !isSubmitted || isSubmitting, 'bài kiểm tra đang làm');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Đồng bộ trạng thái đã nộp và câu trả lời nếu phát hiện submission
  useEffect(() => {
    if (existingSubmission) {
      setIsSubmitted(true);
      if (existingSubmission.examAnswers && Object.keys(existingSubmission.examAnswers).length > 0) {
        setStudentAnswers(prev => (Object.keys(prev).length === 0 ? existingSubmission.examAnswers! : prev));
      }
    }
  }, [existingSubmission]);

  // Time tracking
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!exam) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl shadow-xl border border-rose-200 space-y-4">
        <p className="text-4xl">⚠️</p>
        <h2 className="text-xl font-black text-rose-700">Không tìm thấy dữ liệu đề thi</h2>
        <p className="text-slate-600 text-sm">Vui lòng liên hệ với Thầy Cô để được hỗ trợ nhé!</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-brand-500 text-white font-bold rounded-xl shadow hover:bg-brand-600"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  // Calculate answered count
  const allQuestions: ExamQuestion[] = useMemo(() => {
    const list: ExamQuestion[] = [];
    exam.sections.forEach(sec => {
      sec.questions.forEach(q => list.push(q));
    });
    return list;
  }, [exam]);

  const answeredCount = useMemo(() => {
    return allQuestions.filter(q => {
      const val = studentAnswers[q.id];
      return typeof val === 'string' && val.trim().length > 0;
    }).length;
  }, [allQuestions, studentAnswers]);

  // Grade result if submitted
  const gradeResult: ExamGradeResult | null = useMemo(() => {
    if (!isSubmitted) return null;
    return gradeExamSubmission(exam, studentAnswers);
  }, [isSubmitted, exam, studentAnswers]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    if (isSubmitted) return;
    setStudentAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const getEvaluation = (scoreOn10: number) => {
    if (scoreOn10 >= 9) return { text: "XUẤT SẮC", emoji: "🏆", level: "EXCELLENT", praise: "Em làm bài thi tuyệt đỉnh, xứng đáng là ngôi sao sáng của Legend X5!" };
    if (scoreOn10 >= 8) return { text: "GIỎI", emoji: "🌟", level: "GREAT JOB", praise: "Em hoàn thành bài kiểm tra rất tốt, nắm chắc kiến thức!" };
    if (scoreOn10 >= 6.5) return { text: "KHÁ", emoji: "👍", level: "GOOD EFFORT", praise: "Em đã nỗ lực nhiều, cùng cố gắng hơn ở các bài tiếp theo nhé!" };
    if (scoreOn10 >= 5) return { text: "TRUNG BÌNH", emoji: "💪", level: "KEEP IT UP", praise: "Em đã vượt qua bài thi! Hãy rèn luyện thêm để bứt phá nhé!" };
    return { text: "CẦN CỐ GẮNG", emoji: "🌱", level: "NEEDS PRACTICE", praise: "Đừng nản lòng em nhé, xem lại lời giải bên dưới để tiến bộ hơn nào!" };
  };

  const handleSubmitExam = async () => {
    if (isSubmitting) return;
    if (!studentName.trim() || !studentClass.trim()) {
      alert('Vui lòng kiểm tra lại thông tin Tên và Lớp học nhé!');
      return;
    }

    if (isSubmitted || existingSubmission) {
      alert('Con đã hoàn thành bài thi này rồi! Link cô giao mỗi học sinh chỉ được làm bài 1 lần duy nhất. Con chỉ có thể làm lại khi được Thầy Cô cho phép.');
      return;
    }

    setIsSubmitting(true);
    let submission: Submission | null = null;
    try {
      const calculated = gradeExamSubmission(exam, studentAnswers);
      const rawScore10 = calculated.scoreOn10;
      const penaltyPoints = isOverdue ? 2 : 0;
      const finalScore10 = isOverdue ? Math.max(0, Math.round((rawScore10 - penaltyPoints) * 10) / 10) : rawScore10;
      const evalData = getEvaluation(finalScore10);

      submission = {
        id: existingSubmission?.id || `sub_exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        studentId: studentId || existingSubmission?.studentId,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        topic: assignment.topic || exam.title,
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        submittedAt: new Date().toISOString(),
        score: finalScore10, // Normalized 10 scale for unified dashboards
        rawScore: rawScore10,
        isLate: isOverdue,
        penaltyPoints: isOverdue ? penaltyPoints : 0,
        totalCorrect: calculated.totalCorrect,
        totalQuestions: calculated.totalQuestions,
        skillScores: { mc: calculated.totalCorrect, scramble: 0, fill: 0, vocab: 0, tf: 0, listen: 0 },
        evaluation: evalData,
        assignmentType: 'exam',
        examScore: exam.targetScale === 'original' ? calculated.totalPointsEarned : finalScore10,
        examMaxScore: calculated.maxPoints,
        scaledScore10: finalScore10,
        examAnswers: studentAnswers
      };

      const saveRes = await saveSubmission(submission);

      if (saveRes.duplicate) {
        alert(saveRes.error || 'Con đã nộp bài thi này rồi!');
        if (saveRes.existing) setLocalSubmission(saveRes.existing);
        setIsSubmitted(true);
        setShowConfirmSubmit(false);
        return;
      }

      setLocalSubmission(submission);

      if (saveRes.queued) {
        alert(
          '⚠️ Mạng đang yếu nên bài thi của con CHƯA gửi được tới Thầy Cô.\n\n' +
          'Bài đã được lưu trên máy và sẽ tự gửi lại khi có mạng. Con giữ trang này mở (hoặc mở lại trang khi có mạng) ' +
          'và KHÔNG xóa lịch sử trình duyệt nhé!'
        );
      }

      // Save to local history
      saveLessonRecord({
        id: generateRecordId(),
        date: new Date().toISOString(),
        topic: `${exam.title} (Đề thi)`,
        score: finalScore10,
        totalCorrect: calculated.totalCorrect,
        totalQuestions: calculated.totalQuestions,
        skillScores: { mc: calculated.totalCorrect, scramble: 0, fill: 0, vocab: 0, tf: 0, listen: 0 },
        studentName: studentName.trim()
      });

      // Send to Google Sheets
      sendToGoogleSheets({
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        topic: `${exam.title} [Đề thi gốc]`,
        score: finalScore10,
        totalCorrect: calculated.totalCorrect,
        totalQuestions: calculated.totalQuestions
      });

      setIsSubmitted(true);
      setShowConfirmSubmit(false);
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Error saving exam submission:', err);
      setShowConfirmSubmit(false);
      alert('Có lỗi khi nộp bài thi. Con kiểm tra mạng rồi bấm NỘP BÀI lại nhé!');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find question result from gradeResult
  const getQuestionResult = (qId: string) => {
    if (!gradeResult) return null;
    return gradeResult.questionResults.find(r => r.questionId === qId) || null;
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-20 max-w-5xl mx-auto">
      {/* Navigation Top Bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-md border border-brand-100">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all"
        >
          <span>⬅️</span> Quay lại danh sách bài
        </button>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span>⏱️ Thời gian:</span>
            <span className="font-mono text-brand-700 font-black text-sm">{formatTimer(timeElapsed)}</span>
          </div>

          <div className="text-xs sm:text-sm font-bold text-brand-700 bg-brand-50 px-3.5 py-1.5 rounded-xl border border-brand-200">
            <span>Học sinh: </span>
            <span className="text-brand-900 font-black">{studentName} ({studentClass})</span>
          </div>
        </div>
      </div>

      {/* Cảnh Báo Quá Hạn Nếu Chưa Nộp */}
      {isOverdue && !isSubmitted && !existingSubmission && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-rose-900 shadow-sm animate-fade-in">
          <span className="text-3xl shrink-0">⚠️</span>
          <div>
            <h4 className="font-black text-sm sm:text-base text-rose-900">
              ĐỀ THI ĐÃ QUÁ HẠN NỘP BÀI!
            </h4>
            <p className="text-xs sm:text-sm text-rose-800 mt-0.5 leading-relaxed">
              Hạn nộp đề thi là: <strong>{new Date(assignment.dueDate).toLocaleString('vi-VN')}</strong>.
              Con vẫn được làm và nộp bài bình thường, nhưng kết quả bài thi sẽ ghi nhận <strong>Quá hạn</strong> và <strong>bị trừ 2 điểm</strong> vào điểm tổng kết theo quy định của lớp.
            </p>
          </div>
        </div>
      )}

      {/* Locked Notice if already submitted */}
      {(existingSubmission || isSubmitted) && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔒</span>
            <div>
              <h4 className="font-black text-sm sm:text-base text-amber-900">
                BÀI KIỂM TRA ĐÃ HOÀN THÀNH - KHÓA LÀM LẠI
              </h4>
              <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                Link cô giao mỗi học sinh chỉ được làm bài <strong>1 lần duy nhất</strong>. Em đã nộp bài thành công với kết quả: <strong className="text-emerald-700">{existingSubmission?.score ?? (gradeResult ? (isOverdue ? Math.max(0, Math.round((gradeResult.scoreOn10 - 2) * 10) / 10) : gradeResult.scoreOn10) : 0)}/10 điểm</strong>. Em có thể xem lại lời giải chi tiết và đáp án bên dưới nhé!
              </p>
              {existingSubmission?.isLate && (
                <p className="text-xs font-bold text-rose-700 mt-1">
                  ⚠️ Bài nộp quá hạn: Điểm làm bài {existingSubmission.rawScore?.toFixed(1) ?? '—'}/10 — Bị trừ 2 điểm ➔ Điểm chốt: {existingSubmission.score.toFixed(1)}/10
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <span className="px-3 py-1 bg-amber-200 text-amber-950 rounded-full font-black text-xs">
              👀 Chế độ xem lại
            </span>
          </div>
        </div>
      )}

      {/* Exam Header Banner */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center space-y-4">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-widest text-amber-300 border border-white/20">
          <span>📜</span> ĐỀ THI BẢO TOÀN NỘI DUNG GỐC
        </div>

        <h1 className="text-2xl sm:text-4xl font-black font-display tracking-tight text-white uppercase">
          {exam.title}
        </h1>

        {exam.schoolOrSource && (
          <p className="text-sm sm:text-base text-brand-100 font-medium italic">
            {exam.schoolOrSource}
          </p>
        )}

        {/* Metadata Badges */}
        <div className="flex flex-wrap justify-center items-center gap-2.5 pt-2 text-xs sm:text-sm font-bold">
          <span className="px-3 py-1 bg-white/15 rounded-full backdrop-blur-sm">
            📝 {allQuestions.length} Câu hỏi
          </span>
          <span className="px-3 py-1 bg-white/15 rounded-full backdrop-blur-sm">
            ⏱️ {exam.durationMinutes || 45} Phút
          </span>
          <span className="px-3 py-1 bg-amber-400 text-brand-950 rounded-full font-black shadow">
            🎯 {exam.targetScale === 10 ? 'Thang điểm 10.0' : `Thang điểm ${exam.originalMaxScore}`}
          </span>
          {isSubmitted && (
            <span className="px-3.5 py-1 bg-emerald-400 text-emerald-950 rounded-full font-black shadow animate-pulse">
              ✅ ĐÃ HOÀN THÀNH
            </span>
          )}
        </div>

        {exam.instructions && (
          <div className="max-w-2xl mx-auto p-3.5 bg-black/20 rounded-2xl text-xs sm:text-sm text-brand-100 text-left border border-white/10">
            <p className="font-bold text-amber-300 mb-1">📌 Hướng dẫn làm bài:</p>
            <p>{exam.instructions}</p>
          </div>
        )}

        {/* Floating progress indicator */}
        <div className="max-w-md mx-auto pt-2">
          <div className="flex justify-between text-xs font-bold text-brand-200 mb-1">
            <span>Tiến độ hoàn thành</span>
            <span>{answeredCount} / {allQuestions.length} câu ({Math.round((answeredCount / (allQuestions.length || 1)) * 100)}%)</span>
          </div>
          <div className="w-full bg-white/20 h-3 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${(answeredCount / (allQuestions.length || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Result Card (When submitted) */}
      {isSubmitted && gradeResult && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-emerald-400 text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black uppercase">
            <span>🎉</span> KẾT QUẢ CHẤM ĐIỂM CHI TIẾT
          </div>

          <div className="flex flex-col items-center justify-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Điểm Số Của Em</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-6xl sm:text-7xl font-black text-emerald-600 leading-none">
                {gradeResult.scoreOn10.toFixed(1)}
              </span>
              <span className="text-2xl font-bold text-slate-400">/10</span>
            </div>

            {exam.targetScale === 'original' && (
              <p className="text-sm font-bold text-slate-600 mt-1">
                Điểm theo thang gốc của đề: <strong className="text-brand-700">{gradeResult.totalPointsEarned}/{gradeResult.maxPoints} điểm</strong>
              </p>
            )}

            <div className="flex flex-wrap justify-center items-center gap-2 mt-3">
              <span className="px-4 py-1.5 bg-brand-50 text-brand-800 rounded-full text-xs font-bold border border-brand-200">
                Đúng: <strong>{gradeResult.totalCorrect}/{gradeResult.totalQuestions} câu</strong> ({Math.round((gradeResult.totalCorrect / gradeResult.totalQuestions) * 100)}%)
              </span>
              <span className="px-4 py-1.5 bg-amber-50 text-amber-800 rounded-full text-xs font-bold border border-amber-200">
                ⏱️ Thời gian: <strong>{formatTimer(timeElapsed)}</strong>
              </span>
            </div>

            <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-200 max-w-lg">
              <p className="text-base font-black text-emerald-800">
                {getEvaluation(gradeResult.scoreOn10)?.emoji || '⭐'} {getEvaluation(gradeResult.scoreOn10)?.text || 'Đã nộp bài'}: {getEvaluation(gradeResult.scoreOn10)?.praise || 'Đã hoàn thành bài thi!'}
              </p>
            </div>

            <button
              onClick={() => setShowCertificate(true)}
              className="mt-4 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2"
            >
              <span>📜</span> Xem Chứng Nhận Vinh Danh
            </button>
          </div>
        </div>
      )}

      {/* EXAM SECTIONS & QUESTIONS */}
      <div className="space-y-8">
        {exam.sections.map((section, secIdx) => (
          <div
            key={secIdx}
            className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-brand-100 space-y-6"
          >
            {/* Section Header */}
            <div className="border-b border-slate-100 pb-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-brand-500 text-white rounded-xl text-xs font-black uppercase tracking-wider">
                  Phần {secIdx + 1}
                </span>
                <h2 className="text-lg sm:text-xl font-black text-brand-900">
                  {section.title}
                </h2>
              </div>
              {section.instruction && (
                <p className="text-sm font-semibold text-slate-600 italic">
                  👉 {section.instruction}
                </p>
              )}
            </div>

            {/* Reading Passage if attached to section */}
            {section.passage && (
              <div className="p-5 sm:p-6 bg-amber-50/70 rounded-2xl border-2 border-amber-200 text-slate-800 space-y-2">
                <p className="text-xs font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5">
                  <span>📖</span> ĐOẠN VĂN ĐỌC HIỂU (READING PASSAGE):
                </p>
                <div className="text-sm sm:text-base leading-relaxed whitespace-pre-line font-medium text-slate-700">
                  {section.passage}
                </div>
              </div>
            )}

            {/* Questions List */}
            <div className="space-y-6">
              {section.questions.map((q, qIdx) => {
                const qResult = getQuestionResult(q.id);
                const currentAnswer = studentAnswers[q.id] || '';

                return (
                  <div
                    key={q.id || qIdx}
                    id={`question_${q.id}`}
                    className={`p-5 sm:p-6 rounded-2xl border-2 transition-all space-y-4 ${
                      isSubmitted
                        ? qResult?.isCorrect
                          ? 'bg-emerald-50/60 border-emerald-300'
                          : 'bg-rose-50/60 border-rose-300'
                        : currentAnswer
                          ? 'bg-blue-50/40 border-blue-300 shadow-sm'
                          : 'bg-slate-50/70 border-slate-200 hover:border-brand-300'
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-brand-100 text-brand-900 rounded-lg text-xs font-black">
                          {q.number || `Câu ${qIdx + 1}`}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          ({q.points} điểm)
                        </span>
                      </div>

                      {/* Result Badge */}
                      {isSubmitted && qResult && (
                        <div className="flex items-center gap-1.5">
                          {qResult.isCorrect ? (
                            <span className="px-3 py-1 bg-emerald-500 text-white rounded-full text-xs font-black shadow-sm flex items-center gap-1">
                              <span>✓</span> Chính xác (+{qResult.pointsEarned}đ)
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-rose-500 text-white rounded-full text-xs font-black shadow-sm flex items-center gap-1">
                              <span>✗</span> Chưa đúng (0đ)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Question Text */}
                    <div className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
                      {q.questionText}
                    </div>

                    {/* Question Passage if attached directly to question */}
                    {q.passage && q.passage !== section.passage && (
                      <div className="p-4 bg-white rounded-xl border border-amber-200 text-xs sm:text-sm text-slate-700 italic">
                        {q.passage}
                      </div>
                    )}

                    {/* Interactive Answer Input */}
                    <div>
                      {/* TYPE 1: Multiple Choice */}
                      {q.type === 'multiple_choice' && q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {q.options.map((opt, oIdx) => {
                            const optLetter = ['A', 'B', 'C', 'D'][oIdx] || String(oIdx + 1);
                            const isSelected =
                              currentAnswer.trim().toUpperCase().startsWith(optLetter) ||
                              currentAnswer.trim() === opt.trim();

                            let btnStyle = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100';
                            if (isSelected) {
                              btnStyle = 'bg-brand-500 border-brand-600 text-white shadow-md font-black';
                            }
                            if (isSubmitted) {
                              // If this option is the correct one
                              const isThisCorrect =
                                q.correctAnswer.trim().toUpperCase().startsWith(optLetter) ||
                                q.correctAnswer.trim() === opt.trim();
                              if (isThisCorrect) {
                                btnStyle = 'bg-emerald-500 border-emerald-600 text-white font-black shadow-md';
                              } else if (isSelected && !qResult?.isCorrect) {
                                btnStyle = 'bg-rose-500 border-rose-600 text-white line-through font-bold';
                              } else {
                                btnStyle = 'bg-white border-slate-200 text-slate-400 opacity-70';
                              }
                            }

                            return (
                              <button
                                key={oIdx}
                                onClick={() => handleAnswerChange(q.id, opt)}
                                disabled={isSubmitted}
                                className={`p-3.5 rounded-xl border-2 text-left text-sm font-semibold transition-all flex items-start gap-2.5 ${btnStyle}`}
                              >
                                <span className="w-6 h-6 rounded-lg bg-black/10 flex items-center justify-center text-xs font-black shrink-0">
                                  {optLetter}
                                </span>
                                <span className="leading-snug">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* TYPE 2: True / False */}
                      {q.type === 'true_false' && (
                        <div className="flex gap-3">
                          {['True', 'False'].map(val => {
                            const isSelected = currentAnswer.toLowerCase() === val.toLowerCase();
                            let btnStyle = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100';
                            if (isSelected) {
                              btnStyle = 'bg-brand-500 border-brand-600 text-white font-black shadow';
                            }
                            if (isSubmitted) {
                              const isThisCorrect = q.correctAnswer.toLowerCase() === val.toLowerCase();
                              if (isThisCorrect) {
                                btnStyle = 'bg-emerald-500 border-emerald-600 text-white font-black';
                              } else if (isSelected && !qResult?.isCorrect) {
                                btnStyle = 'bg-rose-500 border-rose-600 text-white';
                              }
                            }

                            return (
                              <button
                                key={val}
                                onClick={() => handleAnswerChange(q.id, val)}
                                disabled={isSubmitted}
                                className={`px-6 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center gap-2 ${btnStyle}`}
                              >
                                <span>{val === 'True' ? '👍' : '👎'}</span>
                                <span>{val === 'True' ? 'Đúng (True)' : 'Sai (False)'}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* TYPE 3: Fill blank / Word form / Short Answer / Rewrite */}
                      {['fill_blank', 'word_form', 'sentence_rewrite', 'short_answer', 'matching'].includes(q.type) && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={currentAnswer}
                            onChange={e => handleAnswerChange(q.id, e.target.value)}
                            disabled={isSubmitted}
                            placeholder={
                              q.type === 'sentence_rewrite'
                                ? 'Nhập câu viết lại hoàn chỉnh...'
                                : q.type === 'word_form'
                                  ? 'Nhập dạng đúng của từ...'
                                  : 'Nhập câu trả lời của em vào đây...'
                            }
                            className={`w-full p-3.5 text-base rounded-xl border-2 outline-none font-bold transition-all ${
                              isSubmitted
                                ? qResult?.isCorrect
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                                  : 'bg-rose-50 border-rose-400 text-rose-900'
                                : 'bg-white border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 text-slate-800'
                            }`}
                          />
                        </div>
                      )}
                    </div>

                    {/* Explanations & Correct Answer Review (Shown when submitted) */}
                    {isSubmitted && (
                      <div className="pt-3 border-t border-slate-200/80 space-y-2 text-xs sm:text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-500">Đáp án chuẩn:</span>
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-900 font-black rounded-lg border border-emerald-300">
                            {q.correctAnswer}
                          </span>
                          {q.alternativeAnswers && q.alternativeAnswers.length > 0 && (
                            <span className="text-slate-500 text-xs italic">
                              (Chấp nhận: {q.alternativeAnswers.join(', ')})
                            </span>
                          )}
                        </div>

                        {q.explanation && (
                          <div className="p-3 bg-white/90 rounded-xl border border-slate-200 text-slate-700">
                            <span className="font-bold text-brand-700">💡 Giải thích chi tiết: </span>
                            <span>{q.explanation}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating or Bottom Submission Button */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-brand-100 text-center space-y-4">
        {!isSubmitted ? (
          <div className="max-w-md mx-auto space-y-3">
            <div className="text-xs sm:text-sm font-bold text-slate-600">
              Con đã làm: <strong className="text-brand-600 font-black">{answeredCount}/{allQuestions.length} câu</strong>
              {answeredCount < allQuestions.length && (
                <span className="text-amber-600 block mt-0.5 font-semibold">
                  (Còn {allQuestions.length - answeredCount} câu chưa làm xong)
                </span>
              )}
            </div>

            <button
              onClick={() => {
                if (answeredCount < allQuestions.length) {
                  setShowConfirmSubmit(true);
                } else {
                  handleSubmitExam();
                }
              }}
              disabled={isSubmitting}
              className={`w-full py-4 text-white rounded-2xl font-black text-lg sm:text-xl shadow-xl transition-all transform active:scale-98 flex items-center justify-center gap-2 ${
                isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin inline-block">⏳</span> ĐANG NỘP BÀI THI LÊN HỆ THỐNG...
                </>
              ) : (
                <>
                  <span>🚀</span> NỘP BÀI KIỂM TRA CHO THẦY CÔ
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-3">
            <div className="p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-300 text-emerald-900 text-sm space-y-1 text-center">
              <div className="flex items-center justify-center gap-2 font-black text-base text-emerald-800">
                <span>🎉</span> NỘP BÀI THI THÀNH CÔNG!
              </div>
              <p className="font-semibold text-emerald-700 text-xs sm:text-sm">
                Điểm số đã được lưu an toàn vào bảng kết quả của lớp.
              </p>
            </div>

            <button
              onClick={() => setShowSuccessModal(true)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🎉</span> Xem Chi Tiết Kết Quả Nộp Bài
            </button>

            <button
              onClick={() => setShowCertificate(true)}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📜</span> Xem Giấy Khen & Vinh Danh
            </button>

            <button
              onClick={onBack}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-all cursor-pointer"
            >
              Quay lại trang chủ học sinh
            </button>
          </div>
        )}
      </div>

      {/* Submission Success Modal */}
      {showSuccessModal && (
        <SubmissionSuccessModal
          studentName={studentName}
          studentClass={studentClass}
          assignmentTitle={assignment.title || exam.title}
          score={existingSubmission?.score ?? (gradeResult ? (isOverdue ? Math.max(0, Math.round((gradeResult.scoreOn10 - 2) * 10) / 10) : gradeResult.scoreOn10) : 0)}
          rawScore={existingSubmission?.rawScore ?? gradeResult?.scoreOn10}
          isLate={existingSubmission?.isLate ?? isOverdue}
          penaltyPoints={2}
          totalCorrect={gradeResult ? gradeResult.totalCorrect : (existingSubmission?.totalCorrect || 0)}
          totalQuestions={allQuestions.length}
          submittedAt={existingSubmission?.submittedAt}
          evaluation={getEvaluation(existingSubmission?.score ?? (gradeResult ? (isOverdue ? Math.max(0, Math.round((gradeResult.scoreOn10 - 2) * 10) / 10) : gradeResult.scoreOn10) : 0))}
          onViewCertificate={() => {
            setShowSuccessModal(false);
            setShowCertificate(true);
          }}
          onBackToList={onBack}
          onClose={() => setShowSuccessModal(false)}
        />
      )}

      {/* Confirmation Modal if questions unanswered */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4 text-center border-4 border-amber-300 animate-scale-up">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-3xl mx-auto">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-brand-900">
              Em có chắc chắn muốn nộp bài?
            </h3>
            <p className="text-sm text-slate-600 font-medium">
              Em vẫn còn <strong className="text-rose-600 font-bold">{allQuestions.length - answeredCount} câu</strong> chưa trả lời. Những câu chưa làm sẽ không được tính điểm.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                disabled={isSubmitting}
                className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
              >
                Quay lại làm tiếp
              </button>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className={`py-3 text-white font-bold rounded-xl text-sm shadow-md flex items-center justify-center gap-1 ${
                  isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSubmitting ? '⏳ Đang nộp...' : 'Vẫn nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {showCertificate && (
        <LessonCertificate
          studentName={studentName}
          topic={`${exam.title} (Đề thi)`}
          score={gradeResult ? gradeResult.scoreOn10 : (existingSubmission?.score || 0)}
          totalCorrect={gradeResult ? gradeResult.totalCorrect : (existingSubmission?.totalCorrect || 0)}
          totalQuestions={allQuestions.length}
          evaluation={getEvaluation(gradeResult ? gradeResult.scoreOn10 : (existingSubmission?.score || 0))}
          onClose={() => setShowCertificate(false)}
        />
      )}
    </div>
  );
};
