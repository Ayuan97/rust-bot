import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentApi } from '../services/auth';
import { FaTerminal, FaShieldAlt, FaBoxOpen, FaQrcode, FaCheckCircle, FaArrowLeft, FaSatellite } from 'react-icons/fa';

const PLANS = {
  MONTHLY: { name: '月度特权', price: 29, duration: 30, description: '基础远程监控', level: '基础版' },
  QUARTERLY: { name: '季度特权', price: 79, duration: 90, description: '进阶报警提醒 (省¥8)', level: '专业版' },
  YEARLY: { name: '年度尊享', price: 299, duration: 365, description: '全能基地管家 (省¥49)', level: '至尊版' },
};

export default function PaymentPage() {
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-[#0d0e10] text-[#e0e0e0] font-sans p-6 relative overflow-hidden flex flex-col items-center">
      <div className="scanline"></div>
      
      {/* 头部状态 */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-12 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="w-10 h-10 tactic-cut border border-white/10 flex items-center justify-center hover:bg-[#cd5241] transition-all">
            <FaArrowLeft className="text-xs" />
          </button>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest glow-text italic">开通高级订阅</h1>
            <p className="text-[10px] text-gray-600 uppercase tracking-[0.4em] font-bold">获取 24/7 基地报警与远程控制权限</p>
          </div>
        </div>
        <div className="hidden md:flex gap-6 text-[10px] font-bold text-gray-500 uppercase">
          <span>安全连接: 已加密</span>
          <span>节点: HK-PAY-01</span>
        </div>
      </header>

      <main className="w-full max-w-5xl">
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-black uppercase tracking-widest tactic-cut animate-pulse text-center">
            {">"} {error}
          </div>
        )}

        {!order ? (
          <div className="space-y-12">
            {/* 订阅方案选择 */}
            <div className="grid md:grid-cols-3 gap-6">
              {Object.entries(PLANS).map(([key, plan]) => (
                <div 
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`relative tactic-border tactic-cut p-1 group cursor-pointer transition-all ${selectedPlan === key ? 'bg-[#cd5241]/10 border-[#cd5241]/50 shadow-2xl shadow-[#cd5241]/10' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                >
                  <div className="bg-black/40 p-8 text-center h-full flex flex-col items-center">
                    <div className={`w-14 h-14 tactic-cut flex items-center justify-center mb-6 transition-all ${selectedPlan === key ? 'bg-[#cd5241] text-white shadow-[0_0_20px_#cd5241]' : 'bg-gray-800 text-gray-600'}`}>
                      <FaBoxOpen className="text-2xl" />
                    </div>
                    <h3 className={`text-xl font-black uppercase tracking-tighter mb-2 ${selectedPlan === key ? 'text-white' : 'text-gray-400'}`}>{plan.name}</h3>
                    <p className="text-xs text-gray-500 mb-8 font-bold">{plan.description}</p>
                    
                    <div className="mt-auto">
                      <div className="text-4xl font-black italic mb-2">¥{plan.price}</div>
                      <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest border-t border-white/5 pt-4 mt-4">
                        订阅时长: {plan.duration} 天
                      </div>
                    </div>

                    {selectedPlan === key && (
                      <div className="absolute top-3 right-3 text-[#cd5241]">
                        <FaCheckCircle className="text-sm" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 确认操作 */}
            <div className="tactic-border tactic-cut p-1 bg-black/40 max-w-2xl mx-auto shadow-2xl">
               <div className="bg-black/40 p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div>
                    <div className="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-widest">当前选择的级别</div>
                    <div className="text-2xl font-black text-[#cd5241] uppercase tracking-tighter">{PLANS[selectedPlan].level} 远程权限</div>
                  </div>
                  <button 
                    onClick={handleCreateOrder}
                    disabled={loading}
                    className="w-full md:w-auto px-16 py-5 tactic-cut bg-[#cd5241] hover:bg-[#b04537] text-white font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-4 shadow-xl shadow-[#cd5241]/20 group"
                  >
                    {loading ? '正在获取支付信息...' : (
                      <>
                        <FaQrcode className="group-hover:scale-110 transition-transform" />
                        立即扫码开通
                      </>
                    )}
                  </button>
               </div>
            </div>
          </div>
        ) : (
          /* 支付终端界面 */
          <div className="max-w-2xl mx-auto animate-scale-in">
            <div className="tactic-border tactic-cut p-1 bg-[#121417] shadow-3xl">
              <div className="bg-[#121417] p-12 text-center relative overflow-hidden">
                <div className="scanline"></div>
                <h2 className="text-2xl font-black uppercase tracking-widest mb-2 glow-text italic">安全支付终端</h2>
                <p className="text-[10px] text-gray-600 uppercase tracking-[0.4em] mb-12">正在通过支付宝加密链路建立交易...</p>

                <div className="relative inline-block mb-12 p-6 tactic-border tactic-cut bg-white/[0.03] shadow-inner">
                  {qrCode ? (
                    <div className="relative group">
                      <div className="absolute inset-0 border-2 border-[#cd5241]/20 animate-pulse pointer-events-none"></div>
                      <img src={qrCode} alt="支付宝支付二维码" className="w-64 h-64 mix-blend-screen opacity-90" style={{ filter: 'contrast(1.1) brightness(1.1)' }} />
                    </div>
                  ) : (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-gray-700">
                      <FaSatellite className="text-5xl animate-spin mb-6" />
                      <div className="text-[10px] font-black uppercase tracking-widest">同步中...</div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 mb-12">
                  <div className="text-[#a3e635] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-[#a3e635]"></span>
                    正在等待支付结果
                  </div>
                  <div className="text-gray-600 font-mono text-[10px]">
                    订单编号: {order.id}
                  </div>
                </div>

                <button 
                  onClick={() => { setOrder(null); setQrCode(''); setPolling(false); }}
                  className="text-xs text-gray-600 hover:text-[#cd5241] uppercase tracking-widest underline underline-offset-8 transition-colors font-bold"
                >
                  取消并返回选择
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto py-12 opacity-30 text-[9px] uppercase tracking-[0.5em] text-gray-600 font-bold">
        Secure_Link_v2.0 // 已建立 SSL 加密保护交易
      </footer>
    </div>
  );
}
