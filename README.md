# 🟢 BLOB ARENA — Multiplayer Flash-Style Browser Game

A real-time multiplayer survival arena game built with Node.js, Socket.io, and HTML5 Canvas.

**Last Blob Standing Wins!** Shoot other blobs, collect power-ups, survive the timer.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed

### Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
# → http://localhost:3000
```

For development with auto-reload:
```bash
npm run dev
```

---

## 🎮 How to Play

| Action | Control |
|---|---|
| Move | WASD or Arrow Keys |
| Aim | Mouse |
| Shoot | Left Click or Space |
| Scoreboard | Hold Tab |
| Chat | T (then Enter to send) |

### Flow
1. Enter your name on the start screen
2. Create a room or join with a 4-letter code
3. Share the room code with friends (min 2 players)
4. Host clicks **START GAME**
5. Countdown → Arena battle begins!
6. Eliminate other blobs or survive the 90-second timer
7. Last blob alive wins! (or highest score when time runs out)

---

## ⚡ Power-Ups

| Icon | Name | Effect |
|---|---|---|
| ⚡ | Speed Boost | Move 70% faster for 5 seconds |
| 🛡️ | Shield | Block all damage for 4 seconds |
| 🔥 | Rapid Fire | Shoot 2.5x faster for 5 seconds |
| 💪 | Giant Mode | Grow 60% larger for 4 seconds |

---

## 🗺️ Maps

- **Neon Colosseum** — Symmetric walls, perfect for fair fights
- **Cyber Maze** — Winding corridors and ambush points  
- **Acid Pit** — Central obstacle forces edge play

Maps are randomly selected each game.

---

## 📁 Project Structure

```
blob-arena/
├── server/
│   └── index.js          # Game server (Express + Socket.io + game logic)
├── public/
│   ├── index.html         # Main HTML
│   ├── css/
│   │   └── style.css      # Flash-style neon CSS
│   └── js/
│       ├── sounds.js      # Web Audio API sound effects
│       ├── renderer.js    # Canvas rendering engine
│       └── game.js        # Client-side game logic & socket events
├── package.json
└── README.md
```

---

## 🛡️ Anti-Cheat

- All movement and shooting is validated server-side
- Player positions are calculated on the server (authoritative)
- Input values are type-checked and clamped
- Shoot cooldowns enforced server-side

---

## 🔧 Configuration (server/index.js)

```js
const GAME_DURATION = 90;     // seconds per round
const MAX_PLAYERS = 8;         // players per room
const PLAYER_SPEED = 4;        // movement speed
const BULLET_SPEED = 7;        // projectile speed
const BULLET_DAMAGE = 20;      // damage per hit
const POWER_UP_INTERVAL = 8000; // ms between power-up spawns
```

---

## 🌐 Deploying

Works on any Node.js host (Railway, Render, Heroku, etc.):

```bash
# Set PORT environment variable (default: 3000)
PORT=8080 npm start
```

For Socket.io in production, make sure your proxy supports WebSocket upgrades.

---

## 🎨 Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JS + HTML5 Canvas
- **Audio**: Web Audio API (no external files needed)
- **Fonts**: Google Fonts (Orbitron + Share Tech Mono)
