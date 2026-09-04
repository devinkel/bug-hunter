/**
 * ============================================================================
 * CAÇA AOS BUGS: WEBRTC + WEBSOCKET MULTI-SALAS (LIMITE: 8 JOGADORES)
 * ============================================================================
 */

// Estado do Usuário Local
let myId = null;
let myName = localStorage.getItem("webrtc_user_name") || "";
let myColor = localStorage.getItem("webrtc_user_color") || "";
let amIAdmin = false;
let isGamePaused = false;
let toastTimeout = null;
let currentRoomId = null;

// Mapa de peers: peerId -> { pc, channel, cursorEl, color, name, candidatesQueue: [] }
const peers = new Map();

// Bugs ativos na tela: bugId -> { el, startXNorm, startYNorm, targetXNorm, targetYNorm, startTime, durationMs, pausedAt, animFrame }
const localBugs = new Map();

// Métricas P2P
let p2pMessagesReceived = 0;
let p2pMessagesSent = 0;

// Elementos da Interface
const topBar = document.getElementById("topBar");
const nameInput = document.getElementById("nameInput");
const colorPicker = document.getElementById("colorPicker");
const myColorSwatch = document.getElementById("myColorSwatch");
const cursorsContainer = document.getElementById("cursors-container");
const bugsContainer = document.getElementById("bugs-container");
const scoreboardWidget = document.getElementById("scoreboardWidget");
const scoreboardHeader = document.getElementById("scoreboardHeader");
const scoreboardCollapseBtn = document.getElementById("scoreboardCollapseBtn");
const scoreboardList = document.getElementById("scoreboardList");
const roundBadge = document.getElementById("roundBadge");
const roundNumberText = document.getElementById("roundNumberText");
const roundTimerText = document.getElementById("roundTimerText");
const roundBanner = document.getElementById("roundBanner");
const roundBannerTitle = document.getElementById("roundBannerTitle");
const roundBannerSubtitle = document.getElementById("roundBannerSubtitle");
const roundDelayCount = document.getElementById("roundDelayCount");
const victoryModal = document.getElementById("victoryModal");
const winnerName = document.getElementById("winnerName");
const winnerScoreBadge = document.getElementById("winnerScoreBadge");
const victoryPodium = document.getElementById("victoryPodium");
const victoryAdminActions = document.getElementById("victoryAdminActions");
const victoryStartMatchBtn = document.getElementById("victoryStartMatchBtn");
const victoryWaitingText = document.getElementById("victoryWaitingText");
const centerInstructions = document.getElementById("centerInstructions");
const centerAdminStart = document.getElementById("centerAdminStart");
const centerStartMatchBtn = document.getElementById("centerStartMatchBtn");
const centerWaitingStart = document.getElementById("centerWaitingStart");
const toastNotification = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");
const adminControls = document.getElementById("adminControls");
const adminPauseBtn = document.getElementById("adminPauseBtn");
const adminPauseSvg = document.getElementById("adminPauseSvg");
const adminResetBtn = document.getElementById("adminResetBtn");
const adminQuickPauseBtn = document.getElementById("adminQuickPauseBtn");
const modalResumeBtn = document.getElementById("modalResumeBtn");
const modalResetBtn = document.getElementById("modalResetBtn");
const pauseAdminActions = document.getElementById("pauseAdminActions");
const pauseWaitingText = document.getElementById("pauseWaitingText");
const pauseOverlay = document.getElementById("pauseOverlay");
const pauseSubtitle = document.getElementById("pauseSubtitle");
const canvas = document.getElementById("board");

// Elementos de Salas e Lobby
const roomBadge = document.getElementById("roomBadge");
const roomNameText = document.getElementById("roomNameText");
const roomCountText = document.getElementById("roomCountText");
const lobbyOverlay = document.getElementById("lobbyOverlay");
const lobbyCreateBtn = document.getElementById("lobbyCreateBtn");
const lobbyJoinForm = document.getElementById("lobbyJoinForm");
const lobbyRoomInput = document.getElementById("lobbyRoomInput");
const lobbyRoomsList = document.getElementById("lobbyRoomsList");
const lobbyRefreshRoomsBtn = document.getElementById("lobbyRefreshRoomsBtn");
const roomFullOverlay = document.getElementById("roomFullOverlay");
const roomFullMessage = document.getElementById("roomFullMessage");
const roomFullCreateBtn = document.getElementById("roomFullCreateBtn");
const roomFullLobbyBtn = document.getElementById("roomFullLobbyBtn");

let lobbyRoomsInterval = null;

// Servidores STUN públicos confiáveis (Google, Cloudflare, Mozilla)
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com" },
  ],
};

let currentMousePos = { x: 0.5, y: 0.5 };
let ws = null;

// ---------------------------------------------------------------------------
// CONTROLE DE VISIBILIDADE DO TOPBAR DURANTE O JOGO
// ---------------------------------------------------------------------------
function setRoundActiveState(isActive) {
  if (isActive && !isGamePaused) {
    document.body.classList.add("round-playing");
    if (amIAdmin && adminQuickPauseBtn) {
      adminQuickPauseBtn.classList.remove("hidden");
    }
  } else {
    document.body.classList.remove("round-playing");
    if (adminQuickPauseBtn) {
      adminQuickPauseBtn.classList.add("hidden");
    }
  }
}

