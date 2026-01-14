import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * 服务暂停提醒条
 * 当用户订阅过期时显示，固定在顶部，不可关闭
 */
export default function ServicePausedBanner() {
  const navigate = useNavigate();
  const { isSubscriptionExpired, user } = useAuth();

  // 未登录或订阅未过期时不显示
  if (!user || !isSubscriptionExpired) {
    return null;
  }

  const isTrial = user.subscriptions?.planType === 'TRIAL';

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-[#1a1c20] to-[#252830] border-b border-[#cd5241]/30 px-4 py-2.5 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 图标 */}
          <div className="flex items-center justify-center w-6 h-6 rounded bg-[#cd5241]/20">
            <span className="text-[#cd5241] text-sm">||</span>
          </div>

          {/* 文字 */}
          <div className="flex items-center gap-2">
            <span className="text-[#cd5241] font-bold text-sm">
              {isTrial ? '试用已结束' : '服务已暂停'}
            </span>
            <span className="text-gray-400 text-xs hidden sm:inline">
              · 数据停止更新 · 续费后立即恢复
            </span>
          </div>
        </div>

        {/* 续费按钮 */}
        <button
          onClick={() => navigate('/payment')}
          className="px-4 py-1.5 bg-[#cd5241] hover:bg-[#b04537] text-white text-xs font-bold rounded transition-colors"
        >
          立即续费
        </button>
      </div>
    </div>
  );
}
