/**
 * 用户认证路由
 * 包含注册、登录、获取当前用户信息等功能
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// JWT 过期时间：7天
const JWT_EXPIRES_IN = '7d';

// 密码加密轮数
const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', async (req, res) => {
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

    // 验证密码长度
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: '密码长度至少为 6 个字符'
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
    const existingUserByUsername = await prisma.users.findUnique({
      where: { username }
    });

    if (existingUserByUsername) {
      return res.status(409).json({
        success: false,
        error: '用户名已被占用'
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 创建用户（无有效订阅，需管理员审核后赠送时长）
    const user = await prisma.users.create({
      data: {
        id: uuidv4(),
        username,
        password: hashedPassword,
        subscriptions: {
          create: {
            id: uuidv4(),
            planType: 'TRIAL',
            endDate: new Date(), // 到期时间为当前，等待管理员审核
            updatedAt: new Date()
          }
        },
        notification_settings: {
          create: {
            id: uuidv4(),
            settings: {
              player_death: true,
              player_online: true,
              player_offline: true,
              player_afk: true,
              cargo_spawn: true,
              heli_spawn: true,
              oil_rig_triggered: true
            },
            updatedAt: new Date()
          }
        },
        updatedAt: new Date()
      },
      include: {
        subscriptions: true
      }
    });

    // 生成 JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          subscriptions: {
            planType: user.subscriptions.planType,
            endDate: user.subscriptions.endDate
          },
          createdAt: user.createdAt
        }
      }
    });
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
router.post('/login', async (req, res) => {
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
    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { username },
          { email: username }
        ]
      },
      include: {
        subscriptions: true
      }
    });

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
    await prisma.users.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

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
          isAdmin: user.isAdmin,
          subscriptions: user.subscriptions ? {
            planType: user.subscriptions.planType,
            endDate: user.subscriptions.endDate,
            isExpired: new Date() > user.subscriptions.endDate
          } : null,
          lastLogin: new Date()
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
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: true,
        servers: {
          select: {
            id: true,
            name: true,
            createdAt: true
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

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        subscriptions: user.subscriptions ? {
          planType: user.subscriptions.planType,
          startDate: user.subscriptions.startDate,
          endDate: user.subscriptions.endDate,
          isExpired: new Date() > user.subscriptions.endDate,
          autoRenew: user.subscriptions.autoRenew
        } : null,
        servers: user.servers,
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
