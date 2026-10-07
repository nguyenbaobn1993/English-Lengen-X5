
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { LessonPlan, MindMapData, MindMapMode, PresentationScript, ContentResult, CharacterProfile, AppMode, ImageRatio, SpeechEvaluation, AiProvider, PreservedExam, ExamQuestion, ExamSection, ExamQuestionType } from "../types";
import { ensureCompletePracticeContent } from "../utils/practiceBuilder";
import { validateAndSanitizeLessonPlan } from "../utils/contentValidator";
import { isDemoMode } from "./demoBoot";

export { ensureCompletePracticeContent, validateAndSanitizeLessonPlan };

// ===== API KEY & PROVIDER MANAGEMENT (api.md standard) =====
export const GOOGLE_AI_API_KEY_PATTERN = /^(?:AIzaSy|AQ)\S{8,}$/;

export const isValidGoogleAiApiKey = (key: string): boolean => {
  return GOOGLE_AI_API_KEY_PATTERN.test((key || '').trim());
};

const GEMINI_KEY_STORAGE = 'gemini_api_key';
const AGENT_PLATFORM_KEY_STORAGE = 'agent_platform_api_key';
const PROVIDER_STORAGE = 'google_ai_provider';
const PROVIDER_SOURCE_STORAGE = 'google_ai_provider_selection_source';
const MODEL_STORAGE = 'mrs_dung_selected_model';
const LEGACY_KEY_STORAGE = 'mrs_dung_api_key'; // For backward compatibility

// AI của trung tâm: khi máy này không nhập key riêng (bản thật lẫn bản demo), mọi yêu cầu Gemini đi qua
// trạm trung chuyển /api/gemini (key của trung tâm nằm trên máy chủ Vercel, không bao giờ xuống trình duyệt)
export const DEMO_PROXY_KEY = 'demo-proxy';
export const isDemoProxyKey = (key?: string | null) => key === DEMO_PROXY_KEY;
const demoProxyBaseUrl = () => `${window.location.origin}/api/gemini`;

// Provider helpers
export const getAiProvider = (): AiProvider => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PROVIDER_STORAGE) as AiProvider;
    if (saved === 'gemini' || saved === 'agent-platform') return saved;
  }
  return 'gemini';
};

export const setAiProvider = (provider: AiProvider): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PROVIDER_STORAGE, provider);
    localStorage.setItem(PROVIDER_SOURCE_STORAGE, 'manual');
  }
};

// API Key getters/setters per provider
export const getApiKeyForProvider = (provider: AiProvider): string => {
  if (typeof window === 'undefined') return '';
  if (provider === 'agent-platform') {
    return localStorage.getItem(AGENT_PLATFORM_KEY_STORAGE) || '';
  }
  // Gemini API: check specific key first, fallback to legacy key if present
  const geminiKey = localStorage.getItem(GEMINI_KEY_STORAGE);
  if (geminiKey) return geminiKey;
  const legacyKey = localStorage.getItem(LEGACY_KEY_STORAGE);
  if (legacyKey) {
    localStorage.setItem(GEMINI_KEY_STORAGE, legacyKey);
    return legacyKey;
  }
  return DEMO_PROXY_KEY;
};

export const setApiKeyForProvider = (provider: AiProvider, key: string): void => {
  if (typeof window === 'undefined') return;
  const cleanKey = key.trim();
  if (provider === 'agent-platform') {
    localStorage.setItem(AGENT_PLATFORM_KEY_STORAGE, cleanKey);
  } else {
    localStorage.setItem(GEMINI_KEY_STORAGE, cleanKey);
    localStorage.setItem(LEGACY_KEY_STORAGE, cleanKey); // backward compat
  }
};

export const getApiKey = (): string | null => {
  const currentProvider = getAiProvider();
  const key = getApiKeyForProvider(currentProvider);
  return key || null;
};

export const setApiKey = (key: string): void => {
  const currentProvider = getAiProvider();
  setApiKeyForProvider(currentProvider, key);
};

export const hasApiKey = (): boolean => {
  return !!getApiKey();
};

// ===== MODEL SPECIFICATION (api.md standard) =====
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
  provider: AiProvider;
}

export const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', description: 'Mặc định: Thế hệ mới nhất, suy luận logic và chất lượng giáo án vượt trội', isDefault: true, provider: 'gemini' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: 'Dự phòng chất lượng cao, mạnh mẽ và ổn định', provider: 'gemini' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', description: 'Tốc độ siêu nhanh, tiết kiệm token, trích xuất dữ liệu tốt', provider: 'gemini' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: 'Tương thích ngược ổn định', provider: 'gemini' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Bản 2.5 ổn định, dự phòng cuối chuỗi', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Suy luận chuyên sâu cao cấp cho bài tập phức tạp', provider: 'gemini' },
];

export const AGENT_PLATFORM_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Mặc định Agent Platform: Tốc độ cao, tối ưu chi phí', isDefault: true, provider: 'agent-platform' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Bản nhẹ, phản hồi nhanh', provider: 'agent-platform' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Suy luận mạnh mẽ, viết giáo án chi tiết', provider: 'agent-platform' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', description: 'Bản preview suy luận cao cấp', provider: 'agent-platform' },
];

export const AVAILABLE_MODELS = GEMINI_MODELS; // Keep for backward compat

export const getModelsForProvider = (provider: AiProvider): ModelInfo[] => {
  return provider === 'agent-platform' ? AGENT_PLATFORM_MODELS : GEMINI_MODELS;
};

export const getSelectedModel = (): string => {
  if (typeof window !== 'undefined') {
    const provider = getAiProvider();
    const saved = localStorage.getItem(`${MODEL_STORAGE}_${provider}`) || localStorage.getItem(MODEL_STORAGE);
    const available = getModelsForProvider(provider);
    const discovered = getCachedAvailableModels(provider);
    if (saved && (available.some(m => m.id === saved) || discovered?.includes(saved))) {
      return saved;
    }
    if (discovered && discovered.length) return discovered[0];
    const defaultModel = available.find(m => m.isDefault)?.id || available[0].id;
    return defaultModel;
  }
  return 'gemini-3.6-flash';
};

export const setSelectedModel = (modelId: string): void => {
  if (typeof window !== 'undefined') {
    const provider = getAiProvider();
    localStorage.setItem(`${MODEL_STORAGE}_${provider}`, modelId);
    localStorage.setItem(MODEL_STORAGE, modelId);
  }
};

// ===== TỰ DÒ MODEL KHẢ DỤNG THEO API KEY =====
// Tên model Gemini thay đổi theo thời gian (model mới ra, model cũ ngừng). Thay vì đoán tên cố định,
// app hỏi thẳng Google danh sách model mà key này gọi được, rồi chỉ dùng các model đó.
const AVAILABLE_MODELS_CACHE = 'lx5_gemini_available_models';

interface AvailableModelsCache { keyTail: string; ids: string[]; checkedAt: number }

const keyTail = (key: string) => (key || '').trim().slice(-6);

/** Model dùng được cho việc tạo nội dung chữ (bỏ model ảnh, giọng nói, embedding, live...) */
const isTextGenerationModel = (id: string) =>
  /^gemini-/.test(id) && !/(tts|image|embedding|live|audio|native|vision|aqa|robotics|computer-use|transcribe|omni|nano-banana|customtools|exp-\d)/.test(id);

/** Điểm xếp hạng: phiên bản mới hơn trước, flash > flash-lite > pro (nhanh & có hạn mức miễn phí rộng hơn) */
const modelRank = (id: string) => {
  // Bí danh luôn trỏ tới bản ổn định mới nhất (vd gemini-flash-latest)
  if (/^gemini-flash-latest$/.test(id)) return 26.9;
  if (/^gemini-flash-lite-latest$/.test(id)) return 25.9;
  if (/^gemini-pro-latest$/.test(id)) return 20;
  const ver = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  // pro thường không có / rất ít lượt miễn phí → xếp sau flash của bản trước
  const tier = /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 2 : /pro/.test(id) ? -6 : -9;
  const stable = /preview|exp/.test(id) ? 0 : 0.05;
  return ver * 10 + tier + stable;
};

export const rankAvailableModels = (ids: string[]) =>
  [...new Set(ids.filter(isTextGenerationModel))].sort((a, b) => modelRank(b) - modelRank(a));

export const getCachedAvailableModels = (provider: AiProvider = getAiProvider(), forKey?: string): string[] | null => {
  if (provider !== 'gemini' || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AVAILABLE_MODELS_CACHE);
    if (!raw) return null;
    const c = JSON.parse(raw) as AvailableModelsCache;
    if (c.keyTail !== keyTail(forKey ?? getApiKeyForProvider('gemini'))) return null;
    return Array.isArray(c.ids) && c.ids.length ? c.ids : null;
  } catch {
    return null;
  }
};

