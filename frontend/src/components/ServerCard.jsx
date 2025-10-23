import { useState, useEffect } from 'react';
import { FaServer, FaUsers, FaClock, FaTrash, FaPlug, FaPowerOff, FaMapMarkedAlt, FaCircle } from 'react-icons/fa';
import socketService from '../services/socket';

function ServerCard({ server, onDelete, onSelect, isActive }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (server.connected && isActive) {
      fetchServerInfo();
      const interval = setInterval(fetchServerInfo, 30000);
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
      className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 cursor-pointer group ${
        isActive
          ? 'border-rust-orange bg-gradient-to-br from-rust-dark to-rust-gray shadow-lg shadow-rust-orange/20'
          : 'border-rust-gray bg-rust-dark hover:border-rust-orange/50 hover:shadow-md'
      }`}
      onClick={() => onSelect(server)}
    >
      {/* 状态指示条 */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${
        server.connected
          ? 'bg-gradient-to-r from-green-500 to-emerald-400'
          : 'bg-gradient-to-r from-gray-600 to-gray-500'
      }`} />

      <div className="p-4">
        {/* 头部：服务器名称和状态 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2.5 rounded-lg ${
              server.connected ? 'bg-green-500/10' : 'bg-gray-500/10'
            }`}>
              <FaServer className={`text-xl ${
                server.connected ? 'text-green-400' : 'text-gray-400'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base mb-1 truncate">{server.name}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <FaCircle className={`text-[6px] ${
                  server.connected ? 'text-green-400 animate-pulse' : 'text-gray-500'
                }`} />
                <span className="font-mono">{server.ip}:{server.port}</span>
              </div>
            </div>
          </div>

          {/* 删除按钮 */}
          <button
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(server.id);
            }}
            title="删除服务器"
          >
            <FaTrash className="text-sm" />
          </button>
        </div>

        {/* 服务器信息 */}
        {serverInfo && (
          <div className="grid grid-cols-2 gap-2 mb-3 p-2.5 bg-black/20 rounded-lg">
            <div className="flex items-center gap-2 text-xs">
              <FaUsers className="text-rust-orange text-sm" />
              <span className="text-gray-300">
                <span className="font-bold text-white">{serverInfo.players}</span>
                <span className="text-gray-500">/{serverInfo.maxPlayers}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <FaMapMarkedAlt className="text-rust-orange text-sm" />
              <span className="text-gray-300 truncate" title={serverInfo.map}>
                {serverInfo.map}
              </span>
            </div>
          </div>
        )}

        {/* 连接/断开按钮 */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {!server.connected ? (
            <button
              className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-rust-gray text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-rust-orange to-orange-600 hover:from-orange-600 hover:to-rust-orange text-white shadow-lg shadow-rust-orange/20 hover:shadow-rust-orange/40 transform hover:scale-105'
              }`}
              onClick={handleConnect}
              disabled={loading}
            >
              <FaPlug className={loading ? 'animate-pulse' : ''} />
              {loading ? '连接中...' : '连接服务器'}
            </button>
          ) : (
            <button
              className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-rust-gray text-gray-400 cursor-not-allowed'
                  : 'bg-rust-gray hover:bg-gray-700 text-gray-300 hover:text-white'
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

      {/* 激活状态光晕效果 */}
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-rust-orange/5 to-transparent pointer-events-none" />
      )}
    </div>
  );
}

export default ServerCard;
