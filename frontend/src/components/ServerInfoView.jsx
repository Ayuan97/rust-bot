import { useState, useEffect, useCallback } from 'react';
import {
  FaServer, FaUsers, FaClock, FaMapMarkedAlt, FaTrophy, FaTachometerAlt,
  FaCubes, FaCalendarAlt, FaSyncAlt, FaChartLine, FaGlobe, FaGamepad,
  FaSeedling, FaExternalLinkAlt, FaUserClock, FaSignal, FaHourglassHalf,
  FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaCrosshairs, FaTimes,
  FaSpinner, FaPlus
} from 'react-icons/fa';
import { getBattlemetricsInfo, getTopPlayers, trackPlayerByBmId } from '../services/api';
import { formatTimeAgo } from '../utils/time';
import { useToast } from './Toast';

// 状态卡片组件
function StatCard({ icon: Icon, label, value, subValue, color = 'rust-orange', loading }) {
  return (
    <div className="bg-dark-800/50 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg bg-${color}/10`}>
          <Icon className={`text-lg text-${color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-0.5">{label}</div>
          {loading ? (
            <div className="h-6 w-20 bg-gray-700/50 rounded animate-pulse" />
          ) : (
            <div className="text-lg font-bold text-white truncate">
              {value}
              {subValue && <span className="text-sm text-gray-500 ml-1">{subValue}</span>}
            </div>
          )}
        </div>
      </div>
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
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
      {rank && (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
          rank === 2 ? 'bg-gray-400/20 text-gray-300' :
          rank === 3 ? 'bg-orange-600/20 text-orange-400' :
          'bg-gray-700/50 text-gray-500'
        }`}>
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{player.name}</div>
        {player.time && (
          <div className="text-xs text-gray-500">{formatPlayTime(player.time)}</div>
        )}
      </div>
      {player.time && (
        <div className="text-xs text-gray-400">
          <FaUserClock className="inline mr-1" />
          {formatPlayTime(player.time)}
        </div>
      )}
    </div>
  );
}

