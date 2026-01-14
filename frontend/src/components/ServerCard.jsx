import { useState, useEffect } from 'react';
import {
  FaServer, FaUsers, FaClock, FaTrash, FaPlug, FaPowerOff, FaMapMarkedAlt,
  FaCircle, FaSun, FaMoon, FaSignal, FaTachometerAlt, FaCalendarAlt,
  FaCubes, FaTrophy, FaChevronDown, FaChevronUp, FaSkull, FaHeart,
  FaMapMarkerAlt
} from 'react-icons/fa';
import socketService from '../services/socket';
import { getBattlemetricsInfo } from '../services/api';
import { useToast } from './Toast';
import { formatGameTime, isDaytime, formatTimeAgo } from '../utils/time';

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

  const getPlayerBarColor = (percentage) => {
    if (percentage >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (percentage >= 70) return 'bg-gradient-to-r from-orange-500 to-orange-600';
    if (percentage >= 50) return 'bg-gradient-to-r from-yellow-500 to-yellow-600';
    return 'bg-gradient-to-r from-green-500 to-green-600';
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

  return (
    <div
      className={`relative overflow-hidden rounded-xl transition-all duration-300 bg-gradient-to-br from-gray-900 via-rust-dark to-black border ${
        isActive
          ? 'border-rust-orange shadow-xl shadow-rust-orange/30'
          : 'border-white/5 hover:border-white/10'
      }`}
      onClick={() => onSelect(server)}
    >
      {/* 顶部状态条 */}
      <div className={`absolute top-0 left-0 right-0 h-1 z-10 ${
        server.connected
          ? 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500 animate-pulse'
          : 'bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600'
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
                className="w-24 h-24 rounded-lg object-cover border-2 border-white/10 shadow-lg"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-rust-orange to-orange-600 flex items-center justify-center border-2 border-white/10 shadow-lg">
                <FaServer className="text-4xl text-white" />
              </div>
            )}
          </div>

          {/* 右侧：服务器信息 */}
          <div className="flex-1 min-w-0">
            {/* 第一行：服务器名 + 状态徽章 */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="font-bold text-xl text-white truncate drop-shadow-lg">
                {server.name}
              </h3>
              {server.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                  <FaCircle className="text-[6px] animate-pulse" />
                  在线
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
                  <FaCircle className="text-[6px]" />
                  离线
                </span>
              )}
              {teamInfo && getOnlineTeamCount() > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  👥 {getOnlineTeamCount()}人在线
                </span>
              )}
            </div>

            {/* 第二行：IP端口 */}
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
              <FaSignal className="text-gray-500" />
              <span className="font-mono">{server.ip}:{server.port}</span>
            </div>

            {/* 第三行：玩家进度条 */}
            {server.connected && serverInfo && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <FaUsers className="text-rust-orange" />
                    在线玩家
                  </span>
                  <span className="text-sm font-bold text-white">
                    {serverInfo.players}<span className="text-gray-500">/{serverInfo.maxPlayers}</span>
                    <span className="text-xs ml-1 text-gray-400">({percentage}%)</span>
                  </span>
                </div>
                <div className="relative h-2 bg-black/40 rounded-full overflow-hidden">
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
              className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all backdrop-blur-sm border border-red-500/20"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(server.id);
              }}
              title="删除服务器"
            >
              <FaTrash className="text-sm" />
            </button>
          </div>
        </div>

        {/* 三列布局：服务器详情 | 实时状态 | 队友列表 */}
        {server.connected && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* 列1：服务器详情 */}
            <div className="bg-black/20 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-3 text-rust-orange font-bold text-sm">
                <FaServer />
                <span>服务器详情</span>
              </div>
              <div className="space-y-2 text-xs">
                {serverInfo && (
                  <>
                    <div className="flex items-center gap-2 text-gray-300">
                      <FaMapMarkedAlt className="text-gray-500" />
                      <span>{serverInfo.map || 'Unknown'}</span>
                    </div>
                    {bmInfo && bmInfo.mapSize && (
                      <>
                        <div className="flex items-center gap-2 text-gray-300">
                          <FaCubes className="text-gray-500" />
                          <span>地图大小: {bmInfo.mapSize}</span>
                        </div>
                        {bmInfo.lastWipe && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <FaCalendarAlt className="text-gray-500" />
                            <span>清档: {formatTimeAgo(bmInfo.lastWipe)}</span>
                          </div>
                        )}
                        {bmInfo.fps && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <FaTachometerAlt className="text-gray-500" />
                            <span>FPS: {bmInfo.fps}</span>
                          </div>
                        )}
                        {bmInfo.rank && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <FaTrophy className="text-gray-500" />
                            <span>排名: #{bmInfo.rank}</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 列2：实时状态 */}
            <div className="bg-black/20 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-3 text-rust-orange font-bold text-sm">
                <FaClock />
                <span>实时状态</span>
              </div>
              <div className="space-y-2 text-xs">
                {timeInfo && (
                  <div className="flex items-center gap-2 text-gray-300">
                    {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                      <FaSun className="text-yellow-400" />
                    ) : (
                      <FaMoon className="text-blue-400" />
                    )}
                    <span>游戏时间: {formatGameTime(timeInfo.time)}</span>
                  </div>
                )}
                {serverInfo && (
                  <>
                    <div className="flex items-center gap-2 text-gray-300">
                      <FaUsers className="text-gray-500" />
                      <span>在线: {serverInfo.players}/{serverInfo.maxPlayers}</span>
                    </div>
                    {serverInfo.queuedPlayers > 0 && (
                      <div className="flex items-center gap-2 text-gray-300">
                        <FaClock className="text-gray-500" />
                        <span>排队: {serverInfo.queuedPlayers}人</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 列3：队友列表 */}
            <div className="bg-black/20 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-3 text-rust-orange font-bold text-sm">
                <FaUsers />
                <span>队友状态</span>
              </div>
              <div className="space-y-2 text-xs max-h-24 overflow-y-auto">
                {teamInfo && teamInfo.members && teamInfo.members.length > 0 ? (
                  teamInfo.members.map((member, index) => (
                    <div key={index} className="flex items-center gap-2 text-gray-300">
                      {member.isOnline ? (
                        member.isAlive ? (
                          <FaHeart className="text-green-400 flex-shrink-0" />
                        ) : (
                          <FaSkull className="text-red-400 flex-shrink-0" />
                        )
                      ) : (
                        <FaCircle className="text-gray-600 flex-shrink-0 text-[6px]" />
                      )}
                      <span className="truncate">{member.name}</span>
                      {member.isOnline && member.x !== undefined && member.y !== undefined && (
                        <span className="text-gray-500 text-[10px] ml-auto">
                          <FaMapMarkerAlt className="inline" />
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">暂无队友信息</div>
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
              className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-rust-orange to-orange-600 text-white shadow-lg shadow-rust-orange/30 hover:shadow-rust-orange/50 hover:scale-105 active:scale-95'
              }`}
              onClick={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <>
                  <FaPlug className="animate-pulse" />
                  连接中...
                </>
              ) : (
                <>
                  <FaPlug />
                  连接服务器
                </>
              )}
            </button>
          ) : (
            <button
              className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'
              }`}
              onClick={handleDisconnect}
              disabled={loading}
            >
              <FaPowerOff />
              断开连接
            </button>
          )}

          {/* 查看详情按钮 */}
          {server.connected && (
            <button
              className="py-2 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? (
                <>
                  <FaChevronUp />
                  收起详情
                </>
              ) : (
                <>
                  <FaChevronDown />
                  查看详情
                </>
              )}
            </button>
          )}
        </div>

        {/* 展开的详情区域 */}
        {showDetails && server.connected && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
            {loadingBM ? (
              <div className="text-center text-gray-400 py-4">
                加载 Battlemetrics 信息中...
              </div>
            ) : bmInfo && Object.keys(bmInfo).length > 0 ? (
              <>
                {/* 服务器描述 */}
                {(bmInfo.description || server.description) && (
                  <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                    <div className="text-rust-orange font-bold text-sm mb-2">服务器描述</div>
                    <div className="text-xs text-gray-300 whitespace-pre-wrap">
                      {bmInfo.description || server.description}
                    </div>
                  </div>
                )}

                {/* 详细信息 */}
                {(bmInfo.modded !== undefined || bmInfo.pve !== undefined || bmInfo.entityCount || bmInfo.uptime) && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {bmInfo.modded !== undefined && (
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <span className="text-gray-500">模式: </span>
                        <span className="text-white">{bmInfo.modded ? '模组服' : '原版'}</span>
                      </div>
                    )}
                    {bmInfo.pve !== undefined && (
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <span className="text-gray-500">PVE: </span>
                        <span className="text-white">{bmInfo.pve ? '是' : '否'}</span>
                      </div>
                    )}
                    {bmInfo.entityCount && (
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <span className="text-gray-500">实体数: </span>
                        <span className="text-white">{bmInfo.entityCount.toLocaleString()}</span>
                      </div>
                    )}
                    {bmInfo.uptime && (
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <span className="text-gray-500">运行时间: </span>
                        <span className="text-white">{Math.floor(bmInfo.uptime / 60)}分钟</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 如果没有任何详细信息 */}
                {!bmInfo.description && !server.description && !bmInfo.modded && !bmInfo.pve && !bmInfo.entityCount && !bmInfo.uptime && (
                  <div className="text-center text-gray-500 py-4">
                    该服务器未在 Battlemetrics 上注册
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-500 py-4">
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
