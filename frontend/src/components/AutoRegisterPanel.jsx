import { useState } from 'react';
import { FaRocket, FaCheckCircle, FaSpinner, FaSteam } from 'react-icons/fa';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function AutoRegisterPanel({ onComplete, onClose }) {
  const [step, setStep] = useState(1); // 1: 初始, 2: 等待输入凭证, 3: 注册中, 4: 成功
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [steamWindow, setSteamWindow] = useState(null);
  const [credentialsInput, setCredentialsInput] = useState('');

  // 打开 Steam 登录页面（新标签页）
  const handleOpenSteamLogin = () => {
    setStep(2);

    // 在新标签页打开 Steam 登录
    const steamWin = window.open(
      'https://companion-rust.facepunch.com/login',
      '_blank'
    );
    setSteamWindow(steamWin);
  };

  // 处理凭证提交（简化版：直接使用 Companion 凭证）
  const handleSubmitCredentials = async () => {
    if (!credentialsInput.trim()) {
      setError('请输入凭证命令');
      return;
    }

    setLoading(true);
    setError('');
    setStep(3);

    try {
      const response = await axios.post(`${API_URL}/pairing/register/simple`, {
        credentials_command: credentialsInput,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || '注册失败');
      }

      setStep(4);

      // 关闭 Steam 窗口
      if (steamWindow && !steamWindow.closed) {
        steamWindow.close();
      }

      // 2秒后完成
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, 2000);
    } catch (err) {
      console.error('提交凭证失败:', err);
      setError(err.response?.data?.error || err.message || '提交失败');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="card max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-rust-gray">
        <div className="flex items-center gap-2">
          <FaRocket className="text-rust-orange text-xl" />
          <h2 className="text-xl font-bold">自动注册 FCM 推送</h2>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 步骤指示器 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <StepIndicator num={1} label="Steam 登录" active={step >= 2} completed={step > 2} />
          <div className="flex-1 h-0.5 bg-rust-gray mx-2"></div>
          <StepIndicator num={2} label="获取凭证" active={step >= 2} completed={step > 2} />
          <div className="flex-1 h-0.5 bg-rust-gray mx-2"></div>
          <StepIndicator num={3} label="完成" active={step >= 3} completed={step >= 4} />
        </div>
      </div>

      {/* 步骤 1: 初始 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="p-4 bg-rust-gray rounded-lg">
            <h3 className="font-semibold mb-3">简化注册流程说明</h3>
            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>点击"开始注册"，自动打开 Steam 登录窗口</li>
              <li>使用 Steam 账号登录 Companion</li>
              <li>登录成功后，复制页面显示的凭证命令</li>
              <li>粘贴凭证并完成注册</li>
            </ol>
          </div>

          <div className="p-4 bg-blue-500 bg-opacity-20 border border-blue-500 rounded-lg text-sm text-gray-300">
            <p className="font-semibold mb-2">✨ 原理说明</p>
            <p>
              Companion 登录时会给你的账号分配一个已注册的设备凭证。
              我们直接使用这个凭证连接 FCM，无需重新注册。
            </p>
          </div>

          <button
            className="btn btn-primary w-full flex items-center justify-center gap-2 text-lg py-4"
            onClick={handleOpenSteamLogin}
            disabled={loading}
          >
            <FaRocket />
            开始注册
          </button>

          <button
            className="btn btn-secondary w-full"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      )}

      {/* 步骤 2: 输入凭证 */}
      {step === 2 && (
        <div className="space-y-4">

          <div className="p-4 bg-rust-orange bg-opacity-20 border border-rust-orange rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <FaSteam className="text-rust-orange text-2xl" />
              <span className="font-semibold text-rust-orange">步骤：获取 Companion 凭证</span>
            </div>
            <div className="text-sm text-gray-300 space-y-3">
              <div>
                <p className="font-semibold mb-2">请按照以下步骤操作：</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>在弹出的窗口中完成 Steam 登录</li>
                  <li>登录成功后，页面会显示一个输入框</li>
                  <li>输入框中有一行类似这样的内容：
                    <div className="mt-2 p-2 bg-rust-dark rounded text-xs font-mono overflow-x-auto">
                      /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx ...
                    </div>
                  </li>
                  <li>复制输入框中的<strong>完整命令</strong></li>
                  <li>粘贴到下方的输入框中</li>
                  <li>点击"完成注册"</li>
                </ol>
              </div>

              <div className="pt-3 border-t border-rust-gray">
                <p className="text-xs text-gray-400">
                  提示：如果窗口未弹出，<a
                    href="https://companion-rust.facepunch.com/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rust-orange hover:underline"
                  >点击这里手动打开</a>
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              粘贴凭证命令 <span className="text-red-500">*</span>
            </label>
            <textarea
              className="input w-full font-mono text-xs h-24"
              placeholder="/credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx issued_date:xxx expire_date:xxx"
              value={credentialsInput}
              onChange={(e) => setCredentialsInput(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-2">
              这些凭证是你的 Steam 账号在 Companion 中的已注册设备信息。
              我们直接使用这些凭证连接 FCM，无需 auth_token。
            </p>
          </div>

          <button
            className="btn btn-primary w-full flex items-center justify-center gap-2"
            onClick={handleSubmitCredentials}
            disabled={loading || !credentialsInput.trim()}
          >
            {loading ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />}
            {loading ? '注册中...' : '完成注册'}
          </button>

          <button
            className="btn btn-secondary w-full"
            onClick={() => {
              if (steamWindow && !steamWindow.closed) {
                steamWindow.close();
              }
              setStep(1);
              setCredentialsInput('');
            }}
          >
            取消并重新开始
          </button>
        </div>
      )}

      {/* 步骤 3: 注册中 */}
      {step === 3 && (
        <div className="text-center py-8">
          <FaSpinner className="animate-spin text-rust-orange text-4xl mx-auto mb-4" />
          <p className="text-lg font-semibold">正在连接 FCM...</p>
          <p className="text-sm text-gray-400 mt-2">使用 Companion 凭证建立连接</p>
        </div>
      )}

      {/* 步骤 4: 成功 */}
      {step === 4 && (
        <div className="text-center py-8">
          <FaCheckCircle className="text-green-500 text-5xl mx-auto mb-4" />
          <p className="text-lg font-semibold text-green-500">注册成功！</p>
          <p className="text-sm text-gray-400 mt-2">FCM 推送监听已启动，即将返回...</p>
        </div>
      )}
    </div>
  );
}

// 步骤指示器组件
function StepIndicator({ num, label, active, completed }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-bold
        ${completed ? 'bg-green-500 text-white' : active ? 'bg-rust-orange text-white' : 'bg-rust-gray text-gray-500'}
      `}>
        {completed ? <FaCheckCircle /> : num}
      </div>
      <span className={`text-xs mt-1 ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
    </div>
  );
}

export default AutoRegisterPanel;
