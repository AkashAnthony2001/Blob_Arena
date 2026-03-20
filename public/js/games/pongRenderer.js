/**
 * Pong Wars - Canvas Renderer
 */
const PongRenderer = (() => {
  const W=800,H=600;
  let canvas,ctx,myId;
  let particles=[];

  function init(c,id){canvas=c;ctx=c.getContext('2d');myId=id;}

  function addParticle(x,y,color){
    for(let i=0;i<6;i++){
      const a=Math.random()*Math.PI*2,spd=2+Math.random()*4;
      particles.push({x,y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,color,life:1,decay:.05,size:3+Math.random()*3});
    }
  }

  function render(state){
    if(!ctx) return;
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vx*=.9;p.vy*=.9;p.life-=p.decay;}

    // Background
    ctx.fillStyle='#08080f';ctx.fillRect(0,0,W,H);
    // Center line (dashed)
    ctx.setLineDash([12,10]);ctx.strokeStyle='#2a2a4a';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke();
    ctx.setLineDash([]);
    // Center circle
    ctx.beginPath();ctx.arc(W/2,H/2,60,0,Math.PI*2);ctx.strokeStyle='#1a1a3a';ctx.lineWidth=2;ctx.stroke();

    // Subtle team zones
    const lg=ctx.createLinearGradient(0,0,W/2,0);
    lg.addColorStop(0,'rgba(255,45,85,0.04)');lg.addColorStop(1,'transparent');
    ctx.fillStyle=lg;ctx.fillRect(0,0,W/2,H);
    const rg=ctx.createLinearGradient(W/2,0,W,0);
    rg.addColorStop(0,'transparent');rg.addColorStop(1,'rgba(0,245,255,0.04)');
    ctx.fillStyle=rg;ctx.fillRect(W/2,0,W/2,H);

    // Particles
    for(const p of particles){
      ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.shadowBlur=8;ctx.shadowColor=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    // Power-ups
    if(state.powerUps) for(const pu of state.powerUps){
      const bob=Math.sin(Date.now()/400+pu.id)*.4;
      ctx.save();ctx.translate(pu.x,pu.y);ctx.scale(1+bob*.1,1+bob*.1);
      ctx.shadowBlur=15;ctx.shadowColor=pu.color;
      ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.strokeStyle=pu.color;ctx.lineWidth=2;ctx.stroke();
      ctx.globalAlpha=.2+Math.abs(Math.sin(Date.now()/500))*.3;
      ctx.fillStyle=pu.color;ctx.fill();ctx.globalAlpha=1;ctx.shadowBlur=0;
      ctx.font='13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(pu.icon||'?',0,1);ctx.restore();
    }

    // Paddles
    if(state.players) for(const p of state.players){
      const isMe=p.id===myId;
      ctx.save();ctx.shadowBlur=isMe?20:10;ctx.shadowColor=p.color;
      // Paddle body
      const grad=ctx.createLinearGradient(p.x,p.y,p.x+p.w,p.y+p.h);
      grad.addColorStop(0,p.color);grad.addColorStop(1,darken(p.color,40));
      ctx.fillStyle=grad;
      roundRect2(ctx,p.x,p.y,p.w,p.h,4);ctx.fill();
      if(isMe){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}
      // Power-up glow
      if(p.hasPowerUp){ctx.shadowBlur=25;ctx.strokeStyle='#FFD700';ctx.lineWidth=2;roundRect2(ctx,p.x-2,p.y-2,p.w+4,p.h+4,5);ctx.stroke();}
      // Name
      ctx.shadowBlur=0;ctx.font='9px Share Tech Mono,monospace';ctx.textAlign='center';ctx.fillStyle=p.color;
      const nx=p.x+p.w/2, ny=p.team==='left'?p.y-4:p.y+p.h+12;
      ctx.fillText(p.username,nx,ny);
      ctx.restore();
    }

    // Balls
    if(state.balls) for(const b of state.balls){
      // Trail
      if(b.trail) for(let i=0;i<b.trail.length;i++){
        ctx.save();ctx.globalAlpha=(i/b.trail.length)*.4;
        ctx.fillStyle='#ffffff';ctx.beginPath();
        ctx.arc(b.trail[i].x,b.trail[i].y,b.r*(i/b.trail.length),0,Math.PI*2);ctx.fill();ctx.restore();
      }
      ctx.save();ctx.shadowBlur=20;ctx.shadowColor='#fff';
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(200,220,255,.8)';ctx.beginPath();ctx.arc(b.x-b.r*.3,b.y-b.r*.3,b.r*.4,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  function roundRect2(ctx,x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();
  }
  function darken(h,a){const n=parseInt(h.replace('#',''),16);return `rgb(${Math.max(0,(n>>16)-a)},${Math.max(0,((n>>8)&0xff)-a)},${Math.max(0,(n&0xff)-a)})`;}

  return {init,render,addParticle};
})();
