
import React, { useState, useRef, useEffect } from 'react';
import { PresentationScript, SpeechEvaluation } from '../types';
import { evaluateSpeech, playGeminiTTS } from '../services/geminiService';
import { toPng } from 'html-to-image';

interface PresentationScriptProps { script: PresentationScript; studentName?: string; }

export const PresentationScriptView: React.FC<PresentationScriptProps> = ({ script, studentName }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [evaluation, setEvaluation] = useState<SpeechEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const certRef = useRef<HTMLDivElement>(null);

  // Combine intro, body, and conclusion for a full presentation experience
  const fullEnglishText = `${script.introduction.english} ${script.body.map(b => b.script).join(' ')} ${script.conclusion.english}`;

  useEffect(() => {
    const now = new Date();
    const formatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setCurrentTime(formatted);
  }, [showCertificate]);

  const handlePlayModel = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      // playGeminiTTS returns a promise that resolves when audio finishes
      await playGeminiTTS(fullEnglishText);
    } catch (e) {
      console.error("Presentation Playback Error:", e);
    } finally {
      setIsPlaying(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        handleSpeechEvaluation(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true); 
      setEvaluation(null);
    } catch (err) { 
      alert("Em hãy bật Micro nhé! Legend X5 không nghe thấy em nói."); 
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); 
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const handleSpeechEvaluation = async (blob: Blob) => {
    setIsEvaluating(true);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      try {
        const result = await evaluateSpeech(base64Audio);
        setEvaluation(result);
      } catch (e) { 
        alert("Lỗi chấm điểm bài nói, em hãy thử lại nhé!"); 
      } finally { 
        setIsEvaluating(false); 
      }
    };
  };

  const downloadCert = async () => {
    if (!certRef.current) return;
    try {
      const dataUrl = await toPng(certRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `Speaking-Cert-LegendX5-${studentName || 'Student'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      alert("Lỗi tải chứng nhận bài nói!");
    }
  };

  return (
    <div className="mt-16 space-y-16 animate-fade-in max-w-5xl mx-auto w-full">
      {/* Script Section */}
      <div className="bg-white rounded-[4rem] shadow-2xl border-[15px] border-emerald-50 p-10 md:p-16 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-3 bg-emerald-400"></div>
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 border-b-4 border-emerald-100 pb-8 gap-6">
          <div className="text-left">
            <h3 className="text-4xl font-black text-emerald-800 uppercase tracking-tighter mb-1">KỊCH BẢN THUYẾT TRÌNH</h3>
            <p className="text-emerald-500 font-bold italic">Luyện tập cùng Legend X5 AI nhé!</p>
          </div>
          <button 
            onClick={handlePlayModel} 
            disabled={isPlaying} 
            className={`px-12 py-5 rounded-full font-black text-2xl flex items-center gap-4 shadow-2xl transition-all transform active:scale-95 border-b-[10px] ${isPlaying ? 'bg-red-500 text-white border-red-700' : 'bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-700'}`}
          >
            <span className={`text-3xl ${isPlaying ? 'animate-pulse' : ''}`}>{isPlaying ? '⏹' : '🔊'}</span> 
            {isPlaying ? 'ĐANG PHÁT...' : 'NGHE MẪU'}
          </button>
        </div>

        <div className="space-y-10">
           {/* Introduction */}
           <div className="bg-emerald-50/30 p-8 rounded-[2.5rem] border-2 border-emerald-100 relative">
              <span className="absolute -top-4 left-8 bg-emerald-500 text-white px-6 py-1 rounded-full text-xs font-black uppercase tracking-widest">GIỚI THIỆU</span>
              <p className="text-2xl font-black text-slate-800 mb-4 leading-relaxed italic">"{script.introduction.english}"</p>
              <p className="text-lg font-bold text-emerald-600 opacity-80 border-t border-emerald-100 pt-4">({script.introduction.vietnamese})</p>
           </div>

           {/* Body Nodes */}
           <div className="grid gap-6">
              {script.body.map((node, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 hover:border-emerald-200 transition-colors shadow-sm relative group">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-black">{i+1}</span>
                    <h4 className="text-2xl font-black text-brand-900 uppercase">{node.keyword}</h4>
                  </div>
                  <p className="text-xl font-bold text-slate-700 leading-relaxed italic">"{node.script}"</p>
                </div>
              ))}
           </div>

           {/* Conclusion */}
           <div className="bg-emerald-50/30 p-8 rounded-[2.5rem] border-2 border-emerald-100 relative">
              <span className="absolute -top-4 left-8 bg-indigo-500 text-white px-6 py-1 rounded-full text-xs font-black uppercase tracking-widest">KẾT THÚC</span>
              <p className="text-2xl font-black text-slate-800 mb-4 leading-relaxed italic">"{script.conclusion.english}"</p>
              <p className="text-lg font-bold text-indigo-600 opacity-80 border-t border-indigo-100 pt-4">({script.conclusion.vietnamese})</p>
           </div>
        </div>
      </div>

      {/* Recording Section */}
      <div className="bg-slate-900 rounded-[5rem] p-16 flex flex-col items-center gap-12 border-[15px] border-emerald-50 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-emerald-400/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-center z-10 space-y-4">
          <h4 className="text-6xl font-black text-white uppercase tracking-tighter">🏆 THỬ THÁCH THUYẾT TRÌNH</h4>
          <p className="text-emerald-400 font-black text-2xl italic">"Bé hãy nhấn Micro và bắt đầu thuyết trình nhé!"</p>
        </div>
        
        <div className="relative z-20">
           {isRecording && (
             <div className="absolute inset-0 rounded-full animate-ping bg-red-500/30 scale-150"></div>
           )}
           <button 
             onClick={isRecording ? stopRecording : startRecording} 
             className={`w-48 h-48 rounded-full flex items-center justify-center shadow-2xl transition-all transform active:scale-90 border-[12px] border-white/20 relative ${isRecording ? 'bg-red-600 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
           >
             <span className="text-8xl">{isRecording ? '⏹' : '🎤'}</span>
           </button>
        </div>

        {isEvaluating && (
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="flex gap-2">
              {[1, 2, 3].map(i => <div key={i} className="w-4 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }}></div>)}
            </div>
            <p className="text-emerald-300 font-black text-3xl uppercase tracking-widest">Legend X5 đang chấm điểm...</p>
          </div>
        )}

        {evaluation && (
          <div className="w-full space-y-12 animate-scale-in pt-10 text-center z-10">
            <div className="flex flex-col items-center">
               <p className="text-slate-400 font-black text-xl uppercase tracking-[0.3em] mb-4">ĐIỂM SPEAKING CỦA EM</p>
               <div className="text-[15rem] font-black text-emerald-400 leading-none drop-shadow-[0_20px_50px_rgba(52,211,153,0.5)]">{evaluation.overallScore.toFixed(1)}</div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md p-10 rounded-[3rem] border-2 border-white/10 max-w-3xl mx-auto shadow-inner">
               <p className="text-3xl font-black text-white italic leading-relaxed">"{evaluation.feedback}"</p>
            </div>

            <button 
              onClick={() => setShowCertificate(true)} 
              className="bg-highlight-400 text-slate-900 px-16 py-8 rounded-[3rem] font-black text-3xl shadow-[0_20px_60px_rgba(250,204,21,0.4)] hover:bg-highlight-300 transform hover:scale-105 active:scale-95 transition-all border-b-[12px] border-highlight-600 uppercase tracking-tighter"
            >
              📜 XUẤT GIẤY KHEN SPEAKING
            </button>
          </div>
        )}
      </div>

      {/* Certificate Modal */}
      {showCertificate && evaluation && (
        <div className="fixed inset-0 z-[100] bg-black/98 flex flex-col items-center justify-center p-8 overflow-y-auto animate-fade-in">
           <button 
             onClick={() => setShowCertificate(false)} 
             className="absolute top-10 right-10 text-white bg-red-600/20 hover:bg-red-600 p-6 rounded-full font-black z-[110] transition-all"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </button>

           <div ref={certRef} className="w-[1200px] h-[850px] bg-white border-[50px] border-emerald-50 p-24 flex flex-col items-center relative shadow-2xl shrink-0">
              <div className="absolute inset-8 border-4 border-emerald-100 pointer-events-none opacity-40"></div>
              
              <div className="flex flex-col items-center mb-10">
                <div className="w-28 h-28 bg-emerald-600 rounded-3xl flex items-center justify-center text-white text-6xl mb-6 shadow-2xl transform rotate-3">
                  🗣️
                </div>
                <h2 className="text-2xl font-black text-emerald-800 uppercase tracking-[0.4em] font-sans mb-2">ENGLISH LEGEND X5</h2>
                <h1 className="text-7xl font-black text-brand-600 uppercase font-display tracking-tight border-b-8 border-brand-100 pb-2">EXCELLENT SPEAKING AWARD</h1>
              </div>

              <p className="text-2xl font-bold text-slate-400 mb-10 uppercase tracking-[0.3em]">CHỨNG NHẬN KHOÁ LUYỆN THUYẾT TRÌNH</p>
              <h3 className="text-9xl font-black text-slate-900 border-b-8 border-emerald-500 px-20 pb-4 mb-12 font-display">{studentName || "NGÔI SAO NHÍ"}</h3>
              
              <div className="grid grid-cols-2 gap-16 w-full max-w-5xl mb-12 bg-emerald-50/40 p-12 rounded-[4rem] border-4 border-white shadow-inner">
                 <div className="flex flex-col items-center border-r-4 border-white pr-10">
                    <p className="text-sm font-black text-slate-400 uppercase mb-6 tracking-widest">ĐIỂM PHÁT ÂM (IPA)</p>
                    <p className="text-[12rem] font-black text-emerald-600 leading-none drop-shadow-2xl">{evaluation.overallScore.toFixed(1)}</p>
                 </div>
                 <div className="flex flex-col justify-center pl-10 text-left space-y-6">
                    <p className="text-2xl font-bold text-slate-700 italic leading-relaxed">"{evaluation.feedback}"</p>
                    <div className="bg-white p-6 rounded-3xl border-2 border-emerald-100 shadow-sm">
                      <p className="text-xs font-black text-emerald-500 uppercase mb-2">Thời gian tập luyện:</p>
                      <p className="text-3xl font-black text-slate-800">{currentTime}</p>
                    </div>
                 </div>
              </div>

              <div className="w-full flex justify-between items-end mt-auto px-10">
                 <div className="text-left">
                    <p className="text-[10px] font-black text-slate-200 uppercase tracking-widest">ID: SPEAK-MD-{Date.now()}</p>
                    <p className="text-2xl font-black text-emerald-700 uppercase tracking-[0.2em] mt-2">Speak with Confidence</p>
                 </div>
                 <div className="text-right">
                    <div className="text-center">
                        <div className="w-40 h-1.5 bg-emerald-800 mb-4 ml-auto rounded-full"></div>
                        <p className="text-4xl font-black text-emerald-900 italic font-serif">Legend X5</p>
                        <p className="text-sm font-black text-emerald-500 uppercase tracking-widest">Head Teacher</p>
                    </div>
                    <p className="text-sm font-black text-slate-400 mt-8 italic">Phát hành vào {currentTime}</p>
                 </div>
              </div>
           </div>

           <button 
             onClick={downloadCert} 
             className="mt-16 bg-emerald-500 text-white px-20 py-8 rounded-[3rem] font-black text-4xl shadow-[0_30px_60px_rgba(16,185,129,0.5)] hover:bg-emerald-400 transform hover:scale-110 active:scale-95 transition-all uppercase tracking-tighter flex items-center gap-6"
           >
             <span>💾</span> TẢI GIẤY KHEN VỀ MÁY
           </button>
        </div>
      )}
    </div>
  );
};
