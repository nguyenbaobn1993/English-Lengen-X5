import {
  ClassRoom,
  Student,
  DeletedStudentRecord,
  DeletedClassRecord,
  DeletedAssignmentRecord,
  Assignment,
  Submission,
  DailySummary,
  DeadlineStatus,
  LessonPlan,
  MonthlyReport,
  MonthlySessionConfig,
  MonthlySessionColumn,
  StudentMonthlyScore,
  WeeklyReportRecord,
  WeeklySessionConfig,
  StudentWeeklyScore,
  ClassScheduleConfig,
  WeeklyTimeSlot,
  AttendanceRecord,
  AttendanceStudentItem,
  AttendanceStatus,
  AnnualReport,
  StudentAnnualScore
} from '../types';
import {
  syncToFirebaseIfConfigured,
  pullAllFromFirebase,
  pullSubmissionsOnlyFromFirebase,
  seedFirebaseIfEmpty,
  syncSingleSubmissionToFirebase,
  subscribeToFirebaseRealtime,
  getFirebaseConfig,
  putItemToFirebaseCollection,
  deleteItemsFromFirebaseCollection,
  isHiddenByTombstone,
  timeAfter,
  ensureFreshSubmissions,
  markLocalDeletion,
  recordReportEdits
} from './firebaseService';
import { ensureCompletePracticeContent } from '../utils/practiceBuilder';
import { appStorage } from './appStorage';

// Storage keys
const CLASSES_KEY = 'mrs_dung_classes';
export const DELETED_CLASSES_KEY = 'mrs_dung_deleted_classes';
const STUDENTS_KEY = 'mrs_dung_students';
export const DELETED_STUDENTS_KEY = 'mrs_dung_deleted_students';
const ASSIGNMENTS_KEY = 'mrs_dung_assignments';
export const DELETED_ASSIGNMENTS_KEY = 'mrs_dung_deleted_assignments';
const SUBMISSIONS_KEY = 'mrs_dung_submissions';
const MONTHLY_REPORTS_KEY = 'mrs_dung_monthly_reports';
const WEEKLY_REPORTS_KEY = 'mrs_dung_weekly_reports';
const ANNUAL_REPORTS_KEY = 'mrs_dung_annual_reports';
const CLASS_SCHEDULES_KEY = 'mrs_dung_class_schedules';
const ATTENDANCE_RECORDS_KEY = 'mrs_dung_attendance_records';
const DATA_CLEANED_KEY = 'mrs_dung_data_cleaned';

// ==================== IN-MEMORY CACHES FOR 60FPS UI PERFORMANCE ====================
let cachedSubmissionsRaw: string | null = null;
let cachedSubmissionsClean: Submission[] | null = null;
const cachedSubmissionsByAssignment = new Map<string, Submission[]>();

let cachedClassesRaw: string | null = null;
let cachedClassesClean: ClassRoom[] | null = null;

let cachedStudentsRaw: string | null = null;
let cachedDeletedStudentsRaw: string | null = null;
let cachedStudentsClean: Student[] | null = null;
const cachedStudentsByClass = new Map<string, Student[]>();

let cachedAssignmentsRaw: string | null = null;
let cachedAssignmentsClean: Assignment[] | null = null;
const cachedAssignmentsByClass = new Map<string, Assignment[]>();

export const invalidateSubmissionsCache = () => {
  cachedSubmissionsRaw = null;
  cachedSubmissionsClean = null;
  cachedSubmissionsByAssignment.clear();
};

export const invalidateClassesCache = () => {
  cachedClassesRaw = null;
  cachedClassesClean = null;
  // Danh sách bài nộp hiển thị phụ thuộc lớp đang hiện
  cachedSubmissionsRaw = null;
  cachedSubmissionsClean = null;
  cachedSubmissionsByAssignment.clear();
};

export const invalidateStudentsCache = () => {
  cachedStudentsRaw = null;
  cachedDeletedStudentsRaw = null;
  cachedStudentsClean = null;
  cachedStudentsByClass.clear();
  // Danh sách bài nộp hiển thị phụ thuộc học sinh đang hiện
  cachedSubmissionsRaw = null;
  cachedSubmissionsClean = null;
  cachedSubmissionsByAssignment.clear();
};

export const invalidateAssignmentsCache = () => {
  cachedAssignmentsRaw = null;
  cachedAssignmentsClean = null;
  cachedAssignmentsByClass.clear();
};

export const invalidateAllCaches = () => {
  invalidateSubmissionsCache();
  invalidateClassesCache();
  invalidateStudentsCache();
  invalidateAssignmentsCache();
};

// BroadcastChannel for instant multi-tab sync
const SYNC_CHANNEL_NAME = 'mrs_dung_sync_channel';
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch (e) {
    console.warn('BroadcastChannel not supported or error:', e);
  }
}

export const notifySync = (type: string, data?: any) => {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type, data, timestamp: Date.now() });
  }
  // Also dispatch CustomEvent on window for single-tab state reactivity
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mrs_dung_local_sync', { detail: { type, data } }));
  }
};

export const subscribeToSync = (callback: (event: { type: string; data?: any }) => void): (() => void) => {
  const handleMessage = (e: MessageEvent) => {
    if (e.data && e.data.type) {
      callback(e.data);
    }
  };

  const handleLocalEvent = (e: any) => {
    if (e.detail) {
      callback(e.detail);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('mrs_dung_local_sync', handleLocalEvent);
  }

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('mrs_dung_local_sync', handleLocalEvent);
    }
  };
};

// ==================== DEFAULT SEED DATA (EMPTY - PURE REAL DATA) ====================
const DEFAULT_CLASSES: ClassRoom[] = [];
const DEFAULT_STUDENTS: Student[] = [];
export const DEFAULT_CLASS_SCHEDULES: ClassScheduleConfig[] = [];

// Helper to get today's date in YYYY-MM-DD
export const getTodayString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Helper to get local date string (YYYY-MM-DD) taking Vietnam timezone into account
export const getLocalDateString = (dateInput?: string | Date): string => {
  if (!dateInput) return getTodayString();
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return typeof dateInput === 'string' ? dateInput.split('T')[0] : getTodayString();
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ==================== DATA RESET & CLEANUP ====================
export const isDataCleaned = (): boolean => {
  if (typeof window === 'undefined') return false;
  return appStorage.getItem(DATA_CLEANED_KEY) === 'true';
};

export const clearAllDemoData = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  appStorage.setItem(DATA_CLEANED_KEY, 'true');
  appStorage.setItem(CLASSES_KEY, JSON.stringify([]));
  appStorage.setItem(DELETED_CLASSES_KEY, JSON.stringify([]));
  appStorage.setItem(STUDENTS_KEY, JSON.stringify([]));
  appStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify([]));
  appStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify([]));
  appStorage.setItem(DELETED_ASSIGNMENTS_KEY, JSON.stringify([]));
  appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([]));
  appStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify([]));
  appStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify([]));
  appStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify([]));
  appStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify([]));

  // KHÔNG còn xóa dữ liệu trên hệ thống (trước đây hàm này xóa sạch toàn bộ dữ liệu thật trên cloud).
  // Chỉ xóa bản sao trên máy này; lần đồng bộ sau sẽ tải lại đầy đủ từ hệ thống.
  notifySync('data_reset_all', { timestamp: Date.now() });
};

const MOCK_CLASS_IDS = new Set(['class_6a1', 'class_6a2', 'class_7b1', 'class_8a1']);
const MOCK_STUDENT_IDS = new Set(Array.from({ length: 17 }, (_, i) => `std_${i + 1}`));

/**
 * Chỉ nhận diện đúng dữ liệu mẫu "Pallas" cũ (theo mã / tên lớp mẫu).
 * Bản cũ loại bỏ MỌI mục có chữ "pallas" ở bất kỳ đâu → có thể tự xóa mục giáo viên thêm vào.
 */
const isPallasItem = (item: any): boolean => {
  if (!item) return false;
  return (
    /pallas/i.test(String(item.id || '')) ||
    /pallas/i.test(String(item.classId || '')) ||
    /pallas/i.test(String(item.studentId || '')) ||
    /^(lớp\s*)?pallas star$/i.test(String(item.name || item.className || item.studentClass || '').trim())
  );
};

/**
 * Ghi danh sách lên cloud, đồng thời đánh dấu đúng những mục giáo viên vừa gỡ khỏi danh sách
 * (chỉ những mục này mới được xóa trên cloud — mục chỉ thiếu trên máy không bao giờ bị xóa).
 */
const syncListWithDeletions = (path: string, prev: any[], next: any[]) => {
  const nextIds = new Set(next.filter(x => x && x.id).map(x => String(x.id)));
  const removed = prev.filter(x => x && x.id && !nextIds.has(String(x.id))).map(x => String(x.id));
  if (removed.length > 0) markLocalDeletion(path, removed);
  // Bảng điểm: ghi nhớ đúng các ô vừa sửa để khi gửi chỉ áp các ô đó lên bản cloud
  recordReportEdits(path, prev, next);
  syncToFirebaseIfConfigured(path, next);
};

/** Tra dấu "đã xóa" theo mã */
const tombMap = <T extends { id: string }>(list: T[]): Map<string, T> => {
  const m = new Map<string, T>();
  list.forEach(t => { if (t && t.id) m.set(String(t.id), t); });
  return m;
};

// ==================== CLASS NAME NORMALIZATION ====================
/**
 * Chuẩn hóa tên lớp học: loại bỏ tiền tố "lớp", "lop", khoảng trắng thừa và viết thường
 */
export const normClassName = (str?: string): string => {
  if (!str) return '';
  return str.toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
};

// ==================== DELETED CLASSES (TOMBSTONE) ====================
export const getDeletedClasses = (): DeletedClassRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(DELETED_CLASSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDeletedClasses = (records: DeletedClassRecord[]): void => {
  if (typeof window === 'undefined') return;
  const prevRecords = getDeletedClasses();
  const map = new Map<string, DeletedClassRecord>();
  records.forEach(r => {
    if (r && r.id) map.set(r.id, r);
  });
  const deduped = Array.from(map.values());
  appStorage.setItem(DELETED_CLASSES_KEY, JSON.stringify(deduped));
  invalidateClassesCache();
  invalidateStudentsCache(); // học sinh cũng ẩn/hiện theo lớp
  notifySync('deleted_classes_updated', deduped);
  syncListWithDeletions('deleted_classes', prevRecords, deduped);
};

export const isClassDeleted = (classIdOrName: string): boolean => {
  if (!classIdOrName) return false;
  const targetNorm = normClassName(classIdOrName);
  return getDeletedClasses().some(d => d.id === classIdOrName || (d.name && normClassName(d.name) === targetNorm));
};

// ==================== CLASS MANAGEMENT ====================
export const getClasses = (): ClassRoom[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(CLASSES_KEY);
    const rawDeleted = appStorage.getItem(DELETED_CLASSES_KEY);
    if (raw !== cachedClassesRaw || cachedClassesClean === null) {
      let result: ClassRoom[] = [];
      // Lớp bị ẩn khi giáo viên xóa SAU lần thay đổi cuối của lớp (so theo MÃ lớp).
      // Không ẩn theo tên nữa: tạo lớp mới trùng tên lớp đã xóa vẫn hiện bình thường, lớp cũ vẫn ẩn.
      const classTombs = tombMap(getDeletedClasses());
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          result = parsed.filter(c =>
            c && c.id &&
            !MOCK_CLASS_IDS.has(c.id) &&
            !isPallasItem(c) &&
            !isHiddenByTombstone(c, classTombs.get(String(c.id)))
          );
        }
      }
      cachedClassesRaw = raw;
      cachedClassesClean = result;
    }
    return cachedClassesClean;
  } catch {
    return [];
  }
};

export const saveClasses = (classes: ClassRoom[]): void => {
  if (typeof window === 'undefined') return;
  const classTombs = tombMap(getDeletedClasses());
  const cleanClasses = classes.filter(c =>
    c && c.id &&
    !MOCK_CLASS_IDS.has(c.id) &&
    !isPallasItem(c) &&
    !isHiddenByTombstone(c, classTombs.get(String(c.id)))
  );
  const serialized = JSON.stringify(cleanClasses);
  appStorage.setItem(CLASSES_KEY, serialized);
  cachedClassesRaw = serialized;
  cachedClassesClean = cleanClasses;
  invalidateAssignmentsCache();
  invalidateSubmissionsCache();
  notifySync('classes_updated', cleanClasses);
  syncToFirebaseIfConfigured('classes', cleanClasses);
};

export const formatScheduleSummary = (slots?: WeeklyTimeSlot[]): string => {
  if (!slots || slots.length === 0) return '';
  const dayOrder = [2, 3, 4, 5, 6, 7, 1];
  const sorted = [...slots].sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));
  const dayNames = sorted.map(s => s.dayLabel || (s.dayOfWeek === 1 ? 'Chủ Nhật' : `Thứ ${s.dayOfWeek}`)).join(' & ');
  const time = sorted[0]?.startTime && sorted[0]?.endTime ? ` (${sorted[0].startTime} - ${sorted[0].endTime})` : '';
  return `${dayNames}${time}`;
};

export const parseScheduleFromText = (
  text: string,
  defaultRoom: string = 'Phòng A1'
): { slots: WeeklyTimeSlot[]; formattedSummary: string } | null => {
  if (!text || !text.trim()) return null;
  const raw = text.toLowerCase();

  let startTime = '17:30';
  let endTime = '19:00';
  const timeMatch = text.match(/(\d{1,2})[h:](\d{2})?\s*[-–—]\s*(\d{1,2})[h:](\d{2})?/i);
  if (timeMatch) {
    const h1 = String(timeMatch[1]).padStart(2, '0');
    const m1 = timeMatch[2] ? String(timeMatch[2]).padStart(2, '0') : '00';
    const h2 = String(timeMatch[3]).padStart(2, '0');
    const m2 = timeMatch[4] ? String(timeMatch[4]).padStart(2, '0') : '00';
    startTime = `${h1}:${m1}`;
    endTime = `${h2}:${m2}`;
  }

  const matchedDays = new Set<number>();
  if (raw.includes('chủ nhật') || raw.includes('chu nhat') || /\bcn\b/.test(raw)) {
    matchedDays.add(1);
  }
  if (raw.includes('thứ hai') || raw.includes('thu hai') || raw.includes('thứ 2') || raw.includes('thu 2') || /\bt2\b/.test(raw)) {
    matchedDays.add(2);
  }
  if (raw.includes('thứ ba') || raw.includes('thu ba') || raw.includes('thứ 3') || raw.includes('thu 3') || /\bt3\b/.test(raw)) {
    matchedDays.add(3);
  }
  if (raw.includes('thứ tư') || raw.includes('thu tu') || raw.includes('thứ 4') || raw.includes('thu 4') || /\bt4\b/.test(raw)) {
    matchedDays.add(4);
  }
  if (raw.includes('thứ năm') || raw.includes('thu nam') || raw.includes('thứ 5') || raw.includes('thu 5') || /\bt5\b/.test(raw)) {
    matchedDays.add(5);
  }
  if (raw.includes('thứ sáu') || raw.includes('thu sau') || raw.includes('thứ 6') || raw.includes('thu 6') || /\bt6\b/.test(raw)) {
    matchedDays.add(6);
  }
  if (raw.includes('thứ bảy') || raw.includes('thu bay') || raw.includes('thứ 7') || raw.includes('thu 7') || /\bt7\b/.test(raw)) {
    matchedDays.add(7);
  }

  if (/t2\s*[-–]\s*t?4\s*[-–]\s*t?6/i.test(raw) || /2\s*[-–]\s*4\s*[-–]\s*6/i.test(raw)) {
    matchedDays.add(2);
    matchedDays.add(4);
    matchedDays.add(6);
  }
  if (/t3\s*[-–]\s*t?5\s*[-–]\s*t?7/i.test(raw) || /3\s*[-–]\s*5\s*[-–]\s*7/i.test(raw)) {
    matchedDays.add(3);
    matchedDays.add(5);
    matchedDays.add(7);
  }

  if (matchedDays.size === 0) return null;

  const dayOrder = [2, 3, 4, 5, 6, 7, 1];
  const sortedDays = Array.from(matchedDays).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

  const dayLabelsMap: Record<number, string> = {
    1: 'Chủ Nhật',
    2: 'Thứ Hai',
    3: 'Thứ Ba',
    4: 'Thứ Tư',
    5: 'Thứ Năm',
    6: 'Thứ Sáu',
    7: 'Thứ Bảy'
  };

  const slots: WeeklyTimeSlot[] = sortedDays.map((d, idx) => ({
    id: `slot_${Date.now()}_${idx + 1}`,
    dayOfWeek: d,
    dayLabel: dayLabelsMap[d] || `Thứ ${d}`,
    startTime,
    endTime,
    room: defaultRoom
  }));

  const daySummary = sortedDays.map(d => dayLabelsMap[d]).join(' & ');
  const formattedSummary = `${daySummary} (${startTime} - ${endTime})`;

  return { slots, formattedSummary };
};

