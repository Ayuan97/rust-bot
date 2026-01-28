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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
      <div className="bg-dark-900 border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FaPlus className="text-[#cd5241]" />
            添加追踪玩家
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <FaTimes className="text-gray-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-5">
          {/* Steam ID 输入 */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Steam ID (64位)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value.replace(/\D/g, '').slice(0, 17))}
                placeholder="76561198xxxxxxxxx"
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#cd5241] font-mono"
                maxLength={17}
              />
              <button
                onClick={handlePreview}
                disabled={searching || steamId.length !== 17}
                className="px-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searching ? <FaSpinner className="animate-spin" /> : <FaSearch />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              输入 17 位数字的 Steam ID，点击搜索预览玩家信息
            </p>
          </div>

          {/* 玩家预览卡片 */}
          {previewData && (
            <div className={`p-4 rounded-xl border ${
              previewData.found
                ? 'bg-green-500/5 border-green-500/20'
                : 'bg-yellow-500/5 border-yellow-500/20'
            }`}>
              {previewData.found ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      previewData.player.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
                    }`} />
                    <span className="font-bold text-white text-lg">
                      {previewData.player.name}
                    </span>
                  </div>

                  {previewData.player.isOnline && previewData.player.server && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <FaServer className="text-gray-500" />
                      <span className="truncate">{previewData.player.server.name}</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    Battlemetrics ID: {previewData.player.battlemetricsId}
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-yellow-400 text-sm">
                    在 Battlemetrics 中未找到该玩家
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    仍可添加追踪，但可能无法获取在线状态
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 分组 */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">分组</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="默认"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#cd5241]"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">备注</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如: 昨天炸我家的玩家"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-[#cd5241] resize-none h-20"
              maxLength={255}
            />
          </div>

          {/* 优先级 */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">优先级</label>
            <div className="flex gap-3">
              <button
                onClick={() => setPriority('NORMAL')}
                className={`flex-1 py-2.5 rounded-lg border transition-all ${
                  priority === 'NORMAL'
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'
                }`}
              >
                普通
              </button>
              <button
                onClick={() => setPriority('HIGH')}
                className={`flex-1 py-2.5 rounded-lg border transition-all ${
                  priority === 'HIGH'
                    ? 'bg-[#cd5241]/20 border-[#cd5241]/30 text-[#cd5241]'
                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'
                }`}
              >
                高优先 (紧急通知)
              </button>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 p-5 border-t border-white/5">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !steamId || steamId.length !== 17}
            className="flex-1 py-3 bg-[#cd5241] hover:bg-[#b04537] rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin" />
                添加中...
              </>
            ) : (
              <>
                <FaPlus />
                添加追踪
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddTrackingModal;
