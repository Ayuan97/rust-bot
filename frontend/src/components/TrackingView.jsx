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

  // 监听 Socket 事件
  useEffect(() => {
    const handleOnline = (data) => {
      setPlayers(prev => prev.map(p =>
        p.steamId === data.steamId
          ? { ...p, isOnline: true, currentServerName: data.serverName, currentServerBmId: data.serverBmId }
          : p
      ));

      // 显示通知
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
          ? { ...p, isOnline: false }
          : p
      ));

      const duration = data.sessionDuration
        ? `, 在线 ${Math.floor(data.sessionDuration / 3600)}小时${Math.floor((data.sessionDuration % 3600) / 60)}分钟`
        : '';
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
    <div className="h-full flex flex-col animate-fade-in">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-black uppercase italic tracking-tight flex items-center gap-3">
            <FaUsers className="text-[#cd5241]" />
            玩家追踪
            <span className="text-sm font-normal text-gray-500 not-italic">
              ({players.length} 人, {onlineCount} 在线)
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="搜索玩家..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#cd5241] w-48"
            />
          </div>

          {/* 分组筛选 */}
          <div className="relative">
            <FaFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#cd5241] appearance-none cursor-pointer"
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
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
          >
            <FaSync className={`text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* 添加按钮 */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-[#cd5241] hover:bg-[#b04537] rounded-lg flex items-center gap-2 font-bold text-sm transition-all"
          >
            <FaPlus /> 添加追踪
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          // 加载骨架屏
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : players.length === 0 ? (
          // 空状态
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FaUsers className="text-6xl text-gray-700 mb-4" />
            <h3 className="text-xl font-bold text-gray-400 mb-2">暂无追踪玩家</h3>
            <p className="text-gray-500 mb-6">添加玩家开始追踪他们的在线状态</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-[#cd5241] hover:bg-[#b04537] rounded-lg flex items-center gap-2 font-bold transition-all"
            >
              <FaPlus /> 添加第一个追踪
            </button>
          </div>
        ) : filteredPlayers.length === 0 ? (
          // 搜索无结果
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FaSearch className="text-4xl text-gray-700 mb-4" />
            <p className="text-gray-500">没有找到匹配的玩家</p>
          </div>
        ) : (
          // 玩家列表 (按分组)
          <div className="space-y-6">
            {Object.entries(playersByGroup).map(([groupName, groupPlayers]) => (
              <div key={groupName}>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#cd5241] rounded-full" />
                  {groupName}
                  <span className="text-gray-600">({groupPlayers.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupPlayers.map(player => (
                    <PlayerCard
                      key={player.steamId}
                      player={player}
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
function PlayerCard({ player, menuOpen, onMenuToggle, onDelete, onClick }) {
  return (
    <div
      className={`relative bg-dark-800/50 rounded-xl border transition-all cursor-pointer hover:border-white/20 ${
        player.isOnline ? 'border-green-500/30' : 'border-white/5'
      }`}
      onClick={onClick}
    >
      <div className="p-4">
        {/* 头部：状态和菜单 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* 在线状态指示 */}
            <div className={`w-2.5 h-2.5 rounded-full ${
              player.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
            }`} />
            <span className={`text-xs font-bold uppercase ${
              player.isOnline ? 'text-green-400' : 'text-gray-500'
            }`}>
              {player.isOnline ? '在线' : '离线'}
            </span>
            {/* 优先级标识 */}
            {player.priority === 'HIGH' && (
              <FaStar className="text-yellow-500 text-xs" title="高优先级" />
            )}
          </div>

          {/* 菜单按钮 */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMenuToggle();
              }}
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
            >
              <FaEllipsisV className="text-gray-500" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 bg-dark-900 border border-white/10 rounded-lg shadow-xl z-10 py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-500/20 text-red-400 flex items-center gap-2"
                >
                  <FaTrash /> 停止追踪
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 玩家名称 */}
        <h4 className="font-bold text-white text-lg mb-1 truncate">
          {player.currentName || 'Unknown Player'}
        </h4>

        {/* Steam ID */}
        <p className="text-xs text-gray-500 font-mono mb-3 truncate">
          {player.steamId}
        </p>

        {/* 服务器信息 */}
        {player.isOnline && player.currentServerName && (
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2">
            <FaServer className="text-gray-500" />
            <span className="truncate">{player.currentServerName}</span>
          </div>
        )}

        {/* 备注 */}
        {player.notes && (
          <p className="text-xs text-gray-500 mt-2 truncate" title={player.notes}>
            {player.notes}
          </p>
        )}
      </div>
    </div>
  );
}

export default TrackingView;
