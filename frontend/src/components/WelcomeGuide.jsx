import { useState, useEffect } from 'react';
import {
  FaRocket, FaServer, FaComments, FaLightbulb, FaBell, FaShip,
  FaHelicopter, FaQrcode, FaChevronRight, FaCheckCircle, FaSteam,
  FaGamepad, FaHistory, FaMapMarkedAlt, FaUsers, FaExternalLinkAlt,
  FaMobile, FaDesktop, FaClock, FaShieldAlt, FaQuestionCircle,
  FaChevronDown, FaPlay, FaPowerOff, FaWifi, FaSkull, FaHeart,
  FaBox, FaOilCan, FaTimes, FaCheck, FaStar, FaTerminal, FaStore
} from 'react-icons/fa';

// 将静态数据移到组件外部，避免每次渲染重新创建
const features = [
  {
    icon: FaServer,
    title: '服务器监控',
    description: '实时查看服务器状态、在线玩家、游戏时间等信息',
    details: ['玩家数量实时更新', '游戏内时间显示', '队友在线状态', '服务器地图预览'],
    color: 'blue'
  },
  {
    icon: FaComments,
    title: '队伍聊天',
    description: '无需打开游戏，直接在网页上与队友聊天',
    details: ['实时消息同步', '消息通知提醒', '历史消息记录', '离线也能聊天'],
    color: 'green'
  },
  {
    icon: FaLightbulb,
    title: '智能设备控制',
    description: '远程控制游戏内的智能开关、灯光、门等设备',
    details: ['一键开关控制', '设备状态同步', '自定义设备命名', '支持所有智能设备'],
    color: 'yellow'
  },
  {
    icon: FaBell,
    title: '事件通知',
    description: '货船、直升机、空投等游戏事件实时推送',
    details: ['货船刷新提醒', '直升机出现提醒', 'CH47 事件追踪', '上锁箱子通知'],
    color: 'red'
  },
  {
    icon: FaUsers,
    title: '队友动态',
    description: '队友上下线、死亡、重生等状态实时通知',
    details: ['上线/下线提醒', '死亡位置显示', '重生通知', '队友位置追踪'],
    color: 'purple'
  },
  {
    icon: FaMapMarkedAlt,
    title: '地图功能',
    description: '查看服务器地图、标记点和队友位置',
    details: ['高清地图显示', '地图下载功能', 'Seed 查询', '纪念碑位置'],
    color: 'cyan'
  }
];

const scenarios = [
  {
    icon: FaDesktop,
    title: '工作时摸鱼',
    description: '老板看你在认真看网页，其实你在监控基地有没有被抄'
  },
  {
    icon: FaMobile,
    title: '外出时掌控',
    description: '手机打开网页，随时查看服务器状态和队友动态'
  },
  {
    icon: FaClock,
    title: '半夜守货船',
    description: '设置通知提醒，货船刷新第一时间收到推送'
  },
  {
    icon: FaShieldAlt,
    title: '远程护家',
    description: '智能警报触发时立即收到通知，远程开灯吓退入侵者'
  }
];

const comparisons = [
  { feature: '网页访问', us: true, official: false },
  { feature: '多服务器管理', us: true, official: false },
  { feature: '游戏内命令(!time等)', us: true, official: false },
  { feature: '队友上下线/挂机通知', us: true, official: false },
  { feature: '子网格精确定位(M15-3)', us: true, official: false },
  { feature: '古迹自动识别', us: true, official: false },
  { feature: '事件历史记录', us: true, official: false },
  { feature: '售货机搜索', us: true, official: false },
  { feature: '袭击检测警报', us: true, official: false },
  { feature: '队友位置追踪', us: true, official: true },
  { feature: '智能设备控制', us: true, official: true },
  { feature: '队伍聊天', us: true, official: true },
  { feature: '游戏事件通知', us: true, official: true },
  { feature: '免费使用', us: true, official: true },
];

