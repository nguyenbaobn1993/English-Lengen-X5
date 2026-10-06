import React, { useEffect, useState } from 'react';
import { subscribeUpdateState, reloadToLatest, UpdateState } from '../services/appUpdate';
import { STORAGE_PROBLEM_EVENT } from '../services/firebaseService';

import { appStorage } from '../services/appStorage';

/** Các bản sao dữ liệu trên máy (tải lại được từ cloud). KHÔNG gồm tài khoản đăng nhập, API key, bài nộp đang chờ gửi. */
const LOCAL_DATA_CACHE_KEYS = [
  'mrs_dung_classes', 'mrs_dung_deleted_classes',
  'mrs_dung_students', 'mrs_dung_deleted_students',
  'mrs_dung_assignments', 'mrs_dung_deleted_assignments',
  'mrs_dung_submissions', 'mrs_dung_deleted_submissions',
  'mrs_dung_monthly_reports', 'mrs_dung_weekly_reports', 'mrs_dung_annual_reports',
  'mrs_dung_class_schedules', 'mrs_dung_attendance_records',
  'mrs_dung_cloud_snapshot_v1'
];

export const refreshLocalDataFromCloud = () => {
  try {
    LOCAL_DATA_CACHE_KEYS.forEach(k => {
      appStorage.removeItem(k);
      try { localStorage.removeItem(k); } catch {}
    });
  } catch {}
  setTimeout(() => {
    window.location.reload();
  }, 100);
};

/**
 * Cảnh báo khi trình duyệt của máy này không lưu được dữ liệu mới (bộ nhớ đầy):
 * máy sẽ hiển thị dữ liệu cũ. Nút "Làm mới" xóa bản sao cũ trên máy và tải lại từ cloud.
 */
export const StorageWarning: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onProblem = () => setShow(true);
    window.addEventListener(STORAGE_PROBLEM_EVENT, onProblem);
    return () => window.removeEventListener(STORAGE_PROBLEM_EVENT, onProblem);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-xl bg-rose-50 border-2 border-rose-300 text-rose-900 rounded-2xl shadow-2xl px-4 py-3 font-sans flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <span className="text-2xl shrink-0">⚠️</span>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-black">Bộ nhớ trình duyệt trên máy này đã đầy</p>
        <p className="text-xs text-rose-800">
          Máy không lưu được dữ liệu mới nên có thể đang hiển thị thông tin cũ. Bấm "Làm mới" để tải lại dữ liệu mới nhất
          (tài khoản đăng nhập và bài nộp đang chờ gửi được giữ nguyên).
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (confirm('Xóa bản sao dữ liệu cũ trên máy này và tải lại dữ liệu mới nhất từ hệ thống?')) refreshLocalDataFromCloud();
        }}
        className="shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm shadow"
      >
        Làm mới
      </button>
    </div>
  );
};

/**
 * Thanh thông báo khi website đã có phiên bản mới.
 * Trang sẽ tự cập nhật lúc an toàn; người dùng cũng có thể bấm cập nhật ngay.
 */
export const UpdateBanner: React.FC = () => {
  const [s, setS] = useState<UpdateState | null>(null);
  useEffect(() => subscribeUpdateState(setS), []);

  if (!s || !s.updateAvailable) return null;
  const busy = s.blockers.length > 0;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-xl bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl shadow-2xl px-4 py-3 font-sans flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <span className="text-2xl shrink-0">🔄</span>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-black">Website đã có phiên bản mới</p>
        <p className="text-xs text-amber-800">
          {busy
            ? `Trang sẽ tự cập nhật ngay sau khi xong: ${s.blockers.join(', ')}.`
            : 'Trang sẽ tự cập nhật trong giây lát. Có thể bấm "Cập nhật ngay".'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (busy && !confirm(`Đang có việc chưa xong (${s.blockers.join(', ')}). Cập nhật ngay có thể mất phần chưa lưu. Tiếp tục?`)) return;
          reloadToLatest();
        }}
        className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-sm shadow"
      >
        Cập nhật ngay
      </button>
    </div>
  );
};
