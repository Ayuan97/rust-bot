import React, { useState, useEffect, useMemo } from 'react';
import {
  FaSatellite, FaSync, FaPlay, FaStop, FaTrashAlt,
  FaNetworkWired, FaSignal, FaCheckCircle, FaGlobe,
  FaSearch, FaTimes, FaExclamationTriangle
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';
import socketService from '../../services/socket';

const ProxyStation = () => {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [currentNode, setCurrentNode] = useState(null);
  const [config, setConfig] = useState({
    subscriptionUrl: '',
    proxyPort: 10808,
    autoStart: false
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(''); // 'start' | 'stop' | 'switch' | 'delete' | 'save' | 'refresh'

  // 搜索
  const [searchTerm, setSearchTerm] = useState('');

  // 删除确认弹窗
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchNodes();

    // 监听实时状态更新
    socketService.on('proxy:status', handleStatusUpdate);
    socketService.on('proxy:nodes:updated', fetchNodes);
    socketService.on('proxy:node:changed', handleNodeChanged);
    socketService.on('proxy:config:deleted', handleConfigDeleted);

    return () => {
      socketService.off('proxy:status');
      socketService.off('proxy:nodes:updated');
      socketService.off('proxy:node:changed');
      socketService.off('proxy:config:deleted');
    };
  }, []);

  const handleStatusUpdate = (data) => {
    setStatus(prev => ({ ...prev, ...data }));
    if (data.node) {
      setCurrentNode(data.node.name);
    }
  };

  const handleNodeChanged = (data) => {
    setCurrentNode(data.nodeName);
    toast.info(`节点已切换到: ${data.nodeName}`);
  };

  const handleConfigDeleted = () => {
    setConfig({ subscriptionUrl: '', proxyPort: 10808, autoStart: false });
    setNodes([]);
    setCurrentNode(null);
    setStatus(prev => ({ ...prev, isRunning: false, hasConfig: false }));
  };

  const fetchStatus = async () => {
    try {
      const res = await api.get('/proxy/status');
      if (res.data.success) {
        setStatus(res.data.data);
        if (res.data.data.proxyPort) {
          setConfig(prev => ({
            ...prev,
            proxyPort: res.data.data.proxyPort,
            autoStart: res.data.data.autoStart
          }));
        }
        if (res.data.data.selectedNode) {
          setCurrentNode(res.data.data.selectedNode);
        }
      }
    } catch (err) {
      console.error('获取代理状态失败', err);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await api.get('/proxy/nodes');
      if (res.data.success) {
        // 修复：正确获取节点数组
        setNodes(res.data.data.nodes || []);
        if (res.data.data.currentNode) {
          setCurrentNode(res.data.data.currentNode);
        }
      }
    } catch (err) {
      console.error('获取节点失败', err);
    }
  };

  const handleSaveConfig = async () => {
    if (!config.subscriptionUrl) {
      toast.error('请输入订阅链接');
      return;
    }

    setActionLoading('save');
    try {
      const res = await api.post('/proxy/config', config);
      if (res.data.success) {
        toast.success(res.data.message || '代理配置已保存');
        fetchStatus();
        fetchNodes();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '保存配置失败');
    } finally {
      setActionLoading('');
    }
  };

  const handleDeleteConfig = async () => {
    setActionLoading('delete');
    try {
      const res = await api.delete('/proxy/config');
      if (res.data.success) {
        toast.success('代理配置已清除');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '清除配置失败');
    } finally {
      setActionLoading('');
    }
  };

  const handleControl = async (action) => {
    setActionLoading(action);
    try {
      const res = await api.post(`/proxy/${action}`);
      if (res.data.success) {
        toast.success(`代理服务已${action === 'start' ? '启动' : '停止'}`);
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失败');
    } finally {
      setActionLoading('');
    }
  };

  const handleSwitchNode = async (nodeName) => {
    if (currentNode === nodeName) return;
    if (!status?.isRunning) {
      toast.warning('请先启动代理服务');
      return;
    }

    setActionLoading('switch');
    try {
      const res = await api.post('/proxy/switch', { nodeName });
      if (res.data.success) {
        setCurrentNode(nodeName);
        toast.success(`已切换至节点: ${nodeName}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '切换节点失败');
    } finally {
      setActionLoading('');
    }
  };

  const handleRefreshNodes = async () => {
    setActionLoading('refresh');
    try {
      const res = await api.post('/proxy/refresh');
      if (res.data.success) {
        toast.success(res.data.message || '节点订阅已更新');
        fetchNodes();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '刷新节点失败');
    } finally {
      setActionLoading('');
    }
  };

  // 节点搜索过滤
  const filteredNodes = useMemo(() => {
    if (!searchTerm) return nodes;
    const term = searchTerm.toLowerCase();
    return nodes.filter(node =>
      node.name.toLowerCase().includes(term) ||
      node.type?.toLowerCase().includes(term) ||
      node.server?.toLowerCase().includes(term)
    );
  }, [nodes, searchTerm]);

  // 获取协议类型显示颜色
  const getProtocolColor = (type) => {
    if (!type) return 'bg-gray-600/20 text-gray-500';
    const t = type.toUpperCase();
    if (t.includes('SS') || t.includes('SHADOWSOCKS')) return 'bg-purple-600/20 text-purple-400';
    if (t.includes('VMESS')) return 'bg-blue-600/20 text-blue-400';
    if (t.includes('VLESS')) return 'bg-cyan-600/20 text-cyan-400';
    if (t.includes('TROJAN')) return 'bg-red-600/20 text-red-400';
    if (t.includes('HYSTERIA')) return 'bg-orange-600/20 text-orange-400';
    return 'bg-gray-600/20 text-gray-400';
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FaSatellite className="text-orange-500" />
          信号转发总站
        </h2>

        <div className="flex gap-2">
          {/* 删除配置按钮 */}
          {status?.hasConfig && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-400 border border-gray-700 rounded text-xs font-bold hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/30 transition-all disabled:opacity-50"
              title="清除配置"
            >
              <FaTrashAlt /> 清除配置
            </button>
          )}

          {status?.isRunning ? (
            <button
              onClick={() => handleControl('stop')}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/20 text-red-500 border border-red-900/30 rounded text-xs font-bold hover:bg-red-900/40 transition-all disabled:opacity-50"
            >
              <FaStop className={actionLoading === 'stop' ? 'animate-pulse' : ''} /> 停止转发核心
            </button>
          ) : (
            <button
              onClick={() => handleControl('start')}
              disabled={!!actionLoading || !status?.hasConfig}
              className="flex items-center gap-2 px-4 py-2 bg-green-900/20 text-green-500 border border-green-900/30 rounded text-xs font-bold hover:bg-green-900/40 transition-all disabled:opacity-50"
              title={!status?.hasConfig ? '请先配置订阅链接' : ''}
            >
              <FaPlay className={actionLoading === 'start' ? 'animate-pulse' : ''} /> 启动转发核心
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 配置表单 */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FaNetworkWired className="text-blue-500" />
              链路配置 (Core Config)
            </h4>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase mb-1">节点订阅地址 (Subscription URL)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.subscriptionUrl}
                    onChange={(e) => setConfig({...config, subscriptionUrl: e.target.value})}
                    placeholder="请输入订阅连接 (URL)..."
                    className="flex-1 bg-[#0D0E10] border border-gray-800 rounded px-4 py-2 text-sm focus:border-orange-500 outline-none transition-all"
                  />
                  <button
                    onClick={handleRefreshNodes}
                    disabled={!!actionLoading || !status?.hasConfig}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 disabled:opacity-50 transition-colors"
                    title="刷新订阅节点"
                  >
                    <FaSync className={actionLoading === 'refresh' ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase mb-1">本地转发端口 (SOCKS5)</label>
                  <input
                    type="number"
                    value={config.proxyPort}
                    onChange={(e) => setConfig({...config, proxyPort: parseInt(e.target.value) || 10808})}
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-4 py-2 text-sm font-mono focus:border-orange-500 outline-none"
                  />
                </div>
                <div className="flex items-end pb-2 gap-2">
                  <input
                    type="checkbox"
                    id="autoStart"
                    checked={config.autoStart}
                    onChange={(e) => setConfig({...config, autoStart: e.target.checked})}
                    className="w-4 h-4 bg-[#0D0E10] border-gray-800 rounded text-orange-600 focus:ring-orange-500"
                  />
                  <label htmlFor="autoStart" className="text-xs text-gray-500 cursor-pointer">系统启动时自动加载核心</label>
                </div>
              </div>

              <button
                onClick={handleSaveConfig}
                disabled={!!actionLoading || !config.subscriptionUrl}
                className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-widest rounded transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'save' ? '保存中...' : '保存并应用链路配置'}
              </button>
            </div>
          </div>

          {/* 流量统计图 (模拟) */}
          <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut relative overflow-hidden">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FaSignal className="text-green-500" />
              流量吞吐 (Traffic Monitor)
            </h4>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-500 uppercase">Downlink</span>
                  <span className="text-green-400">{status?.isRunning ? '1.2 MB/s' : '0 B/s'}</span>
                </div>
                <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                  <div className={`h-full bg-green-500/50 rounded-full transition-all duration-1000 ${status?.isRunning ? 'w-2/3' : 'w-0'}`} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-500 uppercase">Uplink</span>
                  <span className="text-blue-400">{status?.isRunning ? '450 KB/s' : '0 B/s'}</span>
                </div>
                <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                  <div className={`h-full bg-blue-500/50 rounded-full transition-all duration-1000 ${status?.isRunning ? 'w-1/3' : 'w-0'}`} />
                </div>
              </div>
            </div>

            {/* 运行状态指示器 */}
            <div className="absolute top-4 right-4">
              <div className={`flex items-center gap-2 text-[10px] font-mono ${status?.isRunning ? 'text-green-500' : 'text-gray-600'}`}>
                <div className={`w-2 h-2 rounded-full ${status?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-700'}`} />
                {status?.isRunning ? 'RUNNING' : 'STOPPED'}
              </div>
            </div>
          </div>
        </div>

        {/* 节点列表 */}
        <div className="bg-[#121417] border border-gray-800 p-4 rounded-lg flex flex-col h-[600px] overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-2">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <FaGlobe className="text-orange-500" />
              转发节点 (Nodes)
            </h4>
            <span className="text-[10px] font-mono text-gray-700">
              {filteredNodes.length}/{nodes.length} UNITS
            </span>
          </div>

          {/* 节点搜索 */}
          {nodes.length > 0 && (
            <div className="relative mb-3 px-2">
              <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-600 text-xs" />
              <input
                type="text"
                placeholder="搜索节点..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0D0E10] border border-gray-800 rounded px-8 py-1.5 text-xs focus:border-orange-500 outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                >
                  <FaTimes className="text-xs" />
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-800">
            {filteredNodes.map((node, i) => (
              <button
                key={i}
                onClick={() => handleSwitchNode(node.name)}
                disabled={!!actionLoading}
                className={`w-full text-left p-3 border rounded transition-all group disabled:opacity-70 ${
                  currentNode === node.name
                  ? 'bg-orange-600/10 border-orange-500/50'
                  : 'bg-[#0D0E10] border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1.5 overflow-hidden flex-1 mr-2">
                    <span className={`text-xs font-bold truncate ${currentNode === node.name ? 'text-orange-400' : 'text-gray-400'}`}>
                      {node.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getProtocolColor(node.type)}`}>
                        {node.type?.toUpperCase() || 'UNKNOWN'}
                      </span>
                      {node.server && (
                        <span className="text-[9px] text-gray-700 font-mono truncate">
                          {node.server}:{node.port}
                        </span>
                      )}
                    </div>
                  </div>
                  {currentNode === node.name ? (
                    <FaCheckCircle className="text-orange-500 shrink-0 mt-1 shadow-[0_0_10px_#f97316]" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-green-900/30 shrink-0 mt-1 group-hover:bg-green-500/30" />
                  )}
                </div>
              </button>
            ))}

            {nodes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-700">
                <FaSignal size={48} className="opacity-10 mb-4" />
                <p className="text-[10px] uppercase font-bold tracking-widest">No_Nodes_Available</p>
                <p className="text-[9px] text-gray-800 mt-2">请先配置订阅链接</p>
              </div>
            )}

            {nodes.length > 0 && filteredNodes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-700">
                <FaSearch size={32} className="opacity-10 mb-4" />
                <p className="text-[10px] uppercase font-bold tracking-widest">No_Match_Found</p>
                <p className="text-[9px] text-gray-800 mt-2">没有匹配的节点</p>
              </div>
            )}
          </div>

          {/* 当前节点状态 */}
          {currentNode && status?.isRunning && (
            <div className="mt-3 pt-3 border-t border-gray-800 px-2">
              <div className="text-[10px] text-gray-600 uppercase mb-1">当前节点</div>
              <div className="text-xs text-orange-400 font-bold truncate">{currentNode}</div>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#121417] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <FaExclamationTriangle className="text-red-500 text-xl" />
              <h3 className="text-lg font-bold text-gray-200">确认清除配置</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              此操作将停止代理服务并清除所有代理配置，包括订阅链接和节点列表。确定要继续吗？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={actionLoading === 'delete'}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfig}
                disabled={actionLoading === 'delete'}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-bold transition-colors disabled:opacity-50"
              >
                {actionLoading === 'delete' ? '清除中...' : '确认清除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProxyStation;
