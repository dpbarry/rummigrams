import { generateLevel as generateLevelServer } from "./generator.js";

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randTile = () => rand(1, 13);

function initialHandSize(stage) {
  return Math.max(6, Math.floor((Math.min(20, 6 + stage * 2)) / 2));
}

function solutionFirstHand(gridSize, targetTiles) {
  const { hand } = generateLevelServer({ gridSize, targetTiles, difficulty: 5 });
  return Array.isArray(hand) && hand.length ? hand : null;
}

function tilesToAddOnAdvance(stage) {
  const nextSize = stage + 1;
  const newCells = nextSize * nextSize - stage * stage;
  return Math.max(4, Math.ceil(newCells / 2));
}

function valuesFromBoard(board) {
  const values = [];
  const tiles = board?.tiles;
  if (Array.isArray(tiles)) {
    for (const entry of tiles) {
      const v = Array.isArray(entry) ? entry[1] : entry;
      if (typeof v === 'number' && v >= 1 && v <= 13) values.push(v);
    }
  } else if (tiles && typeof tiles === 'object') {
    for (const v of Object.values(tiles)) {
      if (typeof v === 'number' && v >= 1 && v <= 13) values.push(v);
    }
  }
  return values;
}

function addTilesToBoard(board, count, prefix) {
  const tiles = Array.isArray(board.tiles) ? [...board.tiles] : [];
  const hand = Array.isArray(board.hand) ? [...board.hand] : [];
  const ts = Date.now();
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-${ts}-${i}`;
    tiles.push([id, randTile()]);
    hand.push(id);
  }
  return { ...board, tiles, hand };
}

function addHandValuesToBoard(board, values, prefix) {
  const tiles = Array.isArray(board.tiles) ? [...board.tiles] : [];
  const hand = Array.isArray(board.hand) ? [...board.hand] : [];
  const ts = Date.now();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || v < 1 || v > 13) continue;
    const id = `${prefix}-${ts}-${i}`;
    tiles.push([id, v]);
    hand.push(id);
  }
  return { ...board, tiles, hand };
}

function addTilesToBoardSeeded(board, count, prefix) {
  const tiles = Array.isArray(board.tiles) ? [...board.tiles] : [];
  const hand = Array.isArray(board.hand) ? [...board.hand] : [];
  const values = valuesFromBoard(board);
  const pool = values.length ? values : Array.from({ length: 13 }, (_, i) => i + 1);
  const ts = Date.now();
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-${ts}-${i}`;
    const value = pool[rand(0, pool.length - 1)];
    tiles.push([id, value]);
    hand.push(id);
  }
  return { ...board, tiles, hand };
}

function handSizeForStage(stage) {
  return Math.min(20, 6 + stage * 2);
}

function generateHandForStage(stage) {
  const size = initialHandSize(stage);
  const values = solutionFirstHand(stage, size);
  if (!values?.length) {
    const fallback = [];
    const runStart = rand(1, 14 - Math.min(5, size));
    for (let i = 0; i < size; i++) fallback.push(runStart + (i % 5));
    return buildBoardFromValues([], fallback, "join");
  }
  return buildBoardFromValues([], values, "join");
}

function buildBoardFromValues(grid, values, prefix) {
  const tiles = [];
  const hand = [];
  const ts = Date.now();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== "number" || v < 1 || v > 13) continue;
    const id = `${prefix}-${ts}-${i}`;
    tiles.push([id, v]);
    hand.push(id);
  }
  return { grid: Array.isArray(grid) ? grid : [], hand, tiles };
}

export default class GameRoom {
  constructor(room) {
    this.room = room;
    this.state = {
      players: {},
      boards: {},
      joinOrder: [],
      hostId: null,
      started: false,
      winner: null,
      stage: 4,
      gridSize: 4,
      lastAdvanced: null,
      lastCompleteBoardBy: null,
      lastCompleteBoardStage: null,
      connectionSessionIds: {}
    };
  }

  snapshot() {
    return {
      players: this.state.players,
      boards: this.state.boards,
      joinOrder: this.state.joinOrder,
      hostId: this.state.hostId,
      started: this.state.started,
      winner: this.state.winner,
      stage: this.state.stage,
      gridSize: this.state.gridSize,
      lastAdvanced: this.state.lastAdvanced
    };
  }

  broadcast() {
    const payload = JSON.stringify(this.snapshot());
    if (typeof this.room.broadcast === 'function') {
      this.room.broadcast(payload);
    } else {
      for (const conn of this.room.getConnections?.() ?? []) {
        conn.send(payload);
      }
    }
  }

  sendToAllWithMyId() {
    const snap = this.snapshot();
    const conns = this.room.getConnections?.() ?? [];
    for (const conn of conns) {
      try {
        conn.send(JSON.stringify({ ...snap, myId: conn.id }));
      } catch (_) {}
    }
  }

  ensureHost() {
    if (this.state.hostId && this.state.players[this.state.hostId]) return;
    this.state.hostId = this.state.joinOrder[0] || null;
  }

  onConnect(conn) {
    this.state.players[conn.id] = {
      name: null,
      color: null,
      completed: false
    };
    this.state.joinOrder.push(conn.id);
    this.ensureHost();
    conn.send(JSON.stringify({ ...this.snapshot(), myId: conn.id }));
    this.broadcast();
  }

  onClose(conn) {
    delete this.state.connectionSessionIds[conn.id];
    delete this.state.players[conn.id];
    delete this.state.boards[conn.id];
    this.state.joinOrder = this.state.joinOrder.filter((id) => id !== conn.id);
    if (conn.id === this.state.hostId) this.ensureHost();
    this.broadcast();
  }