const faqs = [
  {
    q: '这个工具安全吗？会不会被封号？',
    a: '完全安全。本工具使用 Facepunch 官方提供的 Rust+ Companion API，与官方手机 App 使用相同的接口。这是官方允许的功能，不会导致封号。'
  },
  {
    q: '我需要安装什么软件吗？',
    a: '不需要安装任何软件。只需要一个现代浏览器（Chrome、Firefox、Safari、Edge 等），打开网页即可使用。支持电脑、手机、平板。'
  },
  {
    q: '如何获取 Steam 凭证？',
    a: '访问 companion-rust.facepunch.com，使用 Steam 账号登录后，页面会显示凭证信息。复制这些信息填入本工具即可。凭证有效期通常为 30 天。'
  },
  {
    q: '可以同时监控多个服务器吗？',
    a: '可以！你可以添加多个服务器，在侧边栏中切换。每个服务器独立管理，互不影响。'
  },
  {
    q: '设备控制有延迟吗？',
    a: '延迟非常小，通常在 1 秒以内。这取决于你的网络状况和游戏服务器的响应速度。'
  },
  {
    q: '我的数据会被保存吗？',
    a: '你的服务器配置信息保存在本地服务器上，不会上传到任何第三方。聊天记录仅在当前会话中保留，刷新页面后会清空。'
  }
];

const stats = [
  { value: '< 1s', label: '控制延迟' },
  { value: '24/7', label: '全天候监控' },
  { value: '∞', label: '服务器数量' },
  { value: '0', label: '安装要求' }
];

// 游戏内命令列表
const commandGroups = [
  {
    name: '基础命令',
    color: 'blue',
    commands: [
      { cmd: '!help', desc: '显示所有可用命令' },
      { cmd: '!time', desc: '查看游戏时间，距离天亮/天黑的真实时间' },
      { cmd: '!pop', desc: '查看服务器人数和30分钟内变化趋势' },
      { cmd: '!team', desc: '查看团队状态（在线/离线/挂机成员）' },
      { cmd: '!online', desc: '查看在线队友列表' },
      { cmd: '!afk', desc: '查看挂机队友及挂机时长' },
      { cmd: '!leader [名字]', desc: '移交队长权限给指定队友' }
    ]
  },
  {
    name: '事件命令',
    color: 'red',
    commands: [
      { cmd: '!cargo', desc: '查看货船当前位置和状态' },
      { cmd: '!heli', desc: '查看武装直升机状态' },
      { cmd: '!small', desc: '查看小油井事件状态' },
      { cmd: '!large', desc: '查看大油井事件状态' },
      { cmd: '!events', desc: '查看所有当前活跃的游戏事件' },
      { cmd: '!history', desc: '查看所有事件的历史记录' }
    ]
  },
  {
    name: '实用命令',
    color: 'green',
    commands: [
      { cmd: '!shop [物品]', desc: '搜索售货机中的物品，显示位置和价格' },
      { cmd: '!smalllast', desc: '查看上次小油井事件时间' },
      { cmd: '!largelast', desc: '查看上次大油井事件时间' },
      { cmd: '!helilast', desc: '查看上次武装直升机事件时间' }
    ]
  }
];

