const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(0, i);[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const pick = arr => arr[randInt(0, arr.length - 1)];

const wouldCreateBlock = (grid, x, y) => {
    const checks = [[[0, 0], [1, 0], [0, 1], [1, 1]], [[-1, 0], [0, 0], [-1, 1], [0, 1]], [[0, -1], [1, -1], [0, 0], [1, 0]], [[-1, -1], [0, -1], [-1, 0], [0, 0]]];
    return checks.some(offsets => offsets.every(([dx, dy]) => (dx === 0 && dy === 0) || grid.has(`${x + dx},${y + dy}`)));
};

const analyzeDistribution = tiles => {
    const counts = new Map();
    tiles.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    return {
        counts,
        maxCount: Math.max(...counts.values()),
        uniqueValues: counts.size
    };
};

const meetsQuality = (tiles, targetTiles) => {
    const { maxCount, uniqueValues } = analyzeDistribution(tiles);
    const maxAllowed = Math.max(3, Math.ceil(targetTiles * 0.3));
    const minUnique = Math.max(3, Math.ceil(targetTiles / 4));
    return maxCount <= maxAllowed && uniqueValues >= minUnique;
};

const generateRun = (min, max, len, valueCounts, maxPerValue) => {
    const possibleStarts = [];
    for (let start = min; start <= max - len + 1; start++) {
        const values = Array.from({ length: len }, (_, i) => start + i);
        if (values.every(v => (valueCounts.get(v) || 0) < maxPerValue)) {
            possibleStarts.push(start);
        }
    }
    if (!possibleStarts.length) return null;
    const start = pick(possibleStarts);
    return Array.from({ length: len }, (_, i) => start + i);
};

const generateSet = (min, max, len, valueCounts, maxPerValue) => {
    const available = [];
    for (let v = min; v <= max; v++) {
        if ((valueCounts.get(v) || 0) + len <= maxPerValue) available.push(v);
    }
    return available.length ? Array(len).fill(pick(available)) : null;
};

const tryPlaceGroup = (grid, values, startX, startY, horizontal, gridSize) => {
    const positions = values.map((v, i) => {
        const x = horizontal ? startX + i : startX;
        const y = horizontal ? startY : startY + i;
        return { pos: `${x},${y}`, x, y, value: v };
    });

    const valid = positions.every(({ pos, x, y }) =>
        x >= 0 && x < gridSize && y >= 0 && y < gridSize && !grid.has(pos) && !wouldCreateBlock(grid, x, y));

    if (valid) positions.forEach(({ pos, value }) => grid.set(pos, value));
    return valid;
};

const findIntersections = grid => {
    const ints = [];
    for (const [pos, value] of grid) {
        const [x, y] = pos.split(',').map(Number);
        if (!grid.has(`${x - 1},${y}`) && !grid.has(`${x + 1},${y}`)) ints.push({ x, y, value, dir: 'h' });
        if (!grid.has(`${x},${y - 1}`) && !grid.has(`${x},${y + 1}`)) ints.push({ x, y, value, dir: 'v' });
    }
    return shuffle(ints);
};

const generatePuzzleAttempt = ({ minValue, maxValue, gridSize, targetTiles, maxPerValue }) => {
    const grid = new Map();
    const valueCounts = new Map();
    const center = Math.floor(gridSize / 2) - 1;

    const addToCount = values => values.forEach(v => valueCounts.set(v, (valueCounts.get(v) || 0) + 1));

    const seed = Math.random() > 0.5
        ? generateRun(minValue, maxValue, 3, valueCounts, maxPerValue)
        : generateSet(minValue, maxValue, 3, valueCounts, maxPerValue);
    if (!seed) return null;

    if (!tryPlaceGroup(grid, seed, center, center, Math.random() > 0.5, gridSize)) return null;
    addToCount(seed);

    let attempts = 0;
    while (grid.size < targetTiles && attempts++ < 150) {
        const ints = findIntersections(grid);
        if (!ints.length) break;

        for (const int of ints) {
            if (grid.size >= targetTiles) break;

            const len = randInt(3, 4);
            const isH = int.dir === 'h';
            const useRun = Math.random() > 0.5;

            let newGroup = null;
            if (useRun) {
                const possibleStarts = [];
                for (let off = 0; off < len; off++) {
                    const start = int.value - off;
                    if (start >= minValue && start + len - 1 <= maxValue) {
                        const vals = Array.from({ length: len }, (_, i) => start + i);
                        if (vals.every(v => v === int.value || (valueCounts.get(v) || 0) < maxPerValue)) {
                            possibleStarts.push({ start, vals });
                        }
                    }
                }
                if (possibleStarts.length) {
                    const chosen = pick(possibleStarts);
                    newGroup = chosen.vals;
                }
            } else {
                if ((valueCounts.get(int.value) || 0) + len - 1 <= maxPerValue) {
                    newGroup = Array(len).fill(int.value);
                }
            }

            if (!newGroup) continue;

            const idx = newGroup.indexOf(int.value);
            if (idx === -1) continue;

            const startX = isH ? int.x - idx : int.x;
            const startY = isH ? int.y : int.y - idx;
            const testGrid = new Map(grid);
            const newPos = [];
            let valid = true;

            for (let i = 0; i < newGroup.length && valid; i++) {
                const x = isH ? startX + i : startX;
                const y = isH ? startY : startY + i;
                const pos = `${x},${y}`;

                if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) { valid = false; continue; }
                if (pos === `${int.x},${int.y}`) continue;
                if (testGrid.has(pos)) { valid = false; continue; }

                testGrid.set(pos, newGroup[i]);
                if (wouldCreateBlock(testGrid, x, y)) { valid = false; continue; }
                newPos.push({ pos, value: newGroup[i] });
            }

            if (valid && newPos.length >= 2) {
                newPos.forEach(({ pos, value }) => grid.set(pos, value));
                addToCount(newPos.map(p => p.value));
                break;
            }
        }
    }

    return { grid, tiles: Array.from(grid.values()) };
};

export const generatePuzzle = ({ minValue = 1, maxValue = 13, gridSize = 6, targetTiles = 14 } = {}) => {
    const maxPerValue = Math.max(3, Math.ceil(targetTiles * 0.3));

    for (let attempt = 0; attempt < 50; attempt++) {
        const result = generatePuzzleAttempt({ minValue, maxValue, gridSize, targetTiles, maxPerValue });
        if (result && result.tiles.length >= targetTiles * 0.8 && meetsQuality(result.tiles, targetTiles)) {
            return result;
        }
    }

    const fallback = generatePuzzleAttempt({ minValue, maxValue, gridSize, targetTiles, maxPerValue });
    return fallback || { grid: new Map(), tiles: [] };
};

export const generateLevel = (opts = {}) => {
    const { grid, tiles } = generatePuzzle(opts);
    return { hand: shuffle([...tiles]), solution: grid };
};
