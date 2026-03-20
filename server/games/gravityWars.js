/**
 * GAME 19: GRAVITY WARS
 * Turn-based artillery. Aim angle + power, fire projectile with gravity.
 * Planets/obstacles create gravity wells that bend trajectories.
 * First to eliminate all enemies wins. 2-4 players.
 * Namespace: /gravitywars
 */

const W=900,H=600;
const {circleCircle,startCountdown,makeBaseRoom}=require('./_shared');

const PLANETS=[
  {x:450,y:300,r:30,mass:200,color:'#BF5FFF'},
  {x:200,y:180,r:18,mass:80,color:'#FF9500'},
  {x:700,y:420,r:18,mass:80,color:'#00F5FF'},
];

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/gravitywars');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),projectile:null,effects:[],
      turnOrder:[],currentTurn:0,turnPhase:'aiming',aimTimer:10,shotInFlight:false};
  }
  function makePlayer(id,username,ci){
    const spawns=[{x:80,y:520},{x:820,y:520},{x:80,y:80},{x:820,y:80}];
    const s=spawns[ci%4];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,r:18,hp:3,alive:true,score:0,
      aimAngle:ci<2?-0.5:-2.5,aimPower:60};
  }

  function simStep(proj){
    // Gravity from planets
    for(const planet of PLANETS){
      const dx=planet.x-proj.x,dy=planet.y-proj.y;
      const d2=dx*dx+dy*dy,d=Math.sqrt(d2);
      const force=planet.mass/(d2+1);
      proj.vx+=dx/d*force*0.05;proj.vy+=dy/d*force*0.05;
    }
    proj.vy+=0.08; // world gravity
    proj.x+=proj.vx;proj.y+=proj.vy;
    return proj;
  }

  function fireTurn(room,angle,power){
    const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
    const p=room.players.get(pid);if(!p||!p.alive)return nextTurn(room);
    const spd=power/10*8;
    room.projectile={x:p.x,y:p.y,vx:Math.cos(angle)*spd,vy:Math.sin(angle)*spd,ownerId:p.id,ownerColor:p.color,trail:[]};
    room.turnPhase='flight';room.shotInFlight=true;
    ns.to(room.code).emit('shotFired',{by:p.username,color:p.color});
    const interval=setInterval(()=>{
      if(!room.projectile){clearInterval(interval);return;}
      const proj=room.projectile;
      proj.trail.push({x:proj.x,y:proj.y});
      if(proj.trail.length>30)proj.trail.shift();
      simStep(proj);

      // Hit detection
      let hit=false;
      if(proj.x<0||proj.x>W||proj.y>H){hit=true;} // Out of bounds
      for(const planet of PLANETS){
        if(circleCircle(proj.x,proj.y,6,planet.x,planet.y,planet.r)){hit=true;break;}
      }
      for(const[,q] of room.players){
        if(!q.alive)continue;
        if(circleCircle(proj.x,proj.y,6,q.x,q.y,q.r)){
          q.hp--;
          room.effects.push({x:q.x,y:q.y,t:Date.now(),color:'#FF2D55',type:'hit'});
          if(q.hp<=0){q.alive=false;const shooter=room.players.get(proj.ownerId);if(shooter){shooter.score+=100;shooter.kills=(shooter.kills||0)+1;}}
          ns.to(room.code).emit('playerHit',{id:q.id,username:q.username,hpLeft:q.hp});
          hit=true;break;
        }
      }

      if(hit){
        room.effects.push({x:proj.x,y:proj.y,t:Date.now(),color:proj.ownerColor,type:'explosion'});
        room.projectile=null;clearInterval(interval);
        room.shotInFlight=false;
        // Check win
        const alive=[...room.players.values()].filter(p=>p.alive);
        if(alive.length<=1){endGame(room,alive[0]||[...room.players.values()].sort((a,b)=>b.score-a.score)[0]);}
        else{setTimeout(()=>nextTurn(room),1500);}
        return;
      }
      ns.to(room.code).emit('projectileUpdate',{x:proj.x,y:proj.y,trail:proj.trail});
    },16);
  }

  function nextTurn(room){
    room.currentTurn++;
    // Skip dead players
    let tries=0;
    while(tries<room.turnOrder.length){
      const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
      if(room.players.get(pid)?.alive)break;
      room.currentTurn++;tries++;
    }
    room.turnPhase='aiming';room.aimTimer=12;
    const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
    ns.to(room.code).emit('turnStart',{playerId:pid,aimTime:12,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,hp:p.hp,alive:p.alive,score:p.score}))});
    // Auto-fire after aim time
    room.turnTimeout=setTimeout(()=>{
      if(room.turnPhase!=='aiming')return;
      const p=room.players.get(pid);if(p)fireTurn(room,p.aimAngle,p.aimPower);
    },12000);
  }

  function endGame(room,winner){
    clearTimeout(room.turnTimeout);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Gravity Wars',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.projectile=null;room.effects=[];room.shotInFlight=false;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    room.turnOrder=[...room.players.keys()];
    // Shuffle
    for(let i=room.turnOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[room.turnOrder[i],room.turnOrder[j]]=[room.turnOrder[j],room.turnOrder[i]];}
    room.currentTurn=0;
    ns.to(room.code).emit('gameStart',{planets:PLANETS,players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,hp:p.hp}))});
    setTimeout(()=>nextTurn(room),1000);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'gravitywars'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=4){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'gravitywars'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('aimUpdate',({angle,power})=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing'||room.turnPhase!=='aiming')return;
      const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
      if(socket.id!==pid)return;
      const p=room.players.get(socket.id);if(!p)return;
      p.aimAngle=Number(angle)||0;p.aimPower=Math.max(10,Math.min(100,Number(power)||60));
      ns.to(room.code).emit('aimState',{playerId:pid,angle:p.aimAngle,power:p.aimPower});
    });
    socket.on('fire',({angle,power})=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing'||room.turnPhase!=='aiming')return;
      const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
      if(socket.id!==pid)return;
      clearTimeout(room.turnTimeout);
      fireTurn(room,Number(angle)||0,Math.max(10,Math.min(100,Number(power)||60)));
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearTimeout(room.turnTimeout);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
