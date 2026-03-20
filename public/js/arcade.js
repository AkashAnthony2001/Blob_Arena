/**
 * NEON ARCADE - Main Client
 * Routes to game-specific socket namespaces and renderers
 */

// ─── State ────────────────────────────────────────────────────────────────────
let socket = null;
let myId = null;
let currentGame = null; // 'blob' | 'snake' | 'asteroid' | 'pong'
let roomCode = null;
let isHost = false;
let gameState = null;
let gameRunning = false;
let animFrame = null;
let input = {};
let showScoreboard = false;
let chatOpen = false;
let prevHealth = 100;

// Game-specific state
let snakeGrid = {cols:40,rows:30,cellSize:20};
let asteroidLives = 5;
let asteroidWave = 1;
let pongScore = {left:0,right:0};
let myTeam = null;

const GAME_META = {
  // ── Original 4 ──────────────────────────────────────────────────────────────
  blob:          { name:'BLOB ARENA',        color:'#FF2D55', ns:'/blob',          minPlayers:2, controls:'WASD + Mouse to aim/shoot | TAB: Scoreboard' },
  snake:         { name:'SNAKE ROYALE',      color:'#39FF14', ns:'/snake',         minPlayers:2, controls:'WASD/Arrows to steer | TAB: Scoreboard' },
  asteroid:      { name:'ASTEROID DASH',     color:'#BF5FFF', ns:'/asteroid',      minPlayers:1, controls:'W: Thrust | Mouse: Aim | Click/Space: Shoot' },
  pong:          { name:'PONG WARS',         color:'#FFD700', ns:'/pong',          minPlayers:2, controls:'W/S or Up/Down: Move paddle' },
  // ── Clash Royale-Style ───────────────────────────────────────────────────────
  laneclash:     { name:'LANE CLASH',        color:'#FF9500', ns:'/laneclash',     minPlayers:2, controls:'Click lane buttons to deploy units | WASD: move view', renderer:'clash' },
  towersiege:    { name:'TOWER SIEGE',       color:'#BF5FFF', ns:'/towersiege',    minPlayers:2, controls:'Click cards to deploy | Lane buttons to select lane', renderer:'clash' },
  unitrush:      { name:'UNIT RUSH',         color:'#FF6EC7', ns:'/unitrush',      minPlayers:2, controls:'Click unit cards to send troops', renderer:'clash' },
  // ── Shooters ────────────────────────────────────────────────────────────────
  bullethell:    { name:'BULLET HELL ARENA', color:'#FF2D55', ns:'/bullethell',    minPlayers:2, controls:'WASD to move | Mouse to aim | Click/Space to shoot' },
  neontanks:     { name:'NEON TANKS',        color:'#FFD700', ns:'/neontanks',     minPlayers:2, controls:'A/D: Rotate | W/S: Drive forward/back | Space: Fire' },
  lasertag:      { name:'LASER TAG',         color:'#00F5FF', ns:'/lasertag',      minPlayers:2, controls:'WASD to move | Mouse aim | Click to fire laser' },
  spaceduel:     { name:'SPACE DUEL',        color:'#00FF8C', ns:'/spaceduel',     minPlayers:2, controls:'A/D: Rotate | W: Thrust | Space: Shoot | M: Missile' },
  cybercapture:  { name:'CYBER CAPTURE',     color:'#FF2D55', ns:'/cybercapture',  minPlayers:2, controls:'WASD to move | Mouse aim | Click/Space to shoot' },
  // ── Competitive Arcade ──────────────────────────────────────────────────────
  reactionrace:  { name:'REACTION RACE',     color:'#FF6EC7', ns:'/reactionrace',  minPlayers:2, controls:'Press R/B/G/Y/P/O when matching color appears!', renderer:'reaction' },
  territory:     { name:'TERRITORY WAR',     color:'#39FF14', ns:'/territory',     minPlayers:2, controls:'WASD to move and paint tiles' },
  koth:          { name:'KING OF THE HILL',  color:'#FFD700', ns:'/koth',          minPlayers:2, controls:'WASD to move — hold the center zone!' },
  infection:     { name:'INFECTION MODE',    color:'#39FF14', ns:'/infection',     minPlayers:3, controls:'WASD to move (run as human, chase as zombie)' },
  gravitywars:   { name:'GRAVITY WARS',      color:'#BF5FFF', ns:'/gravitywars',   minPlayers:2, controls:'Your turn: drag aim line, set power, click FIRE', renderer:'gravity' },
  // ── Physics / Fun ───────────────────────────────────────────────────────────
  knockout:      { name:'KNOCKOUT ARENA',    color:'#FF9500', ns:'/knockout',      minPlayers:2, controls:'WASD to move | Space: DASH (builds knockback)' },
  ballblitz:     { name:'BALL BLITZ',        color:'#FF2D55', ns:'/ballblitz',     minPlayers:2, controls:'WASD to dodge balls | Click: kick ball at rivals' },
  fallingtiles:  { name:'FALLING TILES',     color:'#00F5FF', ns:'/fallingtiles',  minPlayers:2, controls:'WASD to move — tiles crack under your feet!' },
  chainreaction: { name:'CHAIN REACTION',    color:'#FF6EC7', ns:'/chainreaction', minPlayers:2, controls:'Click a cell on your turn to place an orb', renderer:'chain' },
  neonsumo:      { name:'NEON SUMO',         color:'#FFD700', ns:'/neonsumo',      minPlayers:2, controls:'WASD to move | Hold Space to CHARGE, release to push!' },
  blitzcatcher:  { name:'BLITZ CATCHER',     color:'#39FF14', ns:'/blitzcatcher',  minPlayers:2, controls:'A/D to move | Space: dash-steal from rivals' },
};

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = { hub:'screen-hub', lobby:'screen-lobby', countdown:'screen-countdown', game:'screen-game', gameover:'screen-gameover' };

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screens[name]).classList.add('active');
}

