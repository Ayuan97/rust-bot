import { getGridPos } from '../src/utils/coordinates.js';

function findExamples(mapSize) {
    const examples = [];
    for (let x = 0; x <= mapSize; x += 10) {
        for (let y = 0; y <= mapSize; y += 10) {
            const grid = getGridPos(x, y, mapSize, false);
            if (grid === 'E4-9') {
                examples.push({ x, y });
                if (examples.length >= 5) break;
            }
        }
        if (examples.length >= 5) break;
    }
    return examples;
}

[2000, 2500, 3000].forEach(size => {
    console.log('MapSize', size);
    const ex = findExamples(size);
    console.log('E4-9 examples', ex);
});
