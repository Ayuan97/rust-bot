import { useState, useEffect } from 'react';
import { FaUsers, FaClock, FaMap, FaSun, FaMoon, FaDownload, FaCopy, FaServer, FaMapMarkedAlt, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import socketService from '../services/socket';
import { getServer, getBattlemetricsInfo } from '../services/api';

function ServerInfo({ serverId }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [timeInfo, setTimeInfo] = useState(null);
  const [serverConfig, setServerConfig] = useState(null);
  const [bmInfo, setBmInfo] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);
  const [showMapImage, setShowMapImage] = useState(false);

  useEffect(() => {
    fetchAllInfo();

    // 每30秒刷新实时数据（Rust+ API）
    const realtimeInterval = setInterval(() => {
      fetchRealtimeInfo();
    }, 30000);

    // 每60秒刷新 Battlemetrics 数据
    const bmInterval = setInterval(() => {
      fetchBattlemetricsInfo();
    }, 60000);

    return () => {
      clearInterval(realtimeInterval);
      clearInterval(bmInterval);
    };
  }, [serverId]);

  const fetchAllInfo = async () => {
    try {
      console.log(`📊 开始获取服务器信息: ${serverId}`);

      const configPromise = getServer(serverId).then(res => res.data.server);

      const [server, team, time, config] = await Promise.all([
        socketService.getServerInfo(serverId),
        socketService.getTeamInfo(serverId),
        socketService.getTime(serverId),
        configPromise
      ]);

      console.log('✅ 服务器信息获取成功:', { server, team, time, config });

      setServerInfo(server);
      setTeamInfo(team);
      setTimeInfo(time);
      setServerConfig(config);

      // 获取 Battlemetrics 信息
      try {
        const bmResponse = await getBattlemetricsInfo(serverId);
        if (bmResponse.data.success) {
          setBmInfo(bmResponse.data.data);
        }
      } catch (error) {
        console.error('❌ 获取 Battlemetrics 信息失败:', error);
      }

      // 预加载地图
      loadMapData();
    } catch (error) {
      console.error('❌ 获取服务器信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRealtimeInfo = async () => {
    try {
      const [server, team, time] = await Promise.all([
        socketService.getServerInfo(serverId),
        socketService.getTeamInfo(serverId),
        socketService.getTime(serverId)
      ]);

      setServerInfo(server);
      setTeamInfo(team);
      setTimeInfo(time);
    } catch (error) {
      console.error('❌ 刷新实时信息失败:', error);
    }
  };

  const fetchBattlemetricsInfo = async () => {
    try {
      const bmResponse = await getBattlemetricsInfo(serverId);
      if (bmResponse.data.success) {
        setBmInfo(bmResponse.data.data);
        console.log('✅ Battlemetrics 数据已更新');
      }
    } catch (error) {
      console.error('❌ 刷新 Battlemetrics 信息失败:', error);
    }
  };

  const loadMapData = async () => {
    if (mapData) return;

    setLoadingMap(true);
    try {
      console.log('📥 预加载地图数据...');
      const map = await socketService.getMap(serverId);
      console.log('✅ 地图数据加载成功');

      if (map && map.jpgImage) {
        // 保存原始二进制数据用于下载
        const imageUrl = `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(map.jpgImage)))}`;
        setMapData({
          ...map,
          imageUrl,
          rawData: map.jpgImage // 保存原始数据
        });
      }
    } catch (error) {
      console.error('❌ 加载地图失败:', error);
      // 静默失败，不影响其他功能
    } finally {
      setLoadingMap(false);
    }
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
      {/* 服务器宣传图 */}
      {serverConfig && serverConfig.img && (
        <div className="relative overflow-hidden rounded-xl shadow-2xl">
          {/* 超大横幅宣传图 - 全屏宽度，自适应高度 */}
          <img
            src={serverConfig.img}
            alt={serverConfig.name}
            className="w-full h-auto max-h-96 object-contain bg-rust-dark"
          />

          {/* 底部渐变遮罩 + 信息层 */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-6 pb-4">
            <div className="flex items-end gap-4 mb-4">
              {/* 小 Logo (如果有且不是数字) */}
              {serverConfig.logo && serverConfig.logo !== '1' && serverConfig.logo.startsWith('http') && (
                <img
                  src={serverConfig.logo}
                  alt="Logo"
                  className="w-16 h-16 rounded-lg border-2 border-rust-orange shadow-xl object-cover"
                />
              )}

              <div className="flex-1 min-w-0">
                <h2 className="text-4xl font-black mb-2 text-white drop-shadow-2xl">
                  {serverConfig.name}
                </h2>

                {serverConfig.description && (
                  <p className="text-sm text-gray-100 line-clamp-2 whitespace-pre-wrap drop-shadow-lg">
                    {serverConfig.description.replace(/\\n/g, '\n').replace(/\\t/g, '  ')}
                  </p>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => copyToClipboard(`${serverConfig.ip}:${serverConfig.port}`)}
                className="btn btn-primary btn-sm flex items-center gap-2 shadow-lg"
              >
                <FaCopy />
                复制地址
              </button>
              {serverConfig.url && (
                <a
                  href={serverConfig.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm flex items-center gap-2 shadow-lg"
                >
                  <FaServer />
                  访问网站
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 连接信息 */}
      {serverConfig && (
        <div className="card">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <FaServer className="text-rust-orange" />
            连接信息
          </h3>
          <div className="flex items-center justify-between p-3 bg-rust-gray rounded-lg">
            <div>
              <p className="text-sm text-gray-400">服务器地址</p>
              <p className="font-mono font-semibold">{serverConfig.ip}:{serverConfig.port}</p>
            </div>
            <button
              onClick={() => copyToClipboard(`client.connect ${serverConfig.ip}:${serverConfig.port}`)}
              className="btn btn-sm btn-secondary"
            >
              <FaCopy />
            </button>
          </div>
        </div>
      )}

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

            <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
              <FaMap className="text-rust-orange text-2xl" />
              <div>
                <p className="text-sm text-gray-400">地图</p>
                <p className="text-lg font-semibold truncate">{serverInfo.map}</p>
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
                      {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? '白天' : '夜晚'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 地图信息 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FaMapMarkedAlt className="text-rust-orange" />
            服务器地图
          </h3>
          <div className="flex gap-2">
            {bmInfo && bmInfo.mapDownloadUrl && (
              <a
                href={bmInfo.mapDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-primary flex items-center gap-2"
              >
                <FaDownload />
                下载地图
              </a>
            )}
            <button
              onClick={() => setShowMapImage(!showMapImage)}
              disabled={loadingMap}
              className="btn btn-sm btn-secondary flex items-center gap-2"
            >
              {showMapImage ? <FaChevronUp /> : <FaChevronDown />}
              {loadingMap ? '加载中...' : showMapImage ? '收起' : '展开'}
            </button>
          </div>
        </div>

        {/* 地图信息 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {serverInfo?.map && (
            <div className="p-3 bg-rust-gray rounded-lg">
              <p className="text-sm text-gray-400">地图名称</p>
              <p className="font-semibold">{serverInfo.map}</p>
            </div>
          )}
          {mapData?.size && (
            <div className="p-3 bg-rust-gray rounded-lg">
              <p className="text-sm text-gray-400">地图大小</p>
              <p className="font-semibold">{mapData.size}m</p>
            </div>
          )}
          {mapData?.seed && (
            <div className="p-3 bg-rust-gray rounded-lg col-span-2">
              <p className="text-sm text-gray-400">地图种子</p>
              <div className="flex items-center justify-between">
                <p className="font-semibold font-mono">{mapData.seed}</p>
                <button
                  onClick={() => copyToClipboard(mapData.seed.toString())}
                  className="btn btn-sm btn-secondary"
                >
                  <FaCopy />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 地图图片 */}
        {showMapImage && mapData && (
          <div className="relative">
            <img
              src={mapData.imageUrl}
              alt="Server Map"
              className="w-full rounded-lg border-2 border-rust-gray"
            />
          </div>
        )}

        {!mapData && !loadingMap && (
          <p className="text-center text-gray-400 py-4">地图加载失败</p>
        )}
      </div>

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
                  <p className="text-xs text-gray-400 truncate">
                    Steam ID: {member.steamId}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {member.isAlive !== undefined && (
                    <span className={`text-xs px-2 py-1 rounded ${member.isAlive ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                      {member.isAlive ? '存活' : '死亡'}
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

      {/* 在线玩家列表 (Battlemetrics) */}
      {bmInfo && bmInfo.onlinePlayers && bmInfo.onlinePlayers.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <FaUsers className="text-rust-orange" />
            在线玩家 ({bmInfo.onlinePlayers.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
            {bmInfo.onlinePlayers.map((player) => (
              <div
                key={player.id}
                className="p-2 bg-rust-gray rounded-lg hover:bg-rust-gray/80 transition-colors"
              >
                <p className="font-medium text-sm truncate">{player.name}</p>
                <p className="text-xs text-gray-500">ID: {player.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ServerInfo;