// 信息面板组件
function InfoPanel({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-dark-800/30 rounded-xl border border-white/5 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <Icon className="text-rust-orange" />
        <span className="font-semibold text-white">{title}</span>
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [tracking, setTracking] = useState(false);

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
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [bmRes, playersRes] = await Promise.all([
        getBattlemetricsInfo(server.id),
        getTopPlayers(server.id, 30)
      ]);

      if (bmRes.data.success) {
        setBmInfo(bmRes.data.data);
      }

      if (playersRes.data.success) {
        setTopPlayers(playersRes.data.players || []);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('加载服务器信息失败:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [server.id]);

  // 初始加载
  useEffect(() => {
    loadData();
  }, [loadData]);

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
  const playerPercentage = bmInfo ? Math.round((bmInfo.players / bmInfo.maxPlayers) * 100) : 0;

  // 获取状态颜色
  const getStatusColor = (status) => {
    if (status === 'online') return 'text-green-400';
    if (status === 'offline') return 'text-red-400';
    return 'text-yellow-400';
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* 顶部头图区域 */}
        <div className="relative rounded-2xl overflow-hidden">
          {/* 背景图 */}
          <div className="absolute inset-0">
            {bmInfo?.headerImage ? (
              <img
                src={bmInfo.headerImage}
                alt=""
                className="w-full h-full object-cover opacity-30"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-rust-orange/20 to-dark-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/80 to-transparent" />
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
                    className="w-24 h-24 rounded-xl object-cover border-2 border-white/10 shadow-xl"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-rust-orange to-orange-600 flex items-center justify-center border-2 border-white/10 shadow-xl">
                    <FaServer className="text-4xl text-white" />
                  </div>
                )}
              </div>

              {/* 服务器信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-white truncate">
                    {bmInfo?.name || server.name}
                  </h1>
                  {bmInfo?.status && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                      bmInfo.status === 'online'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {bmInfo.status === 'online' ? '在线' : '离线'}
                    </span>
                  )}
                  {bmInfo?.official && (
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      官方服
                    </span>
                  )}
                  {bmInfo?.modded && (
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      模组服
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                  <span className="flex items-center gap-1.5">
                    <FaSignal className="text-gray-500" />
                    <span className="font-mono">{bmInfo?.address || `${server.ip}:${server.port}`}</span>
                  </span>
                  {bmInfo?.country && (
                    <span className="flex items-center gap-1.5">
                      <FaGlobe className="text-gray-500" />
                      {bmInfo.country}
                    </span>
                  )}
                  {bmInfo?.rank && (
                    <span className="flex items-center gap-1.5">
                      <FaTrophy className="text-yellow-500" />
                      排名 #{bmInfo.rank}
                    </span>
                  )}
                </div>

                {/* 玩家进度条 */}
                {bmInfo && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-400 flex items-center gap-1.5">
                        <FaUsers className="text-rust-orange" />
                        在线玩家
                      </span>
                      <span className="text-sm font-bold text-white">
                        {bmInfo.players}
                        <span className="text-gray-500">/{bmInfo.maxPlayers}</span>
                        {bmInfo.queuedPlayers > 0 && (
                          <span className="text-yellow-400 ml-2">(+{bmInfo.queuedPlayers} 排队)</span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-2.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          playerPercentage >= 90 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                          playerPercentage >= 70 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                          playerPercentage >= 50 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                          'bg-gradient-to-r from-green-500 to-green-600'
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
                  className={`p-3 rounded-xl transition-all ${
                    cooldown > 0 || refreshing
                      ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                  }`}
                  title={cooldown > 0 ? `${cooldown}秒后可刷新` : '刷新数据'}
                >
                  <FaSyncAlt className={`text-lg ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                {cooldown > 0 && (
                  <div className="text-xs text-gray-500 text-center mt-1">{cooldown}s</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 状态卡片网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard
            icon={FaUsers}
            label="在线玩家"
            value={bmInfo?.players || '-'}
            subValue={bmInfo ? `/ ${bmInfo.maxPlayers}` : ''}
            color="green-400"
            loading={loading}
          />
          <StatCard
            icon={FaHourglassHalf}
            label="排队人数"
            value={bmInfo?.queuedPlayers || 0}
            color="yellow-400"
            loading={loading}
          />
          <StatCard
            icon={FaTachometerAlt}
            label="服务器 FPS"
            value={bmInfo?.fps || '-'}
            color="blue-400"
            loading={loading}
          />
          <StatCard
            icon={FaCubes}
            label="实体数量"
            value={bmInfo?.entityCount?.toLocaleString() || '-'}
            color="purple-400"
            loading={loading}
          />
          <StatCard
            icon={FaTrophy}
            label="全球排名"
            value={bmInfo?.rank ? `#${bmInfo.rank}` : '-'}
            color="yellow-400"
            loading={loading}
          />
          <StatCard
            icon={FaClock}
            label="运行时间"
            value={formatUptime(bmInfo?.uptime)}
            color="cyan-400"
            loading={loading}
          />
        </div>

        {/* 主要内容区域 - 三列布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* 左列：清档 & 地图信息 */}
          <div className="space-y-6">
            {/* 清档信息 */}
            <InfoPanel title="清档信息" icon={FaCalendarAlt}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 bg-gray-700/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">上次清档</span>
                    <span className="text-sm font-medium text-white">
                      {bmInfo?.wipeTime ? formatTimeAgo(bmInfo.wipeTime) : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">清档周期</span>
                    <span className="text-sm font-medium text-white">
                      {formatWipeCycle(bmInfo?.wipeCycle)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-400">预计下次清档</span>
                    <span className="text-sm font-medium text-rust-orange">
                      {bmInfo?.nextWipe ? formatTimeAgo(bmInfo.nextWipe) : '-'}
                    </span>
                  </div>
                </div>
              )}
            </InfoPanel>

            {/* 地图信息 */}
            <InfoPanel title="地图信息" icon={FaMapMarkedAlt}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 bg-gray-700/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">地图类型</span>
                    <span className="text-sm font-medium text-white">
                      {bmInfo?.map || 'Procedural Map'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">地图大小</span>
                    <span className="text-sm font-medium text-white">
                      {bmInfo?.mapSize ? `${bmInfo.mapSize}m` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-400 flex items-center gap-1">
                      <FaSeedling className="text-green-400" />
                      地图种子
                    </span>
                    <span className="text-sm font-mono text-white">
                      {bmInfo?.seed || '-'}
                    </span>
                  </div>

                  {/* RustMaps 链接 */}
                  {bmInfo?.rustMapsUrl && (
                    <a
                      href={bmInfo.rustMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 mt-3 py-2 px-4 rounded-lg bg-rust-orange/10 hover:bg-rust-orange/20 text-rust-orange transition-colors"
                    >
                      <FaExternalLinkAlt className="text-xs" />
                      <span className="text-sm font-medium">在 RustMaps 查看</span>
                    </a>
                  )}
                </div>
              )}
            </InfoPanel>

            {/* 服务器标签 */}
            <InfoPanel title="服务器属性" icon={FaGamepad}>
              <div className="flex flex-wrap gap-2">
                {bmInfo?.official && (
                  <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <FaCheckCircle className="inline mr-1" /> 官方服务器
                  </span>
                )}
                {bmInfo?.modded && (
                  <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <FaGamepad className="inline mr-1" /> 模组服务器
                  </span>
                )}
                {bmInfo?.pve && (
                  <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                    <FaInfoCircle className="inline mr-1" /> PVE 模式
                  </span>
                )}
                {!bmInfo?.official && !bmInfo?.modded && !bmInfo?.pve && (
                  <span className="text-sm text-gray-500">暂无标签信息</span>
                )}
              </div>
            </InfoPanel>
          </div>

          {/* 中列：在线玩家列表 */}
          <InfoPanel title={`在线玩家 (${bmInfo?.players || 0})`} icon={FaUsers} className="h-fit">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-gray-700/30 rounded animate-pulse" />
                ))}
              </div>
            ) : bmInfo?.onlinePlayers && bmInfo.onlinePlayers.length > 0 ? (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {bmInfo.onlinePlayers.slice(0, 50).map((player, index) => (
                  <div
                    key={player.id || index}
                    onClick={() => setSelectedPlayer(player)}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-sm text-white truncate flex-1">{player.name}</span>
                    <FaCrosshairs className="text-xs text-gray-600 group-hover:text-[#cd5241] transition-colors" />
                  </div>
                ))}
                {bmInfo.onlinePlayers.length > 50 && (
                  <div className="text-center text-xs text-gray-500 py-2">
                    还有 {bmInfo.onlinePlayers.length - 50} 名玩家...
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FaUsers className="text-3xl mx-auto mb-2 opacity-50" />
                <p>暂无在线玩家数据</p>
              </div>
            )}
          </InfoPanel>

          {/* 右列：时长排行榜 */}
          <InfoPanel title="30天时长排行" icon={FaChartLine} className="h-fit">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-gray-700/30 rounded animate-pulse" />
                ))}
              </div>
            ) : topPlayers.length > 0 ? (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {topPlayers.slice(0, 20).map((player, index) => (
                  <PlayerListItem key={player.id} player={player} rank={index + 1} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FaChartLine className="text-3xl mx-auto mb-2 opacity-50" />
                <p>暂无排行数据</p>
              </div>
            )}
          </InfoPanel>
        </div>

        {/* 服务器描述 */}
        {bmInfo?.description && (
          <InfoPanel title="服务器描述" icon={FaInfoCircle}>
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {bmInfo.description}
            </div>
          </InfoPanel>
        )}

        {/* 底部提示 */}
        <div className="text-center text-xs text-gray-600 pb-4">
          {lastRefresh && (
            <span>数据更新于 {lastRefresh.toLocaleTimeString()}</span>
          )}
          <span className="mx-2">·</span>
          <span>数据来源: Battlemetrics (每60秒自动更新)</span>
        </div>
      </div>

      {/* 玩家详情弹窗 */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-dark-900 border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            {/* 头部 */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                玩家信息
              </h3>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <FaTimes className="text-gray-400" />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-5 space-y-4">
              <div className="text-center">
                <h4 className="text-xl font-bold text-white mb-1">{selectedPlayer.name}</h4>
                <p className="text-xs text-gray-500 font-mono">BM ID: {selectedPlayer.id}</p>
              </div>

              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">状态</span>
                  <span className="text-green-400 font-medium">在线</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">服务器</span>
                  <span className="text-white truncate ml-4 max-w-[180px]">{server?.name || bmInfo?.name}</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center">
                点击下方按钮将此玩家添加到追踪列表，当他上线/下线时会收到通知
              </p>
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3 p-5 border-t border-white/5">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleTrackPlayer}
                disabled={tracking}
                className="flex-1 py-3 bg-[#cd5241] hover:bg-[#b04537] rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