export const addClass = (
  name: string,
  grade: number,
  description = '',
  customSlots?: WeeklyTimeSlot[]
): ClassRoom => {
  const current = getClasses();
  const now = new Date().toISOString();
  const trimmedName = name.trim();

  // Lớp mới luôn có mã mới nên không bị dấu "đã xóa" của lớp cũ trùng tên che mất.
  // (Không gỡ dấu "đã xóa" của lớp cũ nữa — gỡ ra sẽ làm lớp cũ hiện lại thành lớp trùng.)

  const newClass: ClassRoom = {
    id: `class_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: trimmedName,
    grade,
    description: description.trim(),
    studentCount: 0,
    createdAt: now,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };
  const updated = [...current, newClass];
  saveClasses(updated);

  // Nếu giáo viên có sắp lịch học (slots hoặc mô tả), lưu ngay ClassScheduleConfig và đồng bộ buổi học
  if (customSlots && customSlots.length > 0) {
    const schedConfig: ClassScheduleConfig = {
      id: `sched_${newClass.id}`,
      classId: newClass.id,
      className: newClass.name,
      sessionsPerWeek: customSlots.length,
      slots: customSlots,
      roomDefault: customSlots[0]?.room || 'Phòng A1',
      notes: `Lịch học ${newClass.name}`,
      updatedAt: now
    };
    saveClassSchedule(schedConfig);
  } else if (description.trim()) {
    const parsed = parseScheduleFromText(description);
    if (parsed && parsed.slots.length > 0) {
      const schedConfig: ClassScheduleConfig = {
        id: `sched_${newClass.id}`,
        classId: newClass.id,
        className: newClass.name,
        sessionsPerWeek: parsed.slots.length,
        slots: parsed.slots,
        roomDefault: 'Phòng A1',
        notes: `Lịch học ${newClass.name}`,
        updatedAt: now
      };
      saveClassSchedule(schedConfig);
    }
  }

  return newClass;
};

export const updateClass = (
  id: string,
  updates: Partial<ClassRoom>,
  customSlots?: WeeklyTimeSlot[]
): void => {
  const current = getClasses();
  const now = new Date().toISOString();
  const newName = updates.name ? updates.name.trim() : undefined;

  // Đổi tên lớp không đụng tới dấu "đã xóa" của lớp khác (dấu "đã xóa" chỉ áp theo mã lớp).

  const updated = current.map(c => {
    if (c.id !== id) return c;
    const stamp = timeAfter(c.teacherModifiedAt, c.updatedAt, c.createdAt);
    return {
      ...c,
      ...updates,
      name: newName || c.name,
      updatedAt: stamp,
      teacherModifiedAt: stamp,
      teacherModified: true
    };
  });
  saveClasses(updated);

  // Nếu giáo viên đổi tên lớp, đồng bộ cập nhật ngay tên lớp cho toàn bộ học sinh thuộc lớp này
  if (newName) {
    const oldTarget = current.find(c => c.id === id);
    const oldNameNorm = oldTarget ? normClassName(oldTarget.name) : '';
    const students = getStudents();
    let studentsChanged = false;
    const updatedStudents = students.map(s => {
      if (s.classId === id || (oldNameNorm && normClassName(s.className) === oldNameNorm)) {
        if (s.className !== newName) {
          studentsChanged = true;
          return {
            ...s,
            className: newName,
            updatedAt: now,
            teacherModifiedAt: now,
            teacherModified: true
          };
        }
      }
      return s;
    });
    if (studentsChanged) {
      saveStudents(updatedStudents);
    }
  }

  if (customSlots && customSlots.length > 0) {
    const targetClass = updated.find(c => c.id === id);
    const schedConfig: ClassScheduleConfig = {
      id: `sched_${id}`,
      classId: id,
      className: targetClass ? targetClass.name : '',
      sessionsPerWeek: customSlots.length,
      slots: customSlots,
      roomDefault: customSlots[0]?.room || 'Phòng A1',
      notes: `Lịch học ${targetClass?.name || ''}`,
      updatedAt: now
    };
    saveClassSchedule(schedConfig);
  } else if (updates.description) {
    const parsed = parseScheduleFromText(updates.description);
    if (parsed && parsed.slots.length > 0) {
      const targetClass = updated.find(c => c.id === id);
      const schedConfig: ClassScheduleConfig = {
        id: `sched_${id}`,
        classId: id,
        className: targetClass ? targetClass.name : '',
        sessionsPerWeek: parsed.slots.length,
        slots: parsed.slots,
        roomDefault: 'Phòng A1',
        notes: `Lịch học ${targetClass?.name || ''}`,
        updatedAt: now
      };
      saveClassSchedule(schedConfig);
    }
  }
};

export const deleteClass = (id: string, reason = 'Lớp đã xóa bởi quản trị'): void => {
  const current = getClasses();
  const target = current.find(c => c.id === id || normClassName(c.name) === normClassName(id));
  const targetId = target ? target.id : id;
  const targetName = target ? target.name : id;
  const targetNorm = normClassName(targetName);

  const removedClasses = current.filter(c => c.id === targetId || normClassName(c.name) === targetNorm);
  const updated = current.filter(c => c.id !== targetId && normClassName(c.name) !== targetNorm);

  // 1. Ghi dấu "đã xóa" cho TỪNG lớp bị gỡ (theo mã), thời điểm xóa luôn sau lần sửa cuối của lớp
  //    → lớp không bao giờ tự hiện lại, kể cả khi máy khác còn giữ bản cũ.
  const classTombs = tombMap(getDeletedClasses());
  const toRemove = removedClasses.length > 0 ? removedClasses : [{ id: targetId, name: targetName } as ClassRoom];
  toRemove.forEach(c => {
    classTombs.set(String(c.id), {
      id: c.id,
      name: c.name,
      deletedAt: timeAfter(c.teacherModifiedAt, c.updatedAt, c.createdAt),
      reason
    });
  });
  saveDeletedClasses(Array.from(classTombs.values()));

  saveClasses(updated);

  // 2. Dọn dẹp học sinh của lớp này (qua classId hoặc qua tên lớp) và lưu tombstone học sinh đã xóa
  const students = getStudents();
  const isClassStudent = (s: Student) => {
    if (s.classId === targetId || s.classId === id) return true;
    if (targetName && s.className && s.className.toLowerCase() === targetName.toLowerCase()) return true;
    if (targetNorm && s.className && normClassName(s.className) === targetNorm) return true;
    return false;
  };

  const classStudents = students.filter(isClassStudent);
  const remainingStudents = students.filter(s => !isClassStudent(s));

  if (classStudents.length > 0) {
    const deletedStudents = getDeletedStudents();
    const newDeletedStudents: DeletedStudentRecord[] = classStudents.map(s => ({
      id: s.id,
      name: s.name,
      englishName: s.englishName,
      phone: s.phone,
      classId: s.classId || targetId,
      className: s.className || targetName,
      avatar: s.avatar,
      notes: s.notes,
      password: s.password,
      deletedAt: timeAfter(s.teacherModifiedAt, s.updatedAt, s.createdAt),
      reason: `Lớp ${targetName} đã xóa bởi giáo viên`
    }));
    saveDeletedStudents([...deletedStudents, ...newDeletedStudents]);
  }
  saveStudents(remainingStudents);

  // 3. Xóa lịch học tương ứng
  deleteClassSchedule(targetId);
  deleteClassSchedule(id);
};

// ==================== STUDENT MANAGEMENT & MATCHING ====================

/**
 * Chuẩn hóa họ tên tiếng Việt: bỏ dấu, viết thường, loại bỏ khoảng trắng thừa
 */
export const normalizeStudentName = (str?: string): string => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Kiểm tra đối soát thông minh giữa học sinh trong danh sách lớp và bài nộp
 */
/** Chuẩn hóa họ tên GIỮ NGUYÊN DẤU (chỉ gộp khoảng trắng, viết thường, Unicode NFC) */
const cleanNameKeepAccents = (s?: string): string =>
  (s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Bỏ phần trong ngoặc: "Nguyễn Văn A (Alex)" → "Nguyễn Văn A" */
const stripParenthesis = (s?: string): string => (s || '').replace(/\s*\([^)]*\)/g, '').trim();

/** Chuỗi hoàn toàn không có dấu tiếng Việt (VD: học sinh tự gõ "nguyen van a") */
const hasNoVietnameseAccents = (s?: string): boolean => {
  const c = cleanNameKeepAccents(s);
  return !!c && c === normalizeStudentName(c);
};

/**
 * So khớp học sinh với bài nộp.
 *
 * Quy tắc (đã siết lại):
 * 1. Cả hai bên đều có mã học sinh (studentId) → CHỈ so mã. Hai em khác mã luôn là hai người khác nhau,
 *    kể cả khi trùng tên.
 * 2. Thiếu mã → so họ tên đầy đủ, GIỮ DẤU ("Anh" ≠ "Ánh"). Cho phép bỏ phần biệt danh trong ngoặc.
 * 3. Chỉ so không dấu khi một bên được gõ hoàn toàn không dấu.
 *
 * Bản cũ so "chứa chuỗi" với tên trong ngoặc / tên tiếng Anh, nên chỉ cần một bạn trong lớp tên dạng
 * "Trần Văn Bình (Bin)" nộp bài là các bạn khác bị báo "đã làm", và bài nộp của các em bị hệ thống bỏ qua.
 */
let knownIdsCacheKey: string | null = null;
let knownIdsCache: Set<string> = new Set();

/**
 * Mã học sinh có thuộc một hồ sơ thật (đang học hoặc đã nghỉ) hay không.
 * Mã "mồ côi" = tài khoản đã bị mất do lỗi đồng bộ cũ → bài nộp của mã đó được nhận theo họ tên + lớp.
 */
export const isKnownStudentId = (id?: string): boolean => {
  if (!id || typeof window === 'undefined') return false;
  try {
    const rawStudents = appStorage.getItem(STUDENTS_KEY) || '';
    const rawDeleted = appStorage.getItem(DELETED_STUDENTS_KEY) || '';
    const key = `${rawStudents.length}:${rawDeleted.length}:${rawStudents.slice(-64)}:${rawDeleted.slice(-64)}`;
    if (key !== knownIdsCacheKey) {
      const ids = new Set<string>();
      [rawStudents, rawDeleted].forEach(raw => {
        try {
          const list = JSON.parse(raw || '[]');
          if (Array.isArray(list)) list.forEach((s: any) => { if (s && s.id) ids.add(String(s.id)); });
        } catch {}
      });
      knownIdsCache = ids;
      knownIdsCacheKey = key;
    }
    return knownIdsCache.has(String(id));
  } catch {
    return false;
  }
};

export const isStudentMatch = (
  std: { id?: string; name: string; englishName?: string; rollNumber?: string },
  sub: { studentId?: string; studentName: string }
): boolean => {
  // 1. Trùng mã chính xác → khớp ngay lập tức
  if (sub.studentId && std.id && sub.studentId === std.id) return true;

  const stdRaw = (std.name || '').trim();
  const subRaw = (sub.studentName || '').trim();
  if (!stdRaw || !subRaw) return false;

  // 2. Họ tên đầy đủ giữ dấu
  const stdFull = cleanNameKeepAccents(stdRaw);
  const subFull = cleanNameKeepAccents(subRaw);
  if (stdFull === subFull) return true;

  // Bỏ biệt danh trong ngoặc hoặc sau gạch chéo ở cả hai bên rồi so họ tên gốc giữ dấu
  const getBase = (str: string) => cleanNameKeepAccents(str.split('/')[0].replace(/\s*\([^)]*\)/g, '').trim());
  const stdBase = getBase(stdRaw);
  const subBase = getBase(subRaw);
  if (stdBase && subBase && stdBase === subBase) return true;

  // Bài nộp ghi đúng tên tiếng Anh của học sinh (khớp nguyên văn, không so chứa chuỗi)
  if (std.englishName) {
    const en = cleanNameKeepAccents(std.englishName);
    if (en && (en === subFull || en === subBase)) return true;
  }

  // 3. So không dấu chỉ khi một bên hoàn toàn không dấu
  if (hasNoVietnameseAccents(stdBase) || hasNoVietnameseAccents(subBase)) {
    const a = normalizeStudentName(stdBase);
    const b = normalizeStudentName(subBase);
    if (a && b && a === b) return true;
  }

  return false;
};

/**
 * So lớp CHẶT cho việc xác định bài nộp của học sinh ("6A1" ≠ "6A10", "Lớp 6A1" = "6A1").
 * (isClassLooselyMatch vẫn dùng cho việc giao bài theo lớp.)
 */
export const isSameClassStrict = (classA?: string, classB?: string): boolean => {
  const a = normClassName(classA).replace(/\s+/g, '');
  const b = normClassName(classB).replace(/\s+/g, '');
  if (!a || !b) return true; // thiếu thông tin lớp thì không dùng lớp để loại trừ
  if (a === b) return true;
  try {
    const classes = getClasses();
    const ca = classes.find(c => c.id === classA || normClassName(c.name).replace(/\s+/g, '') === a);
    const cb = classes.find(c => c.id === classB || normClassName(c.name).replace(/\s+/g, '') === b);
    if (ca && cb && ca.id === cb.id) return true;
  } catch {}
  return false;
};

// ==================== DELETED STUDENTS (TOMBSTONE / NGHỈ HỌC) ====================
export const getDeletedStudents = (): DeletedStudentRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(DELETED_STUDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDeletedStudents = (records: DeletedStudentRecord[]): void => {
  if (typeof window === 'undefined') return;
  const prevRecords = getDeletedStudents();
  // Khử trùng lặp ID
  const map = new Map<string, DeletedStudentRecord>();
  records.forEach(r => {
    if (r && r.id) map.set(r.id, r);
  });
  const deduped = Array.from(map.values());
  appStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(deduped));
  invalidateStudentsCache();
  notifySync('deleted_students_updated', deduped);
  syncListWithDeletions('deleted_students', prevRecords, deduped);
};

export const isStudentDeleted = (studentId: string): boolean => {
  if (!studentId) return false;
  const deleted = getDeletedStudents();
  return deleted.some(d => d.id === studentId);
};

export const restoreDeletedStudent = (studentId: string): Student | null => {
  // Dùng chung logic khôi phục hàng loạt: khôi phục cả lớp nếu lớp cũ đã bị xóa, không tạo bản trùng
  const res = restoreDeletedStudentsBulk([studentId]);
  const restoredStudent = res.restored[0] || null;
  if (restoredStudent) notifySync('student_restored', restoredStudent);
  return restoredStudent;
};

export interface BulkRestoreResult {
  restored: Student[];
  /** Học sinh đã có sẵn trong lớp (cùng mã, hoặc cùng họ tên đầy đủ trong cùng lớp) nên không thêm trùng */
  skippedAlreadyActive: DeletedStudentRecord[];
  /** Lớp đã bị xóa được khôi phục lại để chứa học sinh */
  restoredClasses: ClassRoom[];
}

/**
 * Khôi phục hàng loạt học sinh đã nghỉ / bị xóa về đúng lớp trước khi nghỉ.
 * - Lớp cũ còn tồn tại (theo mã hoặc theo tên) → đưa học sinh về lớp đó.
 * - Lớp cũ đã bị xóa → khôi phục lại lớp (cùng mã, cùng tên) rồi đưa học sinh về.
 * - Học sinh đang có trong lớp (cùng mã, hoặc cùng họ tên đầy đủ trong cùng lớp) → bỏ qua, không tạo bản trùng.
 * Toàn bộ thay đổi được lưu một lần (không phải 398 lần ghi riêng lẻ).
 */
export const restoreDeletedStudentsBulk = (studentIds: string[]): BulkRestoreResult => {
  const result: BulkRestoreResult = { restored: [], skippedAlreadyActive: [], restoredClasses: [] };
  if (typeof window === 'undefined' || !studentIds || studentIds.length === 0) return result;

  const idSet = new Set(studentIds);
  const deletedList = getDeletedStudents();
  const targets = deletedList.filter(d => idSet.has(d.id));
  if (targets.length === 0) return result;

  const compactClass = (s?: string) => normClassName(s).replace(/\s+/g, '');

  // 1. Xác định lớp đích cho từng học sinh, khôi phục lớp nếu lớp đã bị xóa
  let classes = [...getClasses()];
  let deletedClasses = [...getDeletedClasses()];
  let classesChanged = false;

  // Thời điểm khôi phục luôn SAU mọi lần xóa liên quan → không bị dấu "đã xóa" cũ che lại (kể cả khi lệch đồng hồ)
  const now = timeAfter(...targets.map(t => t.deletedAt), ...deletedClasses.map(d => d.deletedAt));

  const resolveClass = (classId?: string, className?: string): ClassRoom | undefined => {
    const byId = classId ? classes.find(c => c.id === classId) : undefined;
    if (byId) return byId;
    const norm = compactClass(className);
    const byName = norm ? classes.find(c => compactClass(c.name) === norm) : undefined;
    if (byName) return byName;
    if (!classId && !norm) return undefined;

    // Lớp không còn → khôi phục từ danh sách lớp đã xóa (hoặc tạo lại theo mã + tên cũ)
    const tomb = deletedClasses.find(d => (classId && d.id === classId) || (norm && compactClass(d.name) === norm));
    const name = (tomb?.name || className || '').trim();
    if (!name) return undefined;
    const gradeMatch = name.match(/\d+/);
    const revived: ClassRoom = {
      id: tomb?.id || classId || `class_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      grade: gradeMatch ? Number(gradeMatch[0]) : 0,
      description: '',
      studentCount: 0,
      createdAt: now,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    };
    // Chỉ gỡ dấu "đã xóa" của đúng lớp này (theo mã) — lớp khác trùng tên vẫn giữ nguyên trạng thái
    deletedClasses = deletedClasses.filter(d => d.id !== revived.id);
    classes = [...classes, revived];
    classesChanged = true;
    result.restoredClasses.push(revived);
    return revived;
  };

  const targetClassById = new Map<string, ClassRoom | undefined>();
  targets.forEach(t => targetClassById.set(t.id, resolveClass(t.classId, t.className)));

  if (classesChanged) {
    // Bỏ tombstone lớp TRƯỚC khi lưu lớp (saveClasses lọc bỏ lớp còn nằm trong danh sách đã xóa)
    saveDeletedClasses(deletedClasses);
    saveClasses(classes);
  }

  // 2. Dựng lại học sinh, bỏ qua em đang có mặt trong lớp
  const current = getStudents();
  const activeIds = new Set(current.map(s => s.id));
  const activeNameClass = new Set(
    current.map(s => `${cleanNameKeepAccents(s.name)}::${s.classId}`)
  );

  const removeFromTombstone = new Set<string>();
  targets.forEach(t => {
    const cls = targetClassById.get(t.id);
    const classId = cls?.id || t.classId;
    const className = cls?.name || t.className;

    if (activeIds.has(t.id)) {
      // Đã có trong lớp với đúng mã → chỉ cần xóa khỏi danh sách "đã nghỉ"
      removeFromTombstone.add(t.id);
      result.skippedAlreadyActive.push(t);
      return;
    }
    const key = `${cleanNameKeepAccents(t.name)}::${classId}`;
    if (activeNameClass.has(key)) {
      result.skippedAlreadyActive.push(t);
      return;
    }

    const restored: Student = {
      id: t.id,
      name: t.name,
      englishName: t.englishName || '',
      phone: t.phone || '',
      classId,
      className,
      avatar: t.avatar || '🎒',
      notes: t.notes || '',
      password: t.password || '123',
      createdAt: t.deletedAt || now,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    };
    result.restored.push(restored);
    activeIds.add(t.id);
    activeNameClass.add(key);
    removeFromTombstone.add(t.id);
  });

  // 3. Lưu một lần: bỏ khỏi danh sách "đã nghỉ" rồi thêm lại vào lớp
  if (removeFromTombstone.size > 0) {
    saveDeletedStudents(deletedList.filter(d => !removeFromTombstone.has(d.id)));
    // Xóa hẳn trên cloud kể cả khi danh sách "đã nghỉ" còn lưu dạng mảng cũ
    deleteItemsFromFirebaseCollection('deleted_students', Array.from(removeFromTombstone)).catch(() => {});
  }
  if (result.restored.length > 0) {
    saveStudents([...current, ...result.restored]);
  }
  notifySync('students_bulk_restored', { count: result.restored.length });
  return result;
};

// 5 tài khoản học sinh lớp 9A2 bị gán trùng nhầm vào lớp 9A1 trong dữ liệu cũ
const GHOST_9A1_STUDENT_IDS = new Set([
  'std_1789125986635_10_sy1l',
  'std_1789125986635_12_lmyo',
  'std_1789125986635_13_ghav',
  'std_1789125986635_18_evf7',
  'std_1789125986635_11_5q4b'
]);

/**
 * Tự động khử trùng lặp thông minh học sinh trong cùng một lớp:
 * - Nếu 2 bản ghi có cùng họ tên gốc tiếng Việt:
 *   + Nếu 2 em có 2 tên tiếng Anh KHÁC NHAU (VD: Anna vs Sammie) → Giữ cả 2 (học sinh trùng tên trong cùng lớp).
 *   + Nếu 1 bản ghi có tên tiếng Anh còn bản ghi kia không có, hoặc 2 bản ghi cùng tên tiếng Anh → Gộp thành 1 em duy nhất.
 */
