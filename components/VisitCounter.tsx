import React, { useState, useEffect, useRef } from 'react';
import { getRealLearningStats, subscribeToSync, RealLearningStats } from '../services/assignmentService';
import { getCurrentUser } from '../services/authService';

const AnimatedNumber: React.FC<{ value: number; duration?: number }> = ({ value, duration = 600 }) => {
  const [display, setDisplay] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value === prevValueRef.current) {
      setDisplay(value);
      return;
    }
    const startVal = prevValueRef.current;
    prevValueRef.current = value;
    if (value === 0) {
      setDisplay(0);
      return;
    }
    let current = startVal;
    const diff = value - startVal;
    const steps = Math.max(1, Math.floor(duration / 30));
    const step = diff / steps;
    const timer = setInterval(() => {
      current += step;
      if ((step > 0 && current >= value) || (step < 0 && current <= value)) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.round(current));
      }
    }, 30);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{display.toLocaleString('vi-VN')}</span>;
};

export const VisitCounter: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [stats, setStats] = useState<RealLearningStats>({
    totalVisits: 0,
    todayVisits: 0,
    myVisits: 0,
    activeStudentsCount: 0,
    averageScore: 0
  });
  const [loading, setLoading] = useState(true);

  const updateStats = () => {
    const user = getCurrentUser();
    const studentName = (user && user.role === 'student')
      ? user.name
      : (typeof window !== 'undefined' ? localStorage.getItem('mrs_dung_active_student_name') || '' : '');

    const realData = getRealLearningStats(studentName);
    setStats(realData);
    setLoading(false);
  };

  useEffect(() => {
    updateStats();
    const unsubscribe = subscribeToSync(() => {
      updateStats();
    });
    return () => unsubscribe();
  }, []);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-white/90 font-sans backdrop-blur-sm border border-white/10"
        title={`Tổng hợp thực tế: ${stats.totalVisits} lượt học • ${stats.todayVisits} lượt hôm nay • ${stats.activeStudentsCount} học sinh tham gia`}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>Lượt học:</span>
        <span className="font-bold text-highlight-300">
          {loading ? '...' : <AnimatedNumber value={stats.totalVisits} />}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 backdrop-blur-sm text-white font-sans">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📊</span>
        <h4 className="font-bold text-sm uppercase tracking-wider text-highlight-400">Thống Kê Lượt Học Thực Tế</h4>
        <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Trực tuyến
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <p className="text-lg sm:text-2xl font-black text-highlight-300">
            {loading ? '...' : <AnimatedNumber value={stats.totalVisits} />}
          </p>
          <p className="text-[10px] sm:text-xs text-slate-300 font-medium">Tổng lượt học</p>
        </div>

        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <p className="text-lg sm:text-2xl font-black text-emerald-400">
            {loading ? '...' : <AnimatedNumber value={stats.todayVisits} />}
          </p>
          <p className="text-[10px] sm:text-xs text-slate-300 font-medium">Hôm nay</p>
        </div>

        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <p className="text-lg sm:text-2xl font-black text-sky-400">
            {loading ? '...' : <AnimatedNumber value={stats.myVisits} />}
          </p>
          <p className="text-[10px] sm:text-xs text-slate-300 font-medium">
            {stats.myVisits > 0 && stats.activeStudentsCount > 0 && stats.myVisits !== stats.activeStudentsCount
              ? 'Em đã nộp'
              : 'Bạn đã học'}
          </p>
        </div>
      </div>
    </div>
  );
};
