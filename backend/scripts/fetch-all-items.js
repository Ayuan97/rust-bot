#!/usr/bin/env node
/**
 * 从 GitHub 获取完整的 Rust 物品列表
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, '../src/utils/rust-items-complete.json');

// GitHub Gist URL
const GIST_URL = 'https://gist.githubusercontent.com/Marcuzz/9e01a39a8f5f83dc673bfc6f6fa4aacc/raw/';

console.log('正在从 GitHub 获取完整物品列表...');

https.get(GIST_URL, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const items = JSON.parse(data);
      console.log(`✅ 获取到 ${items.length} 个物品`);

      // 转换为我们的格式
      const converted = {
        comment: 'Rust 完整物品数据库 - 从 GitHub Gist 自动生成',
        source: GIST_URL,
        lastUpdated: new Date().toISOString(),
        items: {}
      };

      // 类别映射（英文 -> 中文）
      const categoryMap = {
        'Weapon': 'weapon',
        'Ammunition': 'ammo',
        'Attire': 'attire',
        'Construction': 'building',
        'Items': 'misc',
        'Resources': 'resource',
        'Food': 'food',
        'Tool': 'tool',
        'Medical': 'medical',
        'Electrical': 'electrical',
        'Traps': 'trap',
        'Misc': 'misc',
        'Component': 'component',
        'Fun': 'misc'
      };

      for (const item of items) {
        const itemId = String(item.id);
        // 正确提取shortname字段
        const shortName = item.shortname || item.shortName || item.short_name || 'unknown';
        const displayName = item.displayName || item.name || `物品${itemId}`;
        const category = categoryMap[item.category] || 'misc';

        converted.items[itemId] = {
          name: displayName,
          shortName: shortName,
          category: category
        };
      }

      // 保存到文件
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(converted, null, 2), 'utf8');
      console.log(`✅ 已保存 ${Object.keys(converted.items).length} 个物品到 ${OUTPUT_FILE}`);
      console.log('\n按类别统计:');

      // 统计各类别数量
      const categoryCount = {};
      for (const item of Object.values(converted.items)) {
        categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
      }

      for (const [category, count] of Object.entries(categoryCount).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${category.padEnd(15)}: ${count}`);
      }

    } catch (error) {
      console.error('❌ 解析数据失败:', error.message);
      process.exit(1);
    }
  });

}).on('error', (error) => {
  console.error('❌ 获取数据失败:', error.message);
  process.exit(1);
});
