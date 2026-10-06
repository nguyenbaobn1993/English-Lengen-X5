import React, { useState, useEffect } from 'react';
import { Submission, ClassRoom } from '../../types';
import { getSubmissions, getClasses, getTopPerformers, TopPerformer, subscribeToSync } from '../../services/assignmentService';

interface StudentLeaderboardHonorProps {
  initialClassId?: string;
  compact?: boolean;
  title?: string;
  subtitle?: string;
  lockClass?: boolean;      // Khóa lớp cố định, chỉ hiển thị học sinh & thành tích của lớp đó
  hideClassFilter?: boolean; // Ẩn thanh chuyển lớp khác
}

export const StudentLeaderboardHonor: React.FC<StudentLeaderboardHonorProps> = ({
  initialClassId = 'ALL',
  compact = false,
  title,
  subtitle,
  lockClass = false,
  hideClassFilter = false
}) => {
  const [selectedClass, setSelectedClass] = useState<string>(initialClassId);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);

  const loadData = () => {
    const cls = getClasses();
    setClasses(cls);
    const subs = getSubmissions();
    setAllSubmissions(subs);
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToSync(() => {
      loadData();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (initialClassId) {
      setSelectedClass(initialClassId);
    }
  }, [initialClassId]);

  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();

  // Filter submissions strictly by class
  const filteredSubmissions = selectedClass === 'ALL'
    ? (allSubmissions || []).filter(s => Boolean(s))
    : (allSubmissions || []).filter(s => s && norm(s.studentClass) === norm(selectedClass));

  // Get ranked top performers (threshold 8.0)
  const topList: TopPerformer[] = getTopPerformers(filteredSubmissions, 8.0);
  const podiumTop3 = topList.slice(0, 3);
  const otherTops = topList.slice(3, 10);

  return (
    <div className={`bg-white/95 backdrop-blur-md rounded-3xl shadow-xl border border-amber-200/80 ${compact ? 'p-4 sm:p-5 space-y-4' : 'p-5 sm:p-6 lg:p-7 space-y-5'} font-sans animate-fade-in text-slate-900`}>
      {/* Header Banner - Cân đối, đẹp mắt, bỏ ô bạn vinh danh */}
      <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden text-center">
        {/* Subtle decorative background watermarks */}
        <div className="absolute -left-3 -bottom-5 text-7xl sm:text-8xl opacity-15 select-none pointer-events-none">
          🌟
        </div>
        <div className="absolute -right-3 -bottom-5 text-7xl sm:text-8xl opacity-15 select-none pointer-events-none">
          🏆
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center space-y-2 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider text-yellow-100 border border-white/25 shadow-xs">
            <span>⭐</span> BẢNG VÀNG THÀNH TÍCH <span>⭐</span>
          </div>

          <h3 className="text-base sm:text-xl lg:text-2xl font-black uppercase tracking-tight font-display drop-shadow-sm leading-snug px-1 text-center">
            {title || (selectedClass && selectedClass !== 'ALL' ? `HỌC SINH DẪN ĐẦU ĐIỂM CAO - ${selectedClass}` : 'HỌC SINH CHĂM CHỈ ĐANG DẪN ĐẦU ĐIỂM CAO NHẤT')}
          </h3>

          <p className="text-xs sm:text-sm text-yellow-100 font-medium leading-relaxed max-w-xl mx-auto text-center">
            {subtitle || (selectedClass && selectedClass !== 'ALL' ? `Tuyên dương các em nỗ lực làm bài tập về nhà chăm chỉ và đạt điểm số cao nhất ${selectedClass}!` : 'Tuyên dương các em nỗ lực làm bài tập về nhà chăm chỉ và đạt điểm số cao nhất lớp Legend X5!')}
          </p>
        </div>
      </div>

      {/* Class Filter Bar - Hide or Lock when class is isolated */}
      {lockClass || hideClassFilter ? (
        <div className="flex items-center justify-between pb-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-xs font-bold shadow-xs">
            <span>🏫</span> Bảng vinh danh lớp: <strong className="text-amber-800 font-black">{selectedClass}</strong>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            {filteredSubmissions.length} bài nộp
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap mr-1">
            Lọc theo lớp:
          </span>
          <button
            type="button"
            onClick={() => setSelectedClass('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
              selectedClass === 'ALL'
                ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🌟 Tất cả ({allSubmissions.length} bài)
          </button>
          {classes.map(c => {
            const count = (allSubmissions || []).filter(s => s && norm(s.studentClass) === norm(c.name)).length;
            const isSelected = norm(selectedClass) === norm(c.name);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedClass(c.name)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap flex items-center gap-1 ${
                  isSelected
                    ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{c.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* If No Submissions */}
      {topList.length === 0 ? (
        <div className="bg-amber-50/50 border-2 border-dashed border-amber-200 rounded-2xl p-6 sm:p-8 text-center space-y-2">
          <div className="text-4xl">🚀</div>
          <h4 className="text-base font-bold text-amber-900">
            Chưa có bài nộp đạt điểm cao ở {selectedClass === 'ALL' ? 'hệ thống' : selectedClass}
          </h4>
          <p className="text-xs text-amber-700 max-w-md mx-auto">
            Các em hãy chăm chỉ đăng nhập, hoàn thành bài tập thầy cô giao để trở thành người đầu tiên xuất hiện trên Bảng Vàng nhé!
          </p>
        </div>
      ) : (
        <>
          {/* Podium Top 3 */}
          {compact ? (
            <div className="space-y-3 pt-1">
              {/* Top 1 in Compact Mode */}
              {podiumTop3[0] && (
                <div className="bg-gradient-to-b from-amber-50 via-yellow-100 to-amber-100 rounded-2xl p-4 border-2 border-yellow-400 shadow-md text-center relative ring-2 ring-yellow-300/50">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-black text-[10px] px-3 py-0.5 rounded-full shadow border border-white flex items-center gap-1 whitespace-nowrap">
                    <span>👑</span> TOP 1 DẪN ĐẦU <span>👑</span>
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-1">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white flex items-center justify-center text-2xl shadow-sm">
                      🥇
                    </div>
                    <div className="text-left">
                      <h4 className="text-sm font-black text-amber-950 truncate max-w-[150px]" title={podiumTop3[0].studentName}>
                        {podiumTop3[0].studentName}
                      </h4>
                      <p className="text-[11px] font-bold text-amber-700">{podiumTop3[0].studentClass}</p>
                    </div>
                    <div className="ml-auto bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-3 py-1 rounded-xl font-black text-sm shadow-xs border border-yellow-200">
                      {podiumTop3[0].score.toFixed(1)} đ
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-800 font-bold mt-2 pt-2 border-t border-yellow-200/80 line-clamp-1 italic text-center">
                    {podiumTop3[0].evaluation?.emoji || '🌟'} {podiumTop3[0].evaluation?.praise || 'Thủ khoa chăm chỉ dẫn đầu điểm cao nhất!'}
                  </p>
                </div>
              )}

              {/* Top 2 & 3 in Compact Mode (Grid 2 cols) */}
              {(podiumTop3[1] || podiumTop3[2]) && (
                <div className="grid grid-cols-2 gap-2">
                  {podiumTop3[1] && (
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/90 rounded-xl p-3 border border-slate-300 shadow-xs text-center relative pt-4">
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-slate-500 text-white font-black text-[9px] px-2 py-0.2 rounded-full shadow-xs whitespace-nowrap">
                        🥈 TOP 2
                      </div>
                      <h4 className="text-xs font-black text-slate-800 truncate" title={podiumTop3[1].studentName}>
                        {podiumTop3[1].studentName}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-semibold">{podiumTop3[1].studentClass}</p>
                      <div className="mt-1.5 inline-block bg-white px-2 py-0.5 rounded-lg font-black text-slate-800 text-xs border border-slate-200 shadow-xs">
                        {podiumTop3[1].score.toFixed(1)} đ
                      </div>
                    </div>
                  )}

                  {podiumTop3[2] && (
                    <div className="bg-gradient-to-b from-orange-50 to-amber-50/90 rounded-xl p-3 border border-amber-300 shadow-xs text-center relative pt-4">
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-700 text-white font-black text-[9px] px-2 py-0.2 rounded-full shadow-xs whitespace-nowrap">
                        🥉 TOP 3
                      </div>
                      <h4 className="text-xs font-black text-amber-950 truncate" title={podiumTop3[2].studentName}>
                        {podiumTop3[2].studentName}
                      </h4>
                      <p className="text-[10px] text-amber-700 font-semibold">{podiumTop3[2].studentClass}</p>
                      <div className="mt-1.5 inline-block bg-white px-2 py-0.5 rounded-lg font-black text-amber-900 text-xs border border-amber-200 shadow-xs">
                        {podiumTop3[2].score.toFixed(1)} đ
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-end pt-2">
              {/* Top 2 - Silver */}
              {podiumTop3[1] && (
                <div className="order-2 sm:order-1 bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200/80 rounded-2xl p-4 border-2 border-slate-300 shadow-md text-center relative transform hover:-translate-y-1 transition-all">
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-slate-500 text-white font-black text-[10px] sm:text-xs px-3 py-0.5 rounded-full shadow">
                    🥈 TOP 2
                  </div>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-slate-200 border-2 border-slate-300 flex items-center justify-center text-2xl shadow-inner mb-2 mt-1">
                    🥈
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-slate-800 truncate" title={podiumTop3[1].studentName}>
                    {podiumTop3[1].studentName}
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500">{podiumTop3[1].studentClass}</p>
                  <div className="mt-2 inline-block bg-white px-3 py-1 rounded-full font-black text-slate-800 text-sm border border-slate-300 shadow-xs">
                    {podiumTop3[1].score.toFixed(1)} <span className="text-[10px] font-normal text-slate-500">/10</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 font-medium line-clamp-1 italic">
                    "{podiumTop3[1].evaluation?.praise || podiumTop3[1].evaluation?.text || 'Học sinh chăm chỉ xuất sắc'}"
                  </p>
                </div>
              )}

              {/* Top 1 - Gold (Center & Prominent) */}
              {podiumTop3[0] && (
                <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-50 via-yellow-100 to-amber-100 rounded-3xl p-5 border-2 border-yellow-400 shadow-xl text-center relative ring-4 ring-yellow-300/40 transform sm:-translate-y-2 hover:-translate-y-3 transition-all">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-black text-[11px] sm:text-xs px-3.5 py-1 rounded-full shadow-md border border-white flex items-center gap-1 whitespace-nowrap">
                    <span>👑</span> TOP 1 XUẤT SẮC <span>👑</span>
                  </div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-4 border-white flex items-center justify-center text-3xl sm:text-4xl shadow-md mb-2 mt-1 animate-bounce">
                    🥇
                  </div>
                  <h4 className="text-base sm:text-lg font-black text-amber-950 truncate" title={podiumTop3[0].studentName}>
                    {podiumTop3[0].studentName}
                  </h4>
                  <p className="text-xs font-black text-amber-700 uppercase tracking-wide">
                    {podiumTop3[0].studentClass}
                  </p>
                  <div className="mt-2 inline-block bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-4 py-1 rounded-full font-black text-base shadow-sm border border-yellow-200">
                    {podiumTop3[0].score.toFixed(1)} <span className="text-xs font-normal text-yellow-100">/10</span>
                  </div>
                  <p className="text-xs text-amber-800 font-bold mt-1.5">
                    {podiumTop3[0].evaluation?.emoji || '🌟'} {podiumTop3[0].evaluation?.praise || 'Thủ khoa chăm chỉ dẫn đầu điểm cao nhất!'}
                  </p>
                </div>
              )}

              {/* Top 3 - Bronze */}
              {podiumTop3[2] && (
                <div className="order-3 bg-gradient-to-b from-orange-50 via-amber-50 to-amber-100/80 rounded-2xl p-4 border-2 border-amber-300 shadow-md text-center relative transform hover:-translate-y-1 transition-all">
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-700 text-white font-black text-[10px] sm:text-xs px-3 py-0.5 rounded-full shadow">
                    🥉 TOP 3
                  </div>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-2xl shadow-inner mb-2 mt-1">
                    🥉
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-amber-900 truncate" title={podiumTop3[2].studentName}>
                    {podiumTop3[2].studentName}
                  </h4>
                  <p className="text-[11px] font-bold text-amber-700">{podiumTop3[2].studentClass}</p>
                  <div className="mt-2 inline-block bg-white px-3 py-1 rounded-full font-black text-amber-900 text-sm border border-amber-300 shadow-xs">
                    {podiumTop3[2].score.toFixed(1)} <span className="text-[10px] font-normal text-amber-600">/10</span>
                  </div>
                  <p className="text-[11px] text-amber-800 mt-1 font-medium line-clamp-1 italic">
                    "{podiumTop3[2].evaluation?.praise || podiumTop3[2].evaluation?.text || 'Học sinh tiến bộ vượt bậc'}"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* List of Other Top Performers (#4 to #10) */}
          {otherTops.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <span>✨</span> CÁC BẠN CHĂM CHỈ ĐẠT ĐIỂM GIỎI TIÊU BIỂU (TỪ 8.0 ĐIỂM):
              </h5>
              <div className={`grid grid-cols-1 ${compact ? 'gap-1.5' : 'sm:grid-cols-2 gap-2'}`}>
                {otherTops.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-amber-50/60 rounded-xl border border-slate-200/80 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-black text-[11px] flex items-center justify-center shrink-0">
                        #{item.rank}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{item.studentName}</p>
                        <p className="text-[10px] text-slate-500 font-semibold">{item.studentClass}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        {item.score.toFixed(1)} đ
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Encouragement Footer */}
      <div className="p-3 bg-gradient-to-r from-brand-50 to-emerald-50 rounded-2xl border border-brand-100 flex items-center gap-2.5 text-xs text-brand-900 font-medium">
        <span className="text-lg">💖</span>
        <span>
          <b>Legend X5 nhắn nhủ:</b> <i>"Connect the world — Chăm chỉ mỗi ngày, con nhất định sẽ tỏa sáng!"</i>
        </span>
      </div>
    </div>
  );
};
