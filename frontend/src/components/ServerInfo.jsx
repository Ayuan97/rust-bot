import { useState, useEffect } from 'react';
import { FaUsers, FaClock, FaMap, FaSun, FaMoon, FaDownload, FaCopy, FaServer, FaMapMarkedAlt, FaImage } from 'react-icons/fa';
import socketService from '../services/socket';
import { getServer } from '../services/api';

function ServerInfo({ serverId }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [timeInfo, setTimeInfo] = useState(null);
  const [serverConfig, setServerConfig] = useState(null); // 数据库中的服务器配置
  const [loading, setLoading] = useState(true);
  const [showMapImage, setShowMapImage] = useState(false);

  useEffect(() => {
    fetchAllInfo();
    const interval = setInterval(fetchAllInfo, 30000); // 每30秒刷新

    return () => clearInterval(interval);
  }, [serverId]);

  const fetchAllInfo = async () => {
    try {
      console.log(`📊 开始获取服务器信息: ${serverId}`);

      // 获取数据库中的服务器配置（包含 img, logo, url 等）
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
    } catch (error) {
      console.error('❌ 获取服务器信息失败:', error);
      console.error('   错误详情:', error.message);
      console.error('   Stack:', error.stack);
    } finally {
      setLoading(false);
    }
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板！');
  };

  const downloadServerInfo = () => {
    if (!serverConfig) return;

    const content = `服务器名称: ${serverConfig.name}
服务器地址: ${serverConfig.ip}:${serverConfig.port}
Steam ID: ${serverConfig.player_id}
Token: ${serverConfig.player_token}

连接命令:
client.connect ${serverConfig.ip}:${serverConfig.port}

${serverConfig.description ? `描述:\n${serverConfig.description}` : ''}
${serverConfig.url ? `\n网站: ${serverConfig.url}` : ''}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serverConfig.name.replace(/[^a-zA-Z0-9]/g, '_')}_info.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadMapImage = async () => {
    if (!serverInfo?.map) return;

    try {
      // 构建地图 URL（假设从 serverInfo 或其他来源获取）
      const mapUrl = serverInfo.mapUrl || serverConfig?.url;
      if (mapUrl) {
        window.open(mapUrl, '_blank');
      } else {
        alert('地图图片不可用');
      }
    } catch (error) {
      console.error('下载地图失败:', error);
      alert('下载失败');
    }
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
      {/* 服务器头图和Logo */}
      {serverConfig && (serverConfig.img || serverConfig.logo) && (
        <div className="card relative overflow-hidden">
          {/* 背景图片 */}
          {serverConfig.img && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm"
              style={{ backgroundImage: `url(${serverConfig.img})` }}
            />
          )}

          <div className="relative z-10 p-6">
            <div className="flex items-start gap-6">
              {/* Logo */}
              {(serverConfig.img || serverConfig.logo) && (
                <div className="flex-shrink-0">
                  <img
                    src={serverConfig.img || serverConfig.logo}
                    alt={serverConfig.name}
                    className="w-32 h-32 rounded-xl object-cover border-4 border-rust-orange shadow-2xl"
                  />
                </div>
              )}

              {/* 服务器基本信息 */}
              <div className="flex-1 min-w-0">
                <h2 className="text-3xl font-bold mb-2 truncate">{serverConfig.name}</h2>

                {serverConfig.description && (
                  <p className="text-sm text-gray-300 mb-4 line-clamp-3">
                    {serverConfig.description.replace(/\\n/g, '\n')}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copyToClipboard(`${serverConfig.ip}:${serverConfig.port}`)}
                    className="btn btn-secondary btn-sm flex items-center gap-2"
                  >
                    <FaCopy />
                    复制地址
                  </button>
                  <button
                    onClick={downloadServerInfo}
                    className="btn btn-secondary btn-sm flex items-center gap-2"
                  >
                    <FaDownload />
                    下载信息
                  </button>
                  {serverConfig.url && (
                    <a
                      href={serverConfig.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm flex items-center gap-2"
                    >
                      <FaServer />
                      访问网站
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 服务器连接信息 */}
      {serverConfig && (
        <div className="card">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <FaServer className="text-rust-orange" />
            连接信息
          </h3>
          <div className="space-y-2">
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
      {serverInfo && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <FaMapMarkedAlt className="text-rust-orange" />
              地图信息
            </h3>
            {serverInfo.mapUrl && (
              <button
                onClick={() => setShowMapImage(!showMapImage)}
                className="btn btn-sm btn-secondary"
              >
                <FaImage className="mr-2" />
                {showMapImage ? '隐藏地图' : '显示地图'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-rust-gray rounded-lg">
              <div>
                <p className="text-sm text-gray-400">地图名称</p>
                <p className="font-semibold">{serverInfo.map || 'Procedural Map'}</p>
              </div>
            </div>

            {serverInfo.size && (
              <div className="flex items-center justify-between p-3 bg-rust-gray rounded-lg">
                <div>
                  <p className="text-sm text-gray-400">地图大小</p>
                  <p className="font-semibold">{serverInfo.size}m</p>
                </div>
              </div>
            )}

            {showMapImage && serverInfo.mapUrl && (
              <div className="relative">
                <img
                  src={serverInfo.mapUrl}
                  alt="Server Map"
                  className="w-full rounded-lg border-2 border-rust-gray"
                />
                <button
                  onClick={downloadMapImage}
                  className="absolute top-2 right-2 btn btn-sm btn-primary shadow-lg"
                >
                  <FaDownload className="mr-2" />
                  下载地图
                </button>
              </div>
            )}
          </div>
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
    </div>
  );
}

export default ServerInfo;
