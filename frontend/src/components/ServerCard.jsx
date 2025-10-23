import { useState, useEffect } from 'react';
import { FaServer, FaUsers, FaClock, FaTrash, FaPlug, FaPowerOff, FaMapMarkedAlt, FaCircle, FaSun, FaMoon, FaSignal } from 'react-icons/fa';
import socketService from '../services/socket';

function ServerCard({ server, onDelete, onSelect, isActive }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [timeInfo, setTimeInfo] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (server.connected && isActive) {
      fetchAllInfo();
      const interval = setInterval(fetchAllInfo, 30000);
      return () => clearInterval(interval);
    }
  }, [server.connected, isActive]);

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

  const formatTime = (time) => {
    if (!time) return '--:--';
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const isDaytime = (time, sunrise = 6, sunset = 18) => {
    if (!time) return true;
    return time >= sunrise && time < sunset;
  };

  const getOnlineTeamCount = () => {
    if (!teamInfo || !teamInfo.members) return 0;
    return teamInfo.members.filter(m => m.isOnline).length;
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      await socketService.connectToServer({
        serverId: server.id,
        ip: server.ip,
        port: server.port,
        playerId: server.player_id,
        playerToken: server.player_token
      });
    } catch (error) {
      console.error('连接失败:', error);
      alert('连接失败: ' + error.message);
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
      className={`relative overflow-hidden rounded-2xl transition-all duration-500 cursor-pointer group ${
        isActive ? 'scale-[1.02]' : 'hover:scale-[1.01]'
      }`}
      onClick={() => onSelect(server)}
    >
      {/* 背景图层 - 使用渐变作为占位符 */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-rust-dark to-black">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
      </div>

      {/* 渐变遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />

      {/* 状态指示条 */}
      <div className={`absolute top-0 left-0 right-0 h-1 z-10 ${
        server.connected
          ? 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500'
          : 'bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600'
      }`}>
        <div className={`h-full ${server.connected ? 'animate-pulse' : ''}`} />
      </div>

      {/* 边框 */}
      <div className={`absolute inset-0 rounded-2xl transition-all duration-300 ${
        isActive
          ? 'ring-2 ring-rust-orange ring-offset-2 ring-offset-rust-darker shadow-2xl shadow-rust-orange/40'
          : 'ring-1 ring-white/5 group-hover:ring-white/10'
      }`} />

      <div className="relative z-10 p-5">
        {/* 头部：服务器名称和状态徽章 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {server.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 backdrop-blur-sm">
                  <FaCircle className="text-[6px] animate-pulse" />
                  在线
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30 backdrop-blur-sm">
                  <FaCircle className="text-[6px]" />
                  离线
                </span>
              )}
              {teamInfo && getOnlineTeamCount() > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 backdrop-blur-sm">
                  👥 {getOnlineTeamCount()}人在线
                </span>
              )}
            </div>
            <h3 className="font-bold text-lg mb-1 truncate text-white drop-shadow-lg">
              {server.name}
            </h3>
            <p className="text-xs font-mono text-gray-400 flex items-center gap-2">
              <FaSignal className="text-gray-500" />
              {server.ip}:{server.port}
            </p>
          </div>

          {/* 删除按钮 */}
          <button
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm border border-red-500/20"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(server.id);
            }}
            title="删除服务器"
          >
            <FaTrash className="text-sm" />
          </button>
        </div>

        {/* 服务器详细信息 */}
        {serverInfo && (
          <div className="space-y-3 mb-4">
            {/* 玩家数进度条 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <FaUsers className="text-rust-orange" />
                  在线玩家
                </span>
                <span className="text-sm font-bold text-white">
                  {serverInfo.players}<span className="text-gray-500">/{serverInfo.maxPlayers}</span>
                  <span className="text-xs ml-1 text-gray-400">({percentage}%)</span>
                </span>
              </div>
              <div className="relative h-2 bg-black/40 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className={`h-full transition-all duration-500 ${getPlayerBarColor(percentage)}`}
                  style={{ width: `${percentage}%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
              </div>
            </div>

            {/* 地图和时间信息 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/30 backdrop-blur-sm rounded-lg p-2 border border-white/5">
                <div className="flex items-center gap-1.5 mb-1">
                  <FaMapMarkedAlt className="text-rust-orange text-xs" />
                  <span className="text-xs text-gray-400">地图</span>
                </div>
                <p className="text-xs font-medium text-white truncate" title={serverInfo.map}>
                  {serverInfo.map || 'Unknown'}
                </p>
              </div>

              {timeInfo && (
                <div className="bg-black/30 backdrop-blur-sm rounded-lg p-2 border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                      <FaSun className="text-yellow-400 text-xs" />
                    ) : (
                      <FaMoon className="text-blue-400 text-xs" />
                    )}
                    <span className="text-xs text-gray-400">时间</span>
                  </div>
                  <p className="text-xs font-medium text-white font-mono">
                    {formatTime(timeInfo.time)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 连接/断开按钮 */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {!server.connected ? (
            <button
              className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-rust-orange via-orange-600 to-rust-orange bg-size-200 hover:bg-pos-100 text-white shadow-lg shadow-rust-orange/30 hover:shadow-rust-orange/50 transform hover:scale-[1.02] active:scale-[0.98]'
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
              className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 backdrop-blur-sm ${
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
        </div>
      </div>

      {/* 光晕效果 */}
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-rust-orange/10 via-transparent to-transparent pointer-events-none animate-pulse-slow" />
      )}
    </div>
  );
}

export default ServerCard;
