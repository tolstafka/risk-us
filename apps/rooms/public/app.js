const homePage = document.getElementById("home-page");
const roomPage = document.getElementById("room-page");
const roomTitle = document.getElementById("room-title");
const roomLink = document.getElementById("room-link");
const joinForm = document.getElementById("join-form");
const joinButton = joinForm.querySelector("button");
const nameInput = document.getElementById("name-input");
const message = document.getElementById("message");
const userCount = document.getElementById("user-count");
const userList = document.getElementById("user-list");

const roomId = window.location.pathname.match(/^\/room\/([123])\/?$/)?.[1] || null;

const gameHome = document.getElementById("game-home");
const hostGameButton = document.getElementById("host-game-button");
const gameJoinForm = document.getElementById("game-join-form");
const gameIdInput = document.getElementById("game-id-input");
const gameHomeMessage = document.getElementById("game-home-message");
const gamePage = document.getElementById("game-page");
const gameIdLabel = document.getElementById("game-id-label");
const gamePageStatus = document.getElementById("game-page-status");
const gameLink = document.getElementById("game-link");
const enterGameButton = document.getElementById("enter-game-button");
const gamePageMessage = document.getElementById("game-page-message");
const GAME_ID_PATTERN = /^[A-Z0-9]{6}$/;
const gamePathMatch = window.location.pathname.match(/^\/game\/([^/]+)\/?$/);
const currentGameId = gamePathMatch?.[1]?.toUpperCase() || "";

let sessionId = null;
let eventSource = null;
let heartbeatTimer = null;

function renderUsers(users) {
  userCount.textContent = `${users.length} ${users.length === 1 ? "user" : "users"}`;
  userList.innerHTML = "";

  if (users.length === 0) {
    userList.innerHTML = "<li>No users yet.</li>";
    return;
  }

  for (const user of users) {
    const item = document.createElement("li");
    item.textContent = user.name;
    userList.appendChild(item);
  }
}

function setMessage(text) {
  message.textContent = text;
}

function setGameHomeMessage(text) {
  if (gameHomeMessage) {
    gameHomeMessage.textContent = text;
  }
}

function setGamePageStatus(text) {
  if (gamePageStatus) {
    gamePageStatus.textContent = text;
  }
}

function setGamePageMessage(text) {
  if (gamePageMessage) {
    gamePageMessage.textContent = text;
  }
}

function isValidGameId(gameId) {
  return GAME_ID_PATTERN.test(gameId);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function postJson(url, payload, useBeacon) {
  if (useBeacon && navigator.sendBeacon) {
    const body = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(url, body);
    return { ok: true };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function hostGame() {
  hostGameButton.disabled = true;
  setGameHomeMessage("");

  try {
    const data = await requestJson("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    window.location.href = data.url;
  } catch (error) {
    setGameHomeMessage(error.message);
    hostGameButton.disabled = false;
  }
}

function setupGameHome() {
  if (!gameHome || !hostGameButton || !gameJoinForm || !gameIdInput) {
    return;
  }

  hostGameButton.addEventListener("click", hostGame);

  gameJoinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const gameId = gameIdInput.value.trim().toUpperCase();

    if (!gameId) {
      setGameHomeMessage("Enter a game ID.");

      return;
    }

    if (!isValidGameId(gameId)) {
      setGameHomeMessage("Enter a valid 6-character game ID.");

      return;
    }

    window.location.href = `/game/${gameId}`;
  });
}

async function enterGameLobby() {
  enterGameButton.disabled = true;

  setGamePageMessage("");

  try {
    await requestJson(`/api/games/${encodeURIComponent(currentGameId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    setGamePageMessage("Youhave entered the lobby.");
  } catch (error) {
    setGamePageMessage(error.message);
    enterGameButton.disabled = false;
  }

}

async function setupGamePage() {
  homePage.hidden = true;
  roomPage.hidden = true;
  gamePage.hidden = false;

  gameIdLabel.textContent = currentGameId || "(missing)";
  gameLink.href = window.location.href;
  gameLink.textContent = window.location.href;

  enterGameButton.disabled = true;

  if (!currentGameId) {
    setGamePageStatus("Missing game ID.");
    return;
  }

  if (!isValidGameId(currentGameId)) {
    setGamePageStatus("Invalid game ID.");
    return;
  }

  try {
    const data = await requestJson(`/api/games/${encodeURIComponent(currentGameId)}`);
    setGamePageStatus(`Game ${data.gameId} is ready.`);
    enterGameButton.disabled = false;
    enterGameButton.addEventListener("click", enterGameLobby);
  } catch (error) {
    setGamePageStatus(error.message);
  }
}

function setupRoomView() {
  homePage.hidden = true;
  roomPage.hidden = false;
  roomTitle.textContent = `Room ${roomId}`;
  roomLink.href = window.location.href;
  roomLink.textContent = window.location.href;
  nameInput.focus();

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      setMessage("Please enter your name.");
      return;
    }

    try {
      const data = await postJson(`/api/rooms/${roomId}/join`, { name });
      sessionId = data.sessionId;
      renderUsers(data.users);
      setMessage(`You joined as ${data.name}.`);
      nameInput.disabled = true;
      joinButton.disabled = true;
      startRealtime();
    } catch (error) {
      setMessage(error.message);
    }
  });
}

function startRealtime() {
  if (!sessionId) {
    return;
  }

  eventSource = new EventSource(`/api/rooms/${roomId}/events?sessionId=${encodeURIComponent(sessionId)}`);
  eventSource.addEventListener("presence", (event) => {
    renderUsers(JSON.parse(event.data).users);
  });

  eventSource.onerror = () => {
    setMessage("Connection lost. Refresh the page please.");
  };

  heartbeatTimer = window.setInterval(async () => {
    try {
      await postJson(`/api/rooms/${roomId}/heartbeat`, { sessionId });
    } catch (_error) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, 5_000);
}

function setupLeaveHandler() {
  window.addEventListener("beforeunload", () => {
    if (sessionId) {
      postJson(`/api/rooms/${roomId}/leave`, { sessionId }, true);
    }
  });
}

if (roomId) {
  setupRoomView();
  setupLeaveHandler();
}

if (gamePathMatch) {
  setupGamePage();
} else {
  setupGameHome();
}