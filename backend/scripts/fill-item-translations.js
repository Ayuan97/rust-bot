#!/usr/bin/env node
/**
 * 补全 item-translations.json：
 * - 保留已有翻译
 * - 为缺失的 shortName 自动翻译英文物品名（en -> zh）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import translate from 'translate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ITEM_DB_PATH = path.join(__dirname, '../src/utils/rust-items-complete.json');
const TRANSLATION_PATH = path.join(__dirname, '../src/utils/item-translations.json');

const DEFAULT_CONCURRENCY = 4;
const SAVE_EVERY = 25;

function parseArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.split('=')[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveTranslations(translations) {
  const sortedEntries = Object.entries(translations).sort((a, b) => a[0].localeCompare(b[0]));
  const sortedTranslations = Object.fromEntries(sortedEntries);

  const output = {
    comment: 'Rust 物品中英文翻译对照表',
    lastUpdated: new Date().toISOString(),
    translations: sortedTranslations
  };

  fs.writeFileSync(TRANSLATION_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

async function translateWithRetry(text, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = (await translate(text, { from: 'en', to: 'zh' }))?.trim();
      if (result) {
        return result;
      }
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
    }
  }
  return '';
}

async function main() {
  const concurrency = parseArg('concurrency', DEFAULT_CONCURRENCY);

  const itemDb = loadJson(ITEM_DB_PATH);
  const translationDb = loadJson(TRANSLATION_PATH);

  const translations = { ...(translationDb.translations || {}) };
  const shortNameToName = new Map();

  for (const item of Object.values(itemDb.items || {})) {
    if (!item?.shortName || !item?.name) continue;
    if (!shortNameToName.has(item.shortName)) {
      shortNameToName.set(item.shortName, item.name);
    }
  }

  const shortNames = [...shortNameToName.keys()];
  const missing = shortNames.filter(shortName => !translations[shortName]);

  console.log(`总 shortName: ${shortNames.length}`);
  console.log(`已有翻译: ${Object.keys(translations).length}`);
  console.log(`待补全: ${missing.length}`);
  console.log(`并发数: ${concurrency}`);

  if (missing.length === 0) {
    saveTranslations(translations);
    console.log('无需补全，已刷新时间戳。');
    return;
  }

  let cursor = 0;
  let completed = 0;
  let failed = 0;

  async function worker(workerId) {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= missing.length) {
        break;
      }

      const shortName = missing[currentIndex];
      const englishName = shortNameToName.get(shortName) || shortName;

      try {
        const translated = await translateWithRetry(englishName);
        translations[shortName] = translated || englishName;
      } catch (error) {
        failed += 1;
        translations[shortName] = englishName;
        console.warn(`[worker ${workerId}] 翻译失败，使用英文回退: ${shortName} -> ${englishName}`);
      }

      completed += 1;
      if (completed % SAVE_EVERY === 0 || completed === missing.length) {
        saveTranslations(translations);
        const percent = ((completed / missing.length) * 100).toFixed(1);
        console.log(`进度 ${completed}/${missing.length} (${percent}%)`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  saveTranslations(translations);
  console.log(`完成。失败回退: ${failed}`);
  console.log(`最终翻译条目: ${Object.keys(translations).length}`);
}

main().catch(error => {
  console.error('补全失败:', error);
  process.exit(1);
});
