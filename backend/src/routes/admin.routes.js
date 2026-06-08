/**
 * 管理后台 API 路由
 * 所有接口需要管理员权限
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import db, { getConnection } from '../lib/db.js';
import globalServiceManager from '../services/global-manager.service.js';
import appConfigService from '../services/app-config.service.js';
import proxyService from '../services/proxy.service.js';
import paymentService from '../services/payment.service.js';
import distributedSessionService from '../services/distributed-session.service.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const SALT_ROUNDS = 10;
const VALID_PLAN_TYPES = new Set(['TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_NOTIFICATION_SETTINGS = {
  player_death: true,
  player_online: true,
  player_offline: true,
  player_afk: true,
  cargo_spawn: true,
  heli_spawn: true,
  oil_rig_triggered: true,
  travelling_vendor_spawn: true,
  travelling_vendor_leave_warning: true
};

// 所有管理接口都需要管理员权限
router.use(authenticate, requireAdmin);

/**
 * GET /api/admin/config
 * 获取运营开关（注册模式 / 免费试用）
 */
router.get('/config', (req, res) => {
  res.json({ success: true, data: appConfigService.getConfig() });
});

/**
 * PUT /api/admin/config
 * 更新运营开关（部分更新）
 */
router.put('/config', async (req, res) => {
  try {
    const { registrationMode, freeTrialEnabled, freeTrialDays } = req.body;
    const updated = await appConfigService.updateConfig({ registrationMode, freeTrialEnabled, freeTrialDays });
    res.json({ success: true, message: '配置已更新', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || '更新配置失败' });
  }
});

/**
 * 代理出口管理（机场订阅 + 总开关）。实际 Mihomo 引擎在子节点,这里只存+下发。
 */
router.get('/proxy', async (req, res) => {
  try {
    res.json({ success: true, data: await proxyService.getAdminView() });
  } catch (error) {
    console.error('获取代理配置失败:', error);
    res.status(500).json({ success: false, error: '获取代理配置失败' });
  }
});

router.put('/proxy', async (req, res) => {
  try {
    if (typeof req.body.enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled 必须是布尔值' });
    }
    await proxyService.setEnabled(req.body.enabled);
    res.json({
      success: true,
      message: req.body.enabled ? '代理已开启' : '代理已关闭',
      data: await proxyService.getAdminView()
    });
  } catch (error) {
    console.error('更新代理开关失败:', error);
    res.status(500).json({ success: false, error: '更新代理开关失败' });
  }
});

router.post('/proxy/subscriptions', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const url = String(req.body.url || '').trim();
    if (!name || !url) {
      return res.status(400).json({ success: false, error: '请填写名称和订阅链接' });
    }
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, error: '订阅链接必须是 http(s) 链接' });
    }
    const sub = await proxyService.addSubscription({ name, url });
    res.json({ success: true, message: '订阅已添加', data: sub });
  } catch (error) {
    console.error('添加订阅失败:', error);
    res.status(500).json({ success: false, error: '添加订阅失败' });
  }
});

router.delete('/proxy/subscriptions/:id', async (req, res) => {
  try {
    await proxyService.deleteSubscription(req.params.id);
    res.json({ success: true, message: '订阅已删除' });
  } catch (error) {
    console.error('删除订阅失败:', error);
    res.status(500).json({ success: false, error: '删除订阅失败' });
  }
});

/**
 * PUT /api/admin/users/:id/approval
 * 注册审核：通过 / 拒绝。通过时若开启免费试用且订阅未发放，则从此刻起发放 N 天
 */
