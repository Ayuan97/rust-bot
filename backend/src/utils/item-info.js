/**
 * Rust 游戏物品信息
 * 物品 ID 和中文名称映射
 * 数据来源：rust-items-complete.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载完整物品数据库
let ITEM_INFO = {};
try {
  const jsonPath = path.join(__dirname, 'rust-items-complete.json');
  const jsonData = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(jsonData);
  ITEM_INFO = data.items;
  console.log(`✅ 已加载 ${Object.keys(ITEM_INFO).length} 个 Rust 物品信息`);
} catch (error) {
  console.error('❌ 加载物品数据库失败:', error.message);
  // 使用基础物品列表作为备用
  ITEM_INFO = {
    '-1581843485': { name: '硫磺', shortName: 'sulfur', category: 'resource' },
    '-932201673': { name: '废料', shortName: 'scrap', category: 'resource' },
    '-1059362949': { name: '高质金属', shortName: 'metal.refined', category: 'resource' },
    '69511070': { name: '金属碎片', shortName: 'metal.fragments', category: 'resource' },
  };
}

// 加载中文翻译
let TRANSLATIONS = {};
let REVERSE_TRANSLATIONS = {}; // 中文 -> 英文shortName
try {
  const translationPath = path.join(__dirname, 'item-translations.json');
  const translationData = fs.readFileSync(translationPath, 'utf8');
  const data = JSON.parse(translationData);
  TRANSLATIONS = data.translations;

  // 构建反向映射（中文 -> shortName）
  for (const [shortName, chineseName] of Object.entries(TRANSLATIONS)) {
    REVERSE_TRANSLATIONS[chineseName.toLowerCase()] = shortName;
  }

  console.log(`✅ 已加载 ${Object.keys(TRANSLATIONS).length} 个中文翻译`);
} catch (error) {
  console.warn('⚠️  未找到中文翻译文件，仅支持英文搜索');
}

// 未知物品缓存（记录遇到但不在数据库中的物品ID）
const unknownItems = new Set();

// 未知物品记录文件
const UNKNOWN_ITEMS_FILE = path.join(__dirname, 'unknown-items.json');

/**
 * 保存未知物品到JSON文件
 * @param {string} itemId - 物品ID
 */
