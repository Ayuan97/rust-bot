/**
 * Rust 游戏坐标转换工具
 * 参考: https://github.com/alexemanuelol/rustplusplus
 */

import MONUMENT_INFO from './monument-info.js';

const GRID_DIAMETER = 146.25; // 每个网格的大小
const SUB_GRID_SIZE = 3; // 子网格分割数量（3x3 = 9个子格）

/**
 * 将数字转换为字母（1=A, 2=B, ..., 27=AA）
 */
function numberToLetters(num) {
  const mod = num % 26;
  let pow = Math.floor(num / 26);
  const out = mod ? String.fromCharCode(64 + mod) : (pow--, 'Z');
  return pow ? numberToLetters(pow) + out : out;
}

/**
 * 修正地图大小（对齐到网格）
 */
function getCorrectedMapSize(mapSize) {
  const remainder = mapSize % GRID_DIAMETER;
  const offset = GRID_DIAMETER - remainder;
  return (remainder < 120) ? mapSize - remainder : mapSize + offset;
}

/**
 * 检查坐标是否在网格系统外
 */
function isOutsideGridSystem(x, y, correctedMapSize) {
  return x < 0 || x > correctedMapSize || y < 0 || y > correctedMapSize;
}

/**
 * 获取 X 坐标对应的网格字母（A, B, C, ...）
 */
function getGridPosLettersX(x, mapSize) {
  let counter = 1;
  for (let startGrid = 0; startGrid < mapSize; startGrid += GRID_DIAMETER) {
    if (x >= startGrid && x <= (startGrid + GRID_DIAMETER)) {
      return numberToLetters(counter);
    }
    counter++;
  }
  return null;
}

/**
 * 获取 Y 坐标对应的网格数字（0-29）
 */
function getGridPosNumberY(y, mapSize) {
  let counter = 1;
  const numberOfGrids = Math.floor(mapSize / GRID_DIAMETER);
  for (let startGrid = 0; startGrid < mapSize; startGrid += GRID_DIAMETER) {
    if (y >= startGrid && y <= (startGrid + GRID_DIAMETER)) {
      return numberOfGrids - counter;
    }
    counter++;
  }
  return null;
}

/**
 * 获取网格内的子网格编号（1-9）
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} mapSize - 地图大小
 * @returns {number|null} 子网格编号（1-9）或 null
 */
function getSubGridNumber(x, y, mapSize) {
  const correctedMapSize = getCorrectedMapSize(mapSize);

  // 找到当前网格的起始位置
  let gridStartX = 0;
  let counter = 1;
  for (let startGrid = 0; startGrid < correctedMapSize; startGrid += GRID_DIAMETER) {
    if (x >= startGrid && x <= (startGrid + GRID_DIAMETER)) {
      gridStartX = startGrid;
      break;
    }
    counter++;
  }

  let gridStartY = 0;
  counter = 1;
  for (let startGrid = 0; startGrid < correctedMapSize; startGrid += GRID_DIAMETER) {
    if (y >= startGrid && y <= (startGrid + GRID_DIAMETER)) {
      gridStartY = startGrid;
      break;
    }
    counter++;
  }

  // 计算在网格内的相对位置
  const relativeX = x - gridStartX;
  const relativeY = y - gridStartY;

  // 计算子网格大小
  const subGridWidth = GRID_DIAMETER / SUB_GRID_SIZE;

  // 计算子网格索引（0-2）
  const subGridX = Math.floor(relativeX / subGridWidth);
  const subGridY = Math.floor(relativeY / subGridWidth);

  // 防止越界
  const clampedX = Math.min(subGridX, SUB_GRID_SIZE - 1);
  const clampedY = Math.min(subGridY, SUB_GRID_SIZE - 1);

  // 转换为 1-9 的编号
  // 布局：
  // 7 8 9
  // 4 5 6
  // 1 2 3
  const subGridNumber = (SUB_GRID_SIZE - 1 - clampedY) * SUB_GRID_SIZE + clampedX + 1;

  return subGridNumber;
}

/**
 * 将游戏坐标转换为网格位置（如 A5, B12）
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} mapSize - 地图大小
 * @param {boolean} includeSubGrid - 是否包含子网格编号
 * @returns {string|null} 网格位置（如 "A5" 或 "A5-3"）或 null（超出范围）
 */
function getGridPos(x, y, mapSize, includeSubGrid = false) {
  // 先按报告的地图大小纠正
  let correctedMapSize = getCorrectedMapSize(mapSize);

  // 如果坐标超出纠正后的范围，放大到能覆盖坐标的最近网格边界
  if (isOutsideGridSystem(x, y, correctedMapSize)) {
    const maxCoord = Math.max(x, y);
    const gridsNeeded = Math.ceil((maxCoord + GRID_DIAMETER) / GRID_DIAMETER);
    correctedMapSize = gridsNeeded * GRID_DIAMETER;
  }

  const gridPosLetters = getGridPosLettersX(x, correctedMapSize);
  const gridPosNumber = getGridPosNumberY(y, correctedMapSize);

  if (!gridPosLetters || gridPosNumber === null) {
    return null;
  }

  const baseGrid = gridPosLetters + gridPosNumber;

  if (includeSubGrid) {
    // 子网格也使用放大后的有效地图大小确保命中
    const subGrid = getSubGridNumber(x, y, correctedMapSize);
    if (subGrid !== null) {
      return `${baseGrid}-${subGrid}`;
    }
  }

  return baseGrid;
}

