/* 액팅 소울 : 0 — stages.js  v0.4.0
   배경(전투 무대): 바닥, 소품, 먼 배경, 조명, 안개, 떠다니는 입자

   ■ 배경을 바꾸거나 추가하는 법
     STAGES 아래에 항목 하나를 추가하고 action.js 의 보스 정의(stage)에 이름을 적는다.
       sky     : index.html 의 하늘 배경 CSS 이름 (forge / wall / forest / shrine …)
       ground  : 바닥 색, fog: 안개 색, light: 빛 방향, lightC: 빛 색, rim: 가장자리 빛 색
       amb     : 떠다니는 입자 { col 색, up: true=위로 / false=아래로 }
       props(r, add) : 소품 배치. add(도형, x, z, {y, rot:[x,y,z], s:[x,y,z], c, e}) 로 놓는다.
       far(r, add)   : 경기장 밖 먼 배경 (안개에 묻히는 실루엣) */
(function(){
'use strict';
const E=window.AS3D,M=E.m4;
const C=(r,g,b)=>[r/255,g/255,b/255];
const ARENA=11;
const ring=(n,rad,fn)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2;fn(Math.cos(a)*rad,Math.sin(a)*rad,a,i)}};

const STAGES=window.STAGES={
  // 카르도의 대장간 뒤뜰
  forge:{sky:'forge',ground:C(92,62,44),fog:C(34,20,14),light:[.5,.8,.3],lightC:[1.08,.92,.8],rim:[1,.55,.25],gl:[1,.55,.2],amb:{col:[1,.6,.25],up:true},
    props(r,add){add('box',-5.5,-5.5,{s:[2.4,1.5,1.5],c:C(56,40,32),rot:[0,.4,0]});add('box',-5.5,-5.5,{y:1.5,s:[1.8,.35,1.1],c:C(255,120,30),e:C(230,90,20),rot:[0,.4,0]});
      add('cyl:1:.6:10',-5.5,-5.5,{y:1.85,s:[.7,2.6,.7],c:C(50,38,32),rot:[0,.4,0]});
      add('box',4.5,-6,{s:[.9,.6,.5],c:C(70,70,76),rot:[0,-.3,0]});add('box',4.5,-6,{y:.6,s:[1.2,.18,.45],c:C(90,90,98),rot:[0,-.3,0]});
      for(let i=0;i<5;i++)add('cyl:1:1:12',6+r()*3,-1+r()*6,{s:[.9,1.1,.9],c:C(96,64,40)});
      for(let i=0;i<4;i++)add('box',-7+i*.5,4+r(),{s:[.12,1.4,.12],c:C(110,80,50),rot:[0,0,.15]});
      ring(18,13,(x,z,a)=>add('box',x,z,{s:[.22,1.5,.22],c:C(80,58,40),rot:[0,-a,0]}))},
    far(r,add){ring(12,30,(x,z,a)=>{const h=4+r()*5;add('box',x,z,{s:[6,h,4],c:C(40,26,20),rot:[0,-a,0]});add('cone4',x,z,{y:h,s:[7,2.5,5],c:C(36,24,18),rot:[0,-a+.78,0]})})}},
  // 경계의 성벽 — 무너진 고가도로
  wall:{sky:'wall',ground:C(84,76,76),fog:C(44,30,30),light:[.3,.85,.4],lightC:[1.05,.9,.88],rim:[1,.4,.3],gl:[1,.35,.25],amb:{col:[1,.45,.3],up:true},
    props(r,add){for(let i=-2;i<=2;i++)add('box',i*5.5,-10,{s:[1.6,7,1.6],c:C(96,90,90)});add('box',0,-10,{y:7,s:[26,1.1,3],c:C(84,78,78)});
      add('box',-9,-4,{s:[4,.7,2.4],c:C(80,74,74),rot:[.15,.6,.25]});
      for(let i=0;i<16;i++){const a=r()*Math.PI*2,d=8+r()*5;add('box',Math.cos(a)*d,Math.sin(a)*d,{s:[.6+r()*1.6,.4+r()*1.2,.6+r()*1.4],c:C(74,70,70),rot:[r()*.3,r()*3,r()*.3]})}
      for(let i=0;i<5;i++)add('cyl:1:1:8',-3+i*1.6,9+r(),{y:0,s:[.08,1.8+r(),.08],c:C(60,56,56),rot:[0,0,(r()-.5)*.5]})},
    far(r,add){ring(16,32,(x,z,a)=>{const h=5+r()*12;add('box',x,z,{s:[4+r()*4,h,4],c:C(52,40,40),rot:[0,-a,0]})})}},
  // 통곡의 숲 — 뒤틀린 나무
  forest:{sky:'forest',ground:C(50,62,54),fog:C(20,26,23),light:[.2,.9,.35],lightC:[.85,.95,.92],rim:[.6,.85,.75],gl:[.5,.65,.6],amb:{col:[.7,.85,.8],up:false},
    props(r,add){for(let i=0;i<24;i++){const a=r()*Math.PI*2,d=9+r()*6,x=Math.cos(a)*d,z=Math.sin(a)*d,h=6+r()*5,lean=(r()-.5)*.5;
        add('cyl:1.3:.7:8',x,z,{s:[.5+r()*.4,h,.5+r()*.4],c:C(38,34,30),rot:[0,r()*3,lean]});
        add('cone',x+Math.sin(lean)*-h*.6,z,{y:h*.55,s:[2.4+r()*1.5,h*.6,2.4+r()*1.5],c:C(28,40,34),rot:[0,0,lean*.6]})}
      for(let i=0;i<10;i++){const a=r()*Math.PI*2,d=4+r()*6;add('sphereLo',Math.cos(a)*d,Math.sin(a)*d,{y:.1,s:[.6+r()*.8,.4+r()*.4,.6+r()*.8],c:C(62,70,64)})}},
    far(r,add){ring(20,30,(x,z,a)=>{const h=10+r()*8;add('cone',x,z,{s:[6,h,6],c:C(22,30,26)})})}},
  // 침묵의 마을 · 신성한 사당
  shrine:{sky:'shrine',ground:C(60,54,76),fog:C(18,14,28),light:[.35,.9,.2],lightC:[.9,.88,1.05],rim:[.65,.5,1],gl:[.6,.5,1],amb:{col:[.7,.6,1],up:true},
    props(r,add){ring(10,12,(x,z)=>{add('cyl:1:1:10',x,z,{s:[1,5,1],c:C(84,78,96)});add('box',x,z,{y:5,s:[1.4,.3,1.4],c:C(70,64,82)})});
      add('box',0,-9,{s:[3.4,1.2,2],c:C(90,84,104)});add('box',0,-9,{y:1.2,s:[2.6,.25,1.4],c:C(100,94,116)});
      add('box',0,-9,{y:1.45,s:[.12,1.8,.12],c:C(200,190,255),e:C(150,120,255)});
      for(const s of [-1,1]){add('box',s*3.2,-9,{s:[.35,4.2,.35],c:C(60,40,50)});}add('box',0,-9,{y:4.2,s:[7.6,.35,.5],c:C(70,44,56)});add('box',0,-9,{y:3.6,s:[6.6,.22,.35],c:C(70,44,56)});
      for(let i=0;i<6;i++){const a=r()*Math.PI*2,d=6+r()*3;add('cyl:1:1:6',Math.cos(a)*d,Math.sin(a)*d,{s:[.25,.7,.25],c:C(70,64,80)});add('sphereLo',Math.cos(a)*d,Math.sin(a)*d,{y:.75,s:[.22,.22,.22],c:C(220,200,255),e:C(170,140,255)})}},
    far(r,add){ring(14,30,(x,z,a)=>{const h=3+r()*4;add('box',x,z,{s:[5,h,4],c:C(30,26,40),rot:[0,-a,0]});add('cone4',x,z,{y:h,s:[6.5,2.6,5],c:C(28,24,38),rot:[0,-a+.78,0]})})}},
};

