/**
 * Prisma Seed Script
 * 用于初始化数据库测试数据
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('开始数据库种子...');

  // 清理现有数据（仅在开发环境）
  if (process.env.NODE_ENV === 'development') {
    console.log('清理现有数据...');
    await prisma.eventLog.deleteMany();
    await prisma.device.deleteMany();
    await prisma.server.deleteMany();
    await prisma.notificationSettings.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.user.deleteMany();
    await prisma.proxyConfig.deleteMany();
  }

  // 创建测试管理员用户
  console.log('创建管理员用户...');
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      password: adminPassword,
      isAdmin: true,
      isActive: true,
    },
  });

  // 创建管理员订阅（年付）
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  await prisma.subscription.create({
    data: {
      userId: admin.id,
      planType: 'YEARLY',
      endDate: oneYearFromNow,
      amount: 299,
      paymentMethod: 'ALIPAY',
    },
  });

  // 创建管理员通知设置
  await prisma.notificationSettings.create({
    data: {
      userId: admin.id,
      settings: {
        player_death: true,
        player_online: true,
        player_offline: true,
        player_afk: true,
        cargo_spawn: true,
        heli_spawn: true,
        oil_rig_triggered: true,
      },
    },
  });

  // 创建测试普通用户
  console.log('创建测试用户...');
  const userPassword = await bcrypt.hash('user123', 10);
  const user = await prisma.user.create({
    data: {
      username: 'testuser',
      email: 'user@example.com',
      password: userPassword,
      isAdmin: false,
      isActive: true,
    },
  });

  // 创建试用订阅（7天）
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  await prisma.subscription.create({
    data: {
      userId: user.id,
      planType: 'TRIAL',
      endDate: sevenDaysFromNow,
    },
  });

  // 创建用户通知设置
  await prisma.notificationSettings.create({
    data: {
      userId: user.id,
      settings: {
        player_death: true,
        cargo_spawn: true,
      },
    },
  });

  // 创建全局代理配置
  console.log('创建代理配置...');
  await prisma.proxyConfig.create({
    data: {
      id: 1,
      proxyPort: 10808,
      autoStart: false,
    },
  });

  console.log('数据库种子完成！');
  console.log('---');
  console.log('测试账号:');
  console.log('管理员: admin / admin123');
  console.log('普通用户: testuser / user123');
}

main()
  .catch((e) => {
    console.error('种子执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
