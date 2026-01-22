import { useState, useEffect, useCallback } from 'react';
import { FaBrain, FaShip, FaHelicopter, FaOilCan, FaChevronDown, FaChevronUp, FaClock, FaChartLine, FaCheckCircle, FaExclamationTriangle, FaHourglassHalf, FaRadiation, FaSatellite } from 'react-icons/fa';
import { getPredictions, getPredictionPatterns, getActiveTimers } from '../services/api';

// 事件类型配置
const EVENT_TYPE_CONFIG = {
  CARGO_SPAWN: {
    icon: FaShip,
    label: '货船刷新',
    shortLabel: '货船',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    progressColor: 'bg-blue-500',
  },
  HELI_SPAWN: {
    icon: FaHelicopter,
    label: '武直刷新',
    shortLabel: '武直',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    progressColor: 'bg-red-500',
  }
};

// 计时器类型配置
const TIMER_CONFIG = {
  small_oil_crate: { label: '小油井箱子解锁', color: 'text-yellow-400', icon: FaOilCan, group: 'small_oil' },
  large_oil_crate: { label: '大油井箱子解锁', color: 'text-orange-400', icon: FaOilCan, group: 'large_oil' },
  small_oil_radiation_warning: { label: '小油井辐射警告', color: 'text-green-500', icon: FaRadiation, group: 'small_oil' },
  large_oil_radiation_warning: { label: '大油井辐射警告', color: 'text-green-500', icon: FaRadiation, group: 'large_oil' },
  small_oil_reset: { label: '小油井重置中', color: 'text-gray-400', icon: FaHourglassHalf, group: 'small_oil' },
  large_oil_reset: { label: '大油井重置中', color: 'text-gray-400', icon: FaHourglassHalf, group: 'large_oil' },
  bradley_crate: { label: '坦克箱子火焰', color: 'text-red-500', icon: FaExclamationTriangle },
  heli_crate: { label: '直升机箱子火焰', color: 'text-red-500', icon: FaExclamationTriangle },
  heli_debris: { label: '直升机残骸冷却', color: 'text-gray-400', icon: FaHourglassHalf },
};

const UPDATE_INTERVAL = 60000; // 1分钟更新一次网络数据
const TIMER_DECAY_INTERVAL = 1000; // 1秒递减本地计时器

