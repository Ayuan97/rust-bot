import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authApi } from '../services/auth';
import { FaUserPlus, FaLock, FaArrowRight, FaClock, FaArrowLeft } from 'react-icons/fa';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const redirectPath = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';
  const loginPath = `/login?redirect=${encodeURIComponent(redirectPath)}`;

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
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans flex items-center justify-center p-4 md:p-6 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>

      {/* 返回首页按钮 */}
      <Link
        to="/"
        className="fixed top-6 left-6 z-50 flex items-center gap-2 text-gray-500 hover:text-white transition-colors group"
      >
        <FaArrowLeft className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-wider">返回首页</span>
      </Link>

      <div className="max-w-md w-full relative z-10 py-12">
        <div className="text-center mb-10">
          {/* 注册页特有的红色主题图标 */}
          <div className="w-16 h-16 tactic-cut bg-[#cd5241] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#cd5241]/20">
            <FaUserPlus className="text-white text-2xl" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest glow-text italic">创建账号</h1>
          <p className="text-xs text-[#f2998f] mt-2">3 分钟完成注册并进入控制台</p>
        </div>

        <div className="tactic-border tactic-cut p-1 bg-black/40 backdrop-blur-xl">
          <div className="bg-black/40 p-8">
            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold tactic-cut">
                {error}
              </div>
            )}

            {redirectParam && (
              <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px] tactic-cut">
                注册成功后会自动回到你刚才查看的页面
              </div>
            )}

            {/* 试用期提示 */}
            <div className="mb-8 p-4 bg-[#a3e635]/5 border border-[#a3e635]/20 tactic-cut relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-16 h-16 bg-[#a3e635]/10 rotate-45 translate-x-8 -translate-y-8"></div>
               <div className="flex items-center gap-3 text-[#a3e635]">
                  <FaClock className="text-xs" />
                  <span className="text-[10px] font-black uppercase tracking-widest">新用户试用</span>
               </div>
                <p className="text-[11px] text-gray-400 mt-1">注册后自动开通 7 天试用期</p>
             </div>

             <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[11px] font-black text-gray-400 mb-2 border-l-2 border-[#cd5241] pl-2">用户名</label>
                <div className="relative">
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/5 tactic-cut text-sm text-white focus:border-[#cd5241]/50 outline-none transition-all placeholder-gray-500"
                    placeholder="请输入一个唯一的用户名"
                  />
                  <FaUserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">建议使用便于队友识别的昵称</p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 mb-2 border-l-2 border-[#cd5241] pl-2">密码</label>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/5 tactic-cut text-sm text-white focus:border-[#cd5241]/50 outline-none transition-all placeholder-gray-500"
                    placeholder="密码至少 6 位"
                  />
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 mb-2 border-l-2 border-[#cd5241] pl-2">确认密码</label>
                <div className="relative">
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/5 tactic-cut text-sm text-white focus:border-[#cd5241]/50 outline-none transition-all placeholder-gray-500"
                    placeholder="请再次输入您的密码"
                  />
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full tactic-cut bg-[#cd5241] hover:bg-[#b04537] py-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2 group mt-4 shadow-lg shadow-[#cd5241]/10"
              >
                {loading ? '注册中...' : (
                  <>注册并继续 <FaArrowRight className="group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
            </form>

            <div className="mt-8 text-center border-t border-white/5 pt-6">
              <p className="text-gray-400 text-xs">
                已有账号？{' '}
                <Link to={loginPath} className="text-blue-400 hover:text-white transition-colors font-black">
                  立即登录
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="text-[11px] text-gray-500">注册即表示你同意平台服务协议与隐私政策</div>
          <Link to="/privacy" className="text-[11px] text-gray-400 hover:text-[#cd5241] transition-colors mt-2 inline-block">
            查看隐私政策
          </Link>
        </div>
      </div>
    </div>
  );
}
