import { useState, useEffect } from 'react';
import { FaQrcode, FaPlay, FaStop, FaSync, FaCheckCircle, FaTimesCircle, FaKey, FaRocket } from 'react-icons/fa';
import { getPairingStatus, startPairing, stopPairing, resetPairing, submitCredentials } from '../services/pairing';
import socketService from '../services/socket';
import CredentialsInput from './CredentialsInput';
import AutoRegisterPanel from './AutoRegisterPanel';

function PairingPanel({ onServerPaired }) {
  const [status, setStatus] = useState({
    isListening: false,
    hasCredentials: false,
    hasStoredCredentials: false
  });
  const [loading, setLoading] = useState(false);
  const [waitingForPairing, setWaitingForPairing] = useState(false);
  const [showCredentialsInput, setShowCredentialsInput] = useState(false);
  const [showAutoRegister, setShowAutoRegister] = useState(false);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await getPairingStatus();
        const currentStatus = response.data.status;
        setStatus(currentStatus);

        // 如果正在监听，自动设置为等待配对状态
        if (currentStatus.isListening) {
          setWaitingForPairing(true);
        }
      } catch (error) {
        console.error('获取配对状态失败:', error);
      }
    };

    loadStatus();

    // 监听服务器配对事件
    const handleServerPaired = (serverInfo) => {
      console.log('✅ 服务器配对成功:', serverInfo);
      setWaitingForPairing(false);
      fetchStatus();

      if (onServerPaired) {
        onServerPaired(serverInfo);
      }

      // 显示成功通知
      alert(`服务器配对成功!\n\n名称: ${serverInfo.name}\nIP: ${serverInfo.ip}:${serverInfo.port}`);
    };

    // 监听设备配对事件
    const handleEntityPaired = (entityInfo) => {
      console.log('✅ 设备配对成功:', entityInfo);
      alert(`设备配对成功!\n\n设备 ID: ${entityInfo.entityId}\n类型: ${entityInfo.entityType || '未知'}`);
    };

    // 监听警报
    const handleAlarm = (alarmInfo) => {
      console.log('🚨 警报:', alarmInfo);
      alert(`警报!\n\n${alarmInfo.title}\n${alarmInfo.message}`);
    };

    socketService.on('server:paired', handleServerPaired);
    socketService.on('entity:paired', handleEntityPaired);
    socketService.on('alarm', handleAlarm);

    return () => {
      socketService.off('server:paired', handleServerPaired);
      socketService.off('entity:paired', handleEntityPaired);
      socketService.off('alarm', handleAlarm);
    };
  }, [onServerPaired]);

  const fetchStatus = async () => {
    try {
      const response = await getPairingStatus();
      setStatus(response.data.status);
    } catch (error) {
      console.error('获取配对状态失败:', error);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await startPairing();
      setWaitingForPairing(true);
      await fetchStatus();
    } catch (error) {
      console.error('启动配对失败:', error);
      alert('启动失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await stopPairing();
      setWaitingForPairing(false);
      await fetchStatus();
    } catch (error) {
      console.error('停止配对失败:', error);
      alert('停止失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置 FCM 凭证吗？这将清空现有凭证，需要重新输入。')) {
      return;
    }

    setLoading(true);
    setWaitingForPairing(false);

    try {
      const response = await resetPairing();
      console.log('重置响应:', response.data);

      // 更新状态
      await fetchStatus();

      // 显示凭证输入界面
      setShowCredentialsInput(true);

      // 显示成功提示
      const message = response.data.message || 'FCM 凭证已清空';
      alert(`✅ ${message}`);
    } catch (error) {
      console.error('重置失败:', error);
      const errorMsg = error.response?.data?.error || error.message || '未知错误';
      alert(`❌ 重置失败: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSubmit = async (credentials) => {
    setLoading(true);
    try {
      await submitCredentials(credentials);
      setShowCredentialsInput(false);
      setWaitingForPairing(true);
      await fetchStatus();
      alert('凭证已保存并开始监听！');
    } catch (error) {
      console.error('提交凭证失败:', error);
      alert('提交失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 注意：不要完全替换组件，而是用模态框显示

  return (
    <>
      {/* 自动注册模态框 */}
      {showAutoRegister && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-2xl w-full mx-4">
            <AutoRegisterPanel
              onComplete={async () => {
                setShowAutoRegister(false);
                await fetchStatus();
              }}
              onClose={() => setShowAutoRegister(false)}
            />
          </div>
        </div>
      )}

      {/* 手动凭证输入模态框 */}
      {showCredentialsInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-3xl w-full mx-4">
            <CredentialsInput
              onSubmit={handleCredentialsSubmit}
              onClose={() => setShowCredentialsInput(false)}
            />
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-rust-gray">
          <FaQrcode className="text-rust-orange text-xl" />
          <h2 className="text-xl font-bold">服务器配对</h2>
        </div>

      {/* 状态显示 */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between p-3 bg-rust-gray rounded-lg">
          <span className="text-sm font-medium">FCM 监听状态</span>
          <div className="flex items-center gap-2">
            {status.isListening ? (
              <>
                <FaCheckCircle className="text-green-500" />
                <span className="text-green-500 text-sm">运行中</span>
              </>
            ) : (
              <>
                <FaTimesCircle className="text-gray-500" />
                <span className="text-gray-400 text-sm">未启动</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-rust-gray rounded-lg">
          <span className="text-sm font-medium">FCM 凭证</span>
          <div className="flex items-center gap-2">
            {status.hasStoredCredentials ? (
              <>
                <FaCheckCircle className="text-green-500" />
                <span className="text-green-500 text-sm">已保存</span>
              </>
            ) : (
              <>
                <FaTimesCircle className="text-gray-500" />
                <span className="text-gray-400 text-sm">未配置</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 等待配对提示 */}
      {waitingForPairing && (
        <div className="mb-6 p-4 bg-rust-orange bg-opacity-20 border border-rust-orange rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="animate-spin">
              <FaSync className="text-rust-orange" />
            </div>
            <span className="font-semibold text-rust-orange">等待游戏内配对...</span>
          </div>
          <div className="text-sm text-gray-300 space-y-2">
            <p>1. 在 Rust 游戏中按 <kbd className="px-2 py-1 bg-rust-dark rounded">ESC</kbd></p>
            <p>2. 点击右下角的 Rust+ 图标</p>
            <p>3. 点击 "Pair with Server" 配对服务器</p>
            <p>4. 或对着智能设备点击 "Pair" 配对设备</p>
          </div>
        </div>
      )}

      {/* 配对说明 */}
      <div className="mb-6 p-4 bg-rust-gray rounded-lg">
        <h3 className="font-semibold mb-3">配对流程说明</h3>
        <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
          <li>点击下方"启动配对监听"按钮</li>
          <li>在 Rust 游戏中进入任意服务器</li>
          <li>按 ESC 打开菜单，点击 Rust+ 图标</li>
          <li>点击 "Pair with Server" 进行配对</li>
          <li>配对成功后服务器信息会自动保存</li>
          <li>系统会自动连接到配对的服务器</li>
        </ol>
      </div>

      {/* 控制按钮 */}
      <div className="space-y-3">
        {!status.hasStoredCredentials && (
          <div className="mb-4 p-4 bg-rust-orange bg-opacity-20 border border-rust-orange rounded-lg">
            <p className="text-sm text-gray-300 mb-3">
              ⚠️ 未找到 FCM 凭证。请选择注册方式：
            </p>
            <div className="space-y-2">
              <button
                className="btn btn-primary w-full flex items-center justify-center gap-2"
                onClick={() => setShowAutoRegister(true)}
              >
                <FaRocket />
                自动注册（推荐）
              </button>
              <button
                className="btn btn-secondary w-full flex items-center justify-center gap-2"
                onClick={() => setShowCredentialsInput(true)}
              >
                <FaKey />
                手动输入凭证
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              推荐使用自动注册，只需点击按钮并完成 Steam 登录即可
            </p>
          </div>
        )}

        {status.hasStoredCredentials && !status.isListening && (
          <button
            className="btn btn-primary w-full flex items-center justify-center gap-2"
            onClick={handleStart}
            disabled={loading}
          >
            <FaPlay />
            {loading ? '启动中...' : '启动配对监听'}
          </button>
        )}

        {status.isListening && (
          <button
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
            onClick={handleStop}
            disabled={loading}
          >
            <FaStop />
            {loading ? '停止中...' : '停止配对监听'}
          </button>
        )}

        {status.hasStoredCredentials && (
          <button
            className="btn btn-danger w-full flex items-center justify-center gap-2"
            onClick={handleReset}
            disabled={loading}
          >
            <FaSync />
            {loading ? '重置中...' : '重置 FCM 凭证'}
          </button>
        )}
      </div>

      {/* 提示信息 */}
      <div className="mt-6 p-3 bg-rust-gray rounded-lg text-xs text-gray-400">
        <p className="mb-2">💡 提示：</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>首次使用需要启动配对监听</li>
          <li>FCM 凭证会自动保存，下次启动会自动加载</li>
          <li>每次配对都会自动保存服务器信息并连接</li>
          <li>也可以配对智能设备，在游戏中对着设备点击 Pair</li>
        </ul>
      </div>
      </div>
    </>
  );
}

export default PairingPanel;
