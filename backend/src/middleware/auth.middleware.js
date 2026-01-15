/**
 * JWT 认证中间件
 * 用于保护需要登录才能访问的路由
 */

import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

/**
 * 验证 JWT Token
 * 从请求头的 Authorization 字段中提取 token 并验证
 */
export const authenticate = async (req, res, next) => {
  try {
    // 获取 Authorization 头
    const authHeader = req.headers.authorization;

    // 也支持从查询参数获取 token（用于图片等资源请求）
    const queryToken = req.query.token;

    let token = null;

    if (authHeader) {
      // 格式: "Bearer <token>"
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    // 如果 header 中没有有效 token，尝试从查询参数获取
    if (!token && queryToken) {
      token = queryToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      });
    }

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 从数据库获取用户信息
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId },
      include: {
        subscriptions: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 检查用户是否被禁用
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: '账号已被禁用'
      });
    }

    // 计算订阅状态（不拦截，只标记）
    const isSubscriptionExpired = !user.subscriptions || new Date() > user.subscriptions.endDate;

    // 将用户信息附加到请求对象
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      subscriptions: user.subscriptions,
      isSubscriptionExpired  // 订阅过期标记
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: '认证令牌已过期'
      });
    }

    console.error('认证中间件错误:', error);
    return res.status(500).json({
      success: false,
      error: '认证失败'
    });
  }
};

/**
 * 可选认证中间件
 * 如果提供了 token 则验证，否则继续执行
 * 用于某些既可以登录也可以不登录访问的路由
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  // 如果提供了 token，则验证
  return authenticate(req, res, next);
};

/**
 * 管理员权限验证中间件
 * 必须配合 authenticate 使用
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '请先登录'
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: '需要管理员权限'
    });
  }

  next();
};

/**
 * 检查订阅是否有效
 * 必须配合 authenticate 使用
 * 用于需要有效订阅才能执行的操作（如连接服务器、控制设备等）
 */
export const requireActiveSubscription = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '请先登录'
    });
  }

  if (!req.user.subscriptions) {
    return res.status(403).json({
      success: false,
      error: '未找到订阅信息，请先订阅',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }

  if (new Date() > req.user.subscriptions.endDate) {
    return res.status(403).json({
      success: false,
      error: '订阅已过期，续费后即可继续使用此功能',
      code: 'SUBSCRIPTION_EXPIRED'
    });
  }

  next();
};
