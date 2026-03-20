/**
 * GAME 18: SPACE DUEL
 * 1v1 (or up to 4) spaceship dogfight. Newtonian physics — ships drift.
 * Shoot heat-seeking missiles or rapid bullets. First to 5 kills wins.
 * Namespace: /spaceduel
 */

const W=900,H=600,TICK=1000/60;
const {circleCircle,startCountdown,makeBaseRoom}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/spaceduel');
  const rooms=new Map();

  function makeRoom(code){return{...makeBaseRoom(code),players:new Map(),bullets:[],missiles:[],effects:[],killTarget:5};}
  function makePlayer(id,username,ci){
    const spawns=[{x:150,y:300,angle:0},{x:750,y:300,angle:Math.PI},{x:450,y:80,angle:Math.PI/2},{x:450,y:520,angle:-Math.PI/2}];
    const s=spawns[ci%4];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,vx:0,vy:0,angle:s.angle,r:16,
      alive:true,kills:0,deaths:0,score:0,
      input:{thrust:false,left:false,right:false,shoot:false,missile:false},
      lastShot:0,lastMissile:0,missileCd:5000,respawnAt:0};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();

    for(const[,p] of room.players){
      if(!p.alive){
        if(p.respawnAt&&now>p.respawnAt){
          const ci=[...room.players.values()].findIndex(q=>q.id===p.id);
          const spawns=[{x:150,y:300,angle:0},{x:750,y:300,angle:Math.PI},{x:450,y:80,angle:Math.PI/2},{x:450,y:520,angle:-Math.PI/2}];
          const s=spawns[ci%4];
          p.x=s.x;p.y=s.y;p.vx=0;p.vy=0;p.angle=s.angle;p.alive=true;
        }
        continue;
      }
      if(p.input.left)p.angle-=0.06;
      if(p.input.right)p.angle+=0.06;
      if(p.input.thrust){p.vx+=Math.cos(p.angle)*0.2;p.vy+=Math.sin(p.angle)*0.2;}
      // Drag
      p.vx*=0.99;p.vy*=0.99;
      // Speed cap
      const spd=Math.sqrt(p.vx*p.vx+p.vy*p.vy);
      if(spd>7){p.vx=p.vx/spd*7;p.vy=p.vy/spd*7;}
      p.x+=p.vx;p.y+=p.vy;
      // Wrap
      if(p.x<0)p.x=W;if(p.x>W)p.x=0;
      if(p.y<0)p.y=H;if(p.y>H)p.y=0;

      if(p.input.shoot&&now-p.lastShot>220){
        p.lastShot=now;
        room.bullets.push({id:Math.random(),ownerId:p.id,ownerColor:p.color,
          x:p.x+Math.cos(p.angle)*20,y:p.y+Math.sin(p.angle)*20,
          vx:p.vx+Math.cos(p.angle)*10,vy:p.vy+Math.sin(p.angle)*10,life:60,r:4});
      }
      if(p.input.missile&&now-p.lastMissile>p.missileCd){
        p.lastMissile=now;
        const enemies=[...room.players.values()].filter(q=>q!==p&&q.alive);
        const target=enemies.length?enemies.reduce((a,b)=>Math.hypot(b.x-p.x,b.y-p.y)<Math.hypot(a.x-p.x,a.y-p.y)?b:a,enemies[0]):null;
        room.missiles.push({id:Math.random(),ownerId:p.id,ownerColor:p.color,
          x:p.x,y:p.y,vx:p.vx+Math.cos(p.angle)*5,vy:p.vy+Math.sin(p.angle)*5,
          angle:p.angle,targetId:target?.id,life:180,r:6,born:now});
        ns.to(room.code).emit('missileLaunched',{by:p.username,color:p.color});
      }
    }

    // Missiles home in on target
    for(const m of room.missiles){
      m.life--;
      if(m.targetId){
        const target=room.players.get(m.targetId);
        if(target&&target.alive){
          const a=Math.atan2(target.y-m.y,target.x-m.x);
          m.vx+=Math.cos(a)*0.3;m.vy+=Math.sin(a)*0.3;
          const spd=Math.sqrt(m.vx*m.vx+m.vy*m.vy);
          if(spd>6){m.vx=m.vx/spd*6;m.vy=m.vy/spd*6;}
        }
      }
      m.x+=m.vx;m.y+=m.vy;
      if(m.x<0)m.x=W;if(m.x>W)m.x=0;
      if(m.y<0)m.y=H;if(m.y>H)m.y=0;
    }

    // Bullet collisions
    const toRemove=new Set();
    for(let i=0;i<room.bullets.length;i++){
      const b=room.bullets[i];b.x+=b.vx;b.y+=b.vy;b.life--;
      if(b.life<=0){toRemove.add(i);continue;}
      if(b.x<0||b.x>W||b.y<0||b.y>H){b.x=(b.x+W)%W;b.y=(b.y+H)%H;} // wrap
      for(const[,p] of room.players){
        if(!p.alive||p.id===b.ownerId)continue;
        if(circleCircle(b.x,b.y,b.r,p.x,p.y,p.r)){
          p.alive=false;p.deaths++;p.respawnAt=Date.now()+2000;
          const killer=room.players.get(b.ownerId);
          if(killer){killer.kills++;killer.score+=100;}
          room.effects.push({x:p.x,y:p.y,t:Date.now(),color:p.color,type:'explosion'});
          ns.to(room.code).emit('playerKilled',{deadId:p.id,killerId:b.ownerId});
          toRemove.add(i);break;
        }
      }
    }
    room.bullets=room.bullets.filter((_,i)=>!toRemove.has(i));

    // Missile collisions
    room.missiles=room.missiles.filter(m=>{
      if(m.life<=0)return false;
      for(const[,p] of room.players){
        if(!p.alive||p.id===m.ownerId)continue;
        if(circleCircle(m.x,m.y,m.r+4,p.x,p.y,p.r)){
          p.alive=false;p.deaths++;p.respawnAt=Date.now()+2500;
          const killer=room.players.get(m.ownerId);
          if(killer){killer.kills++;killer.score+=150;}
          room.effects.push({x:p.x,y:p.y,t:Date.now(),color:'#FF4444',type:'big_explosion'});
          ns.to(room.code).emit('playerKilled',{deadId:p.id,killerId:m.ownerId,byMissile:true});
          return false;
        }
      }
      return true;
    });

    room.effects=room.effects.filter(e=>Date.now()-e.t<600);

    // Win check
    const leader=[...room.players.values()].find(p=>p.kills>=room.killTarget);
    if(leader){endGame(room,leader);return;}

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,angle:p.angle,vx:p.vx,vy:p.vy,color:p.color,alive:p.alive,kills:p.kills,score:p.score,username:p.username,missileCdLeft:Math.max(0,p.missileCd-(Date.now()-p.lastMissile))})),
      bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,ownerColor:b.ownerColor})),
      missiles:room.missiles.map(m=>({id:m.id,x:m.x,y:m.y,ownerColor:m.ownerColor,angle:Math.atan2(m.vy,m.vx)})),
      effects:room.effects,killTarget:room.killTarget
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Space Duel',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.bullets=[];room.missiles=[];room.effects=[];
    let ci=0;for(const[id,p] of room.players)room.players.set(id,makePlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{killTarget:room.killTarget,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,x:p.x,y:p.y,angle:p.angle}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'spaceduel'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=4){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'spaceduel'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      p.input={thrust:!!inp.thrust,left:!!inp.left,right:!!inp.right,shoot:!!inp.shoot,missile:!!inp.missile};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
