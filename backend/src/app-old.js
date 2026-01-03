import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import websocketService from './services/websocket.service.js';
import fcmService from './services/fcm.service.js';
import proxyService from './services/proxy.service.js';
import configStorage from './models/config.model.js';
import storage from './models/storage.model.js';
import rustPlusService from './services/rustplus.service.js';
import battlemetricsService from './services/battlemetrics.service.js';

import serverRoutes from './routes/server.routes.js';
import pairingRoutes from './routes/pairing.routes.js';
import proxyRoutes from './routes/proxy.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import authRoutes from './routes/auth.routes.js';
import { formatPosition } from './utils/coordinates.js';
import AutomationService from './services/automation.service.js';
import DayNightNotifier from './services/day-night-notifier.js';

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

// 模块级服务实例（用于优雅关闭）
let automationService = null;
let dayNightNotifier = null;

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
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/pairing', pairingRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/settings', settingsRoutes);

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
          // 传入服务器名称以提高匹配准确性
          const battlemetricsId = await battlemetricsService.searchServerByAddress(
            serverInfo.ip,
            serverInfo.port,
            serverInfo.name  // 使用服务器名称进行精确匹配
          );
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

    // 使用 FCM 死亡推送作为“提示”，立即刷新所有已连接服务器的队伍信息，加速死亡检测
    try {
      const servers = rustPlusService.getConnectedServers();
      if (servers && servers.length > 0) {
        (async () => {
          for (const sid of servers) {
            try {
              const teamInfo = await rustPlusService.getTeamInfo(sid);
              if (teamInfo) {
                rustPlusService.handleTeamChanged(sid, { teamInfo });
              }
            } catch (e) {
              console.warn('⚠️ 基于FCM的快速队伍刷新失败:', e?.message || e);
            }
          }
        })();
      }
    } catch (e) {
      console.warn('⚠️ 获取已连接服务器列表失败:', e?.message || e);
    }
    });

    // 监听智能警报
    fcmService.on('alarm', (alarmInfo) => {
      console.log('🚨 智能警报:', alarmInfo);
      websocketService.broadcast('alarm', alarmInfo);
    });

    // 监听智能设备配对（自动添加设备）
    fcmService.on('entity:paired', async (entityInfo) => {
      try {
        console.log('🔌 收到设备配对:', entityInfo);

        const { entityId, entityType, entityName, serverId } = entityInfo;

        if (!entityId || !serverId) {
          console.warn('⚠️ 设备配对信息不完整，跳过');
          return;
        }

        // 检查服务器是否存在
        const server = storage.getServer(serverId);
        if (!server) {
          console.warn(`⚠️ 服务器 ${serverId} 不存在，无法添加设备`);
          return;
        }

        // 检查设备是否已存在
        const existing = storage.getDeviceByEntityId(serverId, entityId);
        if (existing) {
          console.log(`📌 设备已存在: ${existing.name} (entityId=${entityId})`);
          // 更新设备名称（如果有变化）
          if (entityName && entityName !== existing.name) {
            storage.updateDevice(serverId, entityId, { name: entityName });
            console.log(`✏️ 设备名称已更新: ${existing.name} -> ${entityName}`);
          }
          return;
        }

        // 映射设备类型
        let type = 'switch'; // 默认类型
        if (entityType) {
          const typeMap = {
            '1': 'switch',      // Smart Switch
            '2': 'alarm',       // Smart Alarm
            '3': 'storage',     // Storage Monitor
          };
          type = typeMap[String(entityType)] || 'switch';
        }

        // 添加新设备
        const deviceName = entityName || `设备 ${entityId}`;
        storage.addDevice({
          serverId,
          entityId: parseInt(entityId),
          name: deviceName,
          type
        });

        console.log(`✅ 设备已自动添加: ${deviceName} (类型=${type}, entityId=${entityId})`);

        // 广播给前端
        websocketService.broadcast('device:paired', {
          serverId,
          entityId,
          name: deviceName,
          type
        });
      } catch (error) {
        console.error('❌ 处理设备配对失败:', error.message);
      }
    });

    // 监听 Rust+ 实体变化触发的警报（entity:changed 中 value=true）
    rustPlusService.on('alarm:triggered', async ({ serverId, entityId, time }) => {
      try {
        // 查询设备信息，验证类型为 alarm
        const device = storage.getDeviceByEntityId(serverId, entityId);
        if (!device || device.type !== 'alarm') {
          return; // 不是已注册的警报设备，忽略
        }

        // 更新触发时间
        storage.updateDeviceLastTrigger(serverId, entityId, time);
        console.log(`🚨 警报触发: ${device.name} (entityId=${entityId})`);

        // 获取服务器信息和地图大小
        let position = null;
        try {
          const serverInfo = await rustPlusService.getServerInfo(serverId);
          if (serverInfo && device.x && device.y) {
            position = formatPosition(device.x, device.y, serverInfo.mapSize);
          }
        } catch (e) {
          // 位置信息获取失败，继续处理
        }

        // 发送游戏内消息通知
        const message = position
          ? `警报 ${device.name} 已触发 @ ${position}`
          : `警报 ${device.name} 已触发`;
        await rustPlusService.sendTeamMessage(serverId, message);

        // WebSocket 广播给前端
        websocketService.broadcast('alarm:triggered', {
          serverId,
          entityId,
          name: device.name,
          position,
          time
        });
      } catch (error) {
        console.error('❌ 处理警报触发失败:', error.message);
      }
    });

    // 监听其他通知
    fcmService.on('notification', (notificationInfo) => {
      console.log('📬 通知:', notificationInfo);
      websocketService.broadcast('notification', notificationInfo);
    });

    // 初始化自动化服务
    automationService = new AutomationService(rustPlusService);

    // 初始化昼夜提醒服务
    dayNightNotifier = new DayNightNotifier(rustPlusService);

    // 监听服务器连接事件，启动自动化和昼夜提醒
    rustPlusService.on('server:connected', ({ serverId }) => {
      automationService.start(serverId);
      dayNightNotifier.start(serverId);
    });

    // 监听服务器断开事件，停止自动化和昼夜提醒
    rustPlusService.on('server:disconnected', ({ serverId }) => {
      automationService.stop(serverId);
      dayNightNotifier.stop(serverId);
      // 清理命令服务中的定时器
      const commandsService = rustPlusService.getCommandsService();
      commandsService?.clearServerTimeouts?.(serverId);
    });

    // 监听自动化执行事件，广播给前端
    automationService.on('automation:executed', (data) => {
      websocketService.broadcast('automation:executed', data);
    });

    // 标记事件监听器已注册
    fcmInitialized = true;
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

  // 初始化代理服务（优先数据库配置，其次 .env）
  let proxyInitialized = false;

  // 1. 尝试从数据库加载配置
  const dbProxyConfig = configStorage.getProxyConfig();
  if (dbProxyConfig?.subscriptionUrl && dbProxyConfig.autoStart) {
    try {
      console.log('\n🌐 从数据库加载代理配置...\n');
      await proxyService.initialize(dbProxyConfig.subscriptionUrl, dbProxyConfig.selectedNode);

      // 将代理 Agent 传递给各服务
      const proxyAgent = proxyService.getProxyAgent();
      const proxyPort = dbProxyConfig.proxyPort || 10808;
      fcmService.setProxyAgent(proxyAgent);
      fcmService.setProxyConfig({ host: '127.0.0.1', port: proxyPort });
      battlemetricsService.setProxyAgent(proxyAgent);
      rustPlusService.setProxyConfig({ host: '127.0.0.1', port: proxyPort });

      console.log('✅ 代理服务已启动\n');
      proxyInitialized = true;
    } catch (error) {
      console.error('❌ 数据库代理配置加载失败:', error.message);
    }
  }

  // 2. 如果数据库没有配置，尝试从 .env 加载（向后兼容）
  if (!proxyInitialized) {
    const subscriptionUrl = process.env.PROXY_SUBSCRIPTION_URL;
    if (subscriptionUrl) {
      try {
        console.log('\n🌐 从环境变量加载代理配置...\n');
        const preferredNode = process.env.PROXY_NODE_NAME || null;
        await proxyService.initialize(subscriptionUrl, preferredNode);

        // 将代理 Agent 传递给各服务
        const proxyAgent = proxyService.getProxyAgent();
        const proxyPort = parseInt(process.env.PROXY_PORT) || 10808;
        fcmService.setProxyAgent(proxyAgent);
        battlemetricsService.setProxyAgent(proxyAgent);
        rustPlusService.setProxyConfig({ host: '127.0.0.1', port: proxyPort });

        // 配置 SOCKS5 代理（用于 FCM WebSocket 连接）
        fcmService.setProxyConfig({ host: '127.0.0.1', port: proxyPort });

        console.log('✅ 代理服务已启动\n');
        proxyInitialized = true;
      } catch (error) {
        console.error('❌ 代理服务初始化失败:', error.message);
        console.error('   将在无代理模式下运行\n');
      }
    }
  }

  if (!proxyInitialized) {
    console.log('\n💡 提示: 未配置代理订阅链接');
    console.log('   可在 Web 界面设置中配置，或在 .env 中设置 PROXY_SUBSCRIPTION_URL\n');
  }

  // 注意：Facepunch 代理模式可能返回 418 错误，表示 Token 无效
  // 默认使用直连模式，如果需要可以手动启用代理模式
  // rustPlusService.setUseFacepunchProxy(true);

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
    // 1. 停止 FCM 服务（关闭 WebSocket 和定时器）
    try {
      fcmService.stopListening();
    } catch (err) {
      console.warn('⚠️  停止 FCM 服务失败:', err.message);
    }

    // 2. 停止代理服务
    try {
      proxyService.stopXray();
    } catch (err) {
      console.warn('⚠️  停止代理服务失败:', err.message);
    }

    // 3. 停止所有事件监控（清理定时器）
    try {
      rustPlusService.eventMonitorService?.stopAll();
    } catch (err) {
      console.warn('⚠️  停止事件监控失败:', err.message);
    }

    // 3.1 停止自动化服务
    try {
      automationService?.stopAll();
    } catch (err) {
      console.warn('⚠️  停止自动化服务失败:', err.message);
    }

    // 3.2 停止昼夜提醒服务
    try {
      dayNightNotifier?.stopAll();
    } catch (err) {
      console.warn('⚠️  停止昼夜提醒服务失败:', err.message);
    }

    // 4. 停止命令服务中的定时器（AFK检测、人数追踪）
    try {
      const commandsService = rustPlusService.getCommandsService();
      commandsService?.stopAfkDetection();
      commandsService?.stopPlayerCountTracking();
    } catch (err) {
      console.warn('⚠️  停止命令服务定时器失败:', err.message);
    }

    // 5. 关闭 Rust+ 连接
    const connectedServers = rustPlusService.getConnectedServers();
    if (connectedServers.length > 0) {
      await Promise.allSettled(
        connectedServers.map(serverId =>
          rustPlusService.disconnect(serverId)
        )
      );
    }

    // 6. 关闭 Socket.IO
    const io = websocketService.getIO();
    if (io) {
      io.disconnectSockets(true); // 强制断开所有连接
      io.close();
    }

    // 7. 关闭 HTTP Server（只在服务器已启动时）
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
