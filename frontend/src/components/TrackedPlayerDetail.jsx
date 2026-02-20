import { useState, useEffect } from 'react';
import {
  FaTimes, FaHistory, FaStar, FaEdit, FaSave, FaSpinner
} from 'react-icons/fa';
import { getTrackedPlayerProfile, getPlayerHistory, updateTrackedPlayer } from '../services/api';
import { useToast } from './Toast';

function TrackedPlayerDetail({ steamId, onClose, onUpdate }) {
  const toast = useToast();
  const [player, setPlayer] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  // 加载玩家数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [profileRes, historyRes] = await Promise.all([
          getTrackedPlayerProfile(steamId),
          getPlayerHistory(steamId)
        ]);

        if (profileRes.data.success) {
          setPlayer(profileRes.data.player);
          setEditForm({
            groupName: profileRes.data.player.groupName,
            notes: profileRes.data.player.notes || '',
            priority: profileRes.data.player.priority
          });
        }

        if (historyRes.data.success) {
          setHistory(historyRes.data.history || []);
        }
      } catch (error) {
        console.error('加载玩家详情失败:', error);
        toast.error('加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [steamId, toast]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 保存编辑
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateTrackedPlayer(steamId, editForm);
      if (res.data.success) {
        setPlayer(prev => ({ ...prev, ...editForm }));
        onUpdate({ steamId, ...editForm });
        setEditing(false);
        toast.success('保存成功');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 格式化时间
  const formatTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 格式化时长
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}小时${mins}分钟`;
    }
    return `${mins}分钟`;
  };

  const getCurrentOnlineDuration = () => {
    if (!player?.isOnline || !player?.sessionStartTime) return null;
    const startTs = new Date(player.sessionStartTime).getTime();
    if (Number.isNaN(startTs)) return null;
    return Math.max(0, Math.floor((nowTs - startTs) / 1000));
  };

  // 事件类型显示
  const getEventTypeDisplay = (type) => {
    switch (type) {
      case 'ONLINE': return { text: '上线', color: 'text-green-400', bg: 'bg-green-500/20' };
      case 'OFFLINE': return { text: '下线', color: 'text-gray-400', bg: 'bg-gray-500/20' };
      case 'SERVER_CHANGE': return { text: '换服', color: 'text-blue-400', bg: 'bg-blue-500/20' };
      case 'NAME_CHANGE': return { text: '改名', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
      default: return { text: type, color: 'text-gray-400', bg: 'bg-gray-500/20' };
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-dark-900 border border-white/10 rounded-2xl p-8">
          <FaSpinner className="animate-spin text-3xl text-[#cd5241]" />
        </div>
      </div>
    );
  }

  if (!player) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
      <div className="bg-dark-900 border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              player.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
            }`} />
            <h3 className="text-xl font-bold">
              {player.currentName || 'Unknown Player'}
            </h3>
            {player.priority === 'HIGH' && (
              <FaStar className="text-yellow-500" title="高优先级" />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <FaTimes className="text-gray-400" />
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-white/5 shrink-0">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === 'info'
                ? 'text-[#cd5241] border-b-2 border-[#cd5241]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            基本信息
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === 'history'
                ? 'text-[#cd5241] border-b-2 border-[#cd5241]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            活动历史
          </button>
          {player.profile?.nameHistory?.length > 0 && (
            <button
              onClick={() => setActiveTab('names')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                activeTab === 'names'
                  ? 'text-[#cd5241] border-b-2 border-[#cd5241]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              历史名称
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'info' && (
            <div className="space-y-5">
              {/* 当前状态 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h4 className="text-sm font-bold text-gray-400 mb-3">当前状态</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">状态</p>
                    <p className={`font-bold ${player.isOnline ? 'text-green-400' : 'text-gray-500'}`}>
                      {player.isOnline ? '在线' : '离线'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">服务器</p>
                    <p className="text-white truncate">
                      {player.currentServerName || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">上线时间</p>
                    <p className="text-white">{formatTime(player.sessionStartTime || player.lastOnlineTime)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">本次在线时长</p>
                    <p className="text-white">{player.isOnline ? formatDuration(getCurrentOnlineDuration()) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">累计游玩</p>
                    <p className="text-white">{Math.floor(Number(player.playtime || 0) / 60)} 小时</p>
                  </div>
                </div>
              </div>

              {/* 追踪设置 */}
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-400">追踪设置</h4>
                  {!editing ? (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs text-[#cd5241] hover:text-white flex items-center gap-1"
                    >
                      <FaEdit /> 编辑
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="text-xs text-gray-500 hover:text-white"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-xs text-green-400 hover:text-white flex items-center gap-1"
                      >
                        {saving ? <FaSpinner className="animate-spin" /> : <FaSave />}
                        保存
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">分组</label>
                      <input
                        type="text"
                        value={editForm.groupName}
                        onChange={(e) => setEditForm(prev => ({ ...prev, groupName: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#cd5241]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">备注</label>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#cd5241] resize-none h-20"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">优先级</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, priority: 'NORMAL' }))}
                          className={`flex-1 py-2 rounded-lg text-sm ${
                            editForm.priority === 'NORMAL'
                              ? 'bg-white/20 text-white'
                              : 'bg-white/5 text-gray-500'
                          }`}
                        >
                          普通
                        </button>
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, priority: 'HIGH' }))}
                          className={`flex-1 py-2 rounded-lg text-sm ${
                            editForm.priority === 'HIGH'
                              ? 'bg-[#cd5241]/30 text-[#cd5241]'
                              : 'bg-white/5 text-gray-500'
                          }`}
                        >
                          高优先
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">分组</p>
                      <p className="text-white">{player.groupName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">优先级</p>
                      <p className={player.priority === 'HIGH' ? 'text-[#cd5241]' : 'text-white'}>
                        {player.priority === 'HIGH' ? '高优先' : '普通'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 mb-1">备注</p>
                      <p className="text-white">{player.notes || '-'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Steam ID */}
              <div className="bg-white/5 rounded-xl p-4">
                <h4 className="text-sm font-bold text-gray-400 mb-3">标识符</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Steam ID</span>
                    <span className="font-mono text-sm text-white">{player.steamId}</span>
                  </div>
                  {player.battlemetricsId && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Battlemetrics ID</span>
                      <span className="font-mono text-sm text-white">{player.battlemetricsId}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FaHistory className="text-3xl mx-auto mb-2 opacity-50" />
                  <p>暂无活动记录</p>
                </div>
              ) : (
                history.map((event, index) => {
                  const typeDisplay = getEventTypeDisplay(event.eventType);
                  return (
                    <div
                      key={event.id || index}
                      className="flex items-start gap-3 p-3 bg-white/5 rounded-lg"
                    >
                      <span className={`px-2 py-1 rounded text-xs font-bold ${typeDisplay.color} ${typeDisplay.bg}`}>
                        {typeDisplay.text}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">
                            {event.playerName || player.currentName}
                          </span>
                          {event.serverName && (
                            <span className="text-xs text-gray-500 truncate">
                              @ {event.serverName}
                            </span>
                          )}
                        </div>
                        {event.sessionDuration && (
                          <p className="text-xs text-gray-500 mt-1">
                            在线时长: {formatDuration(event.sessionDuration)}
                          </p>
                        )}
                        {event.eventType === 'SERVER_CHANGE' && event.previousServerName && (
                          <p className="text-xs text-gray-500 mt-1">
                            从 {event.previousServerName} 换到 {event.serverName}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">
                        {formatTime(event.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'names' && player.profile?.nameHistory && (
            <div className="space-y-2">
              {player.profile.nameHistory.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                >
                  <span className="text-white font-medium">{item.name}</span>
                  <span className="text-xs text-gray-500">
                    {formatTime(item.lastSeen)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrackedPlayerDetail;
