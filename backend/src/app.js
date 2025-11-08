import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import websocketService from './services/websocket.service.js';
import fcmService from './services/fcm.service.js';
import configStorage from './models/config.model.js';
import storage from './models/storage.model.js';
import rustPlusService from './services/rustplus.service.js';
import battlemetricsService from './services/battlemetrics.service.js';

import serverRoutes from './routes/server.routes.js';
import pairingRoutes from './routes/pairing.routes.js';

// 加载环境变量
dotenv.config();

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

// 路由
app.use('/api/servers', serverRoutes);
app.use('/api/pairing', pairingRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 初始化 WebSocket - 允许所有来源
websocketService.initialize(server, '*');

// 初始化 FCM 服务
let fcmInitialized = false;
const initializeFCM = async () => {
  try {
    console.log('\n🔐 初始化 FCM 服务...\n');

    // 只注册一次事件监听器，避免重复监听
    if (!fcmInitialized) {
      fcmInitialized = true;
      
      // 首先注册所有事件监听器（必须在启动监听之前注册）
      // 监听服务器配对事件
      fcmService.on('server:paired', async (serverInfo) => {
      console.log('🎮 新服务器配对:', serverInfo.name);

      // 保存服务器信息
      try {
        storage.addServer({
          id: serverInfo.id,
          name: serverInfo.name,
          ip: serverInfo.ip,
          port: serverInfo.port,
          playerId: serverInfo.playerId,
          playerToken: serverInfo.playerToken,
          battlemetricsId: null, // 稍后异步获取
        });

        console.log('✅ 服务器信息已保存');
      } catch (error) {
        console.error('❌ 保存服务器失败:', error);
        return;
      }

      // 通知前端（无论连接是否成功）
      websocketService.broadcast('server:paired', serverInfo);

      // 在后台异步查找 Battlemetrics ID（不阻塞配对流程）
      setImmediate(async () => {
        try {
          console.log('🔍 后台查找 Battlemetrics 信息...');
          const battlemetricsId = await battlemetricsService.searchServerByAddress(serverInfo.ip, serverInfo.port);
          if (battlemetricsId) {
            storage.updateServer(serverInfo.id, { battlemetrics_id: battlemetricsId });
            console.log('✅ Battlemetrics ID 已更新:', battlemetricsId);
          }
        } catch (error) {
          console.error('❌ 查找 Battlemetrics 失败:', error.message);
        }
      });

      // 尝试自动连接到服务器（不阻塞）
      try {
        console.log('🔌 尝试连接到服务器...');
        await rustPlusService.connect({
          serverId: serverInfo.id,
          ip: serverInfo.ip,
          port: serverInfo.port,
          playerId: serverInfo.playerId,
          playerToken: serverInfo.playerToken,
        });

        console.log('✅ 已自动连接到服务器');
        websocketService.broadcast('server:connected', { serverId: serverInfo.id });
      } catch (error) {
        console.error('⚠️  自动连接服务器失败:', error.message);
        console.log('💡 提示: 可以稍后在 Web 界面手动连接');
      }
    });

    // 监听设备配对事件
    fcmService.on('entity:paired', (entityInfo) => {
      console.log('🔌 新设备配对:', entityInfo);

      // 保存设备信息
      try {
        storage.addDevice({
          serverId: entityInfo.serverId,
          entityId: entityInfo.entityId,
          name: entityInfo.entityName || `设备 ${entityInfo.entityId}`,
          type: entityInfo.entityType || 'unknown',
        });

        console.log('✅ 设备信息已保存');

        // 通过 WebSocket 通知前端
        websocketService.broadcast('entity:paired', entityInfo);
      } catch (error) {
        console.error('❌ 保存设备失败:', error);
      }
    });

    // 监听玩家登录事件
    fcmService.on('player:login', (loginInfo) => {
      console.log('👤 玩家登录:', loginInfo);
      websocketService.broadcast('player:login', loginInfo);
    });

    // 监听玩家死亡事件
    fcmService.on('player:death', (deathInfo) => {
      console.log('💀 玩家死亡:', deathInfo);
      websocketService.broadcast('player:death', deathInfo);
    });

    // 监听智能警报
    fcmService.on('alarm', (alarmInfo) => {
      console.log('🚨 智能警报:', alarmInfo);
      websocketService.broadcast('alarm', alarmInfo);
    });

    // 监听其他通知
    fcmService.on('notification', (notificationInfo) => {
      console.log('📬 通知:', notificationInfo);
      websocketService.broadcast('notification', notificationInfo);
    });
    }

    // 加载凭证并启动监听
    // 1. 优先使用数据库中已保存的凭证
    const savedCredentials = configStorage.getFCMCredentials();
    if (savedCredentials) {
      console.log('✅ 找到已保存的 FCM 凭证');
      fcmService.loadCredentials(savedCredentials);
      await fcmService.startListening();
      console.log('');
      return;
    }

    // 2. 尝试从 rustplus CLI 加载凭证
    console.log('📂 尝试从 rustplus CLI 加载凭证...');
    const fromCLI = await fcmService.loadFromRustPlusCLI();
    if (fromCLI) {
      configStorage.saveFCMCredentials(fcmService.getCredentials());
      await fcmService.startListening();
      console.log('');
      return;
    }

    // 3. 提示用户需要配置凭证
    console.log('\n⚠️  未找到 FCM 凭证，需要先获取凭证才能使用配对功能\n');
    console.log('💡 方式 1 - 使用 rustplus CLI（推荐）:');
    console.log('   1. 运行: npm install -g @liamcottle/rustplus.js');
    console.log('   2. 运行: rustplus-pairing-server');
    console.log('   3. 在手机 Rust+ App 中扫描二维码');
    console.log('   4. 凭证会自动保存到 ~/.rustplus/credentials');
    console.log('   5. 重启本项目，会自动加载凭证\n');
    console.log('💡 方式 2 - 通过 Web 界面手动输入:');
    console.log('   访问 http://localhost:5173 点击"输入凭证"\n');
    console.log('💡 方式 3 - 使用 /api/pairing/start（不推荐）:');
    console.log('   会生成新凭证，但未关联 Steam 账号，无法接收推送\n');
  } catch (error) {
    console.error('❌ FCM 初始化失败:', error);
  }
};

// 设置玩家事件自动通知
const setupPlayerEventNotifications = () => {
  const commandsService = rustPlusService.getCommandsService();

  // 玩家死亡自动通知
  rustPlusService.on('player:died', async (data) => {
    try {
      const settings = commandsService.getServerSettings(data.serverId);
      if (settings.deathNotify) {
        const message = `💀 ${data.name} 在 (${Math.round(data.x)}, ${Math.round(data.y)}) 死亡了！`;
        await rustPlusService.sendTeamMessage(data.serverId, message);
        console.log(`📨 已发送死亡通知: ${data.name}`);
      }
    } catch (error) {
      console.error('❌ 发送死亡通知失败:', error.message);
    }
  });

  // 玩家重生自动通知
  rustPlusService.on('player:spawned', async (data) => {
    try {
      const settings = commandsService.getServerSettings(data.serverId);
      if (settings.spawnNotify) {
        const message = `✨ ${data.name} 重生了！`;
        await rustPlusService.sendTeamMessage(data.serverId, message);
        console.log(`📨 已发送重生通知: ${data.name}`);
      }
    } catch (error) {
      console.error('❌ 发送重生通知失败:', error.message);
    }
  });

  console.log('✅ 玩家事件自动通知已启用（可通过 !notify 命令控制）');
};

// 启动服务器
const PORT = process.env.PORT || 3000;
let serverStarted = false;

server.listen(PORT, async () => {
  serverStarted = true;
  console.log(`
╔═══════════════════════════════════════╗
║   🎮 Rust+ Web Dashboard Backend    ║
║                                       ║
║   Server: http://localhost:${PORT}     ║
║   Status: ✅ Running                  ║
╚═══════════════════════════════════════╝
  `);

  // 初始化 FCM
  await initializeFCM();

  // 自动重连到已保存的服务器
  try {
    const savedServers = storage.getAllServers();
    if (savedServers.length > 0) {
      console.log(`\n🔄 正在自动重连到 ${savedServers.length} 个已保存的服务器...\n`);
      
      for (const server of savedServers) {
        try {
          console.log(`🔌 连接到: ${server.name} (${server.ip}:${server.port})`);
          await rustPlusService.connect({
            serverId: server.id,
            ip: server.ip,
            port: server.port,
            playerId: server.player_id,
            playerToken: server.player_token,
          });
          console.log(`✅ ${server.name} 已连接\n`);
        } catch (error) {
          console.error(`❌ ${server.name} 连接失败: ${error.message}\n`);
        }
      }
      
      console.log('🎉 自动重连完成\n');
    } else {
      console.log('\n💡 提示: 还没有保存的服务器，请使用配对功能添加服务器\n');
    }
  } catch (error) {
    console.error('❌ 自动重连失败:', error.message);
  }

  // 设置玩家事件自动通知
  setupPlayerEventNotifications();
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
  
  // 设置强制关闭超时（3秒）
  const forceTimeout = setTimeout(() => {
    console.error('⏱️  关闭超时，强制退出');
    process.exit(0); // 改为 exit(0) 让 nodemon 认为是正常退出
  }, 3000);
  
  try {
    // 1. 关闭 Rust+ 连接（最重要）
    const connectedServers = rustPlusService.getConnectedServers();
    if (connectedServers.length > 0) {
      await Promise.allSettled(
        connectedServers.map(serverId => 
          rustPlusService.disconnect(serverId)
        )
      );
    }
    
    // 2. 关闭 Socket.IO
    const io = websocketService.getIO();
    if (io) {
      io.disconnectSockets(true); // 强制断开所有连接
      io.close();
    }
    
    // 3. 关闭 HTTP Server（只在服务器已启动时）
    if (serverStarted && server.listening) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        // 如果 1 秒内没有关闭，强制继续
        setTimeout(resolve, 1000);
      });
    }
    
    clearTimeout(forceTimeout);
    process.exit(0);
    
  } catch (error) {
    clearTimeout(forceTimeout);
    process.exit(0); // 即使出错也返回 0，让 nodemon 正常重启
  }
};

// 监听关闭信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 监听未捕获的异常（但不要在启动阶段触发优雅关闭）
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  // 如果是端口占用错误且服务器还没启动，直接退出让 nodemon 重试
  if (error.code === 'EADDRINUSE' && !serverStarted) {
    console.error('⚠️  端口被占用，等待重试...');
    process.exit(1);
  } else if (serverStarted) {
    gracefulShutdown('uncaughtException');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise rejection:', reason);
  if (serverStarted) {
    gracefulShutdown('unhandledRejection');
  }
});
