/**
 * 管理后台 API 路由
 * 所有接口需要管理员权限
 */

import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { PrismaClient } from '@prisma/client';
import globalServiceManager from '../services/global-manager.service.js';

const router = express.Router();
const prisma = new PrismaClient();

// 所有管理接口都需要管理员权限
router.use(authenticate, requireAdmin);

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
      status = '', // 'active', 'inactive', 'expired'
      planType = '' // 'TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // 构建查询条件
    const where = {};

    // 搜索条件（用户名或邮箱）
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { email: { contains: search } }
      ];
    }

    // 状态筛选
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    // 订阅类型筛选
    if (planType) {
      where.subscription = {
        planType: planType
      };
    }

    // 过期用户筛选
    if (status === 'expired') {
      where.subscription = {
        endDate: {
          lt: new Date()
        }
      };
    }

    // 查询用户
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        include: {
          subscription: true,
          _count: {
            select: {
              servers: true,
              orders: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.user.count({ where })
    ]);

    // 获取服务运行状态
    const usersWithStatus = users.map(user => {
      const serviceStatus = {
        isServiceRunning: globalServiceManager.userServices.has(user.id),
        connectedServers: [],
        fcmListening: false
      };

      if (serviceStatus.isServiceRunning) {
        const userService = globalServiceManager.userServices.get(user.id);
        if (userService.rustPlusService && userService.rustPlusService.connections) {
          serviceStatus.connectedServers = Array.from(userService.rustPlusService.connections.keys());
        }
        if (userService.fcmService) {
          serviceStatus.fcmListening = userService.fcmService.isListening;
        }
      }

      return {
        ...user,
        serverCount: user._count.servers,
        orderCount: user._count.orders,
        serviceStatus,
        _count: undefined
      };
    });

    res.json({
      success: true,
      data: {
        users: usersWithStatus,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / take)
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

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
        servers: {
          include: {
            _count: {
              select: { devices: true }
            }
          }
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            servers: true,
            orders: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 计算总消费
    const totalSpent = user.orders
      .filter(order => order.status === 'PAID')
      .reduce((sum, order) => sum + parseFloat(order.amount), 0);

    // 手动计算事件日志数量（通过用户的所有服务器）
    const userServerIds = await prisma.server.findMany({
      where: { userId: id },
      select: { id: true }
    });

    const eventCount = await prisma.eventLog.count({
      where: {
        serverId: {
          in: userServerIds.map(s => s.id)
        }
      }
    });

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

    res.json({
      success: true,
      data: {
        user,
        stats: {
          serverCount: user._count.servers,
          eventCount: eventCount,
          orderCount: user._count.orders,
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

    // 更新用户状态
    const user = await prisma.user.update({
      where: { id },
      data: { isActive }
    });

    // 如果禁用用户，停止其服务
    if (!isActive && globalServiceManager.userServices.has(id)) {
      await globalServiceManager.removeUserService(id);
      console.log(`管理员禁用用户 ${user.username}，已停止服务`);
    }

    // 如果启用用户且订阅有效，创建服务
    if (isActive && !globalServiceManager.userServices.has(id)) {
      const userWithSub = await prisma.user.findUnique({
        where: { id },
        include: { subscription: true }
      });

      if (userWithSub.subscription && new Date() < userWithSub.subscription.endDate) {
        await globalServiceManager.createUserService(id);
        console.log(`管理员启用用户 ${user.username}，已创建服务`);
      }
    }

    res.json({
      success: true,
      message: isActive ? '用户已启用' : '用户已禁用',
      data: user
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
    const subscription = await prisma.subscription.update({
      where: { userId: id },
      data: { endDate: newEndDate }
    });

    // 如果订阅有效且服务未运行，创建服务
    const user = await prisma.user.findUnique({ where: { id } });
    if (user.isActive && new Date() < newEndDate && !globalServiceManager.userServices.has(id)) {
      await globalServiceManager.createUserService(id);
      console.log(`管理员延长用户 ${user.username} 订阅，已创建服务`);
    }

    res.json({
      success: true,
      message: '订阅时间已更新',
      data: subscription
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

    const servers = await prisma.server.findMany({
      where: { userId: id },
      include: {
        _count: {
          select: { devices: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

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
        deviceCount: server._count.devices,
        connected,
        _count: undefined
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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [events, total] = await Promise.all([
      prisma.eventLog.findMany({
        where: { userId: id },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.eventLog.count({ where: { userId: id } })
    ]);

    res.json({
      success: true,
      data: {
        events,
        total,
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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              username: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        orders,
        total,
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
    const [
      totalUsers,
      activeUsers,
      trialUsers,
      bannedUsers,
      expiringSoonUsers,
      expiredUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({
        where: {
          subscription: { planType: 'TRIAL' }
        }
      }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({
        where: {
          subscription: {
            endDate: {
              gte: now,
              lte: sevenDaysLater
            }
          }
        }
      }),
      prisma.user.count({
        where: {
          subscription: {
            endDate: { lt: now }
          }
        }
      })
    ]);

    const paidUsers = totalUsers - trialUsers;

    // 订单统计
    const [
      totalOrders,
      pendingOrders,
      successOrders,
      todayOrders
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'PAID' } }),
      prisma.order.count({
        where: {
          createdAt: { gte: todayStart }
        }
      })
    ]);

    // 收入统计
    const successOrdersData = await prisma.order.findMany({
      where: { status: 'PAID' },
      select: { amount: true, createdAt: true }
    });

    const totalRevenue = successOrdersData.reduce((sum, order) => sum + parseFloat(order.amount), 0);
    const todayRevenue = successOrdersData
      .filter(order => order.createdAt >= todayStart)
      .reduce((sum, order) => sum + parseFloat(order.amount), 0);

    // Rust+ 业务统计
    const [totalServers, totalDevices, todayEvents, totalEventLogs] = await Promise.all([
      prisma.server.count(),
      prisma.device.count(),
      prisma.eventLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.eventLog.count()
    ]);

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
        totalOrders,
        pendingOrders,
        successOrders,
        totalRevenue,
        todayRevenue,
        todayOrders,

        // Rust+ 业务统计
        totalServers,
        connectedServers,
        totalDevices,
        activeConnections,
        fcmActiveUsers,

        // 事件统计
        todayEvents,
        totalEventLogs
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

export default router;
