/**
 * Prisma 全局单例
 * 避免在开发模式下创建多个 PrismaClient 实例
 */

import { PrismaClient } from '@prisma/client';

// 全局变量存储 Prisma 实例
const globalForPrisma = globalThis;

// 创建或复用 Prisma 实例
const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// 开发模式下保存到全局变量
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
