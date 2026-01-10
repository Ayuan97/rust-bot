
import UserRustPlusManager from './src/services/user-rustplus-manager.js';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const serverId = '9456dcdd-a51e-4f3e-86e1-ac8045081e54';

    const server = await db.servers.findUnique({ where: { id: serverId } });

    if (!server) { console.error('Server not found'); process.exit(1); }

    const manager = new UserRustPlusManager(server.userId);

    console.log(`Connecting to ${server.name}...`);
    try {
        const rustplus = await manager.connect({
            serverId: server.id,
            ip: server.ip,
            port: server.port,
            playerId: server.playerId,
            playerToken: server.playerToken
        });

        // Wait a bit for connection
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Fetching markers...');
        const markers = await manager.getMapMarkers(serverId);
        console.log('--- Sample Markers ---');
        if (markers && markers.markers) {
            console.log(JSON.stringify(markers.markers.slice(0, 5), null, 2));
        } else {
            console.log('No markers found or structure different:', markers);
        }

        console.log('Fetching info...');
        const info = await manager.getServerInfo(serverId);
        console.log('Map Size:', info.mapSize);

        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

main();
