import { toggleTheme, initTheme } from './theme.js';
import { hasContinuableGame } from './storage.js';
import { generateLevel } from './generator.js';

const readSettings = () => ({
    difficulty: parseInt(sessionStorage.getItem('rummigrams_difficulty') || '5', 10),
    gridSize: parseInt(sessionStorage.getItem('rummigrams_gridSize') || '6', 10)
});

const pregenerate = () => {
    const settings = readSettings();
    window.__pregenerated = generateLevel(settings);
    window.__pregeneratedSettings = settings;
};

const $ = id => document.getElementById(id);


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
};

export const initHome = () => {
    initTheme();
    initParallaxTiles();
    const btnTheme = $('home-btn-theme');
    const btnCreate = $('home-btn-create');
    const btnStart = $('home-btn-start');
    const btnContinue = $('home-btn-continue');

    if (hasContinuableGame() && btnContinue) {
        btnContinue.style.display = '';
    }

    fixScaleClick(btnTheme, (e) => {
        e.stopPropagation();
        toggleTheme();
    });

    const homeContainer = document.querySelector('.home-container');
    const page = homeContainer?.closest('.page');
    const btnInfo = $('home-btn-info');
    const overlay = page?.querySelector('.info-dialog-overlay');
    const closeBtn = page?.querySelector('.info-dialog-close');

    const openDialog = () => overlay?.classList.add('open');
    const closeDialog = () => overlay?.classList.remove('open');

    fixScaleClick(btnInfo, openDialog);
    fixScaleClick(closeBtn, closeDialog);
    if (overlay) overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };

    if (btnStart) {
        btnStart.onclick = () => {
            sessionStorage.setItem('rummigrams_new_game', 'true');
            const settings = readSettings();
            if (!window.__pregenerated ||
                window.__pregeneratedSettings?.difficulty !== settings.difficulty ||
                window.__pregeneratedSettings?.gridSize !== settings.gridSize) {
                pregenerate();
            }
            if (window.Router) window.Router('game.html');
        };
    }

    if (btnContinue) {
        btnContinue.onclick = () => {
            sessionStorage.removeItem('rummigrams_new_game');
            if (window.Router) {
                window.Router('game.html');
            }
        };
    }

    if (btnCreate) {
        btnCreate.onclick = () => {
            const roomId = Math.random().toString(36).slice(2, 10);
            window.__pendingRoom = roomId;
            sessionStorage.setItem('rummigrams_new_game', 'true');
            sessionStorage.setItem('rummigrams_created_room', roomId);
            if (window.Router) window.Router('game.html');
        };
    }


    const SLIDER_CONFIG = {
        difficulty: {
            notches: [1, 2, 3, 4, 5],
            labels: ['Zen', 'Easy', 'Normal', 'Hard', 'Expert'],
            values: [1, 3, 5, 7, 10],
            storageKey: 'rummigrams_difficulty'
        },
        gridSize: {
            notches: [4, 5, 6, 7, 8],
            labels: ['4×4', '5×5', '6×6', '7×7', '8×8'],
            values: [4, 5, 6, 7, 8],
            storageKey: 'rummigrams_gridSize'
        }
    };

    const initSlider = (slider, config, displayEl) => {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);


        const track = slider.parentElement.querySelector('.slider-track');
        if (track) {
            let notchContainer = slider.parentElement.querySelector('.slider-notches');
            if (!notchContainer) {
                notchContainer = document.createElement('div');
                notchContainer.className = 'slider-notches';
                track.appendChild(notchContainer);
            }
            notchContainer.innerHTML = '';
            config.notches.forEach(val => {
                const pct = ((val - min) / (max - min)) * 100;
                const notch = document.createElement('div');
                notch.className = 'slider-notch';
                notch.style.left = `${pct}%`;
                notchContainer.appendChild(notch);
            });
        }

        const snapToNotch = val => {
            let closest = config.notches[0];
            let minDist = Infinity;
            for (const notch of config.notches) {
                const dist = Math.abs(val - notch);
                if (dist < minDist) { minDist = dist; closest = notch; }
            }
            return closest;
        };

        const updateVisuals = (val, snappedVal) => {
            const percentage = ((val - min) / (max - min)) * 100;
            slider.parentElement.style.setProperty('--value', `${percentage}%`);

            const idx = config.notches.indexOf(snappedVal);
            if (displayEl && idx >= 0) displayEl.textContent = config.labels[idx];
        };

        const onInput = () => {
            const val = parseFloat(slider.value);
            const snapped = snapToNotch(val);
            updateVisuals(val, snapped);
        };

        const onChange = (save = true) => {
            const val = parseFloat(slider.value);
            const snapped = snapToNotch(val);
            slider.value = snapped;
            updateVisuals(snapped, snapped);

            if (save) {
                const idx = config.notches.indexOf(snapped);
                const storeVal = config.values ? config.values[idx] : snapped;
                sessionStorage.setItem(config.storageKey, storeVal);
            }
        };

        slider.addEventListener('input', onInput);
        slider.addEventListener('change', () => onChange(true));


        const saved = sessionStorage.getItem(config.storageKey);
        if (saved !== null) {
            const savedNum = parseFloat(saved);
            const idx = config.values ? config.values.indexOf(savedNum) : config.notches.indexOf(savedNum);
            if (idx >= 0) {
                slider.value = config.notches[idx];
                onChange(false);
            } else {
                onChange(true);
            }
        } else {
            onChange(true);
        }
    };

    const diffSlider = document.querySelector('.compact-setting:nth-child(1) input[type="range"]');
    const diffDisplay = document.querySelector('.compact-setting:nth-child(1) .setting-value-display');
    if (diffSlider) initSlider(diffSlider, SLIDER_CONFIG.difficulty, diffDisplay);

    const gridSlider = document.querySelector('.compact-setting:nth-child(2) input[type="range"]');
    const gridDisplay = document.querySelector('.compact-setting:nth-child(2) .setting-value-display');
    if (gridSlider) initSlider(gridSlider, SLIDER_CONFIG.gridSize, gridDisplay);
};

