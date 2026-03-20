/**
 * GAME 21: CHAIN REACTION
 * Place orbs on a grid. When a cell overflows it explodes into neighbors.
 * Chain reactions can wipe out the board. Last player with orbs wins.
 * Turn-based, 2-6 players.
 * Namespace: /chainreaction
 */

const COLS=9,ROWS=6;
const {startCountdown,makeBaseRoom}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/chainreaction');
  const rooms=new Map();

  function makeRoom(code){
    const grid=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const maxOrbs=(r===0||r===ROWS-1)?(c===0||c===COLS-1?1:2):(c===0||c===COLS-1?2:3);
      grid.push({row:r,col:c,orbs:0,owner:-1,maxOrbs});
    }
    return{...makeBaseRoom(code),players:new Map(),grid,turnOrder:[],currentTurn:0,moveInProgress:false};
  }
  function makePlayer(id,username,ci){return{id,username,color:COLORS[ci%8],ci,alive:true,score:0};}

  function getIdx(r,c){return r*COLS+c;}
  function getNeighbors(r,c){const n=[];if(r>0)n.push([r-1,c]);if(r<ROWS-1)n.push([r+1,c]);if(c>0)n.push([r,c-1]);if(c<COLS-1)n.push([r,c+1]);return n;}

  function explode(room,iterations=0){
    if(iterations>200)return; // safety
    let exploded=false;
    for(let i=0;i<room.grid.length;i++){
      const cell=room.grid[i];
      if(cell.orbs>=cell.maxOrbs){
        exploded=true;
        const owner=cell.owner;
        const orbs=cell.orbs;
        cell.orbs=0;cell.owner=-1;
        const r=Math.floor(i/COLS),c=i%COLS;
        for(const [nr,nc] of getNeighbors(r,c)){
          const n=room.grid[getIdx(nr,nc)];
          n.orbs++;n.owner=owner;
        }
      }
    }
    if(exploded)explode(room,iterations+1);
  }

  function checkAlive(room){
    const totalOrbs=room.grid.reduce((s,c)=>s+c.orbs,0);
    if(totalOrbs<2)return;
    for(const[,p] of room.players){
      const hasOrbs=room.grid.some(c=>c.owner===p.ci);
      if(!hasOrbs&&p.alive&&totalOrbs>0){p.alive=false;}
    }
  }

  function nextTurn(room){
    room.currentTurn++;
    let tries=0;
    while(tries<=room.turnOrder.length){
      const p=room.players.get(room.turnOrder[room.currentTurn%room.turnOrder.length]);
      if(p?.alive)break;
      room.currentTurn++;tries++;
    }
    const alive=[...room.players.values()].filter(p=>p.alive);
    if(alive.length<=1){endGame(room,alive[0]);return;}
    const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
    ns.to(room.code).emit('turnStart',{playerId:pid,grid:room.grid,players:[...room.players.values()]});
  }

  function endGame(room,winner){
    room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Chain Reaction',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner||null,results});
  }

  function startGame(room){
    room.state='playing';
    const grid=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const maxOrbs=(r===0||r===ROWS-1)?(c===0||c===COLS-1?1:2):(c===0||c===COLS-1?2:3);
      grid.push({row:r,col:c,orbs:0,owner:-1,maxOrbs});
    }
    room.grid=grid;room.currentTurn=0;room.moveInProgress=false;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    room.turnOrder=[...room.players.keys()];
    for(let i=room.turnOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[room.turnOrder[i],room.turnOrder[j]]=[room.turnOrder[j],room.turnOrder[i]];}
    ns.to(room.code).emit('gameStart',{cols:COLS,rows:ROWS,players:[...room.players.values()]});
    setTimeout(()=>nextTurn(room),800);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'chainreaction'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'chainreaction'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('placeOrb',({row,col})=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing'||room.moveInProgress)return;
      const pid=room.turnOrder[room.currentTurn%room.turnOrder.length];
      if(socket.id!==pid)return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      const idx=getIdx(row,col);
      const cell=room.grid[idx];
      if(!cell)return;
      if(cell.owner!==-1&&cell.owner!==p.ci)return; // Can't place on enemy
      room.moveInProgress=true;
      cell.orbs++;cell.owner=p.ci;
      explode(room);checkAlive(room);
      p.score+=10;
      room.moveInProgress=false;
      ns.to(room.code).emit('gridUpdate',{grid:room.grid,players:[...room.players.values()]});
      setTimeout(()=>nextTurn(room),500);
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
