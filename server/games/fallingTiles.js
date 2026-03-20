/**
 * GAME 16: FALLING TILES
 * Grid of tiles. Standing on a tile makes it crack then fall (2s).
 * Survive longest. Tiles fall faster as time goes on.
 * Namespace: /fallingtiles
 */

const W=800,H=600,TILE=80,COLS=10,ROWS=7;
const TICK=100;
const {circleRect,clamp,startCountdown,makeBaseRoom}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/fallingtiles');
  const rooms=new Map();

  function makeRoom(code){
    const tiles=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) tiles.push({id:r*COLS+c,x:c*TILE,y:r*TILE+100,state:'solid',crackTimer:0,col:c,row:r});
    return{...makeBaseRoom(code),players:new Map(),tiles,effects:[],timeLeft:180,speed:1};
  }
  function makePlayer(id,username,ci){
    const spawns=[{x:40,y:140},{x:760,y:540},{x:760,y:140},{x:40,y:540},{x:400,y:140},{x:400,y:540}];
    const s=spawns[ci%6];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,r:16,alive:true,score:0,survivalTime:0,input:{up:false,down:false,left:false,right:false}};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    room.timeLeft-=TICK/1000;
    room.speed=1+Math.max(0,180-room.timeLeft)*0.015; // Speeds up over time

    for(const[,p] of room.players){
      if(!p.alive)continue;
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      p.x=clamp(p.x+dx*3.5,p.r,W-p.r);p.y=clamp(p.y+dy*3.5,p.r,H-p.r);
      p.survivalTime+=TICK/1000;
      p.score=Math.round(p.survivalTime*10);

      // Check if fell off all tiles
      let standing=false;
      for(const t of room.tiles){
        if(t.state==='solid'&&circleRect(p.x,p.y+p.r,4,t.x,t.y,TILE,TILE)){standing=true;break;}
      }
      if(!standing&&p.y>H-40){
        p.alive=false;room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'fall'});
        ns.to(room.code).emit('playerFell',{id:p.id,username:p.username,survivalTime:Math.round(p.survivalTime)});
      }
    }

    // Crack tiles underfoot
    for(const t of room.tiles){
      if(t.state!=='solid')continue;
      const hasPlayer=[...room.players.values()].some(p=>p.alive&&circleRect(p.x,p.y,p.r,t.x,t.y,TILE,TILE));
      if(hasPlayer){
        t.crackTimer+=TICK*room.speed;
        if(t.crackTimer>1500){t.state='cracked';}
      } else {
        t.crackTimer=Math.max(0,t.crackTimer-TICK*0.5);
      }
    }
    for(const t of room.tiles){
      if(t.state==='cracked'){
        t.crackTimer+=TICK*room.speed;
        if(t.crackTimer>2800){t.state='gone';room.effects.push({x:t.x+TILE/2,y:t.y+TILE/2,t:now,color:'#444',type:'fall'});}
      }
    }

    room.effects=room.effects.filter(e=>now-e.t<600);
    const alive=[...room.players.values()].filter(p=>p.alive);
    if(alive.length<=1&&room.players.size>=2){endGame(room,alive[0]||[...room.players.values()].sort((a,b)=>b.score-a.score)[0]);return;}
    if(room.timeLeft<=0){endGame(room,alive.sort((a,b)=>b.score-a.score)[0]||null);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,alive:p.alive,score:p.score,username:p.username})),
      tiles:room.tiles.map(t=>({id:t.id,state:t.state,crack:Math.min(1,t.crackTimer/2800)})),
      effects:room.effects,timeLeft:Math.ceil(room.timeLeft),speed:Math.round(room.speed*10)/10
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Falling Tiles',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';
    const tiles=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) tiles.push({id:r*COLS+c,x:c*TILE,y:r*TILE+100,state:'solid',crackTimer:0,col:c,row:r});
    room.tiles=tiles;room.effects=[];room.timeLeft=180;room.speed=1;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{cols:COLS,rows:ROWS,tileSize:TILE,tiles:room.tiles,
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
      socket.emit('roomCreated',{code,isHost:true,game:'fallingtiles'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'fallingtiles'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
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
