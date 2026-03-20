/**
 * BLOB ARENA - Game Client
 * Handles UI, socket events, input, and rendering loop
 */

// ─── Socket Connection ────────────────────────────────────────────────────────
const socket = io();

// ─── State ────────────────────────────────────────────────────────────────────
let myId = null;
let myColor = '#fff';
let roomCode = null;
let isHost = false;
let gameState = null;
let lastKnownPlayers = new Map();
let input = { up: false, down: false, left: false, right: false, shoot: false, mouseX: 400, mouseY: 300 };
let gameRunning = false;
let animFrame = null;
let showScoreboard = false;
let chatOpen = false;
let prevHealthMap = new Map();

// ─── DOM helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  start:     $('screen-start'),
  lobby:     $('screen-lobby'),
  countdown: $('screen-countdown'),
  game:      $('screen-game'),
  gameover:  $('screen-gameover'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function toast(msg, duration = 2500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), duration);
}

// ─── START SCREEN ─────────────────────────────────────────────────────────────
$('btn-create').onclick = () => {
  Sounds.click();
  const username = $('username-input').value.trim();
  if (!username) { toast('⚠️ Enter your name!'); return; }
  socket.emit('createRoom', { username });
};

$('btn-join-open').onclick = () => {
  Sounds.click();
  $('join-row').classList.toggle('hidden');
};

$('btn-join-confirm').onclick = joinRoom;
$('room-code-input').onkeydown = e => { if (e.key === 'Enter') joinRoom(); };
$('username-input').onkeydown = e => { if (e.key === 'Enter') $('btn-create').click(); };

function joinRoom() {
  Sounds.click();
  const username = $('username-input').value.trim();
  const code = $('room-code-input').value.trim();
  if (!username) { toast('⚠️ Enter your name!'); return; }
  if (!code || code.length !== 4) { toast('⚠️ Enter a 4-letter room code!'); return; }
  socket.emit('joinRoom', { username, code });
}

// Leaderboard modal
$('btn-leaderboard-open').onclick = () => {
  Sounds.click();
  socket.emit('getLeaderboard');
  $('modal-leaderboard').classList.remove('hidden');
};
$('btn-lb-close').onclick = () => {
  $('modal-leaderboard').classList.add('hidden');
};

// ─── LOBBY SCREEN ─────────────────────────────────────────────────────────────
$('btn-start').onclick = () => {
  Sounds.click();
  socket.emit('startGame');
};

$('btn-leave').onclick = () => {
  Sounds.click();
  socket.disconnect();
  location.reload();
};

$('btn-copy-code').onclick = () => {
  navigator.clipboard.writeText(roomCode).then(() => toast('✅ Room code copied!'));
};

// Lobby chat
$('btn-lobby-send').onclick = sendLobbyChat;
$('lobby-chat-input').onkeydown = e => { if (e.key === 'Enter') sendLobbyChat(); };
function sendLobbyChat() {
  const msg = $('lobby-chat-input').value.trim();
  if (!msg) return;
  socket.emit('chatMessage', { msg });
  $('lobby-chat-input').value = '';
}

// ─── GAME OVER SCREEN ─────────────────────────────────────────────────────────
$('btn-play-again').onclick = () => {
  Sounds.click();
  if (isHost) {
    socket.emit('restartGame');
  } else {
    toast('⏳ Waiting for host to restart...');
  }
};
$('btn-main-menu').onclick = () => {
  location.reload();
};

// ─── KEYBOARD INPUT ───────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Chat toggle
  if (e.key === 't' || e.key === 'T') {
    if (gameRunning && !chatOpen) {
      chatOpen = true;
      $('chat-input-row').classList.remove('hidden');
      $('game-chat-input').focus();
      return;
    }
  }
  if (e.key === 'Escape' && chatOpen) {
    chatOpen = false;
    $('chat-input-row').classList.add('hidden');
    $('game-chat-input').blur();
    return;
  }
  if (chatOpen) return; // Don't capture movement keys when chatting

  if (e.key === 'Tab') { e.preventDefault(); showScoreboard = true; updateScoreboard(); $('scoreboard').classList.remove('hidden'); return; }
  if (e.key === ' ') { e.preventDefault(); input.shoot = true; }
  if (e.key === 'w' || e.key === 'ArrowUp')    input.up = true;
  if (e.key === 's' || e.key === 'ArrowDown')  input.down = true;
  if (e.key === 'a' || e.key === 'ArrowLeft')  input.left = true;
  if (e.key === 'd' || e.key === 'ArrowRight') input.right = true;
});

