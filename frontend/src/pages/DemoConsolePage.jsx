import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaArrowRight,
  FaLock,
  FaServer,
  FaUsers,
  FaMapMarkedAlt,
  FaCogs,
  FaCrosshairs,
  FaFire,
  FaWarehouse,
  FaLightbulb,
  FaBolt,
  FaBell,
  FaShieldAlt
} from 'react-icons/fa';
import useSEO from '../hooks/useSEO';

const DEMO_EVENTS = [
  { id: 1, time: '刚刚', text: '核心区报警器触发（领地柜房）', level: 'high' },
  { id: 2, time: '2 分钟前', text: '队友 Echo 在 G12 阵亡', level: 'warn' },
  { id: 3, time: '5 分钟前', text: '货船事件刷新，位置 J8 海域', level: 'info' }
];

const DEMO_TEAM = [
  { id: '1', name: 'Alpha', state: '在线', pos: 'K14-3' },
  { id: '2', name: 'Bravo', state: '在线', pos: 'K15-1' },
  { id: '3', name: 'Echo', state: '离线', pos: '最后在线 G12-7' }
];

// Rust+ 真实智能设备模型：智能开关 / 智能警报 / 储物监视器
const DEMO_SWITCHES = [
  { id: 's1', name: '外墙自动炮塔', tag: '防御', icon: <FaCrosshairs />, on: true, online: true },
  { id: 's2', name: '大门火焰陷阱', tag: '防御', icon: <FaFire />, on: false, online: true },
  { id: 's3', name: '主车库门', tag: '门禁', icon: <FaWarehouse />, on: false, online: true },
  { id: 's4', name: '地堡串灯', tag: '照明', icon: <FaLightbulb />, on: true, online: true },
  { id: 's5', name: '抽水机供电', tag: '资源', icon: <FaBolt />, on: true, online: false }
];

const DEMO_ALARMS = [
  { id: 'a1', name: '领地柜警报', loc: '核心区 · 1号柜房', lastTrigger: '12 分钟前' },
  { id: 'a2', name: '后门入侵警报', loc: '2 号门 · 外圈', lastTrigger: '从未' }
];

const DEMO_MONITOR = {
  id: 'm1',
  name: '主工具柜 TC',
  upkeep: '1 天 08 小时',
  items: [
    { n: '木材', v: '14.2k' },
    { n: '石头', v: '22.0k' },
    { n: '金属', v: '8.4k' },
    { n: '高质量', v: '1.2k' }
  ]
};

const DEMO_TRACKING = [
  { id: 't1', name: 'SneakyWolf', lastSeen: 'H6', risk: '中' },
  { id: 't2', name: 'RustTiger', lastSeen: 'M10', risk: '高' }
];

const TABS = [
  { id: 'hud', label: '基地概览', en: 'OVERVIEW', icon: <FaServer /> },
  { id: 'team', label: '队友动态', en: 'SQUAD', icon: <FaUsers /> },
  { id: 'map', label: '实时地图', en: 'MAP', icon: <FaMapMarkedAlt /> },
  { id: 'devices', label: '设备中控', en: 'DEVICES', icon: <FaCogs /> },
  { id: 'tracking', label: '玩家追踪', en: 'TRACKING', icon: <FaCrosshairs /> }
];

