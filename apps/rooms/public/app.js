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
