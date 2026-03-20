/**
 * NEON ARCADE — Universal New-Game Renderer
 * Handles canvas drawing for all 20 new multiplayer games.
 * Called from arcade.js render loop: NewGameRenderer.render(game, state, ctx, canvas, myId)
 */

const NewGameRenderer = (() => {

  // ── Shared draw helpers ───────────────────────────────────────────────────
  function glow(ctx, color, blur=18){ctx.shadowColor=color;ctx.shadowBlur=blur;}
  function noGlow(ctx){ctx.shadowBlur=0;}
  function circle(ctx,x,y,r,fill,stroke,gBlur){
    if(gBlur)glow(ctx,fill,gBlur); else noGlow(ctx);
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
  }
  function rect(ctx,x,y,w,h,fill,stroke){
    noGlow(ctx);
    if(fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);}
  }
  function label(ctx,text,x,y,size,color,align='center'){
    ctx.font=`bold ${size}px "Orbitron",monospace`;
    ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y);
  }
  function healthBar(ctx,x,y,w,hp,maxHp,color){
    rect(ctx,x,y,w,6,'#222');
    const ratio=Math.max(0,Math.min(1,hp/maxHp));
    if(ratio>0){glow(ctx,color,6);rect(ctx,x,y,w*ratio,6,color);}
    noGlow(ctx);
  }

  function drawEffects(ctx,effects){
    if(!effects)return;
    const now=Date.now();
    for(const e of effects){
      const age=(now-e.t)/600;
      if(age>1)continue;
      ctx.globalAlpha=1-age;
      glow(ctx,e.color,20);
      ctx.beginPath();ctx.arc(e.x,e.y,8+age*20,0,Math.PI*2);
      ctx.fillStyle=e.color;ctx.fill();
      noGlow(ctx);
    }
    ctx.globalAlpha=1;
  }

  function drawPlayers(ctx,players,myId){
    if(!players)return;
    for(const p of players){
      if(p.alive===false)continue;
      const r=p.r||p.radius||16;
      // Shadow ring for self
      if(p.id===myId){glow(ctx,'#fff',12);ctx.beginPath();ctx.arc(p.x,p.y,r+4,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=2;ctx.stroke();noGlow(ctx);}
      circle(ctx,p.x,p.y,r,p.color+'33',p.color,16);
      // Name
      ctx.font='10px "Share Tech Mono",monospace';ctx.fillStyle='#fff';ctx.textAlign='center';
      ctx.fillText(p.username||'',p.x,p.y-r-5);
      noGlow(ctx);
    }
  }

  function drawBullets(ctx,bullets){
    if(!bullets)return;
    for(const b of bullets){
      const r=b.r||5;
      glow(ctx,b.ownerColor||'#fff',10);
      ctx.beginPath();ctx.arc(b.x,b.y,r,0,Math.PI*2);
      ctx.fillStyle=b.ownerColor||'#fff';ctx.fill();
      noGlow(ctx);
    }
  }

  // ── LANE CLASH / TOWER SIEGE / UNIT RUSH renderer ────────────────────────
  function renderClashStyle(ctx,W,H,state,myId,game){
    if(!state)return;
    // Background
    ctx.fillStyle='#0a0010';ctx.fillRect(0,0,W,H);

    // Lane lines (for laneclash)
    if(game==='laneclash'&&state.laneY){
      for(const ly of state.laneY||[150,300,450]){
        ctx.strokeStyle='#ffffff08';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,ly);ctx.lineTo(W,ly);ctx.stroke();
      }
    }

    // Draw bases / gates
    if(state.bases){
      const lb=state.bases.left,rb=state.bases.right;
      // Left base
      const lhp=lb.hp/lb.maxHp;
      glow(ctx,'#FF2D55',20);ctx.fillStyle=`rgba(255,45,85,${0.1+lhp*0.2})`;ctx.fillRect(0,0,70,H);
      ctx.strokeStyle='#FF2D55';ctx.lineWidth=3;ctx.strokeRect(0,0,70,H);
      noGlow(ctx);
      healthBar(ctx,5,H/2-30,60,lb.hp,lb.maxHp,'#FF2D55');
      label(ctx,'BASE',35,H/2+10,10,'#FF2D55');
      // Right base
      const rhp=rb.hp/rb.maxHp;
      glow(ctx,'#00F5FF',20);ctx.fillStyle=`rgba(0,245,255,${0.1+rhp*0.2})`;ctx.fillRect(W-70,0,70,H);
      ctx.strokeStyle='#00F5FF';ctx.lineWidth=3;ctx.strokeRect(W-70,0,70,H);
      noGlow(ctx);
      healthBar(ctx,W-65,H/2-30,60,rb.hp,rb.maxHp,'#00F5FF');
      label(ctx,'BASE',W-35,H/2+10,10,'#00F5FF');
    }

    // Tower siege: draw towers
    if(state.towers){
      const drawTowerSet=(towers,side)=>{
        for(const t of towers){
          const hp=t.hp/t.maxHp,c=side==='left'?'#FF2D55':'#00F5FF';
          glow(ctx,c,14);
          ctx.fillStyle=c+`${Math.floor(hp*255).toString(16).padStart(2,'0')}`;
          ctx.fillRect(t.x-20,t.y-40,40,80);
          ctx.strokeStyle=c;ctx.lineWidth=2;ctx.strokeRect(t.x-20,t.y-40,40,80);
          noGlow(ctx);healthBar(ctx,t.x-18,t.y-42,36,t.hp,t.maxHp,c);
        }
      };
      if(state.towers.left)drawTowerSet(state.towers.left,'left');
      if(state.towers.right)drawTowerSet(state.towers.right,'right');
    }

    // Gates (unitrush)
    if(state.gates){
      const drawGate=(g,color)=>{
        glow(ctx,color,20);ctx.beginPath();ctx.arc(g.x,g.y,25,0,Math.PI*2);
        ctx.fillStyle=color+'44';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
        noGlow(ctx);healthBar(ctx,g.x-20,g.y-35,40,g.hp,g.maxHp,color);
        label(ctx,'GATE',g.x,g.y+5,9,color);
      };
      drawGate(state.gates.left,'#FF2D55');drawGate(state.gates.right,'#00F5FF');
    }

    // Units
    if(state.units){
      for(const u of state.units){
        const c=u.ownerColor||u.color||'#fff';
        glow(ctx,c,10);
        ctx.beginPath();ctx.arc(u.x,u.y,u.r||12,0,Math.PI*2);
        ctx.fillStyle=c+(u.side==='left'?'cc':'88');ctx.fill();
        ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
        noGlow(ctx);
        healthBar(ctx,u.x-10,u.y-(u.r||12)-7,20,u.hpRatio||1,1,c);
        ctx.font='8px monospace';ctx.fillStyle='#fff';ctx.textAlign='center';
        ctx.fillText((u.type||'').substring(0,3).toUpperCase(),u.x,u.y+4);
      }
    }

    // Projectiles
    if(state.projectiles){
      for(const p of state.projectiles){
        glow(ctx,p.color||'#fff',8);
        ctx.beginPath();ctx.arc(p.tx||p.sx,p.ty||p.sy,4,0,Math.PI*2);
        ctx.fillStyle=p.color||'#fff';ctx.fill();noGlow(ctx);
      }
    }

    drawEffects(ctx,state.effects);

    // HUD
    if(state.players){
      let xi=10;
      for(const p of state.players){
        const energy=p.energy||p.mana||0;
        const total=10;
        ctx.fillStyle='#111';ctx.fillRect(xi,H-50,120,40);
        ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.strokeRect(xi,H-50,120,40);
        label(ctx,p.username.substring(0,8),xi+60,H-35,10,p.color);
        // Energy pips
        for(let i=0;i<total;i++){
          const filled=i<Math.floor(energy);
          ctx.fillStyle=filled?p.color:'#333';
          ctx.fillRect(xi+5+i*11,H-26,9,12);
        }
        xi+=130;
      }
    }

    // Timer
    if(state.timeLeft!==undefined){
      label(ctx,`⏱ ${state.timeLeft}s`,W/2,30,18,'#fff');
    }
  }

  // ── SHOOTER GAMES renderer (bullethell, neontanks, lasertag, spaceduel, cybercapture) ────
  function renderShooter(ctx,W,H,state,myId,game){
    if(!state)return;
    ctx.fillStyle='#050510';ctx.fillRect(0,0,W,H);

    // Walls/obstacles
    const walls=state.walls||state.obstacles||[];
    for(const w of walls){
      glow(ctx,'#4040ff',6);ctx.fillStyle='#1a1a3a';ctx.fillRect(w.x,w.y,w.w,w.h);
      ctx.strokeStyle='#3030aa';ctx.lineWidth=2;ctx.strokeRect(w.x,w.y,w.w,w.h);
      noGlow(ctx);
    }

    // KOTH zone
    if(state.zone){
      const z=state.zone;
      glow(ctx,'#FFD700',15);
      ctx.fillStyle='rgba(255,215,0,0.08)';ctx.fillRect(z.x,z.y,z.w,z.h);
      ctx.strokeStyle='#FFD700';ctx.lineWidth=2;ctx.setLineDash([8,4]);ctx.strokeRect(z.x,z.y,z.w,z.h);
      ctx.setLineDash([]);noGlow(ctx);
    }

    // CTF: bases and flags
    if(state.flags){
      const drawFlag=(fl,color,label_)=>{
        if(!fl)return;
        glow(ctx,color,20);
        ctx.fillStyle=color;
        ctx.fillRect(fl.x-8,fl.y-20,4,20);
        ctx.fillRect(fl.x-4,fl.y-20,14,10);
        noGlow(ctx);
      };
      drawFlag(state.flags.red,'#FF2D55','RED');
      drawFlag(state.flags.blue,'#00F5FF','BLUE');
      // Bases
      if(state.bases){
        const b=state.bases;
        glow(ctx,'#FF2D55',8);ctx.strokeStyle='#FF2D55';ctx.lineWidth=2;ctx.strokeRect(b.red.x,b.red.y,b.red.w,b.red.h);
        glow(ctx,'#00F5FF',8);ctx.strokeStyle='#00F5FF';ctx.lineWidth=2;ctx.strokeRect(b.blue.x,b.blue.y,b.blue.w,b.blue.h);
        noGlow(ctx);
      }
    }

    // Laser beams
    if(state.lasers){
      for(const l of state.lasers){
        const alpha=1-l.age;
        glow(ctx,l.color,20);
        ctx.globalAlpha=alpha;ctx.strokeStyle=l.color;ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.stroke();
        noGlow(ctx);ctx.globalAlpha=1;
      }
    }

    // Drones (bullet hell)
    if(state.drones){
      for(const d of state.drones){
        glow(ctx,d.color,d.boss?25:12);
        ctx.beginPath();
        if(d.boss){
          ctx.rect(d.x-d.r,d.y-d.r,d.r*2,d.r*2);
        } else {
          // Diamond
          ctx.moveTo(d.x,d.y-d.r);ctx.lineTo(d.x+d.r,d.y);ctx.lineTo(d.x,d.y+d.r);ctx.lineTo(d.x-d.r,d.y);ctx.closePath();
        }
        ctx.fillStyle=d.color+'88';ctx.fill();ctx.strokeStyle=d.color;ctx.lineWidth=2;ctx.stroke();
        noGlow(ctx);
        healthBar(ctx,d.x-d.r,d.y-d.r-8,d.r*2,d.hp,d.maxHp,d.color);
      }
    }

    // Missiles (spaceduel)
    if(state.missiles){
      for(const m of state.missiles){
        glow(ctx,m.ownerColor||'#FF4444',10);
        ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.angle||0);
        ctx.fillStyle=m.ownerColor||'#FF4444';
        ctx.fillRect(-8,-3,16,6);ctx.fillRect(-12,-2,5,4);
        ctx.restore();noGlow(ctx);
      }
    }

    drawBullets(ctx,state.bullets);
    drawEffects(ctx,state.effects);

    // Players
    if(state.players){
      for(const p of state.players){
        if(p.alive===false){
          // Ghost
          ctx.globalAlpha=0.3;
          circle(ctx,p.x||W/2,p.y||H/2,16,'#444','#666');
          ctx.globalAlpha=1;
          if(p.respawnIn>0){label(ctx,`${p.respawnIn}s`,p.x||W/2,(p.y||H/2)+25,10,'#aaa');}
          continue;
        }
        const r=p.r||p.radius||16;
        const isMe=p.id===myId;

        // Neon tanks: draw tank body
        if(game==='neontanks'&&p.angle!==undefined){
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
          glow(ctx,p.color,14);
          ctx.fillStyle=p.color+'88';ctx.fillRect(-r,-r*0.6,r*2,r*1.2);
          ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.strokeRect(-r,-r*0.6,r*2,r*1.2);
          ctx.fillRect(r*0.4,-2,r*0.9,4); // barrel
          ctx.restore();noGlow(ctx);
        }
        // Space duel: ship shape
        else if(game==='spaceduel'&&p.angle!==undefined){
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
          glow(ctx,p.color,14);ctx.fillStyle=p.color;
          ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(-r,-r*0.6);ctx.lineTo(-r*0.5,0);ctx.lineTo(-r,r*0.6);ctx.closePath();
          ctx.fill();ctx.restore();noGlow(ctx);
        } else {
          // Circle player
          if(isMe){glow(ctx,'#fff',12);ctx.beginPath();ctx.arc(p.x,p.y,r+4,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=2;ctx.stroke();}
          circle(ctx,p.x,p.y,r,p.color+'55',p.color,14);
          noGlow(ctx);
        }

        // HP bar
        if(p.hp!==undefined) healthBar(ctx,p.x-r,p.y-r-10,r*2,p.hp,100,p.color);
        // Team flag indicator (ctf)
        if(p.hasFlag){glow(ctx,'#FFD700',20);label(ctx,'🚩',p.x,p.y-r-20,14,'#FFD700');noGlow(ctx);}
        // Name + score
        ctx.font='10px "Share Tech Mono",monospace';ctx.fillStyle='#fff';ctx.textAlign='center';
        ctx.fillText(p.username||'',p.x,p.y-r-22);
        noGlow(ctx);
      }
    }

    // HUD
    _drawScoreHUD(ctx,state,W,H,game);
  }

  // ── TERRITORY WAR renderer ────────────────────────────────────────────────
  function renderTerritory(ctx,W,H,state,myId){
    if(!state)return;
    ctx.fillStyle='#080808';ctx.fillRect(0,0,W,H);
    if(!state.grid||!state.players)return;
    const TILE=40,COLS=20;
    const colors=['#FF2D55','#00F5FF','#39FF14','#FF9500','#BF5FFF','#FF6EC7','#FFD700','#00FF8C'];
    for(let i=0;i<state.grid.length;i++){
      const v=state.grid[i];
      const col=i%COLS,row=Math.floor(i/COLS);
      ctx.fillStyle=v>=0?colors[v%8]+'55':'#111';
      ctx.fillRect(col*TILE,row*TILE,TILE,TILE);
      if(v>=0){ctx.strokeStyle=colors[v%8]+'33';ctx.lineWidth=0.5;ctx.strokeRect(col*TILE,row*TILE,TILE,TILE);}
    }
    // Players
    for(const p of state.players){
      glow(ctx,p.color,16);circle(ctx,p.x,p.y,p.r||14,p.color,p.id===myId?'#fff':p.color+'aa',16);
      noGlow(ctx);label(ctx,p.username||'',p.x,p.y-(p.r||14)-4,9,'#fff');
    }
    drawEffects(ctx,state.effects||[]);
    if(state.timeLeft!==undefined)label(ctx,`⏱ ${state.timeLeft}s`,W/2,20,16,'#fff');
    // Score bars
    if(state.players){
      let xi=5;
      for(const p of state.players){
        const totalTiles=COLS*(H/40)*1;
        ctx.fillStyle='#111';ctx.fillRect(xi,H-30,90,22);
        ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.strokeRect(xi,H-30,90,22);
        label(ctx,`${p.username?.substring(0,6)||''}: ${p.score}`,xi+45,H-14,9,p.color);
        xi+=95;
      }
    }
  }

  // ── KNOCKOUT / SUMO arena renderer ───────────────────────────────────────
  function renderArena(ctx,W,H,state,myId,game){
    if(!state)return;
    ctx.fillStyle='#000015';ctx.fillRect(0,0,W,H);
    const arena=state.arena||{cx:W/2,cy:H/2};
    const arenaR=state.arenaR||240;
    // Arena circle
    glow(ctx,'#4040ff',20);
    ctx.beginPath();ctx.arc(arena.cx||W/2,arena.cy||H/2,arenaR,0,Math.PI*2);
    ctx.fillStyle='#08081a';ctx.fill();
    ctx.strokeStyle='#4040ff';ctx.lineWidth=3;ctx.stroke();
    noGlow(ctx);
    // Inner ring
    ctx.beginPath();ctx.arc(arena.cx||W/2,arena.cy||H/2,arenaR-10,0,Math.PI*2);
    ctx.strokeStyle='#2020aa';ctx.lineWidth=1;ctx.stroke();

    drawEffects(ctx,state.effects||[]);
    drawPlayers(ctx,state.players,myId);

    // Charge indicator (sumo)
    if(state.players){
      for(const p of state.players){
        if((p.charge||0)>0){
          glow(ctx,p.color,20);
          ctx.beginPath();ctx.arc(p.x,p.y,(p.r||22)+4+p.charge*10,0,Math.PI*2);
          ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.stroke();noGlow(ctx);
        }
      }
    }

    // Shrink warning
    if(state.shrinkIn!==undefined&&state.shrinkIn<5){
      ctx.globalAlpha=0.5+0.5*Math.sin(Date.now()/150);
      label(ctx,`⚠ SHRINKING IN ${state.shrinkIn}s`,W/2,H-20,14,'#FF2D55');
      ctx.globalAlpha=1;
    }
    if(state.timeLeft!==undefined)label(ctx,`⏱ ${state.timeLeft}s`,W/2,30,18,'#fff');
    _drawScoreHUD(ctx,state,W,H,game);
  }

  // ── BALL BLITZ / BLITZ CATCHER renderer ──────────────────────────────────
  function renderCatcher(ctx,W,H,state,myId,game){
    if(!state)return;
    ctx.fillStyle='#020210';ctx.fillRect(0,0,W,H);
    // Stars (blitzcatcher)
    if(state.stars){
      for(const s of state.stars){
        glow(ctx,s.color,s.golden?25:10);
        ctx.beginPath();
        if(s.golden){
          // Star shape
          for(let i=0;i<10;i++){
            const a=(i*Math.PI/5)-Math.PI/2;
            const r2=i%2===0?s.r:s.r*0.5;
            if(i===0)ctx.moveTo(s.x+Math.cos(a)*r2,s.y+Math.sin(a)*r2);
            else ctx.lineTo(s.x+Math.cos(a)*r2,s.y+Math.sin(a)*r2);
          }
          ctx.closePath();ctx.fillStyle='#FFD700';
        } else {
          ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle='#fff';
        }
        ctx.fill();noGlow(ctx);
      }
    }
    // Balls (ballblitz)
    if(state.balls){
      for(const b of state.balls){
        glow(ctx,b.color,12);
        ctx.beginPath();ctx.arc(b.x,b.y,b.r||14,0,Math.PI*2);
        ctx.fillStyle=b.color;ctx.fill();noGlow(ctx);
      }
    }
    // Floor (blitzcatcher)
    if(game==='blitzcatcher'){
      ctx.fillStyle='#1a1a2a';ctx.fillRect(0,H-30,W,30);
      ctx.strokeStyle='#3030aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,H-30);ctx.lineTo(W,H-30);ctx.stroke();
    }
    drawEffects(ctx,state.effects||[]);
    drawPlayers(ctx,state.players,myId);
    // Lives / score
    if(state.players){
      let xi=10;
      for(const p of state.players){
        ctx.fillStyle='#111';ctx.fillRect(xi,10,100,36);
        ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.strokeRect(xi,10,100,36);
        label(ctx,p.username?.substring(0,7)||'',xi+50,26,9,p.color);
        if(p.lives!==undefined){
          label(ctx,'❤'.repeat(p.lives||0),xi+50,42,10,p.color);
        } else {
          label(ctx,`★ ${p.score||0}`,xi+50,42,10,p.color);
        }
        xi+=108;
      }
    }
    if(state.timeLeft!==undefined)label(ctx,`⏱ ${state.timeLeft}s`,W/2,30,18,'#fff');
  }

  // ── FALLING TILES renderer ───────────────────────────────────────────────
  function renderFallingTiles(ctx,W,H,state,myId){
    if(!state)return;
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    if(state.tiles){
      for(const t of state.tiles){
        if(t.state==='gone')continue;
        const crack=t.crack||0;
        const bright=t.state==='cracked'?Math.max(0,1-crack):1;
        const base=t.state==='cracked'?'#663300':'#004466';
        ctx.fillStyle=base;ctx.fillRect(t.x,t.y,80,80);
        // Crack lines
        if(t.state==='cracked'&&crack>0){
          ctx.strokeStyle=`rgba(255,100,0,${crack})`;ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(t.x+40,t.y+40);ctx.lineTo(t.x+40+crack*20,t.y+crack*30);ctx.stroke();
          ctx.beginPath();ctx.moveTo(t.x+40,t.y+40);ctx.lineTo(t.x-crack*15,t.y+40+crack*25);ctx.stroke();
        }
        ctx.strokeStyle=t.state==='cracked'?'#995500':'#005588';
        ctx.lineWidth=2;ctx.strokeRect(t.x,t.y,80,80);
      }
    }
    drawEffects(ctx,state.effects||[]);
    drawPlayers(ctx,state.players,myId);
    if(state.speed!==undefined)label(ctx,`💨 Speed ${state.speed}x`,W-80,20,12,'#FF9500');
    if(state.timeLeft!==undefined)label(ctx,`⏱ ${state.timeLeft}s`,W/2,25,18,'#fff');
    if(state.players){
      let xi=10;
      for(const p of state.players){
        ctx.fillStyle='#111';ctx.fillRect(xi,H-40,90,32);
        ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.strokeRect(xi,H-40,90,32);
        label(ctx,p.username?.substring(0,6)||'',xi+45,H-24,9,p.color);
        label(ctx,`${(p.score||0)}pts`,xi+45,H-10,9,p.color);
        xi+=95;
      }
    }
  }

  // ── CHAIN REACTION renderer ──────────────────────────────────────────────
  function renderChainReaction(ctx,W,H,state,myId){
    if(!state)return;
    ctx.fillStyle='#050510';ctx.fillRect(0,0,W,H);
    if(!state.grid)return;
    const COLS=9,ROWS=6;
    const TW=Math.floor(W/COLS),TH=Math.floor((H-60)/ROWS);
    const colors=['#FF2D55','#00F5FF','#39FF14','#FF9500','#BF5FFF','#FF6EC7','#FFD700','#00FF8C'];

    for(const cell of state.grid){
      const x=cell.col*TW+2,y=cell.row*TH+2+30;
      const c=cell.owner>=0?colors[cell.owner%8]:null;
      ctx.fillStyle=c?c+'33':'#0a0a1a';ctx.fillRect(x,y,TW-4,TH-4);
      ctx.strokeStyle=c||'#222';ctx.lineWidth=1.5;ctx.strokeRect(x,y,TW-4,TH-4);
      // Orbs
      if(cell.orbs>0&&c){
        const cx=x+TW/2-2,cy=y+TH/2-2;
        const orbPositions=cell.orbs===1?[[cx,cy]]:cell.orbs===2?[[cx-8,cy],[cx+8,cy]]:[[cx,cy-8],[cx-8,cy+6],[cx+8,cy+6]];
        for(const [ox,oy] of orbPositions.slice(0,3)){
          glow(ctx,c,10);ctx.beginPath();ctx.arc(ox,oy,5,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();noGlow(ctx);
        }
      }
    }
    // Current player's turn highlight
    if(state.currentTurnId){
      const p=state.players?.find(p=>p.id===state.currentTurnId);
      if(p)label(ctx,`${p.username||'?'}'S TURN`,W/2,22,13,p.color||'#fff');
    }
    // Score board
    if(state.players){
      let xi=10;
      for(const p of state.players){
        ctx.fillStyle='#111';ctx.fillRect(xi,H-36,90,30);
        ctx.strokeStyle=p.color||'#444';ctx.lineWidth=1;ctx.strokeRect(xi,H-36,90,30);
        label(ctx,p.username?.substring(0,7)||'',xi+45,H-20,9,p.color||'#fff');
        label(ctx,p.alive===false?'💀':'✓',xi+45,H-7,10,p.alive===false?'#666':p.color||'#fff');
        xi+=95;
      }
    }
  }

  // ── GRAVITY WARS renderer ─────────────────────────────────────────────────
  function renderGravityWars(ctx,W,H,state,myId,extraState){
    if(!state)return;
    ctx.fillStyle='#000008';ctx.fillRect(0,0,W,H);
    // Stars background
    for(let i=0;i<60;i++){
      const x=(i*137.5)%W,y=(i*83.7)%H;
      ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fillRect(x,y,1,1);
    }
    // Planets
    if(state.planets){
      for(const p of state.planets){
        const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
        grad.addColorStop(0,p.color+'ff');grad.addColorStop(1,p.color+'22');
        glow(ctx,p.color,20);ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=grad;ctx.fill();noGlow(ctx);
        // Gravity field
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2);
        ctx.strokeStyle=p.color+'22';ctx.lineWidth=1;ctx.stroke();
      }
    }
    // Players
    if(state.players){
      for(const p of state.players){
        if(!p.alive){ctx.globalAlpha=0.2;circle(ctx,p.x,p.y,p.r||18,'#444','#666');ctx.globalAlpha=1;continue;}
        glow(ctx,p.color,14);
        ctx.beginPath();ctx.moveTo(p.x,p.y-p.r);ctx.lineTo(p.x-p.r*0.7,p.y+p.r);ctx.lineTo(p.x+p.r*0.7,p.y+p.r);ctx.closePath();
        ctx.fillStyle=p.color+'99';ctx.fill();ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.stroke();noGlow(ctx);
        label(ctx,p.username||'',p.x,p.y-(p.r||18)-8,9,'#fff');
        // HP hearts
        label(ctx,'❤'.repeat(p.hp||0),p.x,p.y+(p.r||18)+14,11,p.color);
      }
    }
    // Projectile in flight
    if(extraState?.projectile){
      const proj=extraState.projectile;
      glow(ctx,'#fff',15);ctx.beginPath();ctx.arc(proj.x,proj.y,5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
      if(proj.trail){
        for(let i=0;i<proj.trail.length;i++){
          const t=proj.trail[i];
          ctx.globalAlpha=(i/proj.trail.length)*0.5;
          ctx.beginPath();ctx.arc(t.x,t.y,3,0,Math.PI*2);ctx.fillStyle='#88aaff';ctx.fill();
        }
        ctx.globalAlpha=1;
      }
      noGlow(ctx);
    }
    // Aim line (my turn)
    if(extraState?.isMyTurn&&extraState?.aimLine){
      const al=extraState.aimLine;
      ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
      ctx.beginPath();ctx.moveTo(al.x1,al.y1);ctx.lineTo(al.x2,al.y2);ctx.stroke();
      ctx.setLineDash([]);
    }
    drawEffects(ctx,state.effects||[]);
  }

  // ── INFECTION MODE renderer ───────────────────────────────────────────────
  function renderInfection(ctx,W,H,state,myId){
    if(!state)return;
    ctx.fillStyle='#010a01';ctx.fillRect(0,0,W,H);
    // Cures (green crosses)
    if(state.cures){
      for(const c of state.cures){
        glow(ctx,'#00ff88',12);ctx.fillStyle='#00ff88';
        ctx.fillRect(c.x-2,c.y-8,4,16);ctx.fillRect(c.x-8,c.y-2,16,4);noGlow(ctx);
      }
    }
    // Players
    if(state.players){
      for(const p of state.players){
        if(!p.alive)continue;
        const r=16;const zombie=p.infected;
        glow(ctx,p.color,zombie?25:12);
        // Zombie shape: jagged star; Human: circle
        if(zombie){
          ctx.beginPath();
          for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2,ir=i%2===0?r:r*0.55;ctx.lineTo(p.x+Math.cos(a)*ir,p.y+Math.sin(a)*ir);}
          ctx.closePath();ctx.fillStyle=p.color+'99';ctx.fill();ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.stroke();
        } else {
          ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=p.color+'88';ctx.fill();ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.stroke();
        }
        noGlow(ctx);label(ctx,p.username||'',p.x,p.y-r-5,9,'#fff');
      }
    }
    drawEffects(ctx,state.effects||[]);
    // Phase banner
    if(state.phase==='human_headstart'){
      ctx.globalAlpha=0.8;ctx.fillStyle='#000';ctx.fillRect(W/2-150,H/2-30,300,60);
      label(ctx,`🧟 ZOMBIE COMES IN ${state.phaseTimer}s`,W/2,H/2+8,14,'#FF2D55');ctx.globalAlpha=1;
    }
    // Counts
    label(ctx,`🧟 ${state.zombieCount||0}  🧍 ${state.humanCount||0}`,W/2,30,16,'#fff');
  }

  // ── REACTION RACE renderer ────────────────────────────────────────────────
  function renderReactionRace(ctx,W,H,state,myId){
    if(!state)return;
    ctx.fillStyle='#080808';ctx.fillRect(0,0,W,H);
    // Prompt
    if(state.prompt){
      const p=state.prompt;
      glow(ctx,p.color,40);
      ctx.fillStyle=p.color;
      ctx.fillRect(W/2-140,H/2-100,280,180);
      noGlow(ctx);
      label(ctx,p.label,W/2,H/2,48,'#fff');
      label(ctx,`Press: ${p.key.toUpperCase()}`,W/2,H/2+55,16,'rgba(255,255,255,0.7)');
    } else if(state.waiting){
      label(ctx,'GET READY...',W/2,H/2,28,'#666');
    }
    // Round info
    label(ctx,`ROUND ${state.round||0} / ${state.total||10}`,W/2,40,16,'#aaa');
    // Scores
    if(state.scores){
      let xi=20;
      for(const p of state.scores){
        ctx.fillStyle='#111';ctx.fillRect(xi,H-60,110,50);
        ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.strokeRect(xi,H-60,110,50);
        label(ctx,p.username?.substring(0,8)||'',xi+55,H-40,10,p.color);
        label(ctx,`${p.score}pts`,xi+55,H-18,14,p.color);
        xi+=118;
      }
    }
  }

  // ── Shared HUD ───────────────────────────────────────────────────────────
  function _drawScoreHUD(ctx,state,W,H,game){
    if(!state.players)return;
    // CTF team score
    if(state.scores){
      label(ctx,`🔴 ${state.scores.red||0}   🔵 ${state.scores.blue||0}`,W/2,H-15,16,'#fff');
    }
    // Kill/score HUD
    let xi=10;
    for(const p of state.players){
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(xi,10,120,36);
      ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.strokeRect(xi,10,120,36);
      label(ctx,p.username?.substring(0,8)||'',xi+60,25,9,p.color);
      const scoreStr=p.kills!==undefined?`${p.kills}K ${p.score}pts`:`${p.score||0}pts`;
      label(ctx,scoreStr,xi+60,40,9,'#aaa');
      xi+=128;
    }
    if(state.timeLeft!==undefined) label(ctx,`⏱ ${state.timeLeft}s`,W/2,30,18,'#fff');
    if(state.wave!==undefined) label(ctx,`WAVE ${state.wave}`,W/2,52,12,'#FF9500');
    if(state.killTarget!==undefined){
      const leader=state.players.reduce((a,p)=>p.kills>a.kills?p:a,state.players[0]||{kills:0});
      label(ctx,`FIRST TO ${state.killTarget} KILLS — ${leader.username||''}: ${leader.kills||0}`,W/2,H-15,12,'#aaa');
    }
  }

  // ── Main dispatch ─────────────────────────────────────────────────────────
  function render(game, state, ctx, canvas, myId, extraState) {
    const W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    switch(game){
      case 'laneclash':
      case 'towersiege':
      case 'unitrush':
        return renderClashStyle(ctx,W,H,state,myId,game);
      case 'bullethell':
      case 'neontanks':
      case 'lasertag':
      case 'spaceduel':
      case 'cybercapture':
        return renderShooter(ctx,W,H,state,myId,game);
      case 'territory':
        return renderTerritory(ctx,W,H,state,myId);
      case 'koth':
        return renderShooter(ctx,W,H,state,myId,game); // reuse shooter (has zone support)
      case 'infection':
        return renderInfection(ctx,W,H,state,myId);
      case 'knockout':
      case 'neonsumo':
        return renderArena(ctx,W,H,state,myId,game);
      case 'ballblitz':
      case 'blitzcatcher':
        return renderCatcher(ctx,W,H,state,myId,game);
      case 'fallingtiles':
        return renderFallingTiles(ctx,W,H,state,myId);
      case 'chainreaction':
        return renderChainReaction(ctx,W,H,state,myId);
      case 'gravitywars':
        return renderGravityWars(ctx,W,H,state,myId,extraState);
      case 'reactionrace':
        return renderReactionRace(ctx,W,H,state,myId);
      default:
        ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
        label(ctx,'Rendering...',W/2,H/2,24,'#666');
    }
  }

  return {render};
})();
