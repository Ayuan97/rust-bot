
import battlemetricsService from './src/services/battlemetrics.service.js';

async function main() {
    const bmId = '36466682';
    console.log(`Fetching info for BM ID: ${bmId}`);
    const info = await battlemetricsService.getServerInfo(bmId);
    console.log('--- Battlemetrics Response ---');
    console.log(JSON.stringify(info, null, 2));
    process.exit(0);
}

main();