function toast(msg, duration=2500) {
  const el=$('toast'); el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.add('hidden'), duration);
}

// ─── HUB SETUP ────────────────────────────────────────────────────────────────
document.querySelectorAll('.game-create').forEach(btn => {
  btn.onclick = () => { Sounds.click(); startGame(btn.dataset.game, 'create'); };
});
document.querySelectorAll('.game-join').forEach(btn => {
  btn.onclick = () => { Sounds.click(); openJoinModal(btn.dataset.game); };
});

$('btn-hub-leaderboard').onclick = () => {
  Sounds.click();
  if(socket) socket.emit('getGlobalLeaderboard');
  else { // Connect a temp socket to get leaderboard
    const tmp = io('/blob');
    tmp.on('connect', ()=>tmp.emit('getGlobalLeaderboard'));
    tmp.on('globalLeaderboard', lb=>{ renderLeaderboard(lb,'modal-lb-list'); tmp.disconnect(); });
  }
  $('modal-leaderboard').classList.remove('hidden');
};

$('btn-lb-close').onclick=()=>$('modal-leaderboard').classList.add('hidden');

// ─── JOIN MODAL ───────────────────────────────────────────────────────────────
let joinTargetGame = null;

function openJoinModal(game) {
  joinTargetGame = game;
  const meta = GAME_META[game];
  $('modal-join-title').textContent = `JOIN ${meta.name}`;
  $('join-code-input').value = '';
  $('modal-join').classList.remove('hidden');
  setTimeout(()=>$('join-code-input').focus(), 100);
}

$('btn-modal-cancel').onclick = ()=>$('modal-join').classList.add('hidden');
$('btn-modal-join').onclick = doJoinRoom;
$('join-code-input').onkeydown = e=>{ if(e.key==='Enter') doJoinRoom(); };

