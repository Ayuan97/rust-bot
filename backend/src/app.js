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

// 中间件
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// 路由
app.use('/api/servers', serverRoutes);
app.use('/api/pairing', pairingRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 初始化 WebSocket
websocketService.initialize(server, process.env.FRONTEND_URL || 'http://localhost:5173');

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
server.listen(PORT, async () => {
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

  // 设置玩家事件自动通知
  setupPlayerEventNotifications();
});

// 优雅关闭函数
const gracefulShutdown = async (signal) => {
  console.log(`\n收到 ${signal} 信号，正在关闭...`);
  
  try {
    // 1. 关闭所有 Rust+ 连接
    const connectedServers = rustPlusService.getConnectedServers();
    console.log(`正在断开 ${connectedServers.length} 个 Rust+ 连接...`);
    for (const serverId of connectedServers) {
      await rustPlusService.disconnect(serverId);
    }
    
    // 2. 关闭 Socket.IO
    const io = websocketService.getIO();
    if (io) {
      console.log('正在关闭 Socket.IO 连接...');
      io.close();
    }
    
    // 3. 关闭 HTTP Server
    console.log('正在关闭 HTTP Server...');
    server.close(() => {
      console.log('✅ 服务器已安全关闭');
      process.exit(0);
    });
    
    // 设置强制关闭超时（10秒）
    setTimeout(() => {
      console.error('❌ 强制关闭（超时）');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ 关闭过程出错:', error.message);
    process.exit(1);
  }
};

// 监听关闭信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
