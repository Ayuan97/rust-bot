import { useState, useEffect } from 'react';
import {
  FaBell, FaCheck, FaExclamationTriangle, FaTimes,
  FaTrash, FaSync, FaSearch, FaInfoCircle, FaClipboard, FaTerminal, FaSave, FaLock, FaPlug
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
        <div className="animate-spin w-8 h-8 border-2 border-rust-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 过期/错误警告 Banner */}
      {(isExpired || isExpiringSoon || hasConnectionError) && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-fade-in ${(isExpired || hasConnectionError)
          ? 'bg-red-500/10 border-red-500/20'
          : 'bg-yellow-500/10 border-yellow-500/20'
          }`}>
          <div className={`p-2 rounded-lg ${(isExpired || hasConnectionError) ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}>
            <FaExclamationTriangle />
          </div>
          <div className="flex-1">
            <h3 className={`font-bold ${(isExpired || hasConnectionError) ? 'text-red-400' : 'text-yellow-400'}`}>
              {hasConnectionError
                ? 'FCM 连接失败'
                : isExpired
                  ? 'FCM 凭证已过期'
                  : 'FCM 凭证即将过期'}
            </h3>
            <p className="text-gray-300 text-sm mt-1">
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
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${(isExpired || hasConnectionError)
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-yellow-500 hover:bg-yellow-600 text-black'
                }`}
            >
              <FaSync /> 立即更新凭证
            </button>
          </div>
        </div>
      )}

      {/* 状态卡片 */}
      <div className={`p-4 rounded-xl border ${status.isListening
        ? 'bg-green-500/10 border-green-500/20'
        : status.hasCredentials || status.hasStoredCredentials
          ? 'bg-yellow-500/10 border-yellow-500/20'
          : 'bg-dark-700/50 border-white/5'
        }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${status.isListening ? 'bg-green-500/20' : 'bg-dark-600'
              }`}>
              <FaBell className={status.isListening ? 'text-green-400' : 'text-gray-400'} />
            </div>
            <div>
              <div className="font-medium text-white">
                {status.isListening ? 'FCM 监听中' : status.hasCredentials || status.hasStoredCredentials ? '已配置凭证' : '未配置凭证'}
              </div>
              <div className="text-sm text-gray-400">
                {status.isListening
                  ? `类型: ${status.credentialType || 'GCM'} ${status.steamId ? `| Steam: ${status.steamId}` : ''}`
                  : status.hasCredentials || status.hasStoredCredentials
                    ? 'FCM 未在监听（可能断开或未启动）'
                    : '请点击下方按钮添加 FCM 凭证'
                }
              </div>
            </div>
          </div>

          <div className={`w-3 h-3 rounded-full ${status.isListening
            ? 'bg-green-400 animate-pulse'
            : status.hasCredentials || status.hasStoredCredentials
              ? 'bg-yellow-400'
              : 'bg-gray-500'
            }`} />
        </div>
      </div>


      {/* 操作按钮 */}
      <div className="flex gap-3 flex-wrap">
        {/* 添加凭证按钮 - 没有凭证时显示 */}
        {!(status.hasCredentials || status.hasStoredCredentials) && (
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
            className="btn btn-primary bg-rust-accent hover:bg-rust-accent/80"
          >
            <FaPlug /> 添加 FCM 凭证
          </button>
        )}

        <button
          onClick={() => handleDiagnose(false)}
          disabled={diagnosing}
          className="btn btn-primary"
        >
          {diagnosing ? (
            <span className="animate-spin">...</span>
          ) : (
            <><FaSearch /> 诊断凭证</>
          )}
        </button>

        <button
          onClick={handleVerify}
          disabled={verifying}
          className="btn btn-secondary bg-purple-600 hover:bg-purple-500 text-white border-none"
        >
          {verifying ? (
            <span className="animate-spin">...</span>
          ) : (
            <><FaCheck /> 验证有效性</>
          )}
        </button>

        {/* 重连按钮 - 有凭证但未连接时显示 */}
        {(status.hasCredentials || status.hasStoredCredentials) && !status.isListening && (
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="btn btn-secondary bg-green-600 hover:bg-green-500 text-white border-none"
          >
            {reconnecting ? (
              <span className="animate-spin">...</span>
            ) : (
              <><FaPlug /> 重连 FCM</>
            )}
          </button>
        )}

        {(status.hasCredentials || status.hasStoredCredentials) && (
          <>
            <button
              onClick={() => {
                if (isSubscriptionExpired) {
                  toast.warning('订阅已过期，请先续费后再更新凭证');
                  return;
                }
                setShowUpdateModal(true);
              }}
              className="btn btn-ghost text-blue-400 hover:bg-blue-500/10"
            >
              <FaSync /> 更新凭证
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="btn btn-ghost text-red-400 hover:bg-red-500/10"
            >
              {resetting ? '重置中...' : <><FaTrash /> 重置凭证</>}
            </button>
          </>
        )}
      </div>

      {/* 诊断结果 */}
      {diagnosis && (
        <div className="space-y-4 animate-fade-in">
          <h4 className="font-medium text-white flex items-center gap-2">
            <FaInfoCircle className="text-gray-400" />
            诊断结果
          </h4>

          {/* 凭证信息 */}
          <div className="p-4 rounded-xl bg-dark-700/50 border border-white/5">
            <h5 className="text-sm font-medium text-gray-300 mb-3">凭证信息</h5>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">类型:</span>
                <span className="ml-2 text-white">{diagnosis.info.type || '未知'}</span>
              </div>
              <div>
                <span className="text-gray-500">Android ID:</span>
                <span className="ml-2 text-white font-mono">{diagnosis.info.androidId || '无'}</span>
              </div>
              <div>
                <span className="text-gray-500">Security Token:</span>
                <span className="ml-2 text-white">{diagnosis.info.hasSecurityToken ? '已设置' : '缺失'}</span>
              </div>
              <div>
                <span className="text-gray-500">Steam ID:</span>
                <span className="ml-2 text-white font-mono">{diagnosis.info.steamId || '未知'}</span>
              </div>
              <div>
                <span className="text-gray-500">过期时间:</span>
                <span className={`ml-2 ${diagnosis.info.isExpired ? 'text-red-400 font-bold' : 'text-white'}`}>
                  {diagnosis.info.expiresAt ? new Date(diagnosis.info.expiresAt).toLocaleString() : '未知'}
                </span>
              </div>
              {diagnosis.info.daysUntilExpire !== undefined && (
                <div>
                  <span className="text-gray-500">剩余天数:</span>
                  <span className={`ml-2 font-bold ${diagnosis.info.daysUntilExpire <= 7 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {diagnosis.info.daysUntilExpire} 天
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">监听状态:</span>
                <span className={`ml-2 ${diagnosis.info.isListening ? 'text-green-400' : 'text-yellow-400'}`}>
                  {diagnosis.info.isListening ? '监听中' : '未监听'}
                </span>
              </div>
            </div>
          </div>

          {/* 问题列表 */}
          {diagnosis.issues.length > 0 && (
            <div className="space-y-2">
              {diagnosis.issues.map((issue, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${issue.level === 'error'
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-yellow-500/10 border-yellow-500/20'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    {issue.level === 'error' ? (
                      <FaTimes className="text-red-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <FaExclamationTriangle className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <div className={`font-medium ${issue.level === 'error' ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                        {issue.message}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
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
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-3">
                <FaCheck className="text-green-400" />
                <div>
                  <div className="font-medium text-green-400">凭证配置正常</div>
                  <div className="text-sm text-gray-400">没有发现任何问题</div>
                </div>
              </div>
            </div>
          )}

          {/* 建议 */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <FaInfoCircle className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-300">
                <strong>建议:</strong> {diagnosis.recommendation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 使用说明 - 在没有过期的情况下显示，避免干扰警告 */}
      {(!isExpired && !isExpiringSoon) && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-start gap-3">
            <FaExclamationTriangle className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-300 space-y-1">
              <p><strong>关于 FCM 凭证:</strong></p>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>FCM 用于接收游戏中的配对推送（在游戏中点击 Pair）</li>
                <li>凭证从 <a href="https://companion-rust.facepunch.com/login" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">companion-rust.facepunch.com</a> 获取</li>
                <li>凭证有有效期，过期后需要重新获取</li>
                <li>如果连接循环或无法接收推送，尝试更新凭证或重置</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 更新凭证模态框 */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl tactic-border tactic-cut p-1 bg-black/60">
            <div className="bg-black/80 flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 tactic-cut bg-[#cd5241]/20 flex items-center justify-center text-[#cd5241]">
                    <FaSync />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase italic text-white tracking-tight">更新 FCM 凭证</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">请获取新的凭证命令并粘贴到下方</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUpdateModal(false)}
                  className="w-8 h-8 tactic-cut bg-white/5 hover:bg-[#cd5241]/20 flex items-center justify-center text-gray-400 hover:text-[#cd5241] transition-colors"
                >
                  <FaTimes />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5">
                {/* 步骤指引 */}
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-6 h-6 tactic-cut bg-[#cd5241]/20 text-[#cd5241] flex items-center justify-center text-xs font-black shrink-0 mt-0.5">1</div>
                    <div>
                      <p className="text-gray-300 text-sm">点击下方链接登录 Rust+ 官网</p>
                      <a
                        href="https://companion-rust.facepunch.com/login"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#cd5241] hover:underline text-sm inline-flex items-center gap-1 mt-1 font-bold"
                      >
                        companion-rust.facepunch.com <FaExternalLinkIcon />
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-6 h-6 tactic-cut bg-[#cd5241]/20 text-[#cd5241] flex items-center justify-center text-xs font-black shrink-0 mt-0.5">2</div>
                    <div>
                      <p className="text-gray-300 text-sm">登录成功后，打开浏览器控制台 (F12)</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-6 h-6 tactic-cut bg-[#cd5241]/20 text-[#cd5241] flex items-center justify-center text-xs font-black shrink-0 mt-0.5">3</div>
                    <div>
                      <p className="text-gray-300 text-sm">
                        复制以下代码在控制台运行，然后将生成的 <code className="bg-white/10 px-1 py-0.5 tactic-cut text-xs text-[#cd5241]">/credentials add ...</code> 命令粘贴到下方
                      </p>
                      <div className="mt-2 bg-black/50 p-3 tactic-cut border border-white/5 text-xs font-mono text-gray-400 overflow-x-auto relative group">
                        <code>
                          {`copy(\`/credentials add gcm_android_id:\${localStorage.gcm_android_id} gcm_security_token:\${localStorage.gcm_security_token} steam_id:\${localStorage.steam_id} fcm_token:\${localStorage.fcm_token} auth_token:\${localStorage.auth_token} expire_date:\${localStorage.expire_date}\`)`}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`copy(\`/credentials add gcm_android_id:\${localStorage.gcm_android_id} gcm_security_token:\${localStorage.gcm_security_token} steam_id:\${localStorage.steam_id} fcm_token:\${localStorage.fcm_token} auth_token:\${localStorage.auth_token} expire_date:\${localStorage.expire_date}\`)`);
                            toast.success('代码已复制');
                          }}
                          className="absolute right-2 top-2 p-1.5 tactic-cut bg-white/10 hover:bg-[#cd5241]/30 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="复制代码"
                        >
                          <FaClipboard />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 输入区域 */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-300 uppercase tracking-widest flex items-center gap-2">
                    <FaTerminal className="text-[#cd5241]" />
                    粘贴凭证命令
                  </label>
                  <textarea
                    value={updateCommand}
                    onChange={(e) => setUpdateCommand(e.target.value)}
                    placeholder="/credentials add gcm_android_id:..."
                    className="w-full h-28 bg-black/50 border border-white/10 tactic-cut p-4 text-sm font-mono text-gray-200 focus:border-[#cd5241] outline-none resize-none placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-black/40">
                <button
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 tactic-cut text-xs font-black uppercase text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateCredentials}
                  disabled={updating || !updateCommand.trim()}
                  className={`px-6 py-2.5 tactic-cut text-xs font-black uppercase flex items-center gap-2 transition-all ${updating || !updateCommand.trim()
                    ? 'bg-gray-800 cursor-not-allowed text-gray-500'
                    : 'bg-[#cd5241] hover:bg-[#b04537] text-white shadow-lg shadow-[#cd5241]/20'
                    }`}
                >
                  {updating ? (
                    <span className="animate-spin">...</span>
                  ) : (
                    <FaSave />
                  )}
                  {updating ? '正在更新...' : '保存并更新'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
