/**
 * GAME 5: LANE CLASH
 * Clash Royale-inspired 1v1 (or 2v2) lane battle.
 * Players spend energy to spawn units; units march toward enemy base.
 * Destroy the enemy base (tower) to win. 2-minute rounds.
 * Namespace: /laneclash
 */

const W=800,H=600;
const BASE_HP=1000, ENERGY_MAX=10, ENERGY_REGEN=0.04; // per tick at 30fps
const TICK=33, GAME_DURATION=120;
const LANE_Y=[150,300,450]; // 3 lanes

const UNIT_TYPES={
  grunt:  {cost:2,hp:60, dmg:12,spd:1.2,r:14,color:'#39FF14',range:24,label:'GRUNT',  atkRate:60,reward:10},
  archer: {cost:3,hp:40, dmg:20,spd:0.8,r:12,color:'#00F5FF',range:80,label:'ARCHER', atkRate:80,reward:15},
  tank:   {cost:5,hp:200,dmg:25,spd:0.5,r:20,color:'#FF9500',range:26,label:'TANK',   atkRate:90,reward:30},
  bomb:   {cost:4,hp:30, dmg:80,spd:1.0,r:13,color:'#FF2D55',range:35,label:'BOMBER', atkRate:70,reward:20},
  healer: {cost:3,hp:80, dmg:0, spd:0.9,r:13,color:'#BF5FFF',range:60,label:'HEALER', atkRate:60,reward:15,heals:true},
  wizard: {cost:6,hp:70, dmg:40,spd:0.7,r:16,color:'#FFD700',range:100,label:'WIZARD', atkRate:100,reward:40},
};

