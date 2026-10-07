
import React, { useState, useEffect, useCallback } from 'react';
import { PracticeContent, ListeningQ } from '../types';
import { WordBankFill } from './WordBankFill';
import { playGeminiTTS, stopTTS } from '../services/geminiService';
import { QuestionFixModal } from './QuestionFixModal';
import { getCurrentUser } from '../services/authService';
import {
  shuffleWithRecheck,
  generateSeed,
  joinTokensWithSpacing,
  compareTokenArrays,
  parseIntoTokens
} from '../utils/shuffleUtils';
import { smartCheckMC, getAllSmartCorrectIndices, checkFillAnswer } from '../utils/smartGrading';

// Helper to extract blank and target word from ListeningQ
export const getListeningQuestionDetails = (q: ListeningQ): {
  sentenceWithBlank: string;
  missingWord: string;
  alternativeAnswers: string[];
} => {
  if (q.sentenceWithBlank && q.missingWord) {
    return {
      sentenceWithBlank: q.sentenceWithBlank,
      missingWord: q.missingWord,
      alternativeAnswers: q.alternativeAnswers || []
    };
  }

  // Automatic derivation for legacy data
  const fullText = (q.audioText || '').trim();
  const matchPunct = fullText.match(/[.!?]$/);
  const punct = matchPunct ? matchPunct[0] : '';
  const clean = fullText.replace(/[.!?]$/, '');
  const words = clean.split(/\s+/);

  if (words.length <= 1) {
    return {
      sentenceWithBlank: '______' + punct,
      missingWord: clean,
      alternativeAnswers: []
    };
  }

  // Mask the last word or 2 words
  const maskCount = words.length > 5 ? 2 : 1;
  const blankWord = words.slice(-maskCount).join(' ');
  const sentenceWithBlank = words.slice(0, -maskCount).join(' ') + ' ______' + punct;

  return {
    sentenceWithBlank,
    missingWord: blankWord,
    alternativeAnswers: []
  };
};

