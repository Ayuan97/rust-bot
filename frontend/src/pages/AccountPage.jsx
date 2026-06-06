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

  const daysLeft = subscription ? Math.max(0, Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;
  const subExpiring = subscription && daysLeft <= 7;

  if (loading) return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex items-center justify-center">
      <div className="tac-label flex items-center gap-3 text-fg-dim">
        <FaTerminal className="animate-spin text-hazard" />
        <span>SYNCING PROFILE // 正在同步档案…</span>
      </div>
    </div>
  );

  return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex flex-col">
      {/* 顶部 status bar */}
      <div className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-ink-line shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 border border-ink-line flex items-center justify-center text-fg-dim hover:text-fg hover:border-fg-dim transition-colors shrink-0"
            aria-label="返回控制台"
          >
            <FaArrowLeft className="text-xs" />
          </button>
          <div className="tac-label flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> OPERATOR PROFILE // 0xA7
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <div className="text-right hidden sm:block">
            <div className="tac-label !text-[10px]">OPERATOR ID</div>
            <div className="font-mono text-xs text-fg-dim tabular-nums mt-0.5">{user?.id?.slice(0, 8) || 'UNKNOWN'}</div>
          </div>
          <button
            onClick={logout}
            className="w-9 h-9 border border-ink-line flex items-center justify-center text-fg-dim hover:text-hazard hover:border-hazard/50 transition-colors"
            title="退出登录"
          >
            <FaSignOutAlt className="text-xs" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="px-4 md:px-6 py-6 md:py-8">
          {/* 页面标题 */}
          <div className="mb-6">
            <div className="tac-label flex items-center gap-2">
              <FaUserSecret className="text-hazard" /> 指挥官档案 // COMMANDER
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-fg tracking-tight mt-1">账户中心</h1>
            <p className="text-[13px] text-fg-dim mt-1">账户信息、订阅状态与安全设置</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
              <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[ERR]</span>
              <span>{error}</span>
            </div>
          )}

          {/* Tab 模块选择 */}
          <div className="flex flex-wrap gap-px bg-ink-line border border-ink-line mb-6 w-fit">
            <TabBtn active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<FaUserSecret />} label="个人档案" en="PROFILE" />
            <TabBtn active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<FaHistory />} label="消费记录" en="ORDERS" />
            <TabBtn active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={<FaShieldAlt />} label="安全设置" en="SECURITY" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* 左侧个人信息卡片 (始终显示) */}
            <div className="lg:col-span-1">
              <div className="tac-panel tac-corners p-6">
                <div className="tac-label flex items-center gap-2 mb-5">
                  <FaUserSecret className="text-hazard" /> 账户信息 // ACCOUNT
                </div>

                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-20 h-20 bg-hazard-dim border border-hazard/30 flex items-center justify-center mb-4">
                    <FaUserSecret className="text-3xl text-hazard" />
                  </div>
                  <h2 className="text-lg font-extrabold text-fg tracking-tight">{user?.username}</h2>
                  {user?.email && <p className="font-mono text-[11px] text-fg-dim mt-1">{user?.email}</p>}
                </div>

                <div className="border-t border-ink-line pt-4 space-y-px bg-ink-line border-x border-b border-ink-line">
                  <DataEntry label="订阅等级" value={subscription?.planType === 'TRIAL' ? '试用中' : (subscription ? '已订阅' : '未订阅')} highlight />
                  <DataEntry label="加入日期" value={formatDate(user?.createdAt)} mono />
                  <DataEntry label="账户状态" value={subscription ? '服务可用' : '待开通'} />
                </div>
              </div>
            </div>

            {/* 右侧动态内容区 */}
            <div className="lg:col-span-2">
              <div className="tac-panel p-5 md:p-6 min-h-[400px]">
                {activeTab === 'profile' && (
                  <div className="animate-fade-in space-y-6">
                    <div className="flex justify-between items-center gap-3">
                      <div className="tac-label flex items-center gap-2">
                        <FaShieldAlt className="text-hazard" /> 订阅状态 // SUBSCRIPTION
                      </div>
                      <button onClick={() => navigate('/payment')} className="tac-btn tac-btn-primary !py-2">
                        续费 // RENEW
                      </button>
                    </div>

                    {subscription ? (
                      <div className="border border-ink-line">
                        <div className="bg-ink-800 px-4 py-3 flex items-center justify-between">
                          <span className="text-[13px] text-fg-dim">剩余授权时长</span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 border ${subExpiring ? 'text-hazard border-hazard/30 bg-hazard-dim' : 'text-terminal border-terminal/30'}`}>
                            <span className={`w-1.5 h-1.5 ${subExpiring ? 'bg-hazard' : 'bg-terminal animate-tac-blink'}`} />
                            <span className="font-mono text-sm font-bold tabular-nums">{daysLeft} 天</span>
                          </span>
                        </div>
                        <div className="px-4 py-4">
                          <div className="h-1.5 bg-ink-700 overflow-hidden mb-4">
                            <div className={`h-full ${subExpiring ? 'bg-hazard' : 'bg-fg-dim'}`} style={{ width: `${Math.min(100, Math.max(0, (new Date(subscription.endDate) - new Date(subscription.startDate)) / (1000 * 60 * 60 * 24)))}%` }} />
                          </div>
                          <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line">
                            <div className="bg-ink-850 px-3 py-2.5">
                              <div className="tac-label !text-[10px]">PLAN</div>
                              <div className="font-mono text-sm font-bold text-fg tabular-nums mt-1">{subscription.planType}</div>
                            </div>
                            <div className="bg-ink-850 px-3 py-2.5">
                              <div className="tac-label !text-[10px]">EXPIRES</div>
                              <div className="font-mono text-sm font-bold text-fg tabular-nums mt-1">{formatDate(subscription.endDate)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-ink-line bg-ink-850 py-12 text-center">
                        <div className="tac-label text-fg-mute">NO ACTIVE SUBSCRIPTION // 暂无活跃授权</div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'orders' && (
                  <div className="animate-fade-in space-y-4">
                    <div className="tac-label flex items-center gap-2">
                      <FaHistory className="text-hazard" /> 消费记录 // ORDERS
                    </div>
                    {orders.length === 0 ? (
                      <div className="border border-ink-line bg-ink-850 py-12 text-center">
                        <div className="tac-label text-fg-mute">NO ORDERS // 暂无订单记录</div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-ink-line">
                        <table className="w-full text-xs">
                          <thead className="bg-ink-800">
                            <tr className="text-fg-dim">
                              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">方案</th>
                              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">下单时间</th>
                              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">金额</th>
                              <th className="text-left py-2.5 px-3 font-semibold text-[11px]">状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map(order => {
                              const paid = order.status === 'PAID';
                              return (
                                <tr key={order.id} className="border-t border-ink-line hover:bg-ink-800/60 transition-colors">
                                  <td className="py-3 px-3">
                                    <div className="text-fg font-mono font-semibold tabular-nums">{order.planType}</div>
                                  </td>
                                  <td className="py-3 px-3 text-fg-dim font-mono tabular-nums">{formatDate(order.createdAt)}</td>
                                  <td className="py-3 px-3 text-fg font-mono font-bold tabular-nums">¥{order.amount}</td>
                                  <td className="py-3 px-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 border ${paid ? 'text-terminal border-terminal/30' : 'text-fg-dim border-ink-line'}`}>
                                      <span className={`w-1.5 h-1.5 ${paid ? 'bg-terminal' : 'bg-fg-mute'}`} />
                                      {paid ? '支付成功' : order.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="animate-fade-in space-y-8">
                    <section>
                      <div className="tac-label flex items-center gap-2 mb-5">
                        <FaLock className="text-hazard" /> 更改密码 // PASSCODE
                      </div>
                      <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
                        <SecurityInput label="当前密码" en="CURRENT" type="password" value={passwordForm.oldPassword} onChange={v => setPasswordForm({...passwordForm, oldPassword: v})} />
                        <SecurityInput label="新密码" en="NEW" type="password" value={passwordForm.newPassword} onChange={v => setPasswordForm({...passwordForm, newPassword: v})} />
                        <SecurityInput label="确认新密码" en="CONFIRM" type="password" value={passwordForm.confirmPassword} onChange={v => setPasswordForm({...passwordForm, confirmPassword: v})} />

                        {passwordStatus.msg && (
                          passwordStatus.type === 'success' ? (
                            <div className="px-4 py-3 border border-terminal/30 text-fg text-sm flex items-start gap-2.5">
                              <span className="font-mono text-terminal text-xs mt-0.5 shrink-0">[OK]</span>
                              <span>{passwordStatus.msg}</span>
                            </div>
                          ) : (
                            <div className="px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
                              <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[ERR]</span>
                              <span>{passwordStatus.msg}</span>
                            </div>
                          )
                        )}

                        <button type="submit" disabled={passwordLoading} className="tac-btn tac-btn-ghost">
                          {passwordLoading ? '更新中 // ROTATING...' : '确认更改 // APPLY'}
                        </button>
                      </form>
                    </section>

                    <section className="pt-8 border-t border-ink-line">
                      <div className="tac-label !text-hazard flex items-center gap-2 mb-3">
                        <FaExclamationTriangle /> 危险区域 // DANGER ZONE
                      </div>
                      <p className="text-[13px] text-fg-dim mb-5 leading-relaxed">注销账户为永久操作，将清除全部数据且不可撤销。</p>
                      {!showDeleteConfirm ? (
                        <button onClick={() => setShowDeleteConfirm(true)} className="tac-btn tac-btn-ghost !border-hazard/40 !text-hazard hover:!bg-hazard-dim">
                          注销账户 // DELETE
                        </button>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          <button className="tac-btn tac-btn-primary">确认彻底清除 // CONFIRM</button>
                          <button onClick={() => setShowDeleteConfirm(false)} className="tac-btn tac-btn-ghost">取消 // CANCEL</button>
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

function TabBtn({ active, onClick, icon, label, en }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-colors ${active ? 'bg-hazard-dim text-fg border-l-2 border-hazard' : 'bg-ink-850 text-fg-dim hover:text-fg hover:bg-ink-800 border-l-2 border-transparent'}`}>
      <span className={`text-xs ${active ? 'text-hazard' : ''}`}>{icon}</span>
      {label}
      <span className="tac-label !text-[9px] hidden md:inline">{en}</span>
    </button>
  );
}

function DataEntry({ label, value, highlight, mono }) {
  return (
    <div className="flex justify-between items-center gap-3 bg-ink-850 px-3 py-2.5">
      <span className="text-[13px] text-fg-dim">{label}</span>
      <span className={`text-sm font-bold ${mono ? 'font-mono tabular-nums' : ''} ${highlight ? 'text-hazard' : 'text-fg'}`}>{value}</span>
    </div>
  );
}

function SecurityInput({ label, en, type, value, onChange }) {
  return (
    <div>
      <label className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-bold text-fg">{label}</span>
        <span className="tac-label">{en}</span>
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="tac-input"
      />
    </div>
  );
}
