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
import { isMultiplayer, createPartyConnection, getPartyRoomId, createShareUrl } from './party.js';


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

const LOBBY_COLOR_SAT = 62;
const LOBBY_COLOR_LIGHT = 48;
const MAX_PLAYER_NAME_LEN = 20;
const LOBBY_GHOST_SLOTS = 3;
const getLobbyName = () => (nameInput?.value || '').trim().slice(0, MAX_PLAYER_NAME_LEN);

const appendLobbyGhostSlots = (count = LOBBY_GHOST_SLOTS) => {
    if (!playerListEl) return;
    const n = Math.max(0, count);
    for (let i = 0; i < n; i++) {
        const li = document.createElement('li');
        li.className = 'lobby-player lobby-player--ghost';
        li.setAttribute('aria-hidden', 'true');
        li.innerHTML = '<span class="lobby-ghost-bar"></span>';
        playerListEl.appendChild(li);
    }
};

const hslToHex = (h, s, l) => {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    const r = Math.round(f(0) * 255); const g = Math.round(f(8) * 255); const b = Math.round(f(4) * 255);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

let gridEl, rackEl, themeBtn;
let lobbyEl, nameInput, playerListEl, startBtn, lobbyWaitEl, lobbyHueTrack, lobbyHueSliderWrap;
let selectedLobbyHue = 24;
let selectedLobbyColor = hslToHex(24, LOBBY_COLOR_SAT, LOBBY_COLOR_LIGHT);
let currentPhase = 'game';
let hasAutoFocusedLobbyName = false;

function randomizeLobbyName() {
    const firstNames = ["Desparate", "Unlikely", "Plausible", "Foolhardy", "Severe", "Amazing", "Striving", "Witty", "Immortal", "Defiant", "Wondrous", "Wise", "Luminous", "Speedy"]
    const lastNames = ["Pawn", "Soldier", "Pope", "Protestor", "Dog", "Cosmos", "Mercenary", "Pilgrim", "Intellect", "Gonzales", "Domino", "Speaker", "Jester", "Defendent", "Baker"]

    let randomName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`.slice(0, MAX_PLAYER_NAME_LEN);
    nameInput.value = randomName;
    localStorage.setItem('rummigrams_name', randomName);

    if (document.getElementById('lobby-name')) {
        document.getElementById('lobby-name').value = randomName;
    }
}

const buildValueGrid = () => new Map([...state.grid].map(([pos, id]) => [pos, state.tiles.get(id)]));

let partyConnection = null;
let myServerId = null;
let isHost = false;
let gamePage = null;
let renderHeaderPlayerDiamondsFn = null;
let lastLobbyState = null;

const saveState = () => {
    if (!isMultiplayer()) saveGame(state);
};

let partyBoardSyncTimer = null;
const serializeBoardForParty = () => ({
    gridSize: state.level.gridSize,
    grid: [...state.grid.entries()],
    hand: [...state.hand],
    tiles: [...state.tiles.entries()]
});
const sendPartyBoardStateNow = () => {
    if (!isMultiplayer() || !partyConnection?.ready || currentPhase !== 'game') return;
    partyConnection.sendBoardState(serializeBoardForParty());
};
const schedulePartyBoardSync = () => {
    if (!isMultiplayer() || !partyConnection?.ready || currentPhase !== 'game') return;
    clearTimeout(partyBoardSyncTimer);
    partyBoardSyncTimer = setTimeout(sendPartyBoardStateNow, 150);
};

const startPartyGame = () => {
    if (currentPhase !== 'lobby') return;
    currentPhase = 'transitioning';
    newGame();
    runPartyLobbyToGameTransition();
};

const runPartyLobbyToGameTransition = async () => {
    const lobbyPage = document.querySelector('.page.lobby');
    if (!lobbyPage || !gamePage) { currentPhase = 'game'; return; }

    gamePage.querySelector('.game-container')?.style.removeProperty('display');
    gamePage.querySelector('.controls-bar')?.style.removeProperty('display');
    gamePage.querySelector('.rack-container')?.style.removeProperty('display');

    await window.runPageTransition(lobbyPage, gamePage, true);

    lobbyPage.remove();
    gamePage.style.zIndex = '';
    gamePage.style.transition = '';
    gamePage.style.transform = '';
    gamePage = null;
    currentPhase = 'game';
    sendPartyBoardStateNow();
    if (lastLobbyState?.started) renderHeaderPlayerDiamondsFn?.(lastLobbyState);
};

const setPhase = phase => {
    currentPhase = phase;
    if (gamePage) return;
    const gameContainer = document.querySelector('.game-container');
    const controls = document.querySelector('.controls-bar');
    const rackContainer = document.querySelector('.rack-container');
    if (lobbyEl) lobbyEl.style.display = phase === 'lobby' ? '' : 'none';
    if (gameContainer) gameContainer.style.display = phase === 'game' ? '' : 'none';
    if (controls) controls.style.display = phase === 'game' ? '' : 'none';
    if (rackContainer) rackContainer.style.display = phase === 'game' ? '' : 'none';
};

const placeTile = (id, x, y) => {
    const el = $(id);
    if (!el) return;
    state.grid.set(`${x},${y}`, id);
    state.hand.delete(id);
    positionTileOnGrid(el, x, y, gridEl);
    runValidation();
    saveState();
    schedulePartyBoardSync();
};

const removeTile = (id, x, y, toRack = true) => {
    const el = $(id);
    if (!el) return;
    state.grid.delete(`${x},${y}`);
    if (toRack) { state.hand.add(id); returnTileToRack(el, rackEl); }
    runValidation();
    saveState();
    schedulePartyBoardSync();
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
    schedulePartyBoardSync();
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
    if (partyConnection?.ready) partyConnection.completeBoard();
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
    schedulePartyBoardSync();
};

const returnAllToHand = () => {
    const placedIds = [...state.grid.values()];
    handleTilesReturn(placedIds);
    schedulePartyBoardSync();
};

let particleBurstInitialized = false;

const loadSettings = () => {
    const diff = sessionStorage.getItem('rummigrams_difficulty');
    const grid = sessionStorage.getItem('rummigrams_gridSize');
    if (diff) state.level.difficulty = parseInt(diff, 10);
    if (grid) state.level.gridSize = parseInt(grid, 10);
    if (isMultiplayer()) {
        state.level.gridSize = 4;
        state.level.difficulty = 10;
    }
};

const newGame = () => {
    loadSettings();
    state.grid.clear(); state.tiles.clear(); state.hand.clear();
    state.validation = null; state.isVictory = false;

    let hand;
    const pre = window.__pregenerated;
    const preSettings = window.__pregeneratedSettings;
    if (pre && preSettings &&
        preSettings.difficulty === (state.level.difficulty || 5) &&
        preSettings.gridSize === state.level.gridSize) {
        hand = pre.hand;
        delete window.__pregenerated;
        delete window.__pregeneratedSettings;
    } else {
        delete window.__pregenerated;
        delete window.__pregeneratedSettings;
        hand = generateLevel(state.level).hand;
    }
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

    renderRack(rackEl, state.tiles, state.hand);

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
    clearTimeout(partyBoardSyncTimer);
    partyBoardSyncTimer = null;
    renderHeaderPlayerDiamondsFn = null;
    lastLobbyState = null;
    if (gamePage?.parentNode) { gamePage.remove(); gamePage = null; }
    if (partyConnection?.close) {
        partyConnection.close();
        partyConnection = null;
    }
    cleanupFns.forEach(fn => fn && fn());
    cleanupFns = [];
    particleBurstInitialized = false;
    window.__disposeGame = null;
};

const initGame = () => {
    disposeGame();
    window.__disposeGame = disposeGame;

    gridEl = $('game-grid');
    rackEl = $('tile-rack');
    themeBtn = $('btn-theme');
    lobbyEl = $('lobby');
    nameInput = $('lobby-name');
    playerListEl = $('lobby-players');
    startBtn = $('lobby-start');
    lobbyWaitEl = $('lobby-wait');
    lobbyHueTrack = $('lobby-hue-track');
    lobbyHueSliderWrap = $('lobby-hue-slider-wrap');

    if (!isMultiplayer() && lobbyEl) lobbyEl.style.display = 'none';

    initTheme();
    const cleanupInteractions = initInteractions({ gridEl, rackEl, onTilePlaced: placeTile, onTileReturned: removeTile, getTileAt, swapTiles, createCellParticleBurst });
    if (cleanupInteractions) cleanupFns.push(cleanupInteractions);

    initToolbar({ state, rackEl, onScatter: scatterToBoard, onReturnAll: returnAllToHand });

    const selection = initSelection({ gridEl, rackEl, state, onTilesReturn: handleTilesReturn, onValidate: runValidation });
    if (selection && selection.dispose) cleanupFns.push(selection.dispose);

    const cleanupTheme = fixScaleClick(themeBtn, toggleTheme);
    if (cleanupTheme) cleanupFns.push(cleanupTheme);

    const openDialog = () => document.querySelector('.info-dialog-overlay')?.classList.add('open');
    const closeDialog = () => document.querySelector('.info-dialog-overlay.open')?.classList.remove('open');
    let closePlayerBoardDialog = () => {};

    const appContainer = document.querySelector('.app');
    const btnInfo = appContainer?.querySelector('#btn-info');

    const cleanupInfo = fixScaleClick(btnInfo, openDialog);
    if (cleanupInfo) cleanupFns.push(cleanupInfo);

    const onDocClick = (e) => {
        if (e.target.closest?.('.info-dialog-close')?.closest?.('.info-dialog-overlay')) {
            closeDialog();
            return;
        }
        if (e.target.classList?.contains('info-dialog-overlay')) {
            closeDialog();
            return;
        }
        if (e.target.closest?.('#player-board-dialog-close') || e.target.id === 'player-board-dialog-close') {
            closePlayerBoardDialog();
            return;
        }
        if (e.target.classList?.contains('player-board-dialog-overlay')) {
            closePlayerBoardDialog();
        }
    };
    document.addEventListener('click', onDocClick);
    cleanupFns.push(() => document.removeEventListener('click', onDocClick));

    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
        document.body.classList.add('is-remodeling');
        requestAnimationFrame(() => repositionPlacedTiles(gridEl));
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => document.body.classList.remove('is-remodeling'), 100);
    });
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

    cleanupFns.push(cleanupParticleBurstSystem);

    const setUserColorVar = () => document.documentElement.style.setProperty('--user-color', selectedLobbyColor);
    setUserColorVar();

    const forceNewGame = sessionStorage.getItem('rummigrams_new_game') === 'true';
    sessionStorage.removeItem('rummigrams_new_game');

    if (isMultiplayer()) {
        const app = document.getElementById('app');
        const lobbyPage = app?.closest('.page');
        const pageSlide = lobbyPage?.querySelector(':scope > .page-slide');
        const header = app?.querySelector(':scope > .header');
        const boardArea = app?.querySelector(':scope > .board-area');

        if (lobbyPage && pageSlide && app && header && boardArea && lobbyEl) {
            boardArea.removeChild(lobbyEl);

            const lobbyApp = document.createElement('div');
            lobbyApp.className = 'app';
            const headerClone = header.cloneNode(true);
            headerClone.querySelectorAll('[id]').forEach(el => { el.id = ''; });
            const lobbyHomeBtn = headerClone.querySelector('[aria-label="Home"]');
            if (lobbyHomeBtn) lobbyHomeBtn.addEventListener('click', () => window.Router?.('home.html'));
            const cloneThemeBtn = headerClone.querySelector('[aria-label="Toggle theme"]');
            if (cloneThemeBtn) fixScaleClick(cloneThemeBtn, toggleTheme);
            const cloneInfoBtn = headerClone.querySelector('[aria-label="Game info"]');
            if (cloneInfoBtn) fixScaleClick(cloneInfoBtn, openDialog);

            const lobbyMain = document.createElement('main');
            lobbyMain.className = 'lobby-main';
            while (lobbyEl.firstChild) lobbyMain.appendChild(lobbyEl.firstChild);

            lobbyApp.append(headerClone, lobbyMain);
            pageSlide.appendChild(lobbyApp);

            gamePage = document.createElement('div');
            gamePage.className = 'page game';
            const gameSlide = document.createElement('div');
            gameSlide.className = 'page-slide';
            gameSlide.appendChild(app);
            gamePage.appendChild(gameSlide);

            const infoOverlay = lobbyPage.querySelector(':scope > .info-dialog-overlay');
            if (infoOverlay) {
                const overlayClone = infoOverlay.cloneNode(true);
                gamePage.appendChild(overlayClone);
                const gameCloseBtn = overlayClone.querySelector('.info-dialog-close');
                if (gameCloseBtn) gameCloseBtn.addEventListener('click', closeDialog);
                overlayClone.addEventListener('click', e => { if (e.target === overlayClone) closeDialog(); });
            }
            gamePage.style.zIndex = '20';
            gamePage.style.transition = 'none';
            gamePage.style.transform = 'translateY(100%)';

            window.__onRouteSettled = (window.__onRouteSettled || []);
            window.__onRouteSettled.push(() => {
                if (gamePage) document.body.appendChild(gamePage);
            });
        }

        currentPhase = 'lobby';
        myServerId = null;
        const roomId = getPartyRoomId();
        const savedHue = localStorage.getItem('rummigrams_lobby_hue');
        if (nameInput) nameInput.value = (localStorage.getItem('rummigrams_name') || '').trim().slice(0, MAX_PLAYER_NAME_LEN);
        const hue = savedHue !== null && savedHue !== '' ? Math.max(0, Math.min(360, parseInt(savedHue, 10))) : 24;
        selectedLobbyHue = Number.isNaN(hue) ? 24 : hue;
        selectedLobbyColor = hslToHex(selectedLobbyHue, LOBBY_COLOR_SAT, LOBBY_COLOR_LIGHT);
        setUserColorVar();
        if (lobbyHueSliderWrap) lobbyHueSliderWrap.style.setProperty('--hue-pct', String((selectedLobbyHue / 360) * 100));
        if (lobbyHueTrack) lobbyHueTrack.setAttribute('aria-valuenow', String(selectedLobbyHue));
        let creatorShownOptimistic = false;
        if (playerListEl) {
            const justCreated = roomId && sessionStorage.getItem('rummigrams_created_room') === roomId;
            if (justCreated) {
                sessionStorage.removeItem('rummigrams_created_room');
                creatorShownOptimistic = true;
                const name = getLobbyName();
                const displayName = name || 'Player One';
                const esc = (s) => String(s).replace(/[<&"']/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
                playerListEl.innerHTML = `<li class="lobby-player lobby-player--self"><span class="lobby-swatch"></span><span class="lobby-name">${esc(displayName)}</span><span class="lobby-tags">host · you</span></li>`;
            } else {
                playerListEl.innerHTML = '';
                playerListEl.setAttribute('aria-busy', 'true');
                appendLobbyGhostSlots(4);
            }
        }
        const shareUrlEl = $('lobby-share-url');
        const shareWrap = $('lobby-share-wrap');
        if (shareUrlEl && shareWrap && roomId) {
            const url = createShareUrl(roomId);
            shareUrlEl.textContent = url;
            const copyBtn = $('lobby-share-copy');
            if (copyBtn) copyBtn.addEventListener('click', () => {
                navigator.clipboard?.writeText(url);
            });
        } else if (shareWrap) shareWrap.style.display = 'none';
        const updateLocalSelf = (updater) => {
            if (!lastLobbyState || !myServerId) return;
            const players = lastLobbyState.players;
            if (!players || !players[myServerId]) return;
            updater(players[myServerId]);
        };
        const updateHueUi = () => {
            setUserColorVar();
            if (lobbyHueSliderWrap) lobbyHueSliderWrap.style.setProperty('--hue-pct', String((selectedLobbyHue / 360) * 100));
            if (lobbyHueTrack) lobbyHueTrack.setAttribute('aria-valuenow', String(selectedLobbyHue));
        };
        const setHueFromX = (clientX) => {
            if (!lobbyHueTrack) return;
            const rect = lobbyHueTrack.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            selectedLobbyHue = Math.round(pct * 360);
            selectedLobbyColor = hslToHex(selectedLobbyHue, LOBBY_COLOR_SAT, LOBBY_COLOR_LIGHT);
            localStorage.setItem('rummigrams_lobby_hue', String(selectedLobbyHue));
            localStorage.setItem('rummigrams_color', selectedLobbyColor);
            updateHueUi();
            if (partyConnection?.ready) {
                const name = getLobbyName();
                localStorage.setItem('rummigrams_name', name);
                partyConnection.join(name, selectedLobbyColor);
            }
            if (lastLobbyState) {
                updateLocalSelf(p => {
                    p.color = selectedLobbyColor;
                    p.name = getLobbyName() || null;
                });
                renderLobby(lastLobbyState);
            }
        };
        updateHueUi();
        if (lobbyHueTrack) {
            const onPointer = (e) => setHueFromX(e.clientX);
            const onUp = () => {
                document.removeEventListener('pointermove', onPointer);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
            };
            lobbyHueTrack.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                setHueFromX(e.clientX);
                document.addEventListener('pointermove', onPointer);
                document.addEventListener('pointerup', onUp);
                document.addEventListener('pointercancel', onUp);
            });
            lobbyHueTrack.addEventListener('keydown', (e) => {
                const step = e.shiftKey ? 15 : 5;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedLobbyHue = Math.max(0, selectedLobbyHue - step);
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedLobbyHue = Math.min(360, selectedLobbyHue + step);
                } else return;
                selectedLobbyColor = hslToHex(selectedLobbyHue, LOBBY_COLOR_SAT, LOBBY_COLOR_LIGHT);
                localStorage.setItem('rummigrams_lobby_hue', String(selectedLobbyHue));
                localStorage.setItem('rummigrams_color', selectedLobbyColor);
                updateHueUi();
                if (partyConnection?.ready) {
                    const name = getLobbyName();
                    partyConnection.join(name, selectedLobbyColor);
                }
                if (lastLobbyState) {
                    updateLocalSelf(p => {
                        p.color = selectedLobbyColor;
                        p.name = getLobbyName() || null;
                    });
                    renderLobby(lastLobbyState);
                }
            });
        }


        const playerOrderLabel = (joinOrder, players, id) => {
            const order = (joinOrder && joinOrder.length > 0) ? joinOrder : Object.keys(players || {}).sort();
            const idx = order.indexOf(id);
            const n = idx >= 0 ? idx + 1 : 1;
            if (n === 1) return 'One';
            if (n === 2) return 'Two';
            if (n === 3) return 'Three';
            return String(n);
        };

        const formatTileValue = v => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[v] ?? String(v));

        const muteForDiamond = hex => {
            if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'hsl(270 28% 48%)';
            const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
            if (max === min) return `hsl(270 28% ${Math.round(48 + l * 14)}%)`;
            const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h = Math.round(h * 60) % 360;
            const sat = Math.round(Math.min(s * 100 * 1.4, 42));
            const lit = Math.round(44 + l * 16);
            return `hsl(${h} ${sat}% ${lit}%)`;
        };

        const renderHeaderPlayerDiamonds = serverState => {
            const headerPlayers = document.getElementById('app')?.querySelector('#header-players');
            if (!headerPlayers || currentPhase !== 'game' || !serverState.started) {
                if (headerPlayers) headerPlayers.innerHTML = '';
                return;
            }
            const players = serverState.players || {};
            const order = serverState.joinOrder || Object.keys(players).sort();
            headerPlayers.innerHTML = '';
            headerPlayers.removeAttribute('aria-hidden');
            order.forEach((id, i) => {
                const p = players[id];
                if (!p) return;
                const raw = /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : '#64748b';
                const color = muteForDiamond(raw);
                const name = (p.name && String(p.name).trim()) || '';
                const initial = name ? name[0].toUpperCase() : String(i + 1);
                const label = name || `Player ${['One', 'Two', 'Three'][i] ?? i + 1}`;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'header-player-diamond';
                btn.style.setProperty('--diamond-color', color);
                btn.setAttribute('aria-label', `${label} board`);
                btn.dataset.playerId = id;
                btn.innerHTML = `<span>${initial}</span>`;
                btn.addEventListener('click', () => openPlayerBoardDialog(id));
                headerPlayers.appendChild(btn);
            });
        };
        renderHeaderPlayerDiamondsFn = renderHeaderPlayerDiamonds;

        const openPlayerBoardDialog = playerId => {
            const overlay = document.getElementById('player-board-dialog-overlay');
            const titleEl = document.getElementById('player-board-dialog-title');
            const contentEl = document.getElementById('player-board-dialog-content');
            if (!overlay || !titleEl || !contentEl) return;
            const players = lastLobbyState?.players || {};
            const boards = lastLobbyState?.boards || {};
            const order = lastLobbyState?.joinOrder || Object.keys(players).sort();
            const p = players[playerId];
            const name = (p?.name && String(p.name).trim()) || '';
            const i = order.indexOf(playerId);
            const label = name || `Player ${['One', 'Two', 'Three'][i] ?? (i >= 0 ? i + 1 : 1)}`;
            titleEl.textContent = label;
            const board = boards[playerId];
            if (!board || !board.gridSize) {
                contentEl.innerHTML = '<p class="player-board-mini-label">No board data yet</p>';
            } else {
                const tilesMap = new Map(board.tiles || []);
                const gridMap = new Map(board.grid || []);
                const hand = board.hand || [];
                const size = board.gridSize;
                let html = '<div class="player-board-mini-label">Board</div>';
                html += `<div class="player-board-mini-grid" style="grid-template-columns: repeat(${size}, 1.5rem); grid-template-rows: repeat(${size}, 1.5rem);">`;
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const pos = `${x},${y}`;
                        const tileId = gridMap.get(pos);
                        const val = tileId != null ? tilesMap.get(tileId) : null;
                        html += `<div class="player-board-mini-cell">${val != null ? `<span class="player-board-mini-tile">${formatTileValue(val)}</span>` : ''}</div>`;
                    }
                }
                html += '</div>';
                html += '<div class="player-board-mini-label">Hand</div>';
                html += '<div class="player-board-mini-rack">';
                hand.forEach(id => {
                    const v = tilesMap.get(id);
                    if (v != null) html += `<span class="player-board-mini-tile">${formatTileValue(v)}</span>`;
                });
                html += '</div>';
                contentEl.innerHTML = html;
            }
            overlay.dataset.viewingPlayerId = playerId;
            overlay.classList.add('open');
        };

        closePlayerBoardDialog = () => {
            const overlay = document.getElementById('player-board-dialog-overlay');
            if (overlay) {
                delete overlay.dataset.viewingPlayerId;
                overlay.classList.remove('open');
            }
        };

        const renderLobby = serverState => {
            lastLobbyState = serverState;
            const players = serverState.players || {};
            const joinOrder = serverState.joinOrder || [];
            const hostId = serverState.hostId || null;
            if (myServerId) isHost = hostId === myServerId;
            if (playerListEl) {
                playerListEl.removeAttribute('aria-busy');
                playerListEl.innerHTML = '';
                Object.entries(players).forEach(([id, p]) => {
                    const li = document.createElement('li');
                    li.className = id === myServerId ? 'lobby-player lobby-player--self' : 'lobby-player';
                    const raw = id === myServerId ? selectedLobbyColor : (p.color || '#64748b');
                    const color = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '#64748b';
                    const serverName = (p.name && String(p.name).trim()) || '';
                    const localName = getLobbyName();
                    const orderLabel = playerOrderLabel(joinOrder, players, id);
                    const displayName = id === myServerId
                        ? (localName || serverName || `Player ${orderLabel}`)
                        : (serverName || `Player ${orderLabel}`);
                    const name = String(displayName).replace(/[<&"']/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
                    const tags = [];
                    if (id === hostId) tags.push('host');
                    if (id === myServerId) tags.push('you');
                    const swatchStyle = id === myServerId ? '' : ` style="background:${color}"`;
                    li.innerHTML = `<span class="lobby-swatch"${swatchStyle}></span><span class="lobby-name">${name}</span>${tags.length ? `<span class="lobby-tags">${tags.join(' · ')}</span>` : ''}`;
                    playerListEl.appendChild(li);
                });
            }
            if (startBtn) {
                const disabled = !isHost || !Object.keys(players).length || !!serverState.started;
                startBtn.disabled = disabled;
                startBtn.setAttribute('aria-disabled', String(disabled));
                startBtn.style.display = isHost ? '' : 'none';
            }
            if (lobbyWaitEl) lobbyWaitEl.style.display = isHost ? 'none' : '';
            if (serverState.started) startPartyGame();
        };

        window.__lobbyRouteSettled = false;
        window.__pendingLobbyState = null;
        partyConnection = createPartyConnection((serverState, myId) => {
            if (myId && !myServerId) myServerId = myId;
            if (!myServerId && serverState.players && Object.keys(serverState.players).length === 1)
                myServerId = Object.keys(serverState.players)[0];
            lastLobbyState = serverState;
            if (currentPhase === 'game') {
                if (serverState.started) renderHeaderPlayerDiamonds(serverState);
                const openOverlay = document.getElementById('player-board-dialog-overlay');
                if (openOverlay?.classList.contains('open')) {
                    const openId = openOverlay.dataset.viewingPlayerId;
                    if (openId) openPlayerBoardDialog(openId);
                }
                return;
            }
            if (creatorShownOptimistic && serverState.players) {
                const ids = Object.keys(serverState.players);
                const only = ids.length === 1 && serverState.players[ids[0]];
                if (ids.length === 1 && only && only.name == null && only.color == null) {
                    if (serverState.started) startPartyGame();
                    return;
                }
                creatorShownOptimistic = false;
            }
            if (!window.__lobbyRouteSettled) {
                window.__pendingLobbyState = serverState;
                return;
            }
            renderLobby(serverState);
        });
        window.__onRouteSettled = (window.__onRouteSettled || []);
        window.__onRouteSettled.push(() => {
            window.__lobbyRouteSettled = true;
            if (window.__pendingLobbyState) {
                renderLobby(window.__pendingLobbyState);
                window.__pendingLobbyState = null;
            }
            if (!hasAutoFocusedLobbyName && nameInput) {
                hasAutoFocusedLobbyName = true;
                nameInput.focus();
            }
        });

        if (partyConnection) {
            const sendJoin = () => {
                const name = getLobbyName();
                localStorage.setItem('rummigrams_name', name);
                partyConnection.join(name, selectedLobbyColor);
                if (lastLobbyState) {
                    updateLocalSelf(p => {
                        p.color = selectedLobbyColor;
                        p.name = getLobbyName() || null;
                    });
                    renderLobby(lastLobbyState);
                }
            };
            partyConnection.waitReady().then(sendJoin);
            if (nameInput) {
                nameInput.addEventListener('change', () => { if (partyConnection?.ready) sendJoin(); });
                nameInput.addEventListener('input', () => { if (partyConnection?.ready) sendJoin(); });
            }
            const randomizeBtn = $('lobby-randomize-name');
            if (randomizeBtn) randomizeBtn.addEventListener('click', () => {
                randomizeLobbyName();
                if (partyConnection?.ready) sendJoin();
            });
            if (startBtn) startBtn.addEventListener('click', () => {
                if (partyConnection?.ready && isHost) {
                    partyConnection.startGame();
                    startPartyGame();
                }
            });
        }
    } else if (!forceNewGame && loadSavedGame()) {
        setPhase('game');
    } else {
        setPhase('game');
        newGame();
    }
};

export { initGame, disposeGame, randomizeLobbyName };
