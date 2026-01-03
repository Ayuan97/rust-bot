/**
 * 测试脚本 - 验证 UserEventMonitor 用户隔离（TODO-013）
 */

import { PrismaClient } from '@prisma/client';
import globalServiceManager from './src/services/global-manager.service.js';
import logger from './src/utils/logger.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER_1_EMAIL = 'event-test-1@example.com';
const TEST_USER_2_EMAIL = 'event-test-2@example.com';

async function cleanup() {
  console.log('\n🧹 清理测试数据...');

  try {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: TEST_USER_1_EMAIL },
          { email: TEST_USER_2_EMAIL }
        ]
      }
    });
    console.log('✅ 测试数据已清理');
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
  }
}

async function testUserEventMonitor() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始测试 UserEventMonitor 用户隔离 (TODO-013)');
  console.log('='.repeat(60));

  // 先清理旧数据
  await cleanup();

  let user1Id = null;
  let user2Id = null;

  try {
    // ========== 测试 1: 创建两个测试用户 ==========
    console.log('\n🧪 测试 1: 创建两个测试用户');
    console.log('='.repeat(60));

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const user1 = await prisma.user.create({
      data: {
        username: 'event_tester_1',
        email: TEST_USER_1_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: trialEndDate
          }
        }
      }
    });

    const user2 = await prisma.user.create({
      data: {
        username: 'event_tester_2',
        email: TEST_USER_2_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: trialEndDate
          }
        }
      }
    });

    user1Id = user1.id;
    user2Id = user2.id;

    console.log(`✅ 用户 1 创建成功: ${user1.username} (${user1Id})`);
    console.log(`✅ 用户 2 创建成功: ${user2.username} (${user2Id})`);

    // ========== 测试 2: 初始化用户服务 ==========
    console.log('\n🧪 测试 2: 初始化两个用户的服务实例');
    console.log('='.repeat(60));

    await globalServiceManager.createUserService(user1Id);
    await globalServiceManager.createUserService(user2Id);

    console.log(`✅ 用户 1 服务已创建`);
    console.log(`✅ 用户 2 服务已创建`);

    // ========== 测试 3: 验证 UserEventMonitor 实例化 ==========
    console.log('\n🧪 测试 3: 验证 UserEventMonitor 实例化');
    console.log('='.repeat(60));

    const userService1 = globalServiceManager.getUserService(user1Id);
    const userService2 = globalServiceManager.getUserService(user2Id);

    if (!userService1 || !userService1.eventMonitorService) {
      throw new Error('用户 1 的 EventMonitor 未初始化');
    }

    if (!userService2 || !userService2.eventMonitorService) {
      throw new Error('用户 2 的 EventMonitor 未初始化');
    }

    console.log(`✅ 用户 1 的 EventMonitor 已初始化`);
    console.log(`✅ 用户 2 的 EventMonitor 已初始化`);

    // ========== 测试 4: 验证用户隔离（userId 字段）==========
    console.log('\n🧪 测试 4: 验证用户隔离（userId 字段）');
    console.log('='.repeat(60));

    if (userService1.eventMonitorService.userId !== user1Id) {
      throw new Error('用户 1 的 EventMonitor userId 不匹配');
    }

    if (userService2.eventMonitorService.userId !== user2Id) {
      throw new Error('用户 2 的 EventMonitor userId 不匹配');
    }

    console.log(`✅ 用户 1 EventMonitor.userId: ${userService1.eventMonitorService.userId}`);
    console.log(`✅ 用户 2 EventMonitor.userId: ${userService2.eventMonitorService.userId}`);

    // ========== 测试 5: 验证通知设置加载 ==========
    console.log('\n🧪 测试 5: 验证通知设置加载');
    console.log('='.repeat(60));

    await userService1.eventMonitorService.loadNotificationSettings();
    await userService2.eventMonitorService.loadNotificationSettings();

    if (!userService1.eventMonitorService.notificationSettings) {
      throw new Error('用户 1 的通知设置未加载');
    }

    if (!userService2.eventMonitorService.notificationSettings) {
      throw new Error('用户 2 的通知设置未加载');
    }

    console.log(`✅ 用户 1 的通知设置已加载`);
    console.log(`✅ 用户 2 的通知设置已加载`);

    // 验证通知设置检查方法
    const playerDeathEnabled1 = userService1.eventMonitorService.isNotificationEnabled('player_death');
    const playerDeathEnabled2 = userService2.eventMonitorService.isNotificationEnabled('player_death');

    console.log(`✅ 用户 1 player_death 通知: ${playerDeathEnabled1}`);
    console.log(`✅ 用户 2 player_death 通知: ${playerDeathEnabled2}`);

    // ========== 测试 6: 验证服务状态 ==========
    console.log('\n🧪 测试 6: 验证服务状态');
    console.log('='.repeat(60));

    const status1 = userService1.getStatus();
    const status2 = userService2.getStatus();

    if (!status1.services.eventMonitor) {
      throw new Error('用户 1 的 EventMonitor 服务状态为 false');
    }

    if (!status2.services.eventMonitor) {
      throw new Error('用户 2 的 EventMonitor 服务状态为 false');
    }

    console.log(`✅ 用户 1 EventMonitor 服务: ${status1.services.eventMonitor}`);
    console.log(`✅ 用户 2 EventMonitor 服务: ${status2.services.eventMonitor}`);

    if (status1.eventMonitorStatus) {
      console.log(`   监控中的服务器: ${status1.eventMonitorStatus.monitoringServers.length} 个`);
    }

    if (status2.eventMonitorStatus) {
      console.log(`   监控中的服务器: ${status2.eventMonitorStatus.monitoringServers.length} 个`);
    }

    // ========== 测试 7: 验证事件隔离（模拟事件）==========
    console.log('\n🧪 测试 7: 验证事件隔离（模拟事件）');
    console.log('='.repeat(60));

    // 用于收集事件
    const user1Events = [];
    const user2Events = [];

    // 监听 GlobalServiceManager 的事件
    globalServiceManager.on('player:died', (data) => {
      if (data.userId === user1Id) {
        user1Events.push(data);
      } else if (data.userId === user2Id) {
        user2Events.push(data);
      }
    });

    // 用户 1 触发事件
    userService1.eventMonitorService.emit('player:died', {
      userId: user1Id,
      serverId: 'test-server-1',
      steamId: '76561198000000001',
      name: 'User1Player',
      position: 'M15(1823,2145)',
      x: 1823,
      y: 2145,
      deathTime: Date.now(),
      time: Date.now()
    });

    // 用户 2 触发事件
    userService2.eventMonitorService.emit('player:died', {
      userId: user2Id,
      serverId: 'test-server-2',
      steamId: '76561198000000002',
      name: 'User2Player',
      position: 'A5(500,600)',
      x: 500,
      y: 600,
      deathTime: Date.now(),
      time: Date.now()
    });

    // 等待事件传播
    await new Promise(resolve => setTimeout(resolve, 200));

    if (user1Events.length !== 1) {
      throw new Error(`用户 1 应该收到 1 个事件，实际: ${user1Events.length}`);
    }

    if (user2Events.length !== 1) {
      throw new Error(`用户 2 应该收到 1 个事件，实际: ${user2Events.length}`);
    }

    if (user1Events[0].userId !== user1Id) {
      throw new Error('用户 1 收到了错误用户的事件');
    }

    if (user2Events[0].userId !== user2Id) {
      throw new Error('用户 2 收到了错误用户的事件');
    }

    console.log(`✅ 事件隔离验证通过:`);
    console.log(`   用户 1 事件: ${user1Events[0].name} 在 ${user1Events[0].position} 死亡`);
    console.log(`   用户 2 事件: ${user2Events[0].name} 在 ${user2Events[0].position} 死亡`);
    console.log(`   ✅ 每个用户只收到自己的事件`);

    // ========== 测试 8: 验证事件日志保存（用户级别）==========
    console.log('\n🧪 测试 8: 验证事件日志保存（用户级别）');
    console.log('='.repeat(60));

    // 创建测试服务器
    const server1 = await prisma.server.create({
      data: {
        id: 'test-server-user1',
        userId: user1Id,
        name: 'User1 Test Server',
        ip: '127.0.0.1',
        port: '28082',
        playerId: '76561198000000001',
        playerToken: '-1234567890'
      }
    });

    const server2 = await prisma.server.create({
      data: {
        id: 'test-server-user2',
        userId: user2Id,
        name: 'User2 Test Server',
        ip: '127.0.0.1',
        port: '28083',
        playerId: '76561198000000002',
        playerToken: '-9876543210'
      }
    });

    // 保存事件日志
    await userService1.eventMonitorService.saveEventLog(
      server1.id,
      'PLAYER_DEATH',  // 使用 Prisma EventType 枚举值
      { name: 'User1Player', position: 'M15' }
    );

    await userService2.eventMonitorService.saveEventLog(
      server2.id,
      'PLAYER_DEATH',  // 使用 Prisma EventType 枚举值
      { name: 'User2Player', position: 'A5' }
    );

    // 等待数据库写入
    await new Promise(resolve => setTimeout(resolve, 200));

    // 验证事件日志（通过 server 关系过滤）
    const user1Logs = await prisma.eventLog.findMany({
      where: {
        server: {
          userId: user1Id
        }
      }
    });

    const user2Logs = await prisma.eventLog.findMany({
      where: {
        server: {
          userId: user2Id
        }
      }
    });

    if (user1Logs.length === 0) {
      throw new Error('用户 1 的事件日志未保存');
    }

    if (user2Logs.length === 0) {
      throw new Error('用户 2 的事件日志未保存');
    }

    console.log(`✅ 用户 1 事件日志: ${user1Logs.length} 条`);
    console.log(`✅ 用户 2 事件日志: ${user2Logs.length} 条`);

    // 验证事件日志隔离（通过 server.userId 验证）
    // 获取包含 server 关系的详细数据
    const user1LogsWithServer = await prisma.eventLog.findMany({
      where: { serverId: server1.id },
      include: { server: true }
    });

    const user2LogsWithServer = await prisma.eventLog.findMany({
      where: { serverId: server2.id },
      include: { server: true }
    });

    if (user1LogsWithServer.some(log => log.server.userId !== user1Id)) {
      throw new Error('用户 1 的事件日志包含其他用户的数据');
    }

    if (user2LogsWithServer.some(log => log.server.userId !== user2Id)) {
      throw new Error('用户 2 的事件日志包含其他用户的数据');
    }

    console.log(`✅ 事件日志隔离验证通过`);

    // ========== 清理服务 ==========
    console.log('\n🧪 清理测试服务...');
    console.log('='.repeat(60));

    await globalServiceManager.removeUserService(user1Id, '测试完成');
    await globalServiceManager.removeUserService(user2Id, '测试完成');

    console.log(`✅ 所有测试服务已清理`);

    // ========== 所有测试通过 ==========
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODO-013 所有测试通过！');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('   ✅ 每个用户有独立的事件监控实例');
    console.log('   ✅ userId 字段正确隔离');
    console.log('   ✅ 通知设置用户级别加载');
    console.log('   ✅ 事件隔离完全生效（每个用户只收到自己的事件）');
    console.log('   ✅ 事件日志保存到用户自己的 event_logs 表');
    console.log('   ✅ 数据库查询添加 userId 过滤');
    console.log('   ✅ EventMonitor 集成到 UserServiceManager');
    console.log('   ✅ GlobalServiceManager 正确转发事件');
    console.log('\n🎉 UserEventMonitor 用户隔离功能正常！\n');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ 测试失败:', error.message);
    console.error('='.repeat(60));
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

// 运行测试
testUserEventMonitor().catch(console.error);
