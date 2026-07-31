import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FaTerminal, FaUsers, FaCogs, FaMapMarkedAlt, FaCog,
  FaSignOutAlt, FaPlus, FaClock, FaSatellite, FaShieldAlt,
  FaTimes, FaExpandArrowsAlt, FaPlay, FaRobot, FaBolt, FaLightbulb, FaCrosshairs, FaDoorOpen, FaChartLine,
  FaGlobe, FaTools, FaBell, FaServer, FaAngleDoubleLeft, FaAngleDoubleRight, FaWeixin
} from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import api, { getServers, connectServer, disconnectServer, getMapInfo, getTeamInfo } from './services/api';
import { useToast } from './components/Toast';
import socketService from './services/socket';
import { getCorrectedMapSize } from './utils/coordinates';
import HUDView from './components/HUDView';
import TeamView from './components/TeamView';
import DeviceControl from './components/DeviceControl';
import ChatPanel from './components/ChatPanel';
import PairingWizard from './components/PairingWizard';
import FCMSettings from './components/FCMSettings';
import NotificationSettings from './components/NotificationSettings';
import RaidAlertSettings from './components/RaidAlertSettings';
import AdminPage from './pages/AdminPage';
import MapView from './components/MapView';
import ServerInfoView from './components/ServerInfoView';
import TrackingView from './components/TrackingView';
import CommandsView from './components/CommandsView';
import {
  CONNECTION_STATES,
  getConnectionStateMeta
} from './constants/connection.constants';
import { openContactUs } from './components/ContactUsModal';
import { getFcmGate } from './utils/fcmHealth';

