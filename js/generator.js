const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(0, i);[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const pick = arr => arr[randInt(0, arr.length - 1)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

const wouldCreateBlock = (grid, x, y) => {
    const checks = [[[0, 0], [1, 0], [0, 1], [1, 1]], [[-1, 0], [0, 0], [-1, 1], [0, 1]], [[0, -1], [1, -1], [0, 0], [1, 0]], [[-1, -1], [0, -1], [-1, 0], [0, 0]]];
    return checks.some(offsets => offsets.every(([dx, dy]) => (dx === 0 && dy === 0) || grid.has(`${x + dx},${y + dy}`)));
};

const calcDifficultyParams = (difficulty, gridSize) => {
    const t = clamp((difficulty - 1) / 9, 0, 1); // 1-10 → 0-1

    const valueSpread = Math.round(lerp(6, 13, t));
    const minValue = 1;
    const maxValue = minValue + valueSpread - 1;

    const baseArea = gridSize * gridSize;
    // Zen: ~35% fill (wiggle room), Expert: ~75% fill (packed)
    const fillFactor = lerp(0.35, 0.75, t);
    const targetTiles = Math.round(baseArea * fillFactor);

    const runBias = lerp(0.3, 0.7, t);
    const avgGroupLen = lerp(3.5, 3.2, t);

    // Expert needs to reuse numbers more to pack tight
    const maxPerValue = Math.max(3, Math.ceil(targetTiles * lerp(0.40, 0.30, t)));

    const branchChance = lerp(0.5, 0.90, t);

    // Heuristic: 0 = Sprawl (Random/Edge), 1 = Rug (Compact/Center)
    const compactness = lerp(0, 1, t);

    return { minValue, maxValue, gridSize, targetTiles, runBias, avgGroupLen, maxPerValue, branchChance, compactness };
};

const generateGroup = (params, valueCounts, anchorValue = null, isRun = null) => {
    const { minValue, maxValue, avgGroupLen, maxPerValue, runBias } = params;
    const len = Math.random() < 0.5 ? 3 : (Math.random() < avgGroupLen - 3 ? 4 : 3);
    const useRun = isRun !== null ? isRun : Math.random() < runBias;

    if (useRun) {
        const possibleStarts = [];
        for (let start = minValue; start <= maxValue - len + 1; start++) {
            const vals = Array.from({ length: len }, (_, i) => start + i);
            const canUse = vals.every(v => (valueCounts.get(v) || 0) < maxPerValue);
            const matchesAnchor = anchorValue === null || vals.includes(anchorValue);
            if (canUse && matchesAnchor) possibleStarts.push({ start, idx: anchorValue !== null ? vals.indexOf(anchorValue) : 0 });
        }
        if (possibleStarts.length) {
            const choice = pick(possibleStarts);
            return { values: Array.from({ length: len }, (_, i) => choice.start + i), anchorIdx: choice.idx, isRun: true };
        }
    }

    // Set
    const available = [];
    for (let v = minValue; v <= maxValue; v++) {
        if ((valueCounts.get(v) || 0) + len <= maxPerValue) {
            if (anchorValue === null || v === anchorValue) available.push(v);
        }
    }
    if (available.length) {
        const val = pick(available);
        return { values: Array(len).fill(val), anchorIdx: 0, isRun: false };
    }
    return null;
};

const tryPlaceGroup = (grid, values, startX, startY, horizontal, gridSize) => {
    const positions = values.map((v, i) => ({
        x: horizontal ? startX + i : startX,
        y: horizontal ? startY : startY + i,
        value: v
    }));

    const valid = positions.every(({ x, y }) => {
        const pos = `${x},${y}`;
        return x >= 0 && x < gridSize && y >= 0 && y < gridSize && !grid.has(pos) && !wouldCreateBlock(grid, x, y);
    });

    if (valid) positions.forEach(({ x, y, value }) => grid.set(`${x},${y}`, value));
    return valid ? positions : null;
};

// Returns candidate branch points sorted by heuristic score
const findBranchPoints = (grid, gridSize, compactness) => {
    const points = [];
    const center = (gridSize - 1) / 2;

    for (const [pos, value] of grid) {
        const [x, y] = pos.split(',').map(Number);

        // Check potential expansion directions
        const hasH = grid.has(`${x - 1},${y}`) || grid.has(`${x + 1},${y}`);
        const hasV = grid.has(`${x},${y - 1}`) || grid.has(`${x},${y + 1}`);

        if (hasH && !hasV) points.push({ x, y, value, dir: 'v' });
        else if (hasV && !hasH) points.push({ x, y, value, dir: 'h' });
    }

    // Heuristic Scoring
    points.forEach(p => {
        // Distance from center (0 = center, higher = edge)
        const dist = Math.abs(p.x - center) + Math.abs(p.y - center);

        // Compactness Score: 
        // - High Compactness (Rug): Prefer Center (Low Dist) -> Negative dist to maximize
        // - Low Compactness (Sprawl): Prefer Edge (High Dist) -> Positive dist to maximize

        const score = compactness > 0.5
            ? -dist
            : dist;

        p.score = score + Math.random() * 2; // Add noise
    });

    // Sort Descending by score
    points.sort((a, b) => b.score - a.score);
    return points;
};

const generatePuzzleAttempt = params => {
    const { minValue, maxValue, gridSize, targetTiles, maxPerValue, branchChance, compactness } = params;
    const grid = new Map();
    const valueCounts = new Map();
    const center = Math.floor(gridSize / 2) - 1;

    const addToCount = values => values.forEach(v => valueCounts.set(v, (valueCounts.get(v) || 0) + 1));

    // Seed group
    const seed = generateGroup(params, valueCounts);
    if (!seed) return null;

    const horizontal = Math.random() > 0.5;
    const placed = tryPlaceGroup(grid, seed.values, center, center, horizontal, gridSize);
    if (!placed) return null;
    addToCount(seed.values);

    let stalls = 0;
    while (grid.size < targetTiles && stalls < 80) {
        // Use Heuristic Branching
        const branches = findBranchPoints(grid, gridSize, compactness);
        if (!branches.length) { stalls++; continue; }

        let added = false;

        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];

            // On low compactness, skip some good spots to create gaps
            if (compactness < 0.3 && Math.random() < 0.3) continue;

            if (grid.size >= targetTiles) break;
            if (Math.random() > branchChance) continue;

            const isH = branch.dir === 'h';
            const group = generateGroup(params, valueCounts, branch.value, null);
            if (!group) continue;

            const anchorIdx = group.values.indexOf(branch.value);
            if (anchorIdx === -1) continue;

            const startX = isH ? branch.x - anchorIdx : branch.x;
            const startY = isH ? branch.y : branch.y - anchorIdx;

            // Check overlap with existing
            const testGrid = new Map(grid);
            const newPositions = [];
            let valid = true;

            for (let k = 0; k < group.values.length && valid; k++) {
                const x = isH ? startX + k : startX;
                const y = isH ? startY : startY + k;
                const pos = `${x},${y}`;

                if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) { valid = false; continue; }
                if (pos === `${branch.x},${branch.y}`) continue;
                if (testGrid.has(pos)) { valid = false; continue; }

                testGrid.set(pos, group.values[k]);
                if (wouldCreateBlock(testGrid, x, y)) { valid = false; continue; }
                newPositions.push({ x, y, value: group.values[k] });
            }

            if (valid && newPositions.length >= 2) {
                newPositions.forEach(({ x, y, value }) => grid.set(`${x},${y}`, value));
                addToCount(newPositions.map(p => p.value));
                added = true;
                break; // Move to next generation cycle (re-evaluate branches)
            }
        }
        if (!added) stalls++;
    }

    return { grid, tiles: Array.from(grid.values()) };
};

