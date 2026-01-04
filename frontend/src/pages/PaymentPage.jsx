import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentApi } from '../services/auth';

const PLANS = {
  MONTHLY: { name: '月付', price: 29, duration: 30, description: '¥29/月' },
  QUARTERLY: { name: '季付', price: 79, duration: 90, description: '¥79/季 (省¥8)' },
  YEARLY: { name: '年付', price: 299, duration: 365, description: '¥299/年 (省¥49)' },
};

export default function PaymentPage() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState('MONTHLY');
  const [paymentMethod, setPaymentMethod] = useState('ALIPAY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [polling, setPolling] = useState(false);

  // 订单状态轮询
  useEffect(() => {
    if (!order || !polling) return;

    const interval = setInterval(async () => {
      try {
        const result = await paymentApi.queryAlipayOrder(order.id);

        if (result.exists && result.tradeStatus === 'TRADE_SUCCESS') {
          // 支付成功
          clearInterval(interval);
          setPolling(false);
          alert('支付成功！订阅已延长');
          navigate('/dashboard');
        }
      } catch (err) {
        console.error('查询订单状态失败:', err);
      }
    }, 2000); // 每2秒查询一次

    return () => clearInterval(interval);
  }, [order, polling, navigate]);

  const handleCreateOrder = async () => {
    setError('');
    setLoading(true);

    try {
      // 1. 创建订单
      const orderResult = await paymentApi.createOrder(selectedPlan, paymentMethod);

      if (!orderResult.success) {
        setError(orderResult.error || '创建订单失败');
        setLoading(false);
        return;
      }

      setOrder(orderResult.order);

      // 2. 根据支付方式创建支付
      if (paymentMethod === 'ALIPAY') {
        const payResult = await paymentApi.createAlipayQRCode(orderResult.order.id);

        if (payResult.success) {
          setQrCode(payResult.qrCode);
          setPolling(true); // 开始轮询
        } else {
          setError(payResult.error || '生成支付二维码失败');
        }
      }
    } catch (err) {
      console.error('创建订单失败:', err);
      setError(err.response?.data?.error || '创建订单失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;

    try {
      await paymentApi.cancelOrder(order.id);
      setOrder(null);
      setQrCode('');
      setPolling(false);
    } catch (err) {
      console.error('取消订单失败:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">选择订阅套餐</h1>
          <p className="text-gray-400">选择适合您的套餐，立即开始使用</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {!order ? (
          <>
            {/* 套餐选择 */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {Object.entries(PLANS).map(([key, plan]) => (
                <div
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`bg-gray-800 rounded-lg p-6 cursor-pointer transition-all border-2 ${
                    selectedPlan === key
                      ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="text-3xl font-bold text-blue-400 mb-2">
                      ¥{plan.price}
                    </div>
                    <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                    <p className="text-gray-500 text-sm">{plan.duration} 天有效期</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 支付方式选择 */}
            <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">选择支付方式</h3>
              <div className="grid grid-cols-2 gap-4">
                <div
                  onClick={() => setPaymentMethod('ALIPAY')}
                  className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${
                    paymentMethod === 'ALIPAY'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">💳</div>
                    <p className="text-white font-medium">支付宝</p>
                  </div>
                </div>

                <div
                  onClick={() => setPaymentMethod('WECHAT')}
                  className={`p-4 rounded-lg cursor-pointer transition-all border-2 opacity-50 cursor-not-allowed ${
                    paymentMethod === 'WECHAT'
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-gray-700'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">💚</div>
                    <p className="text-white font-medium">微信支付</p>
                    <p className="text-xs text-gray-500 mt-1">暂未开放</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 订单摘要和支付按钮 */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">订单摘要</h3>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-gray-300">
                  <span>套餐:</span>
                  <span className="font-medium text-white">{PLANS[selectedPlan].name}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>有效期:</span>
                  <span className="font-medium text-white">{PLANS[selectedPlan].duration} 天</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>支付方式:</span>
                  <span className="font-medium text-white">
                    {paymentMethod === 'ALIPAY' ? '支付宝' : '微信支付'}
                  </span>
                </div>
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div className="flex justify-between text-xl font-bold">
                    <span className="text-white">总计:</span>
                    <span className="text-blue-400">¥{PLANS[selectedPlan].price}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateOrder}
                disabled={loading || paymentMethod === 'WECHAT'}
                className={`w-full py-3 px-6 rounded-lg font-medium text-white transition-colors ${
                  loading || paymentMethod === 'WECHAT'
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? '生成中...' : '立即支付'}
              </button>
            </div>
          </>
        ) : (
          /* 支付二维码展示 */
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">扫码支付</h2>

            {qrCode ? (
              <>
                <div className="bg-white p-4 rounded-lg inline-block mb-4">
                  <img src={qrCode} alt="支付二维码" className="w-64 h-64" />
                </div>

                <p className="text-gray-300 mb-2">
                  请使用 <span className="text-blue-400 font-medium">支付宝</span> 扫描二维码完成支付
                </p>
                <p className="text-gray-400 text-sm mb-6">
                  订单金额: <span className="text-white font-bold">¥{order.amount}</span>
                </p>

                <div className="flex items-center justify-center space-x-2 mb-6">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <p className="text-gray-400 text-sm">等待支付中...</p>
                </div>

                <button
                  onClick={handleCancelOrder}
                  className="text-gray-400 hover:text-gray-300 underline"
                >
                  取消支付
                </button>
              </>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <p className="text-gray-300">生成支付二维码中...</p>
              </div>
            )}
          </div>
        )}

        {/* 返回按钮 */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-300"
          >
            ← 返回仪表板
          </button>
        </div>
      </div>
    </div>
  );
}
