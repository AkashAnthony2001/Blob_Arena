/**
 * NEON ARCADE — Shared Game Utilities
 * Used by all 20 new game modules
 */

// ─── Geometry ─────────────────────────────────────────────────────────────────
function circleRect(cx,cy,cr,rx,ry,rw,rh) {
  const nx=Math.max(rx,Math.min(cx,rx+rw)), ny=Math.max(ry,Math.min(cy,ry+rh));
  return (cx-nx)**2+(cy-ny)**2 < cr*cr;
}
function circleCircle(x1,y1,r1,x2,y2,r2) {
  return (x1-x2)**2+(y1-y2)**2 < (r1+r2)**2;
}
function dist(x1,y1,x2,y2){ return Math.sqrt((x1-x2)**2+(y1-y2)**2); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function randInt(lo,hi){ return lo+Math.floor(Math.random()*(hi-lo+1)); }
function randF(lo,hi){ return lo+Math.random()*(hi-lo); }
function angle(x1,y1,x2,y2){ return Math.atan2(y2-y1,x2-x1); }
function rectRect(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

// ─── Standard spawns for 800×600 canvas ──────────────────────────────────────
const SPAWNS_8 = [
  {x:80,y:80},{x:720,y:80},{x:80,y:520},{x:720,y:520},
  {x:400,y:60},{x:400,y:540},{x:60,y:300},{x:740,y:300}
];
function spawn(ci){ const s=SPAWNS_8[ci%8]; return {x:s.x,y:s.y}; }

// ─── Simple AI Bot ────────────────────────────────────────────────────────────
function aiInput(bot, targets, W, H) {
  const inp = {up:false,down:false,left:false,right:false,shoot:false,mouseX:W/2,mouseY:H/2};
  if (!targets || targets.length === 0) return inp;
  // Pick closest target
  let best = null, bd = Infinity;
  for (const t of targets) {
    const d = dist(bot.x,bot.y,t.x,t.y);
    if (d < bd) { bd = d; best = t; }
  }
  if (!best) return inp;
  // Move toward target
  const dx = best.x - bot.x, dy = best.y - bot.y;
  const d = Math.sqrt(dx*dx+dy*dy);
  const CHASE_DIST = 200, FLEE_DIST = 60;
  if (d > CHASE_DIST) {
    inp.up    = dy < -5;
    inp.down  = dy > 5;
    inp.left  = dx < -5;
    inp.right = dx > 5;
  } else if (d < FLEE_DIST) {
    inp.up    = dy > 0;
    inp.down  = dy < 0;
    inp.left  = dx > 0;
    inp.right = dx < 0;
  }
  // Aim & shoot
  inp.mouseX = best.x + randF(-20,20);
  inp.mouseY = best.y + randF(-20,20);
  inp.shoot  = d < 350 && Math.random() < 0.3;
  return inp;
}

// ─── Room lifecycle helpers ───────────────────────────────────────────────────
function startCountdown(ns, room, onStart) {
  room.state = 'countdown'; let n = 3;
  ns.to(room.code).emit('countdown', n);
  const cd = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(cd); onStart(); }
    else ns.to(room.code).emit('countdown', n);
  }, 1000);
}

function makeBaseRoom(code) {
  return { code, players: new Map(), state:'lobby', hostId:null,
    tickInterval:null, powerUpInterval:null };
}

// ─── Power-up types ───────────────────────────────────────────────────────────
const POWER_UP_TYPES = [
  { type:'speed',  color:'#FFD700', icon:'⚡', duration:5000 },
  { type:'shield', color:'#00F5FF', icon:'🛡', duration:4000 },
  { type:'rapid',  color:'#FF2D55', icon:'🔥', duration:5000 },
  { type:'bomb',   color:'#FF9500', icon:'💣', duration:0 },
];

function randPU(){ return POWER_UP_TYPES[Math.floor(Math.random()*POWER_UP_TYPES.length)]; }

function spawnPowerUpAt(room, W, H) {
  const t = randPU();
  return { id: Date.now()+Math.random(), x: randF(40, W-40), y: randF(40, H-40), ...t };
}

module.exports = {
  circleRect, circleCircle, dist, clamp, randInt, randF, angle, rectRect,
  SPAWNS_8, spawn, aiInput, startCountdown, makeBaseRoom, POWER_UP_TYPES, randPU, spawnPowerUpAt
};
