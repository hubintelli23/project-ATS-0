/* 액팅 소울 : 0 — action.js  v0.3.0
   3D 실시간 전투의 규칙(입력, 카메라, 보스 패턴, 판정, 튜토리얼, HUD)
   그리는 일은 다른 파일이 맡는다.
     engine.js  : 3D 엔진       avatars.js : 캐릭터
     weapons.js : 무기          effects.js : 이펙트       stages.js : 배경 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const R=(a,b)=>a+Math.random()*(b-a);

/* ═══════════════ 초기화 ═══════════════ */
const E=window.AS3D;const ARENA=Stages.ARENA;const CAM={x:0,y:5,z:8,tx:0,ty:1,tz:0};
let cv,initOK=false;
async function init(){if(initOK)return true;cv=$('gl');if(!E.init(cv))return false;FX.init();initOK=true;return true}

/* ═══════════════ 상태 ═══════════════ */
const S={running:false,paused:false,tele:[]};
let P,ENS,DEF,ctx,TS=1,hitstop=0,slowT=0,shakeT=0,curId,resolveFn,tut=null,cine=null,lastT=0,camDir=[0,1];

const ICON={sentia:'img/ic_sentia.webp',sensus:'img/ic_sensus.webp',kardo:'img/kardo.webp',phobia:'img/phobia.webp'};

/* ═══════════════ 적 정의 ═══════════════ */
// shape: circle(r) / cone(range, ang) / line(len,w). parry=흘려보낼 수 있음(주황), 아니면 회피(빨강)
const DEFS={
  kardo:{name:'카르도',sub:'스승 · 대장간 뒤뜰 대련',tex:'kardo',H:2.05,hp:120,speed:2.2,pref:2.0,gap:1.1,stage:'forge',tutorial:1,
    atks:{jab:{mo:'stab',n:'찌르기',wind:.65,shape:'cone',range:2.7,ang:70,dmg:6,rec:.6,parry:1},
          heavy:{mo:'V',n:'내려치기',wind:1.15,shape:'cone',range:2.9,ang:90,dmg:15,rec:1,parry:1,heavy:1},
          slam:{mo:'V',n:'땅울림',wind:1.25,shape:'circle',r:3.2,dmg:12,rec:1}},
    pick(e,d){return d<3.2?(Math.random()<.5?'heavy':Math.random()<.5?'jab':'slam'):null}},
  furor:{name:'푸로르',sub:'우니타스 몰레스 · 분노의 대검',tex:'furor',H:1.95,hp:600,speed:2.6,pref:2.0,gap:.9,stage:'wall',label:'제압',
    atks:{sweep:{mo:'H1',n:'열기 베기',wind:.75,shape:'cone',range:3.0,ang:120,dmg:8,scale:2,rec:.7,parry:1},
          leap:{mo:'V',n:'업화 일격',wind:1.15,shape:'circle',r:2.8,dmg:16,scale:4,rec:1.1,leap:1,heavy:1},
          wave:{mo:'V',n:'화염파',wind:.95,shape:'line',len:8,w:1.7,dmg:10,scale:2,rec:.8}},
    pick(e,d){if(d>4.5)return Math.random()<.5?'leap':'wave';return Math.random()<.6?'sweep':(Math.random()<.5?'leap':'wave')}},
  fallen:{name:'폴른 무리',sub:'자아를 잃고 변이한 자들',tex:'fallen',H:1.45,hp:100,count:3,speed:2.5,pref:1.6,gap:1.4,stage:'forest',noJudge:1,light:1,
    atks:{lunge:{mo:'stab',n:'달려들기',wind:.6,shape:'cone',range:2.2,ang:80,dmg:7,rec:.8,parry:1}},
    pick(e,d){return d<2.4?'lunge':null}},
  teror:{name:'테로르',sub:'두려움의 바디움 · 마검',tex:'teror',H:2.0,hp:660,speed:3.0,pref:2.2,gap:.8,stage:'shrine',
    atks:{stab:{mo:'stab',n:'그림자 찌르기',wind:.6,shape:'cone',range:2.5,ang:60,dmg:8,scale:2,rec:.7,parry:1,fear:1,blink:1},
          cut:{mo:'H1',n:'영혼 절단',wind:1.0,shape:'cone',range:3.1,ang:100,dmg:20,scale:2,rec:1,parry:1,heavy:1},
          hands:{mo:'cast',n:'검은 손',wind:1.05,shape:'circle',r:1.9,dmg:12,scale:1,rec:.6,atPlayer:1}},
    pick(e,d){const r=Math.random();if(d>4)return r<.55?'stab':'hands';return r<.4?'cut':r<.7?'stab':'hands'}},
  phobia:{name:'포비아',sub:'레파르토르 간부 · 두려움의 성흔',tex:'phobia',H:1.95,hp:700,speed:2.6,pref:2.6,gap:.85,stage:'shrine',
    atks:{chain:{mo:'stab',n:'사슬 휘감기',wind:.9,shape:'line',len:8.5,w:1.3,dmg:11,scale:4,rec:.8,bind:1},
          reap:{mo:'V',n:'낫 내려찍기',wind:1.1,shape:'cone',range:3.3,ang:110,dmg:24,scale:4,rec:1,parry:1,heavy:1},
          mist:{mo:'spin',n:'안개 가시',wind:.85,shape:'circle',r:3.3,dmg:10,scale:4,rec:.7},
          regen:{mo:'cast',n:'성흔 재생',wind:1.3,shape:'none',dmg:0,rec:.4,regen:1}},
    pick(e,d){if(!e.barrier&&e.brokenT<=0&&Math.random()<.6)return'regen';if(d>4.5)return Math.random()<.7?'chain':'reap';const r=Math.random();return r<.35?'reap':r<.65?'mist':'chain'}}
};

