/**
 * GAME 4: PONG WARS
 * 2–4 players, team-based Pong! Left team vs Right team.
 * Multiple balls, power-ups, first to 10 points wins.
 * Namespace: /pong
 */

const W=800,H=600, PADDLE_H=90, PADDLE_W=14, PADDLE_SPEED=6;
const BALL_SPEED_INIT=5, BALL_MAX_SPEED=12, TICK=16;
const WIN_SCORE=7, MIN_PLAYERS=2, MAX_PLAYERS=4;

module.exports = function(io, COLORS, generateCode, recordWin) {
  const ns = io.of('/pong');
  const rooms = new Map();

  function makeRoom(code){
    return { code, players:new Map(), balls:[], powerUps:[],
      score:{left:0,right:0}, state:'lobby', tickInterval:null,
      hostId:null, powerUpTimer:0 };
  }

  function makeBall(speedMult=1){
    const angle=(Math.random()*0.8+0.1)*(Math.random()<0.5?1:-1);
    const dir=Math.random()<0.5?1:-1;
    const spd=BALL_SPEED_INIT*speedMult;
    return { id:Date.now()+Math.random(), x:W/2, y:H/2,
      vx:Math.cos(angle)*spd*dir, vy:Math.sin(angle)*spd,
      r:8, trail:[], powerUp:null };
  }

  function spawnPlayer(id, username, ci, totalPlayers){
    // Assign teams: even=left, odd=right
    const team=ci%2===0?'left':'right';
    const teamIndex=Math.floor(ci/2);
    const slotsPerSide=Math.ceil(totalPlayers/2);
    const paddleY=H/(slotsPerSide+1)*(teamIndex+1);
    return { id, username, color:COLORS[ci%COLORS.length], team,
      x:team==='left'?20:W-20-PADDLE_W, y:paddleY-PADDLE_H/2,
      w:PADDLE_W, h:PADDLE_H, score:0,
      input:{up:false,down:false}, vy:0,
      powerUp:null, powerUpTimer:0 };
  }

  function makePowerUp(){
    const types=[
      {type:'bigPaddle',color:'#39FF14',icon:'⬆',label:'BIG PADDLE',duration:8000},
      {type:'fastBall', color:'#FF2D55',icon:'⚡',label:'FAST BALL', duration:0},
      {type:'multiBall',color:'#FFD700',icon:'✦',label:'MULTI BALL', duration:0},
      {type:'slowBall', color:'#00F5FF',icon:'❄',label:'SLOW BALL', duration:5000},
    ];
    const t=types[Math.floor(Math.random()*types.length)];
    return { id:Date.now(), x:200+Math.random()*400, y:100+Math.random()*400, ...t };
  }

  function tick(room){
    if(room.state!=='playing') return;
    const now=Date.now();

    // Move paddles
    const left=[...room.players.values()].filter(p=>p.team==='left');
    const right=[...room.players.values()].filter(p=>p.team==='right');

    for(const p of room.players.values()){
      if(p.input.up)  p.y-=PADDLE_SPEED;
      if(p.input.down)p.y+=PADDLE_SPEED;
      const bigH=p.powerUp==='bigPaddle'&&p.powerUpTimer>now?PADDLE_H*1.7:PADDLE_H;
      p.h=bigH;
      p.y=Math.max(0,Math.min(H-bigH,p.y));
      if(p.powerUpTimer>0&&p.powerUpTimer<now) p.powerUp=null;
    }

    // Power-up spawn
    room.powerUpTimer--;
    if(room.powerUpTimer<=0){
      room.powerUps.push(makePowerUp());
      room.powerUpTimer=300+Math.floor(Math.random()*300);
    }

    // Move balls
    const newBalls=[];
    for(const b of room.balls){
      b.trail.push({x:b.x,y:b.y});
      if(b.trail.length>8) b.trail.shift();

      b.x+=b.vx; b.y+=b.vy;

      // Top/bottom walls
      if(b.y-b.r<0){b.y=b.r;b.vy=Math.abs(b.vy);}
      if(b.y+b.r>H){b.y=H-b.r;b.vy=-Math.abs(b.vy);}

      // Score (left/right walls)
      if(b.x-b.r<0){
        room.score.right++;
        ns.to(room.code).emit('scored',{team:'right',score:room.score});
        if(room.score.right>=WIN_SCORE){endGame(room,'right');return;}
        // Reset ball
        Object.assign(b,makeBall()); continue;
      }
      if(b.x+b.r>W){
        room.score.left++;
        ns.to(room.code).emit('scored',{team:'left',score:room.score});
        if(room.score.left>=WIN_SCORE){endGame(room,'left');return;}
        Object.assign(b,makeBall()); continue;
      }

      // Paddle collisions
      for(const p of room.players.values()){
        const px=p.x, py=p.y, pw=p.w, ph=p.h;
        if(b.x-b.r<px+pw && b.x+b.r>px && b.y+b.r>py && b.y-b.r<py+ph){
          // Bounce
          const hitPos=(b.y-(py+ph/2))/(ph/2); // -1 to 1
          const bounceAngle=hitPos*(Math.PI/3);
          const spd=Math.min(BALL_MAX_SPEED, Math.sqrt(b.vx**2+b.vy**2)*1.05);
          b.vx=p.team==='left'?Math.cos(bounceAngle)*spd:-Math.cos(bounceAngle)*spd;
          b.vy=Math.sin(bounceAngle)*spd;
          b.x=p.team==='left'?px+pw+b.r+1:px-b.r-1;
          p.score+=1;
        }
      }

      // Power-up collection
      room.powerUps=room.powerUps.filter(pu=>{
        if((b.x-pu.x)**2+(b.y-pu.y)**2<(b.r+16)**2){
          // Apply to team that just hit the ball (by vx direction)
          const teamToApply=b.vx>0?'left':'right';
          applyPowerUp(room,pu,teamToApply,now);
          ns.to(room.code).emit('powerUpCollected',{type:pu.type,label:pu.label,team:teamToApply});
          return false;
        }
        return true;
      });

      newBalls.push(b);
    }
    room.balls=newBalls;

    // Keep at least 1 ball
    if(room.balls.length===0) room.balls.push(makeBall());

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({
        id:p.id,username:p.username,color:p.color,
        x:p.x,y:p.y,w:p.w,h:p.h,team:p.team,score:p.score,
        hasPowerUp:!!(p.powerUp&&p.powerUpTimer>now)
      })),
      balls:room.balls.map(b=>({id:b.id,x:b.x,y:b.y,r:b.r,trail:b.trail.slice(-4)})),
      powerUps:room.powerUps,
      score:room.score
    });
  }

  function applyPowerUp(room,pu,team,now){
    const teamPlayers=[...room.players.values()].filter(p=>p.team===team);
    if(pu.type==='bigPaddle'){
      teamPlayers.forEach(p=>{ p.powerUp='bigPaddle'; p.powerUpTimer=now+pu.duration; });
    } else if(pu.type==='fastBall'){
      room.balls.forEach(b=>{ const spd=Math.sqrt(b.vx**2+b.vy**2);
        const dir=b.vx>0?1:-1; b.vx=dir*Math.min(BALL_MAX_SPEED,spd*1.5); });
    } else if(pu.type==='multiBall'){
      if(room.balls.length<4) room.balls.push(makeBall(1+Math.random()*0.5));
    } else if(pu.type==='slowBall'){
      room.balls.forEach(b=>{ b.vx*=0.6; b.vy*=0.6; });
    }
  }

  function endGame(room, winTeam){
    clearInterval(room.tickInterval); room.state='ended';
    const winners=[...room.players.values()].filter(p=>p.team===winTeam);
    winners.forEach(p=>recordWin(p.username,p.color,'Pong Wars',p.score*50));
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score)
      .map((p,i)=>({rank:i+1,id:p.id,username:p.username,color:p.color,team:p.team,
        score:p.score,won:p.team===winTeam}));
    ns.to(room.code).emit('gameOver',{winTeam,results,finalScore:room.score});
  }

  function startGame(room){
    room.state='playing'; room.score={left:0,right:0};
    room.balls=[makeBall()]; room.powerUps=[]; room.powerUpTimer=200;
    let ci=0;
    const total=room.players.size;
    for(const[id,p] of room.players) room.players.set(id,spawnPlayer(id,p.username,ci++,total));
    ns.to(room.code).emit('gameStart',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,w:p.w,h:p.h,team:p.team})),
      score:room.score, winScore:WIN_SCORE
    });
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function countdown(room){
    room.state='countdown'; let n=3;
    ns.to(room.code).emit('countdown',n);
    const cd=setInterval(()=>{ n--;
      if(n<=0){clearInterval(cd);startGame(room);}
      else ns.to(room.code).emit('countdown',n);
    },1000);
  }

  function emitLobby(room){
    ns.to(room.code).emit('lobbyUpdate',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),
      hostId:room.hostId, code:room.code, game:'pong'
    });
  }

  ns.on('connection',(socket)=>{
    socket.on('createRoom',({username})=>{
      if(!username||username.length>16) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code;
      room.players.set(socket.id,spawnPlayer(socket.id,username,0,1));
      socket.emit('roomCreated',{code,isHost:true,game:'pong'});
      emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room){socket.emit('error','Room not found!');return;}
      if(room.state!=='lobby'){socket.emit('error','Game in progress!');return;}
      if(room.players.size>=MAX_PLAYERS){socket.emit('error','Room full!');return;}
      socket.join(room.code); socket.roomCode=room.code;
      const ci=room.players.size, total=ci+1;
      room.players.set(socket.id,spawnPlayer(socket.id,username,ci,total));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'pong'});
      emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id) return;
      if(room.players.size<MIN_PLAYERS){socket.emit('error','Need 2+ players');return;}
      countdown(room);
    });
    socket.on('input',({up,down})=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id); if(!p) return;
      p.input={up:!!up,down:!!down};
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
      let ci=0; const total=room.players.size;
      for(const[id,p] of room.players) room.players.set(id,spawnPlayer(id,p.username,ci++,total));
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
