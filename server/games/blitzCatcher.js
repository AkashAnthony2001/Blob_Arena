/**
 * GAME 23: BLITZ CATCHER
 * Stars/coins fall from the sky. Catch as many as you can in 45 seconds.
 * Players can steal stars from each other (bump = steal).
 * Has golden stars worth 5x. Solo or up to 6 players.
 * Namespace: /blitzcatcher
 */

const W=800,H=600,TICK=50,GAME_DURATION=45;
const {circleCircle,clamp,startCountdown,makeBaseRoom,randF}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/blitzcatcher');
  const rooms=new Map();

  function makeRoom(code){return{...makeBaseRoom(code),players:new Map(),stars:[],effects:[],timeLeft:GAME_DURATION,spawnTimer:0};}
  function makePlayer(id,username,ci){
    return{id,username,color:COLORS[ci%8],x:100+ci*100,y:H-50,r:20,score:0,heldStars:0,alive:true,
      input:{left:false,right:false,dash:false},vx:0,dashCd:0};
  }
  function spawnStar(room){
    const golden=Math.random()<0.12;
    return{id:Math.random(),x:randF(30,W-30),y:-20,vy:randF(2.5,4.5),r:golden?14:10,golden,color:golden?'#FFD700':'#FFF',value:golden?5:1};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    room.spawnTimer+=TICK;
    if(room.spawnTimer>600){room.spawnTimer=0;if(room.stars.length<30)room.stars.push(spawnStar(room));}
    if(Math.random()<0.03&&room.stars.length<30)room.stars.push(spawnStar(room));

    // Move stars
    room.stars=room.stars.filter(s=>{s.y+=s.vy;return s.y<H+20;});

    for(const[,p] of room.players){
      p.dashCd=Math.max(0,p.dashCd-TICK/1000);
      let dx=0;
      if(p.input.left)dx=-1;if(p.input.right)dx=1;
      if(p.input.dash&&p.dashCd<=0&&dx!==0){p.vx=dx*14;p.dashCd=1.5;}
      p.vx=p.vx*0.8+dx*2;
      p.x=clamp(p.x+p.vx,p.r,W-p.r);

      // Catch stars
      room.stars=room.stars.filter(s=>{
        if(circleCircle(p.x,p.y,p.r,s.x,s.y,s.r)){
          p.score+=s.value;p.heldStars++;
          room.effects.push({x:s.x,y:s.y,t:now,color:s.color,value:s.value});
          return false;
        }
        return true;
      });
    }

    // Player bumping — steal stars
    const pArr=[...room.players.values()];
    for(let i=0;i<pArr.length;i++) for(let j=i+1;j<pArr.length;j++){
      const a=pArr[i],b=pArr[j];
      if(circleCircle(a.x,a.y,a.r,b.x,b.y,b.r)&&Math.abs(a.vx)>6){
        if(b.score>0){b.score=Math.max(0,b.score-2);a.score+=2;room.effects.push({x:b.x,y:b.y,t:now,color:a.color,type:'steal',value:-2});}
        a.vx*=-0.5;b.vx+=a.vx*0.5;
      }
    }

    room.effects=room.effects.filter(e=>now-e.t<700);
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){const w=[...room.players.values()].sort((a,b)=>b.score-a.score)[0];endGame(room,w);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,score:p.score,username:p.username,dashCd:p.dashCd})),
      stars:room.stars,effects:room.effects,timeLeft:Math.ceil(room.timeLeft)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Blitz Catcher',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=GAME_DURATION;room.stars=[];room.effects=[];room.spawnTimer=0;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{duration:GAME_DURATION,players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'blitzcatcher'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'blitzcatcher'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p)return;
      p.input={left:!!inp.left,right:!!inp.right,dash:!!inp.dash};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
