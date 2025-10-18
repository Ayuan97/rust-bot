import { useState, useEffect } from 'react';
import { FaPlus, FaServer, FaQrcode } from 'react-icons/fa';
import socketService from './services/socket';
import { getServers, addServer as apiAddServer, deleteServer as apiDeleteServer } from './services/api';
import ServerCard from './components/ServerCard';
import ChatPanel from './components/ChatPanel';
import DeviceControl from './components/DeviceControl';
import ServerInfo from './components/ServerInfo';
import AddServerModal from './components/AddServerModal';
import PairingPanel from './components/PairingPanel';

function App() {
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPairingPanel, setShowPairingPanel] = useState(false);
  const [loading, setLoading] = useState(true);

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
      await apiDeleteServer(serverId);
      if (activeServer?.id === serverId) {
        setActiveServer(null);
      }
      fetchServers();
    } catch (error) {
      console.error('删除服务器失败:', error);
      alert('删除失败: ' + error.message);
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 左侧：服务器列表 */}
            <div className="lg:col-span-3 space-y-4">
              <h2 className="text-lg font-bold mb-4">服务器列表</h2>
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

            {/* 右侧：主控制面板 */}
            {activeServer ? (
              activeServer.connected ? (
                <div className="lg:col-span-9 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 服务器信息 */}
                  <div className="lg:col-span-1">
                    <ServerInfo serverId={activeServer.id} />
                  </div>

                  {/* 聊天面板 */}
                  <div className="lg:col-span-1 h-[600px]">
                    <ChatPanel serverId={activeServer.id} />
                  </div>

                  {/* 设备控制 - 占满整行 */}
                  <div className="lg:col-span-2 h-[600px]">
                    <DeviceControl serverId={activeServer.id} />
                  </div>
                </div>
              ) : (
                <div className="lg:col-span-9 flex items-center justify-center">
                  <div className="text-center">
                    <FaServer className="text-6xl text-gray-600 mx-auto mb-4" />
                    <p className="text-xl text-gray-400 mb-4">
                      服务器未连接
                    </p>
                    <p className="text-gray-500">
                      请在左侧点击"连接"按钮连接到服务器
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="lg:col-span-9 flex items-center justify-center">
                <div className="text-center">
                  <FaServer className="text-6xl text-gray-600 mx-auto mb-4" />
                  <p className="text-xl text-gray-400">
                    请从左侧选择一个服务器
                  </p>
                </div>
              </div>
            )}
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
