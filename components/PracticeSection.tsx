
import React, { useState, useEffect } from 'react';
import { ListeningQ, PracticeContent } from '../types';
import { playGeminiTTS } from '../services/geminiService';
import { smartCheckMC, getAllSmartCorrectIndices } from '../utils/smartGrading';

// Add missing interface definition for PracticeSection props
interface PracticeSectionProps {
  content: PracticeContent;
  onScoreUpdate?: (score: number) => void;
}

export const PracticeSection: React.FC<PracticeSectionProps> = ({ content, onScoreUpdate }) => {
    const [selectedMap, setSelectedMap] = useState<Record<string, number>>({});
    const questions = content?.listening || [];

    useEffect(() => {
        if (onScoreUpdate) {
            const correctCount = questions.filter(q => selectedMap[q.id] !== undefined && smartCheckMC(selectedMap[q.id], q.correctAnswer, q.options, q.alternativeCorrectAnswers)).length;
            onScoreUpdate(correctCount);
        }
    }, [selectedMap, questions, onScoreUpdate]);

    const handleSelect = (qId: string, idx: number) => {
        if (selectedMap[qId] !== undefined) return;
        setSelectedMap(prev => ({ ...prev, [qId]: idx }));
    };

    return (
        <div className="space-y-12 animate-fade-in pb-10 max-w-5xl mx-auto">
            {questions.map((q, i) => {
                const userChoice = selectedMap[q.id];
                const isSelected = userChoice !== undefined;
                const isCorrect = userChoice !== undefined && smartCheckMC(userChoice, q.correctAnswer, q.options, q.alternativeCorrectAnswers);
                const allCorrectIndices = getAllSmartCorrectIndices(q.correctAnswer, q.options, q.alternativeCorrectAnswers);

                return (
                    <div key={q.id} className="bg-white p-8 rounded-[3rem] border-4 border-brand-50 shadow-xl overflow-hidden">
                        <div className="flex flex-col md:flex-row gap-6 mb-8 items-center">
                            <span className="bg-brand-600 text-white font-black px-6 py-3 rounded-2xl h-fit border-b-4 border-brand-800 text-2xl uppercase shrink-0">Câu {i + 1}</span>
                            <button 
                                onClick={() => playGeminiTTS(q.audioText)}
                                className="bg-brand-500 text-white p-6 rounded-3xl shadow-2xl hover:bg-brand-400 transition-all flex items-center gap-6 ring-8 ring-brand-50 group active:scale-95"
                            >
                                <span className="text-5xl group-hover:scale-110 transition-transform">🔊</span>
                                <span className="font-black text-3xl uppercase tracking-widest">NGHE LOA</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            {q.options.map((opt, idx) => {
                                let btnClass = "bg-white border-slate-100 hover:border-brand-300 hover:bg-brand-50";
                                
                                if (isSelected) {
                                    if (allCorrectIndices.includes(idx)) {
                                        btnClass = "bg-green-100 border-green-500 text-green-800 ring-4 ring-green-100 scale-[1.02] z-10";
                                    } else if (idx === userChoice) {
                                        btnClass = "bg-rose-100 border-rose-500 text-rose-800 ring-4 ring-rose-100 opacity-90";
                                    } else {
                                        btnClass = "bg-slate-50 border-slate-100 opacity-40 grayscale";
                                    }
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelect(q.id, idx)}
                                        disabled={isSelected}
                                        className={`p-8 rounded-[2.5rem] border-4 font-black transition-all text-left text-3xl shadow-sm relative overflow-hidden ${btnClass}`}
                                    >
                                        <span className="mr-6 font-black text-slate-300">{String.fromCharCode(65 + idx)}.</span>
                                        {opt}
                                        {isSelected && allCorrectIndices.includes(idx) && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-4xl">✅</span>}
                                        {isSelected && idx === userChoice && !allCorrectIndices.includes(idx) && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-4xl">❌</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {isSelected && (
                            <div className={`mt-8 p-8 rounded-[2.5rem] border-l-[15px] shadow-2xl animate-bounce-in ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-rose-50 border-rose-500'}`}>
                                <div className="flex items-start gap-6">
                                    <span className="text-6xl drop-shadow-sm">{isCorrect ? '🌟' : '💡'}</span>
                                    <div className="flex-1">
                                        <h4 className={`font-black text-3xl mb-4 uppercase tracking-tighter ${isCorrect ? 'text-green-700' : 'text-rose-700'}`}>
                                            {isCorrect ? 'TUYỆT VỜI! EM CHỌN ĐÚNG RỒI!' : `TIẾC QUÁ! EM ĐÃ CHỌN ĐÁP ÁN ${String.fromCharCode(65 + userChoice)}`}
                                        </h4>
                                        {!isCorrect && (
                                            <p className="text-2xl font-black text-slate-700 mb-4 italic">
                                                Đáp án chính xác phải là <span className="text-green-600 underline decoration-4 underline-offset-8">{String.fromCharCode(65 + q.correctAnswer)}: {q.options[q.correctAnswer]}</span>
                                            </p>
                                        )}
                                        <div className="bg-white/60 p-6 rounded-2xl border-2 border-current/10 shadow-inner">
                                            <p className="text-xl font-bold text-slate-600 leading-relaxed italic">
                                                Legend X5 gợi ý: <span className="text-brand-700">{q.explanation}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
