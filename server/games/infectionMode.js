/**
 * GAME 13: INFECTION MODE
 * 1 player starts as zombie (infected). Touch humans to infect them.
 * Last human standing wins. Humans get a 10s head-start.
 * Infected move faster but can't win. Humans can pick up cure packs to slow infection.
 * Namespace: /infection
 */

const W=800,H=600,TICK=50;
const HUMAN_SPD=3.2,ZOMBIE_SPD=3.8;
const {clamp,circleCircle,startCountdown,makeBaseRoom,randF}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/infection');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),cures:[],effects:[],phase:'human_headstart',phaseTimer:10};
  }
  function makePlayer(id,username,ci,infected=false){
    const spawns=[{x:80,y:80},{x:720,y:520},{x:720,y:80},{x:80,y:520},{x:400,y:60},{x:400,y:540}];
    const s=spawns[ci%6];
    return{id,username,color:infected?'#39FF14':COLORS[ci%8],originalColor:COLORS[ci%8],
      x:s.x,y:s.y,r:16,infected,alive:true,score:0,survivalTime:0,
      input:{up:false,down:false,left:false,right:false},slow:0};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    room.phaseTimer-=TICK/1000;
    if(room.phase==='human_headstart'&&room.phaseTimer<=0){
      room.phase='active';
      ns.to(room.code).emit('phaseChange',{phase:'active'});
    }

    const humans=[...room.players.values()].filter(p=>p.alive&&!p.infected);
    const zombies=[...room.players.values()].filter(p=>p.alive&&p.infected);

    for(const[,p] of room.players){
      if(!p.alive)continue;
      const isZombie=p.infected;
      const spd=isZombie?(p.slow>now?ZOMBIE_SPD*0.6:ZOMBIE_SPD):(p.slow>now?HUMAN_SPD*0.5:HUMAN_SPD);
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      p.x=clamp(p.x+dx*spd,p.r,W-p.r);p.y=clamp(p.y+dy*spd,p.r,H-p.r);
      if(!isZombie)p.survivalTime+=TICK/1000;
    }

    // Infection spread
    if(room.phase==='active'){
      for(const z of zombies){
        for(const h of humans){
          if(circleCircle(z.x,z.y,z.r,h.x,h.y,h.r)){
            h.infected=true;h.color='#39FF14';
            room.effects.push({x:h.x,y:h.y,t:now,color:'#39FF14'});
            const infector=room.players.get(z.id);if(infector)infector.score+=50;
            ns.to(room.code).emit('playerInfected',{id:h.id,username:h.username,infectorId:z.id});
          }
        }
      }
    }

    // Cures
    room.cures=room.cures.filter(c=>{
      for(const[,p] of room.players){
        if(!p.alive||p.infected)continue;
        if(circleCircle(p.x,p.y,p.r,c.x,c.y,12)){
          // Slow nearby zombies for 3s
          zombies.forEach(z=>{if(circleCircle(p.x,p.y,100,z.x,z.y,z.r))z.slow=now+3000;});
          p.score+=20;return false;
        }
      }
      return true;
    });
    if(Math.random()<0.008&&room.cures.length<4)room.cures.push({id:Math.random(),x:randF(40,W-40),y:randF(40,H-40)});

    const aliveHumans=[...room.players.values()].filter(p=>!p.infected&&p.alive);
    if(aliveHumans.length===0){
      const topZombie=zombies.sort((a,b)=>b.score-a.score)[0];
      endGame(room,topZombie,'zombies');return;
    }
    if(aliveHumans.length===1&&room.players.size>=3){
      endGame(room,aliveHumans[0],'survivor');return;
    }
    // 3-minute time limit
    if(!room.startTime)room.startTime=now;
    if(now-room.startTime>180000){endGame(room,aliveHumans.sort((a,b)=>b.survivalTime-a.survivalTime)[0],'survivor');return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,infected:p.infected,username:p.username,score:p.score,alive:p.alive})),
      cures:room.cures,effects:room.effects,phase:room.phase,phaseTimer:Math.max(0,Math.ceil(room.phaseTimer)),
      humanCount:aliveHumans.length,zombieCount:zombies.length
    });
    room.effects=room.effects.filter(e=>now-e.t<500);
  }

  function endGame(room,winner,reason){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p,survived:!p.infected}));
    if(winner)recordWin(winner.username,winner.color,'Infection Mode',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,reason,results});
  }

  function startGame(room){
    room.state='playing';room.cures=[];room.effects=[];room.phase='human_headstart';room.phaseTimer=10;room.startTime=null;
    // Pick random patient zero
    const ids=[...room.players.keys()];
    const zeroId=ids[Math.floor(Math.random()*ids.length)];
    let ci=0;
    for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++,id===zeroId));
    const zero=room.players.get(zeroId);
    ns.to(room.code).emit('gameStart',{zeroId,zeroName:zero.username,headstart:10,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,infected:p.infected}))});
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
      socket.emit('roomCreated',{code,isHost:true,game:'infection'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'infection'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<3)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