// ---------------------------------------------------------------------------
// TOAST NOTIFICATION & FEEDBACK
// ---------------------------------------------------------------------------
function showToast(text, duration = 2200) {
  if (!toastNotification || !toastMessage) return;
  toastMessage.textContent = text;
  toastNotification.classList.remove("hidden");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastNotification.classList.add("hidden");
  }, duration);
}

// Helper para obter URL completa de convite da sala
function getRoomInviteURL() {
  const url = new URL(window.location.href);
  if (currentRoomId) {
    url.searchParams.set("room", currentRoomId);
  }
  return url.toString();
}

// Compartilhar / Copiar Link com suporte a Web Share API
async function shareRoomLink() {
  const inviteUrl = getRoomInviteURL();

  if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({
        title: `Caça aos Bugs - Sala ${currentRoomId || ""}`,
        text: `Venha jogar Caça aos Bugs comigo na sala ${currentRoomId || ""}!`,
        url: inviteUrl,
      });
      showToast("Link compartilhado com sucesso!");
      return;
    } catch (_) {}
  }

  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast("Link da sala copiado!");
  } catch (_) {
    const input = document.createElement("input");
    input.value = inviteUrl;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("Link da sala copiado!");
  }
}

if (roomBadge) {
  roomBadge.addEventListener("click", shareRoomLink);
}

// Controle de recolhimento do Placar
function toggleScoreboard() {
  if (scoreboardWidget) {
    scoreboardWidget.classList.toggle("collapsed");
  }
}

if (scoreboardHeader) {
  scoreboardHeader.addEventListener("click", toggleScoreboard);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
  setTimeout(resizeCanvas, 150);
});
resizeCanvas();

// ---------------------------------------------------------------------------
// GERENCIAMENTO DE SALAS & LOBBY INICIAL
// ---------------------------------------------------------------------------
function generateRandomRoomId() {
  return "bug-" + Math.floor(100 + Math.random() * 900);
}

function getRoomFromURL() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room ? room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) : null;
}