function EventPredictions({ serverId, isDemo }) {
  const [predictions, setPredictions] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [activeTimers, setActiveTimers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // 模拟数据 (仅演示模式使用)
  const getDemoData = () => {
    const demoPatterns = [
      { eventType: 'CARGO_SPAWN', sampleCount: 3, avgIntervalMinutes: 125, lastEventTime: new Date(Date.now() - 45 * 60000).toISOString() },
      { eventType: 'HELI_SPAWN', sampleCount: 8, avgIntervalMinutes: 180, lastEventTime: new Date(Date.now() - 170 * 60000).toISOString() }
    ];

    // 模拟一个活跃预测
    const demoPredictions = [
      {
        id: 'demo-pred-1',
        eventType: 'HELI_SPAWN',
        predictedTime: new Date(Date.now() + 25 * 60000).toISOString(),
        confidenceLevel: 0.85
      }
    ];

    // 模拟活跃计时器
    const demoTimers = [
      { name: 'small_oil_crate', timeLeft: 12 * 60 * 1000 }, // 12分钟后解锁
      // 大油井无事件，显示为空闲
    ];

    setPatterns(demoPatterns);
    setPredictions(demoPredictions);
    setActiveTimers(demoTimers);
    setLastFetchTime(Date.now());
    setLoading(false);
  };

  const fetchData = useCallback(async () => {
    if (isDemo) {
      getDemoData();
      return;
    }

    if (!serverId) return;

    try {
      const [predictionsRes, patternsRes, timersRes] = await Promise.all([
        getPredictions(serverId),
        getPredictionPatterns(serverId),
        getActiveTimers(serverId)
      ]);

      if (predictionsRes.data.success) {
        setPredictions(predictionsRes.data.predictions || []);
      }

      if (patternsRes.data.success) {
        setPatterns(patternsRes.data.patterns || []);
      }

      if (timersRes.data.success) {
        setActiveTimers(timersRes.data.timers || []);
      }

      setLastFetchTime(Date.now());
    } catch (error) {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [serverId, isDemo]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // 前端倒计时递减逻辑
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, TIMER_DECAY_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // 计算准确的剩余时间
  const getAccurateTimeLeft = (timer) => {
    // 如果是一次性渲染的demo数据，lastFetchTime可能很旧，这里简化处理
    if (isDemo && lastFetchTime === 0) return timer.timeLeft;

    const elapsed = now - lastFetchTime;
    return Math.max(0, timer.timeLeft - elapsed);
  };

  const formatDuration = (ms) => {
    if (ms <= 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (targetTime) => {
    const target = new Date(targetTime).getTime();
    const diff = target - now;

    if (diff <= 0) return '即将到达';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    // const seconds = Math.floor((diff % (1000 * 60)) / 1000); // 预测没必要精确到秒

    if (hours > 0) {
      return `${hours}小时 ${minutes}分`;
    }
    return `${minutes}分钟`;
  };

  // 计算学习进度百分比 (0-100)
  const getProgress = (count) => {
    return Math.min(100, Math.round((count / 5) * 100));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 animate-pulse">
        <FaBrain className="text-purple-400" />
        <span className="text-xs text-gray-500">正在分析战局...</span>
      </div>
    );
  }

  // 找出最近的一个预测
  const nextPrediction = predictions.length > 0
    ? predictions.sort((a, b) => new Date(a.predictedTime) - new Date(b.predictedTime))[0]
    : null;

  // 处理计时器: 
  // 1. 映射配置
  const mappedTimers = activeTimers
    .filter(t => Object.keys(TIMER_CONFIG).some(k => t.name.startsWith(k)))
    .map(t => {
      const configKey = Object.keys(TIMER_CONFIG).find(k => t.name.startsWith(k));
      return { ...t, config: TIMER_CONFIG[configKey] };
    });

  // 2. 检查油井状态
  const smallOilTimer = mappedTimers.find(t => t.config.group === 'small_oil');
  const largeOilTimer = mappedTimers.find(t => t.config.group === 'large_oil');

  // 3. 构建显示列表 (active ones first)
  const displayTimers = mappedTimers.sort((a, b) => getAccurateTimeLeft(a) - getAccurateTimeLeft(b));

  return (
    <div className="space-y-4 font-sans">
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between cursor-pointer group select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center tactic-cut border border-purple-500/30">
            <FaBrain className="text-purple-400 text-xs" />
          </div>
          <div>
            <div className="text-xs font-black uppercase text-gray-300 tracking-wider flex items-center gap-2">
              战术情报中心
              {(predictions.length > 0 || displayTimers.length > 0) && (
                <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[9px] tactic-cut animate-pulse">
                  {predictions.length + displayTimers.length} 活跃
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-gray-600 transition-transform group-hover:text-gray-400">
          {expanded ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="space-y-4 animate-fade-in">

          {/* 活跃计时器 */}
          <div className="space-y-2">
            {/* 小油井状态 */}
            {smallOilTimer ? (
              <ActiveTimerItem timer={smallOilTimer} timeLeft={getAccurateTimeLeft(smallOilTimer)} formatDuration={formatDuration} />
            ) : (
              <IdleMonitorItem label="小油井" icon={FaOilCan} />
            )}

            {/* 大油井状态 */}
            {largeOilTimer ? (
              <ActiveTimerItem timer={largeOilTimer} timeLeft={getAccurateTimeLeft(largeOilTimer)} formatDuration={formatDuration} />
            ) : (
              <IdleMonitorItem label="大油井" icon={FaOilCan} />
            )}

            {/* 其他计时器 (坦克/直升机箱子) */}
            {displayTimers
              .filter(t => !['small_oil', 'large_oil'].includes(t.config.group))
              .map((timer, idx) => (
                <ActiveTimerItem key={idx} timer={timer} timeLeft={getAccurateTimeLeft(timer)} formatDuration={formatDuration} />
              ))}
          </div>

          {/* 下一个预测事件高亮 */}
          {nextPrediction && (
            <div className="relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-900/40 to-black/40 tactic-cut border border-purple-500/30"></div>

              <div className="relative p-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                  {(() => {
                    const config = EVENT_TYPE_CONFIG[nextPrediction.eventType] || EVENT_TYPE_CONFIG.CARGO_SPAWN;
                    const Icon = config.icon;
                    return (
                      <div className={`w-10 h-10 rounded-full ${config.bgColor} border ${config.borderColor} flex items-center justify-center`}>
                        <Icon className={`${config.color} text-lg animate-bounce`} />
                      </div>
                    );
                  })()}

                  <div>
                    <div className="text-[10px] text-purple-300 font-bold uppercase tracking-widest mb-1">
                      即将发生 (置信度 {Math.round(nextPrediction.confidenceLevel * 100)}%)
                    </div>
                    <div className="text-xl font-black text-white glow-text font-mono">
                      {formatCountdown(nextPrediction.predictedTime)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">预计时间</div>
                  <div className="text-xs font-bold text-gray-300 font-mono">
                    {new Date(nextPrediction.predictedTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-purple-500/10 to-transparent skew-x-12 group-hover:translate-x-4 transition-transform duration-700"></div>
            </div>
          )}

          {/* 学习进度面板 */}
          <div className="space-y-3 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                预测模型训练中
              </div>
              <div className="text-[9px] text-gray-600">
                基于服务器历史数据
              </div>
            </div>

            <div className="grid gap-2">
              {Object.keys(EVENT_TYPE_CONFIG).map(type => {
                const config = EVENT_TYPE_CONFIG[type];
                const pattern = patterns.find(p => p.eventType === type);
                const count = pattern ? pattern.sampleCount : 0;
                const progress = getProgress(count);
                const isReady = count >= 5;
                const Icon = config.icon;

                return (
                  <div key={type} className="bg-white/[0.02] border border-white/5 tactic-cut p-2 flex items-center gap-3 group hover:bg-white/[0.04] transition-colors">
                    <div className={`w-8 h-8 flex items-center justify-center ${config.bgColor} ${config.color} tactic-cut`}>
                      <Icon />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-bold text-gray-300">{config.label}</span>
                        <span className={`text-[10px] font-mono ${isReady ? 'text-green-400' : 'text-gray-500'}`}>
                          {count}/5 样本
                        </span>
                      </div>

                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${isReady ? 'bg-green-500' : config.progressColor} transition-all duration-1000 ease-out relative`}
                          style={{ width: `${progress}%` }}
                        >
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 子组件：活跃计时器项
function ActiveTimerItem({ timer, timeLeft, formatDuration }) {
  if (timeLeft <= 0) return null;
  const Icon = timer.config.icon;

  return (
    <div className="flex items-center justify-between p-2.5 bg-gray-800/40 border border-white/5 tactic-cut group hover:bg-gray-800/60 transition-colors">
      <div className="flex items-center gap-3">
        <Icon className={`${timer.config.color} text-sm animate-pulse`} />
        <span className="text-xs font-bold text-gray-300 uppercase tracking-tight">{timer.config.label}</span>
      </div>
      <span className="text-sm font-black text-white font-mono tabular-nums tracking-widest">
        {formatDuration(timeLeft)}
      </span>
    </div>
  );
}

// 子组件：空闲监控项
function IdleMonitorItem({ label, icon: Icon }) {
  return (
    <div className="flex items-center justify-between p-2.5 bg-white/[0.01] border border-white/5 tactic-cut opacity-60 hover:opacity-100 transition-opacity">
      <div className="flex items-center gap-3">
        <Icon className="text-gray-600 text-sm" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-tight">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500/50 shadow-[0_0_4px_#22c55e]" />
        <span className="text-[10px] text-gray-500 font-bold uppercase">监控中</span>
      </div>
    </div>
  );
}

export default EventPredictions;
