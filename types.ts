
export type QuizDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface VocabularyItem {
  word: string;
  emoji: string;
  ipa: string;
  meaning: string;
  example: string;
  sentenceMeaning: string;
  type: string;
}

export interface GrammarSection {
  topic: string;
  explanation: string;
  examples: string[];
}

export interface ListeningQ {
  id: string;
  audioText: string;
  sentenceWithBlank?: string;            // Câu hoặc đoạn có ô trống, ví dụ "I have a new ______."
  missingWord?: string;                  // Từ cần điền vào ô trống, ví dụ "school bag"
  alternativeAnswers?: string[];         // Các từ đồng nghĩa hoặc cách viết khác hợp lệ
  options?: string[];                    // Tương thích ngược với bài tập cũ
  correctAnswer?: number;                // Tương thích ngược với bài tập cũ
  alternativeCorrectAnswers?: number[];  // Other correct option indices (grammar equivalents)
  explanation: string;
}

export interface MultipleChoiceQ {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  alternativeCorrectAnswers?: number[];  // Other correct option indices (grammar equivalents)
  explanation: string;
}

export interface SpeakingQ {
  id: string;
  question: string;
  suggestedAnswer: string;
}

export interface ScrambleQ {
  id: string;
  scrambled: string[];
  correctSentence: string;
  translation: string;
}

export interface FillInputQ {
  id: string;
  question: string;
  correctAnswer: string;
  alternativeAnswers?: string[];  // Alternative correct answers (e.g., ["though"] when correctAnswer is "although")
  clueEmoji: string;
  explanation?: string;
}

