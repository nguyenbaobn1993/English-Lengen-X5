
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAIBlob } from '@google/genai';
import React, { useEffect, useRef, useState } from 'react';
import { SpeakingQ } from '../types';

interface AICallModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyContext: string;
  speakingQuestions?: SpeakingQ[];
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const AICallModal: React.FC<AICallModalProps> = ({ isOpen, onClose, storyContext, speakingQuestions }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected' | 'permission-denied' | 'device-not-found'>('connecting');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const isClosingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
      startSession();
    } else {
      stopSession();
    }
    return () => { isClosingRef.current = true; stopSession(); };
  }, [isOpen]);

  const startSession = async () => {
    try {
      setStatus('connecting');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('error');
          return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
           setStatus('device-not-found');
        } else if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
           setStatus('permission-denied');
        } else {
           setStatus('error');
        }
        return;
      }

      streamRef.current = stream;

      const questionsList = speakingQuestions?.map((q, i) => `${i+1}. ${q.question}`).join('\n') || "";

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (isClosingRef.current) return;
            setStatus('connected');
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              if (isClosingRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                try { session.sendRealtimeInput({ media: pcmBlob }); } catch (e) {}
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isClosingRef.current) return;
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const src of sourcesRef.current) { try { src.stop(); } catch (e) {} }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            if (isClosingRef.current) return;
            console.error(e);
            setStatus('error');
          },
          onclose: () => {
            if (isClosingRef.current) return;
            setStatus('disconnected');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are Legend X5, a polyglot English teacher at "ENGLISH LEGEND X5". 
          
          CAPABILITIES:
          - Polyglot: Speak any language requested, but primarily English.
          - Interaction Focus: You MUST use exactly these 10 speaking questions one by one to practice with the student:
          ${questionsList}
          
          Story context: "${storyContext}".
          
          RULES:
          1. Start by greeting the student warmly.
          2. Ask question #1. Wait for response.
          3. Give feedback, then ask question #2, and so on.
          4. Encouraging and clear voice.`
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      console.error(err);
      setStatus('error');
    }
  };

  const stopSession = () => {
    isClosingRef.current = true;
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => { try { s.close(); } catch(e) {} });
      sessionPromiseRef.current = null;
    }
    for (const src of sourcesRef.current) { try { src.stop(); } catch (e) {} }
    sourcesRef.current.clear();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (scriptProcessorRef.current) { scriptProcessorRef.current.disconnect(); scriptProcessorRef.current = null; }
    if (inputAudioContextRef.current) { inputAudioContextRef.current.close(); inputAudioContextRef.current = null; }
    if (outputAudioContextRef.current) { outputAudioContextRef.current.close(); outputAudioContextRef.current = null; }
    nextStartTimeRef.current = 0;
    setIsSpeaking(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-[3.5rem] p-10 md:p-14 max-w-lg w-full relative overflow-hidden shadow-2xl border-[12px] border-brand-100 ring-4 ring-white/20">
        <button onClick={onClose} className="absolute top-8 right-8 p-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all hover:rotate-90">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div className="flex flex-col items-center justify-center space-y-10">
            <div className="text-center">
                <div className="inline-block bg-brand-100 text-brand-700 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">POLYGLOT TEACHER AI</div>
                <h3 className="text-3xl font-black text-slate-800 font-sans mb-2 tracking-tight">Speak with Legend X5</h3>
                <p className="text-slate-400 font-medium italic">"Practice speaking English using your cards!"</p>
            </div>

            <div className="relative w-56 h-56 flex items-center justify-center">
                {status === 'connected' && (
                  <div className={`absolute inset-0 bg-brand-400/20 rounded-full transition-all duration-500 ${isSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-50'}`}></div>
                )}
                <div className={`relative z-10 w-40 h-40 rounded-full flex items-center justify-center shadow-2xl border-8 border-white transition-all duration-500 transform ${isSpeaking ? 'bg-gradient-to-tr from-green-400 to-emerald-500 scale-110 shadow-emerald-200/50' : 'bg-brand-500'} ${['error', 'permission-denied', 'device-not-found'].includes(status) ? 'bg-red-500' : ''}`}>
                    {status === 'connecting' && <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>}
                    {status === 'connected' && <span className="text-7xl">{isSpeaking ? '👩‍🏫' : '👂'}</span>}
                    {['error', 'permission-denied', 'device-not-found'].includes(status) && <span className="text-7xl">⚠️</span>}
                </div>
            </div>

            <div className="min-h-[2rem] text-center">
                {status === 'connecting' && <p className="text-brand-500 font-black animate-pulse">Connecting to Polyglot Teacher...</p>}
                {status === 'connected' && <p className={`font-black text-2xl tracking-tight transition-colors ${isSpeaking ? 'text-brand-700' : 'text-emerald-600'}`}>{isSpeaking ? "Legend X5 is speaking..." : "Listening to you..."}</p>}
                {status === 'permission-denied' && <p className="text-red-500 font-black">Lỗi: Bé hãy cho phép truy cập Micro nhé!</p>}
                {status === 'device-not-found' && <p className="text-red-500 font-black">Lỗi: Không tìm thấy Micro trên máy!</p>}
                {status === 'error' && <p className="text-red-500 font-black">Lỗi kết nối. Bé hãy thử lại nhé!</p>}
            </div>

            <button onClick={onClose} className="w-full bg-red-50 text-red-500 py-5 rounded-3xl font-black text-xl hover:bg-red-100 transition-all border-b-4 border-red-200 active:border-b-0 active:translate-y-1 shadow-sm uppercase">End Call</button>
        </div>
      </div>
    </div>
  );
};
