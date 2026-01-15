import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const servers = await prisma.servers.findMany({
    include: { users: { select: { username: true } } }
  });

  console.log('服务器与用户对应关系:');
  servers.forEach(s => {
    console.log(`  - ${s.name}`);
    console.log(`    用户: ${s.users.username}`);
    console.log(`    ID: ${s.id}`);
    console.log('');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
