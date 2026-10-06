
import React, { useState } from 'react';
import { UploadZone } from './UploadZone';
import { StoryDisplay } from './StoryDisplay';
import { AppState, LoadingStep, CharacterProfile, AppMode, ImageRatio } from '../types';
import { 
  fileToBase64, 
  analyzeImageAndCreateContent, 
  generateStoryImage, 
  generateAudioFromContent 
} from '../services/geminiService';

const CHARACTERS: CharacterProfile[] = [
  {
    id: 'doraemon',
    name: 'Doraemon',
    emoji: '🐱',
    promptContext: 'Doraemon, the blue robotic cat from the future',
    stylePrompt: 'Japanese anime style, 2D hand-drawn look, Fujiko F. Fujio aesthetic, clean thick outlines, bright blue and white colors',
    colorClass: 'bg-blue-500'
  },
  {
    id: 'elsa',
    name: 'Elsa',
    emoji: '❄️',
    promptContext: 'Queen Elsa with long blonde braid and ice powers',
    stylePrompt: 'Disney 3D animation style, Frozen movie look, sparkling ice effects, cinematic lighting, elegant blue gown',
    colorClass: 'bg-cyan-400'
  },
  {
    id: 'spiderman',
    name: 'Spider-Man',
    emoji: '🕸️',
    promptContext: 'Spider-Man in his classic red and blue suit',
    stylePrompt: 'Marvel animated series style, superhero comic look, heroic poses, web effects, vibrant urban colors',
    colorClass: 'bg-red-700'
  },
  {
    id: 'pikachu',
    name: 'Pikachu',
    emoji: '⚡',
    promptContext: 'Pikachu, the yellow electric pokemon with red cheeks',
    stylePrompt: 'Pokemon anime style, cute cel-shaded animation, lightning sparks, bright yellow fur',
    colorClass: 'bg-yellow-400'
  },
  {
    id: 'harry_potter',
    name: 'Harry Potter',
    emoji: '⚡👓',
    promptContext: 'Young Harry Potter with glasses and a lightning scar',
    stylePrompt: 'Fantasy illustration style, magical glowing atmosphere, holding a wooden wand, Hogwarts robe',
    colorClass: 'bg-red-900'
  },
  {
    id: 'minions',
    name: 'Minions',
    emoji: '🍌',
    promptContext: 'Group of yellow Minions wearing blue overalls',
    stylePrompt: 'Illumination 3D animation style, shiny round bodies, funny expressions, 3D render look',
    colorClass: 'bg-yellow-500'
  },
  {
    id: 'bluey',
    name: 'Bluey',
    emoji: '🐶',
    promptContext: 'Bluey the Blue Heeler puppy',
    stylePrompt: 'Bluey cartoon art style, simple geometric flat shapes, soft pastel colors, heartwarming look',
    colorClass: 'bg-blue-400'
  },
  {
    id: 'peppa',
    name: 'Peppa Pig',
    emoji: '🐷',
    promptContext: 'Peppa Pig the pink piglet',
    stylePrompt: 'Peppa Pig 2D simple hand-drawn style, child-like aesthetic, bright pink and red',
    colorClass: 'bg-pink-400'
  }
];

const INITIAL_STATE: AppState = {
  selectedCharacter: CHARACTERS[0],
  selectedMode: AppMode.CREATIVE,
  selectedRatio: '1:1',
  customPrompt: '',
  originalImages: [],
  generatedImage: null,
  audioUrl: null,
  contentResult: null,
  isLoading: false,
  loadingStep: LoadingStep.IDLE,
  error: null
};

