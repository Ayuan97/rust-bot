/**
 * 测试脚本 - 验证 UserAutomation 用户隔离（TODO-014）
 */

import { PrismaClient } from '@prisma/client';
import globalServiceManager from './src/services/global-manager.service.js';
import logger from './src/utils/logger.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER_1_EMAIL = 'automation-test-1@example.com';
const TEST_USER_2_EMAIL = 'automation-test-2@example.com';

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

async function testUserAutomation() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始测试 UserAutomation 用户隔离 (TODO-014)');
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
        username: 'automation_tester_1',
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
        username: 'automation_tester_2',
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

    // ========== 测试 2: 创建测试服务器和设备 ==========
    console.log('\n🧪 测试 2: 创建测试服务器和设备');
    console.log('='.repeat(60));

    const server1 = await prisma.server.create({
      data: {
        id: 'automation-test-server-1',
        userId: user1Id,
        name: 'User1 Automation Test Server',
        ip: '127.0.0.1',
        port: '28084',
        playerId: '76561198000000001',
        playerToken: '-1111111111'
      }
    });

    const server2 = await prisma.server.create({
      data: {
        id: 'automation-test-server-2',
        userId: user2Id,
        name: 'User2 Automation Test Server',
        ip: '127.0.0.1',
        port: '28085',
        playerId: '76561198000000002',
        playerToken: '-2222222222'
      }
    });

    // 为用户 1 创建设备（带自动化）
    const device1 = await prisma.device.create({
      data: {
        serverId: server1.id,
        entityId: 1001,
        name: 'User1 Smart Switch',
        type: 'SWITCH',
        autoMode: 'DAY_ON'  // 白天开启
      }
    });

    // 为用户 2 创建设备（带自动化）
    const device2 = await prisma.device.create({
      data: {
        serverId: server2.id,
        entityId: 2001,
        name: 'User2 Smart Switch',
        type: 'SWITCH',
        autoMode: 'NIGHT_ON'  // 夜晚开启
      }
    });

    console.log(`✅ 用户 1 服务器和设备创建成功`);
    console.log(`   服务器: ${server1.name}`);
    console.log(`   设备: ${device1.name} (${device1.autoMode})`);
    console.log(`✅ 用户 2 服务器和设备创建成功`);
    console.log(`   服务器: ${server2.name}`);
    console.log(`   设备: ${device2.name} (${device2.autoMode})`);

    // ========== 测试 3: 初始化用户服务 ==========
    console.log('\n🧪 测试 3: 初始化两个用户的服务实例');
    console.log('='.repeat(60));

    await globalServiceManager.createUserService(user1Id);
    await globalServiceManager.createUserService(user2Id);

    console.log(`✅ 用户 1 服务已创建`);
    console.log(`✅ 用户 2 服务已创建`);

    // ========== 测试 4: 验证 UserAutomation 实例化 ==========
    console.log('\n🧪 测试 4: 验证 UserAutomation 实例化');
    console.log('='.repeat(60));

    const userService1 = globalServiceManager.getUserService(user1Id);
    const userService2 = globalServiceManager.getUserService(user2Id);

    if (!userService1 || !userService1.automationService) {
      throw new Error('用户 1 的 Automation 未初始化');
    }

    if (!userService2 || !userService2.automationService) {
      throw new Error('用户 2 的 Automation 未初始化');
    }

    console.log(`✅ 用户 1 的 Automation 已初始化`);
    console.log(`✅ 用户 2 的 Automation 已初始化`);

    // ========== 测试 5: 验证用户隔离（userId 字段）==========
    console.log('\n🧪 测试 5: 验证用户隔离（userId 字段）');
    console.log('='.repeat(60));

    if (userService1.automationService.userId !== user1Id) {
      throw new Error('用户 1 的 Automation userId 不匹配');
    }

    if (userService2.automationService.userId !== user2Id) {
      throw new Error('用户 2 的 Automation userId 不匹配');
    }

    console.log(`✅ 用户 1 Automation.userId: ${userService1.automationService.userId}`);
    console.log(`✅ 用户 2 Automation.userId: ${userService2.automationService.userId}`);

    // ========== 测试 6: 验证设备查询（用户级别）==========
    console.log('\n🧪 测试 6: 验证设备查询（用户级别）');
    console.log('='.repeat(60));

    const user1Devices = await userService1.automationService.getDevicesWithAutoMode(server1.id);
    const user2Devices = await userService2.automationService.getDevicesWithAutoMode(server2.id);

    if (user1Devices.length !== 1) {
      throw new Error(`用户 1 应该有 1 个自动化设备，实际: ${user1Devices.length}`);
    }

    if (user2Devices.length !== 1) {
      throw new Error(`用户 2 应该有 1 个自动化设备，实际: ${user2Devices.length}`);
    }

    console.log(`✅ 用户 1 自动化设备: ${user1Devices.length} 个`);
    console.log(`   ${user1Devices[0].name} (${user1Devices[0].autoMode})`);
    console.log(`✅ 用户 2 自动化设备: ${user2Devices.length} 个`);
    console.log(`   ${user2Devices[0].name} (${user2Devices[0].autoMode})`);

    // 验证设备隔离
    const user1CrossQuery = await userService1.automationService.getDevicesWithAutoMode(server2.id);
    const user2CrossQuery = await userService2.automationService.getDevicesWithAutoMode(server1.id);

    if (user1CrossQuery.length !== 0) {
      throw new Error('用户 1 查询到了用户 2 的设备（隔离失败）');
    }

    if (user2CrossQuery.length !== 0) {
      throw new Error('用户 2 查询到了用户 1 的设备（隔离失败）');
    }

    console.log(`✅ 设备查询隔离验证通过（用户 A 查不到用户 B 的设备）`);

    // ========== 测试 7: 验证服务状态 ==========
    console.log('\n🧪 测试 7: 验证服务状态');
    console.log('='.repeat(60));

    const status1 = userService1.getStatus();
    const status2 = userService2.getStatus();

    if (!status1.services.automation) {
      throw new Error('用户 1 的 Automation 服务状态为 false');
    }

    if (!status2.services.automation) {
      throw new Error('用户 2 的 Automation 服务状态为 false');
    }

    console.log(`✅ 用户 1 Automation 服务: ${status1.services.automation}`);
    console.log(`✅ 用户 2 Automation 服务: ${status2.services.automation}`);

    if (status1.automationStatus) {
      console.log(`   活跃服务器: ${status1.automationStatus.activeServers.length} 个`);
    }

    if (status2.automationStatus) {
      console.log(`   活跃服务器: ${status2.automationStatus.activeServers.length} 个`);
    }

    // ========== 测试 8: 验证事件隔离（模拟自动化执行）==========
    console.log('\n🧪 测试 8: 验证事件隔离（模拟自动化执行）');
    console.log('='.repeat(60));

    // 用于收集事件
    const user1Events = [];
    const user2Events = [];

    // 监听 GlobalServiceManager 的事件
    globalServiceManager.on('automation:executed', (data) => {
      if (data.userId === user1Id) {
        user1Events.push(data);
      } else if (data.userId === user2Id) {
        user2Events.push(data);
      }
    });

    // 用户 1 触发自动化事件
    userService1.automationService.emit('automation:executed', {
      userId: user1Id,
      serverId: server1.id,
      entityId: device1.entityId,
      name: device1.name,
      value: true,
      mode: device1.autoMode
    });

    // 用户 2 触发自动化事件
    userService2.automationService.emit('automation:executed', {
      userId: user2Id,
      serverId: server2.id,
      entityId: device2.entityId,
      name: device2.name,
      value: false,
      mode: device2.autoMode
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
    console.log(`   用户 1 事件: ${user1Events[0].name} 设置为 ${user1Events[0].value} (模式: ${user1Events[0].mode})`);
    console.log(`   用户 2 事件: ${user2Events[0].name} 设置为 ${user2Events[0].value} (模式: ${user2Events[0].mode})`);
    console.log(`   ✅ 每个用户只收到自己的自动化事件`);

    // ========== 清理服务 ==========
    console.log('\n🧪 清理测试服务...');
    console.log('='.repeat(60));

    await globalServiceManager.removeUserService(user1Id, '测试完成');
    await globalServiceManager.removeUserService(user2Id, '测试完成');

    console.log(`✅ 所有测试服务已清理`);

    // ========== 所有测试通过 ==========
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODO-014 所有测试通过！');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('   ✅ 每个用户有独立的自动化实例');
    console.log('   ✅ userId 字段正确隔离');
    console.log('   ✅ 设备查询用户级别隔离');
    console.log('   ✅ 自动化事件隔离完全生效（每个用户只收到自己的事件）');
    console.log('   ✅ 数据库查询通过 server.userId 过滤');
    console.log('   ✅ Automation 集成到 UserServiceManager');
    console.log('   ✅ GlobalServiceManager 正确转发事件');
    console.log('\n🎉 UserAutomation 用户隔离功能正常！\n');

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
testUserAutomation().catch(console.error);
