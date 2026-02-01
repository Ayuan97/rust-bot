const GRID_DIAMETER = 150; // Rust 官方网格大小 150m
const mapSizes = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000];

function calculateGrids(mapSize, threshold) {
    const remainder = mapSize % GRID_DIAMETER;
    const offset = GRID_DIAMETER - remainder;
    const correctedSize = (remainder < threshold) ? mapSize - remainder : mapSize + offset;
    return Math.round(correctedSize / GRID_DIAMETER);
}

console.log("MapSize | Remainder | T=75 (Grids)");
console.log("---|---|---");
for (const size of mapSizes) {
    const r = size % GRID_DIAMETER;
    const g75 = calculateGrids(size, 75);
    console.log(`${size} | ${r.toFixed(2)} | ${g75}`);
}
