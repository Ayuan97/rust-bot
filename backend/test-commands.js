/**
 * 测试脚本 - 验证 UserCommands 用户隔离（TODO-015）
 */

import { PrismaClient } from '@prisma/client';
import globalServiceManager from './src/services/global-manager.service.js';
import logger from './src/utils/logger.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER_1_EMAIL = 'commands-test-1@example.com';
const TEST_USER_2_EMAIL = 'commands-test-2@example.com';

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

async function testUserCommands() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始测试 UserCommands 用户隔离 (TODO-015)');
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
        username: 'commands_tester_1',
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
        username: 'commands_tester_2',
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
        id: 'commands-test-server-1',
        userId: user1Id,
        name: 'User1 Commands Test Server',
        ip: '127.0.0.1',
        port: '28084',
        playerId: '76561198000000001',
        playerToken: '-1111111111'
      }
    });

    const server2 = await prisma.server.create({
      data: {
        id: 'commands-test-server-2',
        userId: user2Id,
        name: 'User2 Commands Test Server',
        ip: '127.0.0.1',
        port: '28085',
        playerId: '76561198000000002',
        playerToken: '-2222222222'
      }
    });

    // 为用户 1 创建设备（带自定义命令）
    const device1Switch = await prisma.device.create({
      data: {
        serverId: server1.id,
        entityId: 1001,
        name: 'User1 Smart Light',
        type: 'SWITCH',
        command: '灯'  // 自定义命令
      }
    });

    const device1Alarm = await prisma.device.create({
      data: {
        serverId: server1.id,
        entityId: 1002,
        name: 'User1 Motion Sensor',
        type: 'ALARM',
        command: '警报'
      }
    });

    // 为用户 2 创建设备
    const device2Switch = await prisma.device.create({
      data: {
        serverId: server2.id,
        entityId: 2001,
        name: 'User2 Smart Light',
        type: 'SWITCH',
        command: '灯'  // 相同命令名，但不同用户
      }
    });

    console.log(`✅ 用户 1 服务器和设备创建成功`);
    console.log(`   服务器: ${server1.name}`);
    console.log(`   设备: ${device1Switch.name} (命令: !${device1Switch.command})`);
    console.log(`   设备: ${device1Alarm.name} (命令: !${device1Alarm.command})`);
    console.log(`✅ 用户 2 服务器和设备创建成功`);
    console.log(`   服务器: ${server2.name}`);
    console.log(`   设备: ${device2Switch.name} (命令: !${device2Switch.command})`);

    // ========== 测试 3: 初始化用户服务 ==========
    console.log('\n🧪 测试 3: 初始化两个用户的服务实例');
    console.log('='.repeat(60));

    await globalServiceManager.createUserService(user1Id);
    await globalServiceManager.createUserService(user2Id);

    console.log(`✅ 用户 1 服务已创建`);
    console.log(`✅ 用户 2 服务已创建`);

    // ========== 测试 4: 验证 UserCommands 实例化 ==========
    console.log('\n🧪 测试 4: 验证 UserCommands 实例化');
    console.log('='.repeat(60));

    const userService1 = globalServiceManager.getUserService(user1Id);
    const userService2 = globalServiceManager.getUserService(user2Id);

    if (!userService1 || !userService1.commandsService) {
      throw new Error('用户 1 的 Commands 未初始化');
    }

    if (!userService2 || !userService2.commandsService) {
      throw new Error('用户 2 的 Commands 未初始化');
    }

    console.log(`✅ 用户 1 的 Commands 已初始化`);
    console.log(`✅ 用户 2 的 Commands 已初始化`);

    // ========== 测试 5: 验证用户隔离（userId 字段）==========
    console.log('\n🧪 测试 5: 验证用户隔离（userId 字段）');
    console.log('='.repeat(60));

    if (userService1.commandsService.userId !== user1Id) {
      throw new Error('用户 1 的 Commands userId 不匹配');
    }

    if (userService2.commandsService.userId !== user2Id) {
      throw new Error('用户 2 的 Commands userId 不匹配');
    }

    console.log(`✅ 用户 1 Commands.userId: ${userService1.commandsService.userId}`);
    console.log(`✅ 用户 2 Commands.userId: ${userService2.commandsService.userId}`);

    // ========== 测试 6: 验证设备命令查询（用户级别）==========
    console.log('\n🧪 测试 6: 验证设备命令查询（用户级别）');
    console.log('='.repeat(60));

    const user1Devices = await userService1.commandsService.getDeviceCommands(server1.id);
    const user2Devices = await userService2.commandsService.getDeviceCommands(server2.id);

    if (user1Devices.length !== 2) {
      throw new Error(`用户 1 应该有 2 个设备命令，实际: ${user1Devices.length}`);
    }

    if (user2Devices.length !== 1) {
      throw new Error(`用户 2 应该有 1 个设备命令，实际: ${user2Devices.length}`);
    }

    console.log(`✅ 用户 1 设备命令: ${user1Devices.length} 个`);
    user1Devices.forEach(d => {
      console.log(`   ${d.name} - !${d.command} (${d.type})`);
    });
    console.log(`✅ 用户 2 设备命令: ${user2Devices.length} 个`);
    user2Devices.forEach(d => {
      console.log(`   ${d.name} - !${d.command} (${d.type})`);
    });

    // 验证设备隔离
    const user1CrossQuery = await userService1.commandsService.getDeviceCommands(server2.id);
    const user2CrossQuery = await userService2.commandsService.getDeviceCommands(server1.id);

    if (user1CrossQuery.length !== 0) {
      throw new Error('用户 1 查询到了用户 2 的设备（隔离失败）');
    }

    if (user2CrossQuery.length !== 0) {
      throw new Error('用户 2 查询到了用户 1 的设备（隔离失败）');
    }

    console.log(`✅ 设备命令查询隔离验证通过（用户 A 查不到用户 B 的设备）`);

    // ========== 测试 7: 验证内置命令注册 ==========
    console.log('\n🧪 测试 7: 验证内置命令注册');
    console.log('='.repeat(60));

    const builtInCommands = Array.from(userService1.commandsService.commands.keys());

    const expectedCommands = ['help', 'time', 'pop', 'team', 'online', 'afk', 'cargo', 'heli', 'small', 'large'];

    for (const cmd of expectedCommands) {
      if (!builtInCommands.includes(cmd)) {
        throw new Error(`内置命令 "${cmd}" 未注册`);
      }
    }

    console.log(`✅ 内置命令注册验证通过 (${builtInCommands.length} 个):`);
    console.log(`   ${builtInCommands.join(', ')}`);

    // ========== 测试 8: 验证命令处理（模拟）==========
    console.log('\n🧪 测试 8: 验证命令处理（模拟）');
    console.log('='.repeat(60));

    // 模拟 help 命令
    console.log(`📝 测试 !help 命令...`);
    const helpResult = await userService1.commandsService.handleHelp(server1.id, [], {});
    if (!helpResult || !helpResult.includes('可用命令')) {
      throw new Error('help 命令返回内容异常');
    }
    console.log(`✅ !help 命令正常`);

    // 模拟设备命令查找
    console.log(`📝 测试设备命令查找...`);
    const devices1 = await userService1.commandsService.getDeviceCommands(server1.id);
    const lightDevice = devices1.find(d => d.command === '灯');
    if (!lightDevice) {
      throw new Error('未找到 "灯" 设备命令');
    }
    console.log(`✅ 设备命令查找正常: ${lightDevice.name}`);

    // ========== 测试 9: 验证服务状态 ==========
    console.log('\n🧪 测试 9: 验证服务状态');
    console.log('='.repeat(60));

    const status1 = userService1.getStatus();
    const status2 = userService2.getStatus();

    if (!status1.services.commands) {
      throw new Error('用户 1 的 Commands 服务状态为 false');
    }

    if (!status2.services.commands) {
      throw new Error('用户 2 的 Commands 服务状态为 false');
    }

    console.log(`✅ 用户 1 Commands 服务: ${status1.services.commands}`);
    console.log(`✅ 用户 2 Commands 服务: ${status2.services.commands}`);

    // ========== 测试 10: 验证命令前缀 ==========
    console.log('\n🧪 测试 10: 验证命令前缀');
    console.log('='.repeat(60));

    if (userService1.commandsService.commandPrefix !== '!') {
      throw new Error('命令前缀应该是 "!"');
    }

    console.log(`✅ 命令前缀验证通过: "${userService1.commandsService.commandPrefix}"`);

    // ========== 清理服务 ==========
    console.log('\n🧪 清理测试服务...');
    console.log('='.repeat(60));

    await globalServiceManager.removeUserService(user1Id, '测试完成');
    await globalServiceManager.removeUserService(user2Id, '测试完成');

    console.log(`✅ 所有测试服务已清理`);

    // ========== 所有测试通过 ==========
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODO-015 所有测试通过！');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('   ✅ 每个用户有独立的命令服务实例');
    console.log('   ✅ userId 字段正确隔离');
    console.log('   ✅ 设备命令查询用户级别隔离');
    console.log('   ✅ 内置命令正确注册（10 个）');
    console.log('   ✅ 命令处理功能正常');
    console.log('   ✅ 设备命令隔离完全生效（每个用户只能访问自己的设备）');
    console.log('   ✅ 数据库查询通过 server.userId 过滤');
    console.log('   ✅ Commands 集成到 UserServiceManager');
    console.log('   ✅ 命令前缀配置正确');
    console.log('\n🎉 UserCommands 用户隔离功能正常！\n');

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
testUserCommands().catch(console.error);