document.addEventListener('keyup', e => {
  if (e.key === 'Tab') { $('scoreboard').classList.add('hidden'); showScoreboard = false; return; }
  if (e.key === ' ') input.shoot = false;
  if (e.key === 'w' || e.key === 'ArrowUp')    input.up = false;
  if (e.key === 's' || e.key === 'ArrowDown')  input.down = false;
  if (e.key === 'a' || e.key === 'ArrowLeft')  input.left = false;
  if (e.key === 'd' || e.key === 'ArrowRight') input.right = false;
});

// In-game chat send
$('game-chat-input').onkeydown = e => {
  if (e.key === 'Enter') {
    const msg = $('game-chat-input').value.trim();
    if (msg) socket.emit('chatMessage', { msg });
    $('game-chat-input').value = '';
    chatOpen = false;
    $('chat-input-row').classList.add('hidden');
    $('game-chat-input').blur();
  }
  if (e.key === 'Escape') {
    chatOpen = false;
    $('chat-input-row').classList.add('hidden');
    $('game-chat-input').blur();
  }
};

// ─── MOUSE INPUT ──────────────────────────────────────────────────────────────
const canvas = $('game-canvas');

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  input.mouseX = (e.clientX - rect.left) * scaleX;
  input.mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { input.shoot = true; e.preventDefault(); }
});
canvas.addEventListener('mouseup', e => {
  if (e.button === 0) input.shoot = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Touch support
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  input.mouseX = (touch.clientX - rect.left) * (canvas.width / rect.width);
  input.mouseY = (touch.clientY - rect.top) * (canvas.height / rect.height);
  input.shoot = true;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  input.mouseX = (touch.clientX - rect.left) * (canvas.width / rect.width);
  input.mouseY = (touch.clientY - rect.top) * (canvas.height / rect.height);
}, { passive: false });
canvas.addEventListener('touchend', () => { input.shoot = false; });

// ─── INPUT LOOP (send input to server) ───────────────────────────────────────
let lastInputSent = {};
setInterval(() => {
  if (!gameRunning) return;
  const inp = { ...input };
  // Only send if changed (optimization)
  if (JSON.stringify(inp) !== JSON.stringify(lastInputSent)) {
    socket.emit('input', inp);
    lastInputSent = inp;
  }
}, 16);

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
function startGameLoop() {
  gameRunning = true;
  function loop() {
    if (gameRunning) {
      Renderer.render(gameState || {});
      animFrame = requestAnimationFrame(loop);
    }
  }
  loop();
}

function stopGameLoop() {
  gameRunning = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}

// ─── HUD UPDATES ──────────────────────────────────────────────────────────────
function updateHUD(players, timeLeft) {
  const me = players.find(p => p.id === myId);
  if (!me) return;

  // Health
  const hp = Math.max(0, Math.round(me.health));
  $('health-fill').style.width = hp + '%';
  $('health-fill').style.background = hp > 50 ? '#39FF14' : hp > 25 ? '#FFD700' : '#FF2D55';
  $('health-val').textContent = hp;

  // Score / kills
  $('hud-score').textContent = `SCORE: ${me.score}`;
  $('hud-kills').textContent = `KILLS: ${me.kills}`;

  // Timer
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerEl = $('hud-timer');
  timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  timerEl.classList.toggle('urgent', timeLeft <= 10);

  // Alive count
  const alive = players.filter(p => p.alive).length;
  $('hud-alive').textContent = `👥 ${alive} alive`;

  // Power-ups display
  const puEl = $('hud-powerups');
  puEl.innerHTML = '';
  const now = Date.now();
  if (me.powerUps) {
    const icons = { speed: '⚡', shield: '🛡️', rapid: '🔥', size: '💪' };
    const colors = { speed: '#FFD700', shield: '#00F5FF', rapid: '#FF2D55', size: '#39FF14' };
    for (const [type, expiry] of Object.entries(me.powerUps)) {
      if (expiry > now) {
        const secsLeft = Math.ceil((expiry - now) / 1000);
        const div = document.createElement('div');
        div.className = 'pu-icon';
        div.style.borderColor = colors[type] || '#fff';
        div.style.color = colors[type] || '#fff';
        div.textContent = `${icons[type] || '?'} ${secsLeft}s`;
        puEl.appendChild(div);
      }
    }
  }

  // Flash on damage
  if (prevHealthMap.has(myId) && me.health < prevHealthMap.get(myId)) {
    canvas.style.boxShadow = '0 0 30px 10px #FF2D55';
    setTimeout(() => canvas.style.boxShadow = '', 200);
    Sounds.hit();
  }
  prevHealthMap.set(myId, me.health);
}

