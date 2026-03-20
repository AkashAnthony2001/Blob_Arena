/**
 * GAME 6: TOWER SIEGE
 * 1v1 or 2v2. Players have 3 towers (left, center, right).
 * Spend mana to cast spells + deploy troops. Destroy 2+ towers to win.
 * Namespace: /towersiege
 */

const W=900,H=600;
const TICK=33, GAME_DURATION=150;
const MANA_MAX=10, MANA_REGEN=0.035;
const {dist,randInt,startCountdown,makeBaseRoom}=require('./_shared');

const TOWER_POSITIONS={
  left: [{x:100,y:150},{x:100,y:300},{x:100,y:450}],
  right:[{x:800,y:150},{x:800,y:300},{x:800,y:450}]
};

const CARDS={
  knight:{cost:3,hp:120,dmg:18,spd:1.3,range:22,r:15,color:'#39FF14',label:'KNIGHT'},
  dragon:{cost:5,hp:80, dmg:35,spd:1.0,range:90,r:17,color:'#FF2D55',label:'DRAGON'},
  golem: {cost:8,hp:400,dmg:30,spd:0.4,range:25,r:24,color:'#FFD700',label:'GOLEM'},
  archer:{cost:2,hp:40, dmg:22,spd:1.1,range:80,r:12,color:'#00F5FF',label:'ARCHER'},
  bomb:  {cost:3,hp:35, dmg:90,spd:1.5,range:30,r:12,color:'#FF9500',label:'BOMBER'},
  fireball:{cost:4,hp:1,dmg:120,spd:3.0,range:1,r:20,color:'#FF4444',label:'FIREBALL',spell:true},
};

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/towersiege');
  const rooms=new Map();

  function makeTowers(side){
    return TOWER_POSITIONS[side].map((pos,i)=>({...pos,hp:500,maxHp:500,id:`${side}_${i}`,side,alive:true}));
  }

  function makeRoom(code){
    return {...makeBaseRoom(code),
      units:[],projectiles:[],effects:[],timeLeft:GAME_DURATION,
      towers:{left:makeTowers('left'),right:makeTowers('right')}
    };
  }

  function makePlayer(id,username,ci,side){
    return {id,username,color:COLORS[ci%8],side,mana:5,score:0};
  }

  function tick(room){
    if(room.state!=='playing') return;
    const now=Date.now();

    for(const[,p] of room.players) p.mana=Math.min(MANA_MAX,p.mana+MANA_REGEN);

    // Tower auto-attack units in range
    const allTowers=[...room.towers.left,...room.towers.right].filter(t=>t.alive);
    const aliveUnits=room.units.filter(u=>u.alive);
    for(const tower of allTowers){
      if(!tower.atkTimer) tower.atkTimer=0;
      tower.atkTimer++;
      const range=100, atkRate=60;
      if(tower.atkTimer>=atkRate){
        tower.atkTimer=0;
        const enemies=aliveUnits.filter(u=>u.side!==tower.side);
        let best=null,bd=Infinity;
        for(const e of enemies){const d=dist(tower.x,tower.y,e.x,e.y);if(d<bd){bd=d;best=e;}}
        if(best&&bd<range){
          best.currentHp-=25;
          room.projectiles.push({id:Math.random(),sx:tower.x,sy:tower.y,tx:best.x,ty:best.y,color:'#FFD700',life:10});
          if(best.currentHp<=0) best.alive=false;
        }
      }
    }

    // Unit AI
    for(const u of aliveUnits){
      const enemies=aliveUnits.filter(e=>e.side!==u.side);
      const enemyTowers=allTowers.filter(t=>t.side!==u.side);
      // Find closest enemy or tower
      let target=null,td=Infinity;
      for(const e of [...enemies,...enemyTowers]){
        const d=dist(u.x,u.y,e.x,e.y);
        if(d<td){td=d;target=e;}
      }
      if(!u.atkTimer) u.atkTimer=0;
      if(target&&td<(u.range||25)){
        u.atkTimer++;
        if(u.atkTimer>=(u.atkRate||70)){
          u.atkTimer=0;
          target.currentHp-=u.dmg;
          room.effects.push({x:target.x,y:target.y,t:now,color:u.color});
          if(target.currentHp<=0){
            target.alive=false;
            const owner=room.players.get(u.ownerId);
            if(owner) owner.score+=20;
          }
          if(u.range>30) room.projectiles.push({id:Math.random(),sx:u.x,sy:u.y,tx:target.x,ty:target.y,color:u.color,life:8});
        }
      } else {
        // March to nearest enemy tower
        let nearest=null,nd=Infinity;
        for(const t of enemyTowers){const d=dist(u.x,u.y,t.x,t.y);if(d<nd){nd=d;nearest=t;}}
        if(nearest){
          const a=Math.atan2(nearest.y-u.y,nearest.x-u.x);
          u.x+=Math.cos(a)*u.spd; u.y+=Math.sin(a)*u.spd;
        }
        u.atkTimer=Math.max(0,u.atkTimer-1);
      }
    }

    room.units=room.units.filter(u=>u.alive);
    room.towers.left=room.towers.left.filter(t=>t.alive);
    room.towers.right=room.towers.right.filter(t=>t.alive);
    room.projectiles=room.projectiles.filter(p=>{p.life--;return p.life>0;});
    room.effects=room.effects.filter(e=>now-e.t<500);

    // Win check
    const leftTowers=room.towers.left.length, rightTowers=room.towers.right.length;
    const destroyed={left:3-leftTowers,right:3-rightTowers};
    if(destroyed.left>=2||destroyed.right>=2||room.timeLeft<=0){
      const winSide=destroyed.left>destroyed.right?'right':destroyed.right>destroyed.left?'left':null;
      endGame(room,winSide); return;
    }

    room.timeLeft-=TICK/1000;
    ns.to(room.code).emit('gameState',{
      units:room.units.map(u=>({id:u.id,x:u.x,y:u.y,type:u.type,side:u.side,
        hpRatio:u.currentHp/u.hp,color:u.color})),
      towers:{left:room.towers.left,right:room.towers.right},
      projectiles:room.projectiles,effects:room.effects,
      timeLeft:Math.ceil(room.timeLeft),
      players:[...room.players.values()].map(p=>({id:p.id,mana:p.mana,score:p.score,side:p.side,username:p.username,color:p.color}))
    });
  }

  function endGame(room,winSide){
    clearInterval(room.tickInterval); room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p,won:p.side===winSide}));
    const winner=[...room.players.values()].find(p=>p.side===winSide);
    if(winner) recordWin(winner.username,winner.color,'Tower Siege',winner.score);
    ns.to(room.code).emit('gameOver',{winSide,results});
  }

  function startGame(room){
    room.state='playing'; room.timeLeft=GAME_DURATION;
    room.units=[]; room.projectiles=[]; room.effects=[];
    room.towers={left:makeTowers('left'),right:makeTowers('right')};
    let ci=0;
    [...room.players.keys()].forEach((id,i)=>{
      const p=room.players.get(id);
      const side=i<Math.ceil(room.players.size/2)?'left':'right';
      room.players.set(id,makePlayer(id,p.username,ci++,side));
    });
    ns.to(room.code).emit('gameStart',{
      cards:CARDS,duration:GAME_DURATION,towers:room.towers,
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,side:p.side}))
    });
    room.tickInterval=setInterval(()=>tick(room),TICK);
  }

  function emitLobby(room){
    ns.to(room.code).emit('lobbyUpdate',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),
      hostId:room.hostId,code:room.code
    });
  }

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0,'left'));
      socket.emit('roomCreated',{code,isHost:true,game:'towersiege'});
      emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Room not found or in progress!');return;}
      if(room.players.size>=4){socket.emit('error','Room full!');return;}
      socket.join(room.code); socket.roomCode=room.code;
      const ci=room.players.size;
      const side=ci<2?'left':'right';
      room.players.set(socket.id,makePlayer(socket.id,username,ci,side));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'towersiege'});
      emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2) return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('playCard',({card,lane})=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id); if(!p) return;
      const def=CARDS[card]; if(!def||p.mana<def.cost) return;
      p.mana-=def.cost;
      const laneY=[150,300,450][Math.min(2,Math.max(0,lane|0))];
      const sx=p.side==='left'?130:770, dir=p.side==='left'?1:-1;
      if(def.spell){
        // Spell = instant damage to area
        const targets=room.units.filter(u=>u.side!==p.side&&dist(u.x,u.y,sx,laneY)<80);
        targets.forEach(t=>{t.currentHp-=def.dmg;if(t.currentHp<=0){t.alive=false;p.score+=15;}});
        room.effects.push({x:sx,y:laneY,t:Date.now(),type:'explosion',color:def.color,big:true});
      } else {
        room.units.push({id:Date.now()+Math.random(),ownerId:p.id,ownerColor:p.color,side:p.side,
          type:card,...def,x:sx,y:laneY+randInt(-15,15),dir,currentHp:def.hp,atkTimer:0,alive:true});
      }
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value; emitLobby(room);}
    });
  });
};
