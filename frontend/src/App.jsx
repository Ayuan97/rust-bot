import { useState, useEffect, useRef } from 'react';
import {
  FaPlus, FaServer, FaQrcode, FaInfoCircle, FaComments,
  FaGamepad, FaCog, FaSignOutAlt, FaPlug, FaWifi, FaGlobe
} from 'react-icons/fa';
import socketService from './services/socket';
import { getServers, addServer as apiAddServer, deleteServer as apiDeleteServer } from './services/api';
import proxyApi from './services/proxy';
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmModal';

// Components
import ServerSidebarItem from './components/ServerSidebarItem';
import ChatPanel from './components/ChatPanel';
import DeviceControl from './components/DeviceControl';
import ServerInfo from './components/ServerInfo';
import AddServerModal from './components/AddServerModal';
import PairingPanel from './components/PairingPanel';
import PlayerNotifications from './components/PlayerNotifications';
import EmptyState from './components/EmptyState';
import WelcomeGuide from './components/WelcomeGuide';
import SettingsPanel from './components/SettingsPanel';

function App() {
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPairingPanel, setShowPairingPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'chat', 'devices'
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [hasAutoSelected, setHasAutoSelected] = useState(false); // 记录是否已自动选择
  const [socketConnected, setSocketConnected] = useState(false); // Socket 连接状态
  const [proxyStatus, setProxyStatus] = useState({ isRunning: false, node: null }); // 代理状态

  // 未读计数
  const [unreadChat, setUnreadChat] = useState(0);

  const toast = useToast();
  const confirm = useConfirm();

  // 使用 ref 存储 activeServer 最新值，避免事件处理器闭包陈旧
  const activeServerRef = useRef(null);
  const activeTabRef = useRef('info');
  useEffect(() => { activeServerRef.current = activeServer; }, [activeServer]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // --- Initial Setup & Socket Listeners ---
  useEffect(() => {
    socketService.connect();
    fetchServers();
    fetchProxyStatus();

    // 订阅 Socket 连接状态，断网重连时自动刷新
    const unsubscribe = socketService.onConnectionChange((connected) => {
      setSocketConnected(connected);
      if (connected) {
        // 重连后刷新服务器列表，同步状态
        console.log('🔄 Socket 重连，刷新服务器状态...');
        fetchServers();
        fetchProxyStatus();
      }
    });

    socketService.on('server:connected', handleServerConnected);
    socketService.on('server:disconnected', handleServerDisconnected);
    socketService.on('server:paired', handleServerPaired);

    // 监听代理状态变化
    const handleProxyStatusUpdate = (data) => {
      setProxyStatus(prev => ({ ...prev, ...data }));
    };
    socketService.on('proxy:status', handleProxyStatusUpdate);
    socketService.on('proxy:node:changed', (data) => {
      setProxyStatus(prev => ({ ...prev, isRunning: true, node: { name: data.nodeName, type: data.nodeType } }));
    });

    // 监听聊天消息（用于未读计数）
    const handleChatMessage = (data) => {
      if (activeServerRef.current?.id === data.serverId && activeTabRef.current !== 'chat') {
        setUnreadChat(prev => prev + 1);
      }
    };

    socketService.on('team:message', handleChatMessage);

    return () => {
      unsubscribe();
      socketService.removeAllListeners('server:connected');
      socketService.removeAllListeners('server:disconnected');
      socketService.removeAllListeners('server:paired');
      socketService.removeAllListeners('proxy:status');
      socketService.removeAllListeners('proxy:node:changed');
      socketService.off('team:message', handleChatMessage);
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

  const fetchProxyStatus = async () => {
    try {
      const res = await proxyApi.getProxyStatus();
      if (res.data.success) {
        setProxyStatus({
          isRunning: res.data.data.isRunning,
          node: res.data.data.node,
          hasConfig: res.data.data.hasConfig
        });
      }
    } catch (error) {
      console.error('Failed to fetch proxy status:', error);
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
    const confirmed = await confirm({
      type: 'danger',
      title: '删除服务器',
      message: '确定要删除这个服务器吗？此操作无法撤销。',
      confirmText: '删除',
      cancelText: '取消'
    });
    if (!confirmed) return;

    try {
      await apiDeleteServer(serverId);
      if (activeServer?.id === serverId) setActiveServer(null);
      fetchServers();
      toast.success('服务器已删除');
    } catch (error) {
      toast.error('删除失败: ' + (error.message || '未知错误'));
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
      toast.error('连接失败: ' + error.message);
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

  // Tab 切换处理（清除对应未读计数）
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'chat') {
      setUnreadChat(0);
    }
  };

  // --- Render Helpers ---
  const renderContent = () => {
    if (!activeServer) return <EmptyState type="server" />;
    if (!activeServer.connected) return <DisconnectedState server={activeServer} onConnect={() => handleConnect(activeServer)} loading={connectionLoading} onDelete={() => handleDeleteServer(activeServer.id)} />;

    switch (activeTab) {
      case 'info': return <ServerInfo serverId={activeServer.id} />;
      case 'chat': return <ChatPanel serverId={activeServer.id} />;
      case 'devices': return <DeviceControl serverId={activeServer.id} />;
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
            <div className="m-2 p-4 rounded-xl bg-dark-800/50 border border-white/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-rust-accent/10 flex items-center justify-center">
                  <FaServer className="text-rust-accent" />
                </div>
                <div>
                  <p className="font-medium text-gray-300">开始使用</p>
                  <p className="text-xs text-gray-500">添加你的第一个服务器</p>
                </div>
              </div>
              <button
                onClick={() => setShowPairingPanel(true)}
                className="w-full btn btn-primary text-sm"
              >
                <FaQrcode /> 配对服务器
              </button>
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
            <button
                onClick={() => setShowSettingsPanel(true)}
                className="w-full btn btn-secondary text-sm justify-start"
            >
                <FaCog className="text-gray-400" /> 设置
            </button>

            {/* 状态指示器区域 */}
            <div className="pt-2 space-y-1.5 border-t border-white/5">
              {/* Socket 连接状态 */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                socketConnected
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                <FaWifi className={socketConnected ? 'text-green-400' : 'text-red-400'} />
                <span>{socketConnected ? '后端已连接' : '后端断开'}</span>
                <span className={`ml-auto w-1.5 h-1.5 rounded-full ${
                  socketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                }`} />
              </div>

              {/* 代理状态指示器 */}
              <button
                onClick={() => setShowSettingsPanel(true)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  proxyStatus.isRunning
                    ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                    : proxyStatus.hasConfig
                      ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                      : 'bg-dark-700/50 text-gray-500 hover:bg-dark-700'
                }`}
              >
                <FaGlobe className={
                  proxyStatus.isRunning ? 'text-blue-400' :
                  proxyStatus.hasConfig ? 'text-yellow-400' : 'text-gray-500'
                } />
                <span className="truncate">
                  {proxyStatus.isRunning && proxyStatus.node
                    ? proxyStatus.node.name
                    : proxyStatus.hasConfig
                      ? '代理已停止'
                      : '代理未配置'
                  }
                </span>
                {proxyStatus.isRunning && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                )}
              </button>
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
                 <TabButton id="info" label="信息概览" icon={<FaInfoCircle />} active={activeTab} onClick={handleTabChange} />
                 <TabButton id="chat" label="队伍聊天" icon={<FaComments />} active={activeTab} onClick={handleTabChange} badge={unreadChat} />
                 <TabButton id="devices" label="智能设备" icon={<FaGamepad />} active={activeTab} onClick={handleTabChange} />
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 relative">
               {renderContent()}
               {/* Global Notifications */}
               {activeServer.connected && <PlayerNotifications serverId={activeServer.id} />}
            </div>
          </>
        ) : servers.length === 0 ? (
          <WelcomeGuide
            onStartPairing={() => setShowPairingPanel(true)}
          />
        ) : (
          <EmptyState type="server" />
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

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
      />
    </div>
  );
}

// Sub-components for cleaner App.jsx
const TabButton = ({ id, label, icon, active, onClick, badge = 0, badgeType = 'danger' }) => (
  <button
    onClick={() => onClick(id)}
    className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active === id
        ? 'bg-rust-accent text-white shadow-lg shadow-rust-accent/20'
        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
    }`}
  >
    {icon} {label}
    {badge > 0 && (
      <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-[10px] font-bold ${
        badgeType === 'info'
          ? 'bg-blue-500 text-white'
          : 'bg-red-500 text-white animate-pulse'
      }`}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
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
