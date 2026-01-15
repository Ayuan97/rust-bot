/**
 * 子网格边界处理测试
 * 用于验证子网格与主网格的边界处理一致性
 */

const GRID_DIAMETER = 146.25;
const SUB_GRID_SIZE = 3;
const subGridWidth = GRID_DIAMETER / SUB_GRID_SIZE; // 48.75

// ============================================================
// 主网格函数 (来自 coordinates.js)
// ============================================================

function getGridPosLettersX(x, mapSize) {
  let counter = 1;
  for (let startGrid = 0; startGrid < mapSize; startGrid += GRID_DIAMETER) {
    if (x >= startGrid && x <= (startGrid + GRID_DIAMETER)) {
      return counter;
    }
    counter++;
  }
  return null;
}

function getGridPosNumberY(y, mapSize) {
  const numberOfGrids = Math.floor(mapSize / GRID_DIAMETER);
  let counter = 1;
  for (let startGrid = 0; startGrid < mapSize; startGrid += GRID_DIAMETER) {
    if (y >= startGrid && y <= (startGrid + GRID_DIAMETER)) {
      return numberOfGrids - counter;
    }
    counter++;
  }
  return null;
}

// ============================================================
// 子网格方案
// ============================================================

// 当前实现 (Math.floor) - X归右, Y归上
function currentImpl(relativeX, relativeY) {
  const subGridX = Math.floor(relativeX / subGridWidth);
  const subGridY = Math.floor(relativeY / subGridWidth);
  const clampedX = Math.max(0, Math.min(subGridX, SUB_GRID_SIZE - 1));
  const clampedY = Math.max(0, Math.min(subGridY, SUB_GRID_SIZE - 1));
  return clampedY * SUB_GRID_SIZE + clampedX + 1;
}

// 方案: 循环+<= (与主网格一致) - X归左, Y归下
function consistentImpl(relativeX, relativeY) {
  let subGridX = 0;
  for (let i = 0; i < SUB_GRID_SIZE; i++) {
    const start = i * subGridWidth;
    if (relativeX >= start && relativeX <= start + subGridWidth) {
      subGridX = i;
      break;
    }
  }

  let subGridY = 0;
  for (let i = 0; i < SUB_GRID_SIZE; i++) {
    const start = i * subGridWidth;
    if (relativeY >= start && relativeY <= start + subGridWidth) {
      subGridY = i;
      break;
    }
  }

  return subGridY * SUB_GRID_SIZE + subGridX + 1;
}

// ============================================================
// 测试
// ============================================================

console.log('子网格布局:');
console.log('  7 8 9  (row=2, Y大, 北)');
console.log('  4 5 6  (row=1)');
console.log('  1 2 3  (row=0, Y小, 南)');
console.log('');

console.log('=== 主网格边界行为 ===');
const mapSize = 4387.5;
console.log(`X: 146.25 → col ${getGridPosLettersX(146.25, mapSize)} (边界归左)`);
console.log(`Y: 146.25 → row ${getGridPosNumberY(146.25, mapSize)} (边界归到先匹配的)`);
console.log('');

console.log('=== 子网格边界测试 ===');
console.log('subGridWidth =', subGridWidth);
console.log('');

const testCases = [
  // [relativeX, relativeY, 描述]
  [24, 24, '1号中心'],
  [73, 73, '5号中心'],
  [122, 122, '9号中心'],
  [48.74, 122, '7内侧'],
  [48.75, 122, '7-8边界'],
  [48.76, 122, '8内侧'],
  [24, 97.49, '4内侧'],
  [24, 97.50, '4-7边界'],
  [24, 97.51, '7内侧'],
  [48.75, 97.50, '交叉边界'],
];

console.log('坐标\t\t\t当前\t一致方案\t说明');
console.log('─'.repeat(60));

for (const [rx, ry, desc] of testCases) {
  const curr = currentImpl(rx, ry);
  const cons = consistentImpl(rx, ry);
  const diff = curr !== cons ? ' ←' : '';
  console.log(`(${rx}, ${ry})\t\t${curr}\t${cons}\t\t${desc}${diff}`);
}

console.log('');
console.log('=== 结论 ===');
console.log('当前实现: Math.floor, 边界归右/归上');
console.log('一致方案: 循环+<=, 边界归左/归下 (与主网格一致)');



