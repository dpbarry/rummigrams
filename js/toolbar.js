export const initToolbar = ({ state, rackEl, onScatter, onReturnAll }) => {
    const shuffle = arr => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };

    const reorderRack = sortedIds => {
        sortedIds.forEach(id => {
            const tile = document.getElementById(id);
            if (tile) rackEl.appendChild(tile);
        });
    };

    const shuffleHand = () => {
        const ids = [...state.hand];
        reorderRack(shuffle(ids));
    };

    const sortByFlush = () => {
        const ids = [...state.hand];
        ids.sort((a, b) => state.tiles.get(a) - state.tiles.get(b));
        reorderRack(ids);
    };

    const sortByStraight = () => {
        const ids = [...state.hand];
        const grouped = new Map();
        ids.forEach(id => {
            const v = state.tiles.get(id);
            if (!grouped.has(v)) grouped.set(v, []);
            grouped.get(v).push(id);
        });

        const sortedIds = [];
        const values = [...grouped.keys()].sort((a, b) => a - b);

        while (values.some(v => grouped.get(v)?.length > 0)) {
            for (const v of values) {
                const arr = grouped.get(v);
                if (arr?.length > 0) sortedIds.push(arr.shift());
            }
        }

        reorderRack(sortedIds);
    };

    document.getElementById('btn-shuffle').addEventListener('click', shuffleHand);
    document.getElementById('btn-sort-flush').addEventListener('click', sortByFlush);
    document.getElementById('btn-sort-straight').addEventListener('click', sortByStraight);
    document.getElementById('btn-scatter')?.addEventListener('click', () => onScatter?.());
    document.getElementById('btn-return-all')?.addEventListener('click', () => onReturnAll?.());

    return { shuffleHand, sortByFlush, sortByStraight };
};

export const calcRemainingTiles = (state, validGroupPositions) => {
    const tilesInValidGroups = new Set();
    for (const [pos, id] of state.grid) {
        if (validGroupPositions.has(pos)) tilesInValidGroups.add(id);
    }
    return state.tiles.size - tilesInValidGroups.size;
};

export const updateRemainingCounter = (count, isVictory = false) => {
    const counter = document.getElementById('remaining-counter');
    const countEl = counter.querySelector('.remaining-count');
    const labelEl = counter.querySelector('.remaining-label');

    countEl.textContent = count;
    countEl.dataset.state = isVictory ? 'victory' : count === 0 ? 'valid' : '';
    labelEl.textContent = count === 1 ? 'tile remaining' : 'tiles remaining';
};