function saveUnknownItem(itemId) {
  try {
    // 读取现有记录
    let data = { items: {}, lastUpdated: null };
    if (fs.existsSync(UNKNOWN_ITEMS_FILE)) {
      const content = fs.readFileSync(UNKNOWN_ITEMS_FILE, 'utf8');
      data = JSON.parse(content);
    }

    // 添加或更新物品记录
    if (!data.items[itemId]) {
      data.items[itemId] = {
        firstSeen: new Date().toISOString(),
        count: 1
      };
      console.log(`⚠️  新的未知物品ID已记录: ${itemId} - 请添加到 rust-items-complete.json`);
    } else {
      data.items[itemId].count = (data.items[itemId].count || 0) + 1;
      data.items[itemId].lastSeen = new Date().toISOString();
    }

    data.lastUpdated = new Date().toISOString();

    // 保存到文件
    fs.writeFileSync(UNKNOWN_ITEMS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('保存未知物品记录失败:', error.message);
  }
}

/**
 * 获取物品名称（优先返回中文翻译）
 * @param {number|string} itemId - 物品 ID
 * @param {boolean} preferChinese - 优先返回中文名称（默认true）
 * @returns {string} 物品名称
 */
export function getItemName(itemId, preferChinese = true) {
  const id = String(itemId);
  if (ITEM_INFO[id]) {
    const item = ITEM_INFO[id];

    // 如果有中文翻译且用户希望中文，返回中文
    if (preferChinese && TRANSLATIONS[item.shortName]) {
      return TRANSLATIONS[item.shortName];
    }

    // 否则返回英文名称
    return item.name;
  }

  // 记录未知物品ID（避免重复日志）
  if (!unknownItems.has(id)) {
    unknownItems.add(id);
    saveUnknownItem(id);
  }

  return `[ID:${itemId}]`;
}

/**
 * 获取物品简称
 * @param {number|string} itemId - 物品 ID
 * @returns {string} 物品简称
 */
export function getItemShortName(itemId) {
  const id = String(itemId);
  return ITEM_INFO[id]?.shortName || 'unknown';
}

/**
 * 检查物品是否重要（需要特别通知）
 * @param {number|string} itemId - 物品 ID
 * @returns {boolean} 是否重要
 */
export function isImportantItem(itemId) {
  const id = String(itemId);

  // 根据类别判断重要性
  const item = ITEM_INFO[id];
  if (!item) return false;

  // 武器、爆炸物、高级资源视为重要
  if (item.category === 'weapon' || item.category === 'explosive') {
    return true;
  }

  // 特殊标记的重要资源
  const importantResources = ['硫磺', '废料', '高质金属', 'C4炸药', '火箭弹'];
  return importantResources.includes(item.name);
}

/**
 * 获取物品类别
 * @param {number|string} itemId - 物品 ID
 * @returns {string} 物品类别
 */
export function getItemCategory(itemId) {
  const id = String(itemId);
  return ITEM_INFO[id]?.category || 'unknown';
}

/**
 * 获取所有重要物品 ID
 * @returns {string[]} 重要物品 ID 列表
 */
export function getImportantItemIds() {
  return Object.keys(ITEM_INFO).filter(id => isImportantItem(id));
}

/**
 * 根据中文名或shortName搜索物品
 * @param {string} searchTerm - 搜索关键词
 * @returns {string[]} 匹配的物品ID列表（按相关度排序）
 */
export function searchItems(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  const matches = [];

  // 先检查是否有精确的中文翻译匹配
  const exactShortName = REVERSE_TRANSLATIONS[term];
  if (exactShortName) {
    // 找到精确匹配的shortName，查找对应的物品ID
    for (const [itemId, itemInfo] of Object.entries(ITEM_INFO)) {
      if (itemInfo.shortName === exactShortName) {
        return [itemId]; // 精确匹配，直接返回
      }
    }
  }

  // 模糊搜索：检查所有物品，并记录匹配优先级
  for (const [itemId, itemInfo] of Object.entries(ITEM_INFO)) {
    const name = itemInfo.name.toLowerCase();
    const shortName = itemInfo.shortName.toLowerCase();
    const chineseName = TRANSLATIONS[itemInfo.shortName]?.toLowerCase() || '';

    let score = 0;

    // 精确匹配 shortName（最高优先级）
    if (shortName === term) {
      score = 100;
    }
    // shortName 以搜索词开头
    else if (shortName.startsWith(term)) {
      score = 90;
    }
    // 英文名称以搜索词开头
    else if (name.startsWith(term)) {
      score = 80;
    }
    // 中文翻译精确匹配
    else if (chineseName === term) {
      score = 75;
    }
    // shortName 包含搜索词（单词边界匹配）
    else if (shortName.includes('.' + term) || shortName.includes(term + '.')) {
      score = 70;
    }
    // 中文翻译包含搜索词
    else if (chineseName.includes(term)) {
      score = 60;
    }
    // shortName 包含搜索词
    else if (shortName.includes(term)) {
      score = 50;
    }
    // 英文名称包含搜索词
    else if (name.includes(term)) {
      score = 40;
    }

    if (score > 0) {
      matches.push({ itemId, score });
    }
  }

  // 按分数降序排序
  matches.sort((a, b) => b.score - a.score);

  return matches.map(m => m.itemId);
}

/**
 * 获取所有未知物品ID列表（用于调试）
 * @returns {string[]} 未知物品ID列表
 */
export function getUnknownItemIds() {
  return Array.from(unknownItems);
}

/**
 * 获取物品数据库大小
 * @returns {number} 数据库中的物品数量
 */
export function getItemDatabaseSize() {
  return Object.keys(ITEM_INFO).length;
}

export { ITEM_INFO, TRANSLATIONS };

export default {
  ITEM_INFO,
  TRANSLATIONS,
  getItemName,
  getItemShortName,
  isImportantItem,
  getItemCategory,
  getImportantItemIds,
  searchItems,
  getUnknownItemIds,
  getItemDatabaseSize
};
