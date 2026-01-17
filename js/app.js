import { validateBoard } from './engine.js';
import { toggleTheme, initTheme } from './theme.js';
import { generateLevel } from './generator.js';
import {
    renderRack, positionTileOnGrid, returnTileToRack, updateTileStates, renderGridCells,
    initParticleBurstSystem, createCellParticleBurst, triggerVictory, createConfetti, repositionPlacedTiles, initRackTransition, cleanupParticleBurstSystem
} from './renderer.js';
import { initInteractions } from './interactions.js';
import { initToolbar, calcRemainingTiles, updateRemainingCounter } from './toolbar.js';
import { initSelection } from './selection.js';

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

const placeTile = (id, x, y) => {
    const el = $(id);
    if (!el) return;
    state.grid.set(`${x},${y}`, id);
    state.hand.delete(id);
    positionTileOnGrid(el, x, y, gridEl);
    runValidation();
};

const removeTile = (id, x, y, toRack = true) => {
    const el = $(id);
    if (!el) return;
    state.grid.delete(`${x},${y}`);
    if (toRack) { state.hand.add(id); returnTileToRack(el, rackEl); }
    runValidation();
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
const newGame = () => {
    state.grid.clear(); state.tiles.clear(); state.hand.clear();
    state.validation = null; state.isVictory = false;

    const { hand } = generateLevel(state.level);
    hand.forEach((v, i) => { const id = `tile-${i}`; state.tiles.set(id, v); state.hand.add(id); });

    renderGridCells(gridEl, state.level.gridSize, state.level.gridSize);
    if (!particleBurstInitialized) { initParticleBurstSystem(gridEl); particleBurstInitialized = true; }
    renderRack(rackEl, state.tiles, state.hand);
    updateRemainingCounter(state.tiles.size);
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

    const selection = initSelection({ gridEl, state, onTilesReturn: handleTilesReturn, onValidate: runValidation });
    if (selection && selection.dispose) cleanupFns.push(selection.dispose);

    themeBtn.addEventListener('click', toggleTheme);

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

    initParticleBurstSystem(gridEl);
    cleanupFns.push(cleanupParticleBurstSystem);

    newGame();
};

export { initGame, disposeGame };
