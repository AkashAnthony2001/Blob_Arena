/**
 * Blob Arena - Canvas Renderer
 */
const BlobRenderer = (() => {
  const W=800,H=600;
  let canvas,ctx,myId,obstacles=[],mapIndex=0;
  let particles=[];

  const THEMES=[
    {bg:'#0c0c1a',wall:'#1a1a3a',wallS:'#3a3aff',grid:'#14142a'},
    {bg:'#0a1a0a',wall:'#1a3a1a',wallS:'#3aff3a',grid:'#141a14'},
    {bg:'#1a0a0a',wall:'#3a1a1a',wallS:'#ff3a3a',grid:'#1a1414'},
  ];

  function init(c,id){canvas=c;ctx=c.getContext('2d');myId=id;}
  function setMap(obs,mi){obstacles=obs||[];mapIndex=mi||0;}
  function addParticle(x,y,color,n=10){
    for(let i=0;i<n;i++){
      const a=(Math.PI*2/n)*i+Math.random()*.5, spd=2+Math.random()*4;
      particles.push({x,y,color,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,
        life:1,decay:.03+Math.random()*.04,size:3+Math.random()*5});
    }
  }

  function render(state){
    if(!ctx) return;
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vx*=.92;p.vy*=.92;p.life-=p.decay;p.size*=.97;}

    const t=THEMES[mapIndex%THEMES.length];
    ctx.fillStyle=t.bg; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=t.grid; ctx.lineWidth=1;
    for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.save();ctx.strokeStyle=t.wallS;ctx.lineWidth=3;ctx.shadowBlur=15;ctx.shadowColor=t.wallS;
    ctx.strokeRect(2,2,W-4,H-4);ctx.restore();

    for(const obs of obstacles){
      ctx.save();ctx.shadowBlur=12;ctx.shadowColor=t.wallS;
      ctx.fillStyle=t.wall;ctx.fillRect(obs.x,obs.y,obs.w,obs.h);
      ctx.strokeStyle=t.wallS;ctx.lineWidth=2;ctx.strokeRect(obs.x,obs.y,obs.w,obs.h);ctx.restore();
    }

    for(const p of particles){
      ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.shadowBlur=8;ctx.shadowColor=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    if(state.bullets) for(const b of state.bullets){
      ctx.save();ctx.fillStyle=b.ownerColor;ctx.shadowBlur=10;ctx.shadowColor=b.ownerColor;
      ctx.beginPath();ctx.arc(b.x,b.y,6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x,b.y,2,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    if(state.powerUps) for(const pu of state.powerUps){
      const bob=Math.sin(Date.now()/500+pu.id)*4;
      ctx.save();ctx.translate(pu.x,pu.y+bob);
      ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.strokeStyle=pu.color;ctx.lineWidth=2;
      ctx.shadowBlur=15;ctx.shadowColor=pu.color;ctx.stroke();
      ctx.globalAlpha=.2+Math.abs(Math.sin(Date.now()/400))*.3;
      ctx.fillStyle=pu.color;ctx.fill();ctx.globalAlpha=1;ctx.shadowBlur=0;
      ctx.font='15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(pu.icon||'?',0,1);ctx.restore();
    }

    if(state.players){
      const others=state.players.filter(p=>p.id!==myId);
      const me=state.players.find(p=>p.id===myId);
      for(const p of others) drawBlob(p,false);
      if(me) drawBlob(me,true);
    }
  }

  function drawBlob(p,isMe){
    if(!p.alive) return;
    const r=p.radius||20;
    const now=Date.now();
    ctx.save();
    if(p.powerUps?.shield>now){
      ctx.beginPath();ctx.arc(p.x,p.y,r+8,0,Math.PI*2);
      ctx.strokeStyle='#00F5FF';ctx.lineWidth=3;ctx.shadowBlur=20;ctx.shadowColor='#00F5FF';ctx.stroke();
      ctx.globalAlpha=.12;ctx.fillStyle='#00F5FF';ctx.fill();ctx.globalAlpha=1;ctx.shadowBlur=0;
    }
    if(isMe){
      ctx.beginPath();ctx.arc(p.x,p.y,r+5,0,Math.PI*2);
      ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.shadowBlur=20;ctx.shadowColor=p.color;
    const g=ctx.createRadialGradient(p.x-r*.3,p.y-r*.3,r*.1,p.x,p.y,r);
    g.addColorStop(0,lighten(p.color,80));g.addColorStop(.6,p.color);g.addColorStop(1,darken(p.color,40));
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='rgba(0,0,0,.7)';
    ctx.beginPath();ctx.arc(p.x-r*.3,p.y-r*.15,r*.18,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(p.x+r*.3,p.y-r*.15,r*.18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.8)';
    ctx.beginPath();ctx.arc(p.x-r*.28,p.y-r*.2,r*.07,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(p.x+r*.32,p.y-r*.2,r*.07,0,Math.PI*2);ctx.fill();
    ctx.font=`bold ${Math.max(10,r*.55)}px 'Share Tech Mono',monospace`;
    ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText(p.username,p.x,p.y-r-6);
    const bw=r*2.2,bx=p.x-bw/2,by=p.y+r+4;
    ctx.fillStyle='#1a1a2e';ctx.fillRect(bx,by,bw,4);
    const hp=Math.max(0,p.health/100);
    const hc=hp>.5?'#39FF14':hp>.25?'#FFD700':'#FF2D55';
    ctx.fillStyle=hc;ctx.shadowBlur=5;ctx.shadowColor=hc;ctx.fillRect(bx,by,bw*hp,4);ctx.shadowBlur=0;
    ctx.restore();
  }

  function lighten(h,a){const n=parseInt(h.replace('#',''),16);return `rgb(${Math.min(255,(n>>16)+a)},${Math.min(255,((n>>8)&0xff)+a)},${Math.min(255,(n&0xff)+a)})`;}
  function darken(h,a){const n=parseInt(h.replace('#',''),16);return `rgb(${Math.max(0,(n>>16)-a)},${Math.max(0,((n>>8)&0xff)-a)},${Math.max(0,(n&0xff)-a)})`;}

  return {init,setMap,render,addParticle};
})();
