import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaQrcode, FaPlay, FaStop, FaSync, FaCheckCircle, FaTimesCircle, FaRocket, FaSatellite, FaInfoCircle, FaKey, FaShieldAlt, FaLock } from 'react-icons/fa';
import { getPairingStatus, startPairing, stopPairing, resetPairing } from '../services/pairing';
import socketService from '../services/socket';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { useAuth } from '../context/AuthContext';
import AutoRegisterPanel from './AutoRegisterPanel';

function PairingPanel({ onServerPaired }) {
  const { isSubscriptionExpired } = useAuth();
  const [status, setStatus] = useState({
    isListening: false,
    hasCredentials: false,
    hasStoredCredentials: false
  });
  const [loading, setLoading] = useState(false);
  const [waitingForPairing, setWaitingForPairing] = useState(false);
  const [showAutoRegister, setShowAutoRegister] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetchStatus();

    // 监听服务器配对事件
    const handleServerPaired = (serverInfo) => {
      setWaitingForPairing(false);
      fetchStatus();
      if (onServerPaired) onServerPaired(serverInfo);
      toast.success(`节点建立成功: ${serverInfo.name}`);
    };

    // 监听设备配对事件
    const handleEntityPaired = (entityInfo) => {
      toast.success(`新智能设备已上线 (ID: ${entityInfo.entityId})`);
    };

    // 监听服务器替换确认请求
    const handleServerReplaceConfirm = async (data) => {
      const { oldServer, newServer } = data;

      const confirmed = await confirm({
        type: 'warning',
        title: '切换服务器',
        message: `检测到您正在配对新服务器:\n\n当前: ${oldServer.name} (${oldServer.ip}:${oldServer.port})\n新的: ${newServer.name} (${newServer.ip}:${newServer.port})\n\n确定要替换吗？旧服务器的设备配置和事件记录将被删除。`,
        confirmText: '确认替换',
        cancelText: '保留当前'
      });

      // 发送确认响应
      socketService.sendServerReplaceResponse(confirmed);
    };

    socketService.on('server:paired', handleServerPaired);
    socketService.on('entity:paired', handleEntityPaired);
    socketService.on('server:replace:confirm', handleServerReplaceConfirm);

    return () => {
      socketService.off('server:paired', handleServerPaired);
      socketService.off('entity:paired', handleEntityPaired);
      socketService.off('server:replace:confirm', handleServerReplaceConfirm);
    };
  }, [onServerPaired, confirm]);

  const fetchStatus = async () => {
    try {
      const response = await getPairingStatus();
      const currentStatus = response.data.status;
      setStatus(currentStatus);
      if (currentStatus.isListening) setWaitingForPairing(true);
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
      toast.error('启动监听失败');
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
      toast.error('停止监听失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      type: 'warning',
      title: '重置授权凭证',
      message: '确定要重置 FCM 授权吗？这将导致现有监听失效，需要重新进行安全验证。',
      confirmText: '确定重置',
      cancelText: '取消'
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await resetPairing();
      await fetchStatus();
      setShowAutoRegister(true);
    } catch (error) {
      toast.error('重置操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans animate-fade-in">
      {/* 自动注册层级 */}
      {showAutoRegister && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
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

      {/* 状态矩阵 */}
      <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-black/40 border border-white/5 tactic-cut flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <FaSatellite className={`text-xs ${status.isListening ? 'text-[#a3e635] animate-pulse' : 'text-gray-600'}`} />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">链路监听器</span>
              </div>
              {status.isListening ? (
                  <span className="text-[9px] px-2 py-0.5 bg-[#a3e635]/10 text-[#a3e635] border border-[#a3e635]/30 tactic-cut font-black italic">ACTIVE</span>
              ) : (
                  <span className="text-[9px] px-2 py-0.5 bg-gray-800 text-gray-500 border border-white/5 tactic-cut font-black italic">STANDBY</span>
              )}
          </div>
          <div className="p-4 bg-black/40 border border-white/5 tactic-cut flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <FaKey className={`text-xs ${status.hasStoredCredentials ? 'text-[#cd5241]' : 'text-gray-600'}`} />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">授权密钥</span>
              </div>
              {status.hasStoredCredentials ? (
                  <span className="text-[9px] px-2 py-0.5 bg-[#cd5241]/10 text-[#cd5241] border border-[#cd5241]/30 tactic-cut font-black italic">LOADED</span>
              ) : (
                  <span className="text-[9px] px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/30 tactic-cut font-black italic">MISSING</span>
              )}
          </div>
      </div>

      {/* 动态工作区 */}
      <div className="tactic-border tactic-cut p-1 bg-[#cd5241]/5">
        <div className="bg-black/60 p-6 relative overflow-hidden">
          <div className="scanline"></div>
          
          {!status.hasStoredCredentials ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-[#cd5241]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FaShieldAlt className="text-[#cd5241] text-2xl animate-bounce" />
              </div>
              <h4 className="text-sm font-black text-white uppercase mb-2 italic">系统未授权</h4>
              <p className="text-[10px] text-gray-500 mb-8 leading-relaxed max-w-xs mx-auto">需要建立 Steam 凭证链路以接收游戏内的配对信号。此过程仅需执行一次。</p>
              {isSubscriptionExpired ? (
                <div className="space-y-3">
                  <div className="px-6 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-[10px] font-bold flex items-center justify-center gap-2 mx-auto max-w-xs">
                    <FaLock /> 请先订阅后再进行配对操作
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAutoRegister(true)}
                  className="px-10 py-3 bg-[#cd5241] text-white text-[10px] font-black uppercase italic tactic-cut hover:bg-[#b04537] transition-all shadow-lg shadow-[#cd5241]/20 flex items-center gap-3 mx-auto"
                >
                  <FaRocket /> 启动自动授权协议
                </button>
              )}
            </div>
          ) : waitingForPairing ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                <div className="w-10 h-10 bg-[#a3e635]/10 tactic-cut flex items-center justify-center">
                  <FaSync className="text-[#a3e635] animate-spin" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-[#a3e635] uppercase italic">正在监听信号...</h4>
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest">等待 Rust 游戏内发起配对请求</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <StepItem num="01" text="在 Rust 游戏中按下 [ESC] 键" />
                <StepItem num="02" text="点击右下角的 Rust+ 图标" />
                <StepItem num="03" text="点击 'Pair with Server' 发送链路信号" />
                <StepItem num="04" text="保持此窗口开启，直至配对完成" />
              </div>

              <button 
                onClick={handleStop}
                disabled={loading}
                className="w-full py-3 border border-red-500/30 text-red-500 text-[10px] font-black uppercase tactic-cut hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
              >
                <FaStop /> 终止信号监听
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-[#a3e635]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FaCheckCircle className="text-[#a3e635] text-2xl" />
              </div>
              <h4 className="text-sm font-black text-white uppercase mb-2 italic">链路已就绪</h4>
              <p className="text-[10px] text-gray-500 mb-8 leading-relaxed">授权凭证已通过验证。点击下方按钮开始捕捉游戏内的配对信号。</p>
              {isSubscriptionExpired ? (
                <div className="px-6 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-[10px] font-bold flex items-center justify-center gap-2 mx-auto max-w-xs">
                  <FaLock /> 请先订阅后再进行配对操作
                </div>
              ) : (
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleStart}
                    disabled={loading}
                    className="px-10 py-3 bg-[#cd5241] text-white text-[10px] font-black uppercase italic tactic-cut hover:bg-[#b04537] transition-all flex items-center gap-3"
                  >
                    <FaPlay /> 开启信号捕获
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={loading}
                    className="px-4 py-3 bg-white/5 border border-white/10 text-gray-500 hover:text-white tactic-cut transition-all"
                    title="重置凭据"
                  >
                    <FaSync className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部备注 */}
      <div className="p-4 bg-white/[0.02] border border-white/5 tactic-cut flex items-start gap-3">
        <FaInfoCircle className="text-gray-700 text-xs mt-0.5" />
        <p className="text-[9px] text-gray-600 leading-relaxed uppercase font-medium">
          提示：配对成功后，系统会自动保存服务器 IP、端口及玩家 Token。
          <br />如果你是在游戏中配对智能开关或警报器，请直接点击“配对”即可同步到本终端。
        </p>
      </div>
    </div>
  );
}

function StepItem({ num, text }) {
  return (
    <div className="flex items-center gap-4 group">
      <span className="text-[10px] font-mono font-black text-[#cd5241] opacity-50 group-hover:opacity-100 transition-opacity">[{num}]</span>
      <span className="text-[11px] font-bold text-gray-400 group-hover:text-gray-200 transition-colors">{text}</span>
    </div>
  );
}

export default PairingPanel;