function doJoinRoom() {
  const username = $('username-input').value.trim();
  const code = $('join-code-input').value.trim().toUpperCase();
  if(!username){toast('⚠️ Enter your name!');return;}
  if(code.length!==4){toast('⚠️ Enter a 4-letter room code!');return;}
  $('modal-join').classList.add('hidden');
  connectAndJoin(joinTargetGame, 'join', code, username);
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
$('btn-start').onclick = ()=>{ Sounds.click(); socket?.emit('startGame'); };
$('btn-leave').onclick = ()=>{ Sounds.click(); socket?.disconnect(); socket=null; showScreen('hub'); };
$('btn-copy-code').onclick = ()=>{ navigator.clipboard.writeText(roomCode).then(()=>toast('✅ Code copied!')); };
$('btn-lobby-send').onclick = sendLobbyChat;
$('lobby-chat-input').onkeydown = e=>{ if(e.key==='Enter') sendLobbyChat(); };
function sendLobbyChat(){
  const msg=$('lobby-chat-input').value.trim(); if(!msg) return;
  socket?.emit('chatMessage',{msg}); $('lobby-chat-input').value='';
}

// ─── GAME OVER ────────────────────────────────────────────────────────────────
$('btn-play-again').onclick = ()=>{
  Sounds.click();
  if(isHost) socket?.emit('restartGame');
  else toast('⏳ Waiting for host...');
};
$('btn-hub-return').onclick = ()=>{ socket?.disconnect(); socket=null; showScreen('hub'); };

// ─── CONNECT ──────────────────────────────────────────────────────────────────
function startGame(game, mode) {
  const username = $('username-input').value.trim();
  if(!username){toast('⚠️ Enter your name first!');return;}
  connectAndJoin(game, mode, null, username);
}

function connectAndJoin(game, mode, code, username) {
  if(socket){ socket.disconnect(); socket=null; }
  currentGame = game;
  const meta = GAME_META[game];

  socket = io(meta.ns);
  myId = null;

  socket.on('connect', ()=>{
    myId = socket.id;
    initRenderer(game);
    if(mode==='create') socket.emit('createRoom',{username});
    else socket.emit('joinRoom',{username,code});
  });

  socket.on('roomCreated',({code:c,isHost:h,mapName})=>{
    roomCode=c; isHost=h;
    setupLobbyUI(game, c);
    showScreen('lobby');
  });

  socket.on('roomJoined',({code:c,isHost:h})=>{
    roomCode=c; isHost=h;
    setupLobbyUI(game, c);
    showScreen('lobby');
  });

  socket.on('lobbyUpdate', data=>renderLobby(data));

  socket.on('error', msg=>toast('❌ '+msg, 3000));

  socket.on('countdown', n=>{
    showScreen('countdown');
    const el=$('countdown-number');
    if(n>0){ el.textContent=n; el.style.animation='none'; void el.offsetWidth; el.style.animation='countPulse .9s ease-out'; Sounds.countdown(); }
    else { el.textContent='GO!'; Sounds.go(); }
  });

  socket.on('gameStart', data=>handleGameStart(game, data));
  socket.on('gameState', data=>{ gameState=data; updateHUD(game, data); });
  socket.on('chatMessage', entry=>{ appendChat($('lobby-chat-msgs'), entry); appendChat($('game-chat-msgs'), entry); });
  socket.on('newHost', ({hostId})=>{ if(hostId===myId){isHost=true;$('btn-start').disabled=false;toast('👑 You are the host!');} });

  // Game-specific events
  attachGameEvents(game);

  socket.on('gameOver', data=>handleGameOver(game, data));
  socket.on('gameRestarted', ()=>{
    showScreen('lobby');
    stopGameLoop();
    const meta=GAME_META[currentGame];
    toast(`🔄 New round starting!`);
  });
  socket.on('disconnect', ()=>{ stopGameLoop(); });
}

function setupLobbyUI(game, code) {
  const meta = GAME_META[game];
  $('lobby-game-badge').textContent = meta.name;
  $('lobby-game-badge').style.background = meta.color;
  $('room-code-display').textContent = code;
  $('game-controls-hint').textContent = meta.controls;
}

// ─── GAME-SPECIFIC SOCKET EVENTS ──────────────────────────────────────────────
function attachGameEvents(game) {
  // New games: events are handled by NewGamesClient.wireSocket after gameStart
  if(NewGamesClient.isNewGame(game)) return;

  if(game==='blob') {
    socket.on('playerDied',({deadId,deadName,killerId,killerName})=>{
      if(gameState?.players){const d=gameState.players.find(p=>p.id===deadId);if(d)BlobRenderer.addParticle(d.x,d.y,d.color,14);}
      if(deadId===myId){Sounds.die();$('game-canvas').style.filter='saturate(0)';setTimeout(()=>$('game-canvas').style.filter='',5000);toast('💀 You were eliminated!',3000);}
      else Sounds.hit();
      addKillFeed(`${killerId===myId?'⚡ <b>YOU</b>':esc(killerName)} eliminated <b style="color:#FF2D55">${esc(deadName)}</b>`);
    });
    socket.on('powerUpSpawned',pu=>{ if(gameState) gameState.powerUps=pu; });
    socket.on('powerUpCollected',({playerId,label})=>{
      if(playerId===myId){Sounds.powerUp();showAnnounce(label+'!');}
    });
  }

  if(game==='snake') {
    socket.on('snakeDied',({deadId,deadName,killerId,killerName})=>{
      if(deadId===myId){Sounds.die();toast('💀 You were eaten!',3000);}
      else Sounds.hit();
      const kname=killerId?esc(killerName):'the wall';
      addKillFeed(`<b style="color:#FF2D55">${esc(deadName)}</b> eaten by <b>${kname}</b>`);
    });
  }

  if(game==='asteroid') {
    socket.on('hit',({playerId,lives})=>{
      asteroidLives=lives;
      Sounds.hit();
      if(playerId===myId){$('game-canvas').style.filter='brightness(3)';setTimeout(()=>$('game-canvas').style.filter='',150);}
      toast(`💥 Hit! Lives: ${'❤️'.repeat(lives)}`, 1500);
    });
  }

  if(game==='pong') {
    socket.on('scored',({team,score})=>{
      pongScore=score; Sounds.powerUp();
      addKillFeed(`${team==='left'?'🔴':'🔵'} Team scores! ${score.left} — ${score.right}`);
    });
    socket.on('powerUpCollected',({type,label,team})=>{
      Sounds.powerUp();
      showAnnounce((team===myTeam?'⚡ YOUR TEAM: ':'👿 THEY GOT: ')+label);
    });
  }
}

// ─── GAME START ───────────────────────────────────────────────────────────────
function handleGameStart(game, data) {
  gameState = { players:data.players||[], bullets:[], powerUps:[], asteroids:[], balls:[], food:[] };
  $('kill-feed').innerHTML='';
  $('hud-powerups') && ($('hud-powerups').innerHTML='');
  $('game-canvas').style.filter='';

  if(game==='blob') {
    BlobRenderer.init($('game-canvas'), myId);
    BlobRenderer.setMap(data.obstacles, data.mapIndex);
    setupHUD_blob();
  } else if(game==='snake') {
    snakeGrid = data.grid || {cols:40,rows:30,cellSize:20};
    SnakeRenderer.init($('game-canvas'), myId);
    SnakeRenderer.setGrid(snakeGrid);
    setupHUD_snake();
  } else if(game==='asteroid') {
    asteroidLives = data.lives; asteroidWave = data.wave;
    AsteroidRenderer.init($('game-canvas'), myId);
    setupHUD_asteroid();
  } else if(game==='pong') {
    pongScore = data.score||{left:0,right:0};
    const me = data.players?.find(p=>p.id===myId);
    if(me) myTeam = me.team;
    PongRenderer.init($('game-canvas'), myId);
    setupHUD_pong(data.winScore||7);
  } else if(NewGamesClient.isNewGame(game)) {
    // New game: just clear HUD and let renderer handle everything
    $('game-hud').innerHTML = '';
    NewGamesClient.connect(game, GAME_META[game].ns, myId);
    NewGamesClient.wireSocket(socket);
  }

  showScreen('game');
  startGameLoop(game);
}

// ─── RENDERERS ────────────────────────────────────────────────────────────────
function initRenderer(game) {} // lazy init on gameStart

function startGameLoop(game) {
  gameRunning = true;
  function loop() {
    if(!gameRunning) return;
    const state = gameState || {};
    if(game==='blob')     BlobRenderer.render(state);
    else if(game==='snake')    SnakeRenderer.render(state);
    else if(game==='asteroid') AsteroidRenderer.render(state);
    else if(game==='pong')     PongRenderer.render(state);
    else if(NewGamesClient.isNewGame(game)) {
      const canvas=$('game-canvas');
      if(canvas){
        const ctx=canvas.getContext('2d');
        const ngState=NewGamesClient.getGameState()||state;
        const extra=NewGamesClient.getExtraState();
        NewGameRenderer.render(game,ngState,ctx,canvas,myId,extra);
      }
    }
    animFrame = requestAnimationFrame(loop);
  }
  loop();
}

function stopGameLoop() {
  gameRunning=false;
  if(animFrame){cancelAnimationFrame(animFrame);animFrame=null;}
  if(NewGamesClient.isNewGame(currentGame)) NewGamesClient.teardown();
}

// ─── HUD SETUP ────────────────────────────────────────────────────────────────
function setupHUD_blob() {
  $('game-hud').innerHTML = `
    <div class="hud-section">
      <span class="hud-label">HP</span>
      <div class="health-track"><div id="health-fill" class="health-fill"></div></div>
      <span id="health-val">100</span>
    </div>
    <div class="hud-section" id="hud-powerups"></div>
    <div class="hud-section" style="flex-direction:column;align-items:center">
      <div id="hud-timer" class="hud-timer">1:30</div>
      <div id="hud-alive" style="font-size:11px;color:#6060a0">👥 -</div>
    </div>
    <div class="hud-section" style="flex-direction:column;align-items:flex-end;gap:2px">
      <div id="hud-score" class="hud-score-val">SCORE: 0</div>
      <div id="hud-kills" style="font-size:11px;color:#6060a0">KILLS: 0</div>
    </div>`;
}
function setupHUD_snake() {
  $('game-hud').innerHTML = `
    <div class="hud-section"><span class="hud-label">⏱</span><div id="hud-timer" class="hud-timer">2:00</div></div>
    <div class="hud-section" style="flex-direction:column;align-items:center;gap:2px">
      <div id="hud-score" class="hud-score-val">LENGTH: 4</div>
      <div id="hud-kills" style="font-size:11px;color:#6060a0">KILLS: 0</div>
    </div>
    <div class="hud-section"><span id="hud-alive" style="font-size:11px;color:#6060a0">🐍 - alive</span></div>`;
}
function setupHUD_asteroid() {
  $('game-hud').innerHTML = `
    <div class="hud-section"><span class="hud-label">WAVE</span><span id="hud-wave" class="hud-wave">1</span></div>
    <div class="hud-section" style="flex-direction:column;align-items:center;gap:2px">
      <div id="hud-score" class="hud-score-val">SCORE: 0</div>
      <div id="hud-kills" style="font-size:11px;color:#6060a0">KILLS: 0</div>
    </div>
    <div class="hud-section"><span id="hud-lives" class="hud-lives">❤️❤️❤️❤️❤️</span></div>`;
}
function setupHUD_pong(winScore) {
  $('game-hud').innerHTML = `
    <div class="hud-section">
      <span style="color:#FF2D55;font-family:var(--font-head);font-size:13px">LEFT</span>
    </div>
    <div class="hud-section" style="flex-direction:column;align-items:center">
      <div id="hud-pong-score" class="hud-pong-score" style="color:#fff">
        <span id="ps-left" style="color:#FF2D55">0</span>
        <span style="color:#444"> — </span>
        <span id="ps-right" style="color:#00F5FF">0</span>
      </div>
      <div style="font-size:10px;color:#6060a0">FIRST TO ${winScore}</div>
    </div>
    <div class="hud-section">
      <span style="color:#00F5FF;font-family:var(--font-head);font-size:13px">RIGHT</span>
    </div>`;
}

// ─── HUD UPDATE ───────────────────────────────────────────────────────────────
function updateHUD(game, state) {
  if(game==='blob') updateHUD_blob(state);
  else if(game==='snake') updateHUD_snake(state);
  else if(game==='asteroid') updateHUD_asteroid(state);
  else if(game==='pong') updateHUD_pong(state);
}

function updateHUD_blob(state) {
  const me=state.players?.find(p=>p.id===myId); if(!me) return;
  const hp=Math.max(0,Math.round(me.health));
  const fill=$('health-fill');
  if(fill){fill.style.width=hp+'%';fill.style.background=hp>50?'#39FF14':hp>25?'#FFD700':'#FF2D55';}
  const hv=$('health-val'); if(hv)hv.textContent=hp;
  const sc=$('hud-score'); if(sc)sc.textContent=`SCORE: ${me.score}`;
  const kl=$('hud-kills'); if(kl)kl.textContent=`KILLS: ${me.kills}`;
  const ti=$('hud-timer');
  if(ti){const m=Math.floor(state.timeLeft/60),s=state.timeLeft%60;
    ti.textContent=`${m}:${s.toString().padStart(2,'0')}`;ti.classList.toggle('urgent',state.timeLeft<=10);}
  const al=$('hud-alive'); if(al)al.textContent=`👥 ${state.players?.filter(p=>p.alive).length||0} alive`;
  // Power-ups
  const puel=$('hud-powerups'); if(!puel) return;
  puel.innerHTML=''; const now=Date.now();
  const icons={speed:'⚡',shield:'🛡️',rapid:'🔥',size:'💪'};
  const colors={speed:'#FFD700',shield:'#00F5FF',rapid:'#FF2D55',size:'#39FF14'};
  if(me.powerUps) for(const[t,exp] of Object.entries(me.powerUps)){
    if(exp>now){const d=document.createElement('div');d.className='pu-icon';
      d.style.borderColor=colors[t]||'#fff';d.style.color=colors[t]||'#fff';
      d.textContent=`${icons[t]||'?'} ${Math.ceil((exp-now)/1000)}s`;puel.appendChild(d);}
  }
  // Damage flash
  if(prevHealth>me.health&&me.health<prevHealth){
    $('game-canvas').style.boxShadow='0 0 30px 10px #FF2D55';
    setTimeout(()=>$('game-canvas').style.boxShadow='',200);Sounds.hit();
  }
  prevHealth=me.health;
}

function updateHUD_snake(state) {
  const me=state.players?.find(p=>p.id===myId);
  const sc=$('hud-score'); if(sc&&me)sc.textContent=`LENGTH: ${me.length||0}`;
  const kl=$('hud-kills'); if(kl&&me)kl.textContent=`KILLS: ${me.kills||0}`;
  const ti=$('hud-timer');
  if(ti&&state.timeLeft!=null){const m=Math.floor(state.timeLeft/60),s=state.timeLeft%60;
    ti.textContent=`${m}:${s.toString().padStart(2,'0')}`;ti.classList.toggle('urgent',state.timeLeft<=10);}
  const al=$('hud-alive');
  if(al)al.textContent=`🐍 ${state.players?.filter(p=>p.alive).length||0} alive`;
}

function updateHUD_asteroid(state) {
  const me=state.players?.find(p=>p.id===myId);
  const sc=$('hud-score'); if(sc)sc.textContent=`SCORE: ${state.score||0}`;
  const kl=$('hud-kills'); if(kl&&me)kl.textContent=`KILLS: ${me.kills||0}`;
  const wv=$('hud-wave'); if(wv)wv.textContent=state.wave||1;
  const lv=$('hud-lives'); if(lv&&state.lives!=null)lv.textContent='❤️'.repeat(Math.max(0,state.lives));
  asteroidLives=state.lives; asteroidWave=state.wave;
}

function updateHUD_pong(state) {
  if(state.score){
    pongScore=state.score;
    const pl=$('ps-left'); if(pl)pl.textContent=state.score.left;
    const pr=$('ps-right'); if(pr)pr.textContent=state.score.right;
  }
}

// ─── INPUT ────────────────────────────────────────────────────────────────────
const canvas=$('game-canvas');
let lastSent={};

canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  const sx=canvas.width/r.width, sy=canvas.height/r.height;
  input.mouseX=(e.clientX-r.left)*sx; input.mouseY=(e.clientY-r.top)*sy;
});
canvas.addEventListener('mousedown',e=>{ if(e.button===0){input.shoot=true;e.preventDefault();} });
canvas.addEventListener('mouseup',e=>{ if(e.button===0)input.shoot=false; });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.touches[0],r=canvas.getBoundingClientRect();
  input.mouseX=(t.clientX-r.left)*(canvas.width/r.width);
  input.mouseY=(t.clientY-r.top)*(canvas.height/r.height);
  input.shoot=true;
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  const t=e.touches[0],r=canvas.getBoundingClientRect();
  input.mouseX=(t.clientX-r.left)*(canvas.width/r.width);
  input.mouseY=(t.clientY-r.top)*(canvas.height/r.height);
},{passive:false});
canvas.addEventListener('touchend',()=>{ input.shoot=false; });

