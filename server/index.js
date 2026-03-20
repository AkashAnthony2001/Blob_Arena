/**
 * NEON ARCADE - Main Server (EXPANDED: 24 Games)
 * Original 4 + 20 New Multiplayer Games
 * DO NOT EDIT THE ORIGINAL GAME SECTION - append only
 * 4 Multiplayer Games (original):
 *  1. Blob Arena    - Last blob standing shooter
 *  2. Snake Royale  - Multiplayer snake battle
 *  3. Asteroid Dash - Cooperative asteroid survival
 *  4. Pong Wars     - Team pong battle
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../public')));

// ─── Shared Utilities ─────────────────────────────────────────────────────────
const PLAYER_COLORS = [
  '#FF2D55','#00F5FF','#39FF14','#FF9500',
  '#BF5FFF','#FF6EC7','#FFD700','#00FF8C'
];

function generateCode() {
  return Math.random().toString(36).substring(2,6).toUpperCase();
}

// Session leaderboard (across all games)
const globalLeaderboard = [];
function recordWin(username, color, game, score) {
  const e = globalLeaderboard.find(x => x.username === username);
  if (e) { e.wins++; e.totalScore += score; e.games++; }
  else globalLeaderboard.push({ username, color, wins:1, totalScore:score, games:1, lastGame:game });
  globalLeaderboard.sort((a,b) => b.wins-a.wins || b.totalScore-a.totalScore);
}

// ─── Load Game Servers ────────────────────────────────────────────────────────
require('./games/blobArena')(io, PLAYER_COLORS, generateCode, recordWin);
require('./games/snakeRoyale')(io, PLAYER_COLORS, generateCode, recordWin);
require('./games/asteroidDash')(io, PLAYER_COLORS, generateCode, recordWin);
require('./games/pongWars')(io, PLAYER_COLORS, generateCode, recordWin);

// ─── Load 20 New Game Servers ─────────────────────────────────────────────────

// 🏰 CLASH ROYALE-STYLE (3 games)
require('./games/laneClash')(io, PLAYER_COLORS, generateCode, recordWin);      // /laneclash
require('./games/towerSiege')(io, PLAYER_COLORS, generateCode, recordWin);     // /towersiege
require('./games/unitRush')(io, PLAYER_COLORS, generateCode, recordWin);       // /unitrush

// 🔫 SHOOTER / COMBAT (5 games)
require('./games/bulletHell')(io, PLAYER_COLORS, generateCode, recordWin);     // /bullethell
require('./games/neonTanks')(io, PLAYER_COLORS, generateCode, recordWin);      // /neontanks
require('./games/laserTag')(io, PLAYER_COLORS, generateCode, recordWin);       // /lasertag
require('./games/spaceDuel')(io, PLAYER_COLORS, generateCode, recordWin);      // /spaceduel
require('./games/cyberCapture')(io, PLAYER_COLORS, generateCode, recordWin);   // /cybercapture

// ⚡ COMPETITIVE ARCADE (5 games)
require('./games/reactionRace')(io, PLAYER_COLORS, generateCode, recordWin);   // /reactionrace
require('./games/territoryWar')(io, PLAYER_COLORS, generateCode, recordWin);   // /territory
require('./games/kingOfHill')(io, PLAYER_COLORS, generateCode, recordWin);     // /koth
require('./games/infectionMode')(io, PLAYER_COLORS, generateCode, recordWin);  // /infection
require('./games/gravityWars')(io, PLAYER_COLORS, generateCode, recordWin);    // /gravitywars

// 🎪 PHYSICS / FUN MULTIPLAYER (5 games)
require('./games/knockoutArena')(io, PLAYER_COLORS, generateCode, recordWin);  // /knockout
require('./games/ballBlitz')(io, PLAYER_COLORS, generateCode, recordWin);      // /ballblitz
require('./games/fallingTiles')(io, PLAYER_COLORS, generateCode, recordWin);   // /fallingtiles
require('./games/chainReaction')(io, PLAYER_COLORS, generateCode, recordWin);  // /chainreaction
require('./games/neonSumo')(io, PLAYER_COLORS, generateCode, recordWin);       // /neonsumo
require('./games/blitzCatcher')(io, PLAYER_COLORS, generateCode, recordWin);   // /blitzcatcher

// ─── Global Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('getGlobalLeaderboard', () => {
    socket.emit('globalLeaderboard', globalLeaderboard.slice(0,10));
  });
});

app.get('/api/leaderboard', (req, res) => res.json(globalLeaderboard.slice(0,10)));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🕹️  NEON ARCADE running → http://localhost:${PORT}\n`));
