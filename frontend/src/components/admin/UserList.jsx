import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function UserList() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page, search, statusFilter, planFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page, limit, search, status: statusFilter, planType: planFilter }
      });
      setUsers(response.data.data.users);
      setTotal(response.data.data.total);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      showToast('获取用户列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const action = currentStatus ? '禁用' : '启用';
    const confirmed = await confirm(`确定要${action}此用户吗？`, {
      confirmText: action,
      confirmColor: currentStatus ? 'red' : 'green'
    });

    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/admin/users/${userId}/status`,
        { isActive: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(`用户已${action}`, 'success');
      fetchUsers();
    } catch (error) {
      console.error(`${action}用户失败:`, error);
      showToast(error.response?.data?.error || `${action}用户失败`, 'error');
    }
  };

  const handleViewDetail = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedUser(response.data.data);
      setShowDetailModal(true);
    } catch (error) {
      console.error('获取用户详情失败:', error);
      showToast('获取用户详情失败', 'error');
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

  const getStatusBadge = (user) => {
    if (!user.isActive) {
      return <span className="px-2 py-1 rounded text-xs bg-red-500 text-white">已禁用</span>;
    }
    if (!user.subscription) {
      return <span className="px-2 py-1 rounded text-xs bg-gray-500 text-white">无订阅</span>;
    }
    if (new Date(user.subscription.endDate) < new Date()) {
      return <span className="px-2 py-1 rounded text-xs bg-orange-500 text-white">已过期</span>;
    }
    return <span className="px-2 py-1 rounded text-xs bg-green-500 text-white">正常</span>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="space-y-4">
      {/* 页面标题和操作栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">用户管理</h2>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          🔄 刷新列表
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <input
              type="text"
              placeholder="搜索用户名或邮箱..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
              <option value="active">活跃</option>
              <option value="inactive">禁用</option>
              <option value="expired">已过期</option>
            </select>
          </div>
          <div>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部套餐</option>
              <option value="TRIAL">试用</option>
              <option value="MONTHLY">月付</option>
              <option value="QUARTERLY">季付</option>
              <option value="YEARLY">年付</option>
            </select>
          </div>
        </div>
      </div>

      {/* 用户列表表格 */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-white text-center py-8">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">用户</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">订阅</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">到期时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">服务器</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">服务状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-750">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {user.username}
                            {user.isAdmin && (
                              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded">管理员</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {user.subscription ? getPlanTypeBadge(user.subscription.planType) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {user.subscription ? formatDate(user.subscription.endDate) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {user.serverCount || 0} 个
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {user.serviceStatus?.isServiceRunning ? (
                        <div className="text-sm">
                          <div className="text-green-400">● 运行中</div>
                          <div className="text-xs text-gray-400">
                            {user.serviceStatus.connectedServers?.length || 0} 连接
                            {user.serviceStatus.fcmListening && ' | FCM'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">○ 未运行</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getStatusBadge(user)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetail(user.id)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.isActive)}
                          className={`px-3 py-1 ${
                            user.isActive
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-green-600 hover:bg-green-700'
                          } text-white rounded transition-colors`}
                        >
                          {user.isActive ? '禁用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="bg-gray-700 px-4 py-3 flex items-center justify-between border-t border-gray-600">
            <div className="text-sm text-gray-300">
              共 {total} 个用户，第 {page} / {totalPages} 页
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

      {/* 用户详情弹窗（简化版，后续可扩展） */}
      {showDetailModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">用户详情</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400">用户名</p>
                  <p className="text-white">{selectedUser.user.username}</p>
                </div>
                <div>
                  <p className="text-gray-400">邮箱</p>
                  <p className="text-white">{selectedUser.user.email}</p>
                </div>
                <div>
                  <p className="text-gray-400">注册时间</p>
                  <p className="text-white">{formatDate(selectedUser.user.createdAt)}</p>
                </div>
                <div>
                  <p className="text-gray-400">最后登录</p>
                  <p className="text-white">{formatDate(selectedUser.user.lastLogin)}</p>
                </div>
              </div>
              <hr className="border-gray-700" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400">服务器数</p>
                  <p className="text-white">{selectedUser.stats.serverCount}</p>
                </div>
                <div>
                  <p className="text-gray-400">订单数</p>
                  <p className="text-white">{selectedUser.stats.orderCount}</p>
                </div>
                <div>
                  <p className="text-gray-400">事件数</p>
                  <p className="text-white">{selectedUser.stats.eventCount}</p>
                </div>
                <div>
                  <p className="text-gray-400">总消费</p>
                  <p className="text-white">¥{selectedUser.stats.totalSpent.toFixed(2)}</p>
                </div>
              </div>
              {selectedUser.serviceStatus && (
                <>
                  <hr className="border-gray-700" />
                  <div>
                    <p className="text-gray-400 mb-2">服务状态</p>
                    <div className="bg-gray-700 rounded p-3">
                      <p className="text-white">
                        运行状态: {selectedUser.serviceStatus.isServiceRunning ? '✅ 运行中' : '○ 未运行'}
                      </p>
                      <p className="text-white">
                        已连接服务器: {selectedUser.serviceStatus.connectedServers?.length || 0} 个
                      </p>
                      <p className="text-white">
                        FCM 监听: {selectedUser.serviceStatus.fcmListening ? '✅ 是' : '❌ 否'}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserList;
