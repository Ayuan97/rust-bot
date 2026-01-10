
import UserRustPlusManager from './src/services/user-rustplus-manager.js';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const serverId = '9456dcdd-a51e-4f3e-86e1-ac8045081e54';
    const server = await db.servers.findUnique({ where: { id: serverId } });
    const manager = new UserRustPlusManager(server.userId);
    await manager.connect(server);
    await new Promise(r => setTimeout(r, 2000));

    const info = await manager.getServerInfo(server.id);
    console.log('--- Monuments ---');
    console.log(JSON.stringify(info.monuments?.slice(0, 10), null, 2));
    process.exit(0);
}

main();
