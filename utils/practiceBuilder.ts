import {
  PracticeContent,
  MultipleChoiceQ,
  ScrambleQ,
  FillInputQ,
  VocabTranslationQ,
  TrueFalseQ,
  MatchingPair,
  ListeningQ,
  VocabularyItem,
  GrammarSection,
  ReadingAdventure,
  ReadingFillBlankQ,
  ReadingMCQ,
  PronunciationQ
} from '../types';
import { expandContractions, contractToShort } from './smartGrading';
import { validateAndSanitizePracticeContent, CURATED_PHONETICS_BANK, sanitizePronunciationQuestion } from './contentValidator';

/**
 * Generate contraction variations for an answer
 * e.g., "don't" -> ["do not"], "I am" -> ["I'm"]
 */
export const getAnswerVariations = (ans: string): string[] => {
  if (!ans || typeof ans !== 'string') return [];
  const clean = ans.trim();
  const variations = new Set<string>();

  const expanded = expandContractions(clean);
  if (expanded.toLowerCase() !== clean.toLowerCase()) {
    variations.add(expanded);
  }

  const contracted = contractToShort(clean);
  if (contracted.toLowerCase() !== clean.toLowerCase()) {
    variations.add(contracted);
  }

  // Common single-word equivalents
  const lower = clean.toLowerCase();
  if (lower === "'s") variations.add("is");
  if (lower === "is") variations.add("'s");
  if (lower === "'re") variations.add("are");
  if (lower === "are") variations.add("'re");
  if (lower === "'m") variations.add("am");
  if (lower === "am") variations.add("'m");
  if (lower === "cannot") variations.add("can't");
  if (lower === "can't") variations.add("cannot");

  return Array.from(variations).filter(v => v.toLowerCase() !== clean.toLowerCase());
};

// Fallback Vietnamese distractors for vocabulary translation
const FALLBACK_DISTRACTORS = [
  'học sinh', 'giáo viên', 'trường học', 'lớp học', 'bạn bè',
  'sách vở', 'bút mực', 'thước kẻ', 'gia đình', 'ngôi nhà',
  'màu sắc', 'thời gian', 'bữa ăn', 'thể thao', 'trò chơi',
  'xe đạp', 'cửa sổ', 'bàn học', 'thời tiết', 'âm nhạc'
];

/**
 * Ensures exactly 5 Reading Comprehension Fill-in-the-blank Questions ("5 câu đọc hiểu điền từ")
 * Based directly on the reading passage.
 */
