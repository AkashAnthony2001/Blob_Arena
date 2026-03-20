/**
 * BLOB ARENA - Canvas Renderer
 * Draws the game world, blobs, bullets, power-ups, obstacles
 */

const Renderer = (() => {
  const CANVAS_W = 800, CANVAS_H = 600;
  let canvas, ctx;
  let myId = null;
  let particles = [];
  let mapObstacles = [];
  let mapIndex = 0;

  const MAP_THEMES = [
    { bg: '#0c0c1a', wall: '#1a1a3a', wallStroke: '#3a3aff', floor: '#0f0f20', gridColor: '#14142a' },
    { bg: '#0a1a0a', wall: '#1a3a1a', wallStroke: '#3aff3a', floor: '#0f1a0f', gridColor: '#141a14' },
    { bg: '#1a0a0a', wall: '#3a1a1a', wallStroke: '#ff3a3a', floor: '#1a0f0f', gridColor: '#1a1414' },
  ];

  function init(canvasEl, playerId) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    myId = playerId;
  }

  function setMap(obstacles, idx) {
    mapObstacles = obstacles || [];
    mapIndex = idx || 0;
  }

  function addParticle(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x, y, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, decay: 0.03 + Math.random() * 0.04,
        size: 3 + Math.random() * 5,
      });
    }
  }

  function updateParticles() {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= p.decay;
      p.size *= 0.97;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBackground(theme) {
    // Background
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid
    ctx.strokeStyle = theme.gridColor;
    ctx.lineWidth = 1;
    const GRID = 40;
    for (let x = 0; x <= CANVAS_W; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += GRID) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }

    // Arena border glow
    ctx.save();
    ctx.strokeStyle = theme.wallStroke;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = theme.wallStroke;
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
    ctx.restore();
  }

  function drawObstacles(theme) {
    for (const obs of mapObstacles) {
      // Wall shadow/glow
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = theme.wallStroke;
      ctx.fillStyle = theme.wall;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeStyle = theme.wallStroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.restore();

      // Wall pattern
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let i = obs.x; i < obs.x + obs.w; i += 10) {
        for (let j = obs.y; j < obs.y + obs.h; j += 10) {
          if ((Math.floor((i - obs.x) / 10) + Math.floor((j - obs.y) / 10)) % 2 === 0) {
            ctx.fillRect(i, j, 10, 10);
          }
        }
      }
    }
  }

  function drawBullet(b) {
    ctx.save();
    ctx.fillStyle = b.ownerColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = b.ownerColor;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
    ctx.fill();
    // Inner bright
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p, isMe) {
    if (!p.alive) return;
    const r = p.radius || 20;

    ctx.save();

    // Shield effect
    const now = Date.now();
    if (p.powerUps && p.powerUps.shield && p.powerUps.shield > now) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#00F5FF';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00F5FF';
      ctx.stroke();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#00F5FF';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Speed trail
    if (p.powerUps && p.powerUps.speed && p.powerUps.speed > now) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#FFD700';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Me indicator (outer ring)
    if (isMe) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Blob body with glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = p.color;
    const grad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    grad.addColorStop(0, lightenColor(p.color, 80));
    grad.addColorStop(0.6, p.color);
    grad.addColorStop(1, darkenColor(p.color, 40));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Eyes (two dots)
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + r * 0.3, p.y - r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(p.x - r * 0.28, p.y - r * 0.2, r * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + r * 0.32, p.y - r * 0.2, r * 0.07, 0, Math.PI * 2); ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.15, p.y - r * 0.35, r * 0.4, r * 0.2, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Username
    ctx.font = `bold ${Math.max(10, r * 0.55)}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(p.username, p.x + 1, p.y - r - 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.username, p.x, p.y - r - 6);

    // Health bar
    const barW = r * 2.2;
    const barH = 4;
    const barX = p.x - barW / 2;
    const barY = p.y + r + 5;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(barX, barY, barW, barH);
    const hpPct = Math.max(0, p.health / 100);
    const hpColor = hpPct > 0.5 ? '#39FF14' : hpPct > 0.25 ? '#FFD700' : '#FF2D55';
    ctx.fillStyle = hpColor;
    ctx.shadowBlur = 5;
    ctx.shadowColor = hpColor;
    ctx.fillRect(barX, barY, barW * hpPct, barH);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function drawPowerUp(pu) {
    const t = Date.now() / 500;
    const bob = Math.sin(t + pu.id) * 4;
    const spin = t * 0.8;

    ctx.save();
    ctx.translate(pu.x, pu.y + bob);

    // Glow ring
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.strokeStyle = pu.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = pu.color;
    ctx.stroke();

    // Inner fill pulse
    ctx.globalAlpha = 0.2 + Math.abs(Math.sin(t * 1.5)) * 0.3;
    ctx.fillStyle = pu.color;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Icon
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.icon, 0, 1);

    ctx.restore();
  }

  function render(state) {
    if (!ctx) return;
    updateParticles();

    const theme = MAP_THEMES[mapIndex % MAP_THEMES.length];
    drawBackground(theme);
    drawObstacles(theme);
    drawParticles();

    // Bullets
    if (state.bullets) {
      for (const b of state.bullets) drawBullet(b);
    }

    // Power-ups
    if (state.powerUps) {
      for (const pu of state.powerUps) drawPowerUp(pu);
    }

    // Players (draw me last so I'm always on top)
    if (state.players) {
      const others = state.players.filter(p => p.id !== myId);
      const me = state.players.find(p => p.id === myId);
      for (const p of others) drawPlayer(p, false);
      if (me) drawPlayer(me, true);
    }
  }

  // Color helpers
  function lightenColor(hex, amount) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }
  function darkenColor(hex, amount) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `rgb(${r},${g},${b})`;
  }

  return { init, setMap, render, addParticle };
})();
