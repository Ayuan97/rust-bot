import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * 服务暂停提醒条
 * 当用户订阅过期或未激活时显示，固定在顶部，不可关闭
 */
export default function ServicePausedBanner() {
  const navigate = useNavigate();
  const { isSubscriptionExpired, user } = useAuth();

  // 未登录或订阅未过期时不显示
  if (!user || !isSubscriptionExpired) {
    return null;
  }

  const subscription = user.subscriptions;
  const isTrial = subscription?.planType === 'TRIAL';

  // 判断是否为未激活状态（startDate 和 endDate 几乎相同，说明从未激活过）
  const startDate = subscription?.startDate ? new Date(subscription.startDate) : null;
  const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
  const isNotActivated = startDate && endDate &&
    Math.abs(endDate.getTime() - startDate.getTime()) < 60000; // 1分钟内视为未激活

  // 根据状态显示不同内容
  const getStatusText = () => {
    if (isNotActivated) return '未激活';
    if (isTrial) return '试用已结束';
    return '服务已暂停';
  };

  const getSubText = () => {
    if (isNotActivated) return '· 订阅后即可使用全部功能';
    return '· 数据停止更新 · 续费后立即恢复';
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-[#1a1c20] to-[#252830] border-b border-[#cd5241]/30 px-4 py-2.5 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 图标 */}
          <div className="flex items-center justify-center w-6 h-6 rounded bg-[#cd5241]/20">
            <span className="text-[#cd5241] text-sm">
              {isNotActivated ? '!' : '||'}
            </span>
          </div>

          {/* 文字 */}
          <div className="flex items-center gap-2">
            <span className="text-[#cd5241] font-bold text-sm">
              {getStatusText()}
            </span>
            <span className="text-gray-400 text-xs hidden sm:inline">
              {getSubText()}
            </span>
          </div>
        </div>

        {/* 按钮 */}
        <button
          onClick={() => navigate('/payment')}
          className="px-4 py-1.5 bg-[#cd5241] hover:bg-[#b04537] text-white text-xs font-bold rounded transition-colors"
        >
          {isNotActivated ? '立即订阅' : '立即续费'}
        </button>
      </div>
    </div>
  );
}