export const deduplicateClassStudents = (list: Student[]): Student[] => {
  if (!Array.isArray(list) || list.length <= 1) return list || [];

  const getBaseName = (name?: string): string => {
    if (!name) return '';
    const s = name.split('/')[0].replace(/\s*\([^)]*\)/g, '').trim();
    return cleanNameKeepAccents(s);
  };

  const toMs = (v: any): number => {
    const t = new Date(v || 0).getTime();
    return isNaN(t) ? 0 : t;
  };

  const byBaseName = new Map<string, Student[]>();
  list.forEach(s => {
    if (!s || !s.id) return;
    const base = getBaseName(s.name);
    const grp = byBaseName.get(base) || [];
    grp.push(s);
    byBaseName.set(base, grp);
  });

  const result: Student[] = [];
  byBaseName.forEach(group => {
    if (group.length === 1) {
      result.push(group[0]);
      return;
    }

    // Kiểm tra tên tiếng Anh riêng biệt:
    const distinctEn = new Set(
      group
        .map(s => (s.englishName || '').trim().toLowerCase())
        .filter(en => en.length > 0)
    );

    if (distinctEn.size > 1 && distinctEn.size === group.length) {
      // Mỗi bạn có 1 tên tiếng Anh riêng biệt thực sự → Giữ cả hai
      result.push(...group);
      return;
    }

    // Trùng lặp tài khoản! Ưu tiên bản ghi có tên tiếng Anh và thời gian sửa mới nhất
    const sorted = [...group].sort((a, b) => {
      const aEn = (a.englishName || '').trim().length > 0 ? 1 : 0;
      const bEn = (b.englishName || '').trim().length > 0 ? 1 : 0;
      if (aEn !== bEn) return bEn - aEn;
      const aTime = Math.max(toMs(a.teacherModifiedAt), toMs(a.updatedAt), toMs(a.createdAt));
      const bTime = Math.max(toMs(b.teacherModifiedAt), toMs(b.updatedAt), toMs(b.createdAt));
      return bTime - aTime;
    });

    const best = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];
      if (!best.phone && other.phone) best.phone = other.phone;
      if (!best.notes && other.notes) best.notes = other.notes;
      if ((!best.password || best.password === '123') && other.password && other.password !== '123') {
        best.password = other.password;
      }
    }
    result.push(best);
  });

  return result;
};

export const getStudents = (classIdOrName?: string): Student[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(STUDENTS_KEY);
    const rawDeleted = appStorage.getItem(DELETED_STUDENTS_KEY);

    if (raw !== cachedStudentsRaw || rawDeleted !== cachedDeletedStudentsRaw || cachedStudentsClean === null) {
      let all: Student[] = [];
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        all = Array.isArray(parsed) ? parsed : [];
      }

      // Dấu "đã xóa" của học sinh / lớp (đối soát theo MÃ)
      const studentTombs = tombMap(getDeletedStudents());
      const classTombs = tombMap(getDeletedClasses());

      // Khử trùng lặp ID, loại bỏ học sinh mẫu và ID rác 9A1
      const seenIds = new Set<string>();
      const deduped: Student[] = [];
      for (const s of all) {
        if (!s || !s.id) continue;
        if (MOCK_STUDENT_IDS.has(s.id) || MOCK_CLASS_IDS.has(s.classId) || isPallasItem(s) || GHOST_9A1_STUDENT_IDS.has(s.id)) continue;

        // ⭐️ NGUYÊN TẮC: thao tác SAU CÙNG của giáo viên quyết định.
        // Xóa sau lần sửa cuối → ẩn; thêm lại / khôi phục sau lần xóa → hiện.
        if (isHiddenByTombstone(s, studentTombs.get(String(s.id)))) continue;
        if (s.classId && isHiddenByTombstone(s, classTombs.get(String(s.classId)))) continue;

        if (!seenIds.has(s.id)) {
          seenIds.add(s.id);
          deduped.push({
            ...s,
            password: (s.password && s.password.trim().length > 0) ? s.password.trim() : '123'
          });
        }
      }

      // Tự động khử trùng lặp từng lớp
      const byClassMap = new Map<string, Student[]>();
      deduped.forEach(s => {
        const cKey = s.classId || s.className || 'unknown';
        const grp = byClassMap.get(cKey) || [];
        grp.push(s);
        byClassMap.set(cKey, grp);
      });
      const finalClean: Student[] = [];
      byClassMap.forEach(grp => {
        finalClean.push(...deduplicateClassStudents(grp));
      });

      cachedStudentsRaw = raw;
      cachedDeletedStudentsRaw = rawDeleted;
      cachedStudentsClean = finalClean;
      cachedStudentsByClass.clear();
    }

    if (classIdOrName && classIdOrName !== 'ALL') {
      let classStudents = cachedStudentsByClass.get(classIdOrName);
      if (!classStudents) {
        const targetNorm = normClassName(classIdOrName);
        const classes = getClasses();
        const matchedClass = classes.find(c => c.id === classIdOrName || normClassName(c.name) === targetNorm);
        const targetId = matchedClass ? matchedClass.id : classIdOrName;
        const targetNameNorm = matchedClass ? normClassName(matchedClass.name) : targetNorm;

        const rawMatches = cachedStudentsClean.filter(s =>
          s.classId === targetId ||
          s.classId === classIdOrName ||
          (s.className && normClassName(s.className) === targetNameNorm)
        );
        classStudents = deduplicateClassStudents(rawMatches);
        cachedStudentsByClass.set(classIdOrName, classStudents);
      }
      return classStudents;
    }
    return cachedStudentsClean;
  } catch {
    return [];
  }
};

export const saveStudents = (students: Student[]): void => {
  if (typeof window === 'undefined') return;
  const studentTombs = tombMap(getDeletedStudents());
  const classTombs = tombMap(getDeletedClasses());

  const validStudents = students.filter(s => {
    if (!s || !s.id || MOCK_STUDENT_IDS.has(s.id) || MOCK_CLASS_IDS.has(s.classId) || isPallasItem(s)) return false;
    // ⭐️ Thao tác sau cùng của giáo viên quyết định (xem isHiddenByTombstone)
    if (isHiddenByTombstone(s, studentTombs.get(String(s.id)))) return false;
    if (s.classId && isHiddenByTombstone(s, classTombs.get(String(s.classId)))) return false;
    return true;
  });

  const serialized = JSON.stringify(validStudents);
  appStorage.setItem(STUDENTS_KEY, serialized);
  invalidateStudentsCache();
  cachedStudentsRaw = serialized;
  cachedStudentsClean = validStudents;
  cachedStudentsByClass.clear();

  notifySync('students_updated', validStudents);
  syncToFirebaseIfConfigured('students', validStudents);

  // Update studentCount in classes
  const classes = getClasses();
  const updatedClasses = classes.map(c => {
    const count = validStudents.filter(s => s.classId === c.id || (s.className && normClassName(s.className) === normClassName(c.name))).length;
    return { ...c, studentCount: count };
  });
  saveClasses(updatedClasses);
};

const RANDOM_AVATARS = ['🌸', '🚀', '⭐', '⚡', '🦄', '🦁', '🌻', '🎯', '🐱', '⚽', '🎨', '🎸', '🌺', '🏹', '🍀', '👑', '💎', '🌈', '🐬', '☀️'];

/**
 * Thêm học sinh mới trùng tên với em đã xóa: em mới có MÃ MỚI nên luôn hiện, không cần gỡ dấu "đã xóa".
 * (Bản cũ gỡ dấu "đã xóa" theo tên → hồ sơ cũ của em đã xóa hiện lại thành bản trùng.)
 */
const unTombstoneStudent = (_name: string, _classId: string, _className?: string) => {};

export const addStudent = (
  name: string,
  classId: string,
  className: string,
  englishName = '',
  phone = '',
  notes = '',
  password = '123'
): Student => {
  unTombstoneStudent(name, classId, className);
  const current = getStudents();
  const avatar = RANDOM_AVATARS[Math.floor(Math.random() * RANDOM_AVATARS.length)];
  const rollNumber = String(current.filter(s => s.classId === classId).length + 1).padStart(2, '0');
  const now = new Date().toISOString();
  const newStudent: Student = {
    id: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    englishName: englishName.trim(),
    phone: phone.trim(),
    classId,
    className,
    avatar,
    rollNumber,
    notes: notes.trim(),
    password: password.trim() || '123',
    createdAt: now,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };
  saveStudents([...current, newStudent]);
  return newStudent;
};

export const batchAddStudents = (names: string[], classId: string, className: string): Student[] => {
  names.forEach(n => unTombstoneStudent(n, classId, className));
  const current = getStudents();
  const existingCount = current.filter(s => s.classId === classId).length;
  const now = new Date().toISOString();
  const newStudents: Student[] = names
    .map(n => n.trim())
    .filter(n => n.length > 0)
    .map((name, idx) => ({
      id: `std_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      englishName: '',
      classId,
      className,
      avatar: RANDOM_AVATARS[(existingCount + idx) % RANDOM_AVATARS.length],
      rollNumber: String(existingCount + idx + 1).padStart(2, '0'),
      password: '123',
      createdAt: now,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    }));

  saveStudents([...current, ...newStudents]);
  return newStudents;
};

export const batchAddStudentsWithDetails = (
  items: Array<{ name: string; englishName?: string; phone?: string; notes?: string; password?: string }>,
  classId: string,
  className: string
): Student[] => {
  items.forEach(it => unTombstoneStudent(it.name, classId, className));
  const current = getStudents();
  const existingCount = current.filter(s => s.classId === classId).length;
  const now = new Date().toISOString();
  const newStudents: Student[] = items
    .map(it => ({
      name: it.name.trim(),
      englishName: (it.englishName || '').trim(),
      phone: (it.phone || '').trim(),
      notes: (it.notes || '').trim(),
      password: (it.password || '123').trim() || '123'
    }))
    .filter(it => it.name.length > 0)
    .map((item, idx) => ({
      id: `std_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      name: item.name,
      englishName: item.englishName,
      phone: item.phone,
      classId,
      className,
      avatar: RANDOM_AVATARS[(existingCount + idx) % RANDOM_AVATARS.length],
      rollNumber: String(existingCount + idx + 1).padStart(2, '0'),
      notes: item.notes,
      password: item.password,
      createdAt: now,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    }));

  saveStudents([...current, ...newStudents]);
  return newStudents;
};

export const updateStudent = (id: string, updates: Partial<Student>): void => {
  const current = getStudents();
  const now = new Date().toISOString();
  const classes = getClasses();

  if (updates.name) {
    const targetStudent = current.find(s => s.id === id);
    if (targetStudent) {
      unTombstoneStudent(updates.name, updates.classId || targetStudent.classId, updates.className || targetStudent.className);
    }
  }

  const updated = current.map(s => {
    if (s.id !== id) return s;

    let targetClassName = updates.className || s.className;
    if (updates.classId && updates.classId !== s.classId) {
      const foundClass = classes.find(c => c.id === updates.classId);
      if (foundClass) {
        targetClassName = foundClass.name;
      }
    }

    const stamp = timeAfter(s.teacherModifiedAt, s.updatedAt, s.createdAt);
    return {
      ...s,
      ...updates,
      className: targetClassName,
      updatedAt: stamp,
      teacherModifiedAt: stamp,
      teacherModified: true
    };
  });

  saveStudents(updated);
  notifySync('student_updated', { id, updates, timestamp: now });
};

/**
 * Giáo viên đổi mật khẩu hoặc cấp lại mật khẩu cho học sinh
 */
export const resetStudentPassword = (studentId: string, newPassword = '123'): boolean => {
  const current = getStudents();
  const target = current.find(s => s.id === studentId);
  if (!target) return false;

  updateStudent(studentId, {
    password: (newPassword || '123').trim()
  });
  return true;
};

/**
 * Giáo viên đặt lại toàn bộ mật khẩu của cả lớp về 123 (hoặc mật khẩu chỉ định)
 */
export const batchResetClassPasswords = (classId: string, newPassword = '123'): number => {
  const current = getStudents();
  const now = new Date().toISOString();
  let count = 0;
  const updated = current.map(s => {
    if (s.classId === classId) {
      count++;
      return {
        ...s,
        password: (newPassword || '123').trim(),
        updatedAt: now,
        teacherModifiedAt: now,
        teacherModified: true
      };
    }
    return s;
  });

  if (count > 0) {
    saveStudents(updated);
    notifySync('class_passwords_reset', { classId, count, timestamp: now });
  }
  return count;
};

export const deleteStudent = (id: string, reason = 'Học sinh nghỉ học / chuyển trường'): void => {
  const current = getStudents();
  let target = current.find(s => s.id === id);
  if (!target) {
    // Gọi bằng tên: chỉ nhận khi khớp đúng MỘT em (họ tên đầy đủ, giữ dấu) để không xóa nhầm
    const byName = current.filter(s => cleanNameKeepAccents(s.name) === cleanNameKeepAccents(id));
    if (byName.length === 1) target = byName[0];
  }

  const stdId = target ? target.id : id;
  const stdName = target ? target.name : id;
  const stdClassId = target ? target.classId : '';
  const stdClassName = target ? target.className : '';
  // Thời điểm xóa luôn sau lần sửa cuối của hồ sơ → em đã xóa không bao giờ tự hiện lại
  const now = timeAfter(target?.teacherModifiedAt, target?.updatedAt, target?.createdAt);

  // 1. Lưu dấu "đã xóa" theo MÃ học sinh để đám mây và đồng bộ không bao giờ nạp lại
  const deletedRecord: DeletedStudentRecord = {
    id: stdId,
    name: stdName,
    englishName: target?.englishName,
    phone: target?.phone,
    classId: stdClassId,
    className: stdClassName,
    avatar: target?.avatar,
    notes: target?.notes,
    password: target?.password,
    deletedAt: now,
    reason
  };

  // Luôn ghi (hoặc cập nhật) dấu "đã xóa" cho đúng MÃ này. Bản cũ bỏ qua nếu đã có một em
  // cùng tên từng bị xóa → em vừa xóa không được đánh dấu và hiện lại sau khi đồng bộ.
  const deletedList = getDeletedStudents().filter(d => d.id !== stdId);
  saveDeletedStudents([...deletedList, deletedRecord]);

  // 2. Chỉ gỡ đúng học sinh này (theo mã).
  const remaining = current.filter(s => s.id !== stdId);

  saveStudents(remaining);
  deleteItemsFromFirebaseCollection('students', [stdId]).catch(() => {});
  notifySync('student_deleted', { id: stdId, name: stdName, timestamp: Date.now() });
};