function updateScoreboard() {
  if (!gameState || !gameState.players) return;
  const list = $('scoreboard-list');
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  list.innerHTML = sorted.map(p => `
    <div class="sb-row ${!p.alive ? 'sb-dead' : ''}">
      <span class="sb-dot" style="background:${p.color}; box-shadow: 0 0 6px ${p.color}"></span>
      <span class="sb-name">${escHtml(p.username)} ${p.id === myId ? '(you)' : ''}</span>
      <span class="sb-kills">💀 ${p.kills}</span>
      <span class="sb-score">${p.score}</span>
    </div>
  `).join('');
}

// ─── KILL FEED ────────────────────────────────────────────────────────────────
const killFeedEntries = [];
function addKillFeed(entry) {
  const feed = $('kill-feed');
  const div = document.createElement('div');
  div.className = 'kill-entry';
  div.innerHTML = entry;
  feed.insertBefore(div, feed.firstChild);
  killFeedEntries.push(div);
  if (killFeedEntries.length > 5) {
    const old = killFeedEntries.shift();
    old.remove();
  }
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.5s';
    setTimeout(() => div.remove(), 500);
  }, 4000);
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function appendChat(container, entry) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-msg-name" style="color:${entry.color}">${escHtml(entry.username)}:</span>
                   <span class="chat-msg-text">${entry.msg}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  // Trim old messages
  while (container.children.length > 30) container.removeChild(container.firstChild);
}

// ─── LOBBY UPDATE ─────────────────────────────────────────────────────────────
function renderLobby({ players, hostId, mapName, code }) {
  const grid = $('player-grid');
  grid.innerHTML = '';
  players.forEach(p => {
    const slot = document.createElement('div');
    slot.className = 'player-slot filled';
    slot.style.borderColor = p.color;
    slot.style.boxShadow = `0 0 10px ${p.color}44`;
    slot.innerHTML = `
      <span class="player-blob-icon" style="background:${p.color}; box-shadow: 0 0 10px ${p.color}"></span>
      <span class="player-slot-name">${escHtml(p.username)}</span>
      ${p.id === hostId ? '<span class="player-slot-host">👑 HOST</span>' : ''}
    `;
    grid.appendChild(slot);
  });
  // Empty slots
  for (let i = players.length; i < 8; i++) {
    const slot = document.createElement('div');
    slot.className = 'player-slot empty-slot';
    slot.textContent = '+ JOIN';
    grid.appendChild(slot);
  }
  $('room-code-display').textContent = code;
  $('map-name-display').textContent = mapName;
  $('btn-start').disabled = !(isHost && players.length >= 2);
  $('lobby-msg').textContent = players.length < 2
    ? `Waiting for players... (${players.length}/2 minimum)`
    : isHost
      ? `${players.length} players ready! Hit START when ready.`
      : `${players.length} players in lobby. Waiting for host...`;
}

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
socket.on('connect', () => {
  myId = socket.id;
  Renderer.init(canvas, myId);
});

socket.on('roomCreated', ({ code, mapName, isHost: host }) => {
  roomCode = code;
  isHost = host;
  $('room-code-display').textContent = code;
  showScreen('lobby');
});

socket.on('roomJoined', ({ code, mapName, isHost: host }) => {
  roomCode = code;
  isHost = host;
  showScreen('lobby');
});

socket.on('lobbyUpdate', (data) => {
  renderLobby(data);
});

socket.on('newHost', ({ hostId }) => {
  if (hostId === myId) {
    isHost = true;
    toast('👑 You are now the host!');
    $('btn-start').disabled = false;
  }
});

socket.on('error', (msg) => {
  toast('❌ ' + msg, 3000);
});

socket.on('countdown', (n) => {
  showScreen('countdown');
  const numEl = $('countdown-number');
  if (n > 0) {
    numEl.textContent = n;
    numEl.style.animation = 'none';
    void numEl.offsetWidth; // reflow
    numEl.style.animation = 'countPulse .9s ease-out';
    Sounds.countdown();
  } else {
    numEl.textContent = 'GO!';
    Sounds.go();
  }
});

