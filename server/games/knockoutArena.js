/**
 * GAME 14: KNOCKOUT ARENA
 * Circular platform. Dash into others to knock them off.
 * Last player standing on the platform wins.
 * Dash has cooldown. Platform shrinks every 20s.
 * Namespace: /knockout
 */

const TICK=1000/60,GAME_DURATION=120;
const {circleCircle,clamp,startCountdown,makeBaseRoom,dist}=require('./_shared');

const ARENA={cx:400,cy:300,r:240};

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/knockout');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),effects:[],timeLeft:GAME_DURATION,arenaR:ARENA.r,shrinkTimer:20};
  }
  function makePlayer(id,username,ci){
    const angle=(ci/8)*Math.PI*2;
    const r=180;
    return{id,username,color:COLORS[ci%8],x:ARENA.cx+Math.cos(angle)*r,y:ARENA.cy+Math.sin(angle)*r,
      vx:0,vy:0,alive:true,score:0,r:18,dashCd:0,dashing:false,dashTimer:0,
      input:{up:false,down:false,left:false,right:false,dash:false}};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    room.shrinkTimer-=TICK/1000;
    if(room.shrinkTimer<=0&&room.arenaR>100){
      room.arenaR=Math.max(100,room.arenaR-25);
      room.shrinkTimer=20;
      ns.to(room.code).emit('arenaShrank',{r:room.arenaR});
    }

    const alivePlayers=[...room.players.values()].filter(p=>p.alive);
    for(const p of alivePlayers){
      p.dashCd=Math.max(0,p.dashCd-TICK/1000);
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}

      if(p.input.dash&&p.dashCd<=0&&(dx||dy)){
        p.dashing=true;p.dashTimer=12;p.dashCd=2.5;
        p.vx=dx*12;p.vy=dy*12;
        room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'dash'});
      }
      if(p.dashing){
        p.dashTimer--;if(p.dashTimer<=0)p.dashing=false;
        p.vx*=0.85;p.vy*=0.85;
      } else {
        p.vx=dx*3;p.vy=dy*3;
      }
      p.x+=p.vx;p.y+=p.vy;

      // Knockback collisions
      for(const q of alivePlayers){
        if(q===p)continue;
        if(circleCircle(p.x,p.y,p.r,q.x,q.y,q.r)){
          const a=Math.atan2(q.y-p.y,q.x-p.x);
          const force=p.dashing?12:3;
          q.vx+=Math.cos(a)*force;q.vy+=Math.sin(a)*force;
          if(p.dashing)p.score+=5;
          room.effects.push({x:q.x,y:q.y,t:now,color:p.color,type:'hit'});
        }
      }

      // Check if off platform
      const d=dist(p.x,p.y,ARENA.cx,ARENA.cy);
      if(d>room.arenaR){
        p.alive=false;
        const remaining=alivePlayers.filter(a=>a.alive);
        for(const r of remaining)r.score+=10;
        room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'fall'});
        ns.to(room.code).emit('playerFell',{id:p.id,username:p.username});
      }
    }
    room.effects=room.effects.filter(e=>now-e.t<500);

    const aliveNow=[...room.players.values()].filter(p=>p.alive);
    if(aliveNow.length<=1&&room.players.size>=2){
      endGame(room,aliveNow[0]||[...room.players.values()].sort((a,b)=>b.score-a.score)[0]);return;
    }
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){endGame(room,aliveNow.sort((a,b)=>b.score-a.score)[0]||null);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,alive:p.alive,score:p.score,username:p.username,dashing:p.dashing,dashCd:p.dashCd})),
      effects:room.effects,arenaR:room.arenaR,timeLeft:Math.ceil(room.timeLeft),shrinkIn:Math.ceil(room.shrinkTimer)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Knockout Arena',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=GAME_DURATION;room.effects=[];room.arenaR=ARENA.r;room.shrinkTimer=20;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{arena:ARENA,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;
      let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'knockout'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'knockout'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,dash:!!inp.dash};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
