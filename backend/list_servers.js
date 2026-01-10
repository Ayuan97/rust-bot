
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const servers = await prisma.servers.findMany();
    console.log('--- Servers in DB ---');
    servers.forEach(s => {
        console.log(`ID: ${s.id}, Name: ${s.name}, IP: ${s.ip}, Port: ${s.port}, BM_ID: ${s.battlemetricsId}`);
    });
    process.exit(0);
}

main();
