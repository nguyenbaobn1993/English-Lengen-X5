/**
 * Deterministic shuffle utilities for word arrangement exercises
 * Uses seeded PRNG (Fisher-Yates algorithm) for consistent shuffling per session
 */

// Seeded random number generator (mulberry32)
export const createSeededRandom = (seed: number): (() => number) => {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Generate seed from string (question ID + session)
export const generateSeed = (questionId: string, sessionId?: string): number => {
    const str = `${questionId}-${sessionId || Date.now()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
};

// Fisher-Yates shuffle with seeded RNG
export const deterministicShuffle = <T>(array: T[], seed: number): T[] => {
    const result = [...array];
    const random = createSeededRandom(seed);

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
};

// Check if shuffled array equals original (need to reshuffle)
export const arraysEqual = <T>(a: T[], b: T[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

// Shuffle with auto-reshuffle if result equals original
export const shuffleWithRecheck = <T>(array: T[], seed: number, maxAttempts = 10): T[] => {
    let result = deterministicShuffle(array, seed);
    let attempts = 1;

    while (arraysEqual(result, array) && attempts < maxAttempts) {
        result = deterministicShuffle(array, seed + attempts);
        attempts++;
    }

    return result;
};

// Punctuation tokens that should not have space before them
export const PUNCTUATION_NO_SPACE_BEFORE = ['.', ',', '?', '!', ':', ';', "'", '"', ')'];
export const PUNCTUATION_NO_SPACE_AFTER = ['(', '"', "'"];

// Join tokens with spaces (punctuation is already attached to words)
export const joinTokensWithSpacing = (tokens: string[]): string => {
    if (tokens.length === 0) return '';
    return tokens.join(' ');
};

// Normalize text for comparison (handles case and spacing)
export const normalizeForComparison = (text: string, caseSensitive = false): string => {
    let normalized = text.trim().replace(/\s+/g, ' ');
    if (!caseSensitive) {
        normalized = normalized.toLowerCase();
    }
    return normalized;
};

// Compare token arrays for correctness
export const compareTokenArrays = (
    userTokens: string[],
    correctTokens: string[],
    caseSensitive = false
): { isCorrect: boolean; differences: number[] } => {
    const differences: number[] = [];

    // Normalize tokens: trim whitespace and optionally lowercase
    const normalizeToken = (token: string): string => {
        let normalized = token.trim();
        if (!caseSensitive) {
            normalized = normalized.toLowerCase();
        }
        return normalized;
    };

    // Filter out empty tokens after normalization
    const userNormalized = userTokens.map(normalizeToken).filter(t => t.length > 0);
    const correctNormalized = correctTokens.map(normalizeToken).filter(t => t.length > 0);

    const maxLen = Math.max(userNormalized.length, correctNormalized.length);

    for (let i = 0; i < maxLen; i++) {
        const userToken = userNormalized[i] || '';
        const correctToken = correctNormalized[i] || '';

        if (userToken !== correctToken) {
            differences.push(i);
        }
    }

    return {
        isCorrect: differences.length === 0 && userNormalized.length === correctNormalized.length,
        differences
    };
};

// Parse sentence into tokens (split by whitespace, keeping punctuation attached to words)
// This ensures "He promised to call me back." → ["He", "promised", "to", "call", "me", "back."]
// NOT → ["He", "promised", "to", "call", "me", "back", "."]
export const parseIntoTokens = (sentence: string): string[] => {
    return sentence.trim().split(/\s+/).filter(t => t.length > 0);
};
