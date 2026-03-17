import { particleBurstSystem } from './particleburst.js';

const createElement = (tag, className, attrs = {}) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
};

export const renderGridCells = (gridEl, cols, rows) => {
    gridEl.innerHTML = '';
    gridEl.style.setProperty('--grid-cols', cols);
    gridEl.style.setProperty('--grid-rows', rows);
    document.querySelector('.app')?.style.setProperty('--grid-rows', rows);

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cell = createElement('div', 'grid-cell');
            cell.dataset.x = `${x}`;
            cell.dataset.y = `${y}`;
            gridEl.appendChild(cell);
        }
    }
};

const formatValue = v => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[v] || v);

export const createTileElement = (id, value) => {
    const display = formatValue(value);
    const tile = createElement('div', 'tile tile--in-rack tile--entering', {
        id, role: 'listitem', tabindex: '0', 'aria-label': `Tile ${display}`
    });
    tile.dataset.value = value;

    const num = createElement('span', 'tile__number');
    num.textContent = display;
    tile.appendChild(num);

    tile.addEventListener('animationend', () => tile.classList.remove('tile--entering'), { once: true });
    return tile;
};

export const renderRack = (rackEl, tiles, handTileIds) => {
    rackEl.querySelectorAll('.tile').forEach(el => !handTileIds.has(el.id) && el.remove());
    handTileIds.forEach(id => {
        if (!rackEl.querySelector(`#${id}`)) rackEl.appendChild(createTileElement(id, tiles.get(id)));
    });
};

export const positionTileOnGrid = (tileEl, x, y, gridEl) => {
    const cell = gridEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (!cell) return;

    tileEl.classList.remove('tile--in-rack');
    tileEl.classList.add('tile--placed', 'tile--snapping');
    Object.assign(tileEl.dataset, { gridX: x, gridY: y });

    gridEl.appendChild(tileEl);
    Object.assign(tileEl.style, {
        position: 'absolute',
        left: `${cell.offsetLeft}px`,
        top: `${cell.offsetTop}px`
    });

    tileEl.addEventListener('animationend', () => tileEl.classList.remove('tile--snapping'), { once: true });
};

export const returnTileToRack = (tileEl, rackEl) => {
    tileEl.classList.remove('tile--placed', 'tile--valid', 'tile--block-error', 'tile--impossible');
    tileEl.classList.add('tile--in-rack');
    delete tileEl.dataset.gridX;
    delete tileEl.dataset.gridY;
    rackEl.appendChild(tileEl);
    Object.assign(tileEl.style, { position: '', left: '', top: '' });
};

export const updateTileStates = (gridEl, validPositions, blockPositions, impossiblePositions = new Set()) => {
    gridEl.querySelectorAll('.tile--placed').forEach(tile => {
        const pos = `${tile.dataset.gridX},${tile.dataset.gridY}`;
        tile.classList.remove('tile--valid', 'tile--block-error', 'tile--impossible');
        if (blockPositions.has(pos)) tile.classList.add('tile--block-error');
        else if (impossiblePositions.has(pos)) tile.classList.add('tile--impossible');
        else if (validPositions.has(pos)) tile.classList.add('tile--valid');
    });
};

export const initParticleBurstSystem = gridEl => particleBurstSystem.attach(gridEl);
export const cleanupParticleBurstSystem = () => particleBurstSystem.destroy();

export const createCellParticleBurst = cell => {
    const grid = cell.closest('.game-grid');
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const x = cellRect.left - gridRect.left + cellRect.width / 2;
    const y = cellRect.top - gridRect.top + cellRect.height / 2;
    particleBurstSystem.emit(x, y);
};
export const triggerVictory = (gridEl, origin = null) => {
    const tiles = [...gridEl.querySelectorAll('.tile--placed')];
    if (!tiles.length) return;

    const ox = origin?.x ?? null;
    const oy = origin?.y ?? null;

    const dists = tiles.map(t => {
        const tx = +t.dataset.gridX, ty = +t.dataset.gridY;
        return (ox !== null && oy !== null)
            ? Math.hypot(tx - ox, ty - oy)
            : Math.hypot(tx - ((Math.min(...tiles.map(u => +u.dataset.gridX)) + Math.max(...tiles.map(u => +u.dataset.gridX))) / 2),
                         ty - ((Math.min(...tiles.map(u => +u.dataset.gridY)) + Math.max(...tiles.map(u => +u.dataset.gridY))) / 2));
    });
    const maxDist = Math.max(...dists) || 1;

    tiles.forEach((tile, i) => {
        const delay = Math.round((dists[i] / maxDist) * 200);
        tile.style.animationDelay = `${delay}ms`;
        tile.style.transitionDelay = `${delay}ms`;
        tile.classList.add('tile--victory');
    });
};

const pulsePlayerDiamond = (playerId, cls, durationMs) => {
    const btn = document.querySelector(`.header-player[data-player-id="${playerId}"]`);
    if (!btn) return;
    btn.classList.remove('header-player--advance-pulse', 'header-player--winner-pulse');
    void btn.offsetWidth;
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), durationMs);
};

export const triggerAdvancePulse = playerId => pulsePlayerDiamond(playerId, 'header-player--advance-pulse', 800);
export const triggerWinnerPulse = playerId => pulsePlayerDiamond(playerId, 'header-player--winner-pulse', 1400);

export const hideAuroraBackground = () => {
    const canvas = document.getElementById('aurora-canvas');
    if (canvas) canvas.remove();
};

