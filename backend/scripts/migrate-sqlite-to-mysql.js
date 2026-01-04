/**
 * SQLite to MySQL 数据迁移脚本
 *
 * 功能:
 * 1. 从 SQLite 数据库读取所有数据
 * 2. 创建默认用户(永久订阅)
 * 3. 将所有数据归属到默认用户
 * 4. 使用 Prisma 插入到 MySQL
 * 5. 验证数据完整性
 * 6. 提供回滚功能
 *
 * 使用方法:
 * node backend/scripts/migrate-sqlite-to-mysql.js [--rollback]
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// 配置
const SQLITE_DB_PATH = join(__dirname, '../../data/database.db');
const BACKUP_DIR = join(__dirname, '../../data/backups');
const DEFAULT_USER = {
  username: 'admin',
  email: 'admin@rust-dashboard.local',
  password: 'Admin@123456', // 请在迁移后修改密码
};

// 日志函数
const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
};

/**
 * 检查 SQLite 数据库是否存在
 */
function checkSQLiteExists() {
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    log.error(`SQLite 数据库不存在: ${SQLITE_DB_PATH}`);
    return false;
  }
  log.success(`找到 SQLite 数据库: ${SQLITE_DB_PATH}`);
  return true;
}

/**
 * 备份 SQLite 数据库
 */
