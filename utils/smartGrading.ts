/**
 * Smart Grading System - Chấm điểm thông minh như giáo viên thật
 * 
 * Nguyên tắc: Nếu học sinh trả lời đúng ngữ pháp → chấm đúng.
 * Hỗ trợ: viết tắt (contractions), viết hoa/thường, nhiều đáp án đúng,
 * câu điền tên chấp nhận mọi tên hợp lệ.
 */

// ═══════════════════════════════════════════════════════════
// Bản đồ viết tắt (contraction) ↔ dạng đầy đủ
// ═══════════════════════════════════════════════════════════
const CONTRACTIONS_MAP: Record<string, string> = {
  // Subject + be
  "i'm": "i am",
  "you're": "you are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "we're": "we are",
  "they're": "they are",
  "that's": "that is",
  "there's": "there is",
  "here's": "here is",
  "what's": "what is",
  "who's": "who is",
  "where's": "where is",
  "when's": "when is",
  "how's": "how is",
  "name's": "name is",
  // Subject + have
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  // Subject + will
  "i'll": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "it'll": "it will",
  "we'll": "we will",
  "they'll": "they will",
  // Subject + would / had
  "i'd": "i would",
  "you'd": "you would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would",
  // Negatives
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "hasn't": "has not",
  "haven't": "have not",
  "hadn't": "had not",
  "can't": "cannot",
  "couldn't": "could not",
  "won't": "will not",
  "wouldn't": "would not",
  "shouldn't": "should not",
  "mustn't": "must not",
  "needn't": "need not",
  "shan't": "shall not",
  // Other
  "let's": "let us",
};

// Build reverse map (full form → contraction)
const REVERSE_CONTRACTIONS_MAP: Record<string, string> = {};
Object.entries(CONTRACTIONS_MAP).forEach(([contraction, full]) => {
  REVERSE_CONTRACTIONS_MAP[full] = contraction;
});

// ═══════════════════════════════════════════════════════════
// Normalization helpers
// ═══════════════════════════════════════════════════════════

/**
 * Normalize a string for comparison:
 * - Lowercase
 * - Trim whitespace
 * - Remove extra spaces
 * - Remove punctuation (optional)
 */