const DEFAULT_SAMPLE_LESSON: LessonPlan = {
  topic: "Unit 1: My New School",
  vocabulary: [
    { word: "school bag", emoji: "🎒", ipa: "/ˈskuːl bæɡ/", meaning: "cặp sách", example: "I have a new school bag.", sentenceMeaning: "tôi có một chiếc cặp sách mới.", type: "noun" },
    { word: "calculator", emoji: "🔢", ipa: "/ˈkælkjuleɪtə/", meaning: "máy tính cầm tay", example: "She uses a calculator in maths.", sentenceMeaning: "cô ấy dùng máy tính trong giờ toán.", type: "noun" },
    { word: "pencil sharpener", emoji: "✏️", ipa: "/ˈpensl ʃɑːpnə/", meaning: "gọt bút chì", example: "This is my pencil sharpener.", sentenceMeaning: "đây là chiếc gọt bút chì của tôi.", type: "noun" },
    { word: "compass", emoji: "🧭", ipa: "/ˈkʌmpəs/", meaning: "com-pa", example: "We draw circles with a compass.", sentenceMeaning: "chúng tôi vẽ hình tròn bằng com-pa.", type: "noun" },
    { word: "uniform", emoji: "👔", ipa: "/ˈjuːnɪfɔːm/", meaning: "đồng phục", example: "Students wear uniform on Mondays.", sentenceMeaning: "học sinh mặc đồng phục vào thứ hai.", type: "noun" },
    { word: "classmate", emoji: "🤝", ipa: "/ˈklɑːsmeɪt/", meaning: "bạn cùng lớp", example: "Nam is my favourite classmate.", sentenceMeaning: "nam là bạn cùng lớp yêu thích của tôi.", type: "noun" },
  ],
  grammar: {
    topic: "The Present Simple Tense (Thì hiện tại đơn)",
    explanation: "Thì hiện tại đơn diễn tả hành động lặp đi lặp lại hoặc sự thật hiển nhiên. Với ngôi He/She/It, động từ thêm 's' hoặc 'es'.",
    examples: [
      "I go to school every morning. → Tôi đi học mỗi buổi sáng.",
      "She wears her uniform on Monday. → Cô ấy mặc đồng phục vào thứ Hai.",
      "They play football in the playground. → Họ chơi bóng đá ở sân trường."
    ]
  },
  reading: {
    title: "Lan's New School",
    passage: "Hello! My name is Lan. I am eleven years old. Today is my first day at my new school. The school is big and beautiful. I wear my new uniform and carry my school bag. I have many new classmates. We are very excited!",
    translation: "Xin chào! Mình tên là Lan. Mình 11 tuổi. Hôm nay là ngày đầu tiên ở trường mới của mình. Ngôi trường to và rất đẹp. Mình mặc đồng phục mới và mang cặp sách. Mình có nhiều bạn cùng lớp mới. Chúng mình rất hào hứng!",
    comprehension: [
      { id: "comp_1", question: "How old is Lan?", options: ["Ten", "Eleven", "Twelve", "Nine"], correctAnswer: 1, explanation: "Trong bài: 'I am eleven years old.' (Lan 11 tuổi)" },
      { id: "comp_2", question: "How is Lan's new school?", options: ["Small and old", "Big and beautiful", "Noisy", "Crowded"], correctAnswer: 1, explanation: "Trong bài: 'The school is big and beautiful.'" },
      { id: "comp_3", question: "What does Lan wear today?", options: ["A dress", "Her new uniform", "Jeans", "A jacket"], correctAnswer: 1, explanation: "Trong bài: 'I wear my new uniform.'" },
      { id: "comp_4", question: "What does Lan carry?", options: ["A book", "Her school bag", "A lunch box", "A bottle"], correctAnswer: 1, explanation: "Trong bài: 'and carry my school bag.'" },
      { id: "comp_5", question: "How do the students feel?", options: ["Tired", "Sad", "Very excited", "Bored"], correctAnswer: 2, explanation: "Trong bài: 'We are very excited!'" }
    ]
  },
  homework: {
    title: "Ôn tập Unit 1",
    description: "Học thuộc 6 từ vựng và làm đầy đủ bài tập MegaChallenge",
    instructions: "Làm bài trực tuyến trên app Legend X5"
  },
  teacherTips: "Khuyến khích các em nghe phát âm chuẩn bằng cách bấm vào biểu tượng loa cạnh từng từ vựng.",
  practice: {
    listening: [
      { id: "lis_1", audioText: "I have a new school bag.", options: ["I have a new school bag.", "I have an old school bag.", "She has a new school bag.", "I have a big school bag."], correctAnswer: 0, explanation: "Câu đọc: 'I have a new school bag.'" },
      { id: "lis_2", audioText: "Students wear uniform on Mondays.", options: ["Students wear uniform on Sundays.", "Students wear uniform on Mondays.", "Students buy uniform on Mondays.", "Teachers wear uniform on Mondays."], correctAnswer: 1, explanation: "Câu đọc: 'Students wear uniform on Mondays.'" },
      { id: "lis_3", audioText: "Nam is my favourite classmate.", options: ["Nam is my favourite classmate.", "Lan is my favourite classmate.", "Nam is my friendly classmate.", "Nam is my new teacher."], correctAnswer: 0, explanation: "Câu đọc: 'Nam is my favourite classmate.'" },
      { id: "lis_4", audioText: "We draw circles with a compass.", options: ["We draw squares with a ruler.", "We draw circles with a pencil.", "We draw circles with a compass.", "We draw flowers with a brush."], correctAnswer: 2, explanation: "Câu đọc: 'We draw circles with a compass.'" },
      { id: "lis_5", audioText: "She uses a calculator in maths.", options: ["She uses a calculator in maths.", "He uses a calculator in physics.", "She loses a calculator in class.", "She needs a computer in maths."], correctAnswer: 0, explanation: "Câu đọc: 'She uses a calculator in maths.'" }
    ],
    megaTest: {
      multipleChoice: [
        { id: "mc_1", question: "I put my books in my ____.", options: ["school bag", "calculator", "compass", "uniform"], correctAnswer: 0, explanation: "school bag = cặp sách (đựng sách)" },
        { id: "mc_2", question: "She ____ to school every morning.", options: ["go", "goes", "going", "went"], correctAnswer: 1, explanation: "Chủ ngữ ngôi 3 số ít 'She' chia động từ thêm 'es' (goes)" },
        { id: "mc_3", question: "Students wear ____ to school every Monday.", options: ["uniform", "compass", "sharpener", "calculator"], correctAnswer: 0, explanation: "uniform = đồng phục" },
        { id: "mc_4", question: "We use a ____ to draw circles.", options: ["compass", "bag", "pencil", "book"], correctAnswer: 0, explanation: "compass = com-pa dùng để vẽ đường tròn" },
        { id: "mc_5", question: "Nam is my ____. We are in the same class.", options: ["classmate", "brother", "teacher", "parent"], correctAnswer: 0, explanation: "classmate = bạn cùng lớp" },
        { id: "mc_6", question: "She uses a ____ to do difficult math calculations.", options: ["calculator", "compass", "bag", "ruler"], correctAnswer: 0, explanation: "calculator = máy tính bỏ túi" },
        { id: "mc_7", question: "My pencil is broken. I need a pencil ____.", options: ["sharpener", "case", "bag", "box"], correctAnswer: 0, explanation: "pencil sharpener = gọt bút chì" },
        { id: "mc_8", question: "They ____ football after school.", options: ["plays", "play", "playing", "played"], correctAnswer: 1, explanation: "Chủ ngữ 'They' số nhiều nên động từ 'play' giữ nguyên mẫu" },
        { id: "mc_9", question: "Is your new school ____ and beautiful?", options: ["big", "bigness", "bigly", "bigger"], correctAnswer: 0, explanation: "Dùng tính từ 'big' sau động từ to be" },
        { id: "mc_10", question: "We are very ____ on the first day of school.", options: ["excited", "exciting", "excite", "excitement"], correctAnswer: 0, explanation: "excited (tính từ chỉ cảm xúc hào hứng của con người)" }
      ],
      scramble: [
        { id: "sc_1", scrambled: ["new", "a", "have", "I", "school", "bag."], correctSentence: "I have a new school bag.", translation: "Tôi có một chiếc cặp sách mới." },
        { id: "sc_2", scrambled: ["wears", "She", "uniform.", "her"], correctSentence: "She wears her uniform.", translation: "Cô ấy mặc đồng phục của mình." },
        { id: "sc_3", scrambled: ["is", "Nam", "classmate.", "my"], correctSentence: "Nam is my classmate.", translation: "Nam là bạn cùng lớp của tôi." },
        { id: "sc_4", scrambled: ["draw", "We", "a", "circles", "with", "compass."], correctSentence: "We draw circles with a compass.", translation: "Chúng tôi vẽ hình tròn bằng com-pa." },
        { id: "sc_5", scrambled: ["beautiful.", "new", "My", "is", "school"], correctSentence: "My new school is beautiful.", translation: "Ngôi trường mới của tôi rất đẹp." },
        { id: "sc_6", scrambled: ["pencil", "need", "I", "sharpener.", "a"], correctSentence: "I need a pencil sharpener.", translation: "Tôi cần một cái gọt bút chì." },
        { id: "sc_7", scrambled: ["uses", "He", "a", "calculator.", "maths"], correctSentence: "He uses a maths calculator.", translation: "Cậu ấy dùng một máy tính toán." },
        { id: "sc_8", scrambled: ["play", "They", "the", "in", "playground."], correctSentence: "They play in the playground.", translation: "Họ chơi ở sân trường." },
        { id: "sc_9", scrambled: ["love", "my", "I", "school.", "new"], correctSentence: "I love my new school.", translation: "Tôi yêu trường mới của mình." },
        { id: "sc_10", scrambled: ["excited", "Students", "are", "very."], correctSentence: "Students are very excited.", translation: "Học sinh rất hào hứng." }
      ],
      readingMCPassage: "Lan is eleven years old. Today is her first day at her new secondary school. The school is big and beautiful with twenty classrooms and a large playground. Lan wears her crisp new uniform and carries a heavy school bag. She meets her new classmate, Nam, who helps her find the maths room. They both love English and maths very much.",
      readingMC: [
        { id: "rmc_1", question: "How old is Lan?", options: ["Ten years old", "Eleven years old", "Twelve years old", "Seven years old"], correctAnswer: 1, explanation: "Trong bài: 'Lan is eleven years old.'" },
        { id: "rmc_2", question: "What is Lan's new school like?", options: ["Small and old", "Big and beautiful", "Noisy and crowded", "Quiet and dark"], correctAnswer: 1, explanation: "Trong bài: 'The school is big and beautiful with twenty classrooms...'" },
        { id: "rmc_3", question: "What does Lan wear on her first day?", options: ["Casual clothes", "Sportswear", "A new uniform", "A raincoat"], correctAnswer: 2, explanation: "Trong bài: 'Lan wears her crisp new uniform...'" },
        { id: "rmc_4", question: "Who helps Lan find the maths room?", options: ["Her teacher", "Her brother", "Nam, her new classmate", "Her mother"], correctAnswer: 2, explanation: "Trong bài: 'She meets her new classmate, Nam, who helps her find the maths room.'" },
        { id: "rmc_5", question: "Which subjects do Lan and Nam both love?", options: ["History and art", "Music and physical education", "English and maths", "Science and geography"], correctAnswer: 2, explanation: "Trong bài: 'They both love English and maths very much.'" }
      ],
      pronunciation: [
        { id: "pron_1", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm nguyên âm 'a'", underlinedPart: "a", options: ["bag", "cat", "classmate", "hat"], displayOptions: ["b<u>a</u>g", "c<u>a</u>t", "cl<u>a</u>ssmate", "h<u>a</u>t"], correctAnswer: 2, explanation: "A. bag /bæɡ/ | B. cat /kæt/ | C. classmate /ˈklɑːsmeɪt/ | D. hat /hæt/ → 'classmate' phát âm là /ɑː/, còn lại phát âm là /æ/." },
        { id: "pron_2", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Đuôi '-s/-es'", underlinedPart: "s", options: ["books", "desks", "rulers", "caps"], displayOptions: ["book<u>s</u>", "desk<u>s</u>", "ruler<u>s</u>", "cap<u>s</u>"], correctAnswer: 2, explanation: "A. books /bʊks/ | B. desks /desks/ | C. rulers /ˈruːləz/ | D. caps /kæps/ → 'rulers' phát âm đuôi là /z/, các từ còn lại có đuôi vô thanh phát âm là /s/." },
        { id: "pron_3", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm 'ch'", underlinedPart: "ch", options: ["teacher", "school", "chair", "children"], displayOptions: ["tea<u>ch</u>er", "s<u>ch</u>ool", "<u>ch</u>air", "<u>ch</u>ildren"], correctAnswer: 1, explanation: "A. teacher /ˈtiːtʃə/ | B. school /skuːl/ | C. chair /tʃeə/ | D. children /ˈtʃɪldrən/ → 'school' phát âm 'ch' là /k/, các từ còn lại phát âm là /tʃ/." },
        { id: "pron_4", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm nguyên âm 'u'", underlinedPart: "u", options: ["uniform", "calculator", "ruler", "rubber"], displayOptions: ["<u>u</u>niform", "calc<u>u</u>lator", "r<u>u</u>ler", "r<u>u</u>bber"], correctAnswer: 3, explanation: "A. uniform /ˈjuːnɪfɔːm/ | B. calculator /ˈkælkjuleɪtə/ | C. ruler /ˈruːlə/ | D. rubber /ˈrʌbə/ → 'rubber' phát âm là /ʌ/, các từ còn lại phát âm là /juː/ hoặc /uː/." },
        { id: "pron_5", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm nguyên âm 'i'", underlinedPart: "i", options: ["big", "circle", "excited", "compass"], displayOptions: ["b<u>i</u>g", "c<u>i</u>rcle", "exc<u>i</u>ted", "compass"], correctAnswer: 2, explanation: "A. big /bɪɡ/ | B. circle /ˈsɜːkl/ | C. excited /ɪkˈsaɪtɪd/ | D. compass (từ kiểm tra) → Chữ 'i' trong 'excited' phát âm là /aɪ/, trong 'big' phát âm là /ɪ/." }
      ],
      vocabTranslation: [
        { id: "vt_1", word: "school bag", options: ["cặp sách", "bút chì", "thước kẻ", "com-pa"], correctAnswer: 0 },
        { id: "vt_2", word: "uniform", options: ["áo khoác", "quần bò", "đồng phục", "giày thể thao"], correctAnswer: 2 },
        { id: "vt_3", word: "calculator", options: ["máy vi tính", "máy tính cầm tay", "đồng hồ", "điện thoại"], correctAnswer: 1 },
        { id: "vt_4", word: "compass", options: ["thước kẻ", "com-pa", "hộp bút", "tẩy"], correctAnswer: 1 },
        { id: "vt_5", word: "pencil sharpener", options: ["gọt bút chì", "bút dạ", "bút máy", "kéo"], correctAnswer: 0 },
        { id: "vt_6", word: "classmate", options: ["thầy giáo", "bạn cùng lớp", "anh em", "hàng xóm"], correctAnswer: 1 },
        { id: "vt_7", word: "excited", options: ["buồn bã", "mệt mỏi", "hào hứng, phấn khởi", "lo lắng"], correctAnswer: 2 },
        { id: "vt_8", word: "playground", options: ["phòng học", "sân chơi, sân trường", "thư viện", "căng tin"], correctAnswer: 1 },
        { id: "vt_9", word: "beautiful", options: ["xinh đẹp, đẹp đẽ", "xấu xí", "to lớn", "nhỏ nhắn"], correctAnswer: 0 },
        { id: "vt_10", word: "subject", options: ["môn học", "trường học", "bài thi", "điểm số"], correctAnswer: 0 }
      ],
      trueFalsePassage: "Lan is eleven years old. Today is her first day at her new school. The school is big and beautiful. She wears her new uniform and carries a new school bag. Lan has many friendly classmates. She loves her new school very much.",
      trueFalse: [
        { id: "tf_1", statement: "Lan is twelve years old.", isTrue: false, explanation: "Trong đoạn văn: 'Lan is eleven years old.' (Lan 11 tuổi, không phải 12)" },
        { id: "tf_2", statement: "Today is Lan's first day at her new school.", isTrue: true, explanation: "Trong đoạn văn: 'Today is her first day at her new school.'" },
        { id: "tf_3", statement: "Her new school is small and old.", isTrue: false, explanation: "Trong đoạn văn: 'The school is big and beautiful.'" },
        { id: "tf_4", statement: "Lan wears her new uniform.", isTrue: true, explanation: "Trong đoạn văn: 'She wears her new uniform.'" },
        { id: "tf_5", statement: "Lan hates her new school.", isTrue: false, explanation: "Trong đoạn văn: 'She loves her new school very much.'" },
        { id: "tf_6", statement: "Lan carries a new school bag to school.", isTrue: true, explanation: "Trong đoạn văn: 'carries a new school bag.'" },
        { id: "tf_7", statement: "Lan has many friendly classmates.", isTrue: true, explanation: "Trong đoạn văn: 'Lan has many friendly classmates.'" },
        { id: "tf_8", statement: "Students wear uniform only on Sundays.", isTrue: false, explanation: "Học sinh mặc đồng phục vào các ngày đi học trong tuần." },
        { id: "tf_9", statement: "Nam is in the same class with Lan.", isTrue: true, explanation: "Nam là bạn cùng lớp của Lan." },
        { id: "tf_10", statement: "Learning English helps students communicate with friends around the world.", isTrue: true, explanation: "Học tiếng Anh giúp các em giao tiếp tốt hơn với bạn bè quốc tế." }
      ],
      matching: [
        { id: "m_1", left: "school bag", right: "cặp sách" },
        { id: "m_2", left: "uniform", right: "đồng phục" },
        { id: "m_3", left: "calculator", right: "máy tính cầm tay" },
        { id: "m_4", left: "compass", right: "com-pa" },
        { id: "m_5", left: "classmate", right: "bạn cùng lớp" },
        { id: "m_6", left: "pencil sharpener", right: "gọt bút chì" },
        { id: "m_7", left: "playground", right: "sân trường" },
        { id: "m_8", left: "excited", right: "hào hứng" },
        { id: "m_9", left: "beautiful", right: "xinh đẹp" },
        { id: "m_10", left: "wear", right: "mặc (trang phục)" }
      ]
    }
  }
};

const getTomorrowISO = (): string => {
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  tmr.setHours(23, 59, 0, 0);
  return tmr.toISOString();
};

const DEFAULT_ASSIGNMENTS: Assignment[] = [];

/**
 * Kiểm tra tên lớp mềm dẻo giữa tài khoản học sinh, bài tập và bài nộp
 */
export const isClassLooselyMatch = (classA?: string, classB?: string): boolean => {
  if (!classA || !classB) return true; // Nếu một trong hai không có thông tin lớp thì không chặn
  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const a = norm(classA);
  const b = norm(classB);
  if (!a || !b) return true;
  if (a === b) return true;

  // Lớp toàn khối / tất cả các lớp
  const isGlobalA = a.includes('toan khoi') || a.includes('tat ca') || a === 'all';
  const isGlobalB = b.includes('toan khoi') || b.includes('tat ca') || b === 'all';
  if (isGlobalA || isGlobalB) return true;

  // Bao gồm nhau: VD "6a1" nằm trong "6a1 (thứ 2 & 5)" hoặc "6a1 - t2-t5"
  if (a.includes(b) || b.includes(a)) return true;

  // So khớp sau khi lược bỏ ký tự đặc biệt, khoảng trắng, ghi chú giờ học
  const cleanA = a.replace(/[^\w]/g, '');
  const cleanB = b.replace(/[^\w]/g, '');
  if (cleanA && cleanB && (cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA))) {
    return true;
  }

  // Tra cứu qua danh sách lớp chính thức nếu có
  try {
    const classes = getClasses();
    const matchA = classes.find(c => c.id === classA || norm(c.name) === a);
    const matchB = classes.find(c => c.id === classB || norm(c.name) === b);
    if (matchA && matchB && matchA.id === matchB.id) return true;
  } catch {}

  return false;
};

/**
 * Kiểm tra xem bài tập có thuộc về lớp học chỉ định hay không.
 * Đảm bảo tuyệt đối: Học sinh lớp nào CHỈ nhìn thấy bài tập của lớp đó (hoặc bài giao toàn khối).
 */
export const isAssignmentForClass = (
  a: Assignment,
  classIdOrName?: string,
  classes?: ClassRoom[]
): boolean => {
  if (!a) return false;
  if (!classIdOrName || classIdOrName === 'ALL') return true;

  // 1. Giao cho toàn khối / tất cả các lớp
  if (a.targetClassId === 'ALL' || a.targetClassName === 'Tất cả các lớp') return true;
  if (Array.isArray(a.targetClassIds) && a.targetClassIds.includes('ALL')) return true;
  if (Array.isArray(a.targetClassNames) && a.targetClassNames.some(cn => {
    const cnl = (cn || '').toLowerCase().trim();
    return cnl === 'all' || cnl === 'tất cả các lớp' || cnl === 'tat ca cac lop' || cnl === 'toàn khối';
  })) return true;

  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const compact = (str?: string) => norm(str).normalize('NFC').replace(/[\s\-_.]+/g, '');
  // "6A1 (thứ 2 & 5)" / "6A1 - T2,T5" → so theo phần tên lớp, bỏ ghi chú
  const baseName = (str?: string) => norm(String(str || '').split(/[(\[]| - /)[0]);
  // So tên lớp CHÍNH XÁC (không so "chứa nhau": trước đây lớp "2" khớp nhầm 2A, 3A2, 9A2...
  // và bài ghi tên lớp rỗng "Lớp" hiện ở MỌI lớp)
  const sameClassName = (x?: string, clsName?: string): boolean => {
    const a = compact(x);
    const b = compact(clsName);
    if (!a || !b) return false;
    return a === b || compact(baseName(x)) === b;
  };

  const targetNorm = norm(classIdOrName);
  const allCls = classes || getClasses();
  const matchedClass = allCls.find(c => c.id === classIdOrName || norm(c.name) === targetNorm);

  const targetId = matchedClass ? matchedClass.id : classIdOrName;
  const targetName = matchedClass ? matchedClass.name : classIdOrName;

  // 2. Khớp theo mã lớp
  const refs: string[] = [];
  if (a.targetClassId) refs.push(a.targetClassId);
  if (Array.isArray(a.targetClassIds)) refs.push(...a.targetClassIds);
  if (refs.includes(targetId) || refs.includes(classIdOrName)) return true;
  // Mã lớp đôi khi bị lưu nhầm thành TÊN lớp ("Movers", "Lớp 6A1") → so theo tên
  const deletedClassIds = new Set(getDeletedClasses().map(d => String(d.id)));
  const isRealClassId = (r: string) => allCls.some(c => c.id === r) || deletedClassIds.has(r);
  if (refs.some(r => r && !isRealClassId(r) && sameClassName(r, targetName))) return true;

  // 3. Bài có mã lớp hợp lệ thì mã quyết định — không xét thêm tên (tránh lọt bài sang lớp khác)
  if (refs.some(r => r && isRealClassId(r))) return false;

  // 4. Bài cũ chỉ ghi tên lớp (có thể nhiều lớp, phân tách dấu phẩy)
  const names: string[] = [];
  if (a.targetClassName) names.push(...String(a.targetClassName).split(','));
  if (Array.isArray(a.targetClassNames)) names.push(...a.targetClassNames);
  return names.some(n => sameClassName(n, targetName));
};

// ==================== DELETED ASSIGNMENTS (TOMBSTONE) ====================
export const getDeletedAssignments = (): DeletedAssignmentRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(DELETED_ASSIGNMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDeletedAssignments = (records: DeletedAssignmentRecord[]): void => {
  if (typeof window === 'undefined') return;
  const prevRecords = getDeletedAssignments();
  const map = new Map<string, DeletedAssignmentRecord>();
  records.forEach(r => {
    if (r && r.id) map.set(r.id, r);
  });
  const deduped = Array.from(map.values());
  appStorage.setItem(DELETED_ASSIGNMENTS_KEY, JSON.stringify(deduped));
  invalidateAssignmentsCache();
  notifySync('deleted_assignments_updated', deduped);
  syncListWithDeletions('deleted_assignments', prevRecords, deduped);
};

export const isAssignmentDeleted = (assignmentId: string): boolean => {
  if (!assignmentId) return false;
  return getDeletedAssignments().some(d => d.id === assignmentId);
};

// ==================== ASSIGNMENT MANAGEMENT ====================
export const getAssignments = (classId?: string): Assignment[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(ASSIGNMENTS_KEY);
    const rawDeleted = appStorage.getItem(DELETED_ASSIGNMENTS_KEY);
    const cacheKey = `${raw}\u0000${rawDeleted}`;
    if (cacheKey !== cachedAssignmentsRaw || cachedAssignmentsClean === null) {
      const cleanAll: Assignment[] = getStoredAssignments();

      // Auto-repair any assignments that may have had empty or incomplete exercises
      const sanitizedAll: Assignment[] = cleanAll.map(a => {
        const mega = a.lessonPlan?.practice?.megaTest;
        const mcCount = mega?.multipleChoice?.length || 0;
        const fillCount = mega?.fillBlank?.length || 0;
        const scrambleCount = mega?.scramble?.length || 0;
        const vocabCount = mega?.vocabTranslation?.length || 0;
        const tfCount = mega?.trueFalse?.length || 0;

        // If all megaTest exercises are 0 or missing, synthesize them from core lesson
        if (!a.lessonPlan?.practice || !mega || (mcCount === 0 && fillCount === 0 && scrambleCount === 0 && vocabCount === 0 && tfCount === 0)) {
          return {
            ...a,
            lessonPlan: {
              ...a.lessonPlan,
              practice: ensureCompletePracticeContent(a.lessonPlan?.practice, a.lessonPlan || {})
            }
          };
        }
        return a;
      });

      // Sort newest first by assignedDate or createdAt
      sanitizedAll.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.assignedDate || 0).getTime();
        const timeB = new Date(b.createdAt || b.assignedDate || 0).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      });

      cachedAssignmentsRaw = cacheKey;
      cachedAssignmentsClean = sanitizedAll;
      cachedAssignmentsByClass.clear();
    }

    if (classId && classId !== 'ALL') {
      let filtered = cachedAssignmentsByClass.get(classId);
      if (!filtered) {
        const allCls = getClasses();
        filtered = cachedAssignmentsClean.filter(a => isAssignmentForClass(a, classId, allCls));
        cachedAssignmentsByClass.set(classId, filtered);
      }
      return filtered;
    }

    return cachedAssignmentsClean;
  } catch {
    return [];
  }
};

export const getAssignmentById = (id: string): Assignment | undefined => {
  const all = getAssignments();
  return all.find(a => a.id === id);
};

/**
 * Danh sách bài tập ĐÚNG NHƯ ĐÃ LƯU (chỉ bỏ bài mẫu và bài đã xóa), không qua bước tự sửa nội dung.
 * Dùng khi ghi dữ liệu: chỉ thay đúng bài giáo viên vừa sửa, các bài khác giữ nguyên bản gốc
 * (tránh máy này đẩy bản "tự sửa" đè lên bài giáo viên sửa ở máy khác).
 */
const getStoredAssignments = (): Assignment[] => {
  try {
    const raw = appStorage.getItem(ASSIGNMENTS_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    const tombs = tombMap(getDeletedAssignments());
    return all.filter((a: Assignment) =>
      a && a.id && a.id !== 'assign_unit1_school' && !isPallasItem(a) && !isHiddenByTombstone(a, tombs.get(String(a.id)))
    );
  } catch {
    return [];
  }
};

export const saveAssignment = (assignment: Assignment): void => {
  if (typeof window === 'undefined') return;

  const prevVersion = getStoredAssignments().find(a => a.id === assignment.id);
  const now = timeAfter(prevVersion?.teacherModifiedAt, prevVersion?.updatedAt, assignment.teacherModifiedAt, assignment.updatedAt);
  // Guarantee that practice content has complete non-empty exercises before saving
  const safeLessonPlan: LessonPlan = {
    ...assignment.lessonPlan,
    practice: ensureCompletePracticeContent(assignment.lessonPlan?.practice, assignment.lessonPlan || {})
  };

  const safeAssignment: Assignment = {
    ...assignment,
    lessonPlan: safeLessonPlan,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };

  const all = getStoredAssignments();
  const exists = all.some(a => a.id === safeAssignment.id);
  const updated = exists ? all.map(a => a.id === safeAssignment.id ? safeAssignment : a) : [safeAssignment, ...all];
  appStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(updated));
  invalidateAssignmentsCache();
  notifySync('assignment_created', safeAssignment);
  syncToFirebaseIfConfigured('assignments', updated);
};

export const deleteAssignment = (id: string, reason = 'Bài tập đã xóa bởi quản trị'): void => {
  if (typeof window === 'undefined') return;
  const all = getStoredAssignments();
  const target = all.find(a => a.id === id);
  const updated = all.filter(a => a.id !== id);

  // 1. Luôn ghi (hoặc cập nhật) dấu "đã xóa", thời điểm xóa sau lần sửa cuối của bài
  //    → bài đã xóa không bao giờ bị kéo lại từ đám mây
  const deletedAssignments = getDeletedAssignments().filter(d => d.id !== id);
  saveDeletedAssignments([...deletedAssignments, {
    id,
    title: target?.title || target?.topic,
    deletedAt: timeAfter(target?.teacherModifiedAt, target?.updatedAt, target?.createdAt),
    reason
  }]);

  appStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(updated));
  invalidateAssignmentsCache();
  notifySync('assignment_deleted', { id });
  syncToFirebaseIfConfigured('assignments', updated);
};

export const updateAssignmentTitle = (id: string, newTitle: string): void => {
  if (typeof window === 'undefined') return;
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) return;

  const all = getStoredAssignments();
  const assign = all.find(a => a.id === id);
  if (!assign) return;
  const now = new Date().toISOString();
  const updatedAssign = {
    ...assign,
    title: trimmedTitle,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };
  const updatedList = all.map(a => a.id === id ? updatedAssign : a);
  appStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(updatedList));
  invalidateAssignmentsCache();
  notifySync('assignment_updated', updatedAssign);
  syncToFirebaseIfConfigured('assignments', updatedList);

  // Đồng bộ cập nhật tiêu đề trong các bài nộp đã có của học sinh
  try {
    const rawSubs = appStorage.getItem(SUBMISSIONS_KEY);
    if (rawSubs) {
      const subs: Submission[] = JSON.parse(rawSubs);
      if (Array.isArray(subs)) {
        let changed = false;
        const updatedSubs = subs.map(s => {
          if (s.assignmentId === id && s.assignmentTitle !== trimmedTitle) {
            changed = true;
            return { ...s, assignmentTitle: trimmedTitle };
          }
          return s;
        });
        if (changed) {
          appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updatedSubs));
          notifySync('submissions_updated', updatedSubs);
          syncToFirebaseIfConfigured('submissions', updatedSubs);
        }
      }
    }
  } catch (e) {
    console.warn('Error updating submission titles:', e);
  }
};

