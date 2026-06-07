import React, { useEffect, useMemo, useState } from 'react';
import {
  FaBoxOpen,
  FaChartLine,
  FaExclamationTriangle,
  FaServer,
  FaSync,
  FaTerminal,
  FaTools,
  FaUsers,
  FaSlidersH
} from 'react-icons/fa';
import api from '../services/api';
import SurvivorRoster from '../components/admin/SurvivorRoster';
import TradeCenter from '../components/admin/TradeCenter';
import SystemLogs from '../components/admin/SystemLogs';
import PlanManager from '../components/admin/PlanManager';
import NodeMonitor from '../components/admin/NodeMonitor';
import SystemSettings from '../components/admin/SystemSettings';

const TAB_CONFIG = [
  { id: 'survivors', label: '用户运营', en: 'USERS', desc: '用户状态、资产、服务连通', icon: FaUsers },
  { id: 'trade', label: '交易运营', en: 'TRADE', desc: '流水、订单、异常支付追踪', icon: FaChartLine },
  { id: 'plans', label: '套餐策略', en: 'PLANS', desc: '价格、权益和启停管理', icon: FaBoxOpen },
  { id: 'nodes', label: '节点运行', en: 'NODES', desc: '分布式容量与健康状态', icon: FaServer },
  { id: 'logs', label: '系统诊断', en: 'LOGS', desc: '按用户追踪实时日志', icon: FaTerminal },
  { id: 'config', label: '系统设置', en: 'CONFIG', desc: '注册模式与免费策略', icon: FaSlidersH }
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

// 健康指标配色收敛：healthy=terminal，warn/danger=hazard，neutral=中性
function toneClass(tone) {
  if (tone === 'healthy') return 'text-terminal border-terminal/30 bg-ink-850';
  if (tone === 'warn') return 'text-hazard border-hazard/30 bg-ink-850';
  if (tone === 'danger') return 'text-hazard border-hazard/40 bg-hazard-dim';
  return 'text-fg-dim border-ink-line bg-ink-850';
}

function HealthPill({ label, value, tone = 'neutral' }) {
  return (
    <div className={`border px-3 py-2 ${toneClass(tone)}`}>
      <div className="font-mono text-[9px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-mono text-sm font-bold mt-1 tabular-nums">{value}</div>
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
    if (activeTab === 'config') return <SystemSettings />;
    return null;
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-ink-900 text-fg">
      <header className="shrink-0 border-b border-ink-line bg-ink-900 px-3 md:px-6 py-3 md:py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="tac-label flex items-center gap-2">
              <FaTools className="text-hazard" /> 运营后台 // ADMIN
            </div>
            <h1 className="text-xl font-extrabold text-fg mt-1">运营控制台</h1>
            <p className="text-[13px] text-fg-dim mt-1">
              当前模块：{activeTabConfig.label} · {activeTabConfig.desc}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchSystemStats}
            disabled={loading}
            className="tac-btn tac-btn-ghost !py-2.5 self-start"
          >
            <FaSync className={loading ? 'animate-spin' : ''} /> 刷新状态
          </button>
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
        <nav className="shrink-0 border-b lg:border-b-0 lg:border-r border-ink-line bg-ink-900 lg:w-64">
          <div className="flex lg:flex-col gap-1 p-2 overflow-x-auto lg:overflow-x-visible">
            {TAB_CONFIG.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-w-[150px] lg:min-w-0 text-left border-l-2 px-3 py-2.5 transition-colors ${
                    isActive
                      ? 'border-hazard bg-hazard-dim text-fg'
                      : 'border-transparent text-fg-dim hover:text-fg hover:bg-ink-800'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon className={`text-xs ${isActive ? 'text-hazard' : ''}`} />
                    {tab.label}
                    <span className="tac-label !text-[9px] ml-auto hidden lg:inline">{tab.en}</span>
                  </div>
                  <p className="text-[11px] mt-1 text-fg-mute hidden lg:block">{tab.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:block p-3">
            <div className="border border-hazard/30 bg-hazard-dim px-3 py-2.5">
              <div className="tac-label !text-hazard flex items-center gap-2">
                <FaExclamationTriangle /> 操作审计开启
              </div>
              <p className="mt-1.5 text-[11px] text-fg-dim leading-relaxed">
                高风险操作均会写入管理员日志，建议在操作前确认用户与订单归属。
              </p>
            </div>
          </div>
        </nav>

        <main className="flex-1 min-h-0 overflow-auto">
          <div className="p-3 md:p-6">{renderView()}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
