/**
 * GAME 11: TERRITORY WAR
 * Players paint the floor their color by walking over tiles.
 * Most territory captured at end of 60s wins.
 * Up to 6 players. Power-ups: paint bomb (mass paint), speed, erase enemy.
 * Namespace: /territory
 */

const W=800,H=600,TILE=40,COLS=20,ROWS=15;
const TICK=50,GAME_DURATION=60,PLAYER_SPEED=3;
const {clamp,startCountdown,makeBaseRoom,randInt,spawnPowerUpAt}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/territory');
  const rooms=new Map();

  function makeRoom(code){
    const grid=new Array(COLS*ROWS).fill(-1); // -1 = unclaimed, 0-7 = player index
    return{...makeBaseRoom(code),players:new Map(),grid,powerUps:[],effects:[],timeLeft:GAME_DURATION};
  }

  function makePlayer(id,username,ci){
    const spawns=[{x:60,y:60},{x:740,y:540},{x:740,y:60},{x:60,y:540},{x:400,y:60},{x:400,y:540}];
    const s=spawns[ci%6];
    return{id,username,color:COLORS[ci%8],colorIndex:ci%8,x:s.x,y:s.y,score:0,alive:true,
      input:{up:false,down:false,left:false,right:false},
      powerUps:{},spd:PLAYER_SPEED,r:14};
  }

  function tileAt(x,y){return Math.floor(y/TILE)*COLS+Math.floor(x/TILE);}
  function paintTile(room,tx,ty,ci){
    const idx=ty*COLS+tx;
    if(idx>=0&&idx<room.grid.length){room.grid[idx]=ci;return true;}
    return false;
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();

    for(const[,p] of room.players){
      if(!p.alive)continue;
      const spd=p.powerUps.speed>now?PLAYER_SPEED*2:PLAYER_SPEED;
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      p.x=clamp(p.x+dx*spd,p.r,W-p.r);
      p.y=clamp(p.y+dy*spd,p.r,H-p.r);
      // Paint under player
      const tx=Math.floor(p.x/TILE),ty=Math.floor(p.y/TILE);
      for(let ox=-1;ox<=1;ox++) for(let oy=-1;oy<=1;oy++) paintTile(room,tx+ox,ty+oy,p.colorIndex);
    }

    // Power-ups
    room.powerUps=room.powerUps.filter(pu=>{
      for(const[,p] of room.players){
        const dx=p.x-pu.x,dy=p.y-pu.y;
        if(dx*dx+dy*dy<(p.r+16)**2){
          if(pu.type==='bomb'){
            // Paint bomb: paint 5x5 area
            const tx=Math.floor(p.x/TILE),ty=Math.floor(p.y/TILE);
            for(let ox=-2;ox<=2;ox++) for(let oy=-2;oy<=2;oy++) paintTile(room,tx+ox,ty+oy,p.colorIndex);
            room.effects.push({x:p.x,y:p.y,t:now,color:p.color,big:true});
          } else {
            p.powerUps[pu.type]=now+(pu.duration||4000);
          }
          return false;
        }
      }
      return true;
    });
    if(Math.random()<0.015&&room.powerUps.length<5) room.powerUps.push(spawnPowerUpAt(room,W,H));
    room.effects=room.effects.filter(e=>now-e.t<600);

    // Count scores
    const counts={};
    for(let i=0;i<8;i++)counts[i]=0;
    for(const v of room.grid)if(v>=0)counts[v]++;
    for(const[,p] of room.players) p.score=counts[p.colorIndex]||0;

    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){
      const sorted=[...room.players.values()].sort((a,b)=>b.score-a.score);
      endGame(room,sorted[0]||null);return;
    }

    // Compress grid for send: run-length encode
    ns.to(room.code).emit('gameState',{
      grid:room.grid,
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,colorIndex:p.colorIndex,score:p.score,username:p.username,powerUps:Object.fromEntries(Object.entries(p.powerUps).filter(([,v])=>v>now))})),
      powerUps:room.powerUps,effects:room.effects,timeLeft:Math.ceil(room.timeLeft)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p,tiles:p.score}));
    if(winner)recordWin(winner.username,winner.color,'Territory War',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=GAME_DURATION;room.grid=new Array(COLS*ROWS).fill(-1);room.powerUps=[];room.effects=[];
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{cols:COLS,rows:ROWS,tileSize:TILE,duration:GAME_DURATION,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,colorIndex:p.colorIndex,x:p.x,y:p.y}))});
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
      socket.emit('roomCreated',{code,isHost:true,game:'territory'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'territory'});emitLobby(room);
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
