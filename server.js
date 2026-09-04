/**
 * ============================================================================
 * SERVIDOR WEBSOCKET MULTI-SALAS: CAÇA AOS BUGS
 * ============================================================================
 * - Regra 1: Partida só inicia com confirmação manual do Admin (Sem reinício automático)
 * - Regra 2: Intervalo fixo de 6s de contagem regressiva antes de QUALQUER rodada
 * - Regra 3: Bug Dourado (1x por rodada, ultra rápido, R1=2pts, R2=6pts, R3=12pts)
 * - Limite estrito de 8 jogadores por sala (WebRTC Full Mesh leve)
 * - Autolimpeza de RAM ao esvaziar a sala
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROUND_DURATION = 20;    // 20 segundos de gameplay por rodada
const ROUND_DELAY_SECONDS = 6; // 6 segundos fixos antes de qualquer rodada
const TOTAL_ROUNDS = 3;        // 3 rodadas por partida
const MAX_PLAYERS_PER_ROOM = 8;

const COLORS = [
  "#0284c7", // Azul
  "#e11d48", // Vermelho
  "#16a34a", // Verde
  "#d97706", // Laranja
  "#7c3aed", // Roxo
  "#0d9488", // Teal
  "#ec4899", // Rosa
  "#eab308", // Amarelo
];

const BUG_TYPES = ["beetle", "ladybug", "spider", "moth"];

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

function sendWSMessage(socket, dataObj) {
  try {
    if (!socket || socket.destroyed || socket.readyState === "closed") return;
    const jsonStr = JSON.stringify(dataObj);
    const payloadBuffer = Buffer.from(jsonStr, "utf8");
    const length = payloadBuffer.length;

    let frameBuffer;
    if (length <= 125) {
      frameBuffer = Buffer.alloc(2 + length);
      frameBuffer[0] = 0x81;
      frameBuffer[1] = length;
      payloadBuffer.copy(frameBuffer, 2);
    } else if (length <= 65535) {
      frameBuffer = Buffer.alloc(4 + length);
      frameBuffer[0] = 0x81;
      frameBuffer[1] = 126;
      frameBuffer.writeUInt16BE(length, 2);
      payloadBuffer.copy(frameBuffer, 4);
    } else {
      frameBuffer = Buffer.alloc(10 + length);
      frameBuffer[0] = 0x81;
      frameBuffer[1] = 127;
      frameBuffer.writeBigUInt64BE(BigInt(length), 2);
      payloadBuffer.copy(frameBuffer, 10);
    }

    socket.write(frameBuffer);
  } catch (err) {
    console.error("[WebSocket Server] Erro ao enviar:", err.message);
  }
}

// ============================================================================
// CLASSE GAMEROOM (SALA ISOLADA DE JOGO)
// ============================================================================
class GameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.clients = new Map(); // peerId -> { socket, color, name, score, isAdmin }
    this.adminId = null;

    // Estados da Partida: 'waiting_start' | 'round_delay' | 'round_playing' | 'round_ended' | 'game_over'
    this.status = "waiting_start";
    this.currentRound = 1;
    this.roundSecondsLeft = ROUND_DURATION;
    this.delaySecondsLeft = ROUND_DELAY_SECONDS;
    this.isPaused = false;
    this.isGameOver = false;

    // Gerenciador do Bug Dourado
    this.goldenBugSpawnedInRound = false;
    this.goldenBugSpawnSecond = 10;

    this.activeBugs = new Map();
    this.colorIndex = 0;

    this.tickInterval = null;
    this.chaosInterval = null;

    this.startGameLoop();
    console.log(`✨ [Sala Criada] "${this.id}"`);
  }

  broadcast(dataObj, excludePeerId = null) {
    for (const [id, client] of this.clients.entries()) {
      if (id !== excludePeerId) {
        sendWSMessage(client.socket, dataObj);
      }
    }
  }

  getScoreboard() {
    return Array.from(this.clients.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      color: data.color,
      score: data.score || 0,
      isAdmin: id === this.adminId,
    }));
  }

  // Sorteia trajetórias normais ou rápidas
  getBugTrajectory(duration) {
    const side = Math.floor(Math.random() * 4);
    let startX = 0, startY = 0, targetX = 1, targetY = 1;

    if (side === 0) {
      startX = -0.06;
      targetX = 1.06;
      startY = Math.random() * 0.8 + 0.1;
      targetY = startY + (Math.random() * 0.4 - 0.2);
    } else if (side === 1) {
      startX = 1.06;
      targetX = -0.06;
      startY = Math.random() * 0.8 + 0.1;
      targetY = startY + (Math.random() * 0.4 - 0.2);
    } else if (side === 2) {
      startY = -0.06;
      targetY = 1.06;
      startX = Math.random() * 0.8 + 0.1;
      targetX = startX + (Math.random() * 0.4 - 0.2);
    } else {
      startY = 1.06;
      targetY = -0.06;
      startX = Math.random() * 0.8 + 0.1;
      targetX = startX + (Math.random() * 0.4 - 0.2);
    }

    return { startX, startY, targetX, targetY, duration };
  }

  spawnBug(isCrazyMode = false) {
    if (this.clients.size === 0 || this.isPaused || this.status !== "round_playing") return;

    const bugId = "bug_" + Math.random().toString(36).substring(2, 9);
    const bugType = BUG_TYPES[Math.floor(Math.random() * BUG_TYPES.length)];
    const duration = isCrazyMode ? Math.random() * 2.0 + 2.2 : Math.random() * 2.5 + 4.5;

    const traj = this.getBugTrajectory(duration);

    const bugData = {
      id: bugId,
      bugType,
      isGolden: false,
      points: 1,
      startX: traj.startX,
      startY: traj.startY,
      targetX: traj.targetX,
      targetY: traj.targetY,
      duration: traj.duration,
      createdAt: Date.now(),
      isDead: false,
      isCrazy: isCrazyMode,
    };

    this.activeBugs.set(bugId, bugData);

    this.broadcast({
      type: "spawn_bug",
      bug: bugData,
    });

    setTimeout(() => {
      this.activeBugs.delete(bugId);
    }, (duration + 1) * 1000);
  }

  // Spawn do Bug Dourado: 1x por rodada, ultra veloz, pontuação escalonada
  spawnGoldenBug() {
    if (this.clients.size === 0 || this.isPaused || this.status !== "round_playing") return;

    const bugId = "golden_" + Math.random().toString(36).substring(2, 9);
    // Pontuação: R1 = 2 pts, R2 = 6 pts, R3 = 12 pts
    const points = this.currentRound === 1 ? 2 : (this.currentRound === 2 ? 6 : 12);
    // Velocidade superior: 1.8s a 2.3s
    const duration = Math.random() * 0.5 + 1.8;

    const traj = this.getBugTrajectory(duration);

    const bugData = {
      id: bugId,
      bugType: "golden",
      isGolden: true,
      points: points,
      startX: traj.startX,
      startY: traj.startY,
      targetX: traj.targetX,
      targetY: traj.targetY,
      duration: traj.duration,
      createdAt: Date.now(),
      isDead: false,
      isCrazy: true,
    };

    this.activeBugs.set(bugId, bugData);

    console.log(`✨ [BUG DOURADO SPAWNADO] [Sala: ${this.id}] Rodada ${this.currentRound} (${points} pontos, ${duration.toFixed(1)}s)`);

    this.broadcast({
      type: "spawn_bug",
      bug: bugData,
    });

    setTimeout(() => {
      this.activeBugs.delete(bugId);
    }, (duration + 1) * 1000);
  }

  // Inicia uma nova partida do zero (Confirmada manualmente pelo Admin)
  startMatch() {
    this.status = "round_delay";
    this.currentRound = 1;
    this.isGameOver = false;
    this.isPaused = false;
    this.activeBugs.clear();

    for (const [, c] of this.clients.entries()) {
      c.score = 0;
    }

    console.log(`🚀 [Partida Iniciada pelo Admin] [Sala: ${this.id}]`);
    this.startRoundDelay(1);
  }

  // Intervalo fixo de 6 segundos antes de qualquer rodada
  startRoundDelay(roundNumber) {
    this.status = "round_delay";
    this.currentRound = roundNumber;
    this.delaySecondsLeft = ROUND_DELAY_SECONDS;
    this.roundSecondsLeft = ROUND_DURATION;
    this.goldenBugSpawnedInRound = false;
    // Sorteia o segundo em que o Bug Dourado surgirá (entre o segundo 14 e 6)
    this.goldenBugSpawnSecond = Math.floor(Math.random() * 9) + 6;

    this.activeBugs.clear();

    console.log(`⏳ [Delay de 6s Iniciado] [Sala: ${this.id}] Rodada ${roundNumber} começando em ${ROUND_DELAY_SECONDS}s`);

    this.broadcast({
      type: "round_preparing",
      round: this.currentRound,
      totalRounds: TOTAL_ROUNDS,
      delaySeconds: this.delaySecondsLeft,
      scoreboard: this.getScoreboard(),
    });
  }

  // Inicia a rodada de 20 segundos após o delay de 6s
  startRound(roundNumber) {
    this.status = "round_playing";
    this.currentRound = roundNumber;
    this.roundSecondsLeft = ROUND_DURATION;

    console.log(`🎮 [Rodada ${roundNumber} Iniciada] [Sala: ${this.id}]`);

    this.broadcast({
      type: "round_started",
      round: this.currentRound,
      totalRounds: TOTAL_ROUNDS,
      timeLeft: this.roundSecondsLeft,
    });
  }

  startGameLoop() {
    // Spawner de bugs no modo caos (Rodada 3)
    this.chaosInterval = setInterval(() => {
      if (this.clients.size === 0 || this.isPaused || this.status !== "round_playing") return;

      if (this.currentRound === 3 && this.roundSecondsLeft > 1) {
        this.spawnBug(true);
        if (Math.random() > 0.4) {
          setTimeout(() => this.spawnBug(true), 250);
        }
      }
    }, 700);

    // Loop Principal de 1s por tick
    this.tickInterval = setInterval(() => {
      if (this.clients.size === 0 || this.isPaused) return;

      // 1. Estado de Contagem Regressiva de 6 segundos antes da rodada
      if (this.status === "round_delay") {
        this.delaySecondsLeft--;

        this.broadcast({
          type: "round_preparing_tick",
          round: this.currentRound,
          totalRounds: TOTAL_ROUNDS,
          delaySeconds: Math.max(0, this.delaySecondsLeft),
        });

        if (this.delaySecondsLeft <= 0) {
          this.startRound(this.currentRound);
        }
        return;
      }

      // 2. Estado de Gameplay da Rodada (20s)
      if (this.status === "round_playing") {
        this.roundSecondsLeft--;

        // Spawn do Bug Dourado (exatamente 1 vez por rodada)
        if (!this.goldenBugSpawnedInRound && this.roundSecondsLeft === this.goldenBugSpawnSecond) {
          this.goldenBugSpawnedInRound = true;
          this.spawnGoldenBug();
        }

        // Cronograma de spawn de bugs normais
        if (this.currentRound === 1) {
          if ([19, 16, 13, 10, 7, 4, 1].includes(this.roundSecondsLeft)) {
            this.spawnBug(false);
          }
        } else if (this.currentRound === 2) {
          if ([19, 17, 15, 13, 11, 9, 7, 5, 3, 1].includes(this.roundSecondsLeft)) {
            this.spawnBug(false);
            if (this.roundSecondsLeft === 11 || this.roundSecondsLeft === 5) {
              setTimeout(() => this.spawnBug(false), 350);
            }
          }
        }

        this.broadcast({
          type: "round_tick",
          round: this.currentRound,
          totalRounds: TOTAL_ROUNDS,
          timeLeft: Math.max(0, this.roundSecondsLeft),
          isPaused: this.isPaused,
        });

        // Fim dos 20 segundos da rodada
        if (this.roundSecondsLeft <= 0) {
          this.activeBugs.clear();

          if (this.currentRound >= TOTAL_ROUNDS) {
            // FIM DA PARTIDA (Rodada 3 concluída)
            this.status = "game_over";
            this.isGameOver = true;
            const sorted = this.getScoreboard().sort((a, b) => b.score - a.score);
            const winner = sorted[0];

            console.log(`🏆 [FIM DE PARTIDA] [Sala: ${this.id}] Vencedor: ${winner?.name || "Ninguém"} (${winner?.score || 0} pts). Aguardando confirmação do Admin.`);

            // Bloqueio de reinício automático: Não há setTimeout de reinício!
            this.broadcast({
              type: "game_over",
              round: this.currentRound,
              totalRounds: TOTAL_ROUNDS,
              winner: winner,
              scoreboard: sorted,
            });
          } else {
            // Fim da Rodada 1 ou 2 -> Inicia automaticamente o delay de 6s da próxima rodada
            this.status = "round_ended";
            console.log(`🏁 [Fim da Rodada ${this.currentRound}] [Sala: ${this.id}]`);

            this.broadcast({
              type: "round_ended",
              round: this.currentRound,
              totalRounds: TOTAL_ROUNDS,
              scoreboard: this.getScoreboard(),
            });

            // Dispara o delay fixo de 6s para a próxima rodada
            this.startRoundDelay(this.currentRound + 1);
          }
        }
      }
    }, 1000);
  }

  addClient(peerId, socket) {
    const defaultColor = COLORS[this.colorIndex % COLORS.length];
    const defaultName = "Amigo (" + peerId.slice(-4) + ")";
    this.colorIndex++;

    if (!this.adminId) {
      this.adminId = peerId;
      console.log(`👑 [Admin Master Definido] [Sala: ${this.id}] ${peerId}`);
    }

    const isUserAdmin = peerId === this.adminId;

    this.clients.set(peerId, {
      socket,
      color: defaultColor,
      name: defaultName,
      score: 0,
      isAdmin: isUserAdmin,
    });

    const existingPeers = Array.from(this.clients.entries())
      .filter(([id]) => id !== peerId)
      .map(([id, data]) => ({
        id,
        color: data.color,
        name: data.name,
        score: data.score || 0,
        isAdmin: id === this.adminId,
      }));

    sendWSMessage(socket, {
      type: "welcome",
      roomId: this.id,
      myId: peerId,
      defaultColor: defaultColor,
      defaultName: defaultName,
      isAdmin: isUserAdmin,
      adminId: this.adminId,
      status: this.status,
      isPaused: this.isPaused,
      isGameOver: this.isGameOver,
      round: this.currentRound,
      totalRounds: TOTAL_ROUNDS,
      timeLeft: this.roundSecondsLeft,
      delaySeconds: this.delaySecondsLeft,
      existingPeers: existingPeers,
      scoreboard: this.getScoreboard(),
      activeBugs: Array.from(this.activeBugs.values()).filter((b) => !b.isDead),
      maxPlayers: MAX_PLAYERS_PER_ROOM,
    });

    this.broadcast(
      {
        type: "peer-joined",
        peerId: peerId,
        color: defaultColor,
        name: defaultName,
        score: 0,
        isAdmin: isUserAdmin,
        scoreboard: this.getScoreboard(),
        totalPlayers: this.clients.size,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
      },
      peerId
    );

    console.log(`👋 [Jogador Entrou] [Sala: ${this.id}] ${peerId} (${this.clients.size}/${MAX_PLAYERS_PER_ROOM})`);
  }

  removeClient(peerId) {
    if (!this.clients.has(peerId)) return;

    this.clients.delete(peerId);
    console.log(`🚪 [Jogador Saiu] [Sala: ${this.id}] ${peerId} (${this.clients.size}/${MAX_PLAYERS_PER_ROOM})`);

    if (peerId === this.adminId) {
      const remaining = Array.from(this.clients.keys());
      this.adminId = remaining.length > 0 ? remaining[0] : null;

      if (this.adminId) {
        const newAdmin = this.clients.get(this.adminId);
        if (newAdmin) {
          newAdmin.isAdmin = true;
          console.log(`👑 [Novo Admin Master] [Sala: ${this.id}] ${this.adminId}`);
          sendWSMessage(newAdmin.socket, {
            type: "you_are_admin",
            isAdmin: true,
          });
        }
      }
    }

    this.broadcast({
      type: "peer-left",
      peerId: peerId,
      adminId: this.adminId,
      scoreboard: this.getScoreboard(),
      totalPlayers: this.clients.size,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
    });
  }

  handleMessage(peerId, msg) {
    if (msg.type === "update_profile") {
      const client = this.clients.get(peerId);
      if (client) {
        if (msg.name) client.name = msg.name;
        if (msg.color) client.color = msg.color;
      }
      this.broadcast({
        type: "peer_profile_updated",
        peerId: peerId,
        name: msg.name,
        color: msg.color,
        scoreboard: this.getScoreboard(),
      });
    } else if (msg.type === "admin_start_match" || msg.type === "admin_reset_game") {
      if (peerId !== this.adminId) return;
      this.startMatch();
    } else if (msg.type === "admin_toggle_pause") {
      if (peerId !== this.adminId) return;
      const client = this.clients.get(peerId);
      this.isPaused = !this.isPaused;

      console.log(`⏸️ [Admin] [Sala: ${this.id}] Jogo ${this.isPaused ? "PAUSADO" : "RETOMADO"} por ${client?.name || peerId}`);

      this.broadcast({
        type: "game_pause_toggled",
        isPaused: this.isPaused,
        pausedBy: client?.name || "Admin Master",
        round: this.currentRound,
        timeLeft: this.roundSecondsLeft,
        delaySeconds: this.delaySecondsLeft,
      });
    } else if (msg.type === "bug_hit") {
      if (this.isPaused || this.isGameOver || this.status !== "round_playing") return;

      const bug = this.activeBugs.get(msg.bugId);
      const client = this.clients.get(peerId);

      if (bug && !bug.isDead && client) {
        bug.isDead = true;
        const pts = bug.points || 1;
        client.score = (client.score || 0) + pts;

        this.broadcast({
          type: "bug_killed",
          bugId: msg.bugId,
          shooterId: peerId,
          shooterName: client.name,
          shooterColor: client.color,
          pointsEarned: pts,
          isGolden: bug.isGolden || false,
          x: msg.x,
          y: msg.y,
          scoreboard: this.getScoreboard(),
        });
      }
    } else if (msg.type === "signal" || msg.type === "offer" || msg.type === "answer" || msg.type === "candidate") {
      const { targetId, data } = msg;
      const targetClient = this.clients.get(targetId);

      if (targetClient) {
        sendWSMessage(targetClient.socket, {
          type: "signal",
          senderId: peerId,
          signalType: msg.signalType || msg.type,
          data: data,
        });
      }
    }
  }

  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.chaosInterval) clearInterval(this.chaosInterval);
    this.activeBugs.clear();
    this.clients.clear();
    console.log(`🧹 [Sala Vazia Destruída da RAM] "${this.id}"`);
  }
}

// Mapa global de salas em memória RAM: roomId -> GameRoom
const rooms = new Map();

// ============================================================================
// 1. SERVIDOR HTTP (ARQUIVOS ESTÁTICOS E API DE SALAS)
// ============================================================================
const server = http.createServer((req, res) => {
  const host = req.headers.host || "localhost";
  const reqUrl = new URL(req.url, `http://${host}`);

  if (reqUrl.pathname === "/api/rooms") {
    const activeRoomsList = Array.from(rooms.entries()).map(([id, room]) => ({
      id: id,
      playerCount: room.clients.size,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      round: room.currentRound,
      totalRounds: TOTAL_ROUNDS,
      status: room.status,
      isPaused: room.isPaused,
      isFull: room.clients.size >= MAX_PLAYERS_PER_ROOM,
    }));

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(JSON.stringify(activeRoomsList));
    return;
  }

  let reqPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  const filePath = path.join(__dirname, "public", reqPath);
  const ext = path.extname(filePath);

  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Arquivo não encontrado");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
    res.end(content);
  });
});

// ============================================================================
// 2. SERVIDOR WEBSOCKET COM MULTI-SALAS
// ============================================================================
server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const host = req.headers.host || "localhost";
  const reqUrl = new URL(req.url, `http://${host}`);
  const rawRoom = (reqUrl.searchParams.get("room") || "geral").trim();
  const roomId = rawRoom.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "geral";

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new GameRoom(roomId));
  }

  const room = rooms.get(roomId);

  if (room.clients.size >= MAX_PLAYERS_PER_ROOM) {
    const clientKey = req.headers["sec-websocket-key"];
    const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const acceptKey = crypto
      .createHash("sha1")
      .update(clientKey + GUID)
      .digest("base64");

    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");

    socket.write(responseHeaders);

    sendWSMessage(socket, {
      type: "room_full",
      roomId: roomId,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      message: `A sala "${roomId}" está cheia (${MAX_PLAYERS_PER_ROOM}/${MAX_PLAYERS_PER_ROOM} jogadores).`,
    });

    console.log(`🚫 [Conexão Rejeitada: Sala Cheia] [Sala: ${roomId}] Tentativa de 9º jogador.`);
    setTimeout(() => {
      try { socket.end(); } catch (_) {}
    }, 500);
    return;
  }

  const clientKey = req.headers["sec-websocket-key"];
  const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  const acceptKey = crypto
    .createHash("sha1")
    .update(clientKey + GUID)
    .digest("base64");

  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
    "",
  ].join("\r\n");

  socket.write(responseHeaders);

  const peerId = "user_" + Math.random().toString(36).substring(2, 8);
  room.addClient(peerId, socket);

  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let currentOffset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) break;
        payloadLength = buffer.readUInt16BE(2);
        currentOffset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) break;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        currentOffset = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      const totalFrameSize = currentOffset + maskLength + payloadLength;

      if (buffer.length < totalFrameSize) break;

      if (opcode === 0x8) {
        socket.end();
        break;
      }

      if (opcode === 0x9) {
        const pong = Buffer.from([0x8a, 0x00]);
        socket.write(pong);
        buffer = buffer.slice(totalFrameSize);
        continue;
      }

      if (opcode === 0x1) {
        const maskingKey = buffer.slice(currentOffset, currentOffset + 4);
        const maskedPayload = buffer.slice(
          currentOffset + 4,
          currentOffset + 4 + payloadLength
        );
        const unmaskedPayload = Buffer.alloc(payloadLength);

        for (let i = 0; i < payloadLength; i++) {
          unmaskedPayload[i] = maskedPayload[i] ^ maskingKey[i % 4];
        }

        const messageText = unmaskedPayload.toString("utf8");
        buffer = buffer.slice(totalFrameSize);

        try {
          const msg = JSON.parse(messageText);
          room.handleMessage(peerId, msg);
        } catch (e) {
          console.error(`[WebSocket] [Sala: ${roomId}] Erro ao parsear JSON:`, e.message);
        }
      } else {
        buffer = buffer.slice(totalFrameSize);
      }
    }
  });

  const handleDisconnect = () => {
    room.removeClient(peerId);

    if (room.clients.size === 0) {
      room.destroy();
      rooms.delete(roomId);
    }
  };

  socket.on("close", handleDisconnect);
  socket.on("end", handleDisconnect);
  socket.on("error", handleDisconnect);
});

// ============================================================================
// 3. INICIALIZAÇÃO
// ============================================================================
server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log("\n=======================================================");
  console.log("🐛 JOGO CAÇA AOS BUGS (MULTIPLAYER WEBRTC / MULTI-SALAS)");
  console.log("=======================================================");
  console.log(`🌐 Servidor ativo na porta: ${PORT}`);
  console.log(`💻 Local:               http://localhost:${PORT}`);
  console.log(`📱 Rede Local:          http://${localIP}:${PORT}`);
  console.log("=======================================================\n");
});