router.put('/users/:id/approval', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const adminId = req.user.id;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, error: '无效的审核操作' });
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.query(
      'SELECT u.*, s.endDate AS subscriptionEndDate FROM users u LEFT JOIN subscriptions s ON u.id = s.userId WHERE u.id = ?',
      [id]
    );
    const user = userRows[0];
    if (!user) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    const now = new Date();
    let grantedDays = 0;
    let grantedEndDate = null;

    if (action === 'approve') {
      // 审核通过：若开启免费试用且订阅尚未发放（到期 <= 现在），从此刻起发放 N 天
      const cfg = appConfigService.getConfig();
      const currentEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
      const subActive = currentEnd && currentEnd > now;
      if (cfg.freeTrialEnabled && !subActive) {
        grantedDays = cfg.freeTrialDays;
        grantedEndDate = new Date(now.getTime() + grantedDays * 24 * 60 * 60 * 1000);
        await conn.query(
          'UPDATE subscriptions SET endDate = ?, updatedAt = NOW(3) WHERE userId = ?',
          [grantedEndDate, id]
        );
      }
      await conn.query("UPDATE users SET approvalStatus = 'APPROVED', updatedAt = NOW(3) WHERE id = ?", [id]);
      await conn.query(
        `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
         VALUES (?, ?, ?, 'APPROVE_USER', ?, NOW(3))`,
        [uuidv4(), adminId, id, JSON.stringify({ grantedTrialDays: grantedDays })]
      );
    } else {
      await conn.query("UPDATE users SET approvalStatus = 'REJECTED', updatedAt = NOW(3) WHERE id = ?", [id]);
      await conn.query(
        `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
         VALUES (?, ?, ?, 'REJECT_USER', ?, NOW(3))`,
        [uuidv4(), adminId, id, JSON.stringify({ reason: req.body.reason || '管理员拒绝' })]
      );
    }

    await conn.commit();

    // 事务外处理服务实例（耗时操作不放进事务）
    if (action === 'approve') {
      const finalEnd = grantedEndDate || (user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null);
      if (user.isActive && finalEnd && finalEnd > now && !globalServiceManager.userServices.has(id)) {
        try {
          await globalServiceManager.createUserService(id);
        } catch (e) {
          console.error('审核通过后拉起用户服务失败:', e.message);
        }
      }
    } else if (globalServiceManager.userServices.has(id)) {
      try {
        await globalServiceManager.removeUserService(id, '审核未通过');
      } catch (e) {
        console.error('拒绝后停止用户服务失败:', e.message);
      }
    }

    res.json({
      success: true,
      message: action === 'approve' ? '已通过审核' : '已拒绝',
      data: { id, approvalStatus: action === 'approve' ? 'APPROVED' : 'REJECTED', grantedTrialDays: grantedDays }
    });
  } catch (error) {
    await conn.rollback();
    console.error('审核操作失败:', error);
    res.status(500).json({ success: false, error: '审核操作失败' });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/admin/users
 * 管理员创建用户
 */
router.post('/users', async (req, res) => {
  let conn;

  try {
    const {
      username,
      password,
      email,
      isAdmin = false,
      isActive = true,
      planType = 'TRIAL',
      subscriptionDays = 0,
      balance = 0
    } = req.body;

    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const parsedDays = Number.parseInt(subscriptionDays, 10);
    const parsedBalance = Number.parseFloat(balance);

    if (!normalizedUsername || !password) {
      return res.status(400).json({
        success: false,
        error: '请填写用户名和密码'
      });
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      return res.status(400).json({
        success: false,
        error: '用户名长度必须在 3-50 个字符之间'
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      return res.status(400).json({
        success: false,
        error: '用户名只能包含字母、数字和下划线'
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        error: '密码长度至少需要 6 位'
      });
    }

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: '邮箱格式不正确'
      });
    }

    if (typeof isAdmin !== 'boolean' || typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isAdmin 和 isActive 必须是布尔值'
      });
    }

    if (!VALID_PLAN_TYPES.has(planType)) {
      return res.status(400).json({
        success: false,
        error: '无效的套餐类型'
      });
    }

    if (Number.isNaN(parsedDays) || parsedDays < 0 || parsedDays > 3650) {
      return res.status(400).json({
        success: false,
        error: '订阅天数必须是 0-3650 的整数'
      });
    }

    if (Number.isNaN(parsedBalance) || parsedBalance < 0) {
      return res.status(400).json({
        success: false,
        error: '初始余额不能小于 0'
      });
    }

    const [existingUsersByName] = await db.query(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [normalizedUsername]
    );
    if (existingUsersByName.length > 0) {
      return res.status(409).json({
        success: false,
        error: '用户名已被占用'
      });
    }

    if (normalizedEmail) {
      const [existingUsersByEmail] = await db.query(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [normalizedEmail]
      );
      if (existingUsersByEmail.length > 0) {
        return res.status(409).json({
          success: false,
          error: '邮箱已被占用'
        });
      }
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + parsedDays * 24 * 60 * 60 * 1000);
    const subscriptionStatus = 'ACTIVE';
    const userId = uuidv4();
    const subscriptionId = uuidv4();
    const notificationSettingsId = uuidv4();
    const adminLogId = uuidv4();
    const hashedPassword = await bcrypt.hash(String(password), SALT_ROUNDS);

    conn = await getConnection();
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO users (id, username, email, password, balance, isActive, isAdmin, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        normalizedUsername,
        normalizedEmail || null,
        hashedPassword,
        parsedBalance.toFixed(2),
        isActive ? 1 : 0,
        isAdmin ? 1 : 0,
        now,
        now
      ]
    );

    await conn.query(
      `INSERT INTO subscriptions (id, userId, planType, status, startDate, endDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [subscriptionId, userId, planType, subscriptionStatus, now, endDate, now, now]
    );

    await conn.query(
      `INSERT INTO notification_settings (id, userId, settings, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [notificationSettingsId, userId, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS), now, now]
    );

    await conn.query(
      `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
       VALUES (?, ?, ?, 'CREATE_USER', ?, ?)`,
      [
        adminLogId,
        req.user.id,
        userId,
        JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail || null,
          isAdmin,
          isActive,
          planType,
          subscriptionDays: parsedDays,
          balance: Number(parsedBalance.toFixed(2))
        }),
        now
      ]
    );

    await conn.commit();

    if (isActive && endDate > now && !globalServiceManager.userServices.has(userId)) {
      try {
        await globalServiceManager.createUserService(userId);
      } catch (serviceError) {
        console.error(`创建用户服务失败（userId=${userId}）:`, serviceError);
      }
    }

    return res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: {
        id: userId,
        username: normalizedUsername,
        email: normalizedEmail || null,
        isActive,
        isAdmin,
        balance: Number(parsedBalance.toFixed(2)),
        subscriptions: {
          planType,
          startDate: now,
          endDate,
          status: subscriptionStatus
        }
      }
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: '用户名或邮箱已存在'
      });
    }

    console.error('管理员创建用户失败:', error);
    return res.status(500).json({
      success: false,
      error: '创建用户失败'
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

/**
 * PUT /api/admin/users/:id/adjust
 * 资产调整：加减余额、加减服务时间
 */
router.put('/users/:id/adjust', async (req, res) => {
  const { id } = req.params;
  const { balanceDelta, daysDelta, reason } = req.body;
  const adminId = req.user.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. 获取当前状态
    const [userRows] = await conn.query(
      'SELECT u.*, s.id as subscriptionId, s.endDate as subscriptionEndDate FROM users u LEFT JOIN subscriptions s ON u.id = s.userId WHERE u.id = ?',
      [id]
    );
    const user = userRows[0];

    if (!user) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    const logDetails = { reason, before: {}, after: {} };

    // 2. 调整余额
    if (balanceDelta !== undefined && balanceDelta !== 0) {
      const oldBalance = parseFloat(user.balance);
      const newBalance = Math.max(0, oldBalance + parseFloat(balanceDelta));

      await conn.query(
        'UPDATE users SET balance = ?, updatedAt = NOW() WHERE id = ?',
        [newBalance, id]
      );

      // 记录交易流水
      await conn.query(
        `INSERT INTO orders (id, userId, type, amount, balanceBefore, balanceAfter, status, notes, createdAt, updatedAt)
         VALUES (?, ?, 'ADMIN_ADJUST', ?, ?, ?, 'PAID', ?, NOW(), NOW())`,
        [uuidv4(), id, parseFloat(balanceDelta), oldBalance, newBalance, `管理员手动调整: ${reason || '无备注'}`]
      );

      logDetails.before.balance = oldBalance;
      logDetails.after.balance = newBalance;
    }

    // 3. 调整服务时间
    if (daysDelta !== undefined && daysDelta !== 0) {
      let currentEndDate = user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date()
        ? new Date(user.subscriptionEndDate)
        : new Date();
      const newEndDate = new Date(currentEndDate.getTime() + parseInt(daysDelta) * 24 * 60 * 60 * 1000);

      await conn.query(
        'UPDATE subscriptions SET endDate = ?, updatedAt = NOW() WHERE userId = ?',
        [newEndDate, id]
      );

      logDetails.before.endDate = user.subscriptionEndDate || null;
      logDetails.after.endDate = newEndDate;
    }

    // 4. 记录管理员日志
    await conn.query(
      `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
       VALUES (?, ?, ?, 'ADJUST_ASSETS', ?, NOW())`,
      [uuidv4(), adminId, id, JSON.stringify(logDetails)]
    );

    await conn.commit();

    // 提交后再拉起服务实例（耗时操作不放进事务；失败也不影响已落库的调整）
    if (daysDelta !== undefined && daysDelta > 0 && user.isActive && !globalServiceManager.userServices.has(id)) {
      try {
        await globalServiceManager.createUserService(id);
      } catch (e) {
        console.error('资产调整后拉起用户服务失败:', e.message);
      }
    }

    res.json({ success: true, message: '资产调整成功' });
  } catch (error) {
    await conn.rollback();
    console.error('资产调整失败:', error);
    res.status(500).json({ success: false, error: '资产调整失败' });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/admin/users/:id/logs
 * 获取幸存者实时诊断日志 (黑匣子)
 */
router.get('/users/:id/logs', async (req, res) => {
  const { id } = req.params;
  const userService = globalServiceManager.userServices.get(id);

  if (!userService) {
    return res.json({ success: true, data: [] });
  }

  res.json({
    success: true,
    data: userService.logs
  });
});

/**
 * GET /api/admin/orders/analytics
 * 财务全维度统计
 */
router.get('/orders/analytics', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    // 1. 基础汇总
    const [statsRows] = await db.query(
      'SELECT SUM(amount) as totalAmount, COUNT(*) as totalCount FROM orders WHERE status = ?',
      ['PAID']
    );

    const [todayStatsRows] = await db.query(
      'SELECT SUM(amount) as todayAmount FROM orders WHERE status = ? AND createdAt >= ?',
      ['PAID', todayStart]
    );

    // 2. 幸存者总余额 (系统负债)
    const [balanceRows] = await db.query(
      'SELECT SUM(balance) as totalBalance FROM users'
    );

    // 3. 按类型统计 (授权包分布)
    const [planDistribution] = await db.query(
      `SELECT planType, COUNT(*) as count FROM orders
       WHERE status = 'PAID' AND type = 'AUTH_BUY'
       GROUP BY planType`
    );

    // 4. 最近30天趋势
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [dailyTrend] = await db.query(
      `SELECT DATE(createdAt) as date, SUM(amount) as amount FROM orders
       WHERE status = 'PAID' AND createdAt >= ?
       GROUP BY DATE(createdAt)
       ORDER BY date ASC`,
      [thirtyDaysAgo]
    );

    res.json({
      success: true,
      data: {
        totalRevenue: parseFloat(statsRows[0].totalAmount) || 0,
        totalOrders: statsRows[0].totalCount || 0,
        todayRevenue: parseFloat(todayStatsRows[0].todayAmount) || 0,
        systemDebt: parseFloat(balanceRows[0].totalBalance) || 0,
        planDistribution: planDistribution.map(p => ({ planType: p.planType, _count: { id: p.count } })),
        dailyTrend: dailyTrend.map(d => ({ createdAt: d.date, _sum: { amount: parseFloat(d.amount) } }))
      }
    });
  } catch (error) {
    console.error('获取财务分析失败:', error);
    res.status(500).json({ success: false, error: '获取财务分析失败' });
  }
});

/**
 * GET /api/admin/users
 * 获取所有用户列表（分页）
 */
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '', // 'active', 'inactive', 'expired', 'not_activated'
      planType = '' // 'TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // 构建查询条件
    let whereClause = '1=1';
    const params = [];

    // 搜索条件（用户名或邮箱）
    if (search) {
      whereClause += ' AND (u.username LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 状态筛选
    if (status === 'active') {
      whereClause += ' AND u.isActive = 1';
    } else if (status === 'inactive') {
      whereClause += ' AND u.isActive = 0';
    } else if (status === 'pending') {
      whereClause += " AND u.approvalStatus = 'PENDING'";
    }

    // 订阅类型筛选
    if (planType) {
      whereClause += ' AND s.planType = ?';
      params.push(planType);
    }

    // 过期用户筛选
    if (status === 'expired' || status === 'not_activated') {
      whereClause += ' AND s.endDate < NOW()';
    }

    // 查询用户
    const [users] = await db.query(
      `SELECT u.*, s.id as subscriptionId, s.planType, s.status as subscriptionStatus, s.startDate, s.endDate,
        (SELECT COUNT(*) FROM servers WHERE userId = u.id) as serverCount,
        (SELECT COUNT(*) FROM orders WHERE userId = u.id) as orderCount
       FROM users u
       LEFT JOIN subscriptions s ON u.id = s.userId
       WHERE ${whereClause}
       ORDER BY u.createdAt DESC
       LIMIT ? OFFSET ?`,
      [...params, take, offset]
    );

    // 统计总数
    const [countResult] = await db.query(
      `SELECT COUNT(DISTINCT u.id) as total FROM users u
       LEFT JOIN subscriptions s ON u.id = s.userId
       WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 获取服务运行状态
    const usersWithStatus = users.map(user => {
      const serviceStatus = {
        isServiceRunning: globalServiceManager.userServices.has(user.id),
        connectedServers: [],
        fcmListening: false,
        ramUsage: 0
      };

      if (serviceStatus.isServiceRunning) {
        const userService = globalServiceManager.userServices.get(user.id);
        if (userService.rustPlusService && userService.rustPlusService.connections) {
          serviceStatus.connectedServers = Array.from(userService.rustPlusService.connections.keys());
        }
        if (userService.fcmService) {
          serviceStatus.fcmListening = userService.fcmService.isListening;
        }

        // 预估内存占用: 基础5MB + (服务器*2) + (FCM*1)
        serviceStatus.ramUsage = 5 + (serviceStatus.connectedServers.length * 2) + (serviceStatus.fcmListening ? 1 : 0);
      }

      return {
        ...user,
        isActive: !!user.isActive,
        isAdmin: !!user.isAdmin,
        subscriptions: user.subscriptionId ? {
          id: user.subscriptionId,
          planType: user.planType,
          status: user.subscriptionStatus,
          startDate: user.startDate,
          endDate: user.endDate
        } : null,
        serviceStatus
      };
    });

    // 应用层过滤：区分"未激活"和"已过期"
    let filteredUsers = usersWithStatus;
    if (status === 'not_activated' || status === 'expired') {
      filteredUsers = usersWithStatus.filter(user => {
        if (!user.subscriptions) return false;
        const startDate = new Date(user.subscriptions.startDate);
        const endDate = new Date(user.subscriptions.endDate);
        const isNotActivated = Math.abs(endDate.getTime() - startDate.getTime()) < 60000;

        if (status === 'not_activated') {
          return isNotActivated;
        } else {
          return !isNotActivated; // expired = 过期但不是未激活
        }
      });
    }

    res.json({
      success: true,
      data: {
        users: filteredUsers,
        total: status === 'not_activated' || status === 'expired' ? filteredUsers.length : total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((status === 'not_activated' || status === 'expired' ? filteredUsers.length : total) / take)
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取用户列表失败'
    });
  }
});

/**
 * GET /api/admin/users/:id
 * 获取用户详情
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取用户基本信息
    const [userRows] = await db.query(
      `SELECT u.*, s.id as subscriptionId, s.planType, s.status as subscriptionStatus, s.startDate, s.endDate
       FROM users u
       LEFT JOIN subscriptions s ON u.id = s.userId
       WHERE u.id = ?`,
      [id]
    );
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 获取用户服务器列表
    const [servers] = await db.query(
      `SELECT s.*, (SELECT COUNT(*) FROM devices WHERE serverId = s.id) as deviceCount
       FROM servers s WHERE s.userId = ?`,
      [id]
    );

    // 获取最近10个订单
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC LIMIT 10',
      [id]
    );

    // 计算统计数据
    const [serverCountResult] = await db.query(
      'SELECT COUNT(*) as count FROM servers WHERE userId = ?',
      [id]
    );
    const [orderCountResult] = await db.query(
      'SELECT COUNT(*) as count FROM orders WHERE userId = ?',
      [id]
    );
    const [eventCountResult] = await db.query(
      'SELECT COUNT(*) as count FROM event_logs WHERE userId = ?',
      [id]
    );

    // 计算总消费
    const totalSpent = orders
      .filter(order => order.status === 'PAID')
      .reduce((sum, order) => sum + parseFloat(order.amount), 0);

    // 获取服务状态
    const serviceStatus = {
      isServiceRunning: globalServiceManager.userServices.has(user.id),
      connectedServers: [],
      fcmListening: false
    };

    if (serviceStatus.isServiceRunning) {
      const userService = globalServiceManager.userServices.get(user.id);

      // 获取已连接的服务器列表
      if (userService.rustPlusService && userService.rustPlusService.connections) {
        serviceStatus.connectedServers = Array.from(userService.rustPlusService.connections.keys());
      }

      // 获取 FCM 监听状态
      if (userService.fcmService) {
        serviceStatus.fcmListening = userService.fcmService.isListening || false;
      }
    }

    // 格式化用户数据
    const formattedUser = {
      ...user,
      isActive: !!user.isActive,
      isAdmin: !!user.isAdmin,
      subscriptions: user.subscriptionId ? {
        id: user.subscriptionId,
        planType: user.planType,
        status: user.subscriptionStatus,
        startDate: user.startDate,
        endDate: user.endDate
      } : null,
      servers: servers.map(s => ({
        ...s,
        _count: { devices: s.deviceCount }
      })),
      orders
    };

    res.json({
      success: true,
      data: {
        user: formattedUser,
        stats: {
          serverCount: serverCountResult[0].count,
          eventCount: eventCountResult[0].count,
          orderCount: orderCountResult[0].count,
          totalSpent
        },
        serviceStatus
      }
    });
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取用户详情失败'
    });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * 启用/禁用用户
 */
router.put('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive 必须是布尔值'
      });
    }

    // 获取用户当前状态
    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    // 更新用户状态
    await db.query(
      'UPDATE users SET isActive = ?, updatedAt = NOW() WHERE id = ?',
      [isActive ? 1 : 0, id]
    );

    // 如果禁用用户，停止其服务
    if (!isActive && globalServiceManager.userServices.has(id)) {
      await globalServiceManager.removeUserService(id);
      console.log(`管理员禁用用户 ${user.username}，已停止服务`);
    }

    // 如果启用用户且订阅有效，创建服务
    if (isActive && !globalServiceManager.userServices.has(id)) {
      const [subRows] = await db.query('SELECT * FROM subscriptions WHERE userId = ?', [id]);
      const subscription = subRows[0];

      if (subscription && new Date() < new Date(subscription.endDate)) {
        await globalServiceManager.createUserService(id);
        console.log(`管理员启用用户 ${user.username}，已创建服务`);
      }
    }

    res.json({
      success: true,
      message: isActive ? '用户已启用' : '用户已禁用',
      data: { ...user, isActive }
    });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({
      success: false,
      error: '更新用户状态失败'
    });
  }
});

/**
 * PUT /api/admin/users/:id/subscription
 * 手动调整订阅时间
 */
router.put('/users/:id/subscription', async (req, res) => {
  try {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!endDate) {
      return res.status(400).json({
        success: false,
        error: '请提供到期时间'
      });
    }

    const newEndDate = new Date(endDate);
    if (isNaN(newEndDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: '无效的日期格式'
      });
    }

    // 更新订阅
    await db.query(
      'UPDATE subscriptions SET endDate = ?, updatedAt = NOW() WHERE userId = ?',
      [newEndDate, id]
    );

    // 如果订阅有效且服务未运行，创建服务
    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    const user = userRows[0];

    if (user && user.isActive && new Date() < newEndDate && !globalServiceManager.userServices.has(id)) {
      await globalServiceManager.createUserService(id);
      console.log(`管理员延长用户 ${user.username} 订阅，已创建服务`);
    }

    res.json({
      success: true,
      message: '订阅时间已更新',
      data: { userId: id, endDate: newEndDate }
    });
  } catch (error) {
    console.error('更新订阅失败:', error);
    res.status(500).json({
      success: false,
      error: '更新订阅失败'
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * 删除用户（包括所有关联数据）
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // 1. 检查用户是否存在
    const [userRows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 2. 禁止删除管理员账号
    if (user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: '无法删除管理员账号'
      });
    }

    // 3. 禁止删除自己
    if (id === adminId) {
      return res.status(403).json({
        success: false,
        error: '无法删除自己的账号'
      });
    }

    // 4. 断开用户的 WebSocket 连接
    const websocketService = (await import('../services/websocket.service.js')).default;
    websocketService.disconnectUser(id, '账号已被管理员删除');

    // 5. 停止并删除用户服务实例
    if (globalServiceManager.userServices.has(id)) {
      await globalServiceManager.removeUserService(id, '管理员删除用户');
    }

    // 6. 在事务中删除所有关联数据（任一步失败整体回滚，避免“服务已停但数据残留”的脏状态）
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [serverCountResult] = await conn.query(
        'SELECT COUNT(*) as count FROM servers WHERE userId = ?',
        [id]
      );

      const [serverIds] = await conn.query('SELECT id FROM servers WHERE userId = ?', [id]);
      if (serverIds.length > 0) {
        // db 层是 pool.execute(预处理)，IN(?) 不会展开数组，必须显式生成占位符
        const placeholders = serverIds.map(() => '?').join(',');
        const serverIdList = serverIds.map(s => s.id);
        await conn.query(`DELETE FROM devices WHERE serverId IN (${placeholders})`, serverIdList);
        await conn.query(`DELETE FROM event_logs WHERE serverId IN (${placeholders})`, serverIdList);
      }
      await conn.query('DELETE FROM servers WHERE userId = ?', [id]);
      await conn.query('DELETE FROM orders WHERE userId = ?', [id]);
      await conn.query('DELETE FROM subscriptions WHERE userId = ?', [id]);
      await conn.query('DELETE FROM notification_settings WHERE userId = ?', [id]);
      await conn.query('DELETE FROM extended_teammates WHERE userId = ?', [id]);
      await conn.query('DELETE FROM users WHERE id = ?', [id]);

      // 7. 记录管理员操作日志
      await conn.query(
        `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
         VALUES (?, ?, ?, 'DELETE_USER', ?, NOW())`,
        [
          uuidv4(),
          adminId,
          id,
          JSON.stringify({
            username: user.username,
            email: user.email,
            serversCount: serverCountResult[0].count,
            reason: req.body.reason || '管理员操作'
          })
        ]
      );

      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    console.log(`管理员 ${req.user.username} 删除了用户 ${user.username}`);

    res.json({
      success: true,
      message: `用户 ${user.username} 已删除`,
      data: {
        deletedUser: {
          id: user.id,
          username: user.username
        }
      }
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      success: false,
      error: '删除用户失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/admin/users/:userId/servers/:serverId
 * 强制断开用户服务器连接
 */
router.delete('/users/:userId/servers/:serverId', async (req, res) => {
  try {
    const { userId, serverId } = req.params;

    if (!globalServiceManager.userServices.has(userId)) {
      return res.status(404).json({
        success: false,
        error: '用户服务未运行'
      });
    }

    const userService = globalServiceManager.userServices.get(userId);
    if (!userService.rustPlusService || !userService.rustPlusService.connections || !userService.rustPlusService.connections.has(serverId)) {
      return res.status(404).json({
        success: false,
        error: '服务器未连接'
      });
    }

    await userService.rustPlusService.disconnect(serverId);

    res.json({
      success: true,
      message: '服务器已断开'
    });
  } catch (error) {
    console.error('断开服务器失败:', error);
    res.status(500).json({
      success: false,
      error: '断开服务器失败'
    });
  }
});

/**
 * GET /api/admin/users/:id/servers
 * 获取用户的服务器列表
 */
router.get('/users/:id/servers', async (req, res) => {
  try {
    const { id } = req.params;

    const [servers] = await db.query(
      `SELECT s.*, (SELECT COUNT(*) FROM devices WHERE serverId = s.id) as deviceCount
       FROM servers s
       WHERE s.userId = ?
       ORDER BY s.createdAt DESC`,
      [id]
    );

    // 获取连接状态
    const serversWithStatus = servers.map(server => {
      let connected = false;
      if (globalServiceManager.userServices.has(id)) {
        const userService = globalServiceManager.userServices.get(id);
        if (userService.rustPlusService && userService.rustPlusService.connections) {
          connected = userService.rustPlusService.connections.has(server.id);
        }
      }

      return {
        ...server,
        connected
      };
    });

    res.json({
      success: true,
      data: serversWithStatus
    });
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取服务器列表失败'
    });
  }
});

/**
 * GET /api/admin/users/:id/events
 * 获取用户的事件日志
 */
router.get('/users/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [events] = await db.query(
      'SELECT * FROM event_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?',
      [id, take, offset]
    );

    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM event_logs WHERE userId = ?',
      [id]
    );

    res.json({
      success: true,
      data: {
        events,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取事件日志失败:', error);
    res.status(500).json({
      success: false,
      error: '获取事件日志失败'
    });
  }
});

/**
 * GET /api/admin/orders
 * 获取所有订单（分页、筛选）
 */
router.get('/orders', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = '',
      userId = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    let whereClause = '1=1';
    const params = [];

    if (status) {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }
    if (userId) {
      whereClause += ' AND o.userId = ?';
      params.push(userId);
    }

    const [orders] = await db.query(
      `SELECT o.*, u.username, u.email
       FROM orders o
       LEFT JOIN users u ON o.userId = u.id
       WHERE ${whereClause}
       ORDER BY o.createdAt DESC
       LIMIT ? OFFSET ?`,
      [...params, take, offset]
    );

    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}`,
      params
    );

    // 格式化订单数据
    const formattedOrders = orders.map(order => ({
      ...order,
      users: order.username ? { username: order.username, email: order.email } : null
    }));

    res.json({
      success: true,
      data: {
        orders: formattedOrders,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取订单列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取订单列表失败'
    });
  }
});

/**
 * GET /api/admin/stats
 * 获取统计数据
 */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    // 用户统计
    const [totalUsersResult] = await db.query('SELECT COUNT(*) as count FROM users');
    const [activeUsersResult] = await db.query('SELECT COUNT(*) as count FROM users WHERE isActive = 1');
    const [trialUsersResult] = await db.query(
      `SELECT COUNT(DISTINCT u.id) as count FROM users u
       INNER JOIN subscriptions s ON u.id = s.userId
       WHERE s.planType = 'TRIAL'`
    );
    const [bannedUsersResult] = await db.query('SELECT COUNT(*) as count FROM users WHERE isActive = 0');
    const [pendingUsersResult] = await db.query("SELECT COUNT(*) as count FROM users WHERE approvalStatus = 'PENDING'");
    const [expiringSoonResult] = await db.query(
      `SELECT COUNT(DISTINCT u.id) as count FROM users u
       INNER JOIN subscriptions s ON u.id = s.userId
       WHERE s.endDate >= ? AND s.endDate <= ?`,
      [new Date(), sevenDaysLater]
    );
    const [expiredUsersResult] = await db.query(
      `SELECT COUNT(DISTINCT u.id) as count FROM users u
       INNER JOIN subscriptions s ON u.id = s.userId
       WHERE s.endDate < ?`,
      [new Date()]
    );

    const totalUsers = totalUsersResult[0].count;
    const activeUsers = activeUsersResult[0].count;
    const trialUsers = trialUsersResult[0].count;
    const bannedUsers = bannedUsersResult[0].count;
    const pendingUsers = pendingUsersResult[0].count;
    const expiringSoonUsers = expiringSoonResult[0].count;
    const expiredUsers = expiredUsersResult[0].count;
    const paidUsers = totalUsers - trialUsers;

    // 订单统计
    const [totalOrdersResult] = await db.query('SELECT COUNT(*) as count FROM orders');
    const [pendingOrdersResult] = await db.query("SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'");
    const [successOrdersResult] = await db.query("SELECT COUNT(*) as count FROM orders WHERE status = 'PAID'");
    const [todayOrdersResult] = await db.query(
      'SELECT COUNT(*) as count FROM orders WHERE createdAt >= ?',
      [todayStart]
    );

    // 收入统计
    const [revenueResult] = await db.query(
      "SELECT SUM(amount) as total FROM orders WHERE status = 'PAID'"
    );
    const [todayRevenueResult] = await db.query(
      "SELECT SUM(amount) as total FROM orders WHERE status = 'PAID' AND createdAt >= ?",
      [todayStart]
    );

    const totalRevenue = parseFloat(revenueResult[0].total) || 0;
    const todayRevenue = parseFloat(todayRevenueResult[0].total) || 0;

    // Rust+ 业务统计
    const [totalServersResult] = await db.query('SELECT COUNT(*) as count FROM servers');
    const [totalDevicesResult] = await db.query('SELECT COUNT(*) as count FROM devices');
    const [todayEventsResult] = await db.query(
      'SELECT COUNT(*) as count FROM event_logs WHERE createdAt >= ?',
      [todayStart]
    );
    const [totalEventLogsResult] = await db.query('SELECT COUNT(*) as count FROM event_logs');

    // 连接状态统计
    let connectedServers = 0;
    let fcmActiveUsers = 0;
    const activeConnections = globalServiceManager.userServices.size;

    for (const [userId, userService] of globalServiceManager.userServices) {
      if (userService.rustPlusService && userService.rustPlusService.connections) {
        connectedServers += userService.rustPlusService.connections.size;
      }
      if (userService.fcmService && userService.fcmService.isListening) {
        fcmActiveUsers++;
      }
    }

    res.json({
      success: true,
      data: {
        // 用户统计
        totalUsers,
        activeUsers,
        trialUsers,
        paidUsers,
        bannedUsers,
        pendingUsers,

        // 订阅统计
        expiringSoonUsers,
        expiredUsers,

        // 订单统计
        totalOrders: totalOrdersResult[0].count,
        pendingOrders: pendingOrdersResult[0].count,
        successOrders: successOrdersResult[0].count,
        totalRevenue,
        todayRevenue,
        todayOrders: todayOrdersResult[0].count,

        // Rust+ 业务统计
        totalServers: totalServersResult[0].count,
        connectedServers,
        totalDevices: totalDevicesResult[0].count,
        activeConnections,
        fcmActiveUsers,

        // 事件统计
        todayEvents: todayEventsResult[0].count,
        totalEventLogs: totalEventLogsResult[0].count
      }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取统计数据失败'
    });
  }
});