/**
 * 计算两点之间的距离
 */
function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * 计算相对于地图中心的方位
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {number} mapSize - 地图大小
 * @returns {string} 方位（如："右上", "左下", "中心"）
 */
function getDirection(x, y, mapSize) {
  const center = mapSize / 2;
  const dx = x - center;
  const dy = y - center;

  // 距离中心的距离
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 如果距离很近（小于地图1/6），认为是中心
  if (distance < mapSize / 6) {
    return '中心';
  }

  // 判断主要方向
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // 8个方向判断
  if (angle >= -22.5 && angle < 22.5) {
    return '右';
  } else if (angle >= 22.5 && angle < 67.5) {
    return '右上';
  } else if (angle >= 67.5 && angle < 112.5) {
    return '上';
  } else if (angle >= 112.5 && angle < 157.5) {
    return '左上';
  } else if (angle >= 157.5 || angle < -157.5) {
    return '左';
  } else if (angle >= -157.5 && angle < -112.5) {
    return '左下';
  } else if (angle >= -112.5 && angle < -67.5) {
    return '下';
  } else {
    return '右下';
  }
}

/**
 * 计算两点之间的角度（度数）
 */
function getAngleBetweenPoints(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

/**
 * 根据坐标和古迹列表，找到最近的古迹
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {Array} monuments - 古迹列表（来自 RustPlus API）
 * @returns {string|null} 古迹名称或 null
 */
function getNearestMonument(x, y, monuments) {
  if (!monuments || monuments.length === 0) {
    return null;
  }

  for (const monument of monuments) {
    // 跳过某些特殊古迹（地下基地、隧道系统等）
    if (monument.token === 'DungeonBase' || monument.token === 'underwater_lab') {
      continue;
    }

    // 检查是否在 MONUMENT_INFO 中定义
    const monumentInfo = MONUMENT_INFO[monument.token];
    if (!monumentInfo) {
      continue;
    }

    // 半径为 0 的古迹不参与判定
    if (monumentInfo.radius === 0) {
      continue;
    }

    // 计算距离
    const distance = getDistance(x, y, monument.x, monument.y);

    // 如果在古迹范围内，返回古迹名称
    if (distance <= monumentInfo.radius) {
      return monumentInfo.name;
    }
  }

  return null;
}

/**
 * 格式化坐标显示
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} mapSize - 地图大小
 * @param {boolean} includeSubGrid - 是否包含子网格编号（默认true）
 * @param {boolean} includeCoords - 是否包含精确坐标（默认false）
 * @param {Array} monuments - 古迹列表（可选）
 * @returns {string} 格式化的坐标字符串
 */
function formatPosition(x, y, mapSize, includeSubGrid = true, includeCoords = false, monuments = null, oceanMargin = 0) {
  // 按 rustplusplus 约定，队伍坐标以世界坐标为基准（0..mapSize）
  // oceanMargin 仅用于地图图像边缘显示，不参与队伍坐标换算
  const playableSize = mapSize;
  const adjX = x;
  const adjY = y;

  const grid = getGridPos(adjX, adjY, playableSize, includeSubGrid);

  // 检查是否在古迹附近
  let monumentName = null;
  if (monuments) {
    monumentName = getNearestMonument(adjX, adjY, monuments);
  }

  if (grid) {
    if (monumentName) {
      // 有古迹名称时：古迹名(网格)
      return `${monumentName}(${grid})`;
    } else if (includeCoords) {
      // 包含精确坐标
      const coords = `(${Math.round(adjX)},${Math.round(adjY)})`;
      return `${grid}${coords}`;
    }
    return grid;
  }

  // 如果没有网格位置
  if (monumentName) {
    return monumentName;
  }

  // 无法计算网格位置时返回 "未知位置"，不使用原始坐标
  return '未知位置';
}

export {
  GRID_DIAMETER,
  SUB_GRID_SIZE,
  numberToLetters,
  getCorrectedMapSize,
  isOutsideGridSystem,
  getGridPosLettersX,
  getGridPosNumberY,
  getSubGridNumber,
  getGridPos,
  getDistance,
  getDirection,
  getAngleBetweenPoints,
  getNearestMonument,
  formatPosition
};

export default {
  GRID_DIAMETER,
  SUB_GRID_SIZE,
  numberToLetters,
  getCorrectedMapSize,
  isOutsideGridSystem,
  getGridPosLettersX,
  getGridPosNumberY,
  getSubGridNumber,
  getGridPos,
  getDistance,
  getDirection,
  getAngleBetweenPoints,
  getNearestMonument,
  formatPosition
};
