import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../services/auth';

export default function SubscriptionExpiryReminder() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);
  const [showExpiringBanner, setShowExpiringBanner] = useState(false);

  useEffect(() => {
    checkSubscriptionStatus();
  }, []);

  useEffect(() => {
    // 检查是否已在本次会话中关闭过横幅
    const dismissedExpired = sessionStorage.getItem('dismissedExpiredBanner');
    const dismissedExpiring = sessionStorage.getItem('dismissedExpiringBanner');

    if (dismissedExpired === 'true') {
      setShowExpiredBanner(false);
    }
    if (dismissedExpiring === 'true') {
      setShowExpiringBanner(false);
    }
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const result = await userApi.getSubscription();

      if (result.success && result.subscription) {
        const sub = result.subscription;
        setSubscription(sub);

        const daysRemaining = calculateDaysRemaining(sub.endDate);

        // 已到期 - 显示横幅提醒（非阻塞）
        if (daysRemaining === 0 || sub.status !== 'ACTIVE') {
          const dismissed = sessionStorage.getItem('dismissedExpiredBanner');
          if (dismissed !== 'true') {
            setShowExpiredBanner(true);
          }
        }
        // 即将到期 (7天内) - 显示横幅
        else if (daysRemaining <= 7) {
          const dismissed = sessionStorage.getItem('dismissedExpiringBanner');
          if (dismissed !== 'true') {
            setShowExpiringBanner(true);
          }
        }
      }
    } catch (err) {
      console.error('获取订阅状态失败:', err);
    }
  };

  const calculateDaysRemaining = (endDateString) => {
    if (!endDateString) return 0;

    const now = new Date();
    const endDate = new Date(endDateString);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  };

  const handleRenew = () => {
    navigate('/payment');
  };

  const handleDismissExpiredBanner = () => {
    setShowExpiredBanner(false);
    // 保存到 sessionStorage，本次会话不再显示
    sessionStorage.setItem('dismissedExpiredBanner', 'true');
  };

  const handleDismissExpiringBanner = () => {
    setShowExpiringBanner(false);
    // 保存到 sessionStorage，本次会话不再显示
    sessionStorage.setItem('dismissedExpiringBanner', 'true');
  };

  if (!subscription) return null;

  const daysRemaining = calculateDaysRemaining(subscription.endDate);

  return (
    <>
      {/* 即将到期横幅 (顶部固定) */}
      {showExpiringBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/90 backdrop-blur-sm px-4 py-3 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-600">
                <span className="text-white text-lg">⚠</span>
              </div>
              <div>
                <p className="text-white font-medium">
                  您的订阅即将到期
                </p>
                <p className="text-yellow-100 text-sm">
                  剩余 <strong>{daysRemaining}</strong> 天，建议尽快续费以继续享受服务
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRenew}
                className="px-4 py-2 bg-white text-yellow-600 rounded-lg font-medium hover:bg-yellow-50 transition-colors"
              >
                立即续费
              </button>
              <button
                onClick={handleDismissExpiringBanner}
                className="px-3 py-2 text-white hover:bg-yellow-600/50 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已到期横幅（非阻塞式，可关闭） */}
      {showExpiredBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-500/90 backdrop-blur-sm px-4 py-3 shadow-lg border-b-2 border-red-600">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-600">
                <span className="text-white text-lg">⏰</span>
              </div>
              <div>
                <p className="text-white font-bold">
                  订阅已过期
                </p>
                <p className="text-red-100 text-sm">
                  {subscription?.planType === 'TRIAL' ? '试用期已结束' : '您的订阅已到期'}，续费后即可继续使用完整功能
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRenew}
                className="px-4 py-2 bg-white text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
              >
                立即续费
              </button>
              <button
                onClick={handleDismissExpiredBanner}
                className="px-3 py-2 text-white hover:bg-red-600/50 rounded-lg transition-colors"
                title="暂时关闭（本次会话不再提示）"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
