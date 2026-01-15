import { Link } from 'react-router-dom';
import { FaTerminal, FaArrowLeft, FaShieldAlt } from 'react-icons/fa';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans p-6 relative overflow-hidden">
      {/* 扫描线背景 */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>

      <div className="max-w-3xl mx-auto relative z-10 py-8">
        {/* 返回链接 */}
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-[#cd5241] transition-colors text-[10px] uppercase tracking-widest font-bold mb-8"
        >
          <FaArrowLeft /> 返回登录
        </Link>

        {/* 标题 */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 tactic-cut bg-[#cd5241] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#cd5241]/20">
            <FaShieldAlt className="text-white text-2xl" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest glow-text italic">隐私策略</h1>
          <p className="text-[10px] text-gray-600 uppercase tracking-[0.4em] mt-2 font-mono">Privacy Policy</p>
        </div>

        {/* 内容 */}
        <div className="tactic-border tactic-cut p-1 bg-black/40 backdrop-blur-xl">
          <div className="bg-black/40 p-8 space-y-8">
            {/* 更新日期 */}
            <div className="text-[10px] text-gray-500 uppercase tracking-widest border-l-2 border-[#cd5241] pl-3">
              最后更新: 2024年1月
            </div>

            <Section title="1. 信息收集">
              <p>我们收集以下类型的信息以提供服务：</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-gray-400">
                <li>账户信息：用户名、密码（加密存储）</li>
                <li>游戏数据：Rust+ 服务器连接信息、FCM 推送凭证</li>
                <li>使用数据：服务访问日志、设备控制记录</li>
              </ul>
            </Section>

            <Section title="2. 信息使用">
              <p>我们使用收集的信息用于：</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-gray-400">
                <li>提供 Rust 游戏服务器远程监控功能</li>
                <li>发送游戏内事件推送通知</li>
                <li>改进和优化服务体验</li>
                <li>保障账户安全</li>
              </ul>
            </Section>

            <Section title="3. 信息存储与安全">
              <p>
                我们采用行业标准的安全措施保护您的数据，包括但不限于数据加密传输、
                密码哈希存储、访问权限控制等。您的游戏服务器凭证将被安全加密存储。
              </p>
            </Section>

            <Section title="4. 信息共享">
              <p>
                我们不会将您的个人信息出售或出租给第三方。仅在以下情况下可能共享信息：
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-gray-400">
                <li>经您明确同意</li>
                <li>法律法规要求</li>
                <li>保护我们的合法权益</li>
              </ul>
            </Section>

            <Section title="5. 您的权利">
              <p>您有权：</p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-gray-400">
                <li>访问和更新您的账户信息</li>
                <li>删除您的账户和相关数据</li>
                <li>撤回对数据处理的同意</li>
              </ul>
            </Section>

            <Section title="6. Cookie 使用">
              <p>
                我们使用 Cookie 和本地存储来保持您的登录状态和用户偏好设置。
                您可以通过浏览器设置管理 Cookie。
              </p>
            </Section>

            <Section title="7. 联系我们">
              <p>
                如果您对本隐私策略有任何疑问，请通过系统内的反馈渠道联系我们。
              </p>
            </Section>

            {/* 底部分隔 */}
            <div className="pt-8 border-t border-white/5 text-center">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest">
                使用本服务即表示您同意本隐私策略
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-tight text-white border-l-2 border-[#cd5241] pl-3">
        {title}
      </h2>
      <div className="text-xs text-gray-400 leading-relaxed pl-5">
        {children}
      </div>
    </div>
  );
}
