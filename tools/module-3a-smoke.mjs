const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8080";
const wsUrl = baseUrl.replace(/^http/, "ws");

async function request(path, token, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function register(label) {
  const gamertag = `smoke-${label}-${Date.now()}`;
  const response = await request("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ gamertag, displayName: `Smoke ${label}`, password: "p@ss" })
  });
  return response.token;
}

function connect(ticket, roomCode, label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}`);
    const messages = [];
    const timer = setTimeout(() => reject(new Error(`${label} WebSocket timed out`)), 10_000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join_room", payload: {
        roomCode, trackCatalogVersion: "2026.12", physicsContractVersion: "2.0.3"
      }}));
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      messages.push(message);
      if (message.type === "room_state") {
        clearTimeout(timer);
        resolve({ socket, messages });
      }
    });
    socket.addEventListener("error", () => reject(new Error(`${label} WebSocket error`)));
  });
}

const hostToken = await register("host");
const secondToken = await register("second");
const room = await request("/api/rooms", hostToken, {
  method: "POST", body: JSON.stringify({ name: "Part 3a smoke", gridSize: 2 })
});
await request(`/api/rooms/${room.code}/join`, secondToken, {
  method: "POST", body: JSON.stringify({})
});
const hostTicket = await request(`/api/rooms/${room.code}/connection-ticket`, hostToken, { method: "POST" });
const secondTicket = await request(`/api/rooms/${room.code}/connection-ticket`, secondToken, { method: "POST" });
const host = await connect(hostTicket.ticket, room.code, "host");
const second = await connect(secondTicket.ticket, room.code, "second");

second.socket.send(JSON.stringify({ type: "ready", payload: {} }));
await new Promise(resolve => setTimeout(resolve, 250));
const started = await request(`/api/rooms/${room.code}/start`, hostToken, { method: "POST" });
if (started.state !== "qualifying") {
  throw new Error(`Expected qualifying state, received ${started.state}`);
}
console.log(JSON.stringify({ ok: true, roomCode: room.code, participants: started.participantCount, state: started.state }));
host.socket.close();
second.socket.close();
