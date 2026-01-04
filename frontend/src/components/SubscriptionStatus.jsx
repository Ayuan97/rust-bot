import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../services/auth';

export default function SubscriptionStatus() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const result = await userApi.getSubscription();

      if (result.success) {
        setSubscription(result.subscription);
      } else {
        setError(result.error || '获取订阅信息失败');
      }
    } catch (err) {
      console.error('获取订阅信息失败:', err);
      setError(err.response?.data?.error || '获取订阅信息失败');
    } finally {
      setLoading(false);
    }
  };

  const calculateDaysRemaining = () => {
    if (!subscription || !subscription.endDate) return 0;

    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  };

  const getStatusColor = () => {
    const daysRemaining = calculateDaysRemaining();

    if (daysRemaining === 0 || subscription?.status !== 'ACTIVE') {
      return 'text-red-400 bg-red-500/10 border-red-500/50';
    } else if (daysRemaining <= 7) {
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/50';
    } else {
      return 'text-green-400 bg-green-500/10 border-green-500/50';
    }
  };

  const getStatusText = () => {
    if (subscription?.status !== 'ACTIVE') {
      return '已过期';
    }

    const daysRemaining = calculateDaysRemaining();
    if (daysRemaining === 0) {
      return '今天到期';
    } else if (daysRemaining === 1) {
      return '明天到期';
    } else {
      return `剩余 ${daysRemaining} 天`;
    }
  };

  const getPlanName = () => {
    switch (subscription?.planType) {
      case 'TRIAL':
        return '试用版';
      case 'MONTHLY':
        return '月付套餐';
      case 'QUARTERLY':
        return '季付套餐';
      case 'YEARLY':
        return '年付套餐';
      default:
        return '未知套餐';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          <p className="text-gray-400">加载订阅信息...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="text-red-400 text-center">
          <p>{error}</p>
          <button
            onClick={fetchSubscription}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300 underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <p className="text-gray-400 text-center">未找到订阅信息</p>
      </div>
    );
  }

  const daysRemaining = calculateDaysRemaining();
  const isExpiringSoon = daysRemaining <= 7 && subscription.status === 'ACTIVE';
  const isExpired = daysRemaining === 0 || subscription.status !== 'ACTIVE';

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">订阅状态</h3>

        {/* 状态标签 */}
        <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      {/* 订阅信息 */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">当前套餐:</span>
          <span className="text-white font-medium">{getPlanName()}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-400">开始日期:</span>
          <span className="text-white">{formatDate(subscription.startDate)}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-400">到期日期:</span>
          <span className="text-white">{formatDate(subscription.endDate)}</span>
        </div>

        {subscription.status === 'ACTIVE' && (
          <div className="flex justify-between items-center">
            <span className="text-gray-400">剩余时间:</span>
            <span className={`font-medium ${
              isExpired ? 'text-red-400' :
              isExpiringSoon ? 'text-yellow-400' :
              'text-green-400'
            }`}>
              {daysRemaining} 天
            </span>
          </div>
        )}
      </div>

      {/* 进度条 */}
      {subscription.status === 'ACTIVE' && (
        <div className="mb-6">
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all ${
                isExpired ? 'bg-red-500' :
                isExpiringSoon ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{
                width: `${Math.max(0, Math.min(100, (daysRemaining / 30) * 100))}%`
              }}
            />
          </div>
        </div>
      )}

      {/* 提示信息 */}
      {isExpired && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
          <p className="text-red-400 text-sm text-center">
            您的订阅已过期，请续费以继续使用服务
          </p>
        </div>
      )}

      {isExpiringSoon && !isExpired && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
          <p className="text-yellow-400 text-sm text-center">
            您的订阅即将到期，建议尽快续费
          </p>
        </div>
      )}

      {/* 续费按钮 */}
      <button
        onClick={() => navigate('/payment')}
        className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
          isExpired || isExpiringSoon
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-gray-700 hover:bg-gray-600'
        }`}
      >
        {isExpired ? '立即续费' : isExpiringSoon ? '续费延长' : '续费'}
      </button>
    </div>
  );
}
