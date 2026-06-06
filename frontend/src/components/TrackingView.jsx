import { useState, useEffect, useCallback } from 'react';
import {
  FaUsers, FaPlus, FaSearch, FaSync, FaEllipsisV, FaTrash,
  FaServer, FaStar, FaFilter
} from 'react-icons/fa';
import { getTrackedPlayers, deleteTrackedPlayer } from '../services/api';
import { useToast } from './Toast';
import socketService from '../services/socket';
import AddTrackingModal from './AddTrackingModal';
import TrackedPlayerDetail from './TrackedPlayerDetail';

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0分钟';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${mins}分钟`;
  return `${mins}分钟`;
}

function getOnlineDurationSec(player, nowTs) {
  if (!player?.isOnline || !player?.sessionStartTime) return 0;
  const start = new Date(player.sessionStartTime).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((nowTs - start) / 1000));
}

function TrackingView() {
  const toast = useToast();
  const [players, setPlayers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());

  // 加载追踪列表
  const loadPlayers = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await getTrackedPlayers();
      if (res.data.success) {
        setPlayers(res.data.players || []);
        setGroups(res.data.groups || []);
      }
    } catch (error) {
      console.error('加载追踪列表失败:', error);
      toast.error('加载追踪列表失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // 初始加载
  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 监听 Socket 事件
  useEffect(() => {
    const handleOnline = (data) => {
      setPlayers(prev => prev.map(p =>
        p.steamId === data.steamId
          ? {
              ...p,
              isOnline: true,
              currentServerName: data.serverName,
              currentServerBmId: data.serverBmId,
              sessionStartTime: data.sessionStartTime || new Date().toISOString(),
              lastOnlineTime: data.sessionStartTime || new Date().toISOString()
            }
          : p
      ));

      const message = data.isSameServer
        ? `[警告] ${data.playerName} 进入了你的服务器!`
        : `[追踪] ${data.playerName} 上线了`;
      if (data.isSameServer) {
        toast.warning(message);
      } else {
        toast.info(message);
      }
    };

    const handleOffline = (data) => {
      setPlayers(prev => prev.map(p =>
        p.steamId === data.steamId
          ? {
              ...p,
              isOnline: false,
              sessionStartTime: null,
              lastOfflineTime: new Date().toISOString()
            }
          : p
      ));

      const duration = data.sessionDuration ? `, 在线 ${formatDuration(data.sessionDuration)}` : '';
      toast.info(`[追踪] ${data.playerName} 下线了${duration}`);
    };

    const handleServerChange = (data) => {
      setPlayers(prev => prev.map(p =>
        p.steamId === data.steamId
          ? { ...p, currentServerName: data.toServerName, currentServerBmId: data.toServerBmId }
          : p
      ));

      const message = data.isEnteringUserServer
        ? `[警告] ${data.playerName} 换服进入了你的服务器!`
        : `[追踪] ${data.playerName} 换服到 ${data.toServerName}`;
      if (data.isEnteringUserServer) {
        toast.warning(message);
      } else {
        toast.info(message);
      }
    };

    socketService.on('tracking:online', handleOnline);
    socketService.on('tracking:offline', handleOffline);
    socketService.on('tracking:server_change', handleServerChange);

    return () => {
      socketService.off('tracking:online', handleOnline);
      socketService.off('tracking:offline', handleOffline);
      socketService.off('tracking:server_change', handleServerChange);
    };
  }, [toast]);

  // 删除追踪
  const handleDelete = async (steamId, playerName) => {
    if (!confirm(`确定要停止追踪 ${playerName || steamId} 吗?`)) {
      return;
    }

    try {
      await deleteTrackedPlayer(steamId);
      setPlayers(prev => prev.filter(p => p.steamId !== steamId));
      toast.success('已停止追踪该玩家');
    } catch (error) {
      toast.error('删除失败: ' + error.message);
    }
    setMenuOpenId(null);
  };

  // 过滤玩家
  const filteredPlayers = players.filter(p => {
    const matchGroup = selectedGroup === 'all' || p.groupName === selectedGroup;
    const matchSearch = !searchQuery ||
      (p.currentName && p.currentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.steamId.includes(searchQuery);
    return matchGroup && matchSearch;
  });

  // 按分组组织玩家
  const playersByGroup = filteredPlayers.reduce((acc, player) => {
    const group = player.groupName || '默认';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(player);
    return acc;
  }, {});

  // 统计
  const onlineCount = players.filter(p => p.isOnline).length;

  return (
    <div className="h-full flex flex-col animate-fade-in font-sans">
      {/* 顶部工具栏 */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <div className="tac-label mb-1">PLAYER TRACKING</div>
          <h2 className="text-xl font-extrabold text-fg tracking-tight flex items-center gap-3">
            玩家追踪
            <span className="font-mono text-xs font-normal text-fg-mute">{players.length} 人 · {onlineCount} 在线</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 搜索框 */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs pointer-events-none" />
            <input
              type="text"
              placeholder="搜索玩家..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="tac-input !pl-9 !py-2.5 w-44"
            />
          </div>

          {/* 分组筛选 */}
          <div className="relative">
            <FaFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs pointer-events-none z-10" />
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="tac-input !pl-9 !py-2.5 pr-8 appearance-none cursor-pointer"
            >
              <option value="all">全部分组</option>
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* 刷新按钮 */}
          <button
            onClick={() => loadPlayers(true)}
            disabled={refreshing}
            className="w-10 h-10 flex items-center justify-center border border-ink-line text-fg-dim hover:text-fg hover:border-fg-dim transition-colors shrink-0"
          >
            <FaSync className={refreshing ? 'animate-spin' : ''} />
          </button>

          {/* 添加按钮 */}
          <button onClick={() => setShowAddModal(true)} className="tac-btn tac-btn-primary !py-2.5">
            <FaPlus /> 添加追踪
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 border border-ink-line bg-ink-850 animate-pulse" />
            ))}
          </div>
        ) : players.length === 0 ? (
          // 空状态
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 border border-ink-line flex items-center justify-center mb-5">
              <FaUsers className="text-2xl text-fg-mute" />
            </div>
            <div className="tac-label mb-2">NO TARGETS</div>
            <h3 className="text-xl font-extrabold text-fg mb-2">暂无追踪玩家</h3>
            <p className="text-sm text-fg-dim mb-6">添加玩家开始追踪他们的在线状态与换服动向</p>
            <button onClick={() => setShowAddModal(true)} className="tac-btn tac-btn-primary !py-3">
              <FaPlus /> 添加第一个追踪
            </button>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FaSearch className="text-3xl text-fg-mute mb-4" />
            <p className="text-sm text-fg-dim">没有找到匹配的玩家</p>
          </div>
        ) : (
          // 玩家列表 (按分组)
          <div className="space-y-6">
            {Object.entries(playersByGroup).map(([groupName, groupPlayers]) => (
              <div key={groupName}>
                <h3 className="tac-label mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-hazard" />
                  {groupName}
                  <span className="text-fg-mute">({groupPlayers.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupPlayers.map(player => (
                    <PlayerCard
                      key={player.steamId}
                      player={player}
                      nowTs={nowTs}
                      menuOpen={menuOpenId === player.steamId}
                      onMenuToggle={() => setMenuOpenId(menuOpenId === player.steamId ? null : player.steamId)}
                      onDelete={() => handleDelete(player.steamId, player.currentName)}
                      onClick={() => setSelectedPlayer(player)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加追踪弹窗 */}
      {showAddModal && (
        <AddTrackingModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(newPlayer) => {
            setPlayers(prev => [...prev, newPlayer]);
            if (newPlayer.groupName && !groups.includes(newPlayer.groupName)) {
              setGroups(prev => [...prev, newPlayer.groupName]);
            }
            setShowAddModal(false);
          }}
        />
      )}

      {/* 玩家详情弹窗 */}
      {selectedPlayer && (
        <TrackedPlayerDetail
          steamId={selectedPlayer.steamId}
          onClose={() => setSelectedPlayer(null)}
          onUpdate={(updated) => {
            setPlayers(prev => prev.map(p =>
              p.steamId === updated.steamId ? { ...p, ...updated } : p
            ));
          }}
        />
      )}
    </div>
  );
}

// 玩家卡片组件
function PlayerCard({ player, nowTs, menuOpen, onMenuToggle, onDelete, onClick }) {
  const onlineDurationSec = getOnlineDurationSec(player, nowTs);
  const totalPlaytimeHours = Math.floor(Number(player.playtime || 0) / 60);

  return (
    <div
      className={`relative border bg-ink-850 transition-colors cursor-pointer hover:border-ink-line2 ${
        player.isOnline ? 'border-terminal/40' : 'border-ink-line'
      }`}
      onClick={onClick}
    >
      <div className="p-4">
        {/* 头部：状态和菜单 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 ${player.isOnline ? 'bg-terminal' : 'bg-fg-mute'}`} />
            <span className={`font-mono text-[11px] uppercase tracking-wider ${player.isOnline ? 'text-terminal' : 'text-fg-mute'}`}>
              {player.isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            {player.priority === 'HIGH' && (
              <FaStar className="text-hazard text-xs" title="高优先级" />
            )}
          </div>

          {/* 菜单按钮 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
              className="p-1.5 text-fg-mute hover:text-fg transition-colors"
            >
              <FaEllipsisV />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 tac-panel shadow-2xl z-10 py-1 min-w-[120px]">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-hazard-dim text-hazard flex items-center gap-2"
                >
                  <FaTrash /> 停止追踪
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 玩家名称 */}
        <h4 className="font-bold text-fg text-base mb-1 truncate">
          {player.currentName || 'Unknown Player'}
        </h4>

        {/* Steam ID */}
        <p className="font-mono text-[11px] text-fg-mute mb-3 truncate">
          {player.steamId}
        </p>

        {/* 服务器信息 */}
        {player.isOnline && player.currentServerName && (
          <div className="flex items-center gap-2 text-xs text-fg-dim border border-ink-line px-3 py-2">
            <FaServer className="text-fg-mute" />
            <span className="truncate">{player.currentServerName}</span>
          </div>
        )}

        <div className="mt-2.5 space-y-1 font-mono text-[11px] text-fg-mute">
          <div className="flex justify-between">
            <span>累计游玩</span>
            <span className="text-fg-dim">{totalPlaytimeHours}H</span>
          </div>
          <div className="flex justify-between">
            <span>当前在线</span>
            <span className={player.isOnline ? 'text-terminal' : 'text-fg-mute'}>
              {player.isOnline ? formatDuration(onlineDurationSec) : '-'}
            </span>
          </div>
        </div>

        {/* 备注 */}
        {player.notes && (
          <p className="text-[11px] text-fg-mute mt-2 truncate" title={player.notes}>
            {player.notes}
          </p>
        )}
      </div>
    </div>
  );
}

export default TrackingView;