function joinRoom(roomId) {
  if (lobbyRoomsInterval) {
    clearInterval(lobbyRoomsInterval);
    lobbyRoomsInterval = null;
  }

  const cleanRoom = (roomId || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "geral";
  currentRoomId = cleanRoom;

  const url = new URL(window.location.href);
  url.searchParams.set("room", cleanRoom);
  window.history.pushState(null, "", url.toString());

  if (roomNameText) roomNameText.textContent = cleanRoom;
  if (lobbyOverlay) lobbyOverlay.classList.add("hidden");
  if (roomFullOverlay) roomFullOverlay.classList.add("hidden");

  initWebSocket(cleanRoom);
}
window.joinRoom = joinRoom;

async function fetchActiveRooms() {
  if (!lobbyRoomsList) return;
  try {
    const res = await fetch("/api/rooms");
    if (!res.ok) throw new Error("Falha ao buscar salas");
    const roomsData = await res.json();

    if (!roomsData || roomsData.length === 0) {
      lobbyRoomsList.innerHTML = `<div class="lobby-rooms-empty"><span class="bujo-empty-icon">✎</span> Nenhuma sala ativa no momento.<br><small>Escreva a sua criando uma nova sala acima!</small></div>`;
      return;
    }

    lobbyRoomsList.innerHTML = roomsData
      .map((r) => {
        const isFull = r.isFull;
        const statusBadge = isFull
          ? `<span class="room-status-badge full">✕ Lotada</span>`
          : `<span class="room-status-badge open">✓ Aberta</span>`;
        return `
          <div class="lobby-room-item ${isFull ? 'full' : ''}">
            <div class="lobby-room-info">
              <div class="lobby-room-title">
                <span class="bujo-room-bullet">○</span>
                <strong class="bujo-room-code">${r.id}</strong>
                ${statusBadge}
              </div>
              <small class="bujo-room-meta">Rodada ${r.round}/${r.totalRounds} • <strong>${r.playerCount}/${r.maxPlayers}</strong> jogadores</small>
            </div>
            <button class="btn btn-sm ${isFull ? 'btn-secondary disabled bujo-btn-secondary' : 'btn-primary bujo-btn-stamp'}" 
                    ${isFull ? 'disabled' : ''} 
                    onclick="joinRoom('${r.id}')">
              ${isFull ? 'Lotada' : 'Entrar ➔'}
            </button>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    lobbyRoomsList.innerHTML = `<div class="lobby-rooms-empty"><span class="bujo-empty-icon">⚠</span> Erro ao carregar lista de salas.</div>`;
  }
}

// Ações do Lobby
if (lobbyCreateBtn) {
  lobbyCreateBtn.addEventListener("click", () => {
    const newRoom = generateRandomRoomId();
    joinRoom(newRoom);
  });
}

if (lobbyRefreshRoomsBtn) {
  lobbyRefreshRoomsBtn.addEventListener("click", () => {
    fetchActiveRooms();
  });
}

if (lobbyJoinForm) {
  lobbyJoinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = lobbyRoomInput.value.trim();
    if (code) {
      joinRoom(code);
    }
  });
}

// Ações do Modal de Sala Cheia
if (roomFullCreateBtn) {
  roomFullCreateBtn.addEventListener("click", () => {
    const newRoom = generateRandomRoomId();
    joinRoom(newRoom);
  });
}

if (roomFullLobbyBtn) {
  roomFullLobbyBtn.addEventListener("click", () => {
    window.location.search = "";
  });
}

// ---------------------------------------------------------------------------
// CONTROLES DO ADMIN MASTER
// ---------------------------------------------------------------------------
function setAdminState(isAdmin) {
  amIAdmin = isAdmin;
  if (isAdmin) {
    adminControls.classList.remove("hidden");
    if (centerAdminStart) centerAdminStart.classList.remove("hidden");
    if (centerWaitingStart) centerWaitingStart.classList.add("hidden");

    if (isGamePaused) {
      pauseAdminActions.classList.remove("hidden");
      pauseWaitingText.classList.add("hidden");
    }

    if (!victoryModal.classList.contains("hidden")) {
      victoryAdminActions.classList.remove("hidden");
      victoryWaitingText.classList.add("hidden");
    }

    if (document.body.classList.contains("round-playing") && adminQuickPauseBtn) {
      adminQuickPauseBtn.classList.remove("hidden");
    }
  } else {
    adminControls.classList.add("hidden");
    if (centerAdminStart) centerAdminStart.classList.add("hidden");
    if (centerWaitingStart) centerWaitingStart.classList.remove("hidden");

    if (isGamePaused) {
      pauseAdminActions.classList.add("hidden");
      pauseWaitingText.classList.remove("hidden");
    }

    if (!victoryModal.classList.contains("hidden")) {
      victoryAdminActions.classList.add("hidden");
      victoryWaitingText.classList.remove("hidden");
    }

    if (adminQuickPauseBtn) {
      adminQuickPauseBtn.classList.add("hidden");
    }
  }
}

// Disparo manual para iniciar nova partida (Admin Master)
function triggerStartMatch() {
  if (!amIAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
  hideVictoryModal();
  if (centerInstructions) centerInstructions.classList.add("hidden");
  ws.send(JSON.stringify({ type: "admin_start_match" }));
}

if (centerStartMatchBtn) {
  centerStartMatchBtn.addEventListener("click", triggerStartMatch);
}
if (victoryStartMatchBtn) {
  victoryStartMatchBtn.addEventListener("click", triggerStartMatch);
}

adminPauseBtn.addEventListener("click", () => {
  if (!amIAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "admin_toggle_pause" }));
});

if (adminQuickPauseBtn) {
  adminQuickPauseBtn.addEventListener("click", () => {
    if (!amIAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "admin_toggle_pause" }));
  });
}

modalResumeBtn.addEventListener("click", () => {
  if (!amIAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "admin_toggle_pause" }));
});

adminResetBtn.addEventListener("click", () => {
  if (!amIAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (confirm("Deseja reiniciar a partida do zero (Rodada 1 e zerar placar)?")) {
    ws.send(JSON.stringify({ type: "admin_reset_game" }));
  }
});

modalResetBtn.addEventListener("click", () => {
  if (!amIAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (confirm("Deseja reiniciar a partida do zero (Rodada 1 e zerar placar)?")) {
    ws.send(JSON.stringify({ type: "admin_reset_game" }));
  }
});

function applyPauseState(isPaused, pausedBy) {
  isGamePaused = isPaused;

  if (isPaused) {
    setRoundActiveState(false);
    pauseSubtitle.innerHTML = `O <strong>${pausedBy || "Admin Master"}</strong> pausou a partida.`;
    pauseOverlay.classList.remove("hidden");
    bugsContainer.classList.add("paused");
    roundTimerText.classList.add("paused");

    if (amIAdmin) {
      pauseAdminActions.classList.remove("hidden");
      pauseWaitingText.classList.add("hidden");
    } else {
      pauseAdminActions.classList.add("hidden");
      pauseWaitingText.classList.remove("hidden");
    }

    const now = Date.now();
    for (const [, bugObj] of localBugs.entries()) {
      bugObj.pausedAt = now;
      cancelAnimationFrame(bugObj.animFrame);
    }
  } else {
    pauseOverlay.classList.add("hidden");
    bugsContainer.classList.remove("paused");
    roundTimerText.classList.remove("paused");

    const now = Date.now();
    for (const [, bugObj] of localBugs.entries()) {
      if (bugObj.pausedAt) {
        bugObj.startTime += now - bugObj.pausedAt;
        bugObj.pausedAt = null;
      }
      resumeBugAnimation(bugObj);
    }
    setRoundActiveState(true);
  }
}

// ---------------------------------------------------------------------------
// PLACAR DE BUGS (LEADERBOARD)
// ---------------------------------------------------------------------------
function renderScoreboard(scoreboardData) {
  if (!scoreboardData || scoreboardData.length === 0) {
    scoreboardList.innerHTML = `<div class="scoreboard-empty">Aguardando início...</div>`;
    return;
  }

  const sorted = [...scoreboardData].sort((a, b) => (b.score || 0) - (a.score || 0));

  scoreboardList.innerHTML = sorted
    .map((player, index) => {
      const isMe = player.id === myId;
      const rankClass = index === 0 ? "rank-gold" : index === 1 ? "rank-silver" : index === 2 ? "rank-bronze" : "rank-num";
      const rankText = `${index + 1}º`;
      const adminBadge = player.isAdmin
        ? `<svg class="crown-svg" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5" title="Admin Master"><polygon points="2 4 5 18 19 18 22 4 15 10 12 2 9 10 2 4"/></svg>`
        : "";
      const displayName = isMe ? `${player.name || "Você"} (Você)` : (player.name || "Amigo");

      return `
        <div class="scoreboard-item ${isMe ? 'is-me' : ''}">
          <div class="scoreboard-player" title="${displayName}">
            <span class="scoreboard-rank ${rankClass}">${rankText}</span>
            <span class="scoreboard-color" style="background-color: ${player.color || '#0284c7'}"></span>
            <span class="player-name">${displayName}</span>
            ${adminBadge}
          </div>
          <span class="scoreboard-score">${player.score || 0}</span>
        </div>
      `;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// CUSTOMIZAÇÃO DE NOME E COR
// ---------------------------------------------------------------------------
function updateLocalProfileUI() {
  if (myName) nameInput.value = myName;
  if (myColor) {
    colorPicker.value = myColor;
    myColorSwatch.style.backgroundColor = myColor;
  }
}

nameInput.addEventListener("input", (e) => {
  myName = e.target.value.trim() || `Você (${myId ? myId.slice(-4) : "..."})`;
  localStorage.setItem("webrtc_user_name", myName);
  broadcastProfileChange();
});

colorPicker.addEventListener("input", (e) => {
  myColor = e.target.value;
  myColorSwatch.style.backgroundColor = myColor;
  localStorage.setItem("webrtc_user_color", myColor);
  broadcastProfileChange();
});

function broadcastProfileChange() {
  broadcastP2P({
    type: "profile_update",
    name: myName,
    color: myColor,
  });

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "update_profile",
        name: myName,
        color: myColor,
      })
    );
  }
}

// ============================================================================
// MECÂNICA DOS BUGS / INSETOS NO BULLET JOURNAL
// ============================================================================
function getBugSVG(bugType) {
  if (bugType === "golden") {
    return `
      <svg class="bug-svg golden-bug-svg" viewBox="0 0 64 64" fill="none">
        <defs>
          <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#fef08a"/>
            <stop offset="60%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#b45309"/>
          </radialGradient>
        </defs>
        <path d="M16 22 L6 14 M14 32 L4 32 M16 42 L6 50 M48 22 L58 14 M50 32 L60 32 M48 42 L58 50" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
        <path d="M28 16 Q24 6 18 8 M36 16 Q40 6 46 8" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="32" cy="18" r="7" fill="#fbbf24" stroke="#d97706" stroke-width="2"/>
        <ellipse cx="32" cy="38" rx="15" ry="17" fill="url(#goldGlow)" stroke="#d97706" stroke-width="2.5"/>
        <line x1="32" y1="21" x2="32" y2="55" stroke="#78350f" stroke-width="2.5"/>
        <circle cx="26" cy="32" r="3" fill="#ffffff"/>
        <circle cx="38" cy="32" r="3" fill="#ffffff"/>
        <circle cx="25" cy="44" r="2.5" fill="#fef08a"/>
        <circle cx="39" cy="44" r="2.5" fill="#fef08a"/>
        <polygon points="32,28 35,33 32,38 29,33" fill="#ffffff"/>
      </svg>
    `;
  } else if (bugType === "ladybug") {
    return `
      <svg class="bug-svg" viewBox="0 0 64 64" fill="none">
        <path d="M16 22 L6 14 M14 32 L4 32 M16 42 L6 50 M48 22 L58 14 M50 32 L60 32 M48 42 L58 50" stroke="#2e2823" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M28 16 Q24 6 18 8 M36 16 Q40 6 46 8" stroke="#2e2823" stroke-width="2" stroke-linecap="round"/>
        <circle cx="32" cy="18" r="7" fill="#2e2823"/>
        <circle cx="32" cy="36" r="16" fill="#e11d48" stroke="#2e2823" stroke-width="2.5"/>
        <line x1="32" y1="20" x2="32" y2="52" stroke="#2e2823" stroke-width="2"/>
        <circle cx="26" cy="28" r="2.5" fill="#2e2823"/>
        <circle cx="38" cy="28" r="2.5" fill="#2e2823"/>
        <circle cx="24" cy="38" r="2.5" fill="#2e2823"/>
        <circle cx="40" cy="38" r="2.5" fill="#2e2823"/>
        <circle cx="28" cy="46" r="2" fill="#2e2823"/>
        <circle cx="36" cy="46" r="2" fill="#2e2823"/>
      </svg>
    `;
  } else if (bugType === "spider") {
    return `
      <svg class="bug-svg" viewBox="0 0 64 64" fill="none">
        <path d="M20 20 Q8 10 4 18 M20 28 Q6 24 2 32 M20 36 Q6 40 4 46 M20 44 Q10 54 8 60" stroke="#3f3830" stroke-width="2" stroke-linecap="round"/>
        <path d="M44 20 Q56 10 60 18 M44 28 Q58 24 62 32 M44 36 Q58 40 60 46 M44 44 Q54 54 56 60" stroke="#3f3830" stroke-width="2" stroke-linecap="round"/>
        <circle cx="32" cy="24" r="7" fill="#2e2823"/>
        <ellipse cx="32" cy="40" rx="11" ry="13" fill="#1c1917" stroke="#3f3830" stroke-width="2"/>
        <circle cx="30" cy="22" r="1.5" fill="#facc15"/>
        <circle cx="34" cy="22" r="1.5" fill="#facc15"/>
      </svg>
    `;
  } else if (bugType === "moth") {
    return `
      <svg class="bug-svg" viewBox="0 0 64 64" fill="none">
        <path d="M30 16 Q20 4 14 6 M34 16 Q44 4 50 6" stroke="#574c43" stroke-width="2" stroke-linecap="round"/>
        <path d="M32 26 Q12 14 6 28 Q4 42 32 38" fill="#d6cfc7" stroke="#574c43" stroke-width="2"/>
        <path d="M32 26 Q52 14 58 28 Q60 42 32 38" fill="#d6cfc7" stroke="#574c43" stroke-width="2"/>
        <ellipse cx="32" cy="34" rx="5" ry="14" fill="#574c43"/>
      </svg>
    `;
  } else {
    return `
      <svg class="bug-svg" viewBox="0 0 64 64" fill="none">
        <path d="M18 20 L8 12 M16 32 L4 32 M18 44 L8 52 M46 20 L56 12 M48 32 L60 32 M46 44 L56 52" stroke="#2e2823" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M28 16 Q22 4 16 6 M36 16 Q42 4 48 6" stroke="#2e2823" stroke-width="2" stroke-linecap="round"/>
        <path d="M24 20 Q32 14 40 20 L38 26 L26 26 Z" fill="#2e2823"/>
        <ellipse cx="32" cy="38" rx="14" ry="16" fill="#15803d" stroke="#1c1917" stroke-width="2.5"/>
        <line x1="32" y1="26" x2="32" y2="54" stroke="#1c1917" stroke-width="2"/>
      </svg>
    `;
  }
}

function createBugElement(bugData) {
  if (localBugs.has(bugData.id)) return;

  const bugEl = document.createElement("div");
  bugEl.className = `bug ${bugData.isCrazy ? "crazy" : ""} ${bugData.isGolden ? "golden" : ""}`;
  bugEl.id = bugData.id;

  const startXNorm = bugData.startX;
  const startYNorm = bugData.startY;
  const targetXNorm = bugData.targetX;
  const targetYNorm = bugData.targetY;

  const angleRad = Math.atan2(
    (targetYNorm - startYNorm) * window.innerHeight,
    (targetXNorm - startXNorm) * window.innerWidth
  );
  const angleDeg = (angleRad * 180) / Math.PI + 90;

  bugEl.innerHTML = `
    <div class="bug-inner" style="transform: rotate(${angleDeg}deg)">
      ${getBugSVG(bugData.bugType)}
    </div>
  `;

  bugsContainer.appendChild(bugEl);

  const startTime = Date.now();
  const durationMs = bugData.duration * 1000;

  const bugObj = {
    el: bugEl,
    id: bugData.id,
    startXNorm,
    startYNorm,
    targetXNorm,
    targetYNorm,
    startTime,
    durationMs,
    pausedAt: null,
    animFrame: null,
  };

  localBugs.set(bugData.id, bugObj);

  function handleBugHit(e) {
    e.preventDefault();
    e.stopPropagation();

    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2);

    smashBug(bugData.id, clientX, clientY);
    createClickRipple(clientX, clientY, myColor);
    broadcastP2P({
      type: "click",
      x: clientX / window.innerWidth,
      y: clientY / window.innerHeight,
    });
  }

  bugEl.addEventListener("pointerdown", handleBugHit);

  if (!isGamePaused) {
    resumeBugAnimation(bugObj);
  }
}

