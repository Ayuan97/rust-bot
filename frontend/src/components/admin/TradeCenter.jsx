import React, { useState, useEffect } from 'react';
import {
  FaChartLine, FaArrowUp, FaHistory,
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
  }, [view, page, statusFilter, typeFilter, dateRange.start, dateRange.end]);

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

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
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

  // 类型色收敛：充值=terminal 单点正向，其余一律中性 fg-dim（唯一强调色留给 hazard）
  const getOrderTypeLabel = (type) => {
    switch (type) {
      case 'TOPUP': return { label: '余额充值', color: 'text-terminal', bg: 'bg-ink-800 border-terminal/30' };
      case 'AUTH_BUY': return { label: '蓝图授权', color: 'text-fg-dim', bg: 'bg-ink-800 border-ink-line' };
      case 'SERVICE_FEE': return { label: '增强服务', color: 'text-fg-dim', bg: 'bg-ink-800 border-ink-line' };
      case 'ADMIN_ADJUST': return { label: '管理调整', color: 'text-fg-dim', bg: 'bg-ink-800 border-ink-line' };
      default: return { label: type || '未知', color: 'text-fg-dim', bg: 'bg-ink-800 border-ink-line' };
    }
  };

  // 状态色收敛：已支付=terminal 单点；待支付/失败/过期=hazard；已取消=中性 fg-dim
  const getStatusLabel = (status) => {
    switch (status) {
      case 'PENDING': return { label: '待支付', color: 'text-hazard', bg: 'bg-hazard-dim border-hazard/30', dot: 'bg-hazard' };
      case 'PAID': return { label: '已支付', color: 'text-terminal', bg: 'border-terminal/30', dot: 'bg-terminal' };
      case 'FAILED': return { label: '失败', color: 'text-hazard', bg: 'bg-hazard-dim border-hazard/30', dot: 'bg-hazard' };
      case 'CANCELLED': return { label: '已取消', color: 'text-fg-dim', bg: 'border-ink-line', dot: 'bg-fg-mute' };
      case 'EXPIRED': return { label: '已过期', color: 'text-hazard', bg: 'bg-hazard-dim border-hazard/30', dot: 'bg-hazard' };
      default: return { label: status || '未知', color: 'text-fg-dim', bg: 'border-ink-line', dot: 'bg-fg-mute' };
    }
  };

  const totalPages = Math.ceil(total / limit);
  const hasFilters = Boolean(searchTerm || statusFilter || typeFilter || dateRange.start || dateRange.end);

  return (
    <div className="space-y-5">
      {/* 标题和视图切换 */}
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
        <div className="min-w-0">
          <div className="tac-label flex items-center gap-2">
            <FaChartLine className="text-hazard" /> 交易运营 // TRADE
          </div>
          <h3 className="text-lg font-bold text-fg mt-1">流水与订单</h3>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex border border-ink-line bg-ink-900 w-full md:w-auto">
            <button
              onClick={() => setView('analytics')}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2 font-mono text-[11px] uppercase tracking-[0.16em] font-bold transition-colors ${
                view === 'analytics' ? 'bg-hazard text-white' : 'text-fg-dim hover:text-fg'
              }`}
            >
              财务分析
            </button>
            <button
              onClick={() => setView('orders')}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2 font-mono text-[11px] uppercase tracking-[0.16em] font-bold transition-colors ${
                view === 'orders' ? 'bg-hazard text-white' : 'text-fg-dim hover:text-fg'
              }`}
            >
              订单清单
            </button>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2">
            {view === 'orders' && (
              <span className="text-xs text-fg-dim font-mono tabular-nums">
                共 {total} 条 · 第 {page} / {Math.max(totalPages, 1)} 页
              </span>
            )}
            {view === 'orders' && (
              <button
                onClick={handleExportCSV}
                disabled={orders.length === 0}
                className="tac-btn tac-btn-ghost !px-3 !py-2"
              >
                <FaFileExport />
                导出 CSV
              </button>
            )}
            <button
              onClick={view === 'analytics' ? fetchAnalytics : fetchOrders}
              disabled={loading}
              className="tac-btn tac-btn-ghost !px-3 !py-2"
            >
              <FaSync className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {view === 'analytics' && stats ? (
        <div className="space-y-5">
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
            <div className="bg-ink-850 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-fg-mute opacity-20">
                <FaChartLine size={36} />
              </div>
              <p className="tac-label !text-[10px]">TOTAL FLOW</p>
              <p className="text-[11px] text-fg-dim font-medium mt-1">总贸易流水</p>
              <h3 className="text-2xl font-mono font-bold text-fg tabular-nums mt-2">¥ {parseFloat(stats.totalRevenue || 0).toLocaleString()}</h3>
              <p className="text-[10px] text-fg-mute mt-2 font-mono tabular-nums">共计 {stats.totalOrders || 0} 笔订单</p>
            </div>

            <div className="bg-ink-850 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-hazard opacity-20">
                <FaWallet size={36} />
              </div>
              <p className="tac-label !text-[10px] !text-hazard/80">SYSTEM DEBT</p>
              <p className="text-[11px] text-fg-dim font-medium mt-1">幸存者总余额</p>
              <h3 className="text-2xl font-mono font-bold text-hazard tabular-nums mt-2">¥ {parseFloat(stats.systemDebt || 0).toLocaleString()}</h3>
              <p className="text-[10px] text-fg-mute mt-2">系统待销项负载</p>
            </div>

            <div className="bg-ink-850 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-terminal opacity-20">
                <FaArrowUp size={36} />
              </div>
              <p className="tac-label !text-[10px]">TODAY IN</p>
              <p className="text-[11px] text-fg-dim font-medium mt-1">今日新增收入</p>
              <h3 className="text-2xl font-mono font-bold text-terminal tabular-nums mt-2">+ ¥ {parseFloat(stats.todayRevenue || 0).toLocaleString()}</h3>
              <p className="text-[10px] text-fg-mute mt-2 font-mono tabular-nums">{stats.todayOrders || 0} 笔今日订单</p>
            </div>

            <div className="bg-ink-850 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-fg-mute opacity-20">
                <FaUserShield size={36} />
              </div>
              <p className="tac-label !text-[10px]">AVG TICKET</p>
              <p className="text-[11px] text-fg-dim font-medium mt-1">平均客单价</p>
              <h3 className="text-2xl font-mono font-bold text-fg tabular-nums mt-2">¥ {(stats.totalRevenue / (stats.totalOrders || 1)).toFixed(2)}</h3>
              <p className="text-[10px] text-fg-mute mt-2">基于所有历史订单</p>
            </div>
          </div>

          {/* 授权分布 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-ink-line border border-ink-line">
            <div className="bg-ink-850 p-5">
              <h4 className="tac-label flex items-center gap-2">
                <FaShoppingCart className="text-hazard" />
                授权包分布 // PLANS
              </h4>
              <div className="space-y-4 mt-5">
                {stats.planDistribution && stats.planDistribution.length > 0 ? (
                  stats.planDistribution.map(plan => (
                    <div key={plan.planType || 'NONE'} className="space-y-2">
                      <div className="flex justify-between text-xs font-mono tabular-nums">
                        <span className="text-fg-dim">{plan.planType || '物资充值'}</span>
                        <span className="text-fg">{plan._count?.id || 0} 笔</span>
                      </div>
                      <div className="h-1.5 bg-ink-700 overflow-hidden">
                        <div
                          className="h-full bg-hazard transition-all duration-500"
                          style={{ width: `${Math.min((plan._count?.id || 0) / (stats.totalOrders || 1) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-fg-mute text-sm text-center py-4">暂无数据</p>
                )}
              </div>
            </div>

            {/* 订单状态分布 */}
            <div className="bg-ink-850 p-5">
              <h4 className="tac-label flex items-center gap-2">
                <FaHistory className="text-hazard" />
                订单状态分布 // STATUS
              </h4>
              <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line mt-5">
                <div className="bg-ink-900 p-4 text-center">
                  <p className="text-2xl font-bold font-mono tabular-nums text-terminal">{stats.paidOrders || 0}</p>
                  <p className="text-[11px] text-fg-dim mt-1">已支付</p>
                </div>
                <div className="bg-ink-900 p-4 text-center">
                  <p className="text-2xl font-bold font-mono tabular-nums text-hazard">{stats.pendingOrders || 0}</p>
                  <p className="text-[11px] text-fg-dim mt-1">待支付</p>
                </div>
                <div className="bg-ink-900 p-4 text-center">
                  <p className="text-2xl font-bold font-mono tabular-nums text-hazard">{stats.failedOrders || 0}</p>
                  <p className="text-[11px] text-fg-dim mt-1">失败</p>
                </div>
                <div className="bg-ink-900 p-4 text-center">
                  <p className="text-2xl font-bold font-mono tabular-nums text-fg-dim">{stats.cancelledOrders || 0}</p>
                  <p className="text-[11px] text-fg-dim mt-1">已取消</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : view === 'orders' ? (
        <div className="space-y-4">
          {/* 筛选栏 */}
          <div className="flex flex-wrap items-center gap-3 bg-ink-850 border border-ink-line p-4">
            {/* 搜索 */}
            <div className="relative flex-1 min-w-[200px]">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs z-10" />
              <input
                type="text"
                placeholder="搜索订单号/用户名..."
                className="tac-input !pl-9 !py-2"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="tac-input !w-auto !py-2 cursor-pointer"
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
              className="tac-input !w-auto !py-2 cursor-pointer"
            >
              <option value="">全部类型</option>
              <option value="TOPUP">余额充值</option>
              <option value="AUTH_BUY">蓝图授权</option>
              <option value="SERVICE_FEE">增强服务</option>
              <option value="ADMIN_ADJUST">管理调整</option>
            </select>

            {/* 日期范围 */}
            <div className="flex items-center gap-2 flex-wrap">
              <FaCalendarAlt className="text-fg-mute text-xs" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setPage(1); }}
                className="tac-input !w-auto !px-2 !py-2 !text-xs"
              />
              <span className="text-fg-mute">-</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setPage(1); }}
                className="tac-input !w-auto !px-2 !py-2 !text-xs"
              />
            </div>

            {/* 清除筛选 */}
            {hasFilters && (
              <button
                onClick={handleClearFilters}
                className="p-2 border border-ink-line text-fg-dim hover:border-hazard hover:text-hazard transition-colors"
                title="清除筛选"
              >
                <FaTimes className="text-xs" />
              </button>
            )}
          </div>

          <div className="text-xs text-fg-dim">
            {hasFilters
              ? `已启用筛选，当前展示 ${orders.length} 条结果`
              : `未启用筛选，默认展示最近 ${orders.length} 条订单`}
          </div>

          {/* 订单表格 */}
          <div className="border border-ink-line">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="bg-ink-800 text-fg-dim">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-[11px]">订单号</th>
                    <th className="px-4 py-3 font-semibold text-[11px]">用户</th>
                    <th className="px-4 py-3 font-semibold text-[11px]">类型</th>
                    <th className="px-4 py-3 font-semibold text-[11px] text-right">金额</th>
                    <th className="px-4 py-3 font-semibold text-[11px]">状态</th>
                    <th className="px-4 py-3 font-semibold text-[11px]">创建时间</th>
                    <th className="px-4 py-3 font-semibold text-[11px]">支付时间</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-fg-dim">
                        <FaSync className="animate-spin inline mr-2" />
                        加载中...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-fg-mute">
                        暂无订单数据
                      </td>
                    </tr>
                  ) : orders.map(order => {
                    const typeInfo = getOrderTypeLabel(order.type);
                    const statusInfo = getStatusLabel(order.status);
                    return (
                      <tr key={order.id} className="border-t border-ink-line hover:bg-ink-800/60 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-[10px] text-fg-mute font-mono tabular-nums">{order.id.substring(0, 12)}...</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-fg">{order.users?.username || 'System'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] font-bold ${typeInfo.bg} ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${
                          parseFloat(order.amount) >= 0 ? 'text-terminal' : 'text-hazard'
                        }`}>
                          {parseFloat(order.amount) >= 0 ? '+' : ''}{parseFloat(order.amount || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-bold ${statusInfo.bg} ${statusInfo.color}`}>
                            <span className={`w-1.5 h-1.5 ${statusInfo.dot}`} />
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-fg-dim text-xs font-mono tabular-nums">
                          {new Date(order.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-fg-dim text-xs font-mono tabular-nums">
                          {order.paidAt ? new Date(order.paidAt).toLocaleString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-ink-line flex items-center justify-between bg-ink-800">
                <span className="text-xs text-fg-dim font-mono tabular-nums">
                  共 {total} 条，第 {page}/{totalPages} 页
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-ink-line text-fg-dim hover:border-fg-dim hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                        className={`px-3 py-1 font-mono text-xs tabular-nums border transition-colors ${
                          page === pageNum
                            ? 'bg-hazard text-white border-hazard'
                            : 'border-ink-line text-fg-dim hover:border-fg-dim hover:text-fg'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border border-ink-line text-fg-dim hover:border-fg-dim hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <FaChevronRight className="text-xs" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-fg-mute">
          <FaSync className="animate-spin mr-2" />
          加载中...
        </div>
      )}
    </div>
  );
};

export default TradeCenter;