document.addEventListener('keydown',e=>{
  if(e.key==='t'||e.key==='T'){if(gameRunning&&!chatOpen){chatOpen=true;$('chat-input-row').classList.remove('hidden');$('game-chat-input').focus();return;}}
  if(e.key==='Escape'&&chatOpen){chatOpen=false;$('chat-input-row').classList.add('hidden');$('game-chat-input').blur();return;}
  if(chatOpen) return;
  if(e.key==='Tab'){e.preventDefault();showScoreboard=true;updateScoreboard();$('scoreboard').classList.remove('hidden');return;}
  if(e.key==='w'||e.key==='ArrowUp')    {e.preventDefault();input.up=true;}
  if(e.key==='s'||e.key==='ArrowDown')  {e.preventDefault();input.down=true;}
  if(e.key==='a'||e.key==='ArrowLeft')  {e.preventDefault();input.left=true;}
  if(e.key==='d'||e.key==='ArrowRight') {e.preventDefault();input.right=true;}
  if(e.key===' '){e.preventDefault();input.shoot=true;}
});
document.addEventListener('keyup',e=>{
  if(e.key==='Tab'){$('scoreboard').classList.add('hidden');showScoreboard=false;return;}
  if(e.key==='w'||e.key==='ArrowUp')    input.up=false;
  if(e.key==='s'||e.key==='ArrowDown')  input.down=false;
  if(e.key==='a'||e.key==='ArrowLeft')  input.left=false;
  if(e.key==='d'||e.key==='ArrowRight') input.right=false;
  if(e.key===' ')input.shoot=false;
});

