import React, { useState, useEffect } from 'react';
import { 
  FaSatellite, FaSync, FaPlay, FaStop, FaPlus, FaTrashAlt, 
  FaNetworkWired, FaSignal, FaCheckCircle, FaTimesCircle, FaGlobe
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';
import socketService from '../../services/socket';

const ProxyStation = () => {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [config, setConfig] = useState({
    subscriptionUrl: '',
    proxyPort: 10808,
    autoStart: false
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchNodes();
    
    // 监听实时状态更新
    socketService.on('proxy:status', setStatus);
    socketService.on('proxy:nodes', setNodes);

    return () => {
      socketService.off('proxy:status');
      socketService.off('proxy:nodes');
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/proxy/status');
      if (res.data.success) {
        setStatus(res.data.data);
        if (res.data.data.config) {
          setConfig(res.data.data.config);
        }
      }
    } catch (err) {
      console.error('获取代理状态失败', err);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await api.get('/proxy/nodes');
      if (res.data.success) setNodes(res.data.data);
    } catch (err) {
      console.error('获取节点失败', err);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      const res = await api.post('/proxy/config', config);
      if (res.data.success) {
        toast.success('代理配置已保存');
        fetchStatus();
      }
    } catch (err) {
      toast.error('保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleControl = async (action) => {
    setLoading(true);
    try {
      const res = await api.post(`/proxy/${action}`);
      if (res.data.success) {
        toast.success(`代理服务已${action === 'start' ? '启动' : '停止'}`);
        fetchStatus();
      }
    } catch (err) {
      toast.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchNode = async (nodeName) => {
    try {
      const res = await api.post('/proxy/switch', { nodeName });
      if (res.data.success) {
        toast.success(`已切换至节点: ${nodeName}`);
      }
    } catch (err) {
      toast.error('切换节点失败');
    }
  };

  const handleRefreshNodes = async () => {
    setLoading(true);
    try {
      const res = await api.post('/proxy/refresh');
      if (res.data.success) {
        toast.success('节点订阅已更新');
        fetchNodes();
      }
    } catch (err) {
      toast.error('刷新节点失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FaSatellite className="text-orange-500" />
          信号转发总站
        </h2>
        
        <div className="flex gap-2">
          {status?.isRunning ? (
            <button 
              onClick={() => handleControl('stop')}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/20 text-red-500 border border-red-900/30 rounded text-xs font-bold hover:bg-red-900/40 transition-all"
            >
              <FaStop /> 停止核心核心
            </button>
          ) : (
            <button 
              onClick={() => handleControl('start')}
              className="flex items-center gap-2 px-4 py-2 bg-green-900/20 text-green-500 border border-green-900/30 rounded text-xs font-bold hover:bg-green-900/40 transition-all"
            >
              <FaPlay /> 启动转发核心
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
                    disabled={loading || !config.subscriptionUrl}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 disabled:opacity-50"
                  >
                    <FaSync className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase mb-1">本地转发端口 (SOCKS5)</label>
                  <input 
                    type="number"
                    value={config.proxyPort}
                    onChange={(e) => setConfig({...config, proxyPort: parseInt(e.target.value)})}
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
                disabled={loading}
                className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-widest rounded transition-all shadow-lg"
              >
                保存并应用链路配置
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
          </div>
        </div>

        {/* 节点列表 */}
        <div className="bg-[#121417] border border-gray-800 p-4 rounded-lg flex flex-col h-[600px] overflow-hidden">
          <div className="flex items-center justify-between mb-4 px-2">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <FaGlobe className="text-orange-500" />
              转发节点 (Nodes)
            </h4>
            <span className="text-[10px] font-mono text-gray-700">{nodes.length} UNITS</span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-800">
            {nodes.map((node, i) => (
              <button 
                key={i}
                onClick={() => handleSwitchNode(node)}
                className={`w-full text-left p-3 border rounded transition-all group ${
                  status?.selectedNode === node 
                  ? 'bg-orange-600/10 border-orange-500/50' 
                  : 'bg-[#0D0E10] border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <span className={`text-xs font-bold truncate ${status?.selectedNode === node ? 'text-orange-400' : 'text-gray-400'}`}>
                      {node}
                    </span>
                    <span className="text-[9px] text-gray-700 font-mono">PROTO: SHADOWSOCKS</span>
                  </div>
                  {status?.selectedNode === node ? (
                    <FaCheckCircle className="text-orange-500 shrink-0 mt-1 shadow-[0_0_10px_#f97316]" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-green-900/30 shrink-0 mt-1" />
                  )}
                </div>
              </button>
            ))}
            {nodes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-700">
                <FaSignal size={48} className="opacity-10 mb-4" />
                <p className="text-[10px] uppercase font-bold tracking-widest">No_Nodes_Available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProxyStation;