// ==================== DEADLINE STATUS CALCULATION ====================
export interface DeadlineInfo {
  status: DeadlineStatus;
  label: string;
  badgeClass: string;
  remainingText: string;
  isExpired: boolean;
  isDueSoon: boolean;
}

export const isAssignmentOverdue = (dueDateStr?: string): boolean => {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr).getTime();
  if (isNaN(due)) return false;
  return Date.now() > due;
};

export const calculateDeadlineStatus = (dueDateStr: string, hasSubmitted = false): DeadlineInfo => {
  if (hasSubmitted) {
    return {
      status: 'submitted',
      label: 'Đã hoàn thành',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-200',
      remainingText: 'Đã nộp bài thành công',
      isExpired: false,
      isDueSoon: false
    };
  }

  if (!dueDateStr) {
    return {
      status: 'active',
      label: 'Còn thời hạn',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-300',
      remainingText: 'Không giới hạn thời gian',
      isExpired: false,
      isDueSoon: false
    };
  }

  const now = Date.now();
  const due = new Date(dueDateStr).getTime();
  const diffMs = due - now;

  if (diffMs <= 0) {
    return {
      status: 'expired',
      label: 'Hết hạn',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-200',
      remainingText: 'Đã quá hạn nộp bài',
      isExpired: true,
      isDueSoon: false
    };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  let timeString = '';
  if (diffDays > 0) {
    timeString = `Còn ${diffDays} ngày ${remainingHours > 0 ? remainingHours + ' giờ' : ''}`;
  } else {
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    timeString = `Còn ${diffHours} giờ ${diffMinutes} phút`;
  }

  // If less than 24 hours remaining -> Due Soon (Sắp hết hạn)
  if (diffHours < 24) {
    return {
      status: 'due_soon',
      label: 'Sắp hết hạn',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-400 ring-2 ring-amber-300 animate-pulse',
      remainingText: timeString,
      isExpired: false,
      isDueSoon: true
    };
  }

  return {
    status: 'active',
    label: 'Còn thời hạn',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    remainingText: timeString,
    isExpired: false,
    isDueSoon: false
  };
};

const DEFAULT_SUBMISSIONS: Submission[] = [];

// ==================== SUBMISSIONS MANAGEMENT ====================
export const getSubmissions = (assignmentId?: string): Submission[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(SUBMISSIONS_KEY);
    if (raw !== cachedSubmissionsRaw || cachedSubmissionsClean === null) {
      let all: Submission[] = [];
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          all = parsed;
        }
      }
      const defaultEval = (score: number) => {
        if (score >= 9) return { text: 'Xuất sắc', emoji: '🌟', level: 'EXCELLENT', praise: 'Em làm bài rất xuất sắc! Cô rất tự hào về em!' };
        if (score >= 8) return { text: 'Giỏi', emoji: '🎉', level: 'GREAT', praise: 'Em làm bài rất tốt, tiếp tục phát huy nhé!' };
        if (score >= 6.5) return { text: 'Khá', emoji: '👍', level: 'GOOD', praise: 'Em đã nỗ lực hoàn thành bài!' };
        if (score >= 5) return { text: 'Đạt', emoji: '👌', level: 'PASS', praise: 'Em đã hoàn thành bài tập, cố gắng thêm nhé!' };
        return { text: 'Cố gắng', emoji: '💪', level: 'EFFORT', praise: 'Em chú ý ôn lại bài để làm tốt hơn nhé!' };
      };

      const rawDeletedSubs = appStorage.getItem(DELETED_SUBMISSIONS_KEY);
      let deletedSubIds = new Set<string>();
      try {
        if (rawDeletedSubs) {
          const dList = JSON.parse(rawDeletedSubs);
          if (Array.isArray(dList)) {
            deletedSubIds = new Set(dList.map((d: any) => String(d?.id || d)));
          }
        }
      } catch {}

      // Bài nộp chỉ bị ẩn theo học sinh / lớp đã xóa khi KHÔNG còn học sinh / lớp nào đang hiện khớp với nó.
      // (Bản cũ ẩn theo tên: học sinh mới trùng tên em đã xóa, hoặc lớp mới trùng tên lớp đã xóa,
      //  sẽ bị giấu mất bài nộp.)
      const deletedStds = getDeletedStudents();
      const deletedStdIds = new Set(deletedStds.map(d => d.id));
      const deletedStdNames = new Set(deletedStds.map(d => `${cleanNameKeepAccents(d.name)}::${normClassName(d.className || d.classId)}`));
      const visibleStudents = getStudents();
      const visibleStdIds = new Set(visibleStudents.map(s => s.id));
      const visibleStdNames = new Set(visibleStudents.map(s => `${cleanNameKeepAccents(s.name)}::${normClassName(s.className || s.classId)}`));

      const deletedCls = getDeletedClasses();
      const deletedClsIds = new Set(deletedCls.map(d => d.id));
      const deletedClsNames = new Set(deletedCls.filter(d => d.name).map(d => normClassName(d.name)));
      const visibleClasses = getClasses();
      const visibleClsIds = new Set(visibleClasses.map(c => c.id));
      const visibleClsNames = new Set(visibleClasses.map(c => normClassName(c.name)));

      // Filter out legacy mock seed submissions, tombstones and deleted students/classes
      const cleanAll = all
        .filter(s => {
          if (!s || typeof s !== 'object' || !s.id) return false;
          if (String(s.id).startsWith('sub_seed_') || isPallasItem(s)) return false;
          if (deletedSubIds.has(String(s.id))) return false;
          if (s.studentId) {
            if (deletedStdIds.has(String(s.studentId)) && !visibleStdIds.has(String(s.studentId))) return false;
          } else {
            const key = `${cleanNameKeepAccents(s.studentName)}::${normClassName(s.studentClass)}`;
            if (deletedStdNames.has(key) && !visibleStdNames.has(key)) return false;
          }
          if (s.studentClass) {
            const clsKey = String(s.studentClass);
            const clsNorm = normClassName(s.studentClass);
            const isDeleted = deletedClsIds.has(clsKey) || deletedClsNames.has(clsNorm);
            const isVisible = visibleClsIds.has(clsKey) || visibleClsNames.has(clsNorm);
            if (isDeleted && !isVisible) return false;
          }
          return true;
        })
        .map(s => {
          const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
          const fallback = defaultEval(score);
          const evalObj = s.evaluation && typeof s.evaluation === 'object' ? {
            text: s.evaluation.text || fallback.text,
            emoji: s.evaluation.emoji || fallback.emoji,
            level: s.evaluation.level || fallback.level,
            praise: s.evaluation.praise || fallback.praise
          } : fallback;

          const rawTime = s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
          const subTime = isNaN(rawTime) ? 0 : rawTime;

          return {
            ...s,
            studentName: (s.studentName ? String(s.studentName) : 'Học Sinh').trim(),
            studentClass: (s.studentClass ? String(s.studentClass) : '').trim(),
            score,
            totalQuestions: typeof s.totalQuestions === 'number' && !isNaN(s.totalQuestions) && s.totalQuestions > 0 ? s.totalQuestions : 55,
            totalCorrect: typeof s.totalCorrect === 'number' && !isNaN(s.totalCorrect) && (s.totalCorrect > 0 || score === 0)
              ? s.totalCorrect
              : (score > 0 ? Math.round((score / 10) * (s.totalQuestions || 55)) : 0),
            submittedAt: s.submittedAt || new Date().toISOString(),
            evaluation: evalObj,
            _subTime: subTime
          };
        });

      // Pre-sort once by numeric timestamp (0 Date object allocations in sort comparator)
      cleanAll.sort((a: any, b: any) => (b._subTime || 0) - (a._subTime || 0));

      cachedSubmissionsRaw = raw;
      cachedSubmissionsClean = cleanAll;
      cachedSubmissionsByAssignment.clear();
    }

    if (assignmentId) {
      let cachedForAssign = cachedSubmissionsByAssignment.get(assignmentId);
      if (!cachedForAssign) {
        cachedForAssign = cachedSubmissionsClean.filter(s => s.assignmentId === assignmentId);
        cachedSubmissionsByAssignment.set(assignmentId, cachedForAssign);
      }
      return cachedForAssign;
    }

    return cachedSubmissionsClean;
  } catch {
    return [];
  }
};

export interface RealLearningStats {
  totalVisits: number;
  todayVisits: number;
  myVisits: number;
  activeStudentsCount: number;
  averageScore: number;
}

export const getRealLearningStats = (currentStudentName?: string): RealLearningStats => {
  const submissions = getSubmissions();
  const todayStr = getTodayString();

  // Also include lesson practice history
  let historyRecords: any[] = [];
  try {
    const rawHistory = appStorage.getItem('lesson_history');
    if (rawHistory) {
      historyRecords = JSON.parse(rawHistory) || [];
    }
  } catch {}

  const totalSubmissions = submissions.length;
  const totalHistory = historyRecords.length;
  const totalVisits = totalSubmissions + totalHistory;

  let todaySubmissions = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const uniqueStudents = new Set<string>();
  let myVisits = 0;
  const cleanCurrent = (currentStudentName || '').trim().toLowerCase();

  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i];
    if (!s) continue;
    const sName = (s.studentName || '').toLowerCase().trim();
    if (sName) uniqueStudents.add(sName);

    if (s.submittedAt && s.submittedAt.startsWith(todayStr)) {
      todaySubmissions++;
    }

    if (typeof s.score === 'number' && !isNaN(s.score)) {
      scoreSum += s.score;
      scoreCount++;
    }

    if (cleanCurrent && sName === cleanCurrent) {
      myVisits++;
    }
  }

  let todayHistory = 0;
  for (let i = 0; i < historyRecords.length; i++) {
    const r = historyRecords[i];
    if (r && r.date && r.date.startsWith(todayStr)) {
      todayHistory++;
    }
  }

  const todayVisits = todaySubmissions + todayHistory;
  if (!cleanCurrent) {
    myVisits = uniqueStudents.size;
  }
  const averageScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 0;

  return {
    totalVisits,
    todayVisits,
    myVisits,
    activeStudentsCount: uniqueStudents.size,
    averageScore
  };
};


