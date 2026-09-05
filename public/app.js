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

// Estado de Audio Local
let localAudioStream = null;
let isMicMuted = false;
let isAudioDeafened = false;

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
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const roomNameText = document.getElementById("roomNameText");
const roomCountText = document.getElementById("roomCountText");
const lobbyOverlay = document.getElementById("lobbyOverlay");
const lobbyCreateBtn = document.getElementById("lobbyCreateBtn");
const lobbyJoinForm = document.getElementById("lobbyJoinForm");
const lobbyRoomInput = document.getElementById("lobbyRoomInput");
const lobbyRoomsList = document.getElementById("lobbyRoomsList");
const lobbyRefreshRoomsBtn = document.getElementById("lobbyRefreshRoomsBtn");
const lobbyOpenProfileBtn = document.getElementById("lobbyOpenProfileBtn");
const lobbyProfilePillSwatch = document.getElementById("lobbyProfilePillSwatch");
const lobbyProfilePillName = document.getElementById("lobbyProfilePillName");

// Elementos do Mini Modal de Perfil
const profileModal = document.getElementById("profileModal");
const colorPalettePresets = document.getElementById("colorPalettePresets");
const modalCustomColorPicker = document.getElementById("modalCustomColorPicker");
const modalCustomColorSwatch = document.getElementById("modalCustomColorSwatch");
const modalNameInput = document.getElementById("modalNameInput");
const profileModalSaveBtn = document.getElementById("profileModalSaveBtn");

const roomFullOverlay = document.getElementById("roomFullOverlay");
const roomFullMessage = document.getElementById("roomFullMessage");
const roomFullCreateBtn = document.getElementById("roomFullCreateBtn");
const roomFullLobbyBtn = document.getElementById("roomFullLobbyBtn");

const PRESET_COLORS = [
  "#0284c7", // Azul
  "#e11d48", // Vermelho
  "#16a34a", // Verde
  "#d97706", // Laranja
  "#7c3aed", // Roxo
  "#0d9488", // Teal
  "#ec4899", // Rosa
  "#eab308", // Amarelo
];

// Elementos de Controle de Audio (Canto Esquerdo)
const toggleMicBtn = document.getElementById("toggleMicBtn");
const iconMicActive = document.getElementById("iconMicActive");
const iconMicMuted = document.getElementById("iconMicMuted");
const micBtnLabel = document.getElementById("micBtnLabel");
const toggleAudioBtn = document.getElementById("toggleAudioBtn");
const iconAudioActive = document.getElementById("iconAudioActive");
const iconAudioMuted = document.getElementById("iconAudioMuted");
const audioBtnLabel = document.getElementById("audioBtnLabel");
const connectionStatusBadge = document.getElementById("connectionStatusBadge");

// Estado de Deteccao de Voz (VAD)
const speakingPeers = new Set();
let sharedAudioContext = null;
let localVadDetector = null;

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

  updateLocalProfileUI();
  initWebSocket(cleanRoom);
}
window.joinRoom = joinRoom;

function leaveRoom() {
  if (lobbyRoomsInterval) {
    clearInterval(lobbyRoomsInterval);
    lobbyRoomsInterval = null;
  }

  currentRoomId = null;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    try {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    } catch (_) {}
    ws = null;
  }

  for (const [id] of peers.entries()) {
    removePeer(id);
  }
  peers.clear();

  stopLocalAudioStream();
  clearAllBugs();

  setRoundActiveState(false);
  setAdminState(false);
  amIAdmin = false;

  if (connectionStatusBadge) connectionStatusBadge.classList.add("hidden");
  if (roundBanner) roundBanner.classList.add("hidden");
  if (victoryModal) victoryModal.classList.add("hidden");
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  if (roomFullOverlay) roomFullOverlay.classList.add("hidden");
  if (centerInstructions) centerInstructions.classList.add("hidden");

  window.history.pushState(null, "", window.location.pathname);

  if (roomNameText) roomNameText.textContent = "-";
  if (roomCountText) roomCountText.textContent = "0/8";

  if (lobbyOverlay) {
    lobbyOverlay.classList.remove("hidden");
    fetchActiveRooms();
    lobbyRoomsInterval = setInterval(fetchActiveRooms, 4000);
  }

  updateLocalProfileUI();
  showToast("Voce voltou para o menu inicial.");
}
window.leaveRoom = leaveRoom;

if (leaveRoomBtn) {
  leaveRoomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    leaveRoom();
  });
}

