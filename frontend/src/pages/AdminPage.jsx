import React, { useState, useEffect } from 'react';
import {
  FaUsers, FaChartLine, FaTerminal, FaHistory,
  FaExclamationTriangle, FaSearch, FaFilter, FaSync, FaCog,
  FaArrowUp, FaArrowDown, FaWallet, FaHourglassHalf, FaCircle,
  FaShieldAlt, FaTools, FaDatabase, FaBoxOpen, FaServer
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// 子组件导入
import SurvivorRoster from '../components/admin/SurvivorRoster';
import TradeCenter from '../components/admin/TradeCenter';
import SystemLogs from '../components/admin/SystemLogs';
import PlanManager from '../components/admin/PlanManager';
import NodeMonitor from '../components/admin/NodeMonitor';

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('survivors');
  const [systemStats, setSystemStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preselectedUserId, setPreselectedUserId] = useState(null);

  // 从幸存者大盘跳转到系统诊断
  const handleNavigateToLogs = (userId) => {
    setPreselectedUserId(userId);
    setActiveTab('logs');
  };

  useEffect(() => {
    fetchSystemStats();
    const interval = setInterval(fetchSystemStats, 10000); // 10秒刷新一次系统状态
    return () => clearInterval(interval);
  }, []);

  const fetchSystemStats = async () => {
    try {
      const res = await api.get('/admin/system');
      if (res.data.success) {
        setSystemStats(res.data.data);
      }
    } catch (err) {
      console.error('获取系统状态失败', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'survivors', label: '幸存者大盘', icon: <FaUsers /> },
    { id: 'trade', label: '贸易清单', icon: <FaChartLine /> },
    { id: 'plans', label: '套餐配置', icon: <FaBoxOpen /> },
    { id: 'nodes', label: '节点监控', icon: <FaServer /> },
    { id: 'logs', label: '系统诊断', icon: <FaTerminal /> },
  ];

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full bg-[#0D0E10] text-gray-300 font-mono">
      {/* 顶部硬核监控头 */}
      <div className="h-14 border-b border-gray-800 bg-[#121417] flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <FaTools className="text-orange-500" />
            <span className="font-bold text-gray-100 uppercase tracking-wider">领地柜总控 TC Hub</span>
          </div>
          
          {systemStats && (
            <div className="flex items-center gap-8 text-xs border-l border-gray-700 pl-8">
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px]">系统负载</span>
                <span className="text-green-400">{(systemStats.memoryUsage.heapUsed / systemStats.memoryUsage.heapTotal * 100).toFixed(1)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px]">总内存占用</span>
                <span className="text-blue-400">{formatBytes(systemStats.memoryUsage.rss)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px]">活跃链路</span>
                <span className="text-orange-400">{systemStats.activeUserServices} 组</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px]">运行环境</span>
                <span className="text-purple-400">{systemStats.platform} | {systemStats.nodeVersion}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={fetchSystemStats}
            className="p-2 hover:bg-gray-800 rounded transition-colors"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 内部分页导航 */}
        <div className="w-48 border-r border-gray-800 bg-[#0F1114] flex flex-col py-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-6 py-4 transition-all relative ${
                activeTab === tab.id 
                ? 'text-orange-500 bg-orange-500/5' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span className="text-sm font-bold uppercase tracking-widest">{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-orange-500" />
              )}
            </button>
          ))}
          
          <div className="mt-auto p-4">
            <div className="p-3 bg-red-900/10 border border-red-900/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-500 text-xs font-bold mb-1">
                <FaExclamationTriangle />
                <span>核心状态</span>
              </div>
              <p className="text-[10px] text-red-500/70">所有操作将被记录在 [Admin_Log] 协议中。</p>
            </div>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-auto bg-[#0D0E10] relative">
          <div className="absolute inset-0 scanline pointer-events-none opacity-5" />
          
          <div className="p-6">
            {activeTab === 'survivors' && <SurvivorRoster onNavigateToLogs={handleNavigateToLogs} />}
            {activeTab === 'trade' && <TradeCenter />}
            {activeTab === 'plans' && <PlanManager />}
            {activeTab === 'nodes' && <NodeMonitor />}
            {activeTab === 'logs' && <SystemLogs preselectedUserId={preselectedUserId} onUserSelected={() => setPreselectedUserId(null)} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