export const normalizeAnswer = (s: string, removePunctuation = true): string => {
  let result = String(s || "").toLowerCase().replace(/['‘’`]/g, "'").trim().replace(/\s+/g, " ");
  if (removePunctuation) {
    result = result.replace(/[.,/#!$%^&*;:{}=\-_()?"“”']/g, "");
  }
  return result.trim();
};

/**
 * Expand all contractions in a string to their full forms
 * e.g., "I'm happy" → "i am happy"
 */
export const expandContractions = (text: string): string => {
  let lower = text.toLowerCase().replace(/['‘’`]/g, "'");
  // Sort by length descending to match longer contractions first
  const sortedContractions = Object.entries(CONTRACTIONS_MAP)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [contraction, full] of sortedContractions) {
    // Use word boundary-aware replacement
    const regex = new RegExp(contraction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    lower = lower.replace(regex, full);
  }
  return lower;
};

/**
 * Contract full forms to contractions
 * e.g., "i am happy" → "i'm happy"
 */
export const contractToShort = (text: string): string => {
  let lower = text.toLowerCase().replace(/['‘’`]/g, "'");
  const sortedFull = Object.entries(REVERSE_CONTRACTIONS_MAP)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [full, contraction] of sortedFull) {
    const regex = new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    lower = lower.replace(regex, contraction);
  }
  return lower;
};

// ═══════════════════════════════════════════════════════════
// Core grading functions
// ═══════════════════════════════════════════════════════════

/**
 * Check if two strings are grammatically equivalent.
 * Handles contractions, case differences, and minor punctuation.
 * 
 * Examples:
 * - "is" ↔ "'s" → true
 * - "I'm" ↔ "I am" → true  
 * - "don't" ↔ "do not" → true
 * - "What's" ↔ "What is" → true
 */
export const areGrammaticallyEquivalent = (a: string, b: string): boolean => {
  // Quick exact match (case-insensitive)
  const normA = normalizeAnswer(a);
  const normB = normalizeAnswer(b);
  if (normA === normB) return true;

  // Single-token equivalents: 's ↔ is, 're ↔ are, 'm ↔ am, 'll ↔ will, 've ↔ have
  const cleanA = String(a || '').trim().toLowerCase();
  const cleanB = String(b || '').trim().toLowerCase();
  if ((cleanA === "'s" && cleanB === "is") || (cleanA === "is" && cleanB === "'s")) return true;
  if ((cleanA === "'re" && cleanB === "are") || (cleanA === "are" && cleanB === "'re")) return true;
  if ((cleanA === "'m" && cleanB === "am") || (cleanA === "am" && cleanB === "'m")) return true;
  if ((cleanA === "'ll" && cleanB === "will") || (cleanA === "will" && cleanB === "'ll")) return true;
  if ((cleanA === "'ve" && cleanB === "have") || (cleanA === "have" && cleanB === "'ve")) return true;
  if ((cleanA === "can't" && cleanB === "cannot") || (cleanA === "cannot" && cleanB === "can't")) return true;
  if ((cleanA === "don't" && cleanB === "do not") || (cleanA === "do not" && cleanB === "don't")) return true;
  if ((cleanA === "doesn't" && cleanB === "does not") || (cleanA === "does not" && cleanB === "doesn't")) return true;
  if ((cleanA === "didn't" && cleanB === "did not") || (cleanA === "did not" && cleanB === "didn't")) return true;
  if ((cleanA === "won't" && cleanB === "will not") || (cleanA === "will not" && cleanB === "won't")) return true;

  // Expand contractions and compare
  const expandedA = normalizeAnswer(expandContractions(a));
  const expandedB = normalizeAnswer(expandContractions(b));
  if (expandedA === expandedB) return true;

  // Contract to short forms and compare
  const contractedA = normalizeAnswer(contractToShort(a));
  const contractedB = normalizeAnswer(contractToShort(b));
  if (contractedA === contractedB) return true;

  return false;
};

/**
 * Check if a fill-in-the-blank answer is correct.
 * Compares against correctAnswer + alternativeAnswers with smart matching.
 * 
 * Special handling:
 * - Case insensitive
 * - Contraction equivalence ("I'm" = "I am")  
 * - Name questions: if question asks for a name, accept any capitalized word
 */
export const checkFillAnswer = (
  userAnswer: string,
  correctAnswer: string,
  alternativeAnswers?: string[],
  questionText?: string
): boolean => {
  const trimmedUser = (userAnswer || "").trim();
  if (!trimmedUser) return false;

  // Detect if this is a "name" question (fill in a person's name)
  const isNameQ = detectNameQuestion(questionText || "");

  // If it's a name question, accept any properly formatted name
  if (isNameQ && isValidName(trimmedUser)) {
    return true;
  }

  // Helper: check if user wrote a full sentence containing the correct answer
  const isFullSentenceValid = (u: string, c: string, q: string) => {
    if (!q) return false;
    const variations = [
      { uv: normalizeAnswer(u), cv: normalizeAnswer(c) },
      { uv: normalizeAnswer(expandContractions(u)), cv: normalizeAnswer(expandContractions(c)) },
      { uv: normalizeAnswer(contractToShort(u)), cv: normalizeAnswer(contractToShort(c)) }
    ];
    
    for (const { uv, cv } of variations) {
      if (!cv || cv.length < 2) continue; // safety for very short answers
      const regex = new RegExp(`(?:^|\\s)${cv}(?:$|\\s)`);
      if (regex.test(uv)) {
        const extraText = uv.replace(regex, " ").trim();
        if (!extraText) return true;
        const extraWords = extraText.split(/\\s+/).filter(w => w.length > 0);
        const qWords = new Set([
          ...normalizeAnswer(q).split(/\\s+/),
          ...normalizeAnswer(expandContractions(q)).split(/\\s+/)
        ]);
        if (extraWords.every(word => qWords.has(word))) return true;
      }
    }
    return false;
  };

  // Build all acceptable answers
  const allCorrectAnswers = [correctAnswer, ...(alternativeAnswers || [])];

  // Check each acceptable answer with smart comparison
  for (const correct of allCorrectAnswers) {
    if (areGrammaticallyEquivalent(trimmedUser, correct)) {
      return true;
    }
    if (isFullSentenceValid(trimmedUser, correct, questionText || "")) {
      return true;
    }
  }

  return false;
};

/**
 * Parse an option index from number, numeric string, or letter ("A", "B", "C", "D").
 */
export const parseMCIndex = (val: any): number => {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) return num;
    if (/^[A-Da-d]$/.test(trimmed)) {
      return trimmed.toUpperCase().charCodeAt(0) - 65;
    }
  }
  return -1;
};

/**
 * Check if a selected index is considered correct for a Multiple Choice question.
 * Robust against numeric strings and letter answers ("A", "B", "C", "D").
 */
export const isCorrectMC = (
  selectedIndex: number,
  correctAnswer: number | string,
  alternativeCorrectAnswers?: (number | string)[]
): boolean => {
  const normCorrect = parseMCIndex(correctAnswer);
  if (selectedIndex === normCorrect) return true;
  if (Array.isArray(alternativeCorrectAnswers)) {
    for (const alt of alternativeCorrectAnswers) {
      if (selectedIndex === parseMCIndex(alt)) return true;
    }
  }
  return false;
};

/**
 * Check if a given index is ANY correct answer (for highlighting purposes)
 */
export const isAnyCorrectAnswer = (
  index: number,
  correctAnswer: number | string,
  alternativeCorrectAnswers?: (number | string)[]
): boolean => {
  return isCorrectMC(index, correctAnswer, alternativeCorrectAnswers);
};

/**
 * Get all correct answer indices as a flat array
 */
export const getAllCorrectIndices = (
  correctAnswer: number | string,
  alternativeCorrectAnswers?: (number | string)[]
): number[] => {
  const normCorrect = parseMCIndex(correctAnswer);
  const indices: number[] = normCorrect >= 0 ? [normCorrect] : [];
  if (Array.isArray(alternativeCorrectAnswers)) {
    alternativeCorrectAnswers.forEach(alt => {
      const idx = parseMCIndex(alt);
      if (idx >= 0) indices.push(idx);
    });
  }
  return [...new Set(indices)]; // deduplicate
};

// ═══════════════════════════════════════════════════════════
// Name question detection
// ═══════════════════════════════════════════════════════════

/**
 * Detect if a fill-in-the-blank question is asking for a person's name.
 */
const NAME_QUESTION_PATTERNS = [
  /my\s+name(?:'s|\s+is)\s+____/i,
  /his\s+name(?:'s|\s+is)\s+____/i,
  /her\s+name(?:'s|\s+is)\s+____/i,
  /(?:i'm|i\s+am)\s+____/i,
  /____\s+is\s+my\s+name/i,
  /hello[,!]?\s+(?:i'm|i\s+am|my\s+name(?:'s|\s+is))\s+____/i,
  /hi[,!]?\s+(?:i'm|i\s+am|my\s+name(?:'s|\s+is))\s+____/i,
  /name[?:]\s*____/i,
  /____\s+(?:huyen|linh|nam|lan|mai|minh|hoa|an|tuan|hang|duc|ha|long|son|phuong)/i,
];

export const detectNameQuestion = (questionText: string): boolean => {
  return NAME_QUESTION_PATTERNS.some(pattern => pattern.test(questionText));
};

/**
 * Check if a string is a valid person's name.
 * Rules: starts with uppercase, contains only letters
 */
export const isValidName = (str: string): boolean => {
  const trimmed = str.trim();
  if (!trimmed || trimmed.length === 0) return false;
  // Must start with uppercase letter
  if (trimmed[0] !== trimmed[0].toUpperCase()) return false;
  if (trimmed[0] === trimmed[0].toLowerCase()) return false;
  // Only letters, spaces, hyphens, and apostrophes (supports Vietnamese names)
  if (!/^[A-Za-z\u00C0-\u1EF9][A-Za-z\u00C0-\u1EF9\s\-']*$/.test(trimmed)) return false;
  // Must have at least 2 characters
  if (trimmed.length < 2) return false;
  return true;
};

// ═══════════════════════════════════════════════════════════
// MC option equivalence checking (auto-detect)
// ═══════════════════════════════════════════════════════════

/**
 * For MC questions, check if two options are grammatically equivalent.
 * Used to auto-detect alternative correct answers even if AI didn't specify them.
 * 
 * Example: options = ["is", "am", "are", "'s"]
 * If correctAnswer is "'s" (index 3), this detects that "is" (index 0) is also correct
 * because "'s" is a contraction of "is" in this context.
 */
export const findEquivalentOptions = (
  options: string[],
  correctAnswerIndex: number
): number[] => {
  const correctOption = options[correctAnswerIndex];
  if (!correctOption) return [];

  const equivalentIndices: number[] = [];

  options.forEach((opt, idx) => {
    if (idx === correctAnswerIndex) return; // skip the primary answer
    if (areGrammaticallyEquivalent(opt, correctOption)) {
      equivalentIndices.push(idx);
    }
  });

  return equivalentIndices;
};

/**
 * Smart MC check that auto-detects equivalent options.
 * This is the PRIMARY function to use for all MC/Listening grading.
 * 
 * It combines:
 * 1. Explicit alternativeCorrectAnswers from AI
 * 2. Auto-detected equivalent options (contraction matching)
 */
export const smartCheckMC = (
  selectedIndex: number,
  correctAnswer: number | string,
  options: string[],
  alternativeCorrectAnswers?: (number | string)[]
): boolean => {
  // 1. Check explicit correct answers
  if (isCorrectMC(selectedIndex, correctAnswer, alternativeCorrectAnswers)) {
    return true;
  }

  // 2. Auto-detect equivalent options
  const normCorrect = parseMCIndex(correctAnswer);
  if (normCorrect >= 0 && Array.isArray(options)) {
    const autoEquivalent = findEquivalentOptions(options, normCorrect);
    if (autoEquivalent.includes(selectedIndex)) {
      return true;
    }
  }

  return false;
};

/**
 * Get ALL correct indices (explicit + auto-detected) for display purposes
 */
export const getAllSmartCorrectIndices = (
  correctAnswer: number | string,
  options: string[],
  alternativeCorrectAnswers?: (number | string)[]
): number[] => {
  const explicit = getAllCorrectIndices(correctAnswer, alternativeCorrectAnswers);
  const normCorrect = parseMCIndex(correctAnswer);
  const autoDetected = normCorrect >= 0 && Array.isArray(options)
    ? findEquivalentOptions(options, normCorrect)
    : [];
  return [...new Set([...explicit, ...autoDetected])];
};
