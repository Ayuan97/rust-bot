import { useState, useEffect } from 'react';
import { FaPlus, FaServer, FaQrcode, FaInfoCircle, FaComments, FaGamepad, FaClock, FaHistory } from 'react-icons/fa';
import socketService from './services/socket';
import { getServers, addServer as apiAddServer, deleteServer as apiDeleteServer } from './services/api';
import ServerCard from './components/ServerCard';
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

  useEffect(() => {
    // 初始化 WebSocket 连接
    socketService.connect();

    // 加载服务器列表
    fetchServers();

    // 监听服务器连接状态变化
    socketService.on('server:connected', handleServerConnected);
    socketService.on('server:disconnected', handleServerDisconnected);

    // 监听服务器配对事件
    socketService.on('server:paired', handleServerPaired);

    return () => {
      socketService.removeAllListeners('server:connected');
      socketService.removeAllListeners('server:disconnected');
      socketService.removeAllListeners('server:paired');
      socketService.disconnect();
    };
  }, []);

  const fetchServers = async () => {
    setLoading(true);
    try {
      const response = await getServers();
      setServers(response.data.servers);

      // 如果有服务器且没有选中的，自动选中第一个
      if (response.data.servers.length > 0 && !activeServer) {
        setActiveServer(response.data.servers[0]);
      }
    } catch (error) {
      console.error('获取服务器列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleServerConnected = (data) => {
    setServers((prev) =>
      prev.map((server) =>
        server.id === data.serverId
          ? { ...server, connected: true }
          : server
      )
    );
  };

  const handleServerDisconnected = (data) => {
    setServers((prev) =>
      prev.map((server) =>
        server.id === data.serverId
          ? { ...server, connected: false }
          : server
      )
    );
  };

  const handleServerPaired = (serverInfo) => {
    console.log('收到配对的服务器:', serverInfo);
    // 刷新服务器列表
    fetchServers();
    // 关闭配对面板
    setShowPairingPanel(false);
  };

  const handleAddServer = async (serverData) => {
    await apiAddServer(serverData);
    fetchServers();
  };

  const handleDeleteServer = async (serverId) => {
    if (!confirm('确定要删除这个服务器吗?')) return;

    try {
      console.log(`🗑️ 准备删除服务器: ${serverId}`);
      const response = await apiDeleteServer(serverId);
      console.log(`✅ 删除服务器响应:`, response.data);

      if (activeServer?.id === serverId) {
        setActiveServer(null);
      }
      fetchServers();
    } catch (error) {
      console.error('❌ 删除服务器失败:', error);
      console.error('   错误详情:', error.response?.data);
      console.error('   状态码:', error.response?.status);

      const errorMessage = error.response?.data?.error || error.message || '未知错误';
      alert('删除失败: ' + errorMessage);
    }
  };

  return (
    <div className="min-h-screen bg-rust-darker">
      {/* 顶部导航栏 */}
      <header className="bg-rust-dark border-b border-rust-gray">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FaServer className="text-rust-orange text-3xl" />
              <h1 className="text-2xl font-bold">Rust+ Dashboard</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="btn btn-secondary flex items-center gap-2"
                onClick={() => setShowPairingPanel(!showPairingPanel)}
              >
                <FaQrcode />
                {showPairingPanel ? '关闭配对' : '配对服务器'}
              </button>
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={() => setShowAddModal(true)}
              >
                <FaPlus />
                手动添加
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="container mx-auto px-4 py-6">
        {/* 配对面板 */}
        {showPairingPanel && (
          <div className="mb-6 max-w-2xl mx-auto">
            <PairingPanel onServerPaired={handleServerPaired} />
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-20">
            加载中...
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-20">
            <FaServer className="text-6xl text-gray-600 mx-auto mb-4" />
            <p className="text-xl text-gray-400 mb-6">
              还没有添加服务器
            </p>
            <div className="flex gap-4 justify-center">
              <button
                className="btn btn-primary inline-flex items-center gap-2"
                onClick={() => setShowPairingPanel(true)}
              >
                <FaQrcode />
                游戏内配对
              </button>
              <button
                className="btn btn-secondary inline-flex items-center gap-2"
                onClick={() => setShowAddModal(true)}
              >
                <FaPlus />
                手动添加
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 服务器列表区域 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FaServer className="text-rust-orange" />
                  我的服务器
                </h2>
                <span className="text-sm text-gray-400 bg-rust-gray px-3 py-1.5 rounded-full">
                  共 {servers.length} 个服务器
                </span>
              </div>
              <div className="space-y-3">
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onDelete={handleDeleteServer}
                    onSelect={setActiveServer}
                    isActive={activeServer?.id === server.id}
                  />
                ))}
              </div>
            </div>

            {/* 控制面板区域（仅在有激活服务器且已连接时显示） */}
            {activeServer ? (
              activeServer.connected ? (
                <div>
                  {/* 标签页导航 */}
                  <div className="bg-rust-dark rounded-lg p-2 mb-6 flex gap-2 overflow-x-auto">
                    <button
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                        activeTab === 'info'
                          ? 'bg-rust-orange text-white'
                          : 'text-gray-400 hover:bg-rust-gray'
                      }`}
                      onClick={() => setActiveTab('info')}
                    >
                      <FaInfoCircle />
                      服务器信息
                    </button>
                    <button
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                        activeTab === 'chat'
                          ? 'bg-rust-orange text-white'
                          : 'text-gray-400 hover:bg-rust-gray'
                      }`}
                      onClick={() => setActiveTab('chat')}
                    >
                      <FaComments />
                      队伍聊天
                    </button>
                    <button
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                        activeTab === 'devices'
                          ? 'bg-rust-orange text-white'
                          : 'text-gray-400 hover:bg-rust-gray'
                      }`}
                      onClick={() => setActiveTab('devices')}
                    >
                      <FaGamepad />
                      设备控制
                    </button>
                    <button
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                        activeTab === 'events'
                          ? 'bg-rust-orange text-white'
                          : 'text-gray-400 hover:bg-rust-gray'
                      }`}
                      onClick={() => setActiveTab('events')}
                    >
                      <FaClock />
                      活跃事件
                    </button>
                    <button
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                        activeTab === 'history'
                          ? 'bg-rust-orange text-white'
                          : 'text-gray-400 hover:bg-rust-gray'
                      }`}
                      onClick={() => setActiveTab('history')}
                    >
                      <FaHistory />
                      事件历史
                    </button>
                  </div>

                  {/* 标签页内容 */}
                  <div className="h-[600px]">
                    {activeTab === 'info' && <ServerInfo serverId={activeServer.id} />}
                    {activeTab === 'chat' && <ChatPanel serverId={activeServer.id} />}
                    {activeTab === 'devices' && <DeviceControl serverId={activeServer.id} />}
                    {activeTab === 'events' && <EventsPanel serverId={activeServer.id} />}
                    {activeTab === 'history' && <EventHistoryPanel serverId={activeServer.id} />}
                  </div>

                  {/* 玩家动态通知（悬浮） */}
                  <PlayerNotifications serverId={activeServer.id} />
                </div>
              ) : (
                <div className="bg-rust-dark rounded-lg p-12 text-center">
                  <FaServer className="text-6xl text-gray-600 mx-auto mb-4" />
                  <p className="text-xl text-gray-400 mb-4">
                    服务器未连接
                  </p>
                  <p className="text-gray-500">
                    请点击上方服务器卡片中的"连接"按钮连接到服务器
                  </p>
                </div>
              )
            ) : null}
          </div>
        )}
      </main>

      {/* 添加服务器模态框 */}
      <AddServerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddServer}
      />
    </div>
  );
}

export default App;
