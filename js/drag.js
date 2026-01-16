export const pointerToGridDelta = (current, start, cellSize) => ({
    dx: Math.round((current.x - start.x) / cellSize.w),
    dy: Math.round((current.y - start.y) / cellSize.h)
});

export const computeTargetPositions = (origPositions, delta, gridSize, occupiedMap, movingIds) => {
    const updates = [];
    const targetSet = new Set();

    for (const [id, { x, y }] of origPositions) {
        const newX = x + delta.dx, newY = y + delta.dy;
        const key = `${newX},${newY}`;

        if (newX < 0 || newX >= gridSize || newY < 0 || newY >= gridSize) return { valid: false };
        if (targetSet.has(key)) return { valid: false };

        const occupant = occupiedMap.get(key);
        if (occupant && !movingIds.has(occupant)) return { valid: false };

        targetSet.add(key);
        updates.push({ id, oldX: x, oldY: y, newX, newY });
    }
    return { valid: true, updates };
};

export const getClosestCell = (gridEl, clientX, clientY) => {
    const gridRect = gridEl.getBoundingClientRect();
    if (clientX < gridRect.left || clientX > gridRect.right || clientY < gridRect.top || clientY > gridRect.bottom) return null;

    let closest = null, minDist = Infinity;
    for (const cell of gridEl.querySelectorAll('.grid-cell')) {
        const r = cell.getBoundingClientRect();
        const dist = (clientX - r.left - r.width / 2) ** 2 + (clientY - r.top - r.height / 2) ** 2;
        if (dist < minDist) { minDist = dist; closest = cell; }
    }
    return closest;
};
export const clearCellHighlights = gridEl => {
    gridEl.querySelectorAll('.grid-cell--valid-target')
        .forEach(c => c.classList.remove('grid-cell--valid-target'));
};
export const getCellSize = gridEl => {
    const cell = gridEl.querySelector('.grid-cell');
    return cell ? { w: cell.offsetWidth, h: cell.offsetHeight } : { w: 50, h: 50 };
};

export const snapTileToCell = (el, gridEl, x, y) => {
    const cell = gridEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (cell) {
        el.style.left = `${cell.offsetLeft}px`;
        el.style.top = `${cell.offsetTop}px`;
    }
};

export const moveTilesPixel = (tiles, origPixelPositions, dx, dy) => {
    tiles.forEach(id => {
        const el = document.getElementById(id);
        const orig = origPixelPositions.get(id);
        if (el && orig) {
            el.style.left = `${orig.left + dx}px`;
            el.style.top = `${orig.top + dy}px`;
        }
    });
};