const {dist,randInt,startCountdown,makeBaseRoom}=require('./_shared');

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/laneclash');
  const rooms=new Map();

  function makeRoom(code){
    return {...makeBaseRoom(code),
      units:[],projectiles:[],timeLeft:GAME_DURATION,
      bases:{left:{hp:BASE_HP,maxHp:BASE_HP},right:{hp:BASE_HP,maxHp:BASE_HP}},
      effects:[]
    };
  }

  function makePlayer(id,username,ci,side){
    return {id,username,color:COLORS[ci%8],side,
      energy:5,score:0,unitsSent:0,
      input:{lane:0,unit:'grunt',deploy:false}};
  }

  function tick(room){
    if(room.state!=='playing') return;
    const now=Date.now();

    // Regen energy
    for(const[,p] of room.players){
      p.energy=Math.min(ENERGY_MAX,p.energy+ENERGY_REGEN);
    }

    // Deploy units from input
    for(const[,p] of room.players){
      if(p.input.deploy && p.input.unit && UNIT_TYPES[p.input.unit]){
        const def=UNIT_TYPES[p.input.unit];
        if(p.energy>=def.cost){
          p.energy-=def.cost; p.unitsSent++;
          const lane=LANE_Y[Math.min(2,Math.max(0,p.input.lane))];
          const sx=p.side==='left'?80:W-80, dir=p.side==='left'?1:-1;
          room.units.push({
            id:now+Math.random(),ownerId:p.id,ownerColor:p.color,side:p.side,
            type:p.input.unit,...def,
            x:sx,y:lane+randInt(-8,8),dir,
            currentHp:def.hp,atkTimer:0,alive:true
          });
          p.input.deploy=false;
          ns.to(room.code).emit('unitSpawned',{side:p.side,type:p.input.unit,lane:LANE_Y.indexOf(lane)});
        }
      }
    }

    // Move & attack units
    const alive=room.units.filter(u=>u.alive);
    for(const u of alive){
      // Find nearest enemy
      const enemies=alive.filter(e=>e.side!==u.side);
      const baseX=u.dir>0?W-60:60;
      let target=null, td=Infinity;
      for(const e of enemies){
        const d=dist(u.x,u.y,e.x,e.y);
        if(d<td){td=d;target=e;}
      }

      if(target && td<u.range){
        // Attack
        u.atkTimer++;
        if(u.atkTimer>=u.atkRate){
          u.atkTimer=0;
          if(u.heals){
            // Healer heals nearest friendly instead
            const friends=alive.filter(f=>f.side===u.side&&f!==u);
            let hbest=null,hd=Infinity;
            for(const f of friends){const d=dist(u.x,u.y,f.x,f.y);if(d<hd){hd=d;hbest=f;}}
            if(hbest) hbest.currentHp=Math.min(hbest.hp,hbest.currentHp+20);
          } else {
            target.currentHp-=u.dmg;
            room.effects.push({x:target.x,y:target.y,t:now,type:'hit',color:u.color});
            if(target.currentHp<=0){
              target.alive=false;
              const owner=room.players.get(u.ownerId);
              if(owner) owner.score+=UNIT_TYPES[target.type].reward;
            }
          }
          // Ranged projectile visual
          if(u.range>30) room.projectiles.push({id:Math.random(),sx:u.x,sy:u.y,tx:target.x,ty:target.y,color:u.color,life:8});
        }
      } else {
        // March toward enemy base
        u.x+=u.dir*u.spd;
        u.atkTimer=Math.max(0,u.atkTimer-1);
        // Reached enemy base?
        if((u.dir>0&&u.x>W-80)||(u.dir<0&&u.x<80)){
          const side=u.dir>0?'right':'left';
          room.bases[side].hp-=u.dmg*2;
          u.alive=false;
          room.effects.push({x:baseX,y:H/2,t:now,type:'explosion',color:u.color});
        }
      }
    }

    room.units=room.units.filter(u=>u.alive);
    room.projectiles=room.projectiles.filter(p=>{p.life--;return p.life>0;});
    room.effects=room.effects.filter(e=>now-e.t<600);

    // Check win
    if(room.bases.left.hp<=0||room.bases.right.hp<=0){
      const winner=room.bases.left.hp>0?'left':'right';
      endGame(room,winner); return;
    }
    room.timeLeft-=TICK/1000;
    if(room.timeLeft<=0){
      const winner=room.bases.left.hp>room.bases.right.hp?'left':'right';
      endGame(room,winner); return;
    }

    ns.to(room.code).emit('gameState',{
      units:room.units.map(u=>({id:u.id,x:u.x,y:u.y,type:u.type,side:u.side,
        hpRatio:u.currentHp/u.hp,ownerColor:u.ownerColor})),
      bases:room.bases,
      projectiles:room.projectiles,
      effects:room.effects,
      timeLeft:Math.ceil(room.timeLeft),
      players:[...room.players.values()].map(p=>({id:p.id,energy:Math.floor(p.energy*10)/10,
        score:p.score,side:p.side,username:p.username,color:p.color}))
    });
  }

  function endGame(room,winSide){
    clearInterval(room.tickInterval); room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({
      rank:i+1,...p,won:p.side===winSide
    }));
    const winner=[...room.players.values()].find(p=>p.side===winSide);
    if(winner) recordWin(winner.username,winner.color,'Lane Clash',winner.score);
    ns.to(room.code).emit('gameOver',{winSide,results,bases:room.bases});
  }

  function startGame(room){
    room.state='playing'; room.timeLeft=GAME_DURATION;
    room.units=[]; room.projectiles=[]; room.effects=[];
    room.bases={left:{hp:BASE_HP,maxHp:BASE_HP},right:{hp:BASE_HP,maxHp:BASE_HP}};
    let ci=0; const sides=['left','left','right','right','left','right'];
    const playerArr=[...room.players.keys()];
    playerArr.forEach((id,i)=>{
      const p=room.players.get(id);
      const side=i<Math.ceil(playerArr.length/2)?'left':'right';
      room.players.set(id,makePlayer(id,p.username,ci++,side));
    });
    ns.to(room.code).emit('gameStart',{unitTypes:UNIT_TYPES,laneY:LANE_Y,duration:GAME_DURATION,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,side:p.side}))});
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username||username.length>16) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0,'left'));
      socket.emit('roomCreated',{code,isHost:true,game:'laneclash'});
      emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room){socket.emit('error','Room not found!');return;}
      if(room.state!=='lobby'){socket.emit('error','Game in progress!');return;}
      if(room.players.size>=4){socket.emit('error','Room full!');return;}
      socket.join(room.code); socket.roomCode=room.code;
      const ci=room.players.size;
      const side=ci<2?'left':'right';
      room.players.set(socket.id,makePlayer(socket.id,username,ci,side));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'laneclash'});
      emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2) return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('deployUnit',({unit,lane})=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id); if(!p) return;
      p.input={unit,lane:Math.min(2,Math.max(0,lane|0)),deploy:true};
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value; emitLobby(room);}
    });
  });

  function emitLobby(room){
    ns.to(room.code).emit('lobbyUpdate',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,side:p.side})),
      hostId:room.hostId,code:room.code
    });
  }
};