/** Hỏi Google danh sách model mà API key gọi được (Gemini API / AI Studio key) */
export const fetchAvailableModels = async (apiKey: string): Promise<{ ok: boolean; ids: string[]; error?: string }> => {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, ids: [], error: 'Chưa nhập API key.' };
  try {
    const ids: string[] = [];
    let pageToken = '';
    for (let page = 0; page < 5; page++) {
      const viaProxy = isDemoProxyKey(key);
      const url = viaProxy
        ? `${demoProxyBaseUrl()}/v1beta/models`
        : `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res = await fetch(url, viaProxy ? {} : { headers: { 'x-goog-api-key': key } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        return { ok: false, ids: [], error: parseApiError({ message: `${res.status} ${data?.error?.status || ''} ${msg}` }).message + ` (${msg})` };
      }
      (data.models || []).forEach((m: any) => {
        const methods: string[] = m.supportedGenerationMethods || [];
        if (methods.includes('generateContent')) ids.push(String(m.name || '').replace(/^models\//, ''));
      });
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    const ranked = rankAvailableModels(ids);
    try {
      localStorage.setItem(AVAILABLE_MODELS_CACHE, JSON.stringify({ keyTail: keyTail(key), ids: ranked, checkedAt: Date.now() }));
    } catch {}
    return { ok: true, ids: ranked };
  } catch (e: any) {
    return { ok: false, ids: [], error: `Không kết nối được tới Google: ${e?.message || e}` };
  }
};

/** Gọi thử 1 câu rất ngắn để chắc chắn key + model tạo được nội dung */
export const testGenerateWithModel = async (apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const client = createGoogleAiClient(apiKey.trim(), 'gemini');
    const r = await client.models.generateContent({ model, contents: 'Reply with exactly: OK' });
    return { ok: !!(r.text || '').trim() };
  } catch (e: any) {
    const parsed = parseApiError(e);
    return { ok: false, error: `${parsed.message} (${String(e?.message || e).slice(0, 160)})` };
  }
};

// Client factory strictly following api.md
export const createGoogleAiClient = (
  apiKey: string,
  provider: AiProvider = getAiProvider()
): GoogleGenAI => {
  if (isDemoProxyKey(apiKey)) {
    return new GoogleGenAI({ apiKey, httpOptions: { baseUrl: demoProxyBaseUrl() } });
  }
  if (provider === 'agent-platform') {
    // Flag for Agent Platform endpoint aiplatform.googleapis.com
    return new GoogleGenAI({ vertexai: true, apiKey });
  }
  return new GoogleGenAI({ apiKey });
};

const getAI = () => {
  const provider = getAiProvider();
  const apiKey = getApiKeyForProvider(provider);
  if (!apiKey) {
    throw new Error('API_KEY_REQUIRED: Vui lòng cấu hình API Key trước khi sử dụng tính năng này.');
  }
  return createGoogleAiClient(apiKey, provider);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type ApiErrorType =
  | 'MODEL_OVERLOADED'    // 500, 503, 504, overloaded, high demand, NOT_FOUND
  | 'QUOTA_EXCEEDED'      // 429, RESOURCE_EXHAUSTED
  | 'API_KEY_INVALID'     // 401
  | 'PERMISSION_DENIED'   // 403
  | 'INVALID_ARGUMENT'    // 400
  | 'UNKNOWN';

export const parseApiError = (error: any): { type: ApiErrorType; message: string } => {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error)) || '';
  const lower = msg.toLowerCase();

  // Thông báo riêng của trạm trung chuyển bản demo → hiện nguyên văn
  const demoMsg = msg.match(/(?:Bản demo|AI của trung tâm)[^"}\\]*/);
  if (demoMsg) {
    return { type: msg.includes('RESOURCE_EXHAUSTED') ? 'QUOTA_EXCEEDED' : 'PERMISSION_DENIED', message: demoMsg[0].trim() };
  }

  if (
    lower.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return {
      type: 'QUOTA_EXCEEDED',
      message: 'Đã hết quota hoặc vượt giới hạn tốc độ API. Vui lòng đợi một lát rồi thử lại.'
    };
  }

  if (lower.includes('401') || msg.includes('API_KEY_INVALID') || lower.includes('key invalid') || lower.includes('api key not valid') || lower.includes('api key expired')) {
    return {
      type: 'API_KEY_INVALID',
      message: 'API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại trong Cài đặt.'
    };
  }

  if (lower.includes('403') || msg.includes('PERMISSION_DENIED')) {
    const provider = getAiProvider();
    if (provider === 'agent-platform') {
      return {
        type: 'PERMISSION_DENIED',
        message: 'Google đã nhận key nhưng dự án/key chưa được cấp quyền gọi Agent Platform API hoặc model này. Vui lòng kiểm tra Agent Platform API đã bật, billing và API restrictions.'
      };
    }
    return {
      type: 'PERMISSION_DENIED',
      message: 'API key không có quyền truy cập Gemini API hoặc tính năng này.'
    };
  }

  if (
    lower.includes('500') ||
    lower.includes('503') ||
    lower.includes('504') ||
    msg.includes('UNAVAILABLE') ||
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('try again later') ||
    lower.includes('404') ||
    msg.includes('NOT_FOUND')
  ) {
    return {
      type: 'MODEL_OVERLOADED',
      message: 'Model đang quá tải hoặc tạm thời không khả dụng; app đang tự động thử model dự phòng.'
    };
  }

  if (lower.includes('400') || msg.includes('INVALID_ARGUMENT')) {
    return {
      type: 'INVALID_ARGUMENT',
      message: `Tham số yêu cầu không hợp lệ: ${msg}`
    };
  }

  return {
    type: 'UNKNOWN',
    message: msg || 'Lỗi không xác định'
  };
};

export interface FallbackNotice {
  fromModel: string;
  toModel: string;
  reason: string;
}

// Retry with model fallback strictly following api.md Section II
export const callWithFallback = async <T>(
  fn: (model: string, client: GoogleGenAI) => Promise<T>,
  onFallbackNotice?: (notice: FallbackNotice) => void,
  overrideKey?: string
): Promise<T> => {
  const provider = overrideKey ? 'gemini' : getAiProvider();
  const apiKey = overrideKey || getApiKeyForProvider(provider);
  if (!apiKey) {
    throw new Error('Vui lòng cấu hình API Key trước khi sử dụng tính năng này.');
  }

  const ai = createGoogleAiClient(apiKey, provider);
  const selectedModel = getSelectedModel();

  // Ordered fallback models based on provider as per api.md
  const defaultChain = provider === 'agent-platform'
    ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    : ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

  // AI của trung tâm: hỏi trước danh sách model mà key của trung tâm gọi được
  if (isDemoProxyKey(apiKey) && !getCachedAvailableModels(provider, apiKey)) {
    await fetchAvailableModels(apiKey);
  }
  // Nếu đã dò được danh sách model mà key gọi được → chỉ dùng các model đó (model chọn trước, rồi theo xếp hạng)
  const available = getCachedAvailableModels(provider, apiKey);
  const orderedModels = available
    ? Array.from(new Set([...(available.includes(selectedModel) ? [selectedModel] : []), ...available])).slice(0, 6)
    : Array.from(new Set([selectedModel, ...defaultChain]));
  const errorDetails: string[] = [];

  for (let i = 0; i < orderedModels.length; i++) {
    const currentModel = orderedModels[i];
    try {
      return await fn(currentModel, ai);
    } catch (err: any) {
      const parsed = parseApiError(err);
      errorDetails.push(`[${currentModel}]: ${parsed.type} - ${parsed.message}`);

      // Key riêng của máy này sai / không có quyền → tự chuyển sang AI của trung tâm
      if ((parsed.type === 'API_KEY_INVALID' || parsed.type === 'PERMISSION_DENIED') && !isDemoProxyKey(apiKey) && provider === 'gemini') {
        if (onFallbackNotice) {
          onFallbackNotice({
            fromModel: 'API key trên máy này',
            toModel: 'AI của trung tâm',
            reason: 'API key nhập trong Cài đặt của máy này không hợp lệ hoặc không có quyền — đã dùng AI của trung tâm. Xóa key sai trong Cài đặt để không thấy lại thông báo này.'
          });
        }
        return callWithFallback(fn, onFallbackNotice, DEMO_PROXY_KEY);
      }
      // Key sai → dừng ngay (đổi model cũng không giúp được)
      if (parsed.type === 'API_KEY_INVALID') {
        throw new Error(parsed.message);
      }
      // Hết hạn mức / tham số không hợp lệ: mỗi model có hạn mức & tính năng riêng → thử model kế tiếp,
      // chỉ báo lỗi khi đã là model cuối cùng
      if ((parsed.type === 'QUOTA_EXCEEDED' || parsed.type === 'INVALID_ARGUMENT') && i === orderedModels.length - 1) {
        throw new Error(parsed.message);
      }

      // Stop on permission error if Gemini API
      if (parsed.type === 'PERMISSION_DENIED' && provider !== 'agent-platform') {
        throw new Error(parsed.message);
      }

      // Fallback to next model if available
      if (i < orderedModels.length - 1) {
        const nextModel = orderedModels[i + 1];
        console.warn(`[Fallback] Model ${currentModel} gặp lỗi (${parsed.type}), thử model tiếp theo ${nextModel}...`);
        if (onFallbackNotice) {
          onFallbackNotice({ fromModel: currentModel, toModel: nextModel, reason: parsed.message });
        }
        await delay(1200);
      }
    }
  }

  // All models failed
  throw new Error(`ALL_MODELS_FAILED|${errorDetails.join(' || ')}`);
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

// ===== TTS SYSTEM: Mobile-First with IMMEDIATE Playback =====
// Uses Web Speech API with SYNCHRONOUS speak() for mobile compatibility
// Unified standard: British English Female Voice (Giọng nữ ngữ điệu chuẩn Anh - Anh en-GB)

let currentUtterance: SpeechSynthesisUtterance | null = null;
let cachedVoice: SpeechSynthesisVoice | null = null;
let ttsInitialized = false;

// Get voices SYNCHRONOUSLY - do not await
export const getVoicesSync = (): SpeechSynthesisVoice[] => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
};

/**
 * Detect & select the best British English Female voice (Giọng nữ chuẩn Anh - Anh)
 * Priorities:
 * 1. Google UK English Female (Chrome on PC, Mac, Chromebook, Android)
 * 2. Microsoft Natural Online UK Female voices (Edge/Windows 10/11) - Libby, Sonia
 * 3. Microsoft Desktop UK Female voices (Hazel, Susan built into Windows)
 * 4. Apple UK Female voices (Safari on iPhone, iPad, Mac) - Stephanie, Martha, Serena, Kate
 * 5. Any British voice explicitly marked female or with female name
 * 6. Any British voice (en-GB) that is NOT male
 * 7. Any British voice (en-GB)
 * 8. Fallback: Any English voice with female name or female tag
 * 9. Fallback: Any English voice that is not male
 * 10. Fallback: Any English voice
 */
// Strict Male keyword list to ban (including iOS Daniel, Arthur, Oliver, George, Android voices)
const STRICT_MALE_KEYWORDS = [
  'male', 'daniel', 'arthur', 'oliver', 'george', 'david', 'mark', 'guy',
  'brian', 'ryan', 'alfie', 'charles', 'james', 'william', 'harry', 'jack',
  'thomas', 'aaron', 'gordon', 'peter', 'paul', 'john', 'alex', 'edward',
  'richard', 'michael', 'en-gb-x-gbb', 'en-gb-x-gbd', 'en-gb-x-rjs',
  'en-gb-language', 'en-gb-default'
];

// Strict Female keyword list to prioritize (Libby, Sonia, Hazel, Susan, Stephanie, Martha, Serena, Kate, etc.)
const STRICT_FEMALE_KEYWORDS = [
  'female', 'libby', 'sonia', 'hazel', 'susan', 'stephanie', 'martha',
  'serena', 'kate', 'victoria', 'alice', 'emma', 'charlotte', 'fiona',
  'rachel', 'amy', 'en-gb-x-gba', 'en-gb-x-gbc', 'en-gb-x-gbe', 'en-gb-x-gbf',
  'en_gb_female'
];

let currentAudioElement: HTMLAudioElement | null = null;
let currentAudioSessionId = 0;

/**
 * High-fidelity British English Female Cloud Audio Player
 * Synchronized across all devices (iOS, Android, Windows, Mac) so every user hears the exact same voice.
 */
/**
 * Helper to play a single audio URL with no-referrer policy
 */
const playSingleAudioUrl = (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      audio.referrerPolicy = 'no-referrer';
      audio.preload = 'auto';
      audio.src = url;
      currentAudioElement = audio;

      let hasEnded = false;
      const done = (success: boolean) => {
        if (!hasEnded) {
          hasEnded = true;
          if (currentAudioElement === audio) {
            currentAudioElement = null;
          }
          resolve(success);
        }
      };

      audio.onended = () => done(true);
      audio.onerror = () => done(false);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => done(false));
      }

      // Safety watchdog: 12 seconds max for short audio
      setTimeout(() => {
        if (!hasEnded && currentAudioElement === audio) {
          done(false);
        }
      }, 12000);
    } catch {
      resolve(false);
    }
  });
};

/**
 * High-fidelity British English Female Cloud Audio Player
 * Synchronized across all devices (iOS, Android, Windows, Mac, Zalo WebView)
 * Multi-source pipeline: Youdao UK English (no CORS/Referer block) + Google TTS (no-referrer)
 */
export const playCloudBritishFemaleAudio = async (text: string): Promise<boolean> => {
  try {
    if (currentAudioElement) {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
      currentAudioElement = null;
    }
    const clean = text.trim().slice(0, 250);
    if (!clean) {
      return true;
    }

    // Pipeline prioritization:
    // 1. For words and short phrases (<= 4 words, <= 50 chars): Youdao UK Voice is lightning fast & 100% reliable inside Zalo WebView
    // 2. For sentences: Google Translate TTS (with no-referrer meta policy)
    const urls: string[] = [];
    const wordCount = clean.split(/\s+/).length;
    if (wordCount <= 4 && clean.length <= 50) {
      urls.push(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=1`);
      urls.push(`https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(clean)}`);
    } else {
      urls.push(`https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(clean)}`);
      if (clean.length <= 70) {
        urls.push(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=1`);
      }
    }

    for (const url of urls) {
      const success = await playSingleAudioUrl(url);
      if (success) return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const playAudioFallback = playCloudBritishFemaleAudio;

/**
 * Detect & select the best British English Female voice (Giọng nữ chuẩn Anh - Anh)
 * Strictly excludes all male voices.
 */
export const getBestBritishFemaleVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  if (!voices || voices.length === 0) return null;

  const isBritishLang = (v: SpeechSynthesisVoice) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    return lang === 'en-gb' || lang.startsWith('en-gb');
  };

  const isBritishName = (v: SpeechSynthesisVoice) => {
    const name = (v.name || '').toLowerCase();
    return name.includes('uk') || name.includes('united kingdom') || name.includes('great britain') || name.includes('british') || name.includes('england');
  };

  const isBritish = (v: SpeechSynthesisVoice) => isBritishLang(v) || isBritishName(v);

  const isMale = (v: SpeechSynthesisVoice) => {
    const name = (v.name || '').toLowerCase();
    return STRICT_MALE_KEYWORDS.some(m => name.includes(m));
  };

  const isFemale = (v: SpeechSynthesisVoice) => {
    const name = (v.name || '').toLowerCase();
    return STRICT_FEMALE_KEYWORDS.some(f => name.includes(f));
  };

  if (cachedVoice && voices.includes(cachedVoice) && !isMale(cachedVoice)) {
    return cachedVoice;
  }

  // Priority order specifically for British English Female Voice:
  const priorities: ((v: SpeechSynthesisVoice) => boolean)[] = [
    // 1. British voice with explicit female name or keyword
    (v) => isBritish(v) && isFemale(v) && !isMale(v),

    // 2. Google / Microsoft / Apple British female voice
    (v) => isBritish(v) && (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('microsoft') || v.name.toLowerCase().includes('apple')) && !isMale(v),

    // 3. Any British voice that is NOT male
    (v) => isBritish(v) && !isMale(v),

    // 4. Any English voice with female name
    (v) => (v.lang || '').toLowerCase().startsWith('en') && isFemale(v) && !isMale(v),

    // 5. Any English voice that is NOT male
    (v) => (v.lang || '').toLowerCase().startsWith('en') && !isMale(v)
  ];

  for (const check of priorities) {
    const voice = voices.find(check);
    if (voice) {
      cachedVoice = voice;
      return voice;
    }
  }

  return null;
};

// Backward compatibility alias
export const getBestVoice = getBestBritishFemaleVoice;

// Pre-load voices in background (non-blocking)
const preloadVoices = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    cachedVoice = null;
    getBestBritishFemaleVoice(voices);
    return;
  }

  window.speechSynthesis.onvoiceschanged = () => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) {
      cachedVoice = null;
      getBestBritishFemaleVoice(v);
    }
  };
};

// Initialize TTS & Unlock Audio - call this on first user interaction (e.g., page touch)
export const initTTSOnUserInteraction = (): void => {
  if (ttsInitialized) return;
  if (typeof window === 'undefined') return;

  ttsInitialized = true;

  // 1. Unlock HTML5 Audio for mobile/Zalo In-App WebView
  try {
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silentAudio.volume = 0.01;
    const p = silentAudio.play();
    if (p !== undefined) {
      p.then(() => {
        silentAudio.pause();
      }).catch(() => {});
    }
  } catch {
    // Ignore warmup errors
  }

  // 2. Unlock SpeechSynthesis if supported by the browser
  if (window.speechSynthesis) {
    try {
      const warmup = new SpeechSynthesisUtterance('');
      warmup.volume = 0;
      warmup.rate = 10;
      window.speechSynthesis.speak(warmup);
      window.speechSynthesis.cancel();
    } catch {
      // Ignore warmup errors
    }
    preloadVoices();
  }
};

// Pre-load voices and unlock audio on first page interaction
if (typeof window !== 'undefined') {
  if (window.speechSynthesis) {
    preloadVoices();
  }

  const initOnInteraction = () => {
    initTTSOnUserInteraction();
    document.removeEventListener('touchstart', initOnInteraction);
    document.removeEventListener('pointerdown', initOnInteraction);
    document.removeEventListener('click', initOnInteraction);
  };
  document.addEventListener('touchstart', initOnInteraction, { passive: true });
  document.addEventListener('pointerdown', initOnInteraction, { passive: true });
  document.addEventListener('click', initOnInteraction, { passive: true });
}

/**
 * Creates a SpeechSynthesisUtterance configured for standard British English female voice
 * - lang: en-GB
 * - rate: 0.88 (ideal pedagogical cadence for Vietnamese students)
 * - pitch: 1.15 (bright, friendly, female intonation)
 */
export const createBritishSpeechUtterance = (text: string, rate = 0.88): SpeechSynthesisUtterance => {
  const cleanText = text.trim().replace(/[^\w\s.,!?'"-]/g, '');
  const utterance = new SpeechSynthesisUtterance(cleanText);

  utterance.lang = 'en-GB';
  utterance.rate = rate;
  utterance.pitch = 1.15;
  utterance.volume = 1.0;

  const voices = getVoicesSync();
  const voice = getBestBritishFemaleVoice(voices);
  if (voice) {
    utterance.voice = voice;
  }

  return utterance;
};

// Split text into readable chunks for streaming playback
const splitIntoAudioChunks = (text: string, maxLen = 180): string[] => {
  const clean = text.trim().replace(/[^\w\s.,!?'"-]/g, ' ');
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.match(/[^.!?\n]+[.!?\n]*/g) || [clean];
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((current + ' ' + trimmed).trim().length <= maxLen) {
      current = (current + ' ' + trimmed).trim();
    } else {
      if (current) chunks.push(current);
      if (trimmed.length > maxLen) {
        const words = trimmed.split(' ');
        let wChunk = '';
        for (const w of words) {
          if ((wChunk + ' ' + w).trim().length <= maxLen) {
            wChunk = (wChunk + ' ' + w).trim();
          } else {
            if (wChunk) chunks.push(wChunk);
            wChunk = w;
          }
        }
        if (wChunk) current = wChunk;
        else current = '';
      } else {
        current = trimmed;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [clean.slice(0, maxLen)];
};

/**
 * Local fallback using device SpeechSynthesis configured for British English Female
 */
export const playLocalBritishSpeechSynthesis = (text: string): Promise<void> => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const utterance = createBritishSpeechUtterance(text, 0.88);
      currentUtterance = utterance;

      let hasResolved = false;
      const finish = () => {
        if (!hasResolved) {
          hasResolved = true;
          currentUtterance = null;
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      }, 35);

      setTimeout(() => {
        if (currentUtterance === utterance && !window.speechSynthesis.speaking) {
          finish();
        }
      }, 12000);
    } catch {
      resolve();
    }
  });
};

/**
 * Main TTS function - 100% UNIFORM ACROSS ALL DEVICES (iPhone, Android, Windows, Mac)
 * Primary: Unified British English Female cloud audio stream (exact same voice everywhere).
 * Fallback: Local device speech synthesis filtered strictly for British female voices.
 */
export const playGeminiTTS = async (text: string): Promise<void> => {
  const cleanText = text.trim().replace(/[^\w\s.,!?'"-]/g, '');
  if (!cleanText) return;

  stopTTS();

  const sessionId = ++currentAudioSessionId;
  const chunks = splitIntoAudioChunks(cleanText);

  for (let i = 0; i < chunks.length; i++) {
    if (currentAudioSessionId !== sessionId) break;
    const chunk = chunks[i];

    // 1. Try unified cloud British English female audio stream
    const success = await playCloudBritishFemaleAudio(chunk);
    if (currentAudioSessionId !== sessionId) break;

    // 2. If cloud audio failed (e.g. offline or network issue), fallback to local device voice
    if (!success) {
      await playLocalBritishSpeechSynthesis(chunk);
    }
    if (currentAudioSessionId !== sessionId) break;
  }
};

export const pauseTTS = () => {
  if (currentAudioElement && !currentAudioElement.paused) {
    currentAudioElement.pause();
  }
  if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
    try {
      window.speechSynthesis.pause();
    } catch {}
  }
};

export const resumeTTS = () => {
  if (currentAudioElement && currentAudioElement.paused) {
    currentAudioElement.play().catch(() => {});
  }
  if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.paused) {
    try {
      window.speechSynthesis.resume();
    } catch {}
  }
};

// Stop any playing audio (both HTML5 Cloud Audio and SpeechSynthesis)
export const stopTTS = () => {
  currentAudioSessionId++;
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.currentTime = 0;
    currentAudioElement = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  currentUtterance = null;
};

// Optional: Gemini TTS for high-quality audio (can be used as enhancement)
export const generateAudioFromContent = async (text: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Aoede' }
        }
      }
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};

export const generateLessonPlan = async (
  topicInput?: string,
  textInput?: string,
  images: string[] = [],
  onProgress?: (stage: 'core' | 'practice') => void,
  onFallbackNotice?: (notice: FallbackNotice) => void
): Promise<LessonPlan> => {
  const imageParts = images.map(data => ({ inlineData: { data, mimeType: 'image/jpeg' } }));

  // ==================== PHASE 1: GENERATE CORE LESSON ====================
  const promptCore = `LEGEND X5 AI - MASTER ENGLISH PEDAGOGY ENGINE.
  TASK: Create a comprehensive core lesson. BE CONCISE, RIGOROUS, AND PEDAGOGICALLY SOUND. Output valid JSON only, no extra text.
  
  ===== 🌟 THE 20 PEDAGOGICAL PRINCIPLES (ZERO-TOLERANCE FOR ERRORS) =====
  PRIORITY: ĐỘ CHÍNH XÁC > CHẤT LƯỢNG CÂU HỎI > ĐỘ PHÙ HỢP TRÌNH ĐỘ > TỐC ĐỘ.

  1. NGUYÊN TẮC TẠO BÀI TẬP (Principle 1):
     - Xác định rõ: Grade / độ tuổi học sinh, CEFR level, Chủ đề, Kỹ năng, Điểm ngữ pháp, Từ vựng mục tiêu, Dạng bài, Độ khó.
     - Tuyệt đối KHÔNG tạo câu hỏi vượt quá trình độ yêu cầu.
     - Nếu có tài liệu nguồn hoặc nội dung bài học do giáo viên cung cấp: BẮT BUỘC ưu tiên bám sát 100% nội dung đó.
     - Không tự thêm kiến thức ngoài phạm vi nếu không cần thiết.

  2. KIỂM TRA NGÔN NGỮ (Principle 2):
     - Đúng ngữ pháp 100%. Từ vựng dùng đúng ngữ cảnh.
     - Chính tả tuyệt đối chính xác (British English spelling as primary: "favourite", "colour", "centre", "travelling").
     - Câu tự nhiên như người bản ngữ, không gượng ép chỉ để kiểm tra ngữ pháp.
     - Phù hợp với học sinh Việt Nam (ngữ cảnh quen thuộc: family, school, friends, hobbies, animals, food, daily routines, clothes, weather, places, transport, festivals, sports, environment, technology).

  3. NGỮ PHÁP CHUẨN XÁC (Principle 6):
     - Kiểm tra kỹ: subject-verb agreement, tenses, auxiliary verbs, articles (a/an/the), prepositions, pronouns, possessives, singular/plural, countable/uncountable, word forms, modal verbs, sentence structure, question forms, negatives.
     - Quy tắc chia động từ ngôi thứ 3 số ít thì Hiện tại đơn:
       * go → goes, watch → watches, fix → fixes, wash → washes, miss → misses
       * study → studies, fly → flies, try → tries
       * play → plays, stay → stays, buy → buys
     - Không tạo đáp án sai do áp dụng máy móc quy tắc.

  4. TỪ VỰNG MỤC TIÊU (Principle 7):
     - Sử dụng từ đúng CEFR, đúng nghĩa, đúng ngữ cảnh, tránh từ quá khó hoặc nghĩa hiếm.
     - Phiên âm IPA chuẩn xác theo từ điển Oxford / Cambridge:
       * "school" = /skuːl/ NOT /ʃuːl/
       * "thought" = /θɔːt/ NOT /tɔːt/
       * "important" = /ɪmˈpɔːtənt/ NOT /ɪmˈpɔːtænt/
     - Tiếng Việt dịch nghĩa phải chính xác, tự nhiên, có dấu tiếng Việt đầy đủ.

  5. BÀI ĐỌC HIỂU (READING ADVENTURE - Principle 8):
     - Đoạn văn phù hợp độ tuổi, mạch lạc, không chứa quá nhiều từ mới lạ ngoài bài.
     - Độ dài phù hợp CEFR:
       * Pre-A1 (Lớp 1-3): 3-5 câu cực kỳ đơn giản (20-40 từ). Ví dụ: "My name is Lan. I am seven years old. I have a cat. My cat is white. I love my cat."
       * A1 (Lớp 4-5): 5-7 câu đơn giản (40-70 từ).
       * A1-A2 (Lớp 6-9): 8-12 câu (80-120 từ).
       * B1 (Lớp 10-12): 100-150 từ.
     - Đọc hiểu: Đúng 5 câu điền từ có ô trống "____". CÂU HỎI PHẢI TRẢ LỜI ĐƯỢC 100% DỰA VÀO ĐOẠN VĂN. Không hỏi kiến thức ngoài bài đọc. Dẫn chứng rõ ràng trích từ bài đọc trong "explanation".

  6. KHI GIÁO VIÊN CUNG CẤP NỘI DUNG (Principle 19):
     - Nếu giáo viên nhập: "Present Continuous - Grade 5":
       * Xác định rõ phạm vi: Form (S + am/is/are + V-ing), Use (hành động đang diễn ra), Signal words (now, right now, at the moment, Look!, Listen!).
       * Không tự ý đưa cấu trúc nâng cao ngoài yêu cầu.
  
  CRITICAL LANGUAGE REQUIREMENTS:
  - GRAMMAR section:
    * "topic": Keep in English (e.g., "Present Simple Tense", "Comparative Adjectives")
    * "explanation": MUST be in VIETNAMESE (giải thích bằng tiếng Việt, sư phạm, dễ hiểu cho lứa tuổi, có dấu tiếng Việt đầy đủ)
    * "examples": Each example MUST include Vietnamese translation in format: "English sentence." → "bản dịch tiếng việt viết thường."
  - VOCABULARY section:
    * Extract EVERY SINGLE vocabulary word from source if provided - DO NOT SKIP ANY
    * "word": English word
    * "ipa": Precise IPA pronunciation
    * "meaning": Vietnamese meaning (lowercase, có dấu tiếng Việt đầy đủ)
    * "example": English example sentence (grammatically perfect, natural)
    * "sentenceMeaning": Vietnamese translation of example
    * "type": "noun", "verb", "adjective", "adverb", "preposition", "conjunction"
    * "emoji": Relevant cute emoji
  - READING ADVENTURE (reading):
    * "title": English title
    * "passage": 100% grammatically correct, natural English matching detected grade level
    * "translation": Accurate Vietnamese translation
    * "comprehension": Exactly 5 questions with "____", "correctAnswer", "options" (4 words), "clueEmoji", and "explanation" citing the exact sentence.
  - TEACHER TIPS (teacherTips):
    * Helpful pedagogical advice in Vietnamese.
  `;


  const coreInputParts: any[] = [];
  if (textInput) coreInputParts.push({ text: `SOURCE TEXT:\n${textInput}` });
  if (topicInput) coreInputParts.push({ text: `TOPIC FOCUS:\n${topicInput}` });
  coreInputParts.push(...imageParts);
  coreInputParts.push({ text: promptCore });

  if (onProgress) onProgress('core');

  const coreResult = await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    console.log(`🤖 [Giai đoạn 1] Đang thử với model: ${modelId}`);
    const response = await client.models.generateContent({
      model: modelId,
      contents: { parts: coreInputParts },
      config: { responseMimeType: "application/json", responseSchema: lessonCoreSchema }
    });
    return safeJsonParse<any>(response.text);
  }, onFallbackNotice);

  // ==================== PHASE 2: GENERATE PRACTICE EXERCISES ====================
  if (onProgress) onProgress('practice');

  const promptPractice = `LEGEND X5 AI - MASTER EXERCISE GENERATOR & PEDAGOGICAL AUDITOR.
  TASK: Create practice exercises based directly on the provided LESSON CORE DATA. BE CONCISE, RIGOROUS, AND 100% PEDAGOGICALLY ACCURATE. Output valid JSON only.

  ===== ⚠️ MANDATORY JSON OUTPUT FORMAT ⚠️ =====
  Your response MUST be a JSON object with this EXACT structure (all exercises must be nested under 'megaTest' except 'listening'):
  {
    "listening": [ ...5 questions... ],
    "megaTest": {
      "multipleChoice": [ ...10 questions... ],
      "scramble": [ ...10 questions... ],
      "readingMCPassage": "Reading passage for reading comprehension multiple-choice questions (60-120 words based on lesson)",
      "readingMC": [ ...5 reading comprehension multiple choice questions ABCD... ],
      "pronunciation": [ ...5 pronunciation/odd-one-out questions ABCD... ],
      "vocabTranslation": [ ...10 questions... ],
      "trueFalsePassage": "A reading passage for true/false based on the lesson",
      "trueFalse": [ ...10 questions... ],
      "matching": [ ...10 pairs... ]
    }
  }

  ===== 🚨 CRITICAL QUALITY PRINCIPLES (LEGEND X5 PEDAGOGICAL STANDARD) 🚨 =====
  PRIORITY: ĐỘ CHÍNH XÁC > CHẤT LƯỢNG CÂU HỎI > ĐỘ PHÙ HỢP TRÌNH ĐỘ > TỐC ĐỘ.

  📌 1. CÂU HỎI TRẮC NGHIỆM (MULTIPLE CHOICE) — SINGLE CHOICE CHỈ 1 ĐÁP ÁN ĐÚNG (Principle 4):
     - Mỗi câu trắc nghiệm BẮT BUỘC CHỈ CÓ DUY NHẤT 1 ĐÁP ÁN ĐÚNG.
     - 3 phương án nhiễu (distractors) phải là các lỗi sai ngữ pháp điển hình học sinh hay mắc (sai thì, sai chia ngôi thứ ba số ít, sai trợ động từ, sai dạng từ), nhưng CHẮC CHẮN SAI 100% trong ngữ cảnh đó.
     - TUYỆT ĐỐI KHÔNG để 2 phương án đồng nghĩa hoặc cùng đúng:
       * KHÔNG ĐƯỢC để cả "is" và "'s" trong cùng mảng options!
       * KHÔNG ĐƯỢC để cả "can't" và "cannot" trong cùng mảng options!
       * KHÔNG ĐƯỢC để cả "playing" và "to play" trong câu "I like ___"!
       * KHÔNG tạo đáp án phụ thuộc vào cách hiểu khác nhau!
       * KHÔNG dùng distractor vô nghĩa!
     - Ví dụ CHUẨN:
       "She ____ to school every day."
       options: ["goes", "go", "going", "went"]
       correctAnswer: 0 (goes)
       explanation: "Chủ ngữ 'She' là ngôi thứ ba số ít, thì Hiện tại đơn động từ 'go' thêm '-es' thành 'goes'."
     - correctAnswer: Index của đáp án đúng duy nhất (0-3).

  📌 2. BÀI TẬP SẮP XẾP TỪ THÀNH CÂU (SCRAMBLE / SENTENCE ORDERING - Principle 11):
     - BẮT BUỘC ĐẢM BẢO CHỈ CÓ MỘT TRẬT TỰ TỰ NHIÊN CHÍNH.
     - CÂU PHẢI TỰ NHIÊN, ĐẦY ĐỦ MẠO TỪ/CHỦ NGỮ (Dùng "The students are very excited.", TUYỆT ĐỐI KHÔNG dùng câu cộc lốc thiếu mạo từ như "Students are very excited.").
     - Tuyệt đối KHÔNG dùng bộ từ có thể tạo ra nhiều câu khác nhau đều đúng:
       * TRÁNH liên từ đẳng lập hoán đổi được (KHÔNG DÙNG "cats and dogs" hay "apples and bananas").
       * TRÁNH trạng từ chỉ thời gian có thể đứng đầu hoặc cuối câu (thay vì "Every day I exercise", hãy dùng "I exercise every morning.").
       * TRÁNH chủ ngữ và tân ngữ có thể tráo đổi tự do (TRÁNH "The boy sees the girl").
     - DẤU CÂU KẾT THÚC (., ?, !) BẮT BUỘC CHỈ GẮN VÀO TỪ CUỐI CÙNG trong mảng scrambled (ví dụ: "excited." chứ TUYỆT ĐỐI KHÔNG gắn vào từ giữa câu như "very.").
     - correctSentence: Câu tiếng Anh chuẩn mực, viết hoa chữ cái đầu, kết thúc bằng đúng 1 dấu câu.
     - scrambled: Mảng các từ của câu đã được xáo trộn. MỌI TỪ Ở GIỮA CÂU KHÔNG CÓ DẤU CHẤM.

  📌 3. BÀI ĐIỀN TỪ & LISTENING (Principle 5):
     - Xác định trước đáp án chuẩn và tất cả biến thể viết tắt hợp lệ (contractions) trong alternativeAnswers:
       * don't ↔ do not, doesn't ↔ does not, didn't ↔ did not
       * isn't ↔ is not, aren't ↔ are not, wasn't ↔ was not, weren't ↔ were not
       * can't ↔ cannot, won't ↔ will not
       * I'm ↔ I am, you're ↔ you are, he's ↔ he is, she's ↔ she is, it's ↔ it is, we're ↔ we are, they're ↔ they are
     - Listening (5 câu):
       * audioText: Câu tiếng Anh hoàn chỉnh, tự nhiên, chuẩn ngữ pháp.
       * sentenceWithBlank: Câu có đúng 1 chỗ trống "______".
       * missingWord: Từ cần điền khớp với chỗ trống.
       * options: 4 lựa chọn (A, B, C, D) với 1 câu đúng duy nhất là audioText.

  📌 4. BÀI ĐỌC HIỂU (READING MC) & TRUE / FALSE (Principle 8 & 9):
     - readingMCPassage (60-120 từ) & trueFalsePassage (40-100 từ): Mạch lạc, đúng trình độ.
     - MỌI CÂU HỎI VÀ PHÁT BIỂU PHẢI CÓ BẰNG CHỨNG XÁC THỰC TRONG BÀI ĐỌC.
     - Không đặt câu hỏi đòi hỏi kiến thức ngoài bài đọc. Không dùng phát biểu mơ hồ, suy đoán.
     - Lời giải (explanation): Trích dẫn nguyên văn câu chứa thông tin làm căn cứ chứng minh.

  📌 5. BÀI NGỮ ÂM (PRONUNCIATION / ODD-ONE-OUT - Principle 6):
     - Tìm từ có phần gạch chân phát âm khác biệt.
     - ĐIỀU KIỆN TIÊN QUYẾT: 'underlinedPart' PHẢI XUẤT HIỆN Ở CẢ 4 TỪ!
       * TUYỆT ĐỐI KHÔNG gạch chân chữ cái khác nhau (CẤM: từ này gạch chân 'u' mà 3 từ kia gạch 'o', ví dụ lỗi sai: truth gạch 'u', còn hope/code/note gạch 'o'). Nếu kiểm tra chữ cái nào, CẢ 4 TỪ BẮT BUỘC PHẢI CHỨA CHỮ CÁI ĐÓ!
     - TỈ LỆ ÂM 3-1 TUYỆT ĐỐI: CHÍNH XÁC 3 từ có cùng 1 âm IPA duy nhất, và ĐÚNG 1 từ có âm khác biệt.
       * CẤM TUYỆT ĐỐI câu chia đôi 2-2 (ví dụ lỗi sai cấm: gift, give [/ɪ/] vs life, child [/aɪ/]; không có từ nào là đáp án duy nhất).
       * CẤM TUYỆT ĐỐI từ có âm thứ ba làm câu có 2 từ khác biệt (ví dụ lỗi sai cấm: lend [/e/], help [/e/], she [/iː/], pretend [/ɪ/]).
     - HÃY ƯU TIÊN CÁC CHỦ ĐIỂM NGỮ ÂM CƠ BẢN THƯỜNG GẶP Ở CẤP TIỂU HỌC / THCS:
       + Đuôi '-ed': /t/ (stopped, looked, watched) vs /d/ (played, cleaned) vs /ɪd/ (wanted, needed, visited)
       + Đuôi '-s/-es': /s/ (books, cats, hats, cups) vs /z/ (pens, dogs, apples) vs /ɪz/ (watches, boxes, classes)
       + Phụ âm 'ch': /tʃ/ (teacher, chair, children, cheap) vs /k/ (school, chemist)
       + Phụ âm 'th': /θ/ (think, thank, thin, tooth) vs /ð/ (this, that, there, mother, brother)
       + Nguyên âm 'oo': /ʊ/ (book, look, foot, cook) vs /uː/ (food, moon, spoon, pool)
       + Nguyên âm 'ea': /iː/ (meat, seat, read, team) vs /e/ (bread, head, heavy, weather)
       + Nguyên âm 'a': /æ/ (cat, hat, bag, map) vs /ɑː/ (father, fast)
       + Nguyên âm 'i': /ɪ/ (sit, big, milk, fish) vs /aɪ/ (like, time, kite, ride, find)
       + Nguyên âm 'u': /ʌ/ (sun, cup, bus, study) vs /juː/ (music) hoặc /ʊ/ (full)
     - targetSound: Ghi rõ tên âm cần kiểm tra (ví dụ: "Phát âm đuôi '-ed'", "Nguyên âm 'ea'", "Phụ âm 'ch'").
     - underlinedPart: Ký tự được gạch chân xuất hiện ở cả 4 từ (ví dụ: "ed", "s", "ch", "th", "oo", "ea", "a", "i", "u").
     - displayOptions: 4 từ với thẻ <u> và </u> bao quanh CHÍNH XÁC 'underlinedPart' (ví dụ: ["play<u>ed</u>", "clean<u>ed</u>", "stay<u>ed</u>", "want<u>ed</u>"]).
     - explanation: BẮT BUỘC ghi rõ phiên âm IPA đầy đủ của cả 4 từ kèm quy tắc phân biệt chi tiết.

  📌 6. TỪ VỰNG DỊCH NGHĨA (VOCAB TRANSLATION - 10 câu - Principle 7):
     - 4 phương án tiếng Việt phân biệt, chỉ 1 nghĩa chính xác, không dùng từ đồng nghĩa gây nhiễu.

  📌 7. NỐI CỘP (MATCHING - 10 cặp - Principle 10):
     - Cặp ghép 1-1 rõ ràng, trái phải không trùng lặp.

  ===== 🔍 GIAO THỨC TỰ KIỂM ĐỊNH 7 TIÊU CHÍ TRƯỚC KHI XUẤT KẾT QUẢ (Principle 17) =====
  Sau khi soạn mỗi câu hỏi, bạn PHẢI tự rà soát độc lập theo 7 tiêu chí:
    A. Câu có đúng ngữ pháp tiếng Anh 100% không?
    B. Có phù hợp đúng trình độ học sinh đã chọn không?
    C. Đáp án đã chọn có chắc chắn đúng 100% không?
    D. Có đáp án thứ hai nào cũng có thể đúng không? (Nếu có → SỬA NGAY).
    E. Câu hỏi có rõ ràng, không mơ hồ không?
    F. Distractors có hợp lý nhưng chắc chắn sai không?
    G. Lời giải thích có đúng và có căn cứ rõ ràng không?
  Nếu bất kỳ câu nào chưa đạt → TỰ SỬA LẠI HOÀN CHỈNH trước khi xuất JSON!

  LESSON CORE DATA:
  ${JSON.stringify({ vocabulary: coreResult.vocabulary, grammar: coreResult.grammar, reading: coreResult.reading })}`;


  let practiceResult: any = null;
  try {
    practiceResult = await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
      console.log(`🤖 [Giai đoạn 2] Đang thử với model: ${modelId}`);
      const response = await client.models.generateContent({
        model: modelId,
        contents: { parts: [{ text: promptPractice }] },
        config: { responseMimeType: "application/json", responseSchema: lessonPracticeSchema }
      });
      return safeJsonParse<any>(response.text);
    }, onFallbackNotice);
  } catch (err: any) {
    console.warn('⚠️ [Giai đoạn 2] AI không thể tạo bài tập từ API, tự động tổng hợp từ dữ liệu bài học:', err);
  }

  // Combine and GUARANTEE 100% complete practice content with fallback synthesis
  const completePractice = ensureCompletePracticeContent(practiceResult, coreResult);

  const rawLessonPlan: LessonPlan = {
    ...coreResult,
    practice: completePractice
  };

  // Pass through Legend X5 Pedagogical Quality Firewall
  return validateAndSanitizeLessonPlan(rawLessonPlan);
};

export const analyzeImageAndCreateContent = async (images: string[], mimeType: string, char: CharacterProfile, mode: AppMode, customPrompt?: string, topic?: string, text?: string): Promise<ContentResult> => {
  const imageParts = images.map(data => ({ inlineData: { data, mimeType } }));
  const prompt = `LEGEND X5 AI - PEDAGOGICALLY RIGOROUS CREATIVE STORYTELLER.
  
  MANDATORY PEDAGOGICAL QUALITY RULES:
  - Language: 100% grammatically correct, natural British English, zero spelling mistakes.
  - Grade/Age Appropriate: Match vocabulary and sentence structure to Vietnamese students.
  - Comprehension Questions: 10 Multiple Choice questions. EACH QUESTION MUST HAVE EXACTLY ONE UNAMBIGUOUS CORRECT ANSWER. Distractors must be clearly wrong based on the story.
  - Writing Prompt: CLEAR TASK with explicit requirements:
    * Clear task description in both English and Vietnamese.
    * Specific word count requirement (e.g., 50-70 words).
    * Guiding bullet points/questions for content (what, where, why, feelings).
    * Target vocabulary/grammar to use.
    * Clear evaluation criteria / rubric.
  
  Analyze the input and create:
  1. An engaging educational story featuring ${char.name}.
  2. EXACTLY 10 Comprehension Quiz questions with 1 unambiguous correct answer and detailed Vietnamese explanation.
  3. EXACTLY 10 Speaking interaction prompts with suggested natural answers.
  4. A structured Writing Task with clear prompts in BOTH English and Vietnamese.
  
  Source material: Topic: ${topic || "N/A"}, Text: ${text || "N/A"}.
  Character context: ${char.promptContext}.`;

  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: { parts: [...imageParts, { text: prompt }] },
      config: { responseMimeType: "application/json", responseSchema: contentResultSchema }
    });
    return safeJsonParse<ContentResult>(response.text);
  });
};

const safeJsonParse = <T>(text: string): T => {
  try {
    let cleanText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = Math.min(cleanText.indexOf('{') === -1 ? Infinity : cleanText.indexOf('{'), cleanText.indexOf('[') === -1 ? Infinity : cleanText.indexOf('['));
    const end = Math.max(cleanText.lastIndexOf('}'), cleanText.lastIndexOf(']'));
    if (start !== Infinity && end !== -1) cleanText = cleanText.substring(start, end + 1);
    return JSON.parse(cleanText) as T;
  } catch (e) { throw new Error("Lỗi xử lý dữ liệu AI."); }
};

const lessonCoreSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    vocabulary: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          emoji: { type: Type.STRING },
          ipa: { type: Type.STRING },
          meaning: { type: Type.STRING },
          example: { type: Type.STRING },
          sentenceMeaning: { type: Type.STRING },
          type: { type: Type.STRING }
        },
        required: ["word", "ipa", "meaning", "example", "type", "emoji"]
      }
    },
    grammar: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING },
        explanation: { type: Type.STRING },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["topic", "explanation", "examples"]
    },
    reading: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        passage: { type: Type.STRING },
        translation: { type: Type.STRING },
        comprehension: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              correctAnswer: { type: Type.STRING },
              alternativeAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              clueEmoji: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "correctAnswer", "explanation"]
          }
        }
      },
      required: ["title", "passage", "translation", "comprehension"]
    },
    teacherTips: { type: Type.STRING }
  },
  required: ["topic", "vocabulary", "grammar", "reading", "teacherTips"]
};

const lessonPracticeSchema = {
  type: Type.OBJECT,
  properties: {
    listening: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          audioText: { type: Type.STRING },
          sentenceWithBlank: { type: Type.STRING },
          missingWord: { type: Type.STRING },
          alternativeAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.INTEGER },
          alternativeCorrectAnswers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          explanation: { type: Type.STRING }
        },
        required: ["id", "audioText", "sentenceWithBlank", "missingWord"]
      }
    },
    megaTest: {
      type: Type.OBJECT,
      properties: {
        multipleChoice: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.INTEGER },
              alternativeCorrectAnswers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "options", "correctAnswer"]
          }
        },
        scramble: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              scrambled: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctSentence: { type: Type.STRING },
              translation: { type: Type.STRING }
            },
            required: ["id", "scrambled", "correctSentence"]
          }
        },
        readingMCPassage: { type: Type.STRING },
        readingMC: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.INTEGER },
              alternativeCorrectAnswers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "options", "correctAnswer"]
          }
        },
        pronunciation: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              targetSound: { type: Type.STRING },
              underlinedPart: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              displayOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.INTEGER },
              alternativeCorrectAnswers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "options", "correctAnswer"]
          }
        },
        fillBlank: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              correctAnswer: { type: Type.STRING },
              alternativeAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
              clueEmoji: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "correctAnswer"]
          }
        },
        vocabTranslation: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              word: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.INTEGER },
              alternativeCorrectAnswers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              explanation: { type: Type.STRING }
            },
            required: ["id", "word", "options", "correctAnswer"]
          }
        },
        trueFalsePassage: { type: Type.STRING },
        trueFalse: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              statement: { type: Type.STRING },
              isTrue: { type: Type.BOOLEAN },
              explanation: { type: Type.STRING }
            },
            required: ["id", "statement", "isTrue", "explanation"]
          }
        },
        matching: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              left: { type: Type.STRING },
              right: { type: Type.STRING }
            },
            required: ["id", "left", "right"]
          }
        }
      },
      required: ["multipleChoice", "scramble", "readingMC", "pronunciation", "vocabTranslation", "trueFalsePassage", "trueFalse", "matching"]
    }
  },
  required: ["listening", "megaTest"]
};


const contentResultSchema = {
  type: Type.OBJECT,
  properties: {
    storyEnglish: { type: Type.STRING },
    translatedText: { type: Type.STRING },
    writingPromptEn: { type: Type.STRING },
    writingPromptVi: { type: Type.STRING },
    vocabulary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { word: { type: Type.STRING }, meaning: { type: Type.STRING }, emoji: { type: Type.STRING } } } },
    imagePrompt: { type: Type.STRING },
    comprehensionQuestions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctAnswer: { type: Type.INTEGER }, explanation: { type: Type.STRING } } } },
    speakingQuestions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, question: { type: Type.STRING }, suggestedAnswer: { type: Type.STRING } } } }
  },
  required: ["storyEnglish", "translatedText", "writingPromptEn", "writingPromptVi", "vocabulary", "imagePrompt", "comprehensionQuestions", "speakingQuestions"]
};

export const generateMindMap = async (content: any, mode: MindMapMode): Promise<MindMapData> => {
  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: `Create a professional Mind Map following Tony Buzan's principles for: ${JSON.stringify(content)}. 
    Structure: Root node is the main topic. Child nodes are key sub-concepts with emojis. 
    Output strictly in JSON format matching the schema.`,
      config: { responseMimeType: "application/json", responseSchema: mindMapSchema }
    });
    return safeJsonParse<MindMapData>(response.text);
  });
};

export const evaluateSpeech = async (base64Audio: string): Promise<SpeechEvaluation> => {
  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: { parts: [{ inlineData: { data: base64Audio, mimeType: 'audio/wav' } }, { text: "Evaluate the student's speaking performance on a scale of 0-10. Provide encouraging feedback in Vietnamese." }] },
      config: { responseMimeType: "application/json", responseSchema: speechEvaluationSchema }
    });
    return safeJsonParse<SpeechEvaluation>(response.text);
  });
};

export const generateStoryImage = async (prompt: string, style: string, ratio: ImageRatio): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `A high-quality educational illustration for kids: ${prompt}. Artistic Style: ${style}. High resolution, 8k, vibrant colors.` }] },
    config: { imageConfig: { aspectRatio: ratio } }
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) { if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`; }
  throw new Error("Image generation failed");
};

export const correctWriting = async (userText: string, creativePrompt: string): Promise<any> => {
  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: `Evaluate and correct this student writing: "${userText}". The topic was: "${creativePrompt}". Provide a score (0-10), feedback, fixed text, and detailed error list.`,
      config: { responseMimeType: "application/json", responseSchema: writingCorrectionSchema }
    });
    return safeJsonParse<any>(response.text);
  });
};

