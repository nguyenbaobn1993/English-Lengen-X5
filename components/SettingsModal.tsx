import React, { useState, useEffect } from 'react';
import { AiProvider, FirebaseConfig } from '../types';
import {
  getAiProvider,
  setAiProvider,
  getApiKeyForProvider,
  setApiKeyForProvider,
  getSelectedModel,
  setSelectedModel,
  getModelsForProvider,
  isValidGoogleAiApiKey,
  fetchAvailableModels,
  testGenerateWithModel,
  getCachedAvailableModels,
  isDemoProxyKey
} from '../services/geminiService';
import { isDemoMode } from '../services/demoBoot';
import { getCurrentUser } from '../services/authService';
import { TeacherAccountsPanel, MyTeacherPasswordPanel } from './teacher/TeacherAccountsPanel';
import { getFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig, testFirebaseConnection } from '../services/firebaseService';
import {
  getTeacherCredentials,
  changeTeacherCredentials,
  getSavedTeacherLogin,
  setSavedTeacherLogin,
  clearSavedTeacherLogin
} from '../services/authService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [geminiKey, setGeminiKey] = useState('');
  const [agentPlatformKey, setAgentPlatformKey] = useState('');
  const [selectedModel, setModel] = useState('');

  // Mode tabs: AI, Firebase, and Teacher Account
  const [activeTab, setActiveTab] = useState<'ai' | 'firebase' | 'account' | 'teachers'>('ai');
  // Kiểm tra key & dò model khả dụng
  const [checkingKey, setCheckingKey] = useState(false);
  const [keyCheck, setKeyCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<string[] | null>(null);
  const currentUser = getCurrentUser();
  const isSubTeacher = !!currentUser?.teacherAccountId;

  // Firebase state
  const [fbDatabaseUrl, setFbDatabaseUrl] = useState('');
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbSavedMsg, setFbSavedMsg] = useState(false);
  const [testingFb, setTestingFb] = useState(false);
  const [fbTestResult, setFbTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Teacher Account state
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherConfirmPassword, setTeacherConfirmPassword] = useState('');
  const [teacherDisplayName, setTeacherDisplayName] = useState('');
  const [rememberOnDevice, setRememberOnDevice] = useState(true);
  const [accountMsg, setAccountMsg] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentProvider = getAiProvider();
      setProvider(currentProvider);
      const gk = getApiKeyForProvider('gemini');
      setGeminiKey(isDemoProxyKey(gk) ? '' : gk);
      setAgentPlatformKey(getApiKeyForProvider('agent-platform'));
      setModel(getSelectedModel());
      setDiscoveredModels(getCachedAvailableModels('gemini'));
      setKeyCheck(null);

      const fb = getFirebaseConfig();
      if (fb) {
        setFbDatabaseUrl(fb.databaseURL || '');
        setFbApiKey(fb.apiKey || '');
        setFbProjectId(fb.projectId || '');
      }

      // Load current teacher credentials
      const creds = getTeacherCredentials();
      setTeacherUsername(creds.username);
      setTeacherPassword('');
      setTeacherConfirmPassword('');
      setTeacherDisplayName(creds.displayName || 'Thầy cô Legend X5');
      const savedLogin = getSavedTeacherLogin();
      setRememberOnDevice(savedLogin ? savedLogin.remember : true);
      setAccountMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const baseModels = getModelsForProvider(provider);
  // Gộp model dò được từ Google (chưa có trong danh sách sẵn) vào cuối danh sách
  const currentModels = provider === 'gemini' && discoveredModels
    ? [
        ...baseModels,
        ...discoveredModels.filter(id => !baseModels.some(m => m.id === id)).map(id => ({
          id, name: id, description: 'Model key của bạn đang dùng được (tự dò từ Google)', provider: 'gemini' as AiProvider, isDefault: false
        }))
      ]
    : baseModels;
  const isModelAvailable = (id: string): boolean | null =>
    provider !== 'gemini' || !discoveredModels ? null : discoveredModels.includes(id);

  const handleCheckKey = async () => {
    const key = geminiKey.trim();
    setCheckingKey(true);
    setKeyCheck({ ok: true, text: '⏳ Đang hỏi Google danh sách model của key này...' });
    const list = await fetchAvailableModels(key);
    if (!list.ok) {
      setCheckingKey(false);
      setDiscoveredModels(null);
      setKeyCheck({ ok: false, text: `❌ ${list.error}` });
      return;
    }
    setDiscoveredModels(list.ids);
    const best = list.ids.includes(selectedModel) ? selectedModel : list.ids[0];
    if (!best) {
      setCheckingKey(false);
      setKeyCheck({ ok: false, text: '❌ Key hợp lệ nhưng không có model Gemini nào tạo được nội dung.' });
      return;
    }
    setModel(best);
    setKeyCheck({ ok: true, text: `⏳ Key hợp lệ (${list.ids.length} model). Đang tạo thử với ${best}...` });
    // Thử lần lượt tối đa 3 model tốt nhất cho tới khi tạo được nội dung
    const candidates = [best, ...list.ids.filter(id => id !== best)].slice(0, 3);
    let lastErr = '';
    for (const m of candidates) {
      const t = await testGenerateWithModel(key, m);
      if (t.ok) {
        setModel(m);
        setCheckingKey(false);
        setKeyCheck({ ok: true, text: `✅ Tạo thử thành công với ${m}. Bấm "LƯU CẤU HÌNH" để dùng.` });
        return;
      }
      lastErr = t.error || '';
    }
    setCheckingKey(false);
    setKeyCheck({ ok: false, text: `⚠️ Key hợp lệ nhưng tạo thử chưa được: ${lastErr}` });
  };
  const currentKey = provider === 'agent-platform' ? agentPlatformKey : geminiKey;
  const isKeyValidFormat = isValidGoogleAiApiKey(currentKey);

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    // Standardize default model when switching provider
    const available = getModelsForProvider(newProvider);
    setModel(available.find(m => m.isDefault)?.id || available[0].id);
  };

  const handleSave = async () => {
    // If saving teacher account
    if (activeTab === 'account') {
      const u = teacherUsername.trim();
      const p = teacherPassword.trim();
      const cp = teacherConfirmPassword.trim();
      if (!u) {
        setAccountMsg({ success: false, text: 'Tên đăng nhập không được để trống!' });
        return;
      }
      if (!p || p.length < 6) {
        setAccountMsg({ success: false, text: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
        return;
      }
      if (p !== cp) {
        setAccountMsg({ success: false, text: 'Xác nhận mật khẩu không trùng khớp!' });
        return;
      }

      const currentPass = window.prompt('🔒 Nhập MẬT KHẨU QUẢN TRỊ HIỆN TẠI để xác nhận đổi mật khẩu:');
      if (currentPass === null) return;
      setAccountMsg({ success: true, text: 'Đang lưu lên hệ thống...' });
      const res = await changeTeacherCredentials(
        currentPass,
        u,
        p,
        teacherDisplayName.trim() || 'Thầy cô Legend X5'
      );

      if (!res.success) {
        setAccountMsg({ success: false, text: res.error || 'Lỗi khi lưu tài khoản' });
        return;
      }

      if (rememberOnDevice) {
        setSavedTeacherLogin(u, p, true);
      } else {
        clearSavedTeacherLogin();
      }

      setAccountMsg({ success: true, text: '✓ Đã đổi mật khẩu trên hệ thống — áp dụng cho mọi máy, các máy khác phải đăng nhập lại.' });
      setTimeout(() => {
        if (onSaved) onSaved();
        onClose();
      }, 1000);
      return;
    }

    setAiProvider(provider);
    setApiKeyForProvider('gemini', geminiKey.trim());
    setApiKeyForProvider('agent-platform', agentPlatformKey.trim());
    setSelectedModel(selectedModel);

    // Save Firebase if entered
    if (fbDatabaseUrl.trim()) {
      const config: FirebaseConfig = {
        databaseURL: fbDatabaseUrl.trim(),
        apiKey: fbApiKey.trim(),
        projectId: fbProjectId.trim(),
        authDomain: `${fbProjectId.trim() || ''}.firebaseapp.com`,
        storageBucket: `${fbProjectId.trim() || ''}.firebasestorage.app`
      };
      saveFirebaseConfig(config);
    }

    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-5 max-h-[90vh] flex flex-col overflow-hidden border border-brand-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            <div>
              <h2 className="text-xl font-black text-brand-900">Cấu Hình Hệ Thống</h2>
              <p className="text-xs text-slate-500 font-semibold">Gemini API, Agent Platform & Đồng Bộ Firebase</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        {/* Top Mode Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ai' ? 'bg-white text-brand-700 shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🤖</span> Dịch Vụ AI
          </button>
          <button
            onClick={() => setActiveTab('firebase')}
            className={`flex-1 min-w-[130px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'firebase' ? 'bg-white text-emerald-700 shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🔥</span> Đồng Bộ Firebase
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`flex-1 min-w-[140px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'account' ? 'bg-white text-indigo-700 shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🔐</span> {isSubTeacher ? 'Tài Khoản Của Tôi' : 'Tài Khoản Quản Trị'}
          </button>
          {!isSubTeacher && (
            <button
              onClick={() => setActiveTab('teachers')}
              className={`flex-1 min-w-[130px] py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'teachers' ? 'bg-white text-brand-700 shadow-md' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>👥</span> Giáo Viên
            </button>
          )}
        </div>

        {/* Tab 1: AI Provider Settings */}
        {activeTab === 'ai' && (
          <div className="overflow-y-auto space-y-4 flex-1 pr-1">
            {/* Provider Selector per api.md Section III */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                1. Chọn Nhà Cung Cấp Dịch Vụ AI
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleProviderChange('gemini')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                    provider === 'gemini'
                      ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-sm'
                      : 'border-slate-200 hover:border-brand-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm">Gemini API</span>
                    {provider === 'gemini' && <span className="text-xs text-brand-600 font-bold">✓ Đang chọn</span>}
                  </div>
                  <p className="text-[11px] text-slate-500">Google AI Studio API Key</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderChange('agent-platform')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                    provider === 'agent-platform'
                      ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-sm'
                      : 'border-slate-200 hover:border-brand-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm">Agent Platform API</span>
                    {provider === 'agent-platform' && <span className="text-xs text-brand-600 font-bold">✓ Đang chọn</span>}
                  </div>
                  <p className="text-[11px] text-slate-500">Google Cloud Agent Platform</p>
                </button>
              </div>
            </div>

            {/* API Key Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                  2. Khóa API Key ({provider === 'gemini' ? 'Gemini API' : 'Agent Platform API'})
                </label>
                {currentKey && (
                  <span className={`text-[11px] font-bold ${isKeyValidFormat ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {isKeyValidFormat ? '✓ Định dạng hợp lệ' : '⚠️ Key nên bắt đầu bằng AIzaSy... hoặc AQ...'}
                  </span>
                )}
              </div>

              {provider === 'gemini' ? (
                <input
                  type="password"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="Nhập API Key Gemini (AIzaSy... hoặc AQ...)"
                  className="w-full p-3 rounded-xl border-2 border-slate-200 font-mono text-sm focus:border-brand-500 outline-none transition-all"
                />
              ) : (
                <input
                  type="password"
                  value={agentPlatformKey}
                  onChange={e => setAgentPlatformKey(e.target.value)}
                  placeholder="Nhập Agent Platform API Key (AQ... hoặc AIzaSy...)"
                  className="w-full p-3 rounded-xl border-2 border-slate-200 font-mono text-sm focus:border-brand-500 outline-none transition-all"
                />
              )}

              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-slate-400">Chấp nhận cả khóa AIzaSy... và AQ...</span>
                {provider === 'gemini' ? (
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-500 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    👉 Lấy API key miễn phí tại AI Studio
                  </a>
                ) : (
                  <a
                    href="https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    👉 Hướng dẫn lấy Agent Platform key
                  </a>
                )}
              </div>
            </div>

            {isDemoMode() && (
              <div className="p-3 rounded-2xl bg-highlight-300/20 border border-highlight-400 text-xs text-brand-900 leading-relaxed">
                <b>🧪 Bản demo đã bật sẵn AI</b> — để trống ô key là dùng AI của trung tâm (giới hạn lượt mỗi giờ).
                Nhập key riêng nếu muốn dùng không giới hạn.
              </div>
            )}

            {/* Kiểm tra key & dò model */}
            {provider === 'gemini' && (
              <div className="p-3 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 space-y-2">
                <button
                  type="button"
                  disabled={checkingKey || !geminiKey.trim()}
                  onClick={handleCheckKey}
                  className="w-full py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-black text-sm"
                >
                  {checkingKey ? '⏳ Đang kiểm tra...' : '⚡ Kiểm tra key & tự tìm model dùng được'}
                </button>
                {keyCheck && (
                  <p className={`text-xs font-bold ${keyCheck.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{keyCheck.text}</p>
                )}
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  App hỏi Google xem key này gọi được model nào, chỉ dùng các model đó và tự chuyển sang model khác khi một model hết lượt miễn phí.
                  Key lưu riêng trên trình duyệt này — mỗi máy giáo viên cần nhập một lần.
                </p>
              </div>
            )}

            {/* Model Selection */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                3. Chọn Mô Hình (Model)
              </label>
              <div className="grid gap-2">
                {currentModels.map(m => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/70 text-brand-900 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm">{m.name}</span>
                        {isModelAvailable(m.id) === true && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">✓ Key dùng được</span>
                        )}
                        {isModelAvailable(m.id) === false && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold">Key không có model này</span>
                        )}
                        {m.isDefault && (
                          <span className="px-2 py-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold">
                            Mặc định
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Firebase Settings */}
        {activeTab === 'firebase' && (
          <div className="overflow-y-auto space-y-4 flex-1 pr-1 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 space-y-1">
              <p className="font-bold text-sm">🔥 Đồng Bộ Đám Mây Firebase (Realtime Database)</p>
              <p className="text-xs leading-relaxed text-emerald-700">
                Cho phép giáo viên và học sinh kết nối từ các thiết bị khác nhau (máy tính cô giáo, điện thoại học sinh). Nếu chưa cấu hình, ứng dụng vẫn hoạt động hoàn hảo ở chế độ offline/local!
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Realtime Database URL
              </label>
              <input
                type="text"
                value={fbDatabaseUrl}
                onChange={e => setFbDatabaseUrl(e.target.value)}
                placeholder="https://tên-du-an-default-rtdb.asia-southeast1.firebasedatabase.app"
                className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:border-brand-500 outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Copy từ trang Firebase Console → Realtime Database (server Singapore: asia-southeast1)
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Firebase Web API Key (Tùy chọn)
              </label>
              <input
                type="password"
                value={fbApiKey}
                onChange={e => setFbApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Project ID (Tùy chọn)
              </label>
              <input
                type="text"
                value={fbProjectId}
                onChange={e => setFbProjectId(e.target.value)}
                placeholder="edumanage-thcs"
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-brand-500 outline-none"
              />
            </div>

            {/* Connection Test */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={testingFb || !fbDatabaseUrl}
                onClick={async () => {
                  setTestingFb(true);
                  setFbTestResult(null);
                  saveFirebaseConfig({
                    databaseURL: fbDatabaseUrl.trim(),
                    apiKey: fbApiKey.trim(),
                    projectId: fbProjectId.trim(),
                    authDomain: `${fbProjectId.trim() || ''}.firebaseapp.com`
                  });
                  const res = await testFirebaseConnection();
                  setFbTestResult(res);
                  setTestingFb(false);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              >
                <span>{testingFb ? '⏳ Đang kiểm tra...' : '⚡ Kiểm tra kết nối'}</span>
              </button>

              {fbTestResult && (
                <span className={`text-xs font-bold ${fbTestResult.success ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {fbTestResult.message}
                </span>
              )}
            </div>

            {fbDatabaseUrl && (
              <button
                type="button"
                onClick={() => {
                  clearFirebaseConfig();
                  setFbDatabaseUrl('');
                  setFbApiKey('');
                  setFbProjectId('');
                  setFbSavedMsg(true);
                  setFbTestResult(null);
                  setTimeout(() => setFbSavedMsg(false), 2000);
                }}
                className="text-rose-600 hover:underline font-bold text-xs"
              >
                Xóa cấu hình Firebase (quay lại chế độ hoàn toàn Local)
              </button>
            )}

            {fbSavedMsg && (
              <p className="text-xs font-bold text-emerald-600">Đã xóa cấu hình Firebase thành công.</p>
            )}
          </div>
        )}

        {/* Tab 3: Teacher Account Credentials & Persistence */}
        {activeTab === 'account' && isSubTeacher && (
          <div className="overflow-y-auto space-y-4 flex-1 pr-1">
            <MyTeacherPasswordPanel />
          </div>
        )}

        {activeTab === 'teachers' && !isSubTeacher && (
          <div className="overflow-y-auto space-y-4 flex-1 pr-1">
            <TeacherAccountsPanel />
          </div>
        )}

        {activeTab === 'account' && !isSubTeacher && (
          <div className="overflow-y-auto space-y-4 flex-1 pr-1">
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl">
              <h4 className="font-black text-indigo-900 text-sm mb-1 flex items-center gap-2">
                <span>🔐</span> Quản Lý Tài Khoản & Mật Khẩu Giáo Viên
              </h4>
              <p className="text-xs text-indigo-700 leading-relaxed">
                Đây là tài khoản QUẢN TRỊ (chủ trung tâm). Muốn thêm giáo viên khác, dùng tab "👥 Giáo Viên". Thông tin này sẽ được lưu trên thiết bị của cô để lần sau tự động điền sẵn mà không phải nhập lại.
              </p>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                Tên Đăng Nhập Mới
              </label>
              <input
                type="text"
                value={teacherUsername}
                onChange={(e) => setTeacherUsername(e.target.value)}
                placeholder="Ví dụ: Legend X5 hoặc legendx5"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                Tên Hiển Thị (Lời chào khi đăng nhập)
              </label>
              <input
                type="text"
                value={teacherDisplayName}
                onChange={(e) => setTeacherDisplayName(e.target.value)}
                placeholder="Ví dụ: Thầy cô Legend X5"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                Mật Khẩu Mới
              </label>
              <input
                type="password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới (tối thiểu 4 ký tự)"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                Xác Nhận Lại Mật Khẩu
              </label>
              <input
                type="password"
                value={teacherConfirmPassword}
                onChange={(e) => setTeacherConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Remember Me Checkbox */}
            <div className="pt-2">
              <label className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={rememberOnDevice}
                  onChange={(e) => setRememberOnDevice(e.target.checked)}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="font-bold text-xs text-slate-800">
                    Ghi nhớ đăng nhập trên thiết bị này
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Lần sau khi mở ứng dụng sẽ tự động điền sẵn tài khoản, cô chỉ cần bấm nút Đăng nhập.
                  </div>
                </div>
              </label>
            </div>

            {/* Status Feedback */}
            {accountMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  accountMsg.success
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {accountMsg.text}
              </div>
            )}

            {/* Anti-lockout Safe Note */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <span className="text-base leading-none shrink-0">🛡️</span>
              <div>
                <span className="font-black">Bảo mật:</span> Mật khẩu quản trị được mã hóa và lưu trên hệ thống, dùng chung cho mọi máy. Đổi mật khẩu xong, các máy khác đang đăng nhập quản trị sẽ tự đăng xuất. Không có mật khẩu mặc định — cô ghi nhớ mật khẩu mới cẩn thận nhé.
              </div>
            </div>
          </div>
        )}

        {/* Footer Button */}
        <div className={`pt-3 border-t border-slate-100 shrink-0 ${activeTab === 'teachers' || (activeTab === 'account' && isSubTeacher) ? 'hidden' : ''}`}>
          <button
            onClick={handleSave}
            className={`w-full py-3.5 text-white font-black text-base rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'account'
                ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                : 'bg-brand-500 hover:bg-brand-600 shadow-brand-200'
            }`}
          >
            <span>💾</span> {activeTab === 'account' ? 'LƯU TÀI KHOẢN GIÁO VIÊN' : 'LƯU CẤU HÌNH'}
          </button>
        </div>
      </div>
    </div>
  );
};
