/**
 * WordBankFill - Reusable tap-to-fill component
 * Used for both fill-in-the-blank and arrange-words exercises
 */

import React, { useState, useCallback, useMemo } from 'react';
import { shuffleWithRecheck, generateSeed, joinTokensWithSpacing, compareTokenArrays, normalizeForComparison } from '../utils/shuffleUtils';

export interface WordBankFillProps {
    questionId: string;
    wordBank: string[];
    correctTokens: string[];
    mode: 'fill_blanks' | 'arrange_words';
    blankCount?: number; // For fill_blanks mode
    promptText?: string; // Optional instruction text
    disabled?: boolean;
    showResult?: boolean;
    sessionSeed?: string;
    onComplete?: (result: {
        isCorrect: boolean;
        userTokens: string[];
        userAnswer: string;
        correctAnswer: string;
    }) => void;
}

export const WordBankFill: React.FC<WordBankFillProps> = ({
    questionId,
    wordBank,
    correctTokens,
    mode,
    blankCount,
    promptText,
    disabled = false,
    showResult = false,
    sessionSeed,
    onComplete
}) => {
    // Track which words have been used (by index in shuffled bank)
    const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());
    // Track the order of selected words
    const [selectedWords, setSelectedWords] = useState<{ word: string; originalIndex: number }[]>([]);
    // History for undo
    const [history, setHistory] = useState<{ word: string; originalIndex: number }[][]>([]);

    // Shuffle word bank deterministically
    const shuffledBank = useMemo(() => {
        const seed = generateSeed(questionId, sessionSeed);
        return shuffleWithRecheck(wordBank, seed);
    }, [wordBank, questionId, sessionSeed]);

    // Derived values
    const userTokens = selectedWords.map(s => s.word);
    const userAnswer = joinTokensWithSpacing(userTokens);
    const correctAnswer = joinTokensWithSpacing(correctTokens);
    const comparison = compareTokenArrays(userTokens, correctTokens, false);
    const isComplete = mode === 'arrange_words'
        ? selectedWords.length === shuffledBank.length
        : selectedWords.length === (blankCount || correctTokens.length);

    // Handle tapping a word in the bank
    const handleBankWordTap = useCallback((word: string, index: number) => {
        if (disabled || showResult || usedIndices.has(index)) return;

        // Check if we can add more words
        if (mode === 'fill_blanks' && blankCount && selectedWords.length >= blankCount) return;

        // Save history for undo
        setHistory(prev => [...prev, selectedWords]);

        // Add word to selection
        setSelectedWords(prev => [...prev, { word, originalIndex: index }]);
        setUsedIndices(prev => new Set([...prev, index]));
    }, [disabled, showResult, usedIndices, mode, blankCount, selectedWords]);

    // Handle tapping a word in the answer area (return to bank)
    const handleAnswerWordTap = useCallback((index: number) => {
        if (disabled || showResult) return;

        const removedWord = selectedWords[index];
        if (!removedWord) return;

        // Save history for undo
        setHistory(prev => [...prev, selectedWords]);

        // Remove from selection and restore to bank
        setSelectedWords(prev => prev.filter((_, i) => i !== index));
        setUsedIndices(prev => {
            const next = new Set(prev);
            next.delete(removedWord.originalIndex);
            return next;
        });
    }, [disabled, showResult, selectedWords]);

    // Undo last action
    const handleUndo = useCallback(() => {
        if (disabled || showResult || history.length === 0) return;

        const previousState = history[history.length - 1];
        setHistory(prev => prev.slice(0, -1));
        setSelectedWords(previousState);

        // Recalculate used indices
        const newUsed = new Set(previousState.map(s => s.originalIndex));
        setUsedIndices(newUsed);
    }, [disabled, showResult, history]);

    // Reset all selections
    const handleReset = useCallback(() => {
        if (disabled || showResult) return;

        setHistory([]);
        setSelectedWords([]);
        setUsedIndices(new Set());
    }, [disabled, showResult]);

    // Submit answer
    const handleSubmit = useCallback(() => {
        if (!isComplete || disabled) return;

        // Token-based comparison
        const tokenComparisonResult = comparison.isCorrect;

        // Fallback 1: normalized string comparison (to catch edge cases)
        const normalizedUserAnswer = normalizeForComparison(userAnswer, false);
        const normalizedCorrectAnswer = normalizeForComparison(correctAnswer, false);
        const stringComparisonResult = normalizedUserAnswer === normalizedCorrectAnswer;

        // Fallback 2: Punctuation-agnostic word-sequence comparison
        // Strips all punctuation so that token attachment quirks (e.g., "very." instead of "very")
        // NEVER penalize a student who arranged all words in 100% correct grammatical order.
        const stripPunctuation = (token: string) =>
            token.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_()?\"“”']/g, '').trim();
        const cleanUserWords = userTokens.map(stripPunctuation).filter(Boolean);
        const cleanCorrectWords = correctTokens.map(stripPunctuation).filter(Boolean);
        const wordSequenceResult = cleanUserWords.length === cleanCorrectWords.length &&
            cleanUserWords.every((word, idx) => word === cleanCorrectWords[idx]);

        // Accept as correct if ANY comparison passes
        const finalIsCorrect = tokenComparisonResult || stringComparisonResult || wordSequenceResult;

        // Debug logging (can be removed in production)
        if (tokenComparisonResult !== stringComparisonResult) {
            console.warn('⚠️ Token vs String comparison mismatch:', {
                tokenResult: tokenComparisonResult,
                stringResult: stringComparisonResult,
                userTokens,
                correctTokens,
                userAnswer,
                correctAnswer
            });
        }

        onComplete?.({
            isCorrect: finalIsCorrect,
            userTokens,
            userAnswer,
            correctAnswer
        });
    }, [isComplete, disabled, comparison.isCorrect, userTokens, userAnswer, correctAnswer, correctTokens, onComplete]);

    return (
        <div className="word-bank-fill space-y-4">
            {/* Instruction */}
            {promptText && (
                <p className="text-sm text-slate-600 font-medium">{promptText}</p>
            )}

            {/* Answer Area - Always visible, pinned at top */}
            <div
                className={`answer-area min-h-[60px] p-4 rounded-2xl border-2 transition-all ${showResult
                    ? comparison.isCorrect
                        ? 'bg-green-50 border-green-400'
                        : 'bg-red-50 border-red-400'
                    : 'bg-white border-slate-200 shadow-inner'
                    }`}
                style={{ position: 'sticky', top: '0', zIndex: 10 }}
            >
                <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
                    {selectedWords.length === 0 ? (
                        <span className="text-slate-400 italic text-sm">
                            {mode === 'arrange_words' ? 'Chạm vào từ để xếp câu...' : 'Chạm vào từ để điền...'}
                        </span>
                    ) : (
                        selectedWords.map((item, idx) => {
                            const isWrong = showResult && comparison.differences.includes(idx);
                            return (
                                <button
                                    key={`answer-${idx}`}
                                    onClick={() => handleAnswerWordTap(idx)}
                                    disabled={disabled || showResult}
                                    className={`px-3 py-2 rounded-xl font-bold text-base transition-all ${showResult
                                        ? isWrong
                                            ? 'bg-red-200 text-red-800 border-2 border-red-400'
                                            : 'bg-green-200 text-green-800 border-2 border-green-400'
                                        : 'bg-brand-100 text-brand-700 border-2 border-brand-300 hover:bg-brand-200 active:scale-95'
                                        }`}
                                >
                                    {item.word}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Show correct answer when result is displayed */}
                {showResult && !comparison.isCorrect && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                        <p className="text-xs text-slate-500 mb-1 font-semibold">Đáp án đúng:</p>
                        <p className="text-sm font-bold text-green-700">{correctAnswer}</p>
                    </div>
                )}
            </div>

            {/* Word Bank */}
            <div className="word-bank bg-slate-100 p-4 rounded-2xl">
                <div className="flex flex-wrap gap-2 justify-center">
                    {shuffledBank.map((word, idx) => {
                        const isUsed = usedIndices.has(idx);
                        return (
                            <button
                                key={`bank-${idx}-${word}`}
                                onClick={() => handleBankWordTap(word, idx)}
                                disabled={disabled || showResult || isUsed}
                                className={`px-4 py-3 rounded-xl font-bold text-base transition-all ${isUsed
                                    ? 'bg-slate-300 text-slate-400 cursor-not-allowed opacity-50'
                                    : 'bg-white text-slate-700 border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50 active:scale-95 shadow-sm'
                                    }`}
                            >
                                {word}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Action Buttons */}
            {!showResult && (
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={handleUndo}
                        disabled={disabled || history.length === 0}
                        className="px-4 py-2 rounded-xl font-bold text-sm bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        ↩️ Hoàn tác
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={disabled || selectedWords.length === 0}
                        className="px-4 py-2 rounded-xl font-bold text-sm bg-orange-100 text-orange-600 hover:bg-orange-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        🔄 Làm lại
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={disabled || !isComplete}
                        className="px-6 py-2 rounded-xl font-bold text-sm bg-brand-500 text-white hover:bg-brand-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                        ✅ Kiểm tra
                    </button>
                </div>
            )}
        </div>
    );
};

export default WordBankFill;
