const isSet = values => values.length >= 3 && values.every(v => v === values[0]);
const isRun = values => {
    if (values.length < 3) return false;
    const asc = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
    const desc = values.every((v, i) => i === 0 || v === values[i - 1] - 1);
    return asc || desc;
};
const isValidGroup = values => isSet(values) || isRun(values);

const isImpossibleGroup = values => {
    if (values.length < 2) return false;
    const allSame = values.every(v => v === values[0]);
    if (allSame) return false;
    const asc = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
    const desc = values.every((v, i) => i === 0 || v === values[i - 1] - 1);
    if (asc || desc) return false;
    const sorted = [...values].sort((a, b) => a - b);
    const hasGap = sorted.some((v, i) => i > 0 && v > sorted[i - 1] + 1);
    if (hasGap) return true;
    return new Set(values).size !== values.length;

};

const collectLine = (grid, x, y, dx, dy) => {
    while (grid.has(`${x - dx},${y - dy}`)) { x -= dx; y -= dy; }
    const positions = [], values = [];
    while (grid.has(`${x},${y}`)) {
        positions.push(`${x},${y}`);
        values.push(grid.get(`${x},${y}`));
        x += dx; y += dy;
    }
    return { positions, values };
};

const getRowAt = (grid, x, y) => collectLine(grid, x, y, 1, 0);
const getColAt = (grid, x, y) => collectLine(grid, x, y, 0, 1);

const getAllGroups = grid => {
    const seen = { h: new Set(), v: new Set() };
    const groups = [];
    for (const pos of grid.keys()) {
        const [x, y] = pos.split(',').map(Number);
        if (!seen.h.has(pos)) {
            const row = getRowAt(grid, x, y);
            row.positions.forEach(p => seen.h.add(p));
            if (row.positions.length >= 2) groups.push(row);
        }
        if (!seen.v.has(pos)) {
            const col = getColAt(grid, x, y);
            col.positions.forEach(p => seen.v.add(p));
            if (col.positions.length >= 2) groups.push(col);
        }
    }
    return groups;
};

const getBlockPositions = grid => {
    const blocks = new Set();
    for (const pos of grid.keys()) {
        const [x, y] = pos.split(',').map(Number);
        if (grid.has(`${x + 1},${y}`) && grid.has(`${x},${y + 1}`) && grid.has(`${x + 1},${y + 1}`)) {
            [pos, `${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`].forEach(p => blocks.add(p));
        }
    }
    return blocks;
};

const isConnected = grid => {
    if (grid.size === 0) return true;
    const all = new Set(grid.keys());
    const visited = new Set();
    const queue = [all.values().next().value];
    while (queue.length) {
        const pos = queue.shift();
        if (visited.has(pos) || !all.has(pos)) continue;
        visited.add(pos);
        const [x, y] = pos.split(',').map(Number);
        queue.push(`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`);
    }
    return visited.size === all.size;
};

export const validateBoard = grid => {
    const groups = getAllGroups(grid);
    const blockPositions = getBlockPositions(grid);

    const allGroupsValid = groups.every(g => isValidGroup(g.values));
    const noBlocks = blockPositions.size === 0;
    const connected = isConnected(grid);

    const tilesInGroups = new Set();
    groups.filter(g => isValidGroup(g.values)).forEach(g => g.positions.forEach(p => tilesInGroups.add(p)));
    const allTilesGrouped = [...grid.keys()].every(pos => tilesInGroups.has(pos));

    const valid = allGroupsValid && noBlocks && connected && allTilesGrouped;

    const impossiblePositions = new Set();
    groups.filter(g => isImpossibleGroup(g.values)).forEach(g => g.positions.forEach(p => impossiblePositions.add(p)));

    const validPositions = new Set();
    for (const pos of grid.keys()) {
        if (blockPositions.has(pos) || impossiblePositions.has(pos)) continue;
        const [x, y] = pos.split(',').map(Number);
        const row = getRowAt(grid, x, y);
        const col = getColAt(grid, x, y);
        const inRow = row.positions.length >= 2;
        const inCol = col.positions.length >= 2;
        const rowOk = !inRow || isValidGroup(row.values);
        const colOk = !inCol || isValidGroup(col.values);
        if ((inRow || inCol) && rowOk && colOk) validPositions.add(pos);
    }

    return { valid, validPositions, blockPositions, impossiblePositions };
};