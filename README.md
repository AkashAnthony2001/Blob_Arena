# 🕹️ NEON ARCADE — 4 Multiplayer Games

A browser-based multiplayer arcade with 4 real-time games built with Node.js, Socket.io, and HTML5 Canvas.

## 🎮 Games

| Game | Type | Players | Description |
|---|---|---|---|
| 🟢 **Blob Arena** | PvP | 2–8 | Shoot other blobs. Last one alive wins. |
| 🐍 **Snake Royale** | PvP | 2–6 | Grow longest, eat rivals, survive. |
| 🚀 **Asteroid Dash** | Co-op | 1–6 | Survive waves of asteroids together. |
| 🏓 **Pong Wars** | Teams | 2–4 | Multi-ball team pong chaos. First to 7 wins. |

---

## 🚀 Setup

```bash
npm install
npm start
# → http://localhost:3000
```

---

## 🎮 Controls

| Game | Move | Shoot/Action |
|---|---|---|
| Blob Arena | WASD | Mouse aim + Click/Space |
| Snake Royale | WASD or Arrow Keys | (none) |
| Asteroid Dash | W (thrust) | Mouse aim + Click/Space |
| Pong Wars | W/S or Up/Down | (automatic) |

**All games:** TAB = Scoreboard | T = Chat

---

## 📁 Structure

```
neon-arcade/
├── server/
│   ├── index.js              ← Main server
│   └── games/
│       ├── blobArena.js      ← Blob Arena server logic
│       ├── snakeRoyale.js    ← Snake Royale server logic
│       ├── asteroidDash.js   ← Asteroid Dash server logic
│       └── pongWars.js       ← Pong Wars server logic
├── public/
│   ├── index.html            ← Arcade hub
│   ├── css/style.css         ← Neon retro styles
│   └── js/
│       ├── arcade.js         ← Main client + UI
│       ├── sounds.js         ← Web Audio sound effects
│       └── games/
│           ├── blobRenderer.js
│           ├── snakeRenderer.js
│           ├── asteroidRenderer.js
│           └── pongRenderer.js
└── package.json
```

## 🌐 Deploy on Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

## 🔧 Deploy on Render

- Build: `npm install`
- Start: `node server/index.js`
- Publish directory: *(leave blank)*
