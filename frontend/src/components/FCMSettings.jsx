import { useState, useEffect } from 'react';
import {
  FaBell, FaCheck, FaExclamationTriangle, FaTimes,
  FaTrash, FaSync, FaSearch, FaInfoCircle, FaSave, FaLock, FaPlug
} from 'react-icons/fa';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { useAuth } from '../context/AuthContext';
import {
  getPairingStatus,
  resetPairing,
  diagnoseCredentials,
  registerSimple,
  verifyCredentials,
  startPairing
} from '../services/pairing';
import { EDGE_EXTENSION_URL, STEAM_LOGIN_URL, REQUIRED_PLUGIN_BROWSER } from '../constants/pairing.constants';

/**
 * FCM 配置组件 - 用于管理和诊断 FCM 凭证
 */
function FCMSettings({ onNavigateToPairing }) {
  const { isSubscriptionExpired } = useAuth();
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const [status, setStatus] = useState({
    isListening: false,
    hasCredentials: false,
    credentialType: null,
    steamId: null
  });

  const [diagnosis, setDiagnosis] = useState(null);

  // 更新凭证模态框状态
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateCommand, setUpdateCommand] = useState('');
  const [verifying, setVerifying] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();



  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await verifyCredentials();
      if (res.data.success) {
        toast.success('凭证验证通过，连接正常');
        // 成功后重新诊断，清除可能的错误
        handleDiagnose(true);
      }
    } catch (error) {
      toast.error('验证失败: ' + (error.response?.data?.error || error.message));
      // 验证失败也会更新 backend 的 lastError，所以重新诊断以显示红条
      handleDiagnose();
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // 自动诊断：当状态加载完成且有凭证时，自动运行诊断以检查过期状态
  useEffect(() => {
    if (!loading && (status.hasCredentials || status.hasStoredCredentials) && !diagnosis) {
      handleDiagnose(true); // silent mode
    }
  }, [loading, status.hasCredentials, status.hasStoredCredentials]);

  const loadStatus = async () => {
    try {
      const res = await getPairingStatus();
      if (res.data.success) {
        setStatus(res.data.status);
      }
    } catch (error) {
      console.error('加载 FCM 状态失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDiagnose = async (silent = false) => {
    if (!silent) setDiagnosing(true);
    try {
      const res = await diagnoseCredentials();
      if (res.data.success) {
        setDiagnosis(res.data);
        if (!silent && !res.data.hasIssues) {
          toast.success('FCM 凭证配置正常');
        }
      }
    } catch (error) {
      if (!silent) toast.error('诊断失败: ' + (error.response?.data?.error || error.message));
    } finally {
      if (!silent) setDiagnosing(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      type: 'danger',
      title: '重置 FCM 凭证',
      message: '这将删除 FCM 凭证并断开所有服务器连接。确定要继续吗？',
      confirmText: '重置',
      cancelText: '取消'
    });
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await resetPairing();
      if (res.data.success) {
        toast.success('FCM 凭证已重置');
        setStatus({
          isListening: false,
          hasCredentials: false,
          credentialType: null,
          steamId: null
        });
        setDiagnosis(null);
        loadStatus();
      }
    } catch (error) {
      toast.error('重置失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setResetting(false);
    }
  };

  const handleReconnect = async () => {
    if (isSubscriptionExpired) {
      toast.warning('订阅已过期，请先续费');
      return;
    }

    setReconnecting(true);
    try {
      const res = await startPairing();
      if (res.data.success) {
        toast.success('FCM 重连成功');
        await loadStatus();
        await handleDiagnose(true);
      }
    } catch (error) {
      toast.error('重连失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setReconnecting(false);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!updateCommand.trim()) {
      toast.error('请输入凭证命令');
      return;
    }

    if (isSubscriptionExpired) {
      toast.warning('订阅已过期，请先续费后再更新凭证');
      return;
    }

    setUpdating(true);
    try {
      const res = await registerSimple(updateCommand);
      if (res.data.success) {
        toast.success('FCM 凭证已更新');
        setShowUpdateModal(false);
        setUpdateCommand('');
        // 重新加载状态和诊断
        await loadStatus();
        await handleDiagnose();
      }
    } catch (error) {
      toast.error('更新失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setUpdating(false);
    }
  };

  // 检查是否过期或即将过期
  const isExpired = diagnosis?.info?.isExpired;
  // 临时调整为 30 天以确保用户能看到提示 (调试用)
  const isExpiringSoon = diagnosis?.info?.daysUntilExpire <= 30;
  const hasConnectionError = diagnosis?.info?.lastError;

  // 调试日志
  useEffect(() => {
    if (diagnosis) {
      console.log('FCM Diagnosis:', diagnosis);
      console.log('Flags:', { isExpired, isExpiringSoon, hasConnectionError });
    }
  }, [diagnosis, isExpired, isExpiringSoon, hasConnectionError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-hazard border-t-transparent" />
      </div>
    );
  }

  const hasCredentials = status.hasCredentials || status.hasStoredCredentials;

  return (
    <div className="space-y-6">
      {/* 过期/错误警告 Banner */}
      {(isExpired || isExpiringSoon || hasConnectionError) && (
        <div className="tac-panel tac-corners p-4 bg-hazard-dim border-hazard/40 flex items-start gap-3 animate-fade-in">
          <div className="w-9 h-9 shrink-0 bg-hazard-dim border border-hazard/40 flex items-center justify-center text-hazard">
            <FaExclamationTriangle />
          </div>
          <div className="flex-1 min-w-0">
            <div className="tac-label mb-1 text-hazard">
              {hasConnectionError ? 'CONNECTION FAILED' : isExpired ? 'CREDENTIALS EXPIRED' : 'EXPIRING SOON'}
            </div>
            <h3 className="font-extrabold text-fg">
              {hasConnectionError
                ? 'FCM 连接失败'
                : isExpired
                  ? 'FCM 凭证已过期'
                  : 'FCM 凭证即将过期'}
            </h3>
            <p className="text-fg-dim text-sm mt-1 leading-relaxed">
              {hasConnectionError
                ? `最近一次连接尝试失败: ${diagnosis.info.lastError.message}。如果持续失败，您的凭证可能已在其他设备重置。`
                : isExpired
                  ? '您的推送凭证已失效，无法接收配对请求。请立即更新凭证。'
                  : `您的凭证将在 ${diagnosis.info.daysUntilExpire} 天后过期，建议及时更新。`
              }
            </p>
            <button
              onClick={() => {
                if (isSubscriptionExpired) {
                  toast.warning('订阅已过期，请先续费后再更新凭证');
                  return;
                }
                setShowUpdateModal(true);
              }}
              className="mt-3 tac-btn tac-btn-primary !py-2.5"
            >
              <FaSync /> 立即更新凭证 // UPDATE
            </button>
          </div>
        </div>
      )}

      {/* 状态卡片 */}
      <div className="tac-panel tac-corners p-4">
        <div className="tac-label mb-3 flex items-center gap-2">
          <FaBell className="text-hazard" /> 配对状态 // PAIRING
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 shrink-0 flex items-center justify-center border ${status.isListening ? 'border-terminal/40 bg-ink-800 text-terminal' : 'border-ink-line bg-ink-800 text-fg-dim'
              }`}>
              <FaBell />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-fg">
                {status.isListening ? 'FCM 监听中' : hasCredentials ? '已配置凭证' : '未配置凭证'}
              </div>
              <div className="text-sm text-fg-dim truncate">
                {status.isListening
                  ? <span className="font-mono tabular-nums">类型: {status.credentialType || 'GCM'}{status.steamId ? ` | STEAM: ${status.steamId}` : ''}</span>
                  : hasCredentials
                    ? 'FCM 未在监听（可能断开或未启动）'
                    : '请点击下方按钮添加 FCM 凭证'
                }
              </div>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2 py-1 border shrink-0 ${status.isListening
            ? 'text-terminal border-terminal/30'
            : hasCredentials
              ? 'text-hazard border-hazard/30 bg-hazard-dim'
              : 'text-fg-mute border-ink-line'
            }`}>
            <span className={`w-1.5 h-1.5 ${status.isListening
              ? 'bg-terminal animate-tac-blink'
              : hasCredentials
                ? 'bg-hazard'
                : 'bg-fg-mute'
              }`} />
            <span className="font-mono text-[11px] uppercase tracking-wider">
              {status.isListening ? 'LIVE' : hasCredentials ? 'IDLE' : 'NONE'}
            </span>
          </span>
        </div>
      </div>


      {/* 操作按钮 */}
      <div className="flex gap-3 flex-wrap">
        {/* 添加凭证按钮 - 没有凭证时显示 */}
        {!hasCredentials && (
          <button
            onClick={() => {
              if (isSubscriptionExpired) {
                toast.warning('订阅已过期，请先续费后再添加凭证');
                return;
              }
              if (onNavigateToPairing) {
                onNavigateToPairing();
              } else {
                setShowUpdateModal(true);
              }
            }}
            className="tac-btn tac-btn-primary"
          >
            <FaPlug /> 添加 FCM 凭证 // ADD
          </button>
        )}

        <button
          onClick={() => handleDiagnose(false)}
          disabled={diagnosing}
          className="tac-btn tac-btn-primary"
        >
          {diagnosing ? (
            <span className="animate-spin">...</span>
          ) : (
            <><FaSearch /> 诊断凭证 // DIAGNOSE</>
          )}
        </button>

        <button
          onClick={handleVerify}
          disabled={verifying}
          className="tac-btn tac-btn-ghost"
        >
          {verifying ? (
            <span className="animate-spin">...</span>
          ) : (
            <><FaCheck /> 验证有效性 // VERIFY</>
          )}
        </button>

        {/* 重连按钮 - 有凭证但未连接时显示 */}
        {hasCredentials && !status.isListening && (
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="tac-btn tac-btn-ghost"
          >
            {reconnecting ? (
              <span className="animate-spin">...</span>
            ) : (
              <><FaPlug /> 重连 FCM // RECONNECT</>
            )}
          </button>
        )}

        {hasCredentials && (
          <>
            <button
              onClick={() => {
                if (isSubscriptionExpired) {
                  toast.warning('订阅已过期，请先续费后再更新凭证');
                  return;
                }
                setShowUpdateModal(true);
              }}
              className="tac-btn tac-btn-ghost"
            >
              <FaSync /> 更新凭证 // UPDATE
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="tac-btn tac-btn-ghost"
            >
              {resetting ? '重置中...' : <><FaTrash /> 重置凭证 // RESET</>}
            </button>
          </>
        )}
      </div>

      {/* 诊断结果 */}
      {diagnosis && (
        <div className="space-y-4 animate-fade-in">
          <div className="tac-label flex items-center gap-2">
            <FaInfoCircle className="text-hazard" /> 诊断结果 // DIAGNOSIS
          </div>

          {/* 凭证信息 */}
          <div className="border border-ink-line">
            <div className="bg-ink-800 px-4 py-2.5 tac-label">CREDENTIALS // 凭证信息</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-ink-line border-t border-ink-line">
              <InfoRow label="类型 // TYPE" value={diagnosis.info.type || '未知'} mono />
              <InfoRow label="ANDROID ID" value={diagnosis.info.androidId || '无'} mono truncate />
              <InfoRow label="SECURITY TOKEN" value={diagnosis.info.hasSecurityToken ? '已设置' : '缺失'} />
              <InfoRow label="STEAM ID" value={diagnosis.info.steamId || '未知'} mono />
              <InfoRow
                label="过期时间 // EXPIRES"
                value={diagnosis.info.expiresAt ? new Date(diagnosis.info.expiresAt).toLocaleString() : '未知'}
                mono
                valueClass={diagnosis.info.isExpired ? 'text-hazard font-bold' : 'text-fg'}
              />
              {diagnosis.info.daysUntilExpire !== undefined && (
                <InfoRow
                  label="剩余天数 // DAYS LEFT"
                  value={`${diagnosis.info.daysUntilExpire} 天`}
                  mono
                  valueClass={diagnosis.info.daysUntilExpire <= 7 ? 'text-hazard font-bold' : 'text-terminal font-bold'}
                />
              )}
              <InfoRow
                label="监听状态 // LISTEN"
                value={diagnosis.info.isListening ? '监听中' : '未监听'}
                valueClass={diagnosis.info.isListening ? 'text-terminal' : 'text-hazard'}
              />
            </div>
          </div>

          {/* 问题列表 */}
          {diagnosis.issues.length > 0 && (
            <div className="space-y-2">
              {diagnosis.issues.map((issue, index) => (
                <div
                  key={index}
                  className="p-3 border bg-hazard-dim border-hazard/40"
                >
                  <div className="flex items-start gap-2.5">
                    {issue.level === 'error' ? (
                      <FaTimes className="text-hazard mt-0.5 flex-shrink-0" />
                    ) : (
                      <FaExclamationTriangle className="text-hazard mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-fg">
                        {issue.message}
                      </div>
                      <div className="text-sm text-fg-dim mt-1">
                        {issue.solution}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 无问题时的提示 */}
          {diagnosis.issues.length === 0 && (
            <div className="p-4 border border-terminal/30 bg-ink-800">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink shrink-0" />
                <FaCheck className="text-terminal shrink-0" />
                <div>
                  <div className="font-bold text-fg">凭证配置正常</div>
                  <div className="text-sm text-fg-dim">没有发现任何问题</div>
                </div>
              </div>
            </div>
          )}

          {/* 建议 */}
          <div className="p-4 border border-ink-line bg-ink-800">
            <div className="flex items-start gap-3">
              <FaInfoCircle className="text-fg-dim mt-0.5 flex-shrink-0" />
              <div className="text-sm text-fg-dim">
                <strong className="text-fg">建议:</strong> {diagnosis.recommendation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 使用说明 - 在没有过期的情况下显示，避免干扰警告 */}
      {(!isExpired && !isExpiringSoon) && (
        <div className="p-4 border border-ink-line bg-ink-800">
          <div className="flex items-start gap-3">
            <FaInfoCircle className="text-fg-dim mt-0.5 flex-shrink-0" />
            <div className="text-sm text-fg-dim space-y-1">
              <p><strong className="text-fg">关于 FCM 凭证:</strong></p>
              <ul className="list-disc list-inside text-fg-dim space-y-1">
                <li>FCM 用于接收游戏中的配对推送（在游戏中点击 Pair）</li>
                <li>凭证建议使用 {REQUIRED_PLUGIN_BROWSER} 插件生成并复制</li>
                <li>登录页：<a href={STEAM_LOGIN_URL} target="_blank" rel="noopener noreferrer" className="text-hazard hover:text-hazard-bright transition-colors">companion-rust.facepunch.com</a></li>
                <li>凭证有有效期，过期后需要重新获取</li>
                <li>如果连接循环或无法接收推送，尝试更新凭证或重置</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 更新凭证模态框 */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl tac-panel tac-corners flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-ink-line flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-hazard-dim border border-hazard/40 flex items-center justify-center text-hazard">
                  <FaSync />
                </div>
                <div>
                  <div className="tac-label mb-1">UPDATE CREDENTIALS</div>
                  <h3 className="text-lg font-extrabold text-fg tracking-tight">更新 FCM 凭证</h3>
                </div>
              </div>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="w-8 h-8 border border-ink-line bg-ink-800 hover:border-hazard/50 flex items-center justify-center text-fg-dim hover:text-hazard transition-colors"
                aria-label="关闭"
              >
                <FaTimes />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-5 custom-scrollbar">
              {/* 步骤指引 */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <span className="text-[10px] font-mono tabular-nums font-bold text-hazard bg-hazard-dim border border-hazard/30 w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="text-fg-dim text-sm">
                      先在 {REQUIRED_PLUGIN_BROWSER} 安装插件并确认已启用
                    </p>
                    <a
                      href={EDGE_EXTENSION_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-hazard hover:text-hazard-bright transition-colors text-sm inline-flex items-center gap-1 mt-1 font-bold"
                    >
                      打开 Edge 插件商店 <FaExternalLinkIcon />
                    </a>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="text-[10px] font-mono tabular-nums font-bold text-hazard bg-hazard-dim border border-hazard/30 w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-fg-dim text-sm">在 Edge 中打开 Rust+ 登录页并完成 Steam 登录</p>
                    <a
                      href={STEAM_LOGIN_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-hazard hover:text-hazard-bright transition-colors text-sm inline-flex items-center gap-1 mt-1 font-bold"
                    >
                      companion-rust.facepunch.com <FaExternalLinkIcon />
                    </a>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="text-[10px] font-mono tabular-nums font-bold text-hazard bg-hazard-dim border border-hazard/30 w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="text-fg-dim text-sm">在插件结果页复制完整的 <code className="bg-ink-700 border border-ink-line px-1 py-0.5 text-xs text-hazard font-mono">/credentials add ...</code> 命令，粘贴到下方保存</p>
                  </div>
                </div>
              </div>

              {/* 输入区域 */}
              <div className="space-y-2">
                <label className="block tac-label border-l-2 border-hazard pl-2">PASTE COMMAND // 粘贴凭证命令</label>
                <textarea
                  value={updateCommand}
                  onChange={(e) => setUpdateCommand(e.target.value)}
                  placeholder="/credentials add gcm_android_id:..."
                  className="tac-input h-28 font-mono text-[11px] text-hazard resize-none custom-scrollbar placeholder:text-fg-mute"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-ink-line flex justify-end gap-3 bg-ink-850">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="tac-btn tac-btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleUpdateCredentials}
                disabled={updating || !updateCommand.trim()}
                className="tac-btn tac-btn-primary"
              >
                {updating ? (
                  <span className="animate-spin">...</span>
                ) : (
                  <FaSave />
                )}
                {updating ? '正在更新 // SAVING...' : '保存并更新 // SAVE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono = false, truncate = false, valueClass = 'text-fg' }) {
  return (
    <div className="bg-ink-850 px-4 py-2.5">
      <div className="tac-label mb-1">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono tabular-nums' : ''} ${truncate ? 'truncate' : ''} ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function FaExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export default FCMSettings;
