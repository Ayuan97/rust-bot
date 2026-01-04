import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * 获取用户订阅信息
 * GET /api/user/subscription
 */
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: '未找到订阅信息',
      });
    }

    return res.json({
      success: true,
      subscription,
    });
  } catch (error) {
    console.error('获取订阅信息失败:', error);
    return res.status(500).json({
      success: false,
      error: '获取订阅信息失败',
    });
  }
});

/**
 * 更新用户信息
 * PUT /api/user/profile
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email } = req.body;

    // 验证输入
    if (username && username.length < 3) {
      return res.status(400).json({
        success: false,
        error: '用户名至少需要 3 个字符',
      });
    }

    // 检查邮箱是否已被使用
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: '该邮箱已被使用',
        });
      }
    }

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(email && { email }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    return res.status(500).json({
      success: false,
      error: '更新用户信息失败',
    });
  }
});

/**
 * 修改密码
 * POST /api/user/change-password
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    // 验证输入
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: '新密码至少需要 6 个字符',
      });
    }

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在',
      });
    }

    // 验证旧密码
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: '当前密码错误',
      });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    return res.status(500).json({
      success: false,
      error: '修改密码失败',
    });
  }
});

/**
 * 删除账号
 * POST /api/user/delete-account
 */
router.post('/delete-account', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    // 验证输入
    if (!password) {
      return res.status(400).json({
        success: false,
        error: '请输入密码以确认删除',
      });
    }

    // 获取用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在',
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: '密码错误',
      });
    }

    // 删除用户（级联删除相关数据）
    await prisma.user.delete({
      where: { id: userId },
    });

    return res.json({
      success: true,
      message: '账号已删除',
    });
  } catch (error) {
    console.error('删除账号失败:', error);
    return res.status(500).json({
      success: false,
      error: '删除账号失败',
    });
  }
});

export default router;