$('game-chat-input').onkeydown=e=>{
  if(e.key==='Enter'){const msg=$('game-chat-input').value.trim();if(msg)socket?.emit('chatMessage',{msg});
    $('game-chat-input').value='';chatOpen=false;$('chat-input-row').classList.add('hidden');$('game-chat-input').blur();}
  if(e.key==='Escape'){chatOpen=false;$('chat-input-row').classList.add('hidden');$('game-chat-input').blur();}
};

// Input sending loop
setInterval(()=>{
  if(!gameRunning||!socket) return;
  let toSend = {};
  if(currentGame==='blob')     toSend={up:input.up,down:input.down,left:input.left,right:input.right,shoot:input.shoot,mouseX:input.mouseX||400,mouseY:input.mouseY||300};
  else if(currentGame==='snake') {
    let dir=null;
    if(input.up)dir='up'; else if(input.down)dir='down';
    else if(input.left)dir='left'; else if(input.right)dir='right';
    if(dir&&dir!==lastSent.dir){toSend={dir};lastSent=toSend;socket.emit('input',toSend);return;}
    return;
  }
  else if(currentGame==='asteroid') toSend={up:input.up,shoot:input.shoot,mouseX:input.mouseX||400,mouseY:input.mouseY||300};
  else if(currentGame==='pong') toSend={up:input.up,down:input.down};

  if(JSON.stringify(toSend)!==JSON.stringify(lastSent)){socket.emit('input',toSend);lastSent=toSend;}
},16);

