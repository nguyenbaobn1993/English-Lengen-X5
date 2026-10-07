import React from 'react';

interface SubmissionSuccessModalProps {
  studentName: string;
  studentClass: string;
  assignmentTitle: string;
  score: number;
  rawScore?: number;
  isLate?: boolean;
  penaltyPoints?: number;
  totalCorrect: number;
  totalQuestions: number;
  submittedAt?: string;
  evaluation: {
    text: string;
    emoji: string;
    level?: string;
    praise?: string;
  };
  onViewCertificate?: () => void;
  onBackToList: () => void;
  onClose: () => void;
}

export const SubmissionSuccessModal: React.FC<SubmissionSuccessModalProps> = ({
  studentName,
  studentClass,
  assignmentTitle,
  score,
  rawScore,
  isLate,
  penaltyPoints = 2,
  totalCorrect,
  totalQuestions,
  submittedAt,
  evaluation,
  onViewCertificate,
  onBackToList,
  onClose,
}) => {
  const formattedTime = submittedAt
    ? new Date(submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      ' - ' +
      new Date(submittedAt).toLocaleDateString('vi-VN')
    : new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      ' - ' +
      new Date().toLocaleDateString('vi-VN');

  const isHigh = score >= 8.0;
  const isPass = score >= 5.0;

  // Tự động khôi phục số câu đúng nếu có điểm mà totalCorrect bị lỗi là 0
  const safeTotalQuestions = totalQuestions > 0 ? totalQuestions : 55;
  const displayCorrect = (totalCorrect === 0 && score > 0)
    ? Math.round((score / 10) * safeTotalQuestions)
    : (totalCorrect ?? 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border-4 border-emerald-400 animate-scale-up relative">
        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/20 hover:bg-black/30 text-white font-black text-sm flex items-center justify-center transition-all cursor-pointer"
          title="Đóng"
        >
          ✕
        </button>

        {/* Header Banner */}
        <div className="bg-gradient-to-br from-sky-600 via-sky-600 to-sky-700 p-6 sm:p-7 text-white text-center relative overflow-hidden">
          {/* Background Decorative Emojis */}
          <div className="absolute -top-3 -left-3 text-5xl opacity-20 select-none pointer-events-none">🎉</div>
          <div className="absolute top-2 -right-2 text-5xl opacity-20 select-none pointer-events-none">⭐</div>
          <div className="absolute -bottom-4 right-10 text-6xl opacity-15 select-none pointer-events-none">🏆</div>

          {/* Big Checkmark */}
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-4xl shadow-xl mx-auto mb-3 text-emerald-600 border-4 border-emerald-100 transform hover:scale-105 transition-transform">
            ✅
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-wider mb-2 text-emerald-100">
            <span>🎉</span> THÔNG BÁO TỪ HỆ THỐNG
          </div>

          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white drop-shadow-sm">
            NỘP BÀI THÀNH CÔNG!
          </h2>

          <p className="text-emerald-100 text-xs sm:text-sm font-semibold mt-1">
            Bài làm của em đã được gửi thành công đến hệ thống của Thầy Cô!
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-7 space-y-5">
          {/* Student & Assignment Info */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-left">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-500 font-bold">👤 Học sinh:</span>
              <span className="font-black text-brand-900">{studentName} ({studentClass})</span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-500 font-bold">📝 Bài tập:</span>
              <span className="font-bold text-slate-800 text-right truncate max-w-[240px]" title={assignmentTitle}>
                {assignmentTitle}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-bold">⏰ Thời gian nộp:</span>
              <span className="font-semibold text-slate-600 text-xs">{formattedTime}</span>
            </div>
          </div>

          {/* Score & Evaluation Highlight */}
          <div className="bg-gradient-to-r from-sky-50 via-sky-50 to-sky-50 rounded-2xl p-5 border-2 border-emerald-200 text-center space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Kết Quả Của Em
            </p>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-5xl sm:text-6xl font-black text-emerald-700 leading-none">
                {score.toFixed(1)}
              </span>
              <span className="text-xl font-bold text-slate-400">/10</span>
            </div>

            <div className="inline-block text-xs sm:text-sm font-bold text-emerald-800 bg-white/80 px-3 py-1 rounded-full border border-emerald-200 shadow-xs">
              Số câu đúng: <strong className="font-black text-emerald-900">{displayCorrect}/{safeTotalQuestions}</strong> câu
            </div>

            {/* Hiển thị chi tiết nộp bài quá hạn nếu có */}
            {isLate && (
              <div className="mt-2 p-2.5 bg-rose-100 text-rose-900 text-xs font-black rounded-xl border border-rose-300 flex items-center justify-center gap-1.5 shadow-2xs">
                <span>⚠️</span>
                <span>
                  NỘP BÀI QUÁ HẠN: Điểm làm bài {rawScore !== undefined ? rawScore.toFixed(1) : score.toFixed(1)}/10 — Bị trừ {penaltyPoints} điểm ➔ Điểm chính thức: {score.toFixed(1)}/10
                </span>
              </div>
            )}

            <div className="pt-2">
              <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-black text-sm shadow-sm ${
                isHigh
                  ? 'bg-amber-400 text-amber-950'
                  : isPass
                  ? 'bg-emerald-500 text-white'
                  : 'bg-orange-500 text-white'
              }`}>
                <span>{evaluation?.emoji || '🎉'}</span>
                <span>{evaluation?.text || 'Hoàn thành'}</span>
              </div>
            </div>

            {evaluation?.praise && (
              <p className="text-xs sm:text-sm text-slate-600 italic font-medium pt-1">
                "{evaluation.praise}"
              </p>
            )}
          </div>

          {/* Note from Legend X5 */}
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-left flex items-start gap-2.5">
            <span className="text-xl shrink-0">👩‍🏫</span>
            <p className="text-xs text-amber-900 font-medium leading-relaxed">
              <strong>Lời dặn thầy cô:</strong> Mỗi link bài cô giao con chỉ làm và nộp 1 lần duy nhất, chỉ được làm lại khi Thầy Cô cho phép. Kết quả đã được ghi nhận vào hệ thống lớp rồi nhé!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            {onViewCertificate && (
              <button
                type="button"
                onClick={onViewCertificate}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white rounded-2xl font-black text-sm sm:text-base shadow-lg shadow-amber-500/20 transition-all transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>📜</span>
                <span>Xem Giấy Khen & Vinh Danh</span>
              </button>
            )}

            <button
              type="button"
              onClick={onBackToList}
              className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>⬅️</span>
              <span>Quay lại danh sách bài tập</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
