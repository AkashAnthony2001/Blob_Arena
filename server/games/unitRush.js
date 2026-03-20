/**
 * GAME 7: UNIT RUSH
 * Simplified Clash-style: send waves, first to break the enemy gate wins.
 * Fast 60-second rounds. No lanes — free-path units.
 * Namespace: /unitrush
 */

const W=800,H=500;
const TICK=33,GAME_DURATION=90;
const {dist,startCountdown,makeBaseRoom,randInt}=require('./_shared');

const UNITS={
  runner:{cost:1,hp:30,dmg:8,spd:2.2,r:10,color:'#39FF14',atkRate:50,range:18},
  heavy: {cost:3,hp:150,dmg:20,spd:0.9,r:18,color:'#FF9500',atkRate:80,range:22},
  sniper:{cost:2,hp:25,dmg:35,spd:1.5,r:10,color:'#00F5FF',atkRate:90,range:120},
  swarm: {cost:2,hp:15,dmg:10,spd:2.8,r:8, color:'#FF2D55',atkRate:40,range:14,count:3},
};
const GATE_HP=600;

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/unitrush');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),units:[],projectiles:[],effects:[],
      timeLeft:GAME_DURATION,energy:{left:5,right:5},
      gates:{left:{hp:GATE_HP,maxHp:GATE_HP,x:50,y:H/2},right:{hp:GATE_HP,maxHp:GATE_HP,x:W-50,y:H/2}}};
  }

  function makePlayer(id,username,ci,side){
    return{id,username,color:COLORS[ci%8],side,energy:0,score:0};
  }

  function spawnUnit(room,side,type,ownerColor,ownerId){
    const def=UNITS[type];
    const sx=side==='left'?80:W-80, dir=side==='left'?1:-1;
    const count=def.count||1;
    for(let i=0;i<count;i++){
      room.units.push({id:Date.now()+Math.random()+i,ownerId,ownerColor,side,type,...def,
        x:sx+randInt(-10,10),y:H/2+randInt(-100,100),dir,currentHp:def.hp,atkTimer:0,alive:true});
    }
  }

  function tick(room){
    if(room.state!=='playing') return;
    const now=Date.now();
    // Energy regen
    room.energy.left=Math.min(10,room.energy.left+0.05);
    room.energy.right=Math.min(10,room.energy.right+0.05);
    for(const[,p] of room.players) p.energy=room.energy[p.side];

    const alive=room.units.filter(u=>u.alive);
    for(const u of alive){
      const enemies=alive.filter(e=>e.side!==u.side);
      const enemyGate=room.gates[u.side==='left'?'right':'left'];
      let target=null,td=Infinity;
      for(const e of enemies){const d=dist(u.x,u.y,e.x,e.y);if(d<td){td=d;target=e;}}

      if(target&&td<u.range){
        if(!u.atkTimer) u.atkTimer=0;
        u.atkTimer++;
        if(u.atkTimer>=u.atkRate){
          u.atkTimer=0;
          target.currentHp-=u.dmg;
          room.effects.push({x:target.x,y:target.y,t:now,color:u.color});
          if(target.currentHp<=0){target.alive=false;const p=room.players.get(u.ownerId);if(p)p.score+=10;}
          if(u.range>30) room.projectiles.push({id:Math.random(),sx:u.x,sy:u.y,tx:target.x,ty:target.y,color:u.color,life:6});
        }
      } else {
        // Move toward gate
        const a=Math.atan2(enemyGate.y-u.y,enemyGate.x-u.x);
        u.x+=Math.cos(a)*u.spd; u.y+=Math.sin(a)*u.spd;
        u.atkTimer=0;
        // Reached gate?
        if(dist(u.x,u.y,enemyGate.x,enemyGate.y)<30){
          enemyGate.hp-=u.dmg*3; u.alive=false;
          room.effects.push({x:enemyGate.x,y:enemyGate.y,t:now,type:'big',color:u.color});
          const p=room.players.get(u.ownerId);if(p)p.score+=25;
        }
      }
    }
    room.units=room.units.filter(u=>u.alive);
    room.projectiles=room.projectiles.filter(p=>{p.life--;return p.life>0;});
    room.effects=room.effects.filter(e=>now-e.t<500);

    if(room.gates.left.hp<=0||room.gates.right.hp<=0){
      const winSide=room.gates.left.hp>0?'left':'right'; endGame(room,winSide); return;
    }
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){const ws=room.gates.left.hp>room.gates.right.hp?'left':'right';endGame(room,ws);return;}

    ns.to(room.code).emit('gameState',{
      units:alive.filter(u=>u.alive).map(u=>({id:u.id,x:u.x,y:u.y,type:u.type,side:u.side,hpRatio:u.currentHp/u.hp,color:u.color})),
      gates:room.gates,projectiles:room.projectiles,effects:room.effects,
      timeLeft:Math.ceil(room.timeLeft),energy:room.energy,
      players:[...room.players.values()].map(p=>({id:p.id,score:p.score,side:p.side,username:p.username,color:p.color}))
    });
  }

  function endGame(room,winSide){
    clearInterval(room.tickInterval); room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p,won:p.side===winSide}));
    const winner=[...room.players.values()].find(p=>p.side===winSide);
    if(winner) recordWin(winner.username,winner.color,'Unit Rush',winner.score);
    ns.to(room.code).emit('gameOver',{winSide,results});
  }

  function startGame(room){
    room.state='playing'; room.timeLeft=GAME_DURATION; room.units=[]; room.projectiles=[]; room.effects=[];
    room.energy={left:5,right:5};
    room.gates={left:{hp:GATE_HP,maxHp:GATE_HP,x:50,y:H/2},right:{hp:GATE_HP,maxHp:GATE_HP,x:W-50,y:H/2}};
    let ci=0;
    [...room.players.keys()].forEach((id,i)=>{
      const p=room.players.get(id);
      const side=i<Math.ceil(room.players.size/2)?'left':'right';
      room.players.set(id,makePlayer(id,p.username,ci++,side));
    });
    ns.to(room.code).emit('gameStart',{units:UNITS,duration:GAME_DURATION,gates:room.gates,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,side:p.side}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0,'left'));
      socket.emit('roomCreated',{code,isHost:true,game:'unitrush'}); emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=4){socket.emit('error','Full!');return;}
      socket.join(room.code); socket.roomCode=room.code;
      const side=room.players.size<2?'left':'right';
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size,side));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'unitrush'}); emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2) return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('sendUnit',({type})=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id); if(!p) return;
      const def=UNITS[type]; if(!def) return;
      if(room.energy[p.side]<def.cost){return;}
      room.energy[p.side]-=def.cost;
      spawnUnit(room,p.side,type,p.color,p.id);
      p.score+=2;
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value; emitLobby(room);}
    });
  });
};
