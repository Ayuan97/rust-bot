import { useState, useEffect } from 'react';
import { FaServer, FaUsers, FaClock, FaTrash, FaPlug, FaPowerOff } from 'react-icons/fa';
import socketService from '../services/socket';

function ServerCard({ server, onDelete, onSelect, isActive }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (server.connected && isActive) {
      fetchServerInfo();
      const interval = setInterval(fetchServerInfo, 30000); // 每30秒刷新
      return () => clearInterval(interval);
    }
  }, [server.connected, isActive]);

  const fetchServerInfo = async () => {
    try {
      const info = await socketService.getServerInfo(server.id);
      setServerInfo(info);
    } catch (error) {
      console.error('获取服务器信息失败:', error);
    }
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

  return (
    <div
      className={`card cursor-pointer transition-all hover:border-rust-orange ${
        isActive ? 'border-rust-orange' : ''
      }`}
      onClick={() => onSelect(server)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <FaServer className="text-rust-orange text-xl" />
          <div>
            <h3 className="font-bold text-lg">{server.name}</h3>
            <p className="text-gray-400 text-sm">
              {server.ip}:{server.port}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`status-dot ${
              server.connected ? 'status-online' : 'status-offline'
            }`}
          />
          <span className="text-sm text-gray-400">
            {server.connected ? '在线' : '离线'}
          </span>
        </div>
      </div>

      {serverInfo && (
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <div className="flex items-center gap-2">
            <FaUsers className="text-gray-400" />
            <span>
              {serverInfo.players}/{serverInfo.maxPlayers} 玩家
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FaClock className="text-gray-400" />
            <span>地图: {serverInfo.map}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {!server.connected ? (
          <button
            className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={handleConnect}
            disabled={loading}
          >
            <FaPlug />
            {loading ? '连接中...' : '连接'}
          </button>
        ) : (
          <button
            className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
            onClick={handleDisconnect}
            disabled={loading}
          >
            <FaPowerOff />
            断开
          </button>
        )}
        <button
          className="btn btn-danger flex items-center justify-center"
          onClick={() => onDelete(server.id)}
        >
          <FaTrash />
        </button>
      </div>
    </div>
  );
}

export default ServerCard;
