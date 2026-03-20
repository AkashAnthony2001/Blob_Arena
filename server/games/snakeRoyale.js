/**
 * GAME 2: SNAKE ROYALE
 * Classic snake but multiplayer! Eat food to grow, avoid walls and other snakes.
 * Eat other snakes' tails to eliminate them. Last snake alive wins!
 * Namespace: /snake
 */

const GRID = 20;           // grid cell size in pixels
const COLS = 40;           // grid columns  (800px)
const ROWS = 30;           // grid rows     (600px)
const TICK_RATE = 150;     // ms per move step
const GAME_DURATION = 120; // seconds
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const FOOD_COUNT = 6;      // food items on board at once
const GOLDEN_FOOD_CHANCE = 0.15; // 15% chance of golden food (worth 3)

module.exports = function(io, COLORS, generateCode, recordWin) {
  const ns = io.of('/snake');
  const rooms = new Map();

  function rndCell() {
    return { x: Math.floor(Math.random()*COLS), y: Math.floor(Math.random()*ROWS) };
  }

  function makeRoom(code) {
    return { code, players: new Map(), food: [], state: 'lobby',
      timeLeft: GAME_DURATION, tickInterval: null, hostId: null, countdownTimer: null };
  }

  function spawnSnake(id, username, ci) {
    // Place snakes at corners/edges
    const starts = [
      {x:2,y:2,dir:{x:1,y:0}}, {x:37,y:2,dir:{x:-1,y:0}},
      {x:2,y:27,dir:{x:1,y:0}}, {x:37,y:27,dir:{x:-1,y:0}},
      {x:20,y:2,dir:{x:0,y:1}}, {x:20,y:27,dir:{x:0,y:-1}},
    ];
    const s = starts[ci % starts.length];
    const body = [];
    for (let i = 0; i < 4; i++) {
      body.push({ x: s.x - s.dir.x*i, y: s.y - s.dir.y*i });
    }
    return { id, username, color: COLORS[ci%COLORS.length],
      body, dir: s.dir, nextDir: s.dir,
      alive: true, score: 0, kills: 0, length: 4,
      boosting: false, boostCooldown: 0, invincible: 0 };
  }

  function spawnFood(room) {
    const occupied = new Set();
    for (const [,p] of room.players) p.body.forEach(c => occupied.add(`${c.x},${c.y}`));
    room.food.forEach(f => occupied.add(`${f.x},${f.y}`));
    let attempts = 0;
    while (room.food.length < FOOD_COUNT && attempts < 200) {
      const c = rndCell();
      if (!occupied.has(`${c.x},${c.y}`)) {
        const golden = Math.random() < GOLDEN_FOOD_CHANCE;
        room.food.push({ x:c.x, y:c.y, golden, value: golden?3:1,
          id: Date.now()+Math.random() });
        occupied.add(`${c.x},${c.y}`);
      }
      attempts++;
    }
  }

  function tick(room) {
    if (room.state !== 'playing') return;
    room.timeLeft -= TICK_RATE / 1000;

    // Move each snake
    for (const [,p] of room.players) {
      if (!p.alive) continue;
      p.dir = p.nextDir;
      if (p.boostCooldown > 0) p.boostCooldown--;
      if (p.invincible > 0) p.invincible--;

      const head = { x: p.body[0].x + p.dir.x, y: p.body[0].y + p.dir.y };

      // Wall wrap (toroidal)
      head.x = (head.x + COLS) % COLS;
      head.y = (head.y + ROWS) % ROWS;

      p.body.unshift(head);

      // Check food
      const fi = room.food.findIndex(f => f.x===head.x && f.y===head.y);
      if (fi !== -1) {
        const food = room.food.splice(fi, 1)[0];
        p.score += food.value * 10;
        p.length += food.value;
        // Don't remove tail if ate food (grow)
        for (let v = 0; v < food.value - 1; v++) {
          p.body.push({ ...p.body[p.body.length-1] });
        }
      } else {
        p.body.pop(); // Remove tail
      }
    }

    // Collision detection (after all moved)
    for (const [,p] of room.players) {
      if (!p.alive || p.invincible > 0) continue;

      const head = p.body[0];
      let died = false;
      let killerId = null;

      // Self collision (skip first 3 segments)
      for (let i = 3; i < p.body.length; i++) {
        if (p.body[i].x === head.x && p.body[i].y === head.y) { died=true; break; }
      }

      // Other snake collisions
      if (!died) {
        for (const [,other] of room.players) {
          if (other.id === p.id || !other.alive) continue;
          // Head on head - smaller dies (or both if equal)
          if (other.body[0].x===head.x && other.body[0].y===head.y) {
            if (p.length <= other.length) { died=true; killerId=other.id; }
            if (other.length <= p.length) {
              other.alive = false;
              p.kills++; p.score += 200;
              ns.to(room.code).emit('snakeDied',{deadId:other.id,deadName:other.username,
                killerId:p.id,killerName:p.username});
            }
            break;
          }
          // Hit other snake body (skip head)
          for (let i = 1; i < other.body.length; i++) {
            if (other.body[i].x===head.x && other.body[i].y===head.y) {
              died=true; killerId=other.id;
              other.kills++; other.score+=150;
              // Drop food at collision point
              room.food.push({x:head.x,y:head.y,golden:false,value:1,id:Date.now()});
              break;
            }
          }
          if (died) break;
        }
      }

      if (died) {
        p.alive = false;
        const killer = killerId ? room.players.get(killerId) : null;
        ns.to(room.code).emit('snakeDied',{deadId:p.id,deadName:p.username,
          killerId:killerId||null,killerName:killer?killer.username:'wall'});
        // Drop half the body as food
        for (let i=0; i<p.body.length; i+=3) {
          room.food.push({x:p.body[i].x,y:p.body[i].y,golden:false,value:1,id:Date.now()+i});
        }
      }
    }

    // Refill food
    spawnFood(room);

    // Win check
    const alive = [...room.players.values()].filter(p=>p.alive);
    if (alive.length<=1 && room.players.size>=MIN_PLAYERS) {
      endGame(room, alive[0]||null); return;
    }
    if (room.timeLeft <= 0) {
      const sorted = [...room.players.values()].sort((a,b)=>b.score-a.score);
      endGame(room, sorted[0]||null); return;
    }

    // Broadcast state
    ns.to(room.code).emit('gameState', {
      players: [...room.players.values()].map(p=>({
        id:p.id,username:p.username,color:p.color,
        body:p.body,alive:p.alive,score:p.score,kills:p.kills,length:p.body.length
      })),
      food: room.food,
      timeLeft: Math.ceil(room.timeLeft)
    });
  }

  function endGame(room, winner) {
    clearInterval(room.tickInterval);
    room.state = 'ended';
    const results = [...room.players.values()].sort((a,b)=>b.score-a.score)
      .map((p,i)=>({rank:i+1,id:p.id,username:p.username,color:p.color,
        score:p.score,kills:p.kills,length:p.body.length}));
    if (winner) recordWin(winner.username, winner.color, 'Snake Royale', winner.score);
    ns.to(room.code).emit('gameOver',{winner:winner?{id:winner.id,username:winner.username,color:winner.color}:null,results});
  }

  function startGame(room) {
    room.state = 'playing'; room.timeLeft = GAME_DURATION;
    room.food = [];
    let ci = 0;
    for (const [id,p] of room.players) room.players.set(id, spawnSnake(id, p.username, ci++));
    spawnFood(room);
    ns.to(room.code).emit('gameStart',{
      grid:{cols:COLS,rows:ROWS,cellSize:GRID},
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,body:p.body,dir:p.dir})),
      food:room.food, duration:GAME_DURATION
    });
    room.tickInterval = setInterval(()=>tick(room), TICK_RATE);
  }

  function countdown(room) {
    room.state='countdown'; let n=3;
    ns.to(room.code).emit('countdown',n);
    const cd=setInterval(()=>{ n--;
      if(n<=0){clearInterval(cd);startGame(room);}
      else ns.to(room.code).emit('countdown',n);
    },1000);
  }

  function emitLobby(room) {
    ns.to(room.code).emit('lobbyUpdate',{
      players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),
      hostId:room.hostId, code:room.code, game:'snake'
    });
  }

  ns.on('connection',(socket)=>{
    socket.on('createRoom',({username})=>{
      if(!username||username.length>16) return;
      let code; do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code); room.hostId=socket.id; rooms.set(code,room);
      socket.join(code); socket.roomCode=code;
      room.players.set(socket.id,spawnSnake(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'snake'});
      emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room){socket.emit('error','Room not found!');return;}
      if(room.state!=='lobby'){socket.emit('error','Game in progress!');return;}
      if(room.players.size>=MAX_PLAYERS){socket.emit('error','Room full!');return;}
      socket.join(room.code); socket.roomCode=room.code;
      const ci=room.players.size;
      room.players.set(socket.id,spawnSnake(socket.id,username,ci));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'snake'});
      emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id) return;
      if(room.players.size<MIN_PLAYERS){socket.emit('error',`Need ${MIN_PLAYERS}+ players`);return;}
      countdown(room);
    });
    socket.on('input',({dir})=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.state!=='playing') return;
      const p=room.players.get(socket.id);
      if(!p||!p.alive) return;
      const dirs={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
      const nd=dirs[dir];
      if(!nd) return;
      // Prevent 180 turn
      if(nd.x===-p.dir.x&&nd.y===-p.dir.y) return;
      p.nextDir=nd;
    });
    socket.on('chatMessage',({msg})=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      const p=room.players.get(socket.id); if(!p) return;
      ns.to(room.code).emit('chatMessage',{username:p.username,color:p.color,msg:String(msg).slice(0,80).replace(/</g,'&lt;')});
    });
    socket.on('restartGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.state!=='ended') return;
      room.state='lobby'; room.timeLeft=GAME_DURATION; room.food=[];
      let ci=0;
      for(const[id,p] of room.players) room.players.set(id,spawnSnake(id,p.username,ci++));
      ns.to(room.code).emit('gameRestarted',{});
      emitLobby(room);
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode); if(!room) return;
      const p=room.players.get(socket.id);
      room.players.delete(socket.id);
      if(room.players.size===0){clearInterval(room.tickInterval);rooms.delete(room.code);}
      else{
        if(room.hostId===socket.id) room.hostId=room.players.keys().next().value;
        if(room.state==='playing'&&p) p.alive=false;
        emitLobby(room);
      }
    });
  });
};