function rng(seed){let s=seed;return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646}}
let cur=null,props=[],far=[],amb=[];
function newAmb(init){const a=Math.random()*Math.PI*2,d=Math.random()*ARENA*1.2;return{x:Math.cos(a)*d,z:Math.sin(a)*d,y:init?Math.random()*6:(cur.amb.up?0:6),v:(cur.amb.up?1:-1)*(.3+Math.random()*.6),s:.05+Math.random()*.08,w:Math.random()*6}}
window.Stages={ARENA,
  build(name){cur=STAGES[name]||STAGES.forge;props=[];far=[];const r=rng(name.length*977+13);
    const mk=(list)=>(g,x,z,o={})=>{const rot=o.rot||[0,0,0],s=o.s||[1,1,1];list.push({g:E.geo(g),M:M.trs(x,o.y||0,z,rot[0],rot[1],rot[2],s[0],s[1],s[2]),c:o.c||[.5,.5,.5],e:o.e})};
    cur.props(r,mk(props));if(cur.far)cur.far(r,mk(far));
    amb=[];for(let i=0;i<46;i++)amb.push(newAmb(true));
    E.env({fog:cur.fog,light:cur.light,lightC:cur.lightC,rim:cur.rim,gl:cur.gl,arena:ARENA,fogN:9,fogF:34});
    return cur},
  sky(){return cur?cur.sky:'black'},
  update(dt){for(const a of amb){a.y+=a.v*dt*.6;a.w+=dt;if(a.y>7||a.y<0)Object.assign(a,newAmb(false))}},
  // 바닥과 소품 (불투명) — 캐릭터보다 먼저 그린다
  drawSolid(){for(const p of far)E.mesh(p.g,p.M,{c:p.c,e:p.e});
    E.mesh(E.geo('disc'),M.trs(0,0,0,0,0,0,ARENA*1.45,1,ARENA*1.45),{c:cur.ground,ground:1});
    for(const p of props)E.mesh(p.g,p.M,{c:p.c,e:p.e,outline:.03})},
  // 떠다니는 입자 (가산) — 마지막에 그린다
  drawAmbient(){const c=cur.amb.col;for(const a of amb){const f=.5+.5*Math.sin(a.w*3);E.quad(E.geo('ctr'),M.trs(a.x,a.y,a.z,0,E.yawTo(a.x,a.z),0,a.s*3,a.s*3,a.s*3),E.tex.glow,[c[0],c[1],c[2],.3+.4*f],{add:1})}}
};
})();
