#!/usr/bin/env node
/**
 * 从 SzyMig/Rust-item-list-JSON 获取最完整的 Rust 物品列表
 * 该数据源包含 1109+ 物品（从游戏文件直接提取）
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, '../src/utils/rust-items-complete.json');

// GitHub 原始文件 URL
const GITHUB_URL = 'https://raw.githubusercontent.com/SzyMig/Rust-item-list-JSON/main/Rust-Items.json';

console.log('正在从 GitHub 获取完整物品列表...');
console.log(`数据源: ${GITHUB_URL}\n`);

https.get(GITHUB_URL, (res) => {
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
        comment: 'Rust 完整物品数据库 - 从游戏文件直接提取',
        source: GITHUB_URL,
        lastUpdated: new Date().toISOString(),
        items: {}
      };

      // 类别映射（基于描述或名称推断）
      const categoryMap = {
        // 武器类
        'rifle': 'weapon',
        'gun': 'weapon',
        'pistol': 'weapon',
        'launcher': 'weapon',
        'bow': 'weapon',
        'crossbow': 'weapon',
        'sword': 'weapon',
        'knife': 'weapon',
        'spear': 'weapon',

        // 弹药类
        'ammo': 'ammo',
        'arrow': 'ammo',
        'rocket': 'ammo',
        'shell': 'ammo',
        'slug': 'ammo',
        'buckshot': 'ammo',

        // 建筑类
        'door': 'building',
        'wall': 'building',
        'foundation': 'building',
        'floor': 'building',
        'roof': 'building',
        'window': 'building',
        'frame': 'building',
        'stairs': 'building',

        // 服装类
        'shirt': 'attire',
        'pants': 'attire',
        'boots': 'attire',
        'gloves': 'attire',
        'helmet': 'attire',
        'mask': 'attire',
        'hat': 'attire',
        'jacket': 'attire',
        'vest': 'attire',
        'hoodie': 'attire',

        // 工具类
        'hatchet': 'tool',
        'pickaxe': 'tool',
        'hammer': 'tool',
        'torch': 'tool',

        // 医疗类
        'bandage': 'medical',
        'syringe': 'medical',
        'medic': 'medical',

        // 食物类
        'meat': 'food',
        'water': 'food',
        'can': 'food',
        'food': 'food',
        'apple': 'food',
        'mushroom': 'food',
        'corn': 'food',
        'pumpkin': 'food',

        // 资源类
        'ore': 'resource',
        'stone': 'resource',
        'wood': 'resource',
        'metal': 'resource',
        'sulfur': 'resource',
        'cloth': 'resource',
        'leather': 'resource',
        'bone': 'resource',
        'scrap': 'resource',

        // 电气类
        'electric': 'electrical',
        'battery': 'electrical',
        'switch': 'electrical',
        'light': 'electrical',

        // 陷阱类
        'trap': 'trap',
        'mine': 'trap',

        // 爆炸物类
        'explosive': 'explosive',
        'grenade': 'explosive',
        'c4': 'explosive',

        // 组件类
        'gear': 'component',
        'spring': 'component',
        'pipe': 'component',
        'blade': 'component',
      };

      function inferCategory(item) {
        const name = item.Name.toLowerCase();
        const shortname = item.shortname.toLowerCase();
        const desc = (item.Description || '').toLowerCase();
        const combined = `${name} ${shortname} ${desc}`;

        for (const [keyword, category] of Object.entries(categoryMap)) {
          if (combined.includes(keyword)) {
            return category;
          }
        }

        return 'misc';
      }

      for (const item of items) {
        const itemId = String(item.itemid);
        const shortName = item.shortname || 'unknown';
        const displayName = item.Name || `物品${itemId}`;
        const category = inferCategory(item);

        converted.items[itemId] = {
          name: displayName,
          shortName: shortName,
          category: category,
          description: item.Description || ''
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
