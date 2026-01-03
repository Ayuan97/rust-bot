/**
 * 测试脚本 - 验证 UserFCMManager（TODO-010）
 * 测试用户级别的 FCM 推送监听管理
 */

import { PrismaClient } from '@prisma/client';
import globalServiceManager from './src/services/global-manager.service.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER_EMAIL = 'fcm-test@example.com';
const TEST_USER_2_EMAIL = 'fcm-test-2@example.com';

async function cleanup() {
  console.log('\n🧹 清理测试数据...');

  try {
    // 删除测试用户（级联删除所有关联数据）
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: TEST_USER_EMAIL },
          { email: TEST_USER_2_EMAIL }
        ]
      }
    });
    console.log('✅ 测试数据已清理');
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
  }
}

async function testUserFCMManager() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始测试 UserFCMManager (TODO-010)');
  console.log('='.repeat(60));

  let userId1 = null;
  let userId2 = null;
  let userService1 = null;
  let userService2 = null;

  try {
    // ========== 测试 1: 创建第一个测试用户 ==========
    console.log('\n🧪 测试 1: 创建第一个测试用户');
    console.log('='.repeat(60));

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const user1 = await prisma.user.create({
      data: {
        username: 'fcm_tester_1',
        email: TEST_USER_EMAIL,
        password: 'hashed_password_placeholder',
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: trialEndDate
          }
        }
      },
      include: {
        subscription: true
      }
    });

    userId1 = user1.id;
    console.log(`✅ 用户 1 创建成功`);
    console.log(`   ID: ${userId1}`);
    console.log(`   用户名: ${user1.username}`);

    // ========== 测试 2: 创建 UserServiceManager（包含 FCM）==========
    console.log('\n🧪 测试 2: 创建 UserServiceManager (用户 1)');
    console.log('='.repeat(60));

    userService1 = await globalServiceManager.createUserService(userId1);

    console.log(`✅ 用户服务创建成功`);
    console.log(`   用户 ID: ${userService1.userId}`);

    // ========== 测试 3: 验证 UserFCMManager 已创建 ==========
    console.log('\n🧪 测试 3: 验证 UserFCMManager');
    console.log('='.repeat(60));

    if (!userService1.fcmService) {
      throw new Error('UserFCMManager 未创建');
    }

    console.log(`✅ UserFCMManager 已创建`);
    console.log(`   用户 ID: ${userService1.fcmService.userId}`);

    const fcmStatus1 = userService1.fcmService.getStatus();
    console.log(`✅ FCM 状态:`);
    console.log(`   用户 ID: ${fcmStatus1.userId}`);
    console.log(`   监听中: ${fcmStatus1.isListening}`);
    console.log(`   有凭证: ${fcmStatus1.hasCredentials}`);
    console.log(`   凭证类型: ${fcmStatus1.credentialType || 'N/A'}`);

    if (fcmStatus1.isListening) {
      throw new Error('FCM 不应该在没有凭证的情况下监听');
    }

    // ========== 测试 4: 测试 FCMManager 方法 ==========
    console.log('\n🧪 测试 4: 测试 UserFCMManager 方法');
    console.log('='.repeat(60));

    // 测试 setProxyConfig
    userService1.fcmService.setProxyConfig({ host: '127.0.0.1', port: 10808 });
    console.log(`✅ setProxyConfig() 执行成功`);

    // 测试 setManualCredentials（无效凭证应抛出错误）
    try {
      await userService1.fcmService.setManualCredentials({
        invalid: 'data'
      });
      throw new Error('应该抛出无效凭证错误');
    } catch (error) {
      if (error.message.includes('无效的凭证格式')) {
        console.log(`✅ 无效凭证正确拒绝: ${error.message}`);
      } else {
        throw error;
      }
    }

    // 测试 loadCredentials
    const mockCredentials = {
      gcm: {
        androidId: '1234567890',
        securityToken: 'mock_token'
      },
      steam: {
        steamId: '76561198000000001'
      }
    };
    userService1.fcmService.loadCredentials(mockCredentials);
    console.log(`✅ loadCredentials() 执行成功`);

    const fcmStatus1WithCreds = userService1.fcmService.getStatus();
    if (!fcmStatus1WithCreds.hasCredentials) {
      throw new Error('凭证应该已加载');
    }
    console.log(`✅ 凭证已加载验证通过`);

    // 测试 clearCredentials
    userService1.fcmService.clearCredentials();
    const fcmStatus1NoCreds = userService1.fcmService.getStatus();
    if (fcmStatus1NoCreds.hasCredentials) {
      throw new Error('凭证应该已清除');
    }
    console.log(`✅ clearCredentials() 执行成功`);

    // ========== 测试 5: 创建第二个用户验证隔离 ==========
    console.log('\n🧪 测试 5: 创建第二个用户验证隔离');
    console.log('='.repeat(60));

    const user2 = await prisma.user.create({
      data: {
        username: 'fcm_tester_2',
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

    userId2 = user2.id;
    userService2 = await globalServiceManager.createUserService(userId2);

    console.log(`✅ 用户 2 创建成功`);
    console.log(`   用户 1 ID: ${userId1}`);
    console.log(`   用户 2 ID: ${userId2}`);

    // ========== 测试 6: 验证 FCMManager 隔离 ==========
    console.log('\n🧪 测试 6: 验证 FCMManager 隔离');
    console.log('='.repeat(60));

    // 验证两个用户的 FCMManager 是独立的
    if (userService1.fcmService === userService2.fcmService) {
      throw new Error('两个用户不应该共享同一个 FCMManager 实例');
    }
    console.log(`✅ FCMManager 实例隔离验证通过`);

    // 给用户1加载凭证
    const creds1 = {
      gcm: {
        androidId: '1111111111',
        securityToken: 'user1_token'
      },
      steam: {
        steamId: '76561198111111111'
      }
    };
    userService1.fcmService.loadCredentials(creds1);

    // 给用户2加载不同的凭证
    const creds2 = {
      gcm: {
        androidId: '2222222222',
        securityToken: 'user2_token'
      },
      steam: {
        steamId: '76561198222222222'
      }
    };
    userService2.fcmService.loadCredentials(creds2);

    // 验证两个用户的凭证是独立的
    const user1Creds = userService1.fcmService.getCredentials();
    const user2Creds = userService2.fcmService.getCredentials();

    if (user1Creds.gcm.androidId === user2Creds.gcm.androidId) {
      throw new Error('两个用户不应该有相同的凭证');
    }

    console.log(`✅ 凭证隔离验证通过:`);
    console.log(`   用户 1 Android ID: ${user1Creds.gcm.androidId}`);
    console.log(`   用户 2 Android ID: ${user2Creds.gcm.androidId}`);

    // ========== 测试 7: 获取服务状态 ==========
    console.log('\n🧪 测试 7: 获取服务状态');
    console.log('='.repeat(60));

    const status1 = userService1.getStatus();
    console.log(`✅ 用户 1 服务状态:`);
    console.log(`   用户 ID: ${status1.userId}`);
    console.log(`   FCM 服务: ${status1.services.fcm}`);
    console.log(`   FCM 状态:`, JSON.stringify(status1.fcmStatus, null, 2));

    if (!status1.services.fcm) {
      throw new Error('FCM 服务应该已启用');
    }

    if (!status1.fcmStatus.hasCredentials) {
      throw new Error('用户 1 应该有凭证');
    }

    const status2 = userService2.getStatus();
    console.log(`✅ 用户 2 服务状态:`);
    console.log(`   用户 ID: ${status2.userId}`);
    console.log(`   FCM 服务: ${status2.services.fcm}`);
    console.log(`   FCM 状态:`, JSON.stringify(status2.fcmStatus, null, 2));

    if (!status2.fcmStatus.hasCredentials) {
      throw new Error('用户 2 应该有凭证');
    }

    // ========== 测试 8: 事件隔离验证 ==========
    console.log('\n🧪 测试 8: 事件隔离验证');
    console.log('='.repeat(60));

    let user1Events = [];
    let user2Events = [];

    // 监听用户1的配对事件
    userService1.on('server:paired', (data) => {
      user1Events.push(data);
    });

    // 监听用户2的配对事件
    userService2.on('server:paired', (data) => {
      user2Events.push(data);
    });

    // 模拟用户1收到配对推送
    const mockPairingData1 = {
      userId: userId1,
      name: 'User1 Server',
      ip: '1.1.1.1'
    };
    userService1.fcmService.emit('server:paired', mockPairingData1);

    // 模拟用户2收到配对推送
    const mockPairingData2 = {
      userId: userId2,
      name: 'User2 Server',
      ip: '2.2.2.2'
    };
    userService2.fcmService.emit('server:paired', mockPairingData2);

    // 等待事件处理
    await new Promise(resolve => setTimeout(resolve, 100));

    if (user1Events.length !== 1) {
      throw new Error(`用户 1 应该收到 1 个事件，实际: ${user1Events.length}`);
    }

    if (user2Events.length !== 1) {
      throw new Error(`用户 2 应该收到 1 个事件，实际: ${user2Events.length}`);
    }

    if (user1Events[0].ip !== '1.1.1.1') {
      throw new Error('用户 1 收到了错误的事件');
    }

    if (user2Events[0].ip !== '2.2.2.2') {
      throw new Error('用户 2 收到了错误的事件');
    }

    console.log(`✅ 事件隔离验证通过:`);
    console.log(`   用户 1 收到 ${user1Events.length} 个事件 (${user1Events[0].name})`);
    console.log(`   用户 2 收到 ${user2Events.length} 个事件 (${user2Events[0].name})`);

    // ========== 测试 9: 停止服务 ==========
    console.log('\n🧪 测试 9: 停止用户服务');
    console.log('='.repeat(60));

    await globalServiceManager.removeUserService(userId1, '测试完成');
    await globalServiceManager.removeUserService(userId2, '测试完成');
    console.log(`✅ 用户服务已停止`);

    // ========== 所有测试通过 ==========
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODO-010 所有测试通过！');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('   ✅ UserFCMManager 创建成功');
    console.log('   ✅ 集成到 UserServiceManager 成功');
    console.log('   ✅ 用户隔离验证通过（两个用户独立实例）');
    console.log('   ✅ 凭证管理正常');
    console.log('   ✅ 方法调用正常');
    console.log('   ✅ 事件隔离验证通过');
    console.log('   ✅ 服务状态获取正常');
    console.log('   ✅ 服务生命周期管理正常');
    console.log('\n🎉 UserFCMManager 用户隔离功能正常！\n');

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
testUserFCMManager().catch(console.error);
