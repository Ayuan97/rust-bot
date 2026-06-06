import React, { useState, useEffect } from 'react';
import { FaUsers, FaChartLine, FaMapMarkerAlt, FaClock, FaSkullCrossbones, FaExclamationTriangle, FaInfoCircle, FaHammer, FaCrosshairs, FaGhost, FaTree, FaMountain, FaCogs, FaSkull, FaTrash, FaSync, FaTimes, FaCalendarAlt, FaTrophy, FaHistory } from 'react-icons/fa';
import { coordsToGrid, formatActiveTime } from '../utils/mapUtils';
import { getExtendedTeammates, deleteExtendedTeammate, getPlayerStats, refreshPlayerData } from '../services/api';

// 统计字段的中文名和图标映射（图标统一中性色，避免杂色）
const STAT_CONFIG = {
  players_killed: { name: '击杀', icon: FaCrosshairs, color: 'text-fg-dim' },
  kill_npc: { name: 'NPC', icon: FaGhost, color: 'text-fg-dim' },
  gather_wood: { name: '木材', icon: FaTree, color: 'text-fg-dim' },
  gather_stone: { name: '石头', icon: FaMountain, color: 'text-fg-dim' },
  gather_metal: { name: '金属', icon: FaCogs, color: 'text-fg-dim' },
  gather_scrap: { name: '废料', icon: FaCogs, color: 'text-fg-dim' },
  deaths: { name: '死亡', icon: FaSkull, color: 'text-fg-dim' },
  headshots: { name: '爆头', icon: FaCrosshairs, color: 'text-fg-dim' },
  bullets_fired: { name: '射击', icon: FaCrosshairs, color: 'text-fg-dim' },
  bullets_hit: { name: '命中', icon: FaCrosshairs, color: 'text-fg-dim' },
};

