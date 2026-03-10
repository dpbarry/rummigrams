const getRoomId = () => new URLSearchParams(location.search).get('room') || null;

const PARTYKIT_URL = "wss://rummigrams.dpbarry.partykit.dev";

export const isMultiplayer = () => !!getRoomId();

export const getPartyRoomId = getRoomId;

export const createPartyConnection = (onState) => {
  const roomId = getRoomId();
  if (!roomId) return null;

  const ws = new WebSocket(`${PARTYKIT_URL}/party/${roomId}`);
  let myId = null;

  ws.onopen = () => {
    console.log("Connected to room:", roomId);
  };

  ws.onmessage = (event) => {
    const state = JSON.parse(event.data);
    if (state.myId) myId = state.myId;
    onState(state, myId);
  };

  ws.onclose = () => console.log("Disconnected from room");
  ws.onerror = err => console.error("WebSocket error:", err);

  const send = (type, data) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, data }));
  };

  return {
    join(name, color) {
      send("JOIN", { name, color });
    },
    startGame() {
      send("START_GAME");
    },
    completeBoard() {
      send("COMPLETE_BOARD");
    },
    sendBoardState(data) {
      send("BOARD_STATE", data);
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
