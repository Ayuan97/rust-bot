import { useState, useEffect, useCallback } from 'react';
import { FaBrain, FaShip, FaHelicopter, FaOilCan, FaSync, FaTrash, FaClock, FaChartLine } from 'react-icons/fa';
import { useToast } from './Toast';
import api from '../services/api';

// 事件类型配置
const EVENT_TYPE_CONFIG = {
  CARGO_SPAWN: {
    icon: FaShip,
    label: '货船',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/40'
  },
  HELI_SPAWN: {
    icon: FaHelicopter,
    label: '武装直升机',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/40'
  },
  SMALL_OIL_COOLDOWN: {
    icon: FaOilCan,
    label: '小油井冷却',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/40'
  },
  LARGE_OIL_COOLDOWN: {
    icon: FaOilCan,
    label: '大油井冷却',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/40'
  }
};

function EventPredictions({ serverId }) {
  const [predictions, setPredictions] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    if (!serverId) return;

    try {
      const [predictionsRes, patternsRes] = await Promise.all([
        api.get(`/predictions/${serverId}`),
        api.get(`/predictions/${serverId}/patterns`)
      ]);

      if (predictionsRes.data.success) {
        setPredictions(predictionsRes.data.predictions || []);
      }

      if (patternsRes.data.success) {
        setPatterns(patternsRes.data.patterns || []);
      }
    } catch (error) {
      console.error('加载预测数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchData();

    // 每分钟刷新一次
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleReset = async () => {
    if (!confirm('确定要重置学习数据吗？这通常在服务器清档后使用。')) {
      return;
    }

    try {
      setResetting(true);
      const response = await api.post(`/predictions/${serverId}/patterns/reset`);
      if (response.data.success) {
        toast.success('学习数据已重置');
        fetchData();
      }
    } catch (error) {
      toast.error('重置失败');
    } finally {
      setResetting(false);
    }
  };

  // 计算倒计时
  const getCountdown = (predictedTime) => {
    const now = Date.now();
    const target = new Date(predictedTime).getTime();
    const diff = target - now;

    if (diff <= 0) return '即将发生';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}小时${mins}分钟`;
    }

    return `${minutes}分${seconds}秒`;
  };

  // 格式化间隔时间
  const formatInterval = (minutes) => {
    if (!minutes) return '--';
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
    }
    return `${minutes}分钟`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <FaSync className="animate-spin text-[#cd5241] text-2xl" />
        <span className="text-xs uppercase font-bold tracking-widest text-gray-500">加载预测数据...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 tactic-cut bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
            <FaBrain className="text-purple-400 text-lg" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-wider text-white">事件预测</h3>
            <p className="text-xs text-gray-500 mt-0.5">AI 学习刷新规律，提前通知</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="flex items-center gap-2 px-4 py-2 tactic-cut border border-white/10 text-xs font-bold uppercase text-gray-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-all disabled:opacity-50"
          title="清档后重置学习数据"
        >
          <FaTrash className={resetting ? 'animate-pulse' : ''} />
          重置
        </button>
      </div>

      {/* 活跃预测 */}
      {predictions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <FaClock className="text-[#cd5241]" />
            活跃预测
          </div>

          <div className="space-y-2">
            {predictions.map(prediction => {
              const config = EVENT_TYPE_CONFIG[prediction.eventType] || EVENT_TYPE_CONFIG.CARGO_SPAWN;
              const IconComponent = config.icon;
              const confidence = Math.round(prediction.confidenceLevel * 100);

              return (
                <div
                  key={prediction.id}
                  className={`tactic-cut border ${config.borderColor} ${config.bgColor} p-4`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <IconComponent className={`${config.color} text-lg`} />
                      <div>
                        <div className="text-sm font-bold text-white">{config.label}</div>
                        <div className="text-xs text-gray-400">
                          预计 {new Date(prediction.predictedTime).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-mono font-bold text-white">
                        {getCountdown(prediction.predictedTime)}
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        <div className="w-16 h-1.5 bg-black/40 tactic-cut overflow-hidden">
                          <div
                            className={`h-full ${confidence >= 80 ? 'bg-green-500' : confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">{confidence}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 学习状态 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <FaChartLine className="text-purple-400" />
          学习状态
        </div>

        <div className="grid grid-cols-2 gap-3">
          {Object.entries(EVENT_TYPE_CONFIG).map(([eventType, config]) => {
            const pattern = patterns.find(p => p.eventType === eventType);
            const IconComponent = config.icon;

            return (
              <div
                key={eventType}
                className="tactic-cut border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 tactic-cut ${config.bgColor} flex items-center justify-center`}>
                    <IconComponent className={`${config.color} text-sm`} />
                  </div>
                  <span className="text-xs font-bold text-gray-200">{config.label}</span>
                </div>

                {pattern ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">样本数量</span>
                      <span className={`text-xs font-mono ${pattern.canPredict ? 'text-green-400' : 'text-yellow-400'}`}>
                        {pattern.sampleCount} / 5
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">平均间隔</span>
                      <span className="text-xs font-mono text-white">
                        {formatInterval(pattern.avgIntervalMinutes)}
                      </span>
                    </div>
                    {pattern.lastEventTime && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">上次事件</span>
                        <span className="text-xs text-gray-400">
                          {new Date(pattern.lastEventTime).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-white/5">
                      <div className={`text-[10px] font-bold uppercase ${pattern.canPredict ? 'text-green-400' : 'text-yellow-400'}`}>
                        {pattern.canPredict ? '可以预测' : '数据收集中'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <span className="text-xs text-gray-500">暂无数据</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 说明 */}
      <div className="text-[10px] text-gray-600 text-center space-y-1">
        <div>系统需要至少 5 次事件记录才能开始预测</div>
        <div>清档后请点击"重置"以重新学习服务器规律</div>
      </div>
    </div>
  );
}

export default EventPredictions;
