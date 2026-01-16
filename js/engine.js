export const isSet = values => values.length >= 3 && values.every(v => v === values[0]);

export const isRun = values => {
    if (values.length < 3) return false;
    const ascending = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
    const descending = values.every((v, i) => i === 0 || v === values[i - 1] - 1);
    return ascending || descending;
};

export const isValidGroup = values => isSet(values) || isRun(values);

export const isImpossibleGroup = values => {
    if (values.length < 2) return false;

    const allSame = values.every(v => v === values[0]);
    if (allSame) return false;

    const ascending = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
    const descending = values.every((v, i) => i === 0 || v === values[i - 1] - 1);
    if (ascending || descending) return false;

    const sorted = [...values].sort((a, b) => a - b);
    const couldBeRun = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (couldBeRun) return true;

    const hasGap = sorted.some((v, i) => i > 0 && v > sorted[i - 1] + 1);
    if (hasGap) return true;

    const hasDupes = new Set(values).size !== values.length;
    if (hasDupes && !allSame) return true;

    return false;
};

const collectLine = (grid, startX, startY, dx, dy) => {
    const positions = [], values = [];
    let x = startX, y = startY;
    while (grid.has(`${x},${y}`)) {
        const pos = `${x},${y}`;
        positions.push(pos);
        values.push(grid.get(pos));
        x += dx; y += dy;
    }
    return { positions, values };
};

const findLineStart = (grid, x, y, dx, dy) => {
    while (grid.has(`${x - dx},${y - dy}`)) { x -= dx; y -= dy; }
    return { x, y };
};

const getLineGroups = (grid, dx, dy) => {
    const visited = new Set(), groups = [];
    for (const pos of grid.keys()) {
        if (visited.has(pos)) continue;
        const [x, y] = pos.split(',').map(Number);
        const start = findLineStart(grid, x, y, dx, dy);
        const group = collectLine(grid, start.x, start.y, dx, dy);
        group.positions.forEach(p => visited.add(p));
        if (group.positions.length >= 2) groups.push(group);
    }
    return groups;
};

export const getHorizontalGroups = grid => getLineGroups(grid, 1, 0);
export const getVerticalGroups = grid => getLineGroups(grid, 0, 1);

// Rule 1 & 2: All adjacencies must form valid 3+ groups
export const checkScrabbleRule = grid => {
    const invalid = new Set();
    const check = group => (group.values.length === 2 || !isValidGroup(group.values)) &&
        group.positions.forEach(p => invalid.add(p));
    [...getHorizontalGroups(grid), ...getVerticalGroups(grid)].forEach(check);
    return { valid: invalid.size === 0, invalidPositions: invalid };
};

// Rule 3: No 2x2 blocks (detects all n×m where n,m >= 2 via sliding window)
export const checkNoBlockRule = grid => {
    const blocks = new Set();
    for (const pos of grid.keys()) {
        const [x, y] = pos.split(',').map(Number);
        if ([`${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`].every(p => grid.has(p))) {
            [pos, `${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`].forEach(p => blocks.add(p));
        }
    }
    return { valid: blocks.size === 0, blockPositions: blocks };
};

// Rule 4: All tiles must be connected (BFS flood fill)
export const checkTopologyRule = grid => {
    if (grid.size === 0) return { valid: true };
    const positions = new Set(grid.keys());
    const visited = new Set();
    const queue = [positions.values().next().value];

    while (queue.length) {
        const pos = queue.shift();
        if (visited.has(pos) || !positions.has(pos)) continue;
        visited.add(pos);
        const [x, y] = pos.split(',').map(Number);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => queue.push(`${x + dx},${y + dy}`));
    }
    return { valid: visited.size === positions.size };
};

export const getValidGroupPositions = grid => {
    const valid = new Set();
    [...getHorizontalGroups(grid), ...getVerticalGroups(grid)]
        .filter(g => g.values.length >= 3 && isValidGroup(g.values))
        .forEach(g => g.positions.forEach(p => valid.add(p)));
    return valid;
};

export const getImpossibleGroupPositions = grid => {
    const impossible = new Set();
    [...getHorizontalGroups(grid), ...getVerticalGroups(grid)]
        .filter(g => isImpossibleGroup(g.values))
        .forEach(g => g.positions.forEach(p => impossible.add(p)));
    return impossible;
};

export const validateBoard = grid => {
    const scrabbleRule = checkScrabbleRule(grid);
    const noBlockRule = checkNoBlockRule(grid);
    const topologyRule = checkTopologyRule(grid);
    const impossiblePositions = getImpossibleGroupPositions(grid);
    return {
        valid: scrabbleRule.valid && noBlockRule.valid && topologyRule.valid,
        scrabbleRule, noBlockRule, topologyRule,
        validGroupPositions: getValidGroupPositions(grid),
        impossiblePositions
    };
};