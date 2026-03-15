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
      gridSize: null,
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
      gridSize: this.state.gridSize
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
      const gs = data && typeof data.gridSize === "number" ? data.gridSize : null;
      if (gs != null) this.state.gridSize = gs;
      const gridSize = this.state.gridSize ?? 6;
      for (const id of this.state.joinOrder) {
        if (!this.state.boards[id]) this.state.boards[id] = { gridSize, grid: [], hand: [], tiles: [] };
      }
      this.broadcast();
      return;
    }

    if (type === "COMPLETE_BOARD") {
      if (!this.state.started || this.state.winner) return;
      if (!this.state.players[sender.id]) return;
      this.state.players[sender.id].completed = true;
      if (!this.state.winner) this.state.winner = sender.id;
      this.broadcast();
      return;
    }

    if (type === "BOARD_STATE") {
      if (!this.state.players[sender.id] || !this.state.started) return;
      const d = data;
      if (d && typeof d.gridSize === "number" && Array.isArray(d.grid) && Array.isArray(d.hand) && Array.isArray(d.tiles)) {
        if (this.state.gridSize == null) this.state.gridSize = d.gridSize;
        this.state.boards[sender.id] = {
          gridSize: d.gridSize,
          grid: d.grid,
          hand: d.hand,
          tiles: d.tiles
        };
        this.broadcast();
      }
    }

    if (type === "JOIN_GAME") {
      if (!this.state.started || !this.state.players[sender.id]) return;
      if (this.state.boards[sender.id]) return;
      const gridSize = this.state.gridSize ?? 6;
      this.state.boards[sender.id] = { gridSize, grid: [], hand: [], tiles: [] };
      this.broadcast();
      sender.send(JSON.stringify({ ...this.snapshot(), myId: sender.id }));
    }
  }
}
