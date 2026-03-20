/**
 * GAME 20: CYBER CAPTURE
 * Capture The Flag. 2 teams (red vs blue). Steal the enemy flag, bring it to yours.
 * First team to 3 captures wins. Shoot enemies to tag them out (10s respawn).
 * Namespace: /cybercapture
 */

const W=900,H=600,TICK=1000/60;
const {circleCircle,circleRect,clamp,startCountdown,makeBaseRoom}=require('./_shared');

const FLAGS={
  red: {x:80,y:300,color:'#FF2D55'},
  blue:{x:820,y:300,color:'#00F5FF'}
};
const BASES={
  red: {x:50,y:200,w:80,h:200},
  blue:{x:770,y:200,w:80,h:200}
};
const WALLS=[
  {x:300,y:0,w:20,h:220},{x:300,y:380,w:20,h:220},
  {x:580,y:0,w:20,h:220},{x:580,y:380,w:20,h:220},
  {x:400,y:240,w:100,h:120},
  {x:150,y:100,w:20,h:120},{x:730,y:380,w:20,h:120},
];

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/cybercapture');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),bullets:[],effects:[],
      flags:{red:{...FLAGS.red,carrier:null},blue:{...FLAGS.blue,carrier:null}},
      scores:{red:0,blue:0},captureTarget:3};
  }
  function makePlayer(id,username,ci,team){
    const isRed=team==='red';
    return{id,username,color:isRed?'#FF2D55':'#00F5FF',team,
      x:isRed?80:820,y:300+Math.random()*80-40,r:16,
      hp:100,alive:true,score:0,hasFlag:false,
      input:{up:false,down:false,left:false,right:false,shoot:false,mouseX:W/2,mouseY:H/2},
      lastShot:0,respawnAt:0};
  }

  function tick(room){
    if(room.state!=='playing')return;
    const now=Date.now();

    for(const[,p] of room.players){
      if(!p.alive){
        if(now>p.respawnAt){
          const base=p.team==='red'?{x:80,y:300}:{x:820,y:300};
          p.x=base.x;p.y=base.y+(Math.random()-0.5)*60;p.hp=100;p.alive=true;p.hasFlag=false;
          // Drop flag if carrying
          for(const[side,fl] of Object.entries(room.flags)){if(fl.carrier===p.id){fl.carrier=null;fl.x=p.x;fl.y=p.y;}}
        }
        continue;
      }
      let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;
      if(p.input.left)dx-=1;if(p.input.right)dx+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      const spd=p.hasFlag?2.5:3.8;
      let nx=clamp(p.x+dx*spd,p.r,W-p.r);
      let ny=clamp(p.y+dy*spd,p.r,H-p.r);
      for(const w of WALLS){
        if(circleRect(nx,ny,p.r,w.x,w.y,w.w,w.h)){
          if(!circleRect(p.x,ny,p.r,w.x,w.y,w.w,w.h))nx=p.x;
          else if(!circleRect(nx,p.y,p.r,w.x,w.y,w.w,w.h))ny=p.y;
          else{nx=p.x;ny=p.y;}
        }
      }
      p.x=nx;p.y=ny;

      // Shoot
      if(p.input.shoot&&now-p.lastShot>300){
        p.lastShot=now;
        const a=Math.atan2(p.input.mouseY-p.y,p.input.mouseX-p.x);
        room.bullets.push({id:Math.random(),ownerId:p.id,ownerColor:p.color,team:p.team,
          x:p.x+Math.cos(a)*20,y:p.y+Math.sin(a)*20,vx:Math.cos(a)*9,vy:Math.sin(a)*9,life:80,r:5});
      }

      // Pick up enemy flag
      const enemySide=p.team==='red'?'blue':'red';
      const ef=room.flags[enemySide];
      if(!ef.carrier&&circleCircle(p.x,p.y,p.r,ef.x,ef.y,16)){
        ef.carrier=p.id;p.hasFlag=true;
        ns.to(room.code).emit('flagPickup',{playerId:p.id,username:p.username,team:p.team,flagSide:enemySide});
      }

      // Capture if at own base with enemy flag
      if(p.hasFlag){
        const myBase=BASES[p.team];
        if(circleRect(p.x,p.y,p.r,myBase.x,myBase.y,myBase.w,myBase.h)){
          // Score!
          room.scores[p.team]++;p.score+=200;p.hasFlag=false;
          const fl=room.flags[enemySide];fl.carrier=null;fl.x=FLAGS[enemySide].x;fl.y=FLAGS[enemySide].y;
          ns.to(room.code).emit('flagCaptured',{team:p.team,username:p.username,scores:room.scores});
          room.effects.push({x:p.x,y:p.y,t:now,color:p.color,type:'capture'});
          if(room.scores[p.team]>=room.captureTarget){endGame(room,p.team);return;}
        }
      }
    }

    // Bullets
    const toRemove=new Set();
    for(let i=0;i<room.bullets.length;i++){
      const b=room.bullets[i];b.x+=b.vx;b.y+=b.vy;b.life--;
      if(b.x<0||b.x>W||b.y<0||b.y>H||b.life<=0){toRemove.add(i);continue;}
      if(WALLS.some(w=>circleRect(b.x,b.y,b.r,w.x,w.y,w.w,w.h))){toRemove.add(i);continue;}
      for(const[,q] of room.players){
        if(!q.alive||q.team===b.team)continue;
        if(circleCircle(b.x,b.y,b.r,q.x,q.y,q.r)){
          q.hp-=30;toRemove.add(i);
          if(q.hp<=0){
            q.alive=false;q.respawnAt=now+8000;
            if(q.hasFlag){// Drop flag
              const fl=room.flags[q.team==='red'?'blue':'red'];fl.carrier=null;fl.x=q.x;fl.y=q.y;q.hasFlag=false;
              ns.to(room.code).emit('flagDropped',{flagSide:q.team==='red'?'blue':'red',x:q.x,y:q.y});
            }
            const shooter=room.players.get(b.ownerId);if(shooter)shooter.score+=50;
            ns.to(room.code).emit('playerTagged',{id:q.id,username:q.username,respawnIn:8});
          }
          room.effects.push({x:q.x,y:q.y,t:now,color:b.ownerColor});
          break;
        }
      }
    }
    room.bullets=room.bullets.filter((_,i)=>!toRemove.has(i));
    room.effects=room.effects.filter(e=>now-e.t<500);

    ns.to(room.code).emit('gameState',{
      players:[...room.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,color:p.color,team:p.team,hp:p.hp,alive:p.alive,score:p.score,hasFlag:p.hasFlag,username:p.username,respawnIn:p.alive?0:Math.max(0,Math.ceil((p.respawnAt-now)/1000))})),
      bullets:room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,ownerColor:b.ownerColor})),
      flags:{red:{x:room.flags.red.carrier?room.players.get(room.flags.red.carrier)?.x??FLAGS.red.x:room.flags.red.x,y:room.flags.red.carrier?room.players.get(room.flags.red.carrier)?.y??FLAGS.red.y:room.flags.red.y,carrier:room.flags.red.carrier},blue:{x:room.flags.blue.carrier?room.players.get(room.flags.blue.carrier)?.x??FLAGS.blue.x:room.flags.blue.x,y:room.flags.blue.carrier?room.players.get(room.flags.blue.carrier)?.y??FLAGS.blue.y:room.flags.blue.y,carrier:room.flags.blue.carrier}},
      scores:room.scores,effects:room.effects
    });
  }

  function endGame(room,winTeam){
    clearInterval(room.tickInterval);room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p,won:p.team===winTeam}));
    const winner=[...room.players.values()].filter(p=>p.team===winTeam).sort((a,b)=>b.score-a.score)[0];
    if(winner)recordWin(winner.username,winner.color,'Cyber Capture',winner.score);
    ns.to(room.code).emit('gameOver',{winTeam,results,finalScores:room.scores});
  }

  function startGame(room){
    room.state='playing';room.bullets=[];room.effects=[];
    room.flags={red:{...FLAGS.red,carrier:null},blue:{...FLAGS.blue,carrier:null}};
    room.scores={red:0,blue:0};
    let ci=0;
    [...room.players.keys()].forEach((id,i)=>{
      const p=room.players.get(id);
      const team=i%2===0?'red':'blue';
      room.players.set(id,makePlayer(id,p.username,ci++,team));
    });
    ns.to(room.code).emit('gameStart',{walls:WALLS,flags:FLAGS,bases:BASES,captureTarget:room.captureTarget,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,team:p.team,x:p.x,y:p.y}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0,'red'));
      socket.emit('roomCreated',{code,isHost:true,game:'cybercapture'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=6){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      const team=room.players.size%2===0?'red':'blue';
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size,team));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'cybercapture'});emitLobby(room);
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
        mouseX:Number(inp.mouseX)||W/2,mouseY:Number(inp.mouseY)||H/2};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
