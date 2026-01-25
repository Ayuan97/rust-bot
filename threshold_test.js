const GRID_DIAMETER = 146.25; // 146.28571428571428
const mapSizes = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000];

function calculateGrids(mapSize, threshold) {
    const remainder = mapSize % GRID_DIAMETER;
    const offset = GRID_DIAMETER - remainder;
    const correctedSize = (remainder < threshold) ? mapSize - remainder : mapSize + offset;
    return Math.round(correctedSize / GRID_DIAMETER);
}

console.log("MapSize | Remainder | T=120 (Grids) | T=73.125 (Grids) | Diff?");
console.log("---|---|---|---|---");
for (const size of mapSizes) {
    const r = size % GRID_DIAMETER;
    const g120 = calculateGrids(size, 120);
    const g73 = calculateGrids(size, 73.125);
    const diff = g120 !== g73 ? "<<" : "";
    console.log(`${size} | ${r.toFixed(2)} | ${g120} | ${g73} | ${diff}`);
}