// 主动通知功能
const notifications = [
  {
    category: '队友动态',
    color: 'purple',
    icon: 'users',
    items: [
      { title: '上线通知', desc: '队友上线时通知，显示离线时长', example: '张三 在离线 2小时30分钟 后上线了' },
      { title: '下线通知', desc: '队友下线时通知，显示游玩时长和挂机时长', example: '张三 今天游玩了 3小时 (其中挂机 45分钟)' },
      { title: '死亡通知', desc: '队友死亡时通知，显示死亡位置坐标', example: '张三 在 M15-3 死亡' },
      { title: '挂机检测', desc: '队友超过3分钟不动时提醒，回来时也会通知', example: '张三 已离开 5 分钟 - K12-7' }
    ]
  },
  {
    category: '游戏事件',
    color: 'red',
    icon: 'events',
    items: [
      { title: '货船通知', desc: '货船刷新、停靠、辐射上升、离开全程追踪', example: '货船已停靠港口 L8-5' },
      { title: '直升机通知', desc: '武装直升机刷新、被击落、离开地图', example: '武装直升机已刷新在 G14-2' },
      { title: '油井通知', desc: '油井触发、箱子解锁倒计时、解锁提醒', example: '大油井箱子还有 5 分钟解锁' },
      { title: 'CH47通知', desc: 'CH47直升机出现和离开', example: 'CH47已出现 位置: N9-6' }
    ]
  },
  {
    category: '安全警报',
    color: 'yellow',
    icon: 'alert',
    items: [
      { title: '袭击检测', desc: '检测到爆炸声时发出警报，显示位置和爆炸次数', example: '检测到袭击 位置: J11-4 (3次爆炸)' },
      { title: '上锁箱子', desc: '空投/直升机残骸的上锁箱子出现通知', example: '上锁箱子出现 位置: 发射场(H16-8)' },
      { title: '售货机监控', desc: '新售货机出现时通知，标记重要物品', example: '新售货机出现 共12件商品 重要: 火箭' }
    ]
  }
];

// 坐标系统说明
const coordinateFeatures = [
  {
    title: '网格坐标',
    desc: '标准 Rust 地图网格',
    detail: '横轴字母(A-Z, AA...)，纵轴数字(0-29)',
    example: 'M15',
    color: 'blue'
  },
  {
    title: '子网格定位',
    desc: '精确到 9 宫格位置',
    detail: '每个网格分为 3×3=9 个子区域',
    example: 'M15-3',
    color: 'green'
  },
  {
    title: '古迹识别',
    desc: '自动识别附近地标',
    detail: '在古迹范围内显示中文名称',
    example: '发射场(M15)',
    color: 'purple'
  },
  {
    title: '方向判断',
    desc: '8 方位 + 中心区域',
    detail: '货船等事件显示相对地图中心方向',
    example: '货船位于 右上 M15',
    color: 'yellow'
  }
];

const colorMap = {
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  green: 'text-green-400 bg-green-500/10 border-green-500/20',
  yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  red: 'text-red-400 bg-red-500/10 border-red-500/20',
  purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
};

/**
 * WelcomeGuide - 新用户欢迎引导页面
 * 全面介绍产品功能和使用方法
 */
