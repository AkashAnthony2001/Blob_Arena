/**
 * GAME 3: ASTEROID DASH
 * Co-op survival! All players on the same team. Dodge & shoot asteroids.
 * Waves get faster. Survive as long as possible. Score = time survived + kills.
 * Namespace: /asteroid
 */

const W=800,H=600;
const PLAYER_SPEED=4, BULLET_SPEED=9, TICK=50;
const MIN_PLAYERS=1, MAX_PLAYERS=6;
const SHIP_RADIUS=14, BULLET_R=5, ASTEROID_MIN_R=15, ASTEROID_MAX_R=45;

module.exports = function(io, COLORS, generateCode, recordWin) {
  const ns = io.of('/asteroid');
  const rooms = new Map();

  function makeRoom(code) {
    return { code, players:new Map(), bullets:[], asteroids:[], particles:[],
      state:'lobby', wave:0, score:0, lives:5, spawnTimer:0,
      tickInterval:null, hostId:null, gameTime:0 };
  }

  function spawnPlayer(id, username, ci) {
    const cx=W/2, cy=H/2;
    const angle=(Math.PI*2/6)*ci;
    return { id, username, color:COLORS[ci%COLORS.length],
      x:cx+Math.cos(angle)*80, y:cy+Math.sin(angle)*80,
      angle:0, vx:0, vy:0, alive:true, score:0, kills:0,
      input:{up:false,left:false,right:false,shoot:false,mouseX:W/2,mouseY:0},
      lastShot:0, shootCooldown:250, invincible:0 };
  }

  function spawnAsteroid(wave) {
    // Spawn from edges
    const side=Math.floor(Math.random()*4);
    let x,y,vx,vy;
    const speed=(1.2+wave*0.25)*( 0.6+Math.random()*0.8);
    const angle=Math.random()*Math.PI*2;
    if(side===0){x=Math.random()*W;y=-50;}
    else if(side===1){x=W+50;y=Math.random()*H;}
    else if(side===2){x=Math.random()*W;y=H+50;}
    else{x=-50;y=Math.random()*H;}
    // Aim roughly at center with some spread
    const targetAngle=Math.atan2(H/2-y,W/2-x)+(Math.random()-0.5)*1.2;
    vx=Math.cos(targetAngle)*speed;
    vy=Math.sin(targetAngle)*speed;
    const r=ASTEROID_MIN_R+Math.random()*(ASTEROID_MAX_R-ASTEROID_MIN_R);
    return { id:Date.now()+Math.random(), x, y, vx, vy, r, hp:Math.ceil(r/12),
      spin:( Math.random()-0.5)*0.05, angle:0, type:r>35?'large':r>25?'medium':'small' };
  }

  function tick(room) {
    if(room.state!=='playing') return;
    room.gameTime+=TICK/1000;
    room.score+=1; // score per tick

    // Asteroid spawning — wave system
    room.spawnTimer--;
    if(room.spawnTimer<=0) {
      const wave=room.wave;
      const count=1+Math.floor(wave/2);
      for(let i=0;i<count;i++) room.asteroids.push(spawnAsteroid(wave));
      room.spawnTimer=Math.max(8,40-wave*3); // faster spawn per wave
    }

    // Wave progression
    if(room.gameTime>0 && room.gameTime%20<TICK/1000) room.wave++;

    // Move players
    for(const[,p] of room.players) {
      if(!p.alive) continue;
      if(p.invincible>0) p.invincible--;
      // Rotate toward mouse
      const targetAngle=Math.atan2(p.input.mouseY-p.y,p.input.mouseX-p.x);
      p.angle=targetAngle;
      // Thrust
      if(p.input.up){
        p.vx+=Math.cos(p.angle)*0.4;
        p.vy+=Math.sin(p.angle)*0.4;
      }
      p.vx*=0.92; p.vy*=0.92;
      p.x+=p.vx; p.y+=p.vy;
      // Wrap around
      if(p.x<-20)p.x=W+20; if(p.x>W+20)p.x=-20;
      if(p.y<-20)p.y=H+20; if(p.y>H+20)p.y=-20;
      // Shoot
      const now=Date.now();
      if(p.input.shoot&&now-p.lastShot>p.shootCooldown) {
        p.lastShot=now;
        room.bullets.push({ id:Math.random().toString(36).substr(2,5),
          ownerId:p.id, color:p.color,
          x:p.x+Math.cos(p.angle)*20, y:p.y+Math.sin(p.angle)*20,
          vx:Math.cos(p.angle)*BULLET_SPEED+p.vx,
          vy:Math.sin(p.angle)*BULLET_SPEED+p.vy, life:60 });
      }
    }

    // Move asteroids
    for(const a of room.asteroids) {
      a.x+=a.vx; a.y+=a.vy;
      a.angle+=a.spin;
    }
    // Remove far asteroids
    room.asteroids=room.asteroids.filter(a=>
      a.x>-150&&a.x<W+150&&a.y>-150&&a.y<H+150
    );

    // Bullet-asteroid collision
    const removeBullets=new Set(), removeAsteroids=new Set();
    for(let bi=0;bi<room.bullets.length;bi++){
      const b=room.bullets[bi];
      b.x+=b.vx; b.y+=b.vy; b.life--;
      if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H){removeBullets.add(bi);continue;}
      for(let ai=0;ai<room.asteroids.length;ai++){
        const a=room.asteroids[ai];
        if((b.x-a.x)**2+(b.y-a.y)**2<(BULLET_R+a.r)**2){
          removeBullets.add(bi);
          a.hp--;
          if(a.hp<=0){
            removeAsteroids.add(ai);
            // Split large asteroids
            if(a.r>28){
              for(let s=0;s<2;s++){
                const na=spawnAsteroid(room.wave);
                na.x=a.x+(Math.random()-0.5)*20;
                na.y=a.y+(Math.random()-0.5)*20;
                na.r=a.r*0.5;
                na.hp=1;
                room.asteroids.push(na);
              }
            }
            const shooter=room.players.get(b.ownerId);
            if(shooter){shooter.kills++;shooter.score+=a.type==='large'?30:a.type==='medium'?15:8;}
            room.score+=a.type==='large'?50:a.type==='medium'?25:10;
          }
          break;
        }
      }
    }
    room.bullets=room.bullets.filter((_,i)=>!removeBullets.has(i));
    room.asteroids=room.asteroids.filter((_,i)=>!removeAsteroids.has(i));

    // Asteroid-player collision
    for(const a of room.asteroids) {
      for(const[,p] of room.players) {
        if(!p.alive||p.invincible>0) continue;
        if((p.x-a.x)**2+(p.y-a.y)**2<(SHIP_RADIUS+a.r*0.7)**2){
          p.invincible=60; // 3s invincibility after hit
          room.lives--;
          ns.to(room.code).emit('hit',{playerId:p.id,lives:room.lives});
          if(room.lives<=0){ endGame(room); return; }
        }
      }
    }

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({
        id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,
        angle:p.angle,alive:p.alive,score:p.score,kills:p.kills,
        invincible:p.invincible>0
      })),
      bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,color:b.color})),
      asteroids:room.asteroids.map(a=>({id:a.id,x:a.x,y:a.y,r:a.r,angle:a.angle,hp:a.hp})),
      score:room.score, lives:room.lives, wave:room.wave,
      gameTime:Math.floor(room.gameTime)
    });
  }

  function endGame(room) {
    clearInterval(room.tickInterval);
    room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score)
      .map((p,i)=>({rank:i+1,id:p.id,username:p.username,color:p.color,
        score:p.score,kills:p.kills}));
    // Everyone wins together — credit top scorer
    const top=results[0];
    if(top) recordWin(top.username,top.color,'Asteroid Dash',room.score);
    ns.to(room.code).emit('gameOver',{
      teamScore:room.score,wave:room.wave,gameTime:Math.floor(room.gameTime),results
    });
  }

  function startGame(room) {
    room.state='playing'; room.bullets=[]; room.asteroids=[];
    room.wave=1; room.score=0; room.lives=5; room.spawnTimer=30; room.gameTime=0;
    let ci=0;
    for(const[id,p] of room.players) room.players.set(id,spawnPlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,angle:p.angle})),
      lives:room.lives, wave:room.wave
    });
    room.tickInterval=setInterval(()=>tick(room),TICK);
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
      hostId:room.hostId, code:room.code, game:'asteroid'
    });
  }

  ns.on('connection',(socket)=>{
    socket.on('createRoom',({username})=>{
      if(!username||username.length>16) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code;
      room.players.set(socket.id,spawnPlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'asteroid'});
      emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room){socket.emit('error','Room not found!');return;}
      if(room.state!=='lobby'){socket.emit('error','Game in progress!');return;}
      if(room.players.size>=MAX_PLAYERS){socket.emit('error','Room full!');return;}
      socket.join(room.code); socket.roomCode=room.code;
      const ci=room.players.size;
      room.players.set(socket.id,spawnPlayer(socket.id,username,ci));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'asteroid'});
      emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id) return;
      countdown(room);
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id); if(!p) return;
      p.input={up:!!inp.up,shoot:!!inp.shoot,
        mouseX:Math.max(0,Math.min(W,Number(inp.mouseX)||W/2)),
        mouseY:Math.max(0,Math.min(H,Number(inp.mouseY)||H/2))};
    });
    socket.on('chatMessage',({msg})=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      const p=room.players.get(socket.id); if(!p) return;
      ns.to(room.code).emit('chatMessage',{username:p.username,color:p.color,msg:String(msg).slice(0,80).replace(/</g,'&lt;')});
    });
    socket.on('restartGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.state!=='ended') return;
      room.state='lobby';
      let ci=0;
      for(const[id,p] of room.players) room.players.set(id,spawnPlayer(id,p.username,ci++));
      ns.to(room.code).emit('gameRestarted',{});
      emitLobby(room);
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{
        if(room.hostId===socket.id) room.hostId=room.players.keys().next().value;
        emitLobby(room);
      }
    });
  });
};