if (roomFullLobbyBtn) {
  roomFullLobbyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    leaveRoom();
  });
}

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
function updateScoreboardSpeakingState(playerId, isSpeaking) {
  if (isSpeaking) {
    speakingPeers.add(playerId);
  } else {
    speakingPeers.delete(playerId);
  }

  const itemEl = document.querySelector(`.scoreboard-item[data-player-id="${playerId}"]`);
  if (itemEl) {
    if (isSpeaking) {
      itemEl.classList.add("is-speaking");
      if (!itemEl.querySelector(".speaking-indicator-dot")) {
        const dot = document.createElement("span");
        dot.className = "speaking-indicator-dot";
        dot.title = "Falando...";
        itemEl.querySelector(".scoreboard-player")?.appendChild(dot);
      }
    } else {
      itemEl.classList.remove("is-speaking");
      itemEl.querySelector(".speaking-indicator-dot")?.remove();
    }
  }
}

function renderScoreboard(scoreboardData) {
  if (!scoreboardData || scoreboardData.length === 0) {
    scoreboardList.innerHTML = `<div class="scoreboard-empty">Aguardando início...</div>`;
    return;
  }

  const sorted = [...scoreboardData].sort((a, b) => (b.score || 0) - (a.score || 0));

  scoreboardList.innerHTML = sorted
    .map((player, index) => {
      const isMe = player.id === myId;
      const isSpeaking = speakingPeers.has(player.id);
      const rankClass = index === 0 ? "rank-gold" : index === 1 ? "rank-silver" : index === 2 ? "rank-bronze" : "rank-num";
      const rankText = `${index + 1}º`;
      const adminBadge = player.isAdmin
        ? `<svg class="crown-svg" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5" title="Admin Master"><polygon points="2 4 5 18 19 18 22 4 15 10 12 2 9 10 2 4"/></svg>`
        : "";
      const displayName = isMe ? `${player.name || "Você"} (Você)` : (player.name || "Amigo");
      const speakingDot = isSpeaking ? `<span class="speaking-indicator-dot" title="Falando..."></span>` : "";

      return `
        <div class="scoreboard-item ${isMe ? 'is-me' : ''} ${isSpeaking ? 'is-speaking' : ''}" data-player-id="${player.id}">
          <div class="scoreboard-player" title="${displayName}">
            <span class="scoreboard-rank ${rankClass}">${rankText}</span>
            <span class="scoreboard-color" style="background-color: ${player.color || '#0284c7'}"></span>
            <span class="player-name">${displayName}</span>
            ${adminBadge}
            ${speakingDot}
          </div>
          <span class="scoreboard-score">${player.score || 0}</span>
        </div>
      `;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// CUSTOMIZAÇÃO DE NOME E COR (SINCRONIZADA ENTRE LOBBY E JOGO)
// ---------------------------------------------------------------------------
function renderColorPalettePresets() {
  if (!colorPalettePresets) return;
  colorPalettePresets.innerHTML = PRESET_COLORS.map((hex) => {
    const isSelected = myColor && myColor.toLowerCase() === hex.toLowerCase();
    return `
      <button 
        type="button" 
        class="color-preset-btn ${isSelected ? 'selected' : ''}" 
        data-color="${hex}" 
        style="background-color: ${hex}" 
        title="Cor ${hex}" 
        aria-label="Escolher cor ${hex}">
      </button>
    `;
  }).join("");

  colorPalettePresets.querySelectorAll(".color-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedHex = btn.getAttribute("data-color");
      setLocalUserColor(selectedHex);
      renderColorPalettePresets();
    });
  });
}

function updateLocalProfileUI() {
  if (nameInput) nameInput.value = myName || "";
  if (modalNameInput) modalNameInput.value = myName || "";
  if (lobbyProfilePillName) {
    lobbyProfilePillName.textContent = myName ? myName : "Configurar Perfil";
  }

  if (myColor) {
    if (colorPicker) colorPicker.value = myColor;
    if (myColorSwatch) myColorSwatch.style.backgroundColor = myColor;
    if (lobbyProfilePillSwatch) lobbyProfilePillSwatch.style.backgroundColor = myColor;
    if (modalCustomColorPicker) modalCustomColorPicker.value = myColor;
    if (modalCustomColorSwatch) modalCustomColorSwatch.style.backgroundColor = myColor;
  }
}

function setLocalUserName(newName) {
  myName = newName.trim();
  localStorage.setItem("webrtc_user_name", myName);
  updateLocalProfileUI();
  broadcastProfileChange();
}

function setLocalUserColor(newColor) {
  myColor = newColor;
  localStorage.setItem("webrtc_user_color", myColor);
  updateLocalProfileUI();
  broadcastProfileChange();
}

