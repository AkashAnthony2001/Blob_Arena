/**
 * Asteroid Dash - Canvas Renderer
 */
const AsteroidRenderer = (() => {
  const W=800,H=600;
  let canvas,ctx,myId;
  let stars=[];
  let particles=[];

  function init(c,id){
    canvas=c;ctx=c.getContext('2d');myId=id;
    // Static star field
    stars=[];
    for(let i=0;i<120;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.5,b:Math.random()});
  }

  function addParticle(x,y,color,n=8){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,spd=1+Math.random()*3;
      particles.push({x,y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,color,life:1,decay:.04,size:2+Math.random()*3});
    }
  }

  function render(state){
    if(!ctx) return;
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.life-=p.decay;p.size*=.95;}

    // Deep space bg
    ctx.fillStyle='#04040e';ctx.fillRect(0,0,W,H);
    // Stars
    const t=Date.now()/1000;
    for(const s of stars){
      ctx.globalAlpha=.3+Math.sin(t*s.b+s.x)*.3;
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;

    // Particles
    for(const p of particles){
      ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.shadowBlur=6;ctx.shadowColor=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    // Bullets
    if(state.bullets) for(const b of state.bullets){
      ctx.save();ctx.fillStyle=b.color;ctx.shadowBlur=12;ctx.shadowColor=b.color;
      ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x,b.y,1.5,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    // Asteroids
    if(state.asteroids) for(const a of state.asteroids) drawAsteroid(a);

    // Players (ships)
    if(state.players) for(const p of state.players){
      if(!p.alive) continue;
      drawShip(p,p.id===myId);
    }
  }

  function drawAsteroid(a){
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle||0);
    ctx.shadowBlur=8;ctx.shadowColor='#8866aa';
    ctx.strokeStyle='#aа88cc';ctx.fillStyle='#2a1a3a';ctx.lineWidth=2;
    const pts=8, r=a.r;
    ctx.beginPath();
    for(let i=0;i<pts;i++){
      const ang=(Math.PI*2/pts)*i;
      const jitter=.7+Math.sin(i*7.3+a.id*3)*.3;
      const rx=Math.cos(ang)*r*jitter, ry=Math.sin(ang)*r*jitter;
      i===0?ctx.moveTo(rx,ry):ctx.lineTo(rx,ry);
    }
    ctx.closePath();ctx.fill();ctx.stroke();
    // Crack lines
    ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-r*.3,-r*.2);ctx.lineTo(r*.1,r*.3);ctx.stroke();
    ctx.beginPath();ctx.moveTo(r*.2,-r*.4);ctx.lineTo(-r*.1,r*.1);ctx.stroke();
    ctx.restore();
  }

  function drawShip(p,isMe){
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle+Math.PI/2);
    if(p.invincible){ctx.globalAlpha=.5+Math.sin(Date.now()/60)*.5;}
    ctx.shadowBlur=isMe?20:10;ctx.shadowColor=p.color;
    ctx.fillStyle=p.color;ctx.strokeStyle='#fff';ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(0,-16);ctx.lineTo(-10,10);ctx.lineTo(-4,6);ctx.lineTo(0,8);
    ctx.lineTo(4,6);ctx.lineTo(10,10);ctx.closePath();
    ctx.fill();ctx.stroke();
    // Engine glow
    ctx.shadowBlur=15;ctx.shadowColor=p.color;
    ctx.fillStyle=lighten(p.color,80);
    ctx.beginPath();ctx.arc(0,8,3,0,Math.PI*2);ctx.fill();
    ctx.restore();
    // Name
    ctx.save();ctx.font='10px Share Tech Mono,monospace';ctx.textAlign='center';
    ctx.fillStyle=p.color;ctx.shadowBlur=6;ctx.shadowColor=p.color;
    ctx.fillText(p.username,p.x,p.y-20);ctx.restore();
  }

  function lighten(h,a){const n=parseInt(h.replace('#',''),16);return `rgb(${Math.min(255,(n>>16)+a)},${Math.min(255,((n>>8)&0xff)+a)},${Math.min(255,(n&0xff)+a)})`;}

  return {init,render,addParticle};
})();