  onMessage(message, sender) {
    const msg = JSON.parse(message);
    const { type, data } = msg;

    if (type === "SESSION") {
      const sessionId = typeof data?.sessionId === "string" ? data.sessionId : null;
      if (!sessionId) return;
      const conns = this.room.getConnections?.() ?? [];
      for (const id of Object.keys(this.state.players)) {
        if (id === sender.id) continue;
        if (this.state.connectionSessionIds[id] !== sessionId) continue;
        const other = conns.find((c) => c.id === id);
        if (other) {
          try { other.send(JSON.stringify({ rejected: true })); } catch (_) {}
          try { other.close(); } catch (_) {}
        }
      }
      this.state.connectionSessionIds[sender.id] = sessionId;
      return;
    }

    if (type === "JOIN") {
      if (!this.state.players[sender.id]) return;
      const name = typeof data?.name === "string" ? data.name.slice(0, 40).trim() || null : null;
      const color = typeof data?.color === "string" ? data.color : null;
      this.state.players[sender.id].name = name;
      this.state.players[sender.id].color = color;
      this.broadcast();
      return;
    }

    if (type === "START_GAME") {
      if (this.state.started) return;
      if (sender.id !== this.state.hostId) return;
      this.state.started = true;
      this.state.stage = 4;
      this.state.gridSize = 4;
      const handValues = Array.isArray(data?.hand) ? data.hand.filter(v => typeof v === 'number' && v >= 1 && v <= 13) : null;
      const fallbackHand = solutionFirstHand(4, initialHandSize(4));
      const initialHand = handValues?.length ? handValues : (fallbackHand || (() => { const r = []; for (let i = 0; i < 7; i++) r.push(rand(1, 13)); return r; })());
      for (const id of this.state.joinOrder) {
        let board = { gridSize: 4, grid: [], hand: [], tiles: [] };
        board = addHandValuesToBoard(board, initialHand, `init-${id}`);
        this.state.boards[id] = board;
      }
      this.sendToAllWithMyId();
      return;
    }

    if (type === "COMPLETE_BOARD") {
      if (!this.state.started || this.state.winner) return;
      if (!this.state.players[sender.id]) return;
      const stage = this.state.stage;
      if (this.state.lastCompleteBoardBy === sender.id && this.state.lastCompleteBoardStage === stage) return;
      this.state.lastCompleteBoardBy = sender.id;
      this.state.lastCompleteBoardStage = stage;
      const playerName = this.state.players[sender.id].name || "Someone";
      if (stage < 8) {
        const nextStage = stage + 1;
        const addCount = tilesToAddOnAdvance(stage);
        this.state.lastAdvanced = { name: playerName, stage: nextStage, id: sender.id };
        this.state.stage = nextStage;
        this.state.gridSize = nextStage;
        this.state.lastCompleteBoardBy = null;
        for (const id of Object.keys(this.state.boards)) {
          const board = this.state.boards[id];
          if (board && Array.isArray(board.tiles)) {
            const updated = addTilesToBoardSeeded(board, addCount, `adv-${id}`);
            this.state.boards[id] = { ...updated, gridSize: nextStage };
          }
        }
      } else {
        this.state.winner = sender.id;
        this.state.players[sender.id].completed = true;
      }
      this.sendToAllWithMyId();
      this.state.lastAdvanced = null;
      return;
    }

    if (type === "DEV_ADVANCE") {
      if (!this.state.started || this.state.winner) return;
      const stage = this.state.stage;
      if (stage >= 8) return;
      const nextStage = stage + 1;
      const addCount = tilesToAddOnAdvance(stage);
      this.state.lastAdvanced = { name: "Dev", stage: nextStage, id: sender.id };
      this.state.stage = nextStage;
      this.state.gridSize = nextStage;
      this.state.lastCompleteBoardBy = null;
      for (const id of Object.keys(this.state.boards)) {
        const board = this.state.boards[id];
        if (board && Array.isArray(board.tiles)) {
          const updated = addTilesToBoardSeeded(board, addCount, `adv-${id}`);
          this.state.boards[id] = { ...updated, gridSize: nextStage };
        }
      }
      this.sendToAllWithMyId();
      this.state.lastAdvanced = null;
      return;
    }

    if (type === "BOARD_STATE") {
      if (!this.state.players[sender.id] || !this.state.started || this.state.winner) return;
      const d = data;
      if (d && typeof d.gridSize === "number" && Array.isArray(d.grid) && Array.isArray(d.hand) && Array.isArray(d.tiles)) {
        const gridSize = Math.max(d.gridSize, this.state.stage);
        this.state.boards[sender.id] = {
          gridSize,
          grid: d.grid,
          hand: d.hand,
          tiles: d.tiles
        };
        this.sendToAllWithMyId();
      }
    }

    if (type === "JOIN_GAME") {
      if (!this.state.started || !this.state.players[sender.id]) return;
      if (this.state.boards[sender.id]) return;
      if (this.state.winner) {
        sender.send(JSON.stringify({ ...this.snapshot(), myId: sender.id }));
        return;
      }
      const stage = this.state.stage;
      const gridSize = this.state.gridSize ?? stage;
      const base = generateHandForStage(stage);
      this.state.boards[sender.id] = { gridSize, grid: base.grid, hand: base.hand, tiles: base.tiles };
      this.broadcast();
      sender.send(JSON.stringify({ ...this.snapshot(), myId: sender.id }));
    }
  }
}
