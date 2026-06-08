#!/usr/bin/env node
// Convert Rust dedicated server's Bundles/items/*.json into the format consumed by
// backend/src/utils/item-info.js, preserving all extra fields (stackable / condition / etc).
//
// Usage:
//   node tools/update-items.mjs            # dry-run: report only
//   node tools/update-items.mjs --apply    # back up old JSON and replace it

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'tools/rust-server/Bundles/items');
const TARGET = path.join(ROOT, 'backend/src/utils/rust-items-complete.json');
const apply = process.argv.includes('--apply');

console.log('[1/4] reading', path.relative(ROOT, ITEMS_DIR));
const files = fs.readdirSync(ITEMS_DIR).filter(f => f.endsWith('.json'));
console.log('  files:', files.length);

const items = {};
let parsed = 0;
let errors = 0;
for (const file of files) {
    try {
        const obj = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8'));
        if (typeof obj.itemid !== 'number') { errors++; continue; }
        // Convert to existing format (lowercase + camelCase) while keeping all extra fields
        items[String(obj.itemid)] = {
            name: obj.Name,
            shortName: obj.shortname,
            category: obj.Category,
            description: obj.Description,
            stackable: obj.stackable,
            rarity: obj.rarity,
            itemType: obj.ItemType,
            amountType: obj.AmountType,
            maxDraggable: obj.maxDraggable,
            quickDespawn: obj.quickDespawn,
            isWearable: obj.isWearable,
            isHoldable: obj.isHoldable,
            isUsable: obj.isUsable,
            hasSkins: obj.HasSkins,
            condition: obj.condition,
            parent: obj.Parent
        };
        parsed++;
    } catch (e) {
        errors++;
    }
}
console.log('  parsed:', parsed, 'errors:', errors);

console.log('');
console.log('[2/4] reading existing target');
const existing = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
const existingItems = existing.items || {};
console.log('  existing count:', Object.keys(existingItems).length);
console.log('  source       :', existing.source);
console.log('  lastUpdated  :', existing.lastUpdated);

console.log('');
console.log('[3/4] diff summary');
const newIds = new Set(Object.keys(items));
const oldIds = new Set(Object.keys(existingItems));
const onlyNew = [...newIds].filter(id => !oldIds.has(id));
const onlyOld = [...oldIds].filter(id => !newIds.has(id));
console.log('  + new (server has, target lacks):', onlyNew.length);
console.log('  - removed (target has, server lacks):', onlyOld.length);
console.log('  = unchanged ids:', newIds.size - onlyNew.length);

const newPayload = {
    comment: 'Rust 完整物品数据库 - 直接从 RustDedicated 服务器二进制 Bundles/items/*.json 提取',
    source: 'RustDedicated_Data/Bundles/items/*.json (官方游戏文件)',
    extractedAt: new Date().toISOString(),
    count: Object.keys(items).length,
    items
};

console.log('');
console.log('[4/4]', apply ? 'applying changes' : 'DRY RUN (use --apply to write)');
if (apply) {
    const backup = TARGET + '.bak';
    fs.copyFileSync(TARGET, backup);
    console.log('  backed up old to:', path.relative(ROOT, backup));
    fs.writeFileSync(TARGET, JSON.stringify(newPayload, null, 2));
    console.log('  wrote new:', path.relative(ROOT, TARGET));
} else {
    const previewPath = path.join(ROOT, 'tools/rust-items-preview.json');
    fs.writeFileSync(previewPath, JSON.stringify(newPayload, null, 2));
    console.log('  preview:', path.relative(ROOT, previewPath));
    console.log('  rerun with --apply to replace target');
}
