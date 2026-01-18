/**
 * 地图解析器测试脚本
 * 用法: node test-map-parser.js <map-path-or-url>
 */

import mapParser from './src/services/map-parser.service.js';
import fs from 'fs';

async function test() {
  const input = process.argv[2];

  if (!input) {
    console.log('用法: node test-map-parser.js <map-path-or-url>');
    console.log('示例: node test-map-parser.js D:/path/to/map.map');
    console.log('示例: node test-map-parser.js https://example.com/map.map');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Rust 地图解析器测试');
  console.log('='.repeat(60));
  console.log('');

  try {
    let result;

    // 判断是本地文件还是 URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      result = await mapParser.parseFromUrl(input, { useCache: false });
    } else {
      // 本地文件
      if (!fs.existsSync(input)) {
        throw new Error('文件不存在: ' + input);
      }
      result = await mapParser.parseFromFile(input);
    }

    console.log('\n' + '='.repeat(60));
    console.log('解析结果摘要');
    console.log('='.repeat(60));

    console.log('\n[基本信息]');
    console.log('  版本:', result.version);
    console.log('  时间戳:', result.timestamp);
    console.log('  地图大小:', result.size, '米');

    console.log('\n[地形层]');
    result.maps.forEach(m => {
      console.log(`  - ${m.name}: ${(m.dataSize / 1024).toFixed(1)} KB`);
    });

    console.log('\n[路径数据]');
    const roads = result.paths.filter(p => p.name?.toLowerCase().includes('road'));
    const rivers = result.paths.filter(p => p.name?.toLowerCase().includes('river'));
    const rails = result.paths.filter(p => p.name?.toLowerCase().includes('rail'));
    console.log('  道路数:', roads.length);
    console.log('  河流数:', rivers.length);
    console.log('  铁路数:', rails.length);

    console.log('\n[预制体/纪念碑]');
    console.log('  总数:', result.prefabs.length);

    // 按类别统计
    const categories = {};
    result.prefabs.forEach(p => {
      const cat = p.category || 'Unknown';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([cat, count]) => {
        console.log(`  - ${cat}: ${count}`);
      });

    // 显示一些预制体示例
    console.log('\n[预制体示例 (前5个)]');
    result.prefabs.slice(0, 5).forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.category}] ID:${p.id}`);
      if (p.position) {
        console.log(`     位置: (${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)})`);
      }
    });

    // 显示一些道路示例
    if (roads.length > 0) {
      console.log('\n[道路示例 (前3条)]');
      roads.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.name} - 宽度:${r.width?.toFixed(1)} 节点数:${r.nodeCount}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('测试完成!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n解析失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
