/**
 * GAME 22: NEON SUMO
 * Circular ring. Push opponents out using body slams and charge attacks.
 * Charge builds up while held, releases a powerful push. Ring shrinks.
 * Namespace: /neonsumo
 */

const TICK=1000/60;
const {circleCircle,dist,clamp,startCountdown,makeBaseRoom}=require('./_shared');
const ARENA_START=260,ARENA_MIN=100,W=800,H=600;

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/neonsumo');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),effects:[],arenaR:ARENA_START,shrinkTimer:15,timeLeft:180};
  }
  function makePlayer(id,username,ci){
    const angle=(ci/6)*Math.PI*2;
    return{id,username,color:COLORS[ci%8],x:W/2+Math.cos(angle)*180,y:H/2+Math.sin(angle)*180,
      vx:0,vy:0,r:22,mass:1,alive:true,score:0,charge:0,charging:false,
      input:{up:false,down:false,left:false,right:false,chargeBtn:false}};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    room.timeLeft-=TICK/1000;
    room.shrinkTimer-=TICK/1000;
    if(room.shrinkTimer<=0&&room.arenaR>ARENA_MIN){room.arenaR=Math.max(ARENA_MIN,room.arenaR-15);room.shrinkTimer=12;ns.to(room.code).emit('arenaShrank',{r:room.arenaR});}

    for(const[,p] of room.players){
      if(!p.alive)continue;
      if(p.input.chargeBtn){p.charge=Math.min(1,p.charge+0.018);}
      else if(p.charge>0){
        // Release charge as burst
        let dx=0,dy=0;
        if(p.input.up)dy-=1;if(p.input.down)dy+=1;
        if(p.input.left)dx-=1;if(p.input.right)dx+=1;
        if(!dx&&!dy){dx=Math.cos(Math.atan2(p.vy,p.vx)||0);dy=Math.sin(Math.atan2(p.vy,p.vx)||0);}
        const force=p.charge*14;
        p.vx+=dx*force;p.vy+=dy*force;
        room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'charge',charge:p.charge});
        p.charge=0;
      }

      let mx=0,my=0;
      if(!p.input.chargeBtn){
        if(p.input.up)my-=1;if(p.input.down)my+=1;
        if(p.input.left)mx-=1;if(p.input.right)mx+=1;
        if(mx&&my){mx*=0.707;my*=0.707;}
      }
      p.vx+=mx*0.4;p.vy+=my*0.4;
      p.vx*=0.90;p.vy*=0.90;
      const spd=Math.sqrt(p.vx*p.vx+p.vy*p.vy);
      if(spd>12){p.vx=p.vx/spd*12;p.vy=p.vy/spd*12;}
      p.x+=p.vx;p.y+=p.vy;
    }

    // Player vs player collisions
    const alive=[...room.players.values()].filter(p=>p.alive);
    for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++){
      const a=alive[i],b=alive[j];
      const d=dist(a.x,a.y,b.x,b.y);
      if(d<a.r+b.r){
        const angle=Math.atan2(b.y-a.y,b.x-a.x);
        const overlap=(a.r+b.r-d)/2;
        a.x-=Math.cos(angle)*overlap;a.y-=Math.sin(angle)*overlap;
        b.x+=Math.cos(angle)*overlap;b.y+=Math.sin(angle)*overlap;
        // Momentum transfer
        const relVx=a.vx-b.vx,relVy=a.vy-b.vy;
        const dot=relVx*Math.cos(angle)+relVy*Math.sin(angle);
        if(dot>0){
          const impulse=dot*1.2;
          a.vx-=Math.cos(angle)*impulse;a.vy-=Math.sin(angle)*impulse;
          b.vx+=Math.cos(angle)*impulse;b.vy+=Math.sin(angle)*impulse;
          if(Math.abs(impulse)>3)room.effects.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,t:now,color:'#fff',type:'hit'});
        }
      }
    }

    // Ring check
    for(const p of alive){
      const d=dist(p.x,p.y,W/2,H/2);
      if(d>room.arenaR-p.r){
        p.alive=false;
        room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'fall'});
        alive.filter(q=>q!==p).forEach(q=>q.score+=20);
        ns.to(room.code).emit('playerOut',{id:p.id,username:p.username});
      }
    }

    const aliveNow=alive.filter(p=>p.alive);
    if(aliveNow.length<=1&&room.players.size>=2){endGame(room,aliveNow[0]||[...room.players.values()].sort((a,b)=>b.score-a.score)[0]);return;}
    if(room.timeLeft<=0){endGame(room,aliveNow.sort((a,b)=>b.score-a.score)[0]||null);return;}

    room.effects=room.effects.filter(e=>now-e.t<500);
    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,alive:p.alive,score:p.score,username:p.username,charge:p.charge})),
      effects:room.effects,arenaR:room.arenaR,timeLeft:Math.ceil(room.timeLeft),shrinkIn:Math.ceil(room.shrinkTimer)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Neon Sumo',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.effects=[];room.arenaR=ARENA_START;room.shrinkTimer=15;room.timeLeft=180;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{arena:{cx:W/2,cy:H/2,r:ARENA_START},
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
      socket.emit('roomCreated',{code,isHost:true,game:'neonsumo'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'neonsumo'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,chargeBtn:!!inp.chargeBtn};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