export const generatePresentation = async (data: MindMapData): Promise<PresentationScript> => {
  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: `Create a professional English presentation script for a student based on this Mind Map data: ${JSON.stringify(data)}. 
    Include a warm introduction, body sections for each node, and a polite conclusion. 
    Provide both English script and Vietnamese translation.`,
      config: { responseMimeType: "application/json", responseSchema: presentationSchema }
    });
    return safeJsonParse<PresentationScript>(response.text);
  });
};

export const generateMindMapPrompt = async (content: any, mode: MindMapMode): Promise<string> => {
  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: `TASK: Generate a single, highly detailed English prompt for drawing a professional Tony Buzan Mind Map using AI art tools (like Midjourney or DALL-E). 
    CONTENT SOURCE: ${JSON.stringify(content)}. 
    
    PROMPT SPECIFICATIONS:
    - Style: 3D Organic Tony Buzan Mind Map, Pixar-style animation render.
    - Central Theme: A clear 3D icon representing the lesson topic at the center.
    - Branches: Curvy, organic, thick-to-thin colorful branches spreading outwards.
    - Elements: Floating keywords in English, cute 3D emojis/icons next to branches.
    - Environment: Clean bright studio background, 8k resolution, cinematic lighting, vibrant pedagogical colors.
    - Exclude: No text other than the keywords. 
    
    JUST PROVIDE THE RAW PROMPT STRING.`
    });
    return response.text || '';
  });
};