function resumeBugAnimation(bugObj) {
  function animate() {
    if (isGamePaused) return;

    const elapsed = Date.now() - bugObj.startTime;
    const progress = Math.min(elapsed / bugObj.durationMs, 1);

    const normX = bugObj.startXNorm + (bugObj.targetXNorm - bugObj.startXNorm) * progress;
    const normY = bugObj.startYNorm + (bugObj.targetYNorm - bugObj.startYNorm) * progress;

    const currentX = normX * window.innerWidth;
    const currentY = normY * window.innerHeight;

    bugObj.el.style.left = `${currentX}px`;
    bugObj.el.style.top = `${currentY}px`;

    if (progress < 1 && !bugObj.el.classList.contains("splatted")) {
      bugObj.animFrame = requestAnimationFrame(animate);
    } else if (progress >= 1 && !bugObj.el.classList.contains("splatted")) {
      bugObj.el.remove();
      localBugs.delete(bugObj.id);
    }
  }

  bugObj.animFrame = requestAnimationFrame(animate);
}

function smashBug(bugId, clickX, clickY) {
  if (isGamePaused || !ws || ws.readyState !== WebSocket.OPEN) return;

  const bugObj = localBugs.get(bugId);
  if (!bugObj || bugObj.el.classList.contains("splatted")) return;

  ws.send(
    JSON.stringify({
      type: "bug_hit",
      bugId: bugId,
      x: clickX,
      y: clickY,
    })
  );
}

