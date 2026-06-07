import { useState, useEffect } from 'react';
import {
  FaEdge, FaExternalLinkAlt, FaPuzzlePiece, FaSteam,
  FaCheck, FaLock, FaArrowLeft, FaArrowRight, FaSpinner,
  FaSatellite, FaGamepad, FaCheckCircle, FaRocket, FaShieldAlt,
  FaKey, FaPlay, FaStop, FaTimes, FaInfoCircle,
  FaExclamationTriangle, FaCreditCard, FaChrome, FaDownload, FaBook
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { getPairingStatus, startPairing, stopPairing, registerSimple } from '../services/pairing';
import socketService from '../services/socket';
import {
  EDGE_EXTENSION_URL,
  CHROME_EXTENSION_DOWNLOAD,
  CHROME_INSTALL_GUIDE,
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
    { id: 1, label: 'INSTALL', title: '安装 Edge 插件', icon: FaPuzzlePiece },
    { id: 2, label: 'CREDENTIALS', title: '获取凭证', icon: FaKey },
    { id: 3, label: 'LISTEN', title: '启动监听', icon: FaGamepad },
    { id: 4, label: 'PAIRED', title: '完成配对', icon: FaCheckCircle }
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
      <div className="h-full flex items-center justify-center animate-fade-in p-6">
        <div className="max-w-lg w-full">
          <WizardContainer>
            <WizardHeader steps={steps} currentStep={0} getStepStatus={() => 'locked'} />

            <div className="p-8">
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-hazard-dim border border-hazard/40 flex items-center justify-center mx-auto mb-6">
                  <FaLock className="text-3xl text-hazard" />
                </div>

                <div className="tac-label mb-2">SUBSCRIPTION EXPIRED</div>
                <h3 className="text-2xl font-extrabold text-fg mb-3">
                  服务已暂停
                </h3>
                <p className="text-fg-dim text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                  您的订阅已过期，续费后即可继续使用配对功能
                </p>

                <div className="p-4 bg-hazard-dim border border-hazard/40 mb-8">
                  <div className="flex items-center justify-center gap-3 text-fg text-sm">
                    <FaExclamationTriangle className="text-hazard" />
                    <span>
                      订阅过期时间：
                      <span className="font-mono tabular-nums text-fg ml-1">
                        {user?.subscriptionEndDate ? new Date(user.subscriptionEndDate).toLocaleDateString() : '未知'}
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => window.location.href = '/account'}
                  className="tac-btn tac-btn-primary mx-auto"
                >
                  <FaCreditCard /> 立即续费 // RENEW
                </button>
              </div>
            </div>

            <WizardFooter>
              <button
                onClick={onCancel}
                className="tac-btn tac-btn-ghost"
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

          <div className="mx-6 mt-6 p-4 bg-ink-800 border border-ink-line">
            <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
              <StatusPill
                label="EDGE"
                active={isUsingEdge}
                activeText="当前为 Edge"
                inactiveText="当前非 Edge（可继续，但凭证必须来自 Edge 插件）"
              />
              <StatusPill
                label="FCM"
                active={hasCredentials}
                activeText="已配置"
                inactiveText="未配置"
              />
              <StatusPill
                label="LISTEN"
                active={isPairingListening}
                activeText="监听中"
                inactiveText="未启动"
              />
            </div>
            {hasCredentials && (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="tac-label">STEAM ID</span>
                <span className="font-mono text-xs tabular-nums text-fg-dim">{fcmStatus.steamId || '未知'}</span>
              </div>
            )}
          </div>

          {/* 步骤内容 */}
          <div className="p-6">
            {currentStep === 1 && (
              <Step1InstallPlugin
                browser={browser}
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
              className="tac-btn tac-btn-ghost"
            >
              <FaArrowLeft /> 返回首页
            </button>

            {currentStep < 4 && (
              <div className="tac-label flex items-center gap-1.5">
                STEP <span className="font-mono tabular-nums text-fg">{currentStep}</span> / 4
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
    <div className="tac-panel tac-corners relative">
      {children}
    </div>
  );
}

function WizardHeader({ steps, currentStep, getStepStatus }) {
  return (
    <div className="p-6 border-b border-ink-line">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-hazard-dim border border-hazard/40 flex items-center justify-center text-hazard">
          <FaSatellite className="text-xl" />
        </div>
        <div>
          <div className="tac-label mb-1">SERVER PAIRING WIZARD</div>
          <h2 className="text-xl font-extrabold text-fg tracking-tight">
            服务器配对向导
          </h2>
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
                  w-10 h-10 flex items-center justify-center font-mono tabular-nums text-sm font-bold transition-colors duration-150 border
                  ${status === 'completed' ? 'bg-ink-800 border-terminal/40 text-terminal' :
                    status === 'active' ? 'bg-hazard border-hazard text-white' :
                    status === 'locked' ? 'bg-ink-800 border-ink-line text-fg-mute' :
                    'bg-ink-850 border-ink-line text-fg-mute'}
                `}>
                  {status === 'completed' ? <FaCheck className="text-xs" /> :
                   status === 'locked' ? <FaLock className="text-xs" /> :
                   status === 'active' ? <span>{step.id}</span> :
                   <Icon className="text-sm" />}
                </div>
                <span className={`tac-label mt-2 text-[9px] ${
                  status === 'active' ? 'text-fg' :
                  status === 'completed' ? 'text-fg-dim' :
                  'text-fg-mute'
                }`}>
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className={`flex-1 h-px mx-3 transition-colors duration-150 ${
                  getStepStatus(step.id + 1) !== 'pending' ? 'bg-hazard' : 'bg-ink-line'
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
    <div className="p-4 border-t border-ink-line flex items-center justify-between bg-ink-850">
      {children}
    </div>
  );
}

// ============ 步骤组件 ============

function Step1InstallPlugin({ browser, onNext, onSkip }) {
  const isChrome = browser === 'chrome';
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-4 bg-ink-800 border border-ink-line">
        <div className="flex items-start gap-3">
          <FaInfoCircle className="text-fg-dim mt-0.5 shrink-0" />
          <p className="text-xs text-fg-dim leading-relaxed">
            获取 FCM 凭证需要安装浏览器插件。Edge 可从商店一键安装；Chrome 商店版即将上架，当前可手动安装（约 1 分钟）。
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="tac-label border-l-2 border-hazard pl-2">
          INSTALL PLUGIN // 安装插件
        </div>

        {/* Edge：商店一键安装 */}
        <button
          onClick={() => window.open(EDGE_EXTENSION_URL, '_blank')}
          className={`w-full p-4 flex items-center gap-4 transition-colors duration-150 border bg-ink-800 hover:border-hazard/50 ${!isChrome ? 'border-hazard/50' : 'border-ink-line'}`}
        >
          <div className="w-10 h-10 bg-hazard-dim border border-hazard/40 flex items-center justify-center">
            <FaEdge className="text-hazard text-xl" />
          </div>
          <div className="text-left flex-1">
            <div className="font-bold text-sm text-fg">Microsoft Edge</div>
            <div className="text-[11px] text-fg-dim">加载项商店 · 一键安装</div>
          </div>
          <FaExternalLinkAlt className="text-fg-mute" />
        </button>

        {/* Chrome：商店未上架前，手动安装（下载 + 教程） */}
        <div className={`p-4 border bg-ink-800 ${isChrome ? 'border-hazard/50' : 'border-ink-line'}`}>
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 bg-hazard-dim border border-hazard/40 flex items-center justify-center">
              <FaChrome className="text-hazard text-xl" />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold text-sm text-fg flex items-center gap-2 flex-wrap">
                Google Chrome
                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-hazard-dim border border-hazard/40 text-hazard uppercase tracking-wider">商店即将上架</span>
              </div>
              <div className="text-[11px] text-fg-dim">当前手动安装</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={CHROME_EXTENSION_DOWNLOAD} download className="tac-btn tac-btn-ghost !py-2.5 justify-center">
              <FaDownload className="text-xs" /> 下载插件
            </a>
            <button onClick={() => window.open(CHROME_INSTALL_GUIDE, '_blank')} className="tac-btn tac-btn-ghost !py-2.5 justify-center">
              <FaBook className="text-xs" /> 安装教程
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 bg-hazard-dim border border-hazard/30">
        <p className="text-[11px] text-fg-dim leading-relaxed">
          <span className="font-mono text-hazard-bright text-[10px] uppercase tracking-wider mr-1">TIP</span>
          安装后请在浏览器里打开插件并登录 Steam，确认能复制
          <span className="text-hazard font-mono"> /credentials add ... </span>
          命令再继续。
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onNext}
          className="flex-1 tac-btn tac-btn-primary"
        >
          <FaCheck /> 已完成安装，继续
        </button>
      </div>

      <button
        onClick={onSkip}
        className="w-full tac-btn tac-btn-ghost !py-3"
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
        <div className="p-4 bg-ink-800 border border-terminal/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-terminal" />
              <span className="text-sm text-fg">检测到已有 FCM 凭证</span>
            </div>
            <button
              onClick={onSkipToStep3}
              className="tac-btn tac-btn-ghost !py-2 !px-4 shrink-0"
            >
              使用现有凭证 <FaArrowRight className="text-[10px]" />
            </button>
          </div>
        </div>
      )}

      <div className="p-4 bg-ink-800 border border-ink-line">
        <div className="tac-label mb-4 flex items-center gap-2">
          <FaInfoCircle className="text-hazard" /> GET CREDENTIALS // 获取凭证步骤
        </div>
        <div className="space-y-3">
          <GuideStep num="1" text={`在 ${REQUIRED_PLUGIN_BROWSER} 中安装并启用插件`} />
          <GuideStep num="2" text="点击下方按钮，打开 Steam 官方授权页面并登录" />
          <GuideStep num="3" text="登录成功后，插件页面复制完整凭证命令" />
          <GuideStep num="4" text="将 /credentials add ... 命令粘贴到下方并提交" />
        </div>
      </div>

      <button
        onClick={() => window.open(STEAM_LOGIN_URL, '_blank')}
        className="w-full p-4 bg-ink-800 border border-ink-line flex items-center justify-center gap-3 hover:border-hazard/50 transition-colors duration-150 group"
      >
        <FaSteam className="text-2xl text-fg" />
        <span className="font-bold text-fg">打开 Steam 登录页面</span>
        <FaExternalLinkAlt className="text-fg-mute group-hover:text-hazard transition-colors" />
      </button>

      <div className="space-y-2">
        <label className="block tac-label border-l-2 border-hazard pl-2">
          PASTE COMMAND // 粘贴凭证命令
        </label>
        <textarea
          className="tac-input h-28 font-mono text-[11px] text-hazard custom-scrollbar placeholder:text-fg-mute resize-none"
          placeholder="/credentials add gcm_android_id:xxx gcm_security_token:xxx ..."
          value={credentialsInput}
          onChange={(e) => setCredentialsInput(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="tac-btn tac-btn-ghost"
        >
          <FaArrowLeft /> 上一步
        </button>
        <button
          onClick={onSubmit}
          disabled={loading || !credentialsInput.trim()}
          className="flex-1 tac-btn tac-btn-primary"
        >
          {loading ? <FaSpinner className="animate-spin" /> : <FaShieldAlt />}
          {loading ? '验证中 // VERIFYING...' : '提交凭证 // SUBMIT'}
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
            <div className="w-16 h-16 bg-hazard-dim border border-hazard/40 flex items-center justify-center mx-auto mb-4">
              <FaGamepad className="text-2xl text-hazard" />
            </div>
            <div className="tac-label mb-2">START LISTENING</div>
            <h3 className="text-lg font-extrabold text-fg mb-2">启动监听</h3>
            <p className="text-xs text-fg-dim max-w-sm mx-auto leading-relaxed">
              凭证就绪后，先启动监听，再回到游戏里发起 Pair。
            </p>
          </div>

          <button
            onClick={onStartListening}
            disabled={loading}
            className="w-full tac-btn tac-btn-primary !py-5"
          >
            {loading ? <FaSpinner className="animate-spin" /> : <FaPlay />}
            {loading ? '启动中 // STARTING...' : '开始监听 // START'}
          </button>
        </>
      ) : (
        <>
          <div className="p-4 bg-hazard-dim border border-hazard/40">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" />
              <span className="text-sm font-bold text-fg">监听已启动，等待游戏内 Pair...</span>
            </div>
            <div className="tac-label">WAITING FOR IN-GAME PAIR REQUEST</div>
          </div>

          <div className="p-4 bg-ink-800 border border-ink-line space-y-3">
            <div className="tac-label border-l-2 border-hazard pl-2">
              IN-GAME STEPS // 在游戏中完成以下操作
            </div>
            <GuideStep num="1" text="在 Rust 游戏中按下 [ESC] 键" />
            <GuideStep num="2" text="点击右下角的 Rust+ 图标" />
            <GuideStep num="3" text="点击 'Pair with Server' 发送配对信号" />
            <GuideStep num="4" text="等待本页面自动跳转" />
          </div>

          <div className="flex items-center justify-center py-8">
            <div className="relative">
              <div className="w-20 h-20 border-2 border-hazard/20" />
              <div className="absolute inset-0 w-20 h-20 border-t-2 border-hazard animate-spin" />
              <FaSatellite className="absolute inset-0 m-auto text-hazard text-2xl" />
            </div>
          </div>

          <button
            onClick={onStopListening}
            disabled={loading}
            className="w-full tac-btn tac-btn-ghost !py-3"
          >
            <FaStop /> 停止监听 // STOP
          </button>
        </>
      )}

      <button
        onClick={onBack}
        className="w-full tac-btn tac-btn-ghost !py-3"
      >
        <FaArrowLeft /> 返回上一步
      </button>
    </div>
  );
}

