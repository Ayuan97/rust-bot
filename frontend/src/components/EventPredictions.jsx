import { useState, useEffect, useCallback } from 'react';
import { FaBrain, FaShip, FaHelicopter, FaOilCan, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import api from '../services/api';

// 事件类型配置
const EVENT_TYPE_CONFIG = {
  CARGO_SPAWN: {
    icon: FaShip,
    label: '货船',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  HELI_SPAWN: {
    icon: FaHelicopter,
    label: '武直',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
  SMALL_OIL_COOLDOWN: {
    icon: FaOilCan,
    label: '小油井',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  LARGE_OIL_COOLDOWN: {
    icon: FaOilCan,
    label: '大油井',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  }
};

function EventPredictions({ serverId }) {
  const [predictions, setPredictions] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

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
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // 计算倒计时
  const getCountdown = (predictedTime) => {
    const now = Date.now();
    const target = new Date(predictedTime).getTime();
    const diff = target - now;

    if (diff <= 0) return '即将';

    const minutes = Math.floor(diff / 60000);
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      return `${hours}h${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  // 计算学习进度
  const learnedCount = patterns.filter(p => p.sampleCount >= 5).length;
  const totalTypes = Object.keys(EVENT_TYPE_CONFIG).length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <FaBrain className="text-purple-400 animate-pulse" />
        <span className="text-xs text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 紧凑标题栏 */}
      <div
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FaBrain className="text-purple-400 text-sm" />
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
            事件预测
          </span>
          <span className="text-[10px] text-gray-500">
            {learnedCount}/{totalTypes}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {predictions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 tactic-cut">
              {predictions.length} 活跃
            </span>
          )}
          {expanded ? (
            <FaChevronUp className="text-gray-500 text-xs group-hover:text-gray-300" />
          ) : (
            <FaChevronDown className="text-gray-500 text-xs group-hover:text-gray-300" />
          )}
        </div>
      </div>

      {/* 活跃预测（始终显示） */}
      {predictions.length > 0 && (
        <div className="space-y-1.5">
          {predictions.map(prediction => {
            const config = EVENT_TYPE_CONFIG[prediction.eventType] || EVENT_TYPE_CONFIG.CARGO_SPAWN;
            const IconComponent = config.icon;
            const confidence = Math.round(prediction.confidenceLevel * 100);

            return (
              <div
                key={prediction.id}
                className={`flex items-center justify-between p-2 tactic-cut ${config.bgColor} border border-white/10`}
              >
                <div className="flex items-center gap-2">
                  <IconComponent className={`${config.color} text-sm`} />
                  <span className="text-xs font-bold text-white">{config.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-white">
                    {getCountdown(prediction.predictedTime)}
                  </span>
                  <span className="text-[10px] text-gray-400">{confidence}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 展开时显示学习状态 */}
      {expanded && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">学习状态</div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(EVENT_TYPE_CONFIG).map(([eventType, config]) => {
              const pattern = patterns.find(p => p.eventType === eventType);
              const IconComponent = config.icon;
              const canPredict = pattern && pattern.sampleCount >= 5;

              return (
                <div
                  key={eventType}
                  className="flex items-center gap-2 p-1.5 bg-white/[0.02] border border-white/5 tactic-cut"
                >
                  <IconComponent className={`${config.color} text-xs`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-300 truncate">{config.label}</div>
                    <div className={`text-[9px] ${canPredict ? 'text-green-400' : 'text-gray-500'}`}>
                      {pattern ? `${pattern.sampleCount}/5` : '0/5'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-gray-600 text-center">
            需要 5 次事件记录才能预测
          </div>
        </div>
      )}

      {/* 无预测时的提示 */}
      {predictions.length === 0 && !expanded && (
        <div className="text-[10px] text-gray-500 text-center py-1">
          {learnedCount > 0 ? '暂无活跃预测' : '收集数据中...'}
        </div>
      )}
    </div>
  );
}

export default EventPredictions;
