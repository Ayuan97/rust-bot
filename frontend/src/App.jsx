import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaTerminal, FaUsers, FaCogs, FaMapMarkedAlt, FaCog, 
  FaSignOutAlt, FaPlus, FaClock, FaSatellite, FaShieldAlt, 
  FaTimes, FaExpandArrowsAlt, FaPlay, FaRobot, FaBolt, FaLightbulb, FaCrosshairs, FaDoorOpen, FaChartLine,
  FaGlobe, FaTools
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { getServers, connectServer } from './services/api';
import { useToast } from './components/Toast';
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

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const res = await getServers();
      setServers(res.data.servers || []);
      if (res.data.servers?.length > 0 && !activeServer) {
        setActiveServer(res.data.servers[0]);
      }
    } catch (e) {
      console.error('获取服务器列表失败', e);
    }
  };

  const handleConnect = async (server) => {
    setConnectionLoading(true);
    try {
      const res = await connectServer(server.id);
      if (res.data.success) {
        toast.success(`远程连接已建立: ${server.name}`);
        fetchServers();
      }
    } catch (e) {
      toast.error('连接建立失败，请检查服务器状态');
    } finally {
      setConnectionLoading(false);
    }
  };

  const isSubscriptionExpired = user?.subscription_status === 'expired';

  // --- Render Views ---
  const renderView = () => {
    // 只有在完全没有任何服务器节点时，才在概览页显示 EmptyState
    if (servers.length === 0 && activeView === 'hud') {
      return <EmptyState onPair={() => setShowPairingPanel(true)} />;
    }

    // 如果选择了服务器但未连接
    if (activeServer && !activeServer.connected && activeView === 'hud') {
      return <DisconnectedView server={activeServer} onConnect={() => handleConnect(activeServer)} loading={connectionLoading} />;
    }

    // 根据当前视图渲染内容，每个子组件内部处理自己的“无数据/演示”状态
    switch (activeView) {
      case 'hud': 
        return <HUDView server={activeServer} teamData={teamData} isSubscriptionExpired={isSubscriptionExpired} onPair={() => setShowPairingPanel(true)} />;
      case 'team': 
        return <TeamView server={activeServer} teamData={teamData} />;
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
    <div className="flex h-screen bg-[#0D0E10] text-[#e0e0e0] overflow-hidden font-sans">
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
                <span className="text-sm font-black text-white uppercase italic tracking-tight truncate max-w-[200px]">
                  {activeServer ? activeServer.name : '未选择服务器'}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ${activeServer?.connected ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635]' : 'bg-gray-800'}`} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-none mb-1">强制清档倒计时</span>
              <span className="text-xs font-mono font-black text-[#cd5241]">122:45:12</span>
            </div>
            <button 
              onClick={() => setShowMapModal(true)}
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
    <button onClick={() => onClick(id)} className={`group relative w-12 h-12 flex items-center justify-center tactic-cut transition-all ${isActive ? 'bg-[#cd5241] text-white shadow-lg shadow-[#cd5241]/20' : 'text-gray-600 hover:bg-white/5 hover:text-gray-300'}`} title={label}>
      {icon}
      {!isActive && <div className="absolute left-16 px-3 py-2 bg-[#121417] border border-white/10 text-[10px] text-white font-black whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 tactic-cut uppercase tracking-widest">{label}</div>}
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

function DisconnectedView({ server, onConnect, loading }) {
  return (
    <div className="h-full flex items-center justify-center animate-fade-in relative overflow-hidden font-sans">
      <div className="max-w-md w-full tactic-border tactic-cut p-1 bg-black/40 relative z-10 shadow-2xl">
        <div className="bg-black/40 p-10 text-center relative overflow-hidden">
          <div className="scanline"></div>
          
          <div className="flex justify-center mb-8">
             <div className="w-20 h-20 bg-gray-800/30 border border-white/5 tactic-cut flex items-center justify-center relative">
                <FaSatellite className="text-3xl text-gray-700 animate-pulse" />
                <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#ef4444] animate-ping rounded-full" />
             </div>
          </div>

          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter glow-text italic">{server.name}</h2>
          <div className="flex items-center justify-center gap-3 mb-10">
             <span className="text-gray-500 font-mono text-xs uppercase tracking-widest">{server.ip}:{server.port}</span>
             <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
             <span className="text-gray-600 font-black text-xs uppercase italic">离线状态</span>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-5 tactic-cut mb-10 text-left">
             <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">连接就绪状态</span>
                <span className="text-[10px] text-[#cd5241] font-black uppercase italic">等待指挥官授权</span>
             </div>
             <div className="space-y-3">
                <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                   <div className="h-full bg-gray-700 w-1/3" />
                </div>
                <p className="text-[9px] text-gray-600 font-medium leading-relaxed">
                  系统已就绪，正在等待指挥官发起远程连接。建立连接后，即可恢复对基地的实时监控与设备远程操作。
                </p>
             </div>
          </div>

          <button 
            onClick={onConnect} 
            disabled={loading} 
            className="w-full tactic-cut bg-[#cd5241] py-6 font-black uppercase tracking-[0.3em] hover:bg-[#b04537] transition-all shadow-2xl shadow-[#cd5241]/20 flex items-center justify-center gap-4 group text-lg"
          >
            {loading ? (
              <>正在建立远程链路...</>
            ) : (
              <>
                <FaPlay className="text-xs group-hover:scale-110 transition-transform" /> 
                启动远程连接
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* 背景装饰 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12vw] font-black text-white/[0.02] pointer-events-none select-none italic uppercase">
        Disconnected
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

function TacticalMapModal({ server, teamData, onClose }) {
  const [mapInfo, setMapInfo] = useState({ markers: [], mapSize: 4500, monuments: [], loading: true });

  useEffect(() => {
    if (!server) {
      setMapInfo({ markers: [], mapSize: 4500, monuments: [], loading: false });
      return;
    }
    const fetchMap = async () => {
      try {
        const { getMapInfo } = await import('./services/api');
        const res = await getMapInfo(server.id);
        if (res.data.success) {
          setMapInfo({ ...res.data, loading: false });
        }
      } catch (e) {
        console.error('地图数据同步失败', e);
      }
    };
    fetchMap();
  }, [server?.id]);

  const getPos = (x, y) => {
    const size = mapInfo.mapSize;
    const left = ((x + size / 2) / size) * 100;
    const top = (1 - (y + size / 2) / size) * 100; 
    return { left: `${left}%`, top: `${top}%` };
  };

  return (
    <div className="fixed inset-0 bg-black/98 backdrop-blur-xl z-[100] flex flex-col p-8 animate-fade-in font-sans">
      <div className="scanline"></div>
      
      <header className="flex justify-between items-center mb-8 border-b border-white/10 pb-6 relative z-10">
        <div className="flex items-center gap-8">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter italic glow-text">全图动态资源地图</h2>
            <p className="text-[10px] text-gray-500 uppercase mt-1 tracking-widest font-bold">远程地理情报同步中 // {server?.name || 'DEMO_NODE'}</p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="flex gap-10 text-[11px] text-gray-500 uppercase font-black italic">
             <div><span className="text-gray-700 mr-2">地图大小:</span> {mapInfo.mapSize}m</div>
             <div><span className="text-gray-700 mr-2">更新状态:</span> {mapInfo.loading ? '正在获取...' : '实时在线'}</div>
             <div><span className="text-gray-700 mr-2">团队成员:</span> {teamData?.members?.length || 0}人</div>
          </div>
        </div>
        <button onClick={onClose} className="w-14 h-14 tactic-cut bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-[#cd5241] hover:text-white transition-all group">
          <FaTimes className="text-xl group-hover:scale-110 transition-transform" />
        </button>
      </header>

      <div className="flex-1 relative bg-[#090a0c] tactic-border tactic-cut overflow-hidden cursor-crosshair group shadow-inner">
         <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
         
         {!mapInfo.loading && mapInfo.markers.map((marker, i) => {
           const pos = getPos(marker.x, marker.y);
           return (
             <div key={i} className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2" style={pos}>
                <div className="w-full h-full bg-white/10 rounded-full border border-white/5" />
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] text-gray-700 whitespace-nowrap font-bold uppercase tracking-tighter">
                  {marker.name || marker.type}
                </div>
             </div>
           );
         })}

         {teamData?.members?.map((member) => {
           const pos = getPos(member.x, member.y);
           return (
             <div key={member.steamId} className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 z-30" style={pos}>
                <div className="relative">
                   <div className={`w-5 h-5 tactic-cut animate-ping absolute opacity-40 ${member.isAlive ? 'bg-[#a3e635]' : 'bg-[#ef4444]'}`} />
                   <div className={`w-5 h-5 tactic-cut relative z-10 border border-white/20 shadow-2xl ${
                     !member.isAlive ? 'bg-[#ef4444] shadow-[#ef4444]/60' : 
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
    </div>
  );
}

export default App;
