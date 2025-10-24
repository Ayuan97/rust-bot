#!/usr/bin/env node
/**
 * Rust 物品数据库管理工具
 * 用于查看、添加和更新物品信息
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '../src/utils/rust-items-complete.json');

// 加载物品数据库
function loadDatabase() {
  try {
    const data = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ 加载数据库失败:', error.message);
    process.exit(1);
  }
}

// 保存物品数据库
function saveDatabase(data) {
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('✅ 数据库已保存');
  } catch (error) {
    console.error('❌ 保存数据库失败:', error.message);
    process.exit(1);
  }
}

// 查看数据库统计信息
function showStats() {
  const db = loadDatabase();
  const items = db.items;
  const count = Object.keys(items).length;

  // 统计各类别数量
  const categories = {};
  for (const item of Object.values(items)) {
    categories[item.category] = (categories[item.category] || 0) + 1;
  }

  console.log('\n📊 物品数据库统计');
  console.log('═══════════════════════════════════════');
  console.log(`总物品数: ${count}`);
  console.log('\n按类别统计:');
  for (const [category, num] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${category.padEnd(15)} : ${num}`);
  }
  console.log('═══════════════════════════════════════\n');
}

// 添加新物品
function addItem(itemId, name, shortName, category = 'misc') {
  const db = loadDatabase();

  if (db.items[itemId]) {
    console.log(`⚠️  物品 ${itemId} 已存在: ${db.items[itemId].name}`);
    return;
  }

  db.items[itemId] = {
    name,
    shortName,
    category
  };

  saveDatabase(db);
  console.log(`✅ 已添加物品: ${itemId} - ${name} (${shortName})`);
}

// 批量添加物品
function addBulkItems(itemsArray) {
  const db = loadDatabase();
  let added = 0;

  for (const item of itemsArray) {
    if (!db.items[item.id]) {
      db.items[item.id] = {
        name: item.name,
        shortName: item.shortName,
        category: item.category || 'misc'
      };
      added++;
    }
  }

  saveDatabase(db);
  console.log(`✅ 批量添加完成: ${added} 个新物品`);
}

// 搜索物品
function searchItem(keyword) {
  const db = loadDatabase();
  const items = db.items;
  const results = [];

  for (const [id, item] of Object.entries(items)) {
    if (
      item.name.toLowerCase().includes(keyword.toLowerCase()) ||
      item.shortName.toLowerCase().includes(keyword.toLowerCase()) ||
      id === keyword
    ) {
      results.push({ id, ...item });
    }
  }

  if (results.length === 0) {
    console.log(`❌ 未找到包含 "${keyword}" 的物品`);
    return;
  }

  console.log(`\n🔍 搜索结果 (${results.length}):`)  ;
  console.log('═══════════════════════════════════════');
  for (const item of results) {
    console.log(`ID: ${item.id}`);
    console.log(`名称: ${item.name}`);
    console.log(`shortName: ${item.shortName}`);
    console.log(`类别: ${item.category}`);
    console.log('───────────────────────────────────────');
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
Rust 物品数据库管理工具
═══════════════════════════════════════

用法:
  node manage-items.js <命令> [参数]

命令:
  stats                          显示数据库统计信息
  search <关键词>                 搜索物品
  add <ID> <名称> <shortName> [类别]    添加单个物品
  help                           显示此帮助信息

示例:
  node manage-items.js stats
  node manage-items.js search AK
  node manage-items.js add 123456 "测试物品" "test.item" "misc"

类别列表:
  resource, weapon, explosive, ammo, tool, armor, medical,
  component, building, food, deployable, vehicle, attire, misc
  `);
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'stats':
      showStats();
      break;

    case 'search':
      if (!args[1]) {
        console.error('❌ 缺少搜索关键词');
        console.log('用法: node manage-items.js search <关键词>');
        process.exit(1);
      }
      searchItem(args[1]);
      break;

    case 'add':
      if (args.length < 4) {
        console.error('❌ 参数不足');
        console.log('用法: node manage-items.js add <ID> <名称> <shortName> [类别]');
        process.exit(1);
      }
      addItem(args[1], args[2], args[3], args[4] || 'misc');
      break;

    case 'help':
    default:
      showHelp();
      break;
  }
}

main();
