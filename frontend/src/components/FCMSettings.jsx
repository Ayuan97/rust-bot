import { useState, useEffect } from 'react';
import {
  FaBell, FaCheck, FaExclamationTriangle, FaTimes,
  FaTrash, FaSync, FaSearch, FaInfoCircle
} from 'react-icons/fa';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  getPairingStatus,
  resetPairing,
  diagnoseCredentials
} from '../services/pairing';

/**
 * FCM 配置组件 - 用于管理和诊断 FCM 凭证
 */
function FCMSettings() {
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [status, setStatus] = useState({
    isListening: false,
    hasCredentials: false,
    credentialType: null,
    steamId: null
  });

  const [diagnosis, setDiagnosis] = useState(null);

  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadStatus();
  }, []);

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

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await diagnoseCredentials();
      if (res.data.success) {
        setDiagnosis(res.data);
        if (!res.data.hasIssues) {
          toast.success('FCM 凭证配置正常');
        }
      }
    } catch (error) {
      toast.error('诊断失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setDiagnosing(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-rust-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 状态卡片 */}
      <div className={`p-4 rounded-xl border ${
        status.isListening
          ? 'bg-green-500/10 border-green-500/20'
          : status.hasCredentials || status.hasStoredCredentials
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-dark-700/50 border-white/5'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              status.isListening ? 'bg-green-500/20' : 'bg-dark-600'
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
                    : '请在配对面板中配置 FCM 凭证'
                }
              </div>
            </div>
          </div>

          <div className={`w-3 h-3 rounded-full ${
            status.isListening
              ? 'bg-green-400 animate-pulse'
              : status.hasCredentials || status.hasStoredCredentials
                ? 'bg-yellow-400'
                : 'bg-gray-500'
          }`} />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={handleDiagnose}
          disabled={diagnosing}
          className="btn btn-primary"
        >
          {diagnosing ? (
            <span className="animate-spin">...</span>
          ) : (
            <><FaSearch /> 诊断凭证</>
          )}
        </button>

        {(status.hasCredentials || status.hasStoredCredentials) && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="btn btn-ghost text-red-400 hover:bg-red-500/10"
          >
            {resetting ? '重置中...' : <><FaTrash /> 重置凭证</>}
          </button>
        )}
      </div>

      {/* 诊断结果 */}
      {diagnosis && (
        <div className="space-y-4">
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
                <span className={`ml-2 ${diagnosis.info.isExpired ? 'text-red-400' : 'text-white'}`}>
                  {diagnosis.info.expiresAt ? new Date(diagnosis.info.expiresAt).toLocaleString() : '未知'}
                </span>
              </div>
              {diagnosis.info.daysUntilExpire !== undefined && (
                <div>
                  <span className="text-gray-500">剩余天数:</span>
                  <span className={`ml-2 ${diagnosis.info.daysUntilExpire <= 7 ? 'text-yellow-400' : 'text-green-400'}`}>
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
                  className={`p-3 rounded-lg border ${
                    issue.level === 'error'
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
                      <div className={`font-medium ${
                        issue.level === 'error' ? 'text-red-400' : 'text-yellow-400'
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

      {/* 使用说明 */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-300 space-y-1">
            <p><strong>关于 FCM 凭证:</strong></p>
            <ul className="list-disc list-inside text-gray-400 space-y-1">
              <li>FCM 用于接收游戏中的配对推送（在游戏中点击 Pair）</li>
              <li>凭证从 <a href="https://companion-rust.facepunch.com/login" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">companion-rust.facepunch.com</a> 获取</li>
              <li>凭证有有效期，过期后需要重新获取</li>
              <li>如果连接循环或无法接收推送，尝试重置凭证</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FCMSettings;