export const startAuroraBackground = () => {
    const container = document.querySelector('.board-area');
    if (!container) return false;
    let canvas = document.getElementById('aurora-canvas');
    if (canvas?.isConnected) return true;
    if (canvas) canvas.remove();
    canvas = document.createElement('canvas');
    canvas.id = 'aurora-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    container.insertBefore(canvas, container.firstChild);
    const ctx = canvas.getContext('2d');
    const start = performance.now();

    let bands = null;
    const initBands = (W, H) => {
        bands = Array.from({ length: 6 }, (_, i) => ({
            y: H * (i / 5) * 0.8 + H * 0.1,
            amp: 18 + Math.random() * 22,
            freq: 0.008 + Math.random() * 0.006,
            phase: Math.random() * Math.PI * 2,
            speed: 0.4 + Math.random() * 0.6,
            hue: i % 2 === 0 ? [80, 210, 170] : [160, 120, 255],
            width: 28 + Math.random() * 40,
        }));
    };

    const FADE_IN_DURATION = 0.6;

    (function frame(now) {
        if (!canvas.isConnected) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (!w || !h) { requestAnimationFrame(frame); return; }
        if (w !== canvas.width || h !== canvas.height) {
            canvas.width = w;
            canvas.height = h;
            bands = null;
        }
        if (!bands) initBands(canvas.width, canvas.height);
        const W = canvas.width;
        const H = canvas.height;
        const t = (now - start) * 0.001;
        const life = Math.min(1, t / FADE_IN_DURATION);

        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';

        for (const b of bands) {
            const path = new Path2D();
            for (let x = 0; x <= W; x += 4) {
                const y = b.y + Math.sin(x * b.freq + t * b.speed + b.phase) * b.amp * life;
                if (x === 0) path.moveTo(x, y); else path.lineTo(x, y);
            }
            for (let x = W; x >= 0; x -= 4) {
                const y = b.y + Math.sin(x * b.freq + t * b.speed + b.phase) * b.amp * life + b.width;
                path.lineTo(x, y);
            }
            path.closePath();
            const [r, g, bl] = b.hue;
            const grad = ctx.createLinearGradient(0, 0, W, 0);
            grad.addColorStop(0, `rgba(${r},${g},${bl},0)`);
            grad.addColorStop(0.2, `rgba(${r},${g},${bl},${0.18 * life})`);
            grad.addColorStop(0.5, `rgba(${r},${g},${bl},${0.28 * life})`);
            grad.addColorStop(0.8, `rgba(${r},${g},${bl},${0.18 * life})`);
            grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
            ctx.fillStyle = grad;
            ctx.fill(path);
        }

        requestAnimationFrame(frame);
    })(start);
    return true;
};

export const successAnimation = () => {
    let canvas = document.getElementById('success-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'success-canvas';
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
        document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const start = performance.now();

    const shards = Array.from({ length: 55 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const sz = 4 + Math.random() * 14;
        const speed = 0.8 + Math.random() * 2.5;
        return {
            x: cx + (Math.random() - 0.5) * 60,
            y: cy + (Math.random() - 0.5) * 40,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 0.15,
            sz,
            delay: Math.random() * 0.3,
            life: 1,
            decay: 0.007 + Math.random() * 0.012,
            color: Math.random() > 0.4 ? [100, 225, 185] : [180, 150, 255],
        };
    });

    (function frame(now) {
        const t = (now - start) * 0.001;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';

        let alive = false;
        for (const s of shards) {
            if (t < s.delay) { alive = true; continue; }
            s.x += s.vx;
            s.y += s.vy;
            s.vy += 0.04;
            s.rot += s.vrot;
            s.life -= s.decay;
            if (s.life <= 0) continue;
            alive = true;

            const a = Math.pow(s.life, 1.8) * 0.7;
            const [r, g, b] = s.color;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.rot);
            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.5})`;
            ctx.lineWidth = 0.5;
            const h = s.sz, w = s.sz * 0.55;
            ctx.beginPath();
            ctx.moveTo(0, -h / 2);
            ctx.lineTo(w / 2, 0);
            ctx.lineTo(0, h / 2);
            ctx.lineTo(-w / 2, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        if (alive) {
            requestAnimationFrame(frame);
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, W, H);
        }
    })(start);
};

export const repositionPlacedTiles = gridEl => {
    gridEl.querySelectorAll('.tile--placed').forEach(tile => {
        const { gridX, gridY } = tile.dataset;
        const cell = gridEl.querySelector(`[data-x="${gridX}"][data-y="${gridY}"]`);
        if (cell) {
            Object.assign(tile.style, {
                left: `${cell.offsetLeft}px`,
                top: `${cell.offsetTop}px`
            });
        }
    });
};

export const initRackTransition = rackEl => {
    let lastHeight = 0;
    let isFirstObservation = true;
    let isAnimating = false;
    let transitionTimeout = null;

    const cleanup = () => {
        rackEl.style.height = '';
        rackEl.style.transition = '';
        rackEl.style.overflow = '';
        setTimeout(() => {
            lastHeight = rackEl.offsetHeight;
            isAnimating = false;
        }, 50);
    };

    const observer = new ResizeObserver(entries => {
        if (isAnimating) return;

        const entry = entries[0];
        const newHeight = entry.borderBoxSize?.[0]?.blockSize ?? rackEl.offsetHeight;

        if (isFirstObservation) {
            isFirstObservation = false;
            lastHeight = newHeight;
            return;
        }
        const diff = Math.abs(newHeight - lastHeight);
        if (diff > 2 && lastHeight > 0) {
            isAnimating = true;
            clearTimeout(transitionTimeout);
            rackEl.style.overflow = 'hidden';
            rackEl.style.height = `${lastHeight}px`;
            void rackEl.offsetHeight;
            rackEl.style.transition = 'height 100ms ease-out';
            rackEl.style.height = `${newHeight}px`;
            transitionTimeout = setTimeout(cleanup, 120);
        } else {
            lastHeight = newHeight;
        }
    });

    observer.observe(rackEl);
    return observer;
};
