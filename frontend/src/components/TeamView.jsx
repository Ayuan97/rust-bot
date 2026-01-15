import React, { useState, useEffect } from 'react';
import { FaUsers, FaChartLine, FaMapMarkerAlt, FaHeartbeat, FaClock, FaSkullCrossbones, FaExclamationTriangle, FaInfoCircle, FaShieldAlt, FaHammer, FaCrosshairs, FaGhost, FaTree, FaMountain, FaCogs, FaSkull, FaUserFriends, FaTrash, FaSync, FaTimes, FaCalendarAlt, FaTrophy, FaHistory } from 'react-icons/fa';
import { coordsToGrid, formatActiveTime } from '../utils/mapUtils';
import { getTeamDetailed, getExtendedTeammates, deleteExtendedTeammate, getPlayerStats } from '../services/api';

// 统计字段的中文名和图标映射
const STAT_CONFIG = {
  players_killed: { name: '击杀', icon: FaCrosshairs, color: 'text-red-500' },
  kill_npc: { name: 'NPC', icon: FaGhost, color: 'text-blue-500' },
  gather_wood: { name: '木材', icon: FaTree, color: 'text-green-500' },
  gather_stone: { name: '石头', icon: FaMountain, color: 'text-gray-400' },
  gather_metal: { name: '金属', icon: FaCogs, color: 'text-orange-500' },
  gather_scrap: { name: '废料', icon: FaCogs, color: 'text-yellow-500' },
  deaths: { name: '死亡', icon: FaSkull, color: 'text-red-400' },
  headshots: { name: '爆头', icon: FaCrosshairs, color: 'text-purple-500' },
  bullets_fired: { name: '射击', icon: FaCrosshairs, color: 'text-gray-500' },
  bullets_hit: { name: '命中', icon: FaCrosshairs, color: 'text-green-400' },
};