export const checkListeningBlank = (userInput: string, q: ListeningQ): boolean => {
  const details = getListeningQuestionDetails(q);
  const cleanUser = (userInput || '').trim().toLowerCase().replace(/[.,!?'"-]/g, '');
  if (!cleanUser) return false;

  const targetWord = details.missingWord.trim().toLowerCase().replace(/[.,!?'"-]/g, '');
  if (cleanUser === targetWord) return true;

  if (details.alternativeAnswers && Array.isArray(details.alternativeAnswers)) {
    if (
      details.alternativeAnswers.some(
        alt => alt.trim().toLowerCase().replace(/[.,!?'"-]/g, '') === cleanUser
      )
    ) {
      return true;
    }
  }

  // Also check if user typed full sentence correctly
  const fullClean = (q.audioText || '').trim().toLowerCase().replace(/[.,!?'"-]/g, '');
  if (cleanUser === fullClean) return true;

  return false;
};

interface MegaChallengeProps {
  megaData: PracticeContent['megaTest'];
  listeningData?: PracticeContent['listening'];
  onScoresUpdate?: (scores: {
    mc: number;
    scramble: number;
    fill: number;
    vocab: number;
    tf: number;
    listen: number;
    readingFill?: number;
    readingMC?: number;
    pronunciation?: number;
  }) => void;
  isTeacher?: boolean;
  lessonContext?: {
    topic?: string;
    grammarTopic?: string;
    grammarExplanation?: string;
    readingPassage?: string;
  };
  onUpdateMegaData?: (updatedMegaData: PracticeContent['megaTest']) => void;
  onUpdateListeningData?: (updatedListeningData: PracticeContent['listening']) => void;
}

// Helper to safely render words with <u>...</u> underlining
const renderUnderlinedWord = (text: string) => {
  if (!text || typeof text !== 'string') return null;
  if (!text.includes('<u>') || !text.includes('</u>')) {
    return <span>{text}</span>;
  }
  const parts = text.split(/(<\/?u>)/g);
  let isUnderline = false;
  return (
    <span>
      {parts.map((part, idx) => {
        if (part === '<u>') {
          isUnderline = true;
          return null;
        }
        if (part === '</u>') {
          isUnderline = false;
          return null;
        }
        if (isUnderline) {
          return (
            <span
              key={idx}
              className="underline decoration-indigo-600 decoration-[3px] font-black text-indigo-700 bg-indigo-50/80 px-0.5 rounded"
            >
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
};

// Collapsible Explanation Component
const CollapsibleExplanation: React.FC<{
  isCorrect: boolean;
  explanation: string;
  correctAnswer?: string;
  userAnswer?: string;
  isTeacher?: boolean;
  onEditQuestion?: () => void;
}> = ({ isCorrect, explanation, correctAnswer, userAnswer, isTeacher, onEditQuestion }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`mt-3 rounded-2xl border-l-4 overflow-hidden transition-all ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-amber-50 border-amber-500'
      }`}>
      {/* Header - Always visible */}
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{isCorrect ? '🌟' : '💡'}</span>
          <span className={`font-bold text-sm ${isCorrect ? 'text-green-700' : 'text-amber-700'}`}>
            {isCorrect ? 'Tuyệt vời! Em giỏi lắm!' : 'Chưa đúng rồi!'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isTeacher && onEditQuestion && (
            <button
              type="button"
              onClick={onEditQuestion}
              className="px-2.5 py-1 text-xs font-black bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95"
              title="Phát hiện lỗi ở câu này? Bấm để sửa hoặc nhờ AI sinh lại"
            >
              <span>🛠️</span> Sửa câu này
            </button>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-1 text-xs font-bold bg-white/50 rounded-lg hover:bg-white/80 transition-all cursor-pointer"
          >
            {isOpen ? '▲ Thu gọn' : '▼ Xem giải thích'}
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <div
        className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="px-4 pb-4 space-y-2">
          {!isCorrect && correctAnswer && (
            <div className="bg-white/50 p-2 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Đáp án đúng:</p>
              <p className="font-bold text-green-700 text-sm">{correctAnswer}</p>
            </div>
          )}
          {explanation && (
            <p className="text-xs italic text-slate-600 leading-relaxed">{explanation}</p>
          )}

          {isTeacher && onEditQuestion && (
            <div className="mt-2 pt-2 border-t border-amber-200/70 flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800">
                👩‍🏫 Giáo viên: Phát hiện câu hỏi/đáp án có lỗi?
              </span>
              <button
                type="button"
                onClick={onEditQuestion}
                className="px-2.5 py-1 text-xs font-black bg-white hover:bg-amber-100 text-amber-900 rounded-lg border border-amber-300 transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>🤖</span> AI sửa lại / <span>✏️</span> Sửa tay
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Session seed for consistent shuffling within session
const SESSION_SEED = Date.now().toString();

export const MegaChallenge: React.FC<MegaChallengeProps> = ({
  megaData,
  listeningData,
  onScoresUpdate,
  isTeacher,
  lessonContext,
  onUpdateMegaData,
  onUpdateListeningData
}) => {
  const [currentMega, setCurrentMega] = useState<PracticeContent['megaTest']>(megaData);
  const [currentListening, setCurrentListening] = useState<PracticeContent['listening'] | undefined>(listeningData);

  useEffect(() => {
    setCurrentMega(megaData);
  }, [megaData]);

  useEffect(() => {
    setCurrentListening(listeningData);
  }, [listeningData]);

  const isTeacherActive = isTeacher ?? (typeof window !== 'undefined' && (localStorage.getItem('mrs_dung_user_role') === 'teacher' || getCurrentUser()?.role === 'teacher'));

  const [fixingQuestion, setFixingQuestion] = useState<{
    type: 'multipleChoice' | 'readingMC' | 'pronunciation' | 'scramble' | 'vocabTranslation' | 'trueFalse' | 'fillBlank' | 'readingFill' | 'listening';
    index: number;
    data: any;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleQuestionSaved = (updatedQ: any) => {
    if (!fixingQuestion) return;
    const { type, index } = fixingQuestion;

    if (type === 'listening') {
      const newList = [...(currentListening || [])];
      newList[index] = updatedQ;
      setCurrentListening(newList);
      if (onUpdateListeningData) {
        onUpdateListeningData(newList);
      }
    } else {
      const newMega = { ...currentMega };
      if (type === 'multipleChoice') {
        newMega.multipleChoice = [...(newMega.multipleChoice || [])];
        newMega.multipleChoice[index] = updatedQ;
      } else if (type === 'readingMC') {
        newMega.readingMC = [...(newMega.readingMC || [])];
        newMega.readingMC[index] = updatedQ;
      } else if (type === 'pronunciation') {
        newMega.pronunciation = [...(newMega.pronunciation || [])];
        newMega.pronunciation[index] = updatedQ;
      } else if (type === 'scramble') {
        newMega.scramble = [...(newMega.scramble || [])];
        newMega.scramble[index] = updatedQ;
      } else if (type === 'vocabTranslation') {
        newMega.vocabTranslation = [...(newMega.vocabTranslation || [])];
        newMega.vocabTranslation[index] = updatedQ;
      } else if (type === 'trueFalse') {
        newMega.trueFalse = [...(newMega.trueFalse || [])];
        newMega.trueFalse[index] = updatedQ;
      } else if (type === 'fillBlank') {
        newMega.fillBlank = [...(newMega.fillBlank || [])];
        newMega.fillBlank[index] = updatedQ;
      } else if (type === 'readingFill') {
        newMega.readingFill = [...(newMega.readingFill || [])];
        newMega.readingFill[index] = updatedQ;
      }
      setCurrentMega(newMega);
      if (onUpdateMegaData) {
        onUpdateMegaData(newMega);
      }
    }

    // Reset answer state for this question so teacher can test again immediately
    const qId = updatedQ.id;
    setAnswers(prev => {
      const n = { ...prev };
      delete n[qId];
      return n;
    });
    setSubmitted(prev => {
      const n = { ...prev };
      delete n[qId];
      return n;
    });

    setToastMessage('🎉 Đã cập nhật câu hỏi thành công! Cô có thể làm thử lại ngay.');
    setTimeout(() => setToastMessage(null), 4000);
    setFixingQuestion(null);
  };

  const [activeZone, setActiveZone] = useState<'mc' | 'readingMC' | 'pronunciation' | 'fill' | 'scramble' | 'vocab' | 'tf' | 'listen' | 'readingFill'>('mc');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const normalizeStrict = (s: string) => {
    return String(s || "")
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleAnswer = (qId: string, val: any) => {
    if (submitted[qId]) return;
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const checkFinal = (qId: string, isCorrect: boolean) => {
    setSubmitted(prev => ({ ...prev, [qId]: true }));
  };

  const calculateZoneScore = (zone: string) => {
    let correct = 0;
    if (!currentMega) return 0;
    if (zone === 'mc') {
      (currentMega.multipleChoice || []).forEach(q => { if (submitted[q.id] && smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)) correct++; });
    } else if (zone === 'readingMC') {
      (currentMega.readingMC || []).forEach(q => {
        if (submitted[q.id] && smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)) correct++;
      });
    } else if (zone === 'pronunciation') {
      (currentMega.pronunciation || []).forEach(q => {
        if (submitted[q.id] && smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)) correct++;
      });
    } else if (zone === 'fill') {
      (currentMega.fillBlank || []).forEach(q => {
        if (submitted[q.id]) {
          const result = answers[q.id];
          if (result?.isCorrect) correct++;
        }
      });
    } else if (zone === 'readingFill') {
      (currentMega.readingFill || []).forEach(q => {
        if (submitted[q.id]) {
          const result = answers[q.id];
          if (result?.isCorrect) correct++;
        }
      });
    } else if (zone === 'scramble') {
      (currentMega.scramble || []).forEach(q => {
        if (submitted[q.id]) {
          const result = answers[q.id];
          if (result?.isCorrect) correct++;
        }
      });
    } else if (zone === 'vocab') {
      (currentMega.vocabTranslation || []).forEach(q => {
        if (submitted[q.id] && smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)) correct++;
      });
    } else if (zone === 'tf') {
      (currentMega.trueFalse || []).forEach(q => {
        if (submitted[q.id] && answers[q.id] === q.isTrue) correct++;
      });
    } else if (zone === 'listen') {
      (currentListening || []).forEach(q => {
        if (submitted[q.id] && checkListeningBlank(String(answers[q.id] || ''), q)) correct++;
      });
    }
    return correct;
  };

  useEffect(() => {
    if (onScoresUpdate) {
      onScoresUpdate({
        mc: calculateZoneScore('mc'),
        readingMC: calculateZoneScore('readingMC'),
        pronunciation: calculateZoneScore('pronunciation'),
        scramble: calculateZoneScore('scramble'),
        fill: calculateZoneScore('fill'),
        vocab: calculateZoneScore('vocab'),
        tf: calculateZoneScore('tf'),
        listen: calculateZoneScore('listen'),
        readingFill: calculateZoneScore('readingFill')
      });
    }
  }, [submitted, answers, currentMega, currentListening]);

  if (!currentMega) return null;

  const totalMegaCount =
    (currentMega.multipleChoice?.length || 0) +
    (currentMega.readingMC?.length || 0) +
    (currentMega.pronunciation?.length || 0) +
    (currentMega.scramble?.length || 0) +
    (currentMega.vocabTranslation?.length || 0) +
    (currentMega.trueFalse?.length || 0) +
    (currentListening?.length || 0) +
    (currentMega.fillBlank?.length || 0);

  return (
    <div className="bg-brand-900 rounded-[3rem] shadow-xl border-[8px] border-brand-800 overflow-hidden mb-12 font-sans">
      <div className="bg-brand-800 p-6 text-center border-b-2 border-brand-700">
        <div className="flex flex-col items-center justify-center gap-1.5 mb-4">
          <h2 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter">🚀 MEGA CHALLENGES 🚀</h2>
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/10 text-white text-xs font-bold border border-white/20">
            <span>🎯</span>
            <span>Tổng số: <strong className="text-amber-300">{totalMegaCount || 55} câu hỏi</strong></span>
            <span className="text-white/40">•</span>
            <span>Thang điểm: <strong className="text-emerald-300">10.0 chuẩn</strong></span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { id: 'mc', label: 'Quiz', icon: '📝', count: currentMega.multipleChoice?.length || 0 },
            ...(currentMega.readingMC && currentMega.readingMC.length > 0 ? [{ id: 'readingMC', label: 'Bài đọc ABCD', icon: '📖', count: currentMega.readingMC.length }] : []),
            ...(currentMega.pronunciation && currentMega.pronunciation.length > 0 ? [{ id: 'pronunciation', label: 'Cách đọc khác', icon: '🔊', count: currentMega.pronunciation.length }] : []),
            { id: 'scramble', label: 'Sắp xếp', icon: '🧩', count: currentMega.scramble?.length || 0 },
            { id: 'vocab', label: 'Dịch nghĩa', icon: '📚', count: currentMega.vocabTranslation?.length || 0 },
            { id: 'tf', label: 'True/False', icon: '✅', count: currentMega.trueFalse?.length || 0 },
            { id: 'listen', label: 'Nghe', icon: '🎧', count: currentListening?.length || 0 },
            ...(currentMega.fillBlank && currentMega.fillBlank.length > 0 ? [{ id: 'fill', label: 'Điền từ', icon: '✏️', count: currentMega.fillBlank.length }] : []),
          ].map(z => (
            <button key={z.id} onClick={() => setActiveZone(z.id as any)} className={`px-4 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition-all ${activeZone === z.id ? 'bg-highlight-400 text-brand-900 scale-105 shadow-lg ring-2 ring-white/20' : 'bg-brand-700 text-brand-200 hover:bg-brand-600'}`}>
              <span className="text-xl">{z.icon}</span> {z.count} {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8 bg-white/5">
        {/* Multiple Choice Section */}
        {activeZone === 'mc' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            {(currentMega.multipleChoice || []).map((q, idx) => {
              const allCorrectIndices = getAllSmartCorrectIndices(q.correctAnswer, q.options, q.alternativeCorrectAnswers);
              return (
              <div key={q.id} className="bg-white p-4 md:p-6 rounded-[2rem] shadow-lg border-2 border-slate-50 transition-all hover:border-brand-200">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <p className="font-black text-base md:text-lg text-slate-800 flex gap-3 leading-tight flex-1">
                    <span className="bg-brand-100 text-brand-600 px-3 py-0.5 rounded-lg h-fit text-sm shrink-0">Q{idx + 1}</span>
                    <span className="break-words">{q.question}</span>
                  </p>
                  {isTeacherActive && (
                    <button
                      type="button"
                      onClick={() => setFixingQuestion({ type: 'multipleChoice', index: idx, data: q })}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                      title="Kiểm tra & Sửa câu hỏi này (AI sinh lại hoặc nhập tay)"
                    >
                      <span>🛠️</span>
                      <span className="hidden sm:inline">Sửa câu</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(q.options || []).map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => { handleAnswer(q.id, i); checkFinal(q.id, smartCheckMC(i, q.correctAnswer, q.options, q.alternativeCorrectAnswers)); }}
                      disabled={submitted[q.id]}
                      className={`p-4 rounded-xl border-2 font-bold text-left text-sm md:text-base transition-all ${submitted[q.id]
                        ? allCorrectIndices.includes(i)
                          ? 'bg-green-100 border-green-500 text-green-700'
                          : answers[q.id] === i
                            ? 'bg-red-100 border-red-500 text-red-700'
                            : 'bg-slate-50 opacity-50'
                        : 'bg-white border-slate-50 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.98]'
                        }`}
                    >
                      <span className="mr-3 text-slate-300">{String.fromCharCode(65 + i)}.</span> {opt}
                    </button>
                  ))}
                </div>
                {submitted[q.id] && (
                  <CollapsibleExplanation
                    isCorrect={smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)}
                    explanation={q.explanation || ''}
                    correctAnswer={allCorrectIndices.map(ci => `${String.fromCharCode(65 + ci)}. ${q.options[ci]}`).join(' hoặc ')}
                    isTeacher={isTeacherActive}
                    onEditQuestion={() => setFixingQuestion({ type: 'multipleChoice', index: idx, data: q })}
                  />
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* Reading Comprehension ABCD Section (5 câu bài đọc chọn đáp án ABCD) */}
        {activeZone === 'readingMC' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            {/* Reading Passage Card */}
            <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-xl border-4 border-teal-100 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📖</span>
                  <h3 className="font-black text-slate-800 text-base sm:text-lg uppercase tracking-tight">
                    Bài Đọc Hiểu (Chọn Đáp Án Đúng A, B, C, D)
                  </h3>
                </div>
                {currentMega.readingMCPassage && (
                  <button
                    type="button"
                    onClick={() => playGeminiTTS(currentMega.readingMCPassage!)}
                    className="px-4 py-2 bg-gradient-to-r from-sky-600 to-sky-600 hover:from-sky-700 hover:to-sky-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <span>🔊</span> Nghe Đọc Bài Văn
                  </button>
                )}
              </div>
              <div className="bg-teal-50/40 p-4 sm:p-6 rounded-2xl border border-teal-100/80">
                <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-medium italic whitespace-pre-line font-serif">
                  "{currentMega.readingMCPassage || 'Đọc đoạn văn và chọn đáp án chính xác nhất cho từng câu hỏi bên dưới.'}"
                </p>
              </div>
            </div>

            {/* 5 Questions */}
            {(currentMega.readingMC || []).map((q, idx) => {
              const allCorrectIndices = getAllSmartCorrectIndices(q.correctAnswer, q.options, q.alternativeCorrectAnswers);
              return (
                <div key={q.id} className="bg-white p-4 md:p-6 rounded-[2rem] shadow-lg border-2 border-slate-50 transition-all hover:border-teal-200">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <p className="font-black text-base md:text-lg text-slate-800 flex gap-3 leading-tight flex-1">
                      <span className="bg-teal-100 text-teal-800 px-3 py-0.5 rounded-lg h-fit text-sm shrink-0">Câu {idx + 1}</span>
                      <span className="break-words">{q.question}</span>
                    </p>
                    {isTeacherActive && (
                      <button
                        type="button"
                        onClick={() => setFixingQuestion({ type: 'readingMC', index: idx, data: q })}
                        className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                        title="Kiểm tra & Sửa câu đọc hiểu này"
                      >
                        <span>🛠️</span>
                        <span className="hidden sm:inline">Sửa câu</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(q.options || []).map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { handleAnswer(q.id, i); checkFinal(q.id, smartCheckMC(i, q.correctAnswer, q.options, q.alternativeCorrectAnswers)); }}
                        disabled={submitted[q.id]}
                        className={`p-4 rounded-xl border-2 font-bold text-left text-sm md:text-base transition-all cursor-pointer ${submitted[q.id]
                          ? allCorrectIndices.includes(i)
                            ? 'bg-green-100 border-green-500 text-green-700'
                            : answers[q.id] === i
                              ? 'bg-red-100 border-red-500 text-red-700'
                              : 'bg-slate-50 opacity-50'
                          : 'bg-white border-slate-50 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.98]'
                          }`}
                      >
                        <span className="mr-3 text-slate-400 font-black">{String.fromCharCode(65 + i)}.</span> {opt}
                      </button>
                    ))}
                  </div>
                  {submitted[q.id] && (
                    <CollapsibleExplanation
                      isCorrect={smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)}
                      explanation={q.explanation || ''}
                      correctAnswer={allCorrectIndices.map(ci => `${String.fromCharCode(65 + ci)}. ${q.options[ci]}`).join(' hoặc ')}
                      isTeacher={isTeacherActive}
                      onEditQuestion={() => setFixingQuestion({ type: 'readingMC', index: idx, data: q })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pronunciation / Odd-One-Out Section (5 câu tìm từ có cách đọc khác) */}
        {activeZone === 'pronunciation' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-md border-2 border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔊</span>
                  <h3 className="font-black text-slate-800 text-base sm:text-lg uppercase tracking-tight">
                    Tìm Từ Có Cách Đọc Khác (Odd-One-Out Pronunciation)
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                  Chọn từ có phần gạch chân được phát âm khác biệt so với 3 từ còn lại trong mỗi câu. Bấm vào biểu tượng loa 🔊 để nghe phát âm từng từ nhé!
                </p>
              </div>
            </div>

            {/* 5 Pronunciation Questions */}
            {(currentMega.pronunciation || []).map((q, idx) => {
              const allCorrectIndices = getAllSmartCorrectIndices(q.correctAnswer, q.options, q.alternativeCorrectAnswers);
              return (
                <div key={q.id} className="bg-white p-4 md:p-6 rounded-[2rem] shadow-lg border-2 border-slate-50 transition-all hover:border-indigo-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <p className="font-black text-base md:text-lg text-slate-800 flex items-center gap-2 flex-1">
                      <span className="bg-indigo-100 text-indigo-700 px-3 py-0.5 rounded-lg text-sm shrink-0">Câu {idx + 1}</span>
                      <span>{q.question || 'Chọn từ có phần gạch chân phát âm khác với các từ còn lại:'}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      {q.targetSound && (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200">
                          🎯 {q.targetSound}
                        </span>
                      )}
                      {isTeacherActive && (
                        <button
                          type="button"
                          onClick={() => setFixingQuestion({ type: 'pronunciation', index: idx, data: q })}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                          title="Kiểm tra & Sửa câu phát âm này"
                        >
                          <span>🛠️</span>
                          <span className="hidden sm:inline">Sửa câu</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {(q.options || []).map((opt, i) => {
                      const displayWord = (q.displayOptions && q.displayOptions[i]) ? q.displayOptions[i] : opt;
                      return (
                        <div
                          key={i}
                          className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 ${submitted[q.id]
                            ? allCorrectIndices.includes(i)
                              ? 'bg-green-100 border-green-500 text-green-800 font-black'
                              : answers[q.id] === i
                                ? 'bg-red-100 border-red-500 text-red-700 font-bold'
                                : 'bg-slate-50 opacity-60'
                            : 'bg-white border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 active:scale-[0.98]'
                            }`}
                        >
                          <button
                            type="button"
                            onClick={() => { handleAnswer(q.id, i); checkFinal(q.id, smartCheckMC(i, q.correctAnswer, q.options, q.alternativeCorrectAnswers)); }}
                            disabled={submitted[q.id]}
                            className="flex-1 flex items-center gap-2 text-left font-bold text-sm sm:text-base cursor-pointer"
                          >
                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black shrink-0">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="text-slate-800 flex-1">
                              {renderUnderlinedWord(displayWord)}
                            </span>
                            {submitted[q.id] && allCorrectIndices.includes(i) && (
                              <span className="text-base font-bold shrink-0">✅</span>
                            )}
                            {submitted[q.id] && answers[q.id] === i && !allCorrectIndices.includes(i) && (
                              <span className="text-base font-bold shrink-0">❌</span>
                            )}
                          </button>

                          {/* Mini Listen Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playGeminiTTS(opt);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 transition-colors shrink-0 cursor-pointer"
                            title={`Nghe phát âm "${opt}"`}
                          >
                            🔊
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {submitted[q.id] && (
                    <CollapsibleExplanation
                      isCorrect={smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)}
                      explanation={q.explanation || ''}
                      correctAnswer={allCorrectIndices.map(ci => `${String.fromCharCode(65 + ci)}. ${q.options[ci]}`).join(' hoặc ')}
                      isTeacher={isTeacherActive}
                      onEditQuestion={() => setFixingQuestion({ type: 'pronunciation', index: idx, data: q })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Fill-in-the-Blank Section - TEXT INPUT */}
        {activeZone === 'fill' && (
          <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
            {(currentMega.fillBlank || []).map((q, idx) => {
              const isSubmitted = submitted[q.id];
              const userInput = answers[q.id]?.userAnswer || '';
              const isCorrect = answers[q.id]?.isCorrect;

              return (
                <div key={q.id} className="bg-white p-4 md:p-8 rounded-[2rem] shadow-lg border-b-4 border-slate-100">
                  <div className="flex items-start gap-4 mb-4">
                    <span className="text-4xl md:text-5xl bg-brand-50 p-3 md:p-4 rounded-2xl shadow-inner shrink-0">{q.clueEmoji || '📝'}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">ĐIỀN TỪ CÂU {idx + 1}:</p>
                        {isTeacherActive && (
                          <button
                            type="button"
                            onClick={() => setFixingQuestion({ type: 'fillBlank', index: idx, data: q })}
                            className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                            title="Kiểm tra & Sửa câu điền từ này"
                          >
                            <span>🛠️</span>
                            <span className="hidden sm:inline">Sửa câu</span>
                          </button>
                        )}
                      </div>
                      <p className="text-lg md:text-xl font-bold text-slate-700 leading-relaxed break-words">{q.question}</p>
                    </div>
                  </div>

                  {/* Text Input Field */}
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={answers[q.id]?.userAnswer || ''}
                      onChange={(e) => {
                        if (!isSubmitted) {
                          handleAnswer(q.id, { userAnswer: e.target.value, isCorrect: false });
                        }
                      }}
                      disabled={isSubmitted}
                      placeholder="Nhập đáp án của bạn..."
                      className={`w-full p-4 text-lg font-bold rounded-xl border-2 transition-all outline-none ${isSubmitted
                        ? isCorrect
                          ? 'bg-green-50 border-green-400 text-green-700'
                          : 'bg-red-50 border-red-400 text-red-700'
                        : 'bg-white border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
                        }`}
                    />

                    {!isSubmitted && (
                      <button
                        onClick={() => {
                          const userAnswer = (answers[q.id]?.userAnswer || '').trim();
                          const correct = checkFillAnswer(userAnswer, q.correctAnswer, q.alternativeAnswers, q.question);
                          handleAnswer(q.id, { userAnswer, isCorrect: correct });
                          checkFinal(q.id, correct);
                        }}
                        disabled={!answers[q.id]?.userAnswer?.trim()}
                        className="w-full py-3 rounded-xl font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md"
                      >
                        ✅ Kiểm tra
                      </button>
                    )}
                  </div>

                  {isSubmitted && (
                    <CollapsibleExplanation
                      isCorrect={isCorrect}
                      explanation={q.explanation || ''}
                      correctAnswer={q.correctAnswer}
                      userAnswer={userInput}
                      isTeacher={isTeacherActive}
                      onEditQuestion={() => setFixingQuestion({ type: 'fillBlank', index: idx, data: q })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Scramble/Arrange Words Section - TAP TO BUILD SENTENCE */}
        {activeZone === 'scramble' && (
          <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
            {(currentMega.scramble || []).map((q, idx) => {
              const result = answers[q.id];
              const isSubmitted = submitted[q.id];

              // Parse correct sentence into tokens for validation
              const correctTokens = parseIntoTokens(q.correctSentence);

              // Use provided scrambled array as word bank
              let wordBank = q.scrambled || [];

              // Validation: ensure word bank matches expected token count & clean stray punctuation
              const cleanWord = (s: string) => s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_()?\"“”']/g, '').trim();
              const expectedClean = correctTokens.map(cleanWord);
              const actualClean = wordBank.map(cleanWord);

              if (wordBank.length !== correctTokens.length || expectedClean.sort().join('|') !== actualClean.sort().join('|')) {
                // Fallback: use parsed tokens from correct sentence
                wordBank = [...correctTokens];
              } else {
                // Ensure only the terminal word has terminal punctuation, and no middle word carries a stray period
                const lastCorrectClean = cleanWord(correctTokens[correctTokens.length - 1]);
                const terminalMatch = q.correctSentence.match(/[.!?]$/);
                const terminalPunct = terminalMatch ? terminalMatch[0] : '.';
                let terminalAssigned = false;
                wordBank = wordBank.map(token => {
                  const cw = cleanWord(token);
                  if (cw === lastCorrectClean && !terminalAssigned) {
                    terminalAssigned = true;
                    const baseWord = token.replace(/[.,/#!$%^&*;:{}=\-_()?\"“”']/g, '');
                    return baseWord + terminalPunct;
                  }
                  return token.replace(/[.,/#!$%^&*;:{}=\-_()?\"“”']/g, '');
                });
              }

              return (
                <div key={q.id} className="bg-white p-4 md:p-8 rounded-[2rem] shadow-lg border-b-4 border-slate-100">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div>
                      <p className="text-slate-400 font-black uppercase text-[10px] mb-1 tracking-widest">SẮP XẾP CÂU {idx + 1}:</p>
                      <p className="text-sm text-slate-600 font-medium">Chạm vào các từ để xếp thành câu hoàn chỉnh:</p>
                    </div>
                    {isTeacherActive && (
                      <button
                        type="button"
                        onClick={() => setFixingQuestion({ type: 'scramble', index: idx, data: q })}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                        title="Kiểm tra & Sửa câu sắp xếp này"
                      >
                        <span>🛠️</span>
                        <span className="hidden sm:inline">Sửa câu</span>
                      </button>
                    )}
                  </div>

                  <WordBankFill
                    questionId={q.id}
                    wordBank={wordBank}
                    correctTokens={correctTokens}
                    mode="arrange_words"
                    disabled={isSubmitted}
                    showResult={isSubmitted}
                    sessionSeed={SESSION_SEED}
                    onComplete={(res) => {
                      handleAnswer(q.id, res);
                      checkFinal(q.id, res.isCorrect);
                    }}
                  />

                  {isSubmitted && (
                    <CollapsibleExplanation
                      isCorrect={result?.isCorrect}
                      explanation={q.translation ? `Nghĩa: ${q.translation}` : ''}
                      correctAnswer={q.correctSentence}
                      userAnswer={result?.userAnswer}
                      isTeacher={isTeacherActive}
                      onEditQuestion={() => setFixingQuestion({ type: 'scramble', index: idx, data: q })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Vocabulary Translation Section - Dịch nghĩa Anh-Việt */}
        {activeZone === 'vocab' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 rounded-2xl mb-6 text-center">
              <h3 className="text-lg font-black">📚 Bài tập dịch nghĩa</h3>
              <p className="text-sm opacity-90">Chọn nghĩa tiếng Việt đúng cho từ tiếng Anh</p>
            </div>
            {(currentMega.vocabTranslation || []).map((q, idx) => {
              const allCorrectIndices = getAllSmartCorrectIndices(q.correctAnswer, q.options, q.alternativeCorrectAnswers);
              return (
              <div key={q.id} className="bg-white p-4 md:p-6 rounded-[2rem] shadow-lg border-2 border-slate-50 transition-all hover:border-purple-200">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-purple-100 text-purple-600 px-3 py-1 rounded-lg font-bold text-sm">#{idx + 1}</span>
                    <span className="text-3xl md:text-4xl font-black text-slate-800 tracking-wide">{q.word}</span>
                  </div>
                  {isTeacherActive && (
                    <button
                      type="button"
                      onClick={() => setFixingQuestion({ type: 'vocabTranslation', index: idx, data: q })}
                      className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                      title="Kiểm tra & Sửa câu dịch nghĩa này"
                    >
                      <span>🛠️</span>
                      <span className="hidden sm:inline">Sửa câu</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(q.options || []).map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => { handleAnswer(q.id, i); checkFinal(q.id, smartCheckMC(i, q.correctAnswer, q.options, q.alternativeCorrectAnswers)); }}
                      disabled={submitted[q.id]}
                      className={`p-4 rounded-xl border-2 font-bold text-left text-sm md:text-base transition-all ${submitted[q.id]
                        ? allCorrectIndices.includes(i)
                          ? 'bg-green-100 border-green-500 text-green-700'
                          : answers[q.id] === i
                            ? 'bg-red-100 border-red-500 text-red-700'
                            : 'bg-slate-50 opacity-50'
                        : 'bg-white border-slate-50 hover:border-purple-300 hover:bg-purple-50 active:scale-[0.98]'
                        }`}
                    >
                      <span className="mr-3 text-slate-300">{String.fromCharCode(65 + i)}.</span> {opt}
                    </button>
                  ))}
                </div>
                {submitted[q.id] && (
                  <CollapsibleExplanation
                    isCorrect={smartCheckMC(answers[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)}
                    explanation={q.explanation || `'${q.word}' nghĩa là '${q.options[q.correctAnswer]}'`}
                    correctAnswer={allCorrectIndices.map(ci => `${String.fromCharCode(65 + ci)}. ${q.options[ci]}`).join(' hoặc ')}
                    isTeacher={isTeacherActive}
                    onEditQuestion={() => setFixingQuestion({ type: 'vocabTranslation', index: idx, data: q })}
                  />
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* True/False Reading Comprehension Section */}
        {activeZone === 'tf' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            {/* Reading Passage */}
            {currentMega.trueFalsePassage && (
              <div className="bg-gradient-to-br from-sky-50 to-cyan-50 p-6 md:p-8 rounded-[2rem] shadow-lg border-2 border-teal-100 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">📖</span>
                  <h3 className="text-lg font-black text-teal-700">Bài đọc hiểu</h3>
                </div>
                <p className="text-slate-700 leading-relaxed text-base md:text-lg whitespace-pre-line">
                  {currentMega.trueFalsePassage}
                </p>
              </div>
            )}

            <div className="bg-gradient-to-r from-sky-500 to-cyan-600 text-white p-4 rounded-2xl text-center">
              <h3 className="text-lg font-black">✅ Câu hỏi True / False</h3>
              <p className="text-sm opacity-90">Đọc bài văn và chọn True (Đúng) hoặc False (Sai)</p>
            </div>

            {(currentMega.trueFalse || []).map((q, idx) => (
              <div key={q.id} className="bg-white p-4 md:p-6 rounded-[2rem] shadow-lg border-2 border-slate-50 transition-all hover:border-teal-200">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="bg-teal-100 text-teal-600 px-3 py-1 rounded-lg font-bold text-sm">Câu {idx + 1}</span>
                  {isTeacherActive && (
                    <button
                      type="button"
                      onClick={() => setFixingQuestion({ type: 'trueFalse', index: idx, data: q })}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                      title="Kiểm tra & Sửa câu True/False này"
                    >
                      <span>🛠️</span>
                      <span className="hidden sm:inline">Sửa câu</span>
                    </button>
                  )}
                </div>
                <p className="text-base md:text-lg font-bold text-slate-800 mb-4 leading-relaxed">{q.statement}</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => { handleAnswer(q.id, true); checkFinal(q.id, q.isTrue === true); }}
                    disabled={submitted[q.id]}
                    className={`flex-1 p-4 rounded-xl border-2 font-black text-lg transition-all ${submitted[q.id]
                      ? q.isTrue === true
                        ? 'bg-green-100 border-green-500 text-green-700'
                        : answers[q.id] === true
                          ? 'bg-red-100 border-red-500 text-red-700'
                          : 'bg-slate-50 opacity-50'
                      : 'bg-white border-slate-50 hover:border-green-300 hover:bg-green-50 active:scale-[0.98]'
                      }`}
                  >
                    ✓ TRUE
                  </button>
                  <button
                    onClick={() => { handleAnswer(q.id, false); checkFinal(q.id, q.isTrue === false); }}
                    disabled={submitted[q.id]}
                    className={`flex-1 p-4 rounded-xl border-2 font-black text-lg transition-all ${submitted[q.id]
                      ? q.isTrue === false
                        ? 'bg-green-100 border-green-500 text-green-700'
                        : answers[q.id] === false
                          ? 'bg-red-100 border-red-500 text-red-700'
                          : 'bg-slate-50 opacity-50'
                      : 'bg-white border-slate-50 hover:border-red-300 hover:bg-red-50 active:scale-[0.98]'
                      }`}
                  >
                    ✗ FALSE
                  </button>
                </div>
                {submitted[q.id] && (
                  <CollapsibleExplanation
                    isCorrect={answers[q.id] === q.isTrue}
                    explanation={q.explanation}
                    correctAnswer={q.isTrue ? 'TRUE (Đúng)' : 'FALSE (Sai)'}
                    isTeacher={isTeacherActive}
                    onEditQuestion={() => setFixingQuestion({ type: 'trueFalse', index: idx, data: q })}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reading Comprehension Fill-in-the-Blank Section */}
        {activeZone === 'readingFill' && currentMega.readingFill && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            {/* Reading Passage */}
            {currentMega.trueFalsePassage && (
              <div className="bg-gradient-to-br from-sky-50 to-cyan-50 p-6 md:p-8 rounded-[2rem] shadow-lg border-2 border-teal-100 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">📖</span>
                  <h3 className="text-lg font-black text-teal-700">Bài đọc hiểu</h3>
                </div>
                <p className="text-slate-700 leading-relaxed text-base md:text-lg whitespace-pre-line">
                  {currentMega.trueFalsePassage}
                </p>
              </div>
            )}

            <div className="bg-gradient-to-r from-sky-600 to-sky-600 text-white p-4 rounded-2xl text-center">
              <h3 className="text-lg font-black">📖 5 Câu Đọc Hiểu Điền Từ</h3>
              <p className="text-sm opacity-90">Đọc kỹ bài văn và điền từ thích hợp vào chỗ trống</p>
            </div>

            {currentMega.readingFill.map((q, idx) => {
              const isSubmitted = !!submitted[q.id];
              const userInput = answers[q.id]?.userAnswer || '';
              const isCorrect = answers[q.id]?.isCorrect;

              return (
                <div key={q.id} className="bg-white p-4 md:p-8 rounded-[2rem] shadow-lg border-b-4 border-slate-100">
                  <div className="flex items-start gap-4 mb-4">
                    <span className="text-4xl md:text-5xl bg-teal-50 p-3 md:p-4 rounded-2xl shadow-inner shrink-0">{q.clueEmoji || '📖'}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">ĐỌC HIỂU CÂU {idx + 1}:</p>
                        {isTeacherActive && (
                          <button
                            type="button"
                            onClick={() => setFixingQuestion({ type: 'readingFill', index: idx, data: q })}
                            className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                            title="Kiểm tra & Sửa câu đọc hiểu điền từ này"
                          >
                            <span>🛠️</span>
                            <span className="hidden sm:inline">Sửa câu</span>
                          </button>
                        )}
                      </div>
                      <p className="text-lg md:text-xl font-bold text-slate-700 leading-relaxed break-words">{q.question}</p>
                    </div>
                  </div>

                  {/* Word Bank Quick Tap if options provided */}
                  {Array.isArray(q.options) && q.options.length > 0 && !isSubmitted && (
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">Từ gợi ý:</span>
                      {q.options.map((opt: string, optI: number) => (
                        <button
                          key={optI}
                          type="button"
                          onClick={() => {
                            handleAnswer(q.id, { userAnswer: opt, isCorrect: false });
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            userInput.toLowerCase() === opt.toLowerCase()
                              ? 'bg-teal-600 text-white border-teal-700 shadow-sm scale-105'
                              : 'bg-slate-50 hover:bg-teal-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Text Input Field */}
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={answers[q.id]?.userAnswer || ''}
                      onChange={(e) => {
                        if (!isSubmitted) {
                          handleAnswer(q.id, { userAnswer: e.target.value, isCorrect: false });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isSubmitted && (answers[q.id]?.userAnswer || '').trim()) {
                          const userAns = (answers[q.id]?.userAnswer || '').trim();
                          const correct = checkFillAnswer(userAns, q.correctAnswer, q.alternativeAnswers, q.question);
                          handleAnswer(q.id, { userAnswer: userAns, isCorrect: correct });
                          checkFinal(q.id, correct);
                        }
                      }}
                      disabled={isSubmitted}
                      placeholder="Nhập từ cần điền vào chỗ trống..."
                      className={`w-full p-4 text-lg font-bold rounded-xl border-2 transition-all outline-none ${isSubmitted
                        ? isCorrect
                          ? 'bg-green-50 border-green-400 text-green-700'
                          : 'bg-red-50 border-red-400 text-red-700'
                        : 'bg-white border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100'
                        }`}
                    />

                    {!isSubmitted && (
                      <button
                        onClick={() => {
                          const userAns = (answers[q.id]?.userAnswer || '').trim();
                          const correct = checkFillAnswer(userAns, q.correctAnswer, q.alternativeAnswers, q.question);
                          handleAnswer(q.id, { userAnswer: userAns, isCorrect: correct });
                          checkFinal(q.id, correct);
                        }}
                        disabled={!answers[q.id]?.userAnswer?.trim()}
                        className="w-full py-3 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
                      >
                        ✅ Kiểm tra
                      </button>
                    )}
                  </div>

                  {isSubmitted && (
                    <CollapsibleExplanation
                      isCorrect={isCorrect}
                      explanation={q.explanation || ''}
                      correctAnswer={q.correctAnswer}
                      userAnswer={userInput}
                      isTeacher={isTeacherActive}
                      onEditQuestion={() => setFixingQuestion({ type: 'readingFill', index: idx, data: q })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Listening Comprehension Section - BLANK FILLING */}
        {activeZone === 'listen' && (
          <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-sky-500 via-cyan-600 to-blue-600 text-white p-5 rounded-2xl mb-6 text-center shadow-lg">
              <h3 className="text-xl font-black flex items-center justify-center gap-2">
                <span>🎧</span> Bài tập Nghe & Điền từ
              </h3>
              <p className="text-xs sm:text-sm opacity-95 mt-1 font-medium">
                Audio đọc đầy đủ nội dung câu/đoạn văn. Nhiệm vụ của em là lắng nghe và điền từ còn thiếu vào ô trống.
              </p>
            </div>

            {(currentListening || []).map((q, idx) => {
              const details = getListeningQuestionDetails(q);
              const isDone = !!submitted[q.id];
              const userInput = String(answers[q.id] || '');
              const isCorrect = isDone && checkListeningBlank(userInput, q);

              return (
                <div
                  key={q.id}
                  className={`bg-white p-5 md:p-7 rounded-[2rem] shadow-lg border-2 transition-all ${
                    isDone
                      ? isCorrect
                        ? 'border-green-400 bg-green-50/20 ring-4 ring-green-100'
                        : 'border-rose-400 bg-rose-50/20 ring-4 ring-rose-100'
                      : 'border-slate-100 hover:border-cyan-300'
                  }`}
                >
                  {/* Top Bar: Question badge + Audio Play Button */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="bg-cyan-100 text-cyan-700 px-3.5 py-1.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wide">
                        Câu {idx + 1}
                      </span>
                      <span className="text-xs text-slate-400 font-bold hidden sm:inline">
                        🎧 Nghe trọn vẹn câu:
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => playGeminiTTS(q.audioText)}
                        className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-4 py-2 rounded-xl font-black text-xs sm:text-sm shadow-md hover:shadow-lg transition-all active:scale-95"
                      >
                        <span className="text-lg">🔊</span> Phát âm thanh (Đọc trọn câu)
                      </button>

                      {isTeacherActive && (
                        <button
                          type="button"
                          onClick={() => setFixingQuestion({ type: 'listening', index: idx, data: q })}
                          className="px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm transition-all hover:scale-105 cursor-pointer"
                          title="Kiểm tra & Sửa câu nghe này"
                        >
                          <span>🛠️</span>
                          <span className="hidden sm:inline">Sửa câu</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sentence with blank display */}
                  <div className="bg-gradient-to-r from-slate-50 to-cyan-50/40 p-4 sm:p-5 rounded-2xl border border-cyan-100 mb-5">
                    <p className="text-xs uppercase font-black tracking-wider text-cyan-800 mb-1 flex items-center gap-1.5">
                      <span>📝</span> Câu / Đoạn văn cần điền từ:
                    </p>
                    <p className="text-base sm:text-xl font-bold text-slate-800 leading-relaxed font-display">
                      {details.sentenceWithBlank}
                    </p>
                  </div>

                  {/* Input area for student */}
                  <div className="space-y-3">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500">
                      Gõ từ còn thiếu em nghe được:
                    </label>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-base pointer-events-none">
                          ✏️
                        </span>
                        <input
                          type="text"
                          disabled={isDone}
                          value={userInput}
                          onChange={(e) => handleAnswer(q.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isDone && userInput.trim()) {
                              checkFinal(q.id, checkListeningBlank(userInput, q));
                            }
                          }}
                          placeholder="Ví dụ: school bag..."
                          className={`w-full pl-10 pr-4 py-3.5 rounded-xl border-2 font-bold text-base outline-none transition-all ${
                            isDone
                              ? isCorrect
                                ? 'bg-green-50 border-green-500 text-green-800'
                                : 'bg-rose-50 border-rose-500 text-rose-800'
                              : 'bg-white border-slate-200 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-slate-900'
                          }`}
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isDone || !userInput.trim()}
                        onClick={() => checkFinal(q.id, checkListeningBlank(userInput, q))}
                        className="px-6 py-3.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl font-black text-sm transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>✓</span> Kiểm tra
                      </button>
                    </div>
                  </div>

                  {/* Explanation after submission */}
                  {isDone && (
                    <CollapsibleExplanation
                      isCorrect={isCorrect}
                      explanation={q.explanation || ''}
                      correctAnswer={details.missingWord}
                      userAnswer={userInput}
                      isTeacher={isTeacherActive}
                      onEditQuestion={() => setFixingQuestion({ type: 'listening', index: idx, data: q })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Teacher Question Fix Modal */}
      {fixingQuestion && (
        <QuestionFixModal
          questionType={fixingQuestion.type}
          questionIndex={fixingQuestion.index}
          questionData={fixingQuestion.data}
          context={lessonContext}
          onSave={handleQuestionSaved}
          onClose={() => setFixingQuestion(null)}
        />
      )}

      {/* Floating Success Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl border-2 border-white/30 font-black text-sm flex items-center gap-2 animate-bounce">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
