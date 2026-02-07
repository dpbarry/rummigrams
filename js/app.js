import { validateBoard } from './engine.js';
import { toggleTheme, initTheme } from './theme.js';
import { generateLevel } from './generator.js';
import { saveGame, loadGame } from './storage.js';
import {
    renderRack, positionTileOnGrid, returnTileToRack, updateTileStates, renderGridCells,
    initParticleBurstSystem, createCellParticleBurst, triggerVictory, createConfetti, repositionPlacedTiles, initRackTransition, cleanupParticleBurstSystem
} from './renderer.js';
import { initInteractions } from './interactions.js';
import { initToolbar, calcRemainingTiles, updateRemainingCounter } from './toolbar.js';
import { initSelection } from './selection.js';
import { initScrollFade } from './scrollfade.js';

// Fix click detection for buttons with scale animations
const fixScaleClick = (btn, callback) => {
    if (!btn) return;
    let startRect = null;
    const onDown = e => {
        startRect = btn.getBoundingClientRect();
        document.addEventListener('pointerup', onUp, { once: true });
    };
    const onUp = e => {
        if (!startRect) return;
        const { clientX: x, clientY: y } = e;
        if (x >= startRect.left && x <= startRect.right && y >= startRect.top && y <= startRect.bottom) {
            callback(e);
        }
        startRect = null;
    };
    btn.addEventListener('pointerdown', onDown);
    return () => btn.removeEventListener('pointerdown', onDown);
};

const state = {
    grid: new Map(),
    tiles: new Map(),
    hand: new Set(),
    level: { gridSize: 6, minValue: 1, maxValue: 13, targetTiles: 14 },
    validation: null,
    isVictory: false
};

const $ = id => document.getElementById(id);

let gridEl, rackEl, themeBtn;




const buildValueGrid = () => new Map([...state.grid].map(([pos, id]) => [pos, state.tiles.get(id)]));

const saveState = () => saveGame(state);

const placeTile = (id, x, y) => {
    const el = $(id);
    if (!el) return;
    state.grid.set(`${x},${y}`, id);
    state.hand.delete(id);
    positionTileOnGrid(el, x, y, gridEl);
    runValidation();
    saveState();
};

const removeTile = (id, x, y, toRack = true) => {
    const el = $(id);
    if (!el) return;
    state.grid.delete(`${x},${y}`);
    if (toRack) { state.hand.add(id); returnTileToRack(el, rackEl); }
    runValidation();
    saveState();
};

const getTileAt = (x, y) => state.grid.get(`${x},${y}`) || null;

const swapTiles = (draggedId, draggedOrigPos, occupantId, targetX, targetY) => {
    const draggedEl = $(draggedId), occupantEl = $(occupantId);
    if (!draggedEl || !occupantEl) return;

    state.grid.delete(`${targetX},${targetY}`);
    if (draggedOrigPos) state.grid.delete(`${draggedOrigPos.x},${draggedOrigPos.y}`);

    state.grid.set(`${targetX},${targetY}`, draggedId);
    state.hand.delete(draggedId);
    positionTileOnGrid(draggedEl, targetX, targetY, gridEl);

    if (draggedOrigPos) {
        state.grid.set(`${draggedOrigPos.x},${draggedOrigPos.y}`, occupantId);
        positionTileOnGrid(occupantEl, draggedOrigPos.x, draggedOrigPos.y, gridEl);
    } else {
        state.hand.add(occupantId);
        returnTileToRack(occupantEl, rackEl);
    }

    runValidation();
    saveState();
};

const runValidation = () => {
    const grid = buildValueGrid();

    if (!grid.size) {
        state.validation = null;
        updateRemainingCounter(state.tiles.size);
        return;
    }

    state.validation = validateBoard(grid);
    updateTileStates(gridEl, state.validation.validPositions, state.validation.blockPositions, state.validation.impossiblePositions);

    const remaining = calcRemainingTiles(state, state.validation.validPositions);
    if (!state.hand.size && remaining === 0 && state.validation.valid) return handleVictory();

    updateRemainingCounter(remaining);
};

const handleVictory = () => {
    state.isVictory = true;
    saveState();
    updateRemainingCounter(0, true);
    triggerVictory(gridEl);
    setTimeout(() => createConfetti(40), 300);
};

const handleTilesReturn = ids => {
    ids.forEach(id => {
        const tile = $(id);
        if (!tile) return;
        const x = +tile.dataset.gridX;
        const y = +tile.dataset.gridY;
        removeTile(id, x, y, true);
    });
};

const scatterToBoard = () => {
    const emptyCells = [];
    const size = state.level.gridSize;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!state.grid.has(`${x},${y}`)) emptyCells.push({ x, y });
        }
    }

    for (let i = emptyCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [emptyCells[i], emptyCells[j]] = [emptyCells[j], emptyCells[i]];
    }

    const handIds = [...state.hand];
    handIds.forEach((id, i) => {
        if (emptyCells[i]) placeTile(id, emptyCells[i].x, emptyCells[i].y);
    });
};

const returnAllToHand = () => {
    const placedIds = [...state.grid.values()];
    handleTilesReturn(placedIds);
};

let particleBurstInitialized = false;

const loadSettings = () => {
    const diff = sessionStorage.getItem('rummigrams_difficulty');
    const grid = sessionStorage.getItem('rummigrams_gridSize');
    if (diff) state.level.difficulty = parseInt(diff, 10);
    if (grid) state.level.gridSize = parseInt(grid, 10);
};