const mindMapSchema = { type: Type.OBJECT, properties: { center: { type: Type.OBJECT, properties: { title_en: { type: Type.STRING }, title_vi: { type: Type.STRING }, emoji: { type: Type.STRING } } }, nodes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text_en: { type: Type.STRING }, text_vi: { type: Type.STRING }, emoji: { type: Type.STRING } } } } } };
const presentationSchema = { type: Type.OBJECT, properties: { introduction: { type: Type.OBJECT, properties: { english: { type: Type.STRING }, vietnamese: { type: Type.STRING } } }, body: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { keyword: { type: Type.STRING }, script: { type: Type.STRING } } } }, conclusion: { type: Type.OBJECT, properties: { english: { type: Type.STRING }, vietnamese: { type: Type.STRING } } } } };
const speechEvaluationSchema = { type: Type.OBJECT, properties: { scores: { type: Type.OBJECT, properties: { pronunciation: { type: Type.NUMBER } } }, overallScore: { type: Type.NUMBER }, feedback: { type: Type.STRING } } };
const writingCorrectionSchema = { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING }, fixedText: { type: Type.STRING }, breakdown: { type: Type.OBJECT, properties: { vocabulary: { type: Type.NUMBER }, grammar: { type: Type.NUMBER } } }, errors: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { original: { type: Type.STRING }, fixed: { type: Type.STRING }, reason: { type: Type.STRING } } } }, suggestions: { type: Type.STRING } } };

