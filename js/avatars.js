/* 액팅 소울 : 0 — avatars.js  v0.8.0
   아바타(캐릭터) 정의 + 관절 리그 + 동작(애니메이션)

   ■ 캐릭터를 바꾸거나 추가하는 법
     AVATARS 아래에 항목 하나를 추가한다.
       palette : 부위별 색 [R,G,B] (0~1)
       hair    : 'short' | 'messy' | 'long' | 'pony' | 'none'
       outfit  : 'longcoat' | 'jacket' | 'shirt' | 'dress' | 'wrap' | 'cloak'
       hood    : true 이면 후드
       weaponR / weaponL : weapons.js 의 무기 이름
       twoHand : 양손 무기(대검·낫)
       scale   : 키 배율 (1 = 약 1.8m)
       extra   : [관절, 도형, 위치, 회전, 크기, 색이름, {e:발광}] 추가 부품
     나중에 실제 3D 모델(glTF 등)로 바꿀 때는 Avatars.create 가 돌려주는
     객체의 play / update / draw 세 함수만 같은 이름으로 구현하면 된다. */
(window.AS_VERSIONS=window.AS_VERSIONS||{})['avatars.js']='0.8.0';

(function(){
'use strict';
const E=window.AS3D,M=E.m4;

/* ═══════════ 캐릭터 목록 ═══════════ */
const C=(r,g,b)=>[r/255,g/255,b/255];
const AVATARS=window.AVATARS={
  eden:{name:'이든',hair:'short',outfit:'longcoat',weaponR:'sentia',
    palette:{skin:C(236,214,200),hair:C(28,28,34),eye:C(70,70,90),top:C(30,30,36),coat:C(22,22,28),sleeve:C(22,22,28),pants:C(26,26,32),boots:C(18,18,22),accent:C(120,110,150)}},
  kardo:{name:'카르도',hair:'pony',outfit:'shirt',weaponR:'kardo_wood',
    palette:{skin:C(214,180,150),hair:C(82,58,40),eye:C(70,50,40),top:C(150,136,108),sleeve:C(150,136,108),pants:C(84,62,44),boots:C(60,42,30),accent:C(120,100,70)},
    extra:[['chest','box',[0,.02,.12],[0,0,0],[.3,.24,.02],'apron']], paletteExtra:{apron:C(96,72,50)}},
  furor:{name:'푸로르',hair:'messy',outfit:'jacket',weaponR:'furor_great',twoHand:true,scale:.97,
    palette:{skin:C(232,200,180),hair:C(70,46,36),eye:C(210,40,40),top:C(36,34,38),coat:C(30,30,34),sleeve:C(30,30,34),pants:C(52,54,58),boots:C(30,28,28),accent:C(190,60,40)}},
  teror:{name:'테로르',hair:'long',outfit:'longcoat',weaponR:'teror_blade',scale:1.0,
    palette:{skin:C(232,212,206),hair:C(24,20,30),hair2:C(120,60,170),eye:C(140,80,200),top:C(26,22,30),coat:C(78,44,110),sleeve:C(70,40,100),pants:C(22,20,26),boots:C(20,18,24),accent:C(150,90,210)}},
  phobia:{name:'포비아',hair:'none',hood:true,outfit:'wrap',weaponR:'phobia_scythe',twoHand:true,scale:.96,
    palette:{skin:C(232,214,210),hair:C(170,170,180),eye:C(130,110,190),top:C(150,150,160),coat:C(130,130,140),sleeve:C(150,150,160),pants:C(110,70,150),boots:C(50,50,60),accent:C(140,90,200)}},
  // 네시스 (집행자) — 은발에 푸른 브릿지, 검은 후드 코트
  nesis:{name:'네시스',hair:'long',hood:true,outfit:'longcoat',weaponR:'nesis_claustrum',scale:.95,
    palette:{skin:C(240,224,218),hair:C(214,218,228),hair2:C(80,160,215),eye:C(90,170,230),top:C(28,28,34),coat:C(22,22,28),sleeve:C(24,24,30),pants:C(26,26,32),boots:C(18,18,22),accent:C(90,170,230)}},
  fallen:{name:'폴른',hair:'none',hood:true,outfit:'cloak',weaponR:null,scale:.9,hunch:.45,glowEyes:true,
    palette:{skin:C(30,20,30),hair:C(20,14,22),eye:C(255,60,90),top:C(24,16,26),coat:C(20,12,22),sleeve:C(24,16,26),pants:C(18,12,20),boots:C(14,10,16),accent:C(120,40,90)}},
};

/* ═══════════ 뼈대 ═══════════ */
// 이름, 부모, 부모 기준 위치(앞쪽이 +z, 캐릭터의 왼쪽이 +x)
const JOINTS=[
  ['hips',null,[0,.95,0]],['spine','hips',[0,.08,0]],['chest','spine',[0,.2,0]],['neck','chest',[0,.24,0]],['head','neck',[0,.08,0]],
  ['shL','chest',[.2,.17,0]],['elL','shL',[0,-.28,0]],['hdL','elL',[0,-.25,0]],
  ['shR','chest',[-.2,.17,0]],['elR','shR',[0,-.28,0]],['hdR','elR',[0,-.25,0]],
  ['thL','hips',[.1,-.03,0]],['knL','thL',[0,-.44,0]],['ftL','knL',[0,-.42,0]],
  ['thR','hips',[-.1,-.03,0]],['knR','thR',[0,-.44,0]],['ftR','knR',[0,-.42,0]]];
const JI={};JOINTS.forEach((j,i)=>JI[j[0]]=i);

/* ═══════════ 부품 조립 ═══════════ */
// [관절, 도형, 위치, 회전, 크기, 색이름, 옵션]
function buildParts(cfg){const P=[];const add=(...a)=>P.push(a);const PI=Math.PI;
  const longcoat=cfg.outfit==='longcoat',jacket=cfg.outfit==='jacket',cloak=cfg.outfit==='cloak';
  // 몸통
  add('hips','box',[0,-.02,0],[0,0,0],[.32,.18,.2],'pants');
  add('spine','box',[0,.1,0],[0,0,0],[.27,.22,.17],jacket||cfg.outfit==='wrap'?'skin':'top');
  add('chest','box',[0,.11,0],[0,0,0],[.36,.26,.22],'top');
  if(longcoat||jacket)add('chest','box',[0,.12,-.005],[0,0,0],[.4,.29,.25],'coat');
  if(longcoat){add('spine','box',[0,.08,-.005],[0,0,0],[.31,.24,.21],'coat');
    add('hips','cyl:1.35:.95:14',[0,-.78,-.01],[0,0,0],[.42,.82,.3],'coat');}
  if(cfg.outfit==='dress'||cfg.outfit==='wrap')add('hips','cyl:1.3:.95:14',[0,-.4,0],[0,0,0],[.42,.44,.3],cfg.outfit==='wrap'?'pants':'top');
  if(cloak){add('hips','cyl:1.5:.6:12',[0,-.92,0],[0,0,0],[.62,1.15,.5],'coat');add('chest','sphereLo',[0,.12,-.02],[0,0,0],[.5,.42,.4],'coat')}
  // 목·머리
  add('neck','cyl:1:1:8',[0,0,0],[0,0,0],[.09,.1,.09],'skin');
  add('head','sphere',[0,.13,0],[0,0,0],[.25,.28,.25],'skin');
  // 눈: 흰자 + 눈동자
  for(const x of [.052,-.052]){if(!cfg.glowEyes)add('head','box',[x,.118,.113],[0,0,0],[.058,.05,.02],'white',{flat:1,noOut:1});
    add('head','box',[x,.114,.121],[0,0,0],[.032,.046,.012],'eye',{e:cfg.glowEyes?C(255,60,90):null,flat:1,noOut:1})}
  add('head','box',[0,.06,.12],[0,0,0],[.04,.008,.008],'mouth',{flat:1,noOut:1});
  const h=cfg.hair;
  if(h&&h!=='none'){add('head','sphere',[0,.165,-.02],[0,0,0],[.28,.27,.28],'hair');
    // 앞머리: 이마 위에 얹는 세 갈래
    add('head','box',[0,.215,.1],[-.5,0,0],[.11,.07,.04],'hair');add('head','box',[.075,.2,.09],[-.45,0,-.25],[.08,.08,.04],'hair');add('head','box',[-.075,.2,.09],[-.45,0,.25],[.08,.08,.04],'hair');}
  if(h==='messy'){add('head','box',[.1,.16,.06],[0,0,.4],[.06,.14,.1],'hair');add('head','box',[-.1,.16,.06],[0,0,-.4],[.06,.14,.1],'hair');add('head','box',[0,.03,-.11],[0,0,0],[.26,.24,.07],'hair')}
  if(h==='long'){add('head','box',[0,-.08,-.11],[-.08,0,0],[.28,.5,.07],'hair');add('head','box',[.12,.04,-.02],[0,0,.08],[.05,.28,.12],'hair');add('head','box',[-.12,.04,-.02],[0,0,-.08],[.05,.28,.12],'hair2')}
  if(h==='pony'){add('head','cyl:.6:1:8',[0,-.16,-.15],[-.35,0,0],[.07,.22,.07],'hair')}
  if(cfg.hood){add('head','sphere',[0,.15,-.025],[0,0,0],[.33,.32,.33],cloak?'coat':'top');add('head','box',[0,-.03,-.12],[-.2,0,0],[.3,.22,.08],cloak?'coat':'top')}
  // 팔
  for(const s of ['L','R']){const sl=(longcoat||jacket)?'coat':'sleeve';
    add('sh'+s,'sphere',[0,0,0],[0,0,0],[.13,.13,.13],sl);
    add('sh'+s,'limb',[0,0,0],[0,0,0],[.11,.29,.11],sl);
    add('el'+s,'limb',[0,0,0],[0,0,0],[.095,.26,.095],cfg.outfit==='shirt'?'skin':sl);
    add('hd'+s,'sphere',[0,-.03,0],[0,0,0],[.09,.11,.09],cloak?'coat':'skin');
    add('th'+s,'limb',[0,0,0],[0,0,0],[.16,.45,.16],'pants');
    add('kn'+s,'limb',[0,0,0],[0,0,0],[.125,.43,.125],cfg.outfit==='wrap'?'boots':'pants');
    add('ft'+s,'box',[0,-.02,.05],[0,0,0],[.11,.08,.22],'boots');}
  for(const x of cfg.extra||[])P.push(x);
  return P}

/* ═══════════ 동작 ═══════════ */
const ease=t=>t<0?0:t>1?1:t*t*(3-2*t);
function mix(a,b,k){const o={};for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const x=a[key]||[0,0,0],y=b[key]||[0,0,0];o[key]=[x[0]+(y[0]-x[0])*k,x[1]+(y[1]-x[1])*k,x[2]+(y[2]-x[2])*k]}return o}
// 공격 동작: A(준비) → B(휘두름 끝)
const ATK={
  H1:{A:{chest:[0,-.7,0],shR:[-1.35,-1.05,0],elR:[-.25,0,0],hdR:[-.15,0,-.3],thL:[-.25,0,0],knL:[.3,0,0]},
      B:{chest:[.1,.65,0],shR:[-1.35,1.0,0],elR:[0,0,0],hdR:[-.15,0,.3],thL:[-.4,0,0],knL:[.4,0,0]}},
  H2:{A:{chest:[0,.65,0],shR:[-1.3,1.0,0],elR:[-.2,0,0],hdR:[-.15,0,.3],thR:[-.25,0,0],knR:[.3,0,0]},
      B:{chest:[.1,-.7,0],shR:[-1.3,-1.05,0],elR:[0,0,0],hdR:[-.15,0,-.3],thR:[-.4,0,0],knR:[.4,0,0]}},
  V:{A:{chest:[-.28,0,0],shR:[-2.9,0,.05],elR:[-.5,0,0],hdR:[.35,0,0],knL:[.15,0,0],knR:[.15,0,0]},
     B:{chest:[.5,0,0],shR:[-.95,0,0],elR:[0,0,0],hdR:[-.35,0,0],thL:[-.7,0,0],knL:[.7,0,0],thR:[.35,0,0],knR:[.2,0,0],_down:.12}},
  stab:{A:{chest:[0,-.55,0],shR:[.45,0,-.15],elR:[-1.9,0,0],hdR:[-.1,0,0]},
        B:{chest:[.15,.4,0],shR:[-1.5,.1,0],elR:[0,0,0],hdR:[0,0,0],thL:[-.75,0,0],knL:[.6,0,0],thR:[.4,0,0],_down:.08}},
  spin:{A:{chest:[0,-.9,0],shL:[0,0,1.3],shR:[-.2,0,-1.3],hdR:[-1.3,0,0]},
        B:{chest:[0,2.4,0],shL:[0,0,1.3],shR:[-.2,0,-1.3],hdR:[-1.3,0,0]}},
  cast:{A:{shL:[-1.7,0,.25],shR:[-1.7,0,-.25],elL:[-.3,0,0],elR:[-.3,0,0],chest:[-.1,0,0]},
        B:{shL:[-2.7,0,.7],shR:[-2.7,0,-.7],elL:[0,0,0],elR:[0,0,0],chest:[-.25,0,0]}},
};
function attackPose(mo,k,rest){const a=ATK[mo]||ATK.H1;
  if(k<.3)return mix(rest,a.A,ease(k/.3));
  if(k<.55)return mix(a.A,a.B,ease((k-.3)/.25));
  return mix(a.B,rest,ease((k-.55)/.45))}
function restPose(cfg,armed,armedL){const p={shL:[.05,0,.13],shR:armed?[-.28,0,-.12]:[.05,0,-.13],elR:armed?[-.55,0,0]:[-.1,0,0],elL:[-.1,0,0],hdR:armed?[-.85,0,0]:[0,0,0]};
  if(armedL)Object.assign(p,{shL:[-.28,0,.12],elL:[-.55,0,0],hdL:[-.85,0,0]});
  if(cfg.twoHand&&armed)Object.assign(p,{shR:[-.95,.25,-.05],elR:[-.75,0,0],hdR:[-.35,0,0]});
  if(cfg.hunch)Object.assign(p,{spine:[cfg.hunch*.5,0,0],chest:[cfg.hunch*.6,0,0],neck:[-cfg.hunch*.6,0,0],shL:[-.5,0,.3],shR:[-.5,0,-.3],elL:[-.6,0,0],elR:[-.6,0,0]});
  return p}
function twoHand(p){const r=p.shR||[0,0,0];p.shL=[r[0],-r[1],-r[2]-.38];p.shR=[r[0],r[1],r[2]+.38];p.elL=(p.elR||[0,0,0]).slice();return p}
function mirror(p){const o={};for(const k in p){const v=p[k];if(k[0]==='_'){o[k]=v;continue}const m=k.endsWith('L')?k.slice(0,-1)+'R':k.endsWith('R')?k.slice(0,-1)+'L':k;o[m]=[v[0],-v[1],-v[2]]}return o}
function posePose(cfg,name,k,t,armed,armedL){const rest=restPose(cfg,armed,armedL);let p;
  switch(name){
    case'run':{const ph=t*11,s=Math.sin(ph);p=Object.assign({},rest,{chest:[.2+(cfg.hunch||0)*.5,0,0],thL:[-.75*s,0,0],thR:[.75*s,0,0],knL:[.55+.55*Math.sin(ph+1.6),0,0],knR:[.55-.55*Math.sin(ph+1.6),0,0],shL:[.55*s+(armedL?-.3:0),0,.15]});
      if(!armed)p.shR=[-.55*s,0,-.15];p._bob=Math.abs(Math.cos(ph))*.05;break}
    case'dodge':p=Object.assign({},rest,{chest:[.7,0,0],spine:[.3,0,0],thL:[-1.3,0,0],knL:[1.7,0,0],thR:[.5,0,0],knR:[1.1,0,0],shL:[.7,0,.3],shR:[.7,0,-.3],_down:.32});break;
    case'parry':p=Object.assign({},rest,{chest:[0,.35,0],shR:[-1.25,.75,0],elR:[-.9,0,0],hdR:[-.4,0,1.1],thL:[-.3,0,0],knL:[.35,0,0],knR:[.25,0,0],_down:.05});break;
    case'hurt':p=Object.assign({},rest,{chest:[-.38,0,.1],head:[-.3,0,0],shL:[.4,0,.4],shR:[.3,0,-.4]});break;
    case'stun':p=Object.assign({},rest,{spine:[.25,0,0],chest:[.35,0,.12],head:[.45,0,0],shL:[.15,0,.05],shR:[.15,0,-.05],elR:[-.2,0,0],hdR:[-.2,0,0],knL:[.45,0,0],knR:[.45,0,0],thL:[-.3,0,0],thR:[-.3,0,0],_down:.12});break;
    case'dead':p=Object.assign({},rest,{chest:[-.2,0,0],shL:[-.3,0,1.2],shR:[-.3,0,-1.2],_pitch:-1.45,_down:.75});break;
    case'cast':p=attackPose('cast',k,rest);break;
    case'charge':{const tr=Math.sin(t*40)*.02;p=Object.assign({},rest,ATK.V.A);p.chest=[-.3+tr,-.2,0];p.thL=[-.35,0,0];p.knL=[.45,0,0];p.knR=[.3,0,0];p._down=.08;break}
    case'dash':p=Object.assign({},rest,{chest:[.55,0,0],spine:[.2,0,0],shL:[.9,0,.25],shR:[.7,0,-.2],elR:[-.2,0,0],hdR:[-.5,0,0],thL:[-.9,0,0],knL:[.8,0,0],thR:[.7,0,0],knR:[.6,0,0],_down:.1});break;
    case'jump':p=Object.assign({},rest,{chest:[.1,0,0],thL:[-1.0,0,0],knL:[1.4,0,0],thR:[-.35,0,0],knR:[1.0,0,0],shL:[-.6,0,.5]});break;
    case'plunge':p=Object.assign({},rest,{chest:[.4,0,0],shR:[-.35,0,-.05],elR:[-.15,0,0],hdR:[.15,0,0],thL:[-1.1,0,0],knL:[1.5,0,0],thR:[-.6,0,0],knR:[1.2,0,0]});break;
    case'idle':p=Object.assign({},rest);p.chest=[(p.chest?p.chest[0]:0)+Math.sin(t*2)*.025,0,0];p._bob=Math.sin(t*2)*.008;break;
    default:p=attackPose(name,k,rest)}
  if(cfg.twoHand&&!['run','hurt','dead','stun','dash','jump'].includes(name))twoHand(p);
  return p}

/* ═══════════ 생성 ═══════════ */
window.Avatars={create(id,opt){const cfg=Object.assign({},AVATARS[id]||AVATARS.eden,opt||{});const pal=Object.assign({white:[.96,.95,.97],mouth:[.55,.35,.35]},cfg.palette,cfg.paletteExtra||{});
  const parts=buildParts(cfg).map(([j,geo,pos,rot,scl,col,o])=>({j:JI[j],g:E.geo(geo),M:M.trs(pos[0],pos[1],pos[2],rot[0],rot[1],rot[2],scl[0],scl[1],scl[2]),c:pal[col]||pal.top||[1,0,1],o:o||{}}));
  const rot=JOINTS.map(()=>[0,0,0]);let down=0,pitch=0,bob=0,target=null,rate=18,t0=0;
  const W=JOINTS.map(()=>null);
  const self={id,cfg,weaponR:cfg.weaponR,weaponL:cfg.weaponL,scale:cfg.scale||1,
    // name: idle | run | dodge | parry | hurt | stun | dead | cast | H1 | H2 | V | stab | spin, k: 동작 진행도 0~1
    play(name,k){target=posePose(cfg,name,k||0,performance.now()/1000,!!self.weaponR,!!self.weaponL);rate=(name==='H1'||name==='H2'||name==='V'||name==='stab'||name==='spin'||name==='plunge'||name==='dash')?32:name==='dead'?5:16},
    update(dt){if(!target)return;const a=1-Math.exp(-rate*dt);
      for(let i=0;i<JOINTS.length;i++){const tg=target[JOINTS[i][0]]||[0,0,0],r=rot[i];r[0]+=(tg[0]-r[0])*a;r[1]+=(tg[1]-r[1])*a;r[2]+=(tg[2]-r[2])*a}
      down+=((target._down||0)-down)*a;pitch+=((target._pitch||0)-pitch)*a;bob=target._bob||0},
    // 관절의 월드 행렬 (무기·이펙트 위치 계산용)
    joint(name){return W[JI[name]]},
    draw(x,y,z,yaw,o={}){const s=self.scale;const root=M.trs(x,y+bob-down*s,z,pitch,yaw,o.roll||0,s,s,s);
      for(let i=0;i<JOINTS.length;i++){const [,par,off]=JOINTS[i];const r=rot[i];const L=M.trs(off[0],off[1],off[2],r[0],r[1],r[2]);W[i]=M.mul(par?W[JI[par]]:root,L)}
      const outline=o.outline===undefined?.014:o.outline,a=o.alpha===undefined?1:o.alpha;
      for(const p of parts){const c=o.tint?[p.c[0]*o.tint[0],p.c[1]*o.tint[1],p.c[2]*o.tint[2]]:p.c;
        E.mesh(p.g,M.mul(W[p.j],p.M),{c,e:p.o.e||o.emit,a,flash:o.flash,outline:p.o.noOut?0:outline,flat:p.o.flat})}
      if(window.Weapons){if(self.weaponR)Weapons.draw(self.weaponR,W[JI.hdR],{flash:o.flash,alpha:a,outline});if(self.weaponL)Weapons.draw(self.weaponL,W[JI.hdL],{flash:o.flash,alpha:a,outline})}}};
  self.play('idle',0);return self}};
})();
