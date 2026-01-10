import { useState } from 'react';
import { FaRocket, FaCheckCircle, FaSpinner, FaSteam, FaShieldAlt, FaKey, FaArrowRight, FaTimes, FaInfoCircle } from 'react-icons/fa';
import { registerSimple } from '../services/pairing';
import { useToast } from './Toast';

function AutoRegisterPanel({ onComplete, onClose }) {
  const [step, setStep] = useState(1); // 1: 初始, 2: 等待输入凭证, 3: 注册中, 4: 成功
  const [loading, setLoading] = useState(false);
  const [steamWindow, setSteamWindow] = useState(null);
  const [credentialsInput, setCredentialsInput] = useState('');

  const toast = useToast();

  const handleOpenSteamLogin = () => {
    const steamWin = window.open(
      'https://companion-rust.facepunch.com/login',
      '_blank'
    );

    if (!steamWin || steamWin.closed || typeof steamWin.closed === 'undefined') {
      toast.error('浏览器阻止了弹窗，请允许弹窗后重试');
      return;
    }

    setSteamWindow(steamWin);
    setStep(2);
  };

  const handleSubmitCredentials = async () => {
    if (!credentialsInput.trim()) {
      toast.warning('请输入凭证命令');
      return;
    }

    setLoading(true);
    setStep(3);

    // 设置一个前端安全超时，防止后端挂起导致黑屏
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      setStep(2);
      toast.error('请求响应超时，请检查后端网络连接或代理配置');
    }, 20000); // 20秒前端超时

    try {
      const response = await registerSimple(credentialsInput);
      clearTimeout(safetyTimeout);

      if (!response?.data?.success) {
        throw new Error(response?.data?.error || '授权失败');
      }

      setStep(4);
      if (steamWindow && !steamWindow.closed) steamWindow.close();

      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
    } catch (err) {
      clearTimeout(safetyTimeout);
      console.error('提交凭证失败:', err);
      
      // 处理 401 之外的错误
      if (err.response?.status !== 401) {
        const errorMsg = err.response?.data?.error || err.message || '系统繁忙，请稍后重试';
        toast.error(`授权请求失败: ${errorMsg}`);
        setStep(2);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tactic-border tactic-cut p-1 bg-black/60 shadow-2xl relative overflow-hidden animate-scale-in">
      <div className="scanline"></div>
      
      <div className="bg-black/80 p-8 relative z-10">
        <header className="flex items-center justify-between mb-10 pb-4 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#cd5241]/20 tactic-cut flex items-center justify-center text-[#cd5241]">
              <FaShieldAlt className="text-xl animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic text-white tracking-tighter">FCM 自动授权协议</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Secure Credential Handshake Protocol</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-600 hover:text-white transition-colors">
            <FaTimes />
          </button>
        </header>

        {/* 战术步骤指示器 */}
        <div className="flex items-center justify-between mb-12 px-4">
          <StepIndicator num="01" label="STEAM 验证" active={step >= 1} completed={step > 1} />
          <div className={`flex-1 h-px transition-all duration-1000 ${step > 1 ? 'bg-[#cd5241]' : 'bg-white/5'}`} />
          <StepIndicator num="02" label="提取凭证" active={step >= 2} completed={step > 2} />
          <div className={`flex-1 h-px transition-all duration-1000 ${step > 2 ? 'bg-[#cd5241]' : 'bg-white/5'}`} />
          <StepIndicator num="03" label="建立握手" active={step >= 3} completed={step >= 4} />
        </div>

        {/* 步骤 1: 初始指引 */}
        {step === 1 && (
          <div className="space-y-8 animate-fade-in">
            <div className="p-6 bg-white/[0.02] border border-white/5 tactic-cut">
              <h3 className="text-xs font-black text-[#cd5241] uppercase tracking-widest mb-4 italic flex items-center gap-2">
                <FaInfoCircle /> 授权引导说明
              </h3>
              <div className="space-y-4">
                <GuideStep num="1" text="点击下方按钮，系统将弹出 Steam 官方授权窗口" />
                <GuideStep num="2" text="在弹出窗口中完成 Steam 身份验证" />
                <GuideStep num="3" text="复制 Companion 页面显示的 /credentials 原始指令" />
                <GuideStep num="4" text="返回本终端粘贴指令完成链路授权" />
              </div>
            </div>

            <button
              className="w-full tactic-cut bg-[#cd5241] py-5 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-[#b04537] transition-all shadow-xl shadow-[#cd5241]/20 flex items-center justify-center gap-4 group"
              onClick={handleOpenSteamLogin}
              disabled={loading}
            >
              <FaRocket className="group-hover:scale-110 transition-transform" />
              启动授权向导
            </button>
          </div>
        )}

        {/* 步骤 2: 输入凭证 */}
        {step === 2 && (
          <div className="space-y-8 animate-fade-in">
            <div className="p-6 bg-[#cd5241]/5 border border-[#cd5241]/20 tactic-cut relative overflow-hidden">
              <div className="flex items-center gap-4 mb-4">
                <FaSteam className="text-[#cd5241] text-2xl" />
                <span className="text-xs font-black text-white uppercase tracking-widest italic">等待凭证输入...</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed uppercase">
                请在 Steam 窗口中复制以 <span className="text-[#cd5241] font-mono">/credentials add</span> 开头的完整命令，并粘贴到下方终端区域。
              </p>
            </div>

            <div className="relative">
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-l-2 border-[#cd5241] pl-2">
                链路加密指令
              </label>
              <textarea
                className="w-full bg-black/40 border border-white/10 tactic-cut p-4 text-[10px] font-mono text-[#cd5241] h-32 outline-none focus:border-[#cd5241]/50 transition-all custom-scrollbar"
                placeholder="/credentials add gcm_android_id:xxx ..."
                value={credentialsInput}
                onChange={(e) => setCredentialsInput(e.target.value)}
              />
            </div>

            <div className="flex gap-4">
              <button
                className="flex-[2] tactic-cut bg-[#cd5241] py-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#cd5241]/10"
                onClick={handleSubmitCredentials}
                disabled={loading || !credentialsInput.trim()}
              >
                {loading ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />}
                确立凭证授权
              </button>
              <button
                className="flex-1 tactic-cut border border-white/10 text-gray-500 text-[10px] font-black uppercase hover:text-white transition-all"
                onClick={() => {
                  if (steamWindow && !steamWindow.closed) steamWindow.close();
                  setStep(1);
                  setCredentialsInput('');
                }}
              >
                返回
              </button>
            </div>
          </div>
        )}

        {/* 步骤 3: 注册中 */}
        {step === 3 && (
          <div className="text-center py-16 animate-fade-in">
            <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 border-2 border-[#cd5241]/20 rounded-full"></div>
              <div className="absolute inset-0 border-t-2 border-[#cd5241] rounded-full animate-spin"></div>
              <FaSatellite className="absolute inset-0 m-auto text-[#cd5241] text-2xl animate-pulse" />
            </div>
            <h3 className="text-lg font-black text-white uppercase italic tracking-tighter mb-2">正在同步云端密钥...</h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Establishing Encrypted Handshake with FCM Nodes</p>
          </div>
        )}

        {/* 步骤 4: 成功 */}
        {step === 4 && (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-20 h-20 bg-[#a3e635]/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-[#a3e635]/30 shadow-[0_0_30px_rgba(163,230,53,0.1)]">
              <FaCheckCircle className="text-[#a3e635] text-4xl" />
            </div>
            <h3 className="text-2xl font-black text-[#a3e635] uppercase italic tracking-tighter mb-2">授权建立成功</h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-10">Credentials Successfully Deployed</p>
            <div className="text-[9px] text-[#a3e635] font-mono animate-pulse">链路已激活，正在返回控制台...</div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ num, label, active, completed }) {
  return (
    <div className="flex flex-col items-center gap-3 group">
      <div className={`
        w-10 h-10 tactic-cut flex items-center justify-center font-black transition-all duration-500 border
        ${completed 
            ? 'bg-[#cd5241] border-[#cd5241] text-white shadow-lg shadow-[#cd5241]/30' 
            : active 
                ? 'bg-[#cd5241]/10 border-[#cd5241] text-[#cd5241] shadow-[0_0_15px_rgba(205,82,65,0.2)]' 
                : 'bg-black/40 border-white/5 text-gray-700'}
      `}>
        {completed ? <FaCheckCircle /> : <span className="text-xs font-mono">{num}</span>}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-gray-700'}`}>{label}</span>
    </div>
  );
}

function GuideStep({ num, text }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-[10px] font-mono font-black text-[#cd5241] bg-[#cd5241]/10 px-1.5 py-0.5 tactic-cut">{num}</span>
      <span className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed">{text}</span>
    </div>
  );
}

export default AutoRegisterPanel;
