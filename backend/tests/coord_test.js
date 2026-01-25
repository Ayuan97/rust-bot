const { getGridPos, formatPosition } = require('../src/utils/coordinates.js');

function findExamples(mapSize, target) {
    const examples = [];
    for (let x = 0; x <= mapSize; x += 10) {
        for (let y = 0; y <= mapSize; y += 10) {
            const grid = getGridPos(x, y, mapSize, false);
            if (grid === target) {
                examples.push({ x, y });
                if (examples.length >= 3) break;
            }
        }
        if (examples.length >= 3) break;
    }
    return examples;
}

[2000, 2500, 3000].forEach(size => {
    console.log('MapSize', size);
    const ex = findExamples(size, 'E4-9');
    console.log('E4-9 examples', ex);
    // also test a coordinate that previously gave G2-3 (approx middle of map)
    const mid = Math.floor(size / 2);
    console.log('Center coordinate', mid, mid, '=>', getGridPos(mid, mid, size, false));
});
