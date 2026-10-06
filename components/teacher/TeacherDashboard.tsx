import React, { useState, useEffect } from 'react';
import { AssignmentCreator } from './AssignmentCreator';
import { LessonRepository } from './LessonRepository';
import { StudentManagement } from './StudentManagement';
import { DailyResultsAggregator } from './DailyResultsAggregator';
import { MonthlyReportAggregator } from './MonthlyReportAggregator';
import { AnnualReportAggregator } from './AnnualReportAggregator';
import { ScheduleAndAttendance } from './ScheduleAndAttendance';
import { TopPerformersHonor } from './TopPerformersHonor';
import { getClasses, getStudents, getAssignments, getSubmissions, subscribeToSync, forceCloudSyncNow } from '../../services/assignmentService';
import { Assignment } from '../../types';

interface TeacherDashboardProps {
  onOpenSettings: () => void;
  onSwitchToStudent: () => void;
}

const VALID_TABS = ['create', 'repository', 'students', 'schedule', 'summary', 'monthly', 'annual', 'top'] as const;
type TeacherTab = typeof VALID_TABS[number];

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onOpenSettings, onSwitchToStudent }) => {
  const [activeTab, setActiveTabState] = useState<TeacherTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_teacher_active_tab') as TeacherTab;
      if (saved && VALID_TABS.includes(saved)) {
        return saved;
      }
    }
    return 'create';
  });

  const setActiveTab = (tab: TeacherTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_active_tab', tab);
    }
  };
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Vừa xong');
  const [stats, setStats] = useState({
    classesCount: 0,
    studentsCount: 0,
    assignmentsCount: 0,
    submissionsCount: 0
  });

  const refreshStats = () => {
    setStats({
      classesCount: getClasses().length,
      studentsCount: getStudents().length,
      assignmentsCount: getAssignments().length,
      submissionsCount: getSubmissions().length
    });
  };

  const handleForceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await forceCloudSyncNow();
      refreshStats();
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  useEffect(() => {
    refreshStats();
    const unsubscribe = subscribeToSync(() => {
      refreshStats();
    });
    return () => unsubscribe();
  }, []);

  const allSubmissions = activeTab === 'top' ? getSubmissions() : [];

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner for Teacher */}
      <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              <span>👩‍🏫</span> KHÔNG GIAN DÀNH CHO GIÁO VIÊN
            </div>
            <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight font-display">
              BẢNG ĐIỀU KHIỂN LEGEND X5
            </h1>
            <p className="text-brand-100 text-sm sm:text-base font-medium mt-1">
              Soạn bài theo ngày, quản lý học sinh theo lớp, tổng hợp và đánh giá kết quả học tập.
            </p>

            {/* Manual Cloud Sync Button */}
            <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-xl text-xs font-bold transition-all border border-white/30 shadow-xs cursor-pointer disabled:opacity-75"
                title="Tải lại ngay toàn bộ dữ liệu bài nộp, bài tập mới nhất từ máy chủ Firebase"
              >
                <span className={`text-sm ${isSyncing ? 'animate-spin inline-block' : ''}`}>🔄</span>
                <span>{isSyncing ? 'Đang đồng bộ đám mây...' : 'Đồng bộ đám mây ngay'}</span>
              </button>
              <span className="text-[11px] text-brand-100/90 font-medium">
                Cập nhật lúc: {lastSyncTime}
              </span>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full md:w-auto">
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20">
              <p className="text-xl sm:text-2xl font-black">{stats.classesCount}</p>
              <p className="text-[10px] sm:text-xs text-brand-100 uppercase font-bold">Lớp học</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20">
              <p className="text-xl sm:text-2xl font-black">{stats.studentsCount}</p>
              <p className="text-[10px] sm:text-xs text-brand-100 uppercase font-bold">Học sinh</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20">
              <p className="text-xl sm:text-2xl font-black">{stats.assignmentsCount}</p>
              <p className="text-[10px] sm:text-xs text-brand-100 uppercase font-bold">Bài đã giao</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20">
              <p className="text-xl sm:text-2xl font-black">{stats.submissionsCount}</p>
              <p className="text-[10px] sm:text-xs text-brand-100 uppercase font-bold">Bài đã nộp</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex bg-white p-2 rounded-2xl shadow-lg border border-brand-100 gap-2 overflow-x-auto">
        <button
          onClick={() => {
            setEditingAssignment(null);
            setActiveTab('create');
          }}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'create'
              ? 'bg-brand-500 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">📝</span> Soạn & Giao Bài
        </button>

        <button
          onClick={() => setActiveTab('repository')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'repository'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md scale-102 ring-2 ring-purple-200'
              : 'text-slate-600 hover:bg-purple-50'
          }`}
        >
          <span className="text-lg">📚</span> Kho Lưu Tài Liệu ({stats.assignmentsCount})
        </button>

        <button
          onClick={() => setActiveTab('students')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'students'
              ? 'bg-brand-500 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">👥</span> Quản Lý Học Sinh Theo Lớp
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'schedule'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">🗓️</span> Lịch & Điểm Danh
        </button>

        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'summary'
              ? 'bg-brand-500 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">📊</span> Tổng Hợp Theo Ngày
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'monthly'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">📅</span> Báo Cáo Tháng
        </button>

        <button
          onClick={() => setActiveTab('annual')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'annual'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">🗓️</span> Tổng Hợp Cả Năm
        </button>

        <button
          onClick={() => setActiveTab('top')}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'top'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-md scale-102'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-lg">🏆</span> Bảng Vàng Điểm Cao
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'create' && (
        <AssignmentCreator
          onOpenSettings={onOpenSettings}
          onAssignmentCreated={() => setActiveTab('repository')}
          onNavigateToRepository={() => setActiveTab('repository')}
          initialAssignment={editingAssignment}
          onClearInitialAssignment={() => setEditingAssignment(null)}
        />
      )}

      {activeTab === 'repository' && (
        <LessonRepository
          onEditAssignment={(assign) => {
            setEditingAssignment(assign);
            setActiveTab('create');
          }}
          onNavigateToCreate={() => {
            setEditingAssignment(null);
            setActiveTab('create');
          }}
        />
      )}

      {activeTab === 'students' && (
        <StudentManagement />
      )}

      {activeTab === 'schedule' && (
        <ScheduleAndAttendance />
      )}

      {activeTab === 'summary' && (
        <DailyResultsAggregator />
      )}

      {activeTab === 'monthly' && (
        <MonthlyReportAggregator onOpenAnnualReport={() => setActiveTab('annual')} />
      )}

      {activeTab === 'annual' && (
        <AnnualReportAggregator onBackToMonthly={() => setActiveTab('monthly')} />
      )}

      {activeTab === 'top' && (
        <TopPerformersHonor submissions={allSubmissions} />
      )}
    </div>
  );
};