// ===== PRESERVED EXAM EXTRACTION (ZERO-DISTORTION) =====
export interface ExtractExamOptions {
  targetScale?: 10 | 'original';
  durationMinutes?: number;
  userTitle?: string;
  onFallbackNotice?: (notice: FallbackNotice) => void;
}

const preservedExamSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    schoolOrSource: { type: Type.STRING },
    durationMinutes: { type: Type.INTEGER },
    originalMaxScore: { type: Type.NUMBER },
    instructions: { type: Type.STRING },
    hasAnswerKey: { type: Type.BOOLEAN },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          instruction: { type: Type.STRING },
          passage: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                number: { type: Type.STRING },
                sectionTitle: { type: Type.STRING },
                sectionInstruction: { type: Type.STRING },
                passage: { type: Type.STRING },
                questionText: { type: Type.STRING },
                type: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.STRING },
                alternativeAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
                explanation: { type: Type.STRING },
                points: { type: Type.NUMBER },
                originalPointsText: { type: Type.STRING }
              },
              required: ["id", "number", "questionText", "type", "correctAnswer", "points"]
            }
          }
        },
        required: ["title", "questions"]
      }
    }
  },
  required: ["title", "sections", "hasAnswerKey"]
};

export const extractExamFromDocument = async (
  doc: { type: 'text' | 'pdf' | 'image'; text?: string; base64?: string; mimeType?: string; fileName?: string },
  options?: ExtractExamOptions
): Promise<PreservedExam> => {
  const targetScale = options?.targetScale || 10;
  const duration = options?.durationMinutes || 45;

  const promptExam = `LEGEND X5 AI - HIGH FIDELITY EXAM PRESERVATION ENGINE.
TASK: Extract and preserve 100% of the uploaded English Exam / Test into a structured format.

🚨 CRITICAL MANDATE - ZERO DISTORTION / ABSOLUTE CONTENT FIDELITY 🚨
1. DO NOT change, rewrite, summarize, simplify, or invent questions.
2. PRESERVE EVERY SINGLE QUESTION exactly as written in the original exam from the first to the very last question.
3. PRESERVE ALL SECTIONS (e.g., "PART A: PHONETICS", "SECTION B: VOCABULARY & GRAMMAR", "PART 3: READING", "PART 4: WRITING").
4. PRESERVE ALL INSTRUCTIONS (e.g., "Choose the word whose underlined part is pronounced differently...", "Read the passage and choose the best answer...").
5. PRESERVE ALL READING PASSAGES intact in the 'passage' field.
6. PRESERVE ORIGINAL QUESTION NUMBERING (e.g. "Question 1", "Câu 1", "1", "2").

🎯 ANSWER KEY HANDLING:
- If the document contains an Answer Key (Bảng đáp án / Lời giải / Gợi ý đáp án ở cuối đề hoặc trong đề):
  * EXTRACT the EXACT answer key from the document for each question!
  * Set hasAnswerKey: true.
- If the document does NOT have an answer key:
  * Solve each question with 100% professional accuracy as an expert English teacher.
  * Verify each answer independently. NEVER GUESS. Ensure Multiple Choice questions have EXACTLY ONE correct answer.
  * Provide correctAnswer and an explanation in Vietnamese citing the grammar rule or text evidence.
  * Set hasAnswerKey: false.

🎯 QUESTION TYPES (type property):
- "multiple_choice": For questions with A, B, C, D choices. 'options' array MUST contain all choices (e.g. ["A. go", "B. goes", "C. went", "D. going"]). 'correctAnswer' should be the letter or exact option text (e.g. "B" or "B. goes").
- "fill_blank": For sentences with a blank (e.g. "I ______ reading books.") or cloze test. 'correctAnswer' is the missing word. 'alternativeAnswers' includes contractions or valid equivalents.
- "sentence_rewrite": For sentence transformation (e.g. "Rewrite: She is too young to drive."). 'correctAnswer' is the model sentence.
- "word_form": For supply correct form of word in parentheses (e.g. "She is a (beauty) ______ girl."). 'correctAnswer' is the correct form.
- "true_false": For True / False statements. 'correctAnswer' is "True" or "False".
- "matching": For matching column A with column B.
- "short_answer": For reading comprehension questions or open questions.

🎯 SCORING & WEIGHTING:
- Extract question point weights if stated in the exam (e.g. 0.25 pt, 0.5 point).
- If point weights are not stated: distribute points evenly so total points = 10 (or originalMaxScore).
- If targetScale is 10: ensure total point sum across all questions equals 10.0.

OUTPUT: Return valid JSON matching the schema.`;

  const inputParts: any[] = [];
  if (doc.type === 'text') {
    inputParts.push({ text: `ORIGINAL EXAM DOCUMENT CONTENT (${doc.fileName || 'Exam'}):\n\n${doc.text}` });
  } else if (doc.type === 'pdf') {
    inputParts.push({
      inlineData: {
        data: doc.base64!,
        mimeType: 'application/pdf'
      }
    });
    inputParts.push({ text: `DOCUMENT FILENAME: ${doc.fileName || 'exam.pdf'}` });
  } else if (doc.type === 'image') {
    inputParts.push({
      inlineData: {
        data: doc.base64!,
        mimeType: doc.mimeType || 'image/jpeg'
      }
    });
    inputParts.push({ text: `DOCUMENT IMAGE FILENAME: ${doc.fileName || 'exam.jpg'}` });
  }

  inputParts.push({ text: promptExam });

  const rawResult = await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    console.log(`🤖 [Exam Extraction] Đang phân tích đề thi với model: ${modelId}`);
    const response = await client.models.generateContent({
      model: modelId,
      contents: { parts: inputParts },
      config: { responseMimeType: "application/json", responseSchema: preservedExamSchema }
    });
    return safeJsonParse<any>(response.text);
  }, options?.onFallbackNotice);

  // Post-process and validate
  const sections: ExamSection[] = (rawResult.sections || []).map((sec: any, sIdx: number) => {
    const questions: ExamQuestion[] = (sec.questions || []).map((q: any, qIdx: number) => {
      const qId = q.id || `q_${sIdx + 1}_${qIdx + 1}`;
      const qNum = q.number || `Câu ${qIdx + 1}`;
      return {
        id: qId,
        number: qNum,
        sectionTitle: q.sectionTitle || sec.title,
        sectionInstruction: q.sectionInstruction || sec.instruction,
        passage: q.passage || sec.passage,
        questionText: q.questionText || '',
        type: (q.type as ExamQuestionType) || 'multiple_choice',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: String(q.correctAnswer || '').trim(),
        alternativeAnswers: Array.isArray(q.alternativeAnswers) ? q.alternativeAnswers : [],
        explanation: q.explanation || '',
        points: typeof q.points === 'number' && q.points > 0 ? q.points : 0.25,
        originalPointsText: q.originalPointsText || ''
      };
    });
    return {
      title: sec.title || `Phần ${sIdx + 1}`,
      instruction: sec.instruction || '',
      passage: sec.passage || '',
      questions
    };
  });

  // Calculate total questions
  let totalQuestions = 0;
  sections.forEach(s => {
    totalQuestions += s.questions.length;
  });

  // Calculate sum of raw points
  let rawTotalPoints = 0;
  sections.forEach(s => {
    s.questions.forEach(q => {
      rawTotalPoints += q.points;
    });
  });

  const originalMaxScore = rawResult.originalMaxScore || (rawTotalPoints > 0 ? Math.round(rawTotalPoints * 10) / 10 : 10);

  // Adjust points based on targetScale
  if (targetScale === 10 && totalQuestions > 0) {
    if (Math.abs(rawTotalPoints - 10) > 0.05) {
      // Scale points proportionally so sum = 10.0
      const factor = 10 / (rawTotalPoints || totalQuestions);
      sections.forEach(s => {
        s.questions.forEach(q => {
          q.points = Math.round(q.points * factor * 100) / 100;
        });
      });
    }
  }

  const exam: PreservedExam = {
    id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: options?.userTitle || rawResult.title || doc.fileName?.replace(/\.[^/.]+$/, '') || 'Đề Kiểm Tra Tiếng Anh',
    schoolOrSource: rawResult.schoolOrSource || '',
    durationMinutes: rawResult.durationMinutes || duration,
    originalMaxScore,
    targetScale,
    instructions: rawResult.instructions || '',
    totalQuestions,
    sections,
    hasAnswerKey: Boolean(rawResult.hasAnswerKey),
    rawText: doc.type === 'text' ? doc.text : undefined,
    createdAt: new Date().toISOString()
  };

  return exam;
};

