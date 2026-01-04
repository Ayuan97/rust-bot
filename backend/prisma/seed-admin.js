/**
 * 创建默认管理员账户
 * 用于管理后台登录
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin';
  const hashedPassword = await bcrypt.hash(password, 10);

  console.log('📝 创建超级管理员账户...');
  console.log('   用户名: admin');
  console.log('   邮箱: admin@localhost');
  console.log('   密码:', password === 'admin' ? 'admin (默认)' : '自定义密码');
  console.log('');

  // 检查是否已存在（通过用户名或邮箱）
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'admin' },
        { email: 'admin@localhost' }
      ]
    }
  });

  if (existing) {
    console.log('⚠️  管理员账户已存在，更新密码和权限...');

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: 'admin',
        email: 'admin@localhost',
        password: hashedPassword,
        isAdmin: true,
        isActive: true
      }
    });

    console.log('✅ 管理员账户已更新');
    console.log(`   ID: ${existing.id}`);
  } else {
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@localhost',
        password: hashedPassword,
        isAdmin: true,
        isActive: true,
        subscription: {
          create: {
            planType: 'YEARLY',
            startDate: new Date(),
            endDate: new Date('2099-12-31T23:59:59Z'), // 永久订阅
            amount: 0
          }
        },
        notificationSettings: {
          create: {
            settings: {
              player_death: true,
              player_online: true,
              player_offline: true,
              player_afk: true,
              cargo_spawn: true,
              heli_spawn: true,
              oil_rig_triggered: true
            }
          }
        }
      },
      include: {
        subscription: true
      }
    });

    console.log('✅ 超级管理员账户创建成功');
    console.log(`   ID: ${admin.id}`);
    console.log(`   订阅到期: ${admin.subscription.endDate.toISOString()}`);
  }

  console.log('');
  console.log('🔐 请使用以下信息登录:');
  console.log('   用户名: admin');
  console.log('   密码: ' + password);
  console.log('');
  console.log('💡 提示: 可以使用用户名或邮箱登录');
}

main()
  .catch((error) => {
    console.error('❌ 创建失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
