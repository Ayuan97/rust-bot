import { useState, useEffect } from 'react';
import { FaUsers, FaClock, FaSun, FaMoon, FaDownload, FaCopy, FaMapMarkedAlt, FaImage } from 'react-icons/fa';
import socketService from '../services/socket';

function ServerInfo({ serverId }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [timeInfo, setTimeInfo] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    fetchAllInfo();
    const interval = setInterval(fetchAllInfo, 30000); // 每30秒刷新

    return () => clearInterval(interval);
  }, [serverId]);

  const fetchAllInfo = async () => {
    try {
      console.log(`📊 开始获取服务器信息: ${serverId}`);

      const [server, team, time] = await Promise.all([
        socketService.getServerInfo(serverId),
        socketService.getTeamInfo(serverId),
        socketService.getTime(serverId)
      ]);

      console.log('✅ 服务器信息获取成功:', { server, team, time });

      setServerInfo(server);
      setTeamInfo(team);
      setTimeInfo(time);
    } catch (error) {
      console.error('❌ 获取服务器信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMapImage = async () => {
    if (mapData) {
      setShowMap(!showMap);
      return;
    }

    setLoadingMap(true);
    try {
      console.log('📥 加载地图数据...');
      const map = await socketService.getMap(serverId);
      console.log('✅ 地图数据加载成功:', map);

      if (map && map.jpgImage) {
        // 将 base64 数据转换为图片URL
        const imageUrl = `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(map.jpgImage)))}`;
        setMapData({ ...map, imageUrl });
        setShowMap(true);
      }
    } catch (error) {
      console.error('❌ 加载地图失败:', error);
      alert('地图加载失败：' + (error.message || error.error || '未知错误'));
    } finally {
      setLoadingMap(false);
    }
  };

  const downloadMap = () => {
    if (!mapData || !mapData.imageUrl) return;

    const link = document.createElement('a');
    link.href = mapData.imageUrl;
    link.download = `${serverInfo?.map || 'map'}_${Date.now()}.jpg`;
    link.click();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板！');
  };

  const formatTime = (time) => {
    if (time === undefined) return '--:--';
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const isDaytime = (time, sunrise = 6, sunset = 18) => {
    if (time === undefined) return true;
    return time >= sunrise && time < sunset;
  };

  if (loading) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-4">
      {/* 实时状态 */}
      {serverInfo && (
        <div className="card">
          <h3 className="text-lg font-bold mb-3">实时状态</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
              <FaUsers className="text-rust-orange text-2xl" />
              <div>
                <p className="text-sm text-gray-400">在线玩家</p>
                <p className="text-xl font-semibold">
                  {serverInfo.players} / {serverInfo.maxPlayers}
                </p>
              </div>
            </div>

            {timeInfo && (
              <>
                <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
                  {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                    <FaSun className="text-yellow-400 text-2xl" />
                  ) : (
                    <FaMoon className="text-blue-400 text-2xl" />
                  )}
                  <div>
                    <p className="text-sm text-gray-400">游戏时间</p>
                    <p className="text-xl font-semibold">
                      {formatTime(timeInfo.time)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
                  <FaClock className="text-rust-orange text-2xl" />
                  <div>
                    <p className="text-sm text-gray-400">昼夜状态</p>
                    <p className="text-lg font-semibold">
                      {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? '☀️ 白天' : '🌙 夜晚'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
                  <FaMapMarkedAlt className="text-rust-orange text-2xl" />
                  <div>
                    <p className="text-sm text-gray-400">地图</p>
                    <p className="text-lg font-semibold truncate">{serverInfo.map}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 地图 */}
      {serverInfo && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <FaMapMarkedAlt className="text-rust-orange" />
              服务器地图
            </h3>
            <button
              onClick={loadMapImage}
              disabled={loadingMap}
              className="btn btn-sm btn-secondary flex items-center gap-2"
            >
              <FaImage />
              {loadingMap ? '加载中...' : showMap ? '隐藏地图' : '显示地图'}
            </button>
          </div>

          {showMap && mapData && (
            <div className="relative">
              <img
                src={mapData.imageUrl}
                alt="Server Map"
                className="w-full rounded-lg border-2 border-rust-gray"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={downloadMap}
                  className="btn btn-sm btn-primary shadow-lg flex items-center gap-2"
                >
                  <FaDownload />
                  下载地图
                </button>
              </div>

              {/* 地图信息叠加 */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {mapData.size && (
                  <div className="p-2 bg-rust-gray rounded">
                    <span className="text-gray-400">大小：</span>
                    <span className="font-semibold">{mapData.size}m</span>
                  </div>
                )}
                {mapData.seed && (
                  <div className="p-2 bg-rust-gray rounded">
                    <span className="text-gray-400">种子：</span>
                    <span className="font-semibold font-mono">{mapData.seed}</span>
                    <button
                      onClick={() => copyToClipboard(mapData.seed.toString())}
                      className="ml-2 text-rust-orange hover:text-rust-orange/80"
                    >
                      <FaCopy className="inline" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 队伍信息 */}
      {teamInfo && teamInfo.members && teamInfo.members.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <FaUsers className="text-rust-orange" />
            队伍成员 ({teamInfo.members.length})
          </h3>
          <div className="space-y-2">
            {teamInfo.members.map((member) => (
              <div
                key={member.steamId}
                className="p-3 bg-rust-gray rounded-lg flex items-center justify-between hover:bg-rust-gray/80 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{member.name}</p>
                  <p className="text-xs text-gray-400 truncate font-mono">
                    {member.steamId}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {member.isAlive !== undefined && (
                    <span className={`text-xs px-2 py-1 rounded font-semibold ${member.isAlive ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                      {member.isAlive ? '✅ 存活' : '💀 死亡'}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className={`status-dot ${
                        member.isOnline ? 'status-online' : 'status-offline'
                      }`}
                    />
                    <span className="text-sm text-gray-400">
                      {member.isOnline ? '在线' : '离线'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ServerInfo;