export const ensureReadingComprehensionQuestions = (
  reading?: ReadingAdventure,
  vocabList: VocabularyItem[] = []
): ReadingFillBlankQ[] => {
  const existing: ReadingFillBlankQ[] = [];
  if (reading?.comprehension && Array.isArray(reading.comprehension)) {
    reading.comprehension.forEach((c: any, idx: number) => {
      const correctStr = typeof c.correctAnswer === 'string'
        ? c.correctAnswer.trim()
        : (Array.isArray(c.options) && typeof c.correctAnswer === 'number' ? (c.options[c.correctAnswer] || '').trim() : '');
      const questionText = (c.question || '').trim();
      const options = Array.isArray(c.options) && c.options.length > 0 ? c.options : undefined;

      if (correctStr || questionText) {
        existing.push({
          id: c.id || `rf_gen_${idx + 1}`,
          question: questionText.includes('____') ? questionText : `${questionText} (____)`,
          correctAnswer: correctStr || (options ? options[0] : 'answer'),
          alternativeAnswers: Array.from(new Set([
            ...(c.alternativeAnswers || []),
            correctStr,
            ...getAnswerVariations(correctStr)
          ])).filter(Boolean),
          options: options,
          clueEmoji: c.clueEmoji || '📖',
          explanation: c.explanation || 'Dựa vào thông tin chi tiết trong bài đọc hiểu.'
        });
      }
    });
  }

  // If fewer than 5, synthesize from reading passage sentences or vocabulary
  if (existing.length < 5) {
    const passage = reading?.passage || '';
    const sentences = passage.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 15);
    const existingIds = new Set(existing.map(q => q.id));

    sentences.forEach((sen, idx) => {
      if (existing.length >= 5) return;
      const qId = `rf_pass_${idx + 1}`;
      if (existingIds.has(qId)) return;

      const words = sen.split(/\s+/).filter(w => {
        const clean = w.replace(/[^\w]/g, '');
        return clean.length >= 4 && !/^(this|that|these|those|with|from|have|they|were|been|about|would|there)$/i.test(clean);
      });

      if (words.length > 0) {
        const targetWord = words[Math.floor(words.length / 2)].replace(/[^\w]/g, '');
        const regex = new RegExp(`\\b${targetWord}\\b`, 'i');
        const blanked = sen.replace(regex, '____');
        const distractors = vocabList.map(v => v.word).filter(w => w.toLowerCase() !== targetWord.toLowerCase()).slice(0, 3);
        const opts = [targetWord, ...distractors].sort(() => Math.random() - 0.5);

        existing.push({
          id: qId,
          question: blanked,
          correctAnswer: targetWord,
          alternativeAnswers: [targetWord, ...getAnswerVariations(targetWord)],
          options: opts.length >= 2 ? opts : undefined,
          clueEmoji: '📖',
          explanation: `Dựa vào bài đọc: "${sen}."`
        });
        existingIds.add(qId);
      }
    });

    // If still fewer than 5, generate from vocabulary items
    vocabList.forEach((v, idx) => {
      if (existing.length >= 5) return;
      const qId = `rf_vocab_${idx + 1}`;
      if (existingIds.has(qId)) return;

      const sen = v.example || `I like my ${v.word}.`;
      const regex = new RegExp(`\\b${v.word}\\b`, 'i');
      const blanked = sen.replace(regex, '____');
      const otherWords = vocabList.filter(o => o.word !== v.word).map(o => o.word).slice(0, 3);
      const opts = [v.word, ...otherWords].sort(() => Math.random() - 0.5);

      existing.push({
        id: qId,
        question: blanked !== sen ? blanked : `Điền từ thích hợp: I have a new ____ (${v.meaning}).`,
        correctAnswer: v.word,
        alternativeAnswers: [v.word, ...getAnswerVariations(v.word)],
        options: opts.length >= 2 ? opts : undefined,
        clueEmoji: v.emoji || '📖',
        explanation: `Từ vựng trong bài: "${v.word}" có nghĩa là "${v.meaning}".`
      });
      existingIds.add(qId);
    });
  }

  return existing.slice(0, 5);
};

/**
 * Ensures exactly 5 Reading Comprehension Multiple Choice Questions (A, B, C, D)
 * Based directly on reading passage and lesson theme.
 */
