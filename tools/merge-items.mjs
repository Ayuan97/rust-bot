#!/usr/bin/env node
// Merge all per-item JSON files from Rust dedicated server's Bundles/items/ into a single
// rust-items-server.json + diff against the existing rust-items-complete.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'tools/rust-server/Bundles/items');
const OUT_PATH = path.join(ROOT, 'tools/rust-items-server.json');
const EXISTING_PATH = path.join(ROOT, 'backend/src/utils/rust-items-complete.json');

console.log('[1/4] reading server item JSONs from Bundles/items/');
const files = fs.readdirSync(ITEMS_DIR).filter(f => f.endsWith('.json'));
console.log('  found:', files.length, 'files');

const items = {};
const errors = [];
for (const file of files) {
    try {
        const raw = fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8');
        const obj = JSON.parse(raw);
        if (typeof obj.itemid !== 'number') {
            errors.push({ file, reason: 'no itemid' });
            continue;
        }
        items[obj.itemid] = obj;
    } catch (e) {
        errors.push({ file, reason: e.message });
    }
}
console.log('  parsed:', Object.keys(items).length, 'items');
if (errors.length) console.log('  errors:', errors.length);

fs.writeFileSync(OUT_PATH, JSON.stringify({
    source: 'Rust dedicated server Bundles/items/*.json',
    extractedAt: new Date().toISOString(),
    serverBuildId: 'unknown',
    count: Object.keys(items).length,
    items
}, null, 2));
console.log('  wrote:', path.relative(ROOT, OUT_PATH));

console.log('');
console.log('[2/4] reading existing rust-items-complete.json');
const existing = JSON.parse(fs.readFileSync(EXISTING_PATH, 'utf8'));
const existingItems = existing.items || {};
console.log('  count:', Object.keys(existingItems).length);
console.log('  source:', existing.source);
console.log('  lastUpdated:', existing.lastUpdated);

console.log('');
console.log('[3/4] diff: server vs existing');

const serverIds = new Set(Object.keys(items).map(String));
const existingIds = new Set(Object.keys(existingItems));

const onlyOnServer = [...serverIds].filter(id => !existingIds.has(id));
const onlyExisting = [...existingIds].filter(id => !serverIds.has(id));
const inBoth = [...serverIds].filter(id => existingIds.has(id));

console.log('  in both:', inBoth.length);
console.log('  only on server (新物品 / 现有 JSON 漏了):', onlyOnServer.length);
console.log('  only in existing (现有 JSON 多了 / 已被移除):', onlyExisting.length);

if (onlyOnServer.length > 0) {
    console.log('');
    console.log('  === sample of items missing from existing JSON (max 20) ===');
    onlyOnServer.slice(0, 20).forEach(id => {
        const it = items[id];
        console.log('    + ' + id + ' [' + it.shortname + '] ' + it.Name + ' (' + it.Category + ')');
    });
}

if (onlyExisting.length > 0) {
    console.log('');
    console.log('  === sample of items only in existing (max 10) — possibly removed from game ===');
    onlyExisting.slice(0, 10).forEach(id => {
        const it = existingItems[id];
        console.log('    - ' + id + ' [' + it.shortName + '] ' + it.name);
    });
}

console.log('');
console.log('[4/4] field comparison');
const sampleId = inBoth[0];
if (sampleId) {
    console.log('  existing fields:', Object.keys(existingItems[sampleId]).join(', '));
    console.log('  server fields  :', Object.keys(items[sampleId]).join(', '));

    // Sanity check: name mismatch?
    let nameDiff = 0;
    for (const id of inBoth) {
        const existingName = existingItems[id].name;
        const serverName = items[id].Name;
        if (existingName && serverName && existingName !== serverName) nameDiff++;
    }
    console.log('  name (English) mismatch count:', nameDiff, '/', inBoth.length);
}
