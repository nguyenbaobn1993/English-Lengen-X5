
import React, { useState } from 'react';
import { correctWriting } from '../services/geminiService';

interface WritingSectionProps {
  topic: string;
}

export const WritingSection: React.FC<WritingSectionProps> = ({ topic }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCheck = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const data = await correctWriting(text, topic);
      setResult(data);
    } catch (e) {
      alert("Legend X5 đang bận một chút, em thử lại sau nhé!");
    } finally {
      setLoading(false);
    }
  };

  const renderFeedback = (val: any) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) {
      return Object.values(val).join(' ');
    }
    return "Tuyệt vời!";
  };

  return (
    <div className="bg-white rounded-[3rem] shadow-xl border-[8px] border-brand-50 overflow-hidden mb-8 animate-fade-in">
      <div className="bg-brand-600 p-6 md:p-10 text-white relative border-b-8 border-brand-800">
         <div className="absolute top-6 right-6 text-6xl opacity-20">✏️</div>
         <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-4">Writing Practice</h2>
         <div className="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-sm">
            <p className="text-highlight-300 font-black text-xs uppercase tracking-widest mb-1">ĐỀ BÀI CỦA EM:</p>
            <p className="text-xl md:text-2xl font-black text-white drop-shadow-sm leading-tight">{topic}</p>
         </div>
      </div>

      <div className="p-6 md:p-12">
        <div className="mb-8">
            <textarea 
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Em hãy gõ đoạn văn của mình vào đây nhé..."
                rows={6}
                className="w-full p-6 text-xl md:text-2xl rounded-[2rem] border-4 border-slate-50 focus:border-brand-400 outline-none transition-all font-black text-slate-800 shadow-inner bg-slate-50 resize-none font-display"
            />
            <button 
                onClick={handleCheck}
                disabled={loading || !text.trim()}
                className="mt-6 w-full py-5 bg-brand-500 text-white rounded-[2rem] font-black text-2xl shadow-xl hover:bg-brand-400 transform transition-all active:scale-95 disabled:opacity-50 border-b-8 border-brand-700 active:border-b-0 uppercase tracking-tighter"
            >
                {loading ? 'LEGEND X5 ĐANG CHẤM BÀI...' : '🚀 CHẤM ĐIỂM VÀ SỬA BÀI'}
            </button>
        </div>

        {result && (
          <div className="space-y-12 animate-fade-in">
            <div className="bg-brand-50 rounded-[3rem] p-8 md:p-12 border-4 border-brand-100 shadow-xl relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
                    <div className="flex flex-col items-center shrink-0">
                        <span className="text-brand-400 font-black text-sm uppercase tracking-[0.2em] mb-3">Điểm của em</span>
                        <div className="w-40 h-40 bg-white rounded-full flex items-center justify-center text-6xl font-black text-brand-600 border-[12px] border-brand-200 shadow-lg">
                            {typeof result.score === 'number' ? result.score : 0}/10
                        </div>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="text-2xl md:text-3xl font-black text-brand-800 mb-4 uppercase tracking-tight">Lời khen từ Legend X5 🌟</h3>
                        <p className="text-xl md:text-2xl font-black text-slate-700 italic leading-relaxed">
                            "{renderFeedback(result.feedback)}"
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[3rem] p-8 md:p-12 border-8 border-dashed border-brand-100 relative shadow-xl">
                <div className="absolute -top-6 left-10 bg-brand-500 text-white px-6 py-2 rounded-full font-black text-lg shadow-lg uppercase tracking-wider">
                   Bản sửa chi tiết
                </div>
                <div className="space-y-6">
                    <p className="text-2xl md:text-3xl font-black text-slate-800 leading-relaxed italic font-display">
                        "{typeof result.fixedText === 'string' ? result.fixedText : text}"
                    </p>
                    <div className="pt-6 border-t border-slate-100">
                        <h5 className="text-brand-600 font-black uppercase text-[10px] tracking-widest mb-3">Lỗi cần lưu ý:</h5>
                        <ul className="space-y-3">
                            {(result.errors || []).map((err: any, i: number) => (
                                <li key={i} className="flex items-start gap-3 text-lg">
                                    <span className="text-rose-500 shrink-0 mt-1">❌</span>
                                    <p className="text-slate-600 text-sm"><span className="line-through text-slate-400 mr-2">{err.original}</span> <span className="text-emerald-600 font-black mr-2">➔ {err.fixed}</span> <span className="text-slate-500 font-bold">({err.reason})</span></p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {result.suggestions && (
               <div className="bg-slate-900 rounded-[3rem] p-10 md:p-16 relative shadow-xl overflow-hidden group">
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-4 bg-highlight-400 text-slate-900 px-6 py-2.5 rounded-full font-black text-lg uppercase tracking-widest mb-8 shadow-lg border-b-4 border-highlight-600">
                      <span>🏆</span> LEGEND X5 UPGRADE
                    </div>
                    
                    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-inner">
                      <p className="text-2xl md:text-3xl font-black text-white leading-relaxed italic font-display tracking-tight text-center md:text-left">
                         "{result.suggestions}"
                      </p>
                    </div>
                  </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
