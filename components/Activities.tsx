
import React, { useState } from 'react';
import { MatchingPair, FillBlankQuestion, VocabularyItem } from '../types';
import { playGeminiTTS } from '../services/geminiService';

interface ActivitiesProps {
  matching: MatchingPair[];
  fillInBlank: FillBlankQuestion[];
  flashcards: VocabularyItem[];
}

export const Activities: React.FC<ActivitiesProps> = ({ matching, fillInBlank, flashcards }) => {
  const [activeTab, setActiveTab] = useState<'flashcards' | 'matching' | 'fill'>('flashcards');

  return (
    <div className="bg-white rounded-[2rem] shadow-xl border-4 border-white ring-1 ring-slate-200 overflow-hidden">
      <div className="flex bg-slate-50 p-2 gap-2 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('flashcards')}
          className={`flex-1 min-w-[120px] py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wide transition-all transform ${
            activeTab === 'flashcards' 
              ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg' 
              : 'bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
        >
          🎴 Flashcards
        </button>
        <button 
          onClick={() => setActiveTab('matching')}
          className={`flex-1 min-w-[120px] py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wide transition-all transform ${
            activeTab === 'matching' 
              ? 'bg-gradient-to-r from-emerald-400 to-green-500 text-white shadow-lg' 
              : 'bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
        >
          🧩 Matching
        </button>
        <button 
          onClick={() => setActiveTab('fill')}
          className={`flex-1 min-w-[120px] py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wide transition-all transform ${
            activeTab === 'fill' 
              ? 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white shadow-lg' 
              : 'bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
        >
          ✏️ Fill Blanks
        </button>
      </div>

      <div className="p-4 md:p-6 bg-slate-50/50 min-h-[400px] flex items-center justify-center relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <div className="w-full z-10">
           {activeTab === 'flashcards' && <FlashcardGame items={flashcards || []} />}
           {activeTab === 'matching' && <MatchingGame pairs={matching || []} />}
           {activeTab === 'fill' && <FillBlankGame questions={fillInBlank || []} />}
        </div>
      </div>
    </div>
  );
};

const FlashcardGame: React.FC<{ items: VocabularyItem[] }> = ({ items }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!items || items.length === 0) return <div className="text-center text-slate-400 font-bold">Không có từ vựng nào</div>;

  const next = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev + 1) % items.length), 150);
  };

  const prev = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length), 150);
  };

  const current = items[currentIndex];

  const handlePlayAudio = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    playGeminiTTS(text);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6">
      <div 
        onClick={() => setIsFlipped(!isFlipped)}
        className="cursor-pointer w-full aspect-[4/5] perspective-1000 group relative"
      >
        <div 
          className="relative w-full h-full transition-transform duration-500 transform-style-3d" 
          style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <div 
            className="absolute w-full h-full backface-hidden bg-white rounded-[2rem] shadow-xl flex flex-col items-center justify-center p-8 border-b-8 border-brand-500 ring-4 ring-white" 
            style={{ backfaceVisibility: 'hidden' }}
          >
             <div className="absolute top-4 left-4 bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
               CARD {currentIndex + 1}/{items.length}
             </div>
             
             <div className="flex-1 flex flex-col items-center justify-center w-full">
                <span className="text-4xl md:text-5xl font-black text-slate-800 mb-4 tracking-tighter text-center break-words w-full">{current.word}</span>
                {current.ipa && <span className="text-base text-brand-600 font-mono bg-brand-50 px-3 py-1 rounded-lg border border-brand-100 shadow-sm">/{current.ipa}/</span>}
                <button 
                  onClick={(e) => handlePlayAudio(current.word, e)}
                  className="mt-8 p-4 rounded-full bg-brand-400 text-white hover:bg-brand-500 transition-all transform hover:scale-110 shadow-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                </button>
             </div>
          </div>

          <div 
            className="absolute w-full h-full backface-hidden bg-gradient-to-br from-brand-400 to-brand-600 rounded-[2rem] shadow-xl overflow-hidden flex flex-col ring-4 ring-brand-200" 
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="h-[50%] w-full bg-white p-4 relative flex items-center justify-center">
              <span className="text-7xl select-none transform transition-transform group-hover:scale-110 duration-500">{current.emoji || '✨'}</span>
            </div>
            <div className="h-[50%] p-6 flex flex-col items-center justify-center text-white text-center">
               <h3 className="text-2xl font-black mb-2 text-highlight-300 drop-shadow-md uppercase tracking-tight">{current.meaning}</h3>
               {current.example && (
                 <div className="relative w-full">
                    <p className="text-sm font-bold opacity-90 leading-relaxed px-4 italic border-l-2 border-highlight-300/60 pl-2 line-clamp-3">
                      "{current.example}"
                    </p>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <button onClick={prev} className="p-3 rounded-full bg-white shadow-md border-b-4 border-slate-200 hover:border-brand-400 hover:text-brand-500 transition-all active:translate-y-1 active:border-b-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button onClick={next} className="p-3 rounded-full bg-white shadow-md border-b-4 border-slate-200 hover:border-brand-400 hover:text-brand-500 transition-all active:translate-y-1 active:border-b-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6 6-6"/></svg>
        </button>
      </div>
    </div>
  );
};

const MatchingGame: React.FC<{ pairs: MatchingPair[] }> = ({ pairs }) => {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());

  if (!pairs || pairs.length === 0) return <div className="text-center text-slate-400 font-bold">Không có dữ liệu</div>;

  const handleLeftClick = (id: string) => {
    if (matchedIds.has(id)) return;
    setSelectedLeft(id);
  };

  const handleRightClick = (id: string) => {
    if (matchedIds.has(id)) return;
    if (selectedLeft === id) {
      const newMatched = new Set(matchedIds);
      newMatched.add(id);
      setMatchedIds(newMatched);
      setSelectedLeft(null);
    } else {
      setSelectedLeft(null); 
    }
  };

  if (matchedIds.size === pairs.length && pairs.length > 0) {
     return (
       <div className="flex flex-col items-center justify-center h-full py-6 animate-fade-in text-center">
         <div className="text-6xl mb-6 animate-bounce">🏆</div>
         <h3 className="text-3xl font-black text-emerald-600 mb-2">QUÁ XUẤT SẮC!</h3>
         <button onClick={() => setMatchedIds(new Set())} className="mt-6 px-8 py-3 bg-brand-500 text-white font-black text-lg rounded-2xl hover:bg-brand-600 shadow-lg border-b-4 border-brand-700 active:translate-y-1 active:border-b-0 transition-all">CHƠI LẠI NHÉ</button>
       </div>
     )
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-full w-full max-w-2xl mx-auto">
      <div className="space-y-3">
        {pairs.map(p => (
          <button
            key={`l-${p.id}`}
            disabled={matchedIds.has(p.id)}
            onClick={() => handleLeftClick(p.id)}
            className={`w-full p-4 rounded-xl border-b-[6px] text-left transition-all font-black text-lg shadow-md flex items-center justify-between
              ${matchedIds.has(p.id) ? 'opacity-30 bg-slate-100 border-transparent grayscale scale-95' : 
                selectedLeft === p.id ? 'bg-brand-50 border-brand-500 text-brand-700 -translate-y-1' : 'bg-white border-slate-200 text-slate-700 hover:bg-brand-50'
              }
            `}
          >
            <span className="truncate">{p.left}</span>
            {matchedIds.has(p.id) && <span className="text-green-500">✅</span>}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {pairs.map(p => (
          <button
            key={`r-${p.id}`}
            disabled={matchedIds.has(p.id)}
            onClick={() => handleRightClick(p.id)}
            className={`w-full p-4 rounded-xl border-b-[6px] text-left transition-all font-bold text-sm shadow-md flex items-center justify-between
              ${matchedIds.has(p.id) ? 'opacity-30 bg-emerald-50 border-transparent grayscale scale-95' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
            `}
          >
             <span className="truncate">{p.right}</span>
             {matchedIds.has(p.id) && <span className="text-emerald-500">✅</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

const FillBlankGame: React.FC<{ questions: FillBlankQuestion[] }> = ({ questions }) => {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (!questions || questions.length === 0) return <div className="text-center text-slate-400 font-bold">Không có dữ liệu câu hỏi</div>;

  const handleOption = (opt: string) => {
    if (feedback !== null) return;
    
    setSelectedOption(opt);
    const isCorrect = opt === questions[index].answer;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    
    const audioMsg = isCorrect ? "Excellent! Correct." : "Don't give up! Look at the answer.";
    playGeminiTTS(audioMsg);
  };

  const nextQuestion = () => {
    setFeedback(null);
    setSelectedOption(null);
    if (index < questions.length - 1) {
      setIndex(index + 1);
    } else {
      setIndex(0);
    }
  };

  const q = questions[index];

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full">
      <div className="w-full h-2.5 bg-slate-200 rounded-full mb-8 overflow-hidden border border-white">
        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${((index + (feedback ? 1 : 0)) / questions.length) * 100}%` }}></div>
      </div>
      
      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-b-[10px] border-slate-100 w-full text-center mb-8 relative min-h-[180px] flex flex-col justify-center ring-4 ring-brand-50/50">
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-brand-600 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md">
            THỬ THÁCH {index + 1}
        </div>
        <h3 className="text-xl md:text-2xl font-black text-slate-700 leading-tight font-display">
            {(q?.sentence || '').split('___').map((part, i, arr) => (
            <React.Fragment key={i}>
                {part}
                {i < arr.length - 1 && (
                <span className={`inline-flex min-w-[100px] border-b-4 mx-2 px-2 py-0.5 rounded-lg items-center justify-center transition-all duration-500 ${feedback === 'correct' ? 'border-green-500 text-green-700 bg-green-50' : feedback === 'wrong' ? 'border-red-500 text-red-700 bg-red-50' : 'border-brand-200 bg-brand-50/30 text-transparent'}`}>
                    {feedback ? q.answer : '?'}
                </span>
                )}
            </React.Fragment>
            ))}
        </h3>
      </div>

      {feedback && (
        <div className={`w-full mb-8 p-4 rounded-2xl border-l-[10px] shadow-lg animate-bounce-in ${feedback === 'correct' ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800'}`}>
          <div className="flex items-start gap-4">
             <span className="text-4xl">{feedback === 'correct' ? '🌟' : '💡'}</span>
             <div className="flex-1">
                <h4 className="font-black text-lg mb-1 uppercase tracking-tighter">
                   {feedback === 'correct' ? 'Tuyệt quá!' : 'Đáp án là: ' + q.answer}
                </h4>
                <p className="font-bold text-xs opacity-85 leading-relaxed italic border-t border-current/10 pt-1.5">
                   "{q.explanation || 'Hãy ghi nhớ cấu trúc này nhé!'}"
                </p>
             </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {(q?.options || []).map((opt, i) => (
          <button
            key={i}
            onClick={() => handleOption(opt)}
            disabled={feedback !== null}
            className={`p-4 rounded-xl border-b-[6px] text-lg font-black transition-all transform shadow-md
              ${feedback === null ? 'bg-white border-slate-200 text-slate-700 hover:bg-brand-50 hover:-translate-y-1' : 
                opt === q.answer ? 'bg-green-500 border-green-700 text-white scale-105' : 
                opt === selectedOption ? 'bg-red-500 border-red-700 text-white opacity-50' : 'bg-slate-50 border-slate-200 text-slate-300 grayscale opacity-30'}
            `}
          >
            {opt}
          </button>
        ))}
      </div>

      {feedback && (
        <button 
           onClick={nextQuestion}
           className="mt-8 w-full py-4 bg-brand-600 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-brand-500 transform active:translate-y-1 transition-all border-b-8 border-brand-800 active:border-b-0 uppercase"
        >
           {index < questions.length - 1 ? 'CÂU TIẾP THEO ➔' : 'HOÀN THÀNH 🎉'}
        </button>
      )}
    </div>
  );
};
