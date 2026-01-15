import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const profiles = await prisma.player_profiles.findMany({
    take: 10
  });

  console.log('player_profiles 表数据:');
  if (profiles.length === 0) {
    console.log('  (空表，尚未刷新玩家数据)');
  } else {
    profiles.forEach(p => {
      console.log(`  - ${p.name || '未知'}`);
      console.log(`    steamId: ${p.steamId}`);
      console.log(`    avatar: ${p.avatar ? '有' : '无'}`);
      console.log(`    playtime: ${p.playtime}`);
      console.log(`    lastUpdated: ${p.lastUpdated}`);
      console.log('');
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
