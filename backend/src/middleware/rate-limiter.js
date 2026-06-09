/**
 * 速率限制中间件
 * 防止 API 被滥用或 DDoS 攻击
 */

/**
 * 简单的内存速率限制器
 * 生产环境建议使用 Redis 实现
 */
class RateLimiter {
  constructor() {
    this.requests = new Map();
    // 每 5 分钟清理一次过期记录
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 检查是否超过限制
   * @param {string} key - 限制键（IP 或 userId）
   * @param {number} limit - 允许的请求数
   * @param {number} windowMs - 时间窗口（毫秒）
   * @returns {object} { allowed: boolean, remaining: number, resetTime: number }
   */
  check(key, limit, windowMs) {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      // 新窗口
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return { allowed: true, remaining: limit - 1, resetTime: now + windowMs };
    }

    if (record.count >= limit) {
      return { allowed: false, remaining: 0, resetTime: record.resetTime };
    }

    record.count++;
    return { allowed: true, remaining: limit - record.count, resetTime: record.resetTime };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

const limiter = new RateLimiter();

/**
 * 创建速率限制中间件
 * @param {object} options 配置选项
 * @param {number} options.limit - 时间窗口内允许的最大请求数（默认 100）
 * @param {number} options.windowMs - 时间窗口毫秒数（默认 60000 = 1分钟）
 * @param {string|Function} options.keyGenerator - 生成限制键的方式：'ip'、'user' 或自定义函数
 * @param {string} options.message - 超限时的错误消息
 */
export function rateLimit(options = {}) {
  const {
    limit = 100,
    windowMs = 60 * 1000,
    keyGenerator = 'ip',
    message = '请求过于频繁，请稍后再试'
  } = options;

  return (req, res, next) => {
    // 生成限制键
    let key;
    const clientIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';

    if (typeof keyGenerator === 'function') {
      key = keyGenerator(req, clientIp);
    } else if (keyGenerator === 'user' && req.user) {
      key = `user:${req.user.id}`;
    } else {
      key = `ip:${clientIp}`;
    }

    // 防止自定义 keyGenerator 返回空值，回退到 IP 限流
    if (!key || typeof key !== 'string') {
      key = `ip:${clientIp}`;
    }

    const result = limiter.check(key, limit, windowMs);

    // 设置速率限制响应头
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * 预设的速率限制配置
 */

// 通用 API 限制：每分钟 1000 次/IP。放宽到 1000 是为了给运营商级 NAT(CGNAT，尤其手机网络)
// 后大量用户共享同一出口 IP 留足余量，避免误伤正常用户；单用户正常使用约 25 次/分钟。
export const apiLimiter = rateLimit({
  limit: 1000,
  windowMs: 60 * 1000,
  message: '请求过于频繁，请稍后再试'
});

// 认证接口限制：每分钟 20 次（防止暴力破解）
export const authLimiter = rateLimit({
  limit: 20,
  windowMs: 60 * 1000,
  message: '登录尝试过于频繁，请稍后再试'
});

// 敏感操作限制：每分钟 5 次
export const sensitiveLimiter = rateLimit({
  limit: 5,
  windowMs: 60 * 1000,
  message: '操作过于频繁，请稍后再试'
});

export default { rateLimit, apiLimiter, authLimiter, sensitiveLimiter };
