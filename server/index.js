/**
 * BLOB ARENA - Multiplayer Game Server
 * Node.js + Express + Socket.io
 * 
 * Game: Players control colorful blobs in a neon arena.
 * Shoot projectiles to eliminate other players.
 * Last blob standing wins!
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// ─── Game Constants ───────────────────────────────────────────────────────────
const CANVAS_W = 800;
const CANVAS_H = 600;
const PLAYER_RADIUS = 20;
const BULLET_RADIUS = 6;
const BULLET_SPEED = 7;
const PLAYER_SPEED = 4;
const GAME_DURATION = 90; // seconds
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const TICK_RATE = 60; // ms per tick (≈16fps server-side)
const POWER_UP_INTERVAL = 8000; // ms
const MAX_HEALTH = 100;
const BULLET_DAMAGE = 20;
const REGEN_RATE = 0.05; // hp per tick (only when not shot)

// Player colors (neon palette)
const PLAYER_COLORS = [
  '#FF2D55', '#00F5FF', '#39FF14', '#FF9500',
  '#BF5FFF', '#FF6EC7', '#FFD700', '#00FF8C'
];

// Power-up types
const POWER_UP_TYPES = [
  { type: 'speed',  color: '#FFD700', icon: '⚡', duration: 5000,  label: 'SPEED BOOST' },
  { type: 'shield', color: '#00F5FF', icon: '🛡', duration: 4000,  label: 'SHIELD' },
  { type: 'rapid',  color: '#FF2D55', icon: '🔥', duration: 5000,  label: 'RAPID FIRE' },
  { type: 'size',   color: '#39FF14', icon: '💪', duration: 4000,  label: 'GIANT MODE' },
];

// Map obstacles (static walls)
const MAPS = [
  {
    name: 'Neon Colosseum',
    obstacles: [
      { x: 200, y: 150, w: 80, h: 20 },
      { x: 520, y: 150, w: 80, h: 20 },
      { x: 350, y: 100, w: 20, h: 80 },
      { x: 200, y: 430, w: 80, h: 20 },
      { x: 520, y: 430, w: 80, h: 20 },
      { x: 350, y: 420, w: 20, h: 80 },
      { x: 100, y: 280, w: 20, h: 80 },
      { x: 680, y: 280, w: 20, h: 80 },
    ]
  },
  {
    name: 'Cyber Maze',
    obstacles: [
      { x: 160, y: 100, w: 20, h: 160 },
      { x: 620, y: 340, w: 20, h: 160 },
      { x: 300, y: 200, w: 160, h: 20 },
      { x: 340, y: 380, w: 160, h: 20 },
      { x: 100, y: 400, w: 120, h: 20 },
      { x: 580, y: 180, w: 120, h: 20 },
      { x: 380, y: 100, w: 20, h: 120 },
      { x: 400, y: 380, w: 20, h: 120 },
    ]
  },
  {
    name: 'Acid Pit',
    obstacles: [
      { x: 250, y: 250, w: 300, h: 100 },
      { x: 100, y: 100, w: 40, h: 40 },
      { x: 660, y: 100, w: 40, h: 40 },
      { x: 100, y: 460, w: 40, h: 40 },
      { x: 660, y: 460, w: 40, h: 40 },
    ]
  }
];

// ─── Room Management ──────────────────────────────────────────────────────────
const rooms = new Map(); // roomCode -> Room
const leaderboard = []; // session-wide leaderboard

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createRoom(code) {
  const mapIndex = Math.floor(Math.random() * MAPS.length);
  return {
    code,
    players: new Map(),        // socketId -> player
    bullets: [],
    powerUps: [],
    state: 'lobby',            // 'lobby' | 'countdown' | 'playing' | 'ended'
    timeLeft: GAME_DURATION,
    mapIndex,
    tickInterval: null,
    powerUpInterval: null,
    countdownVal: 3,
    hostId: null,
    chatMessages: [],
  };
}

// ─── Player Factory ───────────────────────────────────────────────────────────
function spawnPlayer(socketId, username, colorIndex, mapIndex) {
  // Spawn positions spread around the map
  const spawnPoints = [
    { x: 80, y: 80 }, { x: 720, y: 80 }, { x: 80, y: 520 }, { x: 720, y: 520 },
    { x: 400, y: 60 }, { x: 400, y: 540 }, { x: 60, y: 300 }, { x: 740, y: 300 },
  ];
  const spawn = spawnPoints[colorIndex % spawnPoints.length];
  return {
    id: socketId,
    username,
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    health: MAX_HEALTH,
    alive: true,
    score: 0,
    kills: 0,
    input: { up: false, down: false, left: false, right: false, shoot: false, mouseX: 400, mouseY: 300 },
    lastShot: 0,
    shootCooldown: 300,   // ms
    powerUps: {},         // type -> expiry timestamp
    radius: PLAYER_RADIUS,
    regenTimer: 0,
    colorIndex,
    deaths: 0,
  };
}

// ─── Collision Helpers ────────────────────────────────────────────────────────
function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX, dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}

function circleCircle(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2, dy = y1 - y2;
  return dx * dx + dy * dy < (r1 + r2) * (r1 + r2);
}

// ─── Game Tick ────────────────────────────────────────────────────────────────
function gameTick(room) {
  if (room.state !== 'playing') return;

  const now = Date.now();
  const map = MAPS[room.mapIndex];

  // Update players
  for (const [, p] of room.players) {
    if (!p.alive) continue;

    // Apply active power-ups
    const hasSpeed = p.powerUps.speed && p.powerUps.speed > now;
    const hasRapid = p.powerUps.rapid && p.powerUps.rapid > now;
    const hasSize  = p.powerUps.size  && p.powerUps.size  > now;
    p.radius = hasSize ? PLAYER_RADIUS * 1.6 : PLAYER_RADIUS;
    const speed = hasSpeed ? PLAYER_SPEED * 1.7 : PLAYER_SPEED;
    p.shootCooldown = hasRapid ? 120 : 300;

    // Movement
    let dx = 0, dy = 0;
    if (p.input.up)    dy -= 1;
    if (p.input.down)  dy += 1;
    if (p.input.left)  dx -= 1;
    if (p.input.right) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    p.vx = dx * speed;
    p.vy = dy * speed;

    let nx = p.x + p.vx;
    let ny = p.y + p.vy;

    // Arena bounds
    nx = Math.max(p.radius, Math.min(CANVAS_W - p.radius, nx));
    ny = Math.max(p.radius, Math.min(CANVAS_H - p.radius, ny));

    // Obstacle collision
    let blocked = false;
    for (const obs of map.obstacles) {
      if (circleRect(nx, ny, p.radius, obs.x, obs.y, obs.w, obs.h)) {
        // Try sliding
        if (!circleRect(p.x, ny, p.radius, obs.x, obs.y, obs.w, obs.h)) {
          nx = p.x;
        } else if (!circleRect(nx, p.y, p.radius, obs.x, obs.y, obs.w, obs.h)) {
          ny = p.y;
        } else {
          nx = p.x; ny = p.y;
        }
        blocked = true;
      }
    }

    p.x = nx; p.y = ny;

    // Shooting
    if (p.input.shoot && now - p.lastShot > p.shootCooldown) {
      p.lastShot = now;
      const angle = Math.atan2(p.input.mouseY - p.y, p.input.mouseX - p.x);
      room.bullets.push({
        id: Math.random().toString(36).substr(2, 6),
        ownerId: p.id,
        ownerColor: p.color,
        x: p.x + Math.cos(angle) * (p.radius + BULLET_RADIUS + 2),
        y: p.y + Math.sin(angle) * (p.radius + BULLET_RADIUS + 2),
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        life: 120, // ticks before disappearing
      });
    }

    // Health regen (slow, only when no recent damage)
    p.regenTimer++;
    if (p.regenTimer > 180 && p.health < MAX_HEALTH) {
      p.health = Math.min(MAX_HEALTH, p.health + REGEN_RATE);
    }
  }

  // Update bullets
  const bulletsToRemove = new Set();
  for (let i = 0; i < room.bullets.length; i++) {
    const b = room.bullets[i];
    b.x += b.vx; b.y += b.vy;
    b.life--;

    // Out of bounds
    if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H || b.life <= 0) {
      bulletsToRemove.add(i); continue;
    }

    // Obstacle collision
    let hitWall = false;
    for (const obs of map.obstacles) {
      if (circleRect(b.x, b.y, BULLET_RADIUS, obs.x, obs.y, obs.w, obs.h)) {
        hitWall = true; break;
      }
    }
    if (hitWall) { bulletsToRemove.add(i); continue; }

    // Player collision
    for (const [, p] of room.players) {
      if (!p.alive || p.id === b.ownerId) continue;
      if (circleCircle(b.x, b.y, BULLET_RADIUS, p.x, p.y, p.radius)) {
        bulletsToRemove.add(i);
        const hasShield = p.powerUps.shield && p.powerUps.shield > now;
        if (!hasShield) {
          p.health -= BULLET_DAMAGE;
          p.regenTimer = 0;
          if (p.health <= 0) {
            p.health = 0;
            p.alive = false;
            p.deaths++;
            // Award kill to shooter
            const shooter = room.players.get(b.ownerId);
            if (shooter) {
              shooter.kills++;
              shooter.score += 100;
            }
            io.to(room.code).emit('playerDied', {
              deadId: p.id,
              deadName: p.username,
              killerId: b.ownerId,
              killerName: shooter ? shooter.username : 'Unknown',
            });
          }
        }
        break;
      }
    }
  }
  room.bullets = room.bullets.filter((_, i) => !bulletsToRemove.has(i));

  // Power-up collection
  room.powerUps = room.powerUps.filter(pu => {
    for (const [, p] of room.players) {
      if (!p.alive) continue;
      if (circleCircle(p.x, p.y, p.radius, pu.x, pu.y, 18)) {
        p.powerUps[pu.type] = now + POWER_UP_TYPES.find(t => t.type === pu.type).duration;
        io.to(room.code).emit('powerUpCollected', { playerId: p.id, type: pu.type, label: pu.label });
        return false;
      }
    }
    return true;
  });

  // Check win condition (only one alive)
  const alivePlayers = [...room.players.values()].filter(p => p.alive);
  if (alivePlayers.length <= 1 && room.players.size >= MIN_PLAYERS) {
    endGame(room, alivePlayers[0] || null);
    return;
  }

  // Time up
  room.timeLeft -= TICK_RATE / 1000;
  if (room.timeLeft <= 0) {
    // Winner = highest score
    const sorted = [...room.players.values()].sort((a, b) => b.score - a.score);
    endGame(room, sorted[0] || null);
    return;
  }

  // Broadcast game state
  io.to(room.code).emit('gameState', {
    players: [...room.players.values()].map(p => ({
      id: p.id, username: p.username, color: p.color,
      x: p.x, y: p.y, health: p.health, alive: p.alive,
      score: p.score, kills: p.kills, radius: p.radius,
      powerUps: Object.fromEntries(
        Object.entries(p.powerUps).filter(([, v]) => v > now)
      ),
    })),
    bullets: room.bullets.map(b => ({
      id: b.id, x: b.x, y: b.y, ownerColor: b.ownerColor
    })),
    powerUps: room.powerUps,
    timeLeft: Math.ceil(room.timeLeft),
  });
}

function endGame(room, winner) {
  clearInterval(room.tickInterval);
  clearInterval(room.powerUpInterval);
  room.state = 'ended';

  const results = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1, id: p.id, username: p.username,
      color: p.color, score: p.score, kills: p.kills, deaths: p.deaths,
    }));

  // Update session leaderboard
  results.forEach(r => {
    const existing = leaderboard.find(l => l.username === r.username);
    if (existing) {
      existing.wins += (r.rank === 1 ? 1 : 0);
      existing.totalScore += r.score;
      existing.games++;
    } else {
      leaderboard.push({ username: r.username, color: r.color,
        wins: r.rank === 1 ? 1 : 0, totalScore: r.score, games: 1 });
    }
  });
  leaderboard.sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore);

  io.to(room.code).emit('gameOver', {
    winner: winner ? { id: winner.id, username: winner.username, color: winner.color } : null,
    results,
    leaderboard: leaderboard.slice(0, 10),
  });
}

function spawnPowerUp(room) {
  if (room.state !== 'playing') return;
  const map = MAPS[room.mapIndex];
  const typeData = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
  let x, y, valid;
  let attempts = 0;
  do {
    x = 60 + Math.random() * (CANVAS_W - 120);
    y = 60 + Math.random() * (CANVAS_H - 120);
    valid = !map.obstacles.some(obs => circleRect(x, y, 24, obs.x, obs.y, obs.w, obs.h));
    attempts++;
  } while (!valid && attempts < 20);

  room.powerUps.push({ id: Date.now(), x, y, type: typeData.type,
    color: typeData.color, icon: typeData.icon, label: typeData.label });
  io.to(room.code).emit('powerUpSpawned', room.powerUps);
}

// ─── Socket.io Events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Create room
  socket.on('createRoom', ({ username }) => {
    if (!username || username.length > 16) return;
    let code;
    do { code = generateRoomCode(); } while (rooms.has(code));
    const room = createRoom(code);
    room.hostId = socket.id;
    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;
    const colorIndex = 0;
    room.players.set(socket.id, spawnPlayer(socket.id, username, colorIndex, room.mapIndex));
    socket.emit('roomCreated', { code, mapName: MAPS[room.mapIndex].name, isHost: true });
    emitLobbyUpdate(room);
    console.log(`[Room] Created: ${code} by ${username}`);
  });

  // Join room
  socket.on('joinRoom', ({ username, code }) => {
    if (!username || username.length > 16 || !code) return;
    const room = rooms.get(code.toUpperCase());
    if (!room) { socket.emit('error', 'Room not found!'); return; }
    if (room.state !== 'lobby') { socket.emit('error', 'Game already in progress!'); return; }
    if (room.players.size >= MAX_PLAYERS) { socket.emit('error', 'Room is full!'); return; }
    socket.join(code.toUpperCase());
    socket.roomCode = code.toUpperCase();
    const colorIndex = room.players.size;
    room.players.set(socket.id, spawnPlayer(socket.id, username, colorIndex, room.mapIndex));
    socket.emit('roomJoined', { code: room.code, mapName: MAPS[room.mapIndex].name, isHost: false });
    emitLobbyUpdate(room);
    console.log(`[Room] ${username} joined ${room.code}`);
  });

  // Start game (host only)
  socket.on('startGame', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.size < MIN_PLAYERS) {
      socket.emit('error', `Need at least ${MIN_PLAYERS} players to start!`); return;
    }
    startCountdown(room);
  });

  // Player input
  socket.on('input', (input) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.state !== 'playing') return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;
    // Anti-cheat: validate input types
    if (typeof input.up !== 'boolean') return;
    p.input = {
      up: !!input.up, down: !!input.down,
      left: !!input.left, right: !!input.right,
      shoot: !!input.shoot,
      mouseX: Math.max(0, Math.min(CANVAS_W, Number(input.mouseX) || 400)),
      mouseY: Math.max(0, Math.min(CANVAS_H, Number(input.mouseY) || 300)),
    };
  });

  // Chat message
  socket.on('chatMessage', ({ msg }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    const safe = String(msg).slice(0, 80).replace(/</g, '&lt;');
    const chatEntry = { username: p.username, color: p.color, msg: safe, time: Date.now() };
    room.chatMessages.push(chatEntry);
    io.to(room.code).emit('chatMessage', chatEntry);
  });

  // Restart (host only, after game ends)
  socket.on('restartGame', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'ended') return;
    // Reset room
    const mapIndex = Math.floor(Math.random() * MAPS.length);
    room.mapIndex = mapIndex;
    room.bullets = [];
    room.powerUps = [];
    room.state = 'lobby';
    room.timeLeft = GAME_DURATION;
    let ci = 0;
    for (const [id, p] of room.players) {
      const newP = spawnPlayer(id, p.username, ci++, mapIndex);
      room.players.set(id, newP);
    }
    io.to(room.code).emit('gameRestarted', { mapName: MAPS[mapIndex].name });
    emitLobbyUpdate(room);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const p = room.players.get(socket.id);
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      clearInterval(room.tickInterval);
      clearInterval(room.powerUpInterval);
      rooms.delete(room.code);
      console.log(`[Room] Deleted: ${room.code}`);
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players.keys().next().value;
        io.to(room.code).emit('newHost', { hostId: room.hostId });
      }
      if (room.state === 'playing' && p) p.alive = false;
      emitLobbyUpdate(room);
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });

  // Leaderboard request
  socket.on('getLeaderboard', () => {
    socket.emit('leaderboard', leaderboard.slice(0, 10));
  });
});

function emitLobbyUpdate(room) {
  io.to(room.code).emit('lobbyUpdate', {
    players: [...room.players.values()].map(p => ({
      id: p.id, username: p.username, color: p.color
    })),
    hostId: room.hostId,
    mapName: MAPS[room.mapIndex].name,
    code: room.code,
  });
}

function startCountdown(room) {
  room.state = 'countdown';
  room.countdownVal = 3;
  io.to(room.code).emit('countdown', 3);
  const cd = setInterval(() => {
    room.countdownVal--;
    if (room.countdownVal <= 0) {
      clearInterval(cd);
      startGame(room);
    } else {
      io.to(room.code).emit('countdown', room.countdownVal);
    }
  }, 1000);
}

function startGame(room) {
  room.state = 'playing';
  room.timeLeft = GAME_DURATION;
  // Re-spawn all players fresh
  let ci = 0;
  for (const [id, p] of room.players) {
    const fresh = spawnPlayer(id, p.username, ci++, room.mapIndex);
    room.players.set(id, fresh);
  }
  room.bullets = [];
  room.powerUps = [];
  io.to(room.code).emit('gameStart', {
    mapIndex: room.mapIndex,
    mapName: MAPS[room.mapIndex].name,
    obstacles: MAPS[room.mapIndex].obstacles,
    duration: GAME_DURATION,
    players: [...room.players.values()].map(p => ({
      id: p.id, username: p.username, color: p.color, x: p.x, y: p.y, radius: p.radius
    })),
  });
  room.tickInterval = setInterval(() => gameTick(room), TICK_RATE);
  room.powerUpInterval = setInterval(() => spawnPowerUp(room), POWER_UP_INTERVAL);
}

// ─── HTTP API ────────────────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => res.json(leaderboard.slice(0, 10)));
app.get('/api/rooms', (req, res) => res.json(
  [...rooms.values()].map(r => ({
    code: r.code, players: r.players.size, state: r.state, map: MAPS[r.mapIndex].name
  }))
));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 BLOB ARENA SERVER running on http://localhost:${PORT}\n`);
});
