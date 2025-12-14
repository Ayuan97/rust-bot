import { useState, useEffect, useRef } from 'react';
import {
  FaPlus, FaServer, FaQrcode, FaInfoCircle, FaComments,
  FaGamepad, FaClock, FaHistory, FaCog, FaSignOutAlt, FaPlug, FaWifi
} from 'react-icons/fa';
import socketService from './services/socket';
import { getServers, addServer as apiAddServer, deleteServer as apiDeleteServer } from './services/api';

// Components
import ServerSidebarItem from './components/ServerSidebarItem';
import ChatPanel from './components/ChatPanel';
import DeviceControl from './components/DeviceControl';
import ServerInfo from './components/ServerInfo';
import AddServerModal from './components/AddServerModal';
import PairingPanel from './components/PairingPanel';
import EventsPanel from './components/EventsPanel';
import EventHistoryPanel from './components/EventHistoryPanel';
import PlayerNotifications from './components/PlayerNotifications';

function App() {
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPairingPanel, setShowPairingPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'chat', 'devices', 'events', 'history'
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [hasAutoSelected, setHasAutoSelected] = useState(false); // 记录是否已自动选择
  const [socketConnected, setSocketConnected] = useState(false); // Socket 连接状态

  // 使用 ref 存储 activeServer 最新值，避免事件处理器闭包陈旧
  const activeServerRef = useRef(null);
  useEffect(() => { activeServerRef.current = activeServer; }, [activeServer]);

  // --- Initial Setup & Socket Listeners ---
  useEffect(() => {
    socketService.connect();
    fetchServers();

    // 订阅 Socket 连接状态，断网重连时自动刷新
    const unsubscribe = socketService.onConnectionChange((connected) => {
      setSocketConnected(connected);
      if (connected) {
        // 重连后刷新服务器列表，同步状态
        console.log('🔄 Socket 重连，刷新服务器状态...');
        fetchServers();
      }
    });

    socketService.on('server:connected', handleServerConnected);
    socketService.on('server:disconnected', handleServerDisconnected);
    socketService.on('server:paired', handleServerPaired);

    return () => {
      unsubscribe();
      socketService.removeAllListeners('server:connected');
      socketService.removeAllListeners('server:disconnected');
      socketService.removeAllListeners('server:paired');
      socketService.disconnect();
    };
  }, []);

  // --- Data Fetching ---
  const fetchServers = async () => {
    setLoading(true);
    try {
      const response = await getServers();
      const serverList = response.data.servers;
      setServers(serverList);

      // 只在首次加载且未选择服务器时自动选择第一个
      if (serverList.length > 0 && !activeServer && !hasAutoSelected) {
        setActiveServer(serverList[0]);
        setHasAutoSelected(true);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Event Handlers ---
  const handleServerConnected = (data) => {
    setServers((prev) => {
      const updated = prev.map((s) =>
        s.id === data.serverId ? { ...s, connected: true } : s
      );

      // 使用 ref 获取最新的 activeServer 值
      if (activeServerRef.current?.id === data.serverId) {
        const newActive = updated.find(s => s.id === data.serverId);
        if (newActive) setActiveServer(newActive);
      }

      return updated;
    });
  };

  const handleServerDisconnected = (data) => {
    setServers((prev) => {
      const updated = prev.map((s) =>
        s.id === data.serverId ? { ...s, connected: false } : s
      );

      // 使用 ref 获取最新的 activeServer 值
      if (activeServerRef.current?.id === data.serverId) {
        const newActive = updated.find(s => s.id === data.serverId);
        if (newActive) setActiveServer(newActive);
      }

      return updated;
    });
  };

  const handleServerPaired = (serverInfo) => {
    fetchServers();
    setShowPairingPanel(false);
  };

  const handleAddServer = async (serverData) => {
    await apiAddServer(serverData);
    fetchServers();
  };

  const handleDeleteServer = async (serverId) => {
    if (!confirm('确定要删除这个服务器吗?')) return;
    try {
      await apiDeleteServer(serverId);
      if (activeServer?.id === serverId) setActiveServer(null);
      fetchServers();
    } catch (error) {
      alert('删除失败');
    }
  };

  const handleConnect = async (server) => {
    setConnectionLoading(true);
    try {
      await socketService.connectToServer({
        serverId: server.id,
        ip: server.ip,
        port: server.port,
        playerId: server.player_id,
        playerToken: server.player_token
      });
    } catch (error) {
      alert('连接失败: ' + error.message);
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleDisconnect = async (server) => {
    try {
      await socketService.disconnectFromServer(server.id);
    } catch (error) {
      console.error(error);
    }
  };

  // --- Render Helpers ---
  const renderContent = () => {
    if (!activeServer) return <EmptyState />;
    if (!activeServer.connected) return <DisconnectedState server={activeServer} onConnect={() => handleConnect(activeServer)} loading={connectionLoading} onDelete={() => handleDeleteServer(activeServer.id)} />;

    switch (activeTab) {
      case 'info': return <ServerInfo serverId={activeServer.id} />;
      case 'chat': return <ChatPanel serverId={activeServer.id} />;
      case 'devices': return <DeviceControl serverId={activeServer.id} />;
      case 'events': return <EventsPanel serverId={activeServer.id} />;
      case 'history': return <EventHistoryPanel serverId={activeServer.id} />;
      default: return <ServerInfo serverId={activeServer.id} />;
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 text-gray-200 font-sans overflow-hidden">
      
      {/* --- Sidebar --- */}
      <aside className="w-72 flex flex-col border-r border-white/5 bg-dark-900/50 backdrop-blur-sm">
        {/* Sidebar Header */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rust-accent to-orange-700 flex items-center justify-center shadow-lg shadow-rust-accent/20">
              <FaServer className="text-white text-lg" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">Rust+ Bot</h1>
              <p className="text-xs text-gray-500 font-medium">Command Center</p>
            </div>
          </div>
        </div>

        {/* Server List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          <div className="text-xs font-bold text-gray-600 uppercase tracking-wider px-3 mb-2 mt-2">Servers</div>
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">加载中...</div>
          ) : servers.map(server => (
            <ServerSidebarItem 
              key={server.id} 
              server={server} 
              isActive={activeServer?.id === server.id} 
              onSelect={setActiveServer}
            />
          ))}
          
          {servers.length === 0 && !loading && (
             <div className="p-4 text-center border-2 border-dashed border-dark-700 rounded-xl m-2">
                <p className="text-sm text-gray-500 mb-2">无服务器</p>
                <button onClick={() => setShowPairingPanel(true)} className="text-rust-accent text-xs font-bold hover:underline">去配对</button>
             </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-white/5 bg-dark-800/30 space-y-2">
            <button
                onClick={() => setShowPairingPanel(true)}
                className="w-full btn btn-secondary text-sm justify-start"
            >
                <FaQrcode className="text-gray-400" /> 配对新服务器
            </button>
            <button
                onClick={() => setShowAddModal(true)}
                className="w-full btn btn-secondary text-sm justify-start"
            >
                <FaPlus className="text-gray-400" /> 手动添加
            </button>
            {/* Socket 连接状态指示器 */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              socketConnected
                ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              <FaWifi className={socketConnected ? 'text-green-400' : 'text-red-400'} />
              <span>{socketConnected ? '后端已连接' : '后端断开'}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${
                socketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
              }`} />
            </div>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-dark-900 via-dark-900 to-dark-800">
        {activeServer ? (
          <>
            {/* Top Bar */}
            <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-dark-900/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  {activeServer.name}
                  {activeServer.connected ? (
                    <span className="badge bg-green-500/10 text-green-400 border border-green-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5"/> Online
                    </span>
                  ) : (
                    <span className="badge bg-dark-700 text-gray-400 border border-dark-600">
                      Offline
                    </span>
                  )}
                </h2>
              </div>
              
              <div className="flex items-center gap-3">
                {activeServer.connected && (
                    <button 
                        onClick={() => handleDisconnect(activeServer)}
                        className="btn btn-secondary text-xs h-8"
                    >
                        <FaSignOutAlt /> 断开
                    </button>
                )}
                {!activeServer.connected && (
                    <button 
                        onClick={() => handleDeleteServer(activeServer.id)}
                        className="btn btn-danger text-xs h-8"
                    >
                        删除
                    </button>
                )}
              </div>
            </header>

            {/* Tabs (Only if connected) */}
            {activeServer.connected && (
              <div className="px-6 py-2 border-b border-white/5 flex gap-1 bg-dark-900/50 overflow-x-auto">
                 <TabButton id="info" label="信息概览" icon={<FaInfoCircle />} active={activeTab} onClick={setActiveTab} />
                 <TabButton id="chat" label="队伍聊天" icon={<FaComments />} active={activeTab} onClick={setActiveTab} />
                 <TabButton id="devices" label="智能设备" icon={<FaGamepad />} active={activeTab} onClick={setActiveTab} />
                 <TabButton id="events" label="实时事件" icon={<FaClock />} active={activeTab} onClick={setActiveTab} />
                 <TabButton id="history" label="历史记录" icon={<FaHistory />} active={activeTab} onClick={setActiveTab} />
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 relative">
               {renderContent()}
               {/* Global Notifications */}
               {activeServer.connected && <PlayerNotifications serverId={activeServer.id} />}
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </main>

      {/* Modals */}
      <AddServerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddServer}
      />

      {showPairingPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-dark-800 rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-dark-900/50">
                    <h3 className="font-bold text-lg">配对服务器</h3>
                    <button onClick={() => setShowPairingPanel(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <div className="overflow-y-auto p-0">
                    <PairingPanel onServerPaired={handleServerPaired} />
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

// Sub-components for cleaner App.jsx
const TabButton = ({ id, label, icon, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active === id
        ? 'bg-rust-accent text-white shadow-lg shadow-rust-accent/20'
        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
    }`}
  >
    {icon} {label}
  </button>
);

const EmptyState = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
    <div className="w-20 h-20 rounded-2xl bg-dark-800 flex items-center justify-center mb-6 border border-dark-700">
        <FaServer className="text-4xl text-dark-600" />
    </div>
    <h3 className="text-xl font-bold text-gray-300 mb-2">未选择服务器</h3>
    <p>请在左侧列表选择一个服务器或添加新服务器</p>
  </div>
);

const DisconnectedState = ({ server, onConnect, loading, onDelete }) => (
  <div className="flex-1 flex flex-col items-center justify-center">
    <div className="max-w-md w-full bg-dark-800/50 backdrop-blur border border-white/5 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-full bg-dark-700 flex items-center justify-center mb-6">
            <FaPlug className="text-2xl text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{server.name}</h2>
        <p className="text-gray-400 mb-8 font-mono text-sm">{server.ip}:{server.port}</p>
        
        <div className="space-y-3">
            <button 
                onClick={onConnect}
                disabled={loading}
                className="w-full btn btn-primary py-3 text-lg"
            >
                {loading ? '连接中...' : '连接服务器'}
            </button>
            
            <button 
                onClick={onDelete}
                className="w-full btn btn-ghost text-red-400 hover:bg-red-500/10"
            >
                删除服务器
            </button>
        </div>
    </div>
  </div>
);

export default App;
