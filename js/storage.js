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
