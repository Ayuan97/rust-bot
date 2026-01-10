import React, { useState, useEffect } from 'react';
import { 
  FaChartLine, FaArrowUp, FaArrowDown, FaHistory, FaFilter, 
  FaFileExport, FaWallet, FaShoppingCart, FaUserShield, FaSync 
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';

const TradeCenter = () => {
  const toast = useToast();
  const [view, setView] = useState('analytics'); // 'analytics' or 'orders'
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [view]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (view === 'analytics') {
        const res = await api.get('/admin/orders/analytics');
        if (res.data.success) setStats(res.data.data);
      } else {
        const res = await api.get('/admin/orders');
        if (res.data.success) setOrders(res.data.data.orders);
      }
    } catch (err) {
      toast.error('获取贸易数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getOrderTypeLabel = (type) => {
    switch (type) {
      case 'TOPUP': return { label: '余额充值', color: 'text-green-400', bg: 'bg-green-500/10' };
      case 'AUTH_BUY': return { label: '蓝图授权', color: 'text-blue-400', bg: 'bg-blue-500/10' };
      case 'SERVICE_FEE': return { label: '增强服务', color: 'text-purple-400', bg: 'bg-purple-500/10' };
      case 'ADMIN_ADJUST': return { label: '管理调整', color: 'text-orange-400', bg: 'bg-orange-500/10' };
      default: return { label: type, color: 'text-gray-400', bg: 'bg-gray-500/10' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex bg-[#121417] p-1 rounded-lg border border-gray-800">
          <button 
            onClick={() => setView('analytics')}
            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${
              view === 'analytics' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            财务分析
          </button>
          <button 
            onClick={() => setView('orders')}
            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${
              view === 'orders' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            订单清单
          </button>
        </div>
        
        <button 
          onClick={fetchData}
          className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400"
        >
          <FaSync className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {view === 'analytics' && stats ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <FaChartLine size={40} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">总贸易流水</p>
              <h3 className="text-2xl font-mono font-bold text-gray-100">¥ {parseFloat(stats.totalRevenue).toLocaleString()}</h3>
              <p className="text-[10px] text-gray-600 mt-2">共计 {stats.totalOrders} 笔订单</p>
            </div>
            
            <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-orange-500">
                <FaWallet size={40} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">幸存者总余额</p>
              <h3 className="text-2xl font-mono font-bold text-orange-500">¥ {parseFloat(stats.systemDebt).toLocaleString()}</h3>
              <p className="text-[10px] text-gray-600 mt-2">系统待销项负载</p>
            </div>

            <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-green-500">
                <FaArrowUp size={40} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">今日新增收入</p>
              <h3 className="text-2xl font-mono font-bold text-green-500">+ ¥ {parseFloat(stats.todayRevenue).toLocaleString()}</h3>
              <p className="text-[10px] text-gray-600 mt-2">较昨日 24h 波动</p>
            </div>

            <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-500">
                <FaUserShield size={40} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">平均客单价</p>
              <h3 className="text-2xl font-mono font-bold text-blue-500">¥ {(stats.totalRevenue / (stats.totalOrders || 1)).toFixed(2)}</h3>
              <p className="text-[10px] text-gray-600 mt-2">基于所有历史蓝图贸易</p>
            </div>
          </div>

          {/* 授权分布 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <FaShoppingCart className="text-orange-500" />
                授权包分布 (Plans Distribution)
              </h4>
              <div className="space-y-4">
                {stats.planDistribution.map(plan => (
                  <div key={plan.planType || 'NONE'} className="space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-gray-400">{plan.planType || '物资充值'}</span>
                      <span className="text-gray-100">{plan._count.id} 笔</span>
                    </div>
                    <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-600 rounded-full" 
                        style={{ width: `${(plan._count.id / stats.totalOrders * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#121417] border border-gray-800 p-6 rounded-lg tactic-cut flex flex-col items-center justify-center text-center">
              <FaHistory className="text-gray-800 text-5xl mb-4" />
              <p className="text-gray-600 text-xs">实时趋势图表模块正在同步中...</p>
              <p className="text-gray-700 text-[10px] mt-2 font-mono uppercase">Syncing_Financial_Data_Stream...</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#121417] border border-gray-800 rounded-lg overflow-hidden tactic-cut animate-in fade-in duration-500">
          <table className="w-full text-left text-sm font-mono">
            <thead className="bg-[#1A1C1F] text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-800">
              <tr>
                <th className="px-6 py-4">贸易编号</th>
                <th className="px-6 py-4">幸存者</th>
                <th className="px-6 py-4">贸易类型</th>
                <th className="px-6 py-4 text-right">变动金额</th>
                <th className="px-6 py-4 text-right">变动后余额</th>
                <th className="px-6 py-4">成交时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {orders.map(order => {
                const typeInfo = getOrderTypeLabel(order.type);
                return (
                  <tr key={order.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-[10px] text-gray-600">{order.id}</td>
                    <td className="px-6 py-4">
                      <span className="text-gray-300">{order.users?.username || 'System'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${typeInfo.bg} ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-bold ${order.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {order.amount >= 0 ? '+' : ''}{parseFloat(order.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">
                      ¥ {order.balanceAfter ? parseFloat(order.balanceAfter).toFixed(2) : '--'}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {orders.length === 0 && !loading && (
            <div className="py-20 text-center">
              <p className="text-gray-600">暂无贸易往来记录信号...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TradeCenter;

