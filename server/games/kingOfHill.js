/**
 * GAME 12: KING OF THE HILL
 * Hold the center zone longer than anyone else. First to 30s of zone time wins.
 * Up to 6 players. Staying in zone with others splits the points.
 * Namespace: /koth
 */

const W=800,H=600,TICK=50,TARGET_ZONE_TIME=30;
const ZONE={x:320,y:220,w:160,h:160};
const {clamp,circleRect,startCountdown,makeBaseRoom,spawnPowerUpAt}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/koth');
  const rooms=new Map();

  function makeRoom(code){return{...makeBaseRoom(code),players:new Map(),powerUps:[],timeLeft:120};}
  function makePlayer(id,username,ci){
    const spawns=[{x:80,y:80},{x:720,y:520},{x:720,y:80},{x:80,y:520},{x:400,y:60},{x:400,y:540}];
    const s=spawns[ci%6];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,r:16,zoneTime:0,alive:true,score:0,
      input:{up:false,down:false,left:false,right:false},powerUps:{}};
  }

  function inZone(p){return circleRect(p.x,p.y,p.r,ZONE.x,ZONE.y,ZONE.w,ZONE.h);}

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    const spd=3.5;
    for(const[,p] of room.players){
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      const s=p.powerUps.speed>now?spd*1.8:spd;
      p.x=clamp(p.x+dx*s,p.r,W-p.r);p.y=clamp(p.y+dy*s,p.r,H-p.r);
    }
    const inZonePlayers=[...room.players.values()].filter(p=>inZone(p));
    const share=inZonePlayers.length>0?1/inZonePlayers.length:0;
    for(const p of inZonePlayers){
      p.zoneTime+=TICK/1000*share;
      if(p.zoneTime>=TARGET_ZONE_TIME){endGame(room,p);return;}
    }
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){const w=[...room.players.values()].sort((a,b)=>b.zoneTime-a.zoneTime)[0];endGame(room,w);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,zoneTime:Math.round(p.zoneTime*10)/10,username:p.username,inZone:inZone(p),powerUps:Object.fromEntries(Object.entries(p.powerUps).filter(([,v])=>v>now))})),
      zone:ZONE,timeLeft:Math.ceil(room.timeLeft),target:TARGET_ZONE_TIME
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.zoneTime-a.zoneTime).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'King of the Hill',Math.round(winner.zoneTime*100));
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=120;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{zone:ZONE,target:TARGET_ZONE_TIME,
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
      socket.emit('roomCreated',{code,isHost:true,game:'koth'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'koth'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
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