function handleBugKilled(data) {
  const { bugId, shooterName, shooterColor, x, y, scoreboard, isGolden, pointsEarned } = data;
  const bugObj = localBugs.get(bugId);

  let posX = x;
  let posY = y;

  if (bugObj && bugObj.el) {
    const rect = bugObj.el.getBoundingClientRect();
    posX = rect.left + rect.width / 2;
    posY = rect.top + rect.height / 2;

    bugObj.el.classList.add("splatted");
    cancelAnimationFrame(bugObj.animFrame);

    setTimeout(() => {
      if (bugObj.el) bugObj.el.remove();
      localBugs.delete(bugId);
    }, 600);
  }

  if (posX === undefined || posY === undefined || isNaN(posX)) {
    posX = window.innerWidth / 2;
    posY = window.innerHeight / 2;
  }

  if (isGolden) {
    createInkSplat(posX, posY, "#f59e0b");
    createScorePopup(posX, posY, `+${pointsEarned || 2} DOURADO!`, "#f59e0b", true);
  } else {
    createInkSplat(posX, posY, shooterColor);
    createScorePopup(posX, posY, `+${pointsEarned || 1} ${shooterName}!`, shooterColor, false);
  }

  renderScoreboard(scoreboard);
}

function createInkSplat(x, y, color) {
  const splat = document.createElement("div");
  splat.className = "ink-splat";
  splat.style.left = `${x}px`;
  splat.style.top = `${y}px`;
  splat.style.backgroundColor = color || "#0284c7";
  document.body.appendChild(splat);
  setTimeout(() => splat.remove(), 700);
}

