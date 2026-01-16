import { getClosestCell, clearCellHighlights } from './drag.js';

export const initInteractions = ({ gridEl, rackEl, onTilePlaced, onTileReturned, isCellOccupied, createCellRipple }) => {
    let draggedTile = null, dragPreview = null, offsetX = 0, offsetY = 0, originalPos = null, lastX = 0, currentRotation = 0;

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

    const updateCellHighlight = (clientX, clientY) => {
        clearCellHighlights(gridEl);
        const cell = getClosestCell(gridEl, clientX, clientY);
        if (cell) {
            const [x, y] = [+cell.dataset.x, +cell.dataset.y];
            const occupied = !isSamePos(x, y) && isCellOccupied(x, y);
            cell.classList.add(occupied ? 'grid-cell--invalid-target' : 'grid-cell--valid-target');
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

        dragPreview?.remove();
        dragPreview = null;

        const overRack = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rack-container');
        const cell = overRack ? null : getClosestCell(gridEl, e.clientX, e.clientY);

        if (cell) {
            const [x, y] = [+cell.dataset.x, +cell.dataset.y];
            if (!isSamePos(x, y) && !isCellOccupied(x, y)) {
                if (originalPos) onTileReturned(draggedTile.id, originalPos.x, originalPos.y, false);
                onTilePlaced(draggedTile.id, x, y);
                createCellRipple(cell);
            }
        } else if (originalPos) {
            onTileReturned(draggedTile.id, originalPos.x, originalPos.y, true);
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