export const MagicStory: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [inputMode, setInputMode] = useState<'image' | 'text' | 'topic'>('image');
  const [inputTopic, setInputTopic] = useState('');
  const [inputText, setInputText] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);

  const handleCharacterSelect = (char: CharacterProfile) => {
      setState(prev => ({ ...prev, selectedCharacter: char }));
  };

  const handleFilesSelect = (files: File[]) => {
    setPendingFiles(files);
    setIsConfiguring(true);
  };

  const handleStartMagic = async () => {
    try {
      setIsConfiguring(false);
      setState(prev => ({
        ...prev,
        originalImages: [], 
        generatedImage: null,
        audioUrl: null,
        contentResult: null,
        error: null,
        isLoading: true,
        loadingStep: LoadingStep.ANALYZING
      }));

      let base64Images: string[] = [];
      if (inputMode === 'image') {
        const imagePromises = pendingFiles.map(file => fileToBase64(file));
        base64Images = await Promise.all(imagePromises);
        const originalImageUrls = base64Images.map((b64, idx) => `data:${pendingFiles[idx].type};base64,${b64}`);
        setState(prev => ({ ...prev, originalImages: originalImageUrls }));
      }

      const contentResult = await analyzeImageAndCreateContent(
        base64Images, 
        inputMode === 'image' && pendingFiles.length > 0 ? pendingFiles[0].type : "image/jpeg", 
        state.selectedCharacter,
        state.selectedMode,
        state.customPrompt,
        inputTopic,
        inputText
      );
      
      setState(prev => ({
        ...prev,
        contentResult,
        loadingStep: LoadingStep.GENERATING_IMAGE
      }));

      const generatedImage = await generateStoryImage(
        contentResult.imagePrompt, 
        state.selectedCharacter.stylePrompt,
        state.selectedRatio
      );
      
      setState(prev => ({
        ...prev,
        generatedImage,
        loadingStep: LoadingStep.GENERATING_AUDIO
      }));

      const audioData = await generateAudioFromContent(contentResult.storyEnglish);
      
      setState(prev => ({
        ...prev,
        audioUrl: audioData || null,
        isLoading: false,
        loadingStep: LoadingStep.COMPLETED
      }));

    } catch (error: any) {
      console.error(error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        loadingStep: LoadingStep.IDLE,
        error: error.message || "Oops! We couldn't process that magic. Please try again."
      }));
    }
  };

  const handleReset = () => {
    setPendingFiles([]);
    setIsConfiguring(false);
    setInputTopic('');
    setInputText('');
    setState(prev => ({
        ...INITIAL_STATE,
        selectedCharacter: prev.selectedCharacter,
        selectedMode: prev.selectedMode,
        selectedRatio: prev.selectedRatio,
        customPrompt: ''
    }));
  };

  return (
    <div className="w-full">
        {state.error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-8 rounded-xl shadow-sm mx-auto max-w-4xl" role="alert">
            <p className="font-bold">Error</p>
            <p>{state.error}</p>
          </div>
        )}

        {!state.contentResult && !state.isLoading && !isConfiguring && (
          <div className="space-y-12 animate-fade-in max-w-5xl mx-auto">
            <div className="text-center mb-10">
                <h2 className="text-4xl font-black text-slate-800 font-display mb-3">Tạo câu chuyện phép thuật ✨</h2>
                <p className="text-slate-500 text-lg">Chọn nhân vật yêu thích và kể cho Legend X5 nghe cuộc phiêu lưu!</p>
            </div>

            <section>
              <h3 className="text-center text-xl font-black text-brand-600 mb-6 uppercase tracking-widest">1. Chọn nhân vật anh hùng</h3>
              <div className="flex flex-wrap justify-center gap-6">
                {CHARACTERS.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => handleCharacterSelect(char)}
                    className={`
                      flex flex-col items-center p-4 rounded-3xl border-4 transition-all transform duration-200
                      ${state.selectedCharacter.id === char.id 
                        ? 'border-brand-400 bg-white shadow-xl scale-110 -translate-y-2' 
                        : 'border-transparent bg-white/50 hover:bg-white hover:shadow-lg opacity-70 hover:opacity-100 hover:scale-105'}
                    `}
                  >
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-inner ${char.colorClass} text-white mb-2`}>
                      {char.emoji}
                    </div>
                    <span className="text-base font-bold text-slate-700">{char.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="max-w-2xl mx-auto">
               <h3 className="text-center text-xl font-black text-brand-600 mb-6 uppercase tracking-widest">2. Nhập thông tin câu chuyện</h3>
               
               <div className="bg-white rounded-[2rem] shadow-lg p-2 flex gap-2 mb-6 border-2 border-slate-100">
                  <button 
                    onClick={() => setInputMode('image')}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'image' ? 'bg-brand-400 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span>📸</span> <span>Hình ảnh</span>
                  </button>
                  <button 
                    onClick={() => setInputMode('topic')}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'topic' ? 'bg-brand-400 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span>💡</span> <span>Chủ đề</span>
                  </button>
                  <button 
                    onClick={() => setInputMode('text')}
                    className={`flex-1 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'text' ? 'bg-brand-400 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span>📝</span> <span>Văn bản</span>
                  </button>
               </div>

               {inputMode === 'image' && (
                 <UploadZone 
                    onFilesSelect={handleFilesSelect} 
                    isLoading={state.isLoading}
                    fileCount={pendingFiles.length}
                  />
               )}

               {inputMode === 'topic' && (
                  <div className="bg-white p-8 rounded-[2rem] shadow-xl border-4 border-brand-100 animate-fade-in">
                    <div className="mb-6">
                        <label className="block text-sm font-black text-brand-600 mb-2 uppercase tracking-wide">Nhập chủ đề bài học</label>
                        <input 
                            type="text"
                            placeholder="Ví dụ: Birthday party, At the zoo, Colors..."
                            value={inputTopic}
                            onChange={(e) => setInputTopic(e.target.value)}
                            className="w-full p-4 text-xl rounded-xl border-2 border-slate-200 focus:border-brand-400 outline-none font-bold text-slate-700"
                        />
                    </div>
                    <button 
                      onClick={() => setIsConfiguring(true)}
                      disabled={!inputTopic.trim()}
                      className="w-full py-4 bg-brand-500 text-white font-black text-xl rounded-xl shadow-lg hover:bg-brand-600 disabled:opacity-50 transform active:scale-95 transition-all"
                    >
                      Tiếp tục ➔
                    </button>
                  </div>
               )}

               {inputMode === 'text' && (
                  <div className="bg-white p-8 rounded-[2rem] shadow-xl border-4 border-brand-100 animate-fade-in">
                    <div className="mb-6">
                        <label className="block text-sm font-black text-brand-600 mb-2 uppercase tracking-wide">Nhập nội dung/gợi ý</label>
                        <textarea 
                            placeholder="Dán nội dung bài học hoặc mô tả câu chuyện em muốn kể..."
                            rows={4}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            className="w-full p-4 text-lg rounded-xl border-2 border-slate-200 focus:border-brand-400 outline-none font-medium text-slate-700 resize-none"
                        />
                    </div>
                    <button 
                      onClick={() => setIsConfiguring(true)}
                      disabled={!inputText.trim()}
                      className="w-full py-4 bg-brand-500 text-white font-black text-xl rounded-xl shadow-lg hover:bg-brand-600 disabled:opacity-50 transform active:scale-95 transition-all"
                    >
                      Tiếp tục ➔
                    </button>
                  </div>
               )}
            </section>
          </div>
        )}

        {isConfiguring && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-3xl w-full p-8 relative overflow-hidden animate-bounce-in">
               <div className="absolute top-0 left-0 w-full h-3 bg-brand-400"></div>
               <h2 className="text-3xl font-black text-center mb-8 font-display text-slate-800">Tùy chỉnh phép thuật</h2>

               <div className="grid md:grid-cols-2 gap-8 mb-8">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="block text-sm font-black text-slate-400 uppercase tracking-wide">Kích thước ảnh minh họa</label>
                      <div className="flex flex-wrap gap-2">
                        {(['1:1', '16:9', '9:16'] as ImageRatio[]).map((ratio) => (
                          <label key={ratio} className={`
                            flex items-center justify-center px-4 py-2 rounded-xl border-2 cursor-pointer transition-all
                            ${state.selectedRatio === ratio ? 'border-brand-400 bg-brand-50 text-brand-700 font-bold shadow-sm' : 'border-slate-100 text-slate-500 font-medium'}
                          `}>
                            <input 
                              type="radio" 
                              name="ratio" 
                              className="hidden" 
                              checked={state.selectedRatio === ratio} 
                              onChange={() => setState(s => ({...s, selectedRatio: ratio}))}
                            />
                            <span className="text-sm">{ratio}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-black text-slate-400 uppercase tracking-wide">Yêu cầu đặc biệt (Tùy chọn)</label>
                        <textarea 
                            placeholder="Ví dụ: Kể về tình bạn, làm câu chuyện hài hước..."
                            className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-brand-400 outline-none transition-all resize-none text-slate-700 font-medium text-sm"
                            rows={3}
                            value={state.customPrompt}
                            onChange={(e) => setState(s => ({...s, customPrompt: e.target.value}))}
                        />
                    </div>
                  </div>
               </div>
               
               <div className="flex gap-4 pt-4">
                 <button 
                    onClick={() => setIsConfiguring(false)}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors"
                  >
                   Quay lại
                 </button>
                 <button 
                    onClick={handleStartMagic}
                    className="flex-1 py-4 bg-brand-500 hover:bg-brand-600 text-white font-black text-xl rounded-xl shadow-lg shadow-brand-200 transform hover:-translate-y-1 transition-all"
                  >
                   ✨ Bắt đầu kể chuyện
                 </button>
               </div>
            </div>
          </div>
        )}

        {state.isLoading && (
          <div className="mt-20 text-center space-y-8 animate-fade-in">
            <div className="relative w-48 h-48 mx-auto">
                <div className="absolute inset-0 border-[12px] border-slate-100 rounded-full"></div>
                <div className="absolute inset-0 border-[12px] border-brand-400 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-8xl animate-bounce-slow">
                  {state.selectedCharacter.emoji}
                </div>
            </div>
            <div>
                <h2 className="text-4xl font-black text-brand-600 animate-pulse font-display mb-2">
                    {state.loadingStep}
                </h2>
                <p className="text-slate-500 text-lg font-bold">
                    Legend X5 AI đang chuẩn bị câu chuyện cho em...
                </p>
            </div>
          </div>
        )}

        {state.contentResult && state.generatedImage && (
          <StoryDisplay
            contentResult={state.contentResult}
            generatedImage={state.generatedImage}
            originalImages={state.originalImages}
            audioUrl={state.audioUrl}
            onReset={handleReset}
          />
        )}
    </div>
  );
};
