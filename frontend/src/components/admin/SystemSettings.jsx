import { useEffect, useState } from 'react';
import { FaSlidersH, FaSync, FaSave, FaDoorOpen, FaUserShield, FaGift } from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';

/**
 * 系统设置 - 注册模式与免费策略
 * 仅对「新注册」用户生效；已有用户不受影响。
 */
export default function SystemSettings() {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/config');
      if (res.data.success) setConfig(res.data.data);
    } catch (err) {
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = (patch) => setConfig((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!config) return;
    const days = Number.parseInt(config.freeTrialDays, 10);
    if (config.freeTrialEnabled && (Number.isNaN(days) || days < 1 || days > 3650)) {
      toast.error('免费天数必须是 1-3650 的整数');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put('/admin/config', {
        registrationMode: config.registrationMode,
        freeTrialEnabled: config.freeTrialEnabled,
        freeTrialDays: Number.isNaN(days) ? undefined : days
      });
      if (res.data.success) {
        setConfig(res.data.data);
        toast.success('配置已保存');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="py-16 text-center text-fg-dim">
        <FaSync className="animate-spin inline mr-2" /> 加载中...
      </div>
    );
  }

  const isApproval = config.registrationMode === 'approval';

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 标题 */}
      <div className="min-w-0">
        <div className="tac-label flex items-center gap-2">
          <FaSlidersH className="text-hazard" /> 系统设置 // CONFIG
        </div>
        <h2 className="text-xl font-extrabold text-fg mt-1">注册与免费策略</h2>
        <p className="text-[13px] text-fg-dim mt-1">以下设置仅对「新注册」用户生效，已有用户不受影响。</p>
      </div>

      {/* 注册模式 */}
      <div className="tac-panel p-5">
        <div className="flex items-center gap-2 mb-1">
          <FaDoorOpen className="text-hazard text-sm" />
          <h3 className="text-sm font-bold text-fg">注册模式</h3>
        </div>
        <p className="text-[12px] text-fg-mute mb-4">控制新用户注册后能否立即使用，还是需要你在后台审核通过。</p>

        <div className="grid sm:grid-cols-2 gap-3">
          <ModeCard
            active={!isApproval}
            onClick={() => update({ registrationMode: 'open' })}
            icon={<FaDoorOpen />}
            en="OPEN"
            title="开放注册，注册即用"
            desc="任何人都能注册，注册后立即可用（配合下方免费策略）。"
          />
          <ModeCard
            active={isApproval}
            onClick={() => update({ registrationMode: 'approval' })}
            icon={<FaUserShield />}
            en="REVIEW"
            title="注册后需我审核"
            desc="用户能注册并登录，但需你在「用户运营」里审核通过后才能使用。"
          />
        </div>
      </div>

      {/* 免费策略 */}
      <div className="tac-panel p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaGift className="text-hazard text-sm" />
            <h3 className="text-sm font-bold text-fg">免费试用</h3>
          </div>
          <Toggle checked={config.freeTrialEnabled} onChange={(v) => update({ freeTrialEnabled: v })} />
        </div>
        <p className="text-[12px] text-fg-mute mt-1">
          开启后，新用户{isApproval ? '审核通过时' : '注册时'}自动获得一段免费订阅时长。
        </p>

        <div className={`mt-4 flex items-center gap-3 ${config.freeTrialEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <label className="text-[12px] font-bold text-fg-dim shrink-0">免费天数</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={config.freeTrialDays}
            onChange={(e) => update({ freeTrialDays: e.target.value })}
            className="tac-input !w-32 !py-2 font-mono tabular-nums"
          />
          <span className="text-[12px] text-fg-mute">天（默认 30）</span>
        </div>
      </div>

      {/* 当前生效摘要 + 保存 */}
      <div className="flex items-center justify-between tac-panel p-4">
        <div className="text-[12px] text-fg-dim leading-relaxed">
          <span className="tac-label !text-hazard">当前生效</span>
          <p className="mt-1">
            {isApproval ? '注册后需审核' : '开放注册即用'} ·{' '}
            {config.freeTrialEnabled ? `免费 ${config.freeTrialDays} 天` : '不送免费时长'}
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="tac-btn tac-btn-primary !py-2.5 shrink-0">
          <FaSave className={saving ? 'animate-spin' : ''} /> 保存设置
        </button>
      </div>
    </div>
  );
}

function ModeCard({ active, onClick, icon, en, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border p-4 transition-colors ${
        active ? 'border-hazard bg-hazard-dim' : 'border-ink-line bg-ink-850 hover:border-fg-mute'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={active ? 'text-hazard' : 'text-fg-mute'}>{icon}</span>
        <span className="text-sm font-bold text-fg">{title}</span>
        <span className="tac-label !text-[9px] ml-auto">{en}</span>
      </div>
      <p className="text-[11px] text-fg-mute leading-relaxed">{desc}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 ${active ? 'bg-hazard' : 'bg-ink-line2'}`} />
        <span className={`font-mono text-[9px] uppercase tracking-wider ${active ? 'text-hazard' : 'text-fg-mute'}`}>
          {active ? '已选用' : '点击选用'}
        </span>
      </div>
    </button>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 border transition-colors ${
        checked ? 'bg-hazard border-hazard' : 'bg-ink-700 border-ink-line'
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
