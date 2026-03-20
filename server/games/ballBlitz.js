/**
 * GAME 15: BALL BLITZ
 * Players survive on a platform. Bouncing balls fill the arena.
 * Dodge balls — get hit = lose a life (3 lives). Last alive wins.
 * Players can earn bonus: kick balls toward others (click).
 * Namespace: /ballblitz
 */

const W=800,H=600,TICK=1000/60;
const {circleCircle,clamp,startCountdown,makeBaseRoom,randF}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/ballblitz');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),balls:[],effects:[],timeLeft:120,ballSpawnTimer:0};
  }
  function makePlayer(id,username,ci){
    const spawns=[{x:100,y:100},{x:700,y:500},{x:700,y:100},{x:100,y:500},{x:400,y:80},{x:400,y:520}];
    const s=spawns[ci%6];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,r:16,lives:3,alive:true,score:0,input:{up:false,down:false,left:false,right:false,kick:false}};
  }
  function spawnBall(){
    const edge=Math.floor(Math.random()*4);
    let x,y,vx,vy;
    const spd=randF(3,5);const a=Math.random()*Math.PI*2;
    if(edge===0){x=randF(20,W-20);y=10;vx=Math.cos(a)*spd;vy=Math.abs(Math.sin(a)*spd);}
    else if(edge===1){x=W-10;y=randF(20,H-20);vx=-Math.abs(Math.cos(a)*spd);vy=Math.sin(a)*spd;}
    else if(edge===2){x=randF(20,W-20);y=H-10;vx=Math.cos(a)*spd;vy=-Math.abs(Math.sin(a)*spd);}
    else{x=10;y=randF(20,H-20);vx=Math.abs(Math.cos(a)*spd);vy=Math.sin(a)*spd;}
    return{id:Math.random(),x,y,vx,vy,r:14,color:`hsl(${Math.random()*360},100%,60%)`};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();
    room.ballSpawnTimer+=TICK;
    if(room.ballSpawnTimer>2500){room.ballSpawnTimer=0;if(room.balls.length<25)room.balls.push(spawnBall());}

    // Move balls
    for(const b of room.balls){
      b.x+=b.vx;b.y+=b.vy;
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);}
      if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx);}
      if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy);}
      if(b.y>H-b.r){b.y=H-b.r;b.vy=-Math.abs(b.vy);}
    }

    // Players
    for(const[,p] of room.players){
      if(!p.alive)continue;
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      p.x=clamp(p.x+dx*3.5,p.r,W-p.r);p.y=clamp(p.y+dy*3.5,p.r,H-p.r);

      // Ball hits
      for(const b of room.balls){
        if(circleCircle(p.x,p.y,p.r,b.x,b.y,b.r)){
          if(p.input.kick){
            // Kick ball toward nearest enemy
            const enemies=[...room.players.values()].filter(q=>q!==p&&q.alive);
            if(enemies.length){
              const target=enemies.reduce((a,e)=>(!a||Math.hypot(e.x-p.x,e.y-p.y)<Math.hypot(a.x-p.x,a.y-p.y))?e:a,null);
              const ang=Math.atan2(target.y-b.y,target.x-b.x);
              b.vx=Math.cos(ang)*8;b.vy=Math.sin(ang)*8;
              p.score+=5;
            }
          } else {
            // Bounce ball away
            const ang=Math.atan2(b.y-p.y,b.x-p.x);
            b.vx=Math.cos(ang)*5;b.vy=Math.sin(ang)*5;
            p.lives--;p.score=Math.max(0,p.score-10);
            room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'hit'});
            if(p.lives<=0){p.alive=false;room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'die'});}
          }
        }
      }
    }
    room.effects=room.effects.filter(e=>now-e.t<500);

    const alive=[...room.players.values()].filter(p=>p.alive);
    if(alive.length<=1&&room.players.size>=2){endGame(room,alive[0]||[...room.players.values()].sort((a,b)=>b.score-a.score)[0]);return;}
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){endGame(room,alive.sort((a,b)=>b.lives-a.lives||b.score-a.score)[0]||null);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,lives:p.lives,alive:p.alive,score:p.score,username:p.username})),
      balls:room.balls.map(b=>({id:b.id,x:b.x,y:b.y,r:b.r,color:b.color})),
      effects:room.effects,timeLeft:Math.ceil(room.timeLeft)
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.lives-a.lives||b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Ball Blitz',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=120;room.balls=[...Array(5)].map(()=>spawnBall());room.effects=[];room.ballSpawnTimer=0;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{lives:3,players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y}))});
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
      socket.emit('roomCreated',{code,isHost:true,game:'ballblitz'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'ballblitz'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,kick:!!inp.kick};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
