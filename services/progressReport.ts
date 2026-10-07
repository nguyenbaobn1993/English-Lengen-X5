/**
 * BÁO CÁO KẾT QUẢ HỌC TẬP TỪNG HỌC SINH (gửi phụ huynh qua Zalo)
 *
 * Tự tính từ dữ liệu có sẵn của app:
 *  - Điểm kỹ năng: quy đổi từ số câu đúng từng phần trong các bài đã nộp (skillScores) / số câu của phần đó.
 *      Vocabulary ← Dịch nghĩa từ vựng
 *      Grammar    ← Trắc nghiệm + Sắp xếp câu
 *      Reading    ← Đọc hiểu ABCD + True/False + Điền từ (bài đọc)
 *      Listening  ← Nghe
 *      Speaking   ← Phát âm (tìm từ đọc khác) — giáo viên có thể sửa
 *      Writing    ← giáo viên tự nhập (không có thì bỏ dòng)
 *  - Chuyên cần: số buổi có mặt / đi muộn trên tổng số buổi đã điểm danh trong kỳ.
 *  - Hoàn thành bài tập: số bài đã nộp / số bài giao cho lớp trong kỳ.
 *  - So với kỳ trước: so điểm trung bình với khoảng thời gian dài bằng nhau ngay trước đó.
 * Nội dung theo đúng mẫu "nhận xét.txt" của trung tâm; giáo viên sửa được trước khi gửi.
 */
import type { Assignment, AttendanceRecord, ClassRoom, Student, Submission } from '../types';
import { getAssignments, getAttendanceRecords, getSubmissions, isAssignmentForClass, isStudentMatch } from './assignmentService';

export type SkillKey = 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'speaking' | 'writing';

export const SKILL_LABELS: Record<SkillKey, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  reading: 'Reading',
  listening: 'Listening',
  speaking: 'Speaking',
  writing: 'Writing'
};

/** Mô tả kỹ năng dùng trong câu nhận xét / định hướng */
const SKILL_VI: Record<SkillKey, { name: string; strength: string; practice: string }> = {
  vocabulary: { name: 'từ vựng', strength: 'ghi nhớ và hiểu nghĩa từ vựng tốt', practice: 'Ôn từ vựng theo chủ đề mỗi ngày, đặt câu với từ mới' },
  grammar: { name: 'ngữ pháp', strength: 'nắm vững cấu trúc câu và chia động từ chính xác', practice: 'Luyện cấu trúc câu và cách chia động từ qua bài tập ngắn' },
  reading: { name: 'đọc hiểu', strength: 'đọc hiểu nội dung và tìm thông tin nhanh', practice: 'Đọc đoạn văn ngắn và trả lời câu hỏi đọc hiểu' },
  listening: { name: 'nghe hiểu', strength: 'nghe và nắm bắt thông tin chính tốt', practice: 'Nghe hội thoại / bài hát tiếng Anh ngắn 10–15 phút mỗi ngày' },
  speaking: { name: 'phát âm', strength: 'phát âm rõ ràng, tự tin', practice: 'Luyện phát âm theo mẫu và tập nói câu hoàn chỉnh' },
  writing: { name: 'viết', strength: 'viết câu đúng cấu trúc', practice: 'Luyện viết câu và đoạn văn ngắn theo chủ đề' }
};

/** Nội dung cụ thể cần cải thiện cho kỹ năng yếu nhất */
const SKILL_FOCUS: Record<SkillKey, string> = {
  vocabulary: 'ghi nhớ nghĩa và cách dùng từ mới trong câu',
  grammar: 'chia động từ và sắp xếp trật tự từ trong câu',
  reading: 'đọc kỹ đề và tìm ý chính của đoạn văn',
  listening: 'nghe hiểu câu và đoạn hội thoại ngắn',
  speaking: 'phát âm chuẩn các âm khó và nói thành câu hoàn chỉnh',
  writing: 'viết câu đúng ngữ pháp và dùng từ phù hợp'
};

export interface ReportPeriod {
  from: string;   // YYYY-MM-DD (bao gồm)
  to: string;     // YYYY-MM-DD (bao gồm)
  label: string;  // "Tháng 10/2026" ...
}

