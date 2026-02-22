import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, userApi, paymentApi } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { FaTerminal, FaShieldAlt, FaUserSecret, FaHistory, FaLock, FaSkull, FaArrowLeft, FaCheckCircle, FaExclamationTriangle, FaSignOutAlt } from 'react-icons/fa';

export default function AccountPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile'); 
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 表单状态
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState({ type: '', msg: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => { fetchUserData(); }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      setUser(userData);
      const subResult = await userApi.getSubscription();
      if (subResult.success) setSubscription(subResult.subscription);
      const ordersResult = await paymentApi.getOrders({ limit: 10 });
      if (ordersResult.success) setOrders(ordersResult.orders);
    } catch (err) {
      setError('获取账户信息失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', msg: '两次输入的新密码不一致' });
      return;
    }
    setPasswordLoading(true);
    try {
      const result = await userApi.changePassword(passwordForm.oldPassword, passwordForm.newPassword);
      if (result.success) {
        setPasswordStatus({ type: 'success', msg: '密码修改成功' });
        setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else throw new Error(result.error);
    } catch (err) {
      setPasswordStatus({ type: 'error', msg: '修改失败：' + (err.message || '未知错误') });
    } finally { setPasswordLoading(false); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '---';

  if (loading) return (
    <div className="min-h-screen bg-[#0d0e10] flex items-center justify-center font-sans">
      <div className="flex items-center gap-3 text-[#cd5241]">
        <FaTerminal className="animate-spin" />
        <span className="text-[10px] uppercase tracking-[0.5em]">正在同步档案...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans p-4 md:p-6 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>
      
      <div className="max-w-5xl mx-auto">
        {/* 顶部标题 */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-10 border-b border-white/5 pb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="w-10 h-10 tactic-cut border border-white/10 flex items-center justify-center hover:bg-[#cd5241] transition-all">
              <FaArrowLeft className="text-xs" />
            </button>
            <div>
              <h1 className="text-xl font-black uppercase tracking-widest glow-text italic">指挥官档案</h1>
              <p className="text-[10px] text-gray-600 uppercase tracking-[0.4em]">账户信息与订阅管理</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
               <div className="text-[10px] font-bold text-[#cd5241] uppercase">状态: 正常</div>
               <div className="text-[8px] text-gray-700 font-mono mt-1 uppercase">识别号: {user?.id?.slice(0,8) || 'Unknown'}</div>
            </div>
            <button
              onClick={logout}
              className="w-10 h-10 tactic-cut border border-white/10 flex items-center justify-center hover:bg-[#ef4444]/20 hover:border-[#ef4444]/50 transition-all group"
              title="退出登录"
            >
              <FaSignOutAlt className="text-xs text-gray-500 group-hover:text-[#ef4444]" />
            </button>
          </div>
        </header>

        {/* Tab 模块选择 */}
        <div className="flex flex-wrap gap-1 p-1 bg-black/40 tactic-cut border border-white/5 mb-8 w-fit">
           <TabBtn active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<FaUserSecret />} label="个人档案" />
           <TabBtn active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<FaHistory />} label="订阅记录" />
           <TabBtn active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={<FaShieldAlt />} label="安全设置" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
          {/* 左侧个人信息卡片 (始终显示) */}
          <div className="lg:col-span-1">
             <div className="tactic-border tactic-cut p-1 bg-[#cd5241]/5 shadow-lg shadow-[#cd5241]/5">
                <div className="bg-black/40 p-6 relative overflow-hidden">
                   <div className="scanline"></div>
                   <div className="flex flex-col items-center text-center mb-8">
                      <div className="w-24 h-24 tactic-cut bg-[#cd5241]/20 flex items-center justify-center mb-4 border border-[#cd5241]/30">
                         <FaUserSecret className="text-4xl text-[#cd5241]" />
                      </div>
                      <h2 className="text-xl font-black uppercase tracking-tighter italic">{user?.username}</h2>
                      {user?.email && <p className="text-[10px] text-gray-600 font-mono uppercase mt-1">{user?.email}</p>}
                   </div>
                   
                   <div className="space-y-4 border-t border-white/5 pt-6">
                       <DataEntry label="订阅等级" value={subscription?.planType === 'TRIAL' ? '试用中' : (subscription ? '已订阅' : '未订阅')} highlight />
                       <DataEntry label="加入日期" value={formatDate(user?.createdAt)} />
                       <DataEntry label="账户状态" value={subscription ? '服务可用' : '待开通'} />
                    </div>
                </div>
             </div>
          </div>

          {/* 右侧动态内容区 */}
          <div className="lg:col-span-2">
             <div className="tactic-border tactic-cut p-1 bg-black/20 min-h-[400px]">
                <div className="bg-black/40 p-4 md:p-8 h-full">
                   {activeTab === 'profile' && (
                     <div className="animate-fade-in space-y-8">
                        <div className="flex justify-between items-center">
                           <h3 className="text-sm font-black uppercase tracking-widest text-[#cd5241]">授权状态</h3>
                           <button onClick={() => navigate('/payment')} className="text-[10px] px-4 py-1.5 bg-[#cd5241] text-white tactic-cut uppercase font-black hover:bg-[#b04537] transition-all">去续费</button>
                        </div>
                        
                        {subscription ? (
                          <div className="p-6 bg-white/[0.02] border border-white/5 tactic-cut">
                             <div className="flex justify-between mb-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">剩余授权时长</span>
                                <span className="text-xs font-mono font-black text-[#a3e635]">
                                  {Math.max(0, Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)))} 天
                                </span>
                             </div>
                             <div className="h-2 bg-gray-800 tactic-cut overflow-hidden mb-4">
                                <div className="h-full bg-[#a3e635] transition-all" style={{ width: `${Math.min(100, Math.max(0, (new Date(subscription.endDate) - new Date(subscription.startDate)) / (1000 * 60 * 60 * 24)))}%` }} />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <div className="text-[8px] text-gray-600 uppercase mb-1">当前方案</div>
                                   <div className="text-xs font-bold">{subscription.planType}</div>
                                </div>
                                <div>
                                   <div className="text-[8px] text-gray-600 uppercase mb-1">到期时间</div>
                                   <div className="text-xs font-bold font-mono">{formatDate(subscription.endDate)}</div>
                                </div>
                             </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 opacity-30">
                             <p className="text-[10px] uppercase tracking-widest">暂无活跃授权数据</p>
                          </div>
                        )}
                     </div>
                   )}

                    {activeTab === 'orders' && (
                      <div className="animate-fade-in space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#cd5241] mb-6">订单记录</h3>
                        {orders.length === 0 ? (
                          <p className="text-[10px] text-gray-600 uppercase text-center py-12">暂无订单记录</p>
                        ) : (
                          <div className="space-y-3">
                             {orders.map(order => (
                               <div key={order.id} className="p-4 bg-white/[0.02] border border-white/5 tactic-cut flex items-center justify-between group hover:border-[#cd5241]/30 transition-all">
                                  <div className="flex items-center gap-4">
                                     <div className={`w-8 h-8 tactic-cut flex items-center justify-center text-xs ${order.status === 'PAID' ? 'bg-[#a3e635]/10 text-[#a3e635]' : 'bg-gray-800 text-gray-600'}`}>
                                        <FaHistory />
                                     </div>
                                     <div>
                                        <div className="text-xs font-black uppercase">{order.planType}</div>
                                        <div className="text-[8px] text-gray-600 font-mono">{formatDate(order.createdAt)}</div>
                                     </div>
                                  </div>
                                  <div className="text-right">
                                     <div className="text-sm font-black italic">¥{order.amount}</div>
                                     <div className={`text-[8px] uppercase font-bold ${order.status === 'PAID' ? 'text-[#a3e635]' : 'text-gray-600'}`}>
                                       {order.status === 'PAID' ? '支付成功' : order.status}
                                     </div>
                                  </div>
                               </div>
                             ))}
                          </div>
                        )}
                     </div>
                   )}

                    {activeTab === 'security' && (
                     <div className="animate-fade-in space-y-10">
                        <section>
                           <h3 className="text-sm font-black uppercase tracking-widest text-[#cd5241] mb-6">更改密码</h3>
                           <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
                              <SecurityInput label="当前密钥" type="password" value={passwordForm.oldPassword} onChange={v => setPasswordForm({...passwordForm, oldPassword: v})} />
                              <SecurityInput label="新密钥" type="password" value={passwordForm.newPassword} onChange={v => setPasswordForm({...passwordForm, newPassword: v})} />
                              <SecurityInput label="确认新密钥" type="password" value={passwordForm.confirmPassword} onChange={v => setPasswordForm({...passwordForm, confirmPassword: v})} />
                              
                              {passwordStatus.msg && (
                                <div className={`text-[10px] font-bold uppercase p-2 tactic-cut ${passwordStatus.type === 'success' ? 'bg-[#a3e635]/10 text-[#a3e635]' : 'bg-red-500/10 text-red-500'}`}>
                                   {">"} {passwordStatus.msg}
                                </div>
                              )}

                              <button type="submit" disabled={passwordLoading} className="px-8 py-3 bg-white/5 border border-white/10 tactic-cut text-[10px] font-black uppercase hover:bg-[#cd5241] transition-all">
                                {passwordLoading ? '正在轮换...' : '确立新密钥'}
                              </button>
                           </form>
                        </section>

                        <section className="pt-10 border-t border-white/5">
                           <h3 className="text-sm font-black uppercase tracking-widest text-red-500 mb-4 flex items-center gap-2">
                              <FaExclamationTriangle /> 危险区域：注销账户
                           </h3>
                           <p className="text-[10px] text-gray-600 uppercase mb-6 leading-relaxed">警告：注销账户是永久操作，将清除所有数据且不可撤销。</p>
                           {!showDeleteConfirm ? (
                             <button onClick={() => setShowDeleteConfirm(true)} className="text-[10px] font-black text-red-500 uppercase border border-red-500/30 px-6 py-2 tactic-cut hover:bg-red-500/10">注销指挥官档案</button>
                           ) : (
                             <div className="flex gap-4">
                                <button className="text-[10px] font-black text-white bg-red-600 px-6 py-2 tactic-cut">确认彻底清除</button>
                                <button onClick={() => setShowDeleteConfirm(false)} className="text-[10px] font-black text-gray-500 px-6 py-2 tactic-cut border border-white/5">取消操作</button>
                             </div>
                           )}
                        </section>
                     </div>
                   )}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-6 py-2 tactic-cut text-[10px] font-bold uppercase transition-all ${active ? 'bg-[#cd5241] text-white shadow-lg shadow-[#cd5241]/20' : 'text-gray-500 hover:text-gray-300'}`}>
      {icon} {label}
    </button>
  );
}

function DataEntry({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center text-[10px] border-b border-white/[0.03] pb-2">
       <span className="text-gray-600 uppercase font-mono tracking-tighter">{label}</span>
       <span className={`font-black tracking-widest ${highlight ? 'text-[#cd5241]' : 'text-gray-400'}`}>{value}</span>
    </div>
  );
}

function SecurityInput({ label, type, value, onChange }) {
  return (
    <div>
       <label className="block text-[9px] text-gray-600 uppercase mb-1">{label}</label>
       <input 
         type={type} 
         value={value} 
         onChange={e => onChange(e.target.value)} 
         className="w-full bg-white/[0.03] border border-white/5 tactic-cut px-3 py-2 text-xs outline-none focus:border-[#cd5241]/50" 
       />
    </div>
  );
}
