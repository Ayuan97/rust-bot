import React, { useState, useEffect } from 'react';
import {
  FaSearch, FaSync, FaWallet,
  FaTerminal, FaEdit, FaTimes, FaPlus, FaMinus, FaUsers,
  FaBan, FaCheckCircle, FaServer, FaEye, FaChevronLeft, FaChevronRight,
  FaPlug, FaTrashAlt, FaUserCheck, FaUserSlash
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

  // 审核通过
  const handleApprove = async (user) => {
    const isRestore = user.approvalStatus === 'REJECTED';
    const confirmed = await confirm({
      type: 'info',
      title: isRestore ? '重新通过审核' : '通过审核',
      message: isRestore
        ? `确定重新通过用户「${user.username}」的注册审核吗？`
        : `确定通过用户「${user.username}」的注册审核吗？`,
      confirmText: isRestore ? '重新通过' : '通过'
    });
    if (!confirmed) return;
    try {
      const res = await api.put(`/admin/users/${user.id}/approval`, { action: 'approve' });
      if (res.data.success) {
        if (res.data.data?.serviceStatus === 'retrying') {
          toast.warning(res.data.message);
        } else {
          toast.success(res.data.message);
        }
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失败');
    }
  };

  // 拒绝注册
  const handleReject = async (user) => {
    const confirmed = await confirm({
      type: 'warning',
      title: '拒绝注册',
      message: `确定拒绝用户「${user.username}」的注册申请吗？`,
      confirmText: '拒绝'
    });
    if (!confirmed) return;
    try {
      const res = await api.put(`/admin/users/${user.id}/approval`, { action: 'reject' });
      if (res.data.success) {
        if (res.data.data?.serviceStatus === 'stopping_retry') {
          toast.warning(res.data.message);
        } else {
          toast.success(res.data.message);
        }
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失败');
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

  // 套餐类型标签（中性元数据，统一发丝线描边，不引入多色）
  const getPlanBadge = (planType) => {
    const config = {
      TRIAL: { label: '试用' },
      MONTHLY: { label: '月付' },
      QUARTERLY: { label: '季付' },
      YEARLY: { label: '年付' }
    };
    const c = config[planType] || { label: planType || 'N/A' };
    return <span className="px-2 py-0.5 border border-ink-line text-fg-dim text-[10px] font-bold">{c.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* 标题和工具栏 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
        <div className="min-w-0">
          <div className="tac-label flex items-center gap-2">
            <FaUsers className="text-hazard" /> 用户运营 // USERS
          </div>
          <h2 className="text-xl font-extrabold text-fg mt-1 flex items-center gap-2">
            幸存者名录
            <span className="text-sm font-bold text-fg-dim font-mono tabular-nums">({total})</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              resetCreateForm();
              setIsCreateModalOpen(true);
            }}
            className="tac-btn tac-btn-primary !py-2.5"
          >
            <FaPlus className="text-[10px]" />
            添加用户
          </button>

          <button
            onClick={fetchUsers}
            disabled={loading}
            className="tac-btn tac-btn-ghost !py-2.5 !px-3.5"
            title="刷新"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 tac-panel p-4">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute" />
          <input
            type="text"
            placeholder="搜索 UID / 用户名 / 邮箱..."
            className="tac-input !pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 状态筛选 */}
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="tac-input !w-auto cursor-pointer"
        >
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="rejected">已拒绝</option>
          <option value="active">活跃</option>
          <option value="inactive">已禁用</option>
          <option value="not_activated">未激活</option>
          <option value="expired">已过期</option>
        </select>

        {/* 套餐筛选 */}
        <select
          value={planFilter}
          onChange={(e) => handleFilterChange('plan', e.target.value)}
          className="tac-input !w-auto cursor-pointer"
        >
          <option value="">全部套餐</option>
          <option value="TRIAL">试用</option>
          <option value="MONTHLY">月付</option>
          <option value="QUARTERLY">季付</option>
          <option value="YEARLY">年付</option>
        </select>
      </div>

      {/* 用户表格 */}
      <div className="tac-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[980px]">
          <thead className="bg-ink-800 text-fg-dim border-b border-ink-line">
            <tr>
              <th className="px-4 py-3 font-semibold text-[11px]">幸存者</th>
              <th className="px-4 py-3 font-semibold text-[11px]">邮箱</th>
              <th className="px-4 py-3 font-semibold text-[11px]">套餐</th>
              <th className="px-4 py-3 font-semibold text-[11px]">余额</th>
              <th className="px-4 py-3 font-semibold text-[11px]">到期时间</th>
              <th className="px-4 py-3 font-semibold text-[11px]">链路状态</th>
              <th className="px-4 py-3 font-semibold text-[11px]">状态</th>
              <th className="px-4 py-3 font-semibold text-[11px] text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-fg-dim">
                  <FaSync className="animate-spin inline mr-2" />
                  加载中...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-fg-mute">
                  未发现幸存者信号...
                </td>
              </tr>
            ) : users.map(user => (
              <tr key={user.id} className="border-t border-ink-line hover:bg-ink-800/60 transition-colors group">
                {/* 用户名 */}
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-bold text-fg">{user.username}</span>
                    <span className="text-[10px] text-fg-mute font-mono tabular-nums">{user.id.substring(0, 12)}...</span>
                  </div>
                </td>

                {/* 邮箱 */}
                <td className="px-4 py-3">
                  <span className="text-fg-dim text-xs">{user.email || '-'}</span>
                </td>

                {/* 套餐 */}
                <td className="px-4 py-3">
                  {getPlanBadge(user.subscriptions?.planType)}
                </td>

                {/* 余额 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-fg">
                    <FaWallet className="text-[10px] text-hazard" />
                    <span className="font-mono text-xs tabular-nums">¥{parseFloat(user.balance || 0).toFixed(2)}</span>
                  </div>
                </td>

                {/* 到期时间 */}
                <td className="px-4 py-3">
                  <span className={`font-mono text-xs tabular-nums ${
                    user.subscriptions?.endDate && new Date(user.subscriptions.endDate) < new Date()
                      ? 'text-hazard'
                      : 'text-fg-dim'
                  }`}>
                    {user.subscriptions?.endDate
                      ? new Date(user.subscriptions.endDate).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </td>

                {/* 链路状态 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5" title="FCM 监听">
                      <span className={`w-1.5 h-1.5 ${user.serviceStatus?.fcmListening ? 'bg-terminal animate-tac-blink' : 'bg-ink-line2'}`} />
                      <span className="tac-label !text-[9px] !tracking-[0.12em]">FCM</span>
                    </div>
                    <div className="flex items-center gap-1.5" title="Rust+ 连接">
                      <span className={`w-1.5 h-1.5 ${user.serviceStatus?.connectedServers?.length > 0 ? 'bg-terminal animate-tac-blink' : 'bg-ink-line2'}`} />
                      <span className="text-[9px] text-fg-dim font-mono tabular-nums">R+({user.serviceStatus?.connectedServers?.length || 0}/{user.serverCount || 0})</span>
                    </div>
                  </div>
                </td>

                {/* 状态 */}
                <td className="px-4 py-3">
                  {(() => {
                    // 审核状态优先展示
                    if (user.approvalStatus === 'PENDING') {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-hazard border-hazard/30 bg-hazard-dim text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" />审核中
                        </span>
                      );
                    }
                    if (user.approvalStatus === 'REJECTED') {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-fg-dim border-ink-line text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-fg-mute" />已拒绝
                        </span>
                      );
                    }

                    // 判断未激活状态（startDate 和 endDate 几乎相同）
                    const startDate = user.subscriptions?.startDate ? new Date(user.subscriptions.startDate) : null;
                    const endDate = user.subscriptions?.endDate ? new Date(user.subscriptions.endDate) : null;
                    const isNotActivated = startDate && endDate && Math.abs(endDate.getTime() - startDate.getTime()) < 60000;
                    const isExpired = endDate && new Date() > endDate;

                    if (!user.isActive) {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-hazard border-hazard/30 bg-hazard-dim text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-hazard" />已禁用
                        </span>
                      );
                    } else if (isNotActivated) {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-fg-dim border-ink-line text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-fg-mute" />未激活
                        </span>
                      );
                    } else if (isExpired) {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-hazard border-hazard/30 bg-hazard-dim text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-hazard" />已过期
                        </span>
                      );
                    } else if (user.serviceStatus?.isServiceRunning) {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-terminal border-terminal/30 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink" />运行中
                        </span>
                      );
                    } else {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 border text-fg-dim border-ink-line text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 bg-fg-mute" />待启动
                        </span>
                      );
                    }
                  })()}
                </td>

                {/* 操作 */}
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {/* 查看详情 */}
                    <button
                      onClick={() => handleViewDetail(user)}
                      className="p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-hazard hover:text-hazard transition-colors"
                      title="查看详情"
                    >
                      <FaEye className="text-xs" />
                    </button>

                    {/* 查看服务器 */}
                    <button
                      onClick={() => handleViewServers(user)}
                      className="p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-hazard hover:text-hazard transition-colors"
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
                      className="p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-hazard hover:text-hazard transition-colors"
                      title="资产调整"
                    >
                      <FaEdit className="text-xs" />
                    </button>

                    {/* 实时诊断 */}
                    <button
                      onClick={() => handleNavigateToLogs(user)}
                      className={`p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-hazard hover:text-hazard transition-colors ${
                        !user.serviceStatus?.isServiceRunning ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title="实时诊断"
                      disabled={!user.serviceStatus?.isServiceRunning}
                    >
                      <FaTerminal className="text-xs" />
                    </button>

                    {/* 待审核和已拒绝用户可通过；只有待审核用户可拒绝 */}
                    {(user.approvalStatus === 'PENDING' || user.approvalStatus === 'REJECTED') && (
                      <>
                        <button
                          onClick={() => handleApprove(user)}
                          className="p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-terminal hover:text-terminal transition-colors"
                          title={user.approvalStatus === 'REJECTED' ? '重新通过审核' : '通过审核'}
                        >
                          <FaUserCheck className="text-xs" />
                        </button>
                        {user.approvalStatus === 'PENDING' && (
                          <button
                            onClick={() => handleReject(user)}
                            className="p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-hazard hover:text-hazard transition-colors"
                            title="拒绝注册"
                          >
                            <FaUserSlash className="text-xs" />
                          </button>
                        )}
                      </>
                    )}

                    {/* 启用/禁用 */}
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`p-1.5 border border-ink-line bg-ink-800 text-fg-dim transition-colors ${
                        user.isActive
                          ? 'hover:border-hazard hover:text-hazard'
                          : 'hover:border-terminal hover:text-terminal'
                      }`}
                      title={user.isActive ? '禁用用户' : '启用用户'}
                    >
                      {user.isActive ? <FaBan className="text-xs" /> : <FaCheckCircle className="text-xs" />}
                    </button>

                    {/* 删除用户 */}
                    {!user.isAdmin && (
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-1.5 border border-ink-line bg-ink-800 text-fg-dim hover:border-hazard hover:text-hazard hover:bg-hazard-dim transition-colors"
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
          <div className="px-4 py-3 border-t border-ink-line flex items-center justify-between bg-ink-800">
            <span className="text-xs text-fg-dim">
              共 <span className="font-mono tabular-nums text-fg">{total}</span> 条，第 <span className="font-mono tabular-nums text-fg">{page}/{totalPages}</span> 页
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-ink-line bg-ink-850 text-fg-dim hover:border-fg-dim hover:text-fg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                    className={`px-3 py-1 border text-xs font-mono tabular-nums transition-colors ${
                      page === pageNum
                        ? 'bg-hazard text-white border-hazard'
                        : 'bg-ink-850 text-fg-dim border-ink-line hover:border-fg-dim hover:text-fg'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border border-ink-line bg-ink-850 text-fg-dim hover:border-fg-dim hover:text-fg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FaChevronRight className="text-xs" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="tac-panel tac-corners border-hazard/40 w-full max-w-lg">
            <div className="px-6 py-4 border-b border-hazard/30 flex justify-between items-center bg-hazard-dim">
              <h3 className="font-bold text-fg flex items-center gap-2">
                <FaTrashAlt className="text-hazard" />
                永久删除用户
              </h3>
              <button
                onClick={() => {
                  if (deleteSubmitting) return;
                  setDeleteTarget(null);
                  setDeleteConfirmInput('');
                }}
                className="text-fg-dim hover:text-fg transition-colors"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-fg leading-relaxed">
                此操作将永久删除用户 <span className="font-bold text-hazard-bright">「{deleteTarget.username}」</span> 的服务器、设备、日志、订单和订阅数据，且不可恢复。
              </p>
              <p className="text-xs text-fg-dim">
                请输入用户名 <span className="font-bold text-fg font-mono">{deleteTarget.username}</span> 进行确认。
              </p>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder="输入用户名确认"
                className="tac-input"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (deleteSubmitting) return;
                    setDeleteTarget(null);
                    setDeleteConfirmInput('');
                  }}
                  disabled={deleteSubmitting}
                  className="tac-btn tac-btn-ghost flex-1 !py-2.5"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteSubmitting}
                  className="tac-btn tac-btn-primary flex-1 !py-2.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="tac-panel tac-corners w-full max-w-xl animate-fade-in">
            <div className="px-6 py-4 border-b border-ink-line flex justify-between items-center bg-ink-800">
              <h3 className="font-bold text-fg flex items-center gap-2">
                <FaPlus className="text-hazard" />
                添加用户
              </h3>
              <button
                onClick={closeCreateModal}
                disabled={createSubmitting}
                className="text-fg-dim hover:text-fg transition-colors disabled:opacity-40"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">用户名 *</label>
                  <input
                    type="text"
                    value={createUserForm.username}
                    onChange={(e) => handleCreateUserInput('username', e.target.value)}
                    placeholder="3-50 位，字母/数字/下划线"
                    className="tac-input !py-2"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">邮箱（可选）</label>
                  <input
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => handleCreateUserInput('email', e.target.value)}
                    placeholder="example@mail.com"
                    className="tac-input !py-2"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">密码 *</label>
                  <input
                    type="password"
                    value={createUserForm.password}
                    onChange={(e) => handleCreateUserInput('password', e.target.value)}
                    placeholder="至少 6 位"
                    className="tac-input !py-2"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">确认密码 *</label>
                  <input
                    type="password"
                    value={createUserForm.confirmPassword}
                    onChange={(e) => handleCreateUserInput('confirmPassword', e.target.value)}
                    placeholder="再次输入密码"
                    className="tac-input !py-2"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">套餐</label>
                  <select
                    value={createUserForm.planType}
                    onChange={(e) => handleCreateUserInput('planType', e.target.value)}
                    className="tac-input !py-2"
                  >
                    <option value="TRIAL">试用</option>
                    <option value="MONTHLY">月付</option>
                    <option value="QUARTERLY">季付</option>
                    <option value="YEARLY">年付</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">订阅天数</label>
                  <input
                    type="number"
                    min={0}
                    value={createUserForm.subscriptionDays}
                    onChange={(e) => handleCreateUserInput('subscriptionDays', e.target.value)}
                    className="tac-input !py-2 font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-fg-dim">初始余额</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={createUserForm.balance}
                    onChange={(e) => handleCreateUserInput('balance', e.target.value)}
                    className="tac-input !py-2 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-fg-dim cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUserForm.isActive}
                    onChange={(e) => handleCreateUserInput('isActive', e.target.checked)}
                    className="bg-ink-700 border-ink-line accent-hazard"
                  />
                  创建后立即启用
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-fg-dim cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUserForm.isAdmin}
                    onChange={(e) => handleCreateUserInput('isAdmin', e.target.checked)}
                    className="bg-ink-700 border-ink-line accent-hazard"
                  />
                  管理员账号
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeCreateModal}
                  disabled={createSubmitting}
                  className="tac-btn tac-btn-ghost flex-1 !py-2.5"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={createSubmitting}
                  className="tac-btn tac-btn-primary flex-1 !py-2.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="tac-panel tac-corners w-full max-w-md animate-fade-in">
            <div className="px-6 py-4 border-b border-ink-line flex justify-between items-center bg-ink-800">
              <h3 className="font-bold text-fg flex items-center gap-2">
                <FaEdit className="text-hazard" />
                资产调整: {selectedUser.username}
              </h3>
              <button onClick={() => { setIsAdjustModalOpen(false); resetAdjustForm(); }} className="text-fg-dim hover:text-fg transition-colors">
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 余额调整 */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-fg-dim">物资余额调整 (¥)</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center bg-ink-700 border border-ink-line overflow-hidden">
                    <button
                      onClick={() => setBalanceDelta(d => parseFloat(d) - 10)}
                      className="px-3 py-2 hover:bg-ink-800 hover:text-hazard text-fg-dim transition-colors"
                    >
                      <FaMinus className="text-xs" />
                    </button>
                    <input
                      type="number"
                      value={balanceDelta}
                      onChange={(e) => setBalanceDelta(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-center font-mono tabular-nums text-fg focus:outline-none py-2"
                    />
                    <button
                      onClick={() => setBalanceDelta(d => parseFloat(d) + 10)}
                      className="px-3 py-2 hover:bg-ink-800 hover:text-hazard text-fg-dim transition-colors"
                    >
                      <FaPlus className="text-xs" />
                    </button>
                  </div>
                  <span className="text-[10px] text-fg-mute font-mono tabular-nums whitespace-nowrap">当前: ¥{parseFloat(selectedUser.balance || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* 授权天数调整 */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-fg-dim">蓝图授权调整 (天)</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center bg-ink-700 border border-ink-line overflow-hidden">
                    <button
                      onClick={() => setDaysDelta(d => parseInt(d) - 7)}
                      className="px-3 py-2 hover:bg-ink-800 hover:text-hazard text-fg-dim transition-colors"
                    >
                      <FaMinus className="text-xs" />
                    </button>
                    <input
                      type="number"
                      value={daysDelta}
                      onChange={(e) => setDaysDelta(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-center font-mono tabular-nums text-fg focus:outline-none py-2"
                    />
                    <button
                      onClick={() => setDaysDelta(d => parseInt(d) + 7)}
                      className="px-3 py-2 hover:bg-ink-800 hover:text-hazard text-fg-dim transition-colors"
                    >
                      <FaPlus className="text-xs" />
                    </button>
                  </div>
                  <span className="text-[10px] text-fg-mute font-mono whitespace-nowrap">基于当前到期日</span>
                </div>
              </div>

              {/* 备注 */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-fg-dim">调整备注</label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="请输入调整原因..."
                  className="tac-input h-20 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setIsAdjustModalOpen(false); resetAdjustForm(); }}
                  className="tac-btn tac-btn-ghost flex-1 !py-2.5"
                >
                  取消
                </button>
                <button
                  onClick={handleAdjustAssets}
                  className="tac-btn tac-btn-primary flex-1 !py-2.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="tac-panel tac-corners w-full max-w-2xl animate-fade-in">
            <div className="px-6 py-4 border-b border-ink-line flex justify-between items-center bg-ink-800">
              <h3 className="font-bold text-fg flex items-center gap-2">
                <FaEye className="text-hazard" />
                用户详情: {selectedUser.username}
              </h3>
              <button onClick={() => setIsDetailModalOpen(false)} className="text-fg-dim hover:text-fg transition-colors">
                <FaTimes />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="py-8 text-center text-fg-dim">
                  <FaSync className="animate-spin inline mr-2" />
                  加载中...
                </div>
              ) : userDetail ? (
                <div className="space-y-6">
                  {/* 基本信息 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] text-fg-dim font-bold">用户名</label>
                      <p className="text-fg">{userDetail.user.username}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-fg-dim font-bold">邮箱</label>
                      <p className="text-fg">{userDetail.user.email}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-fg-dim font-bold">注册时间</label>
                      <p className="text-fg-dim text-sm font-mono tabular-nums">{new Date(userDetail.user.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-fg-dim font-bold">最后登录</label>
                      <p className="text-fg-dim text-sm font-mono tabular-nums">{userDetail.user.lastLogin ? new Date(userDetail.user.lastLogin).toLocaleString() : 'N/A'}</p>
                    </div>
                  </div>

                  <hr className="border-ink-line" />

                  {/* 统计数据 */}
                  <div className="grid grid-cols-4 gap-px bg-ink-line border border-ink-line">
                    <div className="bg-ink-850 px-3 py-4 text-center">
                      <p className="text-2xl font-bold text-fg font-mono tabular-nums">{userDetail.stats.serverCount}</p>
                      <p className="text-[11px] text-fg-dim mt-1">服务器</p>
                    </div>
                    <div className="bg-ink-850 px-3 py-4 text-center">
                      <p className="text-2xl font-bold text-fg font-mono tabular-nums">{userDetail.stats.eventCount}</p>
                      <p className="text-[11px] text-fg-dim mt-1">事件数</p>
                    </div>
                    <div className="bg-ink-850 px-3 py-4 text-center">
                      <p className="text-2xl font-bold text-fg font-mono tabular-nums">{userDetail.stats.orderCount}</p>
                      <p className="text-[11px] text-fg-dim mt-1">订单数</p>
                    </div>
                    <div className="bg-ink-850 px-3 py-4 text-center">
                      <p className="text-2xl font-bold text-hazard font-mono tabular-nums">¥{userDetail.stats.totalSpent.toFixed(2)}</p>
                      <p className="text-[11px] text-fg-dim mt-1">总消费</p>
                    </div>
                  </div>

                  <hr className="border-ink-line" />

                  {/* 服务状态 */}
                  <div className="bg-ink-900 border border-ink-line p-4">
                    <div className="tac-label mb-3">服务状态 // STATUS</div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 ${userDetail.serviceStatus.isServiceRunning ? 'bg-terminal animate-tac-blink' : 'bg-ink-line2'}`} />
                        <span className="text-fg-dim">服务: {userDetail.serviceStatus.isServiceRunning ? '运行中' : '未运行'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 ${userDetail.serviceStatus.fcmListening ? 'bg-terminal animate-tac-blink' : 'bg-ink-line2'}`} />
                        <span className="text-fg-dim">FCM: {userDetail.serviceStatus.fcmListening ? '监听中' : '未监听'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FaServer className="text-xs text-fg-mute" />
                        <span className="text-fg-dim">连接: <span className="font-mono tabular-nums">{userDetail.serviceStatus.connectedServers?.length || 0}</span> 个</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-fg-dim text-center py-8">加载失败</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 服务器列表弹窗 */}
      {isServersModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="tac-panel tac-corners w-full max-w-3xl animate-fade-in">
            <div className="px-6 py-4 border-b border-ink-line flex justify-between items-center bg-ink-800">
              <h3 className="font-bold text-fg flex items-center gap-2">
                <FaServer className="text-hazard" />
                服务器列表: {selectedUser.username}
              </h3>
              <button onClick={() => setIsServersModalOpen(false)} className="text-fg-dim hover:text-fg transition-colors">
                <FaTimes />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="py-8 text-center text-fg-dim">
                  <FaSync className="animate-spin inline mr-2" />
                  加载中...
                </div>
              ) : userServers.length === 0 ? (
                <p className="text-fg-dim text-center py-8">暂无服务器</p>
              ) : (
                <div className="space-y-px bg-ink-line border border-ink-line max-h-96 overflow-y-auto">
                  {userServers.map(server => (
                    <div key={server.id} className="bg-ink-850 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className={`w-1.5 h-1.5 shrink-0 ${server.connected ? 'bg-terminal animate-tac-blink' : 'bg-ink-line2'}`} />
                        <div>
                          <p className="font-bold text-fg">{server.name || '未命名服务器'}</p>
                          <p className="text-xs text-fg-mute font-mono tabular-nums">{server.ip}:{server.port}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-fg-dim"><span className="font-mono tabular-nums">{server.deviceCount || 0}</span> 个设备</span>
                        {server.connected && (
                          <button
                            onClick={() => handleDisconnectServer(server.id)}
                            className="p-2 border border-hazard/30 bg-hazard-dim text-hazard hover:border-hazard hover:bg-hazard/20 transition-colors"
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
