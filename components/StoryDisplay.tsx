
import React, { useState, useEffect, useRef } from 'react';
import { ContentResult } from '../types';
import { AICallModal } from './AICallModal';
import { WritingSection } from './WritingSection';
import { playGeminiTTS } from '../services/geminiService';

interface StoryDisplayProps {
  contentResult: ContentResult;
  generatedImage: string;
  originalImages: string[];
  audioUrl: string | null;
  onReset: () => void;
}

export const StoryDisplay: React.FC<StoryDisplayProps> = ({ 
  contentResult, 
  generatedImage, 
  originalImages, 
  audioUrl, 
  onReset 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [submittedQuiz, setSubmittedQuiz] = useState<Record<string, number>>({});
  
  const storyText = contentResult?.storyEnglish || "";
  const words = storyText ? storyText.split(/\s+/).filter(w => w.length > 0) : [];
  
  const handlePlayAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      await playGeminiTTS(storyText);
    } catch (e) {
      console.error(e);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleQuizSelect = (qId: string, idx: number) => {
    if (submittedQuiz[qId] !== undefined) return;
    setSubmittedQuiz(prev => ({ ...prev, [qId]: idx }));
  };

  return (
    <div className="space-y-12 pb-16">
      <AICallModal 
        isOpen={isCallModalOpen} 
        onClose={() => setIsCallModalOpen(false)} 
        storyContext={storyText} 
        speakingQuestions={contentResult.speakingQuestions}
      />

      <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border-[10px] border-brand-50 animate-fade-in">
         <div className="grid md:grid-cols-2 min-h-[500px]">
            <div className="bg-slate-900 relative flex items-center justify-center group overflow-hidden min-h-[400px]">
               <img src={generatedImage} alt="Magic Story Scene" className="w-full h-full object-cover absolute inset-0 opacity-90 transition-all duration-1000 transform group-hover:scale-110" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30"></div>
               <div className="absolute bottom-8 left-8 right-8 flex flex-col gap-3">
                  <button onClick={handlePlayAudio} disabled={isPlaying} className={`w-full py-4 rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 shadow-xl transition-all transform active:scale-95 border-b-[6px] ${isPlaying ? 'bg-red-500 text-white border-red-700' : 'bg-brand-500 text-white hover:bg-brand-400 border-brand-700'}`}>
                     {isPlaying ? <span className="animate-pulse">ĐANG PHÁT...</span> : <><span className="text-2xl">🔊</span> NGHE TRUYỆN</>}
                  </button>
                  <button onClick={() => setIsCallModalOpen(true)} className="w-full py-4 rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 shadow-xl bg-purple-500 text-white hover:bg-purple-600 transition-all transform active:scale-95 border-b-[6px] border-purple-700">
                      <span className="text-2xl">🎙️</span> GỌI CÔ GIÁO AI
                  </button>
               </div>
            </div>

            <div className="p-8 md:p-14 flex flex-col justify-center bg-white relative">
               <div className="flex justify-between items-center mb-6 border-b-2 border-slate-100 pb-4">
                  <h2 className="text-3xl font-black text-brand-800 uppercase tracking-tighter">Magic Story ✨</h2>
                  <button onClick={() => setShowTranslation(!showTranslation)} className="text-xs font-black px-4 py-1.5 rounded-full border-2 border-brand-100 text-brand-600 hover:bg-brand-50 transition-colors uppercase tracking-widest">
                      {showTranslation ? 'Ẩn bản dịch' : 'Xem bản dịch'}
                  </button>
               </div>
               <div className="prose prose-lg max-w-none leading-relaxed font-bold text-slate-700 mb-8 italic">
                  <p className="text-lg md:text-xl">
                      {words.map((word, index) => (
                          <span key={index} className={`inline-block transition-all duration-300 rounded-lg px-0.5 mx-0.5 ${index === activeWordIndex ? 'bg-brand-500 text-white scale-105' : ''}`}>
                              {word}
                          </span>
                      ))}
                  </p>
               </div>
               {showTranslation && (
                  <div className="animate-bounce-in bg-brand-50 p-6 rounded-2xl border-2 border-brand-100 shadow-inner mb-6">
                      <p className="text-brand-900 text-base font-bold leading-relaxed italic">"{contentResult?.translatedText || "Không có bản dịch"}"</p>
                  </div>
               )}
            </div>
         </div>
      </div>

      <section className="bg-white rounded-[3rem] shadow-xl border-[8px] border-brand-50 p-8 md:p-14">
          <h2 className="text-2xl md:text-3xl font-black text-brand-800 uppercase tracking-tighter mb-8 flex items-center gap-3">
              <span className="text-3xl">📖</span> 10 Reading Challenges
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(contentResult.comprehensionQuestions || []).map((q, idx) => {
                  const userChoice = submittedQuiz[q.id];
                  const isSubmitted = userChoice !== undefined;
                  return (
                      <div key={q.id} className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm">
                          <p className="font-black text-lg text-slate-800 mb-4 flex gap-3 leading-tight">
                              <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-lg h-fit text-sm">Q{idx + 1}</span>
                              {q.question}
                          </p>
                          <div className="space-y-2">
                              {(q.options || []).map((opt, i) => (
                                  <button key={i} onClick={() => handleQuizSelect(q.id, i)} disabled={isSubmitted} className={`w-full text-left p-3 rounded-xl border-2 font-black text-sm transition-all ${isSubmitted ? i === q.correctAnswer ? 'bg-green-100 border-green-500 text-green-700' : userChoice === i ? 'bg-rose-100 border-rose-500 text-rose-700' : 'bg-white opacity-50' : 'bg-white border-slate-200 hover:border-brand-400 hover:bg-brand-50'}`}>
                                      {opt}
                                  </button>
                              ))}
                          </div>
                      </div>
                  );
              })}
          </div>
      </section>

      <section className="bg-brand-900 rounded-[3rem] shadow-xl border-[8px] border-brand-800 p-8 md:p-14 text-white">
          <h2 className="text-2xl md:text-3xl font-black text-highlight-400 uppercase tracking-tighter mb-8 flex items-center gap-3">
              <span className="text-3xl">🎙️</span> 10 Speaking Interaction
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(contentResult.speakingQuestions || []).map((sq, idx) => (
                  <div key={sq.id} className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 group hover:bg-white/10 transition-all">
                      <div className="flex items-start gap-3">
                          <span className="text-highlight-400 font-black text-lg">0{idx + 1}.</span>
                          <div>
                              <p className="text-lg font-black text-white mb-2 group-hover:text-highlight-300 transition-colors leading-tight">{sq.question}</p>
                              <p className="text-brand-200 font-bold italic text-sm">"{sq.suggestedAnswer}"</p>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      </section>

      <section className="animate-fade-in">
        <div className="bg-highlight-400 p-8 md:p-12 rounded-[3rem] shadow-xl border-[10px] border-white ring-4 ring-highlight-300">
           <h3 className="text-brand-900 font-black text-lg uppercase tracking-widest mb-3">🏆 THỬ THÁCH VIẾT (WRITING CHALLENGE)</h3>
           <WritingSection topic={`${contentResult.writingPromptEn} (${contentResult.writingPromptVi})`} />
        </div>
      </section>

      <div className="flex justify-center pt-8">
          <button onClick={onReset} className="bg-white border-b-8 border-slate-200 hover:border-brand-500 hover:text-brand-600 text-slate-500 px-10 py-5 rounded-[2.5rem] font-black text-xl transition-all shadow-lg hover:bg-brand-50 active:translate-y-1 active:border-b-0 uppercase tracking-tighter">
             🔄 TẠO CUỘC PHIÊU LƯU MỚI
          </button>
      </div>
    </div>
  );
};
