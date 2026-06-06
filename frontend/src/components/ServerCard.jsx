import { useState, useEffect } from 'react';
import {
  FaServer, FaUsers, FaClock, FaTrash, FaPlug, FaPowerOff, FaMapMarkedAlt,
  FaSun, FaMoon, FaSignal, FaTachometerAlt, FaCalendarAlt,
  FaCubes, FaTrophy, FaChevronDown, FaChevronUp, FaSkull, FaHeart,
  FaMapMarkerAlt
} from 'react-icons/fa';
import socketService from '../services/socket';
import { getBattlemetricsInfo } from '../services/api';
import { useToast } from './Toast';
import { formatGameTime, isDaytime, formatTimeAgo } from '../utils/time';

const POP_CURVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const POP_CURVE_FULL_TOLERANCE_MS = 20 * 60 * 1000;

function formatMiniTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function buildPopulationPath(points, width, height, padding = 4) {
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

function ServerCard({ server, onDelete, onSelect, isActive }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [timeInfo, setTimeInfo] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [bmInfo, setBmInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loadingBM, setLoadingBM] = useState(false);
  const [imgError, setImgError] = useState(false);

  const toast = useToast();

  useEffect(() => {
    if (server.connected && isActive) {
      fetchAllInfo();
      const interval = setInterval(fetchAllInfo, 30000);
      return () => clearInterval(interval);
    }
  }, [server.connected, isActive]);

  // 获取 Battlemetrics 信息（仅在展开详情时）
  useEffect(() => {
    if (showDetails && !bmInfo && !loadingBM) {
      fetchBattlemetricsInfo();
    }
  }, [showDetails]);

  const fetchAllInfo = async () => {
    try {
      const [info, time, team] = await Promise.all([
        socketService.getServerInfo(server.id),
        socketService.getTime(server.id),
        socketService.getTeamInfo(server.id)
      ]);
      setServerInfo(info);
      setTimeInfo(time);
      setTeamInfo(team);
    } catch (error) {
      console.error('获取服务器信息失败:', error);
    }
  };

  const fetchBattlemetricsInfo = async () => {
    setLoadingBM(true);
    try {
      const response = await getBattlemetricsInfo(server.id);
      if (response.data.success) {
        setBmInfo(response.data.data);
      }
    } catch (error) {
      console.error('获取 Battlemetrics 信息失败:', error);
      // 设置为空对象表示已尝试但失败，避免重复请求
      setBmInfo({});
    } finally {
      setLoadingBM(false);
    }
  };

  const getPlayerPercentage = () => {
    if (!serverInfo) return 0;
    return Math.round((serverInfo.players / serverInfo.maxPlayers) * 100);
  };

  // 进度条配色收敛：满载/高负载=hazard 红，其余=中性 fg
  const getPlayerBarColor = (percentage) => {
    if (percentage >= 70) return 'bg-hazard';
    return 'bg-fg-dim';
  };

  const getOnlineTeamCount = () => {
    if (!teamInfo || !teamInfo.members) return 0;
    return teamInfo.members.filter(m => m.isOnline).length;
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      // 只发送 serverId，后端从数据库获取安全配置
      await socketService.connectToServer(server.id);
    } catch (error) {
      console.error('连接失败:', error);
      toast.error('连接失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await socketService.disconnectFromServer(server.id);
    } catch (error) {
      console.error('断开失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const percentage = getPlayerPercentage();
  const popSeries = Array.isArray(serverInfo?.popSeries)
    ? serverInfo.popSeries
      .map((point) => ({
        timestamp: Number(point?.timestamp) || 0,
        players: Number(point?.players) || 0
      }))
      .filter((point) => point.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp)
    : [];
  const canShowPopCurve = popSeries.length >= 2;
  const popPath = canShowPopCurve ? buildPopulationPath(popSeries, 220, 54) : '';
  const popMin = canShowPopCurve ? Math.min(...popSeries.map((point) => point.players)) : 0;
  const popMax = canShowPopCurve ? Math.max(...popSeries.map((point) => point.players)) : 0;
  const popStart = canShowPopCurve ? popSeries[0] : null;
  const popEnd = canShowPopCurve ? popSeries[popSeries.length - 1] : null;
  const popMidTs = (canShowPopCurve && popStart && popEnd)
    ? Math.floor((popStart.timestamp + popEnd.timestamp) / 2)
    : null;
  const popCoverageMs = (canShowPopCurve && popStart && popEnd) ? Math.max(0, popEnd.timestamp - popStart.timestamp) : 0;
  const popCoverageHours = Math.max(1, Math.round(popCoverageMs / (60 * 60 * 1000)));
  const popHasFullThreeDay = canShowPopCurve && popCoverageMs >= (POP_CURVE_WINDOW_MS - POP_CURVE_FULL_TOLERANCE_MS);

  return (
    <div
      className={`relative tac-panel transition-colors ${
        isActive
          ? 'border-hazard tac-corners'
          : 'hover:border-ink-line2'
      }`}
      onClick={() => onSelect(server)}
    >
      {/* 顶部状态条：已连接=terminal 闪烁，离线=中性 */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 z-10 ${
        server.connected
          ? 'bg-terminal animate-tac-blink'
          : 'bg-ink-line2'
      }`} />

      <div className="relative z-10 p-5">
        {/* 头部：Logo + 服务器名称 + 状态 */}
        <div className="flex items-start gap-4 mb-4">
          {/* 左侧大Logo */}
          <div className="flex-shrink-0">
            {(server.img || server.logo) && !imgError ? (
              <img
                src={server.img || server.logo}
                alt={server.name}
                className="w-24 h-24 object-cover border border-ink-line"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-24 h-24 bg-ink-800 border border-ink-line flex items-center justify-center">
                <FaServer className="text-4xl text-fg-mute" />
              </div>
            )}
          </div>

          {/* 右侧：服务器信息 */}
          <div className="flex-1 min-w-0">
            {/* 第一行：服务器名 + 状态徽章 */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="font-extrabold text-xl text-fg truncate">
                {server.name}
              </h3>
              {server.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-terminal border border-terminal/30">
                  <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" />
                  ONLINE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-fg-mute border border-ink-line">
                  <span className="w-1.5 h-1.5 bg-fg-mute" />
                  OFFLINE
                </span>
              )}
              {teamInfo && getOnlineTeamCount() > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-fg-dim border border-ink-line">
                  <FaUsers className="text-[10px]" />
                  <span className="tabular-nums">{getOnlineTeamCount()}</span> SQUAD
                </span>
              )}
            </div>

            {/* 第二行：IP端口 */}
            <div className="flex items-center gap-2 text-sm text-fg-dim mb-2">
              <FaSignal className="text-fg-mute" />
              <span className="font-mono tabular-nums">{server.ip}:{server.port}</span>
            </div>

            {/* 第三行：玩家进度条 */}
            {server.connected && serverInfo && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="tac-label flex items-center gap-1.5">
                    <FaUsers className="text-hazard" />
                    POPULATION
                  </span>
                  <span className="text-sm font-bold text-fg font-mono tabular-nums">
                    {serverInfo.players}<span className="text-fg-mute">/{serverInfo.maxPlayers}</span>
                    <span className="text-xs ml-1.5 text-fg-dim">{percentage}%</span>
                  </span>
                </div>
                <div className="relative h-1.5 bg-ink-700 border border-ink-line overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getPlayerBarColor(percentage)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 最右侧：操作按钮 */}
          <div className="flex flex-col gap-2">
            <button
              className="p-2.5 border border-ink-line text-fg-dim hover:border-hazard/50 hover:text-hazard transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(server.id);
              }}
              title="删除服务器"
              aria-label="删除服务器"
            >
              <FaTrash className="text-sm" />
            </button>
          </div>
        </div>

        {/* 三列布局：服务器详情 | 实时状态 | 队友列表 */}
        {server.connected && (
          <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line mb-4">
            {/* 列1：服务器详情 */}
            <div className="bg-ink-850 p-3">
              <div className="tac-label flex items-center gap-2 mb-3">
                <FaServer className="text-hazard" />
                INTEL
              </div>
              <div className="space-y-2 text-xs">
                {serverInfo && (
                  <>
                    <div className="flex items-center gap-2 text-fg">
                      <FaMapMarkedAlt className="text-fg-mute shrink-0" />
                      <span className="font-mono truncate">{serverInfo.map || 'Unknown'}</span>
                    </div>
                    {bmInfo && bmInfo.mapSize && (
                      <>
                        <div className="flex items-center gap-2 text-fg-dim">
                          <FaCubes className="text-fg-mute shrink-0" />
                          <span>地图尺寸 <span className="font-mono tabular-nums text-fg">{bmInfo.mapSize}</span></span>
                        </div>
                        {bmInfo.lastWipe && (
                          <div className="flex items-center gap-2 text-fg-dim">
                            <FaCalendarAlt className="text-fg-mute shrink-0" />
                            <span>清档 <span className="font-mono text-fg">{formatTimeAgo(bmInfo.lastWipe)}</span></span>
                          </div>
                        )}
                        {bmInfo.fps && (
                          <div className="flex items-center gap-2 text-fg-dim">
                            <FaTachometerAlt className="text-fg-mute shrink-0" />
                            <span>FPS <span className="font-mono tabular-nums text-fg">{bmInfo.fps}</span></span>
                          </div>
                        )}
                        {bmInfo.rank && (
                          <div className="flex items-center gap-2 text-fg-dim">
                            <FaTrophy className="text-fg-mute shrink-0" />
                            <span>排名 <span className="font-mono tabular-nums text-fg">#{bmInfo.rank}</span></span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 列2：实时状态 */}
            <div className="bg-ink-850 p-3">
              <div className="tac-label flex items-center gap-2 mb-3">
                <FaClock className="text-hazard" />
                STATUS
              </div>
              <div className="space-y-2 text-xs">
                {timeInfo && (
                  <div className="flex items-center gap-2 text-fg-dim">
                    {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                      <FaSun className="text-hazard shrink-0" />
                    ) : (
                      <FaMoon className="text-fg-mute shrink-0" />
                    )}
                    <span>游戏时间 <span className="font-mono tabular-nums text-fg">{formatGameTime(timeInfo.time)}</span></span>
                  </div>
                )}
                {serverInfo && (
                  <>
                    <div className="flex items-center gap-2 text-fg-dim">
                      <FaUsers className="text-fg-mute shrink-0" />
                      <span>在线 <span className="font-mono tabular-nums text-fg">{serverInfo.players}/{serverInfo.maxPlayers}</span></span>
                    </div>
                    {serverInfo.popTrend?.hasBaseline && Number(serverInfo.popTrend?.diff) !== 0 && (
                      <div className="flex items-center gap-2 text-fg-dim">
                        <FaSignal className={Number(serverInfo.popTrend?.diff) > 0 ? 'text-terminal shrink-0' : 'text-hazard shrink-0'} />
                        <span>
                          1小时变化
                          <span className={Number(serverInfo.popTrend?.diff) > 0 ? 'text-terminal ml-1 font-mono tabular-nums' : 'text-hazard ml-1 font-mono tabular-nums'}>
                            {Number(serverInfo.popTrend?.diff) > 0 ? '+' : ''}{Number(serverInfo.popTrend?.diff)}
                          </span>
                        </span>
                      </div>
                    )}
                    {serverInfo.queuedPlayers > 0 && (
                      <div className="flex items-center gap-2 text-fg-dim">
                        <FaClock className="text-fg-mute shrink-0" />
                        <span>排队 <span className="font-mono tabular-nums text-fg">{serverInfo.queuedPlayers}</span></span>
                      </div>
                    )}
                    {canShowPopCurve ? (
                      <div className="mt-2 p-2 border border-ink-line bg-ink-900">
                        <div className="flex items-center justify-between mb-1">
                          <span className="tac-label !text-[9px]">POP · 3D</span>
                          <span className="font-mono text-[10px] text-fg-dim tabular-nums">MIN {popMin} / MAX {popMax}</span>
                        </div>
                        <svg viewBox="0 0 220 54" className="w-full h-14">
                          <path d={popPath} fill="none" stroke="#E0452E" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <div className="flex items-center justify-between font-mono text-[10px] text-fg-mute mt-1 tabular-nums">
                          <span>{formatMiniTime(popStart?.timestamp)}</span>
                          <span>{formatMiniTime(popMidTs)}</span>
                          <span>{formatMiniTime(popEnd?.timestamp)}</span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10px] text-fg-mute mt-1 tabular-nums">
                          <span>{popStart?.players ?? 0}人</span>
                          <span>{popEnd?.players ?? 0}人</span>
                        </div>
                        {!popHasFullThreeDay && (
                          <div className="text-[10px] text-fg-mute mt-1">当前已采样约 <span className="font-mono tabular-nums">{popCoverageHours}</span> 小时，满 72 小时后更完整</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-fg-mute">在线曲线采样中（至少2个采样点后显示，满72小时更完整）</div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 列3：队友列表 */}
            <div className="bg-ink-850 p-3">
              <div className="tac-label flex items-center gap-2 mb-3">
                <FaUsers className="text-hazard" />
                SQUAD
              </div>
              <div className="space-y-2 text-xs max-h-24 overflow-y-auto">
                {teamInfo && teamInfo.members && teamInfo.members.length > 0 ? (
                  teamInfo.members.map((member, index) => (
                    <div key={index} className="flex items-center gap-2 text-fg-dim">
                      {member.isOnline ? (
                        member.isAlive ? (
                          <FaHeart className="text-terminal flex-shrink-0" />
                        ) : (
                          <FaSkull className="text-hazard flex-shrink-0" />
                        )
                      ) : (
                        <span className="w-1.5 h-1.5 bg-fg-mute flex-shrink-0" />
                      )}
                      <span className="truncate text-fg">{member.name}</span>
                      {member.isOnline && member.x !== undefined && member.y !== undefined && (
                        <span className="text-fg-mute text-[10px] ml-auto">
                          <FaMapMarkerAlt className="inline" />
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-fg-mute">暂无队友信息</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 底部：操作按钮 + 详情展开 */}
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {/* 连接/断开按钮 */}
          {!server.connected ? (
            <button
              className="tac-btn tac-btn-primary flex-1"
              onClick={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <>
                  <FaPlug className="animate-tac-blink" />
                  连接中 // LINK...
                </>
              ) : (
                <>
                  <FaPlug />
                  连接服务器 // CONNECT
                </>
              )}
            </button>
          ) : (
            <button
              className="tac-btn tac-btn-ghost flex-1"
              onClick={handleDisconnect}
              disabled={loading}
            >
              <FaPowerOff />
              断开连接 // DISCONNECT
            </button>
          )}

          {/* 查看详情按钮 */}
          {server.connected && (
            <button
              className="tac-btn tac-btn-ghost"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? (
                <>
                  <FaChevronUp />
                  收起
                </>
              ) : (
                <>
                  <FaChevronDown />
                  详情
                </>
              )}
            </button>
          )}
        </div>

        {/* 展开的详情区域 */}
        {showDetails && server.connected && (
          <div className="mt-4 pt-4 border-t border-ink-line space-y-3">
            {loadingBM ? (
              <div className="tac-label flex items-center justify-center gap-2 py-4">
                <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" />
                LOADING BATTLEMETRICS // 加载中…
              </div>
            ) : bmInfo && Object.keys(bmInfo).length > 0 ? (
              <>
                {/* 服务器描述 */}
                {(bmInfo.description || server.description) && (
                  <div className="bg-ink-850 border border-ink-line p-3">
                    <div className="tac-label mb-2">DESCRIPTION // 服务器描述</div>
                    <div className="text-xs text-fg-dim whitespace-pre-wrap">
                      {bmInfo.description || server.description}
                    </div>
                  </div>
                )}

                {/* 详细信息 */}
                {(bmInfo.modded !== undefined || bmInfo.pve !== undefined || bmInfo.entityCount || bmInfo.uptime) && (
                  <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line text-xs">
                    {bmInfo.modded !== undefined && (
                      <div className="bg-ink-850 p-2.5">
                        <span className="tac-label !text-[9px]">MODE</span>
                        <div className="text-fg mt-1">{bmInfo.modded ? '模组服' : '原版'}</div>
                      </div>
                    )}
                    {bmInfo.pve !== undefined && (
                      <div className="bg-ink-850 p-2.5">
                        <span className="tac-label !text-[9px]">PVE</span>
                        <div className="text-fg mt-1">{bmInfo.pve ? '是' : '否'}</div>
                      </div>
                    )}
                    {bmInfo.entityCount && (
                      <div className="bg-ink-850 p-2.5">
                        <span className="tac-label !text-[9px]">ENTITIES</span>
                        <div className="text-fg font-mono tabular-nums mt-1">{bmInfo.entityCount.toLocaleString()}</div>
                      </div>
                    )}
                    {bmInfo.uptime && (
                      <div className="bg-ink-850 p-2.5">
                        <span className="tac-label !text-[9px]">UPTIME</span>
                        <div className="text-fg font-mono tabular-nums mt-1">{Math.floor(bmInfo.uptime / 60)} 分钟</div>
                      </div>
                    )}
                  </div>
                )}

                {/* 如果没有任何详细信息 */}
                {!bmInfo.description && !server.description && !bmInfo.modded && !bmInfo.pve && !bmInfo.entityCount && !bmInfo.uptime && (
                  <div className="text-center text-fg-mute py-4 text-xs">
                    该服务器未在 Battlemetrics 上注册
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-fg-mute py-4 text-xs">
                该服务器未在 Battlemetrics 上注册
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ServerCard;
