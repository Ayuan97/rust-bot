import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const serverCount = await prisma.server.count();
  const orderCount = await prisma.order.count();

  console.log('MySQL数据库状态:');
  console.log('  用户数:', userCount);
  console.log('  服务器数:', serverCount);
  console.log('  订单数:', orderCount);

  if (userCount > 0) {
    const users = await prisma.user.findMany({
      take: 3,
      select: { username: true, email: true, isAdmin: true }
    });
    console.log('\n用户列表:');
    users.forEach(u => {
      console.log(`  - ${u.username} (${u.email}) ${u.isAdmin ? '[管理员]' : ''}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
