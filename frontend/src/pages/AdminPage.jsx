import React, { useEffect, useMemo, useState } from 'react';
import {
  FaBoxOpen,
  FaChartLine,
  FaExclamationTriangle,
  FaServer,
  FaSync,
  FaTerminal,
  FaTools,
  FaUsers
} from 'react-icons/fa';
import api from '../services/api';
import SurvivorRoster from '../components/admin/SurvivorRoster';
import TradeCenter from '../components/admin/TradeCenter';
import SystemLogs from '../components/admin/SystemLogs';
import PlanManager from '../components/admin/PlanManager';
import NodeMonitor from '../components/admin/NodeMonitor';

const TAB_CONFIG = [
  {
    id: 'survivors',
    label: '用户运营',
    desc: '用户状态、资产、服务连通',
    icon: FaUsers
  },
  {
    id: 'trade',
    label: '交易运营',
    desc: '流水、订单、异常支付追踪',
    icon: FaChartLine
  },
  {
    id: 'plans',
    label: '套餐策略',
    desc: '价格、权益和启停管理',
    icon: FaBoxOpen
  },
  {
    id: 'nodes',
    label: '节点运行',
    desc: '分布式容量与健康状态',
    icon: FaServer
  },
  {
    id: 'logs',
    label: '系统诊断',
    desc: '按用户追踪实时日志',
    icon: FaTerminal
  }
];

function formatBytes(bytes = 0) {
  if (bytes <= 0) return '0 B';
  const unit = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${unit[index]}`;
}

function formatUptime(ms = 0) {
  const seconds = Math.floor(ms / 1000);
  const day = Math.floor(seconds / 86400);
  const hour = Math.floor((seconds % 86400) / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  if (day > 0) return `${day}天 ${hour}小时`;
  if (hour > 0) return `${hour}小时 ${minute}分钟`;
  return `${minute}分钟`;
}

function toneClass(tone) {
  if (tone === 'healthy') return 'text-green-300 bg-green-500/10 border-green-500/30';
  if (tone === 'warn') return 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30';
  if (tone === 'danger') return 'text-red-300 bg-red-500/10 border-red-500/30';
  return 'text-gray-300 bg-white/[0.03] border-white/10';
}

function HealthPill({ label, value, tone = 'neutral' }) {
  return (
    <div className={`border rounded-lg px-3 py-2 ${toneClass(tone)}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-sm font-bold mt-1">{value}</div>
    </div>
  );
}

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('survivors');
  const [systemStats, setSystemStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preselectedUserId, setPreselectedUserId] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const heapUsagePercent = useMemo(() => {
    const used = systemStats?.memoryUsage?.heapUsed || 0;
    const total = systemStats?.memoryUsage?.heapTotal || 0;
    if (!total) return 0;
    return (used / total) * 100;
  }, [systemStats]);

  const healthTone = useMemo(() => {
    if (heapUsagePercent >= 90) return 'danger';
    if (heapUsagePercent >= 75) return 'warn';
    return 'healthy';
  }, [heapUsagePercent]);

  const activeTabConfig = TAB_CONFIG.find((tab) => tab.id === activeTab) || TAB_CONFIG[0];

  const fetchSystemStats = async () => {
    try {
      const res = await api.get('/admin/system');
      if (res.data.success) {
        setSystemStats(res.data.data);
        setLastUpdatedAt(new Date());
      }
    } catch (err) {
      console.error('获取系统状态失败', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemStats();
    const interval = setInterval(fetchSystemStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToLogs = (userId) => {
    setPreselectedUserId(userId);
    setActiveTab('logs');
  };

  const renderView = () => {
    if (activeTab === 'survivors') return <SurvivorRoster onNavigateToLogs={handleNavigateToLogs} />;
    if (activeTab === 'trade') return <TradeCenter />;
    if (activeTab === 'plans') return <PlanManager />;
    if (activeTab === 'nodes') return <NodeMonitor />;
    if (activeTab === 'logs') {
      return <SystemLogs preselectedUserId={preselectedUserId} onUserSelected={() => setPreselectedUserId(null)} />;
    }
    return null;
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#0D0E10] text-gray-200">
      <header className="shrink-0 border-b border-white/10 bg-[#121417]/95 px-3 md:px-6 py-3 md:py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-orange-400">
              <FaTools />
              <span className="text-xs uppercase tracking-widest font-black">运营后台</span>
            </div>
            <h1 className="text-lg md:text-xl font-black mt-1">TC Hub 控制台</h1>
            <p className="text-xs text-gray-500 mt-1">
              当前模块：{activeTabConfig.label} · {activeTabConfig.desc}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSystemStats}
              disabled={loading}
              className="px-3 py-2 border border-white/10 hover:border-orange-500/50 hover:bg-orange-500/10 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <FaSync className={loading ? 'animate-spin' : ''} />
                刷新状态
              </span>
            </button>
          </div>
        </div>

        {systemStats && (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2">
            <HealthPill label="运行时长" value={formatUptime(systemStats.uptime)} tone="healthy" />
            <HealthPill label="堆内存占用" value={`${heapUsagePercent.toFixed(1)}%`} tone={healthTone} />
            <HealthPill label="总内存占用" value={formatBytes(systemStats.memoryUsage?.rss)} tone="neutral" />
            <HealthPill
              label="活跃服务实例"
              value={`${systemStats.activeUserServices || 0} 组`}
              tone={systemStats.activeUserServices > 0 ? 'healthy' : 'warn'}
            />
            <HealthPill
              label="最后刷新"
              value={lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-CN') : '-'}
              tone="neutral"
            />
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <nav className="shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0F1114] lg:w-64">
          <div className="flex lg:flex-col gap-1 p-2 overflow-x-auto lg:overflow-x-visible">
            {TAB_CONFIG.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-w-[150px] lg:min-w-0 text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    isActive
                      ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                      : 'border-white/5 bg-white/[0.02] text-gray-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon className="text-xs" />
                    {tab.label}
                  </div>
                  <p className="text-[11px] mt-1 text-gray-500 hidden lg:block">{tab.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:block p-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-200">
              <div className="inline-flex items-center gap-2 font-bold uppercase tracking-wider text-[10px]">
                <FaExclamationTriangle />
                操作审计开启
              </div>
              <p className="mt-1 text-red-200/80 leading-relaxed">
                高风险操作均会写入管理员日志，建议在操作前确认用户与订单归属。
              </p>
            </div>
          </div>
        </nav>

        <main className="flex-1 min-h-0 overflow-auto relative">
          <div className="absolute inset-0 scanline pointer-events-none opacity-5" />
          <div className="relative p-3 md:p-6">{renderView()}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
