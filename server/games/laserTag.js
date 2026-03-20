/**
 * GAME 17: LASER TAG
 * Players shoot instant-hit laser beams. Beams are visible for ~0.2s.
 * One-hit kill but with 2s respawn. 60-second match, most kills wins.
 * Namespace: /lasertag
 */

const W=800,H=600,TICK=1000/60,GAME_DURATION=60;
const PLAYER_SPD=4,RESPAWN_TIME=2000;
const {circleRect,startCountdown,makeBaseRoom,randF}=require('./_shared');

const WALLS=[
  {x:150,y:50,w:20,h:200},{x:630,y:350,w:20,h:200},
  {x:280,y:200,w:240,h:20},{x:280,y:380,w:240,h:20},
  {x:80,y:300,w:140,h:20},{x:580,y:280,w:140,h:20},
  {x:350,y:100,w:20,h:120},{x:430,y:380,w:20,h:120},
];

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/lasertag');
  const rooms=new Map();

  function makeRoom(code){return{...makeBaseRoom(code),players:new Map(),lasers:[],effects:[],timeLeft:GAME_DURATION};}
  function makePlayer(id,username,ci){
    const spawns=[{x:60,y:60},{x:740,y:540},{x:740,y:60},{x:60,y:540},{x:400,y:60},{x:400,y:540}];
    const s=spawns[ci%6];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,r:16,alive:true,kills:0,deaths:0,score:0,
      input:{up:false,down:false,left:false,right:false,shoot:false,mouseX:400,mouseY:300},lastShot:0,respawnAt:0};
  }

  function castRay(x,y,angle,ownerId){
    // Raycast with wall collision
    const cos=Math.cos(angle),sin=Math.sin(angle);
    let t=0,maxT=800,hit=null;
    while(t<maxT){
      t+=4;
      const rx=x+cos*t,ry=y+sin*t;
      if(rx<0||rx>W||ry<0||ry>H){maxT=t;break;}
      for(const w of WALLS){
        if(rx>=w.x&&rx<=w.x+w.w&&ry>=w.y&&ry<=w.y+w.h){maxT=t;break;}
      }
    }
    return{x2:x+cos*maxT,y2:y+sin*maxT,len:maxT};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    for(const[,p] of room.players){
      if(!p.alive){
        if(p.respawnAt&&now>p.respawnAt){
          const ci=[...room.players.values()].indexOf(p);
          const spawns=[{x:60,y:60},{x:740,y:540},{x:740,y:60},{x:60,y:540},{x:400,y:60},{x:400,y:540}];
          const s=spawns[ci%6];
          p.x=s.x;p.y=s.y;p.alive=true;
          ns.to(room.code).emit('playerRespawned',{id:p.id});
        }
        continue;
      }
      const spd=PLAYER_SPD;
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      let nx=Math.max(p.r,Math.min(W-p.r,p.x+dx*spd));
      let ny=Math.max(p.r,Math.min(H-p.r,p.y+dy*spd));
      for(const w of WALLS){
        if(circleRect(nx,ny,p.r,w.x,w.y,w.w,w.h)){
          if(!circleRect(p.x,ny,p.r,w.x,w.y,w.w,w.h))nx=p.x;
          else if(!circleRect(nx,p.y,p.r,w.x,w.y,w.w,w.h))ny=p.y;
          else{nx=p.x;ny=p.y;}
        }
      }
      p.x=nx;p.y=ny;

      if(p.input.shoot&&now-p.lastShot>400){
        p.lastShot=now;
        const angle=Math.atan2(p.input.mouseY-p.y,p.input.mouseX-p.x);
        const ray=castRay(p.x,p.y,angle,p.id);
        room.lasers.push({id:Math.random(),x1:p.x,y1:p.y,x2:ray.x2,y2:ray.y2,color:p.color,ownerId:p.id,born:now});
        // Check hits along ray
        const cos=Math.cos(angle),sin=Math.sin(angle);
        for(const[,q] of room.players){
          if(!q.alive||q.id===p.id)continue;
          // Point-line distance
          const dx2=q.x-p.x,dy2=q.y-p.y;
          const proj=dx2*cos+dy2*sin;
          if(proj<0||proj>ray.len)continue;
          const perpX=dx2-cos*proj,perpY=dy2-sin*proj;
          if(Math.sqrt(perpX*perpX+perpY*perpY)<q.r+3){
            q.alive=false;q.deaths++;q.respawnAt=now+RESPAWN_TIME;
            p.kills++;p.score+=100;
            room.effects.push({x:q.x,y:q.y,t:now,color:p.color,type:'laser_kill'});
            ns.to(room.code).emit('playerKilled',{deadId:q.id,deadName:q.username,killerId:p.id,killerName:p.username});
          }
        }
      }
    }
    room.lasers=room.lasers.filter(l=>now-l.born<180);
    room.effects=room.effects.filter(e=>now-e.t<500);
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){const w=[...room.players.values()].sort((a,b)=>b.score-a.score)[0];endGame(room,w);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,alive:p.alive,kills:p.kills,deaths:p.deaths,score:p.score,username:p.username})),
      lasers:room.lasers.map(l=>({id:l.id,x1:l.x1,y1:l.y1,x2:l.x2,y2:l.y2,color:l.color,age:(now-l.born)/180})),
      effects:room.effects,timeLeft:Math.ceil(room.timeLeft)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Laser Tag',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=GAME_DURATION;room.lasers=[];room.effects=[];
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{walls:WALLS,duration:GAME_DURATION,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'lasertag'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'lasertag'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,shoot:!!inp.shoot,
        mouseX:Number(inp.mouseX)||400,mouseY:Number(inp.mouseY)||300};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
