import React, { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
// Fix: changed generateCreativeMindMap to generateMindMap to match service exports
import { generateMindMap, fileToBase64 } from '../services/geminiService';
import { MindMapData, MindMapMode } from '../types';

export const CreativeMindMap: React.FC = () => {
  const [mode, setMode] = useState<MindMapMode>(MindMapMode.TOPIC);
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<MindMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MindMapData[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleGenerate = async () => {
    if (mode === MindMapMode.TOPIC && !inputText) return;
    if (mode === MindMapMode.TEXT && !inputText) return;
    if (mode === MindMapMode.IMAGE && selectedFiles.length === 0) return;

    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      let content: string | { data: string, mimeType: string }[] = inputText;
      
      if (mode === MindMapMode.IMAGE) {
        const processedImages = await Promise.all(selectedFiles.map(async (file) => {
             const base64 = await fileToBase64(file);
             return { data: base64, mimeType: file.type || 'image/jpeg' };
        }));
        content = processedImages;
      }

      // Fix: Use generateMindMap instead of the non-existent generateCreativeMindMap
      const result = await generateMindMap(content, mode);
      setData(result);
      setHistory(prev => [result, ...prev]);
    } catch (e) {
      console.error(e);
      setError("Đã có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveImage = async () => {
    if (canvasRef.current === null) return;
    try {
      const dataUrl = await toPng(canvasRef.current, { cacheBust: true, backgroundColor: 'white' });
      const link = document.createElement('a');
      link.download = `legend-x5-mindmap-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Không thể lưu ảnh. Vui lòng thử lại.");
    }
  };

  return (
    <div className="w-full bg-white min-h-screen animate-fade-in font-sans pb-20">
      <div className="bg-gradient-to-r from-brand-600 to-brand-800 text-white p-8 rounded-b-[3rem] shadow-xl mb-8 relative overflow-hidden">
         <div className="absolute top-0 right-0 opacity-10 transform translate-x-10 -translate-y-10">
             <svg width="200" height="200" viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="40" /></svg>
         </div>
         <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
               <h2 className="text-4xl font-black uppercase tracking-tight mb-2">ENGLISH LEGEND X5</h2>
               <p className="text-brand-100 font-bold opacity-90">LEGEND X5 - CONNECT THE WORLD</p>
               <div className="mt-4 text-xs font-black tracking-[0.2em] opacity-60 uppercase">Creative Learning System</div>
            </div>
            <img src="/brand/logo.jpg" alt="Legend X5" className="w-20 h-20 rounded-2xl border-2 border-highlight-400 shadow-lg" />
         </div>
      </div>

      <div className="max-w-6xl mx-auto px-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border-4 border-slate-50 p-8 mb-12">
              <div className="flex bg-slate-100 p-2 rounded-2xl mb-8 gap-2">
                {[
                  { id: MindMapMode.TOPIC, label: 'Từ Chủ Đề', icon: '💡' },
                  { id: MindMapMode.TEXT, label: 'Từ Văn Bản', icon: '📝' },
                  { id: MindMapMode.IMAGE, label: 'Từ Hình Ảnh', icon: '📸' },
                ].map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)} className={`flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${mode === m.id ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}>
                    <span>{m.icon}</span> {m.label}
                  </button>
                ))}
              </div>

              <div className="space-y-6">
                {mode !== MindMapMode.IMAGE ? (
                  <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder={mode === MindMapMode.TOPIC ? "Nhập chủ đề (VD: Animals, My Family...)" : "Dán văn bản bài học vào đây..."} className="w-full p-6 text-xl rounded-2xl border-2 border-slate-200 focus:border-brand-400 outline-none font-bold text-slate-700 h-32" />
                ) : (
                  <div className="border-4 border-dashed border-brand-100 p-10 rounded-2xl text-center bg-brand-50/20 relative cursor-pointer">
                    <input type="file" multiple accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0" />
                    <div className="text-brand-400 text-5xl mb-4">🖼️</div>
                    <p className="text-slate-500 font-bold">{selectedFiles.length > 0 ? `Đã chọn ${selectedFiles.length} ảnh` : 'Bấm để tải ảnh sách hoặc bài tập lên'}</p>
                  </div>
                )}
                <button onClick={handleGenerate} disabled={isLoading} className="w-full py-5 bg-brand-600 border-b-8 border-brand-800 text-white rounded-2xl font-black text-2xl shadow-xl hover:bg-brand-500 transform active:scale-[0.98] active:translate-y-1 active:border-b-0 transition-all uppercase">
                  {isLoading ? 'Đang vẽ phép thuật...' : '🪄 Tạo Sơ Đồ Tư Duy'}
                </button>
              </div>
          </div>

          {data && (
            <div className="animate-fade-in flex flex-col items-center">
               <div ref={canvasRef} className="bg-white p-10 rounded-[3rem] shadow-2xl border-[15px] border-slate-50 relative overflow-hidden w-full max-w-[1000px] aspect-[4/3] flex flex-col items-center justify-center">
                  <div className="absolute top-10 right-10 text-brand-600 font-black text-sm uppercase opacity-30">ENGLISH LEGEND X5</div>
                  <div className="text-center bg-brand-50 p-8 rounded-full border-4 border-brand-200 shadow-xl mb-12">
                     <span className="text-8xl mb-2 block">{data.center?.emoji || '🌟'}</span>
                     <h2 className="text-4xl font-black text-slate-800 uppercase leading-none">{data.center?.title_en}</h2>
                     <p className="text-xl font-bold text-brand-600">{data.center?.title_vi}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full">
                     {data.nodes.map((n, i) => (
                        <div key={i} className="bg-white p-4 rounded-3xl border-2 shadow-lg flex flex-col items-center text-center transform rotate-[1deg] hover:rotate-0 transition-transform" style={{ borderColor: n.color || '#22c55e' }}>
                           <span className="text-5xl mb-3">{n.emoji}</span>
                           <span className="font-black text-slate-800 text-xl leading-none">{n.text_en}</span>
                           <span className="text-xs text-slate-400 font-bold uppercase mt-2 tracking-widest">{n.text_vi}</span>
                        </div>
                     ))}
                  </div>
               </div>
               <button onClick={handleSaveImage} className="mt-12 bg-indigo-600 text-white px-12 py-5 rounded-3xl font-black text-xl shadow-xl hover:bg-indigo-700 flex items-center gap-3">
                  💾 Lưu Poster Về Máy
               </button>
            </div>
          )}
      </div>
    </div>
  );
};
