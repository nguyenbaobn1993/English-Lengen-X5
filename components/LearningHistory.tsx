import React, { useState, useEffect } from 'react';
import { LessonRecord, WeeklyReport } from '../types';
import { getLessonHistory, getWeeklyReports, getStreak, clearHistory } from '../services/historyService';

interface LearningHistoryProps {
    onClose: () => void;
}

export const LearningHistory: React.FC<LearningHistoryProps> = ({ onClose }) => {
    const [records, setRecords] = useState<LessonRecord[]>([]);
    const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
    const [streak, setStreak] = useState(0);
    const [tab, setTab] = useState<'weekly' | 'all'>('weekly');
    const [confirmClear, setConfirmClear] = useState(false);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        const hist = getLessonHistory();
        hist.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRecords(hist);
        setWeeklyReports(getWeeklyReports());
        setStreak(getStreak());
    };

    const handleClear = () => {
        if (confirmClear) {
            clearHistory();
            refreshData();
            setConfirmClear(false);
        } else {
            setConfirmClear(true);
            setTimeout(() => setConfirmClear(false), 3000);
        }
    };

    const progressBadge = (p: WeeklyReport['progress'], avg: number, prevAvg: number | null) => {
        if (p === 'up') return <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">📈 Tiến bộ (+{(avg - (prevAvg || 0)).toFixed(1)})</span>;
        if (p === 'down') return <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">📉 Giảm ({(avg - (prevAvg || 0)).toFixed(1)})</span>;
        if (p === 'same') return <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">➡️ Không đổi</span>;
        return null;
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} lúc ${hh}:${mi}`;
    };

    const scoreColor = (s: number) => {
        if (s >= 9) return 'text-emerald-600';
        if (s >= 7) return 'text-blue-600';
        if (s >= 5) return 'text-amber-600';
        return 'text-rose-600';
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl sm:text-3xl">📊</span>
                        <div>
                            <h2 className="text-white font-black text-base sm:text-xl">Lịch sử học tập</h2>
                            <p className="text-brand-100 text-xs sm:text-sm font-semibold">30 ngày gần nhất</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all text-lg font-bold">✕</button>
                </div>

                {/* Stats Bar */}
                <div className="bg-brand-50 px-4 sm:px-6 py-3 flex gap-3 sm:gap-4 border-b border-brand-100 shrink-0 overflow-x-auto">
                    <div className="bg-white rounded-xl px-3 sm:px-4 py-2 shadow-sm border border-brand-100 text-center min-w-[80px]">
                        <p className="text-xl sm:text-2xl font-black text-brand-600">{records.length}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase">Bài học</p>
                    </div>
                    <div className="bg-white rounded-xl px-3 sm:px-4 py-2 shadow-sm border border-brand-100 text-center min-w-[80px]">
                        <p className="text-xl sm:text-2xl font-black text-amber-500">🔥 {streak}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase">Chuỗi ngày</p>
                    </div>
                    <div className="bg-white rounded-xl px-3 sm:px-4 py-2 shadow-sm border border-brand-100 text-center min-w-[80px]">
                        <p className={`text-xl sm:text-2xl font-black ${records.length > 0 ? scoreColor(records.reduce((s, r) => s + r.score, 0) / records.length) : 'text-slate-400'}`}>
                            {records.length > 0 ? (records.reduce((s, r) => s + r.score, 0) / records.length).toFixed(1) : '—'}
                        </p>
                        <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase">Điểm TB</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-4 sm:px-6 pt-3 shrink-0">
                    <button onClick={() => setTab('weekly')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all ${tab === 'weekly' ? 'bg-brand-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>📅 Báo cáo tuần</button>
                    <button onClick={() => setTab('all')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all ${tab === 'all' ? 'bg-brand-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>📋 Tất cả ({records.length})</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 space-y-3">
                    {tab === 'weekly' ? (
                        weeklyReports.length > 0 ? (
                            weeklyReports.map((week, i) => (
                                <div key={i} className={`bg-white rounded-2xl border-2 p-4 transition-all ${i === 0 ? 'border-brand-300 shadow-md ring-2 ring-brand-100' : 'border-slate-100 shadow-sm'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{i === 0 ? '📌' : '📆'}</span>
                                            <h3 className="font-bold text-sm sm:text-base text-slate-800">
                                                {i === 0 ? 'Tuần này' : i === 1 ? 'Tuần trước' : `${i} tuần trước`}
                                            </h3>
                                            <span className="text-xs text-slate-400 font-mono">{week.weekLabel}</span>
                                        </div>
                                        {progressBadge(week.progress, week.averageScore, week.prevAverage)}
                                    </div>

                                    {week.lessonCount === 0 ? (
                                        <p className="text-slate-400 text-sm italic text-center py-2">Chưa có bài học nào trong tuần này</p>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="flex gap-3">
                                                <div className="bg-brand-50 rounded-xl px-3 py-2 flex-1 text-center">
                                                    <p className="text-lg font-black text-brand-600">{week.lessonCount}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold">BÀI HỌC</p>
                                                </div>
                                                <div className="bg-brand-50 rounded-xl px-3 py-2 flex-1 text-center">
                                                    <p className={`text-lg font-black ${scoreColor(week.averageScore)}`}>{week.averageScore.toFixed(1)}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold">ĐIỂM TB</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Chủ đề đã học:</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {week.topics.map((t, j) => (
                                                        <span key={j} className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-slate-400">
                                <p className="text-4xl mb-2">📚</p>
                                <p className="font-bold">Chưa có dữ liệu</p>
                                <p className="text-sm">Hãy hoàn thành bài học đầu tiên!</p>
                            </div>
                        )
                    ) : (
                        records.length > 0 ? (
                            records.map((r) => (
                                <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center gap-3 hover:shadow-md transition-all">
                                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center font-black text-lg sm:text-xl text-white shrink-0 ${r.score >= 9 ? 'bg-emerald-500' : r.score >= 7 ? 'bg-blue-500' : r.score >= 5 ? 'bg-amber-500' : 'bg-rose-500'}`}>
                                        {r.score.toFixed(1)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-800 truncate">{r.topic}</h4>
                                        <p className="text-xs text-slate-400">{formatDate(r.date)} • {r.studentName || 'Ẩn danh'}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Đúng <span className="font-bold text-brand-600">{r.totalCorrect}/{r.totalQuestions}</span> câu</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-slate-400">
                                <p className="text-4xl mb-2">📚</p>
                                <p className="font-bold">Chưa có bài học nào</p>
                                <p className="text-sm">Hoàn thành bài học và bấm "Xuất chứng nhận" để lưu!</p>
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 sm:px-6 py-3 border-t border-slate-100 flex justify-between items-center shrink-0 bg-slate-50">
                    <button
                        onClick={handleClear}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${confirmClear ? 'bg-rose-500 text-white' : 'text-rose-400 hover:text-rose-600 hover:bg-rose-50'}`}
                    >
                        {confirmClear ? '⚠️ Bấm lần nữa để xoá!' : '🗑 Xoá lịch sử'}
                    </button>
                    <p className="text-[10px] text-slate-400">Tự động xoá sau 30 ngày</p>
                </div>
            </div>
        </div>
    );
};