export interface StudentReport {
  student: Student;
  className: string;
  period: ReportPeriod;
  skills: Partial<Record<SkillKey, number>>;   // thang 10, 1 chữ số thập phân
  average: number | null;
  rank: string;                                 // Xuất sắc / Tốt / Khá / Đạt / Cần củng cố
  attendanceRate: number | null;                // %
  attendanceSessions: number;
  completionRate: number | null;                // %
  assignedCount: number;
  doneCount: number;
  previousAverage: number | null;
  attitude: string;
  progress: string;
  comment: string;                              // đoạn 1. NHẬN XÉT CHUNG (giáo viên sửa được)
  focus: string[];                              // 2 nội dung cần luyện
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',');
const inRange = (dateStr: string | undefined, p: { from: string; to: string }) => {
  const d = (dateStr || '').slice(0, 10);
  return !!d && d >= p.from && d <= p.to;
};
const localYmd = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return (iso || '').slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const rankOf = (avg: number | null): string => {
  if (avg === null) return 'Chưa đủ dữ liệu';
  if (avg >= 9) return 'Xuất sắc';
  if (avg >= 8) return 'Tốt';
  if (avg >= 6.5) return 'Khá';
  if (avg >= 5) return 'Đạt';
  return 'Cần củng cố';
};

/** Số câu từng phần của một bài tập (để quy đổi số câu đúng sang thang 10) */
const sectionTotals = (a?: Assignment) => {
  const p: any = a?.lessonPlan?.practice || {};
  const m: any = p.megaTest || {};
  const len = (x: any) => (Array.isArray(x) ? x.length : 0);
  return {
    mc: len(m.multipleChoice), readingMC: len(m.readingMC), pronunciation: len(m.pronunciation),
    scramble: len(m.scramble), fill: len(m.fillBlank), vocab: len(m.vocabTranslation),
    tf: len(m.trueFalse), listen: len(p.listening), readingFill: len(m.readingFill)
  };
};

const SKILL_SOURCES: Record<Exclude<SkillKey, 'writing'>, string[]> = {
  vocabulary: ['vocab'],
  grammar: ['mc', 'scramble'],
  reading: ['readingMC', 'tf', 'fill', 'readingFill'],
  listening: ['listen'],
  speaking: ['pronunciation']
};

const skillScoresFrom = (subs: Submission[], assignmentsById: Map<string, Assignment>) => {
  const acc: Record<string, { correct: number; total: number }> = {};
  subs.forEach(s => {
    const ss: any = s.skillScores || {};
    const totals: any = sectionTotals(assignmentsById.get(s.assignmentId));
    Object.keys(totals).forEach(k => {
      const total = totals[k];
      if (!total) return;
      const correct = Math.max(0, Math.min(total, Number(ss[k]) || 0));
      acc[k] = acc[k] || { correct: 0, total: 0 };
      acc[k].correct += correct;
      acc[k].total += total;
    });
  });
  const skills: Partial<Record<SkillKey, number>> = {};
  (Object.keys(SKILL_SOURCES) as Array<keyof typeof SKILL_SOURCES>).forEach(skill => {
    let c = 0, t = 0;
    SKILL_SOURCES[skill].forEach(k => { if (acc[k]) { c += acc[k].correct; t += acc[k].total; } });
    if (t > 0) skills[skill] = round1((c / t) * 10);
  });
  return skills;
};

const averageOf = (skills: Partial<Record<SkillKey, number>>): number | null => {
  const vals = Object.values(skills).filter((v): v is number => typeof v === 'number');
  return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
};

/** Khoảng thời gian dài bằng nhau ngay trước kỳ đánh giá */
const previousPeriod = (p: ReportPeriod) => {
  const from = new Date(p.from + 'T00:00:00');
  const to = new Date(p.to + 'T00:00:00');
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: ymd(prevFrom), to: ymd(prevTo) };
};

