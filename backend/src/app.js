import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// 加载环境变量（必须在其他导入之前）
dotenv.config();

// 环境变量验证
import { validateEnv } from './utils/env-validator.js';
validateEnv();

// 新的多租户服务管理器
import globalServiceManager from './services/global-manager.service.js';
import websocketService from './services/websocket.service.js';
import battlemetricsScheduler from './services/battlemetrics-scheduler.service.js';

// 路由
import serverRoutes from './routes/server.routes.js';
import pairingRoutes from './routes/pairing.routes.js';
import proxyRoutes from './routes/proxy.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import authRoutes from './routes/auth.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import fcmRoutes from './routes/fcm.routes.js';
import predictionRoutes from './routes/prediction.routes.js';

// 中间件
import { apiLimiter, authLimiter } from './middleware/rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 确保数据目录存在
const dataDir = join(__dirname, '../data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const app = express();
const server = createServer(app);

// 设置 server 超时，加速优雅关闭
server.keepAliveTimeout = 5000;
server.headersTimeout = 6000;

// 中间件 - 允许所有来源跨域访问
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());

// 全局速率限制
app.use('/api', apiLimiter);

// 路由（认证路由使用更严格的限制）
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/pairing', pairingRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fcm', fcmRoutes);
app.use('/api/predictions', predictionRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  const activeUsers = globalServiceManager.getActiveUserCount();
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    activeUsers
  });
});

// 初始化 WebSocket - 允许所有来源
websocketService.initialize(server, '*');

// 启动服务器
const PORT = process.env.PORT || 3000;
let serverStarted = false;

server.listen(PORT, async () => {
  serverStarted = true;
  console.log(`
╔═══════════════════════════════════════╗
║   🎮 Rust+ Web Dashboard Backend    ║
║       (Multi-Tenant Architecture)    ║
║                                       ║
║   Server: http://localhost:${PORT}     ║
║   Status: ✅ Running                  ║
╚═══════════════════════════════════════╝
  `);

  try {
    // 初始化所有有效用户的服务
    console.log('\n🚀 初始化多租户服务管理器...\n');

    const result = await globalServiceManager.initializeAllActiveUsers();

    console.log('\n✅ 多租户服务初始化完成');
    console.log(`   成功: ${result.success} 个用户`);
    console.log(`   失败: ${result.failed} 个用户\n`);

    // 启动 Battlemetrics 调度器
    battlemetricsScheduler.setGlobalServiceManager(globalServiceManager);
    battlemetricsScheduler.start();

    // 监听全局服务管理器事件
    globalServiceManager.on('subscription:expiring:soon', (data) => {
      console.log(`⚠️  用户 ${data.username} 的订阅将在 ${data.daysLeft} 天后过期`);
      // TODO: 发送邮件通知
    });

    globalServiceManager.on('user:service:created', (data) => {
      console.log(`✅ 用户服务已创建: ${data.username}`);
    });

    globalServiceManager.on('user:service:removed', (data) => {
      console.log(`🗑️  用户服务已移除: ${data.userId} (${data.reason})`);
    });

  } catch (error) {
    console.error('❌ 多租户服务初始化失败:', error);
    console.error('   服务器将继续运行，但用户服务未启动');
  }
});

// 优雅关闭函数
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  // 防止重复关闭
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n📴 收到 ${signal} 信号，正在关闭...`);

  // 设置强制关闭超时（10秒，给多租户更多时间）
  const forceTimeout = setTimeout(() => {
    console.error('⏱️  关闭超时，强制退出');
    process.exit(0);
  }, 10000);

  try {
    // 0. 停止 Battlemetrics 调度器
    battlemetricsScheduler.stop();

    // 1. 停止所有用户服务（最重要的清理）
    try {
      console.log('\n🛑 停止所有用户服务...');
      await globalServiceManager.shutdownAll();
      console.log('✅ 所有用户服务已停止');
    } catch (err) {
      console.warn('⚠️  停止用户服务失败:', err.message);
    }

    // 2. 关闭 Socket.IO
    try {
      const io = websocketService.getIO();
      if (io) {
        io.disconnectSockets(true); // 强制断开所有连接
        io.close();
        console.log('✅ WebSocket 已关闭');
      }
    } catch (err) {
      console.warn('⚠️  关闭 WebSocket 失败:', err.message);
    }

    // 3. 关闭 HTTP Server（只在服务器已启动时）
    if (serverStarted && server.listening) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('✅ HTTP 服务器已关闭');
          resolve();
        });
        // 如果 2 秒内没有关闭，强制继续
        setTimeout(resolve, 2000);
      });
    }

    clearTimeout(forceTimeout);
    console.log('\n✅ 优雅关闭完成\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ 关闭过程出错:', error);
    clearTimeout(forceTimeout);
    process.exit(0); // 即使出错也返回 0，让 nodemon 正常重启
  }
};

// 监听关闭信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 监听未捕获的异常（但不要在启动阶段触发优雅关闭）
process.on('uncaughtException', (error) => {
  // 详细记录错误信息，确保能看到完整堆栈
  console.error('========================================');
  console.error('[FATAL] 未捕获的异常:');
  console.error('  消息:', error?.message || error);
  console.error('  类型:', error?.name || typeof error);
  console.error('  堆栈:', error?.stack || '无堆栈信息');
  console.error('========================================');

  // 如果是端口占用错误且服务器还没启动，直接退出让 nodemon 重试
  if (error.code === 'EADDRINUSE' && !serverStarted) {
    console.error('端口被占用，等待重试...');
    process.exit(1);
  } else if (serverStarted) {
    gracefulShutdown('uncaughtException');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('========================================');
  console.error('[FATAL] 未处理的 Promise rejection:');
  console.error('  原因:', reason?.message || reason);
  console.error('  堆栈:', reason?.stack || '无堆栈信息');
  console.error('========================================');
  if (serverStarted) {
    gracefulShutdown('unhandledRejection');
  }
});