// ===== SMART EXAM GRADING HELPER =====
export interface ExamGradeResult {
  totalQuestions: number;
  totalCorrect: number;
  totalPointsEarned: number;
  maxPoints: number;
  scoreOn10: number;
  questionResults: {
    questionId: string;
    isCorrect: boolean;
    studentAnswer: string;
    correctAnswer: string;
    pointsEarned: number;
    pointsPossible: number;
    explanation?: string;
  }[];
}

export const gradeExamSubmission = (
  exam: PreservedExam,
  studentAnswers: Record<string, string>
): ExamGradeResult => {
  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalPointsEarned = 0;
  let maxPoints = 0;
  const questionResults: ExamGradeResult['questionResults'] = [];

  const normalizeText = (str: string) => {
    return (str || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:"'’]/g, '');
  };

  const isAnswerMatch = (student: string, correct: string, alternatives: string[] = [], qType: ExamQuestionType, options: string[] = []) => {
    const sNorm = normalizeText(student);
    const cNorm = normalizeText(correct);
    if (!sNorm) return false;

    // Direct match
    if (sNorm === cNorm) return true;

    // Multiple choice matching: handles "A" vs "A. apple" vs "apple"
    if (qType === 'multiple_choice') {
      // If correct is "A", check if student starts with "A" or matches the text of option A
      const cLetter = correct.trim().toUpperCase().charAt(0);
      const sLetter = student.trim().toUpperCase().charAt(0);
      if (['A', 'B', 'C', 'D'].includes(cLetter) && sLetter === cLetter) {
        return true;
      }
      // Check if student selected option text
      const optMatch = options.find((opt, idx) => {
        const letter = ['A', 'B', 'C', 'D'][idx];
        return letter === cLetter && normalizeText(opt).includes(sNorm);
      });
      if (optMatch) return true;
    }

    // Check alternative answers
    for (const alt of alternatives) {
      if (normalizeText(alt) === sNorm) return true;
    }

    // Contraction equivalents
    const contractions: [string, string][] = [
      ["don't", "do not"], ["doesn't", "does not"], ["didn't", "did not"],
      ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"],
      ["can't", "cannot"], ["won't", "will not"], ["shouldn't", "should not"],
      ["i'm", "i am"], ["you're", "you are"], ["he's", "he is"], ["she's", "she is"],
      ["it's", "it is"], ["we're", "we are"], ["they're", "they are"]
    ];

    for (const [short, full] of contractions) {
      if ((sNorm.includes(short) && cNorm.includes(full)) || (sNorm.includes(full) && cNorm.includes(short))) {
        return true;
      }
    }

    return false;
  };

  exam.sections.forEach(sec => {
    sec.questions.forEach(q => {
      totalQuestions += 1;
      maxPoints += q.points;
      const studentAns = studentAnswers[q.id] || '';
      const isCorrect = isAnswerMatch(studentAns, q.correctAnswer, q.alternativeAnswers, q.type, q.options);

      const pointsEarned = isCorrect ? q.points : 0;
      if (isCorrect) {
        totalCorrect += 1;
        totalPointsEarned += pointsEarned;
      }

      questionResults.push({
        questionId: q.id,
        isCorrect,
        studentAnswer: studentAns,
        correctAnswer: q.correctAnswer,
        pointsEarned,
        pointsPossible: q.points,
        explanation: q.explanation
      });
    });
  });

  const safeMax = maxPoints > 0 ? maxPoints : 10;
  const scoreOn10 = Math.round((totalPointsEarned / safeMax) * 10 * 10) / 10;

  return {
    totalQuestions,
    totalCorrect,
    totalPointsEarned: Math.round(totalPointsEarned * 100) / 100,
    maxPoints: Math.round(maxPoints * 100) / 100,
    scoreOn10,
    questionResults
  };
};

// ==================== SINGLE QUESTION AUDIT & REGENERATION ====================
export interface RegenerateQuestionParams {
  questionType: 'multipleChoice' | 'readingMC' | 'pronunciation' | 'scramble' | 'vocabTranslation' | 'trueFalse' | 'fillBlank' | 'readingFill' | 'listening';
  currentQuestion: any;
  teacherNote?: string;
  context?: {
    topic?: string;
    grammarTopic?: string;
    grammarExplanation?: string;
    readingPassage?: string;
  };
  onFallbackNotice?: (notice: FallbackNotice) => void;
}

export const regenerateQuestionWithAi = async (params: RegenerateQuestionParams): Promise<any> => {
  const { questionType, currentQuestion, teacherNote, context, onFallbackNotice } = params;

  const prompt = `LEGEND X5 AI - MASTER ENGLISH QUESTION AUDITOR & REGENERATOR.
TASK: An English teacher is reviewing an exercise and detected an error or wants to fix/regenerate this single question.
Review the CURRENT QUESTION and TEACHER INSTRUCTION carefully, diagnose any flaws (especially duplicate blank words, broken grammar, or awkward distractors), and regenerate a 100% pedagogically sound replacement question.

CURRENT QUESTION DATA:
Question Type: ${questionType}
Question JSON:
${JSON.stringify(currentQuestion, null, 2)}

LESSON CONTEXT:
Topic: ${context?.topic || 'N/A'}
Grammar Topic: ${context?.grammarTopic || 'N/A'}
Grammar Explanation: ${context?.grammarExplanation || 'N/A'}
Reading Passage: ${context?.readingPassage || 'N/A'}

TEACHER FEEDBACK / INSTRUCTION:
${teacherNote ? teacherNote : 'Tự động phát hiện và sửa triệt để các lỗi sai (lỗi lặp từ/thừa từ ở ô trống, sai ngữ pháp, phương án nhiễu sai lệch hoặc mơ hồ).'}

===== 🚨 STRICT QUALITY PRINCIPLES (LEGEND X5 PEDAGOGICAL STANDARD) 🚨 =====
1. FIX BLANK DUPLICATION ERRORS:
   - If the question contains a blank '______', when the correct answer is inserted into the blank, the resulting sentence MUST be 100% natural, grammatically correct English with NO REPEATED OR REDUNDANT WORDS.
   - Example Error: Question has 'Children often pretend ______ to be superheroes.' and answer is 'to be'. Inserting answer produces 'pretend to be to be superheroes'!
   - Correction: Either change question to 'Children often pretend ______ superheroes.' (with answer 'to be'), or 'Children often pretend to ______ superheroes.' (with answer 'be').
2. SINGLE UNAMBIGUOUS CORRECT ANSWER:
   - Exactly 1 option must be undeniably correct.
   - Distractors must be classic English learner mistakes but 100% incorrect in this sentence.
3. PEDAGOGICAL EXPLANATION:
   - Provide a clear, encouraging explanation in Vietnamese citing the grammar rule or context.
4. KEEP THE ORIGINAL ID:
   - Preserve the question id "${currentQuestion.id || 'q_fixed'}".

OUTPUT FORMAT:
Respond with VALID JSON ONLY matching this question type structure:
- If questionType is 'multipleChoice' or 'readingMC':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "question": "Sentence with ______",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "alternativeCorrectAnswers": [],
    "explanation": "Lời giải thích ngữ pháp chi tiết bằng tiếng Việt"
  }
- If questionType is 'pronunciation':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "question": "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:",
    "targetSound": "Âm ...",
    "options": ["wordA", "wordB", "wordC", "wordD"],
    "displayOptions": ["w<u>o</u>rdA", "w<u>o</u>rdB", "w<u>o</u>rdC", "w<u>o</u>rdD"],
    "correctAnswer": 0,
    "explanation": "Phiên âm IPA của cả 4 từ và giải thích tại sao chọn đáp án này"
  }
- If questionType is 'scramble':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "correctSentence": "Full correct English sentence.",
    "scrambled": ["token1", "token2", "token3"],
    "translation": "Dịch nghĩa tiếng Việt"
  }
- If questionType is 'vocabTranslation':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "word": "English word",
    "options": ["Nghĩa 1", "Nghĩa 2", "Nghĩa 3", "Nghĩa 4"],
    "correctAnswer": 0,
    "explanation": "Giải thích nghĩa tiếng Việt và ví dụ"
  }
- If questionType is 'trueFalse':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "statement": "Statement about the passage",
    "isTrue": true,
    "explanation": "Dẫn chứng giải thích từ bài đọc"
  }
- If questionType is 'fillBlank' or 'readingFill':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "question": "Sentence with ______",
    "correctAnswer": "word",
    "alternativeAnswers": [],
    "options": ["word1", "word2", "word3", "word4"],
    "clueEmoji": "📝",
    "explanation": "Giải thích ngữ pháp tiếng Việt"
  }
- If questionType is 'listening':
  {
    "id": "${currentQuestion.id || 'q_fixed'}",
    "audioText": "Full sentence to read aloud.",
    "sentenceWithBlank": "Sentence with ______",
    "missingWord": "word to fill",
    "alternativeAnswers": [],
    "explanation": "Giải thích tiếng Việt"
  }
`;

  return await callWithFallback(async (modelId: string, client: GoogleGenAI) => {
    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    const parsed = safeJsonParse<any>(response.text);
    if (!parsed) throw new Error('AI không trả về cấu trúc câu hỏi hợp lệ.');
    parsed.id = currentQuestion.id || parsed.id || 'q_fixed';
    return parsed;
  }, onFallbackNotice);
};