function DemoConsolePage() {
  useSEO({
    title: '在线演示 - Rust+ 网页控制台（免登录体验）',
    description: '无需登录，在线体验 Rust+ 控制台完整界面：实时地图、设备远程控制、事件监控、队友追踪、报警推送。',
    path: '/demo',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.id === initialTab) ? initialTab : 'hud'
  );
  const [seenTabs, setSeenTabs] = useState(() => new Set([activeTab]));
  const [lockDialog, setLockDialog] = useState({ open: false, actionName: '' });
  const [coachHint, setCoachHint] = useState('');
  const modalTimerRef = useRef(null);

  const redirectTarget = useMemo(
    () => `/dashboard?view=${encodeURIComponent(activeTab)}&from=demo`,
    [activeTab]
  );
  const loginLink = `/login?redirect=${encodeURIComponent(redirectTarget)}`;
  const registerLink = `/register?redirect=${encodeURIComponent(redirectTarget)}`;

  const onboardingSteps = useMemo(() => ([
    { id: 'step-1', label: '查看基地概览', done: seenTabs.has('hud') },
    { id: 'step-2', label: '切换至少 2 个模块', done: seenTabs.size >= 3 },
    { id: 'step-3', label: '登录解锁全部功能', done: false }
  ]), [seenTabs]);

  const promptLogin = (actionName, detail) => {
    if (modalTimerRef.current) window.clearTimeout(modalTimerRef.current);

    setCoachHint(
      detail
        ? `${detail} 登录后会回到当前模块继续操作。`
        : `你点击的是「${actionName}」，登录后会回到当前模块继续操作。`
    );
    modalTimerRef.current = window.setTimeout(() => {
      setCoachHint('');
      setLockDialog({ open: true, actionName });
    }, 900);
  };

  useEffect(() => {
    setSeenTabs((prev) => {
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });

    const nextParams = new URLSearchParams(window.location.search);
    if (nextParams.get('tab') !== activeTab) {
      nextParams.set('tab', activeTab);
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, setSearchParams]);

  useEffect(() => {
    return () => {
      if (modalTimerRef.current) window.clearTimeout(modalTimerRef.current);
    };
  }, []);

  const activeMeta = TABS.find((t) => t.id === activeTab);

  return (
    <div className="tac-fx h-screen flex flex-col bg-ink-900 text-fg font-sans overflow-hidden">
      {/* ===== 顶栏（全宽） ===== */}
      <header className="shrink-0 h-16 border-b border-ink-line bg-ink-900/90 backdrop-blur flex items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="w-9 h-9 bg-hazard flex items-center justify-center shrink-0" title="返回首页">
            <FaArrowLeft className="text-white text-sm" />
          </Link>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base font-extrabold text-fg truncate">Rust+ 演示控制台</h1>
            <div className="tac-label flex items-center gap-1.5">
              <span className="w-1 h-1 bg-hazard animate-tac-blink" /> DEMO MODE · 可看不可操作
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <Link to={loginLink} className="tac-btn tac-btn-ghost !px-3 md:!px-4 !py-2.5">登录</Link>
          <Link to={registerLink} className="tac-btn tac-btn-primary !px-3 md:!px-4 !py-2.5">免费注册</Link>
        </div>
      </header>

      <LockActionModal
        open={lockDialog.open}
        actionName={lockDialog.actionName}
        loginLink={loginLink}
        registerLink={registerLink}
        onClose={() => setLockDialog({ open: false, actionName: '' })}
      />

      {coachHint && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-xl px-4 py-2.5 border border-ink-line2 bg-ink-800 text-fg text-sm shadow-2xl">
          <span className="font-mono text-hazard text-xs mr-2">[i]</span>{coachHint}
        </div>
      )}

      {/* ===== 主体：左侧栏 + 右内容，全屏铺满 ===== */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* 侧栏 */}
        <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-ink-line bg-ink-900 flex md:flex-col">
          <div className="hidden md:block tac-label px-4 py-3 border-b border-ink-line">模块 // MODULES</div>
          <nav className="flex md:flex-col md:flex-1 p-2 gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 md:w-full text-left px-3 py-2.5 md:py-3 flex items-center gap-2.5 border-l-2 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-hazard-dim border-hazard text-fg'
                    : 'border-transparent text-fg-dim hover:text-fg hover:bg-ink-800'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-hazard' : 'text-fg-mute'}>{tab.icon}</span>
                <span className="text-sm font-bold whitespace-nowrap">{tab.label}</span>
                {seenTabs.has(tab.id) && <span className="hidden md:block ml-auto w-1.5 h-1.5 bg-terminal" />}
              </button>
            ))}
          </nav>
          {/* 体验进度（桌面侧栏底部） */}
          <div className="hidden md:block border-t border-ink-line p-3 space-y-2">
            <div className="tac-label">体验进度 // PROGRESS</div>
            {onboardingSteps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-2 text-[11px]">
                <span className={`font-mono ${step.done ? 'text-terminal' : 'text-fg-mute'}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className={step.done ? 'text-fg' : 'text-fg-dim'}>{step.label}</span>
                {step.done && <span className="ml-auto w-1.5 h-1.5 bg-terminal" />}
              </div>
            ))}
          </div>
        </aside>

        {/* 内容区 */}
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
          {/* 锁定条 */}
          <div className="border-b border-ink-line bg-hazard-dim px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-start gap-3">
              <span className="font-mono text-hazard text-xs mt-0.5 shrink-0">[LOCKED]</span>
              <p className="text-[13px] text-fg-dim">写操作（连接、配对、控制设备、发消息）已锁定，登录后即可使用。</p>
            </div>
            <Link to={loginLink} className="tac-btn tac-btn-primary !py-2 shrink-0 w-fit">
              <FaLock className="text-[10px]" /> 登录解锁
            </Link>
          </div>

          {/* 标题栏 */}
          <div className="px-4 md:px-8 pt-6 pb-1">
            <div className="tac-label mb-1">{activeMeta?.en}</div>
            <h2 className="text-2xl font-extrabold text-fg tracking-tight">{activeMeta?.label}</h2>
          </div>

          <div className="px-4 md:px-8 py-6">
            {activeTab === 'hud' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink-line border border-ink-line">
                  <StatCard tag="SERVER" value="在线" hint="EU Monthly #12" />
                  <StatCard tag="FCM" value="就绪" hint="推送链路正常" />
                  <StatCard tag="SQUAD" value="2/3" hint="队友实时同步" />
                  <StatCard tag="ALERT" value="警戒中" hint="近 10 分钟" highlight />
                </div>
                <div className="border border-ink-line">
                  <div className="tac-label px-4 py-3 border-b border-ink-line">事件时间线 // EVENT LOG</div>
                  {DEMO_EVENTS.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-line last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-1.5 h-1.5 shrink-0 ${event.level === 'high' ? 'bg-hazard' : event.level === 'warn' ? 'bg-fg' : 'bg-fg-mute'}`} />
                        <span className="text-sm text-fg truncate">{event.text}</span>
                      </div>
                      <span className="font-mono text-[11px] text-fg-mute uppercase tracking-wider shrink-0">{event.time}</span>
                    </div>
                  ))}
                </div>
                <ReadOnlyActionRow
                  onAction={() => promptLogin('连接服务器', '登录后你可以连接真实服务器并开始实时监控。')}
                  onSecondary={() => promptLogin('一键封锁', '登录后可对已连接服务器执行一键封锁。')}
                  primaryText="连接服务器（需登录）"
                  secondaryText="一键封锁（需登录）"
                />
              </div>
            )}

            {activeTab === 'team' && (
              <div className="space-y-6">
                <div className="border border-ink-line">
                  {DEMO_TEAM.map((member) => (
                    <div key={member.id} className="flex items-center justify-between px-4 py-3 border-b border-ink-line last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`w-1.5 h-1.5 shrink-0 ${member.state === '在线' ? 'bg-terminal' : 'bg-fg-mute'}`} />
                        <div>
                          <div className="text-sm font-bold text-fg">{member.name}</div>
                          <div className="font-mono text-[11px] text-fg-mute uppercase tracking-wider">{member.pos}</div>
                        </div>
                      </div>
                      <span className={`font-mono text-[11px] uppercase tracking-wider ${member.state === '在线' ? 'text-terminal' : 'text-fg-mute'}`}>
                        {member.state === '在线' ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                  ))}
                </div>
                <ReadOnlyActionRow
                  onAction={() => promptLogin('发送队伍消息', '登录后可给队伍发送实时聊天消息。')}
                  onSecondary={() => promptLogin('查看完整聊天', '登录后可查看完整聊天历史并实时接收消息。')}
                  primaryText="发送队伍消息（需登录）"
                  secondaryText="查看完整聊天（需登录）"
                />
              </div>
            )}

            {activeTab === 'map' && (
              <div className="space-y-6">
                <div className="h-[24rem] lg:h-[32rem] border border-ink-line bg-ink-850 relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-[0.18]"
                    style={{
                      backgroundImage: 'linear-gradient(#2A2A2A 1px, transparent 1px), linear-gradient(90deg, #2A2A2A 1px, transparent 1px)',
                      backgroundSize: '40px 40px'
                    }}
                  />
                  <MapDot x="22%" y="45%" label="ALPHA" />
                  <MapDot x="40%" y="58%" label="核心区" color="hazard" />
                  <MapDot x="72%" y="30%" label="货船事件" color="hazard" />
                  <div className="absolute bottom-3 right-3 tac-label bg-ink-900/80 px-2 py-1">DEMO MAP · 非实时</div>
                </div>
                <ReadOnlyActionRow
                  onAction={() => promptLogin('地图定位', '登录后可在真实地图定位队友和事件点。')}
                  onSecondary={() => promptLogin('下载高清地图', '登录后可下载当前服务器的高清地图。')}
                  primaryText="地图定位（需登录）"
                  secondaryText="下载高清地图（需登录）"
                />
              </div>
            )}

            {activeTab === 'devices' && (
              <div className="space-y-8">
                {/* 智能开关 */}
                <DeviceGroup title="智能开关" en="SMART SWITCH" hint="远程控制供电设备 · 5 台">
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px bg-ink-line border border-ink-line">
                    {DEMO_SWITCHES.map((d) => (
                      <SwitchCard
                        key={d.id}
                        device={d}
                        onToggle={() => promptLogin(`控制设备「${d.name}」`, `登录后可实时切换「${d.name}」的开关状态。`)}
                      />
                    ))}
                  </div>
                </DeviceGroup>

                {/* 智能警报 */}
                <DeviceGroup title="智能警报" en="SMART ALARM" hint="触发时实时推送 · 2 个">
                  <div className="grid sm:grid-cols-2 gap-px bg-ink-line border border-ink-line">
                    {DEMO_ALARMS.map((d) => (
                      <AlarmCard key={d.id} device={d} />
                    ))}
                  </div>
                </DeviceGroup>

                {/* 储物监视器 */}
                <DeviceGroup title="储物监视器" en="STORAGE MONITOR" hint="监控工具柜上料与到期">
                  <MonitorCard monitor={DEMO_MONITOR} />
                </DeviceGroup>

                <ReadOnlyActionRow
                  onAction={() => promptLogin('批量设备控制', '登录后可批量执行设备开关与白天/夜晚自动化策略。')}
                  onSecondary={() => promptLogin('新增设备', '登录后可在游戏内配对并管理你的智能设备。')}
                  primaryText="批量控制（需登录）"
                  secondaryText="配对新设备（需登录）"
                />
              </div>
            )}

            {activeTab === 'tracking' && (
              <div className="space-y-6">
                <div className="border border-ink-line">
                  {DEMO_TRACKING.map((player) => (
                    <div key={player.id} className="flex items-center justify-between px-4 py-3 border-b border-ink-line last:border-0">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-fg">{player.name}</div>
                        <div className="font-mono text-[11px] text-fg-mute uppercase tracking-wider">LAST SEEN · {player.lastSeen}</div>
                      </div>
                      <div className={`font-mono text-[11px] uppercase tracking-wider shrink-0 ${player.risk === '高' ? 'text-hazard' : 'text-fg-dim'}`}>
                        RISK {player.risk}
                      </div>
                    </div>
                  ))}
                </div>
                <ReadOnlyActionRow
                  onAction={() => promptLogin('添加追踪目标', '登录后可添加玩家并持续追踪动向。')}
                  onSecondary={() => promptLogin('查看历史轨迹', '登录后可查看完整历史轨迹与画像。')}
                  primaryText="添加追踪目标（需登录）"
                  secondaryText="查看历史轨迹（需登录）"
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ tag, value, hint, highlight = false }) {
  return (
    <div className="bg-ink-850 p-4">
      <div className="tac-label mb-2 flex items-center gap-1.5">
        {highlight && <span className="w-1 h-1 bg-hazard animate-tac-blink" />}{tag}
      </div>
      <div className={`text-2xl font-extrabold ${highlight ? 'text-hazard' : 'text-fg'}`}>{value}</div>
      <div className="text-[11px] text-fg-dim mt-1">{hint}</div>
    </div>
  );
}

function DeviceGroup({ title, en, hint, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-bold text-fg">{title}</span>
        <span className="tac-label">{en}</span>
        <span className="text-[11px] text-fg-mute ml-auto">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function SwitchCard({ device, onToggle }) {
  return (
    <div className="bg-ink-850 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 flex items-center justify-center border shrink-0 ${device.on ? 'border-hazard bg-hazard-dim text-hazard' : 'border-ink-line text-fg-mute'}`}>
        {device.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-fg truncate">{device.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">{device.tag}</span>
          <span className={`font-mono text-[10px] uppercase tracking-wider ${device.online ? 'text-terminal' : 'text-fg-mute'}`}>
            {device.online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`w-12 h-6 border relative transition-colors shrink-0 ${device.on ? 'bg-hazard-dim border-hazard/50' : 'bg-ink-700 border-ink-line'}`}
        aria-label={`控制设备 ${device.name}`}
      >
        <span className={`absolute top-[3px] w-4 h-4 transition-all ${device.on ? 'right-[3px] bg-hazard' : 'left-[3px] bg-fg-mute'}`} />
      </button>
    </div>
  );
}

function AlarmCard({ device }) {
  const triggered = device.lastTrigger !== '从未';
  return (
    <div className="bg-ink-850 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 flex items-center justify-center border shrink-0 ${triggered ? 'border-hazard/50 text-hazard' : 'border-ink-line text-fg-mute'}`}>
        <FaBell />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-fg truncate">{device.name}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-mute mt-0.5 truncate">{device.loc}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="tac-label !text-[10px]">最后触发</div>
        <div className={`font-mono text-xs mt-0.5 ${triggered ? 'text-hazard' : 'text-fg-mute'}`}>{device.lastTrigger}</div>
      </div>
    </div>
  );
}

function MonitorCard({ monitor }) {
  return (
    <div className="border border-ink-line bg-ink-850 p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center border border-ink-line text-fg-dim shrink-0">
            <FaShieldAlt />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-fg truncate">{monitor.name}</div>
            <div className="tac-label !text-[10px]">维护倒计时 // UPKEEP</div>
          </div>
        </div>
        <div className="font-mono text-base text-hazard tabular-nums shrink-0">{monitor.upkeep}</div>
      </div>
      <div className="grid grid-cols-4 gap-px bg-ink-line border border-ink-line">
        {monitor.items.map((it) => (
          <div key={it.n} className="bg-ink-900 px-2 py-2 text-center">
            <div className="tac-label !text-[9px]">{it.n}</div>
            <div className="font-mono text-xs text-fg mt-1 tabular-nums">{it.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LockActionModal({ open, actionName, loginLink, registerLink, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md tac-panel tac-corners">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-hazard-dim border border-hazard/40 text-hazard flex items-center justify-center shrink-0">
              <FaLock />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-fg">演示模式已锁定</h3>
              <div className="tac-label">READ-ONLY · 不发送真实指令</div>
            </div>
          </div>
          <p className="text-sm text-fg-dim mb-5">
            <span className="text-hazard font-bold">{actionName}</span> 需要登录后使用。登录后会直接回到当前模块继续操作。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to={loginLink} className="tac-btn tac-btn-primary !py-2.5">立即登录</Link>
            <Link to={registerLink} className="tac-btn tac-btn-ghost !py-2.5">免费注册</Link>
            <button onClick={onClose} className="tac-btn tac-btn-ghost !py-2.5 ml-auto">继续演示</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyActionRow({ onAction, onSecondary, primaryText, secondaryText }) {
  return (
    <div className="flex flex-wrap gap-3 pt-1">
      <button onClick={onAction} className="tac-btn tac-btn-primary">
        <FaLock className="text-[10px]" /> {primaryText}
      </button>
      <button onClick={onSecondary} className="tac-btn tac-btn-ghost">
        <FaArrowRight className="text-[10px]" /> {secondaryText}
      </button>
    </div>
  );
}

function MapDot({ x, y, label, color = 'terminal' }) {
  const dotClass = color === 'hazard' ? 'bg-hazard' : 'bg-terminal';
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      <div className={`w-2 h-2 ${dotClass}`} />
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-fg bg-ink-900/80 px-1.5 py-0.5 w-fit">
        {label}
      </div>
    </div>
  );
}

export default DemoConsolePage;
