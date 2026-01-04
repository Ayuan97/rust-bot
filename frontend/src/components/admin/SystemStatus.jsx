import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../Toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function SystemStatus() {
  const { showToast } = useToast();
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 10000); // 每10秒刷新
    return () => clearInterval(interval);
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/admin/system`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSystem(response.data.data);
    } catch (error) {
      console.error('获取系统状态失败:', error);
      showToast('获取系统状态失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} 天 ${hours % 24} 小时`;
    } else if (hours > 0) {
      return `${hours} 小时 ${minutes % 60} 分钟`;
    } else if (minutes > 0) {
      return `${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `${seconds} 秒`;
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (loading) {
    return <div className="text-white text-center py-8">加载中...</div>;
  }

  if (!system) {
    return null;
  }

  const InfoCard = ({ title, value, subtitle, icon, color }) => (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-gray-400 text-sm mb-1">{title}</p>
          <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
          {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-4xl opacity-20 ml-4">{icon}</div>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">系统状态</h2>
        <button
          onClick={fetchSystemStatus}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          🔄 刷新数据
        </button>
      </div>

      {/* 基础信息 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">基础信息</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard
            title="运行时长"
            value={formatUptime(system.uptime)}
            icon="⏱️"
            color="text-green-400"
          />
          <InfoCard
            title="活跃用户服务"
            value={system.activeUserServices}
            subtitle="UserServiceManager 实例"
            icon="⚡"
            color="text-blue-400"
          />
          <InfoCard
            title="Node.js 版本"
            value={system.nodeVersion}
            icon="🟢"
            color="text-emerald-400"
          />
          <InfoCard
            title="平台"
            value={system.platform}
            icon="💻"
            color="text-purple-400"
          />
        </div>
      </div>

      {/* 内存使用情况 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">内存使用</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCard
            title="RSS 内存"
            value={formatBytes(system.memoryUsage.rss)}
            subtitle="常驻内存"
            icon="💾"
            color="text-cyan-400"
          />
          <InfoCard
            title="堆内存使用"
            value={formatBytes(system.memoryUsage.heapUsed)}
            subtitle={`/ ${formatBytes(system.memoryUsage.heapTotal)}`}
            icon="📊"
            color="text-yellow-400"
          />
          <InfoCard
            title="堆内存占用率"
            value={`${((system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) * 100).toFixed(1)}%`}
            icon="📈"
            color={
              (system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) > 0.9
                ? 'text-red-400'
                : 'text-green-400'
            }
          />
        </div>
      </div>

      {/* GlobalServiceManager 状态 */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">全局服务管理器</h3>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-gray-400 text-sm mb-2">管理的用户数</p>
              <p className="text-white text-3xl font-bold">{system.globalServiceManager.userCount}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-2">订阅检查间隔</p>
              <p className="text-white text-3xl font-bold">
                {Math.floor(system.globalServiceManager.subscriptionCheckInterval / 1000 / 60)} 分钟
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 实时监控图表区域（占位，可后续扩展） */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">实时监控</h3>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="space-y-4">
            {/* 内存使用进度条 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">堆内存使用率</span>
                <span className="text-white text-sm">
                  {formatBytes(system.memoryUsage.heapUsed)} / {formatBytes(system.memoryUsage.heapTotal)}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    (system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) > 0.9
                      ? 'bg-red-500'
                      : (system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) > 0.7
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{
                    width: `${(system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) * 100}%`
                  }}
                ></div>
              </div>
            </div>

            {/* RSS 内存进度条（假设最大 1GB） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">RSS 内存</span>
                <span className="text-white text-sm">
                  {formatBytes(system.memoryUsage.rss)}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${Math.min((system.memoryUsage.rss / (1024 * 1024 * 1024)) * 100, 100)}%`
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 健康状态指示 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4">
          <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
          <div>
            <p className="text-white font-semibold">系统运行正常</p>
            <p className="text-gray-400 text-sm">
              最后更新: {new Date().toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemStatus;
