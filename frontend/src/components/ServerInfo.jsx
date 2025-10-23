import { useState, useEffect } from 'react';
import { FaUsers, FaClock, FaMap, FaSun, FaMoon } from 'react-icons/fa';
import socketService from '../services/socket';

function ServerInfo({ serverId }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [teamInfo, setTeamInfo] = useState(null);
  const [timeInfo, setTimeInfo] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="card h-full">
      <h2 className="text-xl font-bold mb-4 pb-3 border-b border-rust-gray">
        服务器信息
      </h2>

      <div className="space-y-4">
        {/* 服务器状态 */}
        {serverInfo && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
              <FaUsers className="text-rust-orange text-xl" />
              <div>
                <p className="text-sm text-gray-400">在线玩家</p>
                <p className="text-lg font-semibold">
                  {serverInfo.players} / {serverInfo.maxPlayers}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
              <FaMap className="text-rust-orange text-xl" />
              <div>
                <p className="text-sm text-gray-400">地图</p>
                <p className="text-lg font-semibold">{serverInfo.map}</p>
              </div>
            </div>

            {timeInfo && (
              <div className="flex items-center gap-3 p-3 bg-rust-gray rounded-lg">
                {isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? (
                  <FaSun className="text-yellow-400 text-xl" />
                ) : (
                  <FaMoon className="text-blue-400 text-xl" />
                )}
                <div>
                  <p className="text-sm text-gray-400">游戏时间</p>
                  <p className="text-lg font-semibold">
                    {formatTime(timeInfo.time)}
                    <span className="text-sm text-gray-400 ml-2">
                      ({isDaytime(timeInfo.time, timeInfo.sunrise, timeInfo.sunset) ? '白天' : '夜晚'})
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 队伍信息 */}
        {teamInfo && teamInfo.members && teamInfo.members.length > 0 && (
          <div className="pt-4 border-t border-rust-gray">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FaUsers className="text-rust-orange" />
              队伍成员 ({teamInfo.members.length})
            </h3>
            <div className="space-y-2">
              {teamInfo.members.map((member) => (
                <div
                  key={member.steamId}
                  className="p-3 bg-rust-gray rounded-lg flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-gray-400">
                      Steam ID: {member.steamId}
                    </p>
                  </div>
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServerInfo;
