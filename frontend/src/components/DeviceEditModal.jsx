import { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaSync, FaTerminal, FaRobot, FaClock, FaBell, FaEdit } from 'react-icons/fa';
import { updateDevice } from '../services/api';
import { useToast } from './Toast';

// 自动化模式选项
const AUTO_MODE_OPTIONS = [
  { value: 0, label: '手动控制', desc: '无自动化' },
  { value: 1, label: '白天开启', desc: '日出自动开启' },
  { value: 2, label: '夜晚开启', desc: '日落自动开启' },
  { value: 3, label: '始终开启', desc: '强制保持开启' },
  { value: 4, label: '始终关闭', desc: '强制保持关闭' },
  { value: 7, label: '在线开启', desc: '队友在线时运行' },
  { value: 8, label: '在线关闭', desc: '队友在线时关闭' }
];

function DeviceEditModal({ device, serverId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: device.name || '',
    command: device.command || '',
    message: device.message || '',
    autoMode: device.autoMode || 0
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const updateData = { name: form.name };

      if (device.type === 'SWITCH') {
        updateData.command = form.command || null;
        updateData.auto_mode = form.autoMode;
      }

      if (device.type === 'ALARM') {
        updateData.message = form.message || null;
      }

      await updateDevice(serverId, device.entityId, updateData);
      toast.success('设备配置已保存');
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('更新设备失败:', error);
      toast.error(error.response?.data?.error || '配置保存失败');
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
    if (!timestamp) return '无记录';
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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="relative tac-panel tac-corners w-full max-w-lg animate-scale-in">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-ink-line bg-ink-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-hazard-dim border border-hazard/40 flex items-center justify-center text-hazard">
              <FaEdit />
            </div>
            <div>
              <div className="tac-label mb-1">编辑设备 // EDIT DEVICE</div>
              <h3 className="text-lg font-extrabold text-fg leading-none">配置智能设备</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-ink-line text-fg-dim hover:text-fg hover:border-fg-dim transition-colors"
            aria-label="关闭"
          >
            <FaTimes />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* 设备名称输入 */}
          <div className="space-y-2">
            <label className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-fg">设备名称</span>
              <span className="tac-label">DEVICE NAME</span>
            </label>
            <input
              type="text"
              className="tac-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="输入易于识别的名称..."
              required
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-ink-line border border-ink-line">
            {/* 左侧：类型信息 */}
            <div className="p-4 bg-ink-850 space-y-2">
              <div className="tac-label flex items-center gap-2">
                <FaRobot className="text-hazard" /> 设备类型 // TYPE
              </div>
              <div className="font-mono tabular-nums text-base text-fg tracking-[0.05em]">{device.type}</div>
            </div>

            {/* 右侧：状态信息 */}
            {device.type === 'ALARM' && (
              <div className="p-4 bg-ink-850 space-y-2">
                <div className="tac-label flex items-center gap-2">
                  <FaClock className="text-hazard" /> 上次触发 // LAST
                </div>
                <div className="font-mono tabular-nums text-base text-fg tracking-[0.05em]">{formatLastTrigger(device.lastTrigger)}</div>
              </div>
            )}
          </div>

          {/* 实体 ID */}
          <div className="flex items-center justify-between border border-ink-line px-4 py-2.5">
            <span className="tac-label">ENTITY ID · 实体编号</span>
            <span className="font-mono tabular-nums text-sm text-fg">#{device.entityId}</span>
          </div>

          {/* 游戏内命令 (仅 Switch) */}
          {device.type === 'SWITCH' && (
            <div className="space-y-2">
              <label className="flex items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-fg">游戏内指令</span>
                  <span className="tac-label">CHAT COMMAND</span>
                </span>
                <span className="font-mono text-[10px] text-fg-mute border border-ink-line px-2 py-0.5">聊天输入 !指令 即可控制</span>
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-hazard font-bold font-mono text-lg">!</span>
                <input
                  type="text"
                  className="tac-input !pl-8 font-mono tabular-nums"
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  placeholder="command_name"
                  maxLength={50}
                />
              </div>
            </div>
          )}

          {/* 警报消息 (仅 Alarm) */}
          {device.type === 'ALARM' && (
            <div className="space-y-2">
              <label className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-fg">警报通知消息</span>
                <span className="tac-label">ALARM MESSAGE</span>
              </label>
              <div className="relative">
                <FaBell className="absolute left-4 top-1/2 -translate-y-1/2 text-hazard" />
                <input
                  type="text"
                  className="tac-input !pl-10"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="自定义通知内容..."
                  maxLength={255}
                />
              </div>
            </div>
          )}

          {/* 自动化设置 (非 Alarm) */}
          {device.type !== 'ALARM' && (
            <div className="space-y-2">
              <label className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-fg">自动化逻辑</span>
                <span className="tac-label">AUTOMATION</span>
              </label>
              <div className="grid grid-cols-1 gap-px bg-ink-line border border-ink-line max-h-44 overflow-y-auto custom-scrollbar">
                {AUTO_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center p-3 cursor-pointer transition-colors ${form.autoMode === opt.value
                      ? 'bg-hazard-dim border-l-2 border-hazard'
                      : 'bg-ink-850 border-l-2 border-transparent hover:bg-ink-800'
                      }`}
                  >
                    <input
                      type="radio"
                      name="autoMode"
                      value={opt.value}
                      checked={form.autoMode === opt.value}
                      onChange={() => setForm({ ...form, autoMode: opt.value })}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <div className={`text-sm font-bold ${form.autoMode === opt.value ? 'text-hazard' : 'text-fg-dim'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-fg-mute">{opt.desc}</div>
                    </div>
                    {form.autoMode === opt.value && <div className="w-1.5 h-1.5 bg-hazard" />}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex items-center gap-3 pt-4 border-t border-ink-line">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 tac-btn tac-btn-ghost"
            >
              取消 // CANCEL
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 tac-btn tac-btn-primary ${saving ? 'cursor-wait' : ''}`}
            >
              {saving ? <FaSync className="animate-spin" /> : <FaSave />}
              {saving ? '保存中 // SAVING' : '保存配置 // SAVE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DeviceEditModal;
