import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentApi } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { FaTerminal, FaShieldAlt, FaBoxOpen, FaQrcode, FaCheckCircle, FaArrowLeft, FaSatellite, FaSignOutAlt } from 'react-icons/fa';

const PLANS = {
  MONTHLY: { name: '月度特权', price: 29, duration: 30, description: '基础远程监控', level: '基础版' },
  QUARTERLY: { name: '季度特权', price: 79, duration: 90, description: '进阶报警提醒 (省¥8)', level: '专业版' },
  YEARLY: { name: '年度尊享', price: 299, duration: 365, description: '全能基地管家 (省¥49)', level: '至尊版' },
};

// 支付总开关：支付渠道接入前置为 false，前端禁用下单并提示"暂未开通"；接通后改回 true 即可。
const PAYMENT_ENABLED = false;

export default function PaymentPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('MONTHLY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!order || !polling) return;
    const interval = setInterval(async () => {
      try {
        const result = await paymentApi.queryAlipayOrder(order.id);
        if (result.exists && result.tradeStatus === 'TRADE_SUCCESS') {
          clearInterval(interval);
          setPolling(false);
          navigate('/dashboard');
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [order, polling, navigate]);

  const handleCreateOrder = async () => {
    setError('');
    if (!PAYMENT_ENABLED) {
      setError('支付功能正在接入中，暂未开通，敬请期待～');
      return;
    }
    setLoading(true);
    try {
      const orderResult = await paymentApi.createOrder(selectedPlan, 'ALIPAY');
      if (!orderResult.success) throw new Error(orderResult.error);
      setOrder(orderResult.order);
      const payResult = await paymentApi.createAlipayQRCode(orderResult.order.id);
      if (payResult.success) {
        setQrCode(payResult.qrCode);
        setPolling(true);
      } else throw new Error(payResult.error);
    } catch (err) {
      setError(err.message || '初始化支付链路失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tac-fx min-h-[100dvh] bg-ink-900 text-fg font-sans flex flex-col">
      {/* 顶部 status bar */}
      <header className="flex items-center justify-between gap-4 px-6 md:px-10 h-14 border-b border-ink-line shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 border border-ink-line flex items-center justify-center text-fg-dim hover:text-fg hover:border-fg-dim transition-colors shrink-0"
            aria-label="返回控制台"
          >
            <FaArrowLeft className="text-xs" />
          </button>
          <div className="tac-label flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" /> SECURE LINK // ALIPAY
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-5 tac-label">
            <span className="flex items-center gap-1.5"><FaShieldAlt className="text-hazard text-[10px]" /> ENCRYPTED</span>
            <span>CHANNEL // 0x2F</span>
          </div>
          <button
            onClick={logout}
            className="w-9 h-9 border border-ink-line flex items-center justify-center text-fg-mute hover:text-hazard hover:border-hazard/50 transition-colors"
            title="退出登录"
            aria-label="退出登录"
          >
            <FaSignOutAlt className="text-xs" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-6 md:px-10 py-10">
        {/* 标题 */}
        <div className="mb-8">
          <div className="tac-label flex items-center gap-2 mb-2">
            <FaTerminal className="text-hazard" /> 订阅续费 // SUBSCRIPTION
          </div>
          <h1 className="text-3xl font-extrabold text-fg tracking-tight">开通实时报警与远程控制</h1>
          <p className="mt-2 text-sm text-fg-dim">选择订阅档位，扫码完成支付后即刻拉起服务实例。</p>
        </div>

        {!PAYMENT_ENABLED && (
          <div className="mb-8 px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
            <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[!]</span>
            <span>支付渠道正在接入中，<span className="font-bold text-hazard">暂未开通</span>。如需开通服务请联系管理员，上线后会第一时间通知。</span>
          </div>
        )}

        {error && (
          <div className="mb-8 px-4 py-3 bg-hazard-dim border border-hazard/40 text-fg text-sm flex items-start gap-2.5">
            <span className="font-mono text-hazard-bright text-xs mt-0.5 shrink-0">[ERR]</span>
            <span>{error}</span>
          </div>
        )}

        {!order ? (
          <div className="space-y-8">
            {/* 选择套餐 */}
            <section>
              <div className="tac-label mb-4">选择套餐 // PLAN</div>
              <div className="grid md:grid-cols-3 gap-px bg-ink-line border border-ink-line">
                {Object.entries(PLANS).map(([key, plan]) => {
                  const active = selectedPlan === key;
                  const recommended = key === 'YEARLY';
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedPlan(key)}
                      className={`relative p-6 cursor-pointer transition-colors flex flex-col ${
                        active
                          ? 'bg-hazard-dim border border-hazard/50'
                          : recommended
                            ? 'bg-ink-850 border border-ink-line hover:border-hazard/40'
                            : 'bg-ink-850 border border-ink-line hover:border-fg-dim/40'
                      }`}
                    >
                      {recommended && (
                        <div className="absolute top-0 right-0 px-2 py-1 bg-hazard text-white font-mono text-[10px] uppercase tracking-[0.16em]">
                          推荐 // BEST
                        </div>
                      )}
                      {active && (
                        <div className="absolute top-3 left-3 text-hazard">
                          <FaCheckCircle className="text-sm" />
                        </div>
                      )}

                      <div className={`w-11 h-11 flex items-center justify-center mb-5 border transition-colors ${active ? 'bg-hazard text-white border-hazard' : 'bg-ink-800 text-fg-mute border-ink-line'}`}>
                        <FaBoxOpen className="text-lg" />
                      </div>

                      <div className="tac-label mb-1">{plan.level}</div>
                      <h3 className={`text-lg font-bold mb-1 ${active ? 'text-fg' : 'text-fg-dim'}`}>{plan.name}</h3>
                      <p className="text-xs text-fg-mute mb-6">{plan.description}</p>

                      <div className="mt-auto">
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-hazard text-sm">¥</span>
                          <span className="font-mono tabular-nums text-4xl font-extrabold text-hazard leading-none">{plan.price}</span>
                        </div>
                        <div className="tac-label mt-4 pt-4 border-t border-ink-line flex items-center gap-1.5">
                          时长 <span className="font-mono tabular-nums text-fg-dim">{plan.duration}</span> 天
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 支付方式 + 下单 */}
            <section className="grid lg:grid-cols-3 gap-px bg-ink-line border border-ink-line">
              {/* 支付方式 */}
              <div className="lg:col-span-2 bg-ink-850 p-6">
                <div className="tac-label mb-4">支付方式 // PAYMENT</div>
                <div className="flex items-center justify-between border border-hazard/50 bg-hazard-dim px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 bg-ink-800 border border-ink-line flex items-center justify-center text-hazard shrink-0">
                      <FaQrcode className="text-sm" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-fg">支付宝</div>
                      <div className="tac-label">ALIPAY · QR SCAN</div>
                    </div>
                  </div>
                  <FaCheckCircle className="text-hazard text-sm" />
                </div>
                <p className="mt-4 text-xs text-fg-mute leading-relaxed">
                  下单后将生成支付宝收款二维码，使用支付宝 App 扫码即可完成支付，系统自动轮询交易状态并放行服务。
                </p>
              </div>

              {/* 当前选择 + 确认 */}
              <div className="bg-ink-850 p-6 flex flex-col">
                <div className="tac-label mb-2">当前选择 // SELECTED</div>
                <div className="text-2xl font-extrabold text-hazard mb-1">{PLANS[selectedPlan].level}</div>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="font-mono tabular-nums text-fg text-lg font-bold">¥{PLANS[selectedPlan].price}</span>
                  <span className="tac-label">/ {PLANS[selectedPlan].duration} 天</span>
                </div>
                <button
                  onClick={handleCreateOrder}
                  disabled={loading || !PAYMENT_ENABLED}
                  className="tac-btn tac-btn-primary w-full mt-auto !py-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!PAYMENT_ENABLED ? '支付暂未开通 // SOON' : loading ? '生成订单 // CREATING...' : (
                    <>
                      <FaQrcode className="group-hover:scale-110 transition-transform" />
                      确认支付 // PAY
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        ) : (
          /* 支付终端界面 */
          <div className="max-w-xl mx-auto">
            <div className="tac-panel tac-corners p-8 md:p-10 text-center">
              <div className="tac-label flex items-center justify-center gap-2 mb-2">
                <FaQrcode className="text-hazard" /> 安全支付终端 // PAY TERMINAL
              </div>
              <h2 className="text-2xl font-extrabold text-fg tracking-tight mb-1">请使用支付宝扫码</h2>
              <p className="text-sm text-fg-dim mb-8">扫码完成支付后将自动跳转控制台</p>

              {/* 二维码框：直角发丝线 */}
              <div className="relative inline-block mb-8 p-4 border border-ink-line bg-ink-900">
                {qrCode ? (
                  <div className="relative">
                    <div className="absolute inset-0 border border-hazard/40 animate-tac-blink pointer-events-none" />
                    <img src={qrCode} alt="支付宝支付二维码" className="w-60 h-60 bg-white p-2 object-contain" />
                  </div>
                ) : (
                  <div className="w-60 h-60 flex flex-col items-center justify-center text-fg-mute gap-5">
                    <FaSatellite className="text-4xl animate-spin" />
                    <div className="tac-label">SYNCING...</div>
                  </div>
                )}
              </div>

              {/* 状态：待支付 = hazard */}
              <div className="space-y-3 mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-hazard/30 bg-hazard-dim text-hazard">
                  <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em]">AWAITING PAYMENT · 等待支付</span>
                </div>
                <div className="tac-label flex items-center justify-center gap-1.5">
                  ORDER <span className="font-mono tabular-nums text-fg-dim normal-case tracking-normal">{order.id}</span>
                </div>
              </div>

              <button
                onClick={() => { setOrder(null); setQrCode(''); setPolling(false); }}
                className="tac-btn tac-btn-ghost"
              >
                <FaArrowLeft className="text-[10px]" /> 取消并返回 // BACK
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="px-6 md:px-10 py-6 border-t border-ink-line shrink-0 flex items-center justify-between">
        <span className="tac-label">SECURE_LINK_V2.0 · SSL ENCRYPTED</span>
        <span className="tac-label hidden md:inline">RUST+ TACTICAL OPS</span>
      </footer>
    </div>
  );
}
