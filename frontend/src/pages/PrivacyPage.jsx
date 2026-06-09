import { Link } from 'react-router-dom';
import { FaArrowLeft, FaShieldAlt } from 'react-icons/fa';
import useSEO from '../hooks/useSEO';

export default function PrivacyPage() {
  useSEO({
    title: '隐私政策 - Rust+ 控制台',
    description: 'Rust+ 控制台隐私政策：说明我们如何收集、使用与保护你的账户与服务器数据。',
    path: '/privacy',
  });

  return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex flex-col">
      {/* 顶部 status bar */}
      <div className="flex items-center justify-between px-6 md:px-10 h-14 border-b border-ink-line shrink-0">
        <div className="tac-label flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> PRIVACY POLICY // 0x2F
        </div>
        <Link to="/login" className="tac-label hover:text-fg transition-colors flex items-center gap-2 group">
          <FaArrowLeft className="text-[10px] group-hover:-translate-x-0.5 transition-transform" /> 返回登录
        </Link>
      </div>

      {/* 阅读区 */}
      <main className="flex-1 px-6 md:px-10 py-12">
        <div className="w-full max-w-3xl mx-auto">
          {/* 标题区 */}
          <div className="mb-10">
            <div className="tac-label mb-3 flex items-center gap-2">
              <FaShieldAlt className="text-hazard text-[12px]" /> 隐私政策 // PRIVACY
            </div>
            <h1 className="text-4xl font-extrabold text-fg tracking-tight leading-tight">隐私政策</h1>
            <div className="mt-4 flex items-center gap-3 border-l-2 border-hazard pl-3">
              <span className="tac-label">LAST UPDATED</span>
              <span className="font-mono text-sm text-fg-dim tabular-nums tracking-[0.05em]">2024-01</span>
            </div>
          </div>

          {/* 正文 */}
          <div className="space-y-px bg-ink-line border border-ink-line">
            <Section index="01" title="信息收集" code="COLLECTION">
              <p>我们收集以下类型的信息以提供服务：</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-fg-dim">
                <li>账户信息：用户名、密码（加密存储）</li>
                <li>游戏数据：Rust+ 服务器连接信息、FCM 推送凭证</li>
                <li>使用数据：服务访问日志、设备控制记录</li>
              </ul>
            </Section>

            <Section index="02" title="信息使用" code="USAGE">
              <p>我们使用收集的信息用于：</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-fg-dim">
                <li>提供 Rust 游戏服务器远程监控功能</li>
                <li>发送游戏内事件推送通知</li>
                <li>改进和优化服务体验</li>
                <li>保障账户安全</li>
              </ul>
            </Section>

            <Section index="03" title="信息存储与安全" code="STORAGE">
              <p>
                我们采用行业标准的安全措施保护您的数据，包括但不限于数据加密传输、
                密码哈希存储、访问权限控制等。您的游戏服务器凭证将被安全加密存储。
              </p>
            </Section>

            <Section index="04" title="信息共享" code="SHARING">
              <p>
                我们不会将您的个人信息出售或出租给第三方。仅在以下情况下可能共享信息：
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-fg-dim">
                <li>经您明确同意</li>
                <li>法律法规要求</li>
                <li>保护我们的合法权益</li>
              </ul>
            </Section>

            <Section index="05" title="您的权利" code="RIGHTS">
              <p>您有权：</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-fg-dim">
                <li>访问和更新您的账户信息</li>
                <li>删除您的账户和相关数据</li>
                <li>撤回对数据处理的同意</li>
              </ul>
            </Section>

            <Section index="06" title="Cookie 使用" code="COOKIE">
              <p>
                我们使用 Cookie 和本地存储来保持您的登录状态和用户偏好设置。
                您可以通过浏览器设置管理 Cookie。
              </p>
            </Section>

            <Section index="07" title="联系我们" code="CONTACT">
              <p>
                如果您对本隐私政策有任何疑问，请通过系统内的反馈渠道联系我们。
              </p>
            </Section>
          </div>

          {/* 页脚 */}
          <div className="mt-8 flex items-center justify-between border-t border-ink-line pt-5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-mute">使用本服务即表示您同意本隐私政策</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-mute">RUST+ // TACTICAL OPS</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ index, title, code, children }) {
  return (
    <div className="bg-ink-850 px-6 py-6">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-sm text-hazard tabular-nums tracking-[0.05em]">{index}</span>
        <h2 className="text-base font-bold text-fg">{title}</h2>
        <span className="tac-label ml-auto">{code}</span>
      </div>
      <div className="text-sm text-fg-dim leading-relaxed pl-9">
        {children}
      </div>
    </div>
  );
}
