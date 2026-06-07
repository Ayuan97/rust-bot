import { useState, useEffect } from 'react';
import {
  FaShieldAlt, FaSync, FaPlus, FaTrash, FaBellSlash, FaPowerOff,
  FaPlay, FaPaperPlane, FaMoon, FaCheckCircle
} from 'react-icons/fa';
import { useToast } from './Toast';
import api from '../services/api';

const maskKey = (k) => (k ? `${String(k).slice(0, 6)}••••` : '');

function fmtUntil(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function RaidAlertSettings() {
  const [status, setStatus] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', barkKey: '' });
  const toast = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [s, r] = await Promise.all([
        api.get('/raid-alert/status'),
        api.get('/raid-alert/recipients'),
      ]);
      if (s.data.success) setStatus(s.data.status);
      if (r.data.success) setRecipients(r.data.recipients || []);
    } catch (e) {
      toast.error('加载突袭警报配置失败');
    } finally {
      setLoading(false);
    }
  };

  const act = async (fn, okMsg) => {
    try {
      setBusy(true);
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const addRecipient = async () => {
    if (!form.name.trim() || !form.barkKey.trim()) {
      toast.warning('请填写名字和 Bark Key');
      return;
    }
    await act(async () => {
      await api.post('/raid-alert/recipients', form);
      setForm({ name: '', barkKey: '' });
    }, '已添加通知人');
  };

  const testOne = async (id) => {
    try {
      await api.post(`/raid-alert/recipients/${id}/test`);
      toast.success('测试通知已发送，请看手机');
    } catch {
      toast.error('测试发送失败');
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

  const mode = status?.mode || 'ACTIVE';

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-ink-line">
        <div className="w-11 h-11 bg-hazard flex items-center justify-center shrink-0">
          <FaShieldAlt className="text-white text-lg" />
        </div>
        <div>
          <div className="tac-label">突袭强提醒 // RAID ALERT</div>
          <h3 className="text-lg font-extrabold text-fg tracking-tight mt-0.5">智能警报触发 → 电话级强提醒</h3>
        </div>
      </div>

      {/* 总开关状态 */}
      <div className="p-4 bg-ink-800 border border-ink-line">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {mode === 'ACTIVE' && (
              <>
                <span className="w-2 h-2 bg-terminal animate-tac-blink" />
                <div>
                  <div className="text-sm font-bold text-fg">警报正常</div>
                  <div className="text-[11px] text-fg-dim">智能警报触发时会强提醒所有启用的通知人</div>
                </div>
              </>
            )}
            {mode === 'SNOOZED' && (
              <>
                <span className="w-2 h-2 bg-hazard-bright animate-tac-blink" />
                <div>
                  <div className="text-sm font-bold text-fg">临时静音中</div>
                  <div className="text-[11px] text-fg-dim">
                    <span className="font-mono tabular-nums text-hazard">{fmtUntil(status?.snoozeUntil)}</span> 自动恢复
                  </div>
                </div>
              </>
            )}
            {mode === 'DISABLED' && (
              <>
                <span className="w-2 h-2 bg-fg-mute" />
                <div>
                  <div className="text-sm font-bold text-fg">已彻底关闭</div>
                  <div className="text-[11px] text-fg-dim">手动恢复前不会发送任何强提醒</div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode !== 'ACTIVE' ? (
              <button onClick={() => act(() => api.post('/raid-alert/activate'), '已恢复警报')}
                disabled={busy} className="tac-btn tac-btn-primary !py-2 !px-3">
                <FaPlay className="text-xs" /> 恢复
              </button>
            ) : (
              <>
                <button onClick={() => act(() => api.post('/raid-alert/snooze'), '已临时静音')}
                  disabled={busy} className="tac-btn tac-btn-ghost !py-2 !px-3">
                  <FaMoon className="text-xs" /> 临时静音 6h
                </button>
                <button onClick={() => act(() => api.post('/raid-alert/disable'), '已彻底关闭')}
                  disabled={busy} className="tac-btn tac-btn-ghost !py-2 !px-3">
                  <FaPowerOff className="text-xs" /> 彻底关闭
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-ink-line text-[11px] text-fg-mute leading-relaxed">
          <span className="font-mono text-hazard-bright text-[10px] uppercase tracking-wider mr-1">TIP</span>
          游戏内队友也可在队伍聊天发 <span className="text-hazard font-mono">!静音</span> 临时静音 6 小时（适合后台没人时）。
          一次突袭智能警报会连触发多次，但每个静音窗口只发一条，不会刷爆手机。
        </div>
      </div>

      {/* 通知人列表 */}
      <div className="space-y-3">
        <div className="tac-label border-l-2 border-hazard pl-2">RECIPIENTS // 通知人（单独开关 = 这个人永久不收）</div>

        {recipients.length === 0 && (
          <div className="p-4 bg-ink-850 border border-ink-line text-sm text-fg-dim">
            还没有通知人。在下面添加你和队友的 Bark Key，突袭时会同时强提醒所有启用的人。
          </div>
        )}

        {recipients.map((r) => (
          <div key={r.id} className="p-3 bg-ink-800 border border-ink-line flex items-center gap-3 flex-wrap">
            <button
              onClick={() => act(() => api.patch(`/raid-alert/recipients/${r.id}`, { enabled: !r.enabled }))}
              disabled={busy}
              className={`w-10 h-6 flex items-center px-0.5 transition-colors ${r.enabled ? 'bg-terminal/30 justify-end' : 'bg-ink-line justify-start'}`}
              title={r.enabled ? '已启用（点击关闭）' : '已关闭（点击启用）'}
            >
              <span className={`w-5 h-5 ${r.enabled ? 'bg-terminal' : 'bg-fg-mute'}`} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-fg truncate">{r.name}</div>
              <div className="text-[11px] text-fg-mute font-mono truncate">{maskKey(r.barkKey)}</div>
            </div>
            <button onClick={() => testOne(r.id)} className="tac-btn tac-btn-ghost !py-1.5 !px-2.5" title="发一条测试">
              <FaPaperPlane className="text-xs" /> 测试
            </button>
            <button onClick={() => act(() => api.delete(`/raid-alert/recipients/${r.id}`), '已删除')}
              disabled={busy} className="tac-btn tac-btn-ghost !py-1.5 !px-2.5 hover:!border-hazard/50" title="删除">
              <FaTrash className="text-xs" />
            </button>
          </div>
        ))}
      </div>

      {/* 添加通知人 */}
      <div className="p-4 bg-ink-850 border border-ink-line space-y-3">
        <div className="tac-label">ADD RECIPIENT // 添加通知人</div>
        <input className="tac-input" placeholder="名字（如：队长 / 我）"
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="tac-input font-mono text-[12px]" placeholder="粘贴 Bark 完整地址  https://api.day.app/xxxxxxxx"
          value={form.barkKey} onChange={(e) => setForm({ ...form, barkKey: e.target.value })} />
        <button onClick={addRecipient} disabled={busy} className="tac-btn tac-btn-primary w-full">
          <FaPlus /> 添加
        </button>
        <div className="text-[11px] text-fg-mute leading-relaxed flex items-start gap-1.5">
          <FaCheckCircle className="text-terminal mt-0.5 shrink-0" />
          iPhone 装 Bark App → 首页直接复制整条推送地址粘进来（后面的推送内容部分不用删，系统会自动去掉）→ 点"测试"确认能收到。建议在 App 里开启"重要提醒"，突袭时才能绕过静音强制响铃。
        </div>
      </div>
    </div>
  );
}

export default RaidAlertSettings;
