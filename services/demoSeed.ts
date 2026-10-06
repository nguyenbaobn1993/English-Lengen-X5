/**
 * Dữ liệu mẫu cho BẢN DEMO (chỉ dùng trong chế độ demo, nằm trên trình duyệt).
 * Ngày tháng tính theo hôm nay để bảng điều khiển luôn có số liệu "đang diễn ra".
 */
import type {
  Assignment, AttendanceRecord, AttendanceStatus, ClassRoom, ClassScheduleConfig,
  LessonPlan, Student, Submission, VocabularyItem
} from '../types';
import { DEFAULT_SAMPLE_LESSON } from './assignmentService';
import { ensureCompletePracticeContent, ensureReadingComprehensionQuestions } from '../utils/practiceBuilder';
import { validateAndSanitizeLessonPlan } from '../utils/contentValidator';
import { DEMO_TEACHER_PASSWORD, DEMO_TEACHER_USERNAME } from './demoBoot';

// Ngẫu nhiên có hạt giống → dữ liệu demo lần nào cũng giống nhau
let seed = 20261006;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const DAY_LABELS: Record<number, string> = { 1: 'Chủ Nhật', 2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm', 6: 'Thứ Sáu', 7: 'Thứ Bảy' };
const jsDayToVn = (d: Date) => (d.getDay() === 0 ? 1 : d.getDay() + 1);
const noAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// ---------------- Lớp học ----------------
const CLASS_DEFS = [
  { id: 'demo_class_starters', name: 'Starters X5', grade: 3, description: '6–8 tuổi · Cambridge Pre-A1 Starters', slots: [[3, '17:30', '19:00'], [6, '17:30', '19:00']], room: 'Phòng Sư Tử' },
  { id: 'demo_class_movers', name: 'Movers X5', grade: 4, description: '8–10 tuổi · Cambridge A1 Movers', slots: [[2, '18:00', '19:30'], [5, '18:00', '19:30'], [7, '09:00', '10:30']], room: 'Phòng Vương Miện' },
  { id: 'demo_class_flyers', name: 'Flyers X5', grade: 5, description: '10–12 tuổi · Cambridge A2 Flyers', slots: [[4, '18:00', '19:30'], [1, '14:00', '15:30']], room: 'Phòng Ngôi Sao' }
] as const;

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const MIDDLE = ['Minh', 'Gia', 'Bảo', 'Khánh', 'Ngọc', 'Thảo', 'Hải', 'An', 'Phương', 'Đức'];
const GIVEN = ['Anh', 'Huy', 'Linh', 'Nam', 'Chi', 'Long', 'Vy', 'Khoa', 'My', 'Phúc', 'Tâm', 'Hân', 'Trúc', 'Quân', 'Hà', 'Nhi'];
const ENAMES = ['Anna', 'Ben', 'Candy', 'David', 'Emma', 'Felix', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kelvin', 'Lily', 'Mia', 'Noah', 'Olivia', 'Peter', 'Ruby', 'Sam', 'Tom', 'Zoe', 'Elsa', 'Harry', 'Leo', 'Daisy'];
const AVATARS = ['🦁', '🐯', '🐼', '🐰', '🦊', '🐨', '🐸', '🐧', '🦄', '🐻', '🐶', '🐱'];

// ---------------- Bài học mẫu ----------------
const v = (word: string, emoji: string, ipa: string, meaning: string, example: string, sentenceMeaning: string, type = 'noun'): VocabularyItem =>
  ({ word, emoji, ipa: ipa.replace(/^\/+|\/+$/g, ''), meaning, example, sentenceMeaning, type });

const buildLesson = (core: {
  topic: string; vocabulary: VocabularyItem[];
  grammar: LessonPlan['grammar']; readingTitle: string; passage: string; translation: string; tips: string;
}): LessonPlan => {
  const reading = { title: core.readingTitle, passage: core.passage, translation: core.translation, comprehension: [] as any[] };
  reading.comprehension = ensureReadingComprehensionQuestions(reading, core.vocabulary);
  const base = { topic: core.topic, vocabulary: core.vocabulary, grammar: core.grammar, reading, teacherTips: core.tips };
  const plan: LessonPlan = {
    ...base,
    homework: { title: `Ôn tập: ${core.topic}`, description: 'Học thuộc từ vựng và hoàn thành bài luyện tập', instructions: 'Làm bài trực tuyến trên app Legend X5' },
    practice: ensureCompletePracticeContent(null, base)
  };
  try { return validateAndSanitizeLessonPlan(plan); } catch { return plan; }
};

const LESSON_HOBBIES = (): LessonPlan => buildLesson({
  topic: 'Hobbies & Free Time',
  vocabulary: [
    v('play football', '⚽', '/pleɪ ˈfʊtbɔːl/', 'chơi bóng đá', 'He plays football in the afternoon.', 'anh ấy chơi bóng đá vào buổi chiều.', 'phrase'),
    v('ride a bike', '🚲', '/raɪd ə baɪk/', 'đi xe đạp', 'She rides a bike to school.', 'cô ấy đi xe đạp đến trường.', 'phrase'),
    v('read books', '📚', '/riːd bʊks/', 'đọc sách', 'My brother reads books before bed.', 'em trai tôi đọc sách trước khi ngủ.', 'phrase'),
    v('draw pictures', '🎨', '/drɔː ˈpɪktʃəz/', 'vẽ tranh', 'Mai likes to draw pictures of cats.', 'mai thích vẽ tranh về mèo.', 'phrase'),
    v('listen to music', '🎧', '/ˈlɪsn tə ˈmjuːzɪk/', 'nghe nhạc', 'They listen to music at the weekend.', 'họ nghe nhạc vào cuối tuần.', 'phrase'),
    v('go swimming', '🏊', '/ɡəʊ ˈswɪmɪŋ/', 'đi bơi', 'We go swimming in the summer.', 'chúng tôi đi bơi vào mùa hè.', 'phrase')
  ],
  grammar: {
    topic: 'Like + V-ing / to V (Nói về sở thích)',
    explanation: "Dùng 'like + V-ing' hoặc 'like + to V' để nói về sở thích. Với He/She, dùng 'likes'.",
    examples: ['I like reading books. → Tôi thích đọc sách.', 'She likes to ride a bike. → Cô ấy thích đi xe đạp.', 'What do you like doing? → Bạn thích làm gì?']
  },
  readingTitle: "Nam's Free Time",
  passage: 'Nam is ten years old. In his free time, he likes to play football with his friends. His sister Mai likes to draw pictures. On Sundays, they ride a bike in the park. In the evening, Nam reads books and listens to music.',
  translation: 'Nam mười tuổi. Lúc rảnh, Nam thích chơi bóng đá với bạn. Em gái Mai thích vẽ tranh. Chủ nhật, hai anh em đạp xe trong công viên. Buổi tối, Nam đọc sách và nghe nhạc.',
  tips: 'Cho học sinh kể 3 sở thích của mình bằng tiếng Anh trước khi làm bài.'
});

const LESSON_ANIMALS = (): LessonPlan => buildLesson({
  topic: 'Animals & Pets',
  vocabulary: [
    v('dog', '🐶', '/dɒɡ/', 'con chó', 'I have a big dog.', 'tôi có một con chó to.'),
    v('cat', '🐱', '/kæt/', 'con mèo', 'She has a cute cat.', 'cô ấy có một con mèo dễ thương.'),
    v('rabbit', '🐰', '/ˈræbɪt/', 'con thỏ', 'The rabbit eats carrots.', 'con thỏ ăn cà rốt.'),
    v('parrot', '🦜', '/ˈpærət/', 'con vẹt', 'The parrot can talk.', 'con vẹt biết nói.'),
    v('turtle', '🐢', '/ˈtɜːtl/', 'con rùa', 'The turtle walks slowly.', 'con rùa đi chậm.'),
    v('fish', '🐟', '/fɪʃ/', 'con cá', 'He has three fish.', 'anh ấy có ba con cá.')
  ],
  grammar: {
    topic: 'Have / Has (Nói về thú cưng)',
    explanation: "I/You/We/They dùng 'have'; He/She/It dùng 'has'. Câu hỏi: Do you have...? / Does he have...?",
    examples: ['I have a dog. → Tôi có một con chó.', 'She has a cat. → Cô ấy có một con mèo.', 'Does he have a rabbit? → Anh ấy có nuôi thỏ không?']
  },
  readingTitle: "Lily's Pets",
  passage: 'Lily has two pets. She has a cat and a rabbit. The cat is white and very cute. The rabbit likes to eat carrots. Her brother has a parrot. The parrot can talk and sing.',
  translation: 'Lily có hai thú cưng: một con mèo và một con thỏ. Con mèo màu trắng, rất dễ thương. Con thỏ thích ăn cà rốt. Anh trai Lily có một con vẹt biết nói và hát.',
  tips: 'Cho học sinh mang ảnh thú cưng (hoặc vẽ) và giới thiệu bằng 2–3 câu.'
});

const LESSON_FAMILY = (): LessonPlan => buildLesson({
  topic: 'My Family',
  vocabulary: [
    v('father', '👨', '/ˈfɑːðə/', 'bố', 'My father is a doctor.', 'bố tôi là bác sĩ.'),
    v('mother', '👩', '/ˈmʌðə/', 'mẹ', 'My mother is a teacher.', 'mẹ tôi là giáo viên.'),
    v('brother', '👦', '/ˈbrʌðə/', 'anh/em trai', 'I have one brother.', 'tôi có một anh trai.'),
    v('sister', '👧', '/ˈsɪstə/', 'chị/em gái', 'My sister likes singing.', 'em gái tôi thích hát.'),
    v('grandfather', '👴', '/ˈɡrænfɑːðə/', 'ông', 'My grandfather is seventy.', 'ông tôi bảy mươi tuổi.'),
    v('grandmother', '👵', '/ˈɡrænmʌðə/', 'bà', 'My grandmother cooks well.', 'bà tôi nấu ăn ngon.')
  ],
  grammar: {
    topic: 'This is my... / He is... / She is...',
    explanation: "Dùng 'This is my + người' để giới thiệu. Dùng 'He is / She is + nghề nghiệp/tính từ' để miêu tả.",
    examples: ['This is my mother. → Đây là mẹ tôi.', 'She is a teacher. → Mẹ là giáo viên.', 'He is very kind. → Ông ấy rất tốt bụng.']
  },
  readingTitle: 'My Family',
  passage: 'There are five people in my family. My father is a doctor and my mother is a teacher. I have one brother and one sister. My grandmother lives with us. She cooks very well.',
  translation: 'Gia đình tôi có năm người. Bố là bác sĩ, mẹ là giáo viên. Tôi có một anh trai và một em gái. Bà sống cùng chúng tôi và nấu ăn rất ngon.',
  tips: 'Khuyến khích học sinh vẽ cây gia đình và giới thiệu từng người.'
});

const countQuestions = (plan: LessonPlan) => {
  const p = plan.practice as any;
  const m = p?.megaTest || {};
  const len = (x: any) => (Array.isArray(x) ? x.length : 0);
  return len(p?.listening) + len(m.multipleChoice) + len(m.scramble) + len(m.readingMC) + len(m.pronunciation) +
    len(m.vocabTranslation) + len(m.trueFalse) + len(m.readingFill) + len(m.matching) || 40;
};

const evaluation = (s: number) => {
  if (s >= 9) return { text: 'XUẤT SẮC', emoji: '🏆', level: 'EXCELLENT', praise: 'Em là một ngôi sao sáng nhất lớp Legend X5!' };
  if (s >= 7) return { text: 'KHÁ GIỎI', emoji: '🌟', level: 'GREAT JOB', praise: 'Em làm bài rất tuyệt vời, tiếp tục phát huy nhé!' };
  if (s >= 5) return { text: 'CỐ GẮNG', emoji: '👍', level: 'GOOD EFFORT', praise: 'Em đã nỗ lực rất nhiều, Legend X5 tự hào về em!' };
  return { text: 'CẦN NỖ LỰC', emoji: '💪', level: 'KEEP IT UP', praise: 'Đừng nản lòng em nhé, bài sau mình làm tốt hơn nào!' };
};

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

const keyed = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map(x => [x.id, x]));

export const buildDemoDatabase = async (): Promise<any> => {
  seed = 20261006;
  const now = new Date();
  const today = at(now, 12);
  const iso = (d: Date) => d.toISOString();

  // Lớp
  const classes: ClassRoom[] = CLASS_DEFS.map(c => ({
    id: c.id, name: c.name, grade: c.grade, description: c.description, studentCount: 8,
    createdAt: iso(addDays(today, -120)), updatedAt: iso(addDays(today, -120))
  }));

  // Học sinh: 8 em mỗi lớp
  const students: Student[] = [];
  const usedNames = new Set<string>();
  let eIdx = 0;
  CLASS_DEFS.forEach((c, ci) => {
    for (let i = 0; i < 8; i++) {
      let name = '';
      do { name = `${pick(FAMILY)} ${pick(MIDDLE)} ${pick(GIVEN)}`; } while (usedNames.has(name));
      usedNames.add(name);
      const englishName = ENAMES[eIdx++ % ENAMES.length];
      students.push({
        id: `demo_std_${ci + 1}_${pad(i + 1)}`,
        name,
        englishName,
        phone: `0900000${ci + 1}${pad(i + 1)}`,
        classId: c.id,
        className: c.name,
        avatar: AVATARS[(ci * 8 + i) % AVATARS.length],
        rollNumber: pad(i + 1),
        password: '123',
        username: noAccent(name).toLowerCase().replace(/\s+/g, ''),
        createdAt: iso(addDays(today, -110)),
        status: 'active'
      });
    }
  });

  // Lịch học theo tuần
  const schedules: ClassScheduleConfig[] = CLASS_DEFS.map(c => ({
    id: `schedule_${c.id}`,
    classId: c.id,
    className: c.name,
    sessionsPerWeek: c.slots.length,
    roomDefault: c.room,
    slots: c.slots.map(([day, start, end], i) => ({
      id: `slot_${c.id}_${i + 1}`, dayOfWeek: day as number, dayLabel: DAY_LABELS[day as number],
      startTime: start as string, endTime: end as string, room: c.room
    })),
    updatedAt: iso(addDays(today, -100))
  }));

  // Bài giao
  const cls = (id: string) => classes.find(c => c.id === id)!;
  const assignmentDefs = [
    { id: 'demo_asg_school', title: 'Phiếu bài tập số 1 – My New School', lesson: () => DEFAULT_SAMPLE_LESSON, classIds: ['demo_class_starters', 'demo_class_movers', 'demo_class_flyers'], assigned: -14, due: -9, note: 'Các con nhớ bấm loa nghe phát âm từng từ trước khi làm bài nhé!' },
    { id: 'demo_asg_family', title: 'Đề kiểm tra 15 phút – My Family', lesson: LESSON_FAMILY, classIds: ['demo_class_movers'], assigned: -10, due: -6, note: 'Làm bài cẩn thận, đọc kỹ đề trước khi chọn đáp án.' },
    { id: 'demo_asg_hobbies', title: 'Bài tập về nhà – Hobbies & Free Time', lesson: LESSON_HOBBIES, classIds: ['demo_class_movers', 'demo_class_flyers'], assigned: -4, due: 3, note: 'Sau khi làm xong, con kể cho bố mẹ nghe 3 sở thích của mình bằng tiếng Anh nhé!' },
    { id: 'demo_asg_animals', title: 'Ôn tập Từ vựng – Animals & Pets', lesson: LESSON_ANIMALS, classIds: ['demo_class_starters'], assigned: 0, due: 4, note: 'Bài ôn tập nhẹ nhàng, con làm trong 15 phút là xong.' }
  ];
  const assignments: Assignment[] = assignmentDefs.map(d => {
    const lessonPlan = JSON.parse(JSON.stringify(d.lesson()));
    // App tự thêm dấu / quanh phiên âm
    (lessonPlan.vocabulary || []).forEach((w: any) => { if (w?.ipa) w.ipa = String(w.ipa).replace(/^\/+|\/+$/g, ''); });
    const names = d.classIds.map(id => cls(id).name);
    const multi = d.classIds.length > 1;
    const created = at(addDays(today, d.assigned), 8);
    return {
      id: d.id,
      title: d.title,
      topic: lessonPlan.topic,
      assignedDate: ymd(created),
      dueDate: `${ymd(addDays(today, d.due))}T21:00`,
      targetClassId: multi ? 'MULTI' : d.classIds[0],
      targetClassName: names.join(', '),
      targetClassIds: d.classIds,
      targetClassNames: names,
      teacherNote: d.note,
      lessonPlan,
      assignmentType: 'lesson',
      createdAt: iso(created),
      updatedAt: iso(created),
      teacherModifiedAt: iso(created),
      teacherModified: true
    } as Assignment;
  });

  // Bài nộp
  const submissions: Submission[] = [];
  assignments.forEach((a, ai) => {
    const def = assignmentDefs[ai];
    const total = countQuestions(a.lessonPlan);
    const assignedAt = at(addDays(today, def.assigned), 9);
    const dueAt = at(addDays(today, def.due), 21);
    const windowEnd = Math.min(dueAt.getTime(), now.getTime() - 30 * 60000);
    students.filter(s => def.classIds.includes(s.classId)).forEach((s, si) => {
      const doneRate = def.due < 0 ? 0.9 : def.assigned === 0 ? 0.35 : 0.65;
      if (rand() > doneRate) return;
      if (windowEnd <= assignedAt.getTime()) return;
      const late = def.due < 0 && rand() < 0.12;
      const t = late
        ? dueAt.getTime() + (2 + rand() * 30) * 3600000
        : assignedAt.getTime() + rand() * (windowEnd - assignedAt.getTime());
      const raw = Math.round((4 + Math.pow(rand(), 0.6) * 6) * 10) / 10;
      const rawScore = Math.min(10, raw);
      const score = late ? Math.max(0, Math.round((rawScore - 2) * 10) / 10) : rawScore;
      const sk = () => Math.round(Math.min(10, Math.max(0, rawScore + (rand() - 0.5) * 3)) * 10) / 10;
      submissions.push({
        id: `demo_sub_${ai + 1}_${s.id}`,
        assignmentId: a.id,
        assignmentTitle: a.title,
        topic: a.topic,
        studentId: s.id,
        studentName: s.name,
        studentClass: s.className,
        submittedAt: new Date(t).toISOString(),
        score,
        totalCorrect: Math.round((rawScore / 10) * total),
        totalQuestions: total,
        skillScores: { mc: sk(), scramble: sk(), fill: sk(), vocab: sk(), tf: sk(), listen: sk() },
        evaluation: evaluation(score),
        assignmentType: 'lesson',
        ...(late ? { isLate: true, rawScore, penaltyPoints: 2 } : {}),
        ...(si % 5 === 0 && score >= 8 ? { teacherFeedback: 'Con làm bài rất tốt, giữ vững phong độ nhé! 🌟' } : {})
      } as Submission);
    });
  });

  // Điểm danh 4 tuần gần nhất (đến hôm qua) theo lịch học
  const attendance: AttendanceRecord[] = [];
  const topics = ['Unit 1: My New School', 'Review Unit 1', 'Hobbies & Free Time', 'My Family', 'Speaking practice', 'Animals & Pets', 'Mini test'];
  CLASS_DEFS.forEach(c => {
    const roster = students.filter(s => s.classId === c.id);
    let topicIdx = 0;
    for (let back = 28; back >= 1; back--) {
      const day = addDays(today, -back);
      const vnDay = jsDayToVn(day);
      const slot = c.slots.find(sl => sl[0] === vnDay);
      if (!slot) continue;
      const records = roster.map(s => {
        const r = rand();
        const status: AttendanceStatus = r < 0.84 ? 'present' : r < 0.91 ? 'late' : r < 0.97 ? 'absent_excused' : 'absent_unexcused';
        return { studentId: s.id, studentName: s.name, englishName: s.englishName, avatar: s.avatar, rollNumber: s.rollNumber, status };
      });
      const count = (st: AttendanceStatus) => records.filter(r => r.status === st).length;
      const present = count('present'), late = count('late');
      attendance.push({
        id: `att_${c.id}_${ymd(day)}`,
        classId: c.id,
        className: c.name,
        date: ymd(day),
        dayOfWeek: vnDay,
        dayLabel: DAY_LABELS[vnDay],
        timeSlot: `${slot[1]} - ${slot[2]}`,
        lessonTopic: topics[topicIdx++ % topics.length],
        records,
        summary: {
          total: records.length,
          present,
          absentExcused: count('absent_excused'),
          absentUnexcused: count('absent_unexcused'),
          late,
          rate: Math.round(((present + late) / records.length) * 100)
        },
        updatedAt: iso(at(day, 20))
      });
    }
  });

  // Mật khẩu quản trị của bản demo (chỉ tồn tại trong trình duyệt)
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const iterations = 120000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(DEMO_TEACHER_PASSWORD), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array((salt.match(/.{2}/g) || []).map(h => parseInt(h, 16))), iterations },
    key, 256
  );

  return {
    _ping: {
      teacher_auth: {
        username: DEMO_TEACHER_USERNAME,
        displayName: 'Giáo viên Demo',
        salt,
        hash: toHex(bits),
        iterations,
        updatedAt: iso(addDays(today, -1))
      }
    },
    classes: keyed(classes),
    students: keyed(students),
    assignments: keyed(assignments),
    submissions: keyed(submissions),
    class_schedules: keyed(schedules),
    attendance_records: keyed(attendance)
  };
};
