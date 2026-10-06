import React from 'react';
import { Submission } from '../../types';
import { getTopPerformers, TopPerformer } from '../../services/assignmentService';

interface TopPerformersHonorProps {
  submissions: Submission[];
}

export const TopPerformersHonor: React.FC<TopPerformersHonorProps> = ({ submissions }) => {
  const topList = getTopPerformers(submissions, 8.0);
  const podiumTop3 = topList.slice(0, 3);
  const restTop = topList.slice(3);

  if (topList.length === 0) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-dashed border-amber-300 rounded-3xl p-8 text-center">
        <div className="text-4xl mb-3">🏆</div>
        <h3 className="text-lg font-black text-amber-900 mb-1">Chưa Có Học Sinh Nộp Bài Đạt Điểm Cao</h3>
        <p className="text-sm text-amber-700">
          Những bạn hoàn thành bài tập với điểm số từ 8.0 trở lên sẽ được vinh danh trang trọng tại Bảng Vàng này!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Banner Vinh Danh */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl border-4 border-yellow-200">
        <div className="absolute -right-6 -bottom-6 text-9xl opacity-20 select-none pointer-events-none">
          🏆
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              <span>⭐</span> BẢNG VÀNG DANH DỰ <span>⭐</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight font-display">
              VINH DANH NGÔI SAO XUẤT SẮC
            </h2>
            <p className="text-yellow-100 text-sm sm:text-base font-medium mt-1">
              Chúc mừng các bạn có kết quả học tập và điểm số cao nhất lớp Legend X5!
            </p>
          </div>

          <div className="bg-white/20 backdrop-blur-md rounded-2xl px-5 py-3 text-center border border-white/30">
            <p className="text-2xl sm:text-3xl font-black text-white">{topList.length}</p>
            <p className="text-xs text-yellow-100 uppercase font-bold tracking-wider">Học sinh vinh danh</p>
          </div>
        </div>
      </div>

      {/* Podium Top 1, 2, 3 */}
      {podiumTop3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 items-end pt-4">
          {/* Top 2 - Silver */}
          {podiumTop3[1] && (
            <div className="order-2 sm:order-1 bg-gradient-to-b from-slate-50 to-slate-100 rounded-3xl p-5 sm:p-6 border-2 border-slate-300 shadow-lg text-center transform hover:-translate-y-1 transition-all relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-slate-400 text-white font-black text-xs px-3 py-1 rounded-full shadow-md">
                🥈 TOP 2
              </div>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-slate-200 border-4 border-slate-300 flex items-center justify-center text-3xl shadow-inner mb-3">
                🥈
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-800 break-words">{podiumTop3[1].studentName}</h3>
              <p className="text-xs font-bold text-slate-500 uppercase">{podiumTop3[1].studentClass}</p>
              <div className="mt-3 inline-block bg-slate-200 px-4 py-1.5 rounded-full font-black text-slate-800 text-base">
                {podiumTop3[1].score.toFixed(1)} <span className="text-xs font-normal text-slate-500">/10</span>
              </div>
              <p className="text-xs text-slate-600 mt-2 font-medium italic">
                "{podiumTop3[1].evaluation?.text || 'Xuất sắc'}" • {podiumTop3[1].totalCorrect}/{podiumTop3[1].totalQuestions} câu đúng
              </p>
            </div>
          )}

          {/* Top 1 - Gold (Center & Taller) */}
          {podiumTop3[0] && (
            <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-50 via-yellow-100 to-amber-100 rounded-3xl p-6 sm:p-8 border-4 border-yellow-400 shadow-2xl text-center transform sm:-translate-y-3 hover:-translate-y-4 transition-all relative ring-4 ring-yellow-300/50">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-black text-xs px-4 py-1.5 rounded-full shadow-lg border-2 border-white uppercase tracking-wider flex items-center gap-1">
                <span>👑</span> TOP 1 XUẤT SẮC <span>👑</span>
              </div>
              <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-4 border-white flex items-center justify-center text-4xl shadow-xl mb-3 animate-bounce">
                🥇
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-amber-950 break-words">{podiumTop3[0].studentName}</h3>
              <p className="text-xs sm:text-sm font-black text-amber-700 uppercase tracking-wider">{podiumTop3[0].studentClass}</p>
              <div className="mt-3 inline-block bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-5 py-2 rounded-full font-black text-xl shadow-md border-2 border-yellow-200">
                {podiumTop3[0].score.toFixed(1)} <span className="text-xs font-normal text-yellow-100">/10</span>
              </div>
              <p className="text-xs sm:text-sm text-amber-800 mt-2 font-bold">
                {podiumTop3[0].evaluation?.emoji || '👑'} {podiumTop3[0].evaluation?.praise || 'Ngôi sao sáng nhất lớp Legend X5!'}
              </p>
            </div>
          )}

          {/* Top 3 - Bronze */}
          {podiumTop3[2] && (
            <div className="order-3 bg-gradient-to-b from-orange-50 to-amber-50 rounded-3xl p-5 sm:p-6 border-2 border-amber-300 shadow-lg text-center transform hover:-translate-y-1 transition-all relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-700 text-white font-black text-xs px-3 py-1 rounded-full shadow-md">
                🥉 TOP 3
              </div>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-amber-100 border-4 border-amber-300 flex items-center justify-center text-3xl shadow-inner mb-3">
                🥉
              </div>
              <h3 className="text-base sm:text-lg font-black text-amber-900 break-words">{podiumTop3[2].studentName}</h3>
              <p className="text-xs font-bold text-amber-700 uppercase">{podiumTop3[2].studentClass}</p>
              <div className="mt-3 inline-block bg-amber-100 px-4 py-1.5 rounded-full font-black text-amber-900 text-base">
                {podiumTop3[2].score.toFixed(1)} <span className="text-xs font-normal text-amber-600">/10</span>
              </div>
              <p className="text-xs text-amber-700 mt-2 font-medium italic">
                "{podiumTop3[2].evaluation?.text || 'Rất tốt'}" • {podiumTop3[2].totalCorrect}/{podiumTop3[2].totalQuestions} câu đúng
              </p>
            </div>
          )}
        </div>
      )}

      {/* Danh sách các bạn đạt điểm giỏi khác */}
      {restTop.length > 0 && (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100">
          <h4 className="text-base font-black text-brand-900 uppercase tracking-tight mb-4 flex items-center gap-2">
            <span>✨</span> CÁC BẠN ĐẠT ĐIỂM GIỎI TIÊU BIỂU (TỪ 8.0 ĐIỂM)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {restTop.map((item, index) => (
              <div
                key={item.id || index}
                className="flex items-center justify-between p-3.5 bg-brand-50/60 hover:bg-brand-50 rounded-2xl border border-brand-100 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm font-black text-brand-700 border border-brand-100">
                    #{item.rank}
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 text-sm">{item.studentName}</h5>
                    <p className="text-xs font-semibold text-brand-600">{item.studentClass} • {item.topic}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-brand-700 text-base">{item.score.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-400 block font-bold">{item.totalCorrect}/{item.totalQuestions} đúng</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
