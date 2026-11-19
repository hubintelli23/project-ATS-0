/* 액팅 소울 : 0 — action.js  v0.4.0
   3D 실시간 전투의 규칙: 입력(컴퓨터·휴대폰), 3인칭 백뷰 카메라, 보스 패턴, 판정,
   튜토리얼, 아이템, 지도, HUD.  그리는 일은 다른 파일이 맡는다.
     engine.js  : 3D 엔진       avatars.js : 캐릭터
     weapons.js : 무기          effects.js : 이펙트       stages.js : 배경

   ■ 컴퓨터 조작                    ■ 휴대폰 조작
     WASD        이동                 왼쪽 화면 끌기   이동
     마우스      시점                 오른쪽 화면 끌기 시점
     좌클릭      공격                 공격 버튼        공격 (길게 0.5초 = 강공격)
     좌클릭 0.5초 강공격              점프 중 공격     점프 공격 (길게 = 점프 강공격)
     Shift       회피 (주황 공격에 맞춰 누르면 흘려보내기)
     우클릭      대쉬                 Q · E · R · 전환 · F 버튼
     Q · E       스킬 (공허의 시야 · 시너지아)
     R           궁극기 (공허 개방)
     Tab         무기 전환
     Space       점프 · Space+좌클릭 점프 공격 · Space+Ctrl+좌클릭 점프 강공격
     F           상호작용 (아이템 줍기 · 단죄)
     M           지도          Esc  설정 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const R=(a,b)=>a+Math.random()*(b-a);
const HOLD=.5;   // 강공격 홀딩 기준(초)

/* ═══════════════ 초기화 ═══════════════ */
const E=window.AS3D;const ARENA=Stages.ARENA;
const CAM={x:0,y:5,z:8,tx:0,ty:1,tz:0,yaw:0,pitch:.24,dist:4.8,lookT:9};
let cv,initOK=false;
async function init(){if(initOK)return true;cv=$('gl');if(!E.init(cv))return false;FX.init();initOK=true;return true}
const isPC=()=>document.body.classList.contains('pc');
const SET=()=>window.Settings?Settings.get():{sens:1,shake:1,invertY:false,assist:true};

/* ═══════════════ 상태 ═══════════════ */
const S={running:false,paused:false,tele:[],items:[]};
let P,ENS,DEF,ctx,TS=1,hitstop=0,slowT=0,shakeT=0,curId,resolveFn,tut=null,cine=null,lastT=0;
const ICON={sentia:'img/ic_sentia.webp',sensus:'img/ic_sensus.webp',kardo:'img/kardo.webp',phobia:'img/phobia.webp'};

/* ═══════════════ 적 정의 ═══════════════ */
// mo: 동작 이름(avatars.js), shape: circle(r) / cone(range, ang) / line(len, w)
// parry: 주황(회피 타이밍에 흘려보내기 가능), 없으면 빨강(피해야 함). circle·line 은 점프로 넘을 수 있다.
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
const ITEMS={heal:{name:'치유의 정수',col:[.4,1,.6]},void:{name:'사념 조각',col:[.7,.5,1]}};

/* ═══════════════ 입력 ═══════════════ */
const IN={jx:0,jy:0,keys:{},q:{},atkDown:false,atkT:0,heavyFired:false,airHold:false};
function press(k){IN.q[k]=1}
function atkPress(){if(!S.running||S.paused)return;IN.atkDown=true;IN.atkT=0;IN.heavyFired=false;IN.airHold=false;
  if(P&&P.y>.05){if(isPC()){IN.heavyFired=true;press(IN.keys.control?'plungeH':'plunge')}else IN.airHold=true}}
function atkRelease(){if(!IN.atkDown)return;IN.atkDown=false;if(IN.heavyFired)return;
  if(IN.airHold){press('plunge');return}press('atk')}