function openProfileModal() {
  if (!profileModal) return;
  updateLocalProfileUI();
  renderColorPalettePresets();
  profileModal.classList.remove("hidden");
  if (modalNameInput) {
    setTimeout(() => modalNameInput.focus(), 80);
  }
}

function closeProfileModal() {
  if (!profileModal) return;
  profileModal.classList.add("hidden");
}

if (nameInput) {
  nameInput.addEventListener("input", (e) => setLocalUserName(e.target.value));
}

if (modalNameInput) {
  modalNameInput.addEventListener("input", (e) => setLocalUserName(e.target.value));
}

if (colorPicker) {
  colorPicker.addEventListener("input", (e) => setLocalUserColor(e.target.value));
}

if (modalCustomColorPicker) {
  modalCustomColorPicker.addEventListener("input", (e) => {
    setLocalUserColor(e.target.value);
    renderColorPalettePresets();
  });
}

if (lobbyOpenProfileBtn) {
  lobbyOpenProfileBtn.addEventListener("click", openProfileModal);
}

if (profileModalSaveBtn) {
  profileModalSaveBtn.addEventListener("click", closeProfileModal);
}

// Fechar modal ao clicar fora do card
if (profileModal) {
  profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) {
      closeProfileModal();
    }
  });
}

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
// CONEXÃO COM O SERVIDOR WEBSOCKET POR SALA E SESSAO PERSISTENTE
// ============================================================================
let mySessionId = sessionStorage.getItem("webrtc_bujo_session_id");
if (!mySessionId) {
  mySessionId = "sess_" + Math.random().toString(36).substring(2, 10);
  try {
    sessionStorage.setItem("webrtc_bujo_session_id", mySessionId);
  } catch (_) {}
}

let lastHeartbeatPong = Date.now();
let heartbeatInterval = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;

function startClientHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch (_) {}
    }
  }, 12000);
}

function scheduleReconnect(roomId) {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (connectionStatusBadge) connectionStatusBadge.classList.remove("hidden");
  const delay = Math.min(1000 * Math.pow(1.3, reconnectAttempts), 4000);
  reconnectAttempts++;
  reconnectTimeout = setTimeout(() => {
    if (currentRoomId) {
      initWebSocket(currentRoomId);
    }
  }, delay);
}

function handlePageForeground() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "ping" }));
    } catch (_) {}
  } else if (currentRoomId) {
    initWebSocket(currentRoomId);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    handlePageForeground();
  }
});

window.addEventListener("pageshow", () => {
  handlePageForeground();
});

window.addEventListener("resume", () => {
  handlePageForeground();
});

function initWebSocket(roomId) {
  if (ws) {
    try { ws.close(); } catch (_) {}
  }

  for (const [id] of peers.entries()) {
    removePeer(id);
  }
  clearAllBugs();

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(mySessionId)}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (connectionStatusBadge) connectionStatusBadge.classList.add("hidden");
    startClientHeartbeat();
  };

  ws.onclose = () => {
    setRoundActiveState(false);
    if (currentRoomId) {
      scheduleReconnect(currentRoomId);
    }
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "pong":
        lastHeartbeatPong = Date.now();
        break;
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

      case "admin_changed":
        setAdminState(msg.adminId === myId);
        if (msg.scoreboard) renderScoreboard(msg.scoreboard);
        break;

      case "peer-left":
        removePeer(msg.peerId);
        if (msg.adminId) {
          setAdminState(msg.adminId === myId);
        }
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

// ============================================================================
// GERENCIAMENTO DE AUDIO LOCAL (MICROFONE)
// ============================================================================
function getSharedAudioContext() {
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx();
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

function setupVoiceActivityDetector(stream, onSpeakingChange) {
  const audioCtx = getSharedAudioContext();
  if (!audioCtx || !stream) return null;

  try {
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let isCurrentlySpeaking = false;
    let silenceTimeout = null;
    let intervalId = null;

    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      if (avg > 15) {
        if (!isCurrentlySpeaking) {
          isCurrentlySpeaking = true;
          onSpeakingChange(true);
        }
        if (silenceTimeout) clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
          isCurrentlySpeaking = false;
          onSpeakingChange(false);
        }, 350);
      }
    };

    intervalId = setInterval(checkVolume, 90);

    return {
      destroy: () => {
        if (intervalId) clearInterval(intervalId);
        if (silenceTimeout) clearTimeout(silenceTimeout);
        try { source.disconnect(); } catch (_) {}
        try { analyser.disconnect(); } catch (_) {}
      },
    };
  } catch (err) {
    console.warn("Detector de voz VAD nao iniciado:", err.message);
    return null;
  }
}

