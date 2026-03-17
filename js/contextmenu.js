import { positionTileOnGrid } from './renderer.js';

const MOVE_THRESHOLD = 6;
const ICON = {
    hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M6 14a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-2.5"/></svg>`,
    board: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`,
    group: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><circle cx="15" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6"/></svg>`,
    rotate90: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>`,
    rotate180: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="M12 8v4l3 3"/></svg>`,
    rotate270: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7L21 16"/></svg>`,
    flipH: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="m8 3-5 9 5 9"/><path d="m16 3 5 9-5 9"/></svg>`,
    flipV: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="m3 8 9-5 9 5"/><path d="m3 16 9 5 9-5"/></svg>`,
};

export const initContextMenu = ({ gridEl, rackEl, state, selection, onTilePlaced, onTileReturned, onValidate }) => {
    const menuEl = document.getElementById('tile-context-menu');
    if (!menuEl) return null;

    let openForTileId = null;

    // ── helpers ──────────────────────────────────────────────────────────────

    const isOnBoard = id => [...state.grid.values()].includes(id);
    const isOnRack  = id => state.hand.has(id);

    const gridPosOf = id => {
        for (const [pos, tid] of state.grid) {
            if (tid === id) {
                const [x, y] = pos.split(',').map(Number);
                return { x, y };
            }
        }
        return null;
    };

    const getBoundingBox = positions => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const { x, y } of positions) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        return { minX, minY, maxX, maxY };
    };

    /** Returns new positions after rotating the group clockwise by deg (90/180/270). */
    const rotatePositions = (entries, deg) => {
        const { minX, minY, maxX, maxY } = getBoundingBox(entries.map(e => e.pos));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        return entries.map(({ id, pos: { x, y } }) => {
            const dx = x - cx, dy = y - cy;
            let nx, ny;
            if (deg === 90)       { nx = cx + dy;  ny = cy - dx; }  // CW 90°
            else if (deg === 180) { nx = cx - dx;  ny = cy - dy; }  // 180°
            else                  { nx = cx - dy;  ny = cy + dx; }  // CW 270° (CCW 90°)
            return { id, x: Math.round(nx), y: Math.round(ny) };
        });
    };

    /** Returns new positions after flipping (axis: 'h' horizontal, 'v' vertical). */
    const flipPositions = (entries, axis) => {
        const { minX, minY, maxX, maxY } = getBoundingBox(entries.map(e => e.pos));
        return entries.map(({ id, pos: { x, y } }) => ({
            id,
            x: axis === 'h' ? minX + maxX - x : x,
            y: axis === 'v' ? minY + maxY - y : y,
        }));
    };

    /** Returns true if every new position is inside the grid and not occupied by a non-selection tile. */
    const canPlace = (newPositions, selectionIds) => {
        const size = state.level.gridSize;
        const selSet = new Set(selectionIds);
        for (const { x, y } of newPositions) {
            if (x < 0 || y < 0 || x >= size || y >= size) return false;
            const occ = state.grid.get(`${x},${y}`);
            if (occ != null && !selSet.has(occ)) return false;
        }
        return true;
    };

    /** Apply a set of tile moves to the grid and re-validate. */
    const applyMoves = (entries) => {
        const selIds = entries.map(e => e.id);
        selIds.forEach(id => {
            const pos = gridPosOf(id);
            if (pos) state.grid.delete(`${pos.x},${pos.y}`);
        });
        entries.forEach(({ id, x, y }) => {
            state.grid.set(`${x},${y}`, id);
            const el = document.getElementById(id);
            if (!el) return;
            el.dataset.gridX = x;
            el.dataset.gridY = y;
            positionTileOnGrid(el, x, y, gridEl);
        });
        onValidate?.();
        selection?.clearSelection?.();
    };

    // ── menu building ─────────────────────────────────────────────────────────

    const item = (icon, label, handler, disabled = false) => {
        const btn = document.createElement('button');
        btn.className = 'ctx-menu__item' + (disabled ? ' ctx-menu__item--disabled' : '');
        btn.setAttribute('role', 'menuitem');
        btn.innerHTML = `${icon}<span>${label}</span>`;
        if (!disabled) btn.addEventListener('pointerdown', e => { e.stopPropagation(); });
        if (!disabled) btn.addEventListener('click', () => { close(); handler(); });
        return btn;
    };

    const separator = () => {
        const el = document.createElement('div');
        el.className = 'ctx-menu__separator';
        el.setAttribute('role', 'separator');
        return el;
    };

    const label = text => {
        const el = document.createElement('div');
        el.className = 'ctx-menu__label';
        el.textContent = text;
        return el;
    };

    const buildMenu = tileId => {
        menuEl.innerHTML = '';
        const selectedIds = selection?.getSelectedIds?.() ?? new Set();
        const isSelected = selectedIds.has(tileId);
        const selectionArr = [...selectedIds];
        const multiSelection = isSelected && selectionArr.length > 1;

        const onBoard = isOnBoard(tileId);
        const onRack  = isOnRack(tileId);

        if (multiSelection && onBoard) {
            // --- multi-board-selection: rotate / flip ---
            const entries = selectionArr.map(id => ({ id, pos: gridPosOf(id) })).filter(e => e.pos);
            menuEl.appendChild(label('Transform'));

            const addTransform = (icon, text, newPositions) => {
                const ok = canPlace(newPositions, selectionArr);
                menuEl.appendChild(item(icon, text, () => {
                    applyMoves(newPositions.map(p => ({ ...p })));
                }, !ok));
            };

            addTransform(ICON.rotate90,  'Rotate 90°',  rotatePositions(entries, 90));
            addTransform(ICON.rotate180, 'Rotate 180°', rotatePositions(entries, 180));
            addTransform(ICON.rotate270, 'Rotate 270°', rotatePositions(entries, 270));
            menuEl.appendChild(separator());
            addTransform(ICON.flipH, 'Flip Horizontal', flipPositions(entries, 'h'));
            addTransform(ICON.flipV, 'Flip Vertical',   flipPositions(entries, 'v'));

            // also allow sending the full selection to hand
            menuEl.appendChild(separator());
            menuEl.appendChild(item(ICON.hand, 'Send all to hand', () => {
                selectionArr.forEach(id => {
                    const pos = gridPosOf(id);
                    if (pos) onTileReturned(id, pos.x, pos.y, true);
                });
            }));
        } else {
            // --- single tile or tile-in-selection ---
            if (onBoard) {
                menuEl.appendChild(item(ICON.hand, 'Send to hand', () => {
                    const pos = gridPosOf(tileId);
                    if (pos) onTileReturned(tileId, pos.x, pos.y, true);
                }));
            }

            if (onRack || !onBoard) {
                menuEl.appendChild(item(ICON.board, 'Send to board', () => {
                    const size = state.level.gridSize;
                    for (let y = 0; y < size; y++) {
                        for (let x = 0; x < size; x++) {
                            if (!state.grid.has(`${x},${y}`)) {
                                onTilePlaced(tileId, x, y);
                                return;
                            }
                        }
                    }
                }));
            }

            if (!isSelected) {
                menuEl.appendChild(item(ICON.group, 'Add to group', () => {
                    selection?.addTileToSelection?.(tileId);
                }));
            }
        }
    };

    // ── open / close ─────────────────────────────────────────────────────────

    const open = (tileId, clientX, clientY) => {
        openForTileId = tileId;
        buildMenu(tileId);

        menuEl.style.left = '0px';
        menuEl.style.top  = '0px';
        menuEl.removeAttribute('aria-hidden');
        menuEl.classList.add('ctx-menu--open');

        requestAnimationFrame(() => {
            const vw = window.innerWidth, vh = window.innerHeight;
            const { width, height } = menuEl.getBoundingClientRect();
            const x = Math.min(clientX + 2, vw - width - 8);
            const y = Math.min(clientY + 2, vh - height - 8);
            menuEl.style.left = `${Math.max(8, x)}px`;
            menuEl.style.top  = `${Math.max(8, y)}px`;
        });
    };

    const close = () => {
        menuEl.classList.remove('ctx-menu--open');
        menuEl.setAttribute('aria-hidden', 'true');
        openForTileId = null;
    };

    // ── trigger logic ─────────────────────────────────────────────────────────

    const DOUBLE_TAP_MS = 320;
    let lastTapTileId = null;
    let lastTapTime = 0;
    let tapStartX = 0, tapStartY = 0;
    let tapMoved = false;

    const onTouchDown = e => {
        if (e.pointerType !== 'touch') return;
        const tile = e.target.closest('.tile');
        if (!tile) { lastTapTileId = null; return; }
        tapStartX = e.clientX;
        tapStartY = e.clientY;
        tapMoved = false;
    };

    const onTouchMove = e => {
        if (e.pointerType !== 'touch') return;
        const dx = e.clientX - tapStartX, dy = e.clientY - tapStartY;
        if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) tapMoved = true;
    };

    const onTouchUp = e => {
        if (e.pointerType !== 'touch') return;
        const tile = e.target.closest('.tile');
        if (!tile || tapMoved) { lastTapTileId = null; return; }
        const now = Date.now();
        if (tile.id === lastTapTileId && now - lastTapTime < DOUBLE_TAP_MS) {
            lastTapTileId = null;
            e.preventDefault();
            open(tile.id, e.clientX, e.clientY);
        } else {
            lastTapTileId = tile.id;
            lastTapTime = now;
        }
    };

    const onContextMenu = e => {
        const tile = e.target.closest('.tile');
        if (!tile) return;
        e.preventDefault();
        open(tile.id, e.clientX, e.clientY);
    };

    const onDocDown = e => {
        if (!openForTileId) return;
        if (!menuEl.contains(e.target)) close();
    };

    const onKey = e => {
        if (e.key === 'Escape' && openForTileId) close();
    };

    [rackEl, gridEl].forEach(el => {
        el.addEventListener('pointerdown', onTouchDown);
        el.addEventListener('pointermove', onTouchMove);
        el.addEventListener('pointerup', onTouchUp);
        el.addEventListener('pointercancel', () => { tapMoved = true; });
        el.addEventListener('contextmenu', onContextMenu);
    });
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onKey);

    return {
        dispose: () => {
            close();
            [rackEl, gridEl].forEach(el => {
                el.removeEventListener('pointerdown', onTouchDown);
                el.removeEventListener('pointermove', onTouchMove);
                el.removeEventListener('pointerup', onTouchUp);
                el.removeEventListener('contextmenu', onContextMenu);
            });
            document.removeEventListener('pointerdown', onDocDown, true);
            document.removeEventListener('keydown', onKey);
        }
    };
};
