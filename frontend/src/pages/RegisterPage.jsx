import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authApi } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { FaArrowRight, FaArrowLeft } from 'react-icons/fa';
import useSEO from '../hooks/useSEO';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  useSEO({
    title: '免费注册 - Rust+ 网页控制台（7 天免费试用）',
    description: '注册 Rust+ 控制台，享 7 天免费试用：离线监控 Rust 服务器、队友位置追踪、智能设备远程控制、基地遭袭警报推送。',
    path: '/register',
  });
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [regInfo, setRegInfo] = useState(null);
  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const redirectPath = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';
  const loginPath = `/login?redirect=${encodeURIComponent(redirectPath)}`;

  // 拉取后台注册策略，动态展示提示语
  useEffect(() => {
    let active = true;
    authApi.getRegistrationInfo()
      .then((res) => { if (active && res?.success) setRegInfo(res.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const approvalMode = regInfo?.mode === 'approval';
  const trialOn = !!regInfo?.freeTrialEnabled;
  const trialDays = regInfo?.freeTrialDays ?? 7;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const validateForm = () => {
    if (formData.username.length < 3) { setError('用户名长度至少为 3 位'); return false; }
    if (formData.password.length < 6) { setError('密码长度至少为 6 位'); return false; }
    if (formData.password !== formData.confirmPassword) { setError('两次输入的密码不一致'); return false; }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    setLoading(true);
    try {
      // 移除 email 参数
      const result = await authApi.register(formData.username, null, formData.password);
      if (result.success) {
        localStorage.setItem('token', result.data.token);
        localStorage.setItem('user', JSON.stringify(result.data.user));
        setUser(result.data.user);
        navigate(redirectPath, { replace: true });
      } else {
        setError(result.error || '注册失败，请稍后重试');
      }
    } catch (err) {
      const status = err.response?.status;
      const backendError = err.response?.data?.error;
      if (status === 409) {
        setError('用户名已被占用，请换一个');
      } else if (status === 429) {
        setError(backendError || '注册过于频繁，请稍后再试');
      } else if (backendError) {
        setError(backendError);
      } else {
        setError('网络异常，暂时无法连接认证服务');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex">
      {/* ============ 左：品牌 / 遥测视觉 ============ */}
      <aside className="hidden lg:flex flex-col justify-between w-[52%] border-r border-ink-line p-12 relative overflow-hidden">
        <div className="absolute -right-8 bottom-12 select-none pointer-events-none font-mono font-extrabold text-[17vw] leading-none text-fg/[0.035] tracking-tighter">
          RUST+
        </div>

        <div className="relative z-10 flex items-center gap-4">
          <div className="w-11 h-11 bg-hazard flex items-center justify-center">
            <img src="/logo.svg" alt="Rust+" className="w-7 h-7 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-mono text-sm font-bold tracking-[0.2em] text-fg">RUST+</div>
            <div className="tac-label">TACTICAL OPS CONSOLE</div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="tac-label mb-5 flex items-center gap-3">
            <span className="w-8 h-px bg-hazard" /> NEW OPERATOR · 新成员注册
          </div>
          <h1 className="text-6xl font-extrabold text-fg leading-[0.95] tracking-tightest">
            创建账号<br />加入网络
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-fg-dim">
            {approvalMode
              ? '注册后由管理员审核开通，通过后即可连接 Rust 服务器，体验完整的基地监控、队友追踪与战术指挥能力。'
              : trialOn
                ? `注册即送 ${trialDays} 天免费使用，连接你的 Rust 服务器，体验完整的基地监控、队友追踪与战术指挥能力。`
                : '连接你的 Rust 服务器，体验完整的基地监控、队友追踪与战术指挥能力。'}
          </p>
        </div>

        <div className="relative z-10 space-y-5">
          <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line">
            <Telemetry
              label={approvalMode ? 'REVIEW' : 'TRIAL'}
              value={approvalMode ? 'MANUAL' : trialOn ? `${trialDays} DAYS` : 'OFF'}
              live
            />
            <Telemetry label="SETUP" value="3 MIN" />
            <Telemetry label="NODES" value="07" />
          </div>
          <div className="h-6 tac-barcode opacity-25" />
        </div>
      </aside>

      {/* ============ 右：注册面板 ============ */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 md:px-10 h-14 border-b border-ink-line shrink-0">
          <div className="tac-label flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> NEW REGISTRATION // 0x2B
          </div>
          <Link to="/" className="tac-label hover:text-fg transition-colors flex items-center gap-2 group">
            <FaArrowLeft className="text-[10px] group-hover:-translate-x-0.5 transition-transform" /> 返回首页
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 md:px-10 py-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="tac-label mb-2">OPERATOR REGISTER</div>
              <h2 className="text-3xl font-extrabold text-fg tracking-tight">创建账号</h2>
              <p className="mt-2 text-sm text-fg-dim">3 分钟完成注册并进入控制台</p>
            </div>

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
                  <span>注册成功后会自动回到你刚才查看的页面</span>
                </div>
              )}

              {/* 注册策略提示（按后台开关动态显示） */}
              <div className="mb-6 flex items-center gap-3 px-4 py-3 border border-hazard/30 bg-hazard-dim">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-hazard shrink-0">
                  {approvalMode ? 'REVIEW' : trialOn ? 'TRIAL' : 'INFO'}
                </span>
                <span className="text-[13px] text-fg">
                  {approvalMode ? (
                    trialOn
                      ? <>注册后需管理员审核，通过即送 <span className="font-mono text-terminal font-bold">{trialDays}</span> 天免费使用</>
                      : <>注册后需管理员审核，通过后开通使用</>
                  ) : trialOn ? (
                    <>注册即送 <span className="font-mono text-terminal font-bold">{trialDays}</span> 天免费使用</>
                  ) : (
                    <>注册后由管理员开通服务</>
                  )}
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-fg">用户名</span>
                    <span className="tac-label">USERNAME</span>
                  </label>
                  <input
                    type="text" name="username" value={formData.username} onChange={handleChange} required
                    className="tac-input" placeholder="一个唯一的用户名"
                  />
                  <p className="mt-1.5 text-[11px] text-fg-mute">建议使用便于队友识别的昵称</p>
                </div>

                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-fg">密码</span>
                    <span className="tac-label">PASSCODE</span>
                  </label>
                  <input
                    type="password" name="password" value={formData.password} onChange={handleChange} required
                    className="tac-input" placeholder="密码至少 6 位"
                  />
                </div>

                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-fg">确认密码</span>
                    <span className="tac-label">CONFIRM</span>
                  </label>
                  <input
                    type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required
                    className="tac-input" placeholder="请再次输入密码"
                  />
                </div>

                <button type="submit" disabled={loading} className="tac-btn tac-btn-primary w-full !py-4 group">
                  {loading ? '注册中 // CREATING...' : (
                    <>创建账号 // REGISTER <FaArrowRight className="text-xs group-hover:translate-x-1 transition-transform" /></>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-ink-line flex items-center justify-between">
                <span className="text-[13px] text-fg-dim">已有账号？</span>
                <Link to={loginPath} className="font-mono text-xs uppercase tracking-[0.15em] text-hazard hover:text-hazard-bright transition-colors flex items-center gap-1.5">
                  立即登录 <FaArrowRight className="text-[10px]" />
                </Link>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-mute">注册即代表同意服务协议</span>
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
