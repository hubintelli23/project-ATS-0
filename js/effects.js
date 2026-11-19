/* 액팅 소울 : 0 — effects.js  v0.4.0
   이펙트: 베기 궤적(3D 호), 불꽃·빛 입자, 충격파 고리, 단죄 빛기둥, 바닥 공격 예고, 그림자

   ■ 이펙트를 바꾸는 법
     - 모양(텍스처)은 makeTextures 안의 그림 함수를 고친다.
     - 종류별 크기·수명·움직임은 FX.spawn 의 type 분기를 고친다.
     - 나중에 이미지 파일(png/webp) 이펙트를 쓰려면 E.texFrom(이미지) 로 같은 이름의 텍스처를 덮어쓰면 된다. */
(function(){
'use strict';
const E=window.AS3D,M=E.m4,T=E.tex;
const R=(a,b)=>a+Math.random()*(b-a);
let list=[];

function makeTextures(){
  E.canvasTex('glow',128,128,(x)=>{const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128)});
  E.canvasTex('shadow',64,64,(x)=>{const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(0,0,0,.7)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64)});
  // 베기 궤적: 가로 = 휘두르는 방향(끝이 밝음), 세로 = 바깥(위)이 밝음
  E.canvasTex('trail',256,64,(x,w,h)=>{const img=x.createImageData(w,h);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const u=i/(w-1),v=j/(h-1);
    const along=Math.pow(u,1.6)*(1-Math.pow(Math.max(0,u-.92)/.08,2));const across=Math.exp(-Math.pow((v-.12)/.22,2))+.35*Math.exp(-Math.pow((v-.5)/.35,2));
    const a=Math.max(0,Math.min(1,along*across));const k=(j*w+i)*4;img.data[k]=255;img.data[k+1]=255;img.data[k+2]=255;img.data[k+3]=a*255}x.putImageData(img,0,0)});
  // 고리: 세로 가운데가 밝은 띠
  E.canvasTex('band',8,64,(x,w,h)=>{const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.45,'rgba(255,255,255,1)');g.addColorStop(.6,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)});
  E.canvasTex('spark',32,128,(x)=>{const g=x.createLinearGradient(0,0,0,128);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.ellipse(16,64,7,62,0,0,7);x.fill()});
  // 바닥 예고 (위쪽이 공격 방향)
  E.canvasTex('tCircle',256,256,(x)=>{x.fillStyle='rgba(255,255,255,.26)';x.beginPath();x.arc(128,128,124,0,7);x.fill();x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=5;x.stroke()});
  E.canvasTex('tFill',256,256,(x)=>{const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(255,255,255,.15)');g.addColorStop(.92,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.arc(128,128,128,0,7);x.fill()});
  for(const d of [60,70,90,100,110,120])for(const fill of [0,1])E.canvasTex((fill?'cf':'c')+d,256,256,(x)=>{const a=d*Math.PI/360;x.beginPath();x.moveTo(128,128);x.arc(128,128,124,-Math.PI/2-a,-Math.PI/2+a);x.closePath();
    if(fill){const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(255,255,255,.1)');g.addColorStop(.92,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fill()}
    else{x.fillStyle='rgba(255,255,255,.24)';x.fill();x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=5;x.stroke()}});
  E.canvasTex('tLine',64,256,(x)=>{x.fillStyle='rgba(255,255,255,.26)';x.fillRect(2,2,60,252);x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=4;x.strokeRect(2,2,60,252)});
  E.canvasTex('tLineF',64,256,(x)=>{const g=x.createLinearGradient(0,256,0,0);g.addColorStop(0,'rgba(255,255,255,.15)');g.addColorStop(1,'rgba(255,255,255,.6)');x.fillStyle=g;x.fillRect(0,0,64,256)});
}

const FX=window.FX={
  init(){makeTextures()},
  clear(){list=[]},
  /* type
     slash : 베기 궤적 { x,y,z, yaw, roll(0=가로, 1.57=세로), dir(1/-1 휘두르는 방향), r 반지름, col }
     glow  : 빛 덩어리 { x,y,z, size, col }
     spark : 튀는 불꽃 { x,y,z, n 개수, col, speed }
     ring  : 바닥 충격파 { x,z, size, grow, col }
     vring : 세워진 빛 고리(흘려보내기) { x,y,z, size, col }
     beam  : 빛기둥(단죄) { x,z, col }
     motes : 떠오르는 입자(사념 흡수) { x,z, n, col, to:[x,y,z] } */
  spawn(type,o){const b=Object.assign({type,t:0,life:.3,col:[1,1,1],alpha:1},o);
    if(type==='slash'){b.life=o.life||.24}
    if(type==='glow'){b.life=o.life||.22}
    if(type==='ring'){b.life=o.life||.45;b.grow=o.grow===undefined?3:o.grow}
    if(type==='vring'){b.life=o.life||.35}
    if(type==='beam'){b.life=o.life||1.1}
    if(type==='spark'){for(let i=0;i<(o.n||8);i++){const a=R(0,Math.PI*2),up=R(.5,1.5),sp=(o.speed||5)*R(.5,1);
        list.push({type:'p',t:0,life:R(.2,.45),x:o.x,y:o.y,z:o.z,vx:Math.cos(a)*sp,vy:up*sp*.6,vz:Math.sin(a)*sp,g:9,col:o.col||[1,.9,.6],size:R(.06,.12),alpha:1})}return}
    if(type==='motes'){for(let i=0;i<(o.n||20);i++)list.push({type:'p',t:-R(0,.4),life:R(.9,1.4),x:o.x+R(-.6,.6),y:R(.2,2),z:o.z+R(-.6,.6),vx:0,vy:R(.2,.8),vz:0,g:0,to:o.to,col:o.col||[.6,.4,1],size:R(.08,.16),alpha:1});return}
    list.push(b)},
  update(dt){for(const f of list){f.t+=dt;if(f.type==='p'&&f.t>0){if(f.to){const k=Math.min(1,f.t/f.life);const e=k*k;f.x+=(f.to[0]-f.x)*e*.15;f.y+=(f.to[1]-f.y)*e*.15;f.z+=(f.to[2]-f.z)*e*.15;f.y+=f.vy*dt*(1-k)}
      else{f.vy-=f.g*dt;f.x+=f.vx*dt;f.y=Math.max(.02,f.y+f.vy*dt);f.z+=f.vz*dt}}}
    list=list.filter(f=>f.t<f.life)},
  draw(){for(const f of list){if(f.t<0)continue;const k=f.t/f.life,a=(1-k)*f.alpha;
    if(f.type==='slash'){const s=f.r*(.92+.12*k);E.quad(E.geo('arc:160:0.35'),M.trs(f.x,f.y,f.z,0,f.yaw,f.roll||0,s*(f.dir||1),s,s),T.trail,[...f.col,a*1.2],{add:1});
      E.quad(E.geo('arc:160:0.35'),M.trs(f.x,f.y,f.z,0,f.yaw,f.roll||0,s*.96*(f.dir||1),s,s*.96),T.trail,[1,1,1,a*.6],{add:1})}
    else if(f.type==='glow'){const s=f.size*(1+k*.8);E.quad(E.geo('ctr'),M.trs(f.x,f.y,f.z,0,E.yawTo(f.x,f.z),0,s,s,s),T.glow,[...f.col,a],{add:1})}
    else if(f.type==='p'){const s=f.size*(1-k*.5);E.quad(E.geo('ctr'),M.trs(f.x,f.y,f.z,0,E.yawTo(f.x,f.z),0,s,s,s),T.glow,[...f.col,a],{add:1})}
    else if(f.type==='ring'){const s=f.size*(1+f.grow*k);E.quad(E.geo('ring:0.82'),M.trs(f.x,.05,f.z,0,0,0,s,1,s),T.band,[...f.col,a],{add:1})}
    else if(f.type==='vring'){const s=f.size*(1+k*1.5);E.quad(E.geo('ring:0.7'),M.trs(f.x,f.y,f.z,Math.PI/2,E.yawTo(f.x,f.z),0,s,1,s),T.band,[...f.col,a],{add:1})}
    else if(f.type==='beam'){const w=1.4*(1-k*.6),h=9;const yaw=E.yawTo(f.x,f.z);E.quad(E.geo('bb'),M.trs(f.x,0,f.z,0,yaw,0,w,h,1),T.glow,[...f.col,a],{add:1});E.quad(E.geo('bb'),M.trs(f.x,0,f.z,0,yaw,0,w*.35,h,1),T.glow,[1,1,1,a],{add:1})}}},
  // 바닥 그림자
  shadow(x,z,s){E.quad(E.geo('flat'),M.trs(x,.02,z,0,0,0,s*1.6,1,s*1.1),T.shadow,[1,1,1,1])},
  // 공격 예고. e:{x,z,dir}, a:{shape,r,range,ang,len,w,_cx,_cz,parry}, k:진행도 0~1
  telegraph(e,a,k){const col=a.parry?[1,.62,.18,.95]:[1,.22,.25,.95];
    if(a.shape==='circle'){E.quad(E.geo('flat'),M.trs(a._cx,.03,a._cz,0,0,0,a.r*2,1,a.r*2),T.tCircle,col);E.quad(E.geo('flat'),M.trs(a._cx,.04,a._cz,0,0,0,a.r*2*k,1,a.r*2*k),T.tFill,col)}
    else if(a.shape==='cone'){const ang=Math.atan2(e.dir[0],e.dir[1]);const key=[60,70,90,100,110,120].reduce((b,v)=>Math.abs(v-a.ang)<Math.abs(b-a.ang)?v:b,90);
      E.quad(E.geo('flat'),M.trs(e.x,.03,e.z,0,ang,0,a.range*2,1,a.range*2),T['c'+key],col);E.quad(E.geo('flat'),M.trs(e.x,.04,e.z,0,ang,0,a.range*2*k,1,a.range*2*k),T['cf'+key],col)}
    else if(a.shape==='line'){const ang=Math.atan2(e.dir[0],e.dir[1]);E.quad(E.geo('flatF'),M.trs(e.x,.03,e.z,0,ang,0,a.w,1,a.len),T.tLine,col);E.quad(E.geo('flatF'),M.trs(e.x,.04,e.z,0,ang,0,a.w,1,a.len*k),T.tLineF,col)}}
};
})();
