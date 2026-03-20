/**
 * GAME 8: BULLET HELL ARENA
 * Up to 6 players fight waves of enemy drones + each other.
 * Score points by killing drones. Players can also shoot each other.
 * Highest score after 90s wins. Boss wave every 30s.
 * Namespace: /bullethell
 */

const W=800,H=600,TICK=1000/60;
const GAME_DURATION=90, DRONE_TICK=2000;
const {circleRect,circleCircle,dist,randF,randInt,startCountdown,makeBaseRoom,spawnPowerUpAt}=require('./_shared');

const OBSTACLES=[
  {x:180,y:130,w:80,h:20},{x:540,y:130,w:80,h:20},
  {x:180,y:450,w:80,h:20},{x:540,y:450,w:80,h:20},
  {x:330,y:270,w:140,h:60},
  {x:80,y:260,w:20,h:80},{x:700,y:260,w:20,h:80},
];

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/bullethell');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),
      players:new Map(),bullets:[],drones:[],powerUps:[],effects:[],
      timeLeft:GAME_DURATION,wave:1,droneTimer:0,bossActive:false
    };
  }

  function spawnPlayer(id,username,ci){
    const spawns=[{x:80,y:80},{x:720,y:80},{x:80,y:520},{x:720,y:520},{x:400,y:60},{x:400,y:540},{x:60,y:300},{x:740,y:300}];
    const s=spawns[ci%8];
    return{id,username,color:COLORS[ci%8],x:s.x,y:s.y,hp:100,alive:true,score:0,kills:0,
      input:{up:false,down:false,left:false,right:false,shoot:false,mouseX:400,mouseY:300},
      lastShot:0,shotCd:250,powerUps:{},radius:16,regenTimer:0};
  }

  function spawnDrone(room,boss=false){
    const edge=randInt(0,3);
    let x,y;
    if(edge===0){x=randF(40,W-40);y=10;}
    else if(edge===1){x=W-10;y=randF(40,H-40);}
    else if(edge===2){x=randF(40,W-40);y=H-10;}
    else{x=10;y=randF(40,H-40);}
    return{id:Math.random(),x,y,hp:boss?300:40,maxHp:boss?300:40,
      spd:boss?1.2:randF(1.4,2.4),dmg:boss?20:10,r:boss?28:12,
      color:boss?'#FF2D55':'#FF6600',boss,alive:true,atkTimer:0,
      vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3};
  }

  function tick(room){
    if(room.state!=='playing') return;
    const now=Date.now();

    // Players
    for(const[,p] of room.players){
      if(!p.alive) continue;
      const spd=p.powerUps.speed>now?6:3.5;
      p.shotCd=p.powerUps.rapid>now?120:250;
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      let nx=Math.max(p.radius,Math.min(W-p.radius,p.x+dx*spd));
      let ny=Math.max(p.radius,Math.min(H-p.radius,p.y+dy*spd));
      for(const o of OBSTACLES){
        if(circleRect(nx,ny,p.radius,o.x,o.y,o.w,o.h)){
          if(!circleRect(p.x,ny,p.radius,o.x,o.y,o.w,o.h)) nx=p.x;
          else if(!circleRect(nx,p.y,p.radius,o.x,o.y,o.w,o.h)) ny=p.y;
          else{nx=p.x;ny=p.y;}
        }
      }
      p.x=nx;p.y=ny;
      if(p.input.shoot&&now-p.lastShot>p.shotCd){
        p.lastShot=now;
        const a=Math.atan2(p.input.mouseY-p.y,p.input.mouseX-p.x);
        room.bullets.push({id:Math.random(),ownerId:p.id,ownerColor:p.color,type:'player',
          x:p.x+Math.cos(a)*(p.radius+8),y:p.y+Math.sin(a)*(p.radius+8),
          vx:Math.cos(a)*9,vy:Math.sin(a)*9,life:80,r:5,dmg:25});
      }
      p.regenTimer++;
      if(p.regenTimer>200&&p.hp<100) p.hp=Math.min(100,p.hp+0.08);
    }

    // Drones: chase nearest player, fire bullets
    room.droneTimer+=TICK;
    if(room.droneTimer>DRONE_TICK){
      room.droneTimer=0;
      const count=Math.min(3+room.wave,12);
      for(let i=0;i<count;i++) room.drones.push(spawnDrone(room,false));
      if(room.wave%3===0&&!room.bossActive){room.drones.push(spawnDrone(room,true));room.bossActive=true;}
    }

    const alivePlayers=[...room.players.values()].filter(p=>p.alive);
    for(const d of room.drones){
      if(!d.alive) continue;
      let target=null,td=Infinity;
      for(const p of alivePlayers){const dd=dist(d.x,d.y,p.x,p.y);if(dd<td){td=dd;target=p;}}
      if(target){
        const a=Math.atan2(target.y-d.y,target.x-d.x);
        d.x+=Math.cos(a)*d.spd;d.y+=Math.sin(a)*d.spd;
        d.x=Math.max(d.r,Math.min(W-d.r,d.x));d.y=Math.max(d.r,Math.min(H-d.r,d.y));
        // Drone shoots
        d.atkTimer++;
        if(d.atkTimer>80){d.atkTimer=0;
          const a2=Math.atan2(target.y-d.y,target.x-d.x);
          room.bullets.push({id:Math.random(),ownerId:'drone',ownerColor:d.color,type:'drone',
            x:d.x,y:d.y,vx:Math.cos(a2)*5,vy:Math.sin(a2)*5,life:60,r:4,dmg:d.dmg});
          if(d.boss){// Boss fires spread
            for(let ang=-0.4;ang<=0.4;ang+=0.2)
              room.bullets.push({id:Math.random(),ownerId:'drone',ownerColor:'#FF0000',type:'drone',
                x:d.x,y:d.y,vx:Math.cos(a2+ang)*4,vy:Math.sin(a2+ang)*4,life:70,r:5,dmg:15});
          }
        }
      }
    }

    // Bullet collisions
    const toRemove=new Set();
    for(let i=0;i<room.bullets.length;i++){
      const b=room.bullets[i];
      b.x+=b.vx;b.y+=b.vy;b.life--;
      if(b.x<0||b.x>W||b.y<0||b.y>H||b.life<=0){toRemove.add(i);continue;}
      if(OBSTACLES.some(o=>circleRect(b.x,b.y,b.r,o.x,o.y,o.w,o.h))){toRemove.add(i);continue;}
      if(b.type==='player'){
        // Hits drones
        for(const d of room.drones){
          if(!d.alive) continue;
          if(circleCircle(b.x,b.y,b.r,d.x,d.y,d.r)){
            d.hp-=b.dmg;
            room.effects.push({x:d.x,y:d.y,t:now,color:b.ownerColor});
            if(d.hp<=0){d.alive=false;if(d.boss)room.bossActive=false;
              const p=room.players.get(b.ownerId);
              if(p){p.score+=d.boss?100:20;p.kills++;}
              room.wave=Math.floor([...room.players.values()].reduce((s,p)=>s+p.kills,0)/5)+1;
            }
            toRemove.add(i);break;
          }
        }
        // Hits other players
        if(!toRemove.has(i)){
          for(const[,p] of room.players){
            if(!p.alive||p.id===b.ownerId||p.powerUps.shield>now) continue;
            if(circleCircle(b.x,b.y,b.r,p.x,p.y,p.radius)){
              p.hp-=12;p.regenTimer=0;
              if(p.hp<=0){p.alive=false;const killer=room.players.get(b.ownerId);if(killer){killer.score+=50;killer.kills++;}}
              toRemove.add(i);break;
            }
          }
        }
      } else {
        // Drone bullets hit players
        for(const[,p] of room.players){
          if(!p.alive||p.powerUps.shield>now) continue;
          if(circleCircle(b.x,b.y,b.r,p.x,p.y,p.radius)){
            p.hp-=b.dmg;p.regenTimer=0;
            if(p.hp<=0)p.alive=false;
            toRemove.add(i);break;
          }
        }
      }
    }
    room.bullets=room.bullets.filter((_,i)=>!toRemove.has(i));
    room.drones=room.drones.filter(d=>d.alive);
    room.effects=room.effects.filter(e=>now-e.t<400);

    // Power-ups
    room.powerUps=room.powerUps.filter(pu=>{
      for(const[,p] of room.players){
        if(!p.alive) continue;
        if(circleCircle(p.x,p.y,p.radius,pu.x,pu.y,16)){
          if(pu.type==='bomb'){
            room.drones.forEach(d=>{if(dist(p.x,p.y,d.x,d.y)<120){d.hp-=80;if(d.hp<=0){d.alive=false;p.score+=20;}}});
          } else {
            p.powerUps[pu.type]=now+(pu.duration||4000);
          }
          return false;
        }
      }
      return true;
    });
    if(Math.random()<0.002&&room.powerUps.length<4) room.powerUps.push(spawnPowerUpAt(room,W,H));

    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){
      const sorted=[...room.players.values()].sort((a,b)=>b.score-a.score);
      endGame(room,sorted[0]||null); return;
    }
    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,alive:p.alive,score:p.score,kills:p.kills,color:p.color,username:p.username,radius:p.radius,powerUps:Object.fromEntries(Object.entries(p.powerUps).filter(([,v])=>v>now))})),
      bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,ownerColor:b.ownerColor,type:b.type,r:b.r})),
      drones:room.drones.map(d=>({id:d.id,x:d.x,y:d.y,r:d.r,hp:d.hp,maxHp:d.maxHp,color:d.color,boss:d.boss})),
      powerUps:room.powerUps,effects:room.effects,timeLeft:Math.ceil(room.timeLeft),wave:room.wave
    });
  }

  function endGame(room,winner){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p}));
    if(winner)recordWin(winner.username,winner.color,'Bullet Hell Arena',winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room){
    room.state='playing';room.timeLeft=GAME_DURATION;room.bullets=[];room.drones=[];room.powerUps=[];room.effects=[];room.wave=1;room.droneTimer=0;room.bossActive=false;
    let ci=0;for(const[id,p] of room.players)room.players.set(id,spawnPlayer(id,p.username,ci++));
    ns.to(room.code).emit('gameStart',{obstacles:OBSTACLES,duration:GAME_DURATION,
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
      room.players.set(socket.id,spawnPlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'bullethell'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,spawnPlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'bullethell'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('input',(inp)=>{
      const room=rooms.get(socket.roomCode);if(!room||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p||!p.alive)return;
      p.input={up:!!inp.up,down:!!inp.down,left:!!inp.left,right:!!inp.right,shoot:!!inp.shoot,
        mouseX:Math.max(0,Math.min(W,Number(inp.mouseX)||400)),mouseY:Math.max(0,Math.min(H,Number(inp.mouseY)||300))};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
