import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FaTerminal, FaUsers, FaCogs, FaMapMarkedAlt, FaCog,
  FaSignOutAlt, FaPlus, FaClock, FaSatellite, FaShieldAlt,
  FaTimes, FaExpandArrowsAlt, FaPlay, FaRobot, FaBolt, FaLightbulb, FaCrosshairs, FaDoorOpen, FaChartLine,
  FaGlobe, FaTools, FaBell, FaServer
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import api, { getServers, connectServer, disconnectServer, getMapInfo, getTeamInfo } from './services/api';
import { useToast } from './components/Toast';
import socketService from './services/socket';
import { getCorrectedMapSize } from './utils/coordinates';
import HUDView from './components/HUDView';
import TeamView from './components/TeamView';
import DeviceControl from './components/DeviceControl';
import ChatPanel from './components/ChatPanel';
import SubscriptionStatus from './components/SubscriptionStatus';
import PairingWizard from './components/PairingWizard';
import FCMSettings from './components/FCMSettings';
import NotificationSettings from './components/NotificationSettings';
import AdminPage from './pages/AdminPage';
import MapView from './components/MapView';
import ServerInfoView from './components/ServerInfoView';
import TrackingView from './components/TrackingView';

function App() {
  const { user, logout, isSubscriptionExpired } = useAuth();
  const toast = useToast();

  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [activeView, setActiveView] = useState('hud'); // 'hud', 'team', 'devices', 'settings', 'pairing', 'admin'
  const [showMapModal, setShowMapModal] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [teamData, setTeamData] = useState(null);
  const [alertLevel, setAlertLevel] = useState(null); // 'none', 'warn', 'critical'
  const [wipeInfo, setWipeInfo] = useState(null);
  const [mapFocusTarget, setMapFocusTarget] = useState(null);
  const [fcmStatus, setFcmStatus] = useState({ isListening: false, hasCredentials: false });
  const [wipeCountdownTick, setWipeCountdownTick] = useState(0);
  const pendingConnectionStates = new Set(['QUEUED', 'ASSIGNED', 'CONNECTING']);
  const activeConnectionState = activeServer?.connectionState || 'DISCONNECTED';
  const isActiveServerPending = pendingConnectionStates.has(activeConnectionState);
  const canDisconnectActiveServer = activeServer?.canDisconnect === true;

  // 倒计时定时器 (每秒更新)
  useEffect(() => {
    const timer = setInterval(() => setWipeCountdownTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchServers();
    fetchFCMStatus();

    // 初始化 Socket 连接
    const socket = socketService.connect();

    if (socket) {
      socketService.on('team_info', (data) => {
        if (data.serverId === activeServer?.id) {
          setTeamData(data);
        }
      });

      socketService.on('event_log', (event) => {
        if (event.serverId === activeServer?.id) {
          // 检查是否需要触发全局警戒
          if (event.eventType === 'PLAYER_DEATH' || event.eventType === 'ALARM_TRIGGERED') {
            triggerGlobalAlert();
          }
        }
      });
    }

    // 轮询 FCM 状态
    const fcmInterval = setInterval(fetchFCMStatus, 30000);

    return () => {
      socketService.off('team_info');
      socketService.off('event_log');
      clearInterval(fcmInterval);
    };
  }, [activeServer?.id]);

  useEffect(() => {
    if (activeServer?.id) {
      fetchWipeInfo(activeServer.id);
      fetchTeamData(activeServer.id);
    }
  }, [activeServer?.id]);

  const fetchTeamData = async (serverId) => {
    try {
      const res = await getTeamInfo(serverId);
      if (res.data.success) {
        setTeamData(res.data.teamInfo);
      } else {
        setTeamData(null);
      }
    } catch (e) {
      console.error('队伍数据获取失败:', e);
      setTeamData(null);
    }
  };

  const fetchServers = async () => {
    try {
      const res = await getServers();
      const allServers = res.data.servers || [];
      // 过滤掉 FCM 占位符服务器 (IP 为 0.0.0.0)
      const gameServers = allServers.filter(s => s.ip !== '0.0.0.0');

      setServers(gameServers);
      // 保持当前选中服务器；若不存在则自动切换到首个可用服务器
      setActiveServer((prev) => {
        if (gameServers.length === 0) return null;
        if (!prev) return gameServers[0];
        const current = gameServers.find(s => s.id === prev.id);
        return current || gameServers[0];
      });
    } catch (e) {
      console.error('获取服务器列表失败', e);
    }
  };

  const fetchFCMStatus = async () => {
    try {
      const { getPairingStatus } = await import('./services/pairing');
      const res = await getPairingStatus();
      if (res.data.success) {
        setFcmStatus(res.data.status);
      }
    } catch (e) {
      console.error('FCM 状态获取失败');
    }
  };

  const fetchWipeInfo = async (serverId) => {
    try {
      const { getBattlemetricsInfo } = await import('./services/api');
      const res = await getBattlemetricsInfo(serverId);
      if (res.data.success) {
        setWipeInfo(res.data.data);
      }
    } catch (e) {
      console.log('Battlemetrics 获取失败', e.message);
    }
  };

  const triggerGlobalAlert = () => {
    setAlertLevel('critical');
    // 8秒后自动恢复，或者直到用户手动清除
    setTimeout(() => setAlertLevel(null), 8000);
  };

  const handleConnect = async (server) => {
    setConnectionLoading(true);
    try {
      const res = await connectServer(server.id);
      if (res.data.success) {
        if (res.data.queued) {
          toast.info(`连接请求已提交：${server.name}`);
        } else {
          toast.success(`远程链路已激活：${server.name}`);
        }
        fetchServers();
      }
    } catch (e) {
      toast.error(e.response?.data?.error || '建立连接失败');
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeServer) return;
    setConnectionLoading(true);
    try {
      const res = await disconnectServer(activeServer.id);
      if (res.data.success) {
        toast.success(res.data.message || `已断开 ${activeServer.name} 的连接`);
        setTeamData(null);
        setWipeInfo(null);
        setMapFocusTarget(null);
        fetchServers();
      }
    } catch (e) {
      toast.error(e.response?.data?.error || '断开连接失败');
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleLockdown = async () => {
    if (!activeServer) return;
    try {
      const res = await api.post(`/servers/${activeServer.id}/lockdown`);
      if (res.data.success) {
        toast.success(res.data.message);
        triggerGlobalAlert(); // 封锁时触发警戒特效增加仪式感
      }
    } catch (e) {
      toast.error('执行封锁操作失败');
    }
  };

  const handleLocateTarget = (x, y, name) => {
    setMapFocusTarget({ x, y, name });
    setActiveView('map');
  };

  // 计算倒计时
  const wipeCountdown = useMemo(() => {
    if (!activeServer || !wipeInfo?.nextWipe) return '--:--:--'; // 无服务器或无数据时显示占位符
    const next = new Date(wipeInfo.nextWipe).getTime();
    const now = new Date().getTime();
    const diff = next - now;
    if (diff <= 0) return '00:00:00';

    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [activeServer, wipeInfo, wipeCountdownTick]);

  // --- Render Views ---
  const renderView = () => {
    // 配对向导视图（独立处理）
    if (activeView === 'pairing') {
      return (
        <PairingWizard
          fcmStatus={fcmStatus}
          onComplete={() => {
            fetchServers();
            setActiveView('hud');
          }}
          onCancel={() => setActiveView('hud')}
        />
      );
    }

    // 只有在 HUD 视图且完全没有任何服务器节点时，显示 EmptyState
    // 其他视图允许以演示模式显示
    if (servers.length === 0 && activeView === 'hud') {
      return <EmptyState onPair={() => setActiveView('pairing')} fcmStatus={fcmStatus} isSubscriptionExpired={isSubscriptionExpired} />;
    }

    // 如果选择了服务器但未连接
    if (activeServer && !activeServer.connected && activeView === 'hud') {
      return (
        <DisconnectedView
          server={activeServer}
          onConnect={() => handleConnect(activeServer)}
          onDisconnect={handleDisconnect}
          loading={connectionLoading}
          fcmStatus={fcmStatus}
          isSubscriptionExpired={isSubscriptionExpired}
          isPending={isActiveServerPending}
          connectionState={activeConnectionState}
        />
      );
    }

    // 根据当前视图渲染内容，每个子组件内部处理自己的“无数据/演示”状态
    switch (activeView) {
      case 'hud':
        return (
          <HUDView
            server={activeServer}
            teamData={teamData}
            fcmStatus={fcmStatus}
            isSubscriptionExpired={isSubscriptionExpired}
            onPair={() => setActiveView('pairing')}
            onLockdown={handleLockdown}
          />
        );
      case 'team':
        return (
          <TeamView
            server={activeServer}
            teamData={teamData}
            onLocate={handleLocateTarget}
          />
        );
      case 'map':
        return (
          <MapView
            server={activeServer}
            teamData={teamData}
            focusTarget={mapFocusTarget}
            onLocatePlayer={(member) => setMapFocusTarget({ x: member.x, y: member.y, name: member.name })}
          />
        );
      case 'devices':
        return <DeviceControl serverId={activeServer?.id} isReadOnly={isSubscriptionExpired} />;
      case 'tracking':
        return <TrackingView />;
      case 'serverinfo':
        return (
          <ServerInfoView
            server={activeServer}
            onBack={() => setActiveView('hud')}
          />
        );
      case 'settings':
        return <ServerSettingsView server={activeServer} onNavigateToPairing={() => setActiveView('pairing')} />;
      case 'admin':
        return (
          <div className="h-full animate-fade-in">
            <AdminPage />
          </div>
        );
      default:
        return <HUDView server={activeServer} teamData={teamData} isSubscriptionExpired={isSubscriptionExpired} onPair={() => setActiveView('pairing')} />;
    }
  };

  return (
    <div className={`flex h-screen bg-[#0D0E10] text-[#e0e0e0] overflow-hidden font-sans relative`}>
      {/* 全局警报特效 */}
      {alertLevel === 'critical' && <div className="alert-pulse" />}

      {/* 左侧导航轨 (Navigation Rail) - 悬停展开 */}
      <nav className="group/nav h-full flex flex-col py-6 bg-[#090a0c] border-r border-white/5 z-50 shrink-0 w-20 hover:w-52 transition-all duration-300 ease-out overflow-hidden">
        <div className="mb-8 px-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 p-1 bg-[#cd5241] tactic-cut flex items-center justify-center shadow-lg shadow-[#cd5241]/20 shrink-0">
              <img src="/logo.svg" alt="Rust+ Logo" className="w-full h-full object-contain filter drop-shadow-md" />
            </div>
            <span className="text-sm font-black uppercase italic text-white tracking-tight opacity-0 group-hover/nav:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              Rust+
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto px-3">
          <NavIcon id="hud" icon={<FaTerminal />} active={activeView} onClick={setActiveView} label="基地概览" />
          <NavIcon id="team" icon={<FaUsers />} active={activeView} onClick={setActiveView} label="队友动态" />
          <NavIcon id="map" icon={<FaMapMarkedAlt />} active={activeView} onClick={setActiveView} label="实时地图" />
          <NavIcon id="devices" icon={<FaCogs />} active={activeView} onClick={setActiveView} label="智能中控" />
          <NavIcon id="tracking" icon={<FaCrosshairs />} active={activeView} onClick={setActiveView} label="玩家追踪" />
          <NavIcon id="serverinfo" icon={<FaServer />} active={activeView} onClick={setActiveView} label="服务器信息" />
          <div className="h-px bg-white/5 my-2 mx-1" />
          <NavIcon id="settings" icon={<FaCog />} active={activeView} onClick={setActiveView} label="预警配置" />
          {user?.isAdmin && (
            <NavIcon id="admin" icon={<FaTools />} active={activeView} onClick={setActiveView} label="管理后台" />
          )}
        </div>

        <div className="mt-auto pt-4 px-3 shrink-0">
          {/* 用户信息 + 退出 */}
          <button
            onClick={logout}
            className="w-full h-12 tactic-cut bg-white/5 hover:bg-[#ef4444]/20 flex items-center gap-3 px-3 transition-all group/logout"
            title="退出登录"
          >
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              <FaSignOutAlt className="text-gray-600 group-hover/logout:text-[#ef4444] transition-colors" />
            </div>
            <div className="flex-1 text-left opacity-0 group-hover/nav:opacity-100 transition-opacity duration-300 overflow-hidden">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">{user?.username}</div>
              <div className="text-[9px] text-gray-600 uppercase">退出登录</div>
            </div>
          </button>
        </div>
      </nav>

      {/* 主内容区域 */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className="scanline"></div>

        {/* 顶部状态栏 */}
        <header className="h-16 flex items-center justify-between px-8 bg-black/20 border-b border-white/5 backdrop-blur-md relative z-40">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-none mb-1">活跃节点</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-white uppercase italic tracking-tight truncate max-w-[150px]">
                  {activeServer ? activeServer.name : '未选择服务器'}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ${activeServer?.connected ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635]' : 'bg-gray-800'}`} />
              </div>
            </div>

            <div className="h-6 w-px bg-white/5 mx-2" />

            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-700 font-black uppercase tracking-widest leading-none mb-1">推送链路 (FCM)</span>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${fcmStatus.isListening ? 'bg-[#a3e635] animate-pulse' : 'bg-gray-800'}`} />
                  <span className={`text-[9px] font-black uppercase ${fcmStatus.isListening ? 'text-gray-300' : 'text-gray-600'}`}>
                    {fcmStatus.isListening ? '在线 ON' : '离线 OFF'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-700 font-black uppercase tracking-widest leading-none mb-1">远程链路 (WS)</span>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    activeServer?.connected
                      ? 'bg-[#3b82f6] shadow-[0_0_8px_#3b82f6]'
                      : isActiveServerPending
                        ? 'bg-yellow-500 animate-pulse shadow-[0_0_8px_#eab308]'
                        : 'bg-gray-800'
                  }`} />
                  <span className={`text-[9px] font-black uppercase ${
                    activeServer?.connected || isActiveServerPending ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {activeServer?.connected ? '已连接' : isActiveServerPending ? '连接中' : '未建立'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-none mb-1">强制清档倒计时</span>
              <span className="text-xs font-mono font-black text-[#cd5241]">{wipeCountdown}</span>
            </div>
            {canDisconnectActiveServer && (
              <button
                onClick={handleDisconnect}
                disabled={connectionLoading}
                className={`px-4 py-2 border tactic-cut text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
                  connectionLoading
                    ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                    : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400 hover:text-red-300'
                }`}
              >
                {isActiveServerPending ? '取消连接' : '断开连接'}
              </button>
            )}
            <button
              onClick={() => {
                setMapFocusTarget(null);
                setActiveView('map');
              }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 tactic-cut text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all"
            >
              <FaMapMarkedAlt className="text-[#cd5241]" /> 实时地图
            </button>
          </div>
        </header>

        {/* 视图内容 */}
        <div className="flex-1 overflow-hidden p-8 relative">
          {renderView()}
        </div>
      </main>

      {/* 实时地图模态框 */}
      {showMapModal && (
        <TacticalMapModal
          server={activeServer}
          teamData={teamData}
          focusTarget={mapFocusTarget}
          onClose={() => setShowMapModal(false)}
        />
      )}
    </div>
  );
}

// --- 子组件 ---

function NavIcon({ id, icon, active, onClick, label }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`relative w-full h-11 tactic-cut flex items-center gap-3 px-3 transition-all duration-200 ${isActive ? 'bg-[#cd5241] text-white shadow-lg shadow-[#cd5241]/20' : 'bg-white/[0.02] text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
    >
      {/* 左侧激活指示条 */}
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-white transition-all duration-300 ${isActive ? 'h-5' : 'h-0'}`} />

      {/* 图标 */}
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        <span className="text-sm">{icon}</span>
      </div>

      {/* 文字标签 - 跟随父级 nav 的 hover 状态显示 */}
      <span className="text-[11px] font-bold uppercase tracking-wide whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity duration-300">
        {label}
      </span>
    </button>
  );
}

function ServerSettingsView({ server, onNavigateToPairing }) {
  const isDemo = !server;
  const [activeTab, setActiveTab] = useState('fcm');

  const tabs = [
    { id: 'fcm', label: 'FCM 推送', icon: <FaBell />, desc: '配对凭证管理' },
    { id: 'notifications', label: '通知设置', icon: <FaBell />, desc: '队伍聊天通知' },
    { id: 'alerts', label: '预警规则', icon: <FaShieldAlt />, desc: '自动化报警' },
  ];

  return (
    <div className="h-full flex gap-6 animate-fade-in font-sans">
      {/* 左侧导航栏 */}
      <div className="w-56 shrink-0 tactic-border tactic-cut p-1 bg-black/40">
        <div className="bg-black/60 h-full flex flex-col">
          {/* 标题 */}
          <div className="p-5 border-b border-white/5">
            <h3 className="text-lg font-black uppercase italic glow-text flex items-center gap-2">
              <FaCog className="text-[#cd5241]" /> 系统配置
            </h3>
            {isDemo && (
              <div className="mt-2 px-2 py-1 bg-[#cd5241]/10 border border-[#cd5241]/30 text-[#cd5241] text-[8px] font-black tactic-cut text-center">
                演示模式
              </div>
            )}
          </div>

          {/* 导航项 */}
          <div className="flex-1 p-3 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left p-3 tactic-cut transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#cd5241] text-white'
                    : 'bg-white/[0.02] hover:bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={activeTab === tab.id ? 'text-white' : 'text-gray-500'}>{tab.icon}</span>
                  <span className="text-xs font-black uppercase tracking-tight">{tab.label}</span>
                </div>
                <p className="text-[9px] mt-1 opacity-60 uppercase tracking-wider">{tab.desc}</p>
              </button>
            ))}
          </div>

          {/* 底部信息 */}
          <div className="p-4 border-t border-white/5 text-center">
            <p className="text-[8px] text-gray-600 uppercase tracking-widest">Rust+ Dashboard v1.0</p>
          </div>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 tactic-border tactic-cut p-1 bg-black/40 overflow-hidden">
        <div className="bg-black/40 h-full overflow-y-auto p-6">
          {/* FCM 配置 */}
          {activeTab === 'fcm' && <FCMSettings onNavigateToPairing={onNavigateToPairing} />}

          {/* 通知设置 */}
          {activeTab === 'notifications' && <NotificationSettingsEmbed />}

          {/* 预警规则 */}
          {activeTab === 'alerts' && (
            <div className="space-y-6">
              <div className="mb-6">
                <h4 className="text-lg font-black uppercase italic text-white mb-1">预警规则配置</h4>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">自动化报警与防御联动</p>
              </div>

              <SettingRow
                title="核心房智能警报器"
                desc="当领地柜房间或核心防区的 Smart Alarm 被触发时，发送毫秒级推送提醒。"
                active={!isDemo}
              />
              <SettingRow
                title="队员阵亡即时同步"
                desc="团队成员在野外阵亡时，立即抓取坐标并在地图上标记尸体位置，同时发送通知。"
                active={!isDemo}
              />
              <SettingRow
                title="24/7 电话语音报警"
                desc="在深夜或核心区域遭受连续爆炸时，系统将通过加密线路直接拨打您的手机。"
                pro
                active={false}
              />
              <SettingRow
                title="自动电力防御联动"
                desc="当警报触发后，系统可自动开启所有已配对的自动炮塔并锁定基地大门。"
                pro
                active={false}
              />

              {isDemo && (
                <div className="mt-8 p-5 bg-white/[0.02] border border-dashed border-white/10 tactic-cut text-center">
                  <p className="text-xs text-gray-600 italic">请先在左侧选择或添加一个活跃的服务器节点。</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 嵌入式通知设置组件（复用 NotificationSettings 的逻辑）
function NotificationSettingsEmbed() {
  return (
    <div>
      <div className="mb-6">
        <h4 className="text-lg font-black uppercase italic text-white mb-1">通知设置</h4>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">队伍聊天通知配置</p>
      </div>
      <NotificationSettings />
    </div>
  );
}

function SettingRow({ title, desc, active, pro }) {
  return (
    <div className="flex justify-between items-center group">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <div className="text-sm font-black uppercase tracking-tight">{title}</div>
          {pro && <span className="text-[8px] px-1.5 py-0.5 bg-[#cd5241] text-white font-black italic tactic-cut">PRO_ONLY</span>}
        </div>
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mt-1">{desc}</div>
      </div>
      <div className={pro ? 'opacity-20 grayscale cursor-not-allowed' : ''}>
        <QuickToggle active={active} />
      </div>
    </div>
  );
}

function QuickToggle({ active, pro, disabled }) {
  return (
    <div className={`w-10 h-5 tactic-cut relative transition-all ${active ? 'bg-[#cd5241]' : 'bg-gray-800 shadow-inner'} ${disabled ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}>
      <div className={`absolute top-1 w-3 h-3 bg-white tactic-cut transition-all duration-300 ${active ? 'right-1 shadow-[0_0_8px_white]' : 'left-1'}`} />
    </div>
  );
}

function DisconnectedView({
  server,
  onConnect,
  onDisconnect,
  loading,
  fcmStatus,
  isSubscriptionExpired,
  isPending = false,
  connectionState = 'DISCONNECTED'
}) {
  const isDisabled = loading || (isSubscriptionExpired && !isPending);
  const actionText = isPending ? '取消连接请求' : '建立卫星远程连接';
  const loadingText = isPending ? '正在取消连接...' : '正在握手加密协议...';

  return (
    <div className="h-full flex items-center justify-center animate-fade-in relative overflow-hidden font-sans">
      <div className="max-w-md w-full tactic-border tactic-cut p-1 bg-black/40 relative z-10 shadow-2xl">
        <div className="bg-black/40 p-10 text-center relative overflow-hidden">
          <div className="scanline"></div>

          <div className="flex justify-center mb-8 gap-4">
            <div className="w-16 h-16 bg-gray-800/30 border border-white/5 tactic-cut flex flex-col items-center justify-center relative">
              <FaBell className={`text-xl ${fcmStatus?.isListening ? 'text-[#a3e635]' : 'text-gray-700'}`} />
              <span className="text-[7px] font-black mt-1 uppercase opacity-40">FCM</span>
              {fcmStatus?.isListening && <div className="absolute top-0 right-0 w-2 h-2 bg-[#a3e635] rounded-full shadow-[0_0_5px_#a3e635]" />}
            </div>
            <div className="w-20 h-20 bg-[#cd5241]/10 border border-[#cd5241]/20 tactic-cut flex flex-col items-center justify-center relative scale-110">
              <FaSatellite className={`text-3xl ${loading ? 'animate-spin' : 'text-gray-700'} ${isPending ? 'text-yellow-400' : ''}`} />
              <span className="text-[8px] font-black mt-1 uppercase text-[#cd5241]">Satellite</span>
            </div>
          </div>

          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter glow-text italic">{server.name}</h2>
          <div className="flex items-center justify-center gap-3 mb-10">
            <span className="text-gray-500 font-mono text-xs uppercase tracking-widest">{server.ip}:{server.port}</span>
            <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
            <span className={`font-black text-xs uppercase italic ${isPending ? 'text-yellow-500' : 'text-[#cd5241]'}`}>
              {isPending ? `链路建立中 (${connectionState})` : '卫星链路未建立'}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-5 tactic-cut mb-10 text-left">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">系统就绪状态</span>
              <span className="text-[10px] text-[#cd5241] font-black uppercase italic">
                {isPending ? '连接中，可取消' : isSubscriptionExpired ? '服务已暂停' : '等待远程授权'}
              </span>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-1.5 h-1.5 rounded-full ${fcmStatus?.isListening ? 'bg-[#a3e635]' : 'bg-gray-800'}`} />
                <p className="text-[9px] text-gray-500 font-medium leading-normal">
                  <span className="text-gray-300 font-bold">推送链路 (FCM):</span> {fcmStatus?.isListening ? '已就绪。系统已准备好接收游戏内配对推送。' : '未连接。您将无法在游戏中直接配对设备。'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-800" />
                <p className="text-[9px] text-gray-500 font-medium leading-normal">
                  <span className="text-gray-300 font-bold">实时链路 (WS):</span>{' '}
                  {isPending
                    ? '连接请求已提交，可点击下方按钮立即取消。'
                    : '需要您手动启动“远程连接”来激活此服务器的实时控制面板。'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={isPending ? onDisconnect : onConnect}
            disabled={isDisabled}
            title={isSubscriptionExpired && !isPending ? '续费后可连接服务器' : ''}
            className={`w-full tactic-cut py-6 font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 group text-lg ${isDisabled
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : isPending
                ? 'bg-red-500/70 hover:bg-red-500 shadow-2xl shadow-red-500/20'
                : 'bg-[#cd5241] hover:bg-[#b04537] shadow-2xl shadow-[#cd5241]/20'
              }`}
          >
            {loading ? (
              <>{loadingText}</>
            ) : isSubscriptionExpired && !isPending ? (
              <>服务已暂停 · 续费后可用</>
            ) : (
              <>
                {isPending ? <FaTimes className="text-xs group-hover:scale-110 transition-transform" /> : <FaPlay className="text-xs group-hover:scale-110 transition-transform" />}
                {actionText}
              </>
            )}
          </button>
        </div>
      </div>

      {/* 背景装饰 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12vw] font-black text-white/[0.02] pointer-events-none select-none italic uppercase">
        Link_Offline
      </div>
    </div>
  );
}

function EmptyState({ onPair, fcmStatus, isSubscriptionExpired }) {
  const hasCredentials = fcmStatus?.hasCredentials || fcmStatus?.hasStoredCredentials;

  return (
    <div className="h-full flex flex-col items-center justify-center relative animate-fade-in font-sans">
      <div className="relative z-10 text-center max-w-xl">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 tactic-cut bg-[#cd5241]/10 border border-[#cd5241]/30 flex items-center justify-center relative group">
            <FaSatellite className="text-3xl text-[#cd5241] animate-bounce" />
            <div className="absolute -inset-4 border border-[#cd5241]/10 tactic-cut animate-ping" />
          </div>
        </div>

        <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-3 glow-text">
          未检测到活跃服务器
        </h2>

        <p className="text-gray-500 text-sm mb-8 leading-relaxed font-medium">
          系统处于待机模式，添加服务器开启远程监控
        </p>

        {/* 状态卡片 */}
        <div className="mb-8 p-4 bg-white/[0.02] border border-white/5 tactic-cut text-left max-w-sm mx-auto">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 border-l-2 border-[#cd5241] pl-2">
            当前状态
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">FCM 凭证</span>
              <span className={`flex items-center gap-2 ${hasCredentials ? 'text-green-400' : 'text-gray-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasCredentials ? 'bg-green-400' : 'bg-gray-600'}`} />
                {hasCredentials ? '已配置' : '未配置'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">服务器</span>
              <span className="flex items-center gap-2 text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                未配对
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">订阅状态</span>
              <span className={`flex items-center gap-2 ${isSubscriptionExpired ? 'text-yellow-500' : 'text-green-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isSubscriptionExpired ? 'bg-yellow-500' : 'bg-green-400'}`} />
                {isSubscriptionExpired ? '已过期' : '有效'}
              </span>
            </div>
          </div>
        </div>

        {/* 提示文字 */}
        {hasCredentials && !isSubscriptionExpired && (
          <p className="text-xs text-green-400/80 mb-6">
            ✓ FCM 已就绪，只需在游戏中配对即可
          </p>
        )}

        <button
          onClick={onPair}
          className="group relative px-12 py-5 bg-[#cd5241] text-white font-black uppercase italic tactic-cut hover:scale-105 transition-all shadow-2xl shadow-[#cd5241]/30 overflow-hidden text-lg"
        >
          <span className="relative z-10 flex items-center gap-3">
            <FaPlus /> 添加服务器
          </span>
        </button>
      </div>
    </div>
  );
}

function TacticalMapModal({ server, teamData, focusTarget, onClose }) {
  const [mapInfo, setMapInfo] = useState({ markers: [], mapSize: 4500, monuments: [], loading: true });

  useEffect(() => {
    if (!server) {
      setMapInfo({ markers: [], mapSize: 4500, monuments: [], loading: false });
      return;
    }
    const fetchMap = async () => {
      try {

        const res = await getMapInfo(server.id);
        if (res.data.success) {
          const correctedSize = getCorrectedMapSize(res.data.mapSize);
          setMapInfo({ ...res.data, mapSize: correctedSize, loading: false });
        }
      } catch (e) {
        console.error('地图数据同步失败', e);
      }
    };
    fetchMap();
  }, [server?.id]);

  /* 地图控制状态 */
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef(null);

  /* 地图交互处理 - 使用 useEffect 绑定 passive: false 事件 */
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const scaleSensitivity = 0.001;
      setTransform(t => {
        const newScale = Math.min(Math.max(0.1, t.scale - e.deltaY * scaleSensitivity), 5);
        return { ...t, scale: newScale };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left click only
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setTransform(p => ({
        ...p,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  /* 坐标转换 (包含 OceanMargin 修正) */
  const getPos = (x, y) => {
    const size = getCorrectedMapSize(mapInfo.mapSize);
    const margin = mapInfo.oceanMargin || 500;
    const totalSize = size + 2 * margin; // 地图图像总尺寸 (世界单位)

    // X: (x + margin) / totalSize
    const left = ((x + margin) / totalSize) * 100;

    // Y: (size + margin - y) / totalSize (反转 Y轴: server 0 在下, CSS 0 在上)
    const top = ((size + margin - y) / totalSize) * 100;

    return { left: `${left}%`, top: `${top}%` };
  };



  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-in fade-in zoom-in-95 duration-200">
      <header className="h-14 bg-[#090a0c] border-b border-[#333] flex items-center justify-between px-6 z-50 shadow-2xl relative">
        <div className="flex items-center gap-4">
          <FaMapMarkedAlt className="text-[#cd5241] text-2xl animate-pulse" />
          <div>
            <h2 className="text-lg font-black italic tracking-tighter text-white uppercase flex items-center gap-2">
              集结与战术指挥地图
              <span className="text-[10px] px-1.5 py-0.5 bg-[#cd5241] text-white rounded font-bold not-italic tracking-normal">LIVE</span>
            </h2>
            <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">
              远程地理情报同步中 // [{server?.name}] {server?.type}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Controls */}
          <div className="flex bg-black/50 rounded border border-white/10 overflow-hidden">
            <button className="px-3 py-1 hover:bg-[#cd5241] text-white transition-colors" onClick={() => setTransform(p => ({ ...p, scale: Math.min(p.scale + 0.2, 5) }))}><FaPlus size={10} /></button>
            <button className="px-3 py-1 hover:bg-[#cd5241] text-white transition-colors" onClick={() => setTransform(p => ({ ...p, scale: Math.max(p.scale - 0.2, 0.5) }))}><FaTimes className="rotate-45" size={10} /></button>
            <button className="px-3 py-1 hover:bg-[#cd5241] text-white transition-colors" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}><FaExpandArrowsAlt size={10} /></button>
          </div>

          <div className="flex gap-4 text-[10px] font-bold text-gray-500 uppercase border-l border-white/10 pl-6">
            <span>地图: <span className="text-white">{mapInfo.mapSize}M</span></span>
            <span>Margin: <span className="text-white">{mapInfo.oceanMargin}</span></span>
            <span>纪念碑: <span className="text-white">{mapInfo.monuments?.length || 0}</span></span>
            <span>同队: <span className="text-white">{teamData?.members?.length || 0}</span></span>
          </div>

          <button
            onClick={() => onClose()}
            className="w-8 h-8 flex items-center justify-center border border-white/10 hover:bg-[#cd5241] hover:border-[#cd5241] transition-all text-gray-400 hover:text-white ml-2 rounded"
          >
            <FaTimes />
          </button>
        </div>
      </header>

      <div
        ref={mapContainerRef}
        className="flex-1 relative bg-[#090a0c] tactic-border tactic-cut overflow-hidden cursor-crosshair group shadow-inner"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="absolute inset-0 transition-transform duration-75 ease-out origin-center"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            width: '100%',
            height: '100%'
          }}
        >
          {/* 地图背景图层 */}
          {server && (
            <div
              className="absolute inset-0 z-0 bg-contain bg-no-repeat bg-center opacity-80"
              style={{
                backgroundImage: `url(${import.meta.env.VITE_API_URL || '/api'}/servers/${server.id}/map-image?token=${localStorage.getItem('token')})`,
                filter: 'grayscale(0.3) contrast(1.2)'
              }}
            />
          )}

          {/* 所有的标记物、纪念碑等都应该包含在 transform 容器内 */}

          {/* 渲染纪念碑 (Monuments) */}
          {!mapInfo.loading && mapInfo.monuments?.map((mon, i) => {
            const pos = getPos(mon.x, mon.y);
            return (
              <div key={`mon-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-10" style={pos}>
                <div className="w-2 h-2 bg-gray-600/30 border border-gray-600/50 rotate-45" />
                <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[7px] text-gray-700 whitespace-nowrap font-black uppercase tracking-tighter">
                  {mon.name}
                </div>
              </div>
            );
          })}

          {/* 渲染标记 (Markers) */}
          {!mapInfo.loading && (Array.isArray(mapInfo.markers) ? mapInfo.markers : (mapInfo.markers?.markers || [])).map((marker, i) => {
            const pos = getPos(marker.x, marker.y);
            return (
              <div key={`mark-${i}`} className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 z-20" style={pos}>
                <div className="w-full h-full bg-[#cd5241]/20 rounded-full border border-[#cd5241]/40" />
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] text-[#cd5241] whitespace-nowrap font-bold uppercase tracking-tighter">
                  {/* {marker.name || marker.type} */}
                  {/* 简化显示 */}
                </div>
              </div>
            );
          })}

          {/* 锁定目标特效 */}
          {focusTarget && (
            <div className="absolute -translate-x-1/2 -translate-y-1/2 z-50 transition-all duration-500" style={getPos(focusTarget.x, focusTarget.y)}>
              <div className="relative">
                <div className="absolute -inset-10 border border-[#cd5241] rounded-full animate-ping opacity-30" />
                <div className="absolute -inset-6 border-2 border-dashed border-[#cd5241] rounded-full animate-spin-slow opacity-50" />
                <div className="absolute w-20 h-px bg-[#cd5241]/50 -translate-x-1/2 left-1/2" />
                <div className="absolute h-20 w-px bg-[#cd5241]/50 -translate-y-1/2 top-1/2" />
                <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#cd5241] text-white text-[10px] font-black px-3 py-1 tactic-cut whitespace-nowrap shadow-xl">
                  已锁定: {focusTarget.name}
                </div>
              </div>
            </div>
          )}

          {/* 团队成员 */}
          {teamData?.members?.map((member) => {
            const pos = getPos(member.x, member.y);
            return (
              <div key={member.steamId} className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 z-30" style={pos}>
                <div className="relative">
                  <div className={`w-5 h-5 tactic-cut animate-ping absolute opacity-40 ${member.isAlive ? 'bg-[#a3e635]' : 'bg-[#ef4444]'}`} />
                  <div className={`w-5 h-5 tactic-cut relative z-10 border border-white/20 shadow-2xl ${!member.isAlive ? 'bg-[#ef4444] shadow-[#ef4444]/60' :
                    member.isOnline ? 'bg-[#a3e635] shadow-[#a3e635]/60 animate-pulse' :
                      'bg-gray-800'
                    }`} />
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 px-2.5 py-1.5 tactic-cut whitespace-nowrap z-40 shadow-2xl">
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter flex items-center gap-2">
                      {member.name} {!member.isAlive && <span className="text-[#ef4444]">[已阵亡]</span>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!server && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
            <div className="p-8 tactic-border tactic-cut bg-black/80 text-center max-w-sm">
              <FaMapMarkedAlt className="text-4xl text-[#cd5241] mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-black uppercase italic mb-2">地图模块处于演示模式</h3>
              <p className="text-[10px] text-gray-500 uppercase leading-relaxed">连接真实服务器后，系统将自动注入高精度地形情报与实时团队坐标。</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-10 right-10 flex items-center gap-4 opacity-40 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-3 text-xs text-gray-600 font-black uppercase italic tracking-widest">
            正在整合实时地理情报...
          </div>
        </div>
      </div>
    </div >
  );
}

export default App;
