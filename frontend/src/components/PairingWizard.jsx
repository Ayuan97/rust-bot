import { useState, useEffect } from 'react';
import {
  FaEdge, FaExternalLinkAlt, FaPuzzlePiece, FaSteam,
  FaCheck, FaLock, FaArrowLeft, FaArrowRight, FaSpinner,
  FaSatellite, FaGamepad, FaCheckCircle, FaRocket, FaShieldAlt,
  FaKey, FaPlay, FaStop, FaTimes, FaInfoCircle,
  FaExclamationTriangle, FaCreditCard
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { getPairingStatus, startPairing, stopPairing, registerSimple } from '../services/pairing';
import socketService from '../services/socket';
import {
  EDGE_EXTENSION_URL,
  STEAM_LOGIN_URL,
  REQUIRED_PLUGIN_BROWSER,
  detectBrowser,
  isEdgeBrowser
} from '../constants/pairing.constants';

/**
 * PairingWizard - 服务器配对向导
 * 作为独立视图而非弹窗，提供更好的 UX
 */
function PairingWizard({ onComplete, onCancel, fcmStatus: initialFcmStatus }) {
  const { isSubscriptionExpired, user } = useAuth();
  const toast = useToast();
  const [browser] = useState(detectBrowser);
  const isUsingEdge = isEdgeBrowser(browser);

  // 状态
  const [fcmStatus, setFcmStatus] = useState(initialFcmStatus || {
    isListening: false,
    hasCredentials: false,
    hasStoredCredentials: false
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [credentialsInput, setCredentialsInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [pairedServer, setPairedServer] = useState(null);

  // 步骤定义
  const steps = [
    { id: 1, label: '安装 Edge 插件', icon: FaPuzzlePiece },
    { id: 2, label: '获取凭证', icon: FaKey },
    { id: 3, label: '启动监听', icon: FaGamepad },
    { id: 4, label: '完成配对', icon: FaCheckCircle }
  ];

  // 根据状态计算初始步骤
  useEffect(() => {
    if (isSubscriptionExpired) return;

    const hasCredentials = fcmStatus.hasCredentials || fcmStatus.hasStoredCredentials;

    if (hasCredentials && fcmStatus.isListening) {
      // FCM 已就绪，直接到游戏配对
      setCurrentStep(3);
    } else if (hasCredentials) {
      // 有凭证但未监听，需要重连或直接到配对
      setCurrentStep(3);
    }
    // 否则从步骤1开始
  }, [fcmStatus, isSubscriptionExpired]);

  // 监听服务器配对事件
  useEffect(() => {
    const handleServerPaired = (serverInfo) => {
      setPairedServer(serverInfo);
      setIsListening(false);
      setCurrentStep(4);
      toast.success(`服务器配对成功: ${serverInfo.name}`);
    };

    socketService.on('server:paired', handleServerPaired);
    return () => socketService.off('server:paired', handleServerPaired);
  }, [toast]);

  // 刷新 FCM 状态
  const refreshFcmStatus = async () => {
    try {
      const res = await getPairingStatus();
      if (res.data.success) {
        setFcmStatus(res.data.status);
        return res.data.status;
      }
    } catch (err) {
      console.error('获取 FCM 状态失败:', err);
    }
    return null;
  };

  // 提交凭证
  const handleSubmitCredentials = async () => {
    if (!credentialsInput.trim()) {
      toast.warning('请输入凭证命令');
      return;
    }

    if (!isUsingEdge) {
      toast.warning(`当前浏览器不是 ${REQUIRED_PLUGIN_BROWSER}，请确保凭证来自 Edge 插件`);
    }

    setLoading(true);
    try {
      const res = await registerSimple(credentialsInput);
      if (res.data.success) {
        toast.success('FCM 凭证配置成功');
        await refreshFcmStatus();
        setCurrentStep(3);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || '授权失败';
      if (errorMsg.includes('gcm_android_id') || errorMsg.includes('gcm_security_token')) {
        toast.error('凭证格式错误：请从 Edge 插件复制完整 /credentials add 命令');
      } else if (errorMsg.includes('过期')) {
        toast.error('凭证已过期：请在 Edge 中重新登录并复制最新命令');
      } else {
        toast.error(`凭证配置失败: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 开始监听配对
  const handleStartListening = async () => {
    setLoading(true);
    try {
      await startPairing();
      setIsListening(true);
      await refreshFcmStatus();
      toast.success('已开始监听配对信号');
    } catch (err) {
      toast.error('启动监听失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 停止监听
  const handleStopListening = async () => {
    setLoading(true);
    try {
      await stopPairing();
      setIsListening(false);
      await refreshFcmStatus();
    } catch (err) {
      toast.error('停止监听失败');
    } finally {
      setLoading(false);
    }
  };

  // 完成向导
  const handleFinish = () => {
    if (onComplete) {
      onComplete(pairedServer);
    }
  };

  // 判断步骤状态
  const getStepStatus = (stepId) => {
    if (isSubscriptionExpired) return 'locked';
    if (stepId < currentStep) return 'completed';
    if (stepId === currentStep) return 'active';
    return 'pending';
  };

  const hasCredentials = fcmStatus.hasCredentials || fcmStatus.hasStoredCredentials;
  const isPairingListening = isListening || fcmStatus.isListening;

  // 订阅过期锁定态
  if (isSubscriptionExpired) {
    return (
      <div className="h-full flex items-center justify-center animate-fade-in">
        <div className="max-w-lg w-full">
          <WizardContainer>
            <WizardHeader steps={steps} currentStep={0} getStepStatus={() => 'locked'} />

            <div className="p-8">
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-yellow-500/10 border border-yellow-500/30 tactic-cut flex items-center justify-center mx-auto mb-6">
                  <FaLock className="text-3xl text-yellow-500" />
                </div>

                <h3 className="text-2xl font-black uppercase italic text-white mb-3">
                  服务已暂停
                </h3>
                <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">
                  您的订阅已过期，续费后即可继续使用配对功能
                </p>

                <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 tactic-cut mb-8">
                  <div className="flex items-center justify-center gap-3 text-yellow-500 text-sm">
                    <FaExclamationTriangle />
                    <span>订阅过期时间: {user?.subscriptionEndDate ? new Date(user.subscriptionEndDate).toLocaleDateString() : '未知'}</span>
                  </div>
                </div>

                <button
                  onClick={() => window.location.href = '/account'}
                  className="px-8 py-4 bg-yellow-500 text-black font-black uppercase tactic-cut hover:bg-yellow-400 transition-all flex items-center gap-3 mx-auto"
                >
                  <FaCreditCard /> 立即续费
                </button>
              </div>
            </div>

            <WizardFooter>
              <button
                onClick={onCancel}
                className="px-6 py-3 tactic-cut border border-white/10 text-gray-500 text-xs font-black uppercase hover:text-white hover:bg-white/5 transition-all flex items-center gap-2"
              >
                <FaArrowLeft /> 返回首页
              </button>
            </WizardFooter>
          </WizardContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center animate-fade-in p-6">
      <div className="max-w-2xl w-full">
        <WizardContainer>
          <WizardHeader steps={steps} currentStep={currentStep} getStepStatus={getStepStatus} />

          {!isUsingEdge && currentStep < 4 && (
            <div className="mx-6 mt-6">
              <EdgeRequiredNotice compact />
            </div>
          )}

          <div className="mx-6 mt-6 p-4 bg-white/[0.02] border border-white/10 tactic-cut">
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <StatusPill
                label="Edge 插件"
                active={isUsingEdge}
                activeText="当前为 Edge"
                inactiveText="当前非 Edge（可继续，但凭证必须来自 Edge 插件）"
              />
              <StatusPill
                label="FCM 凭证"
                active={hasCredentials}
                activeText="已配置"
                inactiveText="未配置"
              />
              <StatusPill
                label="监听状态"
                active={isPairingListening}
                activeText="监听中"
                inactiveText="未启动"
              />
            </div>
            {hasCredentials && (
              <div className="mt-3 text-[10px] text-gray-500 uppercase tracking-wider">
                Steam ID: {fcmStatus.steamId || '未知'}
              </div>
            )}
          </div>

          {/* 步骤内容 */}
          <div className="p-6">
            {currentStep === 1 && (
              <Step1InstallPlugin
                isUsingEdge={isUsingEdge}
                onNext={() => setCurrentStep(2)}
                onSkip={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 2 && (
              <Step2FcmAuth
                credentialsInput={credentialsInput}
                setCredentialsInput={setCredentialsInput}
                loading={loading}
                onSubmit={handleSubmitCredentials}
                onBack={() => setCurrentStep(1)}
                fcmStatus={fcmStatus}
                isUsingEdge={isUsingEdge}
                onSkipToStep3={() => setCurrentStep(3)}
              />
            )}

            {currentStep === 3 && (
              <Step3GamePairing
                isListening={isListening}
                loading={loading}
                onStartListening={handleStartListening}
                onStopListening={handleStopListening}
                onBack={() => setCurrentStep(2)}
                fcmStatus={fcmStatus}
              />
            )}

            {currentStep === 4 && (
              <Step4Complete
                pairedServer={pairedServer}
                onFinish={handleFinish}
              />
            )}
          </div>

          <WizardFooter>
            <button
              onClick={onCancel}
              className="px-6 py-3 tactic-cut border border-white/10 text-gray-500 text-xs font-black uppercase hover:text-white hover:bg-white/5 transition-all flex items-center gap-2"
            >
              <FaArrowLeft /> 返回首页
            </button>

            {currentStep < 4 && (
              <div className="text-[10px] text-gray-600 uppercase tracking-widest">
                步骤 {currentStep} / 4
              </div>
            )}
          </WizardFooter>
        </WizardContainer>
      </div>
    </div>
  );
}

// ============ 子组件 ============

function WizardContainer({ children }) {
  return (
    <div className="tactic-border tactic-cut p-1 bg-black/60 shadow-2xl relative">
      <div className="scanline" />
      <div className="bg-black/80 relative z-10">
        {children}
      </div>
    </div>
  );
}

function WizardHeader({ steps, currentStep, getStepStatus }) {
  return (
    <div className="p-6 border-b border-white/5">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-[#cd5241]/20 tactic-cut flex items-center justify-center text-[#cd5241]">
          <FaSatellite className="text-xl animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase italic text-white tracking-tighter">
            服务器配对向导
          </h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">
            Server Pairing Wizard
          </p>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          const isLast = index === steps.length - 1;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`
                  w-10 h-10 tactic-cut flex items-center justify-center font-black transition-all duration-300 border
                  ${status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                    status === 'active' ? 'bg-[#cd5241] border-[#cd5241] text-white shadow-lg shadow-[#cd5241]/30' :
                    status === 'locked' ? 'bg-gray-800 border-gray-700 text-gray-600' :
                    'bg-black/40 border-white/10 text-gray-600'}
                `}>
                  {status === 'completed' ? <FaCheck /> :
                   status === 'locked' ? <FaLock className="text-xs" /> :
                   <Icon className="text-sm" />}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest mt-2 ${
                  status === 'active' ? 'text-white' : 'text-gray-600'
                }`}>
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className={`flex-1 h-px mx-3 transition-all duration-500 ${
                  getStepStatus(step.id + 1) !== 'pending' ? 'bg-green-500' : 'bg-white/10'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WizardFooter({ children }) {
  return (
    <div className="p-4 border-t border-white/5 flex items-center justify-between bg-black/40">
      {children}
    </div>
  );
}

// ============ 步骤组件 ============

function Step1InstallPlugin({ isUsingEdge, onNext, onSkip }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-4 bg-blue-500/5 border border-blue-500/20 tactic-cut">
        <div className="flex items-start gap-3">
          <FaInfoCircle className="text-blue-400 mt-0.5" />
          <p className="text-xs text-gray-300 leading-relaxed">
            获取 FCM 凭证必须使用 {REQUIRED_PLUGIN_BROWSER} 插件。
            你仍可继续后续步骤，但只有来自 Edge 插件的凭证才能成功配对。
          </p>
        </div>
      </div>

      {!isUsingEdge && <EdgeRequiredNotice />}

      <div className="space-y-3">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-l-2 border-[#cd5241] pl-2">
          安装 {REQUIRED_PLUGIN_BROWSER} 插件
        </p>

        <button
          onClick={() => window.open(EDGE_EXTENSION_URL, '_blank')}
          className="w-full p-4 tactic-cut flex items-center gap-4 transition-all border bg-[#0078d4]/10 border-[#0078d4]/30 hover:bg-[#0078d4]/20"
        >
          <div className="w-10 h-10 bg-[#0078d4]/20 rounded-lg flex items-center justify-center">
            <FaEdge className="text-[#0078d4] text-xl" />
          </div>
          <div className="text-left flex-1">
            <div className="font-bold text-sm text-white">Microsoft Edge</div>
            <div className="text-[10px] text-gray-500">Edge 加载项商店</div>
          </div>
          <FaExternalLinkAlt className="text-gray-600" />
        </button>
      </div>

      <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 tactic-cut">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          <span className="text-yellow-400 font-bold">提示：</span>
          安装后请在 Edge 中打开插件并登录 Steam，确认能复制
          <span className="text-[#cd5241] font-mono"> /credentials add ... </span>
          命令再继续。
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onNext}
          className="flex-1 tactic-cut bg-[#cd5241] py-4 text-[11px] font-black uppercase tracking-[0.15em] hover:bg-[#b04537] transition-all flex items-center justify-center gap-3"
        >
          <FaCheck /> 已完成安装，继续
        </button>
      </div>

      <button
        onClick={onSkip}
        className="w-full py-3 border border-white/10 tactic-cut text-gray-600 text-[10px] font-black uppercase hover:text-white transition-all"
      >
        跳过（我已安装或稍后安装）
      </button>
    </div>
  );
}

function Step2FcmAuth({
  credentialsInput,
  setCredentialsInput,
  loading,
  onSubmit,
  onBack,
  fcmStatus,
  isUsingEdge,
  onSkipToStep3
}) {
  const hasCredentials = fcmStatus.hasCredentials || fcmStatus.hasStoredCredentials;

  return (
    <div className="space-y-6 animate-fade-in">
      {!isUsingEdge && <EdgeRequiredNotice />}

      {/* 如果已有凭证，显示跳过选项 */}
      {hasCredentials && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 tactic-cut">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FaCheck className="text-green-500" />
              <span className="text-sm text-green-400">检测到已有 FCM 凭证</span>
            </div>
            <button
              onClick={onSkipToStep3}
              className="px-4 py-2 bg-green-500/20 text-green-400 text-xs font-bold tactic-cut hover:bg-green-500/30 transition-all"
            >
              使用现有凭证 <FaArrowRight className="inline ml-1" />
            </button>
          </div>
        </div>
      )}

      <div className="p-4 bg-white/[0.02] border border-white/5 tactic-cut">
        <h3 className="text-xs font-black text-[#cd5241] uppercase tracking-widest mb-4 flex items-center gap-2">
          <FaInfoCircle /> 获取凭证步骤
        </h3>
        <div className="space-y-3">
          <GuideStep num="1" text={`在 ${REQUIRED_PLUGIN_BROWSER} 中安装并启用插件`} />
          <GuideStep num="2" text="点击下方按钮，打开 Steam 官方授权页面并登录" />
          <GuideStep num="3" text="登录成功后，插件页面复制完整凭证命令" />
          <GuideStep num="4" text="将 /credentials add ... 命令粘贴到下方并提交" />
        </div>
      </div>

      <button
        onClick={() => window.open(STEAM_LOGIN_URL, '_blank')}
        className="w-full p-4 bg-[#1b2838] border border-[#66c0f4]/30 tactic-cut flex items-center justify-center gap-3 hover:bg-[#2a475e] transition-all group"
      >
        <FaSteam className="text-2xl text-[#66c0f4]" />
        <span className="font-bold text-white">打开 Steam 登录页面</span>
        <FaExternalLinkAlt className="text-gray-500 group-hover:text-[#66c0f4] transition-colors" />
      </button>

      <div className="space-y-2">
        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest border-l-2 border-[#cd5241] pl-2">
          粘贴凭证命令
        </label>
        <textarea
          className="w-full bg-black/40 border border-white/10 tactic-cut p-4 text-[11px] font-mono text-[#cd5241] h-28 outline-none focus:border-[#cd5241]/50 transition-all custom-scrollbar placeholder:text-gray-700"
          placeholder="/credentials add gcm_android_id:xxx gcm_security_token:xxx ..."
          value={credentialsInput}
          onChange={(e) => setCredentialsInput(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-4 tactic-cut border border-white/10 text-gray-500 text-[10px] font-black uppercase hover:text-white transition-all flex items-center gap-2"
        >
          <FaArrowLeft /> 上一步
        </button>
        <button
          onClick={onSubmit}
          disabled={loading || !credentialsInput.trim()}
          className={`flex-1 tactic-cut py-4 text-[11px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-3 ${
            loading || !credentialsInput.trim()
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-[#cd5241] hover:bg-[#b04537]'
          }`}
        >
          {loading ? <FaSpinner className="animate-spin" /> : <FaShieldAlt />}
          {loading ? '验证中...' : '提交凭证'}
        </button>
      </div>
    </div>
  );
}

function Step3GamePairing({ isListening, loading, onStartListening, onStopListening, onBack, fcmStatus }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {!isListening && !fcmStatus.isListening ? (
        <>
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-[#cd5241]/10 border border-[#cd5241]/30 tactic-cut flex items-center justify-center mx-auto mb-4">
              <FaGamepad className="text-2xl text-[#cd5241]" />
            </div>
            <h3 className="text-lg font-black uppercase italic text-white mb-2">启动监听</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              凭证就绪后，先启动监听，再回到游戏里发起 Pair。
            </p>
          </div>

          <button
            onClick={onStartListening}
            disabled={loading}
            className="w-full tactic-cut bg-[#cd5241] py-5 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#b04537] transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#cd5241]/20"
          >
            {loading ? <FaSpinner className="animate-spin" /> : <FaPlay />}
              {loading ? '启动中...' : '开始监听'}
            </button>
        </>
      ) : (
        <>
          <div className="p-4 bg-green-500/10 border border-green-500/20 tactic-cut">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-green-400">监听已启动，等待游戏内 Pair...</span>
            </div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">
              等待 Rust 游戏内发起配对请求
            </p>
          </div>

          <div className="p-4 bg-white/[0.02] border border-white/5 tactic-cut space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-l-2 border-[#cd5241] pl-2">
              在游戏中完成以下操作
            </p>
            <GuideStep num="1" text="在 Rust 游戏中按下 [ESC] 键" />
            <GuideStep num="2" text="点击右下角的 Rust+ 图标" />
            <GuideStep num="3" text="点击 'Pair with Server' 发送配对信号" />
            <GuideStep num="4" text="等待本页面自动跳转" />
          </div>

          <div className="flex items-center justify-center py-8">
            <div className="relative">
              <div className="w-20 h-20 border-2 border-[#cd5241]/20 rounded-full" />
              <div className="absolute inset-0 w-20 h-20 border-t-2 border-[#cd5241] rounded-full animate-spin" />
              <FaSatellite className="absolute inset-0 m-auto text-[#cd5241] text-2xl" />
            </div>
          </div>

          <button
            onClick={onStopListening}
            disabled={loading}
            className="w-full py-3 border border-red-500/30 text-red-500 text-[10px] font-black uppercase tactic-cut hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
          >
            <FaStop /> 停止监听
          </button>
        </>
      )}

      <button
        onClick={onBack}
        className="w-full py-3 border border-white/10 tactic-cut text-gray-600 text-[10px] font-black uppercase hover:text-white transition-all flex items-center justify-center gap-2"
      >
        <FaArrowLeft /> 返回上一步
      </button>
    </div>
  );
}

function Step4Complete({ pairedServer, onFinish }) {
  return (
    <div className="text-center py-8 animate-fade-in">
      <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 tactic-cut flex items-center justify-center mx-auto mb-6">
        <FaCheckCircle className="text-4xl text-green-500" />
      </div>

      <h3 className="text-2xl font-black uppercase italic text-green-400 mb-2">
        配对成功
      </h3>
      <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-8">
        Server Successfully Paired
      </p>

      {pairedServer && (
        <div className="p-4 bg-white/[0.02] border border-white/5 tactic-cut mb-8 text-left max-w-sm mx-auto">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">服务器名称</span>
              <span className="text-white font-bold">{pairedServer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">地址</span>
              <span className="text-gray-300 font-mono">{pairedServer.ip}:{pairedServer.port}</span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onFinish}
        className="px-12 py-4 bg-[#cd5241] text-white font-black uppercase tactic-cut hover:bg-[#b04537] transition-all flex items-center gap-3 mx-auto shadow-lg shadow-[#cd5241]/20"
      >
        <FaRocket /> 进入控制台
      </button>
    </div>
  );
}

function EdgeRequiredNotice({ compact = false }) {
  return (
    <div className={`tactic-cut border border-yellow-500/30 bg-yellow-500/10 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <FaExclamationTriangle className="text-yellow-400 mt-0.5" />
        <p className="text-[11px] text-yellow-100/90 leading-relaxed">
          FCM 凭证需通过 <strong>{REQUIRED_PLUGIN_BROWSER} 插件</strong> 获取。当前可继续流程，
          但请确保最终粘贴的命令来自 Edge 插件。
        </p>
      </div>
    </div>
  );
}

function StatusPill({ label, active, activeText, inactiveText }) {
  return (
    <div className={`px-2.5 py-1.5 tactic-cut border text-[10px] uppercase tracking-wider ${
      active
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-white/5 border-white/10 text-gray-500'
    }`}>
      <span className="font-black">{label}</span>
      <span className="mx-1 text-gray-600">·</span>
      <span>{active ? activeText : inactiveText}</span>
    </div>
  );
}

function GuideStep({ num, text }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] font-mono font-black text-[#cd5241] bg-[#cd5241]/10 px-1.5 py-0.5 tactic-cut">
        {num}
      </span>
      <span className="text-[11px] text-gray-400 leading-relaxed">{text}</span>
    </div>
  );
}

export default PairingWizard;
