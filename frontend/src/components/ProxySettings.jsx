import { useState, useEffect } from 'react';
import {
  FaGlobe, FaPlay, FaStop, FaSync, FaCheck, FaExclamationTriangle,
  FaTrash, FaSave, FaNetworkWired
} from 'react-icons/fa';
import { useToast } from './Toast';
import proxyApi from '../services/proxy';
import socketService from '../services/socket';

/**
 * 代理设置组件
 */
function ProxySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 状态
  const [status, setStatus] = useState({
    isRunning: false,
    hasConfig: false,
    node: null,
    proxyPort: 10808
  });

  // 配置表单
  const [subscriptionUrl, setSubscriptionUrl] = useState('');
  const [proxyPort, setProxyPort] = useState(10808);
  const [autoStart, setAutoStart] = useState(true);

  // 节点列表
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  const toast = useToast();

  // 加载状态和节点
  useEffect(() => {
    loadProxyStatus();
    loadNodes();

    // 监听代理状态变化
    socketService.on('proxy:status', handleStatusUpdate);
    socketService.on('proxy:node:changed', handleNodeChanged);
    socketService.on('proxy:error', handleProxyError);
    socketService.on('proxy:nodes:updated', loadNodes);

    return () => {
      socketService.off('proxy:status', handleStatusUpdate);
      socketService.off('proxy:node:changed', handleNodeChanged);
      socketService.off('proxy:error', handleProxyError);
      socketService.off('proxy:nodes:updated', loadNodes);
    };
  }, []);

  const handleStatusUpdate = (data) => {
    setStatus(prev => ({ ...prev, ...data }));
  };

  const handleNodeChanged = (data) => {
    setSelectedNode(data.nodeName);
    toast.success(`已切换到: ${data.nodeName}`);
  };

  const handleProxyError = (data) => {
    toast.error(`代理错误: ${data.message}`);
  };

  const loadProxyStatus = async () => {
    try {
      const res = await proxyApi.getProxyStatus();
      if (res.data.success) {
        const data = res.data.data;
        setStatus({
          isRunning: data.isRunning,
          hasConfig: data.hasConfig,
          node: data.node,
          proxyPort: data.proxyPort
        });
        setProxyPort(data.proxyPort || 10808);
        setAutoStart(data.autoStart !== false);
      }
    } catch (error) {
      console.error('加载代理状态失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNodes = async () => {
    try {
      const res = await proxyApi.getProxyNodes();
      if (res.data.success) {
        setNodes(res.data.data.nodes || []);
        setSelectedNode(res.data.data.currentNode);
      }
    } catch (error) {
      console.error('加载节点列表失败:', error);
    }
  };

  // 保存配置
  const handleSaveConfig = async () => {
    if (!subscriptionUrl.trim()) {
      toast.error('请输入订阅链接');
      return;
    }

    setSaving(true);
    try {
      const res = await proxyApi.saveProxyConfig({
        subscriptionUrl: subscriptionUrl.trim(),
        proxyPort,
        autoStart
      });

      if (res.data.success) {
        // 根据返回结果显示不同提示
        const { wasRunning, restartResult, nodeCount } = res.data.data;
        if (wasRunning && restartResult?.restarted) {
          toast.success(`配置已保存，代理已重启 (${nodeCount} 个节点)`);
          setStatus(prev => ({
            ...prev,
            hasConfig: true,
            isRunning: true,
            node: restartResult.node
          }));
        } else if (wasRunning && !restartResult?.restarted) {
          toast.error(`配置已保存，但重启失败: ${restartResult?.error}`);
          setStatus(prev => ({ ...prev, hasConfig: true, isRunning: false }));
        } else {
          toast.success(`配置已保存，获取到 ${nodeCount} 个节点`);
          setStatus(prev => ({ ...prev, hasConfig: true }));
        }
        loadNodes();
        setSubscriptionUrl(''); // 清空输入（安全考虑）
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 启动/停止代理
  const handleToggleProxy = async () => {
    setStarting(true);
    try {
      if (status.isRunning) {
        await proxyApi.stopProxy();
        setStatus(prev => ({ ...prev, isRunning: false, node: null }));
        toast.success('代理已停止');
      } else {
        const res = await proxyApi.startProxy(selectedNode);
        if (res.data.success) {
          setStatus(prev => ({
            ...prev,
            isRunning: true,
            node: res.data.data.node
          }));
          toast.success('代理已启动');
          loadNodes();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '操作失败');
    } finally {
      setStarting(false);
    }
  };

  // 切换节点
  const handleSwitchNode = async (nodeName) => {
    if (!status.isRunning) {
      setSelectedNode(nodeName);
      return;
    }

    try {
      await proxyApi.switchProxyNode(nodeName);
      // 切换成功后刷新节点列表以更新 isActive 状态
      loadNodes();
    } catch (error) {
      toast.error(error.response?.data?.error || '切换节点失败');
    }
  };

  // 刷新订阅
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await proxyApi.refreshProxyNodes();
      if (res.data.success) {
        toast.success(res.data.message);
        loadNodes();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  // 清除配置
  const handleDeleteConfig = async () => {
    if (!confirm('确定要清除代理配置吗？')) return;

    try {
      await proxyApi.deleteProxyConfig();
      setStatus({ isRunning: false, hasConfig: false, node: null, proxyPort: 10808 });
      setNodes([]);
      setSelectedNode(null);
      toast.success('配置已清除');
    } catch (error) {
      toast.error('清除失败');
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
        status.isRunning
          ? 'bg-green-500/10 border-green-500/20'
          : status.hasConfig
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-dark-700/50 border-white/5'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              status.isRunning ? 'bg-green-500/20' : 'bg-dark-600'
            }`}>
              <FaGlobe className={status.isRunning ? 'text-green-400' : 'text-gray-400'} />
            </div>
            <div>
              <div className="font-medium text-white">
                {status.isRunning ? '代理运行中' : status.hasConfig ? '代理已配置' : '未配置代理'}
              </div>
              <div className="text-sm text-gray-400">
                {status.isRunning && status.node
                  ? `${status.node.name} (${status.node.type})`
                  : status.hasConfig
                    ? '点击启动按钮开始使用'
                    : '请先配置订阅链接'
                }
              </div>
            </div>
          </div>

          {status.hasConfig && (
            <button
              onClick={handleToggleProxy}
              disabled={starting}
              className={`btn ${status.isRunning ? 'btn-danger' : 'btn-primary'} min-w-[100px]`}
            >
              {starting ? (
                <span className="animate-spin">...</span>
              ) : status.isRunning ? (
                <><FaStop /> 停止</>
              ) : (
                <><FaPlay /> 启动</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 订阅链接配置 */}
      <div className="space-y-4">
        <h4 className="font-medium text-white flex items-center gap-2">
          <FaNetworkWired className="text-gray-400" />
          订阅链接
        </h4>

        <div className="space-y-3">
          <input
            type="text"
            value={subscriptionUrl}
            onChange={(e) => setSubscriptionUrl(e.target.value)}
            placeholder={status.hasConfig ? '已配置（输入新链接可覆盖）' : '请输入订阅链接 https://...'}
            className="w-full px-4 py-3 bg-dark-700 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-rust-accent focus:outline-none"
          />

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-rust-accent focus:ring-rust-accent"
              />
              启动时自动连接
            </label>

            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>端口:</span>
              <input
                type="number"
                value={proxyPort}
                onChange={(e) => setProxyPort(parseInt(e.target.value) || 10808)}
                className="w-20 px-2 py-1 bg-dark-700 border border-white/10 rounded text-white text-center"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveConfig}
              disabled={saving || !subscriptionUrl.trim()}
              className="btn btn-primary"
            >
              {saving ? '保存中...' : <><FaSave /> 保存配置</>}
            </button>

            {status.hasConfig && (
              <>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="btn btn-secondary"
                >
                  {refreshing ? '刷新中...' : <><FaSync /> 刷新订阅</>}
                </button>

                <button
                  onClick={handleDeleteConfig}
                  className="btn btn-ghost text-red-400 hover:bg-red-500/10"
                >
                  <FaTrash /> 清除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 节点列表 */}
      {nodes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-white">节点列表 ({nodes.length})</h4>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
            {nodes.map((node, index) => {
              // 判断是否为当前活跃节点：运行中时看 isActive，未运行时看 selectedNode
              const isCurrentNode = status.isRunning ? node.isActive : (selectedNode === node.name);

              return (
                <button
                  key={index}
                  onClick={() => handleSwitchNode(node.name)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                    isCurrentNode
                      ? 'bg-rust-accent/20 border border-rust-accent/30'
                      : 'bg-dark-700/50 border border-transparent hover:bg-dark-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      node.isActive ? 'bg-green-400' : 'bg-gray-500'
                    }`} />
                    <div className="text-left">
                      <div className="font-medium text-white text-sm">{node.name}</div>
                      <div className="text-xs text-gray-500">
                        {node.type.toUpperCase()} · {node.server}:{node.port}
                      </div>
                    </div>
                  </div>

                  {node.isActive && (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <FaCheck /> 当前
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-300 space-y-1">
            <p><strong>使用说明:</strong></p>
            <ul className="list-disc list-inside text-gray-400 space-y-1">
              <li>支持 Clash (YAML) 和 V2Ray (Base64) 订阅格式</li>
              <li>支持 VMess、VLESS、Trojan、Shadowsocks 协议</li>
              <li>代理用于 FCM 推送连接，解决网络访问问题</li>
              <li>订阅链接仅保存在本地数据库，不会上传</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProxySettings;
