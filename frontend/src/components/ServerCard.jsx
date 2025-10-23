import { useState, useEffect } from 'react';
import { FaServer, FaUsers, FaClock, FaTrash, FaPlug, FaPowerOff, FaMapMarkedAlt, FaCircle, FaSun, FaMoon, FaSignal, FaGlobeAmericas } from 'react-icons/fa';
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

  // 使用服务器的 url 作为背景图片，如果没有则使用渐变
  const backgroundStyle = server.url
    ? {
        backgroundImage: `url(${server.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};

  return (
    <div
      className={`relative overflow-hidden rounded-xl transition-all duration-300 cursor-pointer group ${
        isActive ? 'ring-2 ring-rust-orange ring-offset-2 ring-offset-rust-darker shadow-xl shadow-rust-orange/30' : 'hover:shadow-lg'
      }`}
      onClick={() => onSelect(server)}
    >
      {/* 背景层 */}
      <div className="absolute inset-0">
        {server.url ? (
          // 使用地图图片作为背景
          <div
            className="absolute inset-0 bg-cover bg-center blur-sm scale-110"
            style={{ backgroundImage: `url(${server.url})` }}
          />
        ) : (
          // 默认渐变背景
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-rust-dark to-black" />
        )}
        {/* 深色遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/60" />
      </div>

      {/* 状态指示条 */}
      <div className={`absolute top-0 left-0 right-0 h-1 z-10 ${
        server.connected
          ? 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500 animate-pulse'
          : 'bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600'
      }`} />

      {/* 内容区域 */}
      <div className="relative z-10 p-4">
        <div className="flex items-start gap-4">
          {/* 左侧：服务器图标 */}
          <div className="flex-shrink-0">
            {server.img || server.logo ? (
              <img
                src={server.img || server.logo}
                alt={server.name}
                className="w-20 h-20 rounded-lg object-cover border-2 border-white/10 shadow-lg"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-rust-orange to-orange-600 flex items-center justify-center border-2 border-white/10 shadow-lg">
                <FaServer className="text-3xl text-white" />
              </div>
            )}
          </div>

          {/* 中间：服务器信息 */}
          <div className="flex-1 min-w-0">
            {/* 第一行：服务器名称和状态 */}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-lg text-white truncate drop-shadow-lg">
                {server.name}
              </h3>
              {server.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 backdrop-blur-sm">
                  <FaCircle className="text-[6px] animate-pulse" />
                  在线
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30 backdrop-blur-sm">
                  <FaCircle className="text-[6px]" />
                  离线
                </span>
              )}
              {teamInfo && getOnlineTeamCount() > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 backdrop-blur-sm">
                  👥 {getOnlineTeamCount()}人
                </span>
              )}
            </div>

            {/* 第二行：IP端口 */}
            <div className="flex items-center gap-3 mb-2 text-xs text-gray-400">
              <span className="flex items-center gap-1.5 font-mono">
                <FaSignal className="text-gray-500" />
                {server.ip}:{server.port}
              </span>
            </div>

            {/* 第三行：实时数据（仅在连接时显示） */}
            {server.connected && serverInfo && (
              <div className="space-y-2 mb-2">
                {/* 玩家数进度条 */}
                <div>
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
                  <div className="relative h-1.5 bg-black/40 rounded-full overflow-hidden backdrop-blur-sm">
                    <div
                      className={`h-full transition-all duration-500 ${getPlayerBarColor(percentage)}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {/* 地图和时间 */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-gray-300">
                    <FaMapMarkedAlt className="text-rust-orange" />
                    {serverInfo.map || 'Unknown'}
                  </span>
                  {timeInfo && (
                    <span className="flex items-center gap-1 text-gray-300">
                      {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                        <FaSun className="text-yellow-400" />
                      ) : (
                        <FaMoon className="text-blue-400" />
                      )}
                      {formatTime(timeInfo.time)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 服务器描述（如果有） */}
            {server.description && (
              <p className="text-xs text-gray-400 line-clamp-2 mt-2">
                {server.description}
              </p>
            )}
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex flex-col gap-2">
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

            {/* 连接/断开按钮 */}
            <div onClick={(e) => e.stopPropagation()}>
              {!server.connected ? (
                <button
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${
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
                      连接中
                    </>
                  ) : (
                    <>
                      <FaPlug />
                      连接
                    </>
                  )}
                </button>
              ) : (
                <button
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-2 backdrop-blur-sm whitespace-nowrap ${
                    loading
                      ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'
                  }`}
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  <FaPowerOff />
                  断开
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 激活状态光晕 */}
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-rust-orange/10 via-transparent to-transparent pointer-events-none animate-pulse-slow" />
      )}
    </div>
  );
}

export default ServerCard;
