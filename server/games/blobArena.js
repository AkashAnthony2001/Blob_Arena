/**
 * GAME 1: BLOB ARENA
 * Last-blob-standing shooter. Aim with mouse, shoot projectiles.
 * Namespace: /blob
 */

const CANVAS_W = 800, CANVAS_H = 600;
const PLAYER_RADIUS = 20, BULLET_RADIUS = 6;
const BULLET_SPEED = 7, PLAYER_SPEED = 4;
const GAME_DURATION = 90, MAX_PLAYERS = 8, MIN_PLAYERS = 2;
const TICK_RATE = 60, POWER_UP_INTERVAL = 8000;
const MAX_HEALTH = 100, BULLET_DAMAGE = 20;

const POWER_UP_TYPES = [
  { type:'speed',  color:'#FFD700', icon:'⚡', duration:5000, label:'SPEED BOOST' },
  { type:'shield', color:'#00F5FF', icon:'🛡', duration:4000, label:'SHIELD' },
  { type:'rapid',  color:'#FF2D55', icon:'🔥', duration:5000, label:'RAPID FIRE' },
  { type:'size',   color:'#39FF14', icon:'💪', duration:4000, label:'GIANT MODE' },
];

const MAPS = [
  { name:'Neon Colosseum', obstacles:[
    {x:200,y:150,w:80,h:20},{x:520,y:150,w:80,h:20},{x:350,y:100,w:20,h:80},
    {x:200,y:430,w:80,h:20},{x:520,y:430,w:80,h:20},{x:350,y:420,w:20,h:80},
    {x:100,y:280,w:20,h:80},{x:680,y:280,w:20,h:80},
  ]},
  { name:'Cyber Maze', obstacles:[
    {x:160,y:100,w:20,h:160},{x:620,y:340,w:20,h:160},{x:300,y:200,w:160,h:20},
    {x:340,y:380,w:160,h:20},{x:100,y:400,w:120,h:20},{x:580,y:180,w:120,h:20},
  ]},
  { name:'Acid Pit', obstacles:[
    {x:250,y:250,w:300,h:100},{x:100,y:100,w:40,h:40},{x:660,y:100,w:40,h:40},
    {x:100,y:460,w:40,h:40},{x:660,y:460,w:40,h:40},
  ]},
];

function circleRect(cx,cy,cr,rx,ry,rw,rh) {
  const nx=Math.max(rx,Math.min(cx,rx+rw)), ny=Math.max(ry,Math.min(cy,ry+rh));
  return (cx-nx)**2+(cy-ny)**2 < cr*cr;
}
function circleCircle(x1,y1,r1,x2,y2,r2) {
  return (x1-x2)**2+(y1-y2)**2 < (r1+r2)**2;
}

