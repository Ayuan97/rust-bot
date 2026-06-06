import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaServer,
  FaComments,
  FaCogs,
  FaSatelliteDish,
  FaCrosshairs,
  FaMoneyBillWave,
  FaArrowRight,
  FaPlay,
  FaLock,
  FaShieldAlt,
  FaBell,
  FaWarehouse,
  FaShip,
  FaHelicopter,
  FaBoxOpen,
} from 'react-icons/fa';
import api from '../services/api';

export default function HomePage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);

  // 如果已登录，跳转到 dashboard
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // 获取套餐配置
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await api.get('/payment/plans');
        const data = res.data;
        if (data.success && data.plans) {
          setPlans(data.plans);
        }
      } catch (err) {
        console.error('获取套餐失败:', err);
      }
    };
    fetchPlans();
  }, []);

  // 平滑滚动到指定锚点
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="tac-fx min-h-screen bg-ink-900 text-fg font-sans overflow-x-hidden">
      {/* ============ 导航栏 ============ */}
      <header className="fixed top-0 w-full z-50 border-b border-ink-line bg-ink-900/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 px-5 md:px-8 h-16">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-hazard flex items-center justify-center shrink-0">
              <img src="/logo.svg" alt="Rust+" className="w-6 h-6 object-contain" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="font-mono text-sm font-bold tracking-[0.2em] text-fg">RUST+</div>
              <div className="tac-label hidden sm:block">TACTICAL OPS CONSOLE</div>
            </div>
          </Link>

          {/* 中间导航链接 */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('features')}
              className="tac-label hover:text-hazard transition-colors"
            >
              功能 // FEATURES
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="tac-label hover:text-hazard transition-colors"
            >
              价格 // PRICING
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="tac-label hover:text-hazard transition-colors"
            >
              问答 // FAQ
            </button>
            <Link to="/privacy" className="tac-label hover:text-hazard transition-colors">
              隐私 // PRIVACY
            </Link>
          </nav>

          {/* 右侧按钮 */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <Link to="/demo" className="hidden sm:inline-flex tac-label hover:text-fg transition-colors">
              体验控制台
            </Link>
            <Link to="/login" className="tac-btn tac-btn-ghost !px-3 md:!px-4 !py-2.5">登录</Link>
            <Link to="/register" className="tac-btn tac-btn-primary !px-3 md:!px-4 !py-2.5">免费注册</Link>
          </div>
        </div>
      </header>

      {/* ============ Hero 区 ============ */}
      <section className="relative border-b border-ink-line overflow-hidden">
        {/* 背景超大水印 */}
        <div className="absolute -right-12 bottom-0 select-none pointer-events-none font-mono font-extrabold text-[20vw] leading-none text-fg/[0.035] tracking-tighter">
          RUST+
        </div>
        {/* 背景网格 */}
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#2A2A2A 1px, transparent 1px), linear-gradient(90deg, #2A2A2A 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        <div className="relative z-10 max-w-[1400px] mx-auto px-5 md:px-8 pt-32 md:pt-40 pb-16 md:pb-24">
          <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
            {/* 左：主文案 */}
            <div>
              <div className="tac-label mb-6 flex items-center gap-3">
                <span className="w-10 h-px bg-hazard" /> REMOTE BASE COMMAND · 远程基地中控 v2.0
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold text-fg leading-[0.95] tracking-tightest">
                离线也能
                <br />
                <span className="text-hazard">掌控</span> 你的基地
              </h1>
              <p className="mt-7 max-w-xl text-base leading-relaxed text-fg-dim">
                在 Rust 的残酷世界里，离线不代表防御停止。连接你的服务器集群，实时掌握基地防御、队友动向与事件预警——
                警报触发即刻推送，设备远程联控，玩家轨迹尽在掌握。配对凭证通过 Microsoft Edge 插件获取，流程清晰、上手更快。
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/register" className="tac-btn tac-btn-primary !py-4 group">
                  进入控制台 // LAUNCH
                  <FaArrowRight className="text-xs group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/demo" className="tac-btn tac-btn-ghost !py-4 group">
                  <FaPlay className="text-[10px]" /> 先体验 // DEMO
                </Link>
                <Link to="/login" className="tac-btn tac-btn-ghost !py-4">
                  已有账号 // SIGN IN
                </Link>
              </div>

              {/* 遥测数据条 */}
              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink-line border border-ink-line max-w-2xl">
                <Telemetry label="NODES" value="07" />
                <Telemetry label="UPTIME" value="99.2%" />
                <Telemetry label="LATENCY" value="42ms" />
                <Telemetry label="LINK" value="SECURE" live />
              </div>
            </div>

            {/* 右：手机推送遥测面板 */}
            <div className="relative">
              <div className="tac-panel tac-corners">
                {/* 面板顶栏 */}
                <div className="flex items-center justify-between px-4 h-11 border-b border-ink-line">
                  <div className="tac-label flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> PUSH FEED // LIVE
                  </div>
                  <span className="font-mono text-[10px] text-fg-mute tabular-nums">0x1A</span>
                </div>

                {/* 推送通知流 */}
                <div className="p-4 space-y-px bg-ink-line border-b border-ink-line">
                  <NotifyRow
                    level="high"
                    tag="ALARM"
                    title="智能报警器触发：领地柜房"
                    time="刚刚"
                  />
                  <NotifyRow
                    level="warn"
                    tag="SQUAD"
                    title="队友 小李 在 G12 阵亡"
                    time="2 分钟前"
                  />
                  <NotifyRow
                    level="info"
                    tag="EVENT"
                    title="货船事件刷新，位置 J8 海域"
                    time="5 分钟前"
                  />
                </div>

                {/* 储物 / 上料读数 */}
                <div className="grid grid-cols-3 gap-px bg-ink-line">
                  <PanelReadout label="UPKEEP" value="1d 08h" />
                  <PanelReadout label="SULFUR" value="14.2k" />
                  <PanelReadout label="ONLINE" value="2/3" live />
                </div>

                {/* 底部 barcode */}
                <div className="px-4 py-3 border-t border-ink-line flex items-center gap-3">
                  <span className="tac-label shrink-0">SIGNAL</span>
                  <div className="h-4 flex-1 tac-barcode opacity-30" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 快速能力一览 ============ */}
      <section className="border-b border-ink-line">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-20">
          <div className="mb-10">
            <div className="tac-label mb-2 flex items-center gap-2">
              <FaServer className="text-hazard text-[11px]" /> CAPABILITIES // 你能直接做到
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-fg tracking-tight">六大核心能力</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-ink-line border border-ink-line">
            <QuickUseCard
              icon={<FaServer />}
              en="SERVER"
              title="服务器连接"
              desc="完成 Rust+ 配对后实时接入服务器，掌握在线状态、队伍信息与基地全局。"
            />
            <QuickUseCard
              icon={<FaComments />}
              en="TEAM CHAT"
              title="队伍聊天"
              desc="网页直接收发队伍消息，离线也能与队友沟通、下达指令。"
            />
            <QuickUseCard
              icon={<FaCogs />}
              en="DEVICES"
              title="设备控制"
              desc="智能开关 · 警报 · 储物监视器，远程开关炮塔电力、监控工具柜上料。"
            />
            <QuickUseCard
              icon={<FaSatelliteDish />}
              en="EVENTS"
              title="事件监控"
              desc="货船 · 武装直升机 · 上锁箱刷新即时播报，抢先一步规划行动。"
            />
            <QuickUseCard
              icon={<FaCrosshairs />}
              en="TRACKING"
              title="玩家追踪"
              desc="锁定重点玩家动向，记录历史轨迹与风险画像，预判敌对行动。"
            />
            <QuickUseCard
              icon={<FaMoneyBillWave />}
              en="BILLING"
              title="订阅管理"
              desc="套餐、订单、续费状态一目了然，支付宝支付即时开通。"
            />
          </div>

          <div className="mt-px flex items-center gap-3 px-4 py-3 border border-ink-line bg-hazard-dim">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-hazard shrink-0">TIP</span>
            <span className="text-[13px] text-fg-dim">
              首次上手建议：先体验控制台界面，再登录完成 Edge 插件配对。
            </span>
          </div>
        </div>
      </section>

      {/* ============ 上手流程 ============ */}
      <section className="border-b border-ink-line bg-ink-850/40">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-20">
          <div className="mb-10">
            <div className="tac-label mb-2 flex items-center gap-2">
              <FaArrowRight className="text-hazard text-[11px]" /> ONBOARDING // 第一次怎么走
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-fg tracking-tight">四步完成接入</h2>
            <p className="mt-2 text-sm text-fg-dim">按这 4 步操作，基本不会走弯路</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-line border border-ink-line">
            <GettingStartedStep
              step="01"
              title="先体验控制台"
              desc="不登录也能看完整界面，先理解功能分区。"
              actionLabel="打开演示页"
              actionTo="/demo"
            />
            <GettingStartedStep
              step="02"
              title="注册或登录"
              desc="注册后自动进入试用期，可直接进入个人控制台。"
              actionLabel="立即注册"
              actionTo="/register"
            />
            <GettingStartedStep
              step="03"
              title="完成 Edge 配对"
              desc="配对凭证需通过 Edge 插件生成并粘贴保存。"
              actionLabel="查看配对说明"
              actionTo="/demo?tab=hud"
            />
            <GettingStartedStep
              step="04"
              title="游戏内点击 Pair"
              desc="在 Rust 游戏内完成 Pair 后，即可实时连接与控制。"
              actionLabel="登录控制台"
              actionTo="/login"
            />
          </div>
        </div>
      </section>

      {/* ============ 核心功能模块 ============ */}
      <section id="features" className="border-b border-ink-line">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="mb-12">
            <div className="tac-label mb-2 flex items-center gap-2">
              <FaShieldAlt className="text-hazard text-[11px]" /> CORE MODULES // 核心功能模块
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-fg tracking-tightest">
              为离线防御而生
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-ink-line border border-ink-line">
            <FeatureCard
              icon={<FaBell />}
              en="OFFLINE ALARM"
              title="离线防拆报警"
              corners
              points={[
                '领地柜 · 后门智能警报触发即时推送',
                '基地遭袭第一时间通知，离线也守得住',
                'FCM 链路稳定，去重防漏报',
              ]}
              desc="当基地遭遇袭击、智能报警器触发，系统通过网页与推送即刻通知你，确保离线也能守护基地。"
            />
            <FeatureCard
              icon={<FaCogs />}
              en="DEVICE CONTROL"
              title="全图设备联控"
              points={[
                '自动炮塔 · 火焰陷阱 · 车库门远程开关',
                '储物监视器盯紧工具柜上料倒计时',
                '关键词搜索 · 置顶常用设备',
              ]}
              desc="远程开启自动防御炮塔、控制基地电力，甚至一键封锁所有大门，关键设备尽在指尖。"
            />
            <FeatureCard
              icon={<FaSatelliteDish />}
              en="EVENT WATCH"
              title="全图事件监控"
              points={[
                '货船 · 武装直升机刷新坐标即时播报',
                '上锁箱 · 油井事件追踪不漏过',
                '配合玩家追踪，预判敌对动向',
              ]}
              desc="货船、武装直升机、上锁箱等全图事件刷新即时上报，让你抢先一步规划进攻与防守。"
            />
          </div>
        </div>
      </section>

      {/* ============ 终端实时日志 ============ */}
      <section className="border-b border-ink-line bg-ink-850/40">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-20">
          <div className="mb-8">
            <div className="tac-label mb-2 flex items-center gap-2">
              <FaSatelliteDish className="text-hazard text-[11px]" /> LIVE TELEMETRY // 实时遥测日志
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-fg tracking-tight">系统在持续监听</h2>
          </div>

          <div className="tac-panel">
            <div className="flex items-center justify-between px-4 h-11 border-b border-ink-line">
              <div className="tac-label flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> EVENT STREAM
              </div>
              <span className="font-mono text-[10px] text-fg-mute tabular-nums">SESSION 0x1A</span>
            </div>
            <div className="p-5 md:p-6 font-mono text-[13px] leading-relaxed space-y-2">
              <LogLine ts="10:24:01" text="系统内核加载成功" tone="mute" />
              <LogLine ts="10:24:05" text="正在连接 Rust+ 官方服务器" tone="mute" />
              <LogLine ts="10:24:08" prefix=">" text="获取队伍状态：发现 12 名在线成员" tone="fg" />
              <LogLine ts="10:24:12" prefix="!" text="警报：核心房智能报警器被触发（领地柜房）" tone="hazard" />
              <LogLine ts="10:24:13" prefix=">" text="正在推送告警至已配对设备" tone="dim" />
              <LogLine ts="10:24:15" prefix="✓" text="通知已下达：管理员已收到实时推送" tone="terminal" />
              <LogLine ts="10:24:18" prefix=">" text="实时数据：队友 大王 采集 5000 硫磺" tone="fg" />
              <LogLine ts="10:24:20" text="系统运行稳定，持续监听中" tone="mute" />
            </div>
          </div>
        </div>
      </section>

      {/* ============ 价格方案 ============ */}
      <section id="pricing" className="border-b border-ink-line">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="mb-12">
            <div className="tac-label mb-2 flex items-center gap-2">
              <FaMoneyBillWave className="text-hazard text-[11px]" /> PRICING // 选择你的方案
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-fg tracking-tightest">订阅你的指挥权限</h2>
            <p className="mt-3 text-sm text-fg-dim">
              新用户注册即享 <span className="font-mono text-terminal font-bold">7</span> 天免费试用
            </p>
          </div>

          <div
            className={`grid gap-px bg-ink-line border border-ink-line ${
              plans.length === 1
                ? 'md:grid-cols-1 max-w-md'
                : plans.length === 2
                ? 'md:grid-cols-2 max-w-3xl'
                : 'md:grid-cols-3 max-w-5xl'
            }`}
          >
            {plans.length > 0 ? (
              plans.map((plan) => (
                <PricingCard
                  key={plan.id}
                  title={plan.name}
                  price={`¥${plan.price}`}
                  period={`/${plan.duration}天`}
                  features={plan.features || []}
                  highlighted={plan.highlighted}
                />
              ))
            ) : (
              // 加载中或无数据时显示占位
              <>
                <PricingCard title="周卡" price="¥9.9" period="/7天" features={['全部核心功能', '实时事件推送']} />
                <PricingCard title="半月卡" price="¥16.9" period="/15天" features={['全部核心功能', '实时事件推送']} highlighted />
                <PricingCard title="月卡" price="¥29" period="/30天" features={['全部核心功能', '实时事件推送']} />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ============ 常见问题 ============ */}
      <section id="faq" className="border-b border-ink-line bg-ink-850/40">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="mb-12">
            <div className="tac-label mb-2 flex items-center gap-2">
              <FaShieldAlt className="text-hazard text-[11px]" /> FAQ // 常见问题
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-fg tracking-tightest">配对前先看这里</h2>
          </div>

          <div className="max-w-4xl border border-ink-line bg-ink-line grid gap-px">
            <FAQItem
              question="什么是 Rust+ 配对？"
              answer="Rust+ 是 Rust 游戏官方推出的功能。完成配对后，我们的系统即可连接你的服务器，实现离线监控和远程控制。当前需通过 Microsoft Edge 插件获取配对凭证。"
            />
            <FAQItem
              question="配对安全吗？会被封号吗？"
              answer="完全安全。我们使用的是 Facepunch 官方公开的 Rust+ API，与官方手机 App 使用相同的接口，不涉及任何游戏内作弊行为。"
            />
            <FAQItem
              question="支持哪些服务器？"
              answer="支持所有启用了 Rust+ 功能的官方和社区服务器。部分模组服可能禁用了此功能，请先确认服务器支持。"
            />
            <FAQItem
              question="如何取消订阅？"
              answer="你可以随时在账户设置中取消订阅。取消后，服务将持续到当前订阅期结束，不会立即中断。"
            />
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative border-b border-ink-line overflow-hidden">
        <div className="absolute -right-12 -bottom-8 select-none pointer-events-none font-mono font-extrabold text-[18vw] leading-none text-fg/[0.035] tracking-tighter">
          DEPLOY
        </div>
        <div className="relative z-10 max-w-[1400px] mx-auto px-5 md:px-8 py-24 md:py-32">
          <div className="tac-label mb-4 flex items-center gap-3">
            <span className="w-10 h-px bg-hazard" /> READY TO DEPLOY · 准备就绪
          </div>
          <h2 className="text-5xl md:text-6xl font-extrabold text-fg tracking-tightest leading-[0.95] max-w-3xl">
            准备好统领全图了吗？
          </h2>
          <p className="mt-6 max-w-xl text-base text-fg-dim leading-relaxed">
            完成配对，从此离线也能守护基地、指挥队友、预判敌情。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/register" className="tac-btn tac-btn-primary !py-4 group">
              立即开启配对 // DEPLOY
              <FaArrowRight className="text-xs group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/demo" className="tac-btn tac-btn-ghost !py-4 group">
              <FaPlay className="text-[10px]" /> 先看演示 // PREVIEW
            </Link>
          </div>
        </div>
      </section>

      {/* ============ 页脚 ============ */}
      <footer className="bg-ink-900">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-hazard flex items-center justify-center">
                <img src="/logo.svg" alt="Rust+" className="w-5 h-5 object-contain" />
              </div>
              <div className="leading-tight">
                <div className="font-mono text-xs font-bold tracking-[0.2em] text-fg">RUST+</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-fg-mute">TACTICAL OPS CONSOLE</div>
              </div>
            </div>
            <nav className="flex flex-wrap gap-6">
              <Link to="/privacy" className="tac-label hover:text-fg transition-colors">隐私 // PRIVACY</Link>
              <button onClick={() => scrollToSection('features')} className="tac-label hover:text-fg transition-colors">功能 // FEATURES</button>
              <button onClick={() => scrollToSection('pricing')} className="tac-label hover:text-fg transition-colors">价格 // PRICING</button>
              <button onClick={() => scrollToSection('faq')} className="tac-label hover:text-fg transition-colors">问答 // FAQ</button>
            </nav>
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-mute tabular-nums">
              © 2024 RUST+ OPS · ALL SYSTEMS NOMINAL
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Telemetry({ label, value, live }) {
  return (
    <div className="bg-ink-850 px-4 py-3">
      <div className="tac-label mb-1.5 flex items-center gap-1.5">
        {live && <span className="w-1 h-1 bg-terminal animate-tac-blink" />}{label}
      </div>
      <div className="tac-readout font-bold">{value}</div>
    </div>
  );
}

function NotifyRow({ level, tag, title, time }) {
  const dotClass = level === 'high' ? 'bg-hazard' : level === 'warn' ? 'bg-fg' : 'bg-fg-mute';
  const tagClass = level === 'high' ? 'text-hazard' : 'text-fg-dim';
  return (
    <div className="bg-ink-850 px-3 py-2.5 flex items-start gap-3">
      <span className={`w-1.5 h-1.5 mt-1.5 shrink-0 ${dotClass} ${level === 'high' ? 'animate-tac-blink' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${tagClass}`}>{tag}</span>
          <span className="font-mono text-[10px] text-fg-mute uppercase tracking-wider shrink-0">{time}</span>
        </div>
        <div className="text-[13px] text-fg leading-snug">{title}</div>
      </div>
    </div>
  );
}

function PanelReadout({ label, value, live }) {
  return (
    <div className="bg-ink-850 px-3 py-2.5 text-center">
      <div className="tac-label !text-[10px] mb-1 flex items-center justify-center gap-1">
        {live && <span className="w-1 h-1 bg-terminal animate-tac-blink" />}{label}
      </div>
      <div className="font-mono text-sm text-fg tabular-nums">{value}</div>
    </div>
  );
}

function LogLine({ ts, prefix, text, tone }) {
  const toneClass =
    tone === 'hazard'
      ? 'text-hazard font-bold'
      : tone === 'terminal'
      ? 'text-terminal'
      : tone === 'fg'
      ? 'text-fg'
      : tone === 'dim'
      ? 'text-fg-dim'
      : 'text-fg-mute';
  return (
    <div className={toneClass}>
      <span className="text-fg-mute">[{ts}]</span>
      {prefix && <span className="mx-1.5">{prefix}</span>}
      {!prefix && ' '}
      {text}
    </div>
  );
}

function QuickUseCard({ icon, en, title, desc }) {
  return (
    <div className="bg-ink-850 p-6 hover:bg-ink-800 transition-colors group">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 flex items-center justify-center border border-ink-line text-hazard group-hover:border-hazard transition-colors">
          {icon}
        </div>
        <span className="tac-label">{en}</span>
      </div>
      <h3 className="text-base font-bold text-fg mb-1.5">{title}</h3>
      <p className="text-[13px] text-fg-dim leading-relaxed">{desc}</p>
    </div>
  );
}

function GettingStartedStep({ step, title, desc, actionLabel, actionTo }) {
  return (
    <div className="bg-ink-850 p-6 flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-mono text-3xl font-extrabold text-hazard tabular-nums leading-none">{step}</span>
        <span className="tac-label">STEP</span>
      </div>
      <h3 className="text-base font-bold text-fg mb-1.5">{title}</h3>
      <p className="text-[13px] text-fg-dim leading-relaxed flex-1">{desc}</p>
      <Link
        to={actionTo}
        className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-hazard hover:text-hazard-bright transition-colors w-fit"
      >
        {actionLabel}
        <FaArrowRight className="text-[10px]" />
      </Link>
    </div>
  );
}

function FeatureCard({ icon, en, title, desc, points, corners }) {
  return (
    <div className={`bg-ink-850 p-8 md:p-10 hover:bg-ink-800 transition-colors group relative ${corners ? 'tac-corners' : ''}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="w-12 h-12 flex items-center justify-center border border-ink-line text-hazard text-xl group-hover:border-hazard transition-colors">
          {icon}
        </div>
        <span className="tac-label">{en}</span>
      </div>
      <h3 className="text-2xl font-extrabold text-fg tracking-tight mb-3">{title}</h3>
      <p className="text-sm text-fg-dim leading-relaxed mb-6">{desc}</p>
      <ul className="space-y-2.5 pt-5 border-t border-ink-line">
        {points.map((point, index) => (
          <li key={index} className="flex items-start gap-2.5 text-[13px] text-fg">
            <span className="w-1.5 h-1.5 mt-1.5 bg-hazard shrink-0" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PricingCard({ title, price, period, features, highlighted }) {
  return (
    <div className={`p-8 transition-colors relative ${highlighted ? 'bg-ink-800 tac-corners' : 'bg-ink-850 hover:bg-ink-800'}`}>
      <div className="flex items-center justify-between mb-5 h-5">
        <span className="tac-label">{highlighted ? 'PLAN' : 'PLAN'}</span>
        {highlighted && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-hazard border border-hazard/40 bg-hazard-dim px-2 py-0.5">
            <span className="w-1 h-1 bg-hazard animate-tac-blink" /> 推荐
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold text-fg mb-3">{title}</h3>
      <div className="mb-6 flex items-baseline gap-1">
        <span className="font-mono text-4xl font-extrabold text-fg tabular-nums tracking-tight">{price}</span>
        <span className="font-mono text-sm text-fg-mute tabular-nums">{period}</span>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="text-[13px] text-fg-dim flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 mt-1.5 bg-hazard shrink-0" />
            {feature}
          </li>
        ))}
      </ul>
      <Link
        to="/register"
        className={`tac-btn w-full ${highlighted ? 'tac-btn-primary' : 'tac-btn-ghost'}`}
      >
        开始使用 // START
      </Link>
    </div>
  );
}

function FAQItem({ question, answer }) {
  return (
    <details className="group bg-ink-850 hover:bg-ink-800 transition-colors">
      <summary className="px-5 md:px-6 py-5 cursor-pointer flex justify-between items-center gap-4 text-fg font-bold list-none">
        <span className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-hazard text-xs shrink-0">Q</span>
          {question}
        </span>
        <span className="text-hazard transform group-open:rotate-45 transition-transform text-xl shrink-0 font-mono leading-none">+</span>
      </summary>
      <div className="px-5 md:px-6 pb-5 text-[13px] text-fg-dim leading-relaxed border-t border-ink-line pt-4 flex items-start gap-3">
        <span className="font-mono text-fg-mute text-xs shrink-0">A</span>
        {answer}
      </div>
    </details>
  );
}
