import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function StatsDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // 每30秒刷新
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data.data);
      setError(null);
    } catch (err) {
      console.error('获取统计数据失败:', err);
      setError(err.response?.data?.error || '获取统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-white text-center py-8">加载中...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center py-8">{error}</div>;
  }

  if (!stats) {
    return null;
  }

  // 数据卡片组件
  const StatCard = ({ title, value, subtitle, icon, color }) => (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm mb-1">{title}</p>
          <p className={`text-3xl font-bold ${color || 'text-white'}`}>{value}</p>
          {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-4xl opacity-20">{icon}</div>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">统计概览</h2>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          🔄 刷新数据
        </button>
      </div>

      {/* 用户统计 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">用户数据</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总用户数"
            value={stats.totalUsers}
            icon="👥"
            color="text-blue-400"
          />
          <StatCard
            title="活跃用户"
            value={stats.activeUsers}
            subtitle={`${((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)}% 活跃率`}
            icon="✅"
            color="text-green-400"
          />
          <StatCard
            title="试用用户"
            value={stats.trialUsers}
            icon="🆓"
            color="text-yellow-400"
          />
          <StatCard
            title="付费用户"
            value={stats.paidUsers}
            icon="💎"
            color="text-purple-400"
          />
        </div>
      </div>

      {/* 订阅统计 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">订阅状态</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="即将过期"
            value={stats.expiringSoonUsers}
            subtitle="7天内到期"
            icon="⏰"
            color="text-orange-400"
          />
          <StatCard
            title="已过期"
            value={stats.expiredUsers}
            icon="❌"
            color="text-red-400"
          />
          <StatCard
            title="被禁用"
            value={stats.bannedUsers}
            icon="🚫"
            color="text-gray-400"
          />
        </div>
      </div>

      {/* 订单和收入统计 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">订单与收入</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总收入"
            value={`¥${stats.totalRevenue.toFixed(2)}`}
            icon="💰"
            color="text-green-400"
          />
          <StatCard
            title="今日收入"
            value={`¥${stats.todayRevenue.toFixed(2)}`}
            icon="📈"
            color="text-emerald-400"
          />
          <StatCard
            title="成功订单"
            value={stats.successOrders}
            subtitle={`待支付: ${stats.pendingOrders}`}
            icon="📦"
            color="text-blue-400"
          />
          <StatCard
            title="今日订单"
            value={stats.todayOrders}
            icon="🛒"
            color="text-cyan-400"
          />
        </div>
      </div>

      {/* Rust+ 业务统计 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Rust+ 业务数据</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="总服务器"
            value={stats.totalServers}
            icon="🖥️"
            color="text-blue-400"
          />
          <StatCard
            title="已连接"
            value={stats.connectedServers}
            subtitle={`${((stats.connectedServers / (stats.totalServers || 1)) * 100).toFixed(1)}% 连接率`}
            icon="🔗"
            color="text-green-400"
          />
          <StatCard
            title="总设备"
            value={stats.totalDevices}
            icon="💡"
            color="text-yellow-400"
          />
          <StatCard
            title="活跃连接"
            value={stats.activeConnections}
            subtitle="UserServiceManager 实例"
            icon="⚡"
            color="text-purple-400"
          />
          <StatCard
            title="FCM 监听"
            value={stats.fcmActiveUsers}
            subtitle="用户 FCM 活跃数"
            icon="📡"
            color="text-pink-400"
          />
        </div>
      </div>

      {/* 事件统计 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">事件数据</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            title="今日事件"
            value={stats.todayEvents}
            icon="📊"
            color="text-indigo-400"
          />
          <StatCard
            title="总事件日志"
            value={stats.totalEventLogs}
            icon="📝"
            color="text-teal-400"
          />
        </div>
      </div>

      {/* 最后更新时间 */}
      <div className="text-center text-gray-500 text-sm">
        最后更新: {new Date().toLocaleString('zh-CN')}
      </div>
    </div>
  );
}

export default StatsDashboard;
