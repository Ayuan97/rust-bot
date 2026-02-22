import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBell,
  FaCheckCircle,
  FaCog,
  FaCogs,
  FaCrosshairs,
  FaLock,
  FaMapMarkedAlt,
  FaPlay,
  FaServer,
  FaSignInAlt,
  FaUsers
} from 'react-icons/fa';

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

const DEMO_DEVICES = [
  { id: 'd1', name: '核心区总电闸', status: true },
  { id: 'd2', name: '主门组联动', status: false },
  { id: 'd3', name: '外圈自动炮塔', status: true }
];

const DEMO_TRACKING = [
  { id: 't1', name: 'SneakyWolf', lastSeen: 'H6', risk: '中' },
  { id: 't2', name: 'RustTiger', lastSeen: 'M10', risk: '高' }
];

const TABS = [
  { id: 'hud', label: '基地概览', icon: <FaServer /> },
  { id: 'team', label: '队友动态', icon: <FaUsers /> },
  { id: 'map', label: '实时地图', icon: <FaMapMarkedAlt /> },
  { id: 'devices', label: '设备中控', icon: <FaCogs /> },
  { id: 'tracking', label: '玩家追踪', icon: <FaCrosshairs /> }
];

function DemoConsolePage() {
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
    { id: 'step-1', label: '先看基地概览', done: seenTabs.has('hud') },
    { id: 'step-2', label: '切换至少 2 个模块', done: seenTabs.size >= 3 },
    { id: 'step-3', label: '登录后解锁全部功能', done: false }
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

  return (
    <div className="min-h-screen bg-[#0D0E10] text-[#e0e0e0] font-sans">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="w-9 h-9 tactic-cut border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
              <FaArrowLeft className="text-sm text-gray-300" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm md:text-lg font-black uppercase tracking-wide truncate">Rust+ 演示控制台</h1>
              <p className="text-[10px] text-yellow-300 uppercase tracking-widest">演示模式 · 可看不可操作</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Link to={loginLink} className="px-3 md:px-4 py-2 text-[11px] font-black uppercase tactic-cut bg-blue-600 hover:bg-blue-700 transition-all inline-flex items-center gap-2">
              <FaSignInAlt /> 登录
            </Link>
            <Link to={registerLink} className="px-3 md:px-4 py-2 text-[11px] font-black uppercase tactic-cut bg-[#cd5241] hover:bg-[#b04537] transition-all">
              免费注册
            </Link>
          </div>
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
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-xl px-4 py-2 tactic-cut border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm">
          {coachHint}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
        <div className="mb-6 p-4 tactic-cut border border-yellow-500/30 bg-yellow-500/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-yellow-100">
              你正在查看完整控制台演示。写操作（连接、配对、控制设备、发消息）已锁定，登录后即可使用。
            </p>
            <Link to={loginLink} className="text-[11px] font-black uppercase px-4 py-2 tactic-cut bg-yellow-500 text-black hover:bg-yellow-400 transition-all inline-flex items-center gap-2 w-fit">
              <FaLock /> 登录解锁
            </Link>
          </div>
        </div>

        <div className="mb-6 tactic-cut border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">建议体验顺序</div>
          <div className="grid md:grid-cols-3 gap-2">
            {onboardingSteps.map((step) => (
              <div
                key={step.id}
                className={`tactic-cut border px-3 py-2 text-xs flex items-center gap-2 ${
                  step.done
                    ? 'border-green-500/30 bg-green-500/10 text-green-300'
                    : 'border-white/10 bg-black/20 text-gray-400'
                }`}
              >
                {step.done ? <FaCheckCircle /> : <FaLock className="text-[10px]" />}
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-[220px_1fr] gap-4 md:gap-6">
          <aside className="tactic-border tactic-cut p-1 bg-black/40">
            <div className="bg-black/40 p-3 space-y-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-3 tactic-cut flex items-center gap-2 transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#cd5241] text-white'
                      : 'bg-white/[0.03] text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  <span className="text-xs font-black uppercase tracking-wide">{tab.label}</span>
                  {seenTabs.has(tab.id) && (
                    <span className="ml-auto text-green-400">
                      <FaCheckCircle className="text-[11px]" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="tactic-border tactic-cut p-1 bg-black/40 min-h-[520px]">
            <div className="bg-black/40 h-full p-4 md:p-6">
              {activeTab === 'hud' && (
                <div className="space-y-6">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard title="服务器状态" value="在线" hint="EU Monthly #12" />
                    <StatCard title="推送链路" value="就绪" hint="FCM 正常" />
                    <StatCard title="在线队友" value="2/3" hint="实时同步" />
                    <StatCard title="事件等级" value="警戒中" hint="近 10 分钟" highlight />
                  </div>
                  <div className="tactic-cut border border-white/10 bg-white/[0.02] p-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">事件时间线（演示）</h3>
                    <div className="space-y-3">
                      {DEMO_EVENTS.map((event) => (
                        <div key={event.id} className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <span className={`mt-1 w-2 h-2 rounded-full ${
                              event.level === 'high' ? 'bg-red-400' : event.level === 'warn' ? 'bg-yellow-400' : 'bg-blue-400'
                            }`} />
                            <span className="text-sm text-gray-200">{event.text}</span>
                          </div>
                          <span className="text-[10px] text-gray-500 uppercase">{event.time}</span>
                        </div>
                      ))}
                    </div>
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
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">队友动态（演示）</h3>
                  <div className="space-y-2">
                    {DEMO_TEAM.map((member) => (
                      <div key={member.id} className="tactic-cut border border-white/10 bg-white/[0.02] p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold">{member.name}</div>
                          <div className="text-[11px] text-gray-500">{member.pos}</div>
                        </div>
                        <span className={`text-[11px] font-black uppercase ${
                          member.state === '在线' ? 'text-green-400' : 'text-gray-500'
                        }`}>
                          {member.state}
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
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">实时地图（演示）</h3>
                  <div className="h-72 md:h-96 tactic-cut border border-white/10 bg-gradient-to-br from-[#10212f] to-[#182f1a] relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_30%,#ffffff,transparent_60%)]" />
                    <MapDot x="22%" y="45%" label="Alpha" />
                    <MapDot x="40%" y="58%" label="核心区" color="red" />
                    <MapDot x="72%" y="30%" label="事件点" color="yellow" />
                    <div className="absolute bottom-3 right-3 text-[10px] text-gray-300 bg-black/40 px-2 py-1 tactic-cut">
                      演示地图 · 非实时
                    </div>
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
                <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">设备中控（演示）</h3>
                  <div className="space-y-2">
                    {DEMO_DEVICES.map((device) => (
                      <div key={device.id} className="tactic-cut border border-white/10 bg-white/[0.02] p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold">{device.name}</div>
                          <div className="text-[11px] text-gray-500">状态仅演示，不会发送控制指令</div>
                        </div>
                        <button
                          onClick={() => promptLogin(
                            `控制设备「${device.name}」`,
                            `登录后可实时切换「${device.name}」状态。`
                          )}
                          className={`w-11 h-6 tactic-cut border transition-all ${
                            device.status
                              ? 'bg-[#cd5241]/20 border-[#cd5241]/50'
                              : 'bg-gray-800 border-white/10'
                          }`}
                          aria-label={`控制设备 ${device.name}`}
                        >
                          <span className={`block w-4 h-4 bg-white tactic-cut transition-all ${device.status ? 'ml-6' : 'ml-1'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <ReadOnlyActionRow
                    onAction={() => promptLogin('批量设备控制', '登录后可批量执行设备开关与联动策略。')}
                    onSecondary={() => promptLogin('新增设备', '登录后可添加并管理你的设备列表。')}
                    primaryText="批量控制（需登录）"
                    secondaryText="新增设备（需登录）"
                  />
                </div>
              )}

              {activeTab === 'tracking' && (
                <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">玩家追踪（演示）</h3>
                  <div className="space-y-2">
                    {DEMO_TRACKING.map((player) => (
                      <div key={player.id} className="tactic-cut border border-white/10 bg-white/[0.02] p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold">{player.name}</div>
                          <div className="text-[11px] text-gray-500">最近位置：{player.lastSeen}</div>
                        </div>
                        <div className="text-[11px] uppercase font-black text-yellow-300">风险 {player.risk}</div>
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
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, hint, highlight = false }) {
  return (
    <div className={`tactic-cut border p-3 ${
      highlight ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-white/10 bg-white/[0.02]'
    }`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest">{title}</div>
      <div className="text-lg font-black mt-1">{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{hint}</div>
    </div>
  );
}

function LockActionModal({ open, actionName, loginLink, registerLink, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md tactic-border tactic-cut p-1 bg-black/70">
        <div className="bg-black/80 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 tactic-cut bg-yellow-500/20 text-yellow-300 flex items-center justify-center">
              <FaLock />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-wide">演示模式已锁定</h3>
              <p className="text-[11px] text-gray-400">可看可学，不会发送真实指令</p>
            </div>
          </div>
          <p className="text-sm text-gray-200 mb-5">
            <span className="text-yellow-300 font-bold">{actionName}</span> 需要登录后使用。
            登录后会直接回到当前模块继续操作。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to={loginLink} className="px-4 py-2 tactic-cut bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase inline-flex items-center gap-2">
              <FaSignInAlt /> 立即登录
            </Link>
            <Link to={registerLink} className="px-4 py-2 tactic-cut bg-[#cd5241] hover:bg-[#b04537] text-xs font-black uppercase">
              免费注册
            </Link>
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 tactic-cut bg-white/10 hover:bg-white/20 text-xs font-black uppercase"
            >
              继续演示
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyActionRow({ onAction, onSecondary, primaryText, secondaryText }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={onAction}
        className="px-4 py-3 tactic-cut border border-[#cd5241]/40 bg-[#cd5241]/10 hover:bg-[#cd5241]/20 transition-all text-xs font-black uppercase tracking-wide inline-flex items-center gap-2"
      >
        <FaLock /> {primaryText}
      </button>
      <button
        onClick={onSecondary}
        className="px-4 py-3 tactic-cut border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] transition-all text-xs font-black uppercase tracking-wide inline-flex items-center gap-2"
      >
        <FaPlay /> {secondaryText}
      </button>
    </div>
  );
}

function MapDot({ x, y, label, color = 'green' }) {
  const colorClass =
    color === 'red'
      ? 'bg-red-500'
      : color === 'yellow'
        ? 'bg-yellow-400'
        : 'bg-green-400';
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      <div className={`w-2.5 h-2.5 rounded-full ${colorClass} shadow-[0_0_8px_currentColor]`} />
      <div className="mt-1 text-[10px] text-white/80 bg-black/40 px-1.5 py-0.5 tactic-cut w-fit">
        {label}
      </div>
    </div>
  );
}

export default DemoConsolePage;
