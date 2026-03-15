const STORAGE_KEY = 'rummigrams_game';

export const saveGame = (state) => {
    const data = {
        gridSize: state.level.gridSize,
        tiles: [...state.tiles.entries()],
        grid: [...state.grid.entries()],
        hand: [...state.hand],
        isVictory: state.isVictory
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const loadGame = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        return {
            gridSize: data.gridSize,
            tiles: new Map(data.tiles),
            grid: new Map(data.grid),
            hand: new Set(data.hand),
            isVictory: data.isVictory || false
        };
    } catch {
        return null;
    }
};

export const hasContinuableGame = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        return !data.isVictory;
    } catch {
        return false;
    }
};

export const clearSave = () => {
    localStorage.removeItem(STORAGE_KEY);
};

const partyKey = (roomId) => `rummigrams_party_${roomId}`;

export const savePartyGame = (roomId, state, name, color, hue) => {
    if (!roomId) return;
    const data = {
        gridSize: state.level.gridSize,
        tiles: [...state.tiles.entries()],
        grid: [...state.grid.entries()],
        hand: [...state.hand],
        isVictory: state.isVictory,
        name: name ?? null,
        color: color ?? null,
        hue: hue != null ? hue : null
    };
    localStorage.setItem(partyKey(roomId), JSON.stringify(data));
};

export const loadPartyGame = (roomId) => {
    if (!roomId) return null;
    const raw = localStorage.getItem(partyKey(roomId));
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data.gridSize !== 'number') return null;
        return {
            gridSize: data.gridSize,
            tiles: new Map(data.tiles || []),
            grid: new Map(data.grid || []),
            hand: new Set(data.hand || []),
            isVictory: data.isVictory || false,
            name: data.name ?? null,
            color: data.color ?? null,
            hue: data.hue != null ? data.hue : null
        };
    } catch {
        return null;
    }
};

export const clearPartyGame = (roomId) => {
    if (roomId) localStorage.removeItem(partyKey(roomId));
};
