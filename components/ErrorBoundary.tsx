import React, { Component, ErrorInfo, ReactNode } from 'react';
import { appStorage } from '../services/appStorage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CRITICAL REACT ERROR CAUGHT BY ERROR_BOUNDARY:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleClearDataAndReload = () => {
    try {
      const keysToClear = [
        'mrs_dung_classes', 'mrs_dung_students', 'mrs_dung_assignments',
        'mrs_dung_submissions', 'mrs_dung_monthly_reports', 'mrs_dung_weekly_reports',
        'mrs_dung_annual_reports', 'mrs_dung_class_schedules', 'mrs_dung_attendance_records',
        'mrs_dung_cloud_snapshot_v1', 'mrs_dung_active_assignments'
      ];
      keysToClear.forEach(k => {
        appStorage.removeItem(k);
        try { localStorage.removeItem(k); } catch {}
      });
      sessionStorage.clear();
    } catch {}
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-sky-50 to-amber-50 flex items-center justify-center p-4 font-sans text-slate-800">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-emerald-100 p-6 sm:p-8 text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 text-amber-600 rounded-3xl mx-auto flex items-center justify-center text-3xl sm:text-4xl shadow-inner">
              ⚠️
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                Đã Xảy Ra Sự Cố Hiển Thị
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Hệ thống gặp sự cố tạm thời khi tải giao diện bài học. Đừng lo lắng, bài tập và kết quả của các em đã được bảo vệ trên hệ thống.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-4 bg-gradient-to-r from-sky-600 to-sky-600 text-white rounded-2xl font-black text-sm shadow-md hover:from-sky-700 hover:to-sky-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <span>🔄</span>
                <span>Tải Lại Ứng Dụng</span>
              </button>

              <button
                onClick={this.handleClearDataAndReload}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                <span>🧹</span>
                <span>Làm Sạch Bộ Nhớ & Vào Lại</span>
              </button>
            </div>

            {/* Error detail accordion for diagnostics */}
            {this.state.error && (
              <details className="text-left pt-2 border-t border-slate-100">
                <summary className="text-[11px] font-semibold text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                  Chi tiết kỹ thuật (dành cho quản trị)
                </summary>
                <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-red-600 font-mono overflow-auto max-h-36">
                  <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
                  {this.state.error.stack && (
                    <pre className="mt-1 text-slate-500 whitespace-pre-wrap">{this.state.error.stack}</pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
