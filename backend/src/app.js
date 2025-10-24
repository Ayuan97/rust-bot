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
import { notify } from './utils/messages.js';
import { formatPosition, getDirection } from './utils/coordinates.js';

// 导入事件系统
import EventMonitorService from './services/event-monitor.service.js';
import { EventType } from './utils/event-constants.js';

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

// 中间件 - 允许多种前端来源
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如 Postman、curl）
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('⚠️  CORS 拦截了来自:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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

      // 保存服务器信息（包含图片、logo、url、描述）
      try {
        storage.addServer({
          id: serverInfo.id,
          name: serverInfo.name,
          ip: serverInfo.ip,
          port: serverInfo.port,
          playerId: serverInfo.playerId,
          playerToken: serverInfo.playerToken,
          img: serverInfo.img,
          logo: serverInfo.logo,
          url: serverInfo.url,
          desc: serverInfo.desc,
          battlemetricsId: null, // 稍后异步获取
        });

        console.log('✅ 服务器信息已保存');
        if (serverInfo.img) console.log('   - 服务器图标:', serverInfo.img);
        if (serverInfo.url) console.log('   - 地图图片:', serverInfo.url);
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

// 初始化事件监控系统
const eventMonitorService = new EventMonitorService(rustPlusService);

// 将事件监控服务注入到命令服务中
rustPlusService.setEventMonitorService(eventMonitorService);

// 设置游戏事件通知
const setupGameEventNotifications = () => {
  console.log('✅ 正在注册游戏事件监听器...');

  // 货船事件（已关闭通知）
  // eventMonitorService.on(EventType.CARGO_SPAWN, async (data) => {
  //   try {
  //     // 获取地图大小以计算方位
  //     const mapSize = rustPlusService.getMapSize(data.serverId);
  //     const direction = getDirection(data.x, data.y, mapSize);

  //     // 检查是否有网格位置（如果在地图外会返回原始坐标）
  //     const hasGrid = !data.position.startsWith('(');

  //     let message;
  //     if (hasGrid) {
  //       // 在地图内，显示方位 + 网格
  //       message = `目前货船位于 ${direction} ${data.position}`;
  //     } else {
  //       // 在地图外，只显示方位
  //       message = `目前货船位于 ${direction}`;
  //     }

  //     await rustPlusService.sendTeamMessage(data.serverId, message);
  //     websocketService.broadcast('event:cargo:spawn', { ...data, type: 'cargo:spawn' });
  //   } catch (error) {
  //     console.error('发送货船刷新通知失败:', error.message);
  //   }
  // });

  // // 货船停靠港口
  // eventMonitorService.on(EventType.CARGO_DOCK, async (data) => {
  //   try {
  //     await rustPlusService.sendTeamMessage(
  //       data.serverId,
  //       `货船已停靠港口 ${data.position}`
  //     );
  //     websocketService.broadcast('event:cargo:dock', { ...data, type: 'cargo:dock' });
  //   } catch (error) {
  //     console.error('发送货船停靠通知失败:', error.message);
  //   }
  // });

  // // 货船离开港口（Egress 就是离开港口的意思）
  // eventMonitorService.on(EventType.CARGO_EGRESS, async (data) => {
  //   try {
  //     await rustPlusService.sendTeamMessage(
  //       data.serverId,
  //       `货船离开港口 辐射快速上升 赶紧撤离！`
  //     );
  //     websocketService.broadcast('event:cargo:egress', { ...data, type: 'cargo:egress' });
  //   } catch (error) {
  //     console.error('发送货船离开港口通知失败:', error.message);
  //   }
  // });

  // // 货船离开地图
  // eventMonitorService.on(EventType.CARGO_LEAVE, async (data) => {
  //   try {
  //     await rustPlusService.sendTeamMessage(
  //       data.serverId,
  //       `货船已离开地图`
  //     );
  //     websocketService.broadcast('event:cargo:leave', { ...data, type: 'cargo:leave' });
  //   } catch (error) {
  //     console.error('发送货船离开地图通知失败:', error.message);
  //   }
  // });

  // 小油井事件
  eventMonitorService.on(EventType.SMALL_OIL_RIG_TRIGGERED, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `小油井已触发 重型科学家正在赶来`
      );
      websocketService.broadcast('event:small:triggered', { ...data, type: 'small:triggered' });
    } catch (error) {
      console.error('发送小油井触发通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.SMALL_OIL_RIG_CRATE_WARNING, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `小油井箱子还有 ${data.minutesLeft} 分钟解锁`
      );
    } catch (error) {
      console.error('发送小油井箱子警告通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.SMALL_OIL_RIG_CRATE_UNLOCKED, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `小油井箱子已解锁！`
      );
      websocketService.broadcast('event:small:unlocked', { ...data, type: 'small:unlocked' });
    } catch (error) {
      console.error('发送小油井箱子解锁通知失败:', error.message);
    }
  });

  // 大油井事件
  eventMonitorService.on(EventType.LARGE_OIL_RIG_TRIGGERED, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `大油井已触发 重型科学家正在赶来`
      );
      websocketService.broadcast('event:large:triggered', { ...data, type: 'large:triggered' });
    } catch (error) {
      console.error('发送大油井触发通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.LARGE_OIL_RIG_CRATE_WARNING, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `大油井箱子还有 ${data.minutesLeft} 分钟解锁`
      );
    } catch (error) {
      console.error('发送大油井箱子警告通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.LARGE_OIL_RIG_CRATE_UNLOCKED, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `大油井箱子已解锁！`
      );
      websocketService.broadcast('event:large:unlocked', { ...data, type: 'large:unlocked' });
    } catch (error) {
      console.error('发送大油井箱子解锁通知失败:', error.message);
    }
  });

  // 武装直升机事件
  eventMonitorService.on(EventType.PATROL_HELI_SPAWN, async (data) => {
    try {
      // 获取地图大小以计算方位
      const mapSize = rustPlusService.getMapSize(data.serverId);
      const direction = getDirection(data.x, data.y, mapSize);

      await rustPlusService.sendTeamMessage(
        data.serverId,
        `武装直升机已刷新在 ${direction} ${data.position}`
      );
      websocketService.broadcast('event:heli:spawn', { ...data, type: 'heli:spawn' });
    } catch (error) {
      console.error('发送武装直升机刷新通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.PATROL_HELI_DOWNED, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `武装直升机被击落 位置: ${data.position}`
      );
      websocketService.broadcast('event:heli:downed', { ...data, type: 'heli:downed' });
    } catch (error) {
      console.error('发送武装直升机被击落通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.PATROL_HELI_LEAVE, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `武装直升机已离开地图`
      );
      websocketService.broadcast('event:heli:leave', { ...data, type: 'heli:leave' });
    } catch (error) {
      console.error('发送武装直升机离开地图通知失败:', error.message);
    }
  });

  // CH47事件（已关闭通知）
  // eventMonitorService.on(EventType.CH47_SPAWN, async (data) => {
  //   try {
  //     await rustPlusService.sendTeamMessage(
  //       data.serverId,
  //       `CH47已出现 位置: ${data.position}`
  //     );
  //     websocketService.broadcast('event:ch47:spawn', { ...data, type: 'ch47:spawn' });
  //   } catch (error) {
  //     console.error('发送CH47出现通知失败:', error.message);
  //   }
  // });

  // eventMonitorService.on(EventType.CH47_LEAVE, async (data) => {
  //   try {
  //     await rustPlusService.sendTeamMessage(
  //       data.serverId,
  //       `CH47已离开`
  //     );
  //     websocketService.broadcast('event:ch47:leave', { ...data, type: 'ch47:leave' });
  //   } catch (error) {
  //     console.error('发送CH47离开通知失败:', error.message);
  //   }
  // });

  // 上锁箱子事件
  eventMonitorService.on(EventType.LOCKED_CRATE_SPAWN, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `上锁箱子出现 位置: ${data.position}`
      );
      websocketService.broadcast('event:crate:spawn', { ...data, type: 'crate:spawn' });
    } catch (error) {
      console.error('发送上锁箱子出现通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.LOCKED_CRATE_DESPAWN, async (data) => {
    try {
      websocketService.broadcast('event:crate:despawn', { ...data, type: 'crate:despawn' });
    } catch (error) {
      console.error('发送上锁箱子消失通知失败:', error.message);
    }
  });

  // 袭击检测
  eventMonitorService.on(EventType.RAID_DETECTED, async (data) => {
    try {
      await rustPlusService.sendTeamMessage(
        data.serverId,
        `检测到袭击 位置: ${data.position} (${data.explosionCount}次爆炸)`
      );
      websocketService.broadcast('event:raid:detected', { ...data, type: 'raid:detected' });
    } catch (error) {
      console.error('发送袭击检测通知失败:', error.message);
    }
  });

  // 售货机事件
  eventMonitorService.on(EventType.VENDING_MACHINE_NEW, async (data) => {
    try {
      // 基础消息：新售货机出现 位置: xxx 共X件商品
      let message = `新售货机出现 位置: ${data.position} 共${data.itemCount}件商品`;

      // 如果有重要物品，添加特别提醒
      if (data.importantItems && data.importantItems.length > 0) {
        const itemsList = data.importantItems.map(item => {
          return `${item.name}${item.amountInStock}个`;
        }).join(' ');
        message += ` 重要物品: ${itemsList}`;
      }

      await rustPlusService.sendTeamMessage(data.serverId, message);
      websocketService.broadcast('event:vending:new', { ...data, type: 'vending:new' });
    } catch (error) {
      console.error('发送售货机出现通知失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.VENDING_MACHINE_REMOVED, async (data) => {
    try {
      // 售货机移除事件只广播到前端，不发送队伍消息（避免刷屏）
      websocketService.broadcast('event:vending:removed', { ...data, type: 'vending:removed' });
    } catch (error) {
      console.error('处理售货机移除事件失败:', error.message);
    }
  });

  eventMonitorService.on(EventType.VENDING_MACHINE_ORDER_CHANGE, async (data) => {
    try {
      // 订单变化事件只广播到前端，不发送队伍消息（避免刷屏）
      websocketService.broadcast('event:vending:order_change', { ...data, type: 'vending:order_change' });
    } catch (error) {
      console.error('处理售货机订单变化事件失败:', error.message);
    }
  });

  console.log('✅ 游戏事件监听器已注册');
};

// 设置玩家事件自动通知
const setupPlayerEventNotifications = () => {
  const commandsService = rustPlusService.getCommandsService();

  console.log('✅ 正在注册玩家事件监听器...');

  // 玩家死亡自动通知
  rustPlusService.on('player:died', async (data) => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔔 收到 player:died 事件！');
    console.log('   - 完整数据:', JSON.stringify(data, null, 2));
    console.log('   - 服务器ID:', data.serverId);
    console.log('   - 玩家:', data.name);
    console.log('   - X坐标:', data.x, typeof data.x);
    console.log('   - Y坐标:', data.y, typeof data.y);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const settings = commandsService.getServerSettings(data.serverId);
      console.log('   - 死亡通知设置:', settings.deathNotify ? '开启' : '关闭');

      if (settings.deathNotify) {
        // 获取地图大小和古迹列表
        let position;
        try {
          const serverInfo = await rustPlusService.getServerInfo(data.serverId);
          const mapSize = serverInfo.mapSize || 4000;
          console.log('   - 地图大小:', mapSize);

          // 获取古迹列表（用于判断是否在古迹附近）
          const mapInfo = await rustPlusService.getMapInfo(data.serverId);
          const monuments = mapInfo?.monuments || [];
          console.log('   - 古迹数量:', monuments.length);

          if (data.x !== undefined && data.y !== undefined) {
            // 显示网格位置和古迹名称（如果在古迹附近）
            position = formatPosition(data.x, data.y, mapSize, true, false, monuments);
            console.log('   - 格式化位置:', position);
          } else {
            position = '未知位置';
            console.log('   - ⚠️  坐标为 undefined');
          }
        } catch (err) {
          console.log('   - ⚠️  获取地图信息失败:', err.message);
          // 如果无法获取地图信息，使用原始坐标
          if (data.x !== undefined && data.y !== undefined) {
            position = `(${Math.round(data.x)},${Math.round(data.y)})`;
          } else {
            position = '未知位置';
          }
        }

        const message = notify('death', {
          playerName: data.name,
          position: position
        });

        console.log('   - 最终消息:', message);
        await rustPlusService.sendTeamMessage(data.serverId, message);
        console.log(`   ✅ 死亡通知已发送: ${data.name}`);
      } else {
        console.log('   ⚠️  死亡通知已关闭，跳过发送');
      }
    } catch (error) {
      console.error('   ❌ 发送死亡通知失败:', error.message);
      console.error('   错误详情:', error);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  console.log('✅ 玩家事件监听器已注册（player:died）');
  console.log('   死亡通知默认开启，可通过 !notify 命令控制');
};

// 设置服务器连接/断开时的事件监控
const setupEventMonitorLifecycle = () => {
  // 服务器连接时启动事件监控
  rustPlusService.on('server:connected', ({ serverId }) => {
    console.log(`🎮 启动事件监控: ${serverId}`);
    eventMonitorService.start(serverId);
  });

  // 服务器断开时停止事件监控
  rustPlusService.on('server:disconnected', ({ serverId }) => {
    console.log(`🎮 停止事件监控: ${serverId}`);
    eventMonitorService.stop(serverId);
  });

  console.log('✅ 事件监控生命周期已设置');
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

  // 设置游戏事件通知
  setupGameEventNotifications();

  // 设置事件监控生命周期
  setupEventMonitorLifecycle();
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
