// Pure helper: pointer delta to grid delta
export const pointerToGridDelta = (current, start, cellSize) => ({
    dx: Math.round((current.x - start.x) / cellSize.w),
    dy: Math.round((current.y - start.y) / cellSize.h)
});

// Pure helper: compute new positions for tiles given grid delta
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

// Find closest cell for a given client point
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

// Find target cells for each tile in a group given pixel offsets
export const findTargetCellsForGroup = (tiles, gridEl, dx, dy, origPixelPositions) => {
    const results = [];
    tiles.forEach(id => {
        const orig = origPixelPositions.get(id);
        if (!orig) return;
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const cell = getClosestCell(gridEl, cx, cy);
        if (cell) results.push({ id, cell });
    });
    return results;
};

// Clear all cell highlights
export const clearCellHighlights = gridEl => {
    gridEl.querySelectorAll('.grid-cell--valid-target, .grid-cell--invalid-target')
        .forEach(c => c.classList.remove('grid-cell--valid-target', 'grid-cell--invalid-target'));
};

// Apply highlights to target cells (each gets valid/invalid based on occupancy check)
export const highlightTargetCells = (targetCells, isValidFn) => {
    targetCells.forEach(({ id, cell }) => {
        const x = +cell.dataset.x, y = +cell.dataset.y;
        cell.classList.add(isValidFn(x, y, id) ? 'grid-cell--valid-target' : 'grid-cell--invalid-target');
    });
};

// Get cell size from grid
export const getCellSize = gridEl => {
    const cell = gridEl.querySelector('.grid-cell');
    return cell ? { w: cell.offsetWidth, h: cell.offsetHeight } : { w: 50, h: 50 };
};

// Snap a tile element to its grid cell
export const snapTileToCell = (el, gridEl, x, y) => {
    const cell = gridEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (cell) {
        el.style.left = `${cell.offsetLeft}px`;
        el.style.top = `${cell.offsetTop}px`;
    }
};

// Move tiles visually during drag
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
