
import RustPlusClient from './src/lib/rustplus-client.js';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const db = new PrismaClient();

async function main() {
    const serverId = '9456dcdd-a51e-4f3e-86e1-ac8045081e54';
    const server = await db.servers.findUnique({ where: { id: serverId } });

    if (!server) {
        console.error('Server not found!');
        process.exit(1);
    }

    console.log(`Creating client for ${server.ip}:${server.port}`);
    const client = new RustPlusClient(server.ip, server.port, server.playerId, server.playerToken);

    client.on('connected', () => console.log('Connected event fired'));
    client.on('error', (e) => console.error('Client Error:', e));

    try {
        await client.connect();
        console.log('Connect awaited successfully');

        // Wait a bit to ensure ready
        await new Promise(r => setTimeout(r, 2000));

        console.log('Sending getMap request...');
        // Increase timeout because map can be large
        const mapData = await client.sendRequestAsync({ getMap: {} }, 60000); // 60s timeout

        console.log('Response received!');
        if (!mapData.map) {
            console.log('No map field in response:', mapData);
        } else {
            const m = mapData.map;
            console.log('Map properties:', Object.keys(m));
            if (m.jpgImage) {
                console.log('jpgImage is present. Type:', typeof m.jpgImage);
                if (Buffer.isBuffer(m.jpgImage)) {
                    console.log('jpgImage is Buffer, size:', m.jpgImage.length);
                    fs.writeFileSync('debug_map.jpg', m.jpgImage);
                    console.log('Saved to debug_map.jpg');
                } else {
                    console.log('jpgImage is NOT Buffer! Is it base64 string?');
                    // Try to decode if string
                }
            } else {
                console.log('jpgImage MISSING from map response!');
            }
        }
    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        client.disconnect();
        process.exit(0);
    }
}

main();
