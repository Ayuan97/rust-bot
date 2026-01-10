import { useState, useEffect } from 'react';
import {
  FaGlobe, FaPlay, FaStop, FaSync, FaCheck, FaExclamationTriangle,
  FaTrash, FaSave, FaNetworkWired, FaServer, FaCogs, FaShieldAlt
} from 'react-icons/fa';
import { useToast } from './Toast';
import proxyApi from '../services/proxy';
import socketService from '../services/socket';

/**
 * 代理设置组件 - 战术 OS 风格重构
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

  useEffect(() => {
    loadProxyStatus();
    loadNodes();

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
    toast.success(`已切换到节点: ${data.nodeName}`);
  };

  const handleProxyError = (data) => {
    toast.error(`代理链路错误: ${data.message}`);
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

  const handleSaveConfig = async () => {
    if (!subscriptionUrl.trim()) {
      toast.error('请输入有效的订阅链接');
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
        const { wasRunning, restartResult, nodeCount } = res.data.data;
        if (wasRunning && restartResult?.restarted) {
          toast.success(`配置已保存，系统正在重启代理链路 (${nodeCount} 个节点)`);
          setStatus(prev => ({ ...prev, hasConfig: true, isRunning: true, node: restartResult.node }));
        } else {
          toast.success(`配置已保存，成功解析 ${nodeCount} 个节点`);
          setStatus(prev => ({ ...prev, hasConfig: true }));
        }
        loadNodes();
        setSubscriptionUrl('');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProxy = async () => {
    setStarting(true);
    try {
      if (status.isRunning) {
        await proxyApi.stopProxy();
        setStatus(prev => ({ ...prev, isRunning: false, node: null }));
        toast.success('代理链路已切断');
      } else {
        const res = await proxyApi.startProxy(selectedNode);
        if (res.data.success) {
          setStatus(prev => ({ ...prev, isRunning: true, node: res.data.data.node }));
          toast.success('代理链路已建立');
          loadNodes();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '操作失败');
    } finally {
      setStarting(false);
    }
  };

  const handleSwitchNode = async (nodeName) => {
    if (!status.isRunning) {
      setSelectedNode(nodeName);
      return;
    }

    try {
      await proxyApi.switchProxyNode(nodeName);
      loadNodes();
    } catch (error) {
      toast.error(error.response?.data?.error || '切换节点失败');
    }
  };

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

  const handleDeleteConfig = async () => {
    if (!confirm('确定要彻底移除当前代理配置吗？这将导致依赖该代理的服务失效。')) return;

    try {
      await proxyApi.deleteProxyConfig();
      setStatus({ isRunning: false, hasConfig: false, node: null, proxyPort: 10808 });
      setNodes([]);
      setSelectedNode(null);
      toast.success('配置已成功移除');
    } catch (error) {
      toast.error('移除失败');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <FaSync className="animate-spin text-[#cd5241] text-2xl" />
      <span className="text-[10px] uppercase font-black tracking-widest text-gray-600 italic">Syncing_Proxy_States...</span>
    </div>
  );

  return (
    <div className="space-y-10 font-sans">
      {/* 核心状态面板 */}
      <div className={`tactic-border tactic-cut p-1 transition-all ${
        status.isRunning ? 'bg-green-500/10' : status.hasConfig ? 'bg-[#cd5241]/5' : 'bg-white/5'
      }`}>
        <div className="bg-black/40 p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="scanline opacity-20"></div>
          
          <div className="flex items-center gap-5 relative z-10">
            <div className={`w-14 h-14 tactic-cut flex items-center justify-center border transition-all ${
              status.isRunning ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-gray-800 border-white/10 text-gray-500'
            }`}>
              <FaGlobe className={status.isRunning ? 'text-2xl animate-pulse' : 'text-2xl'} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black uppercase tracking-widest text-white italic">
                  {status.isRunning ? '链路状态: 已连接' : status.hasConfig ? '链路状态: 待机中' : '链路状态: 未配置'}
                </span>
                {status.isRunning && <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />}
              </div>
              <p className="text-[10px] text-gray-500 uppercase mt-1 tracking-tighter">
                {status.isRunning && status.node
                  ? `${status.node.name} // PROTOCOL: ${status.node.type}`
                  : status.hasConfig
                    ? '已加载订阅配置，等待指挥官启动'
                    : '需要订阅链接以建立全球加密链路'
                }
              </p>
            </div>
          </div>

          {status.hasConfig && (
            <button
              onClick={handleToggleProxy}
              disabled={starting}
              className={`relative z-10 px-8 py-3 tactic-cut font-black uppercase italic text-[11px] tracking-[0.2em] transition-all shadow-lg ${
                status.isRunning 
                  ? 'bg-red-600/20 text-red-500 border border-red-500/30 hover:bg-red-600/40 shadow-red-500/10' 
                  : 'bg-[#cd5241] text-white hover:bg-[#b04537] shadow-[#cd5241]/20'
              }`}
            >
              <span className="flex items-center gap-3">
                {starting ? <FaSync className="animate-spin" /> : status.isRunning ? <FaStop /> : <FaPlay />}
                {status.isRunning ? '断开代理链路' : '建立代理链路'}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* 配置表单 */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-[#cd5241] border-l-2 border-[#cd5241] pl-3 mb-2">
            <FaNetworkWired />
            <h4 className="text-xs font-black uppercase tracking-widest italic">订阅配置中心</h4>
          </div>

          <div className="space-y-5 bg-white/[0.02] border border-white/5 p-6 tactic-cut">
            <div className="space-y-2">
              <label className="block text-[9px] font-black text-gray-600 uppercase tracking-widest pl-1">订阅 URL (Clash/V2Ray 格式)</label>
              <input
                type="text"
                value={subscriptionUrl}
                onChange={(e) => setSubscriptionUrl(e.target.value)}
                placeholder={status.hasConfig ? '已锁定 (输入新链接以覆盖)' : 'HTTPS://...'}
                className="w-full px-4 py-3 bg-black/40 border border-white/10 tactic-cut text-xs text-white placeholder-gray-800 focus:border-[#cd5241]/50 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-8">
              <label className="flex items-center gap-3 text-[10px] font-bold text-gray-500 cursor-pointer group">
                <div className={`w-4 h-4 tactic-cut border flex items-center justify-center transition-all ${autoStart ? 'bg-[#cd5241] border-[#cd5241]' : 'bg-black/40 border-white/10'}`}>
                  {autoStart && <FaCheck className="text-[8px] text-white" />}
                </div>
                <input type="checkbox" className="hidden" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
                <span className="group-hover:text-gray-300">系统启动时自动连接</span>
              </label>

              <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500">
                <span className="uppercase tracking-widest">监听端口:</span>
                <input
                  type="number"
                  value={proxyPort}
                  onChange={(e) => setProxyPort(parseInt(e.target.value) || 10808)}
                  className="w-20 px-2 py-1 bg-black/40 border border-white/10 tactic-cut text-white text-center font-mono outline-none focus:border-[#cd5241]/50"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveConfig}
                disabled={saving || !subscriptionUrl.trim()}
                className="flex-1 py-3 bg-[#cd5241] text-white tactic-cut text-[10px] font-black uppercase italic hover:bg-[#b04537] transition-all flex items-center justify-center gap-2"
              >
                {saving ? <FaSync className="animate-spin" /> : <FaSave />} 保存配置
              </button>

              {status.hasConfig && (
                <>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="px-4 py-3 bg-white/5 border border-white/10 text-gray-500 hover:text-white tactic-cut transition-all"
                    title="刷新节点"
                  >
                    <FaSync className={refreshing ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={handleDeleteConfig}
                    className="px-4 py-3 bg-white/5 border border-white/10 text-gray-500 hover:text-red-500 tactic-cut transition-all"
                    title="清除配置"
                  >
                    <FaTrash />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-5 bg-blue-500/5 border border-blue-500/20 tactic-cut">
            <div className="flex gap-4">
              <FaShieldAlt className="text-blue-400 text-lg flex-shrink-0" />
              <div className="text-[10px] text-gray-500 space-y-2 uppercase leading-relaxed font-medium">
                <p className="text-blue-400 font-black italic tracking-widest">安全与连接说明</p>
                <p>1. 代理链路仅用于转发系统与 FCM 服务器 (Google) 的加密通讯及部分外部 API 请求。</p>
                <p>2. 支持 Clash (YAML) 和 V2Ray (Base64) 订阅格式，兼容 VMess、VLESS、Trojan、Shadowsocks 等主流协议。</p>
                <p>3. 订阅链接仅持久化存储于本地服务器加密数据库，确保数据隐私。</p>
              </div>
            </div>
          </div>
        </div>

        {/* 节点选择列表 */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-3 text-[#cd5241] border-l-2 border-[#cd5241] pl-3">
              <FaServer />
              <h4 className="text-xs font-black uppercase tracking-widest italic">加密节点矩阵 ({nodes.length})</h4>
            </div>
          </div>

          <div className="flex-1 max-h-[420px] overflow-y-auto space-y-2 pr-3 custom-scrollbar">
            {nodes.length > 0 ? nodes.map((node, index) => {
              const isCurrentNode = status.isRunning ? node.isActive : (selectedNode === node.name);

              return (
                <button
                  key={index}
                  onClick={() => handleSwitchNode(node.name)}
                  className={`w-full group flex items-center justify-between p-4 tactic-cut transition-all border ${
                    isCurrentNode
                      ? 'bg-[#cd5241]/10 border-[#cd5241]/40'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 tactic-cut transition-all ${
                      node.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-700'
                    }`} />
                    <div className="text-left">
                      <div className={`text-[11px] font-black uppercase italic transition-colors ${isCurrentNode ? 'text-[#cd5241]' : 'text-gray-400 group-hover:text-gray-200'}`}>
                        {node.name}
                      </div>
                      <div className="text-[9px] text-gray-600 font-mono mt-0.5 uppercase tracking-tighter">
                        {node.type} // {node.server}:{node.port}
                      </div>
                    </div>
                  </div>

                  {node.isActive && (
                    <div className="flex items-center gap-2 text-[9px] font-black text-green-500 uppercase italic">
                      <FaCheck /> 活跃链路
                    </div>
                  )}
                </button>
              );
            }) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20 border-2 border-dashed border-white/5 tactic-cut py-20">
                <FaCogs className="text-4xl mb-4" />
                <p className="text-[10px] uppercase font-black tracking-[0.3em]">No_Nodes_Available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProxySettings;
