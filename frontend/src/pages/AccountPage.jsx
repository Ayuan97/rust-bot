import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, userApi, paymentApi } from '../services/auth';

export default function AccountPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile', 'orders', 'security'
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 修改密码表单
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 删除账号表单
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);

      // 获取用户信息
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      setUser(userData);

      // 获取订阅信息
      const subResult = await userApi.getSubscription();
      if (subResult.success) {
        setSubscription(subResult.subscription);
      }

      // 获取订单历史
      const ordersResult = await paymentApi.getOrders({ limit: 10 });
      if (ordersResult.success) {
        setOrders(ordersResult.orders);
      }
    } catch (err) {
      console.error('获取用户数据失败:', err);
      setError(err.response?.data?.error || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // 验证
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('新密码至少需要 6 个字符');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setPasswordLoading(true);

    try {
      const result = await userApi.changePassword(
        passwordForm.oldPassword,
        passwordForm.newPassword
      );

      if (result.success) {
        setPasswordSuccess('密码修改成功');
        setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(result.error || '修改密码失败');
      }
    } catch (err) {
      console.error('修改密码失败:', err);
      setPasswordError(err.response?.data?.error || '修改密码失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');

    if (!deletePassword) {
      setDeleteError('请输入密码以确认删除');
      return;
    }

    setDeleteLoading(true);

    try {
      const result = await userApi.deleteAccount(deletePassword);

      if (result.success) {
        // 删除成功,登出并跳转
        authApi.logout();
      } else {
        setDeleteError(result.error || '删除账号失败');
      }
    } catch (err) {
      console.error('删除账号失败:', err);
      setDeleteError(err.response?.data?.error || '删除账号失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      PENDING: { text: '待支付', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
      PAID: { text: '已支付', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
      FAILED: { text: '失败', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
      CANCELLED: { text: '已取消', className: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
      EXPIRED: { text: '已过期', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
    };

    const badge = badges[status] || badges.PENDING;

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${badge.className}`}>
        {badge.text}
      </span>
    );
  };

  const getPlanName = (planType) => {
    const plans = {
      TRIAL: '试用版',
      MONTHLY: '月付套餐',
      QUARTERLY: '季付套餐',
      YEARLY: '年付套餐',
    };
    return plans[planType] || planType;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="flex items-center space-x-2 text-gray-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* 标题和返回按钮 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">账户管理</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-300"
          >
            ← 返回仪表板
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Tab 导航 */}
        <div className="flex space-x-1 mb-6 bg-gray-800 rounded-lg p-1 border border-gray-700">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            账户信息
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'orders'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            订单历史
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'security'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            安全设置
          </button>
        </div>

        {/* Tab 内容 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          {/* 账户信息 Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">基本信息</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">用户名</label>
                  <div className="bg-gray-700 px-4 py-2 rounded-lg text-white">
                    {user?.username || '-'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">邮箱</label>
                  <div className="bg-gray-700 px-4 py-2 rounded-lg text-white">
                    {user?.email || '-'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">账户状态</label>
                  <div className="bg-gray-700 px-4 py-2 rounded-lg">
                    {subscription?.status === 'ACTIVE' ? (
                      <span className="text-green-400">✓ 已激活</span>
                    ) : (
                      <span className="text-red-400">✗ 已过期</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">注册时间</label>
                  <div className="bg-gray-700 px-4 py-2 rounded-lg text-white">
                    {formatDate(user?.createdAt)}
                  </div>
                </div>
              </div>

              {subscription && (
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4">订阅信息</h3>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">当前套餐</label>
                      <div className="bg-gray-700 px-4 py-2 rounded-lg text-white">
                        {getPlanName(subscription.planType)}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">到期时间</label>
                      <div className="bg-gray-700 px-4 py-2 rounded-lg text-white">
                        {formatDate(subscription.endDate)}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate('/payment')}
                    className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
                  >
                    续费订阅
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 订单历史 Tab */}
          {activeTab === 'orders' && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">订单历史</h2>

              {orders.length === 0 ? (
                <p className="text-gray-400 text-center py-8">暂无订单记录</p>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-white font-medium">
                            {getPlanName(order.planType)}
                          </span>
                          {getStatusBadge(order.status)}
                        </div>
                        <span className="text-xl font-bold text-blue-400">¥{order.amount}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-gray-400">
                          订单编号: <span className="text-gray-300">{order.id}</span>
                        </div>
                        <div className="text-gray-400">
                          支付方式:{' '}
                          <span className="text-gray-300">
                            {order.paymentMethod === 'ALIPAY' ? '支付宝' : '微信支付'}
                          </span>
                        </div>
                        <div className="text-gray-400">
                          创建时间: <span className="text-gray-300">{formatDate(order.createdAt)}</span>
                        </div>
                        {order.paidAt && (
                          <div className="text-gray-400">
                            支付时间:{' '}
                            <span className="text-gray-300">{formatDate(order.paidAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 安全设置 Tab */}
          {activeTab === 'security' && (
            <div className="space-y-8">
              {/* 修改密码 */}
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">修改密码</h2>

                {passwordSuccess && (
                  <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400">
                    {passwordSuccess}
                  </div>
                )}

                {passwordError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
                    {passwordError}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      当前密码
                    </label>
                    <input
                      type="password"
                      value={passwordForm.oldPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, oldPassword: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="请输入当前密码"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      新密码
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      required
                      minLength={6}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="至少 6 个字符"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      确认新密码
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="再次输入新密码"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                      passwordLoading
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {passwordLoading ? '修改中...' : '修改密码'}
                  </button>
                </form>
              </div>

              {/* 删除账号 */}
              <div className="pt-8 border-t border-gray-700">
                <h2 className="text-xl font-semibold text-red-400 mb-4">危险操作</h2>

                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-4">
                  <p className="text-red-400 text-sm">
                    <strong>警告:</strong> 删除账号后，您的所有数据将被永久删除且无法恢复，包括订阅记录、订单历史等。
                  </p>
                </div>

                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-6 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600 rounded-lg text-red-400 font-medium transition-colors"
                  >
                    删除账号
                  </button>
                ) : (
                  <div className="space-y-4">
                    {deleteError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                        {deleteError}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        输入密码以确认删除
                      </label>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="请输入密码"
                      />
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteLoading}
                        className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                          deleteLoading
                            ? 'bg-gray-600 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {deleteLoading ? '删除中...' : '确认删除'}
                      </button>

                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeletePassword('');
                          setDeleteError('');
                        }}
                        className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
