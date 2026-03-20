/**
 * GAME 10: REACTION RACE
 * Shows a random color/shape on screen. Players must press the matching key.
 * First to hit correct key scores a point. 10 rounds, fastest wins.
 * Pure async competitive — no canvas needed.
 * Namespace: /reactionrace
 */

const {startCountdown,makeBaseRoom}=require('./_shared');

const PROMPTS=[
  {label:'RED',   key:'r',color:'#FF2D55'},
  {label:'BLUE',  key:'b',color:'#00F5FF'},
  {label:'GREEN', key:'g',color:'#39FF14'},
  {label:'YELLOW',key:'y',color:'#FFD700'},
  {label:'PURPLE',key:'p',color:'#BF5FFF'},
  {label:'ORANGE',key:'o',color:'#FF9500'},
];
const ROUNDS=10;

module.exports=function(io,COLORS,generateCode,recordWin){
  const ns=io.of('/reactionrace');
  const rooms=new Map();

  function makeRoom(code){
    return{...makeBaseRoom(code),players:new Map(),round:0,currentPrompt:null,promptActive:false,roundTimer:null,scores:new Map()};
  }
  function makePlayer(id,username,ci){return{id,username,color:COLORS[ci%8],score:0,reactionTimes:[]};}

  function nextRound(room){
    room.round++;
    if(room.round>ROUNDS){endGame(room);return;}
    // Random delay 1-3 seconds before showing prompt
    const delay=1000+Math.random()*2000;
    setTimeout(()=>{
      if(room.state!=='playing')return;
      const p=PROMPTS[Math.floor(Math.random()*PROMPTS.length)];
      room.currentPrompt=p; room.promptActive=true; room.promptTime=Date.now();
      ns.to(room.code).emit('showPrompt',{label:p.label,color:p.color,round:room.round,total:ROUNDS});
      // Auto-advance after 3s if no one answers
      room.roundTimer=setTimeout(()=>{
        if(!room.promptActive)return;
        room.promptActive=false;
        ns.to(room.code).emit('roundResult',{correct:null,scores:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color,score:p.score}))});
        setTimeout(()=>nextRound(room),1200);
      },3000);
    },delay);
    ns.to(room.code).emit('roundPending',{round:room.round,total:ROUNDS});
  }

  function endGame(room){
    room.state='ended';
    const results=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({rank:i+1,...p,avgReaction:p.reactionTimes.length?Math.round(p.reactionTimes.reduce((s,v)=>s+v,0)/p.reactionTimes.length):null}));
    const winner=results[0];
    if(winner)recordWin(winner.username,winner.color,'Reaction Race',winner.score*100);
    ns.to(room.code).emit('gameOver',{winner:winner||null,results});
  }

  function startGame(room){
    room.state='playing';room.round=0;
    for(const[,p] of room.players){p.score=0;p.reactionTimes=[];}
    ns.to(room.code).emit('gameStart',{rounds:ROUNDS,prompts:PROMPTS.map(p=>({label:p.label,key:p.key,color:p.color}))});
    setTimeout(()=>nextRound(room),1500);
  }

  function emitLobby(room){ns.to(room.code).emit('lobbyUpdate',{players:[...room.players.values()].map(p=>({id:p.id,username:p.username,color:p.color})),hostId:room.hostId,code:room.code});}

  ns.on('connection',socket=>{
    socket.on('createRoom',({username})=>{
      if(!username)return;
      let code;do{code=generateCode();}while(rooms.has(code));
      const room=makeRoom(code);room.hostId=socket.id;rooms.set(code,room);
      socket.join(code);socket.roomCode=code;
      room.players.set(socket.id,makePlayer(socket.id,username,0));
      socket.emit('roomCreated',{code,isHost:true,game:'reactionrace'});emitLobby(room);
    });
    socket.on('joinRoom',({username,code})=>{
      const room=rooms.get(code?.toUpperCase());
      if(!room||room.state!=='lobby'){socket.emit('error','Not available');return;}
      if(room.players.size>=8){socket.emit('error','Full!');return;}
      socket.join(room.code);socket.roomCode=room.code;
      room.players.set(socket.id,makePlayer(socket.id,username,room.players.size));
      socket.emit('roomJoined',{code:room.code,isHost:false,game:'reactionrace'});emitLobby(room);
    });
    socket.on('startGame',()=>{
      const room=rooms.get(socket.roomCode);
      if(!room||room.hostId!==socket.id||room.players.size<2)return;
      startCountdown(ns,room,()=>startGame(room));
    });
    socket.on('pressKey',({key})=>{
      const room=rooms.get(socket.roomCode);
      if(!room||!room.promptActive||room.state!=='playing')return;
      const p=room.players.get(socket.id);if(!p)return;
      const correct=room.currentPrompt.key===key?.toLowerCase();
      if(correct){
        clearTimeout(room.roundTimer);
        room.promptActive=false;
        const rt=Date.now()-room.promptTime;
        p.score+=Math.max(1,Math.round(1000/rt*10)); // Faster = more points
        p.reactionTimes.push(rt);
        ns.to(room.code).emit('roundResult',{correct:p.id,winner:p.username,reactionMs:rt,scores:[...room.players.values()].map(q=>({id:q.id,username:q.username,color:q.color,score:q.score}))});
        setTimeout(()=>nextRound(room),1500);
      } else {
        p.score=Math.max(0,p.score-2);
        socket.emit('wrongKey',{yourScore:p.score});
      }
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.roomCode);if(!room)return;
      room.players.delete(socket.id);
      if(room.players.size===0){rooms.delete(room.code);}
      else{if(room.hostId===socket.id)room.hostId=room.players.keys().next().value;emitLobby(room);}
    });
  });
};
