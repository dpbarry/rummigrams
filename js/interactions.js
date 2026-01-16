import { getClosestCell, clearCellHighlights } from './drag.js';

export const initInteractions = ({ gridEl, rackEl, onTilePlaced, onTileReturned, getTileAt, swapTiles, createCellParticleBurst }) => {
    let draggedTile = null, dragPreview = null, offsetX = 0, offsetY = 0, originalPos = null, lastX = 0, currentRotation = 0;
    let currentSwapTarget = null;

    const createPreview = tile => {
        const p = tile.cloneNode(true);
        Object.assign(p, { className: 'tile tile-drag-preview', id: '' });
        const rect = tile.getBoundingClientRect();
        Object.assign(p.style, { width: `${rect.width}px`, height: `${rect.height}px` });
        document.body.appendChild(p);
        return p;
    };

    const updatePreview = (cx, cy, rotation = 0) => dragPreview && Object.assign(dragPreview.style, {
        left: `${cx - offsetX}px`, top: `${cy - offsetY}px`, transform: `rotate(${rotation}deg)`
    });

    const isSamePos = (x, y) => originalPos?.x === x && originalPos?.y === y;

    const clearSwapTarget = () => {
        if (currentSwapTarget) {
            const el = document.getElementById(currentSwapTarget);
            if (el) el.classList.remove('tile--swap-target');
            currentSwapTarget = null;
        }
    };

    let currentHighlightedCell = null;

    const updateCellHighlight = (clientX, clientY) => {
        const cell = getClosestCell(gridEl, clientX, clientY);
        const cellKey = cell ? `${cell.dataset.x},${cell.dataset.y}` : null;
        const prevKey = currentHighlightedCell ? `${currentHighlightedCell.dataset.x},${currentHighlightedCell.dataset.y}` : null;

        if (cellKey === prevKey) return;

        clearCellHighlights(gridEl);
        clearSwapTarget();
        currentHighlightedCell = cell;

        if (cell) {
            const [x, y] = [+cell.dataset.x, +cell.dataset.y];
            const occupantId = !isSamePos(x, y) ? getTileAt(x, y) : null;
            if (occupantId) {
                const occupantEl = document.getElementById(occupantId);
                if (occupantEl) {
                    occupantEl.classList.add('tile--swap-target');
                    currentSwapTarget = occupantId;
                }
                dragPreview?.classList.remove('tile-drag-preview--invalid');
                dragPreview?.classList.add('tile-drag-preview--swapping');
            } else {
                dragPreview?.classList.remove('tile-drag-preview--invalid');
                dragPreview?.classList.remove('tile-drag-preview--swapping');
                cell.classList.add('grid-cell--valid-target');
            }
        } else {
            dragPreview?.classList.remove('tile-drag-preview--invalid');
            dragPreview?.classList.remove('tile-drag-preview--swapping');
        }
    };

    const handleDown = e => {
        const tile = e.target.closest('.tile');
        if (!tile || tile.classList.contains('tile--selected')) return;

        e.preventDefault();
        draggedTile = tile;
        originalPos = tile.dataset.gridX !== undefined
            ? { x: +tile.dataset.gridX, y: +tile.dataset.gridY }
            : null;

        const rect = tile.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        lastX = e.clientX;

        dragPreview = createPreview(tile);
        currentRotation = 0;
        updatePreview(e.clientX, e.clientY, 0);
        tile.classList.add('tile--ghost', 'tile--dragging');
        document.body.setPointerCapture(e.pointerId);

        document.addEventListener('pointermove', handleMove);
        document.addEventListener('pointerup', handleUp);
    };

    const handleMove = e => {
        if (!draggedTile) return;
        const deltaX = e.clientX - lastX;
        currentRotation = Math.max(-15, Math.min(15, currentRotation + deltaX * 0.05));
        updatePreview(e.clientX, e.clientY, currentRotation);
        lastX = e.clientX;
        updateCellHighlight(e.clientX, e.clientY);
    };

    const handleUp = e => {
        if (!draggedTile) return;

        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        clearCellHighlights(gridEl);
        clearSwapTarget();
        currentHighlightedCell = null;

        dragPreview?.remove();
        dragPreview = null;

        const triggerSnap = el => {
            if (!el) return;
            el.classList.add('tile--snapping');
            el.addEventListener('animationend', () => el.classList.remove('tile--snapping'), { once: true });
        };

        const overRack = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rack-container');
        const cell = overRack ? null : getClosestCell(gridEl, e.clientX, e.clientY);

        if (cell) {
            const [x, y] = [+cell.dataset.x, +cell.dataset.y];
            const occupantId = !isSamePos(x, y) ? getTileAt(x, y) : null;

            if (occupantId) {
                swapTiles(draggedTile.id, originalPos, occupantId, x, y);
                createCellParticleBurst(cell);
                triggerSnap(draggedTile);
                triggerSnap(document.getElementById(occupantId));
            } else if (!isSamePos(x, y)) {
                if (originalPos) onTileReturned(draggedTile.id, originalPos.x, originalPos.y, false);
                onTilePlaced(draggedTile.id, x, y);
                if (!originalPos) createCellParticleBurst(cell);
                triggerSnap(draggedTile);
            } else {
                triggerSnap(draggedTile);
            }
        } else if (originalPos) {
            onTileReturned(draggedTile.id, originalPos.x, originalPos.y, true);
            triggerSnap(draggedTile);
        }

        draggedTile.classList.remove('tile--ghost', 'tile--dragging');
        draggedTile = null;
        originalPos = null;
    };

    [rackEl, gridEl].forEach(el => {
        el.addEventListener('pointerdown', handleDown);
        el.addEventListener('dragstart', e => e.preventDefault());
    });

    return () => [rackEl, gridEl].forEach(el => el.removeEventListener('pointerdown', handleDown));
};