function App() {
  const location = useLocation();
  const { user, logout, isSubscriptionExpired } = useAuth();
  const toast = useToast();

  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [activeView, setActiveView] = useState('hud'); // 'hud', 'team', 'devices', 'settings', 'pairing', 'admin'
  const [navExpanded, setNavExpanded] = useState(false); // 左侧菜单展开/收起（手动控制，不再 hover 自动）
  const [showMapModal, setShowMapModal] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [teamData, setTeamData] = useState(null);
  const [alertLevel, setAlertLevel] = useState(null); // 'none', 'warn', 'critical'
  const [wipeInfo, setWipeInfo] = useState(null);
  const [mapFocusTarget, setMapFocusTarget] = useState(null);
  const [fcmStatus, setFcmStatus] = useState({
    isListening: false,
    hasCredentials: false,
    needsRestore: false,
    isExpired: false
  });

  const [wipeCountdownTick, setWipeCountdownTick] = useState(0);
  const activeConnectionState = activeServer?.connectionState || CONNECTION_STATES.DISCONNECTED;
  const activeConnectionMeta = getConnectionStateMeta(activeConnectionState);
  const canDisconnectActiveServer = Boolean(activeServer) && activeConnectionState !== CONNECTION_STATES.DISCONNECTED;
  const allowedViews = useMemo(
    () => new Set(['hud', 'team', 'map', 'devices', 'tracking', 'serverinfo', 'raid', 'settings', 'pairing', 'admin']),
    []
  );

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

  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view && allowedViews.has(view)) {
      setActiveView(view);
    }
  }, [location.search, allowedViews]);

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

  // FCM 过期/失效：走配对向导（与首次进入一致的凭证配置流程），不要跳到系统设置
  const goRestoreFcm = () => {
    setActiveView('pairing');
  };

  const handleConnect = async (server) => {
    const fcmGate = getFcmGate(fcmStatus);
    if (!fcmGate.canConnectServer) {
      toast.warning(fcmGate.restoreDesc);
      goRestoreFcm();
      return;
    }

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
      const code = e.response?.data?.code;
      const errMsg = e.response?.data?.error || '建立连接失败';
      if (code === 'FCM_RESTORE_REQUIRED') {
        toast.warning(errMsg);
        goRestoreFcm();
      } else {
        toast.error(errMsg);
      }
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

  const handleSwitchServer = (serverId) => {
    const nextServer = servers.find((item) => String(item.id) === String(serverId));
    if (!nextServer) return;

    setActiveServer(nextServer);
    setTeamData(null);
    setWipeInfo(null);
    setMapFocusTarget(null);
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
    // 统一进配对向导：凭证过期时向导内部会停在「获取凭证」步骤（与首次配置一致）
    const openPairing = () => {
      setActiveView('pairing');
    };

    // 配对向导视图（独立处理）
    if (activeView === 'pairing') {
      return (
        <PairingWizard
          fcmStatus={fcmStatus}
          onComplete={() => {
            fetchServers();
            fetchFCMStatus();
            setActiveView('hud');
          }}
          onCancel={() => setActiveView('hud')}
        />
      );
    }

    if (activeView === 'settings') {
      return (
        <ServerSettingsView
          server={activeServer}
          onNavigateToPairing={openPairing}
        />
      );
    }

    // 只有在 HUD 视图且完全没有任何服务器节点时，显示 EmptyState
    // 其他视图允许以演示模式显示
    if (servers.length === 0 && activeView === 'hud') {
      return (
        <EmptyState
          onPair={openPairing}
          onRestoreFcm={goRestoreFcm}
          fcmStatus={fcmStatus}
          isSubscriptionExpired={isSubscriptionExpired}
        />
      );
    }

    // 如果选择了服务器但未连接
    if (activeServer && !activeServer.connected && activeView === 'hud') {
      return (
        <DisconnectedView
          server={activeServer}
          onConnect={() => handleConnect(activeServer)}
          onDisconnect={handleDisconnect}
          onPair={openPairing}
          onRestoreFcm={goRestoreFcm}
          loading={connectionLoading}
          fcmStatus={fcmStatus}
          isSubscriptionExpired={isSubscriptionExpired}
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
            onPair={openPairing}
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
      case 'commands':
        return <CommandsView />;
      case 'raid':
        return <RaidAlertSettings />;
      case 'admin':
        return (
          <div className="h-full animate-fade-in">
            <AdminPage />
          </div>
        );
      default:
        return (
          <HUDView
            server={activeServer}
            teamData={teamData}
            isSubscriptionExpired={isSubscriptionExpired}
            onPair={openPairing}
          />
        );
    }
  };

  return (
    <div className="tac-fx flex h-screen bg-ink-900 text-fg overflow-hidden font-sans relative">
      {/* 全局警报特效 */}
      {alertLevel === 'critical' && <div className="alert-pulse" />}

      {/* 左侧导航轨 (Navigation Rail) - 悬停展开 */}
      <nav className={`h-full flex flex-col py-5 bg-ink-900 border-r border-ink-line z-50 shrink-0 w-16 transition-all duration-300 ease-out overflow-hidden ${navExpanded ? 'md:w-56' : 'md:w-[68px]'}`}>
        <div className="mb-8 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-hazard flex items-center justify-center shrink-0">
              <img src="/logo.svg" alt="Rust+" className="w-6 h-6 object-contain" />
            </div>
            <div className={`transition-opacity duration-300 whitespace-nowrap leading-tight ${navExpanded ? 'opacity-100' : 'opacity-0'}`}>
              <div className="font-mono text-sm font-bold tracking-[0.2em] text-fg">RUST+</div>
              <div className="tac-label">OPS CONSOLE</div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1 min-h-0 overflow-y-auto px-3">
          <NavIcon id="hud" icon={<FaTerminal />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="基地概览" />
          <NavIcon id="team" icon={<FaUsers />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="队友动态" />
          <NavIcon id="map" icon={<FaMapMarkedAlt />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="实时地图" />
          <NavIcon id="devices" icon={<FaCogs />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="智能中控" />
          <NavIcon id="tracking" icon={<FaCrosshairs />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="玩家追踪" />
          <NavIcon id="serverinfo" icon={<FaServer />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="服务器信息" />
          <NavIcon id="commands" icon={<FaRobot />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="游戏命令" />
          <div className="h-px bg-ink-line my-2 mx-1" />
          <NavIcon id="raid" icon={<FaShieldAlt />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="突袭通知" />
          <NavIcon id="settings" icon={<FaCog />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="系统配置" />
          {user?.isAdmin && (
            <NavIcon id="admin" icon={<FaTools />} active={activeView} onClick={setActiveView} expanded={navExpanded} label="管理后台" />
          )}
        </div>

        <div className="mt-auto pt-4 px-3 shrink-0 space-y-1">
          {/* 收起/展开 菜单切换 */}
          <button
            onClick={() => setNavExpanded((v) => !v)}
            title={navExpanded ? '收起菜单' : '展开菜单'}
            className="w-full h-11 flex items-center gap-3 px-3 text-fg-dim hover:bg-ink-800 hover:text-fg transition-colors"
          >
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              {navExpanded ? <FaAngleDoubleLeft className="text-sm" /> : <FaAngleDoubleRight className="text-sm" />}
            </div>
            <span className={`text-[13px] font-bold whitespace-nowrap transition-opacity duration-300 ${navExpanded ? 'opacity-100' : 'opacity-0'}`}>
              收起菜单
            </span>
          </button>

          {/* 用户信息 + 退出 */}
          <button
            onClick={logout}
            className="w-full h-11 bg-ink-800 hover:bg-hazard-dim border border-ink-line hover:border-hazard/40 flex items-center gap-3 px-3 transition-colors group/logout"
            title="退出登录"
          >
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              <FaSignOutAlt className="text-fg-mute group-hover/logout:text-hazard transition-colors" />
            </div>
            <div className={`flex-1 text-left transition-opacity duration-300 overflow-hidden ${navExpanded ? 'opacity-100' : 'opacity-0'}`}>
              <div className="text-[11px] text-fg font-bold truncate">{user?.username}</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-fg-mute">LOGOUT</div>
            </div>
          </button>
        </div>
      </nav>

      {/* 主内容区域 */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* 顶部状态栏 */}
        <header className="min-h-16 flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-3 md:px-6 py-3 md:py-0 bg-ink-900 border-b border-ink-line relative z-40">
          <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="flex flex-col min-w-0 md:min-w-[260px]">
              <span className="tac-label mb-1.5">当前服务器 // SERVER</span>
              {servers.length > 0 ? (
                <div className="flex items-center gap-2 min-w-0">
                  <select
                    value={activeServer?.id || ''}
                    onChange={(e) => handleSwitchServer(e.target.value)}
                    className="min-w-0 w-full md:w-[280px] bg-ink-700 border border-ink-line px-3 py-2 text-xs font-bold text-fg outline-none focus:border-hazard"
                  >
                    {servers.map((server) => {
                      const stateMeta = getConnectionStateMeta(server.connectionState);
                      return (
                        <option key={server.id} value={server.id}>
                          {`${server.name} · ${stateMeta.label}`}
                        </option>
                      );
                    })}
                  </select>
                  <div className={`w-2 h-2 ${activeConnectionMeta.dotClass}`} />
                </div>
              ) : (
                <span className="text-xs text-fg-mute">暂无服务器</span>
              )}
            </div>

            <div className="hidden md:block h-8 w-px bg-ink-line" />

            <div className="flex items-center gap-5 md:gap-6">
              <div className="flex flex-col">
                <span className="tac-label mb-1.5">推送 FCM</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 ${
                    fcmStatus.isExpired || fcmStatus.needsRestore
                      ? 'bg-hazard animate-tac-blink'
                      : fcmStatus.isListening
                        ? 'bg-terminal animate-tac-blink'
                        : 'bg-ink-line2'
                  }`} />
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${
                    fcmStatus.isExpired || fcmStatus.needsRestore
                      ? 'text-hazard'
                      : fcmStatus.isListening
                        ? 'text-fg'
                        : 'text-fg-mute'
                  }`}>
                    {fcmStatus.isExpired ? 'EXPIRED' : fcmStatus.needsRestore ? 'RESTORE' : fcmStatus.isListening ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="tac-label mb-1.5">链路 WS</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 ${activeConnectionMeta.dotClass}`} />
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${
                    activeConnectionState === CONNECTION_STATES.DISCONNECTED ? 'text-fg-mute' : 'text-fg'
                  }`}>
                    {activeConnectionMeta.summary}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3 md:gap-5">
            <div className="hidden sm:flex flex-col items-end">
              <span className="tac-label mb-1.5">清档倒计时 // WIPE</span>
              <span className="font-mono text-sm font-bold text-hazard tabular-nums">{wipeCountdown}</span>
            </div>
            {canDisconnectActiveServer && (
              <button
                onClick={handleDisconnect}
                disabled={connectionLoading}
                className={`tac-btn !py-2 ${
                  connectionLoading
                    ? 'border-ink-line text-fg-mute cursor-not-allowed'
                    : 'border-hazard/40 text-hazard hover:bg-hazard-dim'
                }`}
              >
                {connectionLoading ? activeConnectionMeta.loadingLabel : activeConnectionMeta.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => openContactUs()}
              className="tac-btn tac-btn-ghost !py-2"
              title="联系我们"
            >
              <FaWeixin className="text-hazard" /> 联系我们
            </button>
            <button
              onClick={() => {
                setMapFocusTarget(null);
                setActiveView('map');
              }}
              className="tac-btn tac-btn-ghost !py-2"
            >
              <FaMapMarkedAlt className="text-hazard" /> 实时地图
            </button>
          </div>
        </header>

        {/* 视图内容 */}
        <div className="flex-1 overflow-hidden p-3 md:p-8 relative">
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

function NavIcon({ id, icon, active, onClick, label, expanded }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      title={label}
      className={`relative w-full h-11 flex items-center gap-3 px-3 border-l-2 transition-colors duration-150 ${isActive ? 'bg-hazard-dim border-hazard text-fg' : 'border-transparent text-fg-dim hover:bg-ink-800 hover:text-fg'}`}
    >
      {/* 图标 */}
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        <span className={`text-sm ${isActive ? 'text-hazard' : ''}`}>{icon}</span>
      </div>

      {/* 文字标签 - 跟随菜单展开状态显示 */}
      <span className={`text-[13px] font-bold whitespace-nowrap transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
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
  ];

  return (
    <div className="h-full flex gap-5 animate-fade-in font-sans">
      {/* 左侧导航栏 */}
      <div className="w-56 shrink-0 tac-panel flex flex-col">
        {/* 标题 */}
        <div className="p-5 border-b border-ink-line">
          <div className="tac-label mb-1">SYSTEM CONFIG</div>
          <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
            <FaCog className="text-hazard" /> 系统配置
          </h3>
          {isDemo && (
            <div className="mt-2 font-mono text-[10px] text-hazard border border-hazard/30 bg-hazard-dim px-2 py-1 text-center uppercase tracking-wider">演示模式</div>
          )}
        </div>

        {/* 导航项 */}
        <div className="flex-1 p-2 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left p-3 border-l-2 transition-colors ${
                activeTab === tab.id
                  ? 'bg-hazard-dim border-hazard text-fg'
                  : 'border-transparent hover:bg-ink-800 text-fg-dim hover:text-fg'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={activeTab === tab.id ? 'text-hazard' : 'text-fg-mute'}>{tab.icon}</span>
                <span className="text-sm font-bold">{tab.label}</span>
                <span className="tac-label !text-[9px] ml-auto">{tab.en}</span>
              </div>
              <p className="text-[11px] text-fg-mute mt-1">{tab.desc}</p>
            </button>
          ))}
        </div>

        {/* 底部信息 */}
        <div className="p-4 border-t border-ink-line text-center">
          <p className="font-mono text-[9px] text-fg-mute uppercase tracking-widest">RUST+ DASHBOARD v1.0</p>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 tac-panel overflow-hidden">
        <div className="h-full overflow-y-auto p-6 custom-scrollbar">
          {/* FCM 配置 */}
          {activeTab === 'fcm' && <FCMSettings onNavigateToPairing={onNavigateToPairing} />}

          {/* 通知设置 */}
          {activeTab === 'notifications' && <NotificationSettingsEmbed />}
        </div>
      </div>
    </div>
  );
}

// 嵌入式通知设置组件（复用 NotificationSettings 的逻辑）
function NotificationSettingsEmbed() {
  return (
    <div>
      <div className="mb-5">
        <div className="tac-label mb-1">NOTIFICATIONS</div>
        <h4 className="text-lg font-extrabold text-fg">通知设置</h4>
        <p className="text-[13px] text-fg-dim mt-1">队伍聊天通知配置</p>
      </div>
      <NotificationSettings />
    </div>
  );
}

function DisconnectedView({
  server,
  onConnect,
  onDisconnect,
  onPair,
  onRestoreFcm,
  loading,
  fcmStatus,
  isSubscriptionExpired,
  connectionState = 'DISCONNECTED'
}) {
  const connectionMeta = getConnectionStateMeta(connectionState);
  const fcmGate = getFcmGate(fcmStatus);
  const fcmBlocked = !fcmGate.canConnectServer && !connectionMeta.isPending;
  const isDisabled = loading || (isSubscriptionExpired && !connectionMeta.isPending) || fcmBlocked;
  const actionText = connectionMeta.actionLabel;
  const loadingText = connectionMeta.loadingLabel;
  const fcmReady = fcmGate.isListening && !fcmGate.isExpired && !fcmGate.needsRestore;

  const nextStep = fcmBlocked
    ? {
      title: fcmGate.restoreTitle,
      desc: fcmGate.restoreDesc
    }
    : connectionMeta.isPending
      ? {
        title: '连接请求已发出',
        desc: '你可以继续等待，也可以点击下方按钮取消，再重新发起连接。'
      }
      : isSubscriptionExpired
        ? {
          title: '服务当前已暂停',
          desc: '订阅恢复后即可继续连接服务器并使用实时控制能力。'
        }
        : {
          title: '可直接开始连接',
          desc: 'FCM 与服务器信息已就绪，点击下方按钮即可进入实时控制台。'
        };

  const fcmStatusText = fcmGate.isExpired
    ? '凭证已过期，须先更新后再连接。'
    : fcmReady
      ? '已就绪，可接收游戏内配对推送。'
      : fcmGate.hasCredentials
        ? '未监听或异常，请先恢复 FCM。'
        : '未配置，无法配对设备或安全连接。';

  return (
    <div className="h-full flex items-center justify-center animate-fade-in relative font-sans px-4">
      <div className="max-w-md w-full tac-panel tac-corners relative z-10">
        <div className="p-8">
          {/* 链路图标 */}
          <div className="flex justify-center items-center gap-3 mb-7">
            <div className={`w-14 h-14 border flex flex-col items-center justify-center ${fcmBlocked ? 'border-hazard/40 bg-hazard-dim' : 'border-ink-line'}`}>
              <FaBell className={`text-lg ${fcmReady ? 'text-terminal' : 'text-hazard'}`} />
              <span className="font-mono text-[8px] uppercase mt-1 text-fg-mute">FCM</span>
            </div>
            <div className="font-mono text-fg-mute">· · ·</div>
            <div className="w-16 h-16 border border-hazard/40 bg-hazard-dim flex flex-col items-center justify-center">
              <FaSatellite className={`text-2xl ${loading ? 'animate-spin text-hazard' : connectionMeta.isPending ? 'text-hazard animate-pulse' : 'text-fg-mute'}`} />
              <span className="font-mono text-[8px] uppercase mt-1 text-hazard">LINK</span>
            </div>
          </div>

          {/* 服务器名 */}
          <div className="text-center mb-6">
            <div className="tac-label mb-2">
              {connectionMeta.isPending ? `LINK ESTABLISHING · ${connectionMeta.label}` : 'LINK OFFLINE · 链路未建立'}
            </div>
            <h2 className="text-2xl font-extrabold text-fg tracking-tight truncate">{server.name}</h2>
            <div className="font-mono text-xs text-fg-mute mt-1">{server.ip}:{server.port}</div>
          </div>

          {/* 就绪状态 */}
          <div className="border border-ink-line mb-5">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-line">
              <span className="tac-label">系统就绪状态</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-hazard">
                {connectionMeta.isPending
                  ? '连接中'
                  : isSubscriptionExpired
                    ? '已暂停'
                    : fcmBlocked
                      ? 'FCM 待恢复'
                      : '等待授权'}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className={`mt-1 w-1.5 h-1.5 shrink-0 ${fcmReady ? 'bg-terminal' : 'bg-hazard'}`} />
                <p className="text-[13px] text-fg-dim leading-snug">
                  <span className="text-fg font-bold">推送 FCM:</span> {fcmStatusText}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-1 w-1.5 h-1.5 shrink-0 bg-fg-mute" />
                <p className="text-[13px] text-fg-dim leading-snug">
                  <span className="text-fg font-bold">链路 WS:</span>{' '}
                  {connectionMeta.isPending
                    ? '连接请求已提交，可点击下方取消。'
                    : fcmBlocked
                      ? 'FCM 恢复前禁止发起连接。'
                      : '需手动启动远程连接以激活实时控制台。'}
                </p>
              </div>
            </div>
          </div>

          {/* 建议下一步 */}
          <div className="mb-6 border border-hazard/30 bg-hazard-dim p-4">
            <div className="tac-label !text-hazard mb-1.5">建议下一步 // NEXT</div>
            <p className="text-sm text-fg font-bold">{nextStep.title}</p>
            <p className="text-[13px] text-fg-dim leading-relaxed mt-1">{nextStep.desc}</p>
          </div>

          {/* FCM 需先恢复：主按钮改为恢复凭证 */}
          {fcmBlocked ? (
            <button
              type="button"
              onClick={onRestoreFcm}
              className="tac-btn tac-btn-primary w-full !py-4"
            >
              <FaBell className="text-[10px]" />
              {fcmGate.ctaLabel}
            </button>
          ) : (
            <button
              onClick={connectionMeta.isPending ? onDisconnect : onConnect}
              disabled={isDisabled}
              title={isSubscriptionExpired && !connectionMeta.isPending ? '续费后可连接服务器' : ''}
              className={`tac-btn w-full !py-4 ${isDisabled
                ? '!border-ink-line text-fg-mute cursor-not-allowed'
                : connectionMeta.isPending
                  ? 'bg-hazard-dim !border-hazard/50 text-hazard hover:bg-hazard/20'
                  : 'tac-btn-primary'
                }`}
            >
              {loading ? (
                <>{loadingText}</>
              ) : isSubscriptionExpired && !connectionMeta.isPending ? (
                <>服务已暂停 · 续费后可用</>
              ) : (
                <>
                  {connectionMeta.isPending ? <FaTimes className="text-[10px]" /> : <FaPlay className="text-[10px]" />}
                  {actionText}
                </>
              )}
            </button>
          )}

          {!fcmBlocked && !fcmReady && (
            <button
              onClick={onPair}
              className="tac-btn tac-btn-ghost w-full !py-3 mt-3 !border-hazard/30 !text-hazard hover:!bg-hazard-dim"
            >
              打开配对向导
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPair, onRestoreFcm, fcmStatus, isSubscriptionExpired }) {
  const fcmGate = getFcmGate(fcmStatus);
  const hasCredentials = fcmGate.hasCredentials;
  const fcmBlocked = fcmGate.needsRestore;

  const onboardingTip = fcmBlocked
    ? {
      title: fcmGate.restoreTitle,
      desc: fcmGate.restoreDesc
    }
    : isSubscriptionExpired
      ? {
        title: '凭证已就绪，等待恢复服务',
        desc: '你已经可以接收配对推送，续费后即可继续连接服务器并启用控制。'
      }
      : {
        title: '最后一步：在游戏内完成 Pair',
        desc: '打开 Rust 游戏中的 Rust+ 配对，完成后服务器会自动出现在控制台。'
      };

  return (
    <div className="h-full flex flex-col items-center justify-center relative animate-fade-in font-sans px-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 border border-hazard/40 bg-hazard-dim flex items-center justify-center">
            <FaSatellite className="text-2xl text-hazard" />
          </div>
        </div>

        <div className="text-center mb-8">
          <div className="tac-label mb-2">NO ACTIVE SERVER</div>
          <h2 className="text-2xl font-extrabold text-fg tracking-tight mb-2">未检测到活跃服务器</h2>
          <p className="text-sm text-fg-dim">系统处于待机模式，配对服务器后开启远程监控</p>
        </div>

        {/* 引导提示 */}
        <div className="mb-5 border border-hazard/30 bg-hazard-dim p-4">
          <div className="tac-label !text-hazard mb-1.5">新手引导 // SETUP</div>
          <p className="text-sm text-fg font-bold">{onboardingTip.title}</p>
          <p className="text-[13px] text-fg-dim leading-relaxed mt-1">{onboardingTip.desc}</p>
        </div>

        {/* 状态卡 */}
        <div className="mb-8 border border-ink-line">
          <div className="tac-label px-4 py-2.5 border-b border-ink-line">当前状态 // STATUS</div>
          <StatusRow
            label="FCM 凭证"
            ok={hasCredentials && !fcmGate.isExpired}
            okText={fcmGate.isListening ? '监听中' : '已配置'}
            noText={fcmGate.isExpired ? '已过期' : '未配置'}
            warn={fcmGate.isExpired || fcmGate.needsRestore}
          />
          <StatusRow label="服务器" ok={false} okText="已配对" noText="未配对" />
          <StatusRow label="订阅状态" ok={!isSubscriptionExpired} okText="有效" noText="已过期" warn={isSubscriptionExpired} />
        </div>

        <button
          type="button"
          onClick={fcmBlocked ? onRestoreFcm : onPair}
          className="tac-btn tac-btn-primary w-full !py-4"
        >
          {fcmBlocked ? (
            <><FaBell /> {fcmGate.ctaLabel}</>
          ) : (
            <><FaPlus /> 打开配对向导</>
          )}
        </button>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, okText, noText, warn }) {
  const tone = ok ? 'text-terminal' : warn ? 'text-hazard' : 'text-fg-mute';
  const dot = ok ? 'bg-terminal' : warn ? 'bg-hazard' : 'bg-fg-mute';
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-line last:border-0">
      <span className="text-sm text-fg-dim">{label}</span>
      <span className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider ${tone}`}>
        <span className={`w-1.5 h-1.5 ${dot}`} />
        {ok ? okText : noText}
      </span>
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
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in">
      <header className="h-14 bg-ink-900 border-b border-ink-line flex items-center justify-between px-6 z-50 relative">
        <div className="flex items-center gap-4">
          <FaMapMarkedAlt className="text-hazard text-2xl" />
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-fg flex items-center gap-2">
              集结与战术指挥地图
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-hazard text-white font-bold tracking-[0.15em] inline-flex items-center gap-1">
                <span className="w-1 h-1 bg-white animate-tac-blink" />LIVE
              </span>
            </h2>
            <div className="text-[10px] text-fg-dim font-mono tracking-wider">
              远程地理情报同步中 // [<span className="text-fg">{server?.name}</span>] {server?.type}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Controls */}
          <div className="flex bg-ink-800 border border-ink-line overflow-hidden">
            <button className="px-3 py-1 hover:bg-hazard text-fg hover:text-white transition-colors" onClick={() => setTransform(p => ({ ...p, scale: Math.min(p.scale + 0.2, 5) }))}><FaPlus size={10} /></button>
            <button className="px-3 py-1 hover:bg-hazard text-fg hover:text-white transition-colors" onClick={() => setTransform(p => ({ ...p, scale: Math.max(p.scale - 0.2, 0.5) }))}><FaTimes className="rotate-45" size={10} /></button>
            <button className="px-3 py-1 hover:bg-hazard text-fg hover:text-white transition-colors" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}><FaExpandArrowsAlt size={10} /></button>
          </div>

          <div className="flex gap-4 text-[10px] font-bold text-fg-dim border-l border-ink-line pl-6">
            <span className="tac-label !text-[10px]">MAP <span className="text-fg font-mono tabular-nums normal-case tracking-normal">{mapInfo.mapSize}M</span></span>
            <span className="tac-label !text-[10px]">MARGIN <span className="text-fg font-mono tabular-nums normal-case tracking-normal">{mapInfo.oceanMargin}</span></span>
            <span className="tac-label !text-[10px]">MON <span className="text-fg font-mono tabular-nums normal-case tracking-normal">{mapInfo.monuments?.length || 0}</span></span>
            <span className="tac-label !text-[10px]">SQUAD <span className="text-fg font-mono tabular-nums normal-case tracking-normal">{teamData?.members?.length || 0}</span></span>
          </div>

          <button
            onClick={() => onClose()}
            className="w-8 h-8 flex items-center justify-center border border-ink-line hover:bg-hazard hover:border-hazard transition-colors text-fg-dim hover:text-white ml-2"
            aria-label="关闭地图"
          >
            <FaTimes />
          </button>
        </div>
      </header>

      <div
        ref={mapContainerRef}
        className="flex-1 relative bg-ink-900 border border-ink-line overflow-hidden cursor-crosshair group"
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
                <div className="w-2 h-2 bg-fg-mute/20 border border-fg-mute/40 rotate-45" />
                <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[7px] text-fg-mute whitespace-nowrap font-mono font-bold uppercase tracking-tighter">
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
                <div className="w-full h-full bg-hazard/20 border border-hazard/50 rotate-45" />
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] text-hazard whitespace-nowrap font-mono font-bold uppercase tracking-tighter">
                  {/* {marker.name || marker.type} */}
                  {/* 简化显示 */}
                </div>
              </div>
            );
          })}

          {/* 锁定目标特效（雷达锁定环：圆形为雷达扫描语义） */}
          {focusTarget && (
            <div className="absolute -translate-x-1/2 -translate-y-1/2 z-50 transition-all duration-500" style={getPos(focusTarget.x, focusTarget.y)}>
              <div className="relative">
                <div className="absolute -inset-10 border border-hazard rounded-full animate-ping opacity-30" />
                <div className="absolute -inset-6 border-2 border-dashed border-hazard rounded-full animate-spin-slow opacity-50" />
                <div className="absolute w-20 h-px bg-hazard/50 -translate-x-1/2 left-1/2" />
                <div className="absolute h-20 w-px bg-hazard/50 -translate-y-1/2 top-1/2" />
                <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-hazard text-white text-[10px] font-bold px-3 py-1 whitespace-nowrap flex items-center gap-1.5">
                  <span className="font-mono uppercase tracking-[0.15em]">LOCK</span> 已锁定: {focusTarget.name}
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
                  <div className={`w-5 h-5 animate-ping absolute opacity-40 ${member.isAlive ? 'bg-terminal' : 'bg-hazard'}`} />
                  <div className={`w-5 h-5 relative z-10 border ${!member.isAlive ? 'bg-hazard border-hazard-bright' :
                    member.isOnline ? 'bg-terminal border-terminal animate-tac-blink' :
                      'bg-ink-700 border-ink-line2'
                    }`} />
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-ink-900 border border-ink-line px-2.5 py-1.5 whitespace-nowrap z-40">
                    <span className="text-[10px] font-bold text-fg flex items-center gap-2">
                      {member.name} {!member.isAlive && <span className="text-hazard font-mono">[已阵亡]</span>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!server && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-900/70 z-50">
            <div className="p-8 tac-panel tac-corners text-center max-w-sm">
              <FaMapMarkedAlt className="text-4xl text-hazard mx-auto mb-4" />
              <div className="tac-label mb-2">DEMO MODE</div>
              <h3 className="text-xl font-extrabold text-fg mb-2">地图模块处于演示模式</h3>
              <p className="text-xs text-fg-dim leading-relaxed">连接真实服务器后，系统将自动注入高精度地形情报与实时团队坐标。</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-10 right-10 flex items-center gap-4 opacity-40 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-3 text-xs text-fg-mute font-mono uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" /> SYNCING GEO-INTEL // 正在整合实时地理情报…
          </div>
        </div>
      </div>
    </div >
  );
}

export default App;