/* ═══════════════ 입력 ═══════════════ */
const IN={jx:0,jy:0,keys:{},q:{}};
function press(k){IN.q[k]=1}
function setupInput(){
  const zone=$('joyZone'),base=$('joyBase'),knob=$('joyKnob');let id=null,ox=0,oy=0;
  zone.addEventListener('pointerdown',e=>{id=e.pointerId;zone.setPointerCapture(id);const r=zone.getBoundingClientRect();ox=e.clientX;oy=e.clientY;
    base.style.left=(ox-r.left)+'px';base.style.top=(oy-r.top)+'px';base.classList.add('on');knob.style.transform='translate(-50%,-50%)';e.preventDefault()});
  zone.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;let dx=e.clientX-ox,dy=e.clientY-oy;const l=Math.hypot(dx,dy),m=46;if(l>m){dx*=m/l;dy*=m/l}
    IN.jx=dx/m;IN.jy=-dy/m;knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`});
  const up=e=>{if(e.pointerId!==id)return;id=null;IN.jx=IN.jy=0;base.classList.remove('on')};
  zone.addEventListener('pointerup',up);zone.addEventListener('pointercancel',up);
  document.querySelectorAll('#act [data-k]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();press(b.dataset.k)}));
  const map={j:'atk',k:'dodge',l:'parry',u:'void',i:'skill',o:'swap',' ':'judge'};
  addEventListener('keydown',e=>{if(!S.running)return;const k=e.key.toLowerCase();IN.keys[k]=1;if(map[k]){press(map[k]);e.preventDefault()}});
  addEventListener('keyup',e=>{IN.keys[e.key.toLowerCase()]=0});
}

/* ═══════════════ 소리 ═══════════════ */
const sfx=t=>window.SFX&&SFX.play(t);

/* ═══════════════ 전투 시작 ═══════════════ */
function start(id){curId=id;DEF=DEFS[id];const st=Stages.build(DEF.stage);FX.clear();
  $('bg').className='layer bg-'+st.sky;
  P={x:0,z:5,hp:100,max:100,void:id==='kardo'?0:20,sync:0,weapon:'syn',state:'idle',t:0,combo:0,buf:0,iframe:0,dodgeCd:0,parryT:0,parryRec:0,
     fear:0,immune:false,shield:0,crit:0,skillCd:0,bind:0,hurt:0,flash:0,face:Math.PI,hitDone:false,lastDodge:-9,moved:0,lean:0,erosion:0,rig:Avatars.create('eden')};
  edenWeapons();
  ENS=[];const n=DEF.count||1;
  for(let i=0;i<n;i++){const a=n>1?(i-(n-1)/2)*.9:0;ENS.push({x:Math.sin(a)*5,z:-3-Math.cos(a)*2*(n>1?1:0),hp:DEF.hp,max:DEF.hp,state:'idle',t:0,cool:1.2+i*.6,stun:0,
    stacks:0,stackT:0,barrier:id==='phobia'?1:0,brokenT:0,flash:0,dir:[0,1],att:null,alpha:1,dead:false,flags:{},lean:0,fed:0,yaw:0,moving:false,rig:Avatars.create(DEF.tex)})}
  S.tele=[];TS=1;hitstop=0;slowT=0;cine=null;IN.q={};camDir=[0,1];
  tut=DEF.tutorial?{step:0,hits:0,parried:0,dodged:0,voided:0,shown:-1}:null;
  CAM.x=0;CAM.y=4.5;CAM.z=11;
  $('aName').textContent=DEF.name;$('aSub').textContent=DEF.sub;$('aJudgeMark').style.display=(DEF.noJudge||DEF.tutorial)?'none':'block';
  $('bSwap').style.display=ctx.flags.teror&&!DEF.tutorial?'':'none';
  $('syncRow').style.display=ctx.flags.teror&&!DEF.tutorial?'':'none';
  $('bJudge').textContent=DEF.label||'단죄';$('bSkill').querySelector('b').textContent=ctx.flags.reunited?'공명':(ctx.partner==='A'?'설계':'증폭');
  $('act').classList.add('on');$('result').classList.remove('on');$('atut').classList.remove('on');
  if(!S.running){S.running=true;lastT=performance.now();requestAnimationFrame(loop)}
  S.paused=false;hud();
  intro();
}
async function intro(){S.paused=true;await wait(400);
  if(curId==='kardo'){await say('카르도','“검을 쥐어라. 오늘 가르칠 건 다섯 가지다. 하나씩 몸에 새겨 넣어라.”')}
  S.paused=false;
  const T0={furor:['“저 열기, 시간이 갈수록 쌓여. 공허가 40 차면 「공허의 시야」로 지워버려.”','“주인! 저 언니 점점 뜨거워져! 공허 40 모이면 「공허의 시야」로 꺼버리자!”'],
    fallen:['“주황색 표시는 흘려보낼 수 있는 공격, 빨간색은 피해야 하는 공격이야.”','“주황색은 흘려보내고, 빨간색은 굴러서 피하자!”'],
    teror:['“테로르는 마을 사람들의 공포를 먹고 계속 강해져. 오래 끌면 안 돼.”','“저 칼에 찔리면 몸이 굳어! 조심해 주인!”'],
    phobia:['“성흔 장벽 때문에 그냥 베면 반밖에 안 들어가. 공허로 걷어내든가, 낫을 흘려보내.”','“저 반짝이는 막, 칼이 미끄러져! 공허로 지우거나 큰 낫을 흘려보내!”']}[curId];
  if(T0)tip(T0[ctx.partner==='A'?0:1])}

/* ═══════════════ 대사 / 팁 ═══════════════ */
async function say(n,t){S.paused=true;await window.VN.say(n,t);S.paused=false}
let tipT;
function tip(text,who){who=who||(ctx.partner==='A'?'sentia':'sensus');$('atipImg').src=ICON[who];
  $('atipName').textContent={sentia:'센티아',sensus:'센수스',kardo:'카르도',phobia:'포비아'}[who];$('atipText').textContent=text;
  $('atip').classList.add('on');clearTimeout(tipT);tipT=setTimeout(()=>$('atip').classList.remove('on'),4200)}
function callout(text,cls){const c=$('acall');c.textContent=text;c.className='on '+(cls||'');clearTimeout(c._t);c._t=setTimeout(()=>c.className='',900)}
function num(x,y,z,t,cls){const [sx,sy,ok]=E.project(x,y,z);if(!ok)return;const d=document.createElement('div');d.className='anum '+(cls||'');d.textContent=t;
  d.style.left=sx+'px';d.style.top=sy+'px';$('act').appendChild(d);setTimeout(()=>d.remove(),900)}

/* ═══════════════ 유틸 ═══════════════ */
const alive=()=>ENS.filter(e=>!e.dead);
function target(){let best=null,bd=1e9;for(const e of alive()){const d=Math.hypot(e.x-P.x,e.z-P.z);if(d<bd){bd=d;best=e}}return best}
function inShape(e,a,px,pz,pad=.35){
  if(a.shape==='circle'){const cx=a._cx,cz=a._cz;return Math.hypot(px-cx,pz-cz)<=a.r+pad}
  const dx=px-e.x,dz=pz-e.z,d=Math.hypot(dx,dz);
  if(a.shape==='cone'){if(d>a.range+pad)return false;if(d<.9)return true;const dot=(dx*e.dir[0]+dz*e.dir[1])/d;return dot>=Math.cos((a.ang/2+12)*Math.PI/180)}
  if(a.shape==='line'){const t=dx*e.dir[0]+dz*e.dir[1];const perp=Math.abs(-dx*e.dir[1]+dz*e.dir[0]);return t>=-.5&&t<=a.len+pad&&perp<=a.w/2+pad}
  return false}
// 이든이 든 무기를 상황에 맞게 바꾼다 (weapons.js 의 이름)
function edenWeapons(){const r=P.rig;if(P.weapon==='ter'){r.weaponR='ego_teror';r.weaponL=null}else if(ctx.flags.reunited){r.weaponR='sentia';r.weaponL='sensus'}else{r.weaponR=ctx.partner==='A'?'sentia':'sensus';r.weaponL=null}}
const ENEMY_TRAIL={kardo:[.9,.8,.6],furor:[1,.45,.2],fallen:[.8,.3,.5],teror:[.7,.3,1],phobia:[.75,.55,1]};
function shake(t){shakeT=Math.max(shakeT,t)}
function slow(t,s){slowT=t;TS=s}

/* ═══════════════ 플레이어 행동 ═══════════════ */
const SYN={dmg:[7,8,12],time:[.3,.3,.46],range:2.5};
const TER={dmg:[15,22],time:[.48,.6],range:2.8};
function canAct(){return P.state==='idle'||P.state==='move'}
function doAttack(){
  if(P.state==='atk'){P.buf=1;return}
  if(!canAct())return;
  const W=P.weapon==='ter'?TER:SYN;const n=W.dmg.length;
  P.combo=(P.comboWin>0)?(P.combo+1)%n:0;P.state='atk';P.t=0;P.hitDone=false;P.atkDur=W.time[P.combo];
  const e=target();if(e){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);P.face=Math.atan2(dx,dz);if(d>1.4&&d<4.5){P.lungeX=dx/d;P.lungeZ=dz/d;P.lunge=Math.min(d-1.3,1.2)}else P.lunge=0}else P.lunge=0;
  sfx('ui')}
function attackHit(){
  const W=P.weapon==='ter'?TER:SYN;const fx0=Math.sin(P.face),fz0=Math.cos(P.face);
  const mo=playerMotion();FX.spawn('slash',{x:P.x,y:mo==='V'?1.15:1.05,z:P.z,yaw:P.face,roll:mo==='V'?Math.PI/2:(mo==='H2'?.22:-.22),dir:mo==='H2'?-1:1,r:W.range*.95,col:Weapons.trail(P.rig.weaponR)});
  if(P.rig.weaponL&&mo!=='V')FX.spawn('slash',{x:P.x,y:.95,z:P.z,yaw:P.face,roll:mo==='H2'?-.35:.35,dir:mo==='H2'?1:-1,r:W.range*.85,col:Weapons.trail(P.rig.weaponL),life:.2});
  let any=false;
  for(const e of alive()){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);if(d>W.range+.4)continue;
    if(d>1&&(dx*fx0+dz*fz0)/d<Math.cos(70*Math.PI/180))continue;
    let dmg=W.dmg[P.combo];
    if(P.weapon==='ter'){if(P.sync>=80)dmg=Math.round(dmg*1.4)}
    hitEnemy(e,dmg,{weapon:P.weapon});any=true}
  if(any){if(P.weapon==='ter'){P.sync=Math.min(100,P.sync+12);P.void=Math.min(100,P.void+4);if(P.sync>=100)erosion()}else P.void=Math.min(100,P.void+7)}
  sfx(any?(P.combo===2||P.weapon==='ter'?'heavy':'hit'):'ui')}
function hitEnemy(e,raw,o={}){
  let d=raw*(P.fear>0?.6:1);if(P.crit>0&&!o.noCrit){d*=2;P.crit--}
  if(e.barrier&&!o.pierce)d*=.5;d=Math.round(d);
  e.hp-=d;const floor=DEF.noJudge?0:DEF.tutorial?e.max*.3:1;if(e.hp<floor)e.hp=floor;
  e.flash=.09;hitstop=Math.max(hitstop,d>=25?.09:.05);shake(d>=25?.18:.08);
  num(e.x,DEF.H*.75,e.z,d,d>=25?'big':'');
  const hc=o.weapon==='ter'?[.8,.4,1]:Weapons.trail(P.rig.weaponR);FX.spawn('glow',{x:e.x,y:DEF.H*.55,z:e.z,size:1.1,col:hc});FX.spawn('spark',{x:e.x,y:DEF.H*.55,z:e.z,n:d>=25?10:6,col:hc,speed:4});
  if(DEF.light&&e.state==='wind'&&!e.att.heavy){e.state='stag';e.t=0}
  if(curId==='phobia'&&o.weapon==='ter'){const h=Math.round(d*.4);e.hp=Math.min(e.max,e.hp+h);e.fed=Math.min(4,e.fed+1);
    setTimeout(()=>num(e.x,DEF.H+.2,e.z,'+'+h,'heal'),150);if(!e.flags.fedTip){e.flags.fedTip=1;tip('“어머, 고마워요. 그 도구에 서린 두려움, 정말 맛있네요.”','phobia')}}
  if(tut&&tut.step===1)tut.hits++;
  if(DEF.noJudge&&e.hp<=0)kill(e);
  hud()}
function kill(e){e.dead=true;e.state='dead';e.t=0;sfx('void');FX.spawn('motes',{x:e.x,z:e.z,n:14,col:[.8,.3,.5]})}
function erosion(){P.sync=30;P.weapon='syn';edenWeapons();P.state='hurt';P.t=0;P.hurtDur=1;hurtPlayer(15,{self:1});
  callout('잠식 — 동기화율 100%','red');document.getElementById('stage').classList.add('beat');setTimeout(()=>$('stage').classList.remove('beat'),2300);
  tip(ctx.partner==='A'?'“이든! 그 녀석한테 휘둘리지 마! 80%에서 멈춰!”':'“주인, 안 돼! 그 칼이 주인을 먹으려고 해!”');hud()}
function doDodge(){if(P.dodgeCd>0||!(canAct()||P.state==='atk'&&P.t>P.atkDur*.5||P.state==='parry'&&P.parryT>0))return;
  let mx=P.mx||0,mz=P.mz||0;if(Math.hypot(mx,mz)<.2){const e=target();if(e){const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;mx=dx/d;mz=dz/d}else{mx=0;mz=1}}
  const l=Math.hypot(mx,mz)||1;P.dvx=mx/l;P.dvz=mz/l;P.state='dodge';P.t=0;P.iframe=.32;P.dodgeCd=.55;P.lastDodge=S.time;sfx('parry')}
function doParry(){if(P.bind>0){callout('사슬에 묶여 흘려보낼 수 없다','red');return}if(!canAct()&&!(P.state==='atk'&&P.t>P.atkDur*.4))return;
  P.state='parry';P.t=0;P.parryT=.3;P.parryRec=.32;FX.spawn('vring',{x:P.x,y:1.05,z:P.z,size:.7,life:.25,col:[.8,.75,1],alpha:.6})}
async function doVoid(){if(P.void<40||P.state==='dodge')return;P.void-=40;sfx('void');
  if(tut&&tut.step===4)tut.voided=1;
  slow(1.1,.3);$('vfx').classList.remove('on');void $('vfx').offsetWidth;$('vfx').classList.add('on');
  FX.spawn('ring',{x:P.x,z:P.z,size:1.2,grow:7,life:.7,col:[.6,.5,1]});FX.spawn('vring',{x:P.x,y:1.1,z:P.z,size:1,life:.5,col:[.7,.6,1]});
  P.fear=0;
  for(const e of alive()){if(Math.hypot(e.x-P.x,e.z-P.z)>9)continue;const had=e.stacks;e.stacks=0;e.stun=3;e.state='stun';S.tele=S.tele.filter(t=>t.e!==e);e.att=null;
    if(curId==='phobia'){e.barrier=0;e.brokenT=8}
    hitEnemy(e,10,{pierce:1,noCrit:1});
    if(curId==='furor'&&had)callout(`열기 ${had} → 0 · 출력 제로`,'vio');}
  if(curId==='phobia')callout('성흔 장벽 소거','vio');if(curId==='teror')callout('공포 수확 소거','vio');
  hud()}
function doSkill(){if(P.skillCd>0||!canAct())return;P.skillCd=10;const e=target();
  if(ctx.flags.reunited){if(e){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz)||1;if(d>1.5){P.x+=dx/d*(d-1.3);P.z+=dz/d*(d-1.3)}P.face=Math.atan2(dx,dz);
      FX.spawn('slash',{x:P.x,y:1.05,z:P.z,yaw:P.face,roll:-.3,dir:1,r:3,col:[1,.7,.35],life:.32});FX.spawn('slash',{x:P.x,y:1.1,z:P.z,yaw:P.face,roll:.35,dir:-1,r:3.2,col:[.55,.85,1],life:.32});P.state='atk';P.t=0;P.atkDur=.4;P.hitDone=true;P.combo=0;P.lunge=0;
      if(d<5)hitEnemy(e,40,{})}P.shield+=15;callout('공명 베기','vio');sfx('heavy')}
  else if(ctx.partner==='A'){P.shield+=20;P.crit=3;callout('센티아 · 정교한 설계','vio');sfx('parry');FX.spawn('vring',{x:P.x,y:1.1,z:P.z,size:1.1,life:.5,col:[.6,.9,1]})}
  else{FX.spawn('ring',{x:P.x,z:P.z,size:1.4,grow:1.6,life:.4,col:[1,.6,.3]});FX.spawn('slash',{x:P.x,y:1,z:P.z,yaw:P.face,roll:0,dir:1,r:3.2,col:[1,.6,.3],life:.3});FX.spawn('slash',{x:P.x,y:1,z:P.z,yaw:P.face+Math.PI,roll:0,dir:1,r:3.2,col:[1,.6,.3],life:.3});P.state='atk';P.t=0;P.atkDur=.42;P.hitDone=true;P.combo=0;P.lunge=0;for(const en of alive())if(Math.hypot(en.x-P.x,en.z-P.z)<3.4)hitEnemy(en,36,{});callout('센수스 · 감정 증폭','vio');sfx('heavy')}
  hud()}
function doSwap(){if(!ctx.flags.teror||DEF.tutorial||!canAct())return;P.weapon=P.weapon==='syn'?'ter':'syn';edenWeapons();sfx('void');FX.spawn('vring',{x:P.x,y:1,z:P.z,size:.9,life:.35,col:P.weapon==='ter'?[.7,.3,1]:[.7,.85,1]});
  callout(P.weapon==='ter'?'에고웨폰 · 테로르':'시너지아',P.weapon==='ter'?'vio':'');hud()}
async function doJudge(){const e=target();if(!e||DEF.noJudge||DEF.tutorial||e.hp>e.max*.25||cine)return;
  cine={t:0,e};P.state='cine';S.tele=[];for(const en of ENS)en.att=null,en.state='stun',en.stun=9;
  const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz)||1;P.x=e.x-dx/d*1.4;P.z=e.z-dz/d*1.4;P.face=Math.atan2(dx,dz);
  slow(2,.25);sfx('judge');$('vfx').classList.remove('on');void $('vfx').offsetWidth;$('vfx').classList.add('on')}

function hurtPlayer(d,o={}){
  if(d<=0)return;let a=d;if(P.shield&&!o.self){const s=Math.min(P.shield,a);P.shield-=s;a-=s}
  P.hp-=a;if(tut&&P.hp<1)P.hp=1;P.flash=.15;if(!o.self)P.void=Math.min(100,P.void+5);
  if(a>0){num(P.x,1.9,P.z,a,'me');sfx('hurt');shake(.22)}
  if(!o.self&&a>0&&P.state!=='cine'){P.state='hurt';P.t=0;P.hurtDur=.28}
  hud()}

/* ═══════════════ 적 AI ═══════════════ */
function beginAttack(e,key){const a=Object.assign({key},DEF.atks[key]);e.att=a;e.state='wind';e.t=0;
  const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;e.dir=[dx/d,dz/d];
  if(a.blink){const side=Math.random()<.5?1:-1;const px=-e.dir[1]*side,pz=e.dir[0]*side;e.x=P.x+px*2.1;e.z=P.z+pz*2.1;
    const ndx=P.x-e.x,ndz=P.z-e.z,nd=Math.hypot(ndx,ndz)||1;e.dir=[ndx/nd,ndz/nd];FX.spawn('spark',{x:e.x,y:1,z:e.z,n:12,col:[.55,.2,.8],speed:3});FX.spawn('glow',{x:e.x,y:1,z:e.z,size:2,col:[.4,.1,.6],life:.4})}
  if(a.atPlayer){a._cx=P.x;a._cz=P.z}else if(a.leap){a._sx=e.x;a._sz=e.z;a._cx=P.x;a._cz=P.z}else{a._cx=e.x;a._cz=e.z}
  if(a.scale){const s=e.stacks;a.dmg=a.dmg+a.scale*(curId==='phobia'?e.fed:s)}
  if(a.regen){callout('성흔 재생','vio')}
  else callout(a.n+(a.parry?' — 흘려보내기':' — 회피'),a.parry?'org':'red');
  if(a.shape!=='none')S.tele.push({e,a});
  if(curId==='teror'&&a.key==='stab'&&!e.flags.stabTip){e.flags.stabTip=1}
  P.dodgedThis=false}
function strike(e){const a=e.att;S.tele=S.tele.filter(t=>t.e!==e);
  if(a.regen){e.barrier=1;e.brokenT=0;const h=14;e.hp=Math.min(e.max,e.hp+h);num(e.x,DEF.H+.2,e.z,'+'+h,'heal');sfx('heal');FX.spawn('vring',{x:e.x,y:1,z:e.z,size:1.3,life:.5,col:[.7,.4,1]});e.state='rec';e.t=0;hud();return}
  if(a.leap){e.x=a._cx;e.z=a._cz}
  // 타격 연출
  const tc=ENEMY_TRAIL[curId]||[1,1,1],yaw=Math.atan2(e.dir[0],e.dir[1]);
  if(a.shape==='circle'){FX.spawn('ring',{x:a._cx,z:a._cz,size:a.r*.9,grow:.3,life:.4,col:tc});FX.spawn('spark',{x:a._cx,y:.2,z:a._cz,n:12,col:tc,speed:5})}
  else if(a.shape==='line'){for(let i=1;i<=6;i++){const t=i/6*a.len;FX.spawn('glow',{x:e.x+e.dir[0]*t,y:.5,z:e.z+e.dir[1]*t,size:1.4,col:tc,life:.3+i*.03})}}
  if(a.shape!=='circle'||a.leap)FX.spawn('slash',{x:e.x,y:a.mo==='V'?1.2:1.05,z:e.z,yaw,roll:a.mo==='V'?Math.PI/2:.2,dir:1,r:Math.min(3.4,(a.range||2.6)),col:tc,life:.24});
  shake(a.heavy?.25:.1);sfx(a.heavy?'heavy':'hit');
  const hit=P.state!=='cine'&&inShape(e,a,P.x,P.z);
  if(hit){
    if(a.parry&&P.parryT>0){parried(e,a);return}
    if(P.iframe>0){callout('회피','');P.void=Math.min(100,P.void+8);if(tut&&tut.step===3)tut.dodged++;e.state='rec';e.t=0;return}
    hurtPlayer(a.dmg);
    if(a.fear&&!P.immune){P.fear=4;callout('공포 — 주는 피해 감소','vio')}
    if(a.bind){P.bind=3;callout('사슬 — 흘려보내기 봉인','red')}
    if(a.heavy)P.x+=e.dir[0]*.8,P.z+=e.dir[1]*.8;
  }else if(tut&&tut.step===3&&a.key==='slam'&&S.time-P.lastDodge<1.6)tut.dodged++;
  e.state='rec';e.t=0}
function parried(e,a){sfx('parry');hitstop=.12;slow(.45,.25);P.parryT=0;P.parryRec=0;P.state='idle';P.void=Math.min(100,P.void+15);
  const mx=(e.x+P.x)/2,mz=(e.z+P.z)/2;FX.spawn('vring',{x:mx,y:1.2,z:mz,size:.5,life:.35,col:[1,.9,.6]});FX.spawn('glow',{x:mx,y:1.2,z:mz,size:2.4,life:.25,col:[1,.9,.7]});FX.spawn('spark',{x:mx,y:1.2,z:mz,n:16,col:[1,.85,.5],speed:6});
  callout('흘려보냄!','org');e.state='stun';e.stun=a.heavy?1.8:1.1;e.att=null;
  hitEnemy(e,a.heavy?30:14,{noCrit:1,pierce:curId==='phobia'&&a.heavy});
  if(curId==='phobia'&&a.heavy){e.barrier=0;e.brokenT=7;callout('성흔 장벽 붕괴','vio')}
  if(tut&&tut.step===2)tut.parried++}
function updateEnemy(e,dt){
  if(e.dead){e.t+=dt;e.alpha=Math.max(0,1-e.t*1.5);return}
  e.flash=Math.max(0,e.flash-dt);e.lean*=.85;
  // 축적형 강화
  if(curId==='furor'&&e.state!=='stun'){e.stackT+=dt;if(e.stackT>4.5){e.stackT=0;if(e.stacks<6){e.stacks++;hud();if(e.stacks===3&&!e.flags.h3){e.flags.h3=1;tip(ctx.partner==='A'?'“열기 3중첩. 지금 지워.”':'“너무 뜨거워! 지금 「공허의 시야」!”')}}}}
  if(curId==='teror'&&!e.flags.eye&&e.state!=='stun'){e.stackT+=dt;if(e.stackT>5.5){e.stackT=0;if(e.stacks<6){e.stacks++;hud()}}}
  if(curId==='phobia'&&e.brokenT>0){e.brokenT-=dt;if(e.brokenT<=0)hud()}
  const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;
  if(e.state==='stun'){e.stun-=dt;if(e.stun<=0){e.state='idle';e.cool=.5}return}
  if(e.state==='stag'){e.t+=dt;if(e.t>.5){e.state='idle';e.cool=.6}return}
  if(e.state==='idle'){
    e.cool-=dt;
    // 튜토리얼에서는 단계별로 공격을 고정
    let key=null;
    if(tut){if(tut.step>=2&&e.cool<=0&&d<3.6)key=tut.step===2?'heavy':tut.step===3?'slam':tut.step===4?null:DEF.pick(e,d)}
    else if(e.cool<=0)key=DEF.pick(e,d);
    if(key){beginAttack(e,key);return}
    const want=tut&&tut.step<2?99:DEF.pref;
    e.moving=false;if(d>want){const sp=DEF.speed*(curId==='furor'?1+e.stacks*.08:1);e.x+=dx/d*sp*dt;e.z+=dz/d*sp*dt;e.moving=true}
    else if(ENS.length>1){e.x+=-dz/d*.6*dt;e.z+=dx/d*.6*dt}
    return}
  if(e.state==='wind'){const a=e.att;e.t+=dt;
    if(e.t<a.wind*.55&&!a.atPlayer&&!a.leap){const ndx=P.x-e.x,ndz=P.z-e.z,nd=Math.hypot(ndx,ndz)||1;const k=1-Math.exp(-6*dt);e.dir=[e.dir[0]+(ndx/nd-e.dir[0])*k,e.dir[1]+(ndz/nd-e.dir[1])*k];const l=Math.hypot(...e.dir);e.dir=[e.dir[0]/l,e.dir[1]/l];if(a.shape!=='circle'){a._cx=e.x;a._cz=e.z}}
    if(a.leap&&e.t<a.wind*.5){a._cx=P.x;a._cz=P.z}
    if(a.leap){const k=clamp((e.t-a.wind*.55)/(a.wind*.45),0,1);if(k>0){e.x=a._sx+(a._cx-a._sx)*k;e.z=a._sz+(a._cz-a._sz)*k;e.hop=Math.sin(k*Math.PI)*2.2}}
    e.lean=-.08*Math.min(1,e.t/a.wind);
    if(e.t>=a.wind){e.hop=0;strike(e)}return}
  if(e.state==='rec'){e.t+=dt;e.lean*=.9;if(e.t>=(e.att?e.att.rec:.5)){e.state='idle';e.cool=DEF.gap*R(.7,1.3);e.att=null}}
}

/* ═══════════════ 갱신 ═══════════════ */
function update(dt){
  S.time=(S.time||0)+dt;
  const q=IN.q;IN.q={};
  // 봇(테스트 전용)
  if(window.__AS_BOT)bot(q);
  // 이동 입력
  let jx=IN.jx,jy=IN.jy;if(IN.keys.a||IN.keys.arrowleft)jx-=1;if(IN.keys.d||IN.keys.arrowright)jx+=1;if(IN.keys.w||IN.keys.arrowup)jy+=1;if(IN.keys.s||IN.keys.arrowdown)jy-=1;
  let fx0=CAM.tx-CAM.x,fz0=CAM.tz-CAM.z;const fl=Math.hypot(fx0,fz0)||1;fx0/=fl;fz0/=fl;const rx=-fz0,rz=fx0;
  let mx=rx*jx+fx0*jy,mz=rz*jx+fz0*jy;if(q._wx!==undefined){mx=q._wx;mz=q._wz}
  const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml}P.mx=mx;P.mz=mz;
  if(cine){updateCine(dt);return}
  if(q.atk)doAttack();if(q.dodge)doDodge();if(q.parry)doParry();if(q.void)doVoid();if(q.skill)doSkill();if(q.swap)doSwap();if(q.judge)doJudge();
  // 타이머
  P.iframe=Math.max(0,P.iframe-dt);P.dodgeCd=Math.max(0,P.dodgeCd-dt);P.skillCd=Math.max(0,P.skillCd-dt);P.flash=Math.max(0,P.flash-dt);
  P.comboWin=Math.max(0,(P.comboWin||0)-dt);if(P.fear>0)P.fear=Math.max(0,P.fear-dt);if(P.bind>0)P.bind=Math.max(0,P.bind-dt);
  const spd=5.2*(P.fear>0?.75:1);
  if(P.state==='idle'||P.state==='move'){if(ml>.12){P.x+=mx*spd*dt;P.z+=mz*spd*dt;P.face=Math.atan2(mx,mz);P.state='move';P.moved+=spd*dt*Math.min(1,ml)}else P.state='idle'}
  else if(P.state==='atk'){P.t+=dt;const k=P.t/P.atkDur;if(P.lunge&&k<.4){const s=P.lunge*dt/(P.atkDur*.4);P.x+=P.lungeX*s;P.z+=P.lungeZ*s}
    if(!P.hitDone&&k>=.4){P.hitDone=true;attackHit()}
    if(k>=1){P.state='idle';P.comboWin=.35;if(P.buf){P.buf=0;doAttack()}}}
  else if(P.state==='dodge'){P.t+=dt;const sp=15*(1-P.t/.26);P.x+=P.dvx*sp*dt;P.z+=P.dvz*sp*dt;if(P.t>=.26)P.state='idle'}
  else if(P.state==='parry'){P.t+=dt;P.parryT=Math.max(0,P.parryT-dt);if(P.t>.3+P.parryRec)P.state='idle'}
  else if(P.state==='hurt'){P.t+=dt;if(P.t>=P.hurtDur)P.state='idle'}
  // 경기장 경계 / 충돌
  const pr=Math.hypot(P.x,P.z);if(pr>ARENA){P.x*=ARENA/pr;P.z*=ARENA/pr}
  for(const e of alive()){const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz);if(d<1&&d>0&&P.state!=='dodge'){const push=(1-d)/2;P.x+=dx/d*push;P.z+=dz/d*push;e.x-=dx/d*push;e.z-=dz/d*push}
    const er=Math.hypot(e.x,e.z);if(er>ARENA){e.x*=ARENA/er;e.z*=ARENA/er}}
  for(let i=0;i<ENS.length;i++)for(let j=i+1;j<ENS.length;j++){const a=ENS[i],b=ENS[j];if(a.dead||b.dead)continue;const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(d<1.2&&d>0){const p=(1.2-d)/2;a.x+=dx/d*p;a.z+=dz/d*p;b.x-=dx/d*p;b.z-=dz/d*p}}
  for(const e of ENS)updateEnemy(e,dt);
  // 튜토리얼
  if(tut)tutorial();
  // 공허의 눈 (테로르)
  if(curId==='teror'&&!ENS[0].flags.eye&&P.hp<P.max*.45)voidEye();
  // 승패
  if(P.hp<=0&&!S.ending){lose();return}
  if(DEF.noJudge&&!alive().length&&!S.ending){win()}
  if(!DEF.noJudge&&!DEF.tutorial){const e=ENS[0];$('bJudge').classList.toggle('on',e.hp<=e.max*.25);
    if(e.hp<=e.max*.25&&!e.flags.jt){e.flags.jt=1;tip(curId==='furor'?(ctx.partner==='A'?'“충분해. 이제 제압해.”':'“주인, 이제 끝내도 돼!”'):(ctx.partner==='A'?'“지금이야. 「단죄」로 끝내.”':'“지금이야 주인, 「단죄」!”'))}}
  // 이펙트
  FX.update(dt);Stages.update(dt);
  if(Math.floor(S.time*4)!==Math.floor((S.time-dt)*4))hud();
}
function updateCine(dt){cine.t+=dt;const e=cine.e;
  if(cine.t>.35&&!cine.s1){cine.s1=1;FX.spawn('slash',{x:P.x,y:1.2,z:P.z,yaw:P.face,roll:-.9,dir:1,r:3.2,col:[.75,.6,1],life:.4});sfx('heavy');shake(.3)}
  if(cine.t>.6&&!cine.s2){cine.s2=1;FX.spawn('slash',{x:P.x,y:1.2,z:P.z,yaw:P.face,roll:Math.PI/2,dir:1,r:3.4,col:[1,1,1],life:.45});FX.spawn('glow',{x:e.x,y:1,z:e.z,size:5,life:.6,col:[.6,.5,1]});FX.spawn('beam',{x:e.x,z:e.z,col:curId==='furor'?[1,.55,.3]:[.6,.45,1]});sfx('judge');shake(.4);e.flash=.3;e.hp=0;hud()}
  if(cine.t>.9&&!cine.s3){cine.s3=1;
    FX.spawn('motes',{x:e.x,z:e.z,n:26,col:curId==='furor'?[1,.5,.3]:[.55,.35,.9],to:curId==='furor'?null:[P.x,1.2,P.z]});
    if(curId!=='furor'){e.dead=true;e.t=0}}
  FX.update(dt);
  for(const en of ENS)if(en.dead){en.t+=dt;en.alpha=Math.max(0,1-en.t*1.2)}
  if(cine.t>1.5&&!S.ending)win()}

/* ═══════════════ 튜토리얼 ═══════════════ */
const TUT=['조이스틱(왼쪽 화면)으로 움직여 봐라.','공격 버튼으로 세 번 베어 봐라. 연타하면 연속 베기가 이어진다.',
  '주황색 표시가 뜨면 끝나기 직전에 「흘려보내기」. 받아 넘기면 반격이 들어간다.','빨간색 범위는 흘려보낼 수 없다. 「회피」로 굴러서 빠져나가라.',
  '네 초상 둘레의 고리가 공허다. 40이 찼다. 「공허의 시야」를 써 봐라.','좋다. 이제 실전처럼 덤벼라.'];
function tutorial(){const t=tut;
  if(t.shown!==t.step){t.shown=t.step;$('atutText').textContent=TUT[t.step];$('atut').classList.add('on');$('atutN').textContent=`${t.step+1} / ${TUT.length}`;
    if(t.step===4){P.void=Math.max(P.void,40);hud()}}
  const done=[P.moved>3,t.hits>=3,t.parried>=1,t.dodged>=1,t.voided>=1,false][t.step];
  if(done){t.step++;sfx('heal');callout('좋다','org');ENS[0].cool=1.4}
  if(t.step===5&&ENS[0].hp<=ENS[0].max*.3+.01&&!S.ending){S.ending=true;tutEnd()}}
async function tutEnd(){await wait(400);await say('카르도','“됐다, 그만! 허허… 손이 저리는구나.”');
  await say('카르도','“기억해라. 베어서 공허를 모으고, 주황은 흘려보내고, 빨강은 피하고, 기세는 공허로 지운다. 나머지는 몸이 알아서 익힐 게다.”');finishWin(true)}

/* ═══════════════ 공허의 눈 ═══════════════ */
async function voidEye(){const e=ENS[0];e.flags.eye=1;S.tele=[];e.att=null;e.state='stun';e.stun=1.5;
  await say('','이든은 피 섞인 숨을 내뱉으며 눈을 떴다. 그의 눈동자가 공허의 눈동자로 변하며 더 차갑게 가라앉았다.');
  $('eye').classList.add('on');sfx('void');await wait(1300);
  await say('테로르','“미친 놈…! 공격을 직접 손으로 막을 줄이야!”');
  await say('이든','“……근육 수축 확인. 하지만 공포에 의한 마비는 아니다. 너의 힘은 감정을 먹고 자라지만, 내 안에는 먹을 감정 따위 없다.”');
  $('eye').classList.remove('on');
  P.fear=0;P.immune=true;P.void=100;e.stacks=0;P.hp=Math.min(P.max,P.hp+30);num(P.x,1.9,P.z,'+30','heal');sfx('heal');
  callout('공허의 눈 — 공포 면역','vio');hud()}

/* ═══════════════ 승패 ═══════════════ */
async function win(){S.ending=true;await wait(500);finishWin(false)}
async function finishWin(quiet){
  if(!quiet){const r=$('result');r.innerHTML=`<h2>${DEF.noJudge?'승리':(DEF.label||'단죄')}</h2><p>${DEF.noJudge?DEF.name+'을(를) 물리쳤다.':DEF.label?DEF.name+'을(를) 제압했다.':DEF.name+'의 사념이 이든의 공허 속으로 가라앉는다.'}</p>`;
    r.classList.add('on');await wait(1700);r.classList.remove('on')}
  stop();const f=resolveFn;resolveFn=null;f&&f()}
async function lose(){S.ending=true;S.paused=true;ctx.onLose&&ctx.onLose();await wait(600);
  const r=$('result');r.innerHTML=`<h2>쓰러졌다</h2><p>${ctx.name}의 시야가 공허로 잠긴다.<br>전투를 처음부터 다시 시작한다.</p><button class="tbtn" style="width:200px" id="retry">다시 싸우기</button>`;
  r.classList.add('on');await new Promise(res=>$('retry').onclick=res);r.classList.remove('on');S.ending=false;start(curId)}
function stop(){S.running=false;S.ending=false;$('act').classList.remove('on');$('atip').classList.remove('on');$('atut').classList.remove('on');$('bJudge').classList.remove('on');
  if(initOK)E.clear()}

/* ═══════════════ HUD ═══════════════ */
function hud(){const e=ENS.length>1?null:ENS[0];
  const hp=ENS.reduce((s,x)=>s+Math.max(0,x.hp),0),mx=ENS.reduce((s,x)=>s+x.max,0);
  $('aHp').style.width=(hp/mx*100)+'%';$('aLag').style.width=(hp/mx*100)+'%';$('aNum').textContent=`${Math.ceil(hp)} / ${mx}`;
  const ch=[];if(e){if(curId==='furor'&&e.stacks)ch.push(['red',`열기 ${e.stacks}`]);if(curId==='teror')ch.push(e.flags.eye?['gry','공포 수확 소멸']:['vio',`공포 수확 +${e.stacks*2}`]);
    if(curId==='phobia'){ch.push(e.barrier?['vio','성흔 장벽 · 받는 피해 절반']:['gry',`장벽 깨짐 ${Math.ceil(Math.max(0,e.brokenT))}초`]);if(e.fed)ch.push(['red',`포식 +${e.fed*4}`])}
    if(e.state==='stun'&&!cine)ch.push(['gry','경직'])}
  $('aChips').innerHTML=ch.map(c=>`<span class="chip ${c[0]}">${c[1]}</span>`).join('');
  $('pHp').style.width=Math.max(0,P.hp/P.max*100)+'%';$('pHpN').textContent=Math.max(0,Math.ceil(P.hp))+(P.shield?` (+${P.shield})`:'');
  $('pRing').style.setProperty('--v',P.void);$('pRing').classList.toggle('full',P.void>=40);$('pVdN').textContent=P.void;
  $('pSy').style.width=P.sync+'%';$('pSyN').textContent=P.sync+'%'+(P.sync>=80?' 승화':'');$('syncRow').classList.toggle('hot',P.sync>=80);
  const pc=[];if(P.fear>0)pc.push(['vio','공포']);if(P.bind>0)pc.push(['red','사슬']);if(P.crit>0)pc.push(['gry',`설계 ×2 (${P.crit})`]);if(P.immune)pc.push(['gry','공포 면역']);if(P.weapon==='ter')pc.push(['vio','테로르 장착']);
  $('pChips').innerHTML=pc.map(c=>`<span class="chip ${c[0]}">${c[1]}</span>`).join('');
  $('bVoid').classList.toggle('ready',P.void>=40);$('bVoid').classList.toggle('off',P.void<40);
  $('bSkill').classList.toggle('off',P.skillCd>0);$('bSkill').querySelector('span').textContent=P.skillCd>0?Math.ceil(P.skillCd)+'초':'';
  $('bParry').classList.toggle('off',P.bind>0);
  $('bSwap').querySelector('b').textContent=P.weapon==='ter'?'시너지아':'테로르'}

/* ═══════════════ 동작 ═══════════════ */
function playerMotion(){if(P.weapon==='ter')return P.combo===0?'V':'H1';return['H1','H2','V'][P.combo%3]}
function animate(dt){
  // 이든
  const r=P.rig;let name='idle',k=0;
  if(P.hp<=0)name='dead';
  else if(cine){name='V';const t=cine.t;k=t<.35?t/.35*.3:t<.6?.3+(t-.35)/.25*.25:.55}
  else if(P.state==='move')name='run';
  else if(P.state==='atk'){name=playerMotion();k=P.t/P.atkDur}
  else if(P.state==='dodge')name='dodge';else if(P.state==='parry')name='parry';else if(P.state==='hurt')name='hurt';
  r.play(name,k);r.update(dt);
  // 적
  for(const e of ENS){let n='idle',kk=0;const a=e.att;
    if(e.dead)n='dead';else if(e.state==='stun'||e.state==='stag')n='stun';
    else if(e.state==='wind'&&a){n=a.mo||'H1';kk=.3*Math.min(1,e.t/a.wind)}
    else if(e.state==='rec'&&a){n=a.mo||'H1';kk=.3+.7*Math.min(1,e.t/Math.max(.35,a.rec))}
    else if(e.moving)n='run';
    e.rig.play(n,kk);e.rig.update(dt);
    // 바라보는 방향
    let want=Math.atan2(P.x-e.x,P.z-e.z);if((e.state==='wind'||e.state==='rec')&&e.dir)want=Math.atan2(e.dir[0],e.dir[1]);
    let dy=want-e.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;e.yaw+=dy*Math.min(1,dt*12)}
  // 이든이 바라보는 방향 (적을 향해 공격)
  if(P.drawYaw===undefined)P.drawYaw=P.face;let d=P.face-P.drawYaw;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;P.drawYaw+=d*Math.min(1,dt*16)}

/* ═══════════════ 그리기 ═══════════════ */
function render(){if(!E.resize())return;E.clear();
  let sx=0,sy=0;if(shakeT>0){sx=R(-1,1)*shakeT*.5;sy=R(-1,1)*shakeT*.5}
  E.camera(CAM.x+sx,CAM.y+sy,CAM.z,CAM.tx,CAM.ty,CAM.tz);E.begin();
  Stages.drawSolid();
  FX.shadow(P.x,P.z,.7);for(const e of ENS)if(!e.dead||e.alpha>.3)FX.shadow(e.x,e.z,.7*e.rig.scale);
  for(const t of S.tele){const e=t.e,a=t.a;if(e.att)FX.telegraph(e,a,clamp(e.t/a.wind,0,1))}
  // 이든
  const pt=P.iframe>0?[.85,.85,1.25]:null;
  P.rig.draw(P.x,0,P.z,P.drawYaw,{flash:P.flash>0?.2:0,tint:pt,emit:P.weapon==='ter'?[.06,0,.1]:null});
  // 적
  for(const e of ENS){if(e.alpha<=0)continue;let fl=e.flash>0?.18:0,emit=null,tint=null;
    if(e.state==='wind'&&e.att){const p=.5+.5*Math.sin(S.time*18);emit=e.att.parry?[.22*p,.11*p,0]:[.28*p,0,.02*p]}
    if(e.state==='stun')tint=[.65,.65,.75];
    e.rig.draw(e.x,e.hop||0,e.z,e.yaw,{flash:fl,emit,tint,alpha:e.alpha})}
  // 가산 효과
  for(const e of ENS)if(e.barrier&&!e.dead){const p=.55+.15*Math.sin(S.time*3);E.quad(E.geo('ring:0.86'),E.m4.trs(e.x,1,e.z,Math.PI/2,E.yawTo(e.x,e.z),0,1.25,1,1.35),E.tex.band,[.6,.4,1,p*.8],{add:1})}
  if(P.weapon==='ter')E.quad(E.geo('ctr'),E.m4.trs(P.x,1,P.z,0,E.yawTo(P.x,P.z),0,2.2,2.6,1),E.tex.glow,[.55,.2,.8,.28],{add:1});
  if(P.parryT>0)E.quad(E.geo('ctr'),E.m4.trs(P.x,1,P.z,0,E.yawTo(P.x,P.z),0,2,2,1),E.tex.glow,[.9,.85,1,.3],{add:1});
  FX.draw();Stages.drawAmbient()}

function camera(dt){const e=target()||ENS[0];let dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz);
  if(d>.6){const k=1-Math.exp(-3*dt);camDir=[camDir[0]+(dx/d-camDir[0])*k,camDir[1]+(dz/d-camDir[1])*k];const l=Math.hypot(...camDir)||1;camDir=[camDir[0]/l,camDir[1]/l]}
  let dist=7.2+Math.min(d,8)*.3,h=4.9,side=2.5;let tx=P.x*.45+e.x*.55,tz=P.z*.45+e.z*.55,ty=1.1;
  if(cine){dist=4.6;h=2.4;side=2.6;tx=(P.x+e.x)/2;tz=(P.z+e.z)/2;ty=1.3}
  const px=P.x+camDir[0]*dist-camDir[1]*side,pz=P.z+camDir[1]*dist+camDir[0]*side;
  const k=1-Math.exp(-(cine?4:7)*dt);CAM.x+=(px-CAM.x)*k;CAM.z+=(pz-CAM.z)*k;CAM.y+=(h-CAM.y)*k;CAM.tx+=(tx-CAM.tx)*k;CAM.tz+=(tz-CAM.tz)*k;CAM.ty+=(ty-CAM.ty)*k}

function loop(now){if(!S.running)return;let dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  if(!S.paused){if(slowT>0){slowT-=dt;if(slowT<=0)TS=1}if(shakeT>0)shakeT=Math.max(0,shakeT-dt);
    if(hitstop>0)hitstop-=dt;else{update(dt*TS);animate(dt*TS)}camera(dt)}
  render();requestAnimationFrame(loop)}

/* ═══════════════ 테스트용 자동 조종 ═══════════════ */
function bot(q){const mode=tut?'smart':window.__AS_BOT;const e=target();if(!e||S.paused)return;
  const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz)||1;
  if(tut&&tut.step===0){q._wx=1;q._wz=0;return}
  if(tut&&tut.step===4){q.void=1;return}
  if(mode==='smart'){
    if(!DEF.noJudge&&!DEF.tutorial&&e.hp<=e.max*.25){q.judge=1;return}
    for(const t of S.tele){const a=t.a,en=t.e;if(!en.att)continue;const rem=a.wind-en.t;
      if(inShape(en,a,P.x,P.z,.6)&&rem<.24&&rem>0){if(a.parry&&P.bind<=0&&(!tut||tut.step!==3))q.parry=1;else{let ax,az;if(a.shape==='circle'){ax=P.x-a._cx;az=P.z-a._cz}else{ax=-en.dir[1];az=en.dir[0]}const l=Math.hypot(ax,az)||1;q._wx=ax/l;q._wz=az/l;q.dodge=1}return}}
    if(P.void>=40&&(e.stacks>=2||e.barrier||(curId==='fallen'&&false)))q.void=1;
    if(P.skillCd<=0&&d<3)q.skill=1;
    if(curId==='phobia'&&P.weapon==='ter')q.swap=1;
    if(curId==='teror'&&ctx.flags.teror&&P.weapon==='syn'&&P.sync<70)q.swap=1;
    if(P.weapon==='ter'&&P.sync>=80)q.swap=1;
  }
  if(d>2.1){q._wx=dx/d;q._wz=dz/d}else{q._wx=0;q._wz=0;q.atk=1}}

/* ═══════════════ 공개 ═══════════════ */
let inputReady=false;
window.Action={async run(id,c){ctx=c;if(!inputReady){setupInput();inputReady=true}
  const ok=await init().catch(err=>{console.error(err);return false});
  if(!ok){return new Promise(res=>{const r=$('result');r.innerHTML='<h2>3D를 켤 수 없다</h2><p>이 브라우저에서 WebGL을 사용할 수 없어 전투를 건너뜁니다.</p><button class="tbtn" id="retry" style="width:200px">계속</button>';r.classList.add('on');$('retry').onclick=()=>{r.classList.remove('on');res()}})}
  return new Promise(res=>{resolveFn=res;start(id)})},
  get state(){return{P,ENS,DEF,tut}}};
})();