function getSupportedMediaDevices() {
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
    return navigator.mediaDevices;
  }

  const legacyGetUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  if (legacyGetUserMedia) {
    return {
      getUserMedia: (constraints) =>
        new Promise((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        }),
    };
  }

  return null;
}

async function getOrCreateLocalAudioStream() {
  if (localAudioStream) {
    return localAudioStream;
  }

  // No iOS (Safari e Chrome), navigator.mediaDevices so existe sob conexao segura HTTPS ou localhost
  const isSecure = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const mediaDevices = getSupportedMediaDevices();

  if (!isSecure && window.location.protocol === "http:") {
    showToast("O microfone no celular requer conexao segura HTTPS. Acesse via Railway ou Cloudflare.");
    return null;
  }

  if (!mediaDevices) {
    showToast("Navegador sem suporte a captura de audio.");
    return null;
  }

  try {
    localAudioStream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    // Aplica o estado de mute inicial
    localAudioStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMuted;
    });

    attachLocalAudioToPeers();

    if (localVadDetector) {
      try { localVadDetector.destroy(); } catch (_) {}
    }
    localVadDetector = setupVoiceActivityDetector(localAudioStream, (speaking) => {
      if (!isMicMuted) {
        updateScoreboardSpeakingState(myId, speaking);
      } else {
        updateScoreboardSpeakingState(myId, false);
      }
    });

    return localAudioStream;
  } catch (err) {
    console.warn("Acesso ao microfone nao concedido ou indisponivel:", err.name, err.message);
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      showToast("Permissao de microfone negada nas configuracoes do navegador.");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      showToast("Nenhum microfone foi detectado no dispositivo.");
    } else {
      showToast("Microfone indisponivel no momento.");
    }
    localAudioStream = null;
    return null;
  }
}

function attachLocalAudioToPeers() {
  if (!localAudioStream) return;
  const audioTrack = localAudioStream.getAudioTracks()[0];
  if (!audioTrack) return;

  for (const [peerId, peerObj] of peers.entries()) {
    if (!peerObj.pc) continue;
    const senders = peerObj.pc.getSenders ? peerObj.pc.getSenders() : [];
    const hasAudioSender = senders.some((s) => s.track && s.track.kind === "audio");
    if (!hasAudioSender) {
      try {
        peerObj.pc.addTrack(audioTrack, localAudioStream);
        peerObj.pc
          .createOffer()
          .then((offer) => peerObj.pc.setLocalDescription(offer))
          .then(() => {
            sendWSSignal(peerId, "offer", peerObj.pc.localDescription);
          })
          .catch((err) => console.error("Erro ao renegociar audio:", err));
      } catch (err) {
        console.error("Erro ao adicionar track de audio:", err);
      }
    }
  }
}

function stopLocalAudioStream() {
  if (localVadDetector) {
    try { localVadDetector.destroy(); } catch (_) {}
    localVadDetector = null;
  }
  updateScoreboardSpeakingState(myId, false);

  if (localAudioStream) {
    localAudioStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_) {}
    });
    localAudioStream = null;
  }
}

async function toggleMicrophone() {
  if (!localAudioStream) {
    const stream = await getOrCreateLocalAudioStream();
    if (!stream) {
      updateMicUI(true);
      return;
    }
    isMicMuted = false;
    updateMicUI(false);
    showToast("Microfone conectado e ativado.");
    return;
  }

  isMicMuted = !isMicMuted;
  localAudioStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMicMuted;
  });

  if (isMicMuted) {
    updateScoreboardSpeakingState(myId, false);
  }

  updateMicUI(isMicMuted);
  showToast(isMicMuted ? "Microfone mutado." : "Microfone ativado.");
}

function updateMicUI(muted) {
  if (!toggleMicBtn) return;
  if (muted) {
    toggleMicBtn.classList.add("is-muted");
    if (iconMicActive) iconMicActive.classList.add("hidden");
    if (iconMicMuted) iconMicMuted.classList.remove("hidden");
    if (micBtnLabel) micBtnLabel.textContent = "Mudo";
  } else {
    toggleMicBtn.classList.remove("is-muted");
    if (iconMicActive) iconMicActive.classList.remove("hidden");
    if (iconMicMuted) iconMicMuted.classList.add("hidden");
    if (micBtnLabel) micBtnLabel.textContent = "Mic";
  }
}