export const getStudentSubmission = (
  assignmentId: string,
  studentNameOrId: string,
  studentId?: string,
  studentClass?: string,
  assignmentTopic?: string,
  assignmentTitle?: string,
  studentEnglishName?: string
): Submission | undefined => {
  if (!studentNameOrId && !studentId) return undefined;

  // 1. Thu thập toàn bộ bài nộp hiện có
  const allSubs = getSubmissions();
  if (allSubs.length === 0) return undefined;

  // Tự động tìm thêm topic và title nếu caller chưa truyền vào
  let targetTopic = (assignmentTopic || '').trim().toLowerCase();
  let targetTitle = (assignmentTitle || '').trim().toLowerCase();
  if ((!targetTopic || !targetTitle) && assignmentId) {
    try {
      const foundAssign = getAssignmentById(assignmentId);
      if (foundAssign) {
        if (!targetTopic && foundAssign.topic) targetTopic = foundAssign.topic.trim().toLowerCase();
        if (!targetTitle && foundAssign.title) targetTitle = foundAssign.title.trim().toLowerCase();
      }
    } catch {}
  }

  // Bắt buộc khớp chính xác assignmentId và chưa bị xóa/cho phép làm lại
  const candidateSubs = allSubs.filter(s => s && s.assignmentId === assignmentId && !isSubmissionInDeletedTombstone(s.id));
  if (candidateSubs.length === 0) return undefined;

  const clean = (str?: string) => (str || '').trim().toLowerCase().normalize('NFC');
  const targetName = clean(studentNameOrId);
  let targetId = studentId || (studentNameOrId.startsWith('std_') ? studentNameOrId : undefined);
  let targetEnName = studentEnglishName;

  // Tự động tra cứu thông tin học sinh từ danh sách nếu thiếu ID hoặc englishName
  if (!targetEnName || !targetId) {
    try {
      const allStudents = getStudents();
      const matched = allStudents.find(std =>
        (targetId && std.id === targetId) ||
        (targetName && clean(std.name) === targetName) ||
        (targetName && std.englishName && clean(std.englishName) === targetName)
      );
      if (matched) {
        if (!targetEnName && matched.englishName) targetEnName = matched.englishName;
        if (!targetId && matched.id) targetId = matched.id;
      }
    } catch {}
  }

  const isGeneric = (str?: string) => {
    const s = (str || '').toLowerCase().trim();
    return s === 'học sinh' || s === 'hocsinh' || s === 'hoc sinh';
  };

  // Bước 1: Khớp tuyệt đối theo studentId (nếu có studentId cụ thể)
  if (targetId && targetId !== 'student_chung') {
    const byIdList = candidateSubs.filter(s => {
      if (s.studentId !== targetId) return false;
      // Nếu có thông tin lớp thì bắt buộc phải đúng lớp (tránh nhầm khi học sinh học nhiều lớp)
      if (studentClass && s.studentClass && !isSameClassStrict(s.studentClass, studentClass)) {
        return false;
      }
      return true;
    });
    if (byIdList.length > 0) {
      return byIdList.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), byIdList[0]);
    }
  }

  // Bước 2: Khớp bằng họ tên VÀ bắt buộc đúng lớp.
  // Bài nộp đã mang mã của MỘT HỌC SINH KHÁC thì tuyệt đối không tính cho em này (dù trùng tên).
  const matchedByName = candidateSubs.filter(s => {
    if (!s) return false;
    if (isGeneric(s.studentName) && !isGeneric(studentNameOrId)) return false;
    // Bài nộp mang mã của MỘT HỌC SINH KHÁC đang có hồ sơ → không tính (dù trùng tên).
    // Mã không thuộc hồ sơ nào (tài khoản đã mất) → được nhận theo họ tên + lớp.
    if (targetId && s.studentId && s.studentId !== targetId && isKnownStudentId(s.studentId)) return false;

    if (studentClass && s.studentClass && !isSameClassStrict(s.studentClass, studentClass)) {
      return false;
    }

    return isStudentMatch(
      { id: targetId, name: studentNameOrId, englishName: targetEnName },
      { studentId: s.studentId, studentName: s.studentName }
    );
  });

  if (matchedByName.length > 0) {
    return matchedByName.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), matchedByName[0]);
  }

  // Bước 4: Hỗ trợ tài khoản mẫu 'học sinh'
  if (isGeneric(studentNameOrId) || targetId === 'student_chung') {
    const genericSubs = candidateSubs.filter(s => s && (isGeneric(s.studentName) || s.studentId === 'student_chung'));
    if (genericSubs.length > 0) {
      return genericSubs[0];
    }
  }

  return undefined;
};

// ==================== ADMIN NOTIFICATION SYSTEM ====================
export interface AdminNotificationItem {
  id: string;
  submissionId: string;
  studentName: string;
  studentClass: string;
  assignmentTitle: string;
  score: number;
  totalCorrect: number;
  totalQuestions: number;
  submittedAt: string;
  isRead: boolean;
  createdAt: number;
  isLate?: boolean;
  rawScore?: number;
}

const ADMIN_NOTIFICATIONS_KEY = 'mrs_dung_admin_notifications';

// ==================== TOMBSTONE / RETAKE PERMISSIONS ====================
export const DELETED_SUBMISSIONS_KEY = 'mrs_dung_deleted_submissions';

export const isSubmissionInDeletedTombstone = (submissionId?: string): boolean => {
  if (!submissionId) return false;
  try {
    const raw = appStorage.getItem(DELETED_SUBMISSIONS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.some((item: any) => (item?.id || item) === submissionId);
  } catch {
    return false;
  }
};

export const saveDeletedSubmissionTombstone = (item: { id: string; assignmentId?: string; studentName?: string; studentClass?: string; deletedAt?: string }): void => {
  if (!item?.id) return;
  try {
    const raw = appStorage.getItem(DELETED_SUBMISSIONS_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    if (!list.some((d: any) => (d?.id || d) === item.id)) {
      list.push(item);
      appStorage.setItem(DELETED_SUBMISSIONS_KEY, JSON.stringify(list));
    }
  } catch {}
};

export const removeDeletedSubmissionTombstone = (submissionId: string): void => {
  if (!submissionId) return;
  try {
    const raw = appStorage.getItem(DELETED_SUBMISSIONS_KEY);
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    const filtered = list.filter((d: any) => (d?.id || d) !== submissionId);
    appStorage.setItem(DELETED_SUBMISSIONS_KEY, JSON.stringify(filtered));
  } catch {}
};

export const getAdminNotifications = (): AdminNotificationItem[] => [];

export const saveAdminNotifications = (_list: AdminNotificationItem[]): void => {};

// ==================== BELL SOUND & NOTIFICATION MANAGEMENT (DISABLED) ====================
export const BELL_SOUND_MUTED_KEY = 'mrs_dung_bell_sound_muted';
export const NOTIFIED_SUBMISSIONS_KEY = 'mrs_dung_notified_submission_ids';

export const isBellSoundMuted = (): boolean => true;

export const setBellSoundMuted = (_muted: boolean): void => {};

export const getNotifiedSubmissionIds = (): Set<string> => new Set();

export const markSubmissionAsNotified = (_submissionId: string): void => {};

export const playNotificationSound = (_force = false): void => {};

export const testNotificationSound = (): void => {};

export const addAdminNotification = (_sub: Submission): void => {};

export const addAdminNotificationsBatch = (_subs: Submission[]): void => {};

export const markNotificationsAsRead = (): void => {};

export const clearAdminNotifications = (): void => {
  appStorage.removeItem(ADMIN_NOTIFICATIONS_KEY);
};

export const reconcileAdminNotifications = (_isRealtime = false): void => {};

export const cleansePallasAndVirtualNotifications = (): void => {
  if (typeof window === 'undefined') return;
  try {
    appStorage.removeItem(ADMIN_NOTIFICATIONS_KEY);
    appStorage.removeItem('mrs_dung_notified_submission_ids');
    appStorage.removeItem('mrs_dung_bell_sound_muted');

    const cleanCollection = (key: string, firebaseTable?: string) => {
      try {
        const raw = appStorage.getItem(key);
        if (!raw) return;
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const removedItems = list.filter((item: any) => item && isPallasItem(item));
          const cleaned = list.filter((item: any) => item && !isPallasItem(item));
          if (cleaned.length !== list.length) {
            appStorage.setItem(key, JSON.stringify(cleaned));
            if (firebaseTable) {
              syncToFirebaseIfConfigured(firebaseTable, cleaned);
            }
            if (key === CLASSES_KEY) {
              const currentDeleted = getDeletedClasses();
              const newDeleted: DeletedClassRecord[] = removedItems.map((c: any) => ({
                id: c.id,
                name: c.name,
                deletedAt: new Date().toISOString(),
                reason: 'Lớp Pallas đã xóa triệt để'
              }));
              saveDeletedClasses([...currentDeleted, ...newDeleted]);
            }
            if (key === STUDENTS_KEY) {
              const currentDeleted = getDeletedStudents();
              const newDeleted: DeletedStudentRecord[] = removedItems.map((s: any) => ({
                id: s.id,
                name: s.name,
                classId: s.classId,
                className: s.className,
                deletedAt: new Date().toISOString(),
                reason: 'Học sinh lớp Pallas đã xóa triệt để'
              }));
              saveDeletedStudents([...currentDeleted, ...newDeleted]);
            }
          }
        }
      } catch {}
    };

    cleanCollection(CLASSES_KEY, 'classes');
    cleanCollection(STUDENTS_KEY, 'students');
    cleanCollection(ASSIGNMENTS_KEY, 'assignments');
    cleanCollection(SUBMISSIONS_KEY, 'submissions');
    cleanCollection(MONTHLY_REPORTS_KEY, 'monthly_reports');
    cleanCollection(CLASS_SCHEDULES_KEY, 'class_schedules');
  } catch (e) {
    console.warn('Error in cleansePallasAndVirtualNotifications:', e);
  }
};
cleansePallasAndVirtualNotifications();


export type SaveSubmissionResult = {
  /** true khi bài đã lên Firebase (giáo viên nhận được ngay) */
  success: boolean;
  /** Bài đã lưu trên máy nhưng chưa gửi được lên Firebase (mất mạng) → sẽ tự gửi lại */
  queued?: boolean;
  /** Bài bị từ chối vì em này đã nộp bài này rồi */
  duplicate?: boolean;
  existing?: Submission;
  error?: string;
};

export const saveSubmission = async (
  submission: Submission
): Promise<SaveSubmissionResult> => {
  if (typeof window === 'undefined') return { success: false, error: 'Môi trường không hỗ trợ' };

  // Xác nhận với cloud trước khi nhận bài: máy mới mở / vừa đổi máy có thể chưa tải bài đã nộp trước đó.
  // Mất mạng thì vẫn nhận bài (lưu chờ gửi) để học sinh không mất công làm.
  const confirmedWithCloud = await ensureFreshSubmissions(30000, 15000);
  if (confirmedWithCloud) invalidateSubmissionsCache();
  const all = getSubmissions();

  // CHÍNH SÁCH QUAN TRỌNG: Học sinh chỉ được làm bài 1 lần, gửi nộp rồi sẽ không làm được nữa,
  // chỉ làm được khi giáo viên cho phép!
  // Dùng đúng quy tắc của getStudentSubmission (mã học sinh trước, sau đó họ tên giữ dấu + đúng lớp)
  const existing = getStudentSubmission(
    submission.assignmentId,
    submission.studentName,
    submission.studentId,
    submission.studentClass
  );

  if (existing) {
    console.warn(
      `[saveSubmission] Học sinh "${submission.studentName}" đã nộp bài trước đó (${existing.submittedAt}). Hệ thống chỉ cho phép làm lại khi giáo viên cho phép!`
    );
    return {
      success: false,
      duplicate: true,
      existing,
      error: 'Em đã nộp bài tập này rồi! Link cô giao chỉ làm được 1 lần duy nhất, trừ khi được giáo viên cho phép làm lại.'
    };
  }

  // QUY TẮC QUÁ HẠN: Quá hạn vẫn được làm và nộp bài nhưng hiện quá hạn và bị trừ 2 điểm
  const assign = getAssignmentById(submission.assignmentId);
  const isOverdue = isAssignmentOverdue(assign?.dueDate) || Boolean(submission.isLate);
  const penaltyPoints = isOverdue ? 2 : (submission.penaltyPoints || 0);

  const rawScore = typeof submission.rawScore === 'number'
    ? submission.rawScore
    : (typeof submission.score === 'number' && !isNaN(submission.score) ? submission.score : 0);

  // Điểm chính thức sau khi trừ phạt quá hạn (chặn không dưới 0)
  const score = isOverdue
    ? Math.max(0, Math.round((rawScore - penaltyPoints) * 10) / 10)
    : rawScore;

  const totalQuestions = typeof submission.totalQuestions === 'number' && submission.totalQuestions > 0 ? submission.totalQuestions : 55;
  const totalCorrect = typeof submission.totalCorrect === 'number' && (submission.totalCorrect > 0 || rawScore === 0)
    ? submission.totalCorrect
    : (rawScore > 0 ? Math.round((rawScore / 10) * totalQuestions) : 0);

  const safeEval = submission.evaluation && typeof submission.evaluation === 'object' ? {
    text: submission.evaluation.text || 'Hoàn thành',
    emoji: submission.evaluation.emoji || '⭐',
    level: submission.evaluation.level || 'GOOD',
    praise: submission.evaluation.praise || 'Đã hoàn thành bài tập'
  } : {
    text: score >= 8 ? 'Xuất sắc' : score >= 5 ? 'Đạt' : 'Cố gắng',
    emoji: score >= 8 ? '🌟' : score >= 5 ? '👍' : '💪',
    level: score >= 8 ? 'EXCELLENT' : score >= 5 ? 'PASS' : 'EFFORT',
    praise: 'Đã hoàn thành bài tập'
  };

  const safeSubmission: Submission = {
    ...submission,
    score,
    rawScore,
    isLate: isOverdue,
    penaltyPoints: isOverdue ? penaltyPoints : 0,
    totalQuestions,
    totalCorrect,
    evaluation: safeEval
  };

  const updated = [safeSubmission, ...all];
  try {
    appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updated));
    invalidateSubmissionsCache();
  } catch (err) {
    console.warn('appStorage save failed:', err);
  }

  // Thêm vào thông báo admin và phát tín hiệu sync
  addAdminNotification(safeSubmission);
  notifySync('submission_created', safeSubmission);

  // Push single submission directly to Firebase (safe atomic update, eliminates overwrite risk)
  // Nếu thất bại, syncSingleSubmissionToFirebase đã đưa bài vào hàng chờ trên máy để tự gửi lại.
  const cloudSynced = await syncSingleSubmissionToFirebase(safeSubmission);
  return cloudSynced ? { success: true } : { success: false, queued: true };
};

/**
 * Cho phép học sinh làm lại bài tập: Xóa bài nộp hiện tại, lưu tombstone để đồng bộ tức thì
 * sang tất cả các thiết bị (kể cả máy học sinh) và xóa khỏi Firebase.
 */
export const allowStudentRetake = (submissionId: string): void => {
  deleteSubmission(submissionId);
};

export const deleteSubmission = (submissionId: string): void => {
  if (typeof window === 'undefined') return;
  const all = getSubmissions();
  const target = all.find(s => s.id === submissionId);
  const updated = all.filter(s => s.id !== submissionId);
  try {
    appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updated));
    invalidateSubmissionsCache();
  } catch (err) {
    console.warn('appStorage delete failed:', err);
  }

  // Lưu tombstone để các máy khác và thiết bị học sinh không phục hồi lại bài nộp cũ
  const tombstoneItem = {
    id: submissionId,
    assignmentId: target?.assignmentId,
    studentName: target?.studentName,
    studentClass: target?.studentClass,
    deletedAt: new Date().toISOString()
  };
  saveDeletedSubmissionTombstone(tombstoneItem);

  notifySync('submission_deleted', { id: submissionId, assignmentId: target?.assignmentId, studentName: target?.studentName });

  // Ghi tombstone TRƯỚC (để mọi máy biết bài này đã bị xóa / được làm lại), rồi xóa đúng bài nộp đó trên cloud.
  // Bản cũ gọi DELETE thiếu tham số xác thực và, nếu dữ liệu dạng mảng, PUT lại cả mảng bài nộp
  // → có thể xóa mất bài của học sinh khác vừa nộp trong lúc đó.
  const cfg = getFirebaseConfig();
  if (cfg && cfg.databaseURL) {
    putItemToFirebaseCollection('deleted_submissions', tombstoneItem)
      .catch(err => console.warn('Firebase sync deleted submission tombstone error:', err));
    deleteItemsFromFirebaseCollection('submissions', [submissionId])
      .then(ok => {
        if (!ok) console.warn('Firebase DELETE submission failed, tombstone vẫn đảm bảo bài không bị khôi phục.');
      })
      .catch(err => console.warn('Firebase atomic DELETE submission error:', err));
  }
};

// ==================== DAILY SUMMARY & HIGH PERFORMERS ====================
export const getDailySubmissions = (dateStr?: string, classId?: string): Submission[] => {
  const all = getSubmissions();
  const targetDate = dateStr || getTodayString();

  return all.filter(s => {
    const subDate = getLocalDateString(s.submittedAt);
    const matchDate = !dateStr || dateStr === 'ALL' || subDate === targetDate;
    const matchClass = !classId || classId === 'ALL' || s.studentClass === classId;
    return matchDate && matchClass;
  });
};

export const getDailySummary = (dateStr?: string, classId?: string, assignmentId?: string): DailySummary => {
  const targetDate = dateStr || getTodayString();
  let subs = getSubmissions();

  // 1. Lọc theo bài tập nếu có
  if (assignmentId && assignmentId !== 'ALL') {
    subs = subs.filter(s => s.assignmentId === assignmentId);
    // Khi chọn 1 bài tập cụ thể, KHÔNG loại bỏ bài nộp của học sinh theo ngày,
    // đảm bảo toàn bộ học sinh đã làm bài kiểm tra/bài tập này đều được ghi nhận đầy đủ!
  } else if (dateStr && dateStr !== 'ALL') {
    subs = subs.filter(s => getLocalDateString(s.submittedAt) === targetDate);
  }

  const isAll = !classId || classId === 'ALL';
  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();

  // Xác định danh sách học sinh:
  let students: Student[] = [];
  if (!isAll) {
    students = getStudents(classId);
  } else if (assignmentId && assignmentId !== 'ALL') {
    // Nếu chưa chọn lớp nhưng đang chọn 1 bài tập cụ thể:
    // Kiểm tra xem bài tập đó giao cho lớp nào thì chỉ tính sĩ số của lớp đó (không bị đội lên 390 học sinh!)
    const allAssigns = getAssignments();
    const assignObj = allAssigns.find(a => a.id === assignmentId);
    if (assignObj && assignObj.targetClassId && assignObj.targetClassId !== 'ALL') {
      students = getStudents(assignObj.targetClassId);
    } else if (assignObj && assignObj.targetClassName && assignObj.targetClassName !== 'Tất cả các lớp') {
      students = getStudents(assignObj.targetClassName);
    } else {
      students = getStudents();
    }
  } else {
    students = getStudents();
  }

  if (!isAll) {
    const classObj = getClasses().find(c => c.id === classId || norm(c.name) === norm(classId));
    const targetClassNameNorm = classObj ? norm(classObj.name) : norm(classId);

    subs = subs.filter(s => {
      // Khớp học sinh có trong danh sách lớp
      if (students.some(std => isStudentMatch(std, s))) return true;
      // Hoặc tên lớp của bài nộp trùng với lớp đang chọn
      if (s.studentClass && (norm(s.studentClass) === targetClassNameNorm || s.studentClass === classId)) return true;
      return false;
    });
  } else if (assignmentId && assignmentId !== 'ALL' && students.length > 0 && students.length < 300) {
    // Khi chọn bài tập giao cho lớp cụ thể mà chưa chọn dropdown lớp, chỉ lấy bài nộp của các học sinh thuộc lớp đó
    subs = subs.filter(s => {
      if (students.some(std => isStudentMatch(std, s))) return true;
      const assignObj = getAssignments().find(a => a.id === assignmentId);
      if (assignObj?.targetClassName && s.studentClass && norm(s.studentClass) === norm(assignObj.targetClassName)) return true;
      return false;
    });
  }

  // Tính toán số liệu thống kê chuẩn theo TỪNG HỌC SINH DUY NHẤT (không bị nhân đôi nếu 1 bạn nộp nhiều lần)
  const uniqueStudentScores: number[] = [];

  if (students.length > 0 && (!isAll || (assignmentId && assignmentId !== 'ALL' && students.length < 300))) {
    // Với lớp cụ thể (hoặc bài tập giao cho lớp cụ thể): tính theo từng học sinh chính thức của lớp
    students.forEach(std => {
      const studentSubs = subs.filter(s => isStudentMatch(std, s));
      if (studentSubs.length > 0) {
        const bestScore = Math.max(...studentSubs.map(s => s.score));
        uniqueStudentScores.push(bestScore);
      }
    });
    // Thêm các bài nộp thuộc lớp mà học sinh chưa có trong danh mục chính thức (nếu có)
    const matchedStdIds = new Set<string>();
    subs.forEach(s => {
      if (!s || typeof s !== 'object') return;
      const matched = students.some(std => isStudentMatch(std, s));
      if (!matched) {
        const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
        const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'unknown');
        if (!matchedStdIds.has(key)) {
          matchedStdIds.add(key);
          const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
          uniqueStudentScores.push(score);
        }
      }
    });
  } else {
    // Với tất cả các lớp: nhóm theo từng học sinh
    const studentGroupMap = new Map<string, number[]>();
    subs.forEach(s => {
      if (!s || typeof s !== 'object') return;
      const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
      const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'unknown');
      if (!studentGroupMap.has(key)) studentGroupMap.set(key, []);
      const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
      studentGroupMap.get(key)!.push(score);
    });
    studentGroupMap.forEach(scores => {
      uniqueStudentScores.push(Math.max(...scores));
    });
  }

  const totalSubmitted = uniqueStudentScores.length;
  const totalAssigned = students.length > 0 ? students.length : totalSubmitted;
  const averageScore = totalSubmitted > 0 ? Math.round((uniqueStudentScores.reduce((a, b) => a + b, 0) / totalSubmitted) * 10) / 10 : 0;
  const highestScore = totalSubmitted > 0 ? Math.max(...uniqueStudentScores) : 0;
  const lowestScore = totalSubmitted > 0 ? Math.min(...uniqueStudentScores) : 0;
  const submissionRate = totalAssigned > 0 ? Math.min(100, Math.round((totalSubmitted / totalAssigned) * 100)) : 0;

  return {
    date: targetDate,
    totalAssigned,
    totalSubmitted,
    averageScore,
    highestScore,
    lowestScore,
    submissionRate,
    submissions: subs
  };
};

