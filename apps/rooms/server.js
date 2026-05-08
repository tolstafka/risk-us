const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;
const ROOM_IDS = new Set(["1", "2", "3"]);
const HEARTBEAT_TIMEOUT_MS = 15_000;
const HEARTBEAT_CLEANUP_MS = 5_000;
const SSE_PING_MS = 20_000;

const PUBLIC_DIR = path.join(__dirname, "public");
const rooms = new Map(
  Array.from(ROOM_IDS, (roomId) => [roomId, new Map()]),
);

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message),
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

function getMimeType(filePath) {
  switch (path.extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".html":
    default:
      return "text/html; charset=utf-8";
  }
}

function sanitizeName(name) {
  if (typeof name !== "string") {
    return "";
  }

  return name.trim().replace(/\s+/g, " ").slice(0, 32);
}

function roomSnapshot(roomId) {
  const room = rooms.get(roomId);
  const users = Array.from(room.values())
    .sort((left, right) => left.joinedAt - right.joinedAt)
    .map((user) => ({
      id: user.id,
      name: user.name,
      joinedAt: user.joinedAt,
    }));

  return { roomId, users };
}

function writeSse(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  const snapshot = roomSnapshot(roomId);

  for (const user of room.values()) {
    if (user.stream) {
      writeSse(user.stream, "presence", snapshot);
    }
  }
}

function removeUser(roomId, sessionId) {
  const room = rooms.get(roomId);
  const user = room.get(sessionId);
  if (!user) {
    return false;
  }

  if (user.stream) {
    user.stream.end();
  }

  room.delete(sessionId);
  broadcastRoom(roomId);
  return true;
}

function handleHome(requestPath, response) {
  if (requestPath === "/" || /^\/room\/[123]\/?$/.test(requestPath)) {
    serveFile(path.join(PUBLIC_DIR, "index.html"), response);
    return true;
  }

  return false;
}

function serveFile(filePath, response) {
  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store",
    });
    response.end(fileBuffer);
  });
}

function serveStatic(requestPath, response) {
  const sanitizedPath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, sanitizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  serveFile(filePath, response);
}

async function handleJoin(request, response, roomId) {
  const room = rooms.get(roomId);
  const body = await readJson(request);
  const name = sanitizeName(body.name);

  if (!name) {
    sendJson(response, 400, { error: "Please enter a name." });
    return;
  }

  const sessionId = crypto.randomUUID();
  room.set(sessionId, {
    id: sessionId,
    name,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    stream: null,
  });

  sendJson(response, 201, {
    roomId,
    sessionId,
    name,
    users: roomSnapshot(roomId).users,
  });
}

async function handleHeartbeat(request, response, roomId) {
  const room = rooms.get(roomId);
  const body = await readJson(request);
  const sessionId = body.sessionId;
  const user = room.get(sessionId);

  if (!user) {
    sendJson(response, 404, { error: "Session not found." });
    return;
  }

  user.lastSeen = Date.now();
  sendJson(response, 200, { ok: true });
}

async function handleLeave(request, response, roomId) {
  const body = await readJson(request);
  const removed = removeUser(roomId, body.sessionId);
  sendJson(response, removed ? 200 : 404, { ok: removed });
}

function handleEvents(request, response, roomId, url) {
  const sessionId = url.searchParams.get("sessionId");
  const room = rooms.get(roomId);
  const user = room.get(sessionId);

  if (!user) {
    sendJson(response, 404, { error: "Session not found." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });

  user.stream = response;
  user.lastSeen = Date.now();
  writeSse(response, "presence", roomSnapshot(roomId));

  request.on("close", () => {
    if (user.stream === response) {
      user.stream = null;
    }
  });
}

async function handleApi(request, response, url) {
  const match = url.pathname.match(/^\/api\/rooms\/([123])\/(join|heartbeat|leave|events)$/);
  if (!match) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const [, roomId, action] = match;

  if (!ROOM_IDS.has(roomId)) {
    sendJson(response, 404, { error: "Unknown room." });
    return;
  }

  try {
    if (action === "events" && request.method === "GET") {
      handleEvents(request, response, roomId, url);
      return;
    }

    if (action === "join" && request.method === "POST") {
      await handleJoin(request, response, roomId);
      broadcastRoom(roomId);
      return;
    }

    if (action === "heartbeat" && request.method === "POST") {
      await handleHeartbeat(request, response, roomId);
      return;
    }

    if (action === "leave" && request.method === "POST") {
      await handleLeave(request, response, roomId);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Request failed." });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  if (handleHome(url.pathname, response)) {
    return;
  }

  if (url.pathname.startsWith("/public/")) {
    serveStatic(url.pathname.replace("/public/", ""), response);
    return;
  }

  sendText(response, 404, "Not found");
});

setInterval(() => {
  const now = Date.now();

  for (const [roomId, room] of rooms.entries()) {
    let changed = false;

    for (const [sessionId, user] of room.entries()) {
      if (now - user.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        if (user.stream) {
          user.stream.end();
        }

        room.delete(sessionId);
        changed = true;
      }
    }

    if (changed) {
      broadcastRoom(roomId);
    }
  }
}, HEARTBEAT_CLEANUP_MS);

setInterval(() => {
  for (const room of rooms.values()) {
    for (const user of room.values()) {
      if (user.stream) {
        user.stream.write(": ping\n\n");
      }
    }
  }
}, SSE_PING_MS);

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
