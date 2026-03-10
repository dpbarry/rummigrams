export default class GameRoom {
  constructor(room) {
    this.room = room;
    this.state = {
      players: {},
      boards: {},
      joinOrder: [],
      hostId: null,
      started: false,
      winner: null
    };
  }

  snapshot() {
    return {
      players: this.state.players,
      boards: this.state.boards,
      joinOrder: this.state.joinOrder,
      hostId: this.state.hostId,
      started: this.state.started,
      winner: this.state.winner
    };
  }

  broadcast() {
    const payload = JSON.stringify(this.snapshot());
    for (const conn of this.room.getConnections()) {
      conn.send(payload);
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
    delete this.state.players[conn.id];
    delete this.state.boards[conn.id];
    this.state.joinOrder = this.state.joinOrder.filter((id) => id !== conn.id);
    if (conn.id === this.state.hostId) this.ensureHost();
    this.broadcast();
  }

  onMessage(message, sender) {
    const msg = JSON.parse(message);
    const { type, data } = msg;

    if (type === "JOIN") {
      if (!this.state.players[sender.id]) return;
      const name = typeof data?.name === "string" ? data.name.slice(0, 16).trim() || null : null;
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
        this.state.boards[sender.id] = {
          gridSize: d.gridSize,
          grid: d.grid,
          hand: d.hand,
          tiles: d.tiles
        };
        this.broadcast();
      }
    }
  }
}