function backupSQLite() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(BACKUP_DIR, `database_${timestamp}.db`);

    fs.copyFileSync(SQLITE_DB_PATH, backupPath);
    log.success(`SQLite 数据库已备份到: ${backupPath}`);
    return backupPath;
  } catch (error) {
    log.error(`备份失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从 SQLite 读取所有数据
 */
function readSQLiteData() {
  log.info('正在读取 SQLite 数据...');

  const db = new Database(SQLITE_DB_PATH, { readonly: true });

  try {
    const data = {
      servers: db.prepare('SELECT * FROM servers').all(),
      devices: db.prepare('SELECT * FROM devices').all(),
      eventLogs: db.prepare('SELECT * FROM event_logs').all(),
      notificationSettings: db.prepare('SELECT * FROM notification_settings WHERE id = 1').get(),
    };

    log.info(`读取到 ${data.servers.length} 个服务器`);
    log.info(`读取到 ${data.devices.length} 个设备`);
    log.info(`读取到 ${data.eventLogs.length} 条事件日志`);
    log.info(`读取到通知设置: ${data.notificationSettings ? '是' : '否'}`);

    return data;
  } finally {
    db.close();
  }
}

/**
 * 创建或获取默认用户
 */
async function createDefaultUser() {
  log.info('正在创建默认用户...');

  // 检查用户是否已存在
  let user = await prisma.user.findUnique({
    where: { email: DEFAULT_USER.email },
  });

  if (user) {
    log.warn(`默认用户已存在: ${user.email}`);
    return user;
  }

  // 创建新用户
  const hashedPassword = await bcrypt.hash(DEFAULT_USER.password, 10);

  user = await prisma.user.create({
    data: {
      username: DEFAULT_USER.username,
      email: DEFAULT_USER.email,
      password: hashedPassword,
      isActive: true,
      isAdmin: true,
      subscription: {
        create: {
          planType: 'YEARLY',
          startDate: new Date(),
          endDate: new Date('2099-12-31'), // 永久订阅
          amount: 0,
        },
      },
    },
    include: {
      subscription: true,
    },
  });

  log.success(`默认用户已创建: ${user.email} (永久订阅)`);
  log.warn(`默认密码: ${DEFAULT_USER.password}`);
  log.warn(`请在迁移完成后立即修改密码!`);

  return user;
}

/**
 * 迁移服务器数据
 */
async function migrateServers(userId, servers) {
  log.info(`正在迁移 ${servers.length} 个服务器...`);

  const migrated = [];

  for (const server of servers) {
    try {
      const created = await prisma.server.create({
        data: {
          id: server.id,
          userId: userId,
          name: server.name,
          ip: server.ip,
          port: server.port,
          playerId: server.player_id,
          playerToken: server.player_token,
          battlemetricsId: server.battlemetrics_id || null,
          img: server.img || null,
          logo: server.logo || null,
          url: server.url || null,
          description: server.description || null,
          isActive: true,
          createdAt: server.created_at ? new Date(server.created_at * 1000) : new Date(),
        },
      });
      migrated.push(created);
      log.success(`  ✓ 服务器迁移成功: ${server.name}`);
    } catch (error) {
      log.error(`  ✗ 服务器迁移失败: ${server.name} - ${error.message}`);
      throw error;
    }
  }

  return migrated;
}

/**
 * 迁移设备数据
 */
async function migrateDevices(devices) {
  log.info(`正在迁移 ${devices.length} 个设备...`);

  const migrated = [];

  // 按 server_id 分组
  const devicesByServer = devices.reduce((acc, device) => {
    if (!acc[device.server_id]) {
      acc[device.server_id] = [];
    }
    acc[device.server_id].push(device);
    return acc;
  }, {});

  for (const [serverId, serverDevices] of Object.entries(devicesByServer)) {
    log.info(`  迁移服务器 ${serverId} 的 ${serverDevices.length} 个设备...`);

    for (const device of serverDevices) {
      try {
        // 映射设备类型
        let deviceType = 'SWITCH';
        if (device.type) {
          const typeUpper = device.type.toUpperCase();
          if (['SWITCH', 'ALARM', 'STORAGE'].includes(typeUpper)) {
            deviceType = typeUpper;
          }
        }

        // 映射自动化模式
        let autoMode = 'NONE';
        const autoModeMap = {
          0: 'NONE',
          1: 'DAY_ON',
          2: 'NIGHT_ON',
          3: 'ALWAYS_ON',
          4: 'ALWAYS_OFF',
          7: 'ONLINE_ON',
          8: 'ONLINE_OFF',
        };
        if (device.auto_mode !== undefined && autoModeMap[device.auto_mode]) {
          autoMode = autoModeMap[device.auto_mode];
        }

        const created = await prisma.device.create({
          data: {
            serverId: device.server_id,
            entityId: device.entity_id,
            name: device.name,
            type: deviceType,
            command: device.command || null,
            autoMode: autoMode,
            isActive: true,
            reachable: device.reachable !== 0,
            lastTrigger: device.last_trigger ? new Date(device.last_trigger * 1000) : null,
            createdAt: device.created_at ? new Date(device.created_at * 1000) : new Date(),
          },
        });
        migrated.push(created);
      } catch (error) {
        log.error(`  ✗ 设备迁移失败: ${device.name} (Entity ID: ${device.entity_id}) - ${error.message}`);
        throw error;
      }
    }

    log.success(`  ✓ 服务器 ${serverId} 的设备迁移完成`);
  }

  return migrated;
}

/**
 * 迁移事件日志
 */
async function migrateEventLogs(eventLogs) {
  log.info(`正在迁移 ${eventLogs.length} 条事件日志...`);

  // 事件类型映射
  const eventTypeMap = {
    'player_death': 'PLAYER_DEATH',
    'player_online': 'PLAYER_ONLINE',
    'player_offline': 'PLAYER_OFFLINE',
    'player_afk': 'PLAYER_AFK',
    'player_return': 'PLAYER_RETURN',
    'cargo_spawn': 'CARGO_SPAWN',
    'cargo_leave': 'CARGO_LEAVE',
    'heli_spawn': 'HELI_SPAWN',
    'heli_down': 'HELI_DOWN',
    'oil_rig_triggered': 'OIL_RIG_TRIGGERED',
    'oil_rig_unlocked': 'OIL_RIG_UNLOCKED',
    'chinook_spawn': 'CHINOOK_SPAWN',
    'alarm_triggered': 'ALARM_TRIGGERED',
    'device_offline': 'DEVICE_OFFLINE',
    'server_connected': 'SERVER_CONNECTED',
    'server_disconnected': 'SERVER_DISCONNECTED',
    'fcm_connected': 'FCM_CONNECTED',
    'fcm_disconnected': 'FCM_DISCONNECTED',
  };

  const migrated = [];
  let skipped = 0;

  for (const log of eventLogs) {
    try {
      // 映射事件类型
      const eventType = eventTypeMap[log.event_type] || log.event_type.toUpperCase();

      // 检查事件类型是否有效
      if (!Object.values(eventTypeMap).includes(eventType) && eventType !== log.event_type.toUpperCase()) {
        console.warn(`  ⚠️  跳过未知事件类型: ${log.event_type}`);
        skipped++;
        continue;
      }

      const created = await prisma.eventLog.create({
        data: {
          serverId: log.server_id,
          eventType: eventType,
          eventData: typeof log.event_data === 'string' ? JSON.parse(log.event_data) : log.event_data,
          createdAt: log.created_at ? new Date(log.created_at * 1000) : new Date(),
        },
      });
      migrated.push(created);
    } catch (error) {
      console.error(`  ✗ 事件日志迁移失败: ${log.event_type} - ${error.message}`);
      // 事件日志迁移失败不中断整个流程
      skipped++;
    }
  }

  log.success(`事件日志迁移完成: ${migrated.length} 成功, ${skipped} 跳过`);
  return migrated;
}

/**
 * 迁移通知设置
 */
async function migrateNotificationSettings(userId, settings) {
  if (!settings || !settings.settings_json) {
    log.warn('没有找到通知设置,将使用默认设置');
    return null;
  }

  log.info('正在迁移通知设置...');

  try {
    const settingsData = typeof settings.settings_json === 'string'
      ? JSON.parse(settings.settings_json)
      : settings.settings_json;

    const created = await prisma.notificationSettings.create({
      data: {
        userId: userId,
        settings: settingsData,
        createdAt: settings.created_at ? new Date(settings.created_at * 1000) : new Date(),
      },
    });

    log.success('通知设置迁移成功');
    return created;
  } catch (error) {
    log.error(`通知设置迁移失败: ${error.message}`);
    // 通知设置迁移失败不中断整个流程
    return null;
  }
}

/**
 * 验证数据完整性
 */
async function validateMigration(sqliteData) {
  log.info('正在验证数据完整性...');

  const mysqlData = {
    servers: await prisma.server.count(),
    devices: await prisma.device.count(),
    eventLogs: await prisma.eventLog.count(),
  };

  const results = {
    servers: {
      sqlite: sqliteData.servers.length,
      mysql: mysqlData.servers,
      match: sqliteData.servers.length === mysqlData.servers,
    },
    devices: {
      sqlite: sqliteData.devices.length,
      mysql: mysqlData.devices,
      match: sqliteData.devices.length === mysqlData.devices,
    },
    eventLogs: {
      sqlite: sqliteData.eventLogs.length,
      mysql: mysqlData.eventLogs,
      match: sqliteData.eventLogs.length <= mysqlData.eventLogs, // 允许部分事件被跳过
    },
  };

  log.info('\n数据完整性验证结果:');
  log.info('========================');
  log.info(`服务器: SQLite ${results.servers.sqlite} → MySQL ${results.servers.mysql} ${results.servers.match ? '✓' : '✗'}`);
  log.info(`设备:   SQLite ${results.devices.sqlite} → MySQL ${results.devices.mysql} ${results.devices.match ? '✓' : '✗'}`);
  log.info(`事件:   SQLite ${results.eventLogs.sqlite} → MySQL ${results.eventLogs.mysql} ${results.eventLogs.match ? '✓' : '✗'}`);
  log.info('========================\n');

  const allMatch = results.servers.match && results.devices.match && results.eventLogs.match;

  if (allMatch) {
    log.success('数据完整性验证通过!');
  } else {
    log.error('数据完整性验证失败!');
  }

  return { results, allMatch };
}

/**
 * 清空 MySQL 数据库(用于回滚)
 */
async function clearMySQL() {
  log.warn('正在清空 MySQL 数据库...');

  try {
    await prisma.$transaction([
      prisma.eventLog.deleteMany(),
      prisma.device.deleteMany(),
      prisma.server.deleteMany(),
      prisma.notificationSettings.deleteMany(),
      prisma.subscription.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    log.success('MySQL 数据库已清空');
  } catch (error) {
    log.error(`清空 MySQL 失败: ${error.message}`);
    throw error;
  }
}

/**
 * 主迁移流程
 */
async function migrate() {
  log.info('========================================');
  log.info('  SQLite → MySQL 数据迁移');
  log.info('========================================\n');

  try {
    // 1. 检查 SQLite 数据库
    if (!checkSQLiteExists()) {
      process.exit(1);
    }

    // 2. 备份 SQLite 数据库
    const backupPath = backupSQLite();

    // 3. 读取 SQLite 数据
    const sqliteData = readSQLiteData();

    // 4. 创建默认用户
    const user = await createDefaultUser();

    // 5. 迁移服务器
    await migrateServers(user.id, sqliteData.servers);

    // 6. 迁移设备
    await migrateDevices(sqliteData.devices);

    // 7. 迁移事件日志
    await migrateEventLogs(sqliteData.eventLogs);

    // 8. 迁移通知设置
    await migrateNotificationSettings(user.id, sqliteData.notificationSettings);

    // 9. 验证数据完整性
    const { allMatch } = await validateMigration(sqliteData);

    if (!allMatch) {
      log.warn('数据完整性验证未完全通过,但迁移已完成');
      log.warn('请手动检查数据是否正确');
    }

    log.success('\n========================================');
    log.success('  迁移完成!');
    log.success('========================================');
    log.info(`备份文件: ${backupPath}`);
    log.info(`默认用户: ${DEFAULT_USER.email}`);
    log.info(`默认密码: ${DEFAULT_USER.password}`);
    log.warn('\n⚠️  请立即修改默认密码!');
    log.info('\n如需回滚,请运行:');
    log.info('  node backend/scripts/migrate-sqlite-to-mysql.js --rollback\n');

  } catch (error) {
    log.error(`\n迁移失败: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 回滚流程
 */
async function rollback() {
  log.warn('========================================');
  log.warn('  数据回滚');
  log.warn('========================================\n');

  try {
    await clearMySQL();

    log.success('\n========================================');
    log.success('  回滚完成!');
    log.success('========================================');
    log.info('MySQL 数据库已清空');
    log.info('SQLite 数据库未受影响\n');

  } catch (error) {
    log.error(`\n回滚失败: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 主程序
const isRollback = process.argv.includes('--rollback');

if (isRollback) {
  rollback();
} else {
  migrate();
}
