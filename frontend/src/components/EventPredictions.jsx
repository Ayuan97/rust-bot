import { useState, useEffect, useCallback } from 'react';
import { FaBrain, FaShip, FaHelicopter, FaOilCan, FaChevronDown, FaChevronUp, FaClock, FaChartLine, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { getPredictions, getPredictionPatterns } from '../services/api';

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

const UPDATE_INTERVAL = 60000; // 1分钟更新一次数据
const COUNTDOWN_INTERVAL = 1000; // 1秒更新一次倒计时

function EventPredictions({ serverId, isDemo }) {
  const [predictions, setPredictions] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState(null);

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
        predictedTime: new Date(Date.now() + 10 * 60000).toISOString(),
        confidenceLevel: 0.85
      }
    ];

    setPatterns(demoPatterns);
    setPredictions(demoPredictions);
    setLoading(false);
  };

  const fetchData = useCallback(async () => {
    if (isDemo) {
      getDemoData();
      return;
    }

    if (!serverId) return;

    try {
      setError(null);
      const [predictionsRes, patternsRes] = await Promise.all([
        getPredictions(serverId),
        getPredictionPatterns(serverId)
      ]);

      if (predictionsRes.data.success) {
        setPredictions(predictionsRes.data.predictions || []);
      }

      if (patternsRes.data.success) {
        setPatterns(patternsRes.data.patterns || []);
      }
    } catch (error) {
      console.error('加载预测数据失败:', error);
      // 静默失败，不影响主界面
      setError('无法获取预测数据');
    } finally {
      setLoading(false);
    }
  }, [serverId, isDemo]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, UPDATE_INTERVAL);
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_INTERVAL);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [fetchData]);

  // 格式化倒计时
  const formatCountdown = (targetTime) => {
    const target = new Date(targetTime).getTime();
    const diff = target - now;

    if (diff <= 0) return '即将到达';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}小时 ${minutes}分`;
    }
    return `${minutes}分 ${seconds}秒`;
  };

  // 计算学习进度百分比 (0-100)
  const getProgress = (count) => {
    return Math.min(100, Math.round((count / 5) * 100));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 animate-pulse">
        <FaBrain className="text-purple-400" />
        <span className="text-xs text-gray-500">正在分析时间流...</span>
      </div>
    );
  }

  // 找出最近的一个预测
  const nextPrediction = predictions.length > 0
    ? predictions.sort((a, b) => new Date(a.predictedTime) - new Date(b.predictedTime))[0]
    : null;

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
              事件预测引擎
              {predictions.length > 0 && (
                <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[9px] tactic-cut animate-pulse">
                  {predictions.length} 活跃
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

          {/* 下一个事件高亮卡片 (如果有预测) */}
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

              {/* 背景装饰流光 */}
              <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-purple-500/10 to-transparent skew-x-12 group-hover:translate-x-4 transition-transform duration-700"></div>
            </div>
          )}

          {/* 学习进度面板 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                AI 学习进度
              </div>
              <div className="text-[9px] text-gray-600">
                需 5 个样本解锁预测
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

                      {/* 进度条 */}
                      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${isReady ? 'bg-green-500' : config.progressColor} transition-all duration-1000 ease-out relative`}
                          style={{ width: `${progress}%` }}
                        >
                          {isReady && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right min-w-[60px] pl-2 border-l border-white/5">
                      {isReady ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] text-gray-500 uppercase">平均间隔</span>
                          <span className="text-xs font-mono font-bold text-gray-300">
                            {pattern.avgIntervalMinutes || '-'}m
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-[9px] text-gray-600 italic">学习中</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 底部提示 */}
          {!nextPrediction && (
            <div className="text-[10px] text-center text-gray-600 pt-2 border-t border-white/5">
              {predictions.length > 0 ? "更多预测正在排队中" : "当前没有任何活跃的预测事件"}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default EventPredictions;