export const ensureReadingMCQuestions = (
  rawQuestions?: any[],
  passage?: string,
  topic?: string,
  vocabList: VocabularyItem[] = []
): { passage: string; questions: ReadingMCQ[] } => {
  const defaultPassage = passage && passage.trim().length > 20
    ? passage.trim()
    : `We learn English with Legend X5 every day at school. Learning English is exciting and helps us communicate with friends around the world. We practice vocabulary, pronunciation, and reading in every lesson. Reading interesting stories and doing exercises help us remember grammar rules and improve our skills. Everyone enjoys studying together and trying our best to achieve high scores.`;

  const existing: ReadingMCQ[] = [];
  if (Array.isArray(rawQuestions)) {
    rawQuestions.forEach((q: any, idx: number) => {
      if (q && q.question && Array.isArray(q.options) && q.options.length >= 4 && typeof q.correctAnswer === 'number') {
        existing.push({
          id: q.id || `rmc_${idx + 1}`,
          question: q.question,
          options: q.options.slice(0, 4),
          correctAnswer: q.correctAnswer >= 0 && q.correctAnswer < 4 ? q.correctAnswer : 0,
          alternativeCorrectAnswers: undefined,
          explanation: q.explanation || 'Dựa vào thông tin chi tiết trong bài đọc.'
        });
      }
    });
  }

  if (existing.length < 5) {
    const fallbackMC: ReadingMCQ[] = [
      {
        id: 'rmc_std_1',
        question: `What is the main topic of the passage?`,
        options: [
          `Learning English with Legend X5 at school`,
          `Playing computer games after school`,
          `Cooking delicious food at home`,
          `Traveling around the world by plane`
        ],
        correctAnswer: 0,
        explanation: `Đoạn văn chủ yếu nói về việc học tiếng Anh cùng Legend X5 ở trường ("We learn English with Legend X5 every day at school").`
      },
      {
        id: 'rmc_std_2',
        question: `Why is learning English helpful according to the text?`,
        options: [
          `It helps students communicate with friends around the world`,
          `It teaches students how to drive cars`,
          `It helps students sleep better at night`,
          `It replaces all other school subjects`
        ],
        correctAnswer: 0,
        explanation: `Dẫn chứng trong bài: "Learning English is exciting and helps us communicate with friends around the world."`
      },
      {
        id: 'rmc_std_3',
        question: `What do students practice in every lesson?`,
        options: [
          `Vocabulary, pronunciation, and reading`,
          `Swimming, dancing, and singing`,
          `Playing football and chess`,
          `Drawing pictures and coloring`
        ],
        correctAnswer: 0,
        explanation: `Dẫn chứng trong bài: "We practice vocabulary, pronunciation, and reading in every lesson."`
      },
      {
        id: 'rmc_std_4',
        question: `Which of the following is TRUE according to the passage?`,
        options: [
          `Reading stories helps students remember grammar rules and improve skills`,
          `Students never do exercises in English class`,
          `Learning English is boring and difficult`,
          `Students do not like achieving high scores`
        ],
        correctAnswer: 0,
        explanation: `Dẫn chứng trong bài: "Reading interesting stories and doing exercises help us remember grammar rules and improve our skills."`
      },
      {
        id: 'rmc_std_5',
        question: `How do students feel when studying English together?`,
        options: [
          `They enjoy studying together and try their best`,
          `They feel lonely and unhappy`,
          `They want to stop studying`,
          `They do not want to go to school`
        ],
        correctAnswer: 0,
        explanation: `Dẫn chứng trong bài: "Everyone enjoys studying together and trying our best to achieve high scores."`
      }
    ];

    const existingIds = new Set(existing.map(q => q.id));
    fallbackMC.forEach(q => {
      if (existing.length < 5 && !existingIds.has(q.id)) {
        existing.push(q);
        existingIds.add(q.id);
      }
    });
  }

  return {
    passage: defaultPassage,
    questions: existing.slice(0, 5)
  };
};

/**
 * Ensures exactly 5 Pronunciation / Odd-One-Out Questions ("5 câu tìm từ có cách đọc khác")
 * Directly incorporates vocabulary items and phonetic rules from the lesson.
 */
export const ensurePronunciationQuestions = (
  rawQuestions?: any[],
  vocabList: VocabularyItem[] = []
): PronunciationQ[] => {
  const existing: PronunciationQ[] = [];
  if (Array.isArray(rawQuestions)) {
    rawQuestions.forEach((q: any, idx: number) => {
      if (q && q.options && Array.isArray(q.options) && q.options.length >= 4) {
        existing.push(sanitizePronunciationQuestion(q, idx));
      }
    });
  }

  if (existing.length < 5) {
    const existingIds = new Set(existing.map(q => q.id));
    CURATED_PHONETICS_BANK.forEach((q, i) => {
      if (existing.length < 5 && !existingIds.has(q.id)) {
        existing.push(sanitizePronunciationQuestion({ ...q, id: `pron_std_${i + 1}` }, existing.length));
        existingIds.add(q.id);
      }
    });
  }

  return existing.slice(0, 5);
};