const meetsQuality = (tiles, targetTiles, params) => {
    const counts = new Map();
    tiles.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const maxCount = Math.max(...counts.values());
    const uniqueValues = counts.size;

    const maxAllowed = params.maxPerValue + 1;
    const minUnique = Math.max(3, Math.ceil(targetTiles / 6));

    // Quality check: Ensure we're within striking distance of target
    // For Expert (high fill), be strict. For Zen, be loose.
    const threshold = params.compactness > 0.5 ? 0.85 : 0.70;

    return tiles.length >= targetTiles * threshold && maxCount <= maxAllowed && uniqueValues >= minUnique;
};

export const generatePuzzle = (opts = {}) => {
    const difficulty = opts.difficulty || 5;
    const gridSize = opts.gridSize || 6;
    const params = calcDifficultyParams(difficulty, gridSize);

    let bestResult = null;
    let maxTiles = -1;

    for (let attempt = 0; attempt < 100; attempt++) {
        const result = generatePuzzleAttempt(params);
        if (result) {
            const tileCount = result.tiles.length;

            // Keep track of the best result found so far
            if (tileCount > maxTiles) {
                maxTiles = tileCount;
                bestResult = result;
            }

            // If we meet the target quality, return immediately
            if (meetsQuality(result.tiles, params.targetTiles, params)) {
                return result;
            }
        }
    }

    // Return the best result found instead of a simplified fallback
    if (bestResult && bestResult.tiles.length >= 8) {
        return bestResult;
    }

    // Last resort fallback only if everything failed miserably
    const relaxed = { ...params, targetTiles: Math.floor(params.targetTiles * 0.7) };
    const fallback = generatePuzzleAttempt(relaxed);
    return fallback || { grid: new Map(), tiles: [] };
};

export const generateLevel = (opts = {}) => {
    const { grid, tiles } = generatePuzzle(opts);
    return { hand: shuffle([...tiles]), solution: grid };
};