export default function TeamView({ server, teamData, onLocate }) {
  const [activeTab, setActiveTab] = useState('members');
  const [allTeammates, setAllTeammates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // 玩家详情弹窗状态
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 只有在没有服务器或服务器未连接时才是演示模式
  const isDemo = !server || !server.connected;

  // 获取全部队友数据（扩展队友列表，已包含 inTeam 状态）
  useEffect(() => {
    if (isDemo) {
      setAllTeammates([
        { steamId: '1', name: '演示玩家_A', x: 100, y: 200, isOnline: true, isAlive: true, inTeam: true, avatar: null, playtime: 1250, vacBanned: false, contribution: { gather_stone: 5500, kill_npc: 12, gather_wood: 3200, gather_scrap: 450 } },
        { steamId: '2', name: '演示玩家_B', x: -50, y: 300, isOnline: true, isAlive: false, inTeam: true, avatar: null, playtime: 450, vacBanned: true, contribution: { gather_wood: 8200, players_killed: 3, deaths: 5, headshots: 8 } },
        { steamId: '3', name: '演示玩家_C', x: 400, y: -100, isOnline: false, isAlive: true, inTeam: false, avatar: null, playtime: 3200, vacBanned: false, contribution: { gather_metal: 1200, kill_npc: 45, gather_scrap: 890 } },
      ]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await getExtendedTeammates(server.id);
        if (res.data.success) {
          setAllTeammates(res.data.teammates || []);
        }
      } catch (e) {
        console.error('获取队友数据失败:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // 30秒更新一次
    return () => clearInterval(interval);
  }, [server?.id, isDemo]);

  // 删除队友
  const handleDeleteTeammate = async (steamId, e) => {
    e?.stopPropagation();
    if (!window.confirm('确定要删除这个队友吗？')) return;
    setDeletingId(steamId);
    try {
      await deleteExtendedTeammate(server.id, steamId);
      setAllTeammates(prev => prev.filter(t => t.steamId !== steamId));
    } catch (e) {
      console.error('删除队友失败:', e);
      alert('删除失败: ' + (e.response?.data?.error || e.message));
    } finally {
      setDeletingId(null);
    }
  };

  // 手动刷新 Steam 数据
  const handleRefresh = async () => {
    if (isDemo || refreshing) return;
    setRefreshing(true);
    try {
      await refreshPlayerData(server.id);
      const res = await getExtendedTeammates(server.id);
      if (res.data.success) {
        setAllTeammates(res.data.teammates || []);
      }
    } catch (e) {
      console.error('刷新数据失败:', e);
      alert('刷新失败: ' + (e.response?.data?.error || e.message));
    } finally {
      setRefreshing(false);
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

  const teammates = allTeammates.map(m => ({
    ...m,
    grid: m.inTeam ? coordsToGrid(m.x, m.y, server?.mapSize || 4500) : null,
    activeTime: formatActiveTime(m.spawnTime)
  }));

  // 统计
  const inTeamCount = teammates.filter(t => t.inTeam).length;
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
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-ink-line pb-5">
        <div>
          <div className="tac-label mb-2">SQUAD STATUS</div>
          <h3 className="text-2xl font-extrabold text-fg tracking-tight">队友状态看板</h3>
          <p className="text-[13px] text-fg-dim mt-1.5 flex items-center gap-2">
            <FaInfoCircle className="text-hazard" /> 实时对接 Steam 与 Rust 数据，追踪团队贡献
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isDemo && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`tac-btn tac-btn-ghost !py-2.5 ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="从 Steam 刷新最新数据"
            >
              <FaSync className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{refreshing ? '刷新中' : '刷新数据'}</span>
            </button>
          )}
          <div className="flex gap-1 p-1 border border-ink-line">
            <TabBtn active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<FaUsers />} label="团队矩阵" />
            <TabBtn active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} icon={<FaChartLine />} label="今日贡献榜" />
          </div>
        </div>
      </div>

      {isDemo && (
        <div className="tac-panel p-4 flex items-center gap-3">
          <span className="font-mono text-hazard text-xs shrink-0">[DEMO]</span>
          <div className="text-sm text-fg-dim">
            <span className="text-fg font-bold">演示模式</span> — 当前未连接服务器。配对成功后将自动同步 Steam 资料与统计数据。
          </div>
        </div>
      )}

      {hasNoTeam && (
        <div className="tac-panel p-4 flex items-center gap-3">
          <span className="font-mono text-fg-dim text-xs shrink-0">[i]</span>
          <div className="text-sm text-fg-dim">
            <span className="text-fg font-bold">未加入队伍</span> — 请在游戏中创建或加入队伍，然后刷新页面。
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-4">
          {!isDemo && teammates.length > 0 && (
            <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider px-1">
              <span className="text-fg-dim">共 {teammates.length} 人</span>
              <span className="text-terminal">队伍中 {inTeamCount}</span>
              <span className="text-fg-mute">不在队伍 {teammates.length - inTeamCount}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teammates.map((member) => (
              <PlayerCard
                key={member.steamId}
                member={member}
                onLocate={onLocate}
                onClick={() => openPlayerDetail(member)}
                onDelete={handleDeleteTeammate}
                deletingId={deletingId}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ranking' && (
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          <div className="max-w-4xl space-y-3">
            <div className="tac-panel p-4 mb-6 flex items-start gap-3">
              <FaChartLine className="text-hazard text-lg mt-0.5 shrink-0" />
              <p className="text-[13px] text-fg-dim leading-relaxed">
                <span className="text-fg font-bold block mb-0.5">今日贡献计算规则</span>
                基于每日 00:00（或首次上线）的数据快照差值计算，涵盖击杀 NPC、玩家及核心资源采集。
              </p>
            </div>

            {contributionRank.map((item, index) => (
              <div key={item.steamId} className="border border-ink-line bg-ink-850 hover:border-ink-line2 transition-colors">
                <div className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-5 min-w-0">
                    <div className={`font-mono text-3xl font-extrabold tabular-nums ${index === 0 ? 'text-hazard' : 'text-fg-mute'}`}>
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 bg-ink-800 border border-ink-line overflow-hidden shrink-0">
                        {item.avatar ? <img src={item.avatar} alt="" className="w-full h-full object-cover" /> : <FaUsers className="w-full h-full p-3 text-fg-mute" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-fg truncate">{item.name}</div>
                        <div className="tac-label !text-[10px] mt-0.5">{index === 0 ? '首席战功' : '团队成员'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 shrink-0">
                    <div className="hidden sm:block">
                      <div className="tac-label !text-[10px] mb-1.5 text-right">主要产出</div>
                      <div className="flex gap-1.5">
                        {Object.entries(item.contribution || {}).filter(([, v]) => v > 0).slice(0, 3).map(([k]) => (
                          <span key={k} className="font-mono text-[10px] bg-hazard-dim px-1.5 py-0.5 text-hazard uppercase">{STAT_CONFIG[k]?.name || k}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tac-label !text-[10px] mb-1.5">今日增量</div>
                      <div className="font-mono text-2xl font-extrabold text-terminal tabular-nums">
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

function PlayerCard({ member, onLocate, onClick, onDelete, deletingId }) {
  const inTeam = member.inTeam !== false;
  const isDead = inTeam ? !member.isAlive : false;
  const isOffline = inTeam ? !member.isOnline : true;

  const topStats = Object.entries(member.contribution || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const formatLastSeen = (dateStr) => {
    if (!dateStr) return '从未';
    const date = new Date(dateStr);
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
  };

  return (
    <div
      className={`group relative border bg-ink-850 transition-colors cursor-pointer ${
        inTeam ? 'border-ink-line hover:border-hazard/50' : 'border-ink-line opacity-70 hover:opacity-100'
      }`}
      onClick={onClick}
    >
      <div className="p-5 relative overflow-hidden h-full flex flex-col">
        {/* 不在队伍中标识 */}
        {!inTeam && (
          <div className="absolute top-0 left-0 bg-ink-700 text-fg-dim font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 z-20">
            不在队伍
          </div>
        )}

        <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 relative overflow-hidden border ${
              !inTeam ? 'border-ink-line grayscale' :
              isDead ? 'border-hazard/60' :
              member.isOnline ? 'border-terminal/50' : 'border-ink-line grayscale'
              }`}>
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-ink-800">
                  {isDead && inTeam ? <FaSkullCrossbones className="text-2xl text-hazard" /> : <FaUsers className="text-2xl text-fg-mute" />}
                </div>
              )}
              {inTeam && (
                <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-ink-850 ${member.isOnline ? 'bg-terminal' : 'bg-ink-line2'}`} />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-fg truncate max-w-[110px] flex items-center gap-1.5">
                {member.name}
                {member.vacBanned && <FaExclamationTriangle className="text-hazard text-xs shrink-0" title="Steam 封禁记录" />}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider mt-1 text-fg-mute">
                {!inTeam ? 'NO TEAM' : isOffline ? 'OFFLINE' : isDead ? 'DEAD' : 'ONLINE'}
              </div>
            </div>
          </div>
          {/* 右上角：位置或删除按钮 */}
          <div className="text-right flex flex-col items-end gap-1">
            {inTeam && member.grid ? (
              <>
                <div className="font-mono text-base font-bold text-hazard leading-none">[{member.grid}]</div>
                <button
                  onClick={(e) => { e.stopPropagation(); onLocate?.(member.x, member.y, member.name); }}
                  className="text-hazard hover:text-hazard-bright transition-colors p-1 text-[10px]"
                  title="在地图上定位"
                >
                  <FaMapMarkerAlt size={12} />
                </button>
              </>
            ) : (
              <button
                onClick={(e) => onDelete?.(member.steamId, e)}
                disabled={deletingId === member.steamId}
                className="text-fg-mute hover:text-hazard transition-colors p-1.5 disabled:opacity-50"
                title="删除此队友"
              >
                {deletingId === member.steamId ? <FaSync className="animate-spin text-xs" /> : <FaTrash className="text-xs" />}
              </button>
            )}
          </div>
        </div>

        {/* 核心统计数据预览 */}
        <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line mb-4 relative z-10">
          {topStats.length > 0 ? (
            topStats.map(([key, value]) => {
              const config = STAT_CONFIG[key] || { name: key, icon: FaHammer, color: 'text-fg-mute' };
              const Icon = config.icon;
              return (
                <div key={key} className="bg-ink-900 p-2">
                  <div className="tac-label !text-[8px] truncate mb-1">{config.name}</div>
                  <div className="flex items-center gap-1 font-mono text-xs font-bold text-fg">
                    <Icon className="text-[10px] text-fg-mute" />
                    {value > 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 bg-ink-900 text-center text-[11px] text-fg-mute py-4">
              {inTeam ? '暂无今日数据' : '无数据'}
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="mt-auto space-y-1.5 relative z-10 pt-3 border-t border-ink-line">
          <div className="flex items-center gap-2 font-mono text-[10px] text-fg-mute uppercase tracking-wider">
            <FaClock className="text-hazard" />
            {Math.round((member.playtime || 0) / 60)}H 游戏时长
          </div>
          <div className="flex justify-between items-center text-[10px] text-fg-mute">
            <span>{inTeam ? '数据更新' : '上次在队伍'}</span>
            <span className="font-mono">{formatLastSeen(inTeam ? member.lastUpdated : member.lastSeenAt)}</span>
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
      className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold transition-colors ${active ? 'bg-hazard text-white' : 'text-fg-dim hover:text-fg hover:bg-ink-800'
        }`}
    >
      <span>{icon}</span> {label}
    </button>
  );
}

// 玩家详情弹窗
function PlayerDetailModal({ player, stats, loading, onClose }) {
  const [activeStatsTab, setActiveStatsTab] = useState('today');

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toLocaleString() || '0';
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-ink-900/85 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="tac-panel tac-corners max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-6 border-b border-ink-line flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 overflow-hidden border border-hazard/30 shrink-0">
              {player.avatar ? (
                <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-ink-800">
                  <FaUsers className="text-2xl text-fg-mute" />
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-fg">{player.name}</h3>
              <div className="font-mono text-xs text-fg-mute mt-1">STEAM ID: {player.steamId}</div>
              {stats?.profile && (
                <div className="flex items-center gap-3 mt-2 text-[11px]">
                  <span className="text-fg-dim">
                    <FaClock className="inline mr-1 text-hazard" />
                    {Math.round((stats.profile.playtime || 0) / 60)}H 游戏时长
                  </span>
                  {stats.profile.vacBanned && (
                    <span className="font-mono text-hazard font-bold uppercase">VAC 封禁</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-fg-mute hover:text-fg transition-colors p-2">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-ink-line">
          {[
            { id: 'today', icon: <FaTrophy />, label: '今日贡献' },
            { id: 'total', icon: <FaChartLine />, label: '总数据' },
            { id: 'history', icon: <FaHistory />, label: '历史记录' },
          ].map((t) => (
            <button
              key={t.id}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${activeStatsTab === t.id ? 'bg-hazard text-white' : 'text-fg-dim hover:text-fg'}`}
              onClick={() => setActiveStatsTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FaSync className="animate-spin text-2xl text-fg-mute" />
            </div>
          ) : (
            <>
              {/* 今日贡献 */}
              {activeStatsTab === 'today' && (
                <div>
                  <div className="text-[13px] text-fg-dim mb-4 flex items-center gap-2">
                    <FaCalendarAlt className="text-hazard" />
                    今日数据基于首次上线快照计算，每 15 分钟更新
                  </div>
                  {Object.keys(stats?.todayContribution || {}).length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink-line border border-ink-line mb-6">
                        {Object.entries(stats.todayContribution).map(([key, value]) => {
                          const config = STAT_CONFIG[key] || { name: key, icon: FaHammer };
                          const Icon = config.icon;
                          return (
                            <div key={key} className="bg-ink-850 p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className="text-sm text-fg-mute" />
                                <span className="tac-label !text-[10px]">{config.name}</span>
                              </div>
                              <div className="font-mono text-2xl font-extrabold text-terminal tabular-nums">+{formatNumber(value)}</div>
                            </div>
                          );
                        })}
                      </div>

                      {stats?.todayHistory?.length > 0 && (
                        <div className="border-t border-ink-line pt-4">
                          <div className="text-[13px] text-fg-dim mb-3 flex items-center gap-2">
                            <FaClock className="text-hazard" /> 今日变化时间线
                          </div>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                            {stats.todayHistory.map((record, idx) => {
                              const time = new Date(record.snapshotDate);
                              const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                              const config = STAT_CONFIG[record.statKey] || { name: record.statKey, icon: FaHammer };
                              const Icon = config.icon;
                              return (
                                <div key={idx} className="flex items-center gap-3 text-xs border border-ink-line p-2">
                                  <span className="font-mono text-fg-mute w-12">{timeStr}</span>
                                  <Icon className="text-fg-mute text-sm" />
                                  <span className="text-fg-dim">{config.name}</span>
                                  <span className="text-fg font-mono ml-auto">{formatNumber(record.statValue)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center text-fg-mute py-8">今日暂无贡献数据</div>
                  )}
                </div>
              )}

              {/* 总数据 */}
              {activeStatsTab === 'total' && (
                <div>
                  <div className="text-[13px] text-fg-dim mb-4 flex items-center gap-2">
                    <FaChartLine className="text-hazard" /> Steam 公开统计数据（累计）
                  </div>
                  {Object.keys(stats?.totalStats || {}).length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink-line border border-ink-line">
                        {Object.entries(stats.totalStats).map(([key, value]) => {
                          const config = STAT_CONFIG[key] || { name: key, icon: FaHammer };
                          const Icon = config.icon;
                          return (
                            <div key={key} className="bg-ink-850 p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className="text-sm text-fg-mute" />
                                <span className="tac-label !text-[10px]">{config.name}</span>
                              </div>
                              <div className="font-mono text-2xl font-extrabold text-fg tabular-nums">{formatNumber(value)}</div>
                            </div>
                          );
                        })}
                      </div>

                      {(stats.totalStats.bullets_fired > 0 || stats.totalStats.bullets_hit > 0) && (
                        <div className="mt-px grid grid-cols-2 gap-px bg-ink-line border border-ink-line border-t-0">
                          {stats.totalStats.bullets_fired > 0 && (
                            <div className="bg-ink-850 p-4">
                              <div className="tac-label !text-[10px] mb-1">命中率</div>
                              <div className="font-mono text-2xl font-extrabold text-terminal tabular-nums">
                                {((stats.totalStats.bullets_hit || 0) / stats.totalStats.bullets_fired * 100).toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-fg-mute mt-1 font-mono">
                                {formatNumber(stats.totalStats.bullets_hit || 0)} / {formatNumber(stats.totalStats.bullets_fired)} 发
                              </div>
                            </div>
                          )}
                          {stats.totalStats.bullets_hit > 0 && (
                            <div className="bg-ink-850 p-4">
                              <div className="tac-label !text-[10px] mb-1">爆头率</div>
                              <div className="font-mono text-2xl font-extrabold text-terminal tabular-nums">
                                {((stats.totalStats.headshots || 0) / stats.totalStats.bullets_hit * 100).toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-fg-mute mt-1 font-mono">
                                {formatNumber(stats.totalStats.headshots || 0)} / {formatNumber(stats.totalStats.bullets_hit)} 命中
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center text-fg-mute py-8">暂无统计数据（可能资料未公开）</div>
                  )}
                </div>
              )}

              {/* 历史记录 */}
              {activeStatsTab === 'history' && (
                <div>
                  <div className="text-[13px] text-fg-dim mb-4 flex items-center gap-2">
                    <FaHistory className="text-hazard" /> 今日显示 15 分钟细粒度记录，往日显示每日汇总
                  </div>

                  {stats?.todayHistory?.length > 0 && (
                    <div className="mb-6">
                      <div className="text-xs font-bold text-fg mb-3 flex items-center gap-2">
                        <span className="font-mono bg-hazard text-white px-2 py-0.5 uppercase">今日</span>
                        <span className="text-fg-mute">15 分钟粒度</span>
                      </div>
                      <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                        {stats.todayHistory.map((record, idx) => {
                          const time = new Date(record.snapshotDate);
                          const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                          const config = STAT_CONFIG[record.statKey] || { name: record.statKey, icon: FaHammer };
                          const Icon = config.icon;
                          return (
                            <div key={idx} className="flex items-center gap-3 text-xs border border-ink-line p-2.5">
                              <span className="font-mono text-hazard w-12">{timeStr}</span>
                              <Icon className="text-fg-mute text-sm" />
                              <span className="text-fg-dim">{config.name}</span>
                              <span className="text-fg font-mono ml-auto">{formatNumber(record.statValue)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {stats?.dailyHistory?.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-fg mb-3 flex items-center gap-2">
                        <span className="font-mono bg-ink-700 text-fg-dim px-2 py-0.5 uppercase">历史</span>
                        <span className="text-fg-mute">每日汇总</span>
                      </div>
                      {stats.dailyHistory.map((day) => (
                        <div key={day.date} className="border border-ink-line p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-bold text-fg">{formatDate(day.date)}</div>
                            <div className="font-mono text-xs text-terminal">
                              +{formatNumber(Object.values(day.contribution).reduce((a, b) => a + b, 0))}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(day.contribution).slice(0, 6).map(([key, value]) => {
                              const config = STAT_CONFIG[key] || { name: key };
                              return (
                                <span key={key} className="font-mono text-[10px] border border-ink-line px-2 py-1 text-fg-dim">
                                  {config.name}: <span className="text-terminal">+{formatNumber(value)}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !stats?.todayHistory?.length && (
                    <div className="text-center text-fg-mute py-8">暂无历史记录</div>
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