// ============================================================================
// PEDAGOGICAL GRAMMAR BANK FOR FALLBACK MULTIPLE CHOICE
// Each question has EXACTLY 1 correct answer and 3 clear grammatical distractors
// ============================================================================
const PEDAGOGICAL_GRAMMAR_MC: MultipleChoiceQ[] = [
  {
    id: 'mc_ped_1',
    question: "She ____ to school by bicycle every morning.",
    options: ["goes", "go", "going", "went"],
    correctAnswer: 0,
    explanation: "Chủ ngữ 'She' là ngôi thứ ba số ít, ở thì Hiện tại đơn động từ 'go' thêm '-es' thành 'goes'."
  },
  {
    id: 'mc_ped_2',
    question: "Look! The children ____ football in the playground.",
    options: ["are playing", "plays", "is playing", "played"],
    correctAnswer: 0,
    explanation: "Dấu hiệu 'Look!' chỉ thì Hiện tại tiếp diễn; chủ ngữ số nhiều 'The children' đi với 'are playing'."
  },
  {
    id: 'mc_ped_3',
    question: "My brother ____ like eating carrots.",
    options: ["doesn't", "don't", "isn't", "not"],
    correctAnswer: 0,
    explanation: "Chủ ngữ 'My brother' là danh từ số ít, ở câu phủ định thì Hiện tại đơn dùng trợ động từ 'doesn't'."
  },
  {
    id: 'mc_ped_4',
    question: "____ your father an English teacher?",
    options: ["Is", "Are", "Do", "Does"],
    correctAnswer: 0,
    explanation: "Hỏi về nghề nghiệp với danh từ số ít 'your father', ta dùng động từ to be 'Is'."
  },
  {
    id: 'mc_ped_5',
    question: "We usually have English class ____ 8:00 AM.",
    options: ["at", "on", "in", "for"],
    correctAnswer: 0,
    explanation: "Dùng giới từ 'at' trước mốc thời gian / giờ giấc cụ thể (at 8:00 AM)."
  },
  {
    id: 'mc_ped_6',
    question: "There ____ many books on the library shelf.",
    options: ["are", "is", "be", "am"],
    correctAnswer: 0,
    explanation: "Cụm danh từ 'many books' là danh từ đếm được số nhiều nên dùng cấu trúc 'There are'."
  },
  {
    id: 'mc_ped_7',
    question: "Nam can ____ English very fluently.",
    options: ["speak", "speaks", "speaking", "to speak"],
    correctAnswer: 0,
    explanation: "Sau động từ khuyết thiếu 'can', động từ luôn ở dạng nguyên thể không 'to' (speak)."
  },
  {
    id: 'mc_ped_8',
    question: "She watches TV in the evening, but her brother ____ books.",
    options: ["reads", "read", "reading", "to read"],
    correctAnswer: 0,
    explanation: "Chủ ngữ 'her brother' là ngôi thứ ba số ít ở thì Hiện tại đơn nên động từ thêm 's' (reads)."
  },
  {
    id: 'mc_ped_9',
    question: "This is ____ interesting story about animals.",
    options: ["an", "a", "the", "two"],
    correctAnswer: 0,
    explanation: "Từ 'interesting' bắt đầu bằng nguyên âm /ɪ/ nên ta dùng mạo từ bất định 'an'."
  },
  {
    id: 'mc_ped_10',
    question: "How ____ pencils do you have in your pencil case?",
    options: ["many", "much", "any", "some"],
    correctAnswer: 0,
    explanation: "'pencils' là danh từ đếm được số nhiều nên dùng từ để hỏi số lượng 'How many'."
  }
];

/**
 * Ensures that PracticeContent has complete, robust, non-empty questions
 * for every single exercise category.
 * Synthesizes high-quality questions using the core lesson (vocabulary, grammar, reading)
 * and passes the result through the Pedagogical Quality Firewall.
 */