// ─── SCOREBOARD ───────────────────────────────────────────────────────────────
function updateScoreboard(){
  if(!gameState?.players) return;
  const sorted=[...gameState.players].sort((a,b)=>(b.score||0)-(a.score||0));
  $('scoreboard-list').innerHTML=sorted.map(p=>`
    <div class="sb-row ${!p.alive?'sb-dead':''}">
      <span class="sb-dot" style="background:${p.color}"></span>
      <span class="sb-name">${esc(p.username)}${p.id===myId?' (you)':''}</span>
      ${p.kills!=null?`<span class="sb-kills">💀${p.kills}</span>`:''}
      <span class="sb-score">${p.score||p.length||0}</span>
    </div>`).join('');
}

// ─── KILL FEED ────────────────────────────────────────────────────────────────
const killEntries=[];
function addKillFeed(html){
  const feed=$('kill-feed');
  const div=document.createElement('div');div.className='kill-entry';div.innerHTML=html;
  feed.insertBefore(div,feed.firstChild);killEntries.push(div);
  if(killEntries.length>5){const old=killEntries.shift();old?.remove();}
  setTimeout(()=>{div.style.opacity='0';div.style.transition='opacity .5s';setTimeout(()=>div.remove(),500);},4000);
}

function showAnnounce(text){
  const el=$('pu-announce');el.textContent=text;el.classList.remove('hidden');
  el.style.animation='none';void el.offsetWidth;el.style.animation='announceAnim .5s ease';
  setTimeout(()=>el.classList.add('hidden'),2000);
}