export default function TeamView({ server, teamData, onLocate }) {
  const [activeTab, setActiveTab] = useState('members');
  const [detailedMembers, setDetailedMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extendedTeammates, setExtendedTeammates] = useState([]);
  const [extendedLoading, setExtendedLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // 玩家详情弹窗状态
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 只有在没有服务器或服务器未连接时才是演示模式
  const isDemo = !server || !server.connected;

  useEffect(() => {
    if (isDemo) {
      setDetailedMembers([
        { steamId: '1', name: '演示玩家_A', x: 100, y: 200, isOnline: true, isAlive: true, avatar: null, playtime: 1250, vacBanned: false, contribution: { gather_stone: 5500, kill_npc: 12, gather_wood: 3200, gather_scrap: 450 } },
        { steamId: '2', name: '演示玩家_B', x: -50, y: 300, isOnline: true, isAlive: false, avatar: null, playtime: 450, vacBanned: true, contribution: { gather_wood: 8200, players_killed: 3, deaths: 5, headshots: 8 } },
        { steamId: '3', name: '演示玩家_C', x: 400, y: -100, isOnline: false, isAlive: true, avatar: null, playtime: 3200, vacBanned: false, contribution: { gather_metal: 1200, kill_npc: 45, gather_scrap: 890 } },
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

  // 获取扩展队友数据
  useEffect(() => {
    if (isDemo || activeTab !== 'all') return;

    const fetchExtended = async () => {
      setExtendedLoading(true);
      try {
        const res = await getExtendedTeammates(server.id);
        if (res.data.success) {
          setExtendedTeammates(res.data.teammates || []);
        }
      } catch (e) {
        console.error('获取扩展队友数据失败:', e);
      } finally {
        setExtendedLoading(false);
      }
    };

    fetchExtended();
  }, [server?.id, isDemo, activeTab]);

  // 删除扩展队友
  const handleDeleteTeammate = async (steamId) => {
    if (!window.confirm('确定要删除这个队友吗？')) return;
    setDeletingId(steamId);
    try {
      await deleteExtendedTeammate(server.id, steamId);
      setExtendedTeammates(prev => prev.filter(t => t.steamId !== steamId));
    } catch (e) {
      console.error('删除队友失败:', e);
      alert('删除失败: ' + (e.response?.data?.error || e.message));
    } finally {
      setDeletingId(null);
    }
  };

  // 打开玩家详情弹窗
  const openPlayerDetail = async (member) => {
    setSelectedPlayer(member);
    setPlayerStats(null);
    setStatsLoading(true);

    try {
      const res = await getPlayerStats(server.id, member.steamId);
      if (res.data.success) {
        setPlayerStats(res.data.data);
      }
    } catch (e) {
      console.error('获取玩家统计失败:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  // 关闭玩家详情弹窗
  const closePlayerDetail = () => {
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

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
          <TabBtn
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            icon={<FaUserFriends />}
            label="全部队友"
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

      {activeTab === 'members' && (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {teammates.map((member) => (
              <PlayerCard key={member.steamId} member={member} onLocate={onLocate} onClick={() => openPlayerDetail(member)} />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ranking' && (
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
                        {Object.entries(item.contribution || {}).filter(([_, v]) => v > 0).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="text-[10px] font-bold bg-[#cd5241]/10 px-2 py-0.5 tactic-cut text-[#cd5241] uppercase">{STAT_CONFIG[k]?.name || k}</span>
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

      {activeTab === 'all' && (
        /* --- 全部队友 --- */
        <ExtendedTeammatesList
          teammates={extendedTeammates}
          loading={extendedLoading}
          isDemo={isDemo}
          onDelete={handleDeleteTeammate}
          deletingId={deletingId}
          onLocate={onLocate}
          mapSize={server?.mapSize || 4500}
          onPlayerClick={openPlayerDetail}
        />
      )}

      {/* 玩家详情弹窗 */}
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          stats={playerStats}
          loading={statsLoading}
          onClose={closePlayerDetail}
        />
      )}
    </div>
  );
}

function PlayerCard({ member, onLocate, onClick }) {
  const isDead = !member.isAlive;
  const isOffline = !member.isOnline;

  // 获取前6个有值的统计数据
  const topStats = Object.entries(member.contribution || {})
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div
      className={`tactic-border tactic-cut p-1 bg-black/30 group hover:border-[#cd5241]/50 transition-all cursor-pointer ${isDead ? 'opacity-80' : ''}`}
      onClick={onClick}
    >
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
          <div className="text-right flex flex-col items-end gap-1">
            <div className="text-lg font-mono font-black text-[#cd5241] leading-none">[{member.grid}]</div>
            <div className="flex items-center gap-2">
              <div className="text-[8px] text-gray-600 font-bold uppercase tracking-tighter">GRID_COORD</div>
              <button
                onClick={(e) => { e.stopPropagation(); onLocate?.(member.x, member.y, member.name); }}
                className="text-[#cd5241] hover:text-white transition-colors p-1 hover:bg-[#cd5241]/20 rounded"
                title="在地图上定位"
              >
                <FaMapMarkerAlt size={10} />
              </button>
            </div>
          </div>
        </div>

        {/* 核心统计数据预览 - 动态显示 */}
        <div className="grid grid-cols-3 gap-2 mb-4 relative z-10">
          {topStats.length > 0 ? (
            topStats.map(([key, value]) => {
              const config = STAT_CONFIG[key] || { name: key, icon: FaHammer, color: 'text-gray-400' };
              const Icon = config.icon;
              return (
                <div key={key} className="bg-white/[0.03] p-2 tactic-cut border border-white/5">
                  <div className="text-[8px] text-gray-600 font-black uppercase truncate mb-1">{config.name}</div>
                  <div className={`flex items-center gap-1 text-xs font-mono font-black text-[#a3e635]`}>
                    <Icon className={`text-[10px] ${config.color}`} />
                    {value > 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 text-center text-[10px] text-gray-600 py-4">暂无今日数据</div>
          )}
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

// 格式化时间距离
function formatTimeAgo(dateString) {
  if (!dateString) return '从未';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
}

// 扩展队友列表组件
function ExtendedTeammatesList({ teammates, loading, isDemo, onDelete, deletingId, onLocate, mapSize, onPlayerClick }) {
  if (isDemo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-[#cd5241]/10 border-l-4 border-[#cd5241] p-6 max-w-md">
          <div className="flex items-center gap-4">
            <FaExclamationTriangle className="text-[#cd5241] text-2xl flex-shrink-0" />
            <div className="text-sm text-gray-300">
              <span className="font-black text-white uppercase block mb-1">[ 演示模式 ]</span>
              请先连接服务器以查看全部队友列表
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <FaSync className="animate-spin" />
          <span className="text-sm font-bold uppercase">正在加载队友数据...</span>
        </div>
      </div>
    );
  }

  if (teammates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-blue-500/10 border-l-4 border-blue-500 p-6 max-w-md">
          <div className="flex items-center gap-4">
            <FaInfoCircle className="text-blue-500 text-2xl flex-shrink-0" />
            <div className="text-sm text-gray-300">
              <span className="font-black text-white uppercase block mb-1">[ 暂无数据 ]</span>
              系统会在你加入游戏队伍后自动同步队友信息
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 统计在队伍中的人数
  const inTeamCount = teammates.filter(t => t.inTeam).length;

  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
      {/* 说明信息 */}
      <div className="p-5 bg-white/[0.02] border border-white/10 tactic-cut flex items-start gap-4">
        <FaUserFriends className="text-[#cd5241] text-xl mt-1" />
        <div className="flex-1">
          <p className="text-xs text-gray-400 leading-relaxed font-medium">
            <span className="text-white font-bold block mb-1 uppercase tracking-widest">扩展队友列表</span>
            系统会自动同步所有曾加入过队伍的玩家。即使被踢出队伍，记录也会保留。你可以手动删除不再需要追踪的玩家。
          </p>
          <div className="flex items-center gap-4 mt-3 text-[10px] font-bold">
            <span className="text-gray-500">共 {teammates.length} 人</span>
            <span className="text-[#a3e635]">在队伍 {inTeamCount} 人</span>
            <span className="text-gray-600">不在队伍 {teammates.length - inTeamCount} 人</span>
          </div>
        </div>
      </div>

      {/* 统一列表 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {teammates.map(member => (
          <ExtendedTeammateCard
            key={member.steamId}
            member={member}
            onDelete={onDelete}
            deletingId={deletingId}
            onLocate={onLocate}
            mapSize={mapSize}
            onClick={() => onPlayerClick?.(member)}
          />
        ))}
      </div>
    </div>
  );
}

// 扩展队友卡片
function ExtendedTeammateCard({ member, onDelete, deletingId, onLocate, mapSize, onClick }) {
  const inTeam = member.inTeam;
  const grid = inTeam ? coordsToGrid(member.x, member.y, mapSize) : null;

  // 获取前4个有值的统计数据
  const topStats = Object.entries(member.contribution || {})
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div
      className={`tactic-border tactic-cut p-1 bg-black/30 group transition-all cursor-pointer ${inTeam ? 'hover:border-[#a3e635]/50' : 'opacity-70 hover:opacity-100 hover:border-gray-600'}`}
      onClick={onClick}
    >
      <div className="bg-black/40 p-4 relative overflow-hidden h-full flex flex-col">
        {/* 在队伍中标识 */}
        {inTeam && (
          <div className="absolute top-0 right-0 bg-[#a3e635] text-black text-[8px] font-black uppercase px-2 py-0.5">
            队伍中
          </div>
        )}

        {/* 头部：头像 + 名称 */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 tactic-cut relative overflow-hidden border-2 ${inTeam ? 'border-[#a3e635]/30' : 'border-white/10 grayscale'}`}>
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <FaUsers className="text-xl text-gray-600" />
                </div>
              )}
              {inTeam && (
                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-black rounded-full ${member.isOnline ? 'bg-[#a3e635]' : 'bg-gray-600'}`} />
              )}
            </div>
            <div>
              <div className="text-sm font-black truncate max-w-[120px] flex items-center gap-2">
                {member.name || '未知玩家'}
                {member.vacBanned && <FaExclamationTriangle className="text-red-500 text-xs" title="Steam 封禁记录" />}
              </div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">
                {inTeam ? (member.isOnline ? '在线' : '离线') : '不在队伍'}
              </div>
            </div>
          </div>

          {/* 删除按钮 */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(member.steamId); }}
            disabled={deletingId === member.steamId}
            className="text-gray-600 hover:text-red-500 transition-colors p-1.5 hover:bg-red-500/10 rounded disabled:opacity-50"
            title="删除此队友"
          >
            {deletingId === member.steamId ? <FaSync className="animate-spin text-xs" /> : <FaTrash className="text-xs" />}
          </button>
        </div>

        {/* 在队伍中：显示位置和在线状态 */}
        {inTeam && grid && (
          <div className="flex items-center justify-between mb-3 text-[10px]">
            <div className="flex items-center gap-2">
              <FaMapMarkerAlt className="text-[#cd5241]" />
              <span className="font-mono font-bold text-[#cd5241]">[{grid}]</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onLocate?.(member.x, member.y, member.name); }}
              className="text-[#cd5241] hover:text-white transition-colors px-2 py-1 hover:bg-[#cd5241]/20 rounded text-[10px] font-bold uppercase"
            >
              定位
            </button>
          </div>
        )}

        {/* 统计数据（如果有） */}
        {topStats.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {topStats.map(([key, value]) => {
              const config = STAT_CONFIG[key] || { name: key, icon: FaHammer, color: 'text-gray-400' };
              const Icon = config.icon;
              return (
                <div key={key} className="bg-white/[0.03] p-1.5 tactic-cut border border-white/5">
                  <div className="text-[8px] text-gray-600 font-bold uppercase truncate">{config.name}</div>
                  <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#a3e635]">
                    <Icon className={`text-[8px] ${config.color}`} />
                    {value > 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 底部信息 */}
        <div className="mt-auto pt-3 border-t border-white/5 space-y-1.5">
          <div className="flex justify-between items-center text-[9px] text-gray-600">
            <span className="font-bold uppercase">首次加入</span>
            <span className="font-mono">{formatTimeAgo(member.addedAt)}</span>
          </div>
          <div className="flex justify-between items-center text-[9px] text-gray-600">
            <span className="font-bold uppercase">最后在线</span>
            <span className="font-mono">{formatTimeAgo(member.lastSeenAt)}</span>
          </div>
          {member.playtime > 0 && (
            <div className="flex justify-between items-center text-[9px] text-gray-600">
              <span className="font-bold uppercase">游戏时长</span>
              <span className="font-mono">{Math.round(member.playtime / 60)}H</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 玩家详情弹窗
function PlayerDetailModal({ player, stats, loading, onClose }) {
  const [activeStatsTab, setActiveStatsTab] = useState('today');

  // 格式化大数字
  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toLocaleString() || '0';
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] border border-white/10 tactic-cut max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 tactic-cut overflow-hidden border-2 border-[#cd5241]/30">
              {player.avatar ? (
                <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <FaUsers className="text-2xl text-gray-600" />
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-black">{player.name}</h3>
              <div className="text-xs text-gray-500 font-mono mt-1">Steam ID: {player.steamId}</div>
              {stats?.profile && (
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  <span className="text-gray-500">
                    <FaClock className="inline mr-1" />
                    {Math.round((stats.profile.playtime || 0) / 60)}H 游戏时长
                  </span>
                  {stats.profile.vacBanned && (
                    <span className="text-red-500 font-bold">VAC 封禁</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-white/10">
          <button
            className={`flex-1 py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeStatsTab === 'today' ? 'bg-[#cd5241] text-white' : 'text-gray-500 hover:text-white'}`}
            onClick={() => setActiveStatsTab('today')}
          >
            <FaTrophy /> 今日贡献
          </button>
          <button
            className={`flex-1 py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeStatsTab === 'total' ? 'bg-[#cd5241] text-white' : 'text-gray-500 hover:text-white'}`}
            onClick={() => setActiveStatsTab('total')}
          >
            <FaChartLine /> 总数据
          </button>
          <button
            className={`flex-1 py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeStatsTab === 'history' ? 'bg-[#cd5241] text-white' : 'text-gray-500 hover:text-white'}`}
            onClick={() => setActiveStatsTab('history')}
          >
            <FaHistory /> 历史记录
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FaSync className="animate-spin text-2xl text-gray-500" />
            </div>
          ) : (
            <>
              {/* 今日贡献 */}
              {activeStatsTab === 'today' && (
                <div>
                  <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                    <FaCalendarAlt className="text-[#cd5241]" />
                    今日数据基于 00:00 快照计算
                  </div>
                  {Object.keys(stats?.todayContribution || {}).length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(stats.todayContribution).map(([key, value]) => {
                        const config = STAT_CONFIG[key] || { name: key, icon: FaHammer, color: 'text-gray-400' };
                        const Icon = config.icon;
                        return (
                          <div key={key} className="bg-white/[0.03] p-4 tactic-cut border border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`text-sm ${config.color}`} />
                              <span className="text-[10px] text-gray-500 font-bold uppercase">{config.name}</span>
                            </div>
                            <div className="text-2xl font-mono font-black text-[#a3e635]">
                              +{formatNumber(value)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center text-gray-600 py-8">今日暂无贡献数据</div>
                  )}
                </div>
              )}

              {/* 总数据 */}
              {activeStatsTab === 'total' && (
                <div>
                  <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                    <FaChartLine className="text-[#cd5241]" />
                    Steam 公开统计数据（累计）
                  </div>
                  {Object.keys(stats?.totalStats || {}).length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(stats.totalStats).map(([key, value]) => {
                        const config = STAT_CONFIG[key] || { name: key, icon: FaHammer, color: 'text-gray-400' };
                        const Icon = config.icon;
                        return (
                          <div key={key} className="bg-white/[0.03] p-4 tactic-cut border border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`text-sm ${config.color}`} />
                              <span className="text-[10px] text-gray-500 font-bold uppercase">{config.name}</span>
                            </div>
                            <div className="text-2xl font-mono font-black text-white">
                              {formatNumber(value)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center text-gray-600 py-8">暂无统计数据（可能资料未公开）</div>
                  )}
                </div>
              )}

              {/* 历史记录 */}
              {activeStatsTab === 'history' && (
                <div>
                  <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                    <FaHistory className="text-[#cd5241]" />
                    最近 30 天每日贡献
                  </div>
                  {stats?.dailyHistory?.length > 0 ? (
                    <div className="space-y-3">
                      {stats.dailyHistory.map((day, idx) => (
                        <div key={day.date} className="bg-white/[0.03] p-4 tactic-cut border border-white/5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-bold text-white">{formatDate(day.date)}</div>
                            <div className="text-xs text-[#a3e635] font-mono">
                              +{formatNumber(Object.values(day.contribution).reduce((a, b) => a + b, 0))}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(day.contribution).slice(0, 6).map(([key, value]) => {
                              const config = STAT_CONFIG[key] || { name: key };
                              return (
                                <span key={key} className="text-[10px] bg-black/30 px-2 py-1 rounded text-gray-400">
                                  {config.name}: <span className="text-[#a3e635]">+{formatNumber(value)}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-600 py-8">暂无历史记录</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}