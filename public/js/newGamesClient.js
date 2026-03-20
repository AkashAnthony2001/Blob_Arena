/**
 * NEON ARCADE — New Games Client Controller
 * Handles socket events, input routing, and in-game UI
 * for all 20 new multiplayer games.
 *
 * Integrates with arcade.js via:
 *   window.NewGamesClient.connect(game, ns, myId)
 *   window.NewGamesClient.handleInput(game, input)
 *   window.NewGamesClient.getExtraState(game)  → for renderer
 *   window.NewGamesClient.teardown()
 */

window.NewGamesClient = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let _socket = null;
  let _game = null;
  let _myId = null;
  let _gameState = null;

  // Clash-style state
  let _selectedUnit = 'grunt';
  let _selectedLane = 0;
  let _energy = 5;

  // Gravity Wars state
  let _isMyTurn = false;
  let _aimAngle = 0;
  let _aimPower = 60;
  let _gravProjectile = null;
  let _gravProjectileTrail = [];

  // Reaction Race state
  let _currentPrompt = null;

  // Chain Reaction state
  let _chainMyCI = null;
  let _chainCurrentTurnId = null;

  // Infection / KOTH phase state
  let _phase = null;

  // ── DOM helpers ────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function toast(msg, dur=2500) {
    const el=$('toast'); if(!el)return;
    el.textContent=msg; el.classList.remove('hidden');
    clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.add('hidden'),dur);
  }
  function appendChat(msg, color) {
    const container=$('game-chat-msgs');
    if(!container)return;
    const d=document.createElement('div');d.className='chat-msg';
    d.innerHTML=`<span style="color:${color}">${msg}</span>`;
    container.appendChild(d);container.scrollTop=container.scrollHeight;
    while(container.children.length>25)container.removeChild(container.firstChild);
  }

  // ── Overlay injection ──────────────────────────────────────────────────────
  function _removeOverlays() {
    ['_clash-hud','_reaction-overlay','_gravity-panel','_infection-banner','_chain-info'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.remove();
    });
  }

  function _injectClashHUD(game) {
    _removeOverlays();
    const wrapper=$('canvas-wrapper')||$('game-canvas')?.parentElement;
    if(!wrapper)return;

    const unitDefs = {
      grunt:  {cost:2,label:'GRUNT',  color:'#39FF14'},
      archer: {cost:3,label:'ARCHER', color:'#00F5FF'},
      tank:   {cost:5,label:'TANK',   color:'#FF9500'},
      bomb:   {cost:4,label:'BOMBER', color:'#FF2D55'},
      healer: {cost:3,label:'HEALER', color:'#BF5FFF'},
      wizard: {cost:6,label:'WIZARD', color:'#FFD700'},
      // unitrush
      runner: {cost:1,label:'RUNNER', color:'#39FF14'},
      heavy:  {cost:3,label:'HEAVY',  color:'#FF9500'},
      sniper: {cost:2,label:'SNIPER', color:'#00F5FF'},
      swarm:  {cost:2,label:'SWARM',  color:'#FF2D55'},
      // towersiege cards
      knight:   {cost:3,label:'KNIGHT',  color:'#39FF14'},
      dragon:   {cost:5,label:'DRAGON',  color:'#FF2D55'},
      golem:    {cost:8,label:'GOLEM',   color:'#FFD700'},
      fireball: {cost:4,label:'FIREBALL',color:'#FF4444'},
    };

    const unitList = game==='unitrush'
      ? ['runner','heavy','sniper','swarm']
      : game==='towersiege'
        ? ['knight','archer','dragon','golem','bomb','fireball']
        : ['grunt','archer','tank','bomb','healer','wizard'];

    const hud = document.createElement('div');
    hud.id='_clash-hud'; hud.className='clash-hud';

    // Unit cards
    unitList.forEach(uid=>{
      const def=unitDefs[uid]||{cost:2,label:uid.toUpperCase(),color:'#fff'};
      const btn=document.createElement('div');
      btn.className='card-btn'+(uid===_selectedUnit?' active':'');
      btn.dataset.unit=uid;
      btn.innerHTML=`<span class="card-cost">${def.cost}</span><span class="card-name" style="color:${def.color}">${def.label}</span>`;
      btn.onclick=()=>{
        _selectedUnit=uid;
        wrapper.querySelectorAll('.card-btn').forEach(b=>b.classList.toggle('active',b.dataset.unit===uid));
      };
      hud.appendChild(btn);
    });

    // Energy pips
    const epCont=document.createElement('div');
    epCont.className='energy-bar-container';epCont.id='_energy-pips';
    for(let i=0;i<10;i++){const pip=document.createElement('div');pip.className='energy-pip';epCont.appendChild(pip);}
    hud.appendChild(epCont);

    // Lane buttons
    const laneCont=document.createElement('div');laneCont.className='lane-btns';
    ['TOP','MID','BOT'].forEach((name,i)=>{
      const btn=document.createElement('button');
      btn.className='lane-btn'+(i===_selectedLane?' selected':'');
      btn.dataset.lane=i; btn.textContent=name;
      btn.onclick=()=>{
        _selectedLane=i;
        wrapper.querySelectorAll('.lane-btn').forEach(b=>b.classList.toggle('selected',b.dataset.lane==i));
      };
      laneCont.appendChild(btn);
    });
    hud.appendChild(laneCont);

    // Deploy button
    const deployBtn=document.createElement('button');
    deployBtn.className='btn btn-primary'; deployBtn.style='margin-left:8px;min-width:70px;font-size:11px';
    deployBtn.textContent='DEPLOY'; deployBtn.id='_deploy-btn';
    deployBtn.onclick=()=>_deployUnit();
    hud.appendChild(deployBtn);

    wrapper.style.position='relative';
    wrapper.appendChild(hud);
  }

  function _updateEnergyPips(energy) {
    const cont=document.getElementById('_energy-pips');
    if(!cont)return;
    const pips=cont.querySelectorAll('.energy-pip');
    pips.forEach((p,i)=>p.classList.toggle('filled',i<Math.floor(energy)));
  }

  function _deployUnit() {
    if(!_socket||_game===null)return;
    const evt = _game==='laneclash'?'deployUnit':_game==='towersiege'?'playCard':'sendUnit';
    if(_game==='towersiege'){
      _socket.emit('playCard',{card:_selectedUnit,lane:_selectedLane});
    } else {
      _socket.emit(evt,{unit:_selectedUnit,type:_selectedUnit,lane:_selectedLane});
    }
  }

  function _injectReactionOverlay() {
    _removeOverlays();
    const wrapper=$('canvas-wrapper')||$('game-canvas')?.parentElement;
    if(!wrapper)return;
    const ov=document.createElement('div');
    ov.id='_reaction-overlay';ov.className='reaction-overlay';
    ov.innerHTML='<div id="_reaction-prompt-box" style="display:none"></div><div id="_reaction-key-hint" class="reaction-key-hint"></div>';
    wrapper.appendChild(ov);
  }

  function _showReactionPrompt(label,color,key) {
    _currentPrompt={label,color,key};
    const box=document.getElementById('_reaction-prompt-box');
    const hint=document.getElementById('_reaction-key-hint');
    if(box){
      box.className='reaction-prompt';
      box.style.color=color;box.style.borderColor=color;
      box.style.textShadow=`0 0 30px ${color}`;
      box.textContent=label;box.style.display='block';
    }
    if(hint)hint.textContent=`Press: ${key.toUpperCase()}`;
  }

  function _hideReactionPrompt(winner, rt) {
    _currentPrompt=null;
    const box=document.getElementById('_reaction-prompt-box');
    const hint=document.getElementById('_reaction-key-hint');
    if(box)box.style.display='none';
    if(hint)hint.textContent=winner?`${winner} — ${rt}ms!`:'No one answered!';
  }

  function _injectGravityPanel() {
    _removeOverlays();
    const wrapper=$('canvas-wrapper')||$('game-canvas')?.parentElement;
    if(!wrapper)return;
    const panel=document.createElement('div');
    panel.id='_gravity-panel';panel.className='gravity-aim-panel';
    panel.innerHTML=`
      <div style="margin-bottom:6px;letter-spacing:2px">🎯 YOUR TURN</div>
      <label>ANGLE: <span id="_gw-angle-val">0°</span></label><br>
      <input type="range" min="-180" max="180" value="0" step="1" class="power-slider" id="_gw-angle">
      <label>POWER: <span id="_gw-power-val">60</span></label><br>
      <input type="range" min="10" max="100" value="60" step="1" class="power-slider" id="_gw-power">
      <button class="fire-btn" id="_gw-fire">🔥 FIRE</button>
    `;
    wrapper.style.position='relative';
    wrapper.appendChild(panel);

    const angleSlider=document.getElementById('_gw-angle');
    const powerSlider=document.getElementById('_gw-power');
    const angleVal=document.getElementById('_gw-angle-val');
    const powerVal=document.getElementById('_gw-power-val');

    const update=()=>{
      _aimAngle=(Number(angleSlider.value)/180)*Math.PI;
      _aimPower=Number(powerSlider.value);
      angleVal.textContent=`${angleSlider.value}°`;
      powerVal.textContent=powerSlider.value;
      if(_socket)_socket.emit('aimUpdate',{angle:_aimAngle,power:_aimPower});
    };
    angleSlider.oninput=update;
    powerSlider.oninput=update;
    document.getElementById('_gw-fire').onclick=()=>{
      if(_socket)_socket.emit('fire',{angle:_aimAngle,power:_aimPower});
      _setGravityTurn(false);
    };
  }

  function _setGravityTurn(isMyTurn) {
    _isMyTurn=isMyTurn;
    const panel=document.getElementById('_gravity-panel');
    if(panel)panel.classList.toggle('active',isMyTurn);
  }

  // ── Input key mapping ──────────────────────────────────────────────────────
  const KEY_MAP = {
    w:'up',s:'down',a:'left',d:'right',
    arrowup:'up',arrowdown:'down',arrowleft:'left',arrowright:'right',
    ' ':'dash', shift:'chargeBtn',
    r:'r',b:'b',g:'g',y:'y',p:'p',o:'o', // reaction race
    m:'missile', // spaceduel
  };

  const _keyState = {};

  function _handleKeyDown(e) {
    if(!_game)return;
    const k=(e.key||'').toLowerCase();
    _keyState[k]=true;

    // Reaction race: handle color key presses
    if(_game==='reactionrace'&&_currentPrompt){
      if(['r','b','g','y','p','o'].includes(k)){
        if(_socket)_socket.emit('pressKey',{key:k});
        e.preventDefault();
      }
      return;
    }

    // Chain reaction: nothing keyboard-driven (all click-based)
    if(_game==='chainreaction')return;

    // Gravity Wars: nothing keyboard-driven
    if(_game==='gravitywars')return;

    // Clash-style: number keys to select unit
    if(['laneclash','towersiege','unitrush'].includes(_game)){
      const numKeys=['1','2','3','4','5','6'];
      if(numKeys.includes(k)){
        const unitList=_game==='unitrush'?['runner','heavy','sniper','swarm']:
          _game==='towersiege'?['knight','archer','dragon','golem','bomb','fireball']:
          ['grunt','archer','tank','bomb','healer','wizard'];
        const idx=Number(k)-1;
        if(idx<unitList.length){
          _selectedUnit=unitList[idx];
          document.querySelectorAll('.card-btn').forEach(b=>b.classList.toggle('active',b.dataset.unit===_selectedUnit));
        }
      }
      if(k==='q')_selectedLane=0;
      if(k==='e')_selectedLane=1;
      if(k==='z')_selectedLane=2;
      if(k===' '){_deployUnit();e.preventDefault();}
      document.querySelectorAll('.lane-btn').forEach(b=>b.classList.toggle('selected',b.dataset.lane==_selectedLane));
    }
  }

  function _handleKeyUp(e) {
    const k=(e.key||'').toLowerCase();
    _keyState[k]=false;
  }

  function _handleMouseMove(e) {
    if(!_game||!_socket)return;
    const canvas=$('game-canvas');
    if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
    _keyState._mouseX=(e.clientX-rect.left)*scaleX;
    _keyState._mouseY=(e.clientY-rect.top)*scaleY;
  }

  function _handleMouseClick(e) {
    if(!_socket||!_game)return;
    const canvas=$('game-canvas');
    if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height;
    const mx=(e.clientX-rect.left)*scaleX, my=(e.clientY-rect.top)*scaleY;

    // Chain reaction: place orb on click
    if(_game==='chainreaction'){
      if(_chainCurrentTurnId!==_myId)return;
      const W=canvas.width,H=canvas.height;
      const COLS=9,ROWS=6;
      const TW=Math.floor(W/COLS),TH=Math.floor((H-60)/ROWS);
      const col=Math.floor(mx/TW),row=Math.floor((my-30)/TH);
      if(row>=0&&row<ROWS&&col>=0&&col<COLS)_socket.emit('placeOrb',{row,col});
    }

    // Ball blitz: kick
    if(_game==='ballblitz'){ _keyState._kick=true; setTimeout(()=>{_keyState._kick=false;},120); }
  }

  // ── Input polling (for canvas-render-loop games) ───────────────────────────
  function _pollAndSend() {
    if(!_socket||!_game||!_gameState)return;

    const base = {
      up:!!(_keyState.w||_keyState.arrowup),
      down:!!(_keyState.s||_keyState.arrowdown),
      left:!!(_keyState.a||_keyState.arrowleft),
      right:!!(_keyState.d||_keyState.arrowright),
    };

    switch(_game) {
      case 'bullethell':
      case 'lasertag':
      case 'cybercapture':
        _socket.emit('input',{...base,
          shoot:!!(_keyState[' ']||_keyState.mouse),
          mouseX:_keyState._mouseX||400, mouseY:_keyState._mouseY||300});
        break;
      case 'neontanks':
        _socket.emit('input',{...base, shoot:!!(_keyState[' ']||_keyState.f)});
        break;
      case 'spaceduel':
        _socket.emit('input',{
          thrust:!!_keyState.w, left:!!_keyState.a, right:!!_keyState.d,
          shoot:!!(_keyState[' ']||_keyState.f),
          missile:!!(_keyState.m)
        });
        break;
      case 'territory':
      case 'koth':
      case 'infection':
      case 'fallingtiles':
        _socket.emit('input',base);
        break;
      case 'knockout':
        _socket.emit('input',{...base, dash:!!_keyState[' ']});
        break;
      case 'neonsumo':
        _socket.emit('input',{...base, chargeBtn:!!(_keyState[' ']||_keyState.shift)});
        break;
      case 'ballblitz':
        _socket.emit('input',{...base, kick:!!_keyState._kick});
        break;
      case 'blitzcatcher':
        _socket.emit('input',{left:!!(_keyState.a||_keyState.arrowleft),
          right:!!(_keyState.d||_keyState.arrowright),dash:!!_keyState[' ']});
        break;
    }
  }

  let _inputInterval = null;

  // ── Socket connection per game ─────────────────────────────────────────────
  function connect(game, ns, myId) {
    _game=game; _myId=myId; _gameState=null;
    _isMyTurn=false; _currentPrompt=null;
    _chainCurrentTurnId=null; _chainMyCI=null;

    // Attach event listeners
    document.addEventListener('keydown',_handleKeyDown);
    document.addEventListener('keyup',_handleKeyUp);
    const canvas=$('game-canvas');
    if(canvas){canvas.addEventListener('mousemove',_handleMouseMove);canvas.addEventListener('click',_handleMouseClick);}

    // Input polling for real-time games
    const REALTIME=['bullethell','neontanks','lasertag','spaceduel','cybercapture',
      'territory','koth','infection','fallingtiles','knockout','neonsumo','ballblitz','blitzcatcher'];
    if(REALTIME.includes(game)){
      _inputInterval=setInterval(_pollAndSend,50);
    }
  }

  // ── Game-specific socket event wiring (called by arcade.js after roomJoined) ──
  function wireSocket(socket) {
    _socket=socket;
    if(!_socket||!_game)return;

    // Universal: listen for gameStart
    _socket.on('gameStart',(data)=>{
      _gameState={};
      // Clash-style: inject HUD
      if(['laneclash','towersiege','unitrush'].includes(_game)){
        setTimeout(()=>_injectClashHUD(_game),200);
      }
      // Reaction race: inject overlay
      if(_game==='reactionrace')setTimeout(()=>_injectReactionOverlay(),200);
      // Gravity wars: inject panel
      if(_game==='gravitywars')setTimeout(()=>_injectGravityPanel(),200);
      // Chain reaction: find my player index
      if(_game==='chainreaction'&&data.players){
        const me=data.players.find(p=>p.id===_myId);
        if(me)_chainMyCI=me.ci;
      }
    });

    _socket.on('gameState',(state)=>{
      _gameState=state;
      // Update energy pips
      if(['laneclash','towersiege','unitrush'].includes(_game)&&state.players){
        const me=state.players.find(p=>p.id===_myId);
        if(me)_updateEnergyPips(me.energy||me.mana||0);
      }
      // Infection phase
      if(state.phase)_phase=state.phase;
      // Chain reaction: pass current turn id to renderer
      if(_game==='chainreaction'&&state.currentTurnId)_chainCurrentTurnId=state.currentTurnId;
    });

    // ── Reaction Race events ──────────────────────────────────────────────
    if(_game==='reactionrace'){
      _socket.on('roundPending',({round,total})=>{
        _hideReactionPrompt(null,null);
        const box=document.getElementById('_reaction-prompt-box');
        const hint=document.getElementById('_reaction-key-hint');
        if(hint)hint.textContent=`Round ${round}/${total} — GET READY...`;
      });
      _socket.on('showPrompt',({label,color,key,round,total})=>{
        _showReactionPrompt(label,color,key);
        _gameState={..._gameState,prompt:{label,color,key},round,total,waiting:false};
      });
      _socket.on('roundResult',({correct,winner,reactionMs,scores})=>{
        _hideReactionPrompt(winner,reactionMs);
        _gameState={..._gameState,prompt:null,scores,waiting:true};
        if(correct===_myId&&winner){
          toast(`⚡ YOU GOT IT! ${reactionMs}ms`,1500);
        } else if(winner){
          toast(`${winner} was faster! (${reactionMs}ms)`,1500);
        }
      });
      _socket.on('wrongKey',()=>toast('❌ Wrong key!',800));
    }

    // ── Gravity Wars events ───────────────────────────────────────────────
    if(_game==='gravitywars'){
      _socket.on('turnStart',({playerId,aimTime,players})=>{
        _isMyTurn=playerId===_myId;
        _gameState={..._gameState,players,currentTurnId:playerId};
        _setGravityTurn(_isMyTurn);
        if(_isMyTurn)toast('🎯 YOUR TURN! Aim and fire!',2000);
        else{
          const p=players?.find(q=>q.id===playerId);
          if(p)toast(`${p.username}'s turn...`,1500);
        }
      });
      _socket.on('aimState',({playerId,angle,power})=>{
        if(_gameState)_gameState._aimData={playerId,angle,power};
      });
      _socket.on('shotFired',({by,color})=>toast(`🔥 ${by} fired!`,1000));
      _socket.on('projectileUpdate',({x,y,trail})=>{
        _gravProjectile={x,y};_gravProjectileTrail=trail||[];
      });
      _socket.on('playerHit',({username,hpLeft})=>toast(`💥 ${username} HIT! ${hpLeft} HP left`,1500));
    }

    // ── Chain Reaction events ─────────────────────────────────────────────
    if(_game==='chainreaction'){
      _socket.on('turnStart',({playerId,grid,players})=>{
        _chainCurrentTurnId=playerId;
        _gameState={..._gameState,grid,players,currentTurnId:playerId};
        _isMyTurn=playerId===_myId;
        if(_isMyTurn)toast('💣 YOUR TURN — click a cell!',1800);
      });
      _socket.on('gridUpdate',({grid,players})=>{
        _gameState={..._gameState,grid,players};
      });
    }

    // ── Clash-style events ────────────────────────────────────────────────
    if(['laneclash','towersiege','unitrush'].includes(_game)){
      _socket.on('unitSpawned',({side,type,lane})=>{
        toast(`${side.toUpperCase()} spawned ${type}!`,600);
      });
      _socket.on('flagCaptured',(data)=>{
        if(data)toast(`🏯 ${data.username} destroyed a tower!`,2000);
      });
    }

    // ── CTF events ────────────────────────────────────────────────────────
    if(_game==='cybercapture'){
      _socket.on('flagPickup',({username,team,flagSide})=>{
        toast(`🚩 ${username} grabbed the ${flagSide.toUpperCase()} flag!`,2000);
      });
      _socket.on('flagCaptured',({team,username,scores})=>{
        toast(`🎉 ${username} SCORED for ${team.toUpperCase()}! ${scores.red}-${scores.blue}`,2500);
      });
      _socket.on('flagDropped',({flagSide})=>{
        toast(`🚩 ${flagSide.toUpperCase()} flag dropped!`,1500);
      });
      _socket.on('playerTagged',({username,respawnIn})=>{
        toast(`💀 ${username} tagged out (${respawnIn}s respawn)`,1500);
      });
    }

    // ── Shared kill/event notifications ──────────────────────────────────
    _socket.on('playerDied',({deadName,killerName})=>{
      toast(`💀 ${killerName} eliminated ${deadName}!`,1800);
    });
    _socket.on('playerKilled',({deadId,killerId,byMissile})=>{
      if(deadId===_myId)toast(byMissile?'💥 YOU WERE MISSILED!':'💀 YOU WERE SHOT!',1800);
    });
    _socket.on('playerFell',({username})=>toast(`⬇ ${username} fell off!`,1200));
    _socket.on('playerOut',({username})=>toast(`🥊 ${username} knocked out!`,1500));
    _socket.on('playerRespawned',({id})=>{if(id===_myId)toast('♻️ RESPAWNED!',800);});
    _socket.on('playerInfected',({username})=>toast(`🧟 ${username} is infected!`,1500));
    _socket.on('arenaShrank',()=>toast('⚠️ ARENA SHRINKING!',1500));
    _socket.on('missileLaunched',({by})=>toast(`🚀 ${by} launched a missile!`,1200));

    // ── Infection-specific ────────────────────────────────────────────────
    if(_game==='infection'){
      _socket.on('gameStart',(data)=>{
        if(data.zeroId===_myId)toast(`🧟 YOU ARE THE ZOMBIE! Infect everyone!`,3000);
        else toast(`🧟 ${data.zeroName} is the zombie! Run! (${data.headstart}s headstart)`,3000);
      });
      _socket.on('phaseChange',({phase})=>{
        if(phase==='active')toast('🚨 ZOMBIE RELEASED! RUN!',2000);
      });
    }

    // ── KOTH ─────────────────────────────────────────────────────────────
    if(_game==='koth'){
      _socket.on('gameState',(state)=>{
        _gameState=state;
        const me=state.players?.find(p=>p.id===_myId);
        if(me?.inZone&&!_kothInZone){toast('👑 IN THE ZONE!',600);_kothInZone=true;}
        if(!me?.inZone)_kothInZone=false;
      });
    }
  }

  let _kothInZone=false;

  // ── Teardown ───────────────────────────────────────────────────────────────
  function teardown() {
    _removeOverlays();
    document.removeEventListener('keydown',_handleKeyDown);
    document.removeEventListener('keyup',_handleKeyUp);
    const canvas=$('game-canvas');
    if(canvas){
      canvas.removeEventListener('mousemove',_handleMouseMove);
      canvas.removeEventListener('click',_handleMouseClick);
    }
    clearInterval(_inputInterval);_inputInterval=null;
    _socket=null; _game=null; _gameState=null;
    _currentPrompt=null;_isMyTurn=false;_kothInZone=false;
    Object.keys(_keyState).forEach(k=>delete _keyState[k]);
  }

  // ── getExtraState: supplies extra per-frame state to renderer ─────────────
  function getExtraState() {
    if(_game==='gravitywars'){
      return {
        isMyTurn:_isMyTurn,
        projectile:_gravProjectile?{..._gravProjectile,trail:_gravProjectileTrail}:null,
        aimLine:_isMyTurn&&_gameState?.players?.find(p=>p.id===_myId)?
          (()=>{const me=_gameState.players.find(p=>p.id===_myId);return me?{x1:me.x,y1:me.y,x2:me.x+Math.cos(_aimAngle)*_aimPower*3,y2:me.y+Math.sin(_aimAngle)*_aimPower*3}:null;})()
          :null
      };
    }
    if(_game==='chainreaction'){
      return {currentTurnId:_chainCurrentTurnId,myId:_myId};
    }
    return null;
  }

  // ── getGameState: the current game state to pass to renderer ─────────────
  function getGameState() { return _gameState; }

  // ── isNewGame: check if a game ID belongs to the new set ─────────────────
  const NEW_GAMES = new Set([
    'laneclash','towersiege','unitrush',
    'bullethell','neontanks','lasertag','spaceduel','cybercapture',
    'reactionrace','territory','koth','infection','gravitywars',
    'knockout','ballblitz','fallingtiles','chainreaction','neonsumo','blitzcatcher'
  ]);
  function isNewGame(game){ return NEW_GAMES.has(game); }

  return { connect, wireSocket, teardown, getExtraState, getGameState, isNewGame };

})();
