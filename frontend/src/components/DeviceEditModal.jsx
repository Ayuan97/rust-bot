import { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaTerminal, FaRobot, FaClock } from 'react-icons/fa';
import { updateDevice } from '../services/api';
import { useToast } from './Toast';

// 自动化模式选项
const AUTO_MODE_OPTIONS = [
  { value: 0, label: '无自动化', desc: '手动控制' },
  { value: 1, label: '白天开启', desc: '日出时开启，日落时关闭' },
  { value: 2, label: '夜晚开启', desc: '日落时开启，日出时关闭' },
  { value: 3, label: '始终开启', desc: '自动保持开启状态' },
  { value: 4, label: '始终关闭', desc: '自动保持关闭状态' },
  { value: 7, label: '在线开启', desc: '有队友在线时开启' },
  { value: 8, label: '在线关闭', desc: '有队友在线时关闭' }
];

function DeviceEditModal({ device, serverId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: device.name || '',
    command: device.command || '',
    auto_mode: device.auto_mode || 0
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    // 阻止背景滚动
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await updateDevice(serverId, device.entity_id, {
        name: form.name,
        command: form.command || null,
        auto_mode: form.auto_mode
      });
      toast.success('设备配置已更新');
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('更新设备失败:', error);
      toast.error(error.response?.data?.error || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatLastTrigger = (timestamp) => {
    if (!timestamp) return '从未触发';
    const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    const now = Date.now();
    const diff = Math.floor((now - date.getTime()) / 1000);

    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-rust-dark rounded-xl w-full max-w-md shadow-2xl border border-rust-gray">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-rust-gray">
          <h3 className="text-lg font-bold">编辑设备</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-rust-gray rounded-lg transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 设备信息 */}
          <div className="text-sm text-gray-400 bg-rust-gray/50 p-3 rounded-lg">
            <p>Entity ID: <span className="text-white">{device.entity_id}</span></p>
            <p>类型: <span className="text-white">{device.type || '未知'}</span></p>
            {device.type === 'alarm' && (
              <p className="flex items-center gap-1 mt-1">
                <FaClock className="text-rust-orange" />
                上次触发: <span className="text-white">{formatLastTrigger(device.last_trigger)}</span>
              </p>
            )}
          </div>

          {/* 设备名称 */}
          <div>
            <label className="block text-sm font-medium mb-1">设备名称</label>
            <input
              type="text"
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="输入设备名称"
              required
              maxLength={100}
            />
          </div>

          {/* 游戏内命令 */}
          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-2">
              <FaTerminal className="text-rust-orange" />
              游戏内命令
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">!</span>
              <input
                type="text"
                className="input flex-1"
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                placeholder="命令名称（如 lights）"
                maxLength={50}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {device.type === 'alarm'
                ? '在游戏聊天中输入 !命令名 查看上次触发时间'
                : '在游戏聊天中输入 !命令名 on/off/status [时间] 控制设备'}
            </p>
          </div>

          {/* 自动化模式 */}
          {device.type !== 'alarm' && (
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                <FaRobot className="text-rust-orange" />
                自动化模式
              </label>
              <select
                className="input w-full"
                value={form.auto_mode}
                onChange={(e) => setForm({ ...form, auto_mode: parseInt(e.target.value) })}
              >
                {AUTO_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} - {opt.desc}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={saving}
            >
              <FaSave />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DeviceEditModal;