/**
 * GET /api/admin/system
 * 获取系统运行状态
 */
router.get('/system', async (req, res) => {
  try {
    const uptime = process.uptime() * 1000; // 转换为毫秒
    const memoryUsage = process.memoryUsage();

    res.json({
      success: true,
      data: {
        uptime,
        activeUserServices: globalServiceManager.userServices.size,
        memoryUsage: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal
        },
        globalServiceManager: {
          userCount: globalServiceManager.userServices.size,
          subscriptionCheckInterval: globalServiceManager.CHECK_INTERVAL
        },
        nodeVersion: process.version,
        platform: process.platform
      }
    });
  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取系统状态失败'
    });
  }
});

/**
 * GET /api/admin/distributed/status
 * 获取分布式节点状态总览（子节点运行情况）
 */
router.get('/distributed/status', async (req, res) => {
  try {
    const overview = await distributedSessionService.getNodeStatusOverview();
    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('获取分布式节点状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取分布式节点状态失败'
    });
  }
});

// ========== 套餐管理 API ==========

/**
 * GET /api/admin/plans
 * 获取所有套餐配置（包括禁用的）
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await paymentService.getPlans(true); // 包含禁用的套餐

    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('获取套餐列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取套餐列表失败'
    });
  }
});

/**
 * POST /api/admin/plans
 * 创建新套餐
 */