function createScorePopup(x, y, text, color, isGold = false) {
  const popup = document.createElement("div");
  popup.className = `score-popup ${isGold ? 'golden-popup' : ''}`;
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
  popup.style.backgroundColor = color || "#0284c7";
  popup.textContent = text;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}

function clearAllBugs() {
  for (const [, bugObj] of localBugs.entries()) {
    cancelAnimationFrame(bugObj.animFrame);
    if (bugObj.el) bugObj.el.remove();
  }
  localBugs.clear();
}

// ============================================================================
// CONEXÃO COM O SERVIDOR WEBSOCKET POR SALA
// ============================================================================
function initWebSocket(roomId) {
  if (ws) {
    try { ws.close(); } catch (_) {}
  }

  for (const [id] of peers.entries()) {
    removePeer(id);
  }
  clearAllBugs();

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {};

  ws.onclose = () => {
    setRoundActiveState(false);
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "welcome":
        myId = msg.myId;
        currentRoomId = msg.roomId || roomId;
        if (roomNameText) roomNameText.textContent = currentRoomId;
        if (roomCountText) {
          roomCountText.textContent = `${(msg.existingPeers?.length || 0) + 1}/${msg.maxPlayers || 8}`;
        }

        if (!myColor) myColor = msg.defaultColor;
        if (!myName) myName = `Você (${myId.slice(-4)})`;
        updateLocalProfileUI();
        setAdminState(msg.isAdmin);

        ws.send(
          JSON.stringify({
            type: "update_profile",
            name: myName,
            color: myColor,
          })
        );

        renderScoreboard(msg.scoreboard);

        updateRoundHeader(msg.round, msg.totalRounds);
        if (msg.timeLeft !== undefined) updateRoundTimer(msg.timeLeft);

        if (msg.status === "waiting_start") {
          setRoundActiveState(false);
          if (centerInstructions) centerInstructions.classList.remove("hidden");
        } else if (msg.status === "round_delay") {
          setRoundActiveState(false);
          if (centerInstructions) centerInstructions.classList.add("hidden");
          showRoundDelayBanner(msg.round, msg.totalRounds, msg.delaySeconds);
        } else if (msg.status === "round_playing" && !msg.isPaused) {
          setRoundActiveState(true);
          if (centerInstructions) centerInstructions.classList.add("hidden");
        }

        if (msg.isPaused) {
          applyPauseState(true, "Admin Master");
        }

        if (msg.activeBugs) {
          msg.activeBugs.forEach(createBugElement);
        }

        for (const peer of msg.existingPeers) {
          getOrCreatePeer(peer.id, peer.color, peer.name, true);
        }
        break;

      case "room_full":
        setRoundActiveState(false);
        if (roomFullMessage) {
          roomFullMessage.textContent = msg.message || `A sala "${roomId}" está cheia (${msg.maxPlayers || 8}/${msg.maxPlayers || 8} jogadores).`;
        }
        if (roomFullOverlay) {
          roomFullOverlay.classList.remove("hidden");
        }
        break;

      case "you_are_admin":
        setAdminState(msg.isAdmin);
        break;

      case "game_pause_toggled":
        applyPauseState(msg.isPaused, msg.pausedBy);
        break;

      case "round_preparing":
        setRoundActiveState(false);
        clearAllBugs();
        hideVictoryModal();
        if (centerInstructions) centerInstructions.classList.add("hidden");
        updateRoundHeader(msg.round, msg.totalRounds);
        renderScoreboard(msg.scoreboard);
        showRoundDelayBanner(msg.round, msg.totalRounds, msg.delaySeconds);
        break;

      case "round_preparing_tick":
        if (roundDelayCount) {
          roundDelayCount.textContent = msg.delaySeconds;
        }
        break;

      case "round_started":
        hideRoundBanner();
        setRoundActiveState(true);
        updateRoundHeader(msg.round, msg.totalRounds);
        updateRoundTimer(msg.timeLeft);
        break;

      case "round_tick":
        updateRoundHeader(msg.round, msg.totalRounds);
        if (!isGamePaused) updateRoundTimer(msg.timeLeft);
        break;

      case "spawn_bug":
        createBugElement(msg.bug);
        break;

      case "bug_killed":
        handleBugKilled(msg);
        break;

      case "round_ended":
        setRoundActiveState(false);
        clearAllBugs();
        renderScoreboard(msg.scoreboard);
        break;

      case "game_over":
        setRoundActiveState(false);
        clearAllBugs();
        hideRoundBanner();
        renderScoreboard(msg.scoreboard);
        showVictoryModal(msg.winner, msg.scoreboard);
        break;

      case "peer-joined":
        if (roomCountText) {
          roomCountText.textContent = `${msg.totalPlayers || (peers.size + 1)}/${msg.maxPlayers || 8}`;
        }
        getOrCreatePeer(msg.peerId, msg.color, msg.name, false);
        if (msg.scoreboard) renderScoreboard(msg.scoreboard);
        break;

      case "peer_profile_updated":
        updatePeerProfile(msg.peerId, msg.name, msg.color);
        if (msg.scoreboard) renderScoreboard(msg.scoreboard);
        break;

      case "peer-left":
        removePeer(msg.peerId);
        if (roomCountText) {
          roomCountText.textContent = `${msg.totalPlayers || (peers.size + 1)}/${msg.maxPlayers || 8}`;
        }
        if (msg.scoreboard) renderScoreboard(msg.scoreboard);
        break;

      case "signal":
        handleSignalingData(msg.senderId, msg.signalType, msg.data);
        break;
    }
  };
}

