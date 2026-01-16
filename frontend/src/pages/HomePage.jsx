import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaTerminal, FaShieldAlt, FaChartLine, FaCogs, FaChevronRight, FaPlay, FaLock, FaUsers, FaQuestionCircle, FaMoneyBillWave } from 'react-icons/fa';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
        const res = await fetch(`${API_URL}/payment/plans`);
        const data = await res.json();
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
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans overflow-x-hidden relative">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#cd5241]/10 via-transparent to-transparent"></div>
      </div>

      {/* 导航栏 */}
      <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/60 backdrop-blur-lg px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 tactic-cut bg-[#cd5241] flex items-center justify-center shadow-lg shadow-[#cd5241]/20">
              <FaTerminal className="text-white text-lg" />
            </div>
            <span className="text-xl font-black italic tracking-tighter uppercase">Rust_Commander</span>
          </div>

          {/* 中间导航链接 */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('features')}
              className="text-sm font-bold text-gray-400 hover:text-white transition-colors"
            >
              功能介绍
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="text-sm font-bold text-gray-400 hover:text-white transition-colors"
            >
              价格方案
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="text-sm font-bold text-gray-400 hover:text-white transition-colors"
            >
              常见问题
            </button>
            <Link to="/privacy" className="text-sm font-bold text-gray-400 hover:text-white transition-colors">
              隐私政策
            </Link>
          </nav>

          {/* 右侧按钮 */}
          <div className="flex gap-4 items-center">
            <Link to="/login" className="text-sm font-bold text-blue-500 hover:text-blue-400 transition-colors">
              登录
            </Link>
            <Link to="/register" className="tactic-cut bg-[#cd5241] px-6 py-2 text-sm font-black text-white hover:bg-[#b04537] transition-all">
              免费注册
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="relative z-10">
            <div className="inline-block px-3 py-1 bg-[#cd5241]/10 border border-[#cd5241]/30 text-[#cd5241] text-xs font-bold mb-8 tactic-cut">
              RUST 远程基地中控系统 v2.0
            </div>
            <h1 className="text-5xl md:text-7xl font-black mb-8 leading-[1.1] tracking-tighter glow-text">
              随时随地 <br />
              <span className="text-[#cd5241]">掌控</span> 你的基地
            </h1>
            <p className="text-gray-400 text-lg mb-12 max-w-md border-l-4 border-[#cd5241] pl-6 leading-relaxed">
              在 Rust 的残酷世界里，离线不代表防御停止。通过我们的系统，实现基地全自动监控、远程报警与设备集群控制。
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register" className="tactic-cut bg-[#cd5241] text-white px-10 py-5 font-black flex items-center gap-3 group shadow-xl shadow-[#cd5241]/20 text-lg">
                立即部署系统 <FaChevronRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* 手机通知演示 */}
          <div className="relative flex justify-center items-center">
            <div className="relative w-[300px] h-[600px] bg-[#1a1c20] border-[8px] border-[#2a2d32] rounded-[3rem] shadow-2xl overflow-hidden tactic-border">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-[#2a2d32] rounded-b-3xl z-20"></div>
              <div className="relative h-full bg-black">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop')] bg-cover opacity-30"></div>
                <div className="p-8 pt-16 space-y-4 relative z-10">
                  <div className="bg-black/80 backdrop-blur-md border border-[#cd5241]/50 p-4 tactic-cut animate-bounce">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[#cd5241] text-[10px] font-black">! 核心区报警</span>
                      <span className="text-white/30 text-[9px]">刚刚</span>
                    </div>
                    <div className="text-white text-xs font-bold">
                      智能报警器已被触发：领地柜房
                    </div>
                  </div>
                  <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 tactic-cut opacity-80">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-blue-400 text-[10px] font-black">! 团队动态</span>
                      <span className="text-white/30 text-[9px]">2分钟前</span>
                    </div>
                    <div className="text-white text-xs font-bold">
                      队友 '小李' 在 <span className="text-[#cd5241]">G12</span> 阵亡
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -z-10 w-80 h-80 bg-[#cd5241]/10 blur-[120px] animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* 功能特性 */}
      <section id="features" className="py-32 bg-white/[0.02] border-y border-white/5 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black mb-4 italic">核心功能模块</h2>
            <div className="w-20 h-1 bg-[#cd5241] mx-auto"></div>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<FaShieldAlt />}
              title="离线防拆报警"
              desc="毫秒级推送。当基地遭遇袭击、警报器触发，系统将通过网页、App、甚至语音电话通知你，确保离线也能守护基地。"
            />
            <FeatureCard
              icon={<FaUsers />}
              title="16人团队管理"
              desc="支持超大团队数据同步。实时查看队友在线状态、坐标位置，自动生成今日采集排行榜，识别谁才是团队核心。"
            />
            <FeatureCard
              icon={<FaCogs />}
              title="全图设备联控"
              desc="支持关键词搜索、置顶常用开关。远程开启自动防御炮塔、控制基地电力，甚至一键封锁所有大门。"
            />
          </div>
        </div>
      </section>

      {/* 终端模拟 */}
      <section className="py-32 px-6 max-w-5xl mx-auto">
        <div className="tactic-border tactic-cut p-1 bg-black/80 shadow-3xl">
          <div className="p-8 font-mono text-sm leading-relaxed h-[300px] overflow-hidden relative">
            <div className="scanline"></div>
            <div className="animate-scroll-text space-y-2">
              <div className="text-gray-500">{"[10:24:01]"} 系统内核加载成功...</div>
              <div className="text-gray-500">{"[10:24:05]"} 正在连接 Rust+ 官方服务器...</div>
              <div className="text-white">{">"} 获取团队状态：发现 12 名在线成员</div>
              <div className="text-[#cd5241] font-bold">{"[10:24:12]"} ! 警报：核心房报警器被触发</div>
              <div className="text-gray-400">{">"} 正在尝试语音拨号通知管理员...</div>
              <div className="text-[#a3e635]">{"[10:24:15]"} 通知已下达：管理员已收到电话提醒</div>
              <div className="text-white">{">"} 实时数据对比：队友 '大王' 采集了 5000 硫磺</div>
              <div className="text-gray-500">{"[10:24:20]"} 系统运行稳定，持续监听中...</div>
            </div>
          </div>
        </div>
      </section>

      {/* 价格方案 */}
      <section id="pricing" className="py-32 bg-white/[0.02] border-y border-white/5 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black mb-4 italic">选择你的方案</h2>
            <div className="w-20 h-1 bg-[#cd5241] mx-auto mb-6"></div>
            <p className="text-gray-500 text-sm">新用户注册即享 7 天免费试用</p>
          </div>
          <div className={`grid gap-6 ${plans.length === 1 ? 'md:grid-cols-1 max-w-sm mx-auto' : plans.length === 2 ? 'md:grid-cols-2 max-w-2xl mx-auto' : 'md:grid-cols-3'}`}>
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

      {/* 常见问题 */}
      <section id="faq" className="py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black mb-4 italic">常见问题</h2>
            <div className="w-20 h-1 bg-[#cd5241] mx-auto"></div>
          </div>
          <div className="space-y-4">
            <FAQItem
              question="什么是 Rust+ 配对？"
              answer="Rust+ 是 Rust 游戏官方推出的手机 App 功能。通过配对，我们的系统可以连接到你的游戏服务器，实现离线监控、远程控制等功能。"
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

      {/* CTA Section */}
      <section className="py-40 px-6 text-center">
        <h2 className="text-5xl font-black mb-12 italic">准备好统领全图了吗？</h2>
        <Link to="/register" className="inline-block tactic-cut bg-white text-black px-16 py-6 font-black text-2xl hover:bg-[#cd5241] hover:text-white transition-all transform hover:scale-105">
          立即开启配对
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 tactic-cut bg-[#cd5241] flex items-center justify-center">
                <FaTerminal className="text-white text-sm" />
              </div>
              <span className="text-sm font-black italic tracking-tighter uppercase text-gray-500">Rust_Commander</span>
            </div>
            <nav className="flex flex-wrap justify-center gap-6 text-xs text-gray-600">
              <Link to="/privacy" className="hover:text-white transition-colors">隐私政策</Link>
              <button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors">功能介绍</button>
              <button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">价格方案</button>
              <button onClick={() => scrollToSection('faq')} className="hover:text-white transition-colors">常见问题</button>
            </nav>
            <div className="text-gray-600 text-xs tracking-widest font-bold">
              © 2024 RUST_COMMANDER
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="tactic-border tactic-cut p-10 bg-white/[0.01] hover:bg-white/[0.03] transition-all group">
      <div className="text-4xl text-[#cd5241] mb-8 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-2xl font-black mb-4 italic">{title}</h3>
      <p className="text-gray-500 leading-relaxed font-medium">{desc}</p>
    </div>
  );
}

function PricingCard({ title, price, period, features, highlighted }) {
  return (
    <div className={`tactic-border tactic-cut p-8 transition-all ${highlighted ? 'bg-[#cd5241]/10 border-[#cd5241]/50 scale-105' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`}>
      {highlighted && (
        <div className="text-[10px] font-black text-[#cd5241] uppercase tracking-widest mb-4">推荐</div>
      )}
      <h3 className="text-xl font-black mb-2">{title}</h3>
      <div className="mb-6">
        <span className="text-4xl font-black">{price}</span>
        <span className="text-gray-500 text-sm">{period}</span>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="text-sm text-gray-400 flex items-center gap-2">
            <span className="text-[#cd5241]">✓</span> {feature}
          </li>
        ))}
      </ul>
      <Link
        to="/register"
        className={`block text-center tactic-cut py-3 text-sm font-black transition-all ${highlighted ? 'bg-[#cd5241] hover:bg-[#b04537] text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}
      >
        开始使用
      </Link>
    </div>
  );
}

function FAQItem({ question, answer }) {
  return (
    <details className="group tactic-border tactic-cut bg-white/[0.01] hover:bg-white/[0.02] transition-all">
      <summary className="p-6 cursor-pointer flex justify-between items-center font-bold text-white">
        {question}
        <span className="text-[#cd5241] transform group-open:rotate-45 transition-transform text-xl">+</span>
      </summary>
      <div className="px-6 pb-6 text-gray-500 text-sm leading-relaxed border-t border-white/5 pt-4">
        {answer}
      </div>
    </details>
  );
}
