import React, { useState, useEffect } from 'react';
import { FaUsers, FaChartLine, FaMapMarkerAlt, FaHeartbeat, FaClock, FaSkullCrossbones, FaExclamationTriangle, FaInfoCircle, FaShieldAlt, FaHammer, FaCrosshairs, FaGhost } from 'react-icons/fa';
import { coordsToGrid, formatActiveTime } from '../utils/mapUtils';
import { getTeamDetailed } from '../services/api';

export default function TeamView({ server, teamData, onLocate }) {
  const [activeTab, setActiveTab] = useState('members');
  const [detailedMembers, setDetailedMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 只有在没有服务器或服务器未连接时才是演示模式
  const isDemo = !server || !server.connected;

  useEffect(() => {
    if (isDemo) {
      setDetailedMembers([
        { steamId: '1', name: '演示玩家_A', x: 100, y: 200, isOnline: true, isAlive: true, avatar: null, playtime: 1250, vacBanned: false, contribution: { gather_stone: 5500, kill_npc: 12 } },
        { steamId: '2', name: '演示玩家_B', x: -50, y: 300, isOnline: true, isAlive: false, avatar: null, playtime: 450, vacBanned: true, contribution: { gather_wood: 8200, players_killed: 3 } },
        { steamId: '3', name: '演示玩家_C', x: 400, y: -100, isOnline: false, isAlive: true, avatar: null, playtime: 3200, vacBanned: false, contribution: { gather_metal: 1200, kill_npc: 45 } },
      ]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await getTeamDetailed(server.id);
        if (res.data.success) {
          setDetailedMembers(res.data.members || []);
        }
      } catch (e) {
        console.error('获取详细队伍数据失败:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // 30秒更新一次
    return () => clearInterval(interval);
  }, [server?.id, isDemo]);

  const teammates = detailedMembers.map(m => ({
    ...m,
    grid: coordsToGrid(m.x, m.y, server?.mapSize || 4500),
    activeTime: formatActiveTime(m.spawnTime)
  }));

  const hasNoTeam = !isDemo && teammates.length === 0;

  // 贡献榜排序
  const contributionRank = [...teammates].sort((a, b) => {
    const sumA = Object.values(a.contribution || {}).reduce((acc, v) => acc + v, 0);
    const sumB = Object.values(b.contribution || {}).reduce((acc, v) => acc + v, 0);
    return sumB - sumA;
  });

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in font-sans">
      {/* 顶部标题与切换 */}
      <div className="flex justify-between items-end border-b border-white/10 pb-6">
        <div>
          <h3 className="text-3xl font-black italic glow-text uppercase">队友状态看板</h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
            <FaInfoCircle className="text-[#cd5241]" /> 实时对接 Steam 与 Rust 数据，精准追踪团队贡献与生理指标
          </p>
        </div>
        <div className="flex gap-2 p-1 bg-black/40 tactic-cut border border-white/5 shadow-inner">
          <TabBtn
            active={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            icon={<FaUsers />}
            label="团队矩阵"
          />
          <TabBtn
            active={activeTab === 'ranking'}
            onClick={() => setActiveTab('ranking')}
            icon={<FaChartLine />}
            label="今日贡献榜"
          />
        </div>
      </div>

      {isDemo && (
        <div className="bg-[#cd5241]/10 border-l-4 border-[#cd5241] p-4 flex items-center gap-4 animate-pulse">
          <FaExclamationTriangle className="text-[#cd5241] text-xl flex-shrink-0" />
          <div className="text-xs text-gray-300">
            <span className="font-black text-white uppercase mr-2">[ 演示模式 ]</span>
            当前未连接服务器。配对成功后，将自动同步 Steam 资料与统计数据。
          </div>
        </div>
      )}

      {hasNoTeam && (
        <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 flex items-center gap-4">
          <FaInfoCircle className="text-blue-500 text-xl flex-shrink-0" />
          <div className="text-xs text-gray-300">
            <span className="font-black text-white uppercase mr-2">[ 未加入队伍 ]</span>
            你还没有加入队伍。请在游戏中创建或加入队伍，然后刷新页面。
          </div>
        </div>
      )}

      {activeTab === 'members' ? (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {teammates.map((member) => (
              <PlayerCard key={member.steamId} member={member} />
            ))}
          </div>
        </div>
      ) : (
        /* --- 今日贡献排行榜 --- */
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="p-5 bg-white/[0.02] border border-white/10 tactic-cut mb-10 flex items-start gap-4">
              <FaChartLine className="text-[#cd5241] text-xl mt-1" />
              <p className="text-xs text-gray-400 leading-relaxed font-medium">
                <span className="text-white font-bold block mb-1 uppercase tracking-widest">今日贡献计算规则</span>
                基于每日 00:00 (或首次上线) 的数据快照进行差值计算。数据涵盖击杀 NPC、玩家及核心资源采集。
              </p>
            </div>

            {contributionRank.map((item, index) => (
              <div key={item.steamId} className="tactic-border tactic-cut p-1 bg-black/20 group hover:bg-[#cd5241]/5 transition-all">
                <div className="bg-black/40 p-6 flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <div className={`text-4xl font-black italic ${index === 0 ? 'text-[#cd5241] scale-110' : 'text-gray-800'}`}>
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 tactic-cut bg-gray-800 overflow-hidden border border-white/10">
                        {item.avatar ? <img src={item.avatar} alt="" className="w-full h-full object-cover" /> : <FaUsers className="w-full h-full p-3 text-gray-600" />}
                      </div>
                      <div>
                        <div className="text-xl font-black uppercase tracking-tight">{item.name}</div>
                        <div className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] mt-1">
                          {index === 0 ? '首席战功获得者' : '核心团队成员'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-12">
                    <div className="hidden sm:block">
                      <div className="text-[10px] text-gray-600 font-black uppercase mb-2 tracking-widest text-right">主要产出</div>
                      <div className="flex gap-2">
                        {Object.entries(item.contribution || {}).filter(([_, v]) => v > 0).slice(0, 2).map(([k, v]) => (
                          <span key={k} className="text-[10px] font-bold bg-[#cd5241]/10 px-2 py-0.5 tactic-cut text-[#cd5241] uppercase">{k.replace('gather_', '')}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-600 font-black uppercase mb-2 tracking-widest text-right">今日累计增量</div>
                      <div className="text-2xl font-mono font-black text-[#a3e635]">
                        +{Object.values(item.contribution || {}).reduce((a, b) => a + b, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCard({ member }) {
  const isDead = !member.isAlive;
  const isOffline = !member.isOnline;

  return (
    <div className={`tactic-border tactic-cut p-1 bg-black/30 group hover:border-[#cd5241]/50 transition-all ${isDead ? 'opacity-80' : ''}`}>
      <div className="bg-black/40 p-5 relative overflow-hidden h-full flex flex-col">
        {/* 背景装饰 - 封禁预警 */}
        {member.vacBanned && (
          <div className="absolute inset-0 bg-red-900/10 pointer-events-none flex items-center justify-center">
            <div className="text-[100px] text-red-600/10 -rotate-12 font-black italic select-none">BANNED</div>
          </div>
        )}

        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 tactic-cut relative overflow-hidden border-2 shadow-lg transition-all ${member.isOnline ? 'border-[#a3e635]/50 shadow-[#a3e635]/10' :
              isDead ? 'border-[#ef4444]/50 animate-pulse shadow-[#ef4444]/20' :
                'border-white/5 grayscale saturate-50'
              }`}>
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  {isDead ? <FaSkullCrossbones className="text-2xl text-red-500" /> : <FaUsers className="text-2xl text-gray-600" />}
                </div>
              )}
              {/* 在线状态小圆点 */}
              <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-black rounded-full ${member.isOnline ? 'bg-[#a3e635]' : 'bg-gray-700'}`} />
            </div>
            <div>
              <div className="text-base font-black truncate max-w-[100px] flex items-center gap-2">
                {member.name}
                {member.vacBanned && <FaExclamationTriangle className="text-red-500 text-xs" title="Steam 封禁记录" />}
              </div>
              <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">
                {isOffline ? '离线 OFF' : isDead ? '已阵亡 DEAD' : '在线 ON'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-black text-[#cd5241] leading-none">[{member.grid}]</div>
            <div className="text-[8px] text-gray-600 font-bold uppercase mt-2 tracking-tighter">GRID_COORD</div>
          </div>
        </div>

        {/* 核心统计数据预览 */}
        <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
          <StatSmall icon={<FaCrosshairs />} label="今日击杀" value={member.contribution?.players_killed || 0} color="text-red-500" />
          <StatSmall icon={<FaGhost />} label="今日NPC" value={member.contribution?.kill_npc || 0} color="text-[#3b82f6]" />
          <StatSmall icon={<FaHammer />} label="今日木材" value={member.contribution?.gather_wood || 0} />
          <StatSmall icon={<FaHammer />} label="今日金属" value={member.contribution?.gather_metal || 0} />
        </div>

        <div className="mt-auto space-y-4 relative z-10 pt-4 border-t border-white/5">
          <div className="flex justify-between items-center text-[10px] font-bold text-gray-600">
            <div className="flex items-center gap-2"><FaClock className="text-[#cd5241]" /> {Math.round(member.playtime / 60)}H 总时长</div>
            <div className="uppercase tracking-tighter opacity-50">#{member.steamId.slice(-4)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatSmall({ icon, label, value, color = "text-gray-400" }) {
  return (
    <div className="bg-white/[0.03] p-2 tactic-cut border border-white/5">
      <div className="text-[8px] text-gray-600 font-black uppercase truncate mb-1">{label}</div>
      <div className={`flex items-center gap-2 text-xs font-mono font-black ${value > 0 ? 'text-[#a3e635]' : 'text-gray-700'}`}>
        <span className={color}>{icon}</span>
        {value > 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-8 py-3 tactic-cut text-xs font-black uppercase transition-all duration-300 ${active ? 'bg-[#cd5241] text-white shadow-xl shadow-[#cd5241]/20' : 'text-gray-600 hover:text-gray-300'
        }`}
    >
      <span className={active ? 'animate-pulse' : ''}>{icon}</span> {label}
    </button>
  );
}

