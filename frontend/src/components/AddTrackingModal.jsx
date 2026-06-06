import { useState } from 'react';
import {
  FaTimes, FaSearch, FaServer, FaPlus, FaSpinner
} from 'react-icons/fa';
import { previewPlayer, addTrackedPlayer } from '../services/api';
import { useToast } from './Toast';

function AddTrackingModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [steamId, setSteamId] = useState('');
  const [groupName, setGroupName] = useState('默认');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // 预览玩家信息
  const handlePreview = async () => {
    if (!steamId || steamId.length !== 17) {
      toast.error('请输入有效的 17 位 Steam ID');
      return;
    }

    setSearching(true);
    setPreviewData(null);

    try {
      const res = await previewPlayer(steamId);
      if (res.data.success) {
        setPreviewData(res.data);
      } else {
        toast.error(res.data.error || '查询失败');
      }
    } catch (error) {
      toast.error('查询失败: ' + error.message);
    } finally {
      setSearching(false);
    }
  };

  // 添加追踪
  const handleSubmit = async () => {
    if (!steamId || steamId.length !== 17) {
      toast.error('请输入有效的 17 位 Steam ID');
      return;
    }

    setLoading(true);

    try {
      const res = await addTrackedPlayer({
        steamId,
        groupName: groupName || '默认',
        notes: notes || null,
        priority
      });

      if (res.data.success) {
        toast.success('添加成功');
        onSuccess({
          ...res.data.player,
          isOnline: previewData?.player?.isOnline || false,
          currentServerName: previewData?.player?.server?.name || null
        });
      } else {
        toast.error(res.data.error || '添加失败');
      }
    } catch (error) {
      toast.error('添加失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="relative tac-panel tac-corners w-full max-w-md animate-scale-in">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-line">
          <div className="min-w-0">
            <div className="tac-label flex items-center gap-2">
              <FaPlus className="text-hazard" /> ADD TARGET
            </div>
            <h3 className="text-lg font-bold text-fg mt-1">添加追踪目标</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-fg-mute hover:text-fg hover:bg-ink-800 transition-colors shrink-0"
            aria-label="关闭"
          >
            <FaTimes />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-5">
          {/* Steam ID 输入 */}
          <div>
            <label className="flex items-baseline gap-2 mb-2">
              <span className="text-sm font-bold text-fg">Steam ID</span>
              <span className="tac-label">STEAM ID // 64-BIT</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value.replace(/\D/g, '').slice(0, 17))}
                placeholder="76561198xxxxxxxxx"
                className="tac-input flex-1 font-mono tabular-nums"
                maxLength={17}
              />
              <button
                onClick={handlePreview}
                disabled={searching || steamId.length !== 17}
                className="tac-btn tac-btn-ghost px-4 shrink-0"
                aria-label="搜索玩家"
              >
                {searching ? <FaSpinner className="animate-spin" /> : <FaSearch />}
              </button>
            </div>
            <p className="text-xs text-fg-mute mt-2">
              输入 17 位数字的 Steam ID，点击搜索查询 BattleMetrics 玩家信息
            </p>
          </div>

          {/* 玩家预览卡片 */}
          {previewData && (
            previewData.found ? (
              <div className="border border-ink-line bg-ink-800 px-4 py-3.5 space-y-3">
                <div className="flex items-center gap-3">
                  {previewData.player.isOnline ? (
                    <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 bg-fg-dim shrink-0" />
                  )}
                  <span className="font-bold text-fg text-lg truncate">
                    {previewData.player.name}
                  </span>
                  <span className={`tac-label ml-auto shrink-0 ${previewData.player.isOnline ? 'text-terminal' : 'text-fg-mute'}`}>
                    {previewData.player.isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>

                {previewData.player.isOnline && previewData.player.server && (
                  <div className="flex items-center gap-2 text-sm text-fg-dim">
                    <FaServer className="text-fg-mute shrink-0" />
                    <span className="truncate">{previewData.player.server.name}</span>
                  </div>
                )}

                <div className="text-xs text-fg-mute flex items-center gap-2">
                  <span className="tac-label !text-[9px]">BM ID</span>
                  <span className="font-mono tabular-nums text-fg-dim">{previewData.player.battlemetricsId}</span>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
                <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[!]</span>
                <span>
                  在 BattleMetrics 中未找到该玩家。
                  <span className="block text-fg-dim text-xs mt-1">仍可添加追踪，但可能无法获取在线状态</span>
                </span>
              </div>
            )
          )}

          {/* 分组 */}
          <div>
            <label className="flex items-baseline gap-2 mb-2">
              <span className="text-sm font-bold text-fg">分组</span>
              <span className="tac-label">GROUP</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="默认"
              className="tac-input"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="flex items-baseline gap-2 mb-2">
              <span className="text-sm font-bold text-fg">备注</span>
              <span className="tac-label">NOTES</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如: 昨天炸我家的玩家"
              className="tac-input resize-none h-20"
              maxLength={255}
            />
          </div>

          {/* 优先级 */}
          <div>
            <label className="flex items-baseline gap-2 mb-2">
              <span className="text-sm font-bold text-fg">优先级</span>
              <span className="tac-label">PRIORITY</span>
            </label>
            <div className="flex gap-px bg-ink-line border border-ink-line">
              <button
                onClick={() => setPriority('NORMAL')}
                className={`flex-1 py-2.5 text-sm font-mono uppercase tracking-[0.12em] transition-colors ${
                  priority === 'NORMAL'
                    ? 'bg-ink-700 text-fg'
                    : 'bg-ink-850 text-fg-mute hover:text-fg-dim'
                }`}
              >
                普通
              </button>
              <button
                onClick={() => setPriority('HIGH')}
                className={`flex-1 py-2.5 text-sm font-mono uppercase tracking-[0.12em] transition-colors ${
                  priority === 'HIGH'
                    ? 'bg-hazard-dim text-hazard border-y border-hazard/40'
                    : 'bg-ink-850 text-fg-mute hover:text-fg-dim'
                }`}
              >
                高优先 · 紧急通知
              </button>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-5 py-4 border-t border-ink-line">
          <button
            onClick={onClose}
            className="flex-1 tac-btn tac-btn-ghost"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !steamId || steamId.length !== 17}
            className="flex-1 tac-btn tac-btn-primary"
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin" />
                添加中...
              </>
            ) : (
              <>
                <FaPlus />
                添加追踪 // TRACK
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddTrackingModal;
