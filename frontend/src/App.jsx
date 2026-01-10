import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FaTerminal, FaUsers, FaCogs, FaMapMarkedAlt, FaCog,
  FaSignOutAlt, FaPlus, FaClock, FaSatellite, FaShieldAlt,
  FaTimes, FaExpandArrowsAlt, FaPlay, FaRobot, FaBolt, FaLightbulb, FaCrosshairs, FaDoorOpen, FaChartLine,
  FaGlobe, FaTools, FaBell
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { getServers, connectServer, getMapInfo, api } from './services/api';
import { useToast } from './components/Toast';
import socketService from './services/socket';
import { getCorrectedMapSize } from './utils/coordinates';
import HUDView from './components/HUDView';
import TeamView from './components/TeamView';
import DeviceControl from './components/DeviceControl';
import ChatPanel from './components/ChatPanel';
import SubscriptionStatus from './components/SubscriptionStatus';
import PairingPanel from './components/PairingPanel';
import AdminPage from './pages/AdminPage';

function App() {
  const { user, logout } = useAuth();
  const toast = useToast();

  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [activeView, setActiveView] = useState('hud'); // 'hud', 'team', 'devices', 'settings', 'proxy'
  const [showPairingPanel, setShowPairingPanel] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [teamData, setTeamData] = useState(null);
  const [alertLevel, setAlertLevel] = useState(null); // 'none', 'warn', 'critical'
  const [wipeInfo, setWipeInfo] = useState(null);
  const [mapFocusTarget, setMapFocusTarget] = useState(null);
  const [fcmStatus, setFcmStatus] = useState({ isListening: false, hasCredentials: false });

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
      const res = await api.get(`/servers/${serverId}/team`);
      if (res.data.success) {
        setTeamData(res.data.team);
      }
    } catch (e) {
      console.log('初始队伍数据获取失败');
    }
  };

  const fetchServers = async () => {
    try {
      const res = await getServers();
      const allServers = res.data.servers || [];
      // 过滤掉 FCM 占位符服务器 (IP 为 0.0.0.0)
      const gameServers = allServers.filter(s => s.ip !== '0.0.0.0');

      setServers(gameServers);
      if (gameServers.length > 0 && !activeServer) {
        setActiveServer(gameServers[0]);
      }
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
      const res = await api.get(`/servers/${serverId}/battlemetrics`);
      if (res.data.success) {
        setWipeInfo(res.data.data);
      }
    } catch (e) {
      console.log('Battlemetrics 获取失败');
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
        toast.success(`远程链路已激活: ${server.name}`);
        fetchServers();
      }
    } catch (e) {
      toast.error('远程链路建立失败，请检查服务器 token');
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
    setShowMapModal(true);
  };

  const isSubscriptionExpired = user?.subscription_status === 'expired';

  // 计算倒计时
  const wipeCountdown = useMemo(() => {
    if (!wipeInfo?.nextWipe) return '128:45:12'; // 默认值
    const next = new Date(wipeInfo.nextWipe).getTime();
    const now = new Date().getTime();
    const diff = next - now;
    if (diff <= 0) return '00:00:00';

    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [wipeInfo, Math.floor(Date.now() / 10000)]); // 每10秒更新一次

  // --- Render Views ---
  const renderView = () => {
    // 只有在完全没有任何服务器节点时，显示 EmptyState
    if (servers.length === 0 && activeView !== 'admin') {
      return <EmptyState onPair={() => setShowPairingPanel(true)} />;
    }

    // 如果选择了服务器但未连接
    if (activeServer && !activeServer.connected && activeView === 'hud') {
      return <DisconnectedView server={activeServer} onConnect={() => handleConnect(activeServer)} loading={connectionLoading} fcmStatus={fcmStatus} />;
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
            onPair={() => setShowPairingPanel(true)}
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
      case 'devices':
        return <DeviceControl serverId={activeServer?.id} isReadOnly={isSubscriptionExpired} />;
      case 'settings':
        return <ServerSettingsView server={activeServer} />;
      case 'admin':
        return (
          <div className="h-full animate-fade-in">
            <AdminPage />
          </div>
        );
      default:
        return <HUDView server={activeServer} teamData={teamData} isSubscriptionExpired={isSubscriptionExpired} onPair={() => setShowPairingPanel(true)} />;
    }
  };

  return (
    <div className={`flex h-screen bg-[#0D0E10] text-[#e0e0e0] overflow-hidden font-sans relative`}>
      {/* 全局警报特效 */}
      {alertLevel === 'critical' && <div className="alert-pulse" />}

      {/* 左侧导航轨 (Navigation Rail) */}
      <nav className="w-20 flex flex-col items-center py-8 bg-[#090a0c] border-r border-white/5 z-50">
        <div className="mb-12">
          <div className="w-12 h-12 bg-[#cd5241] tactic-cut flex items-center justify-center shadow-lg shadow-[#cd5241]/20">
            <FaSatellite className="text-white text-xl animate-pulse" />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          <NavIcon id="hud" icon={<FaTerminal />} active={activeView} onClick={setActiveView} label="基地概览" />
          <NavIcon id="team" icon={<FaUsers />} active={activeView} onClick={setActiveView} label="队友动态" />
          <NavIcon id="devices" icon={<FaCogs />} active={activeView} onClick={setActiveView} label="智能中控" />
          <div className="h-px w-8 bg-white/5 mx-auto my-2" />
          <NavIcon id="settings" icon={<FaCog />} active={activeView} onClick={setActiveView} label="预警配置" />
          {user?.isAdmin && (
            <NavIcon id="admin" icon={<FaTools />} active={activeView} onClick={setActiveView} label="领地柜总控" />
          )}
        </div>

        <div className="mt-auto flex flex-col gap-6">
          <button onClick={logout} className="p-3 text-gray-600 hover:text-[#ef4444] transition-colors" title="退出系统">
            <FaSignOutAlt />
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
                  <div className={`w-1.5 h-1.5 rounded-full ${activeServer?.connected ? 'bg-[#3b82f6] shadow-[0_0_8px_#3b82f6]' : 'bg-gray-800'}`} />
                  <span className={`text-[9px] font-black uppercase ${activeServer?.connected ? 'text-gray-300' : 'text-gray-600'}`}>
                    {activeServer?.connected ? '已连接' : '未建立'}
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
            <button
              onClick={() => {
                setMapFocusTarget(null);
                setShowMapModal(true);
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

      {/* 配对模态框 */}
      {showPairingPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="w-full max-w-xl tactic-border tactic-cut p-1 bg-black/60 relative">
            <button
              onClick={() => setShowPairingPanel(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-20"
            >
              <FaTimes />
            </button>
            <div className="bg-black/80 p-6">
              <div className="flex items-center gap-4 mb-6 border-b border-white/5 pb-4">
                <div className="w-10 h-10 bg-[#cd5241]/20 tactic-cut flex items-center justify-center text-[#cd5241]">
                  <FaSatellite className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase italic text-white tracking-tighter">添加服务器配对</h3>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">请按照下方指引完成 Rust+ 链路建立</p>
                </div>
              </div>
              <PairingPanel onServerPaired={() => {
                fetchServers();
                setShowPairingPanel(false);
              }} />
            </div>
          </div>
        </div>
      )}

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
      className={`group relative w-12 h-12 tactic-cut flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-[#cd5241] text-white shadow-lg shadow-[#cd5241]/20 scale-110' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'}`}
    >
      <span className="text-sm">{icon}</span>
      <div className={`absolute left-0 w-1 bg-white transition-all duration-300 ${isActive ? 'h-6' : 'h-0'}`} />

      {/* Tooltip */}
      <div className="absolute left-16 bg-black border border-white/10 px-3 py-1.5 tactic-cut opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60] shadow-2xl block">
        <span className="text-[8px] font-black uppercase tracking-widest text-white">{label}</span>
      </div>
    </button>
  );
}

function ServerSettingsView({ server }) {
  const isDemo = !server;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in font-sans">
      <div className="tactic-border tactic-cut p-1 bg-black/40 shadow-2xl">
        <div className="bg-black/40 p-8">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-2xl font-black uppercase mb-2 italic glow-text flex items-center gap-3">
                <FaShieldAlt className="text-[#cd5241]" /> 全局预警配置
              </h3>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.3em]">通知触发规则与自动化响应设置</p>
            </div>
            {isDemo && (
              <div className="px-3 py-1 bg-[#cd5241]/10 border border-[#cd5241]/30 text-[#cd5241] text-[9px] font-black tactic-cut animate-pulse">
                演示模式
              </div>
            )}
          </div>

          <div className="space-y-8">
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
          </div>

          {isDemo && (
            <div className="mt-12 p-6 bg-white/[0.02] border border-dashed border-white/10 tactic-cut text-center">
              <p className="text-xs text-gray-600 italic">你可以在这里配置所有的自动化逻辑。请先在左侧选择或添加一个活跃的服务器节点。</p>
            </div>
          )}
        </div>
      </div>
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

function DisconnectedView({ server, onConnect, loading, fcmStatus }) {
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
              <FaSatellite className={`text-3xl ${loading ? 'animate-spin' : 'text-gray-700'} ${server.connected ? 'text-[#a3e635]' : ''}`} />
              <span className="text-[8px] font-black mt-1 uppercase text-[#cd5241]">Satellite</span>
            </div>
          </div>

          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter glow-text italic">{server.name}</h2>
          <div className="flex items-center justify-center gap-3 mb-10">
            <span className="text-gray-500 font-mono text-xs uppercase tracking-widest">{server.ip}:{server.port}</span>
            <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
            <span className="text-[#cd5241] font-black text-xs uppercase italic">卫星链路未建立</span>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-5 tactic-cut mb-10 text-left">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">系统就绪状态</span>
              <span className="text-[10px] text-[#cd5241] font-black uppercase italic">等待远程授权</span>
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
                  <span className="text-gray-300 font-bold">实时链路 (WS):</span> 需要您手动启动“远程连接”来激活此服务器的实时控制面板。
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onConnect}
            disabled={loading}
            className="w-full tactic-cut bg-[#cd5241] py-6 font-black uppercase tracking-[0.3em] hover:bg-[#b04537] transition-all shadow-2xl shadow-[#cd5241]/20 flex items-center justify-center gap-4 group text-lg"
          >
            {loading ? (
              <>正在握手加密协议...</>
            ) : (
              <>
                <FaPlay className="text-xs group-hover:scale-110 transition-transform" />
                建立卫星远程连接
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

function EmptyState({ onPair }) {
  return (
    <div className="h-full flex flex-col items-center justify-center relative animate-fade-in font-sans">
      <div className="relative z-10 text-center max-w-xl">
        <div className="flex justify-center mb-10">
          <div className="w-24 h-24 tactic-cut bg-[#cd5241]/10 border border-[#cd5241]/30 flex items-center justify-center relative group">
            <FaSatellite className="text-4xl text-[#cd5241] animate-bounce" />
            <div className="absolute -inset-4 border border-[#cd5241]/10 tactic-cut animate-ping" />
          </div>
        </div>

        <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4 glow-text">
          未检测到活跃服务器
        </h2>

        <p className="text-gray-500 text-sm mb-12 leading-relaxed font-medium">
          系统处于待机模式。你需要先配对一个 Rust+ 服务器来开启远程监控功能。
          <br />建立连接后，即可获得实时的基地预警、队友状态追踪和远程开关控制。
        </p>

        <button
          onClick={onPair}
          className="group relative px-16 py-6 bg-[#cd5241] text-white font-black uppercase italic tactic-cut hover:scale-105 transition-all shadow-2xl shadow-[#cd5241]/30 overflow-hidden text-xl"
        >
          <span className="relative z-10 flex items-center gap-4">
            <FaPlus /> 立即添加服务器
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
