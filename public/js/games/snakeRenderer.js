/**
 * Snake Royale - Canvas Renderer
 */
const SnakeRenderer = (() => {
  let canvas,ctx,myId,grid={cols:40,rows:30,cellSize:20};

  function init(c,id){canvas=c;ctx=c.getContext('2d');myId=id;}
  function setGrid(g){grid=g;}

  function render(state){
    if(!ctx) return;
    const {cellSize:cs,cols,rows}=grid;
    // Background
    ctx.fillStyle='#060610';ctx.fillRect(0,0,canvas.width,canvas.height);
    // Grid
    ctx.strokeStyle='#11112a';ctx.lineWidth=.5;
    for(let x=0;x<=cols;x++){ctx.beginPath();ctx.moveTo(x*cs,0);ctx.lineTo(x*cs,rows*cs);ctx.stroke();}
    for(let y=0;y<=rows;y++){ctx.beginPath();ctx.moveTo(0,y*cs);ctx.lineTo(cols*cs,y*cs);ctx.stroke();}

    // Food
    if(state.food) for(const f of state.food){
      const fx=f.x*cs+cs/2, fy=f.y*cs+cs/2;
      const pulse=Math.sin(Date.now()/300+f.id)*2;
      ctx.save();
      ctx.shadowBlur=f.golden?20:10;
      ctx.shadowColor=f.golden?'#FFD700':'#FF2D55';
      ctx.fillStyle=f.golden?'#FFD700':'#FF2D55';
      if(f.golden){
        // Star shape
        ctx.beginPath();
        for(let i=0;i<5;i++){
          const a=((i*4)/5*Math.PI)-Math.PI/2;
          const ai=((i*4+2)/5*Math.PI)-Math.PI/2;
          if(i===0)ctx.moveTo(fx+Math.cos(a)*(6+pulse),fy+Math.sin(a)*(6+pulse));
          else ctx.lineTo(fx+Math.cos(a)*(6+pulse),fy+Math.sin(a)*(6+pulse));
          ctx.lineTo(fx+Math.cos(ai)*3,fy+Math.sin(ai)*3);
        }
        ctx.closePath();ctx.fill();
      } else {
        ctx.beginPath();ctx.arc(fx,fy,4+pulse*.5,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }

    // Snakes
    if(state.players) for(const p of state.players){
      if(!p.body||p.body.length===0) continue;
      const isMe=p.id===myId;
      ctx.save();
      ctx.shadowBlur=isMe?15:8;
      ctx.shadowColor=p.color;

      // Body
      for(let i=p.body.length-1;i>=0;i--){
        const seg=p.body[i];
        const alpha=!p.alive?.4:Math.max(.2,1-i/p.body.length*.7);
        ctx.globalAlpha=alpha;
        const size=i===0?cs-2:cs-4;
        const off=(cs-size)/2;
        const r=i===0?6:4;
        ctx.fillStyle=p.color;
        roundRect(ctx,seg.x*cs+off,seg.y*cs+off,size,size,r);
        ctx.fill();
        // Head highlight
        if(i===0){
          ctx.globalAlpha=alpha*.3;
          ctx.fillStyle='#fff';
          roundRect(ctx,seg.x*cs+off+2,seg.y*cs+off+2,size/2,size/3,2);
          ctx.fill();
        }
      }
      ctx.globalAlpha=1;

      // Eyes on head
      if(p.body.length>0&&p.alive){
        const h=p.body[0];
        ctx.shadowBlur=0;
        ctx.fillStyle='#000';
        ctx.beginPath();ctx.arc(h.x*cs+5,h.y*cs+5,2,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(h.x*cs+cs-5,h.y*cs+5,2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';
        ctx.beginPath();ctx.arc(h.x*cs+5.5,h.y*cs+4.5,.8,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(h.x*cs+cs-4.5,h.y*cs+4.5,.8,0,Math.PI*2);ctx.fill();
        // Name above head
        ctx.shadowBlur=6;ctx.shadowColor=p.color;
        ctx.font=`bold 10px 'Share Tech Mono',monospace`;
        ctx.textAlign='center';ctx.fillStyle='#fff';
        ctx.fillText(p.username,h.x*cs+cs/2,h.y*cs-3);
        // Length badge
        ctx.fillStyle=p.color;ctx.font='9px monospace';
        ctx.fillText(`${p.body.length}`,h.x*cs+cs/2,h.y*cs+cs+10);
      }
      ctx.restore();
    }
  }

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
    ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);
    ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();
  }

  return {init,setGrid,render};
})();