// ─── LOBBY RENDER ─────────────────────────────────────────────────────────────
function renderLobby({players,hostId,code,mapName}){
  const grid=$('player-grid');grid.innerHTML='';
  players.forEach(p=>{
    const slot=document.createElement('div');slot.className='player-slot filled';
    slot.style.borderColor=p.color;slot.style.boxShadow=`0 0 10px ${p.color}44`;
    slot.innerHTML=`<span class="player-blob-icon" style="background:${p.color};box-shadow:0 0 8px ${p.color}"></span>
      <span class="player-slot-name">${esc(p.username)}</span>
      ${p.id===hostId?'<span class="player-slot-host">👑 HOST</span>':''}`;
    grid.appendChild(slot);
  });
  for(let i=players.length;i<8;i++){
    const slot=document.createElement('div');slot.className='player-slot empty-slot';slot.textContent='+ JOIN';grid.appendChild(slot);
  }
  if(roomCode) $('room-code-display').textContent=roomCode;
  const meta=GAME_META[currentGame];
  $('btn-start').disabled=!(isHost&&players.length>=meta.minPlayers);
  $('lobby-msg').textContent=players.length<meta.minPlayers
    ?`Waiting for players... (${players.length}/${meta.minPlayers} min)`
    :isHost?`${players.length} players ready! Hit START.`:`${players.length} players. Waiting for host...`;
}