export const ensureCompletePracticeContent = (
  rawPractice: any,
  core: {
    topic?: string;
    vocabulary?: VocabularyItem[];
    grammar?: GrammarSection;
    reading?: ReadingAdventure;
    teacherTips?: string;
  }
): PracticeContent => {
  const vocabList: VocabularyItem[] = (core.vocabulary && core.vocabulary.length > 0)
    ? core.vocabulary
    : [
        { word: 'school', emoji: '🏫', ipa: '/skuːl/', meaning: 'trường học', example: 'I go to school every day.', sentenceMeaning: 'tôi đi học mỗi ngày.', type: 'noun' },
        { word: 'teacher', emoji: '👩‍🏫', ipa: '/ˈtiːtʃə/', meaning: 'giáo viên', example: 'Mrs. Ly is my English teacher.', sentenceMeaning: 'cô Lý là giáo viên tiếng anh của tôi.', type: 'noun' },
        { word: 'book', emoji: '📚', ipa: '/bʊk/', meaning: 'quyển sách', example: 'I read an interesting book.', sentenceMeaning: 'tôi đọc một quyển sách thú vị.', type: 'noun' },
        { word: 'friend', emoji: '🤝', ipa: '/frend/', meaning: 'bạn bè', example: 'Nam is my best friend.', sentenceMeaning: 'nam là người bạn thân nhất của tôi.', type: 'noun' },
        { word: 'happy', emoji: '😊', ipa: '/ˈhæpi/', meaning: 'vui vẻ, hạnh phúc', example: 'We are very happy today.', sentenceMeaning: 'chúng tôi rất vui vẻ hôm nay.', type: 'adjective' },
      ];

  const rawMega = rawPractice?.megaTest || rawPractice || {};

  // ==================== 1. LISTENING ====================
  let listening: ListeningQ[] = Array.isArray(rawPractice?.listening)
    ? rawPractice.listening
    : (Array.isArray(rawMega?.listening) ? rawMega.listening : []);

  if (listening.length < 5) {
    const existingIds = new Set(listening.map(q => q.id));
    vocabList.forEach((v, idx) => {
      const qId = `lis_gen_${idx + 1}`;
      if (existingIds.has(qId) || listening.length >= 5) return;

      const fullSentence = v.example || `This is a ${v.word}.`;
      const regex = new RegExp(`\\b${v.word}\\b`, 'i');
      const sentenceWithBlank = fullSentence.replace(regex, '______');

      const otherVocab = vocabList.filter(o => o.word !== v.word);
      const distractors = [
        `I like my ${v.word}.`,
        `She has a ${otherVocab[0]?.word || 'book'}.`,
        `We see the ${otherVocab[1]?.word || 'school'}.`
      ].filter(d => d.toLowerCase() !== fullSentence.toLowerCase());

      const options = [fullSentence, ...distractors.slice(0, 3)];
      const shuffledOptions = [...options].sort(() => Math.random() - 0.5);
      const correctIdx = shuffledOptions.indexOf(fullSentence);

      listening.push({
        id: qId,
        audioText: fullSentence,
        sentenceWithBlank: sentenceWithBlank !== fullSentence ? sentenceWithBlank : `I have a ______ (${v.meaning}).`,
        missingWord: v.word,
        alternativeAnswers: [v.word, ...getAnswerVariations(v.word)],
        options: shuffledOptions,
        correctAnswer: correctIdx >= 0 ? correctIdx : 0,
        explanation: `Câu đọc hoàn chỉnh: "${fullSentence}" (Nghĩa: ${v.sentenceMeaning || v.meaning})`
      });
      existingIds.add(qId);
    });
  }

  listening = listening.map(q => ({
    ...q,
    alternativeAnswers: Array.from(new Set([
      ...(q.alternativeAnswers || []),
      ...(q.missingWord ? [q.missingWord, ...getAnswerVariations(q.missingWord)] : [])
    ]))
  }));

  // ==================== 2. MULTIPLE CHOICE ====================
  let multipleChoice: MultipleChoiceQ[] = Array.isArray(rawMega?.multipleChoice)
    ? rawMega.multipleChoice
    : (Array.isArray(rawPractice?.multipleChoice) ? rawPractice.multipleChoice : []);

  if (multipleChoice.length < 10) {
    const existingIds = new Set(multipleChoice.map(q => q.id));

    // First generate from vocabulary with clear definition cues to guarantee 100% single answer
    vocabList.forEach((v, idx) => {
      const qId = `mc_gen_${idx + 1}`;
      if (existingIds.has(qId) || multipleChoice.length >= 10) return;

      const otherWords = vocabList.filter(o => o.word.toLowerCase() !== v.word.toLowerCase()).map(o => o.word);
      const fallbackPool = ['school', 'teacher', 'book', 'pencil', 'happy', 'family', 'student', 'lesson']
        .filter(w => w.toLowerCase() !== v.word.toLowerCase() && !otherWords.includes(w));
      const distractors = [...otherWords, ...fallbackPool].slice(0, 3);
      const allOpts = [v.word, ...distractors].sort(() => Math.random() - 0.5);
      const correctIdx = allOpts.indexOf(v.word);

      multipleChoice.push({
        id: qId,
        question: `Từ nào trong tiếng Anh có nghĩa là "${v.meaning}"?`,
        options: allOpts,
        correctAnswer: correctIdx >= 0 ? correctIdx : 0,
        explanation: `"${v.word}" (${v.ipa || ''}) có nghĩa là "${v.meaning}". Ví dụ: ${v.example || ''}`
      });
      existingIds.add(qId);
    });

    // If still < 10, fill from standard Pedagogical Grammar Bank
    PEDAGOGICAL_GRAMMAR_MC.forEach((item) => {
      if (!existingIds.has(item.id) && multipleChoice.length < 10) {
        multipleChoice.push(item);
        existingIds.add(item.id);
      }
    });
  }

  // ==================== 3. SCRAMBLE ====================
  let scramble: ScrambleQ[] = Array.isArray(rawMega?.scramble)
    ? rawMega.scramble
    : (Array.isArray(rawPractice?.scramble) ? rawPractice.scramble : []);

  if (scramble.length < 10) {
    const existingIds = new Set(scramble.map(q => q.id));

    // Standard canonical sentences with strict, unambiguous word orders
    const standardScramble = [
      { s: "English is my favourite subject.", t: "Tiếng Anh là môn học yêu thích của tôi." },
      { s: "We do our homework every evening.", t: "Chúng tôi làm bài tập vào mỗi buổi tối." },
      { s: "She walks to school every morning.", t: "Cô ấy đi bộ đến trường mỗi buổi sáng." },
      { s: "They play football after school.", t: "Họ chơi bóng đá sau giờ học." },
      { s: "My teacher explains the lesson clearly.", t: "Cô giáo giải thích bài học rất rõ ràng." },
      { s: "He reads books in the library.", t: "Cậu ấy đọc sách trong thư viện." },
      { s: "The students listen to the teacher.", t: "Các học sinh chú ý lắng nghe cô giáo." },
      { s: "My mother cooks delicious meals.", t: "Mẹ tôi nấu những bữa ăn rất ngon." },
      { s: "We learn English with Legend X5.", t: "Chúng tôi học tiếng Anh cùng Legend X5." },
      { s: "I have a new blue backpack.", t: "Tôi có một chiếc ba lô mới màu xanh." }
    ];

    standardScramble.forEach((item, idx) => {
      const qId = `sc_std_${idx + 1}`;
      if (!existingIds.has(qId) && scramble.length < 10) {
        const words = item.s.split(' ');
        scramble.push({
          id: qId,
          scrambled: [...words].sort(() => Math.random() - 0.5),
          correctSentence: item.s,
          translation: item.t
        });
        existingIds.add(qId);
      }
    });
  }

  // ==================== 4. READING MC (5 CÂU BÀI ĐỌC CHỌN ĐÁP ÁN ABCD) ====================
  const { passage: readingMCPassage, questions: readingMC } = ensureReadingMCQuestions(
    rawMega?.readingMC || rawPractice?.readingMC,
    rawMega?.readingMCPassage || core.reading?.passage,
    core.topic,
    vocabList
  );

  // ==================== 5. PRONUNCIATION (5 CÂU TÌM TỪ CÓ CÁCH ĐỌC KHÁC) ====================
  const pronunciation = ensurePronunciationQuestions(
    rawMega?.pronunciation || rawPractice?.pronunciation,
    vocabList
  );

  // ==================== 6. FILL IN THE BLANK (Hỗ trợ tương thích ngược bài cũ nếu có) ====================
  let fillBlank: FillInputQ[] = Array.isArray(rawMega?.fillBlank)
    ? rawMega.fillBlank
    : (Array.isArray(rawPractice?.fillBlank) ? rawPractice.fillBlank : []);

  if (fillBlank.length > 0) {
    fillBlank = fillBlank.map(q => ({
      ...q,
      alternativeAnswers: Array.from(new Set([
        ...(q.alternativeAnswers || []),
        q.correctAnswer,
        ...getAnswerVariations(q.correctAnswer)
      ]))
    }));
  }

  // ==================== 7. VOCAB TRANSLATION ====================
  let vocabTranslation: VocabTranslationQ[] = Array.isArray(rawMega?.vocabTranslation)
    ? rawMega.vocabTranslation
    : (Array.isArray(rawPractice?.vocabTranslation) ? rawPractice.vocabTranslation : []);

  if (vocabTranslation.length < 10) {
    const existingIds = new Set(vocabTranslation.map(q => q.id));

    vocabList.forEach((v, idx) => {
      const qId = `vt_gen_${idx + 1}`;
      if (existingIds.has(qId) || vocabTranslation.length >= 10) return;

      const otherMeanings = vocabList
        .filter(o => o.word !== v.word && o.meaning)
        .map(o => o.meaning);

      const combinedDistractors = [
        ...otherMeanings,
        ...FALLBACK_DISTRACTORS.filter(d => d !== v.meaning)
      ];

      const chosenDistractors = combinedDistractors.slice(0, 3);
      const options = [v.meaning, ...chosenDistractors].sort(() => Math.random() - 0.5);
      const correctIdx = options.indexOf(v.meaning);

      vocabTranslation.push({
        id: qId,
        word: v.word,
        options,
        correctAnswer: correctIdx >= 0 ? correctIdx : 0,
        explanation: `${v.word} (${v.ipa || ''}) có nghĩa là: "${v.meaning}".`
      });
      existingIds.add(qId);
    });

    const additionalWords = [
      { word: 'listen', meaning: 'lắng nghe', ipa: '/ˈlɪsn/' },
      { word: 'read', meaning: 'đọc', ipa: '/riːd/' },
      { word: 'write', meaning: 'viết', ipa: '/raɪt/' },
      { word: 'speak', meaning: 'nói', ipa: '/spiːk/' },
      { word: 'practice', meaning: 'luyện tập', ipa: '/ˈpræktɪs/' },
    ];

    additionalWords.forEach((aw, idx) => {
      const qId = `vt_extra_${idx + 1}`;
      if (existingIds.has(qId) || vocabTranslation.length >= 10) return;

      const distractors = FALLBACK_DISTRACTORS.filter(d => d !== aw.meaning).slice(0, 3);
      const options = [aw.meaning, ...distractors].sort(() => Math.random() - 0.5);
      const correctIdx = options.indexOf(aw.meaning);

      vocabTranslation.push({
        id: qId,
        word: aw.word,
        options,
        correctAnswer: correctIdx >= 0 ? correctIdx : 0,
        explanation: `${aw.word} (${aw.ipa}) có nghĩa là: "${aw.meaning}".`
      });
      existingIds.add(qId);
    });
  }

  // ==================== 8. TRUE / FALSE ====================
  const passage = rawMega?.trueFalsePassage ||
    core.reading?.passage ||
    (core.reading?.title ? `${core.reading.title}. We learn English every day at school with Legend X5. English is fun and exciting.` : 'We learn English every day at school.');

  let trueFalse: TrueFalseQ[] = Array.isArray(rawMega?.trueFalse)
    ? rawMega.trueFalse
    : (Array.isArray(rawPractice?.trueFalse) ? rawPractice.trueFalse : []);

  if (trueFalse.length < 10) {
    const existingIds = new Set(trueFalse.map(q => q.id));

    vocabList.forEach((v, idx) => {
      if (trueFalse.length >= 10) return;
      const trueId = `tf_gen_true_${idx + 1}`;
      if (!existingIds.has(trueId) && trueFalse.length < 10) {
        trueFalse.push({
          id: trueId,
          statement: `In English, the word "${v.word}" means "${v.meaning}".`,
          isTrue: true,
          explanation: `Đúng theo bài học: từ "${v.word}" có nghĩa là "${v.meaning}".`
        });
        existingIds.add(trueId);
      }

      const falseId = `tf_gen_false_${idx + 1}`;
      if (!existingIds.has(falseId) && trueFalse.length < 10) {
        const otherVocab = vocabList[(idx + 1) % vocabList.length];
        const wrongMeaning = (otherVocab && otherVocab.meaning !== v.meaning)
          ? otherVocab.meaning
          : (v.meaning === 'trường học' ? 'quyển sách' : 'trường học');
        trueFalse.push({
          id: falseId,
          statement: `In English, the word "${v.word}" means "${wrongMeaning}".`,
          isTrue: false,
          explanation: `Sai. Từ "${v.word}" thực tế có nghĩa là "${v.meaning}", không phải "${wrongMeaning}".`
        });
        existingIds.add(falseId);
      }
    });

    const generalTFs = [
      {
        id: 'tf_gen_std_1',
        statement: `Practising English every day helps improve listening and speaking skills.`,
        isTrue: true,
        explanation: 'Đúng. Luyện tập tiếng Anh hàng ngày giúp nâng cao kỹ năng nghe và nói.'
      },
      {
        id: 'tf_gen_std_2',
        statement: 'Students never need to review vocabulary or do exercises.',
        isTrue: false,
        explanation: 'Sai. Học sinh cần ôn tập từ vựng và làm bài tập thường xuyên để ghi nhớ lâu hơn.'
      },
      {
        id: 'tf_gen_std_3',
        statement: 'The English alphabet contains 26 letters.',
        isTrue: true,
        explanation: 'Đúng. Bảng chữ cái tiếng Anh có 26 chữ cái.'
      },
      {
        id: 'tf_gen_std_4',
        statement: 'In English, we say "He go to school" instead of "He goes to school".',
        isTrue: false,
        explanation: 'Sai. Chủ ngữ "He" là ngôi thứ ba số ít nên động từ phải chia là "goes", không phải "go".'
      },
      {
        id: 'tf_gen_std_5',
        statement: 'Doing homework carefully helps students achieve high marks in tests.',
        isTrue: true,
        explanation: 'Đúng. Chăm chỉ làm bài tập giúp con đạt điểm số cao trong các bài kiểm tra.'
      }
    ];

    generalTFs.forEach(item => {
      if (!existingIds.has(item.id) && trueFalse.length < 10) {
        trueFalse.push(item);
        existingIds.add(item.id);
      }
    });
  }

  // ==================== 9. MATCHING ====================
  let matching: MatchingPair[] = Array.isArray(rawMega?.matching)
    ? rawMega.matching
    : (Array.isArray(rawPractice?.matching) ? rawPractice.matching : []);

  if (matching.length < 5) {
    matching = vocabList.map((v, i) => ({
      id: `m_gen_${i + 1}`,
      left: v.word,
      right: v.meaning
    }));
  }

  const result: PracticeContent = {
    listening: listening.slice(0, 5),
    megaTest: {
      multipleChoice: multipleChoice.slice(0, 10),
      readingMCPassage,
      readingMC: readingMC.slice(0, 5),
      pronunciation: pronunciation.slice(0, 5),
      scramble: scramble.slice(0, 10),
      vocabTranslation: vocabTranslation.slice(0, 10),
      trueFalsePassage: passage,
      trueFalse: trueFalse.slice(0, 10),
      fillBlank: fillBlank && fillBlank.length > 0 ? fillBlank : undefined,
      errorId: rawMega?.errorId || [],
      matching
    }
  };

  // Pass synthesized content through the Pedagogical Quality Firewall
  return validateAndSanitizePracticeContent(result, core);
};
