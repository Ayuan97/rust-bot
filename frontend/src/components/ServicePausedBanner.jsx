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
    <div className="fixed top-0 left-0 right-0 z-[100] bg-ink-850 border-b border-hazard/40 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* 图标 */}
          <div className="flex items-center justify-center w-6 h-6 bg-hazard-dim border border-hazard/40 shrink-0">
            <span className="text-hazard-bright font-mono text-sm font-bold">
              {isNotActivated ? '!' : '||'}
            </span>
          </div>

          {/* 文字 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink shrink-0" />
            <span className="tac-label !text-hazard hidden sm:inline">
              {isNotActivated ? 'INACTIVE' : 'SUSPENDED'}
            </span>
            <span className="text-hazard font-bold text-sm truncate">
              {getStatusText()}
            </span>
            <span className="text-fg-dim text-xs hidden sm:inline truncate">
              {getSubText()}
            </span>
          </div>
        </div>

        {/* 按钮 */}
        <button
          onClick={() => navigate('/payment')}
          className="shrink-0 px-4 py-1.5 bg-hazard hover:bg-hazard-bright text-white text-xs font-bold transition-colors"
        >
          {isNotActivated ? '立即订阅' : '立即续费'}
        </button>
      </div>
    </div>
  );
}
