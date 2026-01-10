
/**
 * Rust 游戏坐标转换工具 (Frontend)
 */

export const GRID_DIAMETER = 146.28571428571428;

/**
 * 修正地图大小（对齐到网格）
 */
export function getCorrectedMapSize(mapSize) {
    const remainder = mapSize % GRID_DIAMETER;
    const offset = GRID_DIAMETER - remainder;
    return (remainder < 120) ? mapSize - remainder : mapSize + offset;
}

/**
 * 将 X, Y 坐标转换为网格编号 (如 G12)
 */
export function getGrid(x, y, rawMapSize) {
    const correctedSize = getCorrectedMapSize(rawMapSize);

    const gx = Math.floor(x / GRID_DIAMETER);
    const gy = Math.floor(y / GRID_DIAMETER);

    // Y轴反转计算 (Rust 地图 Y 0 在底部)
    const numGrids = Math.floor(correctedSize / GRID_DIAMETER);
    const gridNum = numGrids - gy - 1;

    const col = String.fromCharCode(65 + (gx % 26));
    const prefix = gx >= 26 ? String.fromCharCode(64 + Math.floor(gx / 26)) : '';

    return `${prefix}${col}${gridNum >= 0 ? gridNum : 0}`;
}
