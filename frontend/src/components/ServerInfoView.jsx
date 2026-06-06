import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FaServer, FaUsers, FaClock, FaMapMarkedAlt, FaTrophy, FaTachometerAlt,
  FaCubes, FaCalendarAlt, FaSyncAlt, FaChartLine, FaGlobe, FaGamepad,
  FaSeedling, FaExternalLinkAlt, FaUserClock, FaSignal, FaHourglassHalf,
  FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaCrosshairs, FaTimes,
  FaSpinner, FaPlus, FaSearch
} from 'react-icons/fa';
import { getBattlemetricsInfo, getTopPlayers, trackPlayerByBmId } from '../services/api';
import { formatTimeAgo } from '../utils/time';
import { useToast } from './Toast';
import socketService from '../services/socket';

const POP_CURVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const POP_CURVE_FULL_TOLERANCE_MS = 20 * 60 * 1000;
const POP_CHART_WIDTH = 840;
const POP_CHART_HEIGHT = 180;
const POP_CHART_PADDING = 10;

function formatMiniDateTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function buildPopulationPath(points, width, height, padding = 10) {
  if (!Array.isArray(points) || points.length === 0) {
    return '';
  }

  const minPlayers = Math.min(...points.map((point) => point.players));
  const maxPlayers = Math.max(...points.map((point) => point.players));
  const playerRange = Math.max(1, maxPlayers - minPlayers);

  const minTs = points[0].timestamp;
  const maxTs = points[points.length - 1].timestamp;
  const tsRange = Math.max(1, maxTs - minTs);

  return points.map((point, index) => {
    const x = padding + ((point.timestamp - minTs) / tsRange) * (width - padding * 2);
    const y = height - padding - ((point.players - minPlayers) / playerRange) * (height - padding * 2);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function buildPopulationPoints(points, width, height, padding = 10) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const minPlayers = Math.min(...points.map((point) => point.players));
  const maxPlayers = Math.max(...points.map((point) => point.players));
  const playerRange = Math.max(1, maxPlayers - minPlayers);

  const minTs = points[0].timestamp;
  const maxTs = points[points.length - 1].timestamp;
  const tsRange = Math.max(1, maxTs - minTs);

  return points.map((point) => ({
    ...point,
    x: padding + ((point.timestamp - minTs) / tsRange) * (width - padding * 2),
    y: height - padding - ((point.players - minPlayers) / playerRange) * (height - padding * 2)
  }));
}

// 状态卡片组件
function StatCard({ icon: Icon, label, value, subValue, loading }) {
  return (
    <div className="bg-ink-850 px-3 py-2.5">
      <div className="text-fg-dim text-[11px] flex items-center gap-2">
        <span className="text-hazard text-xs"><Icon /></span>
        {label}
      </div>
      {loading ? (
        <div className="h-6 w-20 bg-ink-700 animate-pulse mt-2" />
      ) : (
        <div className="text-fg text-lg font-bold font-mono tabular-nums mt-2 truncate">
          {value}
          {subValue && <span className="text-sm text-fg-mute ml-1">{subValue}</span>}
        </div>
      )}
    </div>
  );
}

// 玩家列表项组件
function PlayerListItem({ player, rank }) {
  const formatPlayTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-ink-line last:border-0 hover:bg-ink-800/60 transition-colors">
      {rank && (
        <div className={`w-6 h-6 flex items-center justify-center font-mono text-xs font-bold tabular-nums border ${
          rank <= 3
            ? 'text-hazard border-hazard/40 bg-hazard-dim'
            : 'text-fg-dim border-ink-line'
        }`}>
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-fg truncate">{player.name}</div>
        {player.time && (
          <div className="text-[11px] text-fg-mute font-mono tabular-nums">{formatPlayTime(player.time)}</div>
        )}
      </div>
      {player.time && (
        <div className="text-xs text-fg-dim font-mono tabular-nums">
          <FaUserClock className="inline mr-1 text-fg-mute" />
          {formatPlayTime(player.time)}
        </div>
      )}
    </div>
  );
}

// 信息面板组件
function InfoPanel({ title, en, icon: Icon, children, className = '' }) {
  return (
    <div className={`tac-panel ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-line">
        <Icon className="text-hazard" />
        <span className="text-fg-dim text-[11px] font-bold">{title}</span>
        {en && <span className="tac-label">// {en}</span>}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function ServerInfoView({ server, onBack }) {
  const toast = useToast();
  const [bmInfo, setBmInfo] = useState(null);
  const [topPlayers, setTopPlayers] = useState([]);
  const [runtimeInfo, setRuntimeInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [onlineSearch, setOnlineSearch] = useState('');
  const [allOnlineSearch, setAllOnlineSearch] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());
  const [popHoverIndex, setPopHoverIndex] = useState(null);
  const serverId = server?.id || null;

  // 追踪玩家
  const handleTrackPlayer = async () => {
    if (!selectedPlayer) return;

    setTracking(true);
    try {
      const res = await trackPlayerByBmId({
        bmPlayerId: selectedPlayer.id,
        playerName: selectedPlayer.name
      });

      if (res.data.success) {
        toast.success(`已添加追踪: ${selectedPlayer.name}`);
        setSelectedPlayer(null);
      } else {
        toast.error(res.data.error || '追踪失败');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || '追踪失败');
    } finally {
      setTracking(false);
    }
  };

  // 加载数据
  const loadData = useCallback(async (isRefresh = false) => {
    if (!serverId) {
      setBmInfo(null);
      setTopPlayers([]);
      setRuntimeInfo(null);
      setLastRefresh(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [bmResult, playersResult, runtimeResult] = await Promise.allSettled([
        getBattlemetricsInfo(serverId),
        getTopPlayers(serverId, 30),
        socketService.getServerInfo(serverId)
      ]);

      if (bmResult.status === 'fulfilled' && bmResult.value?.data?.success) {
        setBmInfo(bmResult.value.data.data);
      }

      if (playersResult.status === 'fulfilled' && playersResult.value?.data?.success) {
        setTopPlayers(playersResult.value.data.players || []);
      }

      if (runtimeResult.status === 'fulfilled' && runtimeResult.value) {
        setRuntimeInfo(runtimeResult.value);
      } else if (!isRefresh) {
        setRuntimeInfo(null);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('加载服务器信息失败:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverId]);

  // 初始加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 冷却计时器
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // 手动刷新
  const handleRefresh = async () => {
    if (cooldown > 0 || refreshing) return;
    setCooldown(30);
    await loadData(true);
  };

  // 计算玩家百分比
  const playerPercentage = bmInfo?.maxPlayers
    ? Math.round((bmInfo.players / bmInfo.maxPlayers) * 100)
    : 0;

  // 获取状态颜色
  const getStatusColor = (status) => {
    if (status === 'online') return 'text-terminal';
    if (status === 'offline') return 'text-fg-mute';
    return 'text-hazard';
  };

  // 格式化运行时间
  const formatUptime = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}天 ${hours % 24}小时`;
    }
    return `${hours}小时 ${mins}分钟`;
  };

  // 格式化清档周期
  const formatWipeCycle = (cycle) => {
    const cycleMap = {
      'WEEKLY': '周清',
      'BIWEEKLY': '双周清',
      'MONTHLY': '月清',
      'DAILY': '日清'
    };
    return cycleMap[cycle] || cycle || '未知';
  };

  const getSessionDurationSec = (player) => {
    if (!player?.sessionStart) return null;
    const start = new Date(player.sessionStart).getTime();
    if (Number.isNaN(start)) return null;
    return Math.max(0, Math.floor((nowTs - start) / 1000));
  };

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) {
      return '-';
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}小时${mins}分钟`;
    return `${mins}分钟`;
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filterOnlinePlayers = useCallback((players, keyword) => {
    const list = Array.isArray(players) ? players : [];
    const q = String(keyword || '').trim().toLowerCase();
    const sorted = [...list].sort((a, b) => {
      const ad = getSessionDurationSec(a) ?? a.onlineDurationSec ?? 0;
      const bd = getSessionDurationSec(b) ?? b.onlineDurationSec ?? 0;
      return bd - ad;
    });
    if (!q) return sorted;
    return sorted.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const id = String(p.id || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [nowTs]);

  const filteredRecentOnlinePlayers = useMemo(
    () => filterOnlinePlayers(bmInfo?.onlinePlayers || [], onlineSearch),
    [bmInfo?.onlinePlayers, onlineSearch, filterOnlinePlayers]
  );

  const allOnlineSourcePlayers = useMemo(() => {
    if (Array.isArray(bmInfo?.allOnlinePlayers) && bmInfo.allOnlinePlayers.length > 0) {
      return bmInfo.allOnlinePlayers;
    }
    return bmInfo?.onlinePlayers || [];
  }, [bmInfo?.allOnlinePlayers, bmInfo?.onlinePlayers]);

  const filteredAllOnlinePlayers = useMemo(
    () => filterOnlinePlayers(allOnlineSourcePlayers, allOnlineSearch),
    [allOnlineSourcePlayers, allOnlineSearch, filterOnlinePlayers]
  );

  const totalOnlineCount = bmInfo?.players || 0;
  const recentOnlineCount = bmInfo?.onlinePlayers?.length || 0;
  const allOnlineCount = allOnlineSourcePlayers.length;
  const popSeries = useMemo(() => (
    Array.isArray(runtimeInfo?.popSeries)
      ? runtimeInfo.popSeries
        .map((point) => ({
          timestamp: Number(point?.timestamp) || 0,
          players: Number(point?.players) || 0
        }))
        .filter((point) => point.timestamp > 0)
        .sort((a, b) => a.timestamp - b.timestamp)
      : []
  ), [runtimeInfo?.popSeries]);
  const canShowPopCurve = popSeries.length >= 2;
  const popPath = canShowPopCurve
    ? buildPopulationPath(popSeries, POP_CHART_WIDTH, POP_CHART_HEIGHT, POP_CHART_PADDING)
    : '';
  const popChartPoints = canShowPopCurve
    ? buildPopulationPoints(popSeries, POP_CHART_WIDTH, POP_CHART_HEIGHT, POP_CHART_PADDING)
    : [];
  const popMin = canShowPopCurve ? Math.min(...popSeries.map((point) => point.players)) : 0;
  const popMax = canShowPopCurve ? Math.max(...popSeries.map((point) => point.players)) : 0;
  const popStart = canShowPopCurve ? popSeries[0] : null;
  const popEnd = canShowPopCurve ? popSeries[popSeries.length - 1] : null;
  const popMidTs = (canShowPopCurve && popStart && popEnd)
    ? Math.floor((popStart.timestamp + popEnd.timestamp) / 2)
    : null;
  const popCoverageMs = (canShowPopCurve && popStart && popEnd)
    ? Math.max(0, popEnd.timestamp - popStart.timestamp)
    : 0;
  const popCoverageHours = Math.max(1, Math.round(popCoverageMs / (60 * 60 * 1000)));
  const popHasFullThreeDay = canShowPopCurve && popCoverageMs >= (POP_CURVE_WINDOW_MS - POP_CURVE_FULL_TOLERANCE_MS);
  const popTrendDiff = Number(runtimeInfo?.popTrend?.diff) || 0;
  const showPopTrend = Boolean(runtimeInfo?.popTrend?.hasBaseline) && popTrendDiff !== 0;
  const hoveredPopPoint = popHoverIndex !== null ? popChartPoints[popHoverIndex] : null;
  const popTooltipLeft = hoveredPopPoint
    ? Math.min(92, Math.max(8, (hoveredPopPoint.x / POP_CHART_WIDTH) * 100))
    : 50;
  const popTooltipTop = hoveredPopPoint
    ? Math.min(80, Math.max(16, (hoveredPopPoint.y / POP_CHART_HEIGHT) * 100))
    : 50;

  useEffect(() => {
    setPopHoverIndex(null);
  }, [serverId, popSeries.length]);

  const updatePopHoverByClientX = useCallback((clientX, target) => {
    if (!canShowPopCurve || popChartPoints.length === 0 || !target) {
      setPopHoverIndex(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const ratioX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const chartX = ratioX * POP_CHART_WIDTH;

    let nearestIndex = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < popChartPoints.length; i += 1) {
      const dist = Math.abs(popChartPoints[i].x - chartX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }

    setPopHoverIndex(nearestIndex);
  }, [canShowPopCurve, popChartPoints]);

  const handlePopChartMouseMove = useCallback((event) => {
    updatePopHoverByClientX(event.clientX, event.currentTarget);
  }, [updatePopHoverByClientX]);

  const handlePopChartTouchMove = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    updatePopHoverByClientX(touch.clientX, event.currentTarget);
  }, [updatePopHoverByClientX]);

  if (!serverId) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full tac-panel tac-corners p-6 text-center">
          <FaServer className="mx-auto text-3xl text-fg-mute mb-3" />
          <div className="tac-label mb-2">NO SERVER</div>
          <h3 className="text-lg font-extrabold text-fg mb-2">暂无可用服务器</h3>
          <p className="text-sm text-fg-dim mb-5">
            请先完成服务器配对或选择已连接服务器，再查看服务器信息。
          </p>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="tac-btn tac-btn-primary"
            >
              返回基地概览 // OVERVIEW
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-ink-900">
      <div className="p-4 md:p-6 space-y-6">

        {/* 顶部头图区域 */}
        <div className="relative tac-panel tac-corners overflow-hidden">
          {/* 背景图 */}
          <div className="absolute inset-0">
            {bmInfo?.headerImage ? (
              <img
                src={bmInfo.headerImage}
                alt=""
                className="w-full h-full object-cover opacity-20"
              />
            ) : (
              <div className="w-full h-full bg-ink-850" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/85 to-ink-900/40" />
          </div>

          {/* 内容 */}
          <div className="relative p-6">
            <div className="flex items-start gap-6">
              {/* Logo */}
              <div className="flex-shrink-0">
                {(server.img || server.logo || bmInfo?.headerImage) ? (
                  <img
                    src={server.img || server.logo || bmInfo?.headerImage}
                    alt={server.name}
                    className="w-24 h-24 object-cover border border-ink-line"
                  />
                ) : (
                  <div className="w-24 h-24 bg-ink-800 border border-ink-line flex items-center justify-center">
                    <FaServer className="text-4xl text-fg-mute" />
                  </div>
                )}
              </div>

              {/* 服务器信息 */}
              <div className="flex-1 min-w-0">
                <div className="tac-label flex items-center gap-2 mb-1">
                  <FaServer className="text-hazard" /> 服务器情报 // INTEL
                </div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-2xl font-extrabold text-fg truncate">
                    {bmInfo?.name || server.name}
                  </h1>
                  {bmInfo?.status && (
                    bmInfo.status === 'online' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-terminal border border-terminal/30">
                        <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" />
                        ONLINE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-fg-mute border border-ink-line">
                        <span className="w-1.5 h-1.5 bg-fg-mute" />
                        OFFLINE
                      </span>
                    )
                  )}
                  {bmInfo?.official && (
                    <span className="inline-flex items-center px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-fg-dim border border-ink-line">
                      OFFICIAL
                    </span>
                  )}
                  {bmInfo?.modded && (
                    <span className="inline-flex items-center px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-fg-dim border border-ink-line">
                      MODDED
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-fg-dim mb-4 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <FaSignal className="text-fg-mute" />
                    <span className="font-mono tabular-nums">{bmInfo?.address || `${server.ip}:${server.port}`}</span>
                  </span>
                  {bmInfo?.country && (
                    <span className="flex items-center gap-1.5">
                      <FaGlobe className="text-fg-mute" />
                      {bmInfo.country}
                    </span>
                  )}
                  {bmInfo?.rank && (
                    <span className="flex items-center gap-1.5">
                      <FaTrophy className="text-fg-mute" />
                      排名 <span className="font-mono tabular-nums">#{bmInfo.rank}</span>
                    </span>
                  )}
                </div>

                {/* 玩家进度条 */}
                {bmInfo && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="tac-label flex items-center gap-1.5">
                        <FaUsers className="text-hazard" />
                        POPULATION
                      </span>
                      <span className="text-sm font-bold text-fg font-mono tabular-nums">
                        {bmInfo.players}
                        <span className="text-fg-mute">/{bmInfo.maxPlayers}</span>
                        {bmInfo.queuedPlayers > 0 && (
                          <span className="text-hazard ml-2">(+{bmInfo.queuedPlayers} 排队)</span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-1.5 bg-ink-700 border border-ink-line overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          playerPercentage >= 70 ? 'bg-hazard' : 'bg-fg-dim'
                        }`}
                        style={{ width: `${playerPercentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 刷新按钮 */}
              <div className="flex-shrink-0">
                <button
                  onClick={handleRefresh}
                  disabled={cooldown > 0 || refreshing}
                  className={`p-3 border transition-colors ${
                    cooldown > 0 || refreshing
                      ? 'border-ink-line text-fg-mute cursor-not-allowed'
                      : 'border-ink-line text-fg-dim hover:border-hazard/50 hover:text-hazard'
                  }`}
                  title={cooldown > 0 ? `${cooldown}秒后可刷新` : '刷新数据'}
                  aria-label="刷新数据"
                >
                  <FaSyncAlt className={`text-lg ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                {cooldown > 0 && (
                  <div className="text-xs text-fg-mute font-mono tabular-nums text-center mt-1">{cooldown}s</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 状态卡片网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-ink-line border border-ink-line">
          <StatCard
            icon={FaUsers}
            label="在线玩家"
            value={bmInfo?.players ?? '-'}
            subValue={bmInfo ? `/ ${bmInfo.maxPlayers}` : ''}
            loading={loading}
          />
          <StatCard
            icon={FaHourglassHalf}
            label="排队人数"
            value={bmInfo?.queuedPlayers || 0}
            loading={loading}
          />
          <StatCard
            icon={FaTachometerAlt}
            label="服务器 FPS"
            value={bmInfo?.fps || '-'}
            loading={loading}
          />
          <StatCard
            icon={FaCubes}
            label="实体数量"
            value={bmInfo?.entityCount?.toLocaleString() || '-'}
            loading={loading}
          />
          <StatCard
            icon={FaTrophy}
            label="全球排名"
            value={bmInfo?.rank ? `#${bmInfo.rank}` : '-'}
            loading={loading}
          />
          <StatCard
            icon={FaClock}
            label="运行时间"
            value={formatUptime(bmInfo?.uptime)}
            loading={loading}
          />
        </div>

        {/* 主要内容区域 - 三列布局 */}

        <div className="tac-panel">
          <div className="px-4 py-3 border-b border-ink-line flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FaChartLine className="text-hazard" />
              <span className="text-fg-dim text-[11px] font-bold">{'\u5728\u7ebf\u4eba\u6570\u8d8b\u52bf'}</span>
              <span className="tac-label">// POPULATION</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-fg-dim">
              {showPopTrend && (
                <span className="inline-flex items-center gap-1">
                  <FaSignal className={popTrendDiff > 0 ? 'text-terminal' : 'text-hazard'} />
                  <span>{'\u0031\u5c0f\u65f6\u53d8\u5316'}</span>
                  <span className={popTrendDiff > 0 ? 'text-terminal font-bold font-mono tabular-nums' : 'text-hazard font-bold font-mono tabular-nums'}>
                    {popTrendDiff > 0 ? '+' : ''}{popTrendDiff}
                  </span>
                </span>
              )}
              <span>{'\u5f53\u524d\u5728\u7ebf'} <span className="font-mono tabular-nums text-fg">{runtimeInfo?.players ?? bmInfo?.players ?? '-'}</span></span>
            </div>
          </div>
          <div className="p-4">
            {canShowPopCurve ? (
              <>
                <div className="flex items-center justify-between text-xs text-fg-mute mb-2">
                  <span className="tac-label !text-[9px]">POP \u00b7 3D</span>
                  <span className="font-mono tabular-nums">MIN {popMin} / MAX {popMax}</span>
                </div>
                <div className="relative border border-ink-line bg-ink-900">
                  <svg
                    viewBox={`0 0 ${POP_CHART_WIDTH} ${POP_CHART_HEIGHT}`}
                    className="w-full h-40 cursor-crosshair"
                    onMouseMove={handlePopChartMouseMove}
                    onMouseLeave={() => setPopHoverIndex(null)}
                    onTouchMove={handlePopChartTouchMove}
                    onTouchStart={handlePopChartTouchMove}
                    onTouchEnd={() => setPopHoverIndex(null)}
                  >
                    <path d={popPath} fill="none" stroke="#E0452E" strokeWidth="3" strokeLinecap="round" />
                    {hoveredPopPoint && (
                      <>
                        <line
                          x1={hoveredPopPoint.x}
                          y1={POP_CHART_PADDING}
                          x2={hoveredPopPoint.x}
                          y2={POP_CHART_HEIGHT - POP_CHART_PADDING}
                          stroke="rgba(224,69,46,0.45)"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                        <circle
                          cx={hoveredPopPoint.x}
                          cy={hoveredPopPoint.y}
                          r="5"
                          fill="#E0452E"
                          stroke="#0A0A0A"
                          strokeWidth="2"
                        />
                      </>
                    )}
                  </svg>
                  {hoveredPopPoint && (
                    <div
                      className="absolute pointer-events-none z-10 bg-ink-900/90 border border-hazard/40 px-2 py-1 text-xs text-fg"
                      style={{
                        left: `${popTooltipLeft}%`,
                        top: `${popTooltipTop}%`,
                        transform: 'translate(-50%, -115%)'
                      }}
                    >
                      <div className="text-[11px] text-fg-dim font-mono tabular-nums">{formatMiniDateTime(hoveredPopPoint.timestamp)}</div>
                      <div className="font-bold font-mono tabular-nums">{hoveredPopPoint.players} 人</div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-fg-mute mt-2">鼠标悬停可查看对应时间点在线人数</div>
                <div className="flex items-center justify-between text-xs text-fg-mute font-mono tabular-nums mt-2">
                  <span>{formatMiniDateTime(popStart?.timestamp)}</span>
                  <span>{formatMiniDateTime(popMidTs)}</span>
                  <span>{formatMiniDateTime(popEnd?.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-fg-mute font-mono tabular-nums mt-1">
                  <span>{popStart?.players ?? 0}{'\u4eba'}</span>
                  <span>{popEnd?.players ?? 0}{'\u4eba'}</span>
                </div>
                {!popHasFullThreeDay && (
                  <div className="text-xs text-fg-mute mt-2">
                    {'\u5f53\u524d\u5df2\u91c7\u6837\u7ea6 '}<span className="font-mono tabular-nums">{popCoverageHours}</span>{'\u5c0f\u65f6\uff0c\u6ee1 72 \u5c0f\u65f6\u540e\u66f4\u5b8c\u6574'}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-fg-dim">{'\u5728\u7ebf\u66f2\u7ebf\u91c7\u6837\u4e2d\uff08\u81f3\u5c112\u4e2a\u91c7\u6837\u70b9\u540e\u663e\u793a\uff0c\u6ee172\u5c0f\u65f6\u66f4\u5b8c\u6574\uff09'}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* 左列：清档 & 地图信息 */}
          <div className="space-y-6">
            {/* 清档信息 */}
            <InfoPanel title="清档信息" en="WIPE" icon={FaCalendarAlt}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 bg-ink-700 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-ink-line">
                    <span className="text-sm text-fg-dim">上次清档</span>
                    <span className="text-sm font-mono tabular-nums text-fg">
                      {bmInfo?.wipeTime ? formatTimeAgo(bmInfo.wipeTime) : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-ink-line">
                    <span className="text-sm text-fg-dim">清档周期</span>
                    <span className="text-sm font-medium text-fg">
                      {formatWipeCycle(bmInfo?.wipeCycle)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-fg-dim">预计下次清档</span>
                    <span className="text-sm font-mono tabular-nums text-hazard">
                      {bmInfo?.nextWipe ? formatTimeAgo(bmInfo.nextWipe) : '-'}
                    </span>
                  </div>
                </div>
              )}
            </InfoPanel>

            {/* 地图信息 */}
            <InfoPanel title="地图信息" en="MAP" icon={FaMapMarkedAlt}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 bg-ink-700 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-ink-line">
                    <span className="text-sm text-fg-dim">地图类型</span>
                    <span className="text-sm font-medium text-fg">
                      {bmInfo?.map || 'Procedural Map'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-ink-line">
                    <span className="text-sm text-fg-dim">地图大小</span>
                    <span className="text-sm font-mono tabular-nums text-fg">
                      {bmInfo?.mapSize ? `${bmInfo.mapSize}m` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-fg-dim flex items-center gap-1">
                      <FaSeedling className="text-fg-mute" />
                      地图种子
                    </span>
                    <span className="text-sm font-mono tabular-nums text-fg">
                      {bmInfo?.seed || '-'}
                    </span>
                  </div>

                  {/* RustMaps 链接 */}
                  {bmInfo?.rustMapsUrl && (
                    <a
                      href={bmInfo.rustMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 mt-3 py-2 px-4 bg-hazard-dim border border-hazard/30 hover:border-hazard text-hazard transition-colors"
                    >
                      <FaExternalLinkAlt className="text-xs" />
                      <span className="text-sm font-medium">在 RustMaps 查看</span>
                    </a>
                  )}
                </div>
              )}
            </InfoPanel>

            {/* 服务器标签 */}
            <InfoPanel title="服务器属性" en="ATTRIBUTES" icon={FaGamepad}>
              <div className="flex flex-wrap gap-2">
                {bmInfo?.official && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ink-800 text-fg-dim border border-ink-line">
                    <FaCheckCircle className="text-fg-mute" /> 官方服务器
                  </span>
                )}
                {bmInfo?.modded && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ink-800 text-fg-dim border border-ink-line">
                    <FaGamepad className="text-fg-mute" /> 模组服务器
                  </span>
                )}
                {bmInfo?.pve && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ink-800 text-fg-dim border border-ink-line">
                    <FaInfoCircle className="text-fg-mute" /> PVE 模式
                  </span>
                )}
                {!bmInfo?.official && !bmInfo?.modded && !bmInfo?.pve && (
                  <span className="text-sm text-fg-mute">暂无标签信息</span>
                )}
              </div>
            </InfoPanel>
          </div>

          {/* 中列：在线玩家列表 */}
          <div className="space-y-6">
            <InfoPanel title={`最近登录玩家 (${recentOnlineCount}/${totalOnlineCount})`} en="RECENT" icon={FaUserClock} className="h-fit">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 bg-ink-700 animate-pulse" />
                  ))}
                </div>
              ) : recentOnlineCount > 0 ? (
                <div className="space-y-3">
                  {recentOnlineCount < totalOnlineCount && (
                    <div className="text-[11px] text-fg-dim bg-hazard-dim border border-hazard/30 px-3 py-2">
                      该列表仅展示最近时间窗口内有会话活动的玩家，可在下方查看全部在线玩家。
                    </div>
                  )}
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs" />
                    <input
                      type="text"
                      value={onlineSearch}
                      onChange={(e) => setOnlineSearch(e.target.value)}
                      placeholder="搜索最近登录玩家"
                      className="tac-input !pl-8 !py-2 !text-xs"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-ink-line">
                    <div className="grid grid-cols-12 text-[10px] text-fg-dim font-mono uppercase tracking-wider px-3 py-2 border-b border-ink-line bg-ink-800">
                      <span className="col-span-5">PLAYER</span>
                      <span className="col-span-3">ONLINE</span>
                      <span className="col-span-3">DURATION</span>
                      <span className="col-span-1 text-right">TRACK</span>
                    </div>
                    {filteredRecentOnlinePlayers.map((player, index) => (
                      <button
                        type="button"
                        key={player.id || index}
                        onClick={() => setSelectedPlayer(player)}
                        className="group w-full grid grid-cols-12 items-center px-3 py-2 border-b border-ink-line last:border-0 hover:bg-ink-800/60 transition-colors text-left"
                      >
                        <span className="col-span-5 text-sm text-fg truncate">{player.name || 'Unknown'}</span>
                        <span className="col-span-3 text-xs text-fg-dim font-mono tabular-nums">{formatDateTime(player.sessionStart)}</span>
                        <span className="col-span-3 text-xs text-terminal font-mono tabular-nums">
                          {formatDuration(getSessionDurationSec(player) || player.onlineDurationSec)}
                        </span>
                        <span className="col-span-1 text-right">
                          <FaCrosshairs className="inline text-xs text-fg-mute group-hover:text-hazard transition-colors" />
                        </span>
                      </button>
                    ))}
                    {filteredRecentOnlinePlayers.length === 0 && (
                      <div className="text-center text-xs text-fg-mute py-6">
                        未找到匹配玩家
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-fg-mute">
                  <FaUserClock className="text-3xl mx-auto mb-2 opacity-50" />
                  <p>{totalOnlineCount > 0 ? '最近登录玩家暂不可用，请稍后刷新' : '暂无在线玩家数据'}</p>
                </div>
              )}
            </InfoPanel>

            <InfoPanel title={`全部在线玩家 (${allOnlineCount}/${totalOnlineCount})`} en="ONLINE" icon={FaUsers} className="h-fit">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 bg-ink-700 animate-pulse" />
                  ))}
                </div>
              ) : allOnlineCount > 0 ? (
                <div className="space-y-3">
                  {allOnlineCount < totalOnlineCount && (
                    <div className="text-[11px] text-fg-dim bg-hazard-dim border border-hazard/30 px-3 py-2">
                      全量在线列表与总在线人数可能存在 BattleMetrics 的短暂同步延迟。
                    </div>
                  )}
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs" />
                    <input
                      type="text"
                      value={allOnlineSearch}
                      onChange={(e) => setAllOnlineSearch(e.target.value)}
                      placeholder="搜索全部在线玩家"
                      className="tac-input !pl-8 !py-2 !text-xs"
                    />
                  </div>
                  <div className="max-h-96 overflow-y-auto border border-ink-line">
                    <div className="grid grid-cols-12 text-[10px] text-fg-dim font-mono uppercase tracking-wider px-3 py-2 border-b border-ink-line bg-ink-800">
                      <span className="col-span-5">PLAYER</span>
                      <span className="col-span-3">ONLINE</span>
                      <span className="col-span-3">DURATION</span>
                      <span className="col-span-1 text-right">TRACK</span>
                    </div>
                    {filteredAllOnlinePlayers.map((player, index) => (
                      <button
                        type="button"
                        key={`${player.id || index}-all`}
                        onClick={() => setSelectedPlayer(player)}
                        className="group w-full grid grid-cols-12 items-center px-3 py-2 border-b border-ink-line last:border-0 hover:bg-ink-800/60 transition-colors text-left"
                      >
                        <span className="col-span-5 text-sm text-fg truncate">{player.name || 'Unknown'}</span>
                        <span className="col-span-3 text-xs text-fg-dim font-mono tabular-nums">{formatDateTime(player.sessionStart)}</span>
                        <span className="col-span-3 text-xs text-terminal font-mono tabular-nums">
                          {formatDuration(getSessionDurationSec(player) || player.onlineDurationSec)}
                        </span>
                        <span className="col-span-1 text-right">
                          <FaCrosshairs className="inline text-xs text-fg-mute group-hover:text-hazard transition-colors" />
                        </span>
                      </button>
                    ))}
                    {filteredAllOnlinePlayers.length === 0 && (
                      <div className="text-center text-xs text-fg-mute py-6">
                        未找到匹配玩家
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-fg-mute">
                  <FaUsers className="text-3xl mx-auto mb-2 opacity-50" />
                  <p>{totalOnlineCount > 0 ? '全部在线玩家列表暂不可用，请稍后刷新' : '暂无在线玩家数据'}</p>
                </div>
              )}
            </InfoPanel>
          </div>

          {/* 右列：时长排行榜 */}
          <InfoPanel title="30天时长排行" en="LEADERBOARD" icon={FaChartLine} className="h-fit">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-ink-700 animate-pulse" />
                ))}
              </div>
            ) : topPlayers.length > 0 ? (
              <div className="border border-ink-line max-h-96 overflow-y-auto">
                {topPlayers.slice(0, 20).map((player, index) => (
                  <PlayerListItem key={player.id} player={player} rank={index + 1} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-fg-mute">
                <FaChartLine className="text-3xl mx-auto mb-2 opacity-50" />
                <p>暂无排行数据</p>
              </div>
            )}
          </InfoPanel>
        </div>

        {/* 服务器描述 */}
        {bmInfo?.description && (
          <InfoPanel title="服务器描述" en="DESCRIPTION" icon={FaInfoCircle}>
            <div className="text-sm text-fg-dim whitespace-pre-wrap leading-relaxed">
              {bmInfo.description}
            </div>
          </InfoPanel>
        )}

        {/* 底部提示 */}
        <div className="text-center text-xs text-fg-mute pb-4">
          {lastRefresh && (
            <span>数据更新于 <span className="font-mono tabular-nums">{lastRefresh.toLocaleTimeString()}</span></span>
          )}
          <span className="mx-2">·</span>
          <span>数据来源: Battlemetrics (每60秒自动更新)</span>
        </div>
      </div>

      {/* 玩家详情弹窗 */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="tac-panel tac-corners w-full max-w-sm">
            {/* 头部 */}
            <div className="flex items-center justify-between p-5 border-b border-ink-line">
              <h3 className="text-lg font-extrabold text-fg flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" />
                玩家信息
              </h3>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-2 text-fg-dim hover:text-fg hover:bg-ink-800 transition-colors"
                aria-label="关闭"
              >
                <FaTimes />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-5 space-y-4">
              <div className="text-center">
                <h4 className="text-xl font-extrabold text-fg mb-1">{selectedPlayer.name}</h4>
                <p className="text-xs text-fg-dim font-mono tabular-nums">BM ID: {selectedPlayer.id}</p>
              </div>

              <div className="bg-ink-800 border border-ink-line p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-fg-dim">状态</span>
                  <span className="inline-flex items-center gap-1.5 text-terminal font-mono uppercase tracking-wider text-xs">
                    <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" />
                    ONLINE
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-fg-dim">服务器</span>
                  <span className="text-fg truncate ml-4 max-w-[180px]">{server?.name || bmInfo?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-fg-dim">上线时间</span>
                  <span className="text-fg font-mono tabular-nums">{formatDateTime(selectedPlayer.sessionStart)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-fg-dim">在线时长</span>
                  <span className="text-terminal font-mono tabular-nums">
                    {formatDuration(getSessionDurationSec(selectedPlayer) || selectedPlayer.onlineDurationSec)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-fg-mute text-center">
                点击下方按钮将此玩家添加到追踪列表，当他上线/下线时会收到通知
              </p>
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3 p-5 border-t border-ink-line">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="tac-btn tac-btn-ghost flex-1"
              >
                取消
              </button>
              <button
                onClick={handleTrackPlayer}
                disabled={tracking}
                className="tac-btn tac-btn-primary flex-1"
              >
                {tracking ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    追踪中...
                  </>
                ) : (
                  <>
                    <FaPlus />
                    追踪此玩家
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServerInfoView;