const initParallaxTiles = () => {
    const scene = document.getElementById('parallax-scene');
    if (!scene) return;

    const CHARS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];


    const ANCHORS = [
        { id: 'top-left', base: { x: 0.18, y: 0.10 }, pShift: { x: -0.14, y: 0.02 } },
        { id: 'top-right', base: { x: 0.82, y: 0.10 }, pShift: { x: 0.14, y: 0.02 } },
        { id: 'mid-left', base: { x: 0.15, y: 0.40 }, pShift: { x: -0.12, y: 0 } },
        { id: 'mid-right', base: { x: 0.85, y: 0.40 }, pShift: { x: 0.12, y: 0 } },
        { id: 'lower-left', base: { x: 0.14, y: 0.65 }, pShift: { x: -0.11, y: 0 } },
        { id: 'lower-right', base: { x: 0.86, y: 0.65 }, pShift: { x: 0.11, y: 0 } },
        { id: 'bottom-left', base: { x: 0.20, y: 0.88 }, pShift: { x: -0.16, y: 0 } },
        { id: 'bottom-right', base: { x: 0.80, y: 0.88 }, pShift: { x: 0.16, y: 0 } },
    ];

    const tiles = [];
    const usedChars = new Set();

    const pickChar = () => {
        if (usedChars.size >= CHARS.length) usedChars.clear();
        let char;
        do { char = CHARS[Math.floor(Math.random() * CHARS.length)]; } while (usedChars.has(char));
        usedChars.add(char);
        return char;
    };

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const calcPosition = (anchor) => {
        const aspect = window.innerWidth / window.innerHeight;
        const isPortrait = aspect < 0.9;
        const portraitFactor = isPortrait ? clamp((0.9 - aspect) / 0.4, 0, 1) : 0;

        return {
            x: clamp(anchor.base.x + anchor.pShift.x * portraitFactor, 0.05, 0.95),
            y: clamp(anchor.base.y + anchor.pShift.y * portraitFactor, 0.05, 0.95)
        };
    };

    ANCHORS.forEach((anchor, i) => {
        const depth = 0.3 + (i % 3) * 0.25 + Math.random() * 0.15;
        const size = 28 + depth * 36;
        const char = pickChar();
        const pos = calcPosition(anchor);

        const el = document.createElement('div');
        el.className = 'parallax-tile';
        el.textContent = char;
        el.style.cssText = `
            left: ${pos.x * 100}%;
            top: ${pos.y * 100}%;
            width: ${size}px;
            height: ${size}px;
            font-size: ${size * 0.5}px;
            opacity: ${0.25 + depth * 0.35};
            --base-z: ${depth * 60}px;
            transition: left 0.3s ease-out, top 0.3s ease-out;
        `;
        scene.appendChild(el);
        tiles.push({ el, anchor, depth });
    });

    const repositionTiles = () => {
        tiles.forEach(({ el, anchor }) => {
            const pos = calcPosition(anchor);
            el.style.left = `${pos.x * 100}%`;
            el.style.top = `${pos.y * 100}%`;
        });
    };

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(repositionTiles, 50);
    });

    let mouseX = 0.5, mouseY = 0.5;
    let curX = 0.5, curY = 0.5;

    const update = () => {
        curX += (mouseX - curX) * 0.06;
        curY += (mouseY - curY) * 0.06;

        const normX = curX - 0.5;
        const normY = curY - 0.5;

        scene.style.transform = `
            rotateY(${normX * 8}deg)
            rotateX(${-normY * 6}deg)
        `;

        tiles.forEach(({ el, depth }) => {
            const invDepth = 1 - depth;
            const parallaxX = -normX * invDepth * 50;
            const parallaxY = -normY * invDepth * 40;
            const tileRotY = normX * depth * 12;
            const tileRotX = -normY * depth * 10;

            el.style.transform = `
                translateZ(var(--base-z))
                translate(${parallaxX}px, ${parallaxY}px)
                rotateY(${tileRotY}deg)
                rotateX(${tileRotX}deg)
            `;
        });

        requestAnimationFrame(update);
    };

    scene.parentElement.addEventListener('mousemove', e => {
        const rect = scene.parentElement.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) / rect.width;
        mouseY = (e.clientY - rect.top) / rect.height;
    });

    scene.parentElement.addEventListener('mouseleave', () => {
        mouseX = 0.5;
        mouseY = 0.5;
    });

    requestAnimationFrame(update);
};
