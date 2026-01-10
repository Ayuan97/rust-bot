
import UserRustPlusManager from './src/services/user-rustplus-manager.js';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const serverId = '9456dcdd-a51e-4f3e-86e1-ac8045081e54';
    const server = await db.servers.findUnique({ where: { id: serverId } });

    const manager = new UserRustPlusManager(server.userId);
    await manager.connect(server);
    await new Promise(r => setTimeout(r, 2000));

    console.log('Fetching map...');
    const mapData = await manager.getMap(serverId);

    if (!mapData) {
        console.log('Map data is null');
    } else {
        console.log('Map Data Keys:', Object.keys(mapData));
        if (mapData.jpgImage) {
            console.log('jpgImage type:', typeof mapData.jpgImage);
            console.log('jpgImage length:', mapData.jpgImage.length);
            console.log('Is Buffer?', Buffer.isBuffer(mapData.jpgImage));
        } else {
            console.log('jpgImage is MISSING');
        }
    }
    process.exit(0);
}

main();