// ─── GAME OVER ────────────────────────────────────────────────────────────────
function handleGameOver(game, data) {
  stopGameLoop();
  $('game-canvas').style.filter='';

  const banner=$('winner-banner');
  const tbody=$('results-body');
  const thead=$('results-thead');

  if(game==='blob'||game==='snake') {
    const {winner,results}=data;
    const isMe=winner?.id===myId;
    banner.innerHTML=winner
      ?(isMe?`<span style="color:#FFD700;text-shadow:0 0 20px #FFD700">🏆 YOU WIN! 🏆</span>`
            :`<span style="color:${winner.color};text-shadow:0 0 20px ${winner.color}">🏆 ${esc(winner.username)} WINS!</span>`)
      :`<span style="color:#aaa">⏰ TIME'S UP!</span>`;
    if(isMe) Sounds.win(); else Sounds.lose();
    thead.innerHTML='<th>#</th><th>PLAYER</th><th>SCORE</th><th>KILLS</th>';
    tbody.innerHTML=results.map(r=>`<tr class="rank-${r.rank}">
      <td>${r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':r.rank}</td>
      <td style="color:${r.color}">⬤ ${esc(r.username)}${r.id===myId?' (you)':''}</td>
      <td>${r.score}</td><td>${r.kills||0}</td></tr>`).join('');
  } else if(game==='asteroid') {
    const {teamScore,wave,gameTime,results}=data;
    banner.innerHTML=`<span style="color:#BF5FFF;text-shadow:0 0 20px #BF5FFF">🚀 SURVIVED ${gameTime}s — WAVE ${wave}</span>`;
    Sounds.win();
    thead.innerHTML='<th>#</th><th>PLAYER</th><th>ASTEROIDS</th>';
    tbody.innerHTML=results.map(r=>`<tr class="rank-${r.rank}">
      <td>${r.rank}</td><td style="color:${r.color}">⬤ ${esc(r.username)}${r.id===myId?' (you)':''}</td>
      <td>${r.kills}</td></tr>`).join('');
  } else if(game==='pong') {
    const {winTeam,results,finalScore}=data;
    const myResult=results?.find(r=>r.id===myId);
    const won=myResult?.won;
    banner.innerHTML=`<span style="color:${winTeam==='left'?'#FF2D55':'#00F5FF'};text-shadow:0 0 20px ${winTeam==='left'?'#FF2D55':'#00F5FF'}">${winTeam?.toUpperCase()} TEAM WINS! ${finalScore?.left||0} — ${finalScore?.right||0}</span>`;
    if(won) Sounds.win(); else Sounds.lose();
    thead.innerHTML='<th>#</th><th>PLAYER</th><th>TEAM</th><th>HITS</th>';
    tbody.innerHTML=(results||[]).map(r=>`<tr class="${r.won?'rank-1':''}">
      <td>${r.won?'🏆':r.rank}</td><td style="color:${r.color}">⬤ ${esc(r.username)}${r.id===myId?' (you)':''}</td>
      <td style="color:${r.team==='left'?'#FF2D55':'#00F5FF'}">${r.team?.toUpperCase()}</td>
      <td>${r.score}</td></tr>`).join('');
  } else if(NewGamesClient.isNewGame(game)) {
    // Universal new-game over screen
    const {winner,results,winSide,winTeam,reason}=data;
    const w = winner || (winSide?{username:winSide.toUpperCase()+' TEAM',color:winSide==='left'?'#FF2D55':'#00F5FF'}:null)
              || (winTeam?{username:winTeam.toUpperCase()+' TEAM',color:winTeam==='red'?'#FF2D55':'#00F5FF'}:null);
    const isMe = w?.id===myId;
    const meta = GAME_META[game];
    banner.innerHTML = w
      ? (isMe
          ? `<span style="color:#FFD700;text-shadow:0 0 20px #FFD700">🏆 YOU WIN! 🏆</span>`
          : `<span style="color:${w.color||meta.color};text-shadow:0 0 20px ${w.color||meta.color}">🏆 ${esc(w.username||'?')} WINS!</span>`)
      : `<span style="color:#aaa">⏰ GAME OVER</span>`;
    if(reason==='survivor')banner.innerHTML+=`<div style="font-size:13px;color:#39FF14;margin-top:6px">LAST SURVIVOR!</div>`;
    if(isMe) Sounds.win(); else Sounds.lose();
    if(results&&results.length>0){
      // Detect result columns from first result
      const hasTiles = results[0]?.tiles!==undefined;
      const hasKills = results[0]?.kills!==undefined;
      const hasZone  = results[0]?.zoneTime!==undefined;
      const hasTeam  = results[0]?.team!==undefined;
      const hasLives = results[0]?.lives!==undefined;
      const hasAvgRt = results[0]?.avgReaction!==undefined;
      let headers='<th>#</th><th>PLAYER</th>';
      if(hasTeam)headers+='<th>TEAM</th>';
      if(hasKills)headers+='<th>KILLS</th>';
      if(hasTiles)headers+='<th>TILES</th>';
      if(hasZone)headers+='<th>ZONE TIME</th>';
      if(hasLives)headers+='<th>LIVES LEFT</th>';
      if(hasAvgRt)headers+='<th>AVG REACTION</th>';
      headers+='<th>SCORE</th>';
      thead.innerHTML=headers;
      tbody.innerHTML=results.map(r=>{
        const medal=r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':r.rank;
        const won=r.won||r.id===w?.id;
        let row=`<tr class="${won?'rank-1':r.rank<=3?'rank-'+r.rank:''}">
          <td>${medal}</td>
          <td style="color:${r.color}">⬤ ${esc(r.username||'?')}${r.id===myId?' (you)':''}</td>`;
        if(hasTeam)row+=`<td style="color:${r.team==='red'?'#FF2D55':r.team==='left'?'#FF2D55':'#00F5FF'}">${(r.team||r.side||'').toUpperCase()}</td>`;
        if(hasKills)row+=`<td>${r.kills||0}</td>`;
        if(hasTiles)row+=`<td>${r.tiles||r.score||0}</td>`;
        if(hasZone)row+=`<td>${Math.round((r.zoneTime||0)*10)/10}s</td>`;
        if(hasLives)row+=`<td>${r.lives||0} ❤️</td>`;
        if(hasAvgRt)row+=`<td>${r.avgReaction?r.avgReaction+'ms':'—'}</td>`;
        row+=`<td>${r.score||0}</td></tr>`;
        return row;
      }).join('');
    } else {
      thead.innerHTML='<th>RESULT</th>';
      tbody.innerHTML='<tr><td>No results</td></tr>';
    }
  }

  $('btn-play-again').textContent = isHost?'🔄 PLAY AGAIN':'⏳ WAITING FOR HOST...';
  showScreen('gameover');
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
function renderLeaderboard(lb, containerId) {
  const el=$(containerId);
  if(!lb||lb.length===0){el.innerHTML='<div style="color:#6060a0;text-align:center;padding:10px">No games yet!</div>';return;}
  el.innerHTML=lb.map((e,i)=>`<div class="lb-row">
    <span class="lb-rank">${i+1}</span>
    <span class="lb-dot" style="background:${e.color}"></span>
    <span class="lb-name">${esc(e.username)}</span>
    <span class="lb-wins">🏆${e.wins}W</span>
    <span class="lb-score">${e.totalScore}pts</span>
  </div>`).join('');
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function appendChat(container, entry){
  const div=document.createElement('div');div.className='chat-msg';
  div.innerHTML=`<span class="chat-msg-name" style="color:${entry.color}">${esc(entry.username)}:</span>
                 <span class="chat-msg-text">${entry.msg}</span>`;
  container.appendChild(div);container.scrollTop=container.scrollHeight;
  while(container.children.length>30)container.removeChild(container.firstChild);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
