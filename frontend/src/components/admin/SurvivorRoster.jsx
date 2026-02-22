import React, { useState, useEffect } from 'react';
import {
  FaSearch, FaSync, FaWallet, FaCircle,
  FaTerminal, FaEdit, FaTimes, FaPlus, FaMinus, FaUsers,
  FaBan, FaCheckCircle, FaServer, FaEye, FaChevronLeft, FaChevronRight,
  FaPlug, FaTrashAlt
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

const INITIAL_CREATE_USER_FORM = {
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
  planType: 'TRIAL',
  subscriptionDays: 0,
  balance: 0,
  isActive: true,
  isAdmin: false
};

const SurvivorRoster = ({ onNavigateToLogs }) => {
  const toast = useToast();
  const confirm = useConfirm();

  // 列表数据
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 分页
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);

  // 筛选
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  // 弹窗状态
  const [selectedUser, setSelectedUser] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isServersModalOpen, setIsServersModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createUserForm, setCreateUserForm] = useState(INITIAL_CREATE_USER_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // 调整表单
  const [balanceDelta, setBalanceDelta] = useState(0);
  const [daysDelta, setDaysDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // 用户详情数据
  const [userDetail, setUserDetail] = useState(null);
  const [userServers, setUserServers] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 加载用户列表
  useEffect(() => {
    fetchUsers();
  }, [page, statusFilter, planFilter]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchUsers();
      } else {
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users', {
        params: {
          page,
          limit,
          search: searchTerm,
          status: statusFilter,
          planType: planFilter
        }
      });
      if (res.data.success) {
        setUsers(res.data.data.users);
        setTotal(res.data.data.total);
      }
    } catch (err) {
      toast.error('加载幸存者列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 资产调整
  const handleAdjustAssets = async () => {
    if (!selectedUser) return;

    try {
      const res = await api.put(`/admin/users/${selectedUser.id}/adjust`, {
        balanceDelta: parseFloat(balanceDelta),
        daysDelta: parseInt(daysDelta),
        reason: adjustReason
      });

      if (res.data.success) {
        toast.success('资产调整成功');
        setIsAdjustModalOpen(false);
        fetchUsers();
        resetAdjustForm();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '资产调整失败');
    }
  };

  const resetAdjustForm = () => {
    setBalanceDelta(0);
    setDaysDelta(0);
    setAdjustReason('');
  };

  const resetCreateForm = () => {
    setCreateUserForm(INITIAL_CREATE_USER_FORM);
  };

  const handleCreateUserInput = (field, value) => {
    setCreateUserForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    resetCreateForm();
  };

  const handleCreateUser = async () => {
    const normalizedUsername = createUserForm.username.trim();
    const normalizedEmail = createUserForm.email.trim();

    if (!normalizedUsername) {
      toast.error('请输入用户名');
      return;
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      toast.error('用户名长度必须在 3-50 个字符之间');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      toast.error('用户名只能包含字母、数字和下划线');
      return;
    }

    if (createUserForm.password.length < 6) {
      toast.error('密码长度至少需要 6 位');
      return;
    }

    if (createUserForm.password !== createUserForm.confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }

    const parsedDays = Number.parseInt(createUserForm.subscriptionDays, 10);
    if (Number.isNaN(parsedDays) || parsedDays < 0) {
      toast.error('订阅天数必须是大于等于 0 的整数');
      return;
    }

    const parsedBalance = Number.parseFloat(createUserForm.balance);
    if (Number.isNaN(parsedBalance) || parsedBalance < 0) {
      toast.error('初始余额不能小于 0');
      return;
    }

    try {
      setCreateSubmitting(true);
      const res = await api.post('/admin/users', {
        username: normalizedUsername,
        password: createUserForm.password,
        email: normalizedEmail || undefined,
        planType: createUserForm.planType,
        subscriptionDays: parsedDays,
        balance: parsedBalance,
        isActive: createUserForm.isActive,
        isAdmin: createUserForm.isAdmin
      });

      if (res.data.success) {
        toast.success(`用户 ${normalizedUsername} 创建成功`);
        closeCreateModal();
        if (page !== 1) {
          setPage(1);
        } else {
          fetchUsers();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '创建用户失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // 启用/禁用用户
  const handleToggleStatus = async (user) => {
    const action = user.isActive ? '禁用' : '启用';
    const confirmed = await confirm({
      type: user.isActive ? 'warning' : 'info',
      title: `${action}用户`,
      message: `确定要${action}用户「${user.username}」吗？`,
      confirmText: action
    });
    if (!confirmed) return;

    try {
      const res = await api.put(`/admin/users/${user.id}/status`, {
        isActive: !user.isActive
      });
      if (res.data.success) {
        toast.success(`用户已${action}`);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || `${action}失败`);
    }
  };

  // 删除用户
  const handleDeleteUser = (user) => {
    setDeleteTarget(user);
    setDeleteConfirmInput('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteConfirmInput.trim() !== deleteTarget.username) {
      toast.error('用户名不匹配，无法删除');
      return;
    }

    try {
      setDeleteSubmitting(true);
      const res = await api.delete(`/admin/users/${deleteTarget.id}`);
      if (res.data.success) {
        toast.success(`用户 ${deleteTarget.username} 已删除`);
        setDeleteTarget(null);
        setDeleteConfirmInput('');
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '删除用户失败');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // 查看用户详情
  const handleViewDetail = async (user) => {
    setSelectedUser(user);
    setDetailLoading(true);
    setIsDetailModalOpen(true);

    try {
      const res = await api.get(`/admin/users/${user.id}`);
      if (res.data.success) {
        setUserDetail(res.data.data);
      }
    } catch (err) {
      toast.error('获取用户详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 查看用户服务器
  const handleViewServers = async (user) => {
    setSelectedUser(user);
    setDetailLoading(true);
    setIsServersModalOpen(true);

    try {
      const res = await api.get(`/admin/users/${user.id}/servers`);
      if (res.data.success) {
        setUserServers(res.data.data);
      }
    } catch (err) {
      toast.error('获取服务器列表失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 强制断开服务器
  const handleDisconnectServer = async (serverId) => {
    const confirmed = await confirm({
      type: 'warning',
      title: '强制断开连接',
      message: '确定要强制断开该服务器连接吗？断开后用户需重新发起连接。',
      confirmText: '确认断开'
    });
    if (!confirmed) return;

    try {
      const res = await api.delete(`/admin/users/${selectedUser.id}/servers/${serverId}`);
      if (res.data.success) {
        toast.success('服务器已断开');
        // 刷新服务器列表
        const serversRes = await api.get(`/admin/users/${selectedUser.id}/servers`);
        if (serversRes.data.success) {
          setUserServers(serversRes.data.data);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '断开失败');
    }
  };

  // 跳转到系统诊断
  const handleNavigateToLogs = (user) => {
    if (onNavigateToLogs) {
      onNavigateToLogs(user.id);
    } else {
      toast.info('请先选择用户后在系统诊断页面查看');
    }
  };

  // 筛选变化重置页码
  const handleFilterChange = (type, value) => {
    if (type === 'status') setStatusFilter(value);
    if (type === 'plan') setPlanFilter(value);
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  // 套餐类型标签
  const getPlanBadge = (planType) => {
    const config = {
      TRIAL: { label: '试用', color: 'bg-yellow-500/20 text-yellow-400' },
      MONTHLY: { label: '月付', color: 'bg-blue-500/20 text-blue-400' },
      QUARTERLY: { label: '季付', color: 'bg-purple-500/20 text-purple-400' },
      YEARLY: { label: '年付', color: 'bg-green-500/20 text-green-400' }
    };
    const c = config[planType] || { label: planType || 'N/A', color: 'bg-gray-500/20 text-gray-400' };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.color}`}>{c.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* 标题和工具栏 */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FaUsers className="text-orange-500" />
          幸存者名录
          <span className="text-sm font-normal text-gray-500">({total})</span>
        </h2>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetCreateForm();
              setIsCreateModalOpen(true);
            }}
            className="px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <FaPlus className="text-[10px]" />
            添加用户
          </button>

          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 bg-[#121417] border border-gray-800 rounded-lg p-4">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="搜索 UID / 用户名 / 邮箱..."
            className="w-full bg-[#0D0E10] border border-gray-800 rounded px-10 py-2 text-sm focus:border-orange-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 状态筛选 */}
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="bg-[#0D0E10] border border-gray-800 rounded px-4 py-2 text-sm focus:border-orange-500 outline-none cursor-pointer"
        >
          <option value="">全部状态</option>
          <option value="active">活跃</option>
          <option value="inactive">已禁用</option>
          <option value="not_activated">未激活</option>
          <option value="expired">已过期</option>
        </select>

        {/* 套餐筛选 */}
        <select
          value={planFilter}
          onChange={(e) => handleFilterChange('plan', e.target.value)}
          className="bg-[#0D0E10] border border-gray-800 rounded px-4 py-2 text-sm focus:border-orange-500 outline-none cursor-pointer"
        >
          <option value="">全部套餐</option>
          <option value="TRIAL">试用</option>
          <option value="MONTHLY">月付</option>
          <option value="QUARTERLY">季付</option>
          <option value="YEARLY">年付</option>
        </select>
      </div>

      {/* 用户表格 */}
      <div className="bg-[#121417] border border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[980px]">
          <thead className="bg-[#1A1C1F] text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-800">
            <tr>
              <th className="px-4 py-3">幸存者</th>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">余额</th>
              <th className="px-4 py-3">到期时间</th>
              <th className="px-4 py-3">链路状态</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <FaSync className="animate-spin inline mr-2" />
                  加载中...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-600">
                  未发现幸存者信号...
                </td>
              </tr>
            ) : users.map(user => (
              <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                {/* 用户名 */}
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-200">{user.username}</span>
                    <span className="text-[10px] text-gray-600 font-mono">{user.id.substring(0, 12)}...</span>
                  </div>
                </td>

                {/* 邮箱 */}
                <td className="px-4 py-3">
                  <span className="text-gray-400 text-xs">{user.email || '-'}</span>
                </td>

                {/* 套餐 */}
                <td className="px-4 py-3">
                  {getPlanBadge(user.subscriptions?.planType)}
                </td>

                {/* 余额 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-orange-400">
                    <FaWallet className="text-[10px]" />
                    <span className="font-mono text-xs">¥{parseFloat(user.balance || 0).toFixed(2)}</span>
                  </div>
                </td>

                {/* 到期时间 */}
                <td className="px-4 py-3">
                  <span className={`font-mono text-xs ${
                    user.subscriptions?.endDate && new Date(user.subscriptions.endDate) < new Date()
                      ? 'text-red-500'
                      : 'text-gray-400'
                  }`}>
                    {user.subscriptions?.endDate
                      ? new Date(user.subscriptions.endDate).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </td>

                {/* 链路状态 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1" title="FCM 监听">
                      <FaCircle className={`text-[6px] ${user.serviceStatus?.fcmListening ? 'text-green-500' : 'text-gray-700'}`} />
                      <span className="text-[9px] text-gray-600">FCM</span>
                    </div>
                    <div className="flex items-center gap-1" title="Rust+ 连接">
                      <FaCircle className={`text-[6px] ${user.serviceStatus?.connectedServers?.length > 0 ? 'text-green-500' : 'text-gray-700'}`} />
                      <span className="text-[9px] text-gray-600">R+({user.serviceStatus?.connectedServers?.length || 0}/{user.serverCount || 0})</span>
                    </div>
                  </div>
                </td>

                {/* 状态 */}
                <td className="px-4 py-3">
                  {(() => {
                    // 判断未激活状态（startDate 和 endDate 几乎相同）
                    const startDate = user.subscriptions?.startDate ? new Date(user.subscriptions.startDate) : null;
                    const endDate = user.subscriptions?.endDate ? new Date(user.subscriptions.endDate) : null;
                    const isNotActivated = startDate && endDate && Math.abs(endDate.getTime() - startDate.getTime()) < 60000;
                    const isExpired = endDate && new Date() > endDate;

                    if (!user.isActive) {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">已禁用</span>;
                    } else if (isNotActivated) {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400">未激活</span>;
                    } else if (isExpired) {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">已过期</span>;
                    } else if (user.serviceStatus?.isServiceRunning) {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">运行中</span>;
                    } else {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">待启动</span>;
                    }
                  })()}
                </td>

                {/* 操作 */}
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {/* 查看详情 */}
                    <button
                      onClick={() => handleViewDetail(user)}
                      className="p-1.5 bg-gray-800 hover:bg-blue-500/20 hover:text-blue-400 rounded transition-all"
                      title="查看详情"
                    >
                      <FaEye className="text-xs" />
                    </button>

                    {/* 查看服务器 */}
                    <button
                      onClick={() => handleViewServers(user)}
                      className="p-1.5 bg-gray-800 hover:bg-purple-500/20 hover:text-purple-400 rounded transition-all"
                      title="服务器列表"
                    >
                      <FaServer className="text-xs" />
                    </button>

                    {/* 资产调整 */}
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setIsAdjustModalOpen(true);
                      }}
                      className="p-1.5 bg-gray-800 hover:bg-orange-500/20 hover:text-orange-400 rounded transition-all"
                      title="资产调整"
                    >
                      <FaEdit className="text-xs" />
                    </button>

                    {/* 实时诊断 */}
                    <button
                      onClick={() => handleNavigateToLogs(user)}
                      className={`p-1.5 bg-gray-800 hover:bg-cyan-500/20 hover:text-cyan-400 rounded transition-all ${
                        !user.serviceStatus?.isServiceRunning ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title="实时诊断"
                      disabled={!user.serviceStatus?.isServiceRunning}
                    >
                      <FaTerminal className="text-xs" />
                    </button>

                    {/* 启用/禁用 */}
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`p-1.5 bg-gray-800 rounded transition-all ${
                        user.isActive
                          ? 'hover:bg-red-500/20 hover:text-red-400'
                          : 'hover:bg-green-500/20 hover:text-green-400'
                      }`}
                      title={user.isActive ? '禁用用户' : '启用用户'}
                    >
                      {user.isActive ? <FaBan className="text-xs" /> : <FaCheckCircle className="text-xs" />}
                    </button>

                    {/* 删除用户 */}
                    {!user.isAdmin && (
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-1.5 bg-gray-800 hover:bg-red-600/30 hover:text-red-400 rounded transition-all"
                        title="删除用户"
                      >
                        <FaTrashAlt className="text-xs" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

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

              {/* 页码按钮 */}
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

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121417] border border-red-500/30 rounded-lg w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-red-500/20 flex justify-between items-center bg-red-500/10">
              <h3 className="font-bold text-red-200 flex items-center gap-2">
                <FaTrashAlt />
                永久删除用户
              </h3>
              <button
                onClick={() => {
                  if (deleteSubmitting) return;
                  setDeleteTarget(null);
                  setDeleteConfirmInput('');
                }}
                className="text-red-200/70 hover:text-red-100"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-red-100 leading-relaxed">
                此操作将永久删除用户 <span className="font-bold">「{deleteTarget.username}」</span> 的服务器、设备、日志、订单和订阅数据，且不可恢复。
              </p>
              <p className="text-xs text-red-200/80">
                请输入用户名 <span className="font-bold">{deleteTarget.username}</span> 进行确认。
              </p>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder="输入用户名确认"
                className="w-full bg-[#0D0E10] border border-red-500/30 rounded px-3 py-2 text-sm focus:border-red-400 outline-none"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (deleteSubmitting) return;
                    setDeleteTarget(null);
                    setDeleteConfirmInput('');
                  }}
                  disabled={deleteSubmitting}
                  className="flex-1 py-2.5 border border-gray-700 hover:bg-gray-800 rounded font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteSubmitting}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs uppercase tracking-widest disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deleteSubmitting && <FaSync className="animate-spin text-xs" />}
                  永久删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新建用户弹窗 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121417] border border-gray-800 rounded-lg w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1A1C1F]">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <FaPlus className="text-orange-500" />
                添加用户
              </h3>
              <button
                onClick={closeCreateModal}
                disabled={createSubmitting}
                className="text-gray-500 hover:text-white disabled:opacity-40"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">用户名 *</label>
                  <input
                    type="text"
                    value={createUserForm.username}
                    onChange={(e) => handleCreateUserInput('username', e.target.value)}
                    placeholder="3-50 位，字母/数字/下划线"
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">邮箱（可选）</label>
                  <input
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => handleCreateUserInput('email', e.target.value)}
                    placeholder="example@mail.com"
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">密码 *</label>
                  <input
                    type="password"
                    value={createUserForm.password}
                    onChange={(e) => handleCreateUserInput('password', e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">确认密码 *</label>
                  <input
                    type="password"
                    value={createUserForm.confirmPassword}
                    onChange={(e) => handleCreateUserInput('confirmPassword', e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">套餐</label>
                  <select
                    value={createUserForm.planType}
                    onChange={(e) => handleCreateUserInput('planType', e.target.value)}
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  >
                    <option value="TRIAL">试用</option>
                    <option value="MONTHLY">月付</option>
                    <option value="QUARTERLY">季付</option>
                    <option value="YEARLY">年付</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">订阅天数</label>
                  <input
                    type="number"
                    min={0}
                    value={createUserForm.subscriptionDays}
                    onChange={(e) => handleCreateUserInput('subscriptionDays', e.target.value)}
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">初始余额</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={createUserForm.balance}
                    onChange={(e) => handleCreateUserInput('balance', e.target.value)}
                    className="w-full bg-[#0D0E10] border border-gray-800 rounded px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUserForm.isActive}
                    onChange={(e) => handleCreateUserInput('isActive', e.target.checked)}
                    className="rounded border-gray-700 bg-[#0D0E10] text-orange-500 focus:ring-orange-500/40"
                  />
                  创建后立即启用
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUserForm.isAdmin}
                    onChange={(e) => handleCreateUserInput('isAdmin', e.target.checked)}
                    className="rounded border-gray-700 bg-[#0D0E10] text-orange-500 focus:ring-orange-500/40"
                  />
                  管理员账号
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeCreateModal}
                  disabled={createSubmitting}
                  className="flex-1 py-2.5 border border-gray-800 hover:bg-gray-800 rounded font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={createSubmitting}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {createSubmitting && <FaSync className="text-xs animate-spin" />}
                  确认创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 资产调整弹窗 */}
      {isAdjustModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121417] border border-gray-800 rounded-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1A1C1F]">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <FaEdit className="text-orange-500" />
                资产调整: {selectedUser.username}
              </h3>
              <button onClick={() => { setIsAdjustModalOpen(false); resetAdjustForm(); }} className="text-gray-500 hover:text-white">
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 余额调整 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">物资余额调整 (¥)</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center bg-[#0D0E10] border border-gray-800 rounded overflow-hidden">
                    <button
                      onClick={() => setBalanceDelta(d => parseFloat(d) - 10)}
                      className="px-3 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaMinus className="text-xs" />
                    </button>
                    <input
                      type="number"
                      value={balanceDelta}
                      onChange={(e) => setBalanceDelta(e.target.value)}
                      className="flex-1 bg-transparent text-center font-mono text-orange-400 focus:outline-none py-2"
                    />
                    <button
                      onClick={() => setBalanceDelta(d => parseFloat(d) + 10)}
                      className="px-3 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaPlus className="text-xs" />
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono whitespace-nowrap">当前: ¥{parseFloat(selectedUser.balance || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* 授权天数调整 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">蓝图授权调整 (天)</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center bg-[#0D0E10] border border-gray-800 rounded overflow-hidden">
                    <button
                      onClick={() => setDaysDelta(d => parseInt(d) - 7)}
                      className="px-3 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaMinus className="text-xs" />
                    </button>
                    <input
                      type="number"
                      value={daysDelta}
                      onChange={(e) => setDaysDelta(e.target.value)}
                      className="flex-1 bg-transparent text-center font-mono text-blue-400 focus:outline-none py-2"
                    />
                    <button
                      onClick={() => setDaysDelta(d => parseInt(d) + 7)}
                      className="px-3 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaPlus className="text-xs" />
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono whitespace-nowrap">基于当前到期日</span>
                </div>
              </div>

              {/* 备注 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">调整备注</label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="请输入调整原因..."
                  className="w-full bg-[#0D0E10] border border-gray-800 rounded p-3 text-sm focus:border-orange-500 outline-none h-20 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setIsAdjustModalOpen(false); resetAdjustForm(); }}
                  className="flex-1 py-2.5 border border-gray-800 hover:bg-gray-800 rounded font-bold text-xs uppercase tracking-widest transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleAdjustAssets}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded font-bold text-xs uppercase tracking-widest transition-all"
                >
                  确认调整
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 用户详情弹窗 */}
      {isDetailModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121417] border border-gray-800 rounded-lg w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1A1C1F]">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <FaEye className="text-blue-500" />
                用户详情: {selectedUser.username}
              </h3>
              <button onClick={() => setIsDetailModalOpen(false)} className="text-gray-500 hover:text-white">
                <FaTimes />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="py-8 text-center text-gray-500">
                  <FaSync className="animate-spin inline mr-2" />
                  加载中...
                </div>
              ) : userDetail ? (
                <div className="space-y-6">
                  {/* 基本信息 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-600 uppercase">用户名</label>
                      <p className="text-gray-200">{userDetail.user.username}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-600 uppercase">邮箱</label>
                      <p className="text-gray-200">{userDetail.user.email}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-600 uppercase">注册时间</label>
                      <p className="text-gray-400 text-sm">{new Date(userDetail.user.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-600 uppercase">最后登录</label>
                      <p className="text-gray-400 text-sm">{userDetail.user.lastLogin ? new Date(userDetail.user.lastLogin).toLocaleString() : 'N/A'}</p>
                    </div>
                  </div>

                  <hr className="border-gray-800" />

                  {/* 统计数据 */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-400">{userDetail.stats.serverCount}</p>
                      <p className="text-[10px] text-gray-600 uppercase">服务器</p>
                    </div>
                    <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-purple-400">{userDetail.stats.eventCount}</p>
                      <p className="text-[10px] text-gray-600 uppercase">事件数</p>
                    </div>
                    <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-orange-400">{userDetail.stats.orderCount}</p>
                      <p className="text-[10px] text-gray-600 uppercase">订单数</p>
                    </div>
                    <div className="bg-[#0D0E10] p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-400">¥{userDetail.stats.totalSpent.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-600 uppercase">总消费</p>
                    </div>
                  </div>

                  <hr className="border-gray-800" />

                  {/* 服务状态 */}
                  <div className="bg-[#0D0E10] p-4 rounded-lg">
                    <h4 className="text-[10px] text-gray-600 uppercase mb-3">服务状态</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <FaCircle className={`text-xs ${userDetail.serviceStatus.isServiceRunning ? 'text-green-500' : 'text-gray-700'}`} />
                        <span className="text-gray-400">服务: {userDetail.serviceStatus.isServiceRunning ? '运行中' : '未运行'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaCircle className={`text-xs ${userDetail.serviceStatus.fcmListening ? 'text-green-500' : 'text-gray-700'}`} />
                        <span className="text-gray-400">FCM: {userDetail.serviceStatus.fcmListening ? '监听中' : '未监听'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaServer className="text-xs text-gray-600" />
                        <span className="text-gray-400">连接: {userDetail.serviceStatus.connectedServers?.length || 0} 个</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">加载失败</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 服务器列表弹窗 */}
      {isServersModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121417] border border-gray-800 rounded-lg w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1A1C1F]">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <FaServer className="text-purple-500" />
                服务器列表: {selectedUser.username}
              </h3>
              <button onClick={() => setIsServersModalOpen(false)} className="text-gray-500 hover:text-white">
                <FaTimes />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="py-8 text-center text-gray-500">
                  <FaSync className="animate-spin inline mr-2" />
                  加载中...
                </div>
              ) : userServers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">暂无服务器</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {userServers.map(server => (
                    <div key={server.id} className="bg-[#0D0E10] p-4 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <FaCircle className={`text-xs ${server.connected ? 'text-green-500' : 'text-gray-700'}`} />
                        <div>
                          <p className="font-bold text-gray-200">{server.name || '未命名服务器'}</p>
                          <p className="text-xs text-gray-600 font-mono">{server.ip}:{server.port}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{server.deviceCount || 0} 个设备</span>
                        {server.connected && (
                          <button
                            onClick={() => handleDisconnectServer(server.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-all"
                            title="强制断开"
                          >
                            <FaPlug className="text-xs" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SurvivorRoster;
