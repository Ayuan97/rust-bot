import { useState, useEffect } from 'react';
import { FaBell, FaUser, FaShip, FaHelicopter, FaOilCan, FaBox, FaBomb, FaStore, FaSync } from 'react-icons/fa';
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
};

// 通知分组配置
const NOTIFICATION_GROUPS = [
  {
    id: 'player',
    label: '玩家通知',
    icon: FaUser,
    color: 'text-blue-400',
    items: [
      { key: 'player_death', label: '死亡通知', desc: '队友死亡时发送通知' },
      { key: 'player_online', label: '上线通知', desc: '队友上线时发送通知' },
      { key: 'player_offline', label: '下线通知', desc: '队友下线时发送通知' },
      { key: 'player_afk', label: '挂机通知', desc: '队友挂机超过3分钟时发送通知' },
    ]
  },
  {
    id: 'cargo',
    label: '货船通知',
    icon: FaShip,
    color: 'text-cyan-400',
    items: [
      { key: 'cargo_spawn', label: '货船刷新', desc: '货船出现时发送通知' },
      { key: 'cargo_dock', label: '货船停靠', desc: '货船停靠港口时发送通知' },
      { key: 'cargo_egress', label: 'Egress警告', desc: '货船即将离开时发送通知' },
      { key: 'cargo_leave', label: '货船离开', desc: '货船离开地图时发送通知' },
    ]
  },
  {
    id: 'heli',
    label: '直升机通知',
    icon: FaHelicopter,
    color: 'text-red-400',
    items: [
      { key: 'heli_spawn', label: '直升机刷新', desc: '武装直升机出现时发送通知' },
      { key: 'heli_downed', label: '直升机击落', desc: '武装直升机被击落时发送通知' },
      { key: 'heli_leave', label: '直升机离开', desc: '武装直升机离开地图时发送通知' },
    ]
  },
  {
    id: 'oil',
    label: '油井通知',
    icon: FaOilCan,
    color: 'text-green-400',
    items: [
      { key: 'oil_rig_triggered', label: '油井触发', desc: '大/小油井被触发时发送通知' },
      { key: 'oil_rig_warning', label: '箱子倒计时', desc: '油井箱子解锁前3分钟发送通知' },
      { key: 'oil_rig_unlocked', label: '箱子解锁', desc: '油井箱子解锁时发送通知' },
    ]
  },
  {
    id: 'other',
    label: '其他事件',
    icon: FaBox,
    color: 'text-purple-400',
    items: [
      { key: 'crate_spawn', label: '上锁箱子', desc: '地图上出现上锁箱子时发送通知' },
      { key: 'ch47_spawn', label: 'CH47', desc: 'CH47出现时发送通知' },
      { key: 'raid_detected', label: '袭击检测', desc: '检测到袭击活动时发送通知' },
      { key: 'vending_new', label: '新售货机', desc: '新售货机出现时发送通知' },
    ]
  }
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function NotificationSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // 加载设置
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

  // 保存单个设置
  const handleToggle = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/settings/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }
    } catch (error) {
      // 回滚
      setSettings(prev => ({ ...prev, [key]: !value }));
      toast.error('保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  // 重置为默认设置
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
            <FaBell className="text-yellow-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg">通知设置</h3>
            <p className="text-xs text-gray-500">配置游戏内队伍聊天通知</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <FaSync className={saving ? 'animate-spin' : ''} />
          恢复默认
        </button>
      </div>

      {/* Notification Groups */}
      <div className="space-y-4">
        {NOTIFICATION_GROUPS.map(group => (
          <div key={group.id} className="bg-dark-700/50 rounded-xl border border-white/5 overflow-hidden">
            {/* Group Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <group.icon className={`${group.color}`} />
              <span className="font-medium text-sm">{group.label}</span>
            </div>

            {/* Group Items */}
            <div className="divide-y divide-white/5">
              {group.items.map(item => (
                <div key={item.key} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="text-sm font-medium text-gray-200">{item.label}</div>
                    <div className="text-xs text-gray-500 truncate">{item.desc}</div>
                  </div>
                  <ToggleSwitch
                    checked={settings[item.key]}
                    onChange={(checked) => handleToggle(item.key, checked)}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <div className="text-xs text-gray-500 text-center py-2">
        通知将发送到游戏内的队伍聊天中
      </div>
    </div>
  );
}

// 开关组件
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-rust-accent' : 'bg-dark-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default NotificationSettings;