/** Soạn đoạn "1. NHẬN XÉT CHUNG" theo mẫu của trung tâm */
export const composeComment = (r: Omit<StudentReport, 'comment' | 'focus'>): { comment: string; focus: string[] } => {
  const name = r.student.name;
  const ranked = (Object.entries(r.skills) as Array<[SkillKey, number]>).sort((a, b) => b[1] - a[1]);
  const strong = ranked.slice(0, 2).map(([k]) => k);
  const weakList = [...ranked].reverse();
  const weak = weakList[0]?.[0];
  const rankLower = r.rank === 'Chưa đủ dữ liệu' ? 'đang được theo dõi thêm' : `ở mức ${r.rank}`;

  const parts: string[] = [];
  parts.push(`Trong thời gian vừa qua, ${name} có thái độ học tập ${r.attitude} và đạt kết quả ${rankLower}.`);
  if (strong.length >= 2 && weak && !strong.includes(weak)) {
    parts.push(
      `Con có thế mạnh nổi bật ở ${SKILL_VI[strong[0]].name} và ${SKILL_VI[strong[1]].name}, thể hiện khả năng ${SKILL_VI[strong[0]].strength}. ` +
      `Bên cạnh đó, con cần tập trung cải thiện thêm ${SKILL_VI[weak].name}, đặc biệt là ${SKILL_FOCUS[weak]}.`
    );
  } else if (strong.length >= 1) {
    parts.push(`Con có thế mạnh ở ${SKILL_VI[strong[0]].name}, thể hiện khả năng ${SKILL_VI[strong[0]].strength}.`);
  }
  parts.push(`So với kỳ đánh giá trước, kết quả của con ${r.progress}.`);
  parts.push('Trung tâm khuyến khích con tiếp tục duy trì tinh thần học tập, chủ động luyện tập thường xuyên và dành thêm thời gian cho các kỹ năng còn hạn chế.');

  const focus = weakList.slice(0, 2).map(([k]) => SKILL_VI[k].practice);
  while (focus.length < 2) focus.push(focus.length === 0 ? 'Hoàn thành đầy đủ bài tập trên app sau mỗi buổi học' : 'Ôn lại từ vựng và mẫu câu của bài đã học');
  return { comment: parts.join('\n\n'), focus };
};

export const buildStudentReport = (student: Student, cls: ClassRoom | undefined, period: ReportPeriod): StudentReport => {
  const allAssignments = getAssignments();
  const assignmentsById = new Map(allAssignments.map(a => [a.id, a]));
  const classKey = cls?.id || student.classId;
  const classAssignments = allAssignments.filter(a => isAssignmentForClass(a, classKey));
  const mySubs = getSubmissions().filter(s => isStudentMatch(student, s));

  const subsIn = (p: { from: string; to: string }) => mySubs.filter(s => inRange(localYmd(s.submittedAt), p));

  // Điểm kỹ năng kỳ này & kỳ trước
  const skills = skillScoresFrom(subsIn(period), assignmentsById);
  const average = averageOf(skills);
  const prev = previousPeriod(period);
  const previousAverage = averageOf(skillScoresFrom(subsIn(prev), assignmentsById));

  // Hoàn thành bài tập: bài giao cho lớp trong kỳ — bỏ qua bài CHƯA tới hạn mà con chưa nộp (chưa tính là thiếu)
  const doneIds = new Set(mySubs.map(s => s.assignmentId));
  const nowMs = Date.now();
  const assigned = classAssignments.filter(a => {
    if (!inRange(a.assignedDate || localYmd(a.createdAt), period)) return false;
    if (doneIds.has(a.id)) return true;
    const due = a.dueDate ? new Date(a.dueDate).getTime() : NaN;
    return isNaN(due) || due < nowMs;
  });
  const doneCount = assigned.filter(a => doneIds.has(a.id)).length;
  const completionRate = assigned.length ? Math.round((doneCount / assigned.length) * 100) : null;

  // Chuyên cần
  const records: AttendanceRecord[] = getAttendanceRecords(classKey).filter(r => inRange(r.date, period));
  let sessions = 0, attended = 0;
  records.forEach(r => {
    const item = (r.records || []).find(x => x.studentId === student.id || (x.studentName || '').trim() === student.name.trim());
    if (!item) return;
    sessions++;
    if (item.status === 'present' || item.status === 'late') attended++;
  });
  const attendanceRate = sessions ? Math.round((attended / sessions) * 100) : null;

  // Thái độ học tập: dựa trên chuyên cần + hoàn thành bài
  const effort = [attendanceRate, completionRate].filter((x): x is number => x !== null);
  const effortAvg = effort.length ? effort.reduce((a, b) => a + b, 0) / effort.length : null;
  const attitude = effortAvg === null ? 'khá nghiêm túc' : effortAvg >= 90 ? 'tích cực' : effortAvg >= 70 ? 'khá nghiêm túc' : 'cần chủ động hơn';

  const progress =
    average === null || previousAverage === null ? 'duy trì ổn định'
      : average - previousAverage >= 0.5 ? 'có tiến bộ rõ rệt'
        : average - previousAverage <= -0.5 ? 'có một số kỹ năng cần được củng cố thêm'
          : 'duy trì ổn định';

  const base = {
    student, className: cls?.name || student.className, period, skills, average, rank: rankOf(average),
    attendanceRate, attendanceSessions: sessions, completionRate, assignedCount: assigned.length, doneCount,
    previousAverage, attitude, progress
  };
  return { ...base, ...composeComment(base) };
};

