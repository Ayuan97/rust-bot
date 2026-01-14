import React, { useState, useEffect } from 'react';
import {
  FaChartLine, FaArrowUp, FaArrowDown, FaHistory, FaFilter,
  FaFileExport, FaWallet, FaShoppingCart, FaUserShield, FaSync,
  FaSearch, FaChevronLeft, FaChevronRight, FaTimes, FaCalendarAlt
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';

const TradeCenter = () => {
  const toast = useToast();
  const [view, setView] = useState('analytics');
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // 分页
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);

  // 筛选
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    if (view === 'analytics') {
      fetchAnalytics();
    }
  }, [view]);

  useEffect(() => {
    if (view === 'orders') {
      fetchOrders();
    }
  }, [view, page, statusFilter, typeFilter]);

  // 搜索防抖
  useEffect(() => {
    if (view !== 'orders') return;
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchOrders();
      } else {
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/orders/analytics');
      if (res.data.success) setStats(res.data.data);
    } catch (err) {
      toast.error('获取财务数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/orders', {
        params: {
          page,
          limit,
          search: searchTerm,
          status: statusFilter,
          type: typeFilter,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      if (res.data.success) {
        setOrders(res.data.data.orders);
        setTotal(res.data.data.total);
      }
    } catch (err) {
      toast.error('获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出订单为 CSV
  const handleExportCSV = () => {
    if (orders.length === 0) {
      toast.info('没有可导出的订单');
      return;
    }

    const headers = ['订单号', '用户', '类型', '金额', '状态', '创建时间', '支付时间'];
    const rows = orders.map(order => [
      order.id,
      order.users?.username || 'System',
      getOrderTypeLabel(order.type).label,
      order.amount,
      getStatusLabel(order.status).label,
      new Date(order.createdAt).toLocaleString(),
      order.paidAt ? new Date(order.paidAt).toLocaleString() : '-'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('订单已导出');
  };

  // 清除筛选
  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setTypeFilter('');
    setDateRange({ start: '', end: '' });
    setPage(1);
  };

  const getOrderTypeLabel = (type) => {
    switch (type) {
      case 'TOPUP': return { label: '余额充值', color: 'text-green-400', bg: 'bg-green-500/10' };
      case 'AUTH_BUY': return { label: '蓝图授权', color: 'text-blue-400', bg: 'bg-blue-500/10' };
      case 'SERVICE_FEE': return { label: '增强服务', color: 'text-purple-400', bg: 'bg-purple-500/10' };
      case 'ADMIN_ADJUST': return { label: '管理调整', color: 'text-orange-400', bg: 'bg-orange-500/10' };
      default: return { label: type || '未知', color: 'text-gray-400', bg: 'bg-gray-500/10' };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'PENDING': return { label: '待支付', color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
      case 'PAID': return { label: '已支付', color: 'text-green-400', bg: 'bg-green-500/10' };
      case 'FAILED': return { label: '失败', color: 'text-red-400', bg: 'bg-red-500/10' };
      case 'CANCELLED': return { label: '已取消', color: 'text-gray-400', bg: 'bg-gray-500/10' };
      case 'EXPIRED': return { label: '已过期', color: 'text-orange-400', bg: 'bg-orange-500/10' };
      default: return { label: status || '未知', color: 'text-gray-400', bg: 'bg-gray-500/10' };
    }
  };

  const totalPages = Math.ceil(total / limit);
  const hasFilters = searchTerm || statusFilter || typeFilter || dateRange.start || dateRange.end;

  return (
    <div className="space-y-4">
      {/* 标题和视图切换 */}
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

        <div className="flex gap-2">
          {view === 'orders' && (
            <button
              onClick={handleExportCSV}
              disabled={orders.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-xs disabled:opacity-50"
            >
              <FaFileExport />
              导出 CSV
            </button>
          )}
          <button
            onClick={view === 'analytics' ? fetchAnalytics : fetchOrders}
            disabled={loading}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {view === 'analytics' && stats ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#121417] border border-gray-800 p-5 rounded-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <FaChartLine size={36} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">总贸易流水</p>
              <h3 className="text-2xl font-mono font-bold text-gray-100">¥ {parseFloat(stats.totalRevenue || 0).toLocaleString()}</h3>
              <p className="text-[10px] text-gray-600 mt-2">共计 {stats.totalOrders || 0} 笔订单</p>
            </div>

            <div className="bg-[#121417] border border-gray-800 p-5 rounded-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-orange-500">
                <FaWallet size={36} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">幸存者总余额</p>
              <h3 className="text-2xl font-mono font-bold text-orange-500">¥ {parseFloat(stats.systemDebt || 0).toLocaleString()}</h3>
              <p className="text-[10px] text-gray-600 mt-2">系统待销项负载</p>
            </div>

            <div className="bg-[#121417] border border-gray-800 p-5 rounded-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-green-500">
                <FaArrowUp size={36} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">今日新增收入</p>
              <h3 className="text-2xl font-mono font-bold text-green-500">+ ¥ {parseFloat(stats.todayRevenue || 0).toLocaleString()}</h3>
              <p className="text-[10px] text-gray-600 mt-2">{stats.todayOrders || 0} 笔今日订单</p>
            </div>

            <div className="bg-[#121417] border border-gray-800 p-5 rounded-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-500">
                <FaUserShield size={36} />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">平均客单价</p>
              <h3 className="text-2xl font-mono font-bold text-blue-500">¥ {(stats.totalRevenue / (stats.totalOrders || 1)).toFixed(2)}</h3>
              <p className="text-[10px] text-gray-600 mt-2">基于所有历史订单</p>
            </div>
          </div>

          {/* 授权分布 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#121417] border border-gray-800 p-5 rounded-lg">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                <FaShoppingCart className="text-orange-500" />
                授权包分布
              </h4>
              <div className="space-y-4">
                {stats.planDistribution && stats.planDistribution.length > 0 ? (
                  stats.planDistribution.map(plan => (
                    <div key={plan.planType || 'NONE'} className="space-y-2">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-gray-400">{plan.planType || '物资充值'}</span>
                        <span className="text-gray-100">{plan._count?.id || 0} 笔</span>
                      </div>
                      <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((plan._count?.id || 0) / (stats.totalOrders || 1) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600 text-sm text-center py-4">暂无数据</p>
                )}
              </div>
            </div>

            {/* 订单状态分布 */}
            <div className="bg-[#121417] border border-gray-800 p-5 rounded-lg">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                <FaHistory className="text-blue-500" />
                订单状态分布
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-400">{stats.paidOrders || 0}</p>
                  <p className="text-[10px] text-gray-600 uppercase">已支付</p>
                </div>
                <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-400">{stats.pendingOrders || 0}</p>
                  <p className="text-[10px] text-gray-600 uppercase">待支付</p>
                </div>
                <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-400">{stats.failedOrders || 0}</p>
                  <p className="text-[10px] text-gray-600 uppercase">失败</p>
                </div>
                <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-gray-400">{stats.cancelledOrders || 0}</p>
                  <p className="text-[10px] text-gray-600 uppercase">已取消</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : view === 'orders' ? (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* 筛选栏 */}
          <div className="flex flex-wrap gap-3 bg-[#121417] border border-gray-800 rounded-lg p-4">
            {/* 搜索 */}
            <div className="relative flex-1 min-w-[180px]">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
              <input
                type="text"
                placeholder="搜索订单号/用户名..."
                className="w-full bg-[#0D0E10] border border-gray-800 rounded px-9 py-2 text-sm focus:border-orange-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none cursor-pointer"
            >
              <option value="">全部状态</option>
              <option value="PENDING">待支付</option>
              <option value="PAID">已支付</option>
              <option value="FAILED">失败</option>
              <option value="CANCELLED">已取消</option>
              <option value="EXPIRED">已过期</option>
            </select>

            {/* 类型筛选 */}
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none cursor-pointer"
            >
              <option value="">全部类型</option>
              <option value="TOPUP">余额充值</option>
              <option value="AUTH_BUY">蓝图授权</option>
              <option value="SERVICE_FEE">增强服务</option>
              <option value="ADMIN_ADJUST">管理调整</option>
            </select>

            {/* 日期范围 */}
            <div className="flex items-center gap-2">
              <FaCalendarAlt className="text-gray-500 text-xs" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setPage(1); }}
                className="bg-[#0D0E10] border border-gray-800 rounded px-2 py-2 text-xs focus:border-orange-500 outline-none"
              />
              <span className="text-gray-600">-</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setPage(1); }}
                className="bg-[#0D0E10] border border-gray-800 rounded px-2 py-2 text-xs focus:border-orange-500 outline-none"
              />
            </div>

            {/* 清除筛选 */}
            {hasFilters && (
              <button
                onClick={handleClearFilters}
                className="p-2 bg-gray-800 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                title="清除筛选"
              >
                <FaTimes className="text-xs" />
              </button>
            )}
          </div>

          {/* 订单表格 */}
          <div className="bg-[#121417] border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1A1C1F] text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-800">
                <tr>
                  <th className="px-4 py-3">订单号</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3 text-right">金额</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">创建时间</th>
                  <th className="px-4 py-3">支付时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <FaSync className="animate-spin inline mr-2" />
                      加载中...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-600">
                      暂无订单数据
                    </td>
                  </tr>
                ) : orders.map(order => {
                  const typeInfo = getOrderTypeLabel(order.type);
                  const statusInfo = getStatusLabel(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-gray-500 font-mono">{order.id.substring(0, 12)}...</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-300">{order.users?.username || 'System'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${typeInfo.bg} ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${
                        parseFloat(order.amount) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {parseFloat(order.amount) >= 0 ? '+' : ''}{parseFloat(order.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusInfo.bg} ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {order.paidAt ? new Date(order.paidAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between bg-[#1A1C1F]">
                <span className="text-xs text-gray-500">
                  共 {total} 条，第 {page}/{totalPages} 页
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FaChevronLeft className="text-xs" />
                  </button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1 rounded text-xs ${
                          page === pageNum
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-800 hover:bg-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FaChevronRight className="text-xs" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-gray-600">
          <FaSync className="animate-spin mr-2" />
          加载中...
        </div>
      )}
    </div>
  );
};

export default TradeCenter;
