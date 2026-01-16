import { rippleSystem } from './ripple.js';

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
        tile.classList.remove('tile--valid', 'tile--invalid', 'tile--block-error', 'tile--impossible');

        if (blockPositions.has(pos)) tile.classList.add('tile--block-error');
        else if (impossiblePositions.has(pos)) tile.classList.add('tile--impossible');
        else if (validPositions.has(pos)) tile.classList.add('tile--valid');
    });
};

export const initRippleSystem = gridEl => rippleSystem.attach(gridEl);

export const createCellRipple = cell => {
    const x = cell.offsetLeft + cell.offsetWidth / 2;
    const y = cell.offsetTop + cell.offsetHeight / 2;
    rippleSystem.emit(x, y);
};

export const updateStatus = (statusEl, state, text) => {
    statusEl.dataset.state = state;
    statusEl.querySelector('.status-text').textContent = text;
};

export const triggerVictory = gridEl => {
    gridEl.querySelectorAll('.tile--placed').forEach((tile, i) => {
        tile.style.animationDelay = `${i * 40}ms`;
        tile.classList.add('tile--victory');
    });
};

export const createConfetti = (count = 30) => {
    Array.from({ length: count }).forEach(() => {
        const c = createElement('div', 'confetti');
        Object.assign(c.style, {
            left: `${Math.random() * 100}vw`,
            animationDelay: `${Math.random() * 0.5}s`,
            transform: `rotate(${Math.random() * 360}deg)`
        });
        document.body.appendChild(c);
        c.addEventListener('animationend', () => c.remove());
    });
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

        const newHeight = entries[0].contentRect.height;

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
            rackEl.offsetHeight;
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


