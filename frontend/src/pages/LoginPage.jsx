import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authApi } from '../services/auth';
import { FaArrowLeft, FaArrowRight, FaEye, FaEyeSlash } from 'react-icons/fa';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const redirectPath = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';
  const registerPath = `/register?redirect=${encodeURIComponent(redirectPath)}`;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authApi.login(formData.email, formData.password);
      if (result.success) {
        localStorage.setItem('token', result.data.token);
        localStorage.setItem('user', JSON.stringify(result.data.user));
        navigate(redirectPath, { replace: true });
      } else {
        setError(result.error || '登录失败，请检查账号或密码');
      }
    } catch (err) {
      const status = err.response?.status;
      const backendError = err.response?.data?.error;
      if (status === 401) setError('账号或密码错误，请重新输入');
      else if (status === 403) setError(backendError || '账号当前不可用，请联系管理员');
      else if (status === 429) setError(backendError || '尝试次数过多，请稍后再试');
      else if (backendError) setError(backendError);
      else setError('网络异常，暂时无法连接认证服务');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordKeyEvent = (event) => {
    setCapsLockOn(event.getModifierState && event.getModifierState('CapsLock'));
  };

  return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex">
      {/* ============ 左：品牌 / 遥测视觉 ============ */}
      <aside className="hidden lg:flex flex-col justify-between w-[52%] border-r border-ink-line p-12 relative overflow-hidden">
        {/* 背景超大水印 */}
        <div className="absolute -right-8 bottom-12 select-none pointer-events-none font-mono font-extrabold text-[17vw] leading-none text-fg/[0.035] tracking-tighter">
          RUST+
        </div>

        {/* 顶部：标识 */}
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-11 h-11 bg-hazard flex items-center justify-center">
            <img src="/logo.svg" alt="Rust+" className="w-7 h-7 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-mono text-sm font-bold tracking-[0.2em] text-fg">RUST+</div>
            <div className="tac-label">TACTICAL OPS CONSOLE</div>
          </div>
        </div>

        {/* 中部：主视觉文案 */}
        <div className="relative z-10">
          <div className="tac-label mb-5 flex items-center gap-3">
            <span className="w-8 h-px bg-hazard" /> SECURE TERMINAL · 加密终端
          </div>
          <h1 className="text-6xl font-extrabold text-fg leading-[0.95] tracking-tightest">
            战术接入<br />指挥终端
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-fg-dim">
            连接你的 Rust 服务器集群，实时掌控基地防御、队友动向与事件预警。
          </p>
        </div>

        {/* 底部：遥测数据行 + barcode */}
        <div className="relative z-10 space-y-5">
          <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line">
            <Telemetry label="NODES" value="07" />
            <Telemetry label="UPTIME" value="99.2%" />
            <Telemetry label="LINK" value="SECURE" live />
          </div>
          <div className="h-6 tac-barcode opacity-25" />
        </div>
      </aside>

      {/* ============ 右：登录面板 ============ */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶部 status bar */}
        <div className="flex items-center justify-between px-6 md:px-10 h-14 border-b border-ink-line shrink-0">
          <div className="tac-label flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> SECURE CHANNEL // 0x1A
          </div>
          <Link to="/" className="tac-label hover:text-fg transition-colors flex items-center gap-2 group">
            <FaArrowLeft className="text-[10px] group-hover:-translate-x-0.5 transition-transform" /> 返回首页
          </Link>
        </div>

        {/* 表单区 */}
        <div className="flex-1 flex items-center justify-center px-6 md:px-10 py-10">
          <div className="w-full max-w-md">
            {/* 标题 */}
            <div className="mb-8">
              <div className="tac-label mb-2">OPERATOR LOGIN</div>
              <h2 className="text-3xl font-extrabold text-fg tracking-tight">操作员登录</h2>
              <p className="mt-2 text-sm text-fg-dim">登录后继续你的控制台操作</p>
            </div>

            {/* 登录卡 */}
            <div className="tac-panel tac-corners p-7">
              {error && (
                <div className="mb-5 px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
                  <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[ERR]</span>
                  <span>{error}</span>
                </div>
              )}
              {redirectParam && (
                <div className="mb-5 px-4 py-3 border border-ink-line text-fg-dim text-[13px] flex items-start gap-2.5">
                  <span className="font-mono text-fg-mute text-xs mt-0.5 shrink-0">[i]</span>
                  <span>登录成功后会自动回到你刚才查看的页面</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-fg">账号</span>
                    <span className="tac-label">OPERATOR ID</span>
                  </label>
                  <input
                    type="text" name="email" value={formData.email} onChange={handleChange} required
                    className="tac-input" placeholder="邮箱或用户名"
                  />
                </div>

                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-fg">密码</span>
                    <span className="tac-label">PASSCODE</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} name="password"
                      value={formData.password} onChange={handleChange}
                      onKeyUp={handlePasswordKeyEvent} onKeyDown={handlePasswordKeyEvent} required
                      className="tac-input pr-11" placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-mute hover:text-fg transition-colors"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                      {showPassword ? <FaEyeSlash className="text-sm" /> : <FaEye className="text-sm" />}
                    </button>
                  </div>
                  {capsLockOn && (
                    <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-hazard-bright">⚠ CAPS LOCK · 大写锁定已开启</p>
                  )}
                </div>

                <button type="submit" disabled={loading} className="tac-btn tac-btn-primary w-full !py-4 group">
                  {loading ? '接入中 // ACCESSING...' : (
                    <>接入系统 // ACCESS <FaArrowRight className="text-xs group-hover:translate-x-1 transition-transform" /></>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-ink-line flex items-center justify-between">
                <span className="text-[13px] text-fg-dim">还没有账号？</span>
                <Link to={registerPath} className="font-mono text-xs uppercase tracking-[0.15em] text-hazard hover:text-hazard-bright transition-colors flex items-center gap-1.5">
                  立即注册 <FaArrowRight className="text-[10px]" />
                </Link>
              </div>
            </div>

            {/* footer */}
            <div className="mt-6 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-mute">登录即代表同意服务协议</span>
              <Link to="/privacy" className="font-mono text-[10px] uppercase tracking-wider text-fg-mute hover:text-fg-dim transition-colors">隐私政策 ↗</Link>
            </div>
          </div>
        </div>
      </main>
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