function lockPointer(){if(!isPC()||document.pointerLockElement)return;try{const r=cv.requestPointerLock&&cv.requestPointerLock();if(r&&r.catch)r.catch(()=>{})}catch(e){}}
function unlockPointer(){S.selfUnlock=true;try{document.exitPointerLock&&document.exitPointerLock()}catch(e){}setTimeout(()=>S.selfUnlock=false,200)}
function setupInput(){
  // 이동 조이스틱 (휴대폰)
  const zone=$('joyZone'),base=$('joyBase'),knob=$('joyKnob');let id=null,ox=0,oy=0;
  zone.addEventListener('pointerdown',e=>{id=e.pointerId;zone.setPointerCapture(id);const r=zone.getBoundingClientRect();ox=e.clientX;oy=e.clientY;
    base.style.left=(ox-r.left)+'px';base.style.top=(oy-r.top)+'px';base.classList.add('on');knob.style.transform='translate(-50%,-50%)';e.preventDefault();e.stopPropagation()});
  zone.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;let dx=e.clientX-ox,dy=e.clientY-oy;const l=Math.hypot(dx,dy),m=46;if(l>m){dx*=m/l;dy*=m/l}
    IN.jx=dx/m;IN.jy=-dy/m;knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`});
  const up=e=>{if(e.pointerId!==id)return;id=null;IN.jx=IN.jy=0;base.classList.remove('on')};
  zone.addEventListener('pointerup',up);zone.addEventListener('pointercancel',up);
  // 시점 끌기 (휴대폰: 오른쪽 화면) · 마우스 (컴퓨터)
  const look=$('lookZone');let lid=null,lx=0,ly=0;
  look.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;lid=e.pointerId;look.setPointerCapture(lid);lx=e.clientX;ly=e.clientY});
  look.addEventListener('pointermove',e=>{if(e.pointerId!==lid)return;turn((e.clientX-lx)*2.4,(e.clientY-ly)*2.4);lx=e.clientX;ly=e.clientY});
  const lup=e=>{if(e.pointerId===lid)lid=null};look.addEventListener('pointerup',lup);look.addEventListener('pointercancel',lup);
  const act=$('act');
  act.addEventListener('mousedown',e=>{if(!S.running||!isPC())return;if(e.target.closest('button,.sk,.topbtn'))return;e.preventDefault();lockPointer();
    if(e.button===0)atkPress();if(e.button===2)press('dash')});
  addEventListener('mouseup',e=>{if(e.button===0)atkRelease()});
  act.addEventListener('contextmenu',e=>e.preventDefault());
  addEventListener('mousemove',e=>{if(!S.running||S.paused||!isPC())return;if(document.pointerLockElement===cv||e.buttons===0)turn(e.movementX||0,e.movementY||0)});
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&S.running&&!S.paused&&!S.selfUnlock&&!S.ending&&window.Settings)Settings.open()});
  // 휴대폰 버튼
  document.querySelectorAll('#act [data-k]').forEach(b=>{const k=b.dataset.k;
    if(k==='atk'){b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();atkPress()});b.addEventListener('pointerup',e=>{e.preventDefault();atkRelease()});b.addEventListener('pointercancel',atkRelease);return}
    b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(k==='map')return openMap();if(k==='esc')return window.Settings&&Settings.open();press(k)})});
  // 키보드
  const map={shift:'dodge',q:'void',e:'skill',r:'ult',tab:'swap',' ':'jump',f:'interact'};
  addEventListener('keydown',e=>{if(!S.running)return;const k=e.key.toLowerCase();if(k==='tab'||k===' ')e.preventDefault();
    if(e.repeat)return;IN.keys[k]=1;if(window.Settings&&Settings.isOpen())return;
    if(k==='m'){mapOpen()?closeMap():openMap();return}
    if(mapOpen())return;
    if(map[k])press(map[k])});
  addEventListener('keyup',e=>{IN.keys[e.key.toLowerCase()]=0});
  addEventListener('blur',()=>{IN.keys={};atkRelease()});
}
function turn(dx,dy){const s=SET();CAM.yaw-=dx*.0028*s.sens;CAM.pitch=clamp(CAM.pitch+dy*.0024*s.sens*(s.invertY?-1:1),-.2,.95);CAM.lookT=0}

/* ═══════════════ 소리 ═══════════════ */
const sfx=t=>window.SFX&&SFX.play(t);

/* ═══════════════ 전투 시작 ═══════════════ */
function start(id){curId=id;DEF=DEFS[id];const st=Stages.build(DEF.stage);FX.clear();
  $('bg').className='layer bg-'+st.sky;
  P={x:0,y:0,vy:0,z:5,hp:100,max:100,void:id==='kardo'?0:20,sync:0,ult:id==='kardo'?0:30,weapon:'syn',state:'idle',t:0,combo:0,buf:0,iframe:0,dodgeCd:0,dashCd:0,parryT:0,
     fear:0,immune:false,shield:0,crit:0,skillCd:0,bind:0,flash:0,face:Math.PI,hitDone:false,lastDodge:-9,moved:0,jumps:0,rig:Avatars.create('eden')};
  edenWeapons();
  ENS=[];const n=DEF.count||1;
  for(let i=0;i<n;i++){const a=n>1?(i-(n-1)/2)*.9:0;ENS.push({x:Math.sin(a)*5,z:-3-Math.cos(a)*2*(n>1?1:0),hp:DEF.hp,max:DEF.hp,state:'idle',t:0,cool:1.2+i*.6,stun:0,
    stacks:0,stackT:0,barrier:id==='phobia'?1:0,brokenT:0,flash:0,dir:[0,1],att:null,alpha:1,dead:false,flags:{},fed:0,yaw:0,moving:false,rig:Avatars.create(DEF.tex)})}
  S.tele=[];S.items=[];TS=1;hitstop=0;slowT=0;cine=null;IN.q={};IN.atkDown=false;
  tut=DEF.tutorial?{step:0,hits:0,heavy:0,parried:0,dodged:0,plunged:0,voided:0,ulted:0,shown:-1}:null;
  CAM.yaw=0;CAM.pitch=.24;CAM.x=0;CAM.y=3;CAM.z=10;CAM.tx=0;CAM.ty=1.3;CAM.tz=5;CAM.lookT=9;
  $('aName').textContent=DEF.name;$('aSub').textContent=DEF.sub;$('aJudgeMark').style.display=(DEF.noJudge||DEF.tutorial)?'none':'block';
  const hasTer=ctx.flags.teror&&!DEF.tutorial;
  document.querySelectorAll('[data-k="swap"]').forEach(b=>b.style.display=hasTer?'':'none');
  $('syncRow').style.display=hasTer?'':'none';
  $('miniName').textContent={forge:'대장간 뒤뜰',wall:'경계의 성벽',forest:'통곡의 숲',shrine:'신성한 사당'}[DEF.stage]||'';
  $('act').classList.add('on');$('result').classList.remove('on');$('atut').classList.remove('on');$('hud').style.display='none';
  if(!S.running){S.running=true;lastT=performance.now();requestAnimationFrame(loop)}
  S.paused=false;S.ending=false;hud();
  intro();
}
async function intro(){S.paused=true;await wait(400);
  if(curId==='kardo'){await say('카르도','“검을 쥐어라. 오늘 가르칠 건 여러 가지다. 하나씩 몸에 새겨 넣어라.”')}
  S.paused=false;
  const T0={furor:['“저 열기, 시간이 갈수록 쌓여. 공허가 40 차면 「공허의 시야」로 지워버려.”','“주인! 저 언니 점점 뜨거워져! 공허 40 모이면 「공허의 시야」로 꺼버리자!”'],
    fallen:['“주황색 공격은 맞기 직전에 회피하면 흘려보내져. 빨간색은 그냥 피하거나 뛰어넘어.”','“주황색은 딱 맞춰 피하면 흘려보내져! 빨간 건 굴러서 피하거나 점프!”'],
    teror:['“테로르는 마을 사람들의 공포를 먹고 계속 강해져. 오래 끌면 안 돼.”','“저 칼에 찔리면 몸이 굳어! 조심해 주인!”'],
    phobia:['“성흔 장벽 때문에 그냥 베면 반밖에 안 들어가. 공허로 걷어내든가, 낫을 흘려보내.”','“저 반짝이는 막, 칼이 미끄러져! 공허로 지우거나 큰 낫을 흘려보내!”']}[curId];
  if(T0)tip(T0[ctx.partner==='A'?0:1])}

/* ═══════════════ 대사 / 팁 / 화면 글자 ═══════════════ */
async function say(n,t){S.paused=true;unlockPointer();IN.atkDown=false;await window.VN.say(n,t);S.paused=false}
let tipT;
function tip(text,who){who=who||(ctx.partner==='A'?'sentia':'sensus');$('atipImg').src=ICON[who];
  $('atipName').textContent={sentia:'센티아',sensus:'센수스',kardo:'카르도',phobia:'포비아'}[who];$('atipText').textContent=text;
  $('atip').classList.add('on');clearTimeout(tipT);tipT=setTimeout(()=>$('atip').classList.remove('on'),4500)}
function callout(text,cls){const c=$('acall');c.textContent=text;c.className='on '+(cls||'');clearTimeout(c._t);c._t=setTimeout(()=>c.className='',900)}
function num(x,y,z,t,cls){const [sx,sy,ok]=E.project(x,y,z);if(!ok)return;const d=document.createElement('div');d.className='anum '+(cls||'');d.textContent=t;
  d.style.left=sx+'px';d.style.top=sy+'px';$('act').appendChild(d);setTimeout(()=>d.remove(),900)}

/* ═══════════════ 유틸 ═══════════════ */
const alive=()=>ENS.filter(e=>!e.dead);
function nearest(maxD){let best=null,bd=maxD||1e9;for(const e of alive()){const d=Math.hypot(e.x-P.x,e.z-P.z);if(d<bd){bd=d;best=e}}return best}
const target=()=>nearest();
function inShape(e,a,px,pz,pad=.35){
  if(a.shape==='circle'){return Math.hypot(px-a._cx,pz-a._cz)<=a.r+pad}
  const dx=px-e.x,dz=pz-e.z,d=Math.hypot(dx,dz);
  if(a.shape==='cone'){if(d>a.range+pad)return false;if(d<.9)return true;const dot=(dx*e.dir[0]+dz*e.dir[1])/d;return dot>=Math.cos((a.ang/2+12)*Math.PI/180)}
  if(a.shape==='line'){const t=dx*e.dir[0]+dz*e.dir[1];const perp=Math.abs(-dx*e.dir[1]+dz*e.dir[0]);return t>=-.5&&t<=a.len+pad&&perp<=a.w/2+pad}
  return false}
function shake(t){shakeT=Math.max(shakeT,t*SET().shake)}
function slow(t,s){slowT=t;TS=s}
const grounded=()=>P.y<=.001;
function camFwd(){return[-Math.sin(CAM.yaw),-Math.cos(CAM.yaw)]}
// 공격 방향: 가까운 적(6m) → 이동 방향 → 카메라 앞
function aimFace(){const e=nearest(6);if(e){P.face=Math.atan2(e.x-P.x,e.z-P.z);return e}if(Math.hypot(P.mx,P.mz)>.2)P.face=Math.atan2(P.mx,P.mz);else{const f=camFwd();P.face=Math.atan2(f[0],f[1])}return null}
function edenWeapons(){const r=P.rig;if(P.weapon==='ter'){r.weaponR='ego_teror';r.weaponL=null}else if(ctx.flags.reunited){r.weaponR='sentia';r.weaponL='sensus'}else{r.weaponR=ctx.partner==='A'?'sentia':'sensus';r.weaponL=null}}
const ENEMY_TRAIL={kardo:[.9,.8,.6],furor:[1,.45,.2],fallen:[.8,.3,.5],teror:[.7,.3,1],phobia:[.75,.55,1]};
function gainUlt(v){P.ult=Math.min(100,P.ult+v)}

/* ═══════════════ 플레이어 행동 ═══════════════ */
const SYN={dmg:[7,8,12],time:[.3,.3,.46],range:2.5,heavy:24};
const TER={dmg:[15,22],time:[.48,.6],range:2.8,heavy:34};
const W_=()=>P.weapon==='ter'?TER:SYN;
function canAct(){return P.state==='idle'||P.state==='move'}
function doAttack(){
  if(P.state==='atk'){P.buf=1;return}
  if(!(canAct()||P.state==='dash'))return;if(!grounded())return;
  const W=W_();const n=W.dmg.length;
  P.combo=(P.comboWin>0)?(P.combo+1)%n:0;P.state='atk';P.t=0;P.hitDone=false;P.atkDur=W.time[P.combo];P.heavyAtk=false;
  lungeTo(aimFace());sfx('ui')}
function doHeavy(){if(!canAct()||!grounded())return;P.state='atk';P.t=0;P.hitDone=false;P.atkDur=.55;P.heavyAtk=true;P.combo=0;lungeTo(aimFace());sfx('heavy');
  callout('강공격','');FX.spawn('vring',{x:P.x,y:1.1,z:P.z,size:.8,life:.3,col:Weapons.trail(P.rig.weaponR)})}
function lungeTo(e){if(e){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);if(d>1.4&&d<5){P.lungeX=dx/d;P.lungeZ=dz/d;P.lunge=Math.min(d-1.3,1.4);return}}P.lunge=0}
function attackHit(){
  const W=W_();const fx0=Math.sin(P.face),fz0=Math.cos(P.face);const heavy=P.heavyAtk;
  const mo=playerMotion();const col=Weapons.trail(P.rig.weaponR);
  FX.spawn('slash',{x:P.x,y:mo==='V'?1.15:1.05,z:P.z,yaw:P.face,roll:mo==='V'?Math.PI/2:(mo==='H2'?.22:-.22),dir:mo==='H2'?-1:1,r:(heavy?3.4:W.range*.95),col,life:heavy?.32:.24});
  if(P.rig.weaponL&&mo!=='V')FX.spawn('slash',{x:P.x,y:.95,z:P.z,yaw:P.face,roll:mo==='H2'?-.35:.35,dir:mo==='H2'?1:-1,r:W.range*.85,col:Weapons.trail(P.rig.weaponL),life:.2});
  if(heavy){FX.spawn('ring',{x:P.x+fx0*1.6,z:P.z+fz0*1.6,size:1.4,grow:1.4,life:.4,col});shake(.18)}
  const range=heavy?3.3:W.range,cosA=Math.cos((heavy?75:65)*Math.PI/180);let any=false;
  for(const e of alive()){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);if(d>range+.4)continue;
    if(d>1&&(dx*fx0+dz*fz0)/d<cosA)continue;
    let dmg=heavy?W.heavy:W.dmg[P.combo];if(P.weapon==='ter'&&P.sync>=80)dmg=Math.round(dmg*1.4);
    hitEnemy(e,dmg,{weapon:P.weapon,stagger:heavy});any=true}
  if(any){if(P.weapon==='ter'){P.sync=Math.min(100,P.sync+(heavy?18:12));P.void=Math.min(100,P.void+4);gainUlt(heavy?8:3);if(P.sync>=100)erosion()}
    else{P.void=Math.min(100,P.void+(heavy?12:7));gainUlt(heavy?8:2)}
    if(tut&&tut.step===2&&heavy)tut.heavy++}
  sfx(any?(heavy||P.combo===2||P.weapon==='ter'?'heavy':'hit'):'ui')}
function hitEnemy(e,raw,o={}){
  let d=raw*(P.fear>0?.6:1);if(P.crit>0&&!o.noCrit){d*=2;P.crit--}
  if(e.barrier&&!o.pierce)d*=.5;d=Math.round(d);
  const before=e.hp;e.hp-=d;const floor=DEF.noJudge?0:DEF.tutorial?e.max*.3:1;if(e.hp<floor)e.hp=floor;
  e.flash=.09;hitstop=Math.max(hitstop,d>=25?.09:.05);shake(d>=25?.18:.08);
  num(e.x,DEF.H*.75,e.z,d,d>=25?'big':'');
  const hc=o.weapon==='ter'?[.8,.4,1]:Weapons.trail(P.rig.weaponR);FX.spawn('glow',{x:e.x,y:DEF.H*.55,z:e.z,size:1.1,col:hc});FX.spawn('spark',{x:e.x,y:DEF.H*.55,z:e.z,n:d>=25?10:6,col:hc,speed:4});
  if(DEF.light&&(o.stagger||(e.state==='wind'&&!e.att.heavy))){e.state='stag';e.t=0;S.tele=S.tele.filter(t=>t.e!==e);e.att=null}
  if(curId==='phobia'&&o.weapon==='ter'){const h=Math.round(d*.4);e.hp=Math.min(e.max,e.hp+h);e.fed=Math.min(4,e.fed+1);
    setTimeout(()=>num(e.x,DEF.H+.2,e.z,'+'+h,'heal'),150);if(!e.flags.fedTip){e.flags.fedTip=1;tip('“어머, 고마워요. 그 도구에 서린 두려움, 정말 맛있네요.”','phobia')}}
  // 보스 체력 절반: 아이템을 떨어뜨린다
  if(!DEF.noJudge&&!DEF.tutorial&&before>e.max*.5&&e.hp<=e.max*.5){drop(e.x+1,e.z,'void');drop(e.x-1,e.z+.5,'heal')}
  if(tut&&tut.step===1)tut.hits++;
  if(DEF.noJudge&&e.hp<=0)kill(e);
  hud()}
function kill(e){e.dead=true;e.state='dead';e.t=0;sfx('void');FX.spawn('motes',{x:e.x,z:e.z,n:14,col:[.8,.3,.5]});drop(e.x,e.z,'heal')}
function drop(x,z,type){const r=Math.hypot(x,z);if(r>ARENA-1){x*=(ARENA-1)/r;z*=(ARENA-1)/r}S.items.push({x,z,type,t:0});FX.spawn('vring',{x,y:.6,z,size:.5,life:.4,col:ITEMS[type].col})}
function erosion(){P.sync=30;P.weapon='syn';edenWeapons();P.state='hurt';P.t=0;P.hurtDur=1;hurtPlayer(15,{self:1});
  callout('잠식 — 동기화율 100%','red');$('stage').classList.add('beat');setTimeout(()=>$('stage').classList.remove('beat'),2300);
  tip(ctx.partner==='A'?'“이든! 그 녀석한테 휘둘리지 마! 80%에서 멈춰!”':'“주인, 안 돼! 그 칼이 주인을 먹으려고 해!”');hud()}
// 회피(Shift): 무적 0.32초. 주황 공격에 맞춰 누르면 흘려보내기(반격)
function doDodge(){if(P.dodgeCd>0||!grounded()||!(canAct()||P.state==='atk'&&P.t>P.atkDur*.4||P.state==='dash'))return;
  let mx=P.mx||0,mz=P.mz||0;if(Math.hypot(mx,mz)<.2){const e=target();if(e){const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;mx=dx/d;mz=dz/d}else{const f=camFwd();mx=-f[0];mz=-f[1]}}
  const l=Math.hypot(mx,mz)||1;P.dvx=mx/l;P.dvz=mz/l;P.state='dodge';P.t=0;P.iframe=.32;P.dodgeCd=.5;P.lastDodge=S.time;
  if(P.bind<=0){P.parryT=.3;FX.spawn('vring',{x:P.x,y:1.05,z:P.z,size:.6,life:.22,col:[.8,.75,1],alpha:.5})}else callout('사슬 — 흘려보내기 봉인','red');
  sfx('parry')}
// 대쉬(우클릭): 이동 방향(없으면 카메라 앞)으로 빠르게 돌진
function doDash(){if(P.dashCd>0||!grounded()||!(canAct()||P.state==='atk'&&P.t>P.atkDur*.5))return;
  let mx=P.mx,mz=P.mz;if(Math.hypot(mx,mz)<.2){const f=camFwd();mx=f[0];mz=f[1]}const l=Math.hypot(mx,mz)||1;
  P.dvx=mx/l;P.dvz=mz/l;P.face=Math.atan2(P.dvx,P.dvz);P.state='dash';P.t=0;P.iframe=.12;P.dashCd=.6;sfx('ui');
  FX.spawn('glow',{x:P.x,y:.9,z:P.z,size:1.4,life:.25,col:[.7,.75,1]})}
function doJump(){if(!grounded()||!(canAct()||P.state==='atk'&&P.t>P.atkDur*.5))return;P.vy=8.4;P.state='air';P.t=0;sfx('ui')}
// 점프 공격: 아래로 내려찍어 착지 지점에 충격
function doPlunge(heavy){if(grounded()||P.state==='plunge')return;P.state='plunge';P.vy=-18;P.plungeHeavy=!!heavy;aimFace();
  if(heavy){callout('점프 강공격','');FX.spawn('vring',{x:P.x,y:P.y+1,z:P.z,size:.8,life:.3,col:[.8,.6,1]})}}
function plungeLand(){const heavy=P.plungeHeavy,r=heavy?3.4:2.3,col=heavy?[.8,.55,1]:Weapons.trail(P.rig.weaponR);
  FX.spawn('ring',{x:P.x,z:P.z,size:r*.6,grow:1.6,life:.45,col});FX.spawn('spark',{x:P.x,y:.2,z:P.z,n:heavy?18:10,col,speed:6});
  FX.spawn('slash',{x:P.x,y:1.1,z:P.z,yaw:P.face,roll:Math.PI/2,dir:1,r:2.6,col,life:.25});
  shake(heavy?.3:.18);sfx('heavy');let any=false;
  for(const e of alive())if(Math.hypot(e.x-P.x,e.z-P.z)<=r+.4){hitEnemy(e,heavy?28:15,{stagger:true,weapon:P.weapon});any=true}
  if(any){P.void=Math.min(100,P.void+(heavy?14:8));gainUlt(heavy?8:4)}
  if(tut&&tut.step===5)tut.plunged++;
  P.state='land';P.t=0}
async function doVoid(){if(P.void<40||P.state==='dodge'||P.state==='ult')return;P.void-=40;sfx('void');
  if(tut&&tut.step===6)tut.voided=1;
  slow(1.1,.3);vfx();
  FX.spawn('ring',{x:P.x,z:P.z,size:1.2,grow:7,life:.7,col:[.6,.5,1]});FX.spawn('vring',{x:P.x,y:1.1,z:P.z,size:1,life:.5,col:[.7,.6,1]});
  P.fear=0;
  for(const e of alive()){if(Math.hypot(e.x-P.x,e.z-P.z)>9)continue;const had=e.stacks;e.stacks=0;e.stun=3;e.state='stun';S.tele=S.tele.filter(t=>t.e!==e);e.att=null;
    if(curId==='phobia'){e.barrier=0;e.brokenT=8}
    hitEnemy(e,10,{pierce:1,noCrit:1});
    if(curId==='furor'&&had)callout(`열기 ${had} → 0 · 출력 제로`,'vio');}
  if(curId==='phobia')callout('성흔 장벽 소거','vio');if(curId==='teror')callout('공포 수확 소거','vio');
  hud()}
function vfx(){$('vfx').classList.remove('on');void $('vfx').offsetWidth;$('vfx').classList.add('on')}
function doSkill(){if(P.skillCd>0||!canAct()||!grounded())return;P.skillCd=10;const e=nearest(7);if(e)P.face=Math.atan2(e.x-P.x,e.z-P.z);
  if(ctx.flags.reunited){if(e){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz)||1;if(d>1.5){P.x+=dx/d*(d-1.3);P.z+=dz/d*(d-1.3)}
      FX.spawn('slash',{x:P.x,y:1.05,z:P.z,yaw:P.face,roll:-.3,dir:1,r:3,col:[1,.7,.35],life:.32});FX.spawn('slash',{x:P.x,y:1.1,z:P.z,yaw:P.face,roll:.35,dir:-1,r:3.2,col:[.55,.85,1],life:.32});
      if(d<5)hitEnemy(e,40,{})}P.shield+=15;callout('공명 베기','vio');sfx('heavy')}
  else if(ctx.partner==='A'){P.shield+=20;P.crit=3;callout('센티아 · 정교한 설계','vio');sfx('parry');FX.spawn('vring',{x:P.x,y:1.1,z:P.z,size:1.1,life:.5,col:[.6,.9,1]})}
  else{FX.spawn('ring',{x:P.x,z:P.z,size:1.4,grow:1.6,life:.4,col:[1,.6,.3]});FX.spawn('slash',{x:P.x,y:1,z:P.z,yaw:P.face,roll:0,dir:1,r:3.2,col:[1,.6,.3],life:.3});FX.spawn('slash',{x:P.x,y:1,z:P.z,yaw:P.face+Math.PI,roll:0,dir:1,r:3.2,col:[1,.6,.3],life:.3});
    for(const en of alive())if(Math.hypot(en.x-P.x,en.z-P.z)<3.4)hitEnemy(en,36,{});callout('센수스 · 감정 증폭','vio');sfx('heavy')}
  P.state='atk';P.t=0;P.atkDur=.42;P.hitDone=true;P.combo=0;P.lunge=0;P.heavyAtk=false;
  hud()}
// 궁극기(R): 공명 게이지 100 소모
function doUlt(){if(P.ult<100||!canAct()||!grounded())return;P.ult=0;P.state='ult';P.t=0;P.ultHit=false;aimFace();
  if(tut&&tut.step===7)tut.ulted=1;callout('궁극기 · 공허 개방','vio');sfx('judge');slow(.9,.35);vfx();
  FX.spawn('vring',{x:P.x,y:1.2,z:P.z,size:1.4,life:.6,col:[.6,.45,1]});hud()}
function ultHit(){P.ultHit=true;FX.spawn('ring',{x:P.x,z:P.z,size:1.5,grow:4.5,life:.8,col:[.6,.45,1]});FX.spawn('beam',{x:P.x,z:P.z,col:[.55,.4,1],life:.8});
  FX.spawn('spark',{x:P.x,y:.5,z:P.z,n:24,col:[.75,.6,1],speed:8});shake(.45);sfx('heavy');
  for(const e of alive()){if(Math.hypot(e.x-P.x,e.z-P.z)>7.5)continue;e.stacks=0;S.tele=S.tele.filter(t=>t.e!==e);e.att=null;e.state='stun';e.stun=2.5;
    if(curId==='phobia'){e.barrier=0;e.brokenT=6}hitEnemy(e,60,{pierce:1,noCrit:1})}}
function doSwap(){if(!ctx.flags.teror||DEF.tutorial||!canAct())return;P.weapon=P.weapon==='syn'?'ter':'syn';edenWeapons();sfx('void');FX.spawn('vring',{x:P.x,y:1,z:P.z,size:.9,life:.35,col:P.weapon==='ter'?[.7,.3,1]:[.7,.85,1]});
  callout(P.weapon==='ter'?'에고웨폰 · 테로르':'시너지아',P.weapon==='ter'?'vio':'');hud()}
// 상호작용(F): 단죄가 우선, 없으면 가까운 아이템 줍기
function interactTarget(){if(cine||!P)return null;
  if(!DEF.noJudge&&!DEF.tutorial){const e=ENS[0];if(!e.dead&&e.hp<=e.max*.25&&Math.hypot(e.x-P.x,e.z-P.z)<7)return{kind:'judge',e,label:DEF.label||'단죄'}}
  let best=null,bd=1.9;for(const it of S.items){const d=Math.hypot(it.x-P.x,it.z-P.z);if(d<bd){bd=d;best=it}}
  return best?{kind:'item',it:best,label:ITEMS[best.type].name+' 줍기'}:null}
function doInteract(){const t=interactTarget();if(!t)return;if(t.kind==='judge')return doJudge(t.e);
  const it=t.it;S.items=S.items.filter(x=>x!==it);sfx('heal');
  if(it.type==='heal'){const h=25;P.hp=Math.min(P.max,P.hp+h);num(P.x,1.9,P.z,'+'+h,'heal')}else{P.void=Math.min(100,P.void+30);gainUlt(20);num(P.x,1.9,P.z,'공허 +30','heal')}
  FX.spawn('motes',{x:it.x,z:it.z,n:10,col:ITEMS[it.type].col,to:[P.x,1.2,P.z]});callout(ITEMS[it.type].name,'');hud()}
function doJudge(e){if(cine)return;
  cine={t:0,e};P.state='cine';P.y=0;P.vy=0;S.tele=[];for(const en of ENS)en.att=null,en.state='stun',en.stun=9;
  const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz)||1;P.x=e.x-dx/d*1.4;P.z=e.z-dz/d*1.4;P.face=Math.atan2(dx,dz);
  slow(2,.25);sfx('judge');vfx()}

function hurtPlayer(d,o={}){
  if(d<=0)return;let a=d;if(P.shield&&!o.self){const s=Math.min(P.shield,a);P.shield-=s;a-=s}
  P.hp-=a;if(tut&&P.hp<1)P.hp=1;P.flash=.15;if(!o.self)P.void=Math.min(100,P.void+5);
  if(a>0){num(P.x,1.9,P.z,a,'me');sfx('hurt');shake(.22)}
  if(!o.self&&a>0&&P.state!=='cine'&&P.state!=='ult'&&grounded()){P.state='hurt';P.t=0;P.hurtDur=.28}
  hud()}

/* ═══════════════ 적 AI ═══════════════ */
function beginAttack(e,key){const a=Object.assign({key},DEF.atks[key]);e.att=a;e.state='wind';e.t=0;
  const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;e.dir=[dx/d,dz/d];
  if(a.blink){const side=Math.random()<.5?1:-1;const px=-e.dir[1]*side,pz=e.dir[0]*side;e.x=P.x+px*2.1;e.z=P.z+pz*2.1;
    const ndx=P.x-e.x,ndz=P.z-e.z,nd=Math.hypot(ndx,ndz)||1;e.dir=[ndx/nd,ndz/nd];FX.spawn('spark',{x:e.x,y:1,z:e.z,n:12,col:[.55,.2,.8],speed:3});FX.spawn('glow',{x:e.x,y:1,z:e.z,size:2,col:[.4,.1,.6],life:.4})}
  if(a.atPlayer){a._cx=P.x;a._cz=P.z}else if(a.leap){a._sx=e.x;a._sz=e.z;a._cx=P.x;a._cz=P.z}else{a._cx=e.x;a._cz=e.z}
  if(a.scale){const s=e.stacks;a.dmg=a.dmg+a.scale*(curId==='phobia'?e.fed:s)}
  if(a.regen){callout('성흔 재생','vio')}
  else callout(a.n+(a.parry?' — 맞춰서 회피':' — 피하기'),a.parry?'org':'red');
  if(a.shape!=='none')S.tele.push({e,a})}
function strike(e){const a=e.att;S.tele=S.tele.filter(t=>t.e!==e);
  if(a.regen){e.barrier=1;e.brokenT=0;const h=14;e.hp=Math.min(e.max,e.hp+h);num(e.x,DEF.H+.2,e.z,'+'+h,'heal');sfx('heal');FX.spawn('vring',{x:e.x,y:1,z:e.z,size:1.3,life:.5,col:[.7,.4,1]});e.state='rec';e.t=0;hud();return}
  if(a.leap){e.x=a._cx;e.z=a._cz}
  const tc=ENEMY_TRAIL[curId]||[1,1,1],yaw=Math.atan2(e.dir[0],e.dir[1]);
  if(a.shape==='circle'){FX.spawn('ring',{x:a._cx,z:a._cz,size:a.r*.9,grow:.3,life:.4,col:tc});FX.spawn('spark',{x:a._cx,y:.2,z:a._cz,n:12,col:tc,speed:5})}
  else if(a.shape==='line'){for(let i=1;i<=6;i++){const t=i/6*a.len;FX.spawn('glow',{x:e.x+e.dir[0]*t,y:.5,z:e.z+e.dir[1]*t,size:1.4,col:tc,life:.3+i*.03})}}
  if(a.shape!=='circle'||a.leap)FX.spawn('slash',{x:e.x,y:a.mo==='V'?1.2:1.05,z:e.z,yaw,roll:a.mo==='V'?Math.PI/2:.2,dir:1,r:Math.min(3.4,(a.range||2.6)),col:tc,life:.24});
  shake(a.heavy?.25:.1);sfx(a.heavy?'heavy':'hit');
  const inside=P.state!=='cine'&&inShape(e,a,P.x,P.z);
  // 바닥 공격(원형·직선)은 점프로 넘을 수 있다
  const jumped=inside&&P.y>.7&&(a.shape==='circle'||a.shape==='line');
  if(inside&&!jumped&&P.state!=='ult'){
    if(a.parry&&P.parryT>0){parried(e,a);return}
    if(P.iframe>0){callout('회피','');P.void=Math.min(100,P.void+8);gainUlt(5);if(tut&&tut.step===4)tut.dodged++;e.state='rec';e.t=0;return}
    hurtPlayer(a.dmg);
    if(a.fear&&!P.immune){P.fear=4;callout('공포 — 주는 피해 감소','vio')}
    if(a.bind){P.bind=3;callout('사슬 — 흘려보내기 봉인','red')}
    if(a.heavy)P.x+=e.dir[0]*.8,P.z+=e.dir[1]*.8;
  }else if(jumped){callout('뛰어넘음','');gainUlt(4);if(tut&&tut.step===4)tut.dodged++}
  else if(tut&&tut.step===4&&a.key==='slam'&&S.time-P.lastDodge<1.6)tut.dodged++;
  e.state='rec';e.t=0}
function parried(e,a){sfx('parry');hitstop=.12;slow(.45,.25);P.parryT=0;P.state='idle';P.void=Math.min(100,P.void+15);gainUlt(10);
  const mx=(e.x+P.x)/2,mz=(e.z+P.z)/2;FX.spawn('vring',{x:mx,y:1.2,z:mz,size:.5,life:.35,col:[1,.9,.6]});FX.spawn('glow',{x:mx,y:1.2,z:mz,size:2.4,life:.25,col:[1,.9,.7]});FX.spawn('spark',{x:mx,y:1.2,z:mz,n:16,col:[1,.85,.5],speed:6});
  callout('흘려보냄!','org');e.state='stun';e.stun=a.heavy?1.8:1.1;e.att=null;
  P.face=Math.atan2(e.x-P.x,e.z-P.z);
  hitEnemy(e,a.heavy?30:14,{noCrit:1,pierce:curId==='phobia'&&a.heavy});
  if(curId==='phobia'&&a.heavy){e.barrier=0;e.brokenT=7;callout('성흔 장벽 붕괴','vio')}
  if(tut&&tut.step===3)tut.parried++}
function updateEnemy(e,dt){
  if(e.dead){e.t+=dt;e.alpha=Math.max(0,1-e.t*1.5);return}
  e.flash=Math.max(0,e.flash-dt);
  if(curId==='furor'&&e.state!=='stun'){e.stackT+=dt;if(e.stackT>4.5){e.stackT=0;if(e.stacks<6){e.stacks++;hud();if(e.stacks===3&&!e.flags.h3){e.flags.h3=1;tip(ctx.partner==='A'?'“열기 3중첩. 지금 지워.”':'“너무 뜨거워! 지금 「공허의 시야」!”')}}}}
  if(curId==='teror'&&!e.flags.eye&&e.state!=='stun'){e.stackT+=dt;if(e.stackT>5.5){e.stackT=0;if(e.stacks<6){e.stacks++;hud()}}}
  if(curId==='phobia'&&e.brokenT>0){e.brokenT-=dt;if(e.brokenT<=0)hud()}
  const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;
  if(e.state==='stun'){e.stun-=dt;if(e.stun<=0){e.state='idle';e.cool=.5}return}
  if(e.state==='stag'){e.t+=dt;if(e.t>.5){e.state='idle';e.cool=.6}return}
  if(e.state==='idle'){
    e.cool-=dt;let key=null;
    if(tut){if(e.cool<=0&&d<3.6&&(tut.step===3||tut.step===4||tut.step>=8))key=tut.step===3?'heavy':tut.step===4?'slam':DEF.pick(e,d)}
    else if(e.cool<=0)key=DEF.pick(e,d);
    if(key){beginAttack(e,key);return}
    const want=tut&&(tut.step<3||(tut.step>4&&tut.step<8))?99:DEF.pref;
    e.moving=false;if(d>want){const sp=DEF.speed*(curId==='furor'?1+e.stacks*.08:1);e.x+=dx/d*sp*dt;e.z+=dz/d*sp*dt;e.moving=true}
    else if(ENS.length>1){e.x+=-dz/d*.6*dt;e.z+=dx/d*.6*dt}
    return}
  if(e.state==='wind'){const a=e.att;e.t+=dt;
    if(e.t<a.wind*.55&&!a.atPlayer&&!a.leap){const ndx=P.x-e.x,ndz=P.z-e.z,nd=Math.hypot(ndx,ndz)||1;const k=1-Math.exp(-6*dt);e.dir=[e.dir[0]+(ndx/nd-e.dir[0])*k,e.dir[1]+(ndz/nd-e.dir[1])*k];const l=Math.hypot(...e.dir);e.dir=[e.dir[0]/l,e.dir[1]/l];if(a.shape!=='circle'){a._cx=e.x;a._cz=e.z}}
    if(a.leap&&e.t<a.wind*.5){a._cx=P.x;a._cz=P.z}
    if(a.leap){const k=clamp((e.t-a.wind*.55)/(a.wind*.45),0,1);if(k>0){e.x=a._sx+(a._cx-a._sx)*k;e.z=a._sz+(a._cz-a._sz)*k;e.hop=Math.sin(k*Math.PI)*2.2}}
    if(e.t>=a.wind){e.hop=0;strike(e)}return}
  if(e.state==='rec'){e.t+=dt;if(e.t>=(e.att?e.att.rec:.5)){e.state='idle';e.cool=DEF.gap*R(.7,1.3);e.att=null}}
}

/* ═══════════════ 갱신 ═══════════════ */
function update(dt){
  S.time=(S.time||0)+dt;
  const q=IN.q;IN.q={};
  if(window.__AS_BOT)bot(q);
  // 이동 입력 (카메라 기준)
  let jx=IN.jx,jy=IN.jy;if(IN.keys.a||IN.keys.arrowleft)jx-=1;if(IN.keys.d||IN.keys.arrowright)jx+=1;if(IN.keys.w||IN.keys.arrowup)jy+=1;if(IN.keys.s||IN.keys.arrowdown)jy-=1;
  const f=camFwd(),rx=-f[1],rz=f[0];
  let mx=rx*jx+f[0]*jy,mz=rz*jx+f[1]*jy;if(q._wx!==undefined){mx=q._wx;mz=q._wz}
  const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml}P.mx=mx;P.mz=mz;
  if(cine){updateCine(dt);return}
  // 강공격 홀딩
  if(IN.atkDown){IN.atkT+=dt;if(IN.airHold&&IN.atkT>=.25&&!grounded()){IN.heavyFired=true;IN.airHold=false;press('plungeH')}
    if(!IN.heavyFired&&!IN.airHold&&IN.atkT>=HOLD&&grounded()){IN.heavyFired=true;doHeavy()}}
  const qq=Object.assign({},q,IN.q);IN.q={};
  if(qq.atk)doAttack();if(qq.heavy)doHeavy();if(qq.dodge)doDodge();if(qq.dash)doDash();if(qq.jump)doJump();
  if(qq.plunge)doPlunge(false);if(qq.plungeH)doPlunge(true);
  if(qq.void)doVoid();if(qq.skill)doSkill();if(qq.ult)doUlt();if(qq.swap)doSwap();if(qq.interact)doInteract();
  // 타이머
  P.iframe=Math.max(0,P.iframe-dt);P.dodgeCd=Math.max(0,P.dodgeCd-dt);P.dashCd=Math.max(0,P.dashCd-dt);P.skillCd=Math.max(0,P.skillCd-dt);P.flash=Math.max(0,P.flash-dt);
  P.parryT=Math.max(0,P.parryT-dt);P.comboWin=Math.max(0,(P.comboWin||0)-dt);if(P.fear>0)P.fear=Math.max(0,P.fear-dt);if(P.bind>0)P.bind=Math.max(0,P.bind-dt);
  const charging=IN.atkDown&&!IN.heavyFired&&!IN.airHold&&IN.atkT>.15&&grounded();
  const spd=5.4*(P.fear>0?.75:1)*(charging?.35:1);
  // 상태별 움직임
  if(P.state==='idle'||P.state==='move'){if(ml>.12){P.x+=mx*spd*dt;P.z+=mz*spd*dt;if(!charging)P.face=Math.atan2(mx,mz);P.state='move';P.moved+=spd*dt*Math.min(1,ml)}else P.state='idle';
    if(charging){const e=nearest(6);if(e)P.face=Math.atan2(e.x-P.x,e.z-P.z)}}
  else if(P.state==='atk'){P.t+=dt;const k=P.t/P.atkDur;if(P.lunge&&k<.4){const s=P.lunge*dt/(P.atkDur*.4);P.x+=P.lungeX*s;P.z+=P.lungeZ*s}
    if(!P.hitDone&&k>=(P.heavyAtk?.45:.4)){P.hitDone=true;attackHit()}
    if(k>=1){P.state='idle';P.comboWin=P.heavyAtk?0:.35;if(P.buf){P.buf=0;doAttack()}}}
  else if(P.state==='dodge'){P.t+=dt;const sp=15*(1-P.t/.26);P.x+=P.dvx*sp*dt;P.z+=P.dvz*sp*dt;if(P.t>=.26)P.state='idle'}
  else if(P.state==='dash'){P.t+=dt;const sp=19*(1-P.t/.3);P.x+=P.dvx*sp*dt;P.z+=P.dvz*sp*dt;if(P.t>=.24)P.state='idle'}
  else if(P.state==='hurt'){P.t+=dt;if(P.t>=P.hurtDur)P.state='idle'}
  else if(P.state==='land'){P.t+=dt;if(P.t>=.28)P.state='idle'}
  else if(P.state==='ult'){P.t+=dt;if(!P.ultHit&&P.t>=.45)ultHit();if(P.t>=1)P.state='idle'}
  else if(P.state==='air'){if(ml>.12){P.x+=mx*spd*.85*dt;P.z+=mz*spd*.85*dt;P.face=Math.atan2(mx,mz)}}
  // 점프 물리
  if(P.state==='air'||P.state==='plunge'||P.y>0){P.vy-=24*dt;P.y+=P.vy*dt;
    if(P.y<=0){P.y=0;P.vy=0;if(P.state==='plunge')plungeLand();else if(P.state==='air'){P.state='idle';FX.spawn('ring',{x:P.x,z:P.z,size:.4,grow:1,life:.25,col:[.8,.8,.9]})}}}
  // 경기장 경계 / 충돌
  const pr=Math.hypot(P.x,P.z);if(pr>ARENA){P.x*=ARENA/pr;P.z*=ARENA/pr}
  for(const e of alive()){const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz);if(d<1&&d>0&&P.state!=='dodge'&&P.state!=='dash'&&P.y<.5){const push=(1-d)/2;P.x+=dx/d*push;P.z+=dz/d*push;e.x-=dx/d*push;e.z-=dz/d*push}
    const er=Math.hypot(e.x,e.z);if(er>ARENA){e.x*=ARENA/er;e.z*=ARENA/er}}
  for(let i=0;i<ENS.length;i++)for(let j=i+1;j<ENS.length;j++){const a=ENS[i],b=ENS[j];if(a.dead||b.dead)continue;const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(d<1.2&&d>0){const p=(1.2-d)/2;a.x+=dx/d*p;a.z+=dz/d*p;b.x-=dx/d*p;b.z-=dz/d*p}}
  for(const e of ENS)updateEnemy(e,dt);
  for(const it of S.items)it.t+=dt;
  if(tut)tutorial();
  if(curId==='teror'&&!ENS[0].flags.eye&&P.hp<P.max*.45)voidEye();
  if(P.hp<=0&&!S.ending){lose();return}
  if(DEF.noJudge&&!alive().length&&!S.ending){win()}
  if(!DEF.noJudge&&!DEF.tutorial){const e=ENS[0];if(e.hp<=e.max*.25&&!e.flags.jt){e.flags.jt=1;const key=isPC()?'F':'F 버튼';
    tip(curId==='furor'?(ctx.partner==='A'?`“충분해. 다가가서 ${key}로 제압해.”`:`“주인, 이제 ${key}로 끝내도 돼!”`):(ctx.partner==='A'?`“지금이야. 다가가서 ${key} — 「단죄」.”`:`“지금이야 주인, ${key}로 「단죄」!”`))}}
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
function tutText(i){const pc=isPC();return[
  pc?'WASD로 움직이고, 마우스로 시점을 돌려라.':'왼쪽 화면을 끌어 움직이고, 오른쪽 화면을 끌어 시점을 돌려라.',
  pc?'좌클릭으로 세 번 베어 봐라. 이어 누르면 연속 베기가 된다.':'공격 버튼으로 세 번 베어 봐라. 이어 누르면 연속 베기가 된다.',
  pc?'좌클릭을 0.5초 동안 누르고 있어라 — 강공격.':'공격 버튼을 0.5초 동안 누르고 있어라 — 강공격.',
  pc?'주황색 표시가 끝나기 직전에 Shift(회피). 맞춰 피하면 흘려보내고 반격한다.':'주황색 표시가 끝나기 직전에 회피. 맞춰 피하면 흘려보내고 반격한다.',
  pc?'빨간색은 흘려보낼 수 없다. Shift로 피하거나 Space로 뛰어넘어라.':'빨간색은 흘려보낼 수 없다. 회피로 피하거나 점프로 뛰어넘어라.',
  pc?'Space로 뛰어올라 좌클릭 — 점프 공격. Ctrl을 누른 채면 점프 강공격이다.':'점프한 뒤 공격 — 점프 공격. 공격을 길게 누르면 점프 강공격이다.',
  pc?'네 초상 둘레의 고리가 공허다. 40이 찼다. Q — 「공허의 시야」.':'네 초상 둘레의 고리가 공허다. 40이 찼다. Q 버튼 — 「공허의 시야」.',
  pc?'아래 금빛 막대가 공명이다. 가득 찼다. R — 궁극기 「공허 개방」.':'아래 금빛 막대가 공명이다. 가득 찼다. R 버튼 — 궁극기 「공허 개방」.',
  '좋다. 이제 실전처럼 덤벼라.'][i]}
const TUTN=9;
function tutorial(){const t=tut;
  if(t.shown!==t.step){t.shown=t.step;$('atutText').textContent=tutText(t.step);$('atut').classList.add('on');$('atutN').textContent=`${t.step+1} / ${TUTN}`;
    if(t.step===6){P.void=Math.max(P.void,40);hud()}if(t.step===7){P.ult=100;hud()}}
  const done=[P.moved>3,t.hits>=3,t.heavy>=1,t.parried>=1,t.dodged>=1,t.plunged>=1,t.voided>=1,t.ulted>=1,false][t.step];
  if(done){t.step++;sfx('heal');callout('좋다','org');ENS[0].cool=1.4}
  if(t.step===8&&ENS[0].hp<=ENS[0].max*.3+.01&&!S.ending){S.ending=true;tutEnd()}}
async function tutEnd(){await wait(400);await say('카르도','“됐다, 그만! 허허… 손이 저리는구나.”');
  await say('카르도','“기억해라. 베어서 공허를 모으고, 주황은 맞춰 흘려보내고, 빨강은 피하거나 넘고, 기세는 공허로 지운다. 나머지는 몸이 알아서 익힐 게다.”');finishWin(true)}

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
async function finishWin(quiet){unlockPointer();
  if(!quiet){const r=$('result');r.innerHTML=`<h2>${DEF.noJudge?'승리':(DEF.label||'단죄')}</h2><p>${DEF.noJudge?DEF.name+'을(를) 물리쳤다.':DEF.label?DEF.name+'을(를) 제압했다.':DEF.name+'의 사념이 이든의 공허 속으로 가라앉는다.'}</p>`;
    r.classList.add('on');await wait(1700);r.classList.remove('on')}
  stop();const f=resolveFn;resolveFn=null;f&&f()}
async function lose(){S.ending=true;S.paused=true;unlockPointer();ctx.onLose&&ctx.onLose();await wait(600);
  const r=$('result');r.innerHTML=`<h2>쓰러졌다</h2><p>${ctx.name}의 시야가 공허로 잠긴다.<br>전투를 처음부터 다시 시작한다.</p><button class="tbtn" style="width:200px" id="retry">다시 싸우기</button>`;
  r.classList.add('on');await new Promise(res=>$('retry').onclick=res);r.classList.remove('on');S.ending=false;start(curId)}
function stop(){S.running=false;S.ending=false;$('act').classList.remove('on');$('atip').classList.remove('on');$('atut').classList.remove('on');$('hud').style.display='flex';closeMap();
  if(initOK)E.clear()}

/* ═══════════════ 지도 (M) ═══════════════ */
const mapOpen=()=>$('mapOv').classList.contains('on');
function openMap(){if(!S.running)return;$('mapOv').classList.add('on');S.paused=true;S.mapPause=true;unlockPointer();drawMap($('mapC'),false)}
function closeMap(){if(!$('mapOv').classList.contains('on'))return;$('mapOv').classList.remove('on');if(S.mapPause){S.mapPause=false;S.paused=false}}
// full=true: 북쪽 위 전체 지도, false 면 미니맵(카메라 방향이 위)
function drawMap(c,mini){const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);
  const s=mini?W/2/9:Math.min(W,H)/2/(ARENA+1.5);const cx=W/2,cy=H/2;
  const tf=mini?(dx,dz)=>{const f=camFwd(),r=[-f[1],f[0]];return[cx+(dx*r[0]+dz*r[1])*s,cy-(dx*f[0]+dz*f[1])*s]}:(dx,dz)=>[cx+dx*s,cy+dz*s];
  const ox=mini?P.x:0,oz=mini?P.z:0;
  x.save();if(mini){x.beginPath();x.arc(cx,cy,W/2-2,0,7);x.clip()}
  x.fillStyle=mini?'rgba(12,10,20,.72)':'rgba(12,10,20,.0)';x.fillRect(0,0,W,H);
  // 경기장
  const [ax,ay]=tf(-ox,-oz);x.beginPath();x.arc(ax,ay,ARENA*s,0,7);x.fillStyle='rgba(120,110,150,.22)';x.fill();x.strokeStyle='rgba(201,197,214,.6)';x.lineWidth=mini?1.5:2;x.stroke();
  // 아이템
  for(const it of S.items){const [px,py]=tf(it.x-ox,it.z-oz);x.fillStyle=it.type==='heal'?'#7dffa0':'#b9a0ff';x.beginPath();x.moveTo(px,py-5);x.lineTo(px+4,py);x.lineTo(px,py+5);x.lineTo(px-4,py);x.fill()}
  // 적
  for(const e of ENS){if(e.dead)continue;const [px,py]=tf(e.x-ox,e.z-oz);x.fillStyle=e.state==='wind'?'#ffb15c':'#ff5a6a';x.beginPath();x.arc(px,py,mini?4:7,0,7);x.fill()}
  // 이든 (바라보는 방향)
  const [ex,ey]=tf(P.x-ox,P.z-oz);const fa=Math.atan2(camFwd()[0],camFwd()[1]);
  x.translate(ex,ey);x.rotate(mini?fa-P.face:Math.PI-P.face);x.fillStyle='#fff';x.beginPath();x.moveTo(0,-8);x.lineTo(6,6);x.lineTo(0,3);x.lineTo(-6,6);x.closePath();x.fill();
  x.restore();
  if(mini){x.strokeStyle='rgba(201,197,214,.55)';x.lineWidth=2;x.beginPath();x.arc(cx,cy,W/2-2,0,7);x.stroke()}}

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
  $('pUlt').style.width=P.ult+'%';$('pUltN').textContent=Math.floor(P.ult)+'%';
  $('pSy').style.width=P.sync+'%';$('pSyN').textContent=P.sync+'%'+(P.sync>=80?' 승화':'');$('syncRow').classList.toggle('hot',P.sync>=80);
  const pc=[];if(P.fear>0)pc.push(['vio','공포']);if(P.bind>0)pc.push(['red','사슬']);if(P.crit>0)pc.push(['gry',`설계 ×2 (${P.crit})`]);if(P.immune)pc.push(['gry','공포 면역']);if(P.weapon==='ter')pc.push(['vio','테로르 장착']);
  $('pChips').innerHTML=pc.map(c=>`<span class="chip ${c[0]}">${c[1]}</span>`).join('');
  const skName=ctx.flags.reunited?'공명 베기':(ctx.partner==='A'?'정교한 설계':'감정 증폭');
  document.querySelectorAll('[data-k="void"]').forEach(b=>{b.classList.toggle('ready',P.void>=40);b.classList.toggle('off',P.void<40)});
  document.querySelectorAll('[data-k="skill"]').forEach(b=>{b.classList.toggle('off',P.skillCd>0);const c=b.querySelector('.cd');if(c)c.textContent=P.skillCd>0?Math.ceil(P.skillCd):'';const n=b.querySelector('b');if(n)n.textContent=b.classList.contains('sk')?skName:skName.slice(0,2)});
  document.querySelectorAll('[data-k="ult"]').forEach(b=>{b.classList.toggle('ready',P.ult>=100);b.classList.toggle('off',P.ult<100);b.style.setProperty('--u',P.ult)});
  document.querySelectorAll('[data-k="swap"] b').forEach(b=>b.textContent=P.weapon==='ter'?'시너지아':'테로르')}
// 매 프레임: 상호작용 안내, 화면 밖 보스 화살표, 미니맵
let miniT=0;
function overlay(){const it=interactTarget();const pr=$('prompt'),bi=$('bInteract');
  if(it){$('promptText').textContent=it.label;pr.classList.add('on');bi.classList.add('on');bi.querySelector('b').textContent=it.kind==='judge'?(DEF.label||'단죄'):'줍기'}else{pr.classList.remove('on');bi.classList.remove('on')}
  const e=(!DEF.noJudge&&ENS[0]&&!ENS[0].dead)?ENS[0]:nearest();const ar=$('offArrow');
  if(e&&!cine){const [sx,sy,ok]=E.project(e.x,1.2,e.z);const W=cv.clientWidth,H=cv.clientHeight;
    if(!ok||sx<0||sx>W||sy<0||sy>H){let dx=sx-W/2,dy=sy-H/2;if(!ok){dx=-dx;dy=-dy}const a=Math.atan2(dy,dx);const r=Math.min(W,H)*.42;
      ar.style.left=(W/2+Math.cos(a)*r)+'px';ar.style.top=(H/2+Math.sin(a)*r)+'px';ar.style.transform=`translate(-50%,-50%) rotate(${a}rad)`;ar.classList.add('on');ar.classList.toggle('warn',e.state==='wind')}
    else ar.classList.remove('on')}else ar.classList.remove('on');
  if(++miniT%2===0)drawMap($('miniC'),true)}

/* ═══════════════ 동작 (애니메이션) ═══════════════ */
function playerMotion(){if(P.heavyAtk)return'V';if(P.weapon==='ter')return P.combo===0?'V':'H1';return['H1','H2','V'][P.combo%3]}
function animate(dt){
  const r=P.rig;let name='idle',k=0;
  const charging=IN.atkDown&&!IN.heavyFired&&!IN.airHold&&IN.atkT>.15&&grounded()&&(P.state==='idle'||P.state==='move');
  if(P.hp<=0)name='dead';
  else if(cine){name='V';const t=cine.t;k=t<.35?t/.35*.3:t<.6?.3+(t-.35)/.25*.25:.55}
  else if(P.state==='ult'){name=P.t<.45?'cast':'V';k=P.t<.45?Math.min(.3,P.t/.45*.3):.3+Math.min(.7,(P.t-.45)/.55*.7)}
  else if(charging)name='charge';
  else if(P.state==='move')name='run';
  else if(P.state==='atk'){name=playerMotion();k=P.t/P.atkDur}
  else if(P.state==='dodge')name='dodge';else if(P.state==='dash')name='dash';else if(P.state==='hurt')name='hurt';
  else if(P.state==='air')name='jump';else if(P.state==='plunge')name='plunge';else if(P.state==='land')name='dodge';
  r.play(name,k);r.update(dt);
  for(const e of ENS){let n='idle',kk=0;const a=e.att;
    if(e.dead)n='dead';else if(e.state==='stun'||e.state==='stag')n='stun';
    else if(e.state==='wind'&&a){n=a.mo||'H1';kk=.3*Math.min(1,e.t/a.wind)}
    else if(e.state==='rec'&&a){n=a.mo||'H1';kk=.3+.7*Math.min(1,e.t/Math.max(.35,a.rec))}
    else if(e.moving)n='run';
    e.rig.play(n,kk);e.rig.update(dt);
    let want=Math.atan2(P.x-e.x,P.z-e.z);if((e.state==='wind'||e.state==='rec')&&e.dir)want=Math.atan2(e.dir[0],e.dir[1]);
    let dy=want-e.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;e.yaw+=dy*Math.min(1,dt*12)}
  if(P.drawYaw===undefined)P.drawYaw=P.face;let d=P.face-P.drawYaw;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;P.drawYaw+=d*Math.min(1,dt*16)}

/* ═══════════════ 그리기 ═══════════════ */
function render(){if(!E.resize())return;E.clear();
  let sx=0,sy=0;if(shakeT>0){sx=R(-1,1)*shakeT*.5;sy=R(-1,1)*shakeT*.5}
  E.camera(CAM.x+sx,CAM.y+sy,CAM.z,CAM.tx,CAM.ty,CAM.tz);E.begin();
  Stages.drawSolid();
  FX.shadow(P.x,P.z,.7*Math.max(.4,1-P.y*.25));for(const e of ENS)if(!e.dead||e.alpha>.3)FX.shadow(e.x,e.z,.7*e.rig.scale);
  for(const t of S.tele){const e=t.e,a=t.a;if(e.att)FX.telegraph(e,a,clamp(e.t/a.wind,0,1))}
  // 아이템
  for(const it of S.items){const c=ITEMS[it.type].col,y=.7+Math.sin(it.t*3)*.12,rot=it.t*2;
    E.mesh(E.geo('cone4'),E.m4.trs(it.x,y,it.z,0,rot,0,.32,.3,.32),{c,e:[c[0]*.5,c[1]*.5,c[2]*.5],outline:.02});
    E.mesh(E.geo('cone4'),E.m4.trs(it.x,y,it.z,Math.PI,rot,0,.32,.3,.32),{c,e:[c[0]*.5,c[1]*.5,c[2]*.5],outline:.02})}
  const pt=P.iframe>0?[.85,.85,1.25]:null;
  P.rig.draw(P.x,P.y,P.z,P.drawYaw,{flash:P.flash>0?.2:0,tint:pt,emit:P.weapon==='ter'?[.06,0,.1]:null});
  for(const e of ENS){if(e.alpha<=0)continue;let fl=e.flash>0?.18:0,emit=null,tint=null;
    if(e.state==='wind'&&e.att){const p=.5+.5*Math.sin(S.time*18);emit=e.att.parry?[.22*p,.11*p,0]:[.28*p,0,.02*p]}
    if(e.state==='stun')tint=[.65,.65,.75];
    e.rig.draw(e.x,e.hop||0,e.z,e.yaw,{flash:fl,emit,tint,alpha:e.alpha})}
  for(const e of ENS)if(e.barrier&&!e.dead){const p=.55+.15*Math.sin(S.time*3);E.quad(E.geo('ring:0.86'),E.m4.trs(e.x,1,e.z,Math.PI/2,E.yawTo(e.x,e.z),0,1.25,1,1.35),E.tex.band,[.6,.4,1,p*.8],{add:1})}
  for(const it of S.items){const c=ITEMS[it.type].col;E.quad(E.geo('ctr'),E.m4.trs(it.x,.75,it.z,0,E.yawTo(it.x,it.z),0,1.2,1.2,1),E.tex.glow,[c[0],c[1],c[2],.45],{add:1})}
  if(P.weapon==='ter')E.quad(E.geo('ctr'),E.m4.trs(P.x,P.y+1,P.z,0,E.yawTo(P.x,P.z),0,2.2,2.6,1),E.tex.glow,[.55,.2,.8,.28],{add:1});
  if(IN.atkDown&&!IN.heavyFired&&IN.atkT>.15&&grounded()){const k=Math.min(1,IN.atkT/HOLD),c=Weapons.trail(P.rig.weaponR);E.quad(E.geo('ctr'),E.m4.trs(P.x,1,P.z,0,E.yawTo(P.x,P.z),0,1.4+k,1.4+k,1),E.tex.glow,[c[0],c[1],c[2],.2+.35*k],{add:1})}
  FX.draw();Stages.drawAmbient()}

/* ═══════════════ 카메라 (3인칭 백뷰) ═══════════════ */
function camera(dt){CAM.lookT+=dt;
  if(cine){const e=cine.e;const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;const bx=dx/d,bz=dz/d;
    const px=P.x+bx*4.4-bz*2.6,pz=P.z+bz*4.4+bx*2.6;const k=1-Math.exp(-4*dt);
    CAM.x+=(px-CAM.x)*k;CAM.z+=(pz-CAM.z)*k;CAM.y+=(2.4-CAM.y)*k;CAM.tx+=((P.x+e.x)/2-CAM.tx)*k;CAM.tz+=((P.z+e.z)/2-CAM.tz)*k;CAM.ty+=(1.3-CAM.ty)*k;return}
  // 시점 보정: 공격·강공격 중이고 잠시 시점을 안 돌렸으면 적 쪽으로 천천히 돌린다
  const e=nearest(9);
  if(e&&(SET().assist||window.__AS_BOT)&&(CAM.lookT>1.2||window.__AS_BOT)&&(P.state==='atk'||IN.atkDown||window.__AS_BOT)){const want=Math.atan2(P.x-e.x,P.z-e.z);let d=want-CAM.yaw;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;CAM.yaw+=d*Math.min(1,dt*(window.__AS_BOT?3:2))}
  const b=[Math.sin(CAM.yaw),Math.cos(CAM.yaw)],r=[Math.cos(CAM.yaw),-Math.sin(CAM.yaw)];const cp=Math.cos(CAM.pitch),sp=Math.sin(CAM.pitch);
  const tall=cv.clientHeight>cv.clientWidth;const dist=CAM.dist*(tall?1.18:1);
  const tx=P.x+r[0]*.45,tz=P.z+r[1]*.45,ty=1.35+P.y*.6;
  const k=1-Math.exp(-14*dt);CAM.tx+=(tx-CAM.tx)*k;CAM.tz+=(tz-CAM.tz)*k;CAM.ty+=(ty-CAM.ty)*k;
  CAM.x=CAM.tx+b[0]*dist*cp;CAM.z=CAM.tz+b[1]*dist*cp;CAM.y=Math.max(.4,CAM.ty+dist*sp)}

function loop(now){if(!S.running)return;let dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  if(!S.paused){if(slowT>0){slowT-=dt;if(slowT<=0)TS=1}if(shakeT>0)shakeT=Math.max(0,shakeT-dt);
    if(hitstop>0)hitstop-=dt;else{update(dt*TS);animate(dt*TS)}camera(dt);overlay()}
  render();requestAnimationFrame(loop)}

/* ═══════════════ 테스트용 자동 조종 ═══════════════ */
function bot(q){const mode=tut?'smart':window.__AS_BOT;
  // 아이템·단죄
  const it=interactTarget();if(it&&(it.kind==='judge'||mode==='smart')){q.interact=1}
  let e=target();if(!e||S.paused)return;
  const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz)||1;
  if(tut){const s=tut.step;if(s===0){q._wx=1;q._wz=0;return}if(s===6){q.void=1;return}if(s===7){q.ult=1;return}
    if(s===5){if(d>2.2){q._wx=dx/d;q._wz=dz/d;return}if(grounded()&&P.state!=='land')q.jump=1;else if(P.vy<1&&P.state==='air')q.plunge=1;return}
    if(s===2&&d<=2.2){q.heavy=1;return}}
  if(mode==='smart'){
    if(!DEF.noJudge&&!DEF.tutorial&&e.hp<=e.max*.25){q._wx=dx/d;q._wz=dz/d;return}
    for(const t of S.tele){const a=t.a,en=t.e;if(!en.att)continue;const rem=a.wind-en.t;
      if(inShape(en,a,P.x,P.z,.6)&&rem<.22&&rem>0){let ax,az;if(a.shape==='circle'){ax=P.x-a._cx;az=P.z-a._cz}else{ax=-en.dir[1];az=en.dir[0]}const l=Math.hypot(ax,az)||1;q._wx=ax/l;q._wz=az/l;q.dodge=1;return}}
    if(P.ult>=100&&d<4)q.ult=1;
    if(P.void>=40&&(e.stacks>=2||e.barrier))q.void=1;
    if(P.skillCd<=0&&d<3)q.skill=1;
    if(curId==='phobia'&&P.weapon==='ter')q.swap=1;
    if(curId==='teror'&&ctx.flags.teror&&P.weapon==='syn'&&P.sync<70)q.swap=1;
    if(P.weapon==='ter'&&P.sync>=80)q.swap=1;
    if(d<=2.1&&Math.random()<.04){q.heavy=1;return}
  }
  if(d>2.1){q._wx=dx/d;q._wz=dz/d;if(d>6&&mode==='smart')q.dash=1}else{q._wx=0;q._wz=0;q.atk=1}}

/* ═══════════════ 공개 ═══════════════ */
let inputReady=false;
window.Action={async run(id,c){ctx=c;
  const ok=await init().catch(err=>{console.error(err);return false});
  if(ok&&!inputReady){setupInput();inputReady=true}
  if(!ok){return new Promise(res=>{const r=$('result');r.innerHTML='<h2>3D를 켤 수 없다</h2><p>이 브라우저에서 WebGL을 사용할 수 없어 전투를 건너뜁니다.</p><button class="tbtn" id="retry" style="width:200px">계속</button>';r.classList.add('on');$('retry').onclick=()=>{r.classList.remove('on');res()}})}
  return new Promise(res=>{resolveFn=res;start(id)})},
  pause(v){if(S.running&&!S.mapPause)S.paused=v},closeMap,
  get running(){return S.running},
  get state(){return{P,ENS,DEF,tut}}};
})();
