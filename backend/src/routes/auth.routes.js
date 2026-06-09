/**
 * 用户认证路由
 * 包含注册、登录、获取当前用户信息等功能
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db, { getConnection } from '../lib/db.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rate-limiter.js';
import { v4 as uuidv4 } from 'uuid';
import appConfigService from '../services/app-config.service.js';
import globalServiceManager from '../services/global-manager.service.js';

const router = express.Router();

// JWT 过期时间：7天
const JWT_EXPIRES_IN = '7d';

// 密码加密轮数
const SALT_ROUNDS = 10;

// 注册限流：每分钟最多 30 次/IP。放宽到 30 是给推广期 + CGNAT(移动网络)共享 IP 的多人同时注册留余量；
// 批量/机器人注册另有"注册审核模式"兜底，不靠限流卡死正常用户。
const registerLimiter = rateLimit({
  limit: 30,
  windowMs: 60 * 1000,
  message: '注册尝试过于频繁，请稍后再试'
});

// 登录限流：按“客户端 IP + 用户名”做限制，避免同 IP 下不同用户互相误伤
const loginLimiter = rateLimit({
  limit: 20,
  windowMs: 60 * 1000,
  message: '登录尝试过于频繁，请稍后再试',
  keyGenerator: (req, clientIp) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    return username ? `login:${clientIp}:${username}` : `login:${clientIp}`;
  }
});

// 纯账号维度限流：堵住"换 IP / 代理池狂试同一个账号"的暴力破解（与上面 IP+账号限流叠加）
const loginUserLimiter = rateLimit({
  limit: 15,
  windowMs: 10 * 60 * 1000,
  message: '该账号登录尝试过于频繁，请 10 分钟后再试',
  keyGenerator: (req, clientIp) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    return username ? `loginuser:${username}` : `loginip:${clientIp}`;
  }
});

/**
 * GET /api/auth/registration-info
 * 公开：当前注册模式与免费策略，供注册页动态展示提示
 */