/** Tin nhắn hoàn chỉnh theo mẫu "nhận xét.txt" */
export const formatReportMessage = (r: StudentReport): string => {
  const skillLine = (k: SkillKey) => {
    const v = r.skills[k];
    if (k === 'writing' && typeof v !== 'number') return null; // Writing: chỉ hiện khi có điểm
    return `${SKILL_LABELS[k]}: ${typeof v === 'number' ? fmt(v) : 'Chưa có dữ liệu'}`;
  };
  const lines = (['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing'] as SkillKey[])
    .map(skillLine).filter(Boolean) as string[];

  return [
    'ENGLISH LEGEND X5 THÔNG BÁO',
    'KẾT QUẢ HỌC TẬP CỦA HỌC SINH',
    '',
    `Họ và tên: ${r.student.name}${r.student.englishName ? ` (${r.student.englishName})` : ''}`,
    `Lớp: ${r.className}`,
    `Thời gian đánh giá: ${r.period.label}`,
    '',
    '1. NHẬN XÉT CHUNG',
    '',
    r.comment.trim(),
    '',
    '2. KẾT QUẢ ĐÁNH GIÁ',
    '',
    ...lines,
    '',
    `Điểm trung bình: ${r.average === null ? 'Chưa có dữ liệu' : fmt(r.average)}`,
    `Xếp loại: ${r.rank}`,
    '',
    `Chuyên cần: ${r.attendanceRate === null ? 'Chưa có dữ liệu điểm danh' : `${r.attendanceRate}%`}`,
    `Hoàn thành bài tập: ${r.completionRate === null ? 'Chưa có bài giao trong kỳ' : `${r.completionRate}%`}`,
    '',
    '3. ĐỊNH HƯỚNG THỜI GIAN TỚI',
    '',
    'Con nên ưu tiên:',
    ...r.focus.map(f => `- ${f}`),
    '- Duy trì thói quen học và ôn tập tiếng Anh hằng ngày.',
    '',
    'Trung tâm tin rằng với sự đồng hành của gia đình và sự cố gắng của con, kết quả học tập trong thời gian tới sẽ tiếp tục được cải thiện.'
  ].join('\n');
};

/** Chuẩn hóa số điện thoại VN cho link Zalo (zalo.me/0xxxxxxxxx). Trả null nếu không hợp lệ. */
export const zaloPhone = (raw?: string): string | null => {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+84')) d = '0' + d.slice(3);
  else if (d.startsWith('84') && d.length === 11) d = '0' + d.slice(2);
  return /^0\d{9}$/.test(d) ? d : null;
};

export const monthPeriod = (year: number, month: number): ReportPeriod => {
  const p = (n: number) => String(n).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${p(month)}-01`, to: `${year}-${p(month)}-${p(last)}`, label: `Tháng ${month}/${year}` };
};