function WelcomeGuide({ onStartPairing, onManualAdd }) {
  const [activeFeature, setActiveFeature] = useState(0);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [demoStep, setDemoStep] = useState(0);

  // 自动轮播功能演示
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // 演示动画步骤
  useEffect(() => {
    const timer = setInterval(() => {
      setDemoStep((prev) => (prev + 1) % 4);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">

        {/* ==================== Hero Section ==================== */}
        <section className="text-center py-12 relative">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rust-accent/5 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rust-accent/10 border border-rust-accent/20 text-rust-accent text-sm font-medium mb-6 animate-pulse">
              <FaRocket />
              <span>Rust+ 游戏辅助工具</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
              在网页上管理你的
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rust-accent to-orange-500">
                Rust 服务器
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              无需打开游戏，实时监控服务器状态，与队友聊天，远程控制智能设备。
              <br className="hidden sm:block" />
              <span className="text-gray-300">工作、吃饭、睡觉时也能掌控一切。</span>
            </p>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 mb-10">
              {stats.map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl sm:text-3xl font-black text-rust-accent">{stat.value}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onStartPairing}
                className="btn btn-primary text-lg px-8 py-4 shadow-xl shadow-rust-accent/30 group"
              >
                <FaQrcode className="group-hover:rotate-12 transition-transform" />
                开始配对服务器
                <FaChevronRight className="text-sm opacity-50" />
              </button>
              <button
                onClick={onManualAdd}
                className="btn btn-secondary text-lg px-8 py-4"
              >
                <FaServer />
                手动添加
              </button>
            </div>

            <p className="mt-6 text-sm text-gray-500">
              ✨ 完全免费 · 🔒 安全可靠 · 📱 支持所有设备
            </p>
          </div>
        </section>

        {/* ==================== Live Demo Preview ==================== */}
        <section className="panel p-6 sm:p-8 overflow-hidden">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">实时预览</h2>
            <p className="text-gray-400">看看你将获得什么</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Mock Server Card */}
            <div className="bg-dark-900/50 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-rust-accent to-orange-600 flex items-center justify-center">
                  <FaServer className="text-white text-xl" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">RustPvP.cn 高倍服</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/20">
                      在线
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">192.168.1.1:28015</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-dark-800/50 rounded-lg p-2 text-center">
                  <FaUsers className="text-rust-accent mx-auto mb-1" />
                  <div className="text-lg font-bold text-white">127<span className="text-gray-500 text-xs">/200</span></div>
                  <div className="text-[10px] text-gray-500">玩家</div>
                </div>
                <div className="bg-dark-800/50 rounded-lg p-2 text-center">
                  <FaClock className="text-yellow-400 mx-auto mb-1" />
                  <div className="text-lg font-bold text-white">14:32</div>
                  <div className="text-[10px] text-gray-500">游戏时间</div>
                </div>
                <div className="bg-dark-800/50 rounded-lg p-2 text-center">
                  <FaMapMarkedAlt className="text-blue-400 mx-auto mb-1" />
                  <div className="text-lg font-bold text-white">4000</div>
                  <div className="text-[10px] text-gray-500">地图大小</div>
                </div>
              </div>

              {/* Team members */}
              <div className="text-xs text-gray-400 mb-2">队友状态</div>
              <div className="space-y-1">
                {[
                  { name: '张三', online: true, alive: true },
                  { name: '李四', online: true, alive: false },
                  { name: '王五', online: false, alive: true }
                ].map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {m.online ? (
                      m.alive ? <FaHeart className="text-green-400" /> : <FaSkull className="text-red-400" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-gray-600" />
                    )}
                    <span className={m.online ? 'text-gray-300' : 'text-gray-600'}>{m.name}</span>
                    {!m.alive && m.online && <span className="text-[10px] text-red-400">(已死亡)</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Mock Events & Chat */}
            <div className="space-y-4">
              {/* Events */}
              <div className="bg-dark-900/50 rounded-xl p-4 border border-white/5">
                <div className="text-xs text-gray-400 mb-3 flex items-center gap-2">
                  <FaBell className="text-rust-accent" /> 实时事件
                </div>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 p-2 rounded-lg transition-all ${demoStep === 0 ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-dark-800/30'}`}>
                    <FaShip className="text-blue-400" />
                    <span className="text-sm text-gray-300">货船已刷新</span>
                    <span className="text-xs text-gray-500 ml-auto">刚刚</span>
                  </div>
                  <div className={`flex items-center gap-2 p-2 rounded-lg transition-all ${demoStep === 1 ? 'bg-red-500/10 border border-red-500/20' : 'bg-dark-800/30'}`}>
                    <FaHelicopter className="text-red-400" />
                    <span className="text-sm text-gray-300">武装直升机出现</span>
                    <span className="text-xs text-gray-500 ml-auto">2分钟前</span>
                  </div>
                  <div className={`flex items-center gap-2 p-2 rounded-lg transition-all ${demoStep === 2 ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-dark-800/30'}`}>
                    <FaBox className="text-purple-400" />
                    <span className="text-sm text-gray-300">上锁箱子出现</span>
                    <span className="text-xs text-gray-500 ml-auto">5分钟前</span>
                  </div>
                </div>
              </div>

              {/* Devices */}
              <div className="bg-dark-900/50 rounded-xl p-4 border border-white/5">
                <div className="text-xs text-gray-400 mb-3 flex items-center gap-2">
                  <FaLightbulb className="text-yellow-400" /> 智能设备
                </div>
                <div className="flex gap-2">
                  <button className={`flex-1 p-3 rounded-lg transition-all ${demoStep === 3 ? 'bg-rust-accent text-white' : 'bg-dark-800/50 text-gray-400'}`}>
                    <FaPowerOff className="mx-auto mb-1" />
                    <div className="text-xs">大门</div>
                  </button>
                  <button className="flex-1 p-3 rounded-lg bg-rust-accent text-white">
                    <FaLightbulb className="mx-auto mb-1" />
                    <div className="text-xs">灯光</div>
                  </button>
                  <button className="flex-1 p-3 rounded-lg bg-dark-800/50 text-gray-400">
                    <FaBell className="mx-auto mb-1" />
                    <div className="text-xs">警报</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== Features Grid ==================== */}
        <section>
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">强大的功能</h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              我们提供比官方 App 更多的功能，让你对游戏的掌控更加全面
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, index) => {
              const colors = colorMap[feature.color];
              const isActive = activeFeature === index;
              return (
                <button
                  key={index}
                  onClick={() => setActiveFeature(index)}
                  className={`p-5 rounded-xl text-left transition-all duration-300 border ${
                    isActive
                      ? `${colors} shadow-lg`
                      : 'bg-dark-800/30 border-white/5 hover:border-white/10 hover:bg-dark-800/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? colors : 'bg-dark-700 text-gray-400'}`}>
                      <feature.icon className="text-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold mb-1 ${isActive ? 'text-white' : 'text-gray-300'}`}>
                        {feature.title}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {feature.description}
                      </p>
                    </div>
                  </div>

                  {isActive && (
                    <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-2">
                      {feature.details.map((detail, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-400">
                          <FaCheck className="text-green-400 flex-shrink-0" />
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ==================== Use Cases ==================== */}
        <section className="panel p-6 sm:p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">使用场景</h2>
            <p className="text-gray-400">无论何时何地，都能掌控你的 Rust 世界</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {scenarios.map((scenario, i) => (
              <div key={i} className="p-4 bg-dark-900/50 rounded-xl border border-white/5 hover:border-rust-accent/30 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-rust-accent/10 flex items-center justify-center mb-3 group-hover:bg-rust-accent/20 transition-colors">
                  <scenario.icon className="text-rust-accent" />
                </div>
                <h3 className="font-bold text-white mb-1">{scenario.title}</h3>
                <p className="text-sm text-gray-500">{scenario.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== Game Commands ==================== */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">游戏内命令</h2>
            <p className="text-gray-400">在队伍聊天中输入命令，机器人会自动回复</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {commandGroups.map((group, gi) => {
              const iconColorClass = {
                blue: 'text-blue-400',
                red: 'text-red-400',
                green: 'text-green-400'
              }[group.color];
              return (
                <div key={gi} className={`panel p-5 border ${colorMap[group.color]}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <FaTerminal className={iconColorClass} />
                    <h3 className="font-bold text-white">{group.name}</h3>
                  </div>
                  <div className="space-y-2">
                    {group.commands.map((command, ci) => (
                      <div key={ci} className="flex items-start gap-2 text-sm">
                        <code className="px-2 py-0.5 bg-dark-900/50 rounded text-rust-accent font-mono text-xs whitespace-nowrap">
                          {command.cmd}
                        </code>
                        <span className="text-gray-400 text-xs leading-relaxed">{command.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-dark-800/30 rounded-xl border border-white/5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <FaLightbulb className="text-yellow-400 text-sm" />
              </div>
              <div>
                <h4 className="font-medium text-white text-sm mb-1">使用提示</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  所有命令都以 <code className="px-1 py-0.5 bg-dark-900/50 rounded text-rust-accent">!</code> 开头，
                  在游戏内的队伍聊天中输入即可使用。例如输入 <code className="px-1 py-0.5 bg-dark-900/50 rounded text-rust-accent">!time</code> 会显示当前游戏时间。
                  机器人只会响应队伍成员的命令，其他玩家无法使用。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== Auto Notifications ==================== */}
        <section className="panel p-6 sm:p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">主动通知</h2>
            <p className="text-gray-400">无需输入命令，重要事件自动推送到队伍聊天</p>
          </div>

          <div className="space-y-6">
            {notifications.map((group, gi) => {
              const borderColor = colorMap[group.color];
              const iconColorClass = {
                purple: 'text-purple-400 bg-purple-500/10',
                red: 'text-red-400 bg-red-500/10',
                yellow: 'text-yellow-400 bg-yellow-500/10'
              }[group.color];
              const IconComponent = {
                users: FaUsers,
                events: FaBell,
                alert: FaShieldAlt
              }[group.icon];

              return (
                <div key={gi} className={`border rounded-xl overflow-hidden ${borderColor}`}>
                  <div className="p-4 border-b border-white/5 bg-dark-800/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColorClass}`}>
                        <IconComponent className="text-sm" />
                      </div>
                      <h3 className="font-bold text-white">{group.category}</h3>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
                    {group.items.map((item, ii) => (
                      <div key={ii} className="p-4 hover:bg-white/[0.02] transition-colors">
                        <h4 className="font-medium text-white text-sm mb-1">{item.title}</h4>
                        <p className="text-xs text-gray-500 mb-2">{item.desc}</p>
                        <div className="px-2 py-1.5 bg-dark-900/50 rounded text-xs text-gray-400 font-mono">
                          {item.example}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
            <FaCheckCircle className="text-green-400 text-lg flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-400 text-sm mb-1">全自动运行</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                所有通知都是自动触发的，无需任何配置。连接服务器后，机器人会自动监控游戏事件并在队伍聊天中发送通知。
              </p>
            </div>
          </div>
        </section>

        {/* ==================== Coordinate System ==================== */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">精准坐标系统</h2>
            <p className="text-gray-400">比游戏内地图更精确的位置显示</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {coordinateFeatures.map((feature, i) => (
              <div key={i} className={`p-4 rounded-xl border ${colorMap[feature.color]}`}>
                <h3 className="font-bold text-white mb-1">{feature.title}</h3>
                <p className="text-xs text-gray-400 mb-2">{feature.desc}</p>
                <p className="text-xs text-gray-500 mb-3">{feature.detail}</p>
                <code className="px-2 py-1 bg-dark-900/50 rounded text-rust-accent font-mono text-sm">
                  {feature.example}
                </code>
              </div>
            ))}
          </div>

          {/* 子网格示意图 */}
          <div className="panel p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* 左侧：子网格布局图 */}
              <div className="flex-shrink-0">
                <h4 className="font-medium text-white text-sm mb-3">子网格布局 (3×3)</h4>
                <div className="grid grid-cols-3 gap-1 w-36">
                  {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
                    <div
                      key={num}
                      className={`w-11 h-11 rounded flex items-center justify-center font-mono text-sm ${
                        num === 5
                          ? 'bg-rust-accent text-white'
                          : 'bg-dark-700 text-gray-400'
                      }`}
                    >
                      {num}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">M15-5 = 网格中心</p>
              </div>

              {/* 右侧：说明文字 */}
              <div className="flex-1 space-y-4">
                <div>
                  <h4 className="font-medium text-white text-sm mb-2">坐标精度说明</h4>
                  <ul className="space-y-2 text-xs text-gray-400">
                    <li className="flex items-start gap-2">
                      <FaCheck className="text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">网格坐标</strong> - 每格约 146 米，足够大致定位</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <FaCheck className="text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">子网格</strong> - 每子格约 49 米，精确到建筑级别</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <FaCheck className="text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">古迹识别</strong> - 在发射场、军事隧道等 30+ 地标范围内自动显示名称</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <FaCheck className="text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">方向指示</strong> - 上/下/左/右/左上/右上/左下/右下/中心 9 种方位</span>
                    </li>
                  </ul>
                </div>

                <div className="p-3 bg-dark-800/50 rounded-lg">
                  <p className="text-xs text-gray-500">
                    <strong className="text-gray-300">示例：</strong>当队友在发射场附近死亡时，通知会显示为
                    <code className="mx-1 px-1.5 py-0.5 bg-dark-900 rounded text-rust-accent">张三 在 发射场(M15-3) 死亡</code>
                    ，你可以立即在地图上找到精确位置。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== Comparison ==================== */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">为什么选择我们？</h2>
            <p className="text-gray-400">与官方 Rust+ App 功能对比</p>
          </div>

          <div className="panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-gray-400 font-medium">功能</th>
                  <th className="text-center p-4 text-rust-accent font-bold">Web Dashboard</th>
                  <th className="text-center p-4 text-gray-400 font-medium">官方 App</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="p-4 text-gray-300">{row.feature}</td>
                    <td className="p-4 text-center">
                      {row.us ? (
                        <FaCheck className="text-green-400 mx-auto" />
                      ) : (
                        <FaTimes className="text-red-400 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {row.official ? (
                        <FaCheck className="text-green-400 mx-auto" />
                      ) : (
                        <FaTimes className="text-gray-600 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ==================== Quick Start ==================== */}
        <section className="panel p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <FaRocket className="text-white text-xl" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">快速开始</h2>
              <p className="text-gray-400 text-sm">只需 3 步，几分钟即可完成</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              {
                num: 1,
                title: '获取 Steam 凭证',
                description: '访问 Rust+ Companion 网站，使用 Steam 账号登录',
                icon: FaSteam
              },
              {
                num: 2,
                title: '填入凭证信息',
                description: '复制凭证信息，粘贴到本工具的配对页面',
                icon: FaQrcode
              },
              {
                num: 3,
                title: '游戏内配对',
                description: '在游戏中按 ESC → Rust+ → Pair with Server',
                icon: FaGamepad
              }
            ].map((step) => (
              <div key={step.num} className="relative group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rust-accent to-orange-600 text-white font-bold text-lg flex items-center justify-center shadow-lg shadow-rust-accent/30 group-hover:scale-110 transition-transform">
                    {step.num}
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center">
                    <step.icon className="text-gray-400" />
                  </div>
                </div>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.description}</p>

                {step.num < 3 && (
                  <div className="hidden md:block absolute top-6 left-[calc(100%+12px)] w-[calc(100%-48px)] border-t-2 border-dashed border-dark-600" />
                )}
              </div>
            ))}
          </div>

          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <FaSteam className="text-blue-400 text-2xl flex-shrink-0" />
              <div>
                <h4 className="font-bold text-blue-400 mb-1">获取凭证</h4>
                <p className="text-sm text-gray-300 mb-3">
                  点击下方链接，使用 Steam 账号登录后获取凭证信息
                </p>
                <a
                  href="https://companion-rust.facepunch.com/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <FaSteam />
                  打开 Rust+ Companion
                  <FaExternalLinkAlt className="text-xs" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== FAQ ==================== */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">常见问题</h2>
            <p className="text-gray-400">有疑问？这里可能有你要的答案</p>
          </div>

          <div className="space-y-3 max-w-3xl mx-auto">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="panel overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FaQuestionCircle className="text-rust-accent flex-shrink-0" />
                    <span className="font-medium text-white">{faq.q}</span>
                  </div>
                  <FaChevronDown className={`text-gray-500 transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {expandedFaq === i && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="pl-8 text-sm text-gray-400 leading-relaxed">
                      {faq.a}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ==================== CTA ==================== */}
        <section className="text-center py-12 relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-rust-accent/10 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <FaStar key={i} className="text-yellow-400" />
              ))}
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">准备好掌控你的 Rust 世界了吗？</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              加入已经在使用本工具的玩家，体验前所未有的便利
            </p>
            <button
              onClick={onStartPairing}
              className="btn btn-primary inline-flex text-lg px-12 py-4 shadow-xl shadow-rust-accent/30"
            >
              <FaRocket />
              立即开始使用
            </button>
          </div>
        </section>

        {/* ==================== Footer ==================== */}
        <footer className="text-center text-xs text-gray-600 pb-8 space-y-2">
          <p>
            本工具基于 Rust+ Companion API 开发，与 Facepunch 无关。
          </p>
          <p>
            使用本工具即表示你同意遵守 Rust 游戏服务条款。
          </p>
          <p className="text-gray-700">
            Made with ❤️ for Rust players
          </p>
        </footer>
      </div>
    </div>
  );
}

export default WelcomeGuide;
