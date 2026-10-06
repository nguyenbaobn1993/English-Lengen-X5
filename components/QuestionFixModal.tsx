import React, { useState } from 'react';
import { regenerateQuestionWithAi } from '../services/geminiService';

export interface QuestionFixModalProps {
  questionType: 'multipleChoice' | 'readingMC' | 'pronunciation' | 'scramble' | 'vocabTranslation' | 'trueFalse' | 'fillBlank' | 'readingFill' | 'listening';
  questionIndex: number;
  questionData: any;
  context?: {
    topic?: string;
    grammarTopic?: string;
    grammarExplanation?: string;
    readingPassage?: string;
  };
  onSave: (updatedQuestion: any) => void;
  onClose: () => void;
}

export const QuestionFixModal: React.FC<QuestionFixModalProps> = ({
  questionType,
  questionIndex,
  questionData,
  context,
  onSave,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

  // AI Tab States
  const [aiNote, setAiNote] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiGeneratedResult, setAiGeneratedResult] = useState<any | null>(null);

  // Manual Tab Form States (cloned from questionData)
  const [manualQuestion, setManualQuestion] = useState<string>(
    questionData.question || questionData.statement || questionData.correctSentence || questionData.word || questionData.audioText || ''
  );
  const [manualOptions, setManualOptions] = useState<string[]>(
    Array.isArray(questionData.options) ? [...questionData.options] : ['', '', '', '']
  );
  const [manualCorrectAnswer, setManualCorrectAnswer] = useState<number>(
    typeof questionData.correctAnswer === 'number' ? questionData.correctAnswer : 0
  );
  const [manualExplanation, setManualExplanation] = useState<string>(questionData.explanation || '');

  // Extra states for specialized question types
  const [manualIsTrue, setManualIsTrue] = useState<boolean>(questionData.isTrue ?? true);
  const [manualTranslation, setManualTranslation] = useState<string>(questionData.translation || '');
  const [manualCorrectSentence, setManualCorrectSentence] = useState<string>(questionData.correctSentence || '');
  const [manualTargetSound, setManualTargetSound] = useState<string>(questionData.targetSound || '');
  const [manualFillCorrect, setManualFillCorrect] = useState<string>(
    questionData.missingWord || questionData.correctAnswer || ''
  );
  const [manualSentenceWithBlank, setManualSentenceWithBlank] = useState<string>(
    questionData.sentenceWithBlank || questionData.question || ''
  );

  // Helper check for duplicate blank issue (like in screenshot)
  const detectBlankDuplication = (): string | null => {
    const qText = String(questionData.question || questionData.sentenceWithBlank || '');
    if (!qText.includes('______') && !qText.includes('____') && !qText.includes('___')) return null;

    const opt = Array.isArray(questionData.options) && typeof questionData.correctAnswer === 'number'
      ? questionData.options[questionData.correctAnswer]
      : (questionData.missingWord || questionData.correctAnswer);

    if (typeof opt === 'string' && opt.trim()) {
      const matchAfter = qText.match(/(?:_{3,})\s+([a-zA-Z]+)/);
      if (matchAfter && opt.toLowerCase().includes(matchAfter[1].toLowerCase())) {
        return `Phát hiện lỗi lặp từ: Đề bài chứa từ "${matchAfter[1]}" ngay sau ô trống, trong khi đáp án đúng cũng chứa từ "${opt}".`;
      }
    }
    return null;
  };

  const duplicationWarning = detectBlankDuplication();

  // Quick prompt chip handler
  const handleQuickChip = (text: string) => {
    setAiNote(prev => (prev ? `${prev}. ${text}` : text));
  };

  // Run AI Regeneration
  const handleAiRegenerate = async () => {
    setIsAiGenerating(true);
    setAiError(null);
    try {
      const result = await regenerateQuestionWithAi({
        questionType,
        currentQuestion: questionData,
        teacherNote: aiNote.trim(),
        context
      });
      setAiGeneratedResult(result);
    } catch (err: any) {
      setAiError(err?.message || 'Có lỗi xảy ra khi gọi AI sinh lại câu hỏi. Cô vui lòng thử lại.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Apply AI result
  const handleApplyAiResult = () => {
    if (!aiGeneratedResult) return;
    onSave(aiGeneratedResult);
    onClose();
  };

  // Transfer AI result to manual editor for further fine-tuning
  const handleTransferToManual = () => {
    if (!aiGeneratedResult) return;
    if (aiGeneratedResult.question) setManualQuestion(aiGeneratedResult.question);
    if (Array.isArray(aiGeneratedResult.options)) setManualOptions([...aiGeneratedResult.options]);
    if (typeof aiGeneratedResult.correctAnswer === 'number') setManualCorrectAnswer(aiGeneratedResult.correctAnswer);
    if (aiGeneratedResult.explanation) setManualExplanation(aiGeneratedResult.explanation);
    if (typeof aiGeneratedResult.isTrue === 'boolean') setManualIsTrue(aiGeneratedResult.isTrue);
    if (aiGeneratedResult.correctSentence) {
      setManualCorrectSentence(aiGeneratedResult.correctSentence);
      setManualQuestion(aiGeneratedResult.correctSentence);
    }
    if (aiGeneratedResult.translation) setManualTranslation(aiGeneratedResult.translation);
    if (aiGeneratedResult.targetSound) setManualTargetSound(aiGeneratedResult.targetSound);
    if (aiGeneratedResult.missingWord) setManualFillCorrect(aiGeneratedResult.missingWord);
    if (aiGeneratedResult.sentenceWithBlank) setManualSentenceWithBlank(aiGeneratedResult.sentenceWithBlank);

    setActiveTab('manual');
  };

  // Save manual edit
  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();

    let updated: any = { ...questionData };

    if (questionType === 'multipleChoice' || questionType === 'readingMC') {
      updated = {
        ...updated,
        question: manualQuestion.trim(),
        options: manualOptions.map(o => o.trim()),
        correctAnswer: manualCorrectAnswer,
        explanation: manualExplanation.trim()
      };
    } else if (questionType === 'pronunciation') {
      updated = {
        ...updated,
        question: manualQuestion.trim(),
        targetSound: manualTargetSound.trim(),
        options: manualOptions.map(o => o.trim()),
        displayOptions: manualOptions.map(o => o.trim()),
        correctAnswer: manualCorrectAnswer,
        explanation: manualExplanation.trim()
      };
    } else if (questionType === 'vocabTranslation') {
      updated = {
        ...updated,
        word: manualQuestion.trim(),
        options: manualOptions.map(o => o.trim()),
        correctAnswer: manualCorrectAnswer,
        explanation: manualExplanation.trim()
      };
    } else if (questionType === 'trueFalse') {
      updated = {
        ...updated,
        statement: manualQuestion.trim(),
        isTrue: manualIsTrue,
        explanation: manualExplanation.trim()
      };
    } else if (questionType === 'scramble') {
      const tokens = manualCorrectSentence.trim().split(/\s+/).filter(Boolean);
      // Auto scramble
      const scrambledTokens = [...tokens].sort(() => Math.random() - 0.5);
      updated = {
        ...updated,
        correctSentence: manualCorrectSentence.trim(),
        scrambled: scrambledTokens,
        translation: manualTranslation.trim()
      };
    } else if (questionType === 'fillBlank' || questionType === 'readingFill') {
      updated = {
        ...updated,
        question: manualQuestion.trim(),
        correctAnswer: manualFillCorrect.trim(),
        explanation: manualExplanation.trim()
      };
    } else if (questionType === 'listening') {
      updated = {
        ...updated,
        audioText: manualQuestion.trim(),
        sentenceWithBlank: manualSentenceWithBlank.trim(),
        missingWord: manualFillCorrect.trim(),
        explanation: manualExplanation.trim()
      };
    }

    onSave(updated);
    onClose();
  };

  const getTypeNameLabel = () => {
    switch (questionType) {
      case 'multipleChoice': return 'Trắc nghiệm ABCD';
      case 'readingMC': return 'Đọc hiểu ABCD';
      case 'pronunciation': return 'Phát âm khác biệt';
      case 'scramble': return 'Sắp xếp câu';
      case 'vocabTranslation': return 'Dịch nghĩa từ vựng';
      case 'trueFalse': return 'Đúng / Sai (True / False)';
      case 'fillBlank': return 'Điền từ vào chỗ trống';
      case 'readingFill': return 'Đọc hiểu điền từ';
      case 'listening': return 'Luyện nghe điền từ';
      default: return 'Câu hỏi';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border-4 border-amber-300 overflow-hidden text-slate-800">
        
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl shrink-0 shadow-inner">
              🛠️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-white/20 rounded-md text-[11px] font-black uppercase tracking-wider">
                  {getTypeNameLabel()}
                </span>
                <span className="text-xs font-bold text-amber-100">
                  Câu số {questionIndex + 1}
                </span>
              </div>
              <h3 className="font-black text-lg sm:text-xl leading-tight mt-0.5">
                Kiểm Tra & Sửa Đề Thi
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'ai'
                ? 'bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            <span className="text-base">🤖</span> AI Sinh Lại / Sửa Tự Động
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            <span className="text-base">✏️</span> Tự Nhập Chỉnh Sửa Tay
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* TAB 1: AI GENERATION */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              
              {/* Warning about duplication if detected */}
              {duplicationWarning && (
                <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3">
                  <span className="text-2xl shrink-0">⚠️</span>
                  <div className="text-xs sm:text-sm">
                    <p className="font-bold text-rose-800">Cảnh báo lỗi cấu trúc câu:</p>
                    <p className="text-rose-700 mt-0.5">{duplicationWarning}</p>
                    <p className="text-[11px] text-rose-600 mt-1 italic">
                      💡 Cô có thể bấm nút "AI Phân Tích & Sửa Ngay" bên dưới, AI sẽ tự động điều chỉnh câu để triệt tiêu lỗi lặp từ này!
                    </p>
                  </div>
                </div>
              )}

              {/* Current Question Card Preview */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Nội dung câu hiện tại (Đang kiểm tra):
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                    Gốc
                  </span>
                </div>
                <p className="text-sm sm:text-base font-bold text-slate-800 break-words">
                  {questionData.question || questionData.statement || questionData.correctSentence || questionData.word || questionData.audioText}
                </p>

                {Array.isArray(questionData.options) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {questionData.options.map((opt: string, idx: number) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                          questionData.correctAnswer === idx
                            ? 'bg-green-50 border-green-300 text-green-800 font-bold'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className="font-bold">{String.fromCharCode(65 + idx)}.</span>
                        <span>{opt}</span>
                        {questionData.correctAnswer === idx && (
                          <span className="ml-auto text-green-600 text-xs font-bold">✓ Đúng</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {questionData.explanation && (
                  <div className="pt-2 text-xs text-slate-500 italic border-t border-slate-200/80">
                    <strong>Giải thích:</strong> {questionData.explanation}
                  </div>
                )}
              </div>

              {/* Teacher Instructions for AI */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Ghi chú yêu cầu cho AI (Tùy chọn):
                </label>
                <textarea
                  value={aiNote}
                  onChange={(e) => setAiNote(e.target.value)}
                  placeholder="Ví dụ: Bỏ từ 'to be' bị thừa trong đề bài, hoặc sinh câu khác về cấu trúc pretend / to-infinitive..."
                  rows={2}
                  className="w-full p-3 text-sm rounded-xl border-2 border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                />

                {/* Quick chip suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-400">Gợi ý nhanh:</span>
                  {[
                    'Sửa lỗi thừa từ / lặp từ ở ô trống',
                    'Đổi câu ví dụ mới cùng chủ điểm ngữ pháp',
                    'Đổi các phương án nhiễu dễ hiểu hơn',
                    'Viết lại lời giải thích chi tiết hơn'
                  ].map((chip, cIdx) => (
                    <button
                      key={cIdx}
                      type="button"
                      onClick={() => handleQuickChip(chip)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 text-[11px] font-semibold transition-all border border-slate-200 cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button: AI Regenerate */}
              <div>
                <button
                  type="button"
                  onClick={handleAiRegenerate}
                  disabled={isAiGenerating}
                  className="w-full py-3.5 bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-700 hover:to-emerald-700 text-white rounded-2xl font-black text-sm sm:text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  {isAiGenerating ? (
                    <>
                      <span className="animate-spin text-lg">⏳</span>
                      <span>AI đang suy luận & sửa câu hỏi...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">🚀</span>
                      <span>AI Phân Tích & Sửa Ngay (Gemini)</span>
                    </>
                  )}
                </button>
              </div>

              {aiError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-200">
                  ⚠️ {aiError}
                </div>
              )}

              {/* AI Generated Result Preview */}
              {aiGeneratedResult && (
                <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-2xl border-2 border-emerald-300 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                      <span>✨</span> Kết quả AI đã sửa chuẩn:
                    </span>
                    <span className="text-xs text-emerald-800 font-bold">
                      Kiểm tra trước khi áp dụng
                    </span>
                  </div>

                  <p className="text-base sm:text-lg font-black text-slate-800 break-words">
                    {aiGeneratedResult.question || aiGeneratedResult.statement || aiGeneratedResult.correctSentence || aiGeneratedResult.word || aiGeneratedResult.audioText}
                  </p>

                  {Array.isArray(aiGeneratedResult.options) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {aiGeneratedResult.options.map((opt: string, oIdx: number) => (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded-xl text-xs font-semibold border flex items-center gap-2 ${
                            aiGeneratedResult.correctAnswer === oIdx
                              ? 'bg-emerald-100 border-emerald-400 text-emerald-900 font-black shadow-sm'
                              : 'bg-white border-emerald-200 text-slate-700'
                          }`}
                        >
                          <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                          <span>{opt}</span>
                          {aiGeneratedResult.correctAnswer === oIdx && (
                            <span className="ml-auto text-emerald-700 font-bold">✓ Đáp án đúng</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiGeneratedResult.explanation && (
                    <div className="p-3 bg-white/80 rounded-xl border border-emerald-200 text-xs text-slate-700 leading-relaxed">
                      <strong className="text-emerald-800">💡 Giải thích:</strong> {aiGeneratedResult.explanation}
                    </div>
                  )}

                  {/* Buttons to Apply or tweak */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-emerald-200">
                    <button
                      type="button"
                      onClick={handleTransferToManual}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 transition-colors cursor-pointer"
                    >
                      ✏️ Tinh chỉnh thêm bằng tay
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyAiResult}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>✅</span> Áp Dụng Câu Mới Này
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: MANUAL EDITING */}
          {activeTab === 'manual' && (
            <form onSubmit={handleSaveManual} className="space-y-4">
              
              {/* Question Text Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Nội dung câu hỏi (Đề bài):
                  </label>
                  {(questionType === 'multipleChoice' || questionType === 'fillBlank' || questionType === 'readingFill') && (
                    <button
                      type="button"
                      onClick={() => setManualQuestion(prev => prev + ' ______ ')}
                      className="text-[11px] text-brand-600 font-bold hover:underline cursor-pointer"
                    >
                      + Chèn ô trống "______"
                    </button>
                  )}
                </div>
                <textarea
                  value={manualQuestion}
                  onChange={(e) => setManualQuestion(e.target.value)}
                  required
                  rows={3}
                  className="w-full p-3 text-sm font-semibold rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                  placeholder="Nhập nội dung câu hỏi..."
                />
              </div>

              {/* Options for ABCD / Multiple Choice / Reading MC / Pronunciation / Vocab */}
              {(questionType === 'multipleChoice' || questionType === 'readingMC' || questionType === 'pronunciation' || questionType === 'vocabTranslation') && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    4 Phương án trả lời (Bấm nút tròn để chọn đáp án đúng):
                  </label>
                  <div className="space-y-2">
                    {manualOptions.map((opt, i) => (
                      <div
                        key={i}
                        onClick={() => setManualCorrectAnswer(i)}
                        className={`p-2.5 rounded-xl border-2 flex items-center gap-3 transition-all cursor-pointer ${
                          manualCorrectAnswer === i
                            ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="correctAnswer"
                            checked={manualCorrectAnswer === i}
                            onChange={() => setManualCorrectAnswer(i)}
                            className="w-4 h-4 text-emerald-600 cursor-pointer"
                          />
                          <span className="font-black text-sm text-slate-700">
                            {String.fromCharCode(65 + i)}.
                          </span>
                        </div>
                        <input
                          type="text"
                          value={opt}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const next = [...manualOptions];
                            next[i] = e.target.value;
                            setManualOptions(next);
                          }}
                          required
                          placeholder={`Nội dung phương án ${String.fromCharCode(65 + i)}...`}
                          className="flex-1 p-2 text-sm font-medium rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                        />
                        {manualCorrectAnswer === i && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                            ✓ Đúng
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scramble Question Specifics */}
              {questionType === 'scramble' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Câu hoàn chỉnh chính xác (Tiếng Anh):
                    </label>
                    <input
                      type="text"
                      value={manualCorrectSentence}
                      onChange={(e) => setManualCorrectSentence(e.target.value)}
                      required
                      placeholder="Ví dụ: Children often pretend to be superheroes."
                      className="w-full p-3 text-sm font-semibold rounded-xl border-2 border-slate-200 focus:border-amber-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Dịch nghĩa tiếng Việt:
                    </label>
                    <input
                      type="text"
                      value={manualTranslation}
                      onChange={(e) => setManualTranslation(e.target.value)}
                      placeholder="Ví dụ: Trẻ em thường giả vờ làm siêu anh hùng."
                      className="w-full p-3 text-sm rounded-xl border-2 border-slate-200 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* True/False Question Specifics */}
              {questionType === 'trueFalse' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Đáp án đúng:
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setManualIsTrue(true)}
                      className={`flex-1 py-3 rounded-xl font-black text-sm border-2 transition-all cursor-pointer ${
                        manualIsTrue
                          ? 'bg-green-100 border-green-500 text-green-800 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      ✓ TRUE (Đúng)
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualIsTrue(false)}
                      className={`flex-1 py-3 rounded-xl font-black text-sm border-2 transition-all cursor-pointer ${
                        !manualIsTrue
                          ? 'bg-rose-100 border-rose-500 text-rose-800 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      ✗ FALSE (Sai)
                    </button>
                  </div>
                </div>
              )}

              {/* Fill Blank or Listening specific: missing word */}
              {(questionType === 'fillBlank' || questionType === 'readingFill' || questionType === 'listening') && (
                <div className="space-y-3">
                  {questionType === 'listening' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Câu hiển thị cho học sinh (Có ô trống ______):
                      </label>
                      <input
                        type="text"
                        value={manualSentenceWithBlank}
                        onChange={(e) => setManualSentenceWithBlank(e.target.value)}
                        placeholder="Ví dụ: Children often pretend ______ superheroes."
                        className="w-full p-3 text-sm font-semibold rounded-xl border-2 border-slate-200 focus:border-amber-500 outline-none"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Từ đúng cần điền vào ô trống:
                    </label>
                    <input
                      type="text"
                      value={manualFillCorrect}
                      onChange={(e) => setManualFillCorrect(e.target.value)}
                      required
                      placeholder="Ví dụ: to be"
                      className="w-full p-3 text-sm font-bold text-emerald-700 rounded-xl border-2 border-slate-200 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Pronunciation Target Sound */}
              {questionType === 'pronunciation' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Âm xét phát âm (Ví dụ: Âm /s/ - /z/, Nguyên âm /e/...):
                  </label>
                  <input
                    type="text"
                    value={manualTargetSound}
                    onChange={(e) => setManualTargetSound(e.target.value)}
                    placeholder="Ví dụ: Âm /e/ và /i:/"
                    className="w-full p-2.5 text-sm rounded-xl border-2 border-slate-200 focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              {/* Explanation Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Lời giải thích chi tiết (Tiếng Việt):
                </label>
                <textarea
                  value={manualExplanation}
                  onChange={(e) => setManualExplanation(e.target.value)}
                  rows={3}
                  className="w-full p-3 text-sm rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                  placeholder="Nhập lời giải thích rõ ràng cho học sinh..."
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-2xl font-black text-sm sm:text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <span>💾</span> Lưu Thay Đổi & Cập Nhật Vào Đề
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <span>
            💡 Sau khi lưu, câu hỏi sẽ được làm mới để cô làm thử lại ngay lập tức.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 font-bold transition-colors cursor-pointer"
          >
            Hủy
          </button>
        </div>

      </div>
    </div>
  );
};
