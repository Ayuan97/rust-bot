import React, { useEffect, useMemo, useState } from 'react';
import {
  FaServer,
  FaSync,
  FaHeartbeat,
  FaPlug,
  FaStream,
  FaExclamationTriangle
} from 'react-icons/fa';
import api from '../../services/api';

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatAgo(dateValue) {
  if (!dateValue) return '从未';
  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '刚刚';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  return `${day} 天前`;
}

function statusLabel(node) {
  // 状态色收敛：在线=terminal 绿（单点状态），其余告警/异常=hazard 红
  if (node.status === 'DRAINING') {
    return { text: '排空中', tone: 'hazard' };
  }
  if (node.status === 'OFFLINE') {
    return { text: '离线', tone: 'hazard' };
  }
  if (!node.heartbeatAlive) {
    return { text: '心跳超时', tone: 'hazard' };
  }
  return { text: '在线', tone: 'online' };
}

export default function NodeMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [error, setError] = useState('');

  const fetchStatus = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.get('/admin/distributed/status');
      if (res.data.success) {
        setData(res.data.data);
        setError('');
        setLastUpdatedAt(new Date());
      } else {
        setError(res.data.error || '获取节点状态失败');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || '获取节点状态失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => fetchStatus({ silent: true }), 10000);
    return () => clearInterval(timer);
  }, []);

  const summary = data?.summary || {};
  const nodes = data?.nodes || [];

  const queueReasonText = useMemo(() => {
    const items = summary.queueByReason || [];
    if (!items.length) return '无排队';
    return items.map((item) => `${item.reason}: ${item.count}`).join(' / ');
  }, [summary.queueByReason]);

  if (loading) {
    return (
      <div className="tac-label py-8 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" /> LOADING NODES // 正在加载节点状态…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="tac-label flex items-center gap-2">
            <FaServer className="text-hazard" /> 节点运行 // NODES
          </div>
          <h3 className="text-lg font-bold text-fg mt-1">子节点监控</h3>
          <p className="text-[11px] text-fg-mute mt-1 font-mono tracking-wider">
            LAST SYNC · {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-CN') : '未知'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchStatus({ silent: true })}
          disabled={refreshing}
          className="tac-btn tac-btn-ghost !py-2.5 shrink-0"
        >
          <FaSync className={refreshing ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
          <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[ERR]</span>
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-px bg-ink-line border border-ink-line">
        <MetricCard
          icon={<FaServer />}
          label="在线节点"
          value={`${summary.liveOnlineNodes || 0} / ${summary.registeredNodes || 0}`}
        />
        <MetricCard
          icon={<FaPlug />}
          label="活跃会话"
          value={`${summary.activeSessions || 0} / ${summary.totalCapacity || 0}`}
        />
        <MetricCard
          icon={<FaStream />}
          label="排队请求"
          value={summary.pendingQueue || 0}
        />
        <MetricCard
          icon={<FaHeartbeat />}
          label="全局利用率"
          value={formatPercent(summary.globalUtilization)}
        />
        <MetricCard
          icon={<FaHeartbeat />}
          label="热点服利用率"
          value={formatPercent(summary.hottestServerUtilization)}
        />
        <MetricCard
          icon={<FaExclamationTriangle />}
          label="5分钟失败"
          value={summary.failedSessionsIn5m || 0}
        />
      </div>

      <div className="text-xs text-fg-dim flex items-center gap-2">
        <span className="tac-label !text-[9px]">QUEUE</span>
        排队原因：<span className="font-mono tabular-nums text-fg">{queueReasonText}</span>
      </div>

      <div className="overflow-x-auto border border-ink-line">
        <table className="w-full text-xs">
          <thead className="bg-ink-800">
            <tr className="text-fg-dim">
              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">节点</th>
              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">状态</th>
              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">会话</th>
              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">容量</th>
              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">心跳</th>
              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">区域</th>
            </tr>
          </thead>
          <tbody>
            {nodes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 px-3 text-center text-fg-mute">
                  暂无已注册节点
                </td>
              </tr>
            )}
            {nodes.map((node) => {
              const tag = statusLabel(node);
              const online = tag.tone === 'online';
              return (
                <tr key={node.id} className="border-t border-ink-line hover:bg-ink-800/60 transition-colors">
                  <td className="py-3 px-3">
                    <div className="text-fg font-mono font-semibold tabular-nums">{node.id}</div>
                    <div className="text-fg-mute mt-1 font-mono tabular-nums">{node.publicIp}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 border ${online ? 'text-terminal border-terminal/30' : 'text-hazard border-hazard/30 bg-hazard-dim'}`}>
                      <span className={`w-1.5 h-1.5 ${online ? 'bg-terminal animate-tac-blink' : 'bg-hazard'}`} />
                      {tag.text}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-fg-dim">
                    <div className="text-fg">活跃 <span className="font-mono tabular-nums">{node.activeSessions}</span></div>
                    <div className="text-fg-mute mt-1 font-mono tabular-nums">
                      连接中 {node.connectingSessions} / 已连 {node.connectedSessions}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-fg-dim">
                    <div className="text-fg font-mono tabular-nums">{node.totalCapacity}</div>
                    <div className="text-fg-mute mt-1">利用率 <span className="font-mono tabular-nums">{formatPercent(node.utilization)}</span></div>
                  </td>
                  <td className="py-3 px-3 text-fg-dim">
                    <div className="text-fg">{node.lastHeartbeatAt ? formatAgo(node.lastHeartbeatAt) : '从未'}</div>
                    <div className="text-fg-mute mt-1 font-mono tabular-nums">TTL {summary.heartbeatTtlSec || 0}s</div>
                  </td>
                  <td className="py-3 px-3 text-fg-dim font-mono">
                    {node.region || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="bg-ink-850 px-3 py-2.5">
      <div className="text-fg-dim text-[11px] flex items-center gap-2">
        <span className="text-hazard text-xs">{icon}</span>
        {label}
      </div>
      <div className="text-fg text-lg font-bold font-mono tabular-nums mt-2">{value}</div>
    </div>
  );
}
