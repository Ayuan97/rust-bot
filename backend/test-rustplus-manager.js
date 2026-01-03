/**
 * 测试脚本 - 验证 UserRustPlusManager（TODO-009）
 * 测试用户级别的 Rust+ 连接管理
 */

import { PrismaClient } from '@prisma/client';
import globalServiceManager from './src/services/global-manager.service.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER_EMAIL = 'rustplus-test@example.com';

async function cleanup() {
  console.log('\n🧹 清理测试数据...');

  try {
    // 删除测试用户（级联删除所有关联数据）
    await prisma.user.deleteMany({
      where: { email: TEST_USER_EMAIL }
    });
    console.log('✅ 测试数据已清理');
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
  }
}

async function testUserRustPlusManager() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始测试 UserRustPlusManager (TODO-009)');
  console.log('='.repeat(60));

  let userId = null;
  let userService = null;

  try {
    // ========== 测试 1: 创建测试用户 ==========
    console.log('\n🧪 测试 1: 创建测试用户');
    console.log('='.repeat(60));

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const user = await prisma.user.create({
      data: {
        username: 'rustplus_tester',
        email: TEST_USER_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: trialEndDate
          }
        },
        notificationSettings: {
          create: {
            settings: { player_death: true }
          }
        }
      },
      include: {
        subscription: true
      }
    });

    userId = user.id;
    console.log(`✅ 测试用户创建成功`);
    console.log(`   ID: ${userId}`);
    console.log(`   用户名: ${user.username}`);

    // ========== 测试 2: 创建 UserServiceManager（包含 RustPlus）==========
    console.log('\n🧪 测试 2: 创建 UserServiceManager');
    console.log('='.repeat(60));

    userService = await globalServiceManager.createUserService(userId);

    console.log(`✅ 用户服务创建成功`);
    console.log(`   用户 ID: ${userService.userId}`);
    console.log(`   初始化状态: ${userService.isInitialized}`);

    // ========== 测试 3: 验证 RustPlusManager 已创建 ==========
    console.log('\n🧪 测试 3: 验证 RustPlusManager');
    console.log('='.repeat(60));

    if (!userService.rustPlusService) {
      throw new Error('RustPlusManager 未创建');
    }

    console.log(`✅ RustPlusManager 已创建`);
    console.log(`   用户 ID: ${userService.rustPlusService.userId}`);

    const stats = userService.rustPlusService.getStats();
    console.log(`✅ RustPlus 统计信息:`);
    console.log(`   总服务器: ${stats.totalServers}`);
    console.log(`   已连接服务器: ${stats.connectedServers}`);
    console.log(`   正在连接: ${stats.connectingServers}`);
    console.log(`   活跃相机: ${stats.activeCameras}`);

    // ========== 测试 4: 添加测试服务器 ==========
    console.log('\n🧪 测试 4: 添加测试服务器');
    console.log('='.repeat(60));

    const server1 = await prisma.server.create({
      data: {
        id: 'test-server-001',
        userId: userId,
        name: '测试服务器 1',
        ip: '127.0.0.1',
        port: '28082',
        playerId: '76561198000000001',
        playerToken: '-1234567890'
      }
    });

    const server2 = await prisma.server.create({
      data: {
        id: 'test-server-002',
        userId: userId,
        name: '测试服务器 2',
        ip: '127.0.0.1',
        port: '28083',
        playerId: '76561198000000002',
        playerToken: '-1234567891'
      }
    });

    console.log(`✅ 测试服务器创建成功`);
    console.log(`   服务器 1: ${server1.name} (${server1.ip}:${server1.port})`);
    console.log(`   服务器 2: ${server2.name} (${server2.ip}:${server2.port})`);

    // ========== 测试 5: 测试连接方法（不实际连接）==========
    console.log('\n🧪 测试 5: 测试 RustPlusManager 方法');
    console.log('='.repeat(60));

    // 测试 isConnected (应该返回 false)
    const isConnected1 = userService.rustPlusService.isConnected(server1.id);
    console.log(`✅ isConnected('${server1.id}'): ${isConnected1}`);

    if (isConnected1) {
      throw new Error('服务器不应该已连接');
    }

    // 测试 getConnectedServers (应该返回空数组)
    const connectedServers = userService.rustPlusService.getConnectedServers();
    console.log(`✅ getConnectedServers(): ${JSON.stringify(connectedServers)}`);

    if (connectedServers.length !== 0) {
      throw new Error('不应该有已连接的服务器');
    }

    // 测试设置代理
    userService.rustPlusService.setProxyConfig({ host: '127.0.0.1', port: 10808 });
    console.log(`✅ setProxyConfig() 执行成功`);

    // 测试设置 Facepunch 代理
    userService.rustPlusService.setUseFacepunchProxy(false);
    console.log(`✅ setUseFacepunchProxy() 执行成功`);

    // ========== 测试 6: 获取服务状态 ==========
    console.log('\n🧪 测试 6: 获取服务状态');
    console.log('='.repeat(60));

    const status = userService.getStatus();
    console.log(`✅ 服务状态:`);
    console.log(`   用户 ID: ${status.userId}`);
    console.log(`   已初始化: ${status.isInitialized}`);
    console.log(`   服务器数量: ${status.serverCount}`);
    console.log(`   已连接服务器: ${status.connectedServers}`);
    console.log(`   服务列表:`, JSON.stringify(status.services, null, 2));
    console.log(`   RustPlus 统计:`, JSON.stringify(status.rustPlusStats, null, 2));

    if (!status.services.rustPlus) {
      throw new Error('RustPlus 服务应该已启用');
    }

    // ========== 测试 7: 数据隔离验证 ==========
    console.log('\n🧪 测试 7: 数据隔离验证');
    console.log('='.repeat(60));

    // 创建第二个测试用户
    const user2 = await prisma.user.create({
      data: {
        username: 'rustplus_tester_2',
        email: 'rustplus-test-2@example.com',
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: trialEndDate
          }
        }
      }
    });

    const userService2 = await globalServiceManager.createUserService(user2.id);

    console.log(`✅ 第二个用户服务创建成功`);
    console.log(`   用户 1 ID: ${userService.userId}`);
    console.log(`   用户 2 ID: ${userService2.userId}`);

    // 验证两个用户的 RustPlusManager 是独立的
    if (userService.rustPlusService === userService2.rustPlusService) {
      throw new Error('两个用户不应该共享同一个 RustPlusManager 实例');
    }

    console.log(`✅ 数据隔离验证通过: 每个用户有独立的 RustPlusManager`);

    // 清理第二个用户
    await globalServiceManager.removeUserService(user2.id, '测试完成');
    await prisma.user.delete({ where: { id: user2.id } });
    console.log(`✅ 第二个测试用户已清理`);

    // ========== 测试 8: 停止服务 ==========
    console.log('\n🧪 测试 8: 停止用户服务');
    console.log('='.repeat(60));

    await globalServiceManager.removeUserService(userId, '测试完成');
    console.log(`✅ 用户服务已停止`);

    const userServiceAfterRemoval = globalServiceManager.getUserService(userId);
    if (userServiceAfterRemoval) {
      throw new Error('用户服务应该已被移除');
    }

    console.log(`✅ 服务移除验证通过`);

    // ========== 所有测试通过 ==========
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODO-009 所有测试通过！');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('   ✅ UserRustPlusManager 创建成功');
    console.log('   ✅ 集成到 UserServiceManager 成功');
    console.log('   ✅ 用户隔离验证通过');
    console.log('   ✅ 服务状态获取正常');
    console.log('   ✅ 连接管理方法正常');
    console.log('   ✅ 服务生命周期管理正常');
    console.log('\n🎉 UserRustPlusManager 用户隔离功能正常！\n');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ 测试失败:', error.message);
    console.error('='.repeat(60));
    console.error(error.stack);
    process.exit(1);
  } finally {
    // 清理测试数据
    await cleanup();
    await prisma.$disconnect();
  }
}

// 运行测试
testUserRustPlusManager().catch(console.error);