socket.on('gameStart', ({ mapIndex, obstacles, players }) => {
  // Initialize
  Renderer.init(canvas, myId);
  Renderer.setMap(obstacles, mapIndex);
  gameState = { players, bullets: [], powerUps: [] };
  prevHealthMap.clear();

  // Set my color
  const me = players.find(p => p.id === myId);
  if (me) myColor = me.color;

  // Clear kill feed & HUD
  $('kill-feed').innerHTML = '';
  $('hud-powerups').innerHTML = '';

  showScreen('game');
  startGameLoop();

  setTimeout(() => {
    $('countdown-number').textContent = 'GO!';
    void $('countdown-number').offsetWidth;
    $('countdown-number').style.animation = 'countPulse .5s ease-out';
  }, 100);
});

socket.on('gameState', (state) => {
  gameState = state;
  updateHUD(state.players, state.timeLeft);
  if (showScoreboard) updateScoreboard();
});

socket.on('playerDied', ({ deadId, deadName, killerId, killerName }) => {
  // Particles at dead player position
  if (gameState && gameState.players) {
    const dead = gameState.players.find(p => p.id === deadId);
    if (dead) {
      Renderer.addParticle(dead.x, dead.y, dead.color, 16);
    }
  }

  const isMe = deadId === myId;
  if (isMe) {
    Sounds.die();
    canvas.style.filter = 'saturate(0)';
    toast('💀 You were eliminated! Spectating...', 3000);
  } else {
    Sounds.hit();
  }

  const killerIsMe = killerId === myId;
  addKillFeed(
    `${killerIsMe ? '⚡ <b>YOU</b>' : escHtml(killerName)} eliminated <b style="color:#FF2D55">${escHtml(deadName)}</b>`
  );
});

socket.on('powerUpSpawned', (powerUps) => {
  if (gameState) gameState.powerUps = powerUps;
});

socket.on('powerUpCollected', ({ playerId, type, label }) => {
  Sounds.powerUp();
  if (playerId === myId) {
    const announceEl = $('pu-announce');
    announceEl.textContent = label + '!';
    announceEl.classList.remove('hidden');
    announceEl.style.animation = 'none';
    void announceEl.offsetWidth;
    announceEl.style.animation = 'announceAnim .5s ease';
    setTimeout(() => announceEl.classList.add('hidden'), 2000);
  }
});

socket.on('chatMessage', (entry) => {
  appendChat($('lobby-chat-msgs'), entry);
  appendChat($('game-chat-msgs'), entry);
});

socket.on('gameOver', ({ winner, results, leaderboard }) => {
  stopGameLoop();
  canvas.style.filter = '';

  // Winner banner
  const banner = $('winner-banner');
  if (winner) {
    const isMe = winner.id === myId;
    banner.innerHTML = isMe
      ? `<span style="color:#FFD700; text-shadow: 0 0 20px #FFD700">🏆 YOU WIN! 🏆</span>`
      : `<span style="color:${winner.color}; text-shadow: 0 0 20px ${winner.color}">🏆 ${escHtml(winner.username)} WINS!</span>`;
    if (isMe) Sounds.win(); else Sounds.lose();
  } else {
    banner.innerHTML = `<span style="color:#aaa">⚡ TIME'S UP! ⚡</span>`;
    Sounds.lose();
  }

  // Results table
  const tbody = $('results-body');
  tbody.innerHTML = results.map(r => `
    <tr class="rank-${r.rank}">
      <td>${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}</td>
      <td style="color:${r.color}">⬤ ${escHtml(r.username)} ${r.id === myId ? '(you)' : ''}</td>
      <td>${r.score}</td>
      <td>${r.kills}</td>
      <td>${r.deaths}</td>
    </tr>
  `).join('');

  // Session leaderboard
  renderLeaderboard(leaderboard, 'go-leaderboard-list');

  $('btn-play-again').textContent = isHost ? '🔄 PLAY AGAIN' : '⏳ WAITING FOR HOST...';

  showScreen('gameover');
});

socket.on('gameRestarted', ({ mapName }) => {
  showScreen('lobby');
  toast(`🗺️ New map: ${mapName}`);
});

socket.on('leaderboard', (lb) => {
  renderLeaderboard(lb, 'modal-lb-list');
});

// ─── LEADERBOARD RENDER ───────────────────────────────────────────────────────
function renderLeaderboard(lb, containerId) {
  const container = $(containerId);
  if (!lb || lb.length === 0) {
    container.innerHTML = '<div style="color:#6060a0; text-align:center; padding:10px;">No games played yet</div>';
    return;
  }
  container.innerHTML = lb.map((entry, i) => `
    <div class="lb-row">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-dot" style="background:${entry.color}"></span>
      <span class="lb-name">${escHtml(entry.username)}</span>
      <span class="lb-wins">🏆 ${entry.wins}W</span>
      <span class="lb-score">${entry.totalScore}pts</span>
    </div>
  `).join('');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
