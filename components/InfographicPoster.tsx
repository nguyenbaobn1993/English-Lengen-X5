
import React, { useRef, useState, useEffect } from 'react';
import { LessonPlan } from '../types';
import { toPng } from 'html-to-image';
import { generateStoryImage } from '../services/geminiService';

interface InfographicPosterProps {
  lesson: LessonPlan;
}

export const InfographicPoster: React.FC<InfographicPosterProps> = ({ lesson }) => {
  const [cartoonSubject, setCartoonSubject] = useState(lesson.topic);
  const [cartoonImage, setCartoonImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadingPage, setDownloadingPage] = useState<number | null>(null);

  useEffect(() => {
    if (lesson.topic) {
      setCartoonSubject(lesson.topic);
      handleGenerateCartoon(lesson.topic);
    }
  }, [lesson.topic]);

  const handleGenerateCartoon = async (subject: string = cartoonSubject) => {
    setIsGenerating(true);
    try {
      const prompt = `adorable 3d chibi render of ${subject} concept, pixar style animation, cute big eyes, volumetric lighting, 8k resolution, vibrant colors, 3d blender render, high detail, clean background`;
      const imageUrl = await generateStoryImage(prompt, "3D Cartoon, Pixar Style", "1:1");
      setCartoonImage(imageUrl);
    } catch (e) {
      console.error("Failed to generate cartoon:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPosterPage = async (pageId: string, pageNum: number) => {
    const el = document.getElementById(pageId);
    if (!el) return;
    setDownloadingPage(pageNum);
    try {
      const dataUrl = await toPng(el, { 
        cacheBust: true, 
        backgroundColor: '#ffffff', 
        pixelRatio: 4,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });
      const link = document.createElement('a');
      link.download = `Summary-LegendX5-${lesson.topic}-P${pageNum}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) { 
      console.error(e); 
      alert("Lỗi xuất ảnh, hãy thử lại!");
    } finally {
      setDownloadingPage(null);
    }
  };

  // Chia từ vựng theo yêu cầu: Trang 1 tối đa 15 từ
  const MAX_P1_WORDS = 15;
  const vocabP1 = lesson.vocabulary.slice(0, MAX_P1_WORDS);
  const vocabP2 = lesson.vocabulary.slice(MAX_P1_WORDS);

  return (
    <div className="flex flex-col items-center gap-16 py-24 bg-brand-50 rounded-[4rem] border-4 border-brand-100 shadow-inner">
      <div className="text-center space-y-4 max-w-4xl px-6 w-full">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
            <div className="text-left flex-1">
              <h2 className="text-5xl font-black text-slate-800 uppercase tracking-tighter mb-2">Lesson Summary Maker</h2>
              <p className="text-slate-500 font-bold text-xl italic opacity-80">Tổng hợp nội dung bài học - Sắp xếp gọn gàng</p>
            </div>
            <div className="bg-white p-3 rounded-[2.5rem] shadow-2xl border-2 border-slate-100 flex gap-2 w-full md:w-auto">
              <input 
                type="text" 
                value={cartoonSubject}
                onChange={(e) => setCartoonSubject(e.target.value)}
                className="flex-1 md:w-80 p-5 rounded-2xl border-none focus:ring-0 font-bold text-slate-700 text-lg"
              />
              <button 
                onClick={() => handleGenerateCartoon()}
                disabled={isGenerating}
                className="bg-[#9333ea] text-white px-10 py-5 rounded-2xl font-black text-xl shadow-lg hover:bg-[#7e22ce] transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                {isGenerating ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : <>✨ Đổi Hình 3D</>}
              </button>
            </div>
          </div>
      </div>

      {/* Trang 1: Banner + Vocabulary Part 1 (Max 15 words) */}
      <div className="flex flex-col items-center gap-8 w-full">
          <div id="poster-p1" className="w-[850px] bg-white p-14 relative overflow-hidden animate-fade-in font-sans border-[15px] border-brand-50 shadow-2xl ring-4 ring-white aspect-[1/1.414] flex flex-col">
              <div className="absolute inset-0 bg-brand-50/10 pointer-events-none"></div>
              
              <div className="bg-brand-700 rounded-[2.5rem] p-10 relative overflow-hidden mb-12 flex items-center gap-10">
                  <div className="w-40 h-40 bg-white p-2 rounded-[2rem] shadow-2xl border-4 border-brand-100 flex items-center justify-center relative overflow-hidden shrink-0">
                    {cartoonImage ? <img src={cartoonImage} alt="Summary" crossOrigin="anonymous" className="w-full h-full object-cover rounded-[1.5rem]" /> : <div className="text-6xl">🎨</div>}
                  </div>
                  <div className="flex-1">
                    <div className="bg-highlight-400 text-brand-900 px-6 py-1 rounded-full text-sm font-black uppercase tracking-[0.4em] mb-4 w-fit shadow-md">TRANG 1: KIẾN THỨC ✨</div>
                    <h1 className="text-4xl font-black text-white leading-tight uppercase tracking-tighter line-clamp-2">{lesson.topic}</h1>
                    <p className="text-brand-100 text-lg font-bold opacity-80 mt-2">English Legend X5 - Connect The World</p>
                  </div>
              </div>

              <div className="flex-grow flex flex-col gap-8 overflow-hidden">
                  <h3 className="text-brand-800 font-black text-2xl uppercase tracking-widest border-b-4 border-brand-100 pb-3">📖 VOCABULARY LIST (P.1)</h3>
                  <div className="grid grid-cols-2 gap-4 px-2">
                      {vocabP1.map((item, idx) => (
                          <div key={idx} className="bg-brand-50/40 p-4 rounded-[1.5rem] flex items-center gap-4 border-2 border-brand-50 h-28 shadow-sm overflow-hidden">
                              <span className="text-4xl w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-md shrink-0 border-2 border-brand-100">{item.emoji}</span>
                              <div className="flex-1 leading-tight overflow-hidden">
                                  <p className="font-black text-brand-900 text-lg truncate">{item.word}</p>
                                  <p className="text-xs font-mono text-brand-400">/{item.ipa}/</p>
                                  <p className="text-sm font-black text-brand-600 italic truncate">{item.meaning}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              <div className="mt-8 w-full text-center text-xs font-black text-brand-200 uppercase tracking-[0.5em]">LEGEND X5 - CONNECT THE WORLD</div>
          </div>
          <button onClick={() => downloadPosterPage('poster-p1', 1)} disabled={downloadingPage === 1} className="bg-brand-600 text-white px-12 py-5 rounded-full font-black text-2xl shadow-xl hover:bg-brand-500 active:translate-y-1 transition-all uppercase tracking-tighter">
            {downloadingPage === 1 ? 'ĐANG XỬ LÝ...' : '📥 TẢI SUMMARY TRANG 1'}
          </button>
      </div>

      {/* Trang 2: Vocabulary Part 2 + Grammar + Samples + Tips */}
      <div className="flex flex-col items-center gap-8 w-full mt-12">
          <div id="poster-p2" className="w-[850px] bg-white p-14 relative overflow-hidden animate-fade-in font-sans border-[15px] border-brand-50 shadow-2xl ring-4 ring-white aspect-[1/1.414] flex flex-col">
              <div className="bg-brand-700 rounded-[2.5rem] p-10 relative overflow-hidden mb-12">
                  <div className="bg-highlight-400 text-brand-900 px-6 py-1 rounded-full text-sm font-black uppercase tracking-[0.4em] mb-4 w-fit shadow-md">TRANG 2: THỰC HÀNH & CHI TIẾT ✨</div>
                  <h1 className="text-4xl font-black text-white leading-tight uppercase tracking-tighter line-clamp-1">{lesson.topic}</h1>
              </div>

              <div className="flex-grow flex flex-col gap-6 overflow-hidden px-4">
                  {vocabP2.length > 0 && (
                    <div>
                        <h3 className="text-brand-800 font-black text-2xl uppercase tracking-widest border-b-4 border-brand-100 pb-2 mb-4">📖 VOCABULARY LIST (P.2)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {vocabP2.map((item, idx) => (
                                <div key={idx} className="bg-slate-50 p-4 rounded-[1.5rem] flex items-center gap-4 border-2 border-slate-100 h-24 shadow-sm">
                                    <span className="text-4xl w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-md shrink-0 border-2 border-slate-100">{item.emoji}</span>
                                    <div className="flex-1 leading-tight overflow-hidden">
                                        <p className="font-black text-slate-800 text-lg truncate">{item.word}</p>
                                        <p className="text-sm font-black text-brand-500 italic truncate">{item.meaning}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  <div className="space-y-4">
                      <h3 className="text-brand-800 font-black text-2xl uppercase tracking-widest border-b-4 border-brand-100 pb-2">💬 SAMPLE SENTENCES</h3>
                      <div className="grid grid-cols-1 gap-3">
                          {(lesson.grammar?.examples || []).slice(0, 4).map((ex, i) => (
                              <div key={i} className="bg-brand-50 p-3 rounded-[1.2rem] flex items-center gap-4 shadow-sm border-2 border-brand-50">
                                  <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow-lg">{i+1}</span>
                                  <p className="font-black text-slate-700 italic text-lg leading-snug flex-1 line-clamp-2">"{ex}"</p>
                              </div>
                          ))}
                      </div>
                  </div>

                  {lesson.grammar && (
                    <div className="p-6 bg-highlight-100 rounded-[2rem] border-[4px] border-white shadow-md relative overflow-hidden ring-2 ring-highlight-200">
                        <div className="absolute top-0 right-0 p-3 text-3xl opacity-10">💡</div>
                        <h3 className="text-highlight-700 font-black text-xl mb-1 uppercase tracking-tighter">NGỮ PHÁP QUAN TRỌNG</h3>
                        <p className="text-slate-800 font-black text-lg italic leading-relaxed line-clamp-4">{lesson.grammar.explanation}</p>
                    </div>
                  )}

                  {lesson.teacherTips && (
                    <div className="p-6 bg-brand-900 text-brand-50 rounded-[2rem] shadow-xl border-l-[15px] border-brand-500 mt-auto relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 text-5xl opacity-10">👩‍🏫</div>
                         <h4 className="font-black text-highlight-400 text-xs tracking-[0.3em] mb-1 uppercase">LEGEND X5 TIPS</h4>
                         <p className="text-base font-bold italic leading-relaxed opacity-90 line-clamp-3">{lesson.teacherTips}</p>
                    </div>
                  )}
              </div>
              <div className="mt-8 w-full text-center text-xs font-black text-brand-300 uppercase tracking-[0.5em]">LEGEND X5 - CONNECT THE WORLD</div>
          </div>
          <button onClick={() => downloadPosterPage('poster-p2', 2)} disabled={downloadingPage === 2} className="bg-indigo-600 text-white px-12 py-5 rounded-full font-black text-2xl shadow-xl hover:bg-indigo-500 active:translate-y-1 transition-all uppercase tracking-tighter">
            {downloadingPage === 2 ? 'ĐANG XỬ LÝ...' : '📥 TẢI SUMMARY TRANG 2'}
          </button>
      </div>
    </div>
  );
};
