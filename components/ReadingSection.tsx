
import React, { useState } from 'react';
import { ReadingAdventure, ReadingFillBlankQ } from '../types';
import { playGeminiTTS } from '../services/geminiService';
import { checkFillAnswer, smartCheckMC, getAllSmartCorrectIndices } from '../utils/smartGrading';

interface ReadingSectionProps {
  reading: ReadingAdventure;
  onScoreUpdate?: (score: number, total: number) => void;
}

export const ReadingSection: React.FC<ReadingSectionProps> = ({ reading, onScoreUpdate }) => {
  const [showTranslation, setShowTranslation] = useState(false);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const [checkedResults, setCheckedResults] = useState<Record<string, boolean>>({});
  const [legacyMcAnswers, setLegacyMcAnswers] = useState<Record<string, number>>({});

  const playPassage = () => {
    if (reading?.passage) {
      playGeminiTTS(reading.passage);
    }
  };

  if (!reading) return null;

  const questions: (ReadingFillBlankQ | any)[] = reading.comprehension || [];

  const handleInputChange = (qId: string, val: string) => {
    if (checkedResults[qId] !== undefined) return;
    setUserInputs(prev => ({ ...prev, [qId]: val }));
  };

  const handleOptionTap = (qId: string, opt: string) => {
    if (checkedResults[qId] !== undefined) return;
    setUserInputs(prev => ({ ...prev, [qId]: opt }));
  };

  const handleCheck = (q: any) => {
    const userInput = (userInputs[q.id] || '').trim();
    if (!userInput) return;

    const isCorrect = checkFillAnswer(
      userInput,
      q.correctAnswer,
      q.alternativeAnswers,
      q.question
    );

    const nextChecked = { ...checkedResults, [q.id]: isCorrect };
    setCheckedResults(nextChecked);

    if (onScoreUpdate) {
      const correctCount = questions.filter(item => {
        if (nextChecked[item.id] !== undefined) return nextChecked[item.id];
        return false;
      }).length;
      onScoreUpdate(correctCount, questions.length);
    }
  };

  // Legacy Multiple Choice Handler (Backward Compatibility)
  const handleLegacyMc = (q: any, optIdx: number) => {
    if (legacyMcAnswers[q.id] !== undefined) return;
    const isCorrect = smartCheckMC(optIdx, q.correctAnswer, q.options, q.alternativeCorrectAnswers);
    setLegacyMcAnswers(prev => ({ ...prev, [q.id]: optIdx }));
    setCheckedResults(prev => ({ ...prev, [q.id]: isCorrect }));
  };

  return (
    <div className="bg-white rounded-[3rem] sm:rounded-[4rem] shadow-2xl border-4 sm:border-[10px] border-brand-50 overflow-hidden mb-12 animate-fade-in font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-600 to-teal-700 p-6 sm:p-12 text-white relative">
        <div className="absolute top-6 right-6 text-6xl sm:text-7xl opacity-20 pointer-events-none">📖</div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider mb-3">
          <span>🎯</span> Reading Adventure
        </div>
        <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter mb-2">
          Bài Đọc Hiểu & Điền Từ
        </h2>
        <h3 className="text-lg sm:text-2xl font-bold text-highlight-300 drop-shadow-sm">
          {reading.title || 'Reading Comprehension'}
        </h3>
      </div>

      <div className="p-6 sm:p-12 grid lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left Column: Reading Passage */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center border-b-2 border-slate-100 pb-4 gap-2">
            <button
              onClick={playPassage}
              className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white px-5 py-2.5 rounded-2xl font-black text-sm sm:text-base flex items-center gap-2.5 shadow-md transition-all cursor-pointer"
            >
              <span>🔊</span> Nghe bài đọc (Giọng Anh - Anh)
            </button>
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className="text-xs sm:text-sm font-black text-slate-500 hover:text-brand-600 underline uppercase tracking-wider cursor-pointer"
            >
              {showTranslation ? 'Ẩn bản dịch' : '🔍 Xem bản dịch tiếng Việt'}
            </button>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-teal-50/40 p-6 sm:p-8 rounded-[2.5rem] border-2 border-teal-100 shadow-inner relative group">
            <p className="text-base sm:text-xl font-medium leading-relaxed text-slate-800 italic font-serif whitespace-pre-line">
              "{reading.passage}"
            </p>
            {showTranslation && reading.translation && (
              <div className="mt-6 pt-6 border-t-2 border-teal-200/60 animate-fade-in">
                <p className="text-xs font-black uppercase text-teal-800 tracking-wider mb-1.5">Bản dịch tiếng Việt:</p>
                <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed italic whitespace-pre-line">
                  {reading.translation}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 5 Reading Fill-in-the-Blank Questions */}
        <div className="lg:col-span-6 space-y-6">
          <div className="border-b-2 border-slate-100 pb-4 flex items-center justify-between">
            <h4 className="text-lg sm:text-xl font-black text-brand-900 uppercase tracking-tight flex items-center gap-2">
              <span>✏️</span> 5 Câu Đọc Hiểu Điền Từ
            </h4>
            <span className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-xl border border-teal-200">
              {questions.length} câu
            </span>
          </div>

          <div className="space-y-6">
            {questions.map((q, idx) => {
              const isChecked = checkedResults[q.id] !== undefined;
              const isCorrect = checkedResults[q.id] === true;
              const currentInput = userInputs[q.id] || '';

              // Check if this is a legacy Multiple Choice question
              const isLegacyMC = typeof q.correctAnswer === 'number' && Array.isArray(q.options);

              if (isLegacyMC) {
                const userChoice = legacyMcAnswers[q.id];
                const allCorrect = getAllSmartCorrectIndices(q.correctAnswer, q.options, q.alternativeCorrectAnswers);
                return (
                  <div key={q.id} className="bg-white p-5 sm:p-6 rounded-[2rem] border-2 border-slate-100 shadow-md">
                    <p className="font-bold text-base text-slate-800 mb-3 flex items-start gap-2">
                      <span className="bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-lg text-xs font-black shrink-0">
                        Câu {idx + 1}
                      </span>
                      <span>{q.question}</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => handleLegacyMc(q, i)}
                          disabled={userChoice !== undefined}
                          className={`p-3 rounded-xl border-2 font-bold text-left text-xs sm:text-sm transition-all ${
                            userChoice !== undefined
                              ? allCorrect.includes(i)
                                ? 'bg-green-100 border-green-500 text-green-800'
                                : userChoice === i
                                  ? 'bg-red-100 border-red-500 text-red-800'
                                  : 'bg-slate-50 opacity-40'
                              : 'bg-white border-slate-200 hover:border-brand-400 hover:bg-brand-50'
                          }`}
                        >
                          <span className="font-black text-slate-400 mr-2">{String.fromCharCode(65 + i)}.</span>
                          {opt}
                        </button>
                      ))}
                    </div>
                    {userChoice !== undefined && q.explanation && (
                      <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${isCorrect ? 'bg-green-50 text-green-800' : 'bg-rose-50 text-rose-800'}`}>
                        <span>{isCorrect ? '✅' : '💡'}</span>
                        <span>{q.explanation}</span>
                      </div>
                    )}
                  </div>
                );
              }

              // Standard Fill-in-the-blank Question
              return (
                <div
                  key={q.id}
                  className={`bg-white p-5 sm:p-6 rounded-[2rem] border-2 shadow-md transition-all ${
                    isChecked
                      ? isCorrect
                        ? 'border-green-300 bg-green-50/20'
                        : 'border-rose-300 bg-rose-50/20'
                      : 'border-slate-100 hover:border-brand-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5 mb-3">
                    <span className="bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-lg text-xs font-black shrink-0">
                      Câu {idx + 1}
                    </span>
                    <p className="font-bold text-base text-slate-800 leading-snug">
                      {q.question}
                    </p>
                  </div>

                  {/* Word Bank Quick-Tap Pills (if provided) */}
                  {Array.isArray(q.options) && q.options.length > 0 && !isChecked && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-400 mr-1">Từ gợi ý:</span>
                      {q.options.map((opt: string, optI: number) => (
                        <button
                          key={optI}
                          type="button"
                          onClick={() => handleOptionTap(q.id, opt)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                            currentInput.toLowerCase() === opt.toLowerCase()
                              ? 'bg-brand-500 text-white border-brand-600 shadow-sm scale-105'
                              : 'bg-slate-50 hover:bg-brand-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input Box and Check Button */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentInput}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isChecked && currentInput.trim()) {
                          handleCheck(q);
                        }
                      }}
                      disabled={isChecked}
                      placeholder="Nhập từ cần điền vào ô trống..."
                      className={`flex-1 px-4 py-2.5 rounded-xl border-2 font-bold text-sm outline-none transition-all ${
                        isChecked
                          ? isCorrect
                            ? 'bg-green-50 border-green-400 text-green-800'
                            : 'bg-rose-50 border-rose-400 text-rose-800'
                          : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-brand-500'
                      }`}
                    />

                    {!isChecked && (
                      <button
                        type="button"
                        onClick={() => handleCheck(q)}
                        disabled={!currentInput.trim()}
                        className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wide rounded-xl shadow-md transition-all cursor-pointer"
                      >
                        Kiểm tra
                      </button>
                    )}
                  </div>

                  {/* Explanation feedback */}
                  {isChecked && (
                    <div className={`mt-3 p-3.5 rounded-xl text-xs flex flex-col gap-1 ${
                      isCorrect ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>{isCorrect ? '🎉' : '❌'}</span>
                        <span>{isCorrect ? 'Chính xác!' : `Chưa đúng. Đáp án chuẩn: "${q.correctAnswer}"`}</span>
                      </div>
                      {q.explanation && (
                        <p className="text-slate-600 font-medium italic mt-0.5">
                          💡 {q.explanation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