module.exports = function(io, COLORS, generateCode, recordWin) {
  const ns = io.of('/blob');
  const rooms = new Map();

  function makeRoom(code) {
    return { code, players:new Map(), bullets:[], powerUps:[],
      state:'lobby', timeLeft:GAME_DURATION, mapIndex:Math.floor(Math.random()*MAPS.length),
      tickInterval:null, powerUpInterval:null, hostId:null };
  }

  function spawnPlayer(id, username, ci, mapIndex) {
    const spawns = [{x:80,y:80},{x:720,y:80},{x:80,y:520},{x:720,y:520},
                    {x:400,y:60},{x:400,y:540},{x:60,y:300},{x:740,y:300}];
    const s = spawns[ci % spawns.length];
    return { id, username, color:COLORS[ci%COLORS.length], x:s.x, y:s.y,
      health:MAX_HEALTH, alive:true, score:0, kills:0, deaths:0,
      input:{up:false,down:false,left:false,right:false,shoot:false,mouseX:400,mouseY:300},
      lastShot:0, shootCooldown:300, powerUps:{}, radius:PLAYER_RADIUS, regenTimer:0 };
  }

  function tick(room) {
    if (room.state !== 'playing') return;
    const now = Date.now();
    const map = MAPS[room.mapIndex];

    for (const [,p] of room.players) {
      if (!p.alive) continue;
      const hasSpeed = p.powerUps.speed > now, hasRapid = p.powerUps.rapid > now;
      const hasSize  = p.powerUps.size  > now;
      p.radius = hasSize ? PLAYER_RADIUS*1.6 : PLAYER_RADIUS;
      const spd = hasSpeed ? PLAYER_SPEED*1.7 : PLAYER_SPEED;
      p.shootCooldown = hasRapid ? 120 : 300;
      let dx=0,dy=0;
      if(p.input.up)   dy-=1; if(p.input.down)  dy+=1;
      if(p.input.left) dx-=1; if(p.input.right) dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      let nx=p.x+dx*spd, ny=p.y+dy*spd;
      nx=Math.max(p.radius,Math.min(CANVAS_W-p.radius,nx));
      ny=Math.max(p.radius,Math.min(CANVAS_H-p.radius,ny));
      for(const obs of map.obstacles) {
        if(circleRect(nx,ny,p.radius,obs.x,obs.y,obs.w,obs.h)) {
          if(!circleRect(p.x,ny,p.radius,obs.x,obs.y,obs.w,obs.h)) nx=p.x;
          else if(!circleRect(nx,p.y,p.radius,obs.x,obs.y,obs.w,obs.h)) ny=p.y;
          else {nx=p.x;ny=p.y;}
        }
      }
      p.x=nx; p.y=ny;
      if(p.input.shoot && now-p.lastShot>p.shootCooldown) {
        p.lastShot=now;
        const a=Math.atan2(p.input.mouseY-p.y,p.input.mouseX-p.x);
        room.bullets.push({ id:Math.random().toString(36).substr(2,5),
          ownerId:p.id, ownerColor:p.color,
          x:p.x+Math.cos(a)*(p.radius+8), y:p.y+Math.sin(a)*(p.radius+8),
          vx:Math.cos(a)*BULLET_SPEED, vy:Math.sin(a)*BULLET_SPEED, life:120 });
      }
      p.regenTimer++;
      if(p.regenTimer>180&&p.health<MAX_HEALTH) p.health=Math.min(MAX_HEALTH,p.health+0.05);
    }

    const toRemove=new Set();
    for(let i=0;i<room.bullets.length;i++) {
      const b=room.bullets[i];
      b.x+=b.vx; b.y+=b.vy; b.life--;
      if(b.x<0||b.x>CANVAS_W||b.y<0||b.y>CANVAS_H||b.life<=0){toRemove.add(i);continue;}
      if(map.obstacles.some(o=>circleRect(b.x,b.y,BULLET_RADIUS,o.x,o.y,o.w,o.h))){toRemove.add(i);continue;}
      for(const [,p] of room.players) {
        if(!p.alive||p.id===b.ownerId) continue;
        if(circleCircle(b.x,b.y,BULLET_RADIUS,p.x,p.y,p.radius)) {
          toRemove.add(i);
          if(!(p.powerUps.shield>now)) {
            p.health-=BULLET_DAMAGE; p.regenTimer=0;
            if(p.health<=0) {
              p.health=0; p.alive=false; p.deaths++;
              const shooter=room.players.get(b.ownerId);
              if(shooter){shooter.kills++;shooter.score+=100;}
              ns.to(room.code).emit('playerDied',{deadId:p.id,deadName:p.username,
                killerId:b.ownerId,killerName:shooter?shooter.username:'?'});
            }
          }
          break;
        }
      }
    }
    room.bullets=room.bullets.filter((_,i)=>!toRemove.has(i));

    room.powerUps=room.powerUps.filter(pu=>{
      for(const[,p] of room.players) {
        if(!p.alive) continue;
        if(circleCircle(p.x,p.y,p.radius,pu.x,pu.y,18)) {
          const t=POWER_UP_TYPES.find(t=>t.type===pu.type);
          p.powerUps[pu.type]=now+t.duration;
          ns.to(room.code).emit('powerUpCollected',{playerId:p.id,type:pu.type,label:t.label});
          return false;
        }
      }
      return true;
    });

    const alive=[...room.players.values()].filter(p=>p.alive);
    if(alive.length<=1&&room.players.size>=MIN_PLAYERS){endGame(room,alive[0]||null);return;}
    room.timeLeft-=TICK_RATE/1000;
    if(room.timeLeft<=0){
      const sorted=[...room.players.values()].sort((a,b)=>b.score-a.score);
      endGame(room,sorted[0]||null); return;
    }
    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({
        id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,
        health:p.health,alive:p.alive,score:p.score,kills:p.kills,
        radius:p.radius,powerUps:Object.fromEntries(Object.entries(p.powerUps).filter(([,v])=>v>now))
      })),
      bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,ownerColor:b.ownerColor})),
      powerUps:room.powerUps, timeLeft:Math.ceil(room.timeLeft)
    });
  }

  function endGame(room,winner) {
    clearInterval(room.tickInterval); clearInterval(room.powerUpInterval);
    room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score)
      .map((p,i)=>({rank:i+1,id:p.id,username:p.username,color:p.color,
        score:p.score,kills:p.kills,deaths:p.deaths}));
    if(winner) recordWin(winner.username,winner.color,'Blob Arena',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function spawnPowerUp(room) {
    if(room.state!=='playing') return;
    const t=POWER_UP_TYPES[Math.floor(Math.random()*POWER_UP_TYPES.length)];
    const map=MAPS[room.mapIndex];
    let x,y,ok; let tries=0;
    do{ x=60+Math.random()*(CANVAS_W-120); y=60+Math.random()*(CANVAS_H-120);
      ok=!map.obstacles.some(o=>circleRect(x,y,24,o.x,o.y,o.w,o.h)); tries++; }
    while(!ok&&tries<20);
    room.powerUps.push({id:Date.now(),x,y,...t});
    ns.to(room.code).emit('powerUpSpawned',room.powerUps);
  }

  function startGame(room) {
    room.state='playing'; room.timeLeft=GAME_DURATION;
    room.bullets=[]; room.powerUps=[];
    let ci=0;
    for(const[id,p] of room.players) room.players.set(id,spawnPlayer(id,p.username,ci++,room.mapIndex));
    ns.to(room.code).emit('gameStart',{
      mapIndex:room.mapIndex, mapName:MAPS[room.mapIndex].name,
      obstacles:MAPS[room.mapIndex].obstacles, duration:GAME_DURATION,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,radius:p.radius}))
    });
    room.tickInterval=setInterval(()=>tick(room),TICK_RATE);
    room.powerUpInterval=setInterval(()=>spawnPowerUp(room),POWER_UP_INTERVAL);
  }

  function countdown(room) {
    room.state='countdown'; let n=3;
    ns.to(room.code).emit('countdown',n);
    const cd=setInterval(()=>{ n--;
      if(n<=0){clearInterval(cd);startGame(room);}
      else ns.to(room.code).emit('countdown',n);
    },1000);
  }

  function emitLobby(room) {
    ns.to(room.code).emit('lobbyUpdate',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),
      hostId:room.hostId, mapName:MAPS[room.mapIndex].name, code:room.code
    });
  }

  ns.on('connection',(socket)=>{
    socket.on('createRoom',({username})=>{
      if(!username||username.length>16) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code; socket.gameNs='/blob';
      room.players.set(socket.id,spawnPlayer(socket.id,username,0,room.mapIndex));
      socket.emit('roomCreated',{code,mapName:MAPS[room.mapIndex].name,isHost:true,game:'blob'});
      emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room){socket.emit('error','Room not found!');return;}
      if(room.state!=='lobby'){socket.emit('error','Game in progress!');return;}
      if(room.players.size>=MAX_PLAYERS){socket.emit('error','Room full!');return;}
      socket.join(room.code); socket.roomCode=room.code; socket.gameNs='/blob';
      const ci=room.players.size;
      room.players.set(socket.id,spawnPlayer(socket.id,username,ci,room.mapIndex));
      socket.emit('roomJoined',{code:room.code,mapName:MAPS[room.mapIndex].name,isHost:false,game:'blob'});
      emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id) return;
      if(room.players.size<MIN_PLAYERS){socket.emit('error',`Need ${MIN_PLAYERS}+ players`);return;}
      countdown(room);
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id);
      if(!p||!p.alive) return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,shoot:!!inp.shoot,
        mouseX:Math.max(0,Math.min(CANVAS_W,Number(inp.mouseX)||400)),
        mouseY:Math.max(0,Math.min(CANVAS_H,Number(inp.mouseY)||300))};
    });
    socket.on('chatMessage',({msg})=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      const p=room.players.get(socket.id); if(!p) return;
      ns.to(room.code).emit('chatMessage',{username:p.username,color:p.color,msg:String(msg).slice(0,80).replace(/</g,'&lt;')});
    });
    socket.on('restartGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.state!=='ended') return;
      const mi=Math.floor(Math.random()*MAPS.length); room.mapIndex=mi;
      room.bullets=[]; room.powerUps=[]; room.state='lobby'; room.timeLeft=GAME_DURATION;
      let ci=0;
      for(const[id,p] of room.players) room.players.set(id,spawnPlayer(id,p.username,ci++,mi));
      ns.to(room.code).emit('gameRestarted',{mapName:MAPS[mi].name});
      emitLobby(room);
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      const p=room.players.get(socket.id);
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);clearInterval(room.powerUpInterval);rooms.delete(room.code);}
      else{
        if(room.hostId===socket.id) room.hostId=room.players.keys().next().value;
        if(room.state==='playing'&&p) p.alive=false;
        emitLobby(room);
      }
    });
  });
};