function toggleAudioDeafen() {
  isAudioDeafened = !isAudioDeafened;

  for (const peerObj of peers.values()) {
    if (peerObj.audioEl) {
      peerObj.audioEl.muted = isAudioDeafened;
    }
  }

  updateAudioUI(isAudioDeafened);
  showToast(isAudioDeafened ? "Som da sala desativado." : "Som da sala ativado.");
}

function updateAudioUI(deafened) {
  if (!toggleAudioBtn) return;
  if (deafened) {
    toggleAudioBtn.classList.add("is-deafened");
    if (iconAudioActive) iconAudioActive.classList.add("hidden");
    if (iconAudioMuted) iconAudioMuted.classList.remove("hidden");
    if (audioBtnLabel) audioBtnLabel.textContent = "Mudo";
  } else {
    toggleAudioBtn.classList.remove("is-deafened");
    if (iconAudioActive) iconAudioActive.classList.remove("hidden");
    if (iconAudioMuted) iconAudioMuted.classList.add("hidden");
    if (audioBtnLabel) audioBtnLabel.textContent = "Som";
  }
}

if (toggleMicBtn) {
  toggleMicBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMicrophone();
  });
}

if (toggleAudioBtn) {
  toggleAudioBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAudioDeafen();
  });
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
    audioEl: null,
    color: initialColor,
    name: initialName,
    candidatesQueue: [],
  };

  peers.set(peerId, peerObj);

  // Anexa faixas de audio local se disponiveis
  if (localAudioStream) {
    localAudioStream.getAudioTracks().forEach((track) => {
      try {
        pc.addTrack(track, localAudioStream);
      } catch (_) {}
    });
  }

  // Evento de recepcao de audio remoto
  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      if (!peerObj.audioEl) {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = isAudioDeafened;
        peerObj.audioEl = audio;
        document.body.appendChild(audio);
      }
      peerObj.audioEl.srcObject = event.streams[0];
      peerObj.audioEl.play().catch(() => {});

      if (peerObj.vadDetector) {
        try { peerObj.vadDetector.destroy(); } catch (_) {}
      }
      peerObj.vadDetector = setupVoiceActivityDetector(event.streams[0], (speaking) => {
        if (peerObj.cursorEl) {
          if (speaking) {
            peerObj.cursorEl.classList.add("is-speaking");
          } else {
            peerObj.cursorEl.classList.remove("is-speaking");
          }
        }
        updateScoreboardSpeakingState(peerId, speaking);
      });
    }
  };

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
// SINAIS SDP E CANDIDATOS ICE COM PREVENCAO DE CONFLITO (GLARE)
// ============================================================================
async function handleSignalingData(senderId, signalType, data) {
  let peer = peers.get(senderId);

  if (!peer) {
    peer = getOrCreatePeer(senderId, "#e11d48", `Amigo (${senderId.slice(-4)})`, false);
  }

  let pc = peer.pc;

  try {
    if (signalType === "offer") {
      if (pc.signalingState !== "stable") {
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch (_) {
          // Recria o peer se o estado estiver inconsistente apos retorno de suspensao
          removePeer(senderId);
          peer = getOrCreatePeer(senderId, "#e11d48", `Amigo (${senderId.slice(-4)})`, false);
          pc = peer.pc;
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data));

      while (peer.candidatesQueue.length > 0) {
        const cand = peer.candidatesQueue.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (_) {}
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWSSignal(senderId, "answer", pc.localDescription);
    } else if (signalType === "answer") {
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));

        while (peer.candidatesQueue.length > 0) {
          const cand = peer.candidatesQueue.shift();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (_) {}
        }
      }
    } else if (signalType === "candidate") {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (_) {}
      } else {
        peer.candidatesQueue.push(data);
      }
    }
  } catch (err) {
    console.warn("Erro ao processar sinal SDP/ICE:", err.message);
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
    if (peer.vadDetector) {
      try { peer.vadDetector.destroy(); } catch (_) {}
      peer.vadDetector = null;
    }
    updateScoreboardSpeakingState(peerId, false);
    if (peer.audioEl) {
      try {
        peer.audioEl.pause();
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
      } catch (_) {}
    }
    if (peer.channel) {
      try { peer.channel.close(); } catch (_) {}
    }
    if (peer.pc) {
      try { peer.pc.close(); } catch (_) {}
    }
    peers.delete(peerId);
  }
}

function unlockAudioPlayback() {
  for (const peerObj of peers.values()) {
    if (peerObj.audioEl && peerObj.audioEl.paused) {
      peerObj.audioEl.play().catch(() => {});
    }
  }
}
window.addEventListener("pointerdown", unlockAudioPlayback, { passive: true });

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
updateLocalProfileUI();

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
