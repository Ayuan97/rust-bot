/**
 * 管理后台 API 路由
 * 所有接口需要管理员权限
 */

import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import db from '../lib/db.js';
import globalServiceManager from '../services/global-manager.service.js';
import paymentService from '../services/payment.service.js';

const router = express.Router();

// 所有管理接口都需要管理员权限
router.use(authenticate, requireAdmin);

/**
 * PUT /api/admin/users/:id/adjust
 * 资产调整：加减余额、加减服务时间
 */
router.put('/users/:id/adjust', async (req, res) => {
  try {
    const { id } = req.params;
    const { balanceDelta, daysDelta, reason } = req.body;
    const adminId = req.user.id;

    // 1. 获取当前状态
    const [userRows] = await db.query(
      'SELECT u.*, s.id as subscriptionId, s.endDate as subscriptionEndDate FROM users u LEFT JOIN subscriptions s ON u.id = s.userId WHERE u.id = ?',
      [id]
    );
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    const logDetails = { reason, before: {}, after: {} };

    // 2. 调整余额
    if (balanceDelta !== undefined && balanceDelta !== 0) {
      const oldBalance = parseFloat(user.balance);
      const newBalance = Math.max(0, oldBalance + parseFloat(balanceDelta));

      await db.query(
        'UPDATE users SET balance = ?, updatedAt = NOW() WHERE id = ?',
        [newBalance, id]
      );

      // 记录交易流水
      await db.query(
        `INSERT INTO orders (id, userId, type, amount, balanceBefore, balanceAfter, status, notes, createdAt, updatedAt)
         VALUES (?, ?, 'ADMIN_ADJUST', ?, ?, ?, 'PAID', ?, NOW(), NOW())`,
        [`ADJ_${Date.now()}`, id, parseFloat(balanceDelta), oldBalance, newBalance, `管理员手动调整: ${reason || '无备注'}`]
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

      await db.query(
        'UPDATE subscriptions SET endDate = ?, updatedAt = NOW() WHERE userId = ?',
        [newEndDate, id]
      );

      logDetails.before.endDate = user.subscriptionEndDate || null;
      logDetails.after.endDate = newEndDate;

      // 如果加了时间且服务没跑，启动它
      if (daysDelta > 0 && user.isActive && !globalServiceManager.userServices.has(id)) {
        await globalServiceManager.createUserService(id);
      }
    }

    // 4. 记录管理员日志
    await db.query(
      `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
       VALUES (?, ?, ?, 'ADJUST_ASSETS', ?, NOW())`,
      [`AL_${Date.now()}`, adminId, id, JSON.stringify(logDetails)]
    );

    res.json({ success: true, message: '资产调整成功' });
  } catch (error) {
    console.error('资产调整失败:', error);
    res.status(500).json({ success: false, error: '资产调整失败' });
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
          planId: user.planId,
          planType: user.planType,
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
      `SELECT u.*, s.id as subscriptionId, s.planId, s.planType, s.startDate, s.endDate
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
        planId: user.planId,
        planType: user.planType,
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

    // 获取服务器数量
    const [serverCountResult] = await db.query(
      'SELECT COUNT(*) as count FROM servers WHERE userId = ?',
      [id]
    );

    // 6. 删除数据库记录（手动级联删除）
    // 先删除关联数据
    const [serverIds] = await db.query('SELECT id FROM servers WHERE userId = ?', [id]);
    if (serverIds.length > 0) {
      const serverIdList = serverIds.map(s => s.id);
      await db.query(`DELETE FROM devices WHERE serverId IN (?)`, [serverIdList]);
      await db.query(`DELETE FROM event_logs WHERE serverId IN (?)`, [serverIdList]);
    }
    await db.query('DELETE FROM servers WHERE userId = ?', [id]);
    await db.query('DELETE FROM orders WHERE userId = ?', [id]);
    await db.query('DELETE FROM subscriptions WHERE userId = ?', [id]);
    await db.query('DELETE FROM notification_settings WHERE userId = ?', [id]);
    await db.query('DELETE FROM event_predictions WHERE userId = ?', [id]);
    await db.query('DELETE FROM extended_teammates WHERE userId = ?', [id]);
    await db.query('DELETE FROM users WHERE id = ?', [id]);

    // 7. 记录管理员操作日志
    await db.query(
      `INSERT INTO admin_logs (id, adminId, targetUserId, action, details, createdAt)
       VALUES (?, ?, ?, 'DELETE_USER', ?, NOW())`,
      [
        `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