router.get('/registration-info', (req, res) => {
  const cfg = appConfigService.getConfig();
  res.json({
    success: true,
    data: {
      mode: cfg.registrationMode,
      freeTrialEnabled: cfg.freeTrialEnabled,
      freeTrialDays: cfg.freeTrialDays
    }
  });
});

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    // 验证必填字段
    if (!username || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: '请填写所有必填字段'
      });
    }

    // 验证用户名长度
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        success: false,
        error: '用户名长度必须在 3-50 个字符之间'
      });
    }

    // 验证用户名格式（字母、数字、下划线）
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: '用户名只能包含字母、数字和下划线'
      });
    }

    // 验证密码强度（运营前加固：长度 + 字母数字组合，降低弱口令被暴破的成功率）
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: '密码长度至少为 8 个字符'
      });
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: '密码需同时包含字母和数字'
      });
    }

    // 验证两次密码是否一致
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: '两次输入的密码不一致'
      });
    }

    // 检查用户名是否已存在
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        error: '用户名已被占用'
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 读取运营开关：注册模式 + 免费试用
    const cfg = appConfigService.getConfig();
    const isApprovalMode = cfg.registrationMode === 'approval';
    const approvalStatus = isApprovalMode ? 'PENDING' : 'APPROVED';
    // 仅在「开放注册即用」且免费试用开启时注册即发放 N 天；
    // 审核模式下到期时间留到「审核通过」再发，避免排队期间白白消耗时长
    const grantTrial = !isApprovalMode && cfg.freeTrialEnabled;

    // 使用事务创建用户、订阅和通知设置
    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      const userId = uuidv4();
      const subscriptionId = uuidv4();
      const notificationSettingsId = uuidv4();
      const now = new Date();
      const subscriptionEndDate = grantTrial
        ? new Date(now.getTime() + cfg.freeTrialDays * 24 * 60 * 60 * 1000)
        : now;

      // 创建用户
      await conn.query(
        `INSERT INTO users (id, username, password, approvalStatus, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, username, hashedPassword, approvalStatus, now, now]
      );

      // 创建订阅（开放注册+试用 → 发放 N 天；否则到期=现在，待付费/待审核再发放）
      await conn.query(
        `INSERT INTO subscriptions (id, userId, planType, endDate, createdAt, updatedAt)
         VALUES (?, ?, 'TRIAL', ?, ?, ?)`,
        [subscriptionId, userId, subscriptionEndDate, now, now]
      );

      // 创建通知设置
      const defaultSettings = {
        player_death: true,
        player_online: true,
        player_offline: true,
        player_afk: true,
        cargo_spawn: true,
        heli_spawn: true,
        oil_rig_triggered: true
      };
      await conn.query(
        `INSERT INTO notification_settings (id, userId, settings, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [notificationSettingsId, userId, JSON.stringify(defaultSettings), now, now]
      );

      await conn.commit();

      // 注册即用：开放注册 + 已发放试用 → 立即拉起用户服务实例（与管理员建号一致；失败不阻塞注册）
      if (approvalStatus === 'APPROVED' && subscriptionEndDate > now) {
        try {
          await globalServiceManager.createUserService(userId);
        } catch (serviceError) {
          console.error(`注册后拉起用户服务失败（userId=${userId}）:`, serviceError.message);
        }
      }

      // 生成 JWT token
      const token = jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.status(201).json({
        success: true,
        message: isApprovalMode ? '注册成功，请等待管理员审核开通' : '注册成功',
        data: {
          token,
          user: {
            id: userId,
            username,
            isAdmin: false,
            approvalStatus,
            subscriptions: {
              planType: 'TRIAL',
              endDate: subscriptionEndDate
            },
            createdAt: now
          }
        }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      error: '注册失败，请稍后重试'
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', loginLimiter, loginUserLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '请输入用户名和密码'
      });
    }

    // 查找用户（支持用户名或邮箱登录）
    const [rows] = await db.query(`
      SELECT
        u.id, u.username, u.email, u.password, u.isActive, u.isAdmin, u.approvalStatus,
        s.planType as sub_planType, s.endDate as sub_endDate
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.userId
      WHERE u.username = ? OR u.email = ?
    `, [username, username]);

    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }

    // 检查账号是否被禁用
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: '账号已被禁用，请联系管理员'
      });
    }

    // 更新最后登录时间
    const now = new Date();
    await db.query(
      'UPDATE users SET lastLogin = ? WHERE id = ?',
      [now, user.id]
    );

    // 生成 JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: !!user.isAdmin,
          approvalStatus: user.approvalStatus,
          subscriptions: user.sub_planType ? {
            planType: user.sub_planType,
            endDate: user.sub_endDate,
            isExpired: new Date() > user.sub_endDate
          } : null,
          lastLogin: now
        }
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      error: '登录失败，请稍后重试'
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // 获取用户信息和订阅
    const [userRows] = await db.query(`
      SELECT
        u.id, u.username, u.email, u.isAdmin, u.isActive, u.approvalStatus, u.createdAt, u.lastLogin,
        s.planType as sub_planType, s.startDate as sub_startDate, s.endDate as sub_endDate, s.autoRenew as sub_autoRenew
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.userId
      WHERE u.id = ?
    `, [req.user.id]);

    const user = userRows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 获取服务器列表
    const [servers] = await db.query(
      'SELECT id, name, createdAt FROM servers WHERE userId = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: !!user.isAdmin,
        isActive: !!user.isActive,
        approvalStatus: user.approvalStatus,
        subscriptions: user.sub_planType ? {
          planType: user.sub_planType,
          startDate: user.sub_startDate,
          endDate: user.sub_endDate,
          isExpired: new Date() > user.sub_endDate,
          autoRenew: !!user.sub_autoRenew
        } : null,
        servers,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      error: '获取用户信息失败'
    });
  }
});

/**
 * POST /api/auth/logout
 * 用户登出（客户端需删除 token）
 */
router.post('/logout', authenticate, (req, res) => {
  // JWT 是无状态的，登出只需要客户端删除 token
  // 这里可以记录登出日志或执行其他清理操作
  res.json({
    success: true,
    message: '登出成功'
  });
});

export default router;