router.post('/plans', async (req, res) => {
  try {
    const { code, name, price, duration, description, features, sortOrder, isActive, highlighted } = req.body;

    // 验证必填字段
    if (!code || !name || price === undefined || !duration) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: code, name, price, duration'
      });
    }

    // 验证 code 格式（大写字母和下划线）
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: '套餐代码必须是大写字母开头，只能包含大写字母、数字和下划线'
      });
    }

    const plan = await paymentService.createPlan({
      code,
      name,
      price: parseFloat(price),
      duration: parseInt(duration),
      description,
      features: features || [],
      sortOrder: sortOrder || 0,
      isActive: isActive !== false,
      highlighted: highlighted || false
    });

    console.log(`📦 管理员创建套餐: ${name} (${code})`);

    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('创建套餐失败:', error);

    // 处理唯一约束错误
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: '套餐代码已存在'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || '创建套餐失败'
    });
  }
});

/**
 * PUT /api/admin/plans/:id
 * 更新套餐
 */
router.put('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, price, duration, description, features, sortOrder, isActive, highlighted } = req.body;

    // 验证 code 格式（如果提供）
    if (code && !/^[A-Z][A-Z0-9_]*$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: '套餐代码必须是大写字母开头，只能包含大写字母、数字和下划线'
      });
    }

    const plan = await paymentService.updatePlan(id, {
      code,
      name,
      price: price !== undefined ? parseFloat(price) : undefined,
      duration: duration !== undefined ? parseInt(duration) : undefined,
      description,
      features,
      sortOrder,
      isActive,
      highlighted
    });

    console.log(`📦 管理员更新套餐: ${plan.name} (${plan.code})`);

    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('更新套餐失败:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: '套餐不存在'
      });
    }

    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: '套餐代码已存在'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || '更新套餐失败'
    });
  }
});

/**
 * DELETE /api/admin/plans/:id
 * 删除套餐
 */
router.delete('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await paymentService.deletePlan(id);

    console.log(`📦 管理员删除套餐: ${id}`);

    res.json({
      success: true,
      message: '套餐已删除'
    });
  } catch (error) {
    console.error('删除套餐失败:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: '套餐不存在'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || '删除套餐失败'
    });
  }
});

/**
 * POST /api/admin/plans/init
 * 初始化默认套餐
 */
router.post('/plans/init', async (req, res) => {
  try {
    await paymentService.initDefaultPlans();

    res.json({
      success: true,
      message: '默认套餐初始化完成'
    });
  } catch (error) {
    console.error('初始化套餐失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '初始化套餐失败'
    });
  }
});

export default router;
