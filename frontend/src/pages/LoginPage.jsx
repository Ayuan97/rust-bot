import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/auth';
import { FaTerminal, FaShieldAlt, FaKey, FaArrowRight, FaArrowLeft, FaSignInAlt } from 'react-icons/fa';

export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        navigate('/dashboard');
      } else {
        setError(result.error || '访问拒绝：身份验证失败');
      }
    } catch (err) {
      setError('链路错误：无法连接到认证服务器');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans flex items-center justify-center p-6 relative overflow-hidden">
      {/* 扫描线背景 */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>

      {/* 返回首页按钮 */}
      <Link
        to="/"
        className="fixed top-6 left-6 z-50 flex items-center gap-2 text-gray-500 hover:text-white transition-colors group"
      >
        <FaArrowLeft className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-wider">返回首页</span>
      </Link>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-10">
          {/* 登录页特有的蓝色主题图标 */}
          <div className="w-16 h-16 tactic-cut bg-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-600/20">
            <FaSignInAlt className="text-white text-2xl" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest glow-text italic">指挥官身份验证</h1>
          <p className="text-[10px] text-blue-400 uppercase tracking-[0.4em] mt-2 font-mono">// LOGIN_AUTHENTICATION //</p>
        </div>

        <div className="tactic-border tactic-cut p-1 bg-black/40 backdrop-blur-xl">
          <div className="bg-black/40 p-8">
            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest tactic-cut animate-pulse">
                {">"} {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-l-2 border-blue-600 pl-2">
                  指挥官识别码 (邮箱/用户名)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/5 tactic-cut text-xs text-white focus:border-blue-600/50 outline-none transition-all placeholder-gray-800"
                    placeholder="请输入您的邮箱或用户名"
                  />
                  <FaShieldAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-l-2 border-blue-600 pl-2">
                  安全访问密钥 (密码)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/5 tactic-cut text-xs text-white focus:border-blue-600/50 outline-none transition-all placeholder-gray-800"
                    placeholder="••••••••"
                  />
                  <FaKey className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full tactic-cut bg-blue-600 hover:bg-blue-700 py-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2 group shadow-lg shadow-blue-600/10"
              >
                {loading ? '正在验证身份信息...' : (
                  <>启动控制终端 <FaArrowRight className="group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
            </form>

            <div className="mt-8 text-center border-t border-white/5 pt-6">
              <p className="text-gray-600 text-[10px] uppercase tracking-widest">
                尚未注册指挥官账号？{' '}
                <Link to="/register" className="text-[#cd5241] hover:text-white transition-colors font-black">
                  [ 立即注册 ]
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center opacity-30">
           <div className="text-[8px] text-gray-500 uppercase tracking-[0.5em] font-mono">Unauthorized_access_prohibited</div>
           <Link to="/privacy" className="text-[8px] text-gray-500 hover:text-[#cd5241] transition-colors uppercase tracking-widest mt-2 inline-block">
             [ 隐私策略 ]
           </Link>
        </div>
      </div>
    </div>
  );
}
