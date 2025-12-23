import { useState, useEffect } from 'react';
import { FaBell, FaUser, FaShip, FaHelicopter, FaOilCan, FaBox, FaSync, FaSun, FaMoon } from 'react-icons/fa';
import { useToast } from './Toast';

// 默认通知设置
const DEFAULT_SETTINGS = {
  // 玩家通知
  player_death: true,
  player_online: true,
  player_offline: true,
  player_afk: true,

  // 货船通知
  cargo_spawn: true,
  cargo_dock: true,
  cargo_egress: true,
  cargo_leave: false,

  // 直升机通知
  heli_spawn: true,
  heli_downed: true,
  heli_leave: false,

  // 油井通知
  oil_rig_triggered: true,
  oil_rig_warning: true,
  oil_rig_unlocked: true,

  // 其他事件
  crate_spawn: false,
  ch47_spawn: false,
  raid_detected: true,
  vending_new: false,

  // 昼夜提醒
  day_night_enabled: true,
  day_notify_minutes: 5,
  night_notify_minutes: 8,
};

// 通知分组配置
const NOTIFICATION_GROUPS = [
  {
    id: 'player',
    label: '玩家',
    icon: FaUser,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    items: [
      { key: 'player_death', label: '死亡通知' },
      { key: 'player_online', label: '上线通知' },
      { key: 'player_offline', label: '下线通知' },
      { key: 'player_afk', label: '挂机通知' },
    ]
  },
  {
    id: 'cargo',
    label: '货船',
    icon: FaShip,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    items: [
      { key: 'cargo_spawn', label: '货船刷新' },
      { key: 'cargo_dock', label: '货船停靠' },
      { key: 'cargo_egress', label: 'Egress' },
      { key: 'cargo_leave', label: '货船离开' },
    ]
  },
  {
    id: 'heli',
    label: '直升机',
    icon: FaHelicopter,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    items: [
      { key: 'heli_spawn', label: '直升机刷新' },
      { key: 'heli_downed', label: '直升机击落' },
      { key: 'heli_leave', label: '直升机离开' },
    ]
  },
  {
    id: 'oil',
    label: '油井',
    icon: FaOilCan,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    items: [
      { key: 'oil_rig_triggered', label: '油井触发' },
      { key: 'oil_rig_warning', label: '箱子倒计时' },
      { key: 'oil_rig_unlocked', label: '箱子解锁' },
    ]
  },
  {
    id: 'other',
    label: '其他',
    icon: FaBox,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    items: [
      { key: 'crate_spawn', label: '上锁箱子' },
      { key: 'ch47_spawn', label: 'CH47' },
      { key: 'raid_detected', label: '袭击检测' },
      { key: 'vending_new', label: '新售货机' },
    ]
  }
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function NotificationSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/settings/notifications`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
      }
    } catch (error) {
      console.error('加载通知设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key, value) => {
    const oldValue = settings[key];
    setSettings(prev => ({ ...prev, [key]: value }));

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/settings/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });

      if (!response.ok) throw new Error('保存失败');
    } catch (error) {
      setSettings(prev => ({ ...prev, [key]: oldValue }));
      toast.error('保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/settings/notifications/reset`, {
        method: 'POST'
      });

      if (response.ok) {
        setSettings(DEFAULT_SETTINGS);
        toast.success('已恢复默认设置');
      } else {
        throw new Error('重置失败');
      }
    } catch (error) {
      toast.error('重置设置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-500/20 flex items-center justify-center">
            <FaBell className="text-yellow-400 text-sm" />
          </div>
          <div>
            <h3 className="font-semibold text-base">通知设置</h3>
            <p className="text-xs text-gray-500">队伍聊天通知</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <FaSync className={`text-[10px] ${saving ? 'animate-spin' : ''}`} />
          重置
        </button>
      </div>

      {/* 两列网格布局 */}
      <div className="grid grid-cols-2 gap-3">
        {NOTIFICATION_GROUPS.map(group => (
          <div key={group.id} className="bg-dark-800/50 rounded-lg border border-white/5 overflow-hidden">
            {/* 分组头部 */}
            <div className={`px-3 py-2 flex items-center gap-2 ${group.bgColor}`}>
              <group.icon className={`${group.color} text-xs`} />
              <span className="font-medium text-xs text-gray-200">{group.label}</span>
            </div>

            {/* 分组内容 */}
            <div className="p-2 space-y-1">
              {group.items.map(item => (
                <div
                  key={item.key}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs text-gray-300">{item.label}</span>
                  <ToggleSwitch
                    checked={settings[item.key]}
                    onChange={(checked) => handleToggle(item.key, checked)}
                    disabled={saving}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 昼夜提醒 - 独立卡片 */}
      <div className="bg-gradient-to-r from-yellow-500/5 to-blue-500/5 rounded-lg border border-white/5 overflow-hidden">
        <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <FaSun className="text-yellow-400 text-xs" />
              <FaMoon className="text-blue-400 text-xs" />
            </div>
            <span className="font-medium text-xs text-gray-200">昼夜提醒</span>
          </div>
          <ToggleSwitch
            checked={settings.day_night_enabled}
            onChange={(checked) => handleToggle('day_night_enabled', checked)}
            disabled={saving}
            size="sm"
          />
        </div>

        {settings.day_night_enabled && (
          <div className="p-3 grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-dark-800/50 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <FaSun className="text-yellow-400 text-xs" />
                <span className="text-xs text-gray-300">天亮</span>
              </div>
              <div className="flex items-center gap-1.5">
                <NumberInput
                  value={settings.day_notify_minutes}
                  onChange={(val) => handleToggle('day_notify_minutes', val)}
                  min={1}
                  max={15}
                  disabled={saving}
                />
                <span className="text-[10px] text-gray-500">分钟</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-dark-800/50 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <FaMoon className="text-blue-400 text-xs" />
                <span className="text-xs text-gray-300">天黑</span>
              </div>
              <div className="flex items-center gap-1.5">
                <NumberInput
                  value={settings.night_notify_minutes}
                  onChange={(val) => handleToggle('night_notify_minutes', val)}
                  min={1}
                  max={15}
                  disabled={saving}
                />
                <span className="text-[10px] text-gray-500">分钟</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-[10px] text-gray-600 text-center">
        通知将发送到游戏内队伍聊天
      </div>
    </div>
  );
}

// 开关组件
function ToggleSwitch({ checked, onChange, disabled, size = 'md' }) {
  const sizes = {
    sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
    md: { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5' },
  };
  const s = sizes[size] || sizes.md;

  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative ${s.track} rounded-full transition-all duration-200 ${
        checked ? 'bg-rust-accent' : 'bg-dark-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 ${s.thumb} rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? s.translate : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// 数字输入组件
function NumberInput({ value, onChange, min = 1, max = 15, disabled }) {
  return (
    <div className="flex items-center gap-0.5 bg-dark-700 rounded overflow-hidden">
      <button
        onClick={() => value > min && onChange(value - 1)}
        disabled={disabled || value <= min}
        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
      >
        -
      </button>
      <span className="w-5 text-center text-xs font-mono text-white">{value}</span>
      <button
        onClick={() => value < max && onChange(value + 1)}
        disabled={disabled || value >= max}
        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
      >
        +
      </button>
    </div>
  );
}

export default NotificationSettings;
