import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, userApi, paymentApi } from '../services/auth';
import { FaTerminal, FaShieldAlt, FaUserSecret, FaHistory, FaLock, FaSkull, FaArrowLeft, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

export default function AccountPage() {
  const navigate = useNavigate();
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
      setError('DATA_FETCH_ERROR: UNABLE_TO_RETRIEVE_DOSSIER');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', msg: 'VAL_ERR: KEYS_MISMATCH' });
      return;
    }
    setPasswordLoading(true);
    try {
      const result = await userApi.changePassword(passwordForm.oldPassword, passwordForm.newPassword);
      if (result.success) {
        setPasswordStatus({ type: 'success', msg: 'UPDATE_SUCCESS: KEY_ROTATED' });
        setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else throw new Error(result.error);
    } catch (err) {
      setPasswordStatus({ type: 'error', msg: 'UPDATE_FAILED: ' + (err.message || 'UNKNOWN_ERROR') });
    } finally { setPasswordLoading(false); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '---';

  if (loading) return (
    <div className="min-h-screen bg-[#0d0e10] flex items-center justify-center font-mono">
      <div className="flex items-center gap-3 text-[#cd5241]">
        <FaTerminal className="animate-spin" />
        <span className="text-[10px] uppercase tracking-[0.5em]">Syncing_Dossier...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-mono p-6 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>
      
      <div className="max-w-5xl mx-auto">
        {/* 顶部标题 */}
        <header className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="w-10 h-10 tactic-cut border border-white/10 flex items-center justify-center hover:bg-[#cd5241] transition-all">
              <FaArrowLeft className="text-xs" />
            </button>
            <div>
              <h1 className="text-xl font-black uppercase tracking-widest glow-text">Commander_Dossier</h1>
              <p className="text-[10px] text-gray-600 uppercase tracking-[0.4em]">Personal Personnel Record</p>
            </div>
          </div>
          <div className="text-right">
             <div className="text-[10px] font-bold text-[#cd5241] uppercase">Status: Active_Duty</div>
             <div className="text-[8px] text-gray-700 font-mono mt-1 uppercase">CID: {user?.id?.slice(0,8) || 'Unknown'}</div>
          </div>
        </header>

        {/* Tab 模块选择 */}
        <div className="flex gap-1 p-1 bg-black/40 tactic-cut border border-white/5 mb-8 w-fit">
           <TabBtn active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<FaUserSecret />} label="个人档案" />
           <TabBtn active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<FaHistory />} label="补给记录" />
           <TabBtn active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={<FaShieldAlt />} label="安全防御" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
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
                      <p className="text-[10px] text-gray-600 font-mono uppercase mt-1">{user?.email}</p>
                   </div>
                   
                   <div className="space-y-4 border-t border-white/5 pt-6">
                      <DataEntry label="Clearance_Level" value={subscription?.status === 'ACTIVE' ? 'PRO_COMMANDER' : 'RECRUIT'} highlight />
                      <DataEntry label="Enlisted_Date" value={formatDate(user?.createdAt)} />
                      <DataEntry label="Last_Login" value="Node_HK_04" />
                   </div>
                </div>
             </div>
          </div>

          {/* 右侧动态内容区 */}
          <div className="lg:col-span-2">
             <div className="tactic-border tactic-cut p-1 bg-black/20 min-h-[400px]">
                <div className="bg-black/40 p-8 h-full">
                   {activeTab === 'profile' && (
                     <div className="animate-fade-in space-y-8">
                        <div className="flex justify-between items-center">
                           <h3 className="text-sm font-black uppercase tracking-widest text-[#cd5241]">Authorization_Status</h3>
                           <button onClick={() => navigate('/payment')} className="text-[10px] px-4 py-1.5 bg-[#cd5241] text-white tactic-cut uppercase font-black hover:bg-[#b04537] transition-all">Request_Supply</button>
                        </div>
                        
                        {subscription ? (
                          <div className="p-6 bg-white/[0.02] border border-white/5 tactic-cut">
                             <div className="flex justify-between mb-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Supply_Duration_Remaining</span>
                                <span className="text-xs font-mono font-black text-[#a3e635]">30 Days</span>
                             </div>
                             <div className="h-2 bg-gray-800 tactic-cut overflow-hidden mb-4">
                                <div className="h-full bg-[#a3e635] w-full" />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <div className="text-[8px] text-gray-600 uppercase mb-1">Current_Plan</div>
                                   <div className="text-xs font-bold">{subscription.planType}</div>
                                </div>
                                <div>
                                   <div className="text-[8px] text-gray-600 uppercase mb-1">Expiry_Date</div>
                                   <div className="text-xs font-bold font-mono">{formatDate(subscription.endDate)}</div>
                                </div>
                             </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 opacity-30">
                             <p className="text-[10px] uppercase tracking-widest">No_Active_Subscription_Data</p>
                          </div>
                        )}
                     </div>
                   )}

                   {activeTab === 'orders' && (
                     <div className="animate-fade-in space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#cd5241] mb-6">Logistics_History</h3>
                        {orders.length === 0 ? (
                          <p className="text-[10px] text-gray-600 uppercase text-center py-12">No_Transaction_Packets_Found</p>
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
                                     <div className={`text-[8px] uppercase font-bold ${order.status === 'PAID' ? 'text-[#a3e635]' : 'text-gray-600'}`}>{order.status}</div>
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
                           <h3 className="text-sm font-black uppercase tracking-widest text-[#cd5241] mb-6">Key_Rotation_Service</h3>
                           <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
                              <SecurityInput label="Current_Key" type="password" value={passwordForm.oldPassword} onChange={v => setPasswordForm({...passwordForm, oldPassword: v})} />
                              <SecurityInput label="New_Key" type="password" value={passwordForm.newPassword} onChange={v => setPasswordForm({...passwordForm, newPassword: v})} />
                              <SecurityInput label="Verify_New_Key" type="password" value={passwordForm.confirmPassword} onChange={v => setPasswordForm({...passwordForm, confirmPassword: v})} />
                              
                              {passwordStatus.msg && (
                                <div className={`text-[10px] font-bold uppercase p-2 tactic-cut ${passwordStatus.type === 'success' ? 'bg-[#a3e635]/10 text-[#a3e635]' : 'bg-red-500/10 text-red-500'}`}>
                                   {">"} {passwordStatus.msg}
                                </div>
                              )}

                              <button type="submit" disabled={passwordLoading} className="px-8 py-3 bg-white/5 border border-white/10 tactic-cut text-[10px] font-black uppercase hover:bg-[#cd5241] transition-all">
                                {passwordLoading ? 'Rotating...' : 'Establish_New_Key'}
                              </button>
                           </form>
                        </section>

                        <section className="pt-10 border-t border-white/5">
                           <h3 className="text-sm font-black uppercase tracking-widest text-red-500 mb-4 flex items-center gap-2">
                              <FaExclamationTriangle /> Termination_Zone
                           </h3>
                           <p className="text-[10px] text-gray-600 uppercase mb-6 leading-relaxed">Warning: Terminal account deletion is permanent and will purge all personnel records and supply history.</p>
                           {!showDeleteConfirm ? (
                             <button onClick={() => setShowDeleteConfirm(true)} className="text-[10px] font-black text-red-500 uppercase border border-red-500/30 px-6 py-2 tactic-cut hover:bg-red-500/10">Delete_Commander_Dossier</button>
                           ) : (
                             <div className="flex gap-4">
                                <button className="text-[10px] font-black text-white bg-red-600 px-6 py-2 tactic-cut">Confirm_Purge</button>
                                <button onClick={() => setShowDeleteConfirm(false)} className="text-[10px] font-black text-gray-500 px-6 py-2 tactic-cut border border-white/5">Cancel</button>
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
