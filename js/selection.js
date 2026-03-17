import {
    pointerToGridDelta, computeTargetPositions, getCellSize, clearCellHighlights,
    snapTileToCell, moveTilesPixel
} from './drag.js';

export const initSelection = ({ gridEl, rackEl, state, onTilesReturn, onValidate }) => {
    let selectedIds = new Set();
    let selectionRect = null;
    let isSelecting = false;
    let selStart = { x: 0, y: 0 };
    let justFinishedSelecting = false;
    let preDragSelectedIds = new Set();
    let magnetMode = false;

    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let origGridPos = new Map();
    let origPixelPos = new Map();
    let activeContainer = null;

    const $ = id => document.getElementById(id);
    const getCell = (x, y) => gridEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    const gameContainer = gridEl.closest('.game-container') || gridEl;

    const magnetBtn = document.getElementById('btn-magnet');

    const clearSelection = () => {
        selectedIds.forEach(id => {
            const el = $(id);
            if (el) el.classList.remove('tile--selected', 'tile--dragging', 'tile--invalid-drop');
        });
        selectedIds = new Set();
        origGridPos.clear();
        origPixelPos.clear();
        selectionRect?.remove();
        selectionRect = null;
        activeContainer = null;
        gameContainer.removeEventListener('pointerdown', onDragStart);
        rackEl.removeEventListener('pointerdown', onDragStart);
    };

    const setMagnetMode = (active, shouldClearSelection = true) => {
        magnetMode = active;
        window.__magnetModeActive = active;
        magnetBtn?.classList.toggle('tool-btn--active', active);
        if (!active && shouldClearSelection) clearSelection();
    };

    window.__magnetModeActive = false;
    const onMagnetBtnClick = () => setMagnetMode(!magnetMode);
    magnetBtn?.addEventListener('click', onMagnetBtnClick);

    let enabledByCtrl = false;

    const onKeyDown = e => {
        if (e.key === 'Control' && !e.repeat && !magnetMode) {
            setMagnetMode(true);
            enabledByCtrl = true;
        }
    };

    const onKeyUp = e => {
        if (e.key === 'Control' && magnetMode && enabledByCtrl) {
            setMagnetMode(false, false);
            enabledByCtrl = false;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);


    const toggleTileSelection = tile => {
        const id = tile.id;
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
            tile.classList.remove('tile--selected');
            if (!selectedIds.size) {
                gameContainer.removeEventListener('pointerdown', onDragStart);
                rackEl.removeEventListener('pointerdown', onDragStart);
                activeContainer = null;
            }
        } else {
            const tileContainer = tile.closest('.game-grid') ? 'grid' : 'rack';
            if (activeContainer && activeContainer !== tileContainer) {
                clearSelection();
            }
            activeContainer = tileContainer;

            selectedIds.add(id);
            tile.classList.add('tile--selected');
            if (selectedIds.size === 1) {
                gameContainer.addEventListener('pointerdown', onDragStart);
                rackEl.addEventListener('pointerdown', onDragStart);
            }
        }
    };

    let justFinishedDragging = false;

    const DRAG_THRESHOLD = 6;

    const onMagnetTileDown = e => {
        const tile = e.target.closest('.tile');
        if (!tile || e.button === 2) return;

        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX, startY = e.clientY;
        let moved = false;

        const onMove = me => {
            const dx = me.clientX - startX, dy = me.clientY - startY;
            if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
                moved = true;
                cleanup();

                const dragEvent = new PointerEvent('pointerdown', {
                    bubbles: true, cancelable: true,
                    clientX: startX, clientY: startY,
                    pointerId: e.pointerId, pointerType: e.pointerType,
                    isPrimary: e.isPrimary
                });
                dragEvent.forceDrag = true;
                tile.dispatchEvent(dragEvent);
            }
        };

        const onUp = () => {
            cleanup();
            if (!moved) toggleTileSelection(tile);
        };

        const cleanup = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const onContainerDown = e => {
        if (e.button === 2) return;
        if (e.target.closest('.tile')) {
            if (magnetMode && !e.forceDrag) onMagnetTileDown(e);
            return;
        }
        if (rackEl.contains(e.target) || e.currentTarget === rackEl) return;
        onSelectionStart(e);
    };

    gameContainer.addEventListener('pointerdown', onContainerDown, { capture: true });
    rackEl.addEventListener('pointerdown', onContainerDown, { capture: true });

    const onSelectionStart = e => {
        e.preventDefault();
        isSelecting = true;
        selStart = { x: e.clientX, y: e.clientY };
        if (activeContainer && activeContainer !== 'grid') clearSelection();
        if (magnetMode) preDragSelectedIds = new Set(selectedIds);
        else clearSelection();
        activeContainer = 'grid';

        document.addEventListener('pointermove', onSelecting);
        document.addEventListener('pointerup', onSelectEnd);
        document.addEventListener('pointercancel', onSelectEnd);
    };

    const onSelecting = e => {
        if (!isSelecting) return;
        e.preventDefault();

        if (!selectionRect) {
            if (Math.abs(e.clientX - selStart.x) < DRAG_THRESHOLD && Math.abs(e.clientY - selStart.y) < DRAG_THRESHOLD) return;
            selectionRect = Object.assign(document.createElement('div'), { className: 'selection-rect' });
            gridEl.appendChild(selectionRect);
        }

        const rect = gridEl.getBoundingClientRect();
        const [x1, y1] = [selStart.x - rect.left, selStart.y - rect.top];
        const [x2, y2] = [e.clientX - rect.left, e.clientY - rect.top];
        Object.assign(selectionRect.style, {
            left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`,
            width: `${Math.abs(x2 - x1)}px`, height: `${Math.abs(y2 - y1)}px`
        });

        const [minX, maxX] = [Math.min(selStart.x, e.clientX), Math.max(selStart.x, e.clientX)];
        const [minY, maxY] = [Math.min(selStart.y, e.clientY), Math.max(selStart.y, e.clientY)];
        const tilesToCheck = gridEl.querySelectorAll('.tile--placed');

        const nowSelected = new Set(
            [...tilesToCheck]
                .filter(tile => {
                    const r = tile.getBoundingClientRect();
                    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
                    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
                })
                .map(tile => tile.id)
        );

        if (magnetMode) {
            preDragSelectedIds.forEach(id => nowSelected.add(id));
        }

        selectedIds.forEach(id => !nowSelected.has(id) && $(id)?.classList.remove('tile--selected'));
        nowSelected.forEach(id => $(id)?.classList.add('tile--selected'));
        selectedIds = nowSelected;
    };

    const onSelectEnd = () => {
        document.removeEventListener('pointermove', onSelecting);
        document.removeEventListener('pointerup', onSelectEnd);
        document.removeEventListener('pointercancel', onSelectEnd);
        isSelecting = false;

        if (!selectionRect && magnetMode) {
            clearSelection();
        }

        selectionRect?.remove();
        selectionRect = null;
        if (selectedIds.size) {
            gameContainer.addEventListener('pointerdown', onDragStart);
            rackEl.addEventListener('pointerdown', onDragStart);
        }
        justFinishedSelecting = true;
        setTimeout(() => justFinishedSelecting = false, 100);
    };

    const onDragStart = e => {
        if (e.button === 2) return;
        const tile = e.target.closest('.tile--selected');
        if (!tile) {
            if (!magnetMode) clearSelection();
            return;
        }

        if (selectedIds.size === 1 && !magnetMode) {
            tile.classList.remove('tile--selected');
            selectedIds.clear();
            gameContainer.removeEventListener('pointerdown', onDragStart);
            rackEl.removeEventListener('pointerdown', onDragStart);
            activeContainer = null;
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

        try {
            e.target.setPointerCapture(e.pointerId);
        } catch (_) {}

        origGridPos.clear();
        origPixelPos.clear();

        const primaryTileId = tile.id;

        selectedIds.forEach(id => {
            const el = $(id);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            origPixelPos.set(id, { left: rect.left, top: rect.top });

            if (activeContainer === 'grid') {
                const pos = [...state.grid].find(([, tid]) => tid === id)?.[0];
                if (pos) {
                    const [x, y] = pos.split(',').map(Number);
                    origGridPos.set(id, { x, y });
                }
            } else if (activeContainer === 'rack') {
                const primaryEl = $(primaryTileId);
                const pRect = primaryEl.getBoundingClientRect();
                const relX = rect.left - pRect.left;
                const relY = rect.top - pRect.top;
                origGridPos.set(id, { relX, relY, isRack: true });
            }

            el.style.position = 'fixed';
            el.style.left = `${rect.left}px`;
            el.style.top = `${rect.top}px`;
            el.style.width = `${rect.width}px`;
            el.style.height = `${rect.height}px`;
            el.style.zIndex = '1000';
            document.body.appendChild(el);
            el.classList.add('tile--dragging');
        });

        if (activeContainer === 'rack' && selectedIds.size > 1) {
            const primaryRect = tile.getBoundingClientRect();
            const stackOffset = 8;
            let i = 0;
            selectedIds.forEach(id => {
                if (id === primaryTileId) return;
                i++;
                const el = $(id);
                el.style.left = `${primaryRect.left + i * stackOffset}px`;
                el.style.top = `${primaryRect.top - i * stackOffset}px`;
                el.style.zIndex = `${1000 - i}`;
                origPixelPos.set(id, { left: primaryRect.left + i * stackOffset, top: primaryRect.top - i * stackOffset });
            });
        }

        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
    };

    const setInvalidDropState = isInvalid => {
        selectedIds.forEach(id => {
            const el = $(id);
            if (el) el.classList.toggle('tile--invalid-drop', isInvalid);
        });
    };

    const handleTargetResult = (valid, updates) => {
        setInvalidDropState(!valid);
        if (valid && updates) {
            updates.forEach(u => {
                const cell = getCell(u.newX, u.newY);
                if (cell) cell.classList.add('grid-cell--valid-target');
            });
        }
    };

    const findSpreadCells = (startX, startY, count, gridSize, occupiedSet) => {
        const clampedX = Math.max(0, Math.min(gridSize - 1, startX));
        const clampedY = Math.max(0, Math.min(gridSize - 1, startY));

        const cells = [];
        const visited = new Set();
        const queue = [[clampedX, clampedY]];
        visited.add(`${clampedX},${clampedY}`);

        while (queue.length > 0 && cells.length < count) {
            const [x, y] = queue.shift();
            if (!occupiedSet.has(`${x},${y}`)) {
                cells.push({ x, y });
            }
            for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                const nx = x + dx, ny = y + dy;
                const key = `${nx},${ny}`;
                if (!visited.has(key) && nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    visited.add(key);
                    queue.push([nx, ny]);
                }
            }
        }
        return cells;
    };

    const getCursorGridPos = (e, gridRect, cellSize) => {
        const margin = cellSize.w * 0.5;
        const expandedLeft = gridRect.left - margin;
        const expandedTop = gridRect.top - margin;
        const expandedRight = gridRect.right + margin;
        const expandedBottom = gridRect.bottom + margin;

        if (e.clientX < expandedLeft || e.clientX > expandedRight ||
            e.clientY < expandedTop || e.clientY > expandedBottom) {
            return null;
        }

        const rawX = Math.floor((e.clientX - gridRect.left) / cellSize.w);
        const rawY = Math.floor((e.clientY - gridRect.top) / cellSize.h);

        return { x: rawX, y: rawY };
    };

    const onDragMove = e => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        moveTilesPixel(selectedIds, origPixelPos, dx, dy);
        clearCellHighlights(gridEl);
        const cellSize = getCellSize(gridEl);

        if (activeContainer === 'grid') {
            const delta = pointerToGridDelta({ x: e.clientX, y: e.clientY }, dragStart, cellSize);
            const { valid, updates } = computeTargetPositions(origGridPos, delta, state.level.gridSize, state.grid, selectedIds);
            handleTargetResult(valid, updates);
        } else {
            const gridRect = gridEl.getBoundingClientRect();
            const cursorPos = getCursorGridPos(e, gridRect, cellSize);

            if (!cursorPos) {
                setInvalidDropState(true);
                return;
            }

            const spreadCells = findSpreadCells(cursorPos.x, cursorPos.y, selectedIds.size, state.level.gridSize, state.grid);
            const valid = spreadCells.length === selectedIds.size;
            setInvalidDropState(!valid);

            if (valid) {
                spreadCells.forEach(c => {
                    const cell = getCell(c.x, c.y);
                    if (cell) cell.classList.add('grid-cell--valid-target');
                });
            }
        }
    };



    const onDragEnd = e => {
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        isDragging = false;
        justFinishedDragging = true;
        setTimeout(() => justFinishedDragging = false, 50);

        clearCellHighlights(gridEl);
        setInvalidDropState(false);

        const gridRect = gridEl.getBoundingClientRect();
        const rackRect = document.querySelector('.rack-container').getBoundingClientRect();
        const cellSize = getCellSize(gridEl);
        const isOverRack = e.clientY > rackRect.top;

        const cursorPos = activeContainer === 'rack' ? getCursorGridPos(e, gridRect, cellSize) : null;
        const isOutsideGrid = activeContainer === 'rack'
            ? (!cursorPos && !isOverRack)
            : (e.clientX < gridRect.left || e.clientX > gridRect.right || e.clientY < gridRect.top || e.clientY > gridRect.bottom);

        if (isOutsideGrid || isOverRack) {
            if (activeContainer === 'grid') {
                onTilesReturn([...selectedIds]);
            } else {
                selectedIds.forEach(id => {
                    const el = $(id);
                    if (el) {
                        el.style.position = '';
                        el.style.left = '';
                        el.style.top = '';
                        el.style.width = '';
                        el.style.height = '';
                        el.style.zIndex = '';
                        rackEl.appendChild(el);
                    }
                });
            }

            clearSelection();
            if (magnetMode) setMagnetMode(false);
            return;
        }

        let updates = null;

        if (activeContainer === 'grid') {
            const delta = pointerToGridDelta({ x: e.clientX, y: e.clientY }, dragStart, cellSize);

            if (!delta.dx && !delta.dy) {
                snapBack();
                clearSelection();
                return;
            }

            const res = computeTargetPositions(origGridPos, delta, state.level.gridSize, state.grid, selectedIds);
            if (res.valid) updates = res.updates;
        } else {
            const spreadCells = findSpreadCells(cursorPos.x, cursorPos.y, selectedIds.size, state.level.gridSize, state.grid);
            if (spreadCells.length === selectedIds.size) {
                const idsArray = [...selectedIds];
                updates = spreadCells.map((c, i) => ({ id: idsArray[i], oldX: -1, oldY: -1, newX: c.x, newY: c.y }));
            }
        }

        if (!updates || updates.length !== selectedIds.size) {
            snapBack();
            clearSelection();
            return;
        }

        updates.forEach(u => state.grid.delete(`${u.oldX},${u.oldY}`));
        updates.forEach(u => {
            state.grid.set(`${u.newX},${u.newY}`, u.id);
            state.hand.delete(u.id);
            const el = $(u.id);
            if (el) {
                el.style.position = 'absolute';
                el.style.width = '';
                el.style.height = '';
                el.style.zIndex = '';
                gridEl.appendChild(el);

                el.dataset.gridX = u.newX;
                el.dataset.gridY = u.newY;
                el.classList.add('tile--placed');
                el.classList.remove('tile--selected');
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
            const el = $(id);
            if (!el) return;

            el.style.width = '';
            el.style.height = '';
            el.style.zIndex = '';
            el.classList.remove('tile--dragging', 'tile--snapping');

            if (activeContainer === 'grid') {
                const orig = origGridPos.get(id);
                if (orig) {
                    el.style.position = 'absolute';
                    gridEl.appendChild(el);
                    snapTileToCell(el, gridEl, orig.x, orig.y);
                }
            } else {
                el.style.position = '';
                el.style.left = '';
                el.style.top = '';
                rackEl.appendChild(el);
            }

            void el.offsetWidth;
            el.classList.add('tile--snapping');
            el.addEventListener('animationend', () => el.classList.remove('tile--snapping'), { once: true });
        });
    };

    const onDocumentClick = e => {
        if (selectedIds.size && !isDragging && !isSelecting && !justFinishedSelecting &&
            !e.target.closest('.game-grid') && !e.target.closest('.rack-container') &&
            !e.target.closest('.toolbar') && !e.target.closest('.header') && !e.target.closest('button') &&
            !e.target.closest('.info-dialog') && !e.target.closest('.info-dialog-overlay')) {
            clearSelection();
        }
    };

    document.addEventListener('click', onDocumentClick);
    return {
        clearSelection,
        getSelectedIds: () => new Set(selectedIds),
        addTileToSelection: (tileId) => {
            const el = $(tileId);
            if (el) toggleTileSelection(el);
        },
        dispose: () => {
            document.removeEventListener('click', onDocumentClick);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            gameContainer.removeEventListener('pointerdown', onContainerDown, { capture: true });
            rackEl.removeEventListener('pointerdown', onContainerDown, { capture: true });
            magnetBtn?.removeEventListener('click', onMagnetBtnClick);
            clearSelection();
        }
    };
};

