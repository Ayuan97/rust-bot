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

  // 事件类型显示（色彩收敛：上线=terminal 单点，其余=hazard/中性）
  const getEventTypeDisplay = (type) => {
    switch (type) {
      case 'ONLINE': return { text: '上线', tone: 'online' };
      case 'OFFLINE': return { text: '下线', tone: 'muted' };
      case 'SERVER_CHANGE': return { text: '换服', tone: 'hazard' };
      case 'NAME_CHANGE': return { text: '改名', tone: 'hazard' };
      default: return { text: type, tone: 'muted' };
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="tac-panel tac-corners p-8">
          <FaSpinner className="animate-spin text-3xl text-hazard" />
        </div>
      </div>
    );
  }

  if (!player) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in font-sans">
      <div className="tac-panel tac-corners w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-ink-line shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-1.5 h-1.5 ${
              player.isOnline ? 'bg-terminal animate-tac-blink' : 'bg-fg-mute'
            }`} />
            <h3 className="text-xl font-extrabold text-fg truncate">
              {player.currentName || 'Unknown Player'}
            </h3>
            {player.priority === 'HIGH' && (
              <FaStar className="text-hazard shrink-0" title="高优先级" />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-fg-mute hover:text-fg transition-colors shrink-0"
            aria-label="关闭"
          >
            <FaTimes />
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-ink-line shrink-0">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-3 font-mono text-[11px] uppercase tracking-[0.16em] font-bold transition-colors border-b-2 ${
              activeTab === 'info'
                ? 'text-hazard border-hazard'
                : 'text-fg-mute border-transparent hover:text-fg-dim'
            }`}
          >
            基本信息 // INFO
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 font-mono text-[11px] uppercase tracking-[0.16em] font-bold transition-colors border-b-2 ${
              activeTab === 'history'
                ? 'text-hazard border-hazard'
                : 'text-fg-mute border-transparent hover:text-fg-dim'
            }`}
          >
            活动历史 // SESSIONS
          </button>
          {player.profile?.nameHistory?.length > 0 && (
            <button
              onClick={() => setActiveTab('names')}
              className={`flex-1 py-3 font-mono text-[11px] uppercase tracking-[0.16em] font-bold transition-colors border-b-2 ${
                activeTab === 'names'
                  ? 'text-hazard border-hazard'
                  : 'text-fg-mute border-transparent hover:text-fg-dim'
              }`}
            >
              历史名称 // ALIAS
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* 当前状态 */}
              <div className="border border-ink-line bg-ink-850 p-4">
                <h4 className="tac-label mb-3">在线状态 // STATUS</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-fg-dim mb-1.5">状态</p>
                    {player.isOnline ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-terminal border-terminal/30 font-mono text-xs uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" />
                        ONLINE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-fg-mute border-ink-line font-mono text-xs uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 bg-fg-mute" />
                        OFFLINE
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-fg-dim mb-1.5">服务器</p>
                    <p className="text-fg text-sm truncate">
                      {player.currentServerName || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-fg-dim mb-1.5">上线时间</p>
                    <p className="text-fg text-sm font-mono tabular-nums">{formatTime(player.sessionStartTime || player.lastOnlineTime)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-fg-dim mb-1.5">本次在线时长</p>
                    <p className={`text-sm font-mono tabular-nums ${player.isOnline ? 'text-terminal' : 'text-fg-mute'}`}>{player.isOnline ? formatDuration(getCurrentOnlineDuration()) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-fg-dim mb-1.5">累计游玩</p>
                    <p className="text-fg text-sm font-mono tabular-nums">{Math.floor(Number(player.playtime || 0) / 60)} 小时</p>
                  </div>
                </div>
              </div>

              {/* 追踪设置 */}
              <div className="border border-ink-line bg-ink-850 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="tac-label">追踪设置 // CONFIG</h4>
                  {!editing ? (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs text-hazard hover:text-hazard-bright flex items-center gap-1 font-mono uppercase tracking-wider"
                    >
                      <FaEdit /> 编辑
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => setEditing(false)}
                        className="text-xs text-fg-mute hover:text-fg font-mono uppercase tracking-wider"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-xs text-hazard hover:text-hazard-bright flex items-center gap-1 font-mono uppercase tracking-wider disabled:opacity-40"
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
                      <label className="text-[11px] text-fg-dim mb-1.5 block">分组</label>
                      <input
                        type="text"
                        value={editForm.groupName}
                        onChange={(e) => setEditForm(prev => ({ ...prev, groupName: e.target.value }))}
                        className="tac-input !py-2"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-fg-dim mb-1.5 block">备注</label>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="tac-input !py-2 resize-none h-20"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-fg-dim mb-1.5 block">优先级</label>
                      <div className="flex gap-px bg-ink-line border border-ink-line">
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, priority: 'NORMAL' }))}
                          className={`flex-1 py-2 text-sm font-mono uppercase tracking-wider transition-colors ${
                            editForm.priority === 'NORMAL'
                              ? 'bg-ink-700 text-fg'
                              : 'bg-ink-850 text-fg-mute hover:text-fg-dim'
                          }`}
                        >
                          普通
                        </button>
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, priority: 'HIGH' }))}
                          className={`flex-1 py-2 text-sm font-mono uppercase tracking-wider transition-colors ${
                            editForm.priority === 'HIGH'
                              ? 'bg-hazard-dim text-hazard'
                              : 'bg-ink-850 text-fg-mute hover:text-fg-dim'
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
                      <p className="text-[11px] text-fg-dim mb-1.5">分组</p>
                      <p className="text-fg text-sm">{player.groupName}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-fg-dim mb-1.5">优先级</p>
                      <p className={`text-sm ${player.priority === 'HIGH' ? 'text-hazard' : 'text-fg'}`}>
                        {player.priority === 'HIGH' ? '高优先' : '普通'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] text-fg-dim mb-1.5">备注</p>
                      <p className="text-fg text-sm">{player.notes || '-'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Steam ID */}
              <div className="border border-ink-line bg-ink-850 p-4">
                <h4 className="tac-label mb-3">标识符 // IDENTIFIERS</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-fg-dim">Steam ID</span>
                    <span className="font-mono text-sm text-fg tabular-nums">{player.steamId}</span>
                  </div>
                  {player.battlemetricsId && (
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-fg-dim">Battlemetrics ID</span>
                      <span className="font-mono text-sm text-fg tabular-nums">{player.battlemetricsId}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {history.length === 0 ? (
                <div className="text-center py-10 text-fg-mute">
                  <FaHistory className="text-3xl mx-auto mb-3" />
                  <p className="text-sm">暂无活动记录</p>
                </div>
              ) : (
                <div className="border border-ink-line divide-y divide-ink-line">
                  {history.map((event, index) => {
                    const typeDisplay = getEventTypeDisplay(event.eventType);
                    const isOnline = typeDisplay.tone === 'online';
                    const isHazard = typeDisplay.tone === 'hazard';
                    return (
                      <div
                        key={event.id || index}
                        className="flex items-start gap-3 px-3 py-3 hover:bg-ink-800/60 transition-colors"
                      >
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 border font-mono text-[11px] uppercase tracking-wider shrink-0 ${
                          isOnline
                            ? 'text-terminal border-terminal/30'
                            : isHazard
                              ? 'text-hazard border-hazard/30 bg-hazard-dim'
                              : 'text-fg-dim border-ink-line'
                        }`}>
                          <span className={`w-1.5 h-1.5 ${
                            isOnline ? 'bg-terminal' : isHazard ? 'bg-hazard' : 'bg-fg-mute'
                          }`} />
                          {typeDisplay.text}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-fg truncate">
                              {event.playerName || player.currentName}
                            </span>
                            {event.serverName && (
                              <span className="text-xs text-fg-mute truncate">
                                @ {event.serverName}
                              </span>
                            )}
                          </div>
                          {event.sessionDuration && (
                            <p className="text-xs text-fg-dim mt-1">
                              在线时长: <span className="font-mono tabular-nums">{formatDuration(event.sessionDuration)}</span>
                            </p>
                          )}
                          {event.eventType === 'SERVER_CHANGE' && event.previousServerName && (
                            <p className="text-xs text-fg-dim mt-1">
                              从 {event.previousServerName} 换到 {event.serverName}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-fg-mute shrink-0 font-mono tabular-nums">
                          {formatTime(event.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'names' && player.profile?.nameHistory && (
            <div className="border border-ink-line divide-y divide-ink-line">
              {player.profile.nameHistory.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-3 hover:bg-ink-800/60 transition-colors"
                >
                  <span className="text-fg font-medium truncate">{item.name}</span>
                  <span className="text-xs text-fg-mute shrink-0 font-mono tabular-nums">
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
