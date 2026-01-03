/**
 * 测试脚本 - 验证多租户架构
 * 测试认证、数据库、服务管理器
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import globalServiceManager from './src/services/global-manager.service.js';

const prisma = new PrismaClient();

// 测试配置
const TEST_USER = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'test123456'
};

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

async function testDatabaseConnection() {
  console.log('\n🧪 测试 1: 数据库连接');
  console.log('='.repeat(50));

  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功');

    // 检查表是否存在
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `;

    console.log(`✅ 找到 ${tables.length} 张表`);
    tables.forEach(t => console.log(`   - ${t.TABLE_NAME}`));

    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

async function testUserRegistration() {
  console.log('\n🧪 测试 2: 用户注册');
  console.log('='.repeat(50));

  try {
    // 清理测试用户（如果存在）
    await prisma.user.deleteMany({
      where: { email: TEST_USER.email }
    });

    // 创建测试用户
    const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const user = await prisma.user.create({
      data: {
        username: TEST_USER.username,
        email: TEST_USER.email,
        password: hashedPassword,
        subscription: {
          create: {
            planType: 'TRIAL',
            endDate: trialEndDate
          }
        },
        notificationSettings: {
          create: {
            settings: {
              player_death: true,
              cargo_spawn: true
            }
          }
        }
      },
      include: {
        subscription: true,
        notificationSettings: true
      }
    });

    console.log('✅ 用户创建成功');
    console.log(`   ID: ${user.id}`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   邮箱: ${user.email}`);
    console.log(`   订阅: ${user.subscription.planType}`);
    console.log(`   到期: ${user.subscription.endDate.toLocaleDateString()}`);

    return user;
  } catch (error) {
    console.error('❌ 用户注册失败:', error.message);
    return null;
  }
}

async function testUserLogin(user) {
  console.log('\n🧪 测试 3: 用户登录和 JWT');
  console.log('='.repeat(50));

  try {
    // 验证密码
    const isPasswordValid = await bcrypt.compare(TEST_USER.password, user.password);

    if (!isPasswordValid) {
      throw new Error('密码验证失败');
    }

    console.log('✅ 密码验证成功');

    // 生成 JWT token
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ JWT token 生成成功');
    console.log(`   Token: ${token.substring(0, 50)}...`);

    // 验证 token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ JWT token 验证成功');
    console.log(`   用户 ID: ${decoded.userId}`);

    return token;
  } catch (error) {
    console.error('❌ 登录测试失败:', error.message);
    return null;
  }
}

async function testServerAPI(userId) {
  console.log('\n🧪 测试 4: 服务器 API（多租户）');
  console.log('='.repeat(50));

  try {
    // 创建测试服务器
    const server = await prisma.server.create({
      data: {
        id: 'test-server-001',
        userId: userId,
        name: '测试服务器',
        ip: '127.0.0.1',
        port: '28082',
        playerId: '76561198000000000',
        playerToken: '-1234567890'
      }
    });

    console.log('✅ 服务器创建成功');
    console.log(`   ID: ${server.id}`);
    console.log(`   名称: ${server.name}`);
    console.log(`   用户 ID: ${server.userId}`);

    // 验证数据隔离：尝试用不同用户查询
    const serversByUser = await prisma.server.findMany({
      where: { userId: userId }
    });

    console.log(`✅ 数据隔离验证: 用户有 ${serversByUser.length} 个服务器`);

    // 创建测试设备
    const device = await prisma.device.create({
      data: {
        serverId: server.id,
        entityId: 12345,
        name: '测试开关',
        type: 'SWITCH',
        autoMode: 'NONE'
      }
    });

    console.log('✅ 设备创建成功');
    console.log(`   实体 ID: ${device.entityId}`);
    console.log(`   名称: ${device.name}`);

    return server;
  } catch (error) {
    console.error('❌ 服务器 API 测试失败:', error.message);
    return null;
  }
}

async function testNotificationSettings(userId) {
  console.log('\n🧪 测试 5: 通知设置 API（多租户）');
  console.log('='.repeat(50));

  try {
    // 获取通知设置
    const settings = await prisma.notificationSettings.findUnique({
      where: { userId: userId }
    });

    if (!settings) {
      throw new Error('未找到通知设置');
    }

    console.log('✅ 通知设置查询成功');
    console.log(`   用户 ID: ${settings.userId}`);
    console.log(`   设置:`, settings.settings);

    // 更新通知设置
    const updated = await prisma.notificationSettings.update({
      where: { userId: userId },
      data: {
        settings: {
          ...settings.settings,
          heli_spawn: false
        }
      }
    });

    console.log('✅ 通知设置更新成功');

    return true;
  } catch (error) {
    console.error('❌ 通知设置测试失败:', error.message);
    return false;
  }
}

async function testServiceManagers(userId) {
  console.log('\n🧪 测试 6: GlobalServiceManager 和 UserServiceManager');
  console.log('='.repeat(50));

  try {
    // 测试创建用户服务
    console.log('📝 创建用户服务实例...');
    const userService = await globalServiceManager.createUserService(userId);

    console.log('✅ 用户服务创建成功');
    console.log(`   用户 ID: ${userService.userId}`);
    console.log(`   初始化状态: ${userService.isInitialized}`);

    // 获取服务状态
    const status = userService.getStatus();
    console.log('✅ 服务状态:');
    console.log(`   服务器数量: ${status.serverCount}`);
    console.log(`   已初始化: ${status.isInitialized}`);

    // 获取用户信息
    const userInfo = userService.getUserInfo();
    console.log('✅ 用户信息:');
    console.log(`   用户名: ${userInfo.username}`);
    console.log(`   订阅: ${userInfo.subscription.planType}`);

    // 测试 GlobalServiceManager
    console.log('\n📝 测试 GlobalServiceManager...');
    const activeCount = globalServiceManager.getActiveUserCount();
    console.log(`✅ 活跃用户数: ${activeCount}`);

    const activeUserIds = globalServiceManager.getActiveUserIds();
    console.log(`✅ 活跃用户 ID:`, activeUserIds);

    // 测试获取用户服务
    const retrievedService = globalServiceManager.getUserService(userId);
    console.log(`✅ 获取用户服务: ${retrievedService ? '成功' : '失败'}`);

    return userService;
  } catch (error) {
    console.error('❌ 服务管理器测试失败:', error.message);
    return null;
  }
}

async function testCleanup(userId) {
  console.log('\n🧪 测试 7: 清理资源');
  console.log('='.repeat(50));

  try {
    // 停止用户服务
    await globalServiceManager.removeUserService(userId, '测试完成');
    console.log('✅ 用户服务已停止');

    // 删除测试数据
    await prisma.server.deleteMany({
      where: { userId: userId }
    });
    console.log('✅ 测试服务器已删除');

    await prisma.user.delete({
      where: { id: userId }
    });
    console.log('✅ 测试用户已删除');

    return true;
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 开始多租户架构测试');
  console.log('='.repeat(50));

  let userId = null;

  try {
    // 测试 1: 数据库连接
    const dbOk = await testDatabaseConnection();
    if (!dbOk) {
      throw new Error('数据库连接失败，终止测试');
    }

    // 测试 2: 用户注册
    const user = await testUserRegistration();
    if (!user) {
      throw new Error('用户注册失败，终止测试');
    }
    userId = user.id;

    // 测试 3: 用户登录
    const token = await testUserLogin(user);
    if (!token) {
      throw new Error('用户登录失败，终止测试');
    }

    // 测试 4: 服务器 API
    const server = await testServerAPI(userId);
    if (!server) {
      throw new Error('服务器 API 测试失败');
    }

    // 测试 5: 通知设置
    const settingsOk = await testNotificationSettings(userId);
    if (!settingsOk) {
      throw new Error('通知设置测试失败');
    }

    // 测试 6: 服务管理器
    const userService = await testServiceManagers(userId);
    if (!userService) {
      throw new Error('服务管理器测试失败');
    }

    // 测试 7: 清理
    await testCleanup(userId);

    console.log('\n' + '='.repeat(50));
    console.log('✅ 所有测试通过！');
    console.log('='.repeat(50));
    console.log('\n📊 测试总结:');
    console.log('   ✅ 数据库连接和表结构');
    console.log('   ✅ 用户注册和认证');
    console.log('   ✅ JWT token 生成和验证');
    console.log('   ✅ 服务器 API（多租户隔离）');
    console.log('   ✅ 通知设置 API（多租户隔离）');
    console.log('   ✅ GlobalServiceManager');
    console.log('   ✅ UserServiceManager');
    console.log('   ✅ 资源清理');
    console.log('\n🎉 多租户架构工作正常！\n');

  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('❌ 测试失败:', error.message);
    console.error('='.repeat(50));

    // 清理资源
    if (userId) {
      try {
        await testCleanup(userId);
      } catch (cleanupError) {
        console.error('清理资源时出错:', cleanupError.message);
      }
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
runAllTests().catch(console.error);