const newGame = () => {
    loadSettings();
    state.grid.clear(); state.tiles.clear(); state.hand.clear();
    state.validation = null; state.isVictory = false;

    const { hand } = generateLevel(state.level);
    hand.forEach((v, i) => { const id = `tile-${i}`; state.tiles.set(id, v); state.hand.add(id); });

    renderGridCells(gridEl, state.level.gridSize, state.level.gridSize);
    if (!particleBurstInitialized) { initParticleBurstSystem(gridEl); particleBurstInitialized = true; }
    renderRack(rackEl, state.tiles, state.hand);
    updateRemainingCounter(state.tiles.size);
    saveState();
};

const loadSavedGame = () => {
    const saved = loadGame();
    if (!saved) return false;

    state.grid = saved.grid;
    state.tiles = saved.tiles;
    state.hand = saved.hand;
    state.isVictory = saved.isVictory;
    state.level.gridSize = saved.gridSize;
    state.validation = null;

    renderGridCells(gridEl, state.level.gridSize, state.level.gridSize);
    if (!particleBurstInitialized) { initParticleBurstSystem(gridEl); particleBurstInitialized = true; }

    // Render tiles in hand to rack
    renderRack(rackEl, state.tiles, state.hand);

    // Create and position tiles on grid
    state.grid.forEach((id, pos) => {
        const [x, y] = pos.split(',').map(Number);
        const value = state.tiles.get(id);
        const existing = $(id);
        if (existing) existing.remove();

        const tile = document.createElement('div');
        tile.id = id;
        tile.className = 'tile tile--placed';
        tile.setAttribute('role', 'listitem');
        tile.setAttribute('tabindex', '0');
        tile.dataset.value = value;
        tile.dataset.gridX = x;
        tile.dataset.gridY = y;
        tile.innerHTML = `<span class="tile__number">${value <= 10 ? value : ['J', 'Q', 'K'][value - 11]}</span>`;
        gridEl.appendChild(tile);
        positionTileOnGrid(tile, x, y, gridEl);
    });

    runValidation();
    if (state.isVictory) {
        updateRemainingCounter(0, true);
        triggerVictory(gridEl);
    }
    return true;
};

let cleanupFns = [];

const disposeGame = () => {
    cleanupFns.forEach(fn => fn && fn());
    cleanupFns = [];
    particleBurstInitialized = false;
};

const initGame = () => {
    disposeGame(); // Ensure clean state

    gridEl = $('game-grid');
    rackEl = $('tile-rack');
    themeBtn = $('btn-theme');

    initTheme();
    const cleanupInteractions = initInteractions({ gridEl, rackEl, onTilePlaced: placeTile, onTileReturned: removeTile, getTileAt, swapTiles, createCellParticleBurst });
    if (cleanupInteractions) cleanupFns.push(cleanupInteractions);

    initToolbar({ state, rackEl, onScatter: scatterToBoard, onReturnAll: returnAllToHand });

    const selection = initSelection({ gridEl, rackEl, state, onTilesReturn: handleTilesReturn, onValidate: runValidation });
    if (selection && selection.dispose) cleanupFns.push(selection.dispose);

    const cleanupTheme = fixScaleClick(themeBtn, toggleTheme);
    if (cleanupTheme) cleanupFns.push(cleanupTheme);

    // Info Dialog - scope to app container to avoid conflicts during page transitions
    const appContainer = document.querySelector('.app');
    const btnInfo = appContainer?.querySelector('#btn-info');
    const overlay = appContainer?.querySelector('.info-dialog-overlay');
    const closeBtn = appContainer?.querySelector('.info-dialog-close');

    const openDialog = () => overlay?.classList.add('open');
    const closeDialog = () => overlay?.classList.remove('open');

    const cleanupInfo = fixScaleClick(btnInfo, openDialog);
    const cleanupClose = fixScaleClick(closeBtn, closeDialog);
    if (cleanupInfo) cleanupFns.push(cleanupInfo);
    if (cleanupClose) cleanupFns.push(cleanupClose);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });

    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
        document.body.classList.add('is-remodeling');
        requestAnimationFrame(() => repositionPlacedTiles(gridEl));
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => document.body.classList.remove('is-remodeling'), 100);
    });
    // Delay observer to avoid triggering "is-remodeling" during page transition (400ms)
    setTimeout(() => resizeObserver.observe(document.body), 500);
    cleanupFns.push(() => {
        resizeObserver.disconnect();
        document.body.classList.remove('is-remodeling');
    });

    const rackObserver = initRackTransition(rackEl);
    if (rackObserver) cleanupFns.push(() => rackObserver.disconnect());

    const rackContainer = rackEl.closest('.rack-container');
    const cleanupScrollFade = rackContainer && initScrollFade(rackContainer);
    if (cleanupScrollFade) cleanupFns.push(cleanupScrollFade);

    initParticleBurstSystem(gridEl);
    cleanupFns.push(cleanupParticleBurstSystem);

    const forceNewGame = sessionStorage.getItem('rummigrams_new_game') === 'true';
    sessionStorage.removeItem('rummigrams_new_game');

    if (!forceNewGame && loadSavedGame()) {
        // Resumed saved game
    } else {
        newGame();
    }
};

export { initGame, disposeGame };