function showRoundDelayBanner(round, totalRounds, delaySeconds) {
  if (!roundBanner) return;
  roundBannerTitle.textContent = `Preparando Rodada ${round} de ${totalRounds || 3}`;
  if (roundDelayCount) roundDelayCount.textContent = delaySeconds || 6;
  roundBannerSubtitle.textContent = "Prepare-se para esmagar os bugs!";
  roundBanner.classList.remove("hidden");
}

function updateRoundHeader(round, totalRounds) {
  const total = totalRounds || 3;
  const isMobile = window.innerWidth < 480;

  if (round === 3) {
    roundBadge.classList.add("chaos");
    roundNumberText.textContent = isMobile ? "R3 (CAOS)" : "Rodada 3 (CAOS)";
  } else {
    roundBadge.classList.remove("chaos");
    roundNumberText.textContent = isMobile ? `${round} / ${total}` : `Rodada ${round} / ${total}`;
  }
}

function updateRoundTimer(seconds) {
  roundTimerText.textContent = `${seconds}s`;
  if (seconds <= 5 && seconds > 0) {
    roundTimerText.classList.add("urgent");
  } else {
    roundTimerText.classList.remove("urgent");
  }
}

function hideRoundBanner() {
  if (roundBanner) roundBanner.classList.add("hidden");
}

// Modal de Grande Campeão (Sem reinício automático)
function showVictoryModal(winner, scoreboard) {
  winnerName.textContent = winner?.name || "Nenhum vencedor";
  winnerName.style.color = winner?.color || "#2e2823";
  winnerScoreBadge.textContent = `${winner?.score || 0} bugs esmagados!`;

  const top3 = (scoreboard || []).slice(0, 3);
  const rankLabels = ["1º", "2º", "3º"];
  const rankStyles = ["color: #f59e0b;", "color: #94a3b8;", "color: #b45309;"];

  victoryPodium.innerHTML = top3
    .map((player, idx) => {
      return `
        <div class="podium-row">
          <div class="podium-player">
            <span class="podium-badge" style="${rankStyles[idx]} font-weight: 800;">${rankLabels[idx]}</span>
            <span style="color: ${player.color || '#2e2823'}">${player.name}</span>
          </div>
          <strong>${player.score || 0} bugs</strong>
        </div>
      `;
    })
    .join("");

  if (amIAdmin) {
    victoryAdminActions.classList.remove("hidden");
    victoryWaitingText.classList.add("hidden");
  } else {
    victoryAdminActions.classList.add("hidden");
    victoryWaitingText.classList.remove("hidden");
  }

  victoryModal.classList.remove("hidden");
}

function hideVictoryModal() {
  victoryModal.classList.add("hidden");
}

function sendWSSignal(targetId, signalType, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        targetId: targetId,
        type: signalType,
        data: data,
      })
    );
  }
}

// ============================================================================
// GERENCIADOR DE PEER WEBRTC
// ============================================================================
function getOrCreatePeer(peerId, color, name, isInitiator) {
  if (peers.has(peerId)) {
    return peers.get(peerId);
  }

  const initialColor = color || "#e11d48";
  const initialName = name || `Amigo (${peerId.slice(-4)})`;

  const pc = new RTCPeerConnection(rtcConfig);
  const cursorEl = createCursorElement(peerId, initialColor, initialName);

  const peerObj = {
    pc: pc,
    channel: null,
    cursorEl: cursorEl,
    color: initialColor,
    name: initialName,
    candidatesQueue: [],
  };

  peers.set(peerId, peerObj);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendWSSignal(peerId, "candidate", event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "disconnected" ||
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      removePeer(peerId);
    }
  };

  if (isInitiator) {
    const channel = pc.createDataChannel("mouse-sync", {
      ordered: false,
      maxRetransmits: 0,
    });
    peerObj.channel = channel;
    setupDataChannelEvents(channel, peerId, peerObj);

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        sendWSSignal(peerId, "offer", pc.localDescription);
      })
      .catch((err) => console.error("Erro na oferta:", err));
  } else {
    pc.ondatachannel = (event) => {
      peerObj.channel = event.channel;
      setupDataChannelEvents(event.channel, peerId, peerObj);
    };
  }

  return peerObj;
}

function setupDataChannelEvents(channel, peerId, peerObj) {
  channel.onopen = () => {
    try {
      channel.send(
        JSON.stringify({
          type: "profile_update",
          name: myName,
          color: myColor,
        })
      );
      channel.send(
        JSON.stringify({
          type: "mouse",
          x: currentMousePos.x,
          y: currentMousePos.y,
        })
      );
      p2pMessagesSent += 2;
    } catch (_) {}
  };

  channel.onclose = () => {};

  channel.onmessage = (event) => {
    p2pMessagesReceived++;
    try {
      const data = JSON.parse(event.data);

      if (data.type === "mouse") {
        updateRemoteCursorPosition(peerId, data.x, data.y);
      } else if (data.type === "click") {
        createClickRipple(
          data.x * window.innerWidth,
          data.y * window.innerHeight,
          peerObj.color
        );
      } else if (data.type === "profile_update") {
        updatePeerProfile(peerId, data.name, data.color);
      }
    } catch (err) {
      console.error("Erro no pacote P2P:", err);
    }
  };
}

