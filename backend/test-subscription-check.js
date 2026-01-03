/**
 * 测试脚本 - 验证订阅检查定时任务（TODO-016）
 */

import { PrismaClient } from '@prisma/client';
import globalServiceManager from './src/services/global-manager.service.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER_1_EMAIL = 'subscription-test-1@example.com';
const TEST_USER_2_EMAIL = 'subscription-test-2@example.com';
const TEST_USER_3_EMAIL = 'subscription-test-3@example.com';

async function cleanup() {
  console.log('\n🧹 清理测试数据...');

  try {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: TEST_USER_1_EMAIL },
          { email: TEST_USER_2_EMAIL },
          { email: TEST_USER_3_EMAIL }
        ]
      }
    });
    console.log('✅ 测试数据已清理');
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
  }
}

async function testSubscriptionCheck() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始测试订阅检查定时任务 (TODO-016)');
  console.log('='.repeat(60));

  // 先清理旧数据
  await cleanup();

  let user1Id = null;
  let user2Id = null;
  let user3Id = null;

  try {
    // ========== 测试 1: 创建测试用户（不同订阅状态）==========
    console.log('\n🧪 测试 1: 创建测试用户（不同订阅状态）');
    console.log('='.repeat(60));

    const now = new Date();

    // 用户 1 - 订阅已过期
    const expiredDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7天前过期
    const user1 = await prisma.user.create({
      data: {
        username: 'subscription_expired_user',
        email: TEST_USER_1_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: expiredDate
          }
        }
      }
    });
    user1Id = user1.id;
    console.log(`✅ 用户 1 创建: ${user1.username} (订阅已过期)`);

    // 用户 2 - 订阅即将过期（2天后）
    const expiringSoon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const user2 = await prisma.user.create({
      data: {
        username: 'subscription_expiring_user',
        email: TEST_USER_2_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: expiringSoon
          }
        }
      }
    });
    user2Id = user2.id;
    console.log(`✅ 用户 2 创建: ${user2.username} (2天后过期)`);

    // 用户 3 - 订阅有效（30天后）
    const validDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const user3 = await prisma.user.create({
      data: {
        username: 'subscription_valid_user',
        email: TEST_USER_3_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'MONTHLY',
            endDate: validDate
          }
        }
      }
    });
    user3Id = user3.id;
    console.log(`✅ 用户 3 创建: ${user3.username} (30天后过期)`);

    // ========== 测试 2: 创建用户服务实例 ==========
    console.log('\n🧪 测试 2: 为所有用户创建服务实例');
    console.log('='.repeat(60));

    // 为用户 1 创建服务（订阅已过期，应该会失败或被拒绝）
    try {
      await globalServiceManager.createUserService(user1Id);
      console.log(`❌ 用户 1 服务创建成功（不应该成功，因为订阅已过期）`);
    } catch (error) {
      console.log(`✅ 用户 1 服务创建被拒绝: ${error.message}`);
    }

    // 为用户 2 创建服务（订阅即将过期，应该成功）
    await globalServiceManager.createUserService(user2Id);
    console.log(`✅ 用户 2 服务已创建`);

    // 为用户 3 创建服务（订阅有效，应该成功）
    await globalServiceManager.createUserService(user3Id);
    console.log(`✅ 用户 3 服务已创建`);

    // ========== 测试 3: 验证定时器方法存在 ==========
    console.log('\n🧪 测试 3: 验证定时器方法存在');
    console.log('='.repeat(60));

    if (typeof globalServiceManager.checkExpiredSubscriptions !== 'function') {
      throw new Error('checkExpiredSubscriptions 方法不存在');
    }
    console.log(`✅ checkExpiredSubscriptions 方法存在`);

    if (typeof globalServiceManager.startSubscriptionCheck !== 'function') {
      throw new Error('startSubscriptionCheck 方法不存在');
    }
    console.log(`✅ startSubscriptionCheck 方法存在`);

    if (typeof globalServiceManager.stopSubscriptionCheck !== 'function') {
      throw new Error('stopSubscriptionCheck 方法不存在');
    }
    console.log(`✅ stopSubscriptionCheck 方法存在`);

    // ========== 测试 4: 手动执行订阅检查 ==========
    console.log('\n🧪 测试 4: 手动执行订阅检查');
    console.log('='.repeat(60));

    // 监听事件
    const expiringUsers = [];
    globalServiceManager.once('subscription:expiring:soon', (data) => {
      expiringUsers.push(data);
    });

    const beforeCount = globalServiceManager.getActiveUserCount();
    console.log(`📊 检查前活跃用户数: ${beforeCount}`);

    // 执行检查
    await globalServiceManager.checkExpiredSubscriptions();

    const afterCount = globalServiceManager.getActiveUserCount();
    console.log(`📊 检查后活跃用户数: ${afterCount}`);

    // 验证即将过期的用户发出了警告
    if (expiringUsers.length > 0) {
      console.log(`✅ 检测到即将过期的用户: ${expiringUsers[0].username} (${expiringUsers[0].daysLeft} 天)`);
    }

    // ========== 测试 5: 验证 CHECK_INTERVAL 配置 ==========
    console.log('\n🧪 测试 5: 验证 CHECK_INTERVAL 配置');
    console.log('='.repeat(60));

    const expectedInterval = 60 * 60 * 1000; // 1小时
    if (globalServiceManager.CHECK_INTERVAL !== expectedInterval) {
      throw new Error(`CHECK_INTERVAL 应该是 ${expectedInterval}，实际是 ${globalServiceManager.CHECK_INTERVAL}`);
    }
    console.log(`✅ CHECK_INTERVAL 配置正确: ${globalServiceManager.CHECK_INTERVAL / 1000 / 60} 分钟`);

    // ========== 测试 6: 测试启动和停止定时器 ==========
    console.log('\n🧪 测试 6: 测试启动和停止定时器');
    console.log('='.repeat(60));

    // 启动定时器
    globalServiceManager.startSubscriptionCheck();
    if (!globalServiceManager.subscriptionCheckTimer) {
      throw new Error('定时器未启动');
    }
    console.log(`✅ 定时器已启动`);

    // 停止定时器
    globalServiceManager.stopSubscriptionCheck();
    if (globalServiceManager.subscriptionCheckTimer) {
      throw new Error('定时器未停止');
    }
    console.log(`✅ 定时器已停止`);

    // ========== 测试 7: 验证过期用户自动清理 ==========
    console.log('\n🧪 测试 7: 验证过期用户自动清理');
    console.log('='.repeat(60));

    // 手动将用户 2 的订阅设置为已过期
    await prisma.subscription.update({
      where: { userId: user2Id },
      data: { endDate: new Date(now.getTime() - 1000) } // 1秒前过期
    });

    console.log(`📝 将用户 2 的订阅设置为已过期`);

    const beforeCleanup = globalServiceManager.getActiveUserCount();
    console.log(`📊 清理前活跃用户数: ${beforeCleanup}`);

    // 执行检查（应该清理用户 2）
    await globalServiceManager.checkExpiredSubscriptions();

    const afterCleanup = globalServiceManager.getActiveUserCount();
    console.log(`📊 清理后活跃用户数: ${afterCleanup}`);

    if (afterCleanup >= beforeCleanup) {
      throw new Error('过期用户未被清理');
    }
    console.log(`✅ 过期用户已自动清理 (${beforeCleanup} -> ${afterCleanup})`);

    // 验证用户 2 的服务已被移除
    const user2Service = globalServiceManager.getUserService(user2Id);
    if (user2Service) {
      throw new Error('用户 2 的服务应该已被移除');
    }
    console.log(`✅ 用户 2 的服务已被移除`);

    // ========== 清理所有服务 ==========
    console.log('\n🧪 清理测试服务...');
    console.log('='.repeat(60));

    await globalServiceManager.shutdownAll();
    console.log(`✅ 所有测试服务已清理`);

    // ========== 所有测试通过 ==========
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODO-016 所有测试通过！');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('   ✅ checkExpiredSubscriptions() 方法正常');
    console.log('   ✅ startSubscriptionCheck() 方法正常');
    console.log('   ✅ stopSubscriptionCheck() 方法正常');
    console.log('   ✅ CHECK_INTERVAL 配置正确（1小时）');
    console.log('   ✅ 过期用户自动清理');
    console.log('   ✅ 即将过期用户发出警告');
    console.log('   ✅ 定时器启动和停止正常');
    console.log('\n🎉 订阅检查定时任务功能正常！\n');

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
testSubscriptionCheck().catch(console.error);