/**
 * Filter & sort students with high performance (>= 8.0)
 * Returns top performers with rank badge
 */
export interface TopPerformer extends Submission {
  rank: number;
  rankBadge: string;
  isPerfect: boolean;
}

export const getTopPerformers = (submissions: Submission[], threshold = 8.0): TopPerformer[] => {
  if (!Array.isArray(submissions)) return [];
  // Nhóm theo từng học sinh để 1 bạn nộp nhiều lần chỉ vinh danh 1 lần với điểm cao nhất
  const studentBestMap = new Map<string, Submission>();
  submissions.forEach(s => {
    if (!s || typeof s !== 'object') return;
    const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
    if (score < threshold) return;
    const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
    const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'unknown');
    const existing = studentBestMap.get(key);
    const totalCorrect = typeof s.totalCorrect === 'number' ? s.totalCorrect : 0;
    const existingCorrect = existing && typeof existing.totalCorrect === 'number' ? existing.totalCorrect : 0;
    if (!existing || score > existing.score || (score === existing.score && totalCorrect > existingCorrect)) {
      studentBestMap.set(key, {
        ...s,
        studentName: rawName,
        score,
        totalCorrect
      });
    }
  });

  const uniqueBestList = Array.from(studentBestMap.values());

  // Sort descending by score, then by totalCorrect, then by earliest submittedAt
  const sorted = uniqueBestList.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCorr = a.totalCorrect || 0;
    const bCorr = b.totalCorrect || 0;
    if (bCorr !== aCorr) return bCorr - aCorr;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return (isNaN(aTime) ? 0 : aTime) - (isNaN(bTime) ? 0 : bTime);
  });

  return sorted.map((s, index) => {
    const rank = index + 1;
    let rankBadge = '⭐';
    if (rank === 1) rankBadge = '🥇 Top 1';
    else if (rank === 2) rankBadge = '🥈 Top 2';
    else if (rank === 3) rankBadge = '🥉 Top 3';
    else rankBadge = `⭐ #${rank}`;

    return {
      ...s,
      rank,
      rankBadge,
      isPerfect: s.score >= 9.5
    };
  });
};

export const forceCloudSyncNow = async (): Promise<boolean> => {
  try {
    const updated = await pullAllFromFirebase();
    notifySync('cloud_sync_completed');
    return updated;
  } catch (err) {
    console.warn('Manual cloud sync error:', err);
    return false;
  }
};

/**
 * Initialize cloud sync with Firebase:
 * 1. Seeds Firebase if the cloud database is empty.
 * 2. Pulls latest data from Firebase (classes, students, assignments, submissions).
 * 3. Starts Real-time SSE listener for instant submission push (sub-second latency).
 * 4. Starts background interval polling (every 30s) as reliable fallback.
 */
export const initCloudSync = (): (() => void) => {
  let isMounted = true;

  const doSync = async () => {
    try {
      // Seed if empty
      await seedFirebaseIfEmpty({
        classes: getClasses(),
        students: getStudents(),
        assignments: getAssignments(),
        submissions: getSubmissions()
      });

      // Pull latest
      const updated = await pullAllFromFirebase();
      if (isMounted) {
        reconcileAdminNotifications(false);
        if (updated) {
          notifySync('cloud_sync_completed');
        }
      }
    } catch (e) {
      console.warn('Initial cloud sync error:', e);
    }
  };

  // Run initial sync
  doSync();

  // 1. Real-time Native SSE EventSource Listener:
  // Instantly receives submissions without waiting for polling
  const unsubscribeRealtime = subscribeToFirebaseRealtime((newSub) => {
    if (!isMounted || !newSub) return;

    try {
      // Khi bài nộp bị xóa (hoặc giáo viên cho phép làm lại)
      if (newSub._deleted) {
        const raw = appStorage.getItem(SUBMISSIONS_KEY);
        let list: Submission[] = raw ? JSON.parse(raw) : [];
        list = list.filter(s => s && s.id !== newSub.id);
        appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(list));
        saveDeletedSubmissionTombstone({ id: newSub.id, deletedAt: new Date().toISOString() });
        notifySync('submission_deleted', { id: newSub.id });
        notifySync('cloud_sync_completed');
        return;
      }

      // Xử lý nạp nhanh snapshot ban đầu (dạng batch) không gây đơ lag trình duyệt
      if (newSub._isBatch && Array.isArray(newSub.items)) {
        const raw = appStorage.getItem(SUBMISSIONS_KEY);
        let list: Submission[] = raw ? JSON.parse(raw) : [];
        const map = new Map<string, Submission>();
        list.forEach(s => { if (s && s.id) map.set(s.id, s); });
        let hasNew = false;
        newSub.items.forEach((item: any) => {
          if (item && item.id && !isSubmissionInDeletedTombstone(item.id)) {
            if (!map.has(item.id)) {
              hasNew = true;
              map.set(item.id, item);
            }
          }
        });
        if (hasNew) {
          const merged = Array.from(map.values());
          appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(merged));
          invalidateSubmissionsCache();
          reconcileAdminNotifications(false);
          notifySync('cloud_sync_completed');
        }
        return;
      }

      if (!newSub.id) return;

      // Nếu bài nộp này nằm trong danh sách đã bị xóa/cho làm lại thì bỏ qua không nạp lại
      if (isSubmissionInDeletedTombstone(newSub.id)) return;

      const subScore = typeof newSub.score === 'number' && !isNaN(newSub.score) ? newSub.score : 0;
      const subTotalQ = typeof newSub.totalQuestions === 'number' && newSub.totalQuestions > 0 ? newSub.totalQuestions : 55;
      const subTotalC = typeof newSub.totalCorrect === 'number' && (newSub.totalCorrect > 0 || subScore === 0)
        ? newSub.totalCorrect
        : (subScore > 0 ? Math.round((subScore / 10) * subTotalQ) : 0);

      const sanitizedSub: Submission = {
        ...newSub,
        score: subScore,
        totalQuestions: subTotalQ,
        totalCorrect: subTotalC
      };

      const raw = appStorage.getItem(SUBMISSIONS_KEY);
      let list: Submission[] = raw ? JSON.parse(raw) : [];
      const existingIndex = list.findIndex(s => s && s.id === sanitizedSub.id);

      if (existingIndex >= 0) {
        list[existingIndex] = { ...list[existingIndex], ...sanitizedSub };
      } else {
        list.unshift(sanitizedSub);
      }

      appStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(list));
      invalidateSubmissionsCache();
      notifySync('submission_created', sanitizedSub);
    } catch (err) {
      console.warn('Failed to apply real-time submission update:', err);
    }
  });

  // 2. High-speed submissions-only polling fallback (every 30s)
  const fastSubmissionsTimer = setInterval(async () => {
    if (!isMounted) return;
    try {
      const newSubs = await pullSubmissionsOnlyFromFirebase();
      if (newSubs.length > 0 && isMounted) {
        invalidateSubmissionsCache();
        notifySync('submission_created', newSubs[0]);
      }
    } catch {
      // Quiet catch
    }
  }, 30000);

  // 3. Background full collections polling fallback every 60 seconds
  const timer = setInterval(async () => {
    if (!isMounted) return;
    try {
      const updated = await pullAllFromFirebase();
      if (isMounted) {
        if (updated) {
          invalidateAllCaches();
          notifySync('cloud_sync_completed');
        }
      }
    } catch (e) {
      // Quiet catch
    }
  }, 60000);

  // 4. Watchdog tab visibilitychange with 30s throttle
  let lastVisibilityPull = 0;
  const handleVisibility = () => {
    const now = Date.now();
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isMounted) {
      if (now - lastVisibilityPull < 30000) return;
      lastVisibilityPull = now;
      pullSubmissionsOnlyFromFirebase().then(newSubs => {
        if (newSubs.length > 0 && isMounted) {
          invalidateSubmissionsCache();
          notifySync('submission_created', newSubs[0]);
        }
      });
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleVisibility);
  }

  return () => {
    isMounted = false;
    clearInterval(fastSubmissionsTimer);
    clearInterval(timer);
    unsubscribeRealtime();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleVisibility);
    }
  };
};

// ==================== MONTHLY REPORT MANAGEMENT ====================
export const getMonthlyReports = (classId?: string): MonthlyReport[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(MONTHLY_REPORTS_KEY);
    if (!raw) return [];
    const all: MonthlyReport[] = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    if (classId && classId !== 'ALL') {
      return all.filter(r => r.classId === classId);
    }
    return all;
  } catch {
    return [];
  }
};

export const getMonthlyReport = (classId: string, month: number, year: number): MonthlyReport | undefined => {
  const all = getMonthlyReports();
  return all.find(r => r.classId === classId && r.month === month && r.year === year);
};

export const saveMonthlyReport = (report: MonthlyReport): void => {
  if (typeof window === 'undefined') return;
  const all = getMonthlyReports();
  const isMatch = (r: MonthlyReport) =>
    r.id === report.id ||
    (r.classId === report.classId && Number(r.month) === Number(report.month) && Number(r.year) === Number(report.year));
  const exists = all.some(isMatch);
  const updated = exists ? all.map(r => isMatch(r) ? report : r) : [report, ...all];
  appStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('monthly_report_updated', report);
  syncListWithDeletions('monthly_reports', all, updated);
};

export const deleteMonthlyReport = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getMonthlyReports();
  const updated = all.filter(r => r.id !== id);
  appStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('monthly_report_deleted', { id });
  syncListWithDeletions('monthly_reports', all, updated);
};

export const parseScoreNumber = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  const str = String(val).trim().replace(',', '.');
  if (str === '' || str.toLowerCase() === 'x') return null;
  const num = parseFloat(str);
  return (!isNaN(num) && num >= 0 && num <= 10) ? num : null;
};

/**
 * Calculate arithmetic mean of valid scores (excluding 'x' and empty strings)
 * Rounded to 2 decimal places. Handles exact strings like "8.5", "8,5", "9.0", 10.
 */
export const calculateStudentMonthlyAverage = (
  scores: Record<string, Record<string, number | string>>
): number => {
  const numericScores: number[] = [];
  if (!scores) return 0;
  Object.values(scores).forEach(sessionCols => {
    if (!sessionCols) return;
    Object.values(sessionCols).forEach(val => {
      const parsed = parseScoreNumber(val);
      if (parsed !== null) {
        numericScores.push(parsed);
      }
    });
  });

  if (numericScores.length === 0) return 0;
  const sum = numericScores.reduce((acc, s) => acc + s, 0);
  return Math.round((sum / numericScores.length) * 100) / 100;
};

/**
 * Tự động đồng bộ điểm Link từ các bài làm / bài nộp hệ thống vào Báo cáo Tháng
 */
/**
 * Đánh dấu nguồn của điểm Link trong từng ô: 'manual' = cô nhập tay (không bao giờ bị đồng bộ ghi đè),
 * 'auto' = hệ thống điền từ bài làm online (luôn cập nhật theo bài làm mới nhất).
 * Giá trị chữ nên không ảnh hưởng điểm trung bình.
 */
export const LINK_SCORE_SOURCE_KEY = 'linkScoreSource';

/**
 * Khoảng thời gian (theo NGÀY, giờ Việt Nam) mà bài tập được tính vào từng buổi học:
 * bài giao từ ngày của buổi đó đến TRƯỚC buổi học kế tiếp → thuộc buổi đó
 * (học sinh không phải ngày nào cũng làm bài; bài giao sau buổi học là bài về nhà của buổi đó).
 * Buổi cuối tháng kéo dài tới buổi học kế tiếp theo lịch của lớp (tối đa 7 ngày).
 */
export const getLinkScoreSessionWindows = (
  classId: string,
  sessions: MonthlySessionConfig[]
): Array<{ sessionId: string; start: string; end: string }> => {
  const toYMD = (dmy: string): string => {
    if (!dmy) return '';
    const parts = dmy.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}/.test(dmy) ? dmy.slice(0, 10) : '';
  };
  const addDays = (ymd: string, n: number): string => {
    const d = new Date(`${ymd}T00:00:00`);
    d.setDate(d.getDate() + n);
    return getLocalDateString(d);
  };

  const dated = sessions
    .map(s => ({ id: s.id, date: toYMD(s.date) }))
    .filter(s => s.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Ngày học kế tiếp theo lịch của lớp (dùng cho buổi cuối cùng)
  const nextScheduledDay = (afterYmd: string): string => {
    const schedule = getClassSchedule(classId);
    const days = new Set((schedule?.slots || []).map(sl => sl.dayOfWeek)); // 1 = Chủ Nhật ... 7 = Thứ Bảy
    for (let i = 1; i <= 7; i++) {
      const cand = addDays(afterYmd, i);
      const dow = new Date(`${cand}T00:00:00`).getDay() + 1;
      if (days.has(dow)) return cand;
    }
    return addDays(afterYmd, 7);
  };

  return dated.map((s, i) => {
    let end = i + 1 < dated.length ? dated[i + 1].date : nextScheduledDay(s.date);
    // Hai buổi trùng ngày: buổi sau nhận bài của ngày đó, buổi trước không có khoảng
    if (end < s.date) end = s.date;
    return { sessionId: s.id, start: s.date, end };
  });
};

export const syncLinkScoresForMonthlyReport = (
  classId: string,
  month: number,
  year: number,
  sessions: MonthlySessionConfig[],
  studentScores: StudentMonthlyScore[],
  forceOverwrite: boolean = false
): { updatedScores: StudentMonthlyScore[]; syncedCount: number } => {
  void month; void year;
  const allSubmissions = getSubmissions();
  const classAssignments = getAssignments(classId);

  // Ngày giao bài (giờ Việt Nam): ưu tiên ngày giao cô chọn, nếu không có thì lấy thời điểm tạo bài
  const assignDate = (a: Assignment): string =>
    (a.assignedDate && /^\d{4}-\d{2}-\d{2}/.test(a.assignedDate) ? a.assignedDate.slice(0, 10) : '') ||
    (a.createdAt ? getLocalDateString(new Date(a.createdAt)) : '');

  // Mỗi buổi học → danh sách bài tập giao trong khoảng [ngày buổi đó, trước buổi kế tiếp)
  const windows = getLinkScoreSessionWindows(classId, sessions);
  const assignmentsBySession = new Map<string, Assignment[]>();
  windows.forEach(w => {
    assignmentsBySession.set(
      w.sessionId,
      classAssignments.filter(a => {
        const d = assignDate(a);
        return !!d && d >= w.start && d < w.end;
      })
    );
  });

  let syncedCount = 0;

  const updatedScores: StudentMonthlyScore[] = studentScores.map(std => {
    const studentSubs = allSubmissions.filter(sub =>
      isStudentMatch({ id: std.studentId, name: std.studentName, englishName: std.englishName }, sub)
    );

    const studentScoresMap = { ...(std.scores || {}) };
    let hasChanges = false;

    sessions.forEach(sess => {
      const sessScores: Record<string, any> = { ...(studentScoresMap[sess.id] || {}) };
      const currentLinkScore = sessScores['linkScore'];
      const isCurrentEmpty = currentLinkScore === undefined || currentLinkScore === null || String(currentLinkScore).trim() === '';
      // Điểm cô nhập tay (hoặc điểm có sẵn từ trước khi có đánh dấu) → KHÔNG BAO GIỜ bị đồng bộ ghi đè
      const source = sessScores[LINK_SCORE_SOURCE_KEY];
      const isManual = source === 'manual' || (source === undefined && !isCurrentEmpty);
      if (isManual) return;

      // Ô trống hoặc ô do hệ thống điền → luôn cập nhật theo bài làm mới nhất
      const clearAuto = () => {
        if (forceOverwrite && source === 'auto' && !isCurrentEmpty) {
          sessScores['linkScore'] = '';
          delete sessScores[LINK_SCORE_SOURCE_KEY];
          studentScoresMap[sess.id] = sessScores;
          hasChanges = true;
          syncedCount++;
        }
      };

      const sessAssignments = assignmentsBySession.get(sess.id) || [];
      if (sessAssignments.length === 0) { clearAuto(); return; }

      // Điểm của em ở từng bài thuộc buổi này (lấy lần làm điểm cao nhất mỗi bài)
      const perAssignment: number[] = [];
      sessAssignments.forEach(a => {
        const subs = studentSubs.filter(s => s.assignmentId === a.id);
        if (subs.length === 0) return;
        const best = Math.max(
          ...subs.map(s => (typeof s.scaledScore10 === 'number' ? s.scaledScore10 : typeof s.score === 'number' ? s.score : 0))
        );
        if (!isNaN(best)) perAssignment.push(best);
      });
      if (perAssignment.length === 0) { clearAuto(); return; }

      // Một buổi có nhiều bài → lấy trung bình các bài em đã làm
      const avg = perAssignment.reduce((a, b) => a + b, 0) / perAssignment.length;
      const rounded = Math.round(avg * 10) / 10;
      const formattedScore = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
      if (String(currentLinkScore ?? '') === formattedScore) return;

      sessScores['linkScore'] = formattedScore;
      sessScores[LINK_SCORE_SOURCE_KEY] = 'auto';
      studentScoresMap[sess.id] = sessScores;
      hasChanges = true;
      syncedCount++;
    });

    if (hasChanges) {
      return {
        ...std,
        scores: studentScoresMap,
        averageScore: calculateStudentMonthlyAverage(studentScoresMap)
      };
    }
    return std;
  });

  return { updatedScores, syncedCount };
};

// ==================== WEEKLY REPORT AGGREGATOR ====================
export const getWeeklyReports = (classId?: string): WeeklyReportRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(WEEKLY_REPORTS_KEY);
    if (!raw) return [];
    const all: WeeklyReportRecord[] = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    if (classId && classId !== 'ALL') {
      return all.filter(r => r.classId === classId);
    }
    return all;
  } catch {
    return [];
  }
};

