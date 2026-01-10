/**
 * Rust 游戏坐标转换工具
 * 从后端 coordinates.js 移植到前端
 */

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
 */
function getSubGridNumber(x, y, mapSize) {
    const correctedMapSize = getCorrectedMapSize(mapSize);

    // 找到当前网格的起始位置
    let gridStartX = 0;
    for (let startGrid = 0; startGrid < correctedMapSize; startGrid += GRID_DIAMETER) {
        if (x >= startGrid && x <= (startGrid + GRID_DIAMETER)) {
            gridStartX = startGrid;
            break;
        }
    }

    let gridStartY = 0;
    for (let startGrid = 0; startGrid < correctedMapSize; startGrid += GRID_DIAMETER) {
        if (y >= startGrid && y <= (startGrid + GRID_DIAMETER)) {
            gridStartY = startGrid;
            break;
        }
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
    const subGridNumber = (SUB_GRID_SIZE - 1 - clampedY) * SUB_GRID_SIZE + clampedX + 1;

    return subGridNumber;
}

/**
 * 将游戏坐标转换为网格位置（如 A5, B12）
 */
function getGridPos(x, y, mapSize, includeSubGrid = false) {
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
        const subGrid = getSubGridNumber(x, y, correctedMapSize);
        if (subGrid !== null) {
            return `${baseGrid}-${subGrid}`;
        }
    }

    return baseGrid;
}

/**
 * 将游戏坐标转换为网格位置字符串
 * @param {number} x - X坐标
 * @param {number} y - Y坐标  
 * @param {number} mapSize - 地图大小 (默认4500)
 * @returns {string} 网格位置字符串 (例如: "G12-5")
 */
export function coordsToGrid(x, y, mapSize = 4500) {
    const playableSize = mapSize;

    // 钳制坐标到地图边界
    const adjX = Math.max(0, Math.min(x, playableSize));
    const adjY = Math.max(0, Math.min(y, playableSize));

    const grid = getGridPos(adjX, adjY, playableSize, true); // 包含子网格

    return grid || '未知';
}

/**
 * 计算玩家活跃时间
 * @param {number} spawnTime - 出生时间戳
 * @returns {string} 格式化的活跃时间 (例如: "2.5h", "45m")
 */
export function formatActiveTime(spawnTime) {
    if (!spawnTime) return '未知';

    const now = Date.now();
    const diffMs = now - spawnTime;
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 60) {
        return `${diffMinutes}m`;
    }

    const diffHours = (diffMinutes / 60).toFixed(1);
    return `${diffHours}h`;
}
