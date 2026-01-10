import React, { useState, useEffect } from 'react';
import { FaUsers, FaChartLine, FaMapMarkerAlt, FaHeartbeat, FaClock, FaSkullCrossbones, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import { api } from '../services/api';
import { getGrid } from '../utils/coordinates';

export default function TeamView({ server, teamData, onLocate }) {
  const [activeTab, setActiveTab] = useState('members');
  const [rankings, setRankings] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [mapSize, setMapSize] = useState(4000);

  useEffect(() => {
    if (server?.id) {
      fetchMapInfo();
      fetchRankings();
    }
  }, [server?.id]);

  const fetchMapInfo = async () => {
    try {
      const res = await api.get(`/servers/${server.id}/map-info`);
      if (res.data.success && res.data.mapSize) {
        setMapSize(res.data.mapSize);
      }
    } catch (e) {
      console.error('获取地图信息失败');
    }
  };

  const fetchRankings = async () => {
    setLoadingRankings(true);
    try {
      const res = await api.get(`/servers/${server.id}/battlemetrics/top-players?days=7`);
      if (res.data.success) {
        setRankings(res.data.players.slice(0, 10).map((p, i) => ({
          rank: i + 1,
          name: p.name,
          value: (p.playtime / 3600).toFixed(1) + 'h',
          type: '在线时长',
          trend: p.isOnline ? 'ONLINE' : 'OFFLINE'
        })));
      }
    } catch (e) {
      console.error('获取排名失败');
    } finally {
      setLoadingRankings(false);
    }
  };

  // 严格演示模式判断：仅在未选择服务器时开启
  const isDemoMode = !server;
  const hasData = teamData && teamData.members && teamData.members.length > 0;

  const teammates = isDemoMode ? [
    { steamId: '1', name: '演示玩家_A', x: 1462, y: 1462, isOnline: true, isAlive: true, activeTime: '2.5h', grid: 'K12' },
    { steamId: '2', name: '演示玩家_B', x: 500, y: 2500, isOnline: true, isAlive: false, activeTime: '1.2h', grid: 'D4' },
    { steamId: '3', name: '演示玩家_C', x: 3000, y: 800, isOnline: false, isAlive: true, activeTime: '0.5h', grid: 'W20' },
  ] : (hasData ? teamData.members.map(m => ({
    ...m,
    grid: getGrid(m.x, m.y, mapSize),
    activeTime: '实时同步'
  })) : []);

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in font-sans">
      {/* 顶部标题与切换 */}
      <div className="flex justify-between items-end border-b border-white/10 pb-6">
        <div>
          <h3 className="text-3xl font-black italic glow-text uppercase">队友状态看板</h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
            <FaInfoCircle className="text-[#cd5241]" /> 实时监控团队位置、生理指标与采集贡献
          </p>
        </div>
        <div className="flex gap-2 p-1 bg-black/40 tactic-cut border border-white/5 shadow-inner">
          <TabBtn
            active={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            icon={<FaUsers />}
            label="成员列表"
          />
          <TabBtn
            active={activeTab === 'ranking'}
            onClick={() => setActiveTab('ranking')}
            icon={<FaChartLine />}
            label="今日贡献榜"
          />
        </div>
      </div>

      {isDemoMode && (
        <div className="bg-[#cd5241]/10 border-l-4 border-[#cd5241] p-4 flex items-center gap-4 animate-pulse">
          <FaExclamationTriangle className="text-[#cd5241] text-xl flex-shrink-0" />
          <div className="text-xs text-gray-300">
            <span className="font-black text-white uppercase mr-2">[ 演示模式 ]</span>
            当前未连接活跃服务器。建立 Remote Link 后，此处将自动同步真实的队友状态。
          </div>
        </div>
      )}

      {activeTab === 'members' ? (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {(!isDemoMode && !hasData) ? (
            <div className="h-48 flex flex-col items-center justify-center space-y-4 opacity-50 italic">
              <div className="w-12 h-12 border-4 border-[#cd5241]/20 border-t-[#cd5241] rounded-full animate-spin" />
              <div className="text-xs uppercase tracking-widest font-black">正在同步卫星链路数据...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {teammates.map((member) => (
                <div
                  key={member.steamId}
                  className={`tactic-border tactic-cut p-1 bg-black/30 group hover:border-[#cd5241]/50 transition-all ${!member.isAlive ? 'opacity-80' : ''}`}
                >
                  <div className="bg-black/40 p-5 relative overflow-hidden h-full flex flex-col">
                    {/* 背景装饰 */}
                    <div className={`absolute -top-12 -right-12 text-8xl opacity-[0.02] rotate-12 group-hover:scale-110 transition-transform ${!member.isAlive ? 'text-red-500 opacity-[0.05]' : 'text-white'}`}>
                      {!member.isAlive ? <FaSkullCrossbones /> : <FaUsers />}
                    </div>

                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 tactic-cut flex items-center justify-center border shadow-lg transition-all ${member.isOnline ? 'bg-[#a3e635] border-[#a3e635]/20 text-black shadow-[#a3e635]/10' :
                          !member.isAlive ? 'bg-[#ef4444] border-[#ef4444]/20 text-white animate-pulse shadow-[#ef4444]/20' :
                            'bg-gray-800 border-white/5 text-gray-500 grayscale'
                          }`}>
                          {!member.isAlive ? <FaSkullCrossbones className="text-xl" /> : <FaUsers className="text-xl" />}
                        </div>
                        <div>
                          <div className="text-base font-black truncate max-w-[120px]">{member.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`w-2 h-2 rounded-full ${member.isOnline ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635]' : !member.isAlive ? 'bg-[#ef4444]' : 'bg-gray-700'}`} />
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                              {member.isOnline ? '在线' : !member.isAlive ? '已阵亡' : '离线'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div
                        onClick={() => onLocate(member.x, member.y, member.name)}
                        className="text-right cursor-pointer hover:scale-110 transition-transform group/loc"
                      >
                        <div className="text-lg font-mono font-black text-[#cd5241] leading-none flex items-center gap-1">
                          <FaMapMarkerAlt className="text-[10px] opacity-0 group-hover/loc:opacity-100" />
                          [{member.grid}]
                        </div>
                        <div className="text-[8px] text-gray-600 font-bold uppercase mt-2 tracking-tighter">点击定位目标</div>
                      </div>
                    </div>

                    <div className="mt-auto space-y-4 relative z-10">
                      <div className="flex justify-between items-center text-[10px] font-bold text-gray-500">
                        <div className="flex items-center gap-2"><FaClock className="text-[#cd5241]" /> {member.activeTime}</div>
                        <div className="uppercase tracking-tighter">Steam_ID: {member.steamId.slice(-4)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* --- 排行榜 --- */
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="p-5 bg-white/[0.02] border border-white/10 tactic-cut mb-10 flex items-start gap-4">
              <FaChartLine className="text-[#cd5241] text-xl mt-1" />
              <p className="text-xs text-gray-400 leading-relaxed font-medium">
                <span className="text-white font-bold block mb-1 uppercase tracking-widest">数据分析声明</span>
                基于服务器快照（Snapshot Delta）计算。系统自动对比今日 00:00 与当前的资源数据差值，估算成员的采集贡献。
              </p>
            </div>

            {rankings.map((item) => (
              <div key={item.rank} className="tactic-border tactic-cut p-1 bg-black/20 group hover:bg-[#cd5241]/5 transition-all">
                <div className="bg-black/40 p-6 flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <div className={`text-4xl font-black italic italic ${item.rank === 1 ? 'text-[#cd5241] scale-110' : 'text-gray-800'}`}>
                      {item.rank < 10 ? `0${item.rank}` : item.rank}
                    </div>
                    <div>
                      <div className="text-xl font-black uppercase tracking-tight">{item.name}</div>
                      <div className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] mt-1">核心采集贡献者</div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-12">
                    <div className="hidden sm:block">
                      <div className="text-[10px] text-gray-600 font-black uppercase mb-2 tracking-widest text-right">主要产出</div>
                      <div className="text-sm font-bold bg-[#cd5241]/10 px-3 py-1 tactic-cut text-[#cd5241]">{item.type}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-600 font-black uppercase mb-2 tracking-widest text-right">今日累计增量</div>
                      <div className="text-2xl font-mono font-black text-[#a3e635]">+{item.value}</div>
                    </div>
                    <div className={`text-sm font-black italic ${item.trend.startsWith('+') ? 'text-[#a3e635]' : 'text-red-500'}`}>
                      {item.trend}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="text-center pt-16 pb-20 opacity-20 grayscale">
              <FaChartLine className="text-5xl mx-auto mb-6" />
              <p className="text-[10px] tracking-[1em] font-black uppercase italic">End_of_Intelligence_Stream</p>
            </div>
          </div>
        </div>
      )}
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

