import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/auth';
import { FaTerminal, FaUserPlus, FaLock, FaArrowRight, FaClock } from 'react-icons/fa';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const validateForm = () => {
    if (formData.username.length < 3) { setError('校验错误：用户名长度至少为 3 位'); return false; }
    if (formData.password.length < 6) { setError('校验错误：密码长度至少为 6 位'); return false; }
    if (formData.password !== formData.confirmPassword) { setError('校验错误：两次输入的密码不一致'); return false; }
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
        navigate('/dashboard');
      } else {
        setError(result.error || '注册失败：未知错误');
      }
    } catch (err) {
      setError('链路错误：无法连接到认证服务器');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans flex items-center justify-center p-6 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>
      
      <div className="max-w-md w-full relative z-10 py-12">
        <div className="text-center mb-10">
          <div className="w-16 h-16 tactic-cut bg-[#cd5241] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#cd5241]/20">
            <FaTerminal className="text-white text-2xl" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest glow-text italic">申请指挥官授权</h1>
          <p className="text-[10px] text-gray-600 uppercase tracking-[0.4em] mt-2 font-mono">建立全新的 Rust 远程控制终端</p>
        </div>

        <div className="tactic-border tactic-cut p-1 bg-black/40 backdrop-blur-xl">
          <div className="bg-black/40 p-8">
            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest tactic-cut animate-pulse">
                {">"} {error}
              </div>
            )}

            {/* 试用期提示 */}
            <div className="mb-8 p-4 bg-[#a3e635]/5 border border-[#a3e635]/20 tactic-cut relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-16 h-16 bg-[#a3e635]/10 rotate-45 translate-x-8 -translate-y-8"></div>
               <div className="flex items-center gap-3 text-[#a3e635]">
                  <FaClock className="text-xs" />
                  <span className="text-[10px] font-black uppercase tracking-widest">初始化部署福利</span>
               </div>
               <p className="text-[9px] text-gray-500 mt-1 uppercase">激活账户即刻获得 7 天高级特权访问</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-l-2 border-[#cd5241] pl-2">指挥官代号</label>
                <div className="relative">
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/5 tactic-cut text-xs text-white focus:border-[#cd5241]/50 outline-none transition-all placeholder-gray-800"
                    placeholder="请输入一个唯一的用户名"
                  />
                  <FaUserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-l-2 border-[#cd5241] pl-2">访问密钥 (密码)</label>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/5 tactic-cut text-xs text-white focus:border-[#cd5241]/50 outline-none transition-all placeholder-gray-800"
                    placeholder="密码至少 6 位"
                  />
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-xs" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 border-l-2 border-[#cd5241] pl-2">密钥确认</label>
                <div className="relative">
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/5 tactic-cut text-xs text-white focus:border-[#cd5241]/50 outline-none transition-all placeholder-gray-800"
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
                {loading ? '正在初始化身份信息...' : (
                  <>建立远程控制终端 <FaArrowRight className="group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
            </form>

            <div className="mt-8 text-center border-t border-white/5 pt-6">
              <p className="text-gray-600 text-[10px] uppercase tracking-widest">
                已有指挥官账号？{' '}
                <Link to="/login" className="text-[#cd5241] hover:text-white transition-colors font-black">
                  [ 启动身份验证 ]
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
