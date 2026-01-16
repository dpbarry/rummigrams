import { validateBoard } from './engine.js';
import { generateLevel } from './generator.js';
import { renderGridCells, renderRack, positionTileOnGrid, returnTileToRack, updateTileStates, triggerVictory, createConfetti, repositionPlacedTiles, createCellRipple, initRippleSystem, initRackTransition } from './renderer.js';
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

const themes = ['light', 'dark'];
const cycleTheme = () => {
    document.body.classList.add('is-remodeling');
    const html = document.documentElement;
    const current = html.dataset.theme || 'light';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    html.dataset.theme = next;
    localStorage.setItem('rummigrams-theme', next);

    requestAnimationFrame(() => {
        const gridEl = $('game-grid'), rackEl = $('tile-rack'), themeBtn = $('btn-theme');

        setTimeout(() => document.body.classList.remove('is-remodeling'), 50);
    });
};
const loadTheme = () => {
    const saved = localStorage.getItem('rummigrams-theme');
    if (saved && themes.includes(saved)) document.documentElement.dataset.theme = saved;
};

const gridEl = $('game-grid'), rackEl = $('tile-rack'), themeBtn = $('btn-theme');


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

const isCellOccupied = (x, y) => state.grid.has(`${x},${y}`);

const runValidation = () => {
    const grid = buildValueGrid();
    const validGroups = state.validation?.validGroupPositions || new Set();
    const remaining = calcRemainingTiles(state, validGroups);

    if (!grid.size) {
        state.validation = null;
        updateRemainingCounter(state.tiles.size);
        return;
    }

    state.validation = validateBoard(grid);
    updateTileStates(gridEl, state.validation.validGroupPositions, state.validation.noBlockRule.blockPositions, state.validation.impossiblePositions);

    const newRemaining = calcRemainingTiles(state, state.validation.validGroupPositions);

    if (!state.hand.size && state.validation.valid) return handleVictory();

    updateRemainingCounter(newRemaining);
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

let rippleInitialized = false;
const newGame = () => {
    state.grid.clear(); state.tiles.clear(); state.hand.clear();
    state.validation = null; state.isVictory = false;

    const { hand } = generateLevel(state.level);
    hand.forEach((v, i) => { const id = `tile-${i}`; state.tiles.set(id, v); state.hand.add(id); });

    renderGridCells(gridEl, state.level.gridSize, state.level.gridSize);
    if (!rippleInitialized) { initRippleSystem(gridEl); rippleInitialized = true; }
    renderRack(rackEl, state.tiles, state.hand);
    updateRemainingCounter(state.tiles.size);
};

const init = () => {
    loadTheme();
    initInteractions({ gridEl, rackEl, onTilePlaced: placeTile, onTileReturned: removeTile, isCellOccupied, createCellRipple });
    initToolbar({ state, rackEl, onScatter: scatterToBoard, onReturnAll: returnAllToHand });
    initSelection({ gridEl, state, onTilesReturn: handleTilesReturn, onValidate: runValidation });
    themeBtn.addEventListener('click', cycleTheme);

    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
        document.body.classList.add('is-remodeling');
        requestAnimationFrame(() => repositionPlacedTiles(gridEl));

        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            document.body.classList.remove('is-remodeling');
        }, 100);
    });
    resizeObserver.observe(document.body);

    initRackTransition(rackEl);
    newGame();
};

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
