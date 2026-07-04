import { WebSocketServer } from "ws";

const port = Number(process.env.COMMUNITY_PORT || 5183);
// 교실 LAN에서 여러 기기가 접속할 수 있도록 모든 인터페이스에 바인딩
const wss = new WebSocketServer({ host: "0.0.0.0", port });
const players = new Map();

function broadcast() {
  const payload = JSON.stringify({
    type: "players",
    players: [...players.values()],
  });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

wss.on("connection", (socket) => {
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type !== "player-state" || !message.user?.id) return;
      players.set(message.user.id, {
        ...message.user,
        player: message.player,
        time: Date.now(),
      });
      broadcast();
    } catch {
      // Ignore malformed messages from prototype clients.
    }
  });

  socket.on("close", () => {
    for (const [id, player] of players) {
      if (Date.now() - player.time > 2000) players.delete(id);
    }
    broadcast();
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, player] of players) {
    if (now - player.time > 5000) players.delete(id);
  }
  broadcast();
}, 1000);

console.log(`Community WebSocket server ready at ws://127.0.0.1:${port}`);
