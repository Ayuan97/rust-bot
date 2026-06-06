import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { FaBell, FaUser, FaShip, FaHelicopter, FaOilCan, FaBox, FaSync, FaSun, FaMoon, FaCrosshairs, FaTerminal } from 'react-icons/fa';
import { useToast } from './Toast';
import api from '../services/api';

// 默认通知设置
const DEFAULT_SETTINGS = {
  player_death: true,
  player_online: true,
  player_offline: true,
  player_joined_team: true,
  player_left_team: true,
  player_afk: true,
  player_afk_minutes: 3,
  player_afk_template: '',
  player_afk_return: true,
  player_afk_return_template: '',
  cargo_spawn: true,
  cargo_dock: true,
  cargo_egress: true,
  cargo_leave: false,
  heli_spawn: true,
  heli_downed: true,
  heli_leave: false,
  oil_rig_triggered: true,
  oil_rig_warning: true,
  oil_rig_unlocked: true,
  crate_spawn: false,
  ch47_spawn: false,
  vending_new: false,
  bradley_destroyed: true,
  bradley_crate: true,
  bradley_respawn: true,
  day_night_enabled: true,
  day_notify_minutes: 5,
  night_notify_minutes: 8,
  cmd_help: true,
  cmd_time: true,
  cmd_pop: true,
  cmd_team: true,
  cmd_online: true,
  cmd_afk: true,
  cmd_cargo: true,
  cmd_heli: true,
  cmd_small: true,
  cmd_large: true,
  cmd_shop: true,
  cmd_tr: true,
  cmd_trf: true,
  cmd_leader: true,
};

// 通知分组配置
const NOTIFICATION_GROUPS = [
  {
    id: 'player',
    label: '队员监控',
    code: 'TEAM',
    icon: FaUser,
    items: [
      { key: 'player_death', label: '死亡通知' },
      { key: 'player_online', label: '上线通知' },
      { key: 'player_offline', label: '下线通知' },
      { key: 'player_joined_team', label: '加入队伍' },
      { key: 'player_left_team', label: '离开队伍' },
      { key: 'player_afk', label: '挂机检测' },
      { key: 'player_afk_return', label: '挂机返回通知' },
    ]
  },
  {
    id: 'cargo',
    label: '货船追踪',
    code: 'CARGO',
    icon: FaShip,
    items: [
      { key: 'cargo_spawn', label: '货船刷新' },
      { key: 'cargo_dock', label: '货船停靠' },
      { key: 'cargo_egress', label: 'Egress 信号' },
      { key: 'cargo_leave', label: '货船离港' },
    ]
  },
  {
    id: 'heli',
    label: '直升机警报',
    code: 'HELI',
    icon: FaHelicopter,
    items: [
      { key: 'heli_spawn', label: '直升机刷新' },
      { key: 'heli_downed', label: '直升机击落' },
      { key: 'heli_leave', label: '直升机撤离' },
    ]
  },
  {
    id: 'oil',
    label: '油井情报',
    code: 'OIL RIG',
    icon: FaOilCan,
    items: [
      { key: 'oil_rig_triggered', label: '油井触发' },
      { key: 'oil_rig_warning', label: '箱子倒计时' },
      { key: 'oil_rig_unlocked', label: '箱子解锁' },
    ]
  },
  {
    id: 'bradley',
    label: '坦克警报',
    code: 'BRADLEY',
    icon: FaCrosshairs,
    items: [
      { key: 'bradley_destroyed', label: '坦克摧毁' },
      { key: 'bradley_crate', label: '箱子可拾取' },
      { key: 'bradley_respawn', label: '坦克重生' },
    ]
  },
  {
    id: 'other',
    label: '其他事件',
    code: 'EVENTS',
    icon: FaBox,
    items: [
      { key: 'crate_spawn', label: '上锁箱子' },
      { key: 'ch47_spawn', label: 'CH47 出动' },
      { key: 'vending_new', label: '新售货机' },
    ]
  },
  {
    id: 'commands',
    label: '游戏命令',
    code: 'COMMANDS',
    icon: FaTerminal,
    items: [
      { key: 'cmd_help', label: '!help' },
      { key: 'cmd_time', label: '!time' },
      { key: 'cmd_pop', label: '!pop' },
      { key: 'cmd_team', label: '!team' },
      { key: 'cmd_online', label: '!online' },
      { key: 'cmd_afk', label: '!afk' },
      { key: 'cmd_cargo', label: '!cargo' },
      { key: 'cmd_heli', label: '!heli' },
      { key: 'cmd_small', label: '!small' },
      { key: 'cmd_large', label: '!large' },
      { key: 'cmd_shop', label: '!shop' },
      { key: 'cmd_tr', label: '!tr' },
      { key: 'cmd_trf', label: '!trf' },
      { key: 'cmd_leader', label: '!leader' },
    ]
  }
];

function NotificationSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const afkTemplateRef = useRef(null);
  const afkReturnTemplateRef = useRef(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings/notifications');
      if (response.data.success && response.data.settings) {
        const serverSettings = response.data.settings;
        const filteredSettings = Object.fromEntries(
          Object.entries(serverSettings).filter(([_, v]) => v !== null && v !== undefined)
        );
        setSettings(prev => ({ ...prev, ...filteredSettings }));
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
      const response = await api.post('/settings/notifications', { [key]: value });
      if (!response.data.success) {
        throw new Error(response.data.error || '保存失败');
      }
    } catch (error) {
      setSettings(prev => ({ ...prev, [key]: oldValue }));
      const errorMsg = error.response?.data?.error || error.message || '保存设置失败';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const response = await api.post('/settings/notifications/reset');
      if (response.data.success) {
        setSettings(DEFAULT_SETTINGS);
        toast.success('配置已重置为默认值');
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
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <FaSync className="animate-spin text-hazard text-2xl" />
        <span className="tac-label">LOADING CONFIG // 加载配置中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-ink-line">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-hazard flex items-center justify-center shrink-0">
            <FaBell className="text-white text-lg" />
          </div>
          <div>
            <div className="tac-label flex items-center gap-2">通知控制台 // BROADCAST</div>
            <h3 className="text-lg font-extrabold text-fg tracking-tight mt-0.5">队伍聊天广播系统</h3>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={saving}
          className="tac-btn tac-btn-ghost !py-2.5"
        >
          <FaSync className={saving ? 'animate-spin' : ''} />
          重置
        </button>
      </div>

      {/* 通知分组网格 */}
      <div className="grid grid-cols-2 gap-4">
        {NOTIFICATION_GROUPS.map(group => (
          <div key={group.id} className="border border-ink-line bg-ink-850">
            {/* 分组头部 */}
            <div className="px-4 py-3 bg-ink-800 border-b border-ink-line flex items-center gap-3">
              <group.icon className="text-hazard text-sm shrink-0" />
              <span className="tac-label">{group.label} // {group.code}</span>
            </div>

            {/* 分组内容 */}
            <div className="p-3 space-y-px">
              {group.items.map(item => (
                <div key={item.key}>
                  <div className="flex items-center justify-between px-3 py-2.5 hover:bg-ink-800/60 transition-colors">
                    <span className="text-xs text-fg-dim">{item.label}</span>
                    <TacticToggle
                      checked={settings[item.key]}
                      onChange={(checked) => handleToggle(item.key, checked)}
                      disabled={saving}
                    />
                  </div>

                  {/* AFK 扩展配置 */}
                  {item.key === 'player_afk' && settings.player_afk && (
                    <div className="mx-2 mt-2 mb-3 p-4 bg-ink-900 border border-ink-line space-y-4">
                      {/* 触发时间 */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-fg-dim">触发阈值</span>
                        <div className="flex items-center gap-2">
                          <TacticNumberInput
                            value={settings.player_afk_minutes}
                            onChange={(val) => handleToggle('player_afk_minutes', val)}
                            min={1}
                            max={30}
                            disabled={saving}
                          />
                          <span className="text-xs text-fg-mute">分钟</span>
                        </div>
                      </div>

                      {/* 消息模板 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-fg-dim">消息模板</span>
                          <span className="text-[10px] text-fg-mute">留空使用默认</span>
                        </div>
                        <TacticTextInput
                          ref={afkTemplateRef}
                          value={settings.player_afk_template}
                          onChange={(val) => handleToggle('player_afk_template', val)}
                          placeholder="`{name}` 在 {position} 已挂机 {minutes} 分钟"
                          disabled={saving}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-fg-mute">点击插入:</span>
                          {[
                            { var: '{name}', label: '名字', required: true },
                            { var: '{position}', label: '坐标' },
                            { var: '{minutes}', label: '分钟' },
                            { var: '{duration}', label: '时长' },
                          ].map(v => (
                            <button
                              key={v.var}
                              type="button"
                              onClick={() => afkTemplateRef.current?.insertText(v.var)}
                              disabled={saving}
                              className={`px-2 py-1 font-mono text-[10px] border transition-colors disabled:opacity-50 ${
                                v.required
                                  ? 'bg-hazard-dim text-hazard border-hazard/40 hover:bg-hazard hover:text-white'
                                  : 'text-fg-dim border-ink-line hover:text-fg hover:border-fg-dim'
                              }`}
                            >
                              {v.var}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AFK 返回扩展配置 */}
                  {item.key === 'player_afk_return' && settings.player_afk_return && (
                    <div className="mx-2 mt-2 mb-3 p-4 bg-ink-900 border border-ink-line space-y-4">
                      {/* 消息模板 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-fg-dim">消息模板</span>
                          <span className="text-[10px] text-fg-mute">留空使用默认</span>
                        </div>
                        <TacticTextInput
                          ref={afkReturnTemplateRef}
                          value={settings.player_afk_return_template}
                          onChange={(val) => handleToggle('player_afk_return_template', val)}
                          placeholder="`{name}` 在离开 {minutes} 分钟后回来了"
                          disabled={saving}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-fg-mute">点击插入:</span>
                          {[
                            { var: '{name}', label: '名字', required: true },
                            { var: '{minutes}', label: '分钟' },
                            { var: '{duration}', label: '时长' },
                          ].map(v => (
                            <button
                              key={v.var}
                              type="button"
                              onClick={() => afkReturnTemplateRef.current?.insertText(v.var)}
                              disabled={saving}
                              className={`px-2 py-1 font-mono text-[10px] border transition-colors disabled:opacity-50 ${
                                v.required
                                  ? 'bg-hazard-dim text-hazard border-hazard/40 hover:bg-hazard hover:text-white'
                                  : 'text-fg-dim border-ink-line hover:text-fg hover:border-fg-dim'
                              }`}
                            >
                              {v.var}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 昼夜提醒模块 */}
      <div className="border border-ink-line bg-ink-850">
        <div className="px-4 py-3 bg-ink-800 border-b border-ink-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <FaSun className="text-hazard text-sm" />
              <FaMoon className="text-fg-dim text-sm" />
            </div>
            <span className="tac-label">昼夜循环提醒 // DAY/NIGHT</span>
          </div>
          <TacticToggle
            checked={settings.day_night_enabled}
            onChange={(checked) => handleToggle('day_night_enabled', checked)}
            disabled={saving}
          />
        </div>

        {settings.day_night_enabled && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-ink-900 border border-ink-line">
              <div className="flex items-center gap-2">
                <FaSun className="text-hazard text-sm" />
                <span className="text-xs text-fg-dim">天亮前</span>
              </div>
              <div className="flex items-center gap-2">
                <TacticNumberInput
                  value={settings.day_notify_minutes}
                  onChange={(val) => handleToggle('day_notify_minutes', val)}
                  min={1}
                  max={15}
                  disabled={saving}
                />
                <span className="text-xs text-fg-mute">分钟</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-ink-900 border border-ink-line">
              <div className="flex items-center gap-2">
                <FaMoon className="text-fg-dim text-sm" />
                <span className="text-xs text-fg-dim">天黑前</span>
              </div>
              <div className="flex items-center gap-2">
                <TacticNumberInput
                  value={settings.night_notify_minutes}
                  onChange={(val) => handleToggle('night_notify_minutes', val)}
                  min={1}
                  max={15}
                  disabled={saving}
                />
                <span className="text-xs text-fg-mute">分钟</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="font-mono text-[10px] uppercase tracking-wider text-fg-mute text-center">
        BROADCAST TO TEAM CHAT // 通知将发送到游戏内队伍聊天
      </div>
    </div>
  );
}

// 战术风格开关
function TacticToggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`w-9 h-5 flex items-center border transition-colors ${
        checked ? 'bg-hazard border-hazard' : 'bg-ink-700 border-ink-line'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-fg-dim'}`}
    >
      <span
        className={`w-3 h-3 transition-all ${
          checked ? 'ml-[18px] bg-white' : 'ml-0.5 bg-fg-mute'
        }`}
      />
    </button>
  );
}

// 战术风格数字输入
function TacticNumberInput({ value, onChange, min = 1, max = 15, disabled }) {
  return (
    <div className="flex items-center bg-ink-700 border border-ink-line">
      <button
        onClick={() => value > min && onChange(value - 1)}
        disabled={disabled || value <= min}
        className="w-6 h-6 flex items-center justify-center text-fg-dim hover:text-fg hover:bg-ink-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
      >
        -
      </button>
      <span className="w-7 text-center font-mono text-xs font-bold text-fg tabular-nums">{value}</span>
      <button
        onClick={() => value < max && onChange(value + 1)}
        disabled={disabled || value >= max}
        className="w-6 h-6 flex items-center justify-center text-fg-dim hover:text-fg hover:bg-ink-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
      >
        +
      </button>
    </div>
  );
}

// 战术风格文本输入
const TacticTextInput = forwardRef(({ value, onChange, placeholder, disabled }, ref) => {
  const [localValue, setLocalValue] = useState(value || '');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  useImperativeHandle(ref, () => ({
    insertText: (text) => {
      const input = inputRef.current;
      if (!input) return;

      const start = input.selectionStart || localValue.length;
      const end = input.selectionEnd || localValue.length;
      const newValue = localValue.slice(0, start) + text + localValue.slice(end);

      setLocalValue(newValue);
      onChange(newValue);

      setTimeout(() => {
        input.focus();
        const newPos = start + text.length;
        input.setSelectionRange(newPos, newPos);
      }, 0);
    }
  }));

  const handleBlur = () => {
    setIsFocused(false);
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={`tac-input !py-2.5 !text-xs ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    />
  );
});

export default NotificationSettings;
