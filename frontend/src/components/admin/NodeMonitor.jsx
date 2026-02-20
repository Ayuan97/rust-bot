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
  if (node.status === 'DRAINING') {
    return { text: '排空中', className: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' };
  }
  if (node.status === 'OFFLINE') {
    return { text: '离线', className: 'text-red-400 border-red-400/30 bg-red-400/10' };
  }
  if (!node.heartbeatAlive) {
    return { text: '心跳超时', className: 'text-orange-400 border-orange-400/30 bg-orange-400/10' };
  }
  return { text: '在线', className: 'text-green-400 border-green-400/30 bg-green-400/10' };
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
    return <div className="text-sm text-gray-400 py-8">正在加载节点状态...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">子节点监控</h3>
          <p className="text-xs text-gray-500 mt-1">
            最近更新：{lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('zh-CN') : '未知'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchStatus({ silent: true })}
          disabled={refreshing}
          className="px-3 py-2 text-xs font-bold rounded border border-white/10 hover:border-[#cd5241]/40 hover:bg-[#cd5241]/10 transition-colors disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            <FaSync className={refreshing ? 'animate-spin' : ''} />
            刷新
          </span>
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 border border-red-400/30 bg-red-400/10 rounded p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
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

      <div className="text-xs text-gray-500">
        排队原因：{queueReasonText}
      </div>

      <div className="overflow-x-auto border border-white/10 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-gray-400">
            <tr>
              <th className="text-left py-3 px-3">节点</th>
              <th className="text-left py-3 px-3">状态</th>
              <th className="text-left py-3 px-3">会话</th>
              <th className="text-left py-3 px-3">容量</th>
              <th className="text-left py-3 px-3">心跳</th>
              <th className="text-left py-3 px-3">区域</th>
            </tr>
          </thead>
          <tbody>
            {nodes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 px-3 text-center text-gray-500">
                  暂无已注册节点
                </td>
              </tr>
            )}
            {nodes.map((node) => {
              const tag = statusLabel(node);
              return (
                <tr key={node.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="py-3 px-3">
                    <div className="text-white font-semibold">{node.id}</div>
                    <div className="text-gray-500 mt-1">{node.publicIp}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-block px-2 py-1 rounded border ${tag.className}`}>
                      {tag.text}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-300">
                    <div>活跃 {node.activeSessions}</div>
                    <div className="text-gray-500 mt-1">
                      连接中 {node.connectingSessions} / 已连 {node.connectedSessions}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-gray-300">
                    <div>{node.totalCapacity}</div>
                    <div className="text-gray-500 mt-1">利用率 {formatPercent(node.utilization)}</div>
                  </td>
                  <td className="py-3 px-3 text-gray-300">
                    <div>{node.lastHeartbeatAt ? formatAgo(node.lastHeartbeatAt) : '从未'}</div>
                    <div className="text-gray-500 mt-1">TTL {summary.heartbeatTtlSec || 0}s</div>
                  </td>
                  <td className="py-3 px-3 text-gray-400">
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
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
      <div className="text-gray-500 text-[11px] flex items-center gap-2">
        <span className="text-[#cd5241]">{icon}</span>
        {label}
      </div>
      <div className="text-white text-lg font-bold mt-2">{value}</div>
    </div>
  );
}
