/**
 * GAME 9: NEON TANKS
 * Top-down tank battle. Bullets bounce off walls up to 2 times.
 * Destroy enemy tanks to score. Last tank standing or highest score wins.
 * Namespace: /neontanks
 */

const W=800,H=600,TICK=1000/60;
const GAME_DURATION=90,MAX_PLAYERS=6,MIN_PLAYERS=2;
const TANK_SPEED=2.5,BULLET_SPEED=7,MAX_HP=100,BULLET_DMG=34;
const {circleRect,circleCircle,startCountdown,makeBaseRoom}=require('./_shared');

const MAPS=[
  [{x:150,y:100,w:20,h:200},{x:630,y:300,w:20,h:200},{x:300,y:200,w:200,h:20},{x:300,y:380,w:200,h:20},{x:100,y:400,w:150,h:20},{x:550,y:180,w:150,h:20}],
  [{x:200,y:150,w:400,h:20},{x:200,y:430,w:400,h:20},{x:100,y:200,w:20,h:200},{x:680,y:200,w:20,h:200},{x:360,y:240,w:80,h:120}],
  [{x:100,y:100,w:20,h:100},{x:680,y:100,w:20,h:100},{x:100,y:400,w:20,h:100},{x:680,y:400,w:20,h:100},{x:330,y:130,w:140,h:20},{x:330,y:450,w:140,h:20},{x:380,y:270,w:40,h:60}],
];

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/neontanks');
  const rooms=new Map();

  function makeRoom(code){
    const mi=Math.floor(Math.random()*MAPS.length);
    return{...makeBaseRoom(code),players:new Map(),bullets:[],effects:[],
      timeLeft:GAME_DURATION,mapIndex:mi};
  }

  function spawnTank(id,username,ci,mapIndex){
    const spawns=[{x:60,y:60,angle:0},{x:740,y:540,angle:Math.PI},{x:740,y:60,angle:Math.PI},{x:60,y:540,angle:0},{x:400,y:60,angle:Math.PI/2},{x:400,y:540,angle:-Math.PI/2}];
    const s=spawns[ci%6];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,angle:s.angle,
      hp:MAX_HP,alive:true,score:0,kills:0,deaths:0,r:18,
      input:{up:false,down:false,left:false,right:false,shoot:false},lastShot:0};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    const map=MAPS[room.mapIndex];

    for(const[,p] of room.players){
      if(!p.alive)continue;
      if(p.input.left) p.angle-=0.05;
      if(p.input.right)p.angle+=0.05;
      if(p.input.up||p.input.down){
        const dir=p.input.up?1:-1;
        let nx=p.x+Math.cos(p.angle)*TANK_SPEED*dir;
        let ny=p.y+Math.sin(p.angle)*TANK_SPEED*dir;
        nx=Math.max(p.r,Math.min(W-p.r,nx));ny=Math.max(p.r,Math.min(H-p.r,ny));
        for(const o of map){
          if(circleRect(nx,ny,p.r,o.x,o.y,o.w,o.h)){
            if(!circleRect(p.x,ny,p.r,o.x,o.y,o.w,o.h))nx=p.x;
            else if(!circleRect(nx,p.y,p.r,o.x,o.y,o.w,o.h))ny=p.y;
            else{nx=p.x;ny=p.y;}
          }
        }
        p.x=nx;p.y=ny;
      }
      if(p.input.shoot&&now-p.lastShot>600){
        p.lastShot=now;
        room.bullets.push({id:Math.random(),ownerId:p.id,ownerColor:p.color,
          x:p.x+Math.cos(p.angle)*(p.r+10),y:p.y+Math.sin(p.angle)*(p.r+10),
          vx:Math.cos(p.angle)*BULLET_SPEED,vy:Math.sin(p.angle)*BULLET_SPEED,
          bounces:2,life:180,r:5});
      }
    }

    const toRemove=new Set();
    for(let i=0;i<room.bullets.length;i++){
      const b=room.bullets[i];
      b.x+=b.vx;b.y+=b.vy;b.life--;
      if(b.life<=0){toRemove.add(i);continue;}
      // Wall bouncing
      if(b.x<b.r||b.x>W-b.r){b.vx*=-1;b.bounces--;if(b.bounces<0){toRemove.add(i);continue;}}
      if(b.y<b.r||b.y>H-b.r){b.vy*=-1;b.bounces--;if(b.bounces<0){toRemove.add(i);continue;}}
      // Obstacle bouncing
      for(const o of map){
        if(circleRect(b.x,b.y,b.r,o.x,o.y,o.w,o.h)){
          // Determine which axis to bounce on
          const fromLeft=b.x-b.vx<o.x, fromRight=b.x-b.vx>o.x+o.w;
          const fromTop=b.y-b.vy<o.y, fromBottom=b.y-b.vy>o.y+o.h;
          if(fromLeft||fromRight)b.vx*=-1; else b.vy*=-1;
          b.bounces--;if(b.bounces<0){toRemove.add(i);}
          break;
        }
      }
      if(toRemove.has(i))continue;
      // Hit players
      for(const[,p] of room.players){
        if(!p.alive||p.id===b.ownerId)continue;
        if(circleCircle(b.x,b.y,b.r,p.x,p.y,p.r)){
          p.hp-=BULLET_DMG;
          room.effects.push({x:p.x,y:p.y,t:now,color:b.ownerColor});
          if(p.hp<=0){
            p.hp=0;p.alive=false;p.deaths++;
            const killer=room.players.get(b.ownerId);
            if(killer){killer.kills++;killer.score+=100;}
            ns.to(room.code).emit('playerDied',{deadId:p.id,deadName:p.username,killerId:b.ownerId});
          }
          toRemove.add(i);break;
        }
      }
    }
    room.bullets=room.bullets.filter((_,i)=>!toRemove.has(i));
    room.effects=room.effects.filter(e=>now-e.t<400);

    const aliveCount=[...room.players.values()].filter(p=>p.alive).length;
    if(aliveCount<=1&&room.players.size>=MIN_PLAYERS){
      const winner=[...room.players.values()].find(p=>p.alive)||[...room.players.values()].sort((a,b)=>b.score-a.score)[0];
      endGame(room,winner);return;
    }
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){const w=[...room.players.values()].sort((a,b)=>b.score-a.score)[0];endGame(room,w);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,angle:p.angle,hp:p.hp,alive:p.alive,score:p.score,kills:p.kills,color:p.color,username:p.username})),
      bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,ownerColor:b.ownerColor,bounces:b.bounces})),
      effects:room.effects,timeLeft:Math.ceil(room.timeLeft)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Neon Tanks',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=GAME_DURATION;room.bullets=[];room.effects=[];
    let ci=0;for(const[id,p] of room.players)room.players.set(id,spawnTank(id,p.username,ci++,room.mapIndex));
    ns.to(room.code).emit('gameStart',{obstacles:MAPS[room.mapIndex],duration:GAME_DURATION,mapIndex:room.mapIndex,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,angle:p.angle}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;
      let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,spawnTank(socket.id,username,0,room.mapIndex));
      socket.emit('roomCreated',{code,isHost:true,game:'neontanks'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=MAX_PLAYERS){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,spawnTank(socket.id,username,room.players.size,room.mapIndex));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'neontanks'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<MIN_PLAYERS)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,shoot:!!inp.shoot};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
