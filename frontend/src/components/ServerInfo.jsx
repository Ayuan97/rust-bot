import { useState, useEffect } from 'react';
import { FaUsers, FaClock, FaMap, FaSun, FaMoon, FaDownload, FaCopy, FaServer, FaMapMarkedAlt, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import socketService from '../services/socket';
import { getServer, getBattlemetricsInfo } from '../services/api';
import { useToast } from './Toast';
import { formatGameTime, isDaytime } from '../utils/time';
import { ServerInfoSkeleton } from './Skeleton';

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

  const toast = useToast();

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
        try {
          // jpgImage 现在是 base64 字符串
          const imageUrl = `data:image/jpeg;base64,${map.jpgImage}`;
          setMapData({
            ...map,
            imageUrl,
            rawData: map.jpgImage // 保存原始 base64 数据
          });
        } catch (conversionError) {
          console.error('❌ 地图数据转换失败:', conversionError);
          // 静默失败，不影响其他功能，但不设置 mapData
        }
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
    toast.success('已复制到剪贴板');
  };

  if (loading) {
    return <ServerInfoSkeleton />;
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
        <div className="panel p-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FaServer className="text-rust-accent" />
            Connection Info
          </h3>
          <div className="flex items-center justify-between p-3 bg-dark-900/50 border border-black/20 rounded-lg group">
            <div>
              <p className="text-xs text-gray-500 mb-1">Server Address</p>
              <p className="font-mono font-bold text-gray-200">{serverConfig.ip}:{serverConfig.port}</p>
            </div>
            <button
              onClick={() => copyToClipboard(`client.connect ${serverConfig.ip}:${serverConfig.port}`)}
              className="btn btn-sm btn-secondary opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <FaCopy /> Connect
            </button>
          </div>
        </div>
      )}

      {/* 实时状态 */}
      {serverInfo && (
        <div className="panel p-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Live Status</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <FaUsers className="text-rust-accent" />
                <span className="text-xs text-gray-500">Players</span>
              </div>
              <p className="text-xl font-bold text-white">
                {serverInfo.players} <span className="text-sm text-gray-500">/ {serverInfo.maxPlayers}</span>
              </p>
            </div>

            <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <FaMap className="text-blue-500" />
                <span className="text-xs text-gray-500">Map</span>
              </div>
              <p className="text-lg font-bold text-white truncate" title={serverInfo.map}>{serverInfo.map}</p>
            </div>

            {timeInfo && (
              <>
                <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <FaClock className="text-gray-400" />
                    <span className="text-xs text-gray-500">Time</span>
                  </div>
                  <p className="text-xl font-bold text-white font-mono">
                    {formatGameTime(timeInfo.time)}
                  </p>
                </div>
                
                 <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                     {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                    <FaSun className="text-yellow-500" />
                  ) : (
                    <FaMoon className="text-purple-400" />
                  )}
                    <span className="text-xs text-gray-500">Cycle</span>
                  </div>
                  <p className="text-lg font-bold text-white">
                    {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? 'Day' : 'Night'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 地图信息 */}
      <div className="panel p-4">
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
            <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5">
              <p className="text-xs text-gray-500">Map Name</p>
              <p className="font-semibold text-gray-200">{serverInfo.map}</p>
            </div>
          )}
          {mapData?.size && (
            <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5">
              <p className="text-xs text-gray-500">Map Size</p>
              <p className="font-semibold text-gray-200">{mapData.size}m</p>
            </div>
          )}
          {mapData?.seed && (
            <div className="p-3 bg-dark-900/30 rounded-lg border border-white/5 col-span-2">
              <p className="text-xs text-gray-500">Seed</p>
              <div className="flex items-center justify-between">
                <p className="font-semibold font-mono text-gray-200">{mapData.seed}</p>
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
              className="w-full rounded-lg border border-white/10"
            />
          </div>
        )}

        {!mapData && !loadingMap && (
          <p className="text-center text-gray-400 py-4">地图加载失败</p>
        )}
      </div>

      {/* 队伍信息 */}
      {teamInfo && teamInfo.members && teamInfo.members.length > 0 && (
        <div className="panel p-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FaUsers className="text-rust-accent" />
            Team Members ({teamInfo.members.length})
          </h3>
          <div className="space-y-2">
            {teamInfo.members.map((member) => (
              <div
                key={member.steamId}
                className="p-3 bg-dark-900/30 border border-white/5 rounded-lg flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-gray-200">{member.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    ID: {member.steamId}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {member.isAlive !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        member.isAlive 
                        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {member.isAlive ? 'Alive' : 'Dead'}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                        member.isOnline ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-dark-600'
                      }`} 
                    />
                    <span className="text-xs text-gray-500">
                      {member.isOnline ? 'Online' : 'Offline'}
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
        <div className="panel p-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FaUsers className="text-rust-accent" />
            Online Players ({bmInfo.onlinePlayers.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
            {bmInfo.onlinePlayers.map((player) => (
              <div
                key={player.id}
                className="p-2 bg-dark-900/30 border border-white/5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <p className="font-medium text-xs truncate text-gray-300">{player.name}</p>
                <p className="text-[10px] text-gray-600">ID: {player.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ServerInfo;
