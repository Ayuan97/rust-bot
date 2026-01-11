import { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaTerminal, FaRobot, FaClock, FaBell, FaEdit } from 'react-icons/fa';
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
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-black/90 tactic-border tactic-cut w-full max-w-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all">
        {/* 顶部装饰光条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rust-orange via-orange-400 to-rust-orange opacity-80"></div>

        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 tactic-cut bg-rust-orange/20 flex items-center justify-center text-rust-orange border border-rust-orange/30">
              <FaEdit />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-wider">配置设备</h3>
              <p className="text-xs text-gray-500 font-mono">ID: {device.entityId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 tactic-cut transition-all"
          >
            <FaTimes />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* 设备名称输入 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">设备名称</label>
            <input
              type="text"
              className="w-full bg-black/40 tactic-cut border border-white/10 py-3 px-4 text-white placeholder:text-gray-600 focus:border-rust-orange focus:ring-1 focus:ring-rust-orange/50 outline-none transition-all"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="输入易于识别的名称..."
              required
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 左侧：类型信息 */}
            <div className="p-4 tactic-cut bg-blue-500/5 border border-blue-500/10 space-y-2">
              <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                <FaRobot /> 设备类型
              </div>
              <div className="text-lg font-mono text-white">{device.type}</div>
            </div>

            {/* 右侧：状态信息 */}
            {device.type === 'ALARM' && (
              <div className="p-4 tactic-cut bg-red-500/5 border border-red-500/10 space-y-2">
                <div className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <FaClock /> 上次触发
                </div>
                <div className="text-lg font-mono text-white">{formatLastTrigger(device.lastTrigger)}</div>
              </div>
            )}
          </div>

          {/* 游戏内命令 (仅 Switch) */}
          {device.type === 'SWITCH' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>游戏内指令</span>
                <span className="text-[10px] text-gray-500 normal-case px-2 py-0.5 bg-white/5 tactic-cut">聊天输入 !指令 即可控制</span>
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-rust-orange font-bold font-mono text-lg">!</span>
                <input
                  type="text"
                  className="w-full bg-black/40 tactic-cut border border-white/10 py-3 pl-8 pr-4 text-white font-mono placeholder:text-gray-600 focus:border-rust-orange focus:ring-1 focus:ring-rust-orange/50 outline-none transition-all"
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
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                警报通知消息
              </label>
              <div className="relative">
                <FaBell className="absolute left-4 top-3.5 text-yellow-500" />
                <input
                  type="text"
                  className="w-full bg-black/40 tactic-cut border border-white/10 py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/30 outline-none transition-all"
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
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">自动化逻辑</label>
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {AUTO_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center p-3 tactic-cut border cursor-pointer transition-all ${form.autoMode === opt.value
                      ? 'bg-rust-orange/10 border-rust-orange/50 shadow-[0_0_10px_rgba(205,82,65,0.1)]'
                      : 'bg-black/20 border-white/5 hover:bg-white/5'
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
                      <div className={`text-sm font-bold ${form.autoMode === opt.value ? 'text-rust-orange' : 'text-gray-300'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </div>
                    {form.autoMode === opt.value && <div className="w-2 h-2 tactic-cut bg-rust-orange shadow-[0_0_5px_rgba(205,82,65,1)]"></div>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex items-center gap-3 pt-4 mt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 tactic-cut font-bold transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 py-3 bg-gradient-to-r from-rust-dark to-rust-orange text-white tactic-cut font-bold shadow-lg shadow-rust-orange/20 flex items-center justify-center gap-2 hover:brightness-110 transition-all ${saving ? 'opacity-70 cursor-wait' : ''
                }`}
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FaSave />}
              保存配置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DeviceEditModal;
