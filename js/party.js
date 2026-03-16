const getRoomId = () => new URLSearchParams(location.search).get('room') || null;

const SESSION_KEY = "rummigrams_session_id";
const getOrCreateSessionId = () => {
  let s = null;
  try { s = localStorage.getItem(SESSION_KEY); } catch (_) {}
  if (!s) {
    s = Math.random().toString(36).slice(2) + Date.now();
    try { localStorage.setItem(SESSION_KEY, s); } catch (_) {}
  }
  return s;
};

const PARTYKIT_URL = "wss://rummigrams.dpbarry.partykit.dev";

export const isMultiplayer = () => !!getRoomId();

export const getPartyRoomId = getRoomId;

const ROOM_ACTIVE_KEY = (id) => `rummigrams_room_${id}_active`;

export const createPartyConnection = (onState, getPrimary = () => false) => {
  const roomId = getRoomId();
  if (!roomId) return null;
  if (typeof console !== 'undefined' && console.warn) console.warn('[Rummigrams Lobby] P1 createPartyConnection', 'new WebSocket');
  const ws = new WebSocket(`${PARTYKIT_URL}/party/${roomId}`);
  let myId = null;
  const sessionId = getOrCreateSessionId();

  ws.onopen = () => {
    if (typeof console !== 'undefined' && console.warn) console.warn('[Rummigrams Lobby] P2 WebSocket onopen', roomId);
    try {
      const primary = getPrimary();
      ws.send(JSON.stringify({ type: "SESSION", data: { sessionId, primary } }));
    } catch (_) {}
  };

  ws.onmessage = (event) => {
    const state = JSON.parse(event.data);
    if (state.myId) myId = state.myId;
    onState(state, myId);
  };

  ws.onclose = () => {};
  ws.onerror = err => console.error("WebSocket error:", err);

  const send = (type, data) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, data }));
  };

  return {
    join(name, color) {
      send("JOIN", { name, color });
    },
    startGame(gridSize) {
      send("START_GAME", gridSize != null ? { gridSize } : {});
    },
    completeBoard() {
      send("COMPLETE_BOARD");
    },
    sendBoardState(data) {
      send("BOARD_STATE", data);
    },
    joinGame() {
      send("JOIN_GAME", {});
    },
    close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    },
    get ready() {
      return ws.readyState === WebSocket.OPEN;
    },
    waitReady() {
      return new Promise(resolve => {
        if (ws.readyState === WebSocket.OPEN) return resolve();
        ws.addEventListener('open', () => resolve(), { once: true });
      });
    }
  };
};

export const createShareUrl = (roomId) => {
  const url = new URL(location.href);
  url.searchParams.set('room', roomId);
  url.hash = '';
  return url.origin + url.pathname + url.search;
};
