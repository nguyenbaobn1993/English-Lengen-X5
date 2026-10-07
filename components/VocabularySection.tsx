import React, { useState, useEffect, useRef } from 'react';
import { VocabularyItem } from '../types';
import { playGeminiTTS, stopTTS, pauseTTS, resumeTTS, generateAudioFromContent, createBritishSpeechUtterance } from '../services/geminiService';

interface VocabularySectionProps {
  items: VocabularyItem[];
  topicTitle?: string;
}

export const VocabularySection: React.FC<VocabularySectionProps> = ({ items = [], topicTitle = '' }) => {
  const [showMeaning, setShowMeaning] = useState(true);

  // Audio continuous playback states
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(-1);
  const [currentRepeat, setCurrentRepeat] = useState<number>(1); // 1 or 2

  // Download states
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string>('');

  // Refs for tracking playback loop
  const stopRequestedRef = useRef(false);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    return () => {
      // Clean up audio on unmount
      stopTTS();
      stopRequestedRef.current = true;
      isPlayingRef.current = false;
    };
  }, []);

  const handlePlaySingle = (text: string) => {
    // If continuous playback is running, stop it first
    if (isPlayingAll) {
      handleStopAll();
    }
    playGeminiTTS(text);
  };

  // Helper for delays
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Speak a text with unified British English female voice and audio fallback
  const speakWordPromise = (text: string, _rate = 0.88): Promise<void> => {
    return playGeminiTTS(text);
  };

  // Continuous playback: each word repeated twice at moderate speed (0.85x)
  const handlePlayAll = async () => {
    if (items.length === 0) return;

    if (isPaused) {
      resumeTTS();
      setIsPaused(false);
      return;
    }

    stopRequestedRef.current = false;
    isPlayingRef.current = true;
    setIsPlayingAll(true);
    setIsPaused(false);

    for (let i = 0; i < items.length; i++) {
      if (stopRequestedRef.current) break;

      setCurrentWordIdx(i);

      // Repeat 1
      setCurrentRepeat(1);
      await speakWordPromise(items[i].word, 0.85);
      if (stopRequestedRef.current) break;

      // Short pause between 2 repetitions (0.7s)
      await sleep(700);
      if (stopRequestedRef.current) break;

      // Repeat 2
      setCurrentRepeat(2);
      await speakWordPromise(items[i].word, 0.85);
      if (stopRequestedRef.current) break;

      // Longer pause before moving to next word (1.3s)
      await sleep(1300);
      if (stopRequestedRef.current) break;
    }

    setIsPlayingAll(false);
    setIsPaused(false);
    setCurrentWordIdx(-1);
    setCurrentRepeat(1);
    isPlayingRef.current = false;
  };

  const handlePauseAll = () => {
    pauseTTS();
    setIsPaused(true);
  };

  const handleStopAll = () => {
    stopRequestedRef.current = true;
    isPlayingRef.current = false;
    stopTTS();
    setIsPlayingAll(false);
    setIsPaused(false);
    setCurrentWordIdx(-1);
    setCurrentRepeat(1);
  };

  // Download Audio File: Generates an audio script of all words (each repeated twice)
  const handleDownloadAudio = async () => {
    if (items.length === 0) return;
    setIsDownloading(true);
    setDownloadMsg('Đang tổng hợp file âm thanh từ vựng...');

    // Build speech text script: each word repeated 2 times with punctuation pauses
    const scriptText = items
      .map(item => `${item.word}. ... ${item.word}.`)
      .join(' ... ');

    try {
      // 1. Try generateAudioFromContent via Gemini TTS
      const base64Data = await generateAudioFromContent(scriptText);

      if (base64Data) {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/wav' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeTopic = (topicTitle || 'Tu_Vung_Legend_X5').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `${safeTopic}_Vocabulary_Audio.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setDownloadMsg('🎉 Tải về file âm thanh thành công!');
        setTimeout(() => setDownloadMsg(''), 4000);
        setIsDownloading(false);
        return;
      }
    } catch (e: any) {
      console.warn('Gemini TTS direct audio generation note:', e?.message || e);
    }

    // Fallback: Generate an audio WAV file with Google TTS audio source or direct offline audio blob
    try {
      // Google TTS endpoint for high-quality British English pronunciation (en-gb)
      const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-gb&client=tw-ob&q=${encodeURIComponent(
        items.map(i => `${i.word}, ${i.word}`).join('. ')
      )}`;

      const a = document.createElement('a');
      a.href = audioUrl;
      a.target = '_blank';
      const safeTopic = (topicTitle || 'Tu_Vung_Legend_X5').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeTopic}_Vocabulary_Audio_British.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadMsg('🎉 Đang mở tải file âm thanh từ vựng chuẩn Anh - Anh!');
      setTimeout(() => setDownloadMsg(''), 4000);
    } catch (err: any) {
      setDownloadMsg('Chưa thể tải file tự động. Bạn có thể nhấn "Nghe Toàn Bộ" để luyện tập ngay trên app!');
      setTimeout(() => setDownloadMsg(''), 4000);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-5 font-sans">
      {/* ==================== AUDIO STATION BANNER ==================== */}
      <div className="bg-gradient-to-r from-sky-800 via-brand-700 to-sky-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider">
                <span>🎧</span> BĂNG ÂM THANH TOÀN BỘ TỪ VỰNG
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-400 text-slate-950 rounded-full text-[11px] font-black tracking-wide shadow-sm">
                <span>🇬🇧</span> GIỌNG NỮ CHUẨN ANH - ANH (RP)
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight font-display">
              LUYỆN NGHE PHÁT ÂM CHUẨN ANH - ANH (LẶP LẠI 2 LẦN)
            </h3>
            <p className="text-teal-100 text-xs sm:text-sm font-medium">
              Sử dụng giọng nữ chuẩn Anh - Anh (British English), tốc độ đọc vừa phải (0.88x chuẩn sư phạm), mỗi từ lặp lại 2 lần giúp em nghe, ngấm và ghi nhớ phát âm chuẩn xác.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {!isPlayingAll ? (
              <button
                type="button"
                onClick={handlePlayAll}
                className="flex-1 md:flex-none px-5 py-3 bg-highlight-400 hover:bg-highlight-300 text-brand-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <span className="text-base">▶️</span>
                <span>Nghe Toàn Bộ ({items.length} từ)</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full md:w-auto">
                {!isPaused ? (
                  <button
                    type="button"
                    onClick={handlePauseAll}
                    className="flex-1 md:flex-none px-4 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <span>⏸️</span> Tạm Dừng
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePlayAll}
                    className="flex-1 md:flex-none px-4 py-3 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <span>▶️</span> Tiếp Tục
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStopAll}
                  className="px-4 py-3 bg-white/20 hover:bg-white/30 text-white font-bold text-xs sm:text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5"
                >
                  <span>⏹️</span> Dừng
                </button>
              </div>
            )}

            {/* DOWNLOAD AUDIO BUTTON */}
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleDownloadAudio}
              className="flex-1 md:flex-none px-4 py-3 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-xs sm:text-sm rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Đang tạo file...</span>
                </>
              ) : (
                <>
                  <span className="text-base">📥</span>
                  <span>Tải File Âm Thanh</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real-time Status Indicator when playing */}
        {isPlayingAll && currentWordIdx >= 0 && currentWordIdx < items.length && (
          <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>
                Đang đọc: <span className="text-highlight-300 text-sm font-black underline">{items[currentWordIdx].word}</span>
                <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-md text-[11px]">
                  (Lần {currentRepeat}/2)
                </span>
              </span>
            </div>
            <span className="text-teal-200">
              Từ {currentWordIdx + 1}/{items.length}
            </span>
          </div>
        )}

        {downloadMsg && (
          <div className="mt-3 p-2.5 bg-white/20 rounded-xl text-xs font-bold text-center animate-fade-in">
            {downloadMsg}
          </div>
        )}
      </div>

      {/* Header with meaning toggle */}
      <div className="flex flex-row justify-between items-center gap-3 border-b-2 border-brand-100 pb-3">
        <h2 className="text-lg sm:text-xl font-black text-brand-800 uppercase tracking-tight flex items-center gap-2">
          <span>📖</span> Danh Sách Từ Vựng ({items.length} từ)
        </h2>
        <button
          onClick={() => setShowMeaning(!showMeaning)}
          className="text-xs bg-white border border-brand-200 px-3 py-1 rounded-full hover:bg-brand-50 transition-all text-brand-600 font-bold"
        >
          {showMeaning ? 'Ẩn nghĩa' : 'Hiện nghĩa'}
        </button>
      </div>

      {/* Vocabulary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {items.map((item, idx) => {
          const isCurrentlyActive = isPlayingAll && currentWordIdx === idx;
          return (
            <div
              key={idx}
              className={`bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm border-2 transition-all ${
                isCurrentlyActive
                  ? 'border-emerald-500 ring-4 ring-emerald-200 bg-emerald-50/30 scale-[1.02]'
                  : 'border-slate-100 hover:border-brand-200 hover:shadow-md'
              }`}
            >
              {/* Card Content */}
              <div className="flex gap-3">
                {/* Emoji Icon */}
                <div className="shrink-0">
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center transition-all ${
                      isCurrentlyActive ? 'bg-emerald-100 text-emerald-800 scale-105' : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    <span className="text-xl sm:text-2xl select-none">{item.emoji || '📝'}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Word + Audio */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-black text-brand-900 leading-tight">
                        {item.word}
                        {isCurrentlyActive && (
                          <span className="ml-2 text-xs text-emerald-600 font-bold animate-pulse">
                            (Đang phát...)
                          </span>
                        )}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span className="text-brand-600 text-xs font-mono bg-brand-50 px-1.5 py-0.5 rounded font-semibold">
                          /{String(item.ipa || '').replace(/^\/+|\/+$/g, '')}/
                        </span>
                        <span className="text-[8px] sm:text-[9px] bg-brand-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                          {item.type}
                        </span>
                      </div>
                    </div>

                    {/* Audio Button */}
                    <button
                      onClick={() => handlePlaySingle(item.word)}
                      className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-100 text-brand-700 hover:bg-brand-500 hover:text-white transition-all flex items-center justify-center active:scale-95"
                      aria-label="Phát âm từ"
                      title="Phát âm từ này"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      </svg>
                    </button>
                  </div>

                  {/* Meaning */}
                  {showMeaning && (
                    <p className="text-amber-600 font-bold text-sm sm:text-base mt-1.5 italic">
                      {item.meaning}
                    </p>
                  )}

                  {/* Example */}
                  <div className="mt-2 bg-slate-50 p-2.5 sm:p-3 rounded-xl relative border border-slate-100">
                    <p className="text-slate-700 text-xs sm:text-sm font-medium italic pr-7 leading-relaxed">
                      "{item.example}"
                    </p>

                    {showMeaning && item.sentenceMeaning && (
                      <p className="text-brand-600 text-[11px] sm:text-xs font-semibold mt-1.5 pt-1.5 border-t border-slate-200">
                        → {item.sentenceMeaning}
                      </p>
                    )}

                    {/* Example Audio */}
                    <button
                      onClick={() => handlePlaySingle(item.example)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white text-slate-400 hover:text-brand-500 border border-slate-200 flex items-center justify-center transition-all"
                      aria-label="Phát câu ví dụ"
                      title="Phát câu ví dụ"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