function Step4Complete({ pairedServer, onFinish }) {
  return (
    <div className="text-center py-8 animate-fade-in">
      <div className="w-20 h-20 bg-ink-800 border border-terminal/40 flex items-center justify-center mx-auto mb-6">
        <FaCheckCircle className="text-4xl text-terminal" />
      </div>

      <div className="tac-label mb-2 flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 bg-terminal" /> SERVER SUCCESSFULLY PAIRED
      </div>
      <h3 className="text-2xl font-extrabold text-fg mb-8">
        配对成功
      </h3>

      {pairedServer && (
        <div className="p-4 bg-ink-800 border border-ink-line mb-8 text-left max-w-sm mx-auto">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-baseline">
              <span className="text-fg-dim">服务器名称</span>
              <span className="text-fg font-bold">{pairedServer.name}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-fg-dim">地址</span>
              <span className="text-fg-dim font-mono tabular-nums">{pairedServer.ip}:{pairedServer.port}</span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onFinish}
        className="tac-btn tac-btn-primary mx-auto !px-12 !py-4"
      >
        <FaRocket /> 进入控制台 // LAUNCH
      </button>
    </div>
  );
}

function EdgeRequiredNotice({ compact = false }) {
  return (
    <div className={`border border-hazard/40 bg-hazard-dim ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <FaExclamationTriangle className="text-hazard mt-0.5 shrink-0" />
        <p className="text-[11px] text-fg leading-relaxed">
          FCM 凭证需通过 <strong>{REQUIRED_PLUGIN_BROWSER} 插件</strong> 获取。当前可继续流程，
          但请确保最终粘贴的命令来自 Edge 插件。
        </p>
      </div>
    </div>
  );
}

function StatusPill({ label, active, activeText, inactiveText }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] ${
      active
        ? 'bg-ink-850 border-terminal/30 text-terminal'
        : 'bg-ink-850 border-ink-line text-fg-mute'
    }`}>
      <span className={`w-1.5 h-1.5 ${active ? 'bg-terminal animate-tac-blink' : 'bg-fg-mute'}`} />
      <span className="font-mono uppercase tracking-wider font-bold">{label}</span>
      <span className="text-fg-mute">·</span>
      <span className="text-fg-dim">{active ? activeText : inactiveText}</span>
    </div>
  );
}

function GuideStep({ num, text }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] font-mono tabular-nums font-bold text-hazard bg-hazard-dim border border-hazard/30 px-1.5 py-0.5">
        {num}
      </span>
      <span className="text-[11px] text-fg-dim leading-relaxed">{text}</span>
    </div>
  );
}

export default PairingWizard;
