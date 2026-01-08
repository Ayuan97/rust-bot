import { useState, useEffect, useRef } from 'react';
import {
  FaServer, FaQrcode, FaInfoCircle, FaComments,
  FaGamepad, FaCog, FaSignOutAlt, FaPlug, FaUser, FaUserShield
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import socketService from './services/socket';
import { getServers, deleteServer as apiDeleteServer } from './services/api';
import { userApi } from './services/auth';
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmModal';

// Components
import ServerSidebarItem from './components/ServerSidebarItem';
import ChatPanel from './components/ChatPanel';
import DeviceControl from './components/DeviceControl';
import ServerInfo from './components/ServerInfo';
import PairingPanel from './components/PairingPanel';
import PlayerNotifications from './components/PlayerNotifications';
import EmptyState from './components/EmptyState';
import WelcomeGuide from './components/WelcomeGuide';
import SettingsPanel from './components/SettingsPanel';
import SubscriptionStatus from './components/SubscriptionStatus';
import SubscriptionExpiryReminder from './components/SubscriptionExpiryReminder';

function App() {
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [showPairingPanel, setShowPairingPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'chat', 'devices'
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [hasAutoSelected, setHasAutoSelected] = useState(false); // 记录是否已自动选择
  const [currentUser, setCurrentUser] = useState(null); // 当前登录用户信息
  const [subscription, setSubscription] = useState(null); // 订阅信息
  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false); // 订阅是否过期

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
    // 加载用户信息
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      } catch (err) {
        console.error('Failed to parse user info:', err);
      }
    }

    // 加载订阅信息
    loadSubscription();

    socketService.connect();
    fetchServers();

    // Socket 重连时自动刷新
    const unsubscribe = socketService.onConnectionChange((connected) => {
      if (connected) {
        console.log('🔄 Socket 重连，刷新服务器状态...');
        fetchServers();
      }
    });

    socketService.on('server:connected', handleServerConnected);
    socketService.on('server:disconnected', handleServerDisconnected);
    socketService.on('server:paired', handleServerPaired);

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
      socketService.off('team:message', handleChatMessage);
      socketService.disconnect();
    };
  }, []);

  // 加载订阅信息
  const loadSubscription = async () => {
    try {
      const result = await userApi.getSubscription();
      if (result.success && result.subscription) {
        setSubscription(result.subscription);
        // 检查是否过期
        const isExpired = result.subscription.status !== 'ACTIVE';
        setIsSubscriptionExpired(isExpired);
      }
    } catch (err) {
      console.error('Failed to load subscription:', err);
    }
  };

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
    // 检查订阅状态
    if (isSubscriptionExpired) {
      toast.error('订阅已过期，请续费后使用完整功能');
      return;
    }

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

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // --- Render Helpers ---
  const renderContent = () => {
    if (!activeServer) return <EmptyState type="server" />;
    if (!activeServer.connected) return <DisconnectedState
      server={activeServer}
      onConnect={() => handleConnect(activeServer)}
      loading={connectionLoading}
      onDelete={() => handleDeleteServer(activeServer.id)}
      isExpired={isSubscriptionExpired}
    />;

    switch (activeTab) {
      case 'info': return <ServerInfo serverId={activeServer.id} />;
      case 'chat': return <ChatPanel serverId={activeServer.id} isReadOnly={isSubscriptionExpired} />;
      case 'devices': return <DeviceControl serverId={activeServer.id} isReadOnly={isSubscriptionExpired} />;
      default: return <ServerInfo serverId={activeServer.id} />;
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 text-gray-200 font-sans overflow-hidden">
      {/* 订阅到期提醒 */}
      <SubscriptionExpiryReminder />

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

        {/* Subscription Status */}
        <div className="p-3 border-t border-white/5">
          <SubscriptionStatus />
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-white/5 bg-dark-800/30 space-y-2">
            <button
                onClick={() => {
                  if (isSubscriptionExpired) {
                    toast.error('订阅已过期，请续费后使用完整功能');
                    return;
                  }
                  setShowPairingPanel(true);
                }}
                disabled={isSubscriptionExpired}
                className={`w-full btn btn-secondary text-sm justify-start ${
                  isSubscriptionExpired ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title={isSubscriptionExpired ? '订阅已过期' : ''}
            >
                <FaQrcode className="text-gray-400" /> 配对新服务器
            </button>
            <button
                onClick={() => setShowSettingsPanel(true)}
                className="w-full btn btn-secondary text-sm justify-start"
            >
                <FaCog className="text-gray-400" /> 设置
            </button>
            <button
                onClick={() => navigate('/account')}
                className="w-full btn btn-secondary text-sm justify-start"
            >
                <FaUser className="text-gray-400" /> 账户管理
            </button>

            {/* 管理后台按钮 - 仅管理员可见 */}
            {currentUser?.isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="w-full btn btn-primary text-sm justify-start bg-blue-600/10 hover:bg-blue-600/20 border-blue-500/30"
              >
                <FaUserShield className="text-blue-400" /> 管理后台
              </button>
            )}

            {/* 用户信息和退出登录 */}
            <div className="pt-2 border-t border-white/5">
              {currentUser && (
                <div className="px-3 py-2 rounded-lg bg-dark-700/50 mb-2">
                  <div className="text-xs text-gray-500 mb-0.5">当前用户</div>
                  <div className="text-sm font-medium text-gray-200 truncate">{currentUser.username}</div>
                  <div className="text-xs text-gray-400 truncate">{currentUser.email}</div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full btn btn-ghost text-sm justify-start text-red-400 hover:bg-red-500/10"
              >
                <FaSignOutAlt /> 退出登录
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

const DisconnectedState = ({ server, onConnect, loading, onDelete, isExpired }) => (
  <div className="flex-1 flex flex-col items-center justify-center">
    <div className="max-w-md w-full bg-dark-800/50 backdrop-blur border border-white/5 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-full bg-dark-700 flex items-center justify-center mb-6">
            <FaPlug className="text-2xl text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{server.name}</h2>
        <p className="text-gray-400 mb-8 font-mono text-sm">{server.ip}:{server.port}</p>

        {/* 过期提示 */}
        {isExpired && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">
              ⚠️ 订阅已过期，无法连接到服务器
            </p>
            <p className="text-gray-400 text-xs mt-1">
              续费后即可恢复使用
            </p>
          </div>
        )}

        <div className="space-y-3">
            <button
                onClick={onConnect}
                disabled={loading || isExpired}
                className={`w-full btn btn-primary py-3 text-lg ${
                  isExpired ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
                {loading ? '连接中...' : isExpired ? '订阅已过期' : '连接服务器'}
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
