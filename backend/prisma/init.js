/**
 * 数据库初始化脚本
 * 完整初始化流程：迁移 + 创建默认管理员
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
    console.log('');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║         Rust+ Dashboard 数据库初始化               ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');

    // Step 1: 运行 Prisma 迁移
    console.log('📦 Step 1: 应用数据库迁移...');
    try {
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        console.log('✅ 数据库迁移完成\n');
    } catch (error) {
        console.error('❌ 数据库迁移失败');
        throw error;
    }

    // Step 2: 生成 Prisma Client
    console.log('🔧 Step 2: 生成 Prisma Client...');
    try {
        execSync('npx prisma generate', { stdio: 'inherit' });
        console.log('✅ Prisma Client 生成完成\n');
    } catch (error) {
        console.error('❌ Prisma Client 生成失败');
        throw error;
    }

    // Step 3: 创建默认管理员账户
    console.log('👤 Step 3: 创建默认管理员账户...');

    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin';
    const hashedPassword = await bcrypt.hash(password, 10);

    // 检查是否已存在
    const existing = await prisma.users.findFirst({
        where: {
            OR: [
                { username: 'admin' },
                { email: 'admin@localhost' }
            ]
        }
    });

    if (existing) {
        console.log('   ⚠️  管理员账户已存在，跳过创建');
        console.log(`   ID: ${existing.id}`);
    } else {
        const admin = await prisma.users.create({
            data: {
                id: uuidv4(),
                username: 'admin',
                email: 'admin@localhost',
                password: hashedPassword,
                isAdmin: true,
                isActive: true,
                updatedAt: new Date(),
                subscriptions: {
                    create: {
                        id: uuidv4(),
                        planType: 'YEARLY',
                        startDate: new Date(),
                        endDate: new Date('2099-12-31T23:59:59Z'),
                        amount: 0,
                        updatedAt: new Date()
                    }
                },
                notification_settings: {
                    create: {
                        id: uuidv4(),
                        settings: {
                            player_death: true,
                            player_online: true,
                            player_offline: true,
                            player_afk: true,
                            cargo_spawn: true,
                            heli_spawn: true,
                            oil_rig_triggered: true
                        },
                        updatedAt: new Date()
                    }
                }
            }
        });
        console.log('   ✅ 管理员账户创建成功');
        console.log(`   ID: ${admin.id}`);
    }

    // Step 4: 创建代理配置
    console.log('\n⚙️  Step 4: 创建默认配置...');

    const proxyConfigExists = await prisma.proxy_config.findUnique({
        where: { id: 1 }
    });

    if (!proxyConfigExists) {
        await prisma.proxy_config.create({
            data: {
                id: 1,
                proxyPort: 10808,
                autoStart: false
            }
        });
        console.log('   ✅ 代理配置已创建');
    } else {
        console.log('   ⚠️  代理配置已存在，跳过');
    }

    // 完成
    console.log('');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║               ✅ 初始化完成！                       ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');
    console.log('🔐 默认管理员账户:');
    console.log('   用户名: admin');
    console.log('   密码: ' + password);
    console.log('');
    console.log('💡 运行 npm run dev 启动服务器');
    console.log('');
}

main()
    .catch((error) => {
        console.error('\n❌ 初始化失败:', error.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