// ============================================================================
// SINAIS SDP E CANDIDATOS ICE
// ============================================================================
async function handleSignalingData(senderId, signalType, data) {
  let peer = peers.get(senderId);

  if (!peer) {
    peer = getOrCreatePeer(senderId, "#e11d48", `Amigo (${senderId.slice(-4)})`, false);
  }

  const pc = peer.pc;

  try {
    if (signalType === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data));

      while (peer.candidatesQueue.length > 0) {
        const cand = peer.candidatesQueue.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWSSignal(senderId, "answer", pc.localDescription);
    } else if (signalType === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data));

      while (peer.candidatesQueue.length > 0) {
        const cand = peer.candidatesQueue.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }
    } else if (signalType === "candidate") {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(data));
      } else {
        peer.candidatesQueue.push(data);
      }
    }
  } catch (err) {
    console.error("Erro ao processar sinal:", err);
  }
}

function updatePeerProfile(peerId, newName, newColor) {
  const peer = peers.get(peerId);
  if (!peer) return;

  if (newName) peer.name = newName;
  if (newColor) peer.color = newColor;

  if (peer.cursorEl) {
    const svgPath = peer.cursorEl.querySelector("path");
    if (svgPath) svgPath.setAttribute("fill", peer.color);

    const label = peer.cursorEl.querySelector(".cursor-label");
    if (label) {
      label.textContent = peer.name;
      label.style.backgroundColor = peer.color;
    }
  }
}

function removePeer(peerId) {
  const peer = peers.get(peerId);
  if (peer) {
    if (peer.cursorEl) peer.cursorEl.remove();
    if (peer.channel) {
      try { peer.channel.close(); } catch (_) {}
    }
    if (peer.pc) {
      try { peer.pc.close(); } catch (_) {}
    }
    peers.delete(peerId);
  }
}

// ============================================================================
// RENDERIZAÇÃO VISUAL DO CURSOR
// ============================================================================
function createCursorElement(peerId, color, name) {
  const existing = document.getElementById(`cursor-${peerId}`);
  if (existing) existing.remove();

  const cursor = document.createElement("div");
  cursor.className = "remote-cursor";
  cursor.id = `cursor-${peerId}`;

  cursor.innerHTML = `
    <svg class="cursor-pointer" viewBox="0 0 24 24" fill="none">
      <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" 
            fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
    </svg>
    <div class="cursor-label" style="background-color: ${color}">${name}</div>
  `;

  cursorsContainer.appendChild(cursor);
  return cursor;
}

function updateRemoteCursorPosition(peerId, normalizedX, normalizedY) {
  const peer = peers.get(peerId);
  if (!peer || !peer.cursorEl) return;

  const actualX = normalizedX * window.innerWidth;
  const actualY = normalizedY * window.innerHeight;

  peer.cursorEl.classList.add("visible");
  peer.cursorEl.style.transform = `translate3d(${actualX}px, ${actualY}px, 0)`;
}

function createClickRipple(x, y, color) {
  const ripple = document.createElement("div");
  ripple.className = "click-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.backgroundColor = color || "#0284c7";
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
}

// ============================================================================
// CAPTURA DO MOUSE / TOQUE LOCAL E TRANSMISSÃO P2P (60 FPS)
// ============================================================================
let pendingFrame = false;

function handlePointerMove(clientX, clientY) {
  currentMousePos = {
    x: clientX / window.innerWidth,
    y: clientY / window.innerHeight,
  };

  if (!pendingFrame) {
    pendingFrame = true;
    requestAnimationFrame(() => {
      broadcastP2P({
        type: "mouse",
        x: currentMousePos.x,
        y: currentMousePos.y,
      });
      pendingFrame = false;
    });
  }
}

window.addEventListener("pointermove", (event) => {
  handlePointerMove(event.clientX, event.clientY);
});

window.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest(
      "header, .scoreboard-widget, .admin-quick-pause, .victory-card, .pause-card, .lobby-card, .room-full-card, button, input"
    )
  ) {
    return;
  }

  const clientX = event.clientX;
  const clientY = event.clientY;

  handlePointerMove(clientX, clientY);
  createClickRipple(clientX, clientY, myColor);
  broadcastP2P({
    type: "click",
    x: clientX / window.innerWidth,
    y: clientY / window.innerHeight,
  });
});

function broadcastP2P(data) {
  const message = JSON.stringify(data);
  for (const peer of peers.values()) {
    if (peer.channel && peer.channel.readyState === "open") {
      try {
        peer.channel.send(message);
        p2pMessagesSent++;
      } catch (err) {
        console.error("Erro ao enviar P2P:", err);
      }
    }
  }
}

// ============================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ============================================================================
const initialRoom = getRoomFromURL();
if (initialRoom) {
  joinRoom(initialRoom);
} else {
  if (lobbyOverlay) {
    lobbyOverlay.classList.remove("hidden");
    fetchActiveRooms();
    lobbyRoomsInterval = setInterval(fetchActiveRooms, 4000);
  }
}