export interface ErrorIdQ {
  id: string;
  sentence: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface VocabTranslationQ {
  id: string;
  word: string;           // English word
  options: string[];      // 4 Vietnamese meaning options
  correctAnswer: number;  // Index of correct option (0-3)
  alternativeCorrectAnswers?: number[];  // Other correct option indices
  explanation?: string;
}

export interface TrueFalseQ {
  id: string;
  statement: string;      // Statement about the passage
  isTrue: boolean;        // True or False
  explanation: string;    // Vietnamese explanation
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface ReadingFillBlankQ {
  id: string;
  question: string;                      // Câu có ô trống "____" dựa trên bài đọc
  correctAnswer: string;                 // Từ đúng cần điền vào ô trống
  alternativeAnswers?: string[];         // Các dạng viết khác hoặc từ tương đương hợp lệ
  options?: string[];                    // 4 từ gợi ý (Word Bank) để học sinh bấm chọn nhanh
  clueEmoji?: string;                    // Emoji gợi ý
  explanation: string;                   // Lời giải thích tiếng Việt trích dẫn từ bài đọc
}

export interface ReadingMCQ {
  id: string;
  question: string;
  options: string[];                     // 4 options [A, B, C, D]
  correctAnswer: number;                 // Index of correct option (0-3)
  alternativeCorrectAnswers?: number[];
  explanation: string;                   // Dẫn chứng trích dẫn từ bài đọc
}

export interface PronunciationQ {
  id: string;
  question: string;                      // e.g. "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:"
  targetSound?: string;                  // e.g. "Âm /s/ - /z/" hoặc "Nguyên âm /e/"
  underlinedPart?: string;               // Ký tự gạch chân xét âm: "a", "e", "-s", "-ed", "ch"...
  options: string[];                     // 4 từ gốc: ["cat", "hat", "bag", "father"]
  displayOptions?: string[];             // 4 từ có đánh dấu gạch chân HTML: ["c<u>a</u>t", "h<u>a</u>t", "b<u>a</u>g", "f<u>a</u>ther"]
  correctAnswer: number;                 // Index of odd word (0-3)
  alternativeCorrectAnswers?: number[];
  explanation: string;                   // Phiên âm IPA của cả 4 từ và giải thích chi tiết
}

export interface ReadingAdventure {
  title: string;
  passage: string;
  translation: string;
  comprehension: ReadingFillBlankQ[];    // 5 câu đọc hiểu điền từ
}

export interface HomeworkTask {
  title: string;
  description: string;
  instructions: string;
}

export interface PracticeContent {
  listening: ListeningQ[];
  megaTest: {
    multipleChoice: MultipleChoiceQ[];
    scramble: ScrambleQ[];
    readingMCPassage?: string;             // Đoạn văn bài đọc hiểu trắc nghiệm ABCD
    readingMC?: ReadingMCQ[];              // 5 câu bài đọc chọn đáp án ABCD
    pronunciation?: PronunciationQ[];      // 5 câu tìm từ có cách đọc khác
    fillBlank?: FillInputQ[];              // deprecated/backward compat for older assignments
    errorId?: ErrorIdQ[];                  // deprecated, kept for backward compat
    vocabTranslation: VocabTranslationQ[]; // 10 vocab questions
    trueFalse: TrueFalseQ[];               // 5 true/false questions
    trueFalsePassage?: string;             // Fixed reading passage for True/False questions
    readingFill?: ReadingFillBlankQ[];     // 5 câu đọc hiểu điền từ
    matching: MatchingPair[];
  };
}

export interface LessonPlan {
  topic: string;
  vocabulary: VocabularyItem[];
  grammar: GrammarSection;
  reading: ReadingAdventure;
  homework: HomeworkTask;
  practice: PracticeContent;
  teacherTips: string;
}

export enum AppMode {
  ANALYSIS = 'analysis',
  CREATIVE = 'creative'
}

export interface MindMapData {
  center: {
    title_en: string;
    title_vi: string;
    emoji?: string;
  };
  nodes: Array<{
    text_en: string;
    text_vi: string;
    emoji?: string;
    color?: string;
  }>;
}

export enum MindMapMode {
  TOPIC = 'TOPIC',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export interface FillBlankQuestion {
  sentence: string;
  answer: string;
  options: string[];
  explanation?: string;
}

export interface ContentResult {
  storyEnglish: string;
  translatedText: string;
  writingPromptEn: string;
  writingPromptVi: string;
  vocabulary: VocabularyItem[];
  imagePrompt: string;
  comprehensionQuestions: MultipleChoiceQ[];
  speakingQuestions: SpeakingQ[];
}

export interface PresentationScript {
  introduction: { english: string; vietnamese: string; };
  body: Array<{ keyword: string; script: string; }>;
  conclusion: { english: string; vietnamese: string; };
}

export interface SpeechEvaluation {
  scores: {
    pronunciation: number;
  };
  overallScore: number;
  feedback: string;
}

export enum LoadingStep {
  IDLE = 'Idle',
  ANALYZING = 'Analyzing content...',
  GENERATING_IMAGE = 'Generating magic image...',
  GENERATING_AUDIO = 'Creating Legend X5\'s voice...',
  COMPLETED = 'Completed!'
}

export interface CharacterProfile {
  id: string;
  name: string;
  emoji: string;
  promptContext: string;
  stylePrompt: string;
  colorClass: string;
}

export type ImageRatio = '1:1' | '16:9' | '9:16';

export interface AppState {
  selectedCharacter: CharacterProfile;
  selectedMode: AppMode;
  selectedRatio: ImageRatio;
  customPrompt: string;
  originalImages: string[];
  generatedImage: string | null;
  audioUrl: string | null;
  contentResult: ContentResult | null;
  isLoading: boolean;
  loadingStep: LoadingStep;
  error: string | null;
}

// ─── Learning History ───────────────────────────────────────
export interface LessonRecord {
  id: string;
  date: string;           // ISO string
  topic: string;
  score: number;           // 0-10
  totalCorrect: number;
  totalQuestions: number;
  skillScores: {
    mc: number;
    scramble: number;
    fill: number;
    vocab: number;
    tf: number;
    listen: number;
  };
  studentName: string;
}

export interface WeeklyReport {
  weekLabel: string;       // e.g. "10/02 - 16/02"
  weekStart: string;       // ISO
  weekEnd: string;         // ISO
  lessonCount: number;
  averageScore: number;
  topics: string[];
  progress: 'up' | 'down' | 'same' | 'none'; // compared to previous week
  prevAverage: number | null;
}

// ─── AI Provider & Roles ───────────────────────────────────
export type AiProvider = 'gemini' | 'agent-platform';

export type UserRole = 'teacher' | 'student';

export interface AuthUser {
  authStamp?: string; // giáo viên: phiên bản mật khẩu trên hệ thống lúc đăng nhập
  teacherAccountId?: string; // có giá trị = giáo viên do quản trị tạo (không phải tài khoản quản trị)
  phone?: string;
  id: string;
  username: string;
  role: UserRole;
  name: string;
  avatar?: string;
  classId?: string;
  className?: string;
}

export interface ClassRoom {
  id: string;
  name: string;             // VD: "6A1", "7B2", "8A3"
  grade: number;            // 0 = Mầm non, 1–12; dùng gradeLabel nếu tự nhập
  gradeLabel?: string;      // Khối / cấp độ tự nhập: "Starters", "IELTS 5.0", "Người lớn"...
  description?: string;
  studentCount?: number;
  createdAt: string;
  updatedAt?: string;
  teacherModifiedAt?: string;
  teacherModified?: boolean;
}

export interface Student {
  id: string;
  name: string;             // Họ và tên
  englishName?: string;     // Tên tiếng Anh (E.NAME: Kelvin, Elsa, Harry...)
  phone?: string;           // Số điện thoại phụ huynh
  classId: string;
  className: string;
  avatar?: string;
  rollNumber?: string;
  notes?: string;
  password?: string;        // Mật khẩu tài khoản do giáo viên tạo (mặc định: '123')
  username?: string;        // Tên đăng nhập (mặc định sinh từ tên hoặc mã học sinh)
  createdAt: string;
  updatedAt?: string;       // Thời gian cập nhật thông tin gần nhất
  teacherModifiedAt?: string; // Thời gian giáo viên trực tiếp sửa trên website
  teacherModified?: boolean;  // Đánh dấu giáo viên đã can thiệp/sửa đổi trực tiếp
  status?: 'active' | 'dropped_out'; // Trạng thái học tập
}

export interface DeletedStudentRecord {
  id: string;
  name: string;
  englishName?: string;
  phone?: string;
  classId: string;
  className: string;
  avatar?: string;
  notes?: string;
  password?: string;
  deletedAt: string;        // Thời gian giáo viên bấm xóa vĩnh viễn
  reason?: string;          // Lý do (mặc định: Học sinh nghỉ học / chuyển trường)
}

export interface DeletedClassRecord {
  id: string;
  name?: string;
  deletedAt: string;
  reason?: string;
}

export interface DeletedAssignmentRecord {
  id: string;
  title?: string;
  deletedAt: string;
  reason?: string;
}

// ─── Preserved Exam (Đề Thi Giữ Nguyên Gốc) Types ──────────
export type ExamQuestionType =
  | 'multiple_choice'       // Trắc nghiệm (A, B, C, D)
  | 'fill_blank'             // Điền từ vào chỗ trống
  | 'sentence_rewrite'       // Viết lại câu
  | 'word_form'              // Dạng của từ / chia động từ
  | 'true_false'             // Đúng / Sai
  | 'matching'               // Nối cột
  | 'short_answer';          // Tự luận ngắn / trả lời câu hỏi

export interface ExamQuestion {
  id: string;
  number: string;                  // VD: "Câu 1", "Question 1"
  sectionTitle?: string;           // VD: "PART A: PHONETICS"
  sectionInstruction?: string;     // VD: "Choose the word whose underlined part..."
  passage?: string;                // Bài đọc hiểu đi kèm câu hỏi này nếu có
  questionText: string;            // Nội dung câu hỏi
  type: ExamQuestionType;
  options?: string[];              // Các phương án lựa chọn A, B, C, D (cho trắc nghiệm)
  correctAnswer: string;           // Đáp án đúng (VD: "A", "beautiful", "True")
  alternativeAnswers?: string[];   // Các cách viết tương đương hợp lệ (viết tắt, từ đồng nghĩa)
  explanation?: string;            // Lời giải thích / dịch nghĩa chi tiết
  points: number;                  // Điểm của câu (VD: 0.25, 0.5, 1)
  originalPointsText?: string;     // VD: "(0.25 pt)"
}

export interface ExamSection {
  title: string;                   // VD: "PART 1: PHONETICS", "SECTION B: READING"
  instruction?: string;            // Hướng dẫn làm bài của phần này
  passage?: string;                // Bài đọc chung cho cả phần (nếu có)
  questions: ExamQuestion[];
}

export interface PreservedExam {
  id: string;
  title: string;                   // Tiêu đề đề thi (VD: "ĐỀ KIỂM TRA GIỮA HỌC KỲ 1 TIẾNG ANH 7")
  schoolOrSource?: string;         // Thông tin trường / mã đề / năm học
  durationMinutes?: number;        // Thời gian làm bài tính bằng phút (VD: 45, 60, 90)
  originalMaxScore: number;        // Thang điểm gốc của đề (VD: 10, 20, 50, 100)
  targetScale: 10 | 'original';    // Chế độ chấm: Thang điểm 10 hay Thang điểm gốc
  instructions?: string;           // Hướng dẫn chung
  totalQuestions: number;
  sections: ExamSection[];
  hasAnswerKey: boolean;           // Đề có sẵn đáp án từ file gốc không
  rawText?: string;                // Văn bản thô của đề thi
  createdAt: string;
}

export interface Assignment {
  id: string;
  title: string;
  topic: string;
  assignedDate: string;     // YYYY-MM-DD
  dueDate: string;          // ISO string or YYYY-MM-DDTHH:mm
  targetClassId: string;    // ID of ClassRoom, 'ALL', or 'MULTI'
  targetClassName: string;  // e.g. "Lớp 6A1" or "Tất cả các lớp" or "Lớp 6A1, Lớp 6A2"
  targetClassIds?: string[]; // Array of selected class IDs
  targetClassNames?: string[]; // Array of selected class names
  teacherNote?: string;     // Lời dặn dò của thầy cô
  lessonPlan: LessonPlan;   // Nội dung chi tiết bài soạn (Từ vựng, Ngữ pháp, Bài đọc, Bài tập)
  assignmentType?: 'lesson' | 'exam'; // 'lesson' = Bài học thông thường, 'exam' = Đề thi giữ nguyên gốc
  examData?: PreservedExam; // Dữ liệu đề thi bảo toàn gốc khi assignmentType === 'exam'
  createdAt: string;
  updatedAt?: string;
  teacherModifiedAt?: string;
  teacherModified?: boolean;
}

export type DeadlineStatus = 'active' | 'due_soon' | 'expired' | 'submitted';

export interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  topic: string;
  studentId?: string;
  studentName: string;
  studentClass: string;
  submittedAt: string;      // ISO string
  score: number;            // 0 - 10
  totalCorrect: number;
  totalQuestions: number;
  skillScores: {
    mc: number;
    scramble: number;
    fill: number;
    vocab: number;
    tf: number;
    listen: number;
  };
  evaluation: {
    text: string;
    emoji: string;
    level: string;
    praise: string;
  };
  answers?: Record<string, any>;
  teacherFeedback?: string;
  // Các trường bổ sung cho Đề thi giữ nguyên gốc
  assignmentType?: 'lesson' | 'exam';
  examScore?: number;                   // Điểm theo thang điểm gốc của đề (VD: 45/50)
  examMaxScore?: number;                // Thang điểm gốc tối đa (VD: 50)
  scaledScore10?: number;               // Điểm chuẩn hóa theo thang điểm 10 (VD: 9.0)
  examAnswers?: Record<string, string>; // Chi tiết câu trả lời của học sinh: questionId -> answer
  // Quản lý nộp bài quá hạn
  isLate?: boolean;                     // Đánh dấu nộp bài quá hạn (bị phạt trừ điểm)
  rawScore?: number;                    // Điểm gốc trước khi trừ phạt quá hạn
  penaltyPoints?: number;               // Điểm bị trừ (mặc định 2 điểm khi quá hạn)
}

export interface DailySummary {
  date: string;
  totalAssigned: number;
  totalSubmitted: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  submissionRate: number;    // %
  submissions: Submission[];
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

// ─── Monthly Summary Report Types ─────────────────────────
export interface MonthlySessionColumn {
  key: string;               // e.g. "videoBtvn", "btvn", "oldLesson", "onlineTest"
  label: string;             // e.g. "Video BTVN", "BTVN", "Kiểm tra bài cũ"
  maxScore?: number;         // default 10
}

export interface MonthlySessionConfig {
  id: string;                // e.g. "session_1"
  name: string;              // e.g. "Buổi học 1"
  date: string;              // e.g. "05/08/2026"
  dayLabel?: string;         // e.g. "Thứ Năm", "T5"
  timeSlot?: string;         // e.g. "17:30 - 19:00"
  isManualDate?: boolean;    // true if teacher explicitly manually edited this single date
  colorTheme?: string;       // Pastel color name/class
  columns: MonthlySessionColumn[];
}

export interface StudentMonthlyScore {
  studentId: string;
  studentName: string;
  englishName?: string;
  scores: Record<string, Record<string, number | string>>; // sessionId -> columnKey -> score (keeps exact teacher input)
  averageScore: number;      // Calculated 2 decimal places
  rank?: number;
}

export interface MonthlyReport {
  id: string;
  classId: string;
  className: string;
  month: number;             // 1 - 12
  year: number;              // e.g. 2026
  centerName: string;        // e.g. "ENGLISH LEGEND X5"
  sessions: MonthlySessionConfig[];
  studentScores: StudentMonthlyScore[];
  updatedAt: string;
}

// ─── Annual Summary Report Types ──────────────────────────
export interface StudentAnnualScore {
  studentId: string;
  studentName: string;
  englishName?: string;
  monthlyScores: Record<number, number | null>; // month 1-12 -> averageScore or null
  annualAverage: number;                       // 0 - 10, calculated 2 decimal places
  completedMonthsCount: number;                // how many months have valid scores
  rank?: number;                               // rank in class
  classification: 'Xuất sắc' | 'Giỏi' | 'Khá' | 'Trung bình' | 'Cần cố gắng';
  teacherRemarks?: string;                     // Lời phê tổng kết năm của Thầy Cô
}

export interface AnnualReport {
  id: string;                                  // e.g. "annual_classId_year"
  classId: string;
  className: string;
  year: number;                                // e.g. 2026
  centerName: string;                          // e.g. "ENGLISH LEGEND X5"
  studentScores: StudentAnnualScore[];
  generalNote?: string;                        // Nhận xét chung của lớp trong năm
  updatedAt: string;
}

// ─── Weekly Summary Report Types ──────────────────────────
export interface WeeklySessionConfig {
  id: string;                // e.g. "w_sess_1"
  name: string;              // e.g. "Buổi 1 (Thứ 2)"
  date: string;              // e.g. "04/08/2026"
  colorTheme?: string;
  columns: MonthlySessionColumn[];
}

export interface StudentWeeklyScore {
  studentId: string;
  studentName: string;
  englishName?: string;
  scores: Record<string, Record<string, number | string>>; // sessionId -> columnKey -> score
  averageScore: number;      // Calculated 2 decimal places
  rank?: number;
}

export interface WeeklyReportRecord {
  id: string;
  classId: string;
  className: string;
  year: number;              // e.g. 2026
  month: number;             // 1 - 12
  weekNumber: number;        // 1 - 5
  weekLabel: string;         // e.g. "Tuần 1 (01/08 - 07/08)"
  centerName: string;        // e.g. "ENGLISH LEGEND X5"
  sessions: WeeklySessionConfig[];
  studentScores: StudentWeeklyScore[];
  updatedAt: string;
}

// ─── Class Schedule & Attendance Types ───────────────────
export interface WeeklyTimeSlot {
  id: string;
  dayOfWeek: number;         // 2: Thứ Hai, 3: Thứ Ba, ..., 7: Thứ Bảy, 1: Chủ Nhật
  dayLabel: string;          // e.g. "Thứ Hai"
  startTime: string;         // e.g. "17:30"
  endTime: string;           // e.g. "19:00"
  room?: string;             // e.g. "Phòng A1", "Phòng Zoom 1"
  notes?: string;
}

export interface ClassScheduleConfig {
  id: string;
  classId: string;
  className: string;
  sessionsPerWeek: number;   // e.g. 2, 3
  slots: WeeklyTimeSlot[];
  roomDefault?: string;
  notes?: string;
  updatedAt: string;
}

export type AttendanceStatus = 'present' | 'absent_excused' | 'absent_unexcused' | 'late';

export interface AttendanceStudentItem {
  studentId: string;
  studentName: string;
  englishName?: string;
  avatar?: string;
  rollNumber?: string;
  status: AttendanceStatus;
  note?: string;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  className: string;
  date: string;              // YYYY-MM-DD
  dayOfWeek?: number;        // 1 - 7
  dayLabel?: string;         // e.g. "Thứ Hai"
  timeSlot?: string;         // e.g. "17:30 - 19:00"
  lessonTopic?: string;      // Nội dung / chủ đề buổi học
  records: AttendanceStudentItem[];
  summary: {
    total: number;
    present: number;
    absentExcused: number;
    absentUnexcused: number;
    late: number;
    rate: number;            // % đi học
  };
  updatedAt: string;
}


