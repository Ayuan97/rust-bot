import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../Toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function OrderList() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page, limit, status: statusFilter }
      });
      setOrders(response.data.data.orders);
      setTotal(response.data.data.total);
    } catch (error) {
      console.error('获取订单列表失败:', error);
      showToast('获取订单列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const getPlanTypeBadge = (planType) => {
    const colors = {
      TRIAL: 'bg-yellow-500',
      MONTHLY: 'bg-blue-500',
      QUARTERLY: 'bg-purple-500',
      YEARLY: 'bg-green-500'
    };
    const labels = {
      TRIAL: '试用',
      MONTHLY: '月付',
      QUARTERLY: '季付',
      YEARLY: '年付'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs text-white ${colors[planType] || 'bg-gray-500'}`}>
        {labels[planType] || planType}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const colors = {
      PENDING: 'bg-yellow-500',
      PAID: 'bg-green-500',
      FAILED: 'bg-red-500',
      CANCELLED: 'bg-gray-500',
      EXPIRED: 'bg-orange-500'
    };
    const labels = {
      PENDING: '待支付',
      PAID: '已支付',
      FAILED: '失败',
      CANCELLED: '已取消',
      EXPIRED: '已过期'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs text-white ${colors[status] || 'bg-gray-500'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      ALIPAY: '支付宝',
      WECHAT: '微信支付'
    };
    return labels[method] || method;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatAmount = (amount) => {
    return `¥${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      {/* 页面标题和操作栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">订单管理</h2>
        <button
          onClick={fetchOrders}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          🔄 刷新列表
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部状态</option>
              <option value="PENDING">待支付</option>
              <option value="PAID">已支付</option>
              <option value="FAILED">失败</option>
              <option value="CANCELLED">已取消</option>
              <option value="EXPIRED">已过期</option>
            </select>
          </div>
        </div>
      </div>

      {/* 订单列表表格 */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-white text-center py-8">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">订单号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">用户</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">套餐</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">金额</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">支付方式</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">创建时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">支付时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                      暂无订单数据
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-750">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono text-gray-300">
                          {order.id.substring(0, 8)}...
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="text-white">{order.user?.username || '-'}</div>
                          <div className="text-gray-400 text-xs">{order.user?.email || '-'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getPlanTypeBadge(order.planType)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {formatAmount(order.amount)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                        {getPaymentMethodLabel(order.paymentMethod)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatDate(order.paidAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="bg-gray-700 px-4 py-3 flex items-center justify-between border-t border-gray-600">
            <div className="text-sm text-gray-300">
              共 {total} 个订单，第 {page} / {totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 统计信息 */}
      {!loading && orders.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-gray-400 text-sm">总订单数</p>
              <p className="text-white text-2xl font-bold">{total}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">成功订单</p>
              <p className="text-green-400 text-2xl font-bold">
                {orders.filter(o => o.status === 'PAID').length}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">待支付</p>
              <p className="text-yellow-400 text-2xl font-bold">
                {orders.filter(o => o.status === 'PENDING').length}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">本页总额</p>
              <p className="text-blue-400 text-2xl font-bold">
                {formatAmount(
                  orders
                    .filter(o => o.status === 'PAID')
                    .reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderList;
