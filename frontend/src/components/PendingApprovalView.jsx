import { useEffect } from 'react';
import { FaUserClock, FaUserSlash, FaSignOutAlt, FaSyncAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

/**
 * 账号审核中 / 审核未通过 全屏提示页
 * 待审核用户可登录但功能锁定；审核通过后由 AuthContext 轮询自动解锁。
 */
export default function PendingApprovalView({ status = 'PENDING' }) {
  const { user, logout, refreshUser } = useAuth();
  const isRejected = status === 'REJECTED';

  // 待审核或被拒绝后持续拉取状态，管理员重新通过时无需手动刷新
  useEffect(() => {
    const timer = setInterval(() => { refreshUser(); }, 20000);
    return () => clearInterval(timer);
  }, [refreshUser]);

  return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-md tac-panel tac-corners relative z-10">
        <div className="p-8">
          {/* 图标 */}
          <div className="flex justify-center mb-7">
            <div className="w-16 h-16 border border-hazard/40 bg-hazard-dim flex items-center justify-center">
              {isRejected
                ? <FaUserSlash className="text-2xl text-hazard" />
                : <FaUserClock className="text-2xl text-hazard animate-pulse" />}
            </div>
          </div>

          {/* 标题 */}
          <div className="text-center mb-6">
            <div className="tac-label mb-2">{isRejected ? 'ACCESS DENIED' : 'PENDING REVIEW'}</div>
            <h2 className="text-2xl font-extrabold text-fg tracking-tight">
              {isRejected ? '审核未通过' : '账号审核中'}
            </h2>
            <p className="mt-2 text-sm text-fg-dim leading-relaxed">
              {isRejected
                ? '你的注册申请未通过管理员审核，如有疑问请联系管理员。'
                : '你的账号已提交，正在等待管理员审核。通过后将解除账号限制，服务功能需要有效订阅。'}
            </p>
          </div>

          {/* 操作员信息 */}
          <div className="border border-ink-line mb-6">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-line">
              <span className="tac-label">操作员 // OPERATOR</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-hazard">
                {isRejected ? 'REJECTED' : 'WAITING'}
              </span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-fg truncate">{user?.username}</span>
              <span className="flex items-center gap-2 text-fg-dim">
                <span className={`w-1.5 h-1.5 ${isRejected ? 'bg-hazard' : 'bg-hazard animate-tac-blink'}`} />
                <span className="font-mono text-[11px] uppercase tracking-wider">{isRejected ? '已拒绝' : '审核中'}</span>
              </span>
            </div>
          </div>

          {/* 自动检测提示 */}
          <div className="mb-6 border border-hazard/30 bg-hazard-dim p-4">
            <div className="tac-label !text-hazard mb-1.5 flex items-center gap-2">
              <FaSyncAlt className="text-[10px] animate-spin-slow" /> 自动检测中 // AUTO
            </div>
            <p className="text-[13px] text-fg-dim leading-relaxed">
              本页每 20 秒自动检测一次审核状态，通过后无需刷新即可进入控制台。
            </p>
          </div>

          {/* 退出按钮 */}
          <button onClick={logout} className="tac-btn tac-btn-ghost w-full !py-3.5">
            <FaSignOutAlt className="text-xs" /> 退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
