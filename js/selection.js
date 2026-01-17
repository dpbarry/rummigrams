import {
    pointerToGridDelta, computeTargetPositions, getCellSize, clearCellHighlights,
    snapTileToCell, moveTilesPixel
} from './drag.js';

export const initSelection = ({ gridEl, state, onTilesReturn, onValidate }) => {
    let selectedIds = new Set();
    let selectionRect = null;
    let isSelecting = false;
    let selStart = { x: 0, y: 0 };
    let justFinishedSelecting = false;

    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let origGridPos = new Map();
    let origPixelPos = new Map();

    const $ = id => document.getElementById(id);
    const getCell = (x, y) => gridEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);

    const clearSelection = () => {
        selectedIds.forEach(id => $(id)?.classList.remove('tile--selected', 'tile--dragging', 'tile--invalid-drop'));
        selectedIds = new Set();
        origGridPos.clear();
        origPixelPos.clear();
        selectionRect?.remove();
        selectionRect = null;
        gridEl.removeEventListener('pointerdown', onDragStart);
    };

    const onGridDown = e => {
        if (e.target.closest('.tile')) return;
        e.preventDefault();
        isSelecting = true;
        selStart = { x: e.clientX, y: e.clientY };
        clearSelection();

        document.addEventListener('pointermove', onSelecting);
        document.addEventListener('pointerup', onSelectEnd);
    };

    const onSelecting = e => {
        if (!isSelecting) return;

        if (!selectionRect) {
            selectionRect = Object.assign(document.createElement('div'), { className: 'selection-rect' });
            gridEl.appendChild(selectionRect);
        }

        const gridRect = gridEl.getBoundingClientRect();
        const [x1, y1] = [selStart.x - gridRect.left, selStart.y - gridRect.top];
        const [x2, y2] = [e.clientX - gridRect.left, e.clientY - gridRect.top];

        Object.assign(selectionRect.style, {
            left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`,
            width: `${Math.abs(x2 - x1)}px`, height: `${Math.abs(y2 - y1)}px`
        });

        const [minX, maxX] = [Math.min(selStart.x, e.clientX), Math.max(selStart.x, e.clientX)];
        const [minY, maxY] = [Math.min(selStart.y, e.clientY), Math.max(selStart.y, e.clientY)];

        const nowSelected = new Set(
            [...gridEl.querySelectorAll('.tile--placed')]
                .filter(tile => {
                    const r = tile.getBoundingClientRect();
                    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
                    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
                })
                .map(tile => tile.id)
        );

        selectedIds.forEach(id => !nowSelected.has(id) && $(id)?.classList.remove('tile--selected'));
        nowSelected.forEach(id => $(id)?.classList.add('tile--selected'));
        selectedIds = nowSelected;
    };

    const onSelectEnd = () => {
        document.removeEventListener('pointermove', onSelecting);
        document.removeEventListener('pointerup', onSelectEnd);
        isSelecting = false;
        selectionRect?.remove();
        selectionRect = null;
        if (selectedIds.size) gridEl.addEventListener('pointerdown', onDragStart);
        justFinishedSelecting = true;
        setTimeout(() => justFinishedSelecting = false, 100);
    };

    const onDragStart = e => {
        const tile = e.target.closest('.tile--selected');
        if (!tile) { clearSelection(); return; }

        if (selectedIds.size === 1) {
            tile.classList.remove('tile--selected');
            selectedIds.clear();
            gridEl.removeEventListener('pointerdown', onDragStart);
            const newEvent = new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType
            });
            tile.dispatchEvent(newEvent);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };

        origGridPos.clear();
        origPixelPos.clear();

        selectedIds.forEach(id => {
            const el = $(id);
            if (!el) return;
            const pos = [...state.grid].find(([, tid]) => tid === id)?.[0];
            if (!pos) return;
            const [x, y] = pos.split(',').map(Number);
            origGridPos.set(id, { x, y });
            origPixelPos.set(id, { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 });
            el.classList.add('tile--dragging');
        });

        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
    };

    const setInvalidDropState = isInvalid => {
        selectedIds.forEach(id => {
            const el = $(id);
            if (el) el.classList.toggle('tile--invalid-drop', isInvalid);
        });
    };

    const onDragMove = e => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        moveTilesPixel(selectedIds, origPixelPos, dx, dy);
        clearCellHighlights(gridEl);
        const cellSize = getCellSize(gridEl);
        const delta = pointerToGridDelta({ x: e.clientX, y: e.clientY }, dragStart, cellSize);
        const { valid, updates } = computeTargetPositions(origGridPos, delta, state.level.gridSize, state.grid, selectedIds);

        if (valid && updates) {
            setInvalidDropState(false);
            updates.forEach(({ newX, newY }) => {
                const cell = getCell(newX, newY);
                cell?.classList.add('grid-cell--valid-target');
            });
        } else {
            setInvalidDropState(true);
        }
    };

    const onDragEnd = e => {
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        isDragging = false;
        clearCellHighlights(gridEl);
        setInvalidDropState(false);

        const gridRect = gridEl.getBoundingClientRect();
        const rackRect = document.querySelector('.rack-container').getBoundingClientRect();
        const isOutsideGrid = e.clientX < gridRect.left || e.clientX > gridRect.right ||
            e.clientY < gridRect.top || e.clientY > gridRect.bottom;
        const isOverRack = e.clientY > rackRect.top;

        if (isOutsideGrid || isOverRack) {
            onTilesReturn([...selectedIds]);
            clearSelection();
            return;
        }

        const cellSize = getCellSize(gridEl);
        const delta = pointerToGridDelta({ x: e.clientX, y: e.clientY }, dragStart, cellSize);

        if (!delta.dx && !delta.dy) {
            snapBack();
            clearSelection();
            return;
        }

        const { valid, updates } = computeTargetPositions(origGridPos, delta, state.level.gridSize, state.grid, selectedIds);
        if (!valid || updates.length !== selectedIds.size) {
            snapBack();
            clearSelection();
            return;
        }

        updates.forEach(u => state.grid.delete(`${u.oldX},${u.oldY}`));
        updates.forEach(u => {
            state.grid.set(`${u.newX},${u.newY}`, u.id);
            const el = $(u.id);
            if (el) {
                el.dataset.gridX = u.newX;
                el.dataset.gridY = u.newY;
                snapTileToCell(el, gridEl, u.newX, u.newY);
                el.classList.remove('tile--dragging', 'tile--snapping');
                void el.offsetWidth;
                el.classList.add('tile--snapping');
                el.addEventListener('animationend', () => el.classList.remove('tile--snapping'), { once: true });
            }
        });

        onValidate?.();
        clearSelection();
    };

    const snapBack = () => {
        selectedIds.forEach(id => {
            const el = $(id), orig = origGridPos.get(id);
            if (el && orig) {
                snapTileToCell(el, gridEl, orig.x, orig.y);
                el.classList.remove('tile--dragging', 'tile--snapping');
                void el.offsetWidth;
                el.classList.add('tile--snapping');
                el.addEventListener('animationend', () => el.classList.remove('tile--snapping'), { once: true });
            }
        });
    };

    const onDocumentClick = e => {
        if (selectedIds.size && !isDragging && !isSelecting && !justFinishedSelecting && !e.target.closest('.game-grid')) {
            clearSelection();
        }
    };

    document.addEventListener('click', onDocumentClick);
    gridEl.addEventListener('pointerdown', onGridDown);
    return {
        clearSelection,
        dispose: () => {
            document.removeEventListener('click', onDocumentClick);
            clearSelection();
        }
    };
};