export const getWeeklyReport = (
  classId: string,
  year: number,
  month: number,
  weekNumber: number
): WeeklyReportRecord | undefined => {
  const all = getWeeklyReports();
  return all.find(
    r => r.classId === classId && r.year === year && r.month === month && r.weekNumber === weekNumber
  );
};

export const saveWeeklyReport = (report: WeeklyReportRecord): void => {
  if (typeof window === 'undefined') return;
  const all = getWeeklyReports();
  const exists = all.some(r => r.id === report.id);
  const updated = exists ? all.map(r => (r.id === report.id ? report : r)) : [report, ...all];
  appStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('weekly_report_updated', report);
  syncListWithDeletions('weekly_reports', all, updated);
};

export const deleteWeeklyReport = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getWeeklyReports();
  const updated = all.filter(r => r.id !== id);
  appStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('weekly_report_deleted', { id });
  syncListWithDeletions('weekly_reports', all, updated);
};

export const calculateStudentWeeklyAverage = (
  scores: Record<string, Record<string, number | string>>
): number => {
  return calculateStudentMonthlyAverage(scores);
};

// ==================== CLASS SCHEDULE MANAGEMENT ====================
export const getClassSchedules = (): ClassScheduleConfig[] => {
  if (typeof window === 'undefined') return DEFAULT_CLASS_SCHEDULES;
  try {
    const raw = appStorage.getItem(CLASS_SCHEDULES_KEY);
    if (!raw) {
      appStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(DEFAULT_CLASS_SCHEDULES));
      return DEFAULT_CLASS_SCHEDULES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Đảm bảo tất cả các lớp chuẩn có trong danh sách
      const merged = [...parsed];
      DEFAULT_CLASS_SCHEDULES.forEach(def => {
        if (!merged.some(m => m.classId === def.classId)) {
          merged.push(def);
        }
      });
      return merged;
    }
    appStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(DEFAULT_CLASS_SCHEDULES));
    return DEFAULT_CLASS_SCHEDULES;
  } catch {
    return DEFAULT_CLASS_SCHEDULES;
  }
};

export const getClassSchedule = (classId: string): ClassScheduleConfig | null => {
  if (!classId) return null;
  const all = getClassSchedules();
  const cleanId = classId.trim().toLowerCase();

  // 1. Khớp chính xác classId
  const directMatch = all.find(s => s.classId.toLowerCase() === cleanId);
  if (directMatch) return directMatch;

  // 2. Khớp gần đúng qua tên hoặc mã
  const fuzzyMatch = all.find(s => {
    const sId = s.classId.toLowerCase();
    const sName = (s.className || '').toLowerCase();
    return sId.includes(cleanId) || cleanId.includes(sId) || sName.includes(cleanId) || cleanId.includes(sName);
  });
  if (fuzzyMatch) return fuzzyMatch;

  // 3. Tự động tạo lịch chuẩn: ƯU TIÊN phân tích mô tả thực tế của lớp (matchedClass.description)
  const classes = getClasses();
  const matchedClass = classes.find(c => c.id === classId || c.name.toLowerCase().includes(cleanId));
  const className = matchedClass ? matchedClass.name : `Lớp ${classId}`;

  let defaultSlots: WeeklyTimeSlot[] = [];
  if (matchedClass?.description) {
    const parsed = parseScheduleFromText(matchedClass.description, 'Phòng A1');
    if (parsed && parsed.slots.length > 0) {
      defaultSlots = parsed.slots;
    }
  }

  if (defaultSlots.length === 0) {
    const grade = matchedClass?.grade || (className.includes('7') ? 7 : className.includes('8') ? 8 : 6);
    let notes = '';
    if (grade === 7) {
      defaultSlots = [
        { id: `slot_${classId}_1`, dayOfWeek: 4, dayLabel: 'Thứ Tư', startTime: '17:30', endTime: '19:00', room: 'Phòng B1' },
        { id: `slot_${classId}_2`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '17:30', endTime: '19:00', room: 'Phòng B1' }
      ];
      notes = `Lịch học chính khóa ${className} (Thứ 4 & Thứ 7)`;
    } else if (grade === 8) {
      defaultSlots = [
        { id: `slot_${classId}_1`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '19:15', endTime: '20:45', room: 'Phòng C1' },
        { id: `slot_${classId}_2`, dayOfWeek: 1, dayLabel: 'Chủ Nhật', startTime: '17:30', endTime: '19:00', room: 'Phòng C1' }
      ];
      notes = `Lịch học chính khóa ${className} (Thứ 7 & Chủ Nhật)`;
    } else {
      defaultSlots = [
        { id: `slot_${classId}_1`, dayOfWeek: 2, dayLabel: 'Thứ Hai', startTime: '17:30', endTime: '19:00', room: 'Phòng A1' },
        { id: `slot_${classId}_2`, dayOfWeek: 5, dayLabel: 'Thứ Năm', startTime: '17:30', endTime: '19:00', room: 'Phòng A1' }
      ];
      notes = `Lịch học chính khóa ${className} (Thứ 2 & Thứ 5)`;
    }
  }

  const newSched: ClassScheduleConfig = {
    id: `sched_${classId}`,
    classId: classId,
    className: className,
    sessionsPerWeek: defaultSlots.length,
    roomDefault: defaultSlots[0]?.room || 'Phòng A1',
    slots: defaultSlots,
    notes: matchedClass?.description || `Lịch học ${className}`,
    updatedAt: new Date().toISOString()
  };

  saveClassSchedule(newSched);
  return newSched;
};

/**
 * Tự động đồng bộ toàn bộ ngày của 8 buổi học trong các báo cáo tháng của lớp
 * theo đúng lịch học thực tế được giáo viên sắp xếp
 */
export const syncMonthlyReportsWithClassSchedule = (
  classId: string,
  schedule?: ClassScheduleConfig | null
): void => {
  if (typeof window === 'undefined' || !classId) return;
  const sched = schedule || getClassSchedule(classId);
  if (!sched || !sched.slots || sched.slots.length === 0) return;

  const allReports = getMonthlyReports();
  let hasChanges = false;

  const updatedReports = allReports.map(report => {
    if (report.classId !== classId) return report;

    // Sinh 8 buổi học chuẩn theo lịch của lớp cho tháng & năm của báo cáo này
    const stdSessions = generate8SessionsFromSchedule(classId, report.month, report.year);

    // Cập nhật ngày cho các buổi học, bảo toàn id, tên cột tùy chỉnh và điểm học sinh
    const updatedSessions = (report.sessions || []).map((oldSess, idx) => {
      const stdSess = stdSessions[idx];
      const useDate = (oldSess.isManualDate && oldSess.date) ? oldSess.date : (stdSess ? stdSess.date : oldSess.date);
      return {
        ...oldSess,
        date: useDate,
        dayLabel: stdSess?.dayLabel || oldSess.dayLabel,
        timeSlot: stdSess?.timeSlot || oldSess.timeSlot,
        name: oldSess.name || (stdSess ? stdSess.name : `Buổi ${idx + 1}`),
        columns: (oldSess.columns && oldSess.columns.length === 3)
          ? oldSess.columns
          : (stdSess?.columns || [
              { key: 'vocab', label: 'Từ Vựng' },
              { key: 'test', label: 'Test' },
              { key: 'linkScore', label: 'điểm Link' }
            ])
      };
    });

    // Nếu số buổi chưa đủ 8 thì bổ sung
    while (updatedSessions.length < 8 && updatedSessions.length < stdSessions.length) {
      const stdSess = stdSessions[updatedSessions.length];
      if (stdSess) {
        updatedSessions.push(stdSess);
      }
    }

    hasChanges = true;
    return {
      ...report,
      sessions: updatedSessions,
      updatedAt: new Date().toISOString()
    };
  });

  if (hasChanges) {
    appStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify(updatedReports));
    notifySync('monthly_report_updated', { classId, bulkSync: true });
    syncListWithDeletions('monthly_reports', allReports, updatedReports);
  }
};

/**
 * Tự động tạo 8 buổi học chuẩn xác theo lịch học thực tế của lớp trong tháng và năm bất kỳ
 * Hoạt động chính xác tuyệt đối cho năm 2026 và mọi năm thực tế tiếp theo (2027, 2028, 2029...)
 */
export const generate8SessionsFromSchedule = (
  classId: string,
  month: number,
  year: number
): MonthlySessionConfig[] => {
  const schedule = classId ? getClassSchedule(classId) : null;
  const daysInMonth = new Date(year, month, 0).getDate();

  interface MatchedDateInfo {
    dateStr: string;
    dayNum: number;
    dow: number;
    slot?: WeeklyTimeSlot;
  }
  const matchedDates: MatchedDateInfo[] = [];

  const dayLabelsMap: Record<number, string> = {
    1: 'Chủ Nhật',
    2: 'Thứ Hai',
    3: 'Thứ Ba',
    4: 'Thứ Tư',
    5: 'Thứ Năm',
    6: 'Thứ Sáu',
    7: 'Thứ Bảy'
  };

  if (schedule && schedule.slots && schedule.slots.length > 0) {
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const jsDay = dateObj.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
      const dow = jsDay === 0 ? 1 : jsDay + 1; // 1 = CN, 2 = T2, ..., 7 = T7
      const matchingSlot = schedule.slots.find(slot => slot.dayOfWeek === dow);
      if (matchingSlot) {
        matchedDates.push({
          dateStr: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
          dayNum: d,
          dow,
          slot: matchingSlot
        });
      }
    }
  }

  // Nếu số buổi khớp ít hơn 8 (tháng ngắn hoặc lịch 1 buổi/tuần), bổ sung tiếp các ngày trong tháng
  if (matchedDates.length < 8) {
    for (let d = 1; d <= daysInMonth && matchedDates.length < 8; d++) {
      const str = `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      if (!matchedDates.some(m => m.dateStr === str)) {
        const dateObj = new Date(year, month - 1, d);
        const jsDay = dateObj.getDay();
        const dow = jsDay === 0 ? 1 : jsDay + 1;
        matchedDates.push({
          dateStr: str,
          dayNum: d,
          dow
        });
      }
    }
  }

  // Sắp xếp ngày tăng dần theo trình tự thời gian
  matchedDates.sort((a, b) => a.dayNum - b.dayNum);

  const final8 = matchedDates.slice(0, 8);

  const defaultCols: MonthlySessionColumn[] = [
    { key: 'vocab', label: 'Từ Vựng' },
    { key: 'test', label: 'Test' },
    { key: 'linkScore', label: 'điểm Link' }
  ];

  return final8.map((item, idx) => ({
    id: `s_buoi_${idx + 1}`,
    name: `Buổi ${idx + 1}`,
    date: item.dateStr,
    dayLabel: item.slot?.dayLabel || dayLabelsMap[item.dow] || `Thứ ${item.dow}`,
    timeSlot: item.slot?.startTime && item.slot?.endTime ? `${item.slot.startTime} - ${item.slot.endTime}` : undefined,
    columns: defaultCols
  }));
};

export const saveClassSchedule = (config: ClassScheduleConfig): void => {
  if (typeof window === 'undefined') return;
  const all = getClassSchedules();
  const exists = all.some(s => s.classId === config.classId);
  const updated = exists
    ? all.map(s => (s.classId === config.classId ? config : s))
    : [...all, config];
  appStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(updated));

  // Tự động đồng bộ mô tả lịch học vào thông tin lớp (class.description)
  if (config.classId) {
    const classes = getClasses();
    const targetClass = classes.find(c => c.id === config.classId);
    if (targetClass) {
      const formattedDesc = formatScheduleSummary(config.slots);
      if (formattedDesc && targetClass.description !== formattedDesc) {
        targetClass.description = formattedDesc;
        saveClasses(classes);
      }
    }
  }

  // Tự động đồng bộ toàn bộ ngày của 8 buổi học trong báo cáo tháng của lớp
  syncMonthlyReportsWithClassSchedule(config.classId, config);

  notifySync('class_schedule_updated', config);
  syncListWithDeletions('class_schedules', all, updated);
};

export const deleteClassSchedule = (classId: string): void => {
  if (typeof window === 'undefined') return;
  const all = getClassSchedules();
  const updated = all.filter(s => s.classId !== classId);
  appStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(updated));
  notifySync('class_schedule_deleted', { classId });
  syncListWithDeletions('class_schedules', all, updated);
};

// ==================== ATTENDANCE MANAGEMENT ====================
export const getAttendanceRecords = (classId?: string, date?: string): AttendanceRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(ATTENDANCE_RECORDS_KEY);
    if (!raw) return [];
    let list: AttendanceRecord[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (classId && classId !== 'ALL') {
      list = list.filter(r => r.classId === classId);
    }
    if (date && date !== 'ALL') {
      list = list.filter(r => r.date === date);
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
};

export const getAttendanceRecord = (classId: string, date: string): AttendanceRecord | null => {
  const records = getAttendanceRecords(classId);
  return records.find(r => r.date === date) || null;
};

export const saveAttendanceRecord = (record: AttendanceRecord): void => {
  if (typeof window === 'undefined') return;
  const all = getAttendanceRecords();
  const exists = all.some(r => r.id === record.id || (r.classId === record.classId && r.date === record.date));
  const updated = exists
    ? all.map(r => (r.id === record.id || (r.classId === record.classId && r.date === record.date) ? record : r))
    : [record, ...all];
  appStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify(updated));
  notifySync('attendance_record_updated', record);
  syncListWithDeletions('attendance_records', all, updated);
};

export const deleteAttendanceRecord = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getAttendanceRecords();
  const updated = all.filter(r => r.id !== id);
  appStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify(updated));
  notifySync('attendance_record_deleted', { id });
  syncListWithDeletions('attendance_records', all, updated);
};

// ==================== ANNUAL REPORT AGGREGATOR ====================
export const getAnnualReports = (classId?: string, year?: number): AnnualReport[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = appStorage.getItem(ANNUAL_REPORTS_KEY);
    if (!raw) return [];
    let list: AnnualReport[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (classId && classId !== 'ALL') {
      list = list.filter(r => r.classId === classId);
    }
    if (year) {
      list = list.filter(r => r.year === year);
    }
    return list;
  } catch {
    return [];
  }
};

export const getAnnualReport = (classId: string, year: number): AnnualReport | undefined => {
  const all = getAnnualReports();
  return all.find(r => r.classId === classId && r.year === year);
};

export const saveAnnualReport = (report: AnnualReport): void => {
  if (typeof window === 'undefined') return;
  const all = getAnnualReports();
  const exists = all.some(r => r.id === report.id || (r.classId === report.classId && r.year === report.year));
  const updated = exists
    ? all.map(r => (r.id === report.id || (r.classId === report.classId && r.year === report.year) ? report : r))
    : [report, ...all];
  appStorage.setItem(ANNUAL_REPORTS_KEY, JSON.stringify(updated));
  notifySync('annual_report_updated', report);
  syncListWithDeletions('annual_reports', all, updated);
};

export const deleteAnnualReport = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getAnnualReports();
  const updated = all.filter(r => r.id !== id);
  appStorage.setItem(ANNUAL_REPORTS_KEY, JSON.stringify(updated));
  notifySync('annual_report_deleted', { id });
  syncListWithDeletions('annual_reports', all, updated);
};

/**
 * Tự động tổng hợp dữ liệu cả năm (12 tháng) từ các Báo cáo tháng và bài nộp
 */
export const buildOrAggregateAnnualReport = (
  classId: string,
  year: number,
  forceReaggregate: boolean = false
): AnnualReport => {
  const classes = getClasses();
  const targetClass = classes.find(c => c.id === classId) || classes[0];
  const className = targetClass ? targetClass.name : 'Lớp học';
  const existingSaved = getAnnualReport(classId, year);
  const classStudents = getStudents(classId);
  const monthlyReports = getMonthlyReports(classId).filter(r => r.year === year);
  const allSubmissions = getSubmissions();

  const studentScores: StudentAnnualScore[] = classStudents.map(std => {
    const existingStd = existingSaved?.studentScores?.find(s => s.studentId === std.id || s.studentName === std.name);
    const monthlyScores: Record<number, number | null> = {};
    const validScores: number[] = [];

    for (let m = 1; m <= 12; m++) {
      let scoreForMonth: number | null = null;

      // 1. Nếu không phải forceReaggregate và giáo viên đã chỉnh sửa điểm tháng này trong báo cáo năm, giữ nguyên
      if (!forceReaggregate && existingStd?.monthlyScores && existingStd.monthlyScores[m] !== undefined && existingStd.monthlyScores[m] !== null) {
        scoreForMonth = existingStd.monthlyScores[m];
      }

      // 2. Lấy điểm TB từ Báo Cáo Tháng của lớp
      if (scoreForMonth === null) {
        const mRep = monthlyReports.find(r => r.month === m);
        if (mRep) {
          const found = mRep.studentScores?.find(s => s.studentId === std.id || s.studentName === std.name);
          if (found && typeof found.averageScore === 'number' && found.averageScore > 0) {
            scoreForMonth = found.averageScore;
          }
        }
      }

      // 3. Nếu chưa có báo cáo tháng, kiểm tra điểm bài nộp trên hệ thống trong tháng đó
      if (scoreForMonth === null) {
        const monthSubs = allSubmissions.filter(sub => {
          if (sub.studentId !== std.id && sub.studentName.trim().toLowerCase() !== std.name.trim().toLowerCase()) return false;
          if (!sub.submittedAt) return false;
          const d = new Date(sub.submittedAt);
          return d.getFullYear() === year && d.getMonth() + 1 === m;
        });
        if (monthSubs.length > 0) {
          const sum = monthSubs.reduce((acc, cur) => {
            const sc = typeof cur.scaledScore10 === 'number' ? cur.scaledScore10 : cur.score;
            return acc + (sc || 0);
          }, 0);
          scoreForMonth = Math.round((sum / monthSubs.length) * 100) / 100;
        }
      }

      monthlyScores[m] = scoreForMonth;
      if (scoreForMonth !== null && scoreForMonth > 0) {
        validScores.push(scoreForMonth);
      }
    }

    const annualAverage = validScores.length > 0
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
      : 0;

    let classification: StudentAnnualScore['classification'] = 'Cần cố gắng';
    if (annualAverage >= 9.0) classification = 'Xuất sắc';
    else if (annualAverage >= 8.0) classification = 'Giỏi';
    else if (annualAverage >= 6.5) classification = 'Khá';
    else if (annualAverage >= 5.0) classification = 'Trung bình';

    return {
      studentId: std.id,
      studentName: std.name,
      englishName: std.englishName || existingStd?.englishName || '',
      monthlyScores,
      annualAverage,
      completedMonthsCount: validScores.length,
      classification,
      teacherRemarks: existingStd?.teacherRemarks || ''
    };
  });

  // Sort by annualAverage desc and assign rank
  const sorted = [...studentScores].sort((a, b) => b.annualAverage - a.annualAverage);
  sorted.forEach((std, idx) => {
    std.rank = idx + 1;
  });

  return {
    id: existingSaved?.id || `annual_${classId}_${year}`,
    classId,
    className,
    year,
    centerName: existingSaved?.centerName || 'ENGLISH LEGEND X5',
    studentScores: sorted,
    generalNote: existingSaved?.generalNote || '',
    updatedAt: existingSaved?.updatedAt || new Date().toISOString()
  };
};
