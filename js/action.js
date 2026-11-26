/* 액팅 소울 : 0 — action.js  v0.9.6
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
(window.AS_VERSIONS=window.AS_VERSIONS||{})['action.js']='0.9.6';

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
const ICON={nesis:'img/chars/nesis_executor.webp',sentia:'img/ic_sentia.webp',sensus:'img/ic_sensus.webp',kardo:'img/kardo.webp',phobia:'img/phobia.webp'};

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
/* ── 네시스 · 흡융 즉사 기믹 (시험판) ──────────────────────────────────
   네시스는 「흡융」으로 즉사 기믹을 전개한다. 피하는 것이 아니라, 완성되기 전에 흡융 현상 자체를 제거해야 한다.
   기믹은 두 가지 형태이고, 각각 정해진 상황에서 한 번씩만 나온다. 나오기 전에 「흡융의 징조」(2.2초)로 예고한다.
   네시스가 경직·무방비일 때는 풀린 뒤에 시작하고, 앞 기믹이 끝나고 35초가 지나기 전에는 다음 기믹이 나오지 않는다.

   ① 흡융 핵 전개  — 상황: 네시스 체력 55% (궁지에 몰려 흡융을 펼친다)
      가운데로 물러나 피해 무효. 가장자리 쪽 흡융 핵 4개(체력 45), 이든을 가운데로 강하게 끌어당김.
      네시스는 흡융탄을 쉬지 않고 쏜다.
      제거: 핵을 공격으로 부수기 · 「공허의 시야」는 5m 안의 핵 「하나」만 · 궁극기 7.5m. 제한 12초.
   ② 흡융 낙인    — 상황: 네시스 체력 35% 이하에서 이든이 네시스에게 공허의 힘(공허의 시야 · 공허 개방)을 쓸 때
                    — 네시스가 이든의 공허를 역으로 삼키려 한다. 공허를 쓰지 않으면 나오지 않는다.
      이든에게 낙인 4겹. 네시스는 피해 무효로 사슬만 이어 휘두른다.
        「흡융 사슬」(주황) — 흘려보내면 낙인 1겹 제거.  「흡융 올가미」(빨강, 위장) — 흘려보낼 수 없다, 피해야 한다.
        어느 쪽이든 맞으면 낙인 +1겹 (최대 5). 올가미는 4번 중 1번꼴.
      제거: 흡융 사슬 흘려보내기 · 네시스 6m 안에서 「공허의 시야」로 1겹 (한 번만). 제한 15초.
   성공: 흡융 역류 — 네시스 6초 무방비 + 받는 피해 1.5배, 공명 +25.   실패: 즉사 (마스터 모드 무적이면 버팀).
   수치는 아래 FUSE 에서 바꾼다. */
const FUSE={forms:[{kind:'cores',at:.55,limit:12},{kind:'brand',at:.35,limit:15,onVoid:1}],omen:2.2,gap:35,
  cores:4,coreHp:45,radius:6.6,voidR:5,ultR:7.5,pull:[.8,2.3],orbCd:.35,
  brandStacks:4,brandMax:5,brandVoidR:6,brandVoidUses:1,feint:.25,stun:6,vuln:1.5};
DEFS.nesis={name:'네시스',sub:'집행자 · 흡융',tex:'nesis',H:1.9,hp:1000,speed:3.0,pref:2.4,gap:.7,stage:'shrine',fuse:1,
  atks:{cut:{mo:'H1',n:'흡융 베기',wind:.7,shape:'cone',range:3.0,ang:110,dmg:15,rec:.6,parry:1},
        orb:{mo:'cast',n:'흡융탄',wind:.9,shape:'circle',r:2.2,dmg:14,rec:.4,atPlayer:1},
        lance:{mo:'stab',n:'역류 관통',wind:.85,shape:'line',len:8,w:1.4,dmg:18,rec:.7,heavy:1},
        chain:{mo:'H2',n:'흡융 사슬',wind:.8,shape:'line',len:7,w:1.6,dmg:12,rec:.4,parry:1},
        snare:{mo:'H1',n:'흡융 올가미',wind:.8,shape:'line',len:7,w:1.8,dmg:16,rec:.45}},
  pick(e,d){if(S.omen)return null;if(fuseOn())return S.fuse.kind==='brand'?(d<7.5?(Math.random()<FUSE.feint?'snare':'chain'):null):(e.cool<=0?'orb':null);const r=Math.random();if(d>4.2)return r<.55?'orb':'lance';return r<.5?'cut':r<.75?'lance':'orb'}};
/* ── 링크 시스템 ────────────────────────────────────────────────
   이든이 연결한 감정의 고리. 0번(공허 & 흡융)은 처음부터 연결되어 있고, 사념을 계승할 때마다 하나씩 이어진다.
   여섯 고리가 모두 이어지면(링크 최대) 궁극기 「공허 개방」이 「아르케 해방」으로 바뀐다.
   시즌 1 체험판에서 링크 최대는 네시스 전투(후반부)에서만 열린다. */
const LINKS=[{n:0,name:'공허 & 흡융',em:'void_crystal'},{n:1,name:'분노',em:'anger_crystal'},{n:2,name:'두려움',em:'fear_crystal'},
  {n:3,name:'슬픔',em:'sorrow_crystal'},{n:4,name:'기쁨',em:'joy_crystal'},{n:5,name:'교만',em:'pride_crystal'}];
function linkLit(){const f=ctx.flags||{};if(Array.isArray(f.links))return f.links;const l=[0];if(f.teror)l.push(2);return l}
const linkMax=()=>linkLit().length>=LINKS.length;
/* ── 아르케 해방 (링크 최대에서 공허 개방) ───────────────────────
   무기가 아르케로 바뀌고 등 뒤에 이든의 헤일로(보라색 5개 교차 고리 + 검은 블랙홀)가 생긴다.
   공허 영역 전개: 배경이 공허로 물들고, 영역 안의 적은 느려지며 감정 강화가 쌓이지 않는다. */
const ARCHE={dur:15,dmg:1.5,range:.5,slow:.75};
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
    if(e.repeat)return;IN.keys[k]=1;if(window.Settings&&Settings.isOpen())return;if(S.paused&&k!=='m')return;
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
     arche:0,resonT:0,cdA:0,cdB:0,cdX:0,sister:ctx.partner==='A'?'sentia':'sensus',fear:0,immune:false,shield:0,crit:0,skillCd:0,bind:0,flash:0,face:Math.PI,hitDone:false,lastDodge:-9,moved:0,jumps:0,rig:Avatars.create('eden')};
  edenWeapons();
  ENS=[];const n=DEF.count||1;
  for(let i=0;i<n;i++){const a=n>1?(i-(n-1)/2)*.9:0;ENS.push({x:Math.sin(a)*5,z:-3-Math.cos(a)*2*(n>1?1:0),hp:DEF.hp,max:DEF.hp,state:'idle',t:0,cool:1.2+i*.6,stun:0,
    stacks:0,stackT:0,barrier:id==='phobia'?1:0,brokenT:0,flash:0,dir:[0,1],att:null,alpha:1,dead:false,flags:{},fed:0,yaw:0,moving:false,rig:Avatars.create(DEF.tex)})}
  S.tele=[];S.items=[];S.hitQ=[];S.fuse=null;S.omen=null;S.fuseEndT=-1e9;S.deathMsg='';S.archeTip=0;DOM.k=0;DOM.kind='';DOM.burst=0;TS=1;hitstop=0;slowT=0;cine=null;IN.q={};IN.atkDown=false;
  tut=DEF.tutorial?{step:0,hits:0,heavy:0,parried:0,dodged:0,plunged:0,voided:0,ulted:0,shown:-1}:null;
  CAM.yaw=0;CAM.pitch=.24;CAM.x=0;CAM.y=3;CAM.z=10;CAM.tx=0;CAM.ty=1.3;CAM.tz=5;CAM.lookT=9;
  $('aName').textContent=DEF.name;$('aSub').textContent=DEF.sub;$('aJudgeMark').style.display=(DEF.noJudge||DEF.tutorial)?'none':'block';
  const hasTer=ctx.flags.teror&&!DEF.tutorial;
  document.querySelectorAll('[data-k="swap"]').forEach(b=>b.style.display=ownedWeapons().length>1?'':'none');
  $('syncRow').style.display=hasTer?'':'none';
  $('miniName').textContent={forge:'대장간 뒤뜰',wall:'경계의 성벽',forest:'통곡의 숲',shrine:'신성한 사당'}[DEF.stage]||'';
  $('act').classList.add('on');$('result').classList.remove('on');$('atut').classList.remove('on');$('hud').style.display='none';
  if(!S.running){S.running=true;lastT=performance.now();requestAnimationFrame(loop)}
  S.paused=false;S.ending=false;hud();
  intro();
}
// 전투 시작 카드: 초상 · 무기 · 감정 문장 (이미지는 img/ 폴더, 목록은 assets.js)
const CARD={kardo:{p:'img/kardo.webp'},
  furor:{p:'img/furor.webp',w:'img/weapons/furor.webp',e:'img/emblems/anger.webp'},
  fallen:{e:'img/emblems/fear_crystal.webp'},
  teror:{p:'img/teror.webp',e:'img/emblems/fear.webp'},
  phobia:{p:'img/phobia.webp',e:'img/emblems/fear.webp'},
  nesis:{p:'img/chars/nesis_executor.webp',e:'img/emblems/absorb.webp'}};
async function bossCard(){const c=CARD[curId],d=DEFS[curId],el=$('bossCard');if(!c||!el)return;
  const set=(id,src)=>{const im=$(id);im.style.display=src?'':'none';if(src)im.src=src};
  set('bcPor',c.p);set('bcWep',c.w);set('bcEm',c.e);$('bcName').textContent=d.name;$('bcSub').textContent=d.sub||'';
  el.classList.add('on');await wait(window.Master&&Master.on?500:1700);el.classList.remove('on');await wait(150)}
async function intro(){S.paused=true;await wait(300);await bossCard();
  if(curId==='kardo'){await say('카르도','“검을 쥐어라. 오늘 가르칠 건 여러 가지다. 하나씩 몸에 새겨 넣어라.”')}
  S.paused=false;
  const T0={furor:['“저 열기, 시간이 갈수록 쌓여. 공허가 40 차면 「공허의 시야」로 지워버려.”','“주인! 저 언니 점점 뜨거워져! 공허 40 모이면 「공허의 시야」로 꺼버리자!”'],
    fallen:['“주황색 공격은 맞기 직전에 회피하면 흘려보내져. 빨간색은 그냥 피하거나 뛰어넘어.”','“주황색은 딱 맞춰 피하면 흘려보내져! 빨간 건 굴러서 피하거나 점프!”'],
    teror:['“테로르는 마을 사람들의 공포를 먹고 계속 강해져. 오래 끌면 안 돼.”','“저 칼에 찔리면 몸이 굳어! 조심해 주인!”'],
    phobia:['“성흔 장벽 때문에 그냥 베면 반밖에 안 들어가. 공허로 걷어내든가, 낫을 흘려보내.”','“저 반짝이는 막, 칼이 미끄러져! 공허로 지우거나 큰 낫을 흘려보내!”']}[curId];
  if(T0)tip(T0[ctx.partner==='A'?0:1])}

/* ═══════════════ 대사 / 팁 / 화면 글자 ═══════════════ */
async function say(n,t){S.paused=true;unlockPointer();IN.atkDown=false;await window.VN.say(n,t);IN.q={};S.paused=false}
let tipT;
function tip(text,who){who=who||(ctx.partner==='A'?'sentia':'sensus');$('atipImg').src=ICON[who];
  $('atipName').textContent={sentia:'센티아',sensus:'센수스',kardo:'카르도',phobia:'포비아',nesis:'네시스'}[who];$('atipText').textContent=text;
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
function shake(t){shakeT=Math.max(shakeT,t*SET().shake);if(t>=.12)buzz(Math.round(15+t*110))}
// 진동: 피격·화면 흔들림에 맞춰 휴대폰을 울린다 (설정 「진동」, 안드로이드 크롬 등 지원 기기만)
let buzzAt=0;function buzz(p){if(!SET().vibe||!navigator.vibrate)return;const now=performance.now();if(now-buzzAt<70)return;buzzAt=now;try{navigator.vibrate(p)}catch(err){}}
function slow(t,s){slowT=t;TS=s}
const grounded=()=>P.y<=.001;
function camFwd(){return[-Math.sin(CAM.yaw),-Math.cos(CAM.yaw)]}
// 공격 방향: 가까운 적(6m) → 이동 방향 → 카메라 앞
function aimFace(){const e=nearestCore(6)||nearest(6);if(e){P.face=Math.atan2(e.x-P.x,e.z-P.z);return e}if(Math.hypot(P.mx,P.mz)>.2)P.face=Math.atan2(P.mx,P.mz);else{const f=camFwd();P.face=Math.atan2(f[0],f[1])}return null}
function edenWeapons(){const r=P.rig;if(P.arche>0){r.weaponR='arche';r.weaponL=null;return}if(P.weapon==='ter'){r.weaponR='ego_teror';r.weaponL=null}else{r.weaponR=P.sister;r.weaponL=null}}
const ENEMY_TRAIL={nesis:[.55,.8,1],kardo:[.9,.8,.6],furor:[1,.45,.2],fallen:[.8,.3,.5],teror:[.7,.3,1],phobia:[.75,.55,1]};
function gainUlt(v){P.ult=Math.min(100,P.ult+v)}

/* ═══════════════ 플레이어 행동 ═══════════════ */
// 기본 공격 4타. 4타째는 마무리 — 시너지아(센티아·센수스)·아르케: 360° 회전 베기 / 테로르: 내려찍기 (범위 +0.5m)
const SYN={dmg:[6,7,8,13],time:[.28,.28,.32,.5],range:2.5,heavy:24,moves:['H1','H2','V','spin']};
const TER={dmg:[14,16,19,28],time:[.46,.48,.5,.7],range:2.8,heavy:34,moves:['V','H1','H2','V']};
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
  const fin=!heavy&&P.combo===W.dmg.length-1,spin=fin&&mo==='spin';
  if(spin){FX.spawn('slash',{x:P.x,y:1.05,z:P.z,yaw:P.face+Math.PI,roll:-.22,dir:1,r:W.range*.95,col,life:.26});FX.spawn('ring',{x:P.x,z:P.z,size:1,grow:1.8,life:.35,col});shake(.12)}
  else if(fin){FX.spawn('ring',{x:P.x+fx0*1.4,z:P.z+fz0*1.4,size:1.2,grow:1.5,life:.35,col});shake(.15)}
  if(heavy){FX.spawn('ring',{x:P.x+fx0*1.6,z:P.z+fz0*1.6,size:1.4,grow:1.4,life:.4,col});shake(.18)}
  const range=(heavy?3.3:W.range)+(fin?.5:0)+(P.arche>0?ARCHE.range:0),cosA=spin?-1:Math.cos((heavy?75:65)*Math.PI/180);let any=false;
  for(const e of alive()){const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);if(d>range+.4)continue;
    if(d>1&&(dx*fx0+dz*fz0)/d<cosA)continue;
    let dmg=heavy?W.heavy:W.dmg[P.combo];if(P.weapon==='ter'&&P.sync>=80)dmg=Math.round(dmg*1.4);if(P.arche>0)dmg=Math.round(dmg*ARCHE.dmg);
    hitEnemy(e,dmg,{weapon:P.weapon,stagger:heavy||fin});any=true}
  if(fuseOn())for(const c of S.fuse.cores){if(c.dead)continue;const dx=c.x-P.x,dz=c.z-P.z,d=Math.hypot(dx,dz);if(d>range+.5)continue;if(d>1&&(dx*fx0+dz*fz0)/d<cosA)continue;hitCore(c,heavy?W.heavy:W.dmg[P.combo]);any=true}
  if(any){if(P.weapon==='ter'){P.sync=Math.min(100,P.sync+(heavy?18:12));P.void=Math.min(100,P.void+4);gainUlt(heavy?8:3);if(P.sync>=100)erosion()}
    else{P.void=Math.min(100,P.void+(heavy?12:7));gainUlt(heavy?8:2)}
    if(tut&&tut.step===2&&heavy)tut.heavy++}
  sfx(any?(heavy||fin||P.weapon==='ter'?'heavy':'hit'):'ui')}
function hitEnemy(e,raw,o={}){
  if(e.lock||e.inv){num(e.x,DEF.H*.75,e.z,'무효','');e.flash=.05;return}
  let d=raw*(P.fear>0?.6:1)*(e.vuln>0?FUSE.vuln:1);if(P.crit>0&&!o.noCrit){d*=2;P.crit--}
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
  if(fuseOn())for(const c of S.fuse.cores)if(!c.dead&&Math.hypot(c.x-P.x,c.z-P.z)<=r+.5){hitCore(c,heavy?28:15);any=true}
  if(any){P.void=Math.min(100,P.void+(heavy?14:8));gainUlt(heavy?8:4)}
  if(tut&&tut.step===5)tut.plunged++;
  P.state='land';P.t=0}
async function doVoid(){if(P.void<40||P.state==='dodge'||P.state==='ult')return;P.void-=40;sfx('void');
  if(tut&&tut.step===6)tut.voided=1;
  slow(1.1,.3);vfx();
  FX.spawn('ring',{x:P.x,z:P.z,size:1.2,grow:7,life:.7,col:[.6,.5,1]});FX.spawn('vring',{x:P.x,y:1.1,z:P.z,size:1,life:.5,col:[.7,.6,1]});
  P.fear=0;
  if(fuseOn()){if(S.fuse.kind==='cores'){const c=nearestCore(FUSE.voidR);if(c)coreBreak(c,true);else callout('흡융 핵이 너무 멀다 — 5m 안에서','red')}
    else{const e=ENS[0],f=S.fuse;if((f.voidUsed||0)>=FUSE.brandVoidUses)callout('공허로는 더 지울 수 없다 — 사슬을 흘려보내라','red');else if(Math.hypot(e.x-P.x,e.z-P.z)<=FUSE.brandVoidR){f.voidUsed=(f.voidUsed||0)+1;brandStrip('void')}else callout('네시스가 너무 멀다 — 6m 안에서','red')}}
  else fuseVoidTrigger();
  for(const e of alive()){if(e.lock)continue;if(Math.hypot(e.x-P.x,e.z-P.z)>9)continue;const had=e.stacks;e.stacks=0;e.stun=3;e.state='stun';S.tele=S.tele.filter(t=>t.e!==e);e.att=null;
    if(curId==='phobia'){e.barrier=0;e.brokenT=8}
    hitEnemy(e,10,{pierce:1,noCrit:1});
    if(curId==='furor'&&had)callout(`열기 ${had} → 0 · 출력 제로`,'vio');}
  if(curId==='phobia')callout('성흔 장벽 소거','vio');if(curId==='teror')callout('공포 수확 소거','vio');
  hud()}
function vfx(){$('vfx').classList.remove('on');void $('vfx').offsetWidth;$('vfx').classList.add('on')}
/* ── E 스킬: 들고 있는 무기에 따라 바뀐다 ─────────────────────────────
   이든은 무기를 하나씩 든다. Tab 으로 센티아 → 센수스 → 테로르 순서로 바꾸고(가진 것만), E 는 지금 든 무기의 스킬.
   센티아                    「센티아 · 논리 절단」 (이성 — 계산한 세 절단선을 한꺼번에 벤다)
   센수스                    「센수스 · 감각 폭주」 (본성 — 감각에 몸을 맡긴 4연속 돌진 베기 + 마무리)
   에고웨폰 (흡수한 사념)    「공명 베기」 변형 — 사념의 힘을 쓴다. 체험판: 테로르 → 「공명 베기 · 공포」
   아르케 (해방 중)          아르케 고유 스킬 「아르케 · 기원의 일섬」
   무기마다 재사용 대기시간이 따로 돈다. */
const SKILL={
  sentia:{name:'센티아 · 논리 절단',btn:'논리 절단',cd:8},
  sensus:{name:'센수스 · 감각 폭주',btn:'감각 폭주',cd:8},
  arche:{name:'아르케 · 기원의 일섬',btn:'기원의 일섬',cd:8},
  // 공명 베기 변형 — 에고웨폰(흡수한 사념)마다 하나씩. 새 에고웨폰이 생기면 여기에 추가
  reson:{ter:{name:'공명 베기 · 공포',btn:'공명 · 공포',cd:10}}};
const WNAME={sentia:'센티아',sensus:'센수스',ter:'테로르'};
// 지금 가진 무기 목록 (전환 순서)
function ownedWeapons(){const l=ctx.flags.reunited?['sentia','sensus']:[ctx.partner==='A'?'sentia':'sensus'];if(ctx.flags.teror&&!DEF.tutorial)l.push('ter');return l}
const heldWeapon=()=>P.weapon==='ter'?'ter':P.sister;
const skillMode=()=>P.arche>0?'arche':P.weapon==='ter'?'reson':P.sister;
const skillCdKey=m=>m==='arche'?'cdX':m==='reson'?'skillCd':m==='sentia'?'cdA':'cdB';
// 시간차 타격 대기열 (스킬의 연속 타격용 — 일시정지·감속을 따른다)
function later(t,fn){S.hitQ.push({t,fn})}
function updateHitQ(dt){if(!S.hitQ.length)return;for(const q of S.hitQ)q.t-=dt;const due=S.hitQ.filter(q=>q.t<=0);S.hitQ=S.hitQ.filter(q=>q.t>0);for(const q of due)q.fn()}
const skTarget=r=>nearestCore(r)||nearest(r);
function hitAt(x,z,r,dmg,o={}){let n=0;for(const en of alive())if(Math.hypot(en.x-x,en.z-z)<=r+.3){hitEnemy(en,dmg,Object.assign({weapon:'syn'},o));n++}
  if(fuseOn())for(const c of S.fuse.cores)if(!c.dead&&Math.hypot(c.x-x,c.z-z)<=r+.4){hitCore(c,dmg);n++}return n}
/* 센티아 · 논리 절단 — 이성. 대상 위에 세 개의 절단선을 계산해 긋고(0.5초), 한꺼번에 잘라낸다.
   절단선마다 16 (세 줄이 모두 지나는 대상 중심은 48). 경직·무방비 상태의 적에겐 「약점 계산」 1.5배. 8m 안 대상(흡융 핵 우선), 없으면 앞쪽 4m */
function segDist(px,pz,ax,az,bx,bz){const vx=bx-ax,vz=bz-az,t=Math.max(0,Math.min(1,((px-ax)*vx+(pz-az)*vz)/(vx*vx+vz*vz)));return Math.hypot(px-ax-vx*t,pz-az-vz*t)}
function sentiaSkill(){const t=skTarget(8);const fx=Math.sin(P.face),fz=Math.cos(P.face);const tx=t?t.x:P.x+fx*4,tz=t?t.z:P.z+fz*4;
  callout(SKILL.sentia.name,'vio');sfx('parry');burst('sentia',.8);FX.spawn('vring',{x:P.x,y:1.2,z:P.z,size:1.1,life:.4,col:[.6,.9,1]});
  const lines=[];for(let i=0;i<3;i++){const a=P.face+Math.PI/2+i*Math.PI/3,dx=Math.sin(a)*2.6,dz=Math.cos(a)*2.6;lines.push([tx-dx,tz-dz,tx+dx,tz+dz,a])}
  // 계산: 절단선을 점선으로 미리 긋는다
  for(const [ax,az,bx,bz] of lines)for(let k=0;k<=6;k++){const u=k/6;FX.spawn('glow',{x:ax+(bx-ax)*u,y:1.1,z:az+(bz-az)*u,size:.45,col:[.6,.92,1],life:.5})}
  later(.5,()=>{shake(.22);sfx('heavy');FX.spawn('vring',{x:tx,y:1.1,z:tz,size:1.4,life:.4,col:[.75,.95,1]});
    for(const [ax,az,bx,bz,a] of lines)FX.spawn('slash',{x:tx,y:1.1,z:tz,yaw:a,roll:0,dir:1,r:2.6,col:[.65,.95,1],life:.25});
    for(const en of alive()){let n=0;for(const [ax,az,bx,bz] of lines)if(segDist(en.x,en.z,ax,az,bx,bz)<1)n++;
      if(n){const weak=en.state==='stun'||en.vuln>0;hitEnemy(en,Math.round(16*n*(weak?1.5:1)),{weapon:'syn',stagger:true});if(weak)callout('약점 계산','org')}}
    if(fuseOn())for(const c of S.fuse.cores){if(c.dead)continue;let n=0;for(const [ax,az,bx,bz] of lines)if(segDist(c.x,c.z,ax,az,bx,bz)<1.1)n++;if(n)hitCore(c,16*n)}})}
/* 센수스 · 감각 폭주 — 본성. 감각에 몸을 맡겨 대상에게 네 번 연달아 뛰어들며 베고, 마지막에 크게 휩쓴다.
   0.14초 간격 돌진 베기 9 × 4 (매번 대상 쪽으로 최대 2m) → 0.7초 주변 3.2m 휩쓸기 20 = 56. 돌진 중 무적 */
function sensusSkill(){callout(SKILL.sensus.name,'vio');sfx('heavy');burst('sensus',.9);P.iframe=Math.max(P.iframe,.8);
  for(let i=0;i<4;i++)later(.04+i*.14,()=>{const t=skTarget(6);if(t){const dx=t.x-P.x,dz=t.z-P.z,d=Math.hypot(dx,dz)||1;P.face=Math.atan2(dx,dz);if(d>1.2){const m=Math.min(2,d-1.1);P.x+=dx/d*m;P.z+=dz/d*m}}
    const fx=Math.sin(P.face),fz=Math.cos(P.face);FX.spawn('slash',{x:P.x,y:1+(i%2)*.15,z:P.z,yaw:P.face,roll:(i%2?.5:-.5),dir:i%2?-1:1,r:2.4,col:[1,.6,.3],life:.18});
    FX.spawn('spark',{x:P.x+fx*1.2,y:1.1,z:P.z+fz*1.2,n:5,col:[1,.6,.3],speed:5});sfx('hit');hitAt(P.x+fx*1.1,P.z+fz*1.1,1.6,9)});
  later(.7,()=>{FX.spawn('slash',{x:P.x,y:1.05,z:P.z,yaw:P.face,roll:0,dir:1,r:3.2,col:[1,.55,.25],life:.3});FX.spawn('slash',{x:P.x,y:1.05,z:P.z,yaw:P.face+Math.PI,roll:0,dir:1,r:3.2,col:[1,.55,.25],life:.3});
    FX.spawn('ring',{x:P.x,z:P.z,size:1.2,grow:2.2,life:.4,col:[1,.55,.25]});sfx('heavy');shake(.25);hitAt(P.x,P.z,3.2,20,{stagger:true})})}
// 공명 베기 · 공포 (에고웨폰 테로르): 앞쪽 8m 일직선 관통 베기 34, 맞은 적 1.2초 경직, 동기화율 +20. 공명 헤일로(황금 7개 재구성 고리)
function resonSlash(){const R=SKILL.reson.ter;P.resonT=1.4;burst('fear',.9);callout(R.name,'vio');sfx('heavy');
  const fx=Math.sin(P.face),fz=Math.cos(P.face),L=8,W=1.6;
  for(let i=1;i<=L;i+=1.4)FX.spawn('slash',{x:P.x+fx*i,y:1,z:P.z+fz*i,yaw:P.face,roll:Math.PI/2,dir:1,r:1.4,col:[.85,.25,.6],life:.3});
  FX.spawn('beam',{x:P.x+fx*L*.5,z:P.z+fz*L*.5,col:[.8,.2,.6],life:.4});
  for(const en of alive()){const dx=en.x-P.x,dz=en.z-P.z,along=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);if(along>-.5&&along<L&&side<W){hitEnemy(en,34,{stagger:true,weapon:'ter'});if(!en.lock&&!en.dead&&en.state!=='stun'){en.state='stun';en.stun=Math.max(en.stun||0,1.2);S.tele=S.tele.filter(t=>t.e!==en);en.att=null}}}
  if(fuseOn())for(const c of S.fuse.cores){if(c.dead)continue;const dx=c.x-P.x,dz=c.z-P.z,along=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);if(along>-.5&&along<L&&side<W+.4)hitCore(c,34)}
  P.sync=Math.min(100,P.sync+20)}
// 아르케 · 기원의 일섬 — 공허·기원. 앞으로 최대 6.5m 꿰뚫고 지나가며(무적) 길 위의 모든 것을 벤다 48, 0.45초 뒤 그 길에 공허의 균열이 터진다 30.
// 맞은 적의 감정 강화를 지우고, 길 위의 흡융 핵은 즉시 소거
function archeSkill(){const fx=Math.sin(P.face),fz=Math.cos(P.face),L=6.5,W=1.5,sx=P.x,sz=P.z;
  let len=L;const lim=ARENA-.6;for(let t=0;t<=L;t+=.25){const x=sx+fx*t,z=sz+fz*t;if(Math.hypot(x,z)>lim){len=t;break}}
  P.x=sx+fx*len;P.z=sz+fz*len;P.iframe=Math.max(P.iframe,.5);
  for(let t=0;t<=len;t+=.7)FX.spawn('glow',{x:sx+fx*t,y:1.1,z:sz+fz*t,size:1.1,col:[.8,.65,1],life:.4});
  FX.spawn('beam',{x:P.x,z:P.z,col:[.85,.75,1],life:.5});FX.spawn('vring',{x:P.x,y:1.2,z:P.z,size:1.8,life:.45,col:[.9,.8,1]});
  FX.spawn('slash',{x:P.x,y:1.1,z:P.z,yaw:P.face+Math.PI,roll:0,dir:1,r:3.6,col:[.85,.75,1],life:.35});
  for(const en of alive()){const dx=en.x-sx,dz=en.z-sz,along=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);if(along>-.6&&along<len+1&&side<W){hitEnemy(en,48,{stagger:true,weapon:'syn'});en.stacks=0;if(en.flags)en.flags.eye=1;en.harvest=0}}
  if(fuseOn())for(const c of S.fuse.cores){if(c.dead)continue;const dx=c.x-sx,dz=c.z-sz,along=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);if(along>-.6&&along<len+1&&side<W+.5){coreBreak(c,true);if(!fuseOn())break}}
  callout(SKILL.arche.name,'vio');sfx('heavy');shake(.3);burst('void',.8);
  // 지나간 길을 따라 0.45초 뒤 공허의 균열이 터진다 (30)
  later(.45,()=>{for(let t=0;t<=len;t+=1.1)FX.spawn('ring',{x:sx+fx*t,z:sz+fz*t,size:.5,grow:1.4,life:.4,col:[.6,.35,1]});FX.spawn('beam',{x:sx+fx*len*.5,z:sz+fz*len*.5,col:[.55,.3,1],life:.4});sfx('void');shake(.2);
    for(const en of alive()){const dx=en.x-sx,dz=en.z-sz,along=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);if(along>-.6&&along<len+1&&side<W)hitEnemy(en,30,{weapon:'syn'})}})}
function doSkill(){if(!canAct()||!grounded())return;const mode=skillMode(),key=skillCdKey(mode);if(P[key]>0)return;
  P[key]=mode==='reson'?SKILL.reson.ter.cd:SKILL[mode].cd;
  const e=nearest(7);if(e)P.face=Math.atan2(e.x-P.x,e.z-P.z);
  if(mode==='arche')archeSkill();else if(mode==='reson')resonSlash();else if(mode==='sentia')sentiaSkill();else sensusSkill();
  P.state='atk';P.t=0;P.atkDur=.42;P.hitDone=true;P.combo=0;P.lunge=0;P.heavyAtk=false;
  hud()}
// 궁극기(R): 공명 게이지 100 소모
function doUlt(){if(P.ult<100||!canAct()||!grounded())return;P.ult=0;P.state='ult';P.t=0;P.ultHit=false;aimFace();
  if(tut&&tut.step===7)tut.ulted=1;sfx('judge');slow(.9,.35);vfx();
  if(linkMax()){P.arche=ARCHE.dur;P.weapon='syn';edenWeapons();callout('공허 개방 · 아르케 해방','vio');burst('void',1.6);
    FX.spawn('beam',{x:P.x,z:P.z,col:[.75,.6,1],life:1});
    if(!S.archeTip){S.archeTip=1;tip(ctx.partner==='A'?'“링크가 전부 이어졌어. 아르케… 이게 네 진짜 검이야.”':'“주인, 고리가 다 이어졌어! 아르케야!”')}}
  else{callout('궁극기 · 공허 개방','vio');burst('void',1.1)}
  FX.spawn('vring',{x:P.x,y:1.2,z:P.z,size:1.4,life:.6,col:[.6,.45,1]});hud()}
function ultHit(){P.ultHit=true;FX.spawn('ring',{x:P.x,z:P.z,size:1.5,grow:4.5,life:.8,col:[.6,.45,1]});FX.spawn('beam',{x:P.x,z:P.z,col:[.55,.4,1],life:.8});
  FX.spawn('spark',{x:P.x,y:.5,z:P.z,n:24,col:[.75,.6,1],speed:8});shake(.45);sfx('heavy');
  if(fuseOn())coresInRadius(FUSE.ultR,true);else fuseVoidTrigger();
  for(const e of alive()){if(e.lock||Math.hypot(e.x-P.x,e.z-P.z)>7.5)continue;e.stacks=0;S.tele=S.tele.filter(t=>t.e!==e);e.att=null;e.state='stun';e.stun=2.5;
    if(curId==='phobia'){e.barrier=0;e.brokenT=6}hitEnemy(e,60,{pierce:1,noCrit:1})}}
function nextWeapon(){const l=ownedWeapons();return l[(l.indexOf(heldWeapon())+1)%l.length]}
function doSwap(){const l=ownedWeapons();if(l.length<2||DEF.tutorial||!canAct()||P.arche>0)return;const n=nextWeapon();
  if(n==='ter')P.weapon='ter';else{P.weapon='syn';P.sister=n}
  edenWeapons();sfx('void');const col=n==='ter'?[.7,.3,1]:n==='sentia'?[.6,.9,1]:[1,.65,.35];FX.spawn('vring',{x:P.x,y:1,z:P.z,size:.9,life:.35,col});
  callout(n==='ter'?'에고웨폰 · 테로르':'시너지아 · '+WNAME[n],n==='ter'?'vio':'');hud()}
// 상호작용(F): 단죄가 우선, 없으면 가까운 아이템 줍기
function interactTarget(){if(cine||!P)return null;
  if(!DEF.noJudge&&!DEF.tutorial&&!fuseOn()&&!S.omen&&!(DEF.fuse&&((ENS[0].flags.fuseN||0)<1||(S.fuse&&S.fuse.state!=='done')))){const e=ENS[0];if(!e.dead&&e.hp<=e.max*.25&&Math.hypot(e.x-P.x,e.z-P.z)<7)return{kind:'judge',e,label:DEF.label||'단죄'}}
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
  P.hp-=a;if(tut&&P.hp<1)P.hp=1;if(window.Master&&Master.on&&Master.opts.god)P.hp=P.max;P.flash=.15;if(!o.self)P.void=Math.min(100,P.void+5);
  if(a>0){num(P.x,1.9,P.z,a,'me');sfx('hurt');buzz(a>=15?[60,40,90]:45);shake(.22)}
  if(!o.self&&a>0&&P.state!=='cine'&&P.state!=='ult'&&grounded()){P.state='hurt';P.t=0;P.hurtDur=.28}
  hud()}

/* ═══════════════ 배경 변화 · 영역 전개 ═══════════════
   강한 기술을 쓰면 배경과 공간 연출이 바뀐다.
     void : 공허 (궁극기 · 아르케 해방 동안 계속 = 공허 영역)   fuse : 흡융 (네시스 흡융 전개 동안)
     fear : 공명 베기 · 공포 (에고웨폰 테로르)   sentia / sensus : 두 자매의 스킬 (짧게) */
const DOM={kind:'',k:0,burst:0,bk:''};
function burst(kind,t){DOM.bk=kind;DOM.burst=Math.max(DOM.burst,t)}
function updateDomain(dt){let want='',w=0;
  if(P.arche>0){want='void';w=1}else if(fuseOn()){want='fuse';w=1}else if(S.omen){want='fuse';w=.55}else if(DOM.burst>0){want=DOM.bk;w=Math.min(1,DOM.burst*1.4)}
  DOM.burst=Math.max(0,DOM.burst-dt);
  if(want&&want!==DOM.kind&&DOM.k<.05)DOM.kind=want;
  const tgt=want===DOM.kind?w:0;DOM.k+=(tgt-DOM.k)*Math.min(1,dt*(tgt>DOM.k?5:2.2));
  if(DOM.k<.01&&want)DOM.kind=want;
  Stages.domain(DOM.kind,DOM.k);
  const el=$('domain');if(el){el.className=DOM.kind?'d-'+DOM.kind:'';el.style.opacity=DOM.k.toFixed(3)}}

/* ═══════════════ 헤일로 ═══════════════
   이든: 보라색 5개 교차 고리와 검은 블랙홀 (아르케 해방)
   네시스: 플래티나·블루 계열 5개 수렴·융합 고리 (항상 희미하게, 흡융 전개 중 강하게)
   공명: 황금색 7개 재구성 고리 (에고웨폰으로 쓰는 공명 베기) */
function haloAt(x,y,z,yaw,sc){return[x-Math.sin(yaw)*.34*sc,y+1.5*sc,z-Math.cos(yaw)*.34*sc]}
function drawHalo(kind,x,y,z,yaw,a,sc0=1){const t=S.time||0,[hx,hy,hz]=haloAt(x,y,z,yaw,sc0),H=Math.PI/2,sc=sc0*.58;
  if(kind==='eden'){
    for(let i=0;i<5;i++){const ph=i*Math.PI*2/5;E.quad(E.geo('ring:0.9'),E.m4.trs(hx,hy,hz,H+.5*Math.sin(ph+t*.7),yaw,ph*.5+t*.35,.95*sc,1,.95*sc),E.tex.band,[.62,.35,1,.85*a],{add:1})}
    E.quad(E.geo('ring:0.72'),E.m4.trs(hx,hy,hz,H,yaw,t*1.6,.62*sc,1,.62*sc),E.tex.band,[.85,.6,1,.7*a],{add:1});
    E.quad(E.geo('ctr'),E.m4.trs(hx,hy,hz,0,E.yawTo(hx,hz),0,1.6*sc,1.6*sc,1),E.tex.glow,[.5,.2,.9,.55*a],{add:1});
    E.mesh(E.geo('sphere'),E.m4.trs(hx,hy,hz,0,t,0,.3*sc,.3*sc,.3*sc),{c:[.02,0,.04],e:[0,0,0],outline:.025,oc:[.75,.5,1]})}
  else if(kind==='nesis'){
    for(let i=0;i<5;i++){const f=((t*.35+i/5)%1),r=(1.15-f*.95)*sc;E.quad(E.geo('ring:0.88'),E.m4.trs(hx,hy,hz,H,yaw,f*2+i,r,1,r),E.tex.band,[i%2?.55:.86,i%2?.78:.88,1,a*(.25+.75*Math.sin(f*Math.PI))],{add:1})}
    E.quad(E.geo('ctr'),E.m4.trs(hx,hy,hz,0,E.yawTo(hx,hz),0,.9*sc,.9*sc,1),E.tex.glow,[.75,.85,1,.6*a],{add:1})}
  else if(kind==='gold'){const rc=[1,.82,.35];
    for(let i=0;i<7;i++){const ph=i*Math.PI*2/7,g=Math.min(1,(1.4-P.resonT)*2.5+.15),rr=(.45+.08*i)*g*sc;
      E.quad(E.geo('ring:0.9'),E.m4.trs(hx,hy,hz,H+.7*Math.sin(ph-t*1.3)*(1-g*.6),yaw,ph+t*.6,rr,1,rr),E.tex.band,[rc[0],rc[1],rc[2],.85*a],{add:1})}
    E.quad(E.geo('ctr'),E.m4.trs(hx,hy,hz,0,E.yawTo(hx,hz),0,1.4*sc,1.4*sc,1),E.tex.glow,[rc[0],rc[1]*.95,rc[2]*.9,.45*a],{add:1})}}

/* ═══════════════ 흡융 기믹 ═══════════════ */
const fuseOn=()=>S.fuse&&S.fuse.state==='run';
function nearestCore(maxD){if(!fuseOn())return null;let b=null,bd=maxD||1e9;for(const c of S.fuse.cores){if(c.dead)continue;const d=Math.hypot(c.x-P.x,c.z-P.z);if(d<bd){bd=d;b=c}}return b}
const fuseGapOk=()=>S.time-(S.fuseEndT??-1e9)>=FUSE.gap;
// 공허의 힘을 쓸 때: 낙인 조건(체력 35% 이하 · 간격)이 맞으면 네시스가 이든의 공허를 역으로 삼키려 한다
function fuseVoidTrigger(){if(!DEF.fuse||S.fuse||S.omen)return;const e=ENS[0];if(!e||e.dead)return;const n=e.flags.fuseN||0,F=FUSE.forms[n];
  if(F&&F.onVoid&&e.hp<=e.max*F.at&&fuseGapOk()&&Math.hypot(e.x-P.x,e.z-P.z)<12){e.flags.fuseN=n+1;setTimeout(()=>{if(!e.dead)fuseOmen(e,n)},250)}}
function fuseOmen(e,n){S.omen={n,t:FUSE.omen};S.tele=S.tele.filter(t=>t.e!==e);e.att=null;e.state='idle';
  FX.spawn('vring',{x:e.x,y:1.4,z:e.z,size:1.4,life:.8,col:[.75,.85,1]});sfx('judge');shake(.15);
  callout(n===0?'흡융의 징조 — 네시스가 궁지에 몰렸다':'흡융의 징조 — 네시스가 이든의 공허를 역으로 삼킨다','red');
  tip(n===0?'“더는… 물러설 곳이 없네요. 그렇다면 전부 삼킬게요.”':'“그 공허… 지금 저에게 쓰셨죠? 그대로 삼켜 드릴게요.”','nesis');hud()}
function fuseStart(e,n){const F=FUSE.forms[n];S.omen=null;
  S.tele=S.tele.filter(t=>t.e!==e);e.att=null;e.state='idle';e.moving=false;
  if(F.kind==='cores'){e.cool=1.6;e.lock=true;
    FX.spawn('spark',{x:e.x,y:1,z:e.z,n:14,col:[.55,.8,1],speed:4});e.x=0;e.z=0;FX.spawn('vring',{x:0,y:1,z:0,size:1.6,life:.6,col:[1,.6,.3]});
    const base=Math.atan2(P.x,P.z)+Math.PI/FUSE.cores,cores=[];
    for(let i=0;i<FUSE.cores;i++){const a=base+i*Math.PI*2/FUSE.cores;cores.push({x:Math.sin(a)*FUSE.radius,z:Math.cos(a)*FUSE.radius,hp:FUSE.coreHp,max:FUSE.coreHp,flash:0,dead:false,t:0,ph:i*2.1})}
    S.fuse={state:'run',kind:'cores',n,t:0,limit:F.limit,cores,tick:0};
    callout('흡융 핵 전개 — 핵을 모두 제거하라','red');
    tip('“흡융… 전개. 이든 님, 피하실 수는 없어요. 지우지 못하면 끝이에요.”','nesis');
    setTimeout(()=>{if(fuseOn())tip(ctx.partner==='A'?'“핵이 네 개야. 공허의 시야로는 하나씩밖에 못 지워. 나머진 직접 부숴.”':'“주인! 구슬 네 개! 공허는 하나만 지워져, 나머진 때려 부숴!”')},2600)}
  else{e.cool=.6;e.inv=true;
    S.fuse={state:'run',kind:'brand',n,t:0,limit:F.limit,stacks:FUSE.brandStacks,cores:[],tick:0};
    FX.spawn('beam',{x:P.x,z:P.z,col:[1,.6,.3],life:.6});FX.spawn('ring',{x:P.x,z:P.z,size:.4,grow:1.6,life:.5,col:[1,.6,.3]});
    callout('흡융 낙인 — 흡융 사슬을 흘려보내라','red');
    tip('“낙인을 새겼어요. 이게 다 차면, 당신은 제 안으로 녹아들어요.”','nesis');
    setTimeout(()=>{if(fuseOn())tip(ctx.partner==='A'?'“주황 사슬만 흘려보내. 빨간 건 위장이야, 피해. 맞으면 낙인이 다시 늘어.”':'“주황은 흘리고 빨강은 피해! 맞으면 낙인 늘어나!”')},2400)}
  sfx('judge');shake(.35);vfx();slow(.6,.4);hud()}
function brandStrip(how){const f=S.fuse;if(!f||f.kind!=='brand'||f.state!=='run')return;f.stacks--;
  FX.spawn('ring',{x:P.x,z:P.z,size:.5,grow:2,life:.45,col:how==='void'?[.65,.5,1]:[1,.75,.4]});FX.spawn('spark',{x:P.x,y:1.6,z:P.z,n:10,col:[1,.7,.4],speed:5});sfx('void');P.void=Math.min(100,P.void+8);gainUlt(6);
  callout(f.stacks>0?`낙인 제거 · 남은 낙인 ${f.stacks}`:'흡융 낙인 소거',f.stacks>0?'vio':'org');if(f.stacks<=0)fuseClear();hud()}
function hitCore(c,dmg){if(c.dead)return;c.hp-=dmg;c.flash=.12;num(c.x,1.6,c.z,Math.round(dmg),'');FX.spawn('spark',{x:c.x,y:1.2,z:c.z,n:6,col:[1,.7,.4],speed:4});
  if(c.hp<=0)coreBreak(c);hud()}
function coreBreak(c,byVoid){c.dead=true;FX.spawn('ring',{x:c.x,z:c.z,size:.6,grow:2.2,life:.5,col:byVoid?[.6,.5,1]:[1,.6,.3]});FX.spawn('motes',{x:c.x,z:c.z,n:12,col:[.6,.8,1],to:[P.x,1.2,P.z]});
  sfx('void');shake(.15);P.void=Math.min(100,P.void+10);gainUlt(6);
  const left=S.fuse.cores.filter(k=>!k.dead).length;callout(left?`흡융 핵 제거 · 남은 핵 ${left}`:'흡융 소거',left?'vio':'org');
  if(!left)fuseClear()}
function coresInRadius(r,byVoid){if(!fuseOn())return 0;let n=0;for(const c of S.fuse.cores)if(!c.dead&&Math.hypot(c.x-P.x,c.z-P.z)<=r){coreBreak(c,byVoid);n++;if(!S.fuse||S.fuse.state!=='run')break}return n}
function fuseClear(){const e=ENS[0];S.fuse.state='done';S.fuseEndT=S.time;e.lock=false;e.inv=false;e.state='stun';e.stun=FUSE.stun;e.vuln=FUSE.stun;S.tele=[];e.att=null;
  FX.spawn('beam',{x:e.x,z:e.z,col:[1,.6,.3],life:.7});FX.spawn('ring',{x:e.x,z:e.z,size:1,grow:5,life:.7,col:[.55,.8,1]});sfx('parry');slow(.7,.3);shake(.4);
  P.ult=Math.min(100,P.ult+25);setTimeout(()=>{if(S.fuse&&S.fuse.state==='done'){S.fuse=null;hud()}},1200);
  callout('흡융 역류 — 네시스 무방비','org');tip('“흡융이… 역류해요? 이든 님, 당신은 대체…!”','nesis');hud()}
function fuseFail(){const f=S.fuse;f.state='fail';S.fuseEndT=S.time;const e=ENS[0];
  for(const c of f.cores)if(!c.dead)FX.spawn('beam',{x:c.x,z:c.z,col:[1,.5,.25],life:.6});
  FX.spawn('beam',{x:P.x,z:P.z,col:[1,.55,.3],life:1});FX.spawn('ring',{x:P.x,z:P.z,size:.5,grow:4,life:.8,col:[1,.6,.3]});
  sfx('judge');shake(.6);buzz([220,80,320]);vfx();
  const god=window.Master&&Master.on&&Master.opts.god;
  if(god){callout('즉사 — 무적으로 버팀','red');f.state='done';setTimeout(()=>{if(S.fuse===f)S.fuse=null},800)}
  else{S.deathMsg=f.kind==='brand'?'흡융 낙인이 완성되었다. 낙인을 모두 지우지 못했다.':'흡융에 삼켜졌다. 흡융 핵을 모두 지우지 못했다.';P.hp=0;callout('흡융 — 즉사','red')}
  e.lock=false;e.inv=false;e.cool=1.2;hud()}
function updateFuse(dt){const e=ENS[0];
  if(DEF.fuse&&!S.fuse&&!S.omen&&e&&!e.dead&&!cine&&e.state!=='stun'&&!(e.vuln>0)){const n=e.flags.fuseN||0;const F=FUSE.forms[n];if(F&&!F.onVoid&&e.hp<=e.max*F.at&&fuseGapOk()){e.flags.fuseN=n+1;fuseOmen(e,n)}}
  if(S.omen){S.omen.t-=dt;e.cool=Math.max(e.cool,.5);if(Math.random()<dt*8)FX.spawn('glow',{x:e.x+(Math.random()-.5)*2,y:1+Math.random()*1.6,z:e.z+(Math.random()-.5)*2,size:.6,col:Math.random()<.5?[1,.6,.3]:[.5,.8,1],life:.4});if(S.omen.t<=0&&!e.dead)fuseStart(e,S.omen.n)}
  const f=S.fuse;if(!f||!e||e.dead)return;
  for(const c of f.cores){c.t+=dt;c.flash=Math.max(0,c.flash-dt)}
  if(f.state!=='run')return;
  f.t+=dt;const k=f.t/f.limit;
  // 끌어당김 — 핵 전개 때만. 시간이 갈수록 강해진다 (회피·돌진 중엔 약하게)
  const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);if(f.kind==='cores'&&d>1.4){const pw=(FUSE.pull[0]+(FUSE.pull[1]-FUSE.pull[0])*k)*(P.state==='dodge'||P.state==='dash'?.3:1);P.x+=dx/d*pw*dt;P.z+=dz/d*pw*dt}
  f.tick+=dt;if(f.tick>.12&&f.kind==='brand'){f.tick=0;const t=Math.random();FX.spawn('glow',{x:P.x+(e.x-P.x)*t,y:1.3+Math.sin(t*Math.PI)*.5,z:P.z+(e.z-P.z)*t,size:.45,col:[1,.55,.25],life:.22})}
  if(f.tick>.12){f.tick=0;for(const c of f.cores)if(!c.dead){const t=Math.random();FX.spawn('glow',{x:c.x+(e.x-c.x)*t,y:1.1+Math.sin(t*Math.PI)*.4,z:c.z+(e.z-c.z)*t,size:.55,col:Math.random()<.5?[1,.55,.25]:[.45,.75,1],life:.25})}}
  if(Math.floor(f.t)!==Math.floor(f.t-dt)){const left=Math.ceil(f.limit-f.t);if(left<=3&&left>0){sfx('ui');buzz(40)}hud()}
  if(f.t>=f.limit)fuseFail()}

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
    if(fuseOn()&&S.fuse.kind==='brand'&&(a.n==='흡융 사슬'||a.n==='흡융 올가미')){const f=S.fuse;f.stacks=Math.min(FUSE.brandMax,f.stacks+1);callout(`낙인 증가 · ${f.stacks}겹`,'red');hud()}
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
  if(fuseOn()&&S.fuse.kind==='brand'&&a.n==='흡융 사슬'){e.stun=.55;brandStrip('parry')}
  if(tut&&tut.step===3)tut.parried++}
function updateEnemy(e,dt){
  if(e.dead){e.t+=dt;e.alpha=Math.max(0,1-e.t*1.5);return}
  e.flash=Math.max(0,e.flash-dt);
  if(curId==='furor'&&e.state!=='stun'&&!(P.arche>0)){e.stackT+=dt;if(e.stackT>4.5){e.stackT=0;if(e.stacks<6){e.stacks++;hud();if(e.stacks===3&&!e.flags.h3){e.flags.h3=1;tip(ctx.partner==='A'?'“열기 3중첩. 지금 지워.”':'“너무 뜨거워! 지금 「공허의 시야」!”')}}}}
  if(curId==='teror'&&!e.flags.eye&&e.state!=='stun'&&!(P.arche>0)){e.stackT+=dt;if(e.stackT>5.5){e.stackT=0;if(e.stacks<6){e.stacks++;hud()}}}
  if(curId==='phobia'&&e.brokenT>0){e.brokenT-=dt;if(e.brokenT<=0)hud()}
  if(e.vuln>0)e.vuln=Math.max(0,e.vuln-dt);
  const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz)||1;
  if(e.state==='stun'){e.stun-=dt;if(e.stun<=0){e.state='idle';e.cool=.5}return}
  if(e.state==='stag'){e.t+=dt;if(e.t>.5){e.state='idle';e.cool=.6}return}
  if(e.state==='idle'){
    e.cool-=dt;let key=null;
    if(tut){if(e.cool<=0&&d<3.6&&(tut.step===3||tut.step===4||tut.step>=8))key=tut.step===3?'heavy':tut.step===4?'slam':DEF.pick(e,d)}
    else if(e.cool<=0)key=DEF.pick(e,d);
    if(key){beginAttack(e,key);return}
    const want=tut&&(tut.step<3||(tut.step>4&&tut.step<8))?99:DEF.pref;
    e.moving=false;if(e.lock)return;if(d>want){const sp=DEF.speed*(curId==='furor'?1+e.stacks*.08:1)*(P.arche>0?ARCHE.slow:1);e.x+=dx/d*sp*dt;e.z+=dz/d*sp*dt;e.moving=true}
    else if(ENS.length>1){e.x+=-dz/d*.6*dt;e.z+=dx/d*.6*dt}
    return}
  if(e.state==='wind'){const a=e.att;e.t+=dt;
    if(e.t<a.wind*.55&&!a.atPlayer&&!a.leap){const ndx=P.x-e.x,ndz=P.z-e.z,nd=Math.hypot(ndx,ndz)||1;const k=1-Math.exp(-6*dt);e.dir=[e.dir[0]+(ndx/nd-e.dir[0])*k,e.dir[1]+(ndz/nd-e.dir[1])*k];const l=Math.hypot(...e.dir);e.dir=[e.dir[0]/l,e.dir[1]/l];if(a.shape!=='circle'){a._cx=e.x;a._cz=e.z}}
    if(a.leap&&e.t<a.wind*.5){a._cx=P.x;a._cz=P.z}
    if(a.leap){const k=clamp((e.t-a.wind*.55)/(a.wind*.45),0,1);if(k>0){e.x=a._sx+(a._cx-a._sx)*k;e.z=a._sz+(a._cz-a._sz)*k;e.hop=Math.sin(k*Math.PI)*2.2}}
    if(e.t>=a.wind){e.hop=0;strike(e)}return}
  if(e.state==='rec'){e.t+=dt;if(e.t>=(e.att?e.att.rec:.5)){e.state='idle';e.cool=fuseOn()?(S.fuse.kind==='brand'?.35:FUSE.orbCd):DEF.gap*R(.7,1.3);e.att=null}}
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
  P.iframe=Math.max(0,P.iframe-dt);P.dodgeCd=Math.max(0,P.dodgeCd-dt);P.dashCd=Math.max(0,P.dashCd-dt);P.skillCd=Math.max(0,P.skillCd-dt);P.cdA=Math.max(0,P.cdA-dt);P.cdB=Math.max(0,P.cdB-dt);P.cdX=Math.max(0,P.cdX-dt);P.flash=Math.max(0,P.flash-dt);
  if(P.arche>0){P.arche-=dt;if(P.arche<=0){P.arche=0;edenWeapons();callout('아르케 해방 종료','');FX.spawn('vring',{x:P.x,y:1.2,z:P.z,size:1,life:.5,col:[.7,.6,1]});hud()}}
  P.resonT=Math.max(0,P.resonT-dt);
  P.parryT=Math.max(0,P.parryT-dt);P.comboWin=Math.max(0,(P.comboWin||0)-dt);
  // 마스터 모드: 쿨타임 없음 · 공허/공명 무제한 · 무적
  if(window.Master&&Master.on){const m=Master.opts;if(m.noCd){P.skillCd=0;P.cdA=0;P.cdB=0;P.cdX=0;P.dodgeCd=0;P.dashCd=0}if(m.freeRes){P.void=100;P.ult=100}if(m.god&&P.hp<P.max)P.hp=P.max}if(P.fear>0)P.fear=Math.max(0,P.fear-dt);if(P.bind>0)P.bind=Math.max(0,P.bind-dt);
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
  updateFuse(dt);
  updateHitQ(dt);
  updateDomain(dt);
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
  pc?'좌클릭으로 네 번 베어 봐라. 이어 누르면 4연속 베기, 마지막 일격은 회전 베기다.':'공격 버튼으로 네 번 베어 봐라. 이어 누르면 4연속 베기, 마지막 일격은 회전 베기다.',
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
  const done=[P.moved>3,t.hits>=4,t.heavy>=1,t.parried>=1,t.dodged>=1,t.plunged>=1,t.voided>=1,t.ulted>=1,false][t.step];
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
  const r=$('result');r.innerHTML=`<h2>쓰러졌다</h2><p>${S.deathMsg?S.deathMsg+'<br>':''}${ctx.name}의 시야가 공허로 잠긴다.<br>전투를 처음부터 다시 시작한다.</p><button class="tbtn" style="width:200px" id="retry">다시 싸우기</button>`;
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
  if(S.fuse&&S.fuse.state==='run')for(const c of S.fuse.cores){if(c.dead)continue;const [px,py]=tf(c.x-ox,c.z-oz);x.fillStyle='#ffa04a';x.beginPath();x.arc(px,py,mini?3.5:6,0,7);x.fill();x.strokeStyle='#7cc8ff';x.lineWidth=1.5;x.stroke()}
  // 이든 (바라보는 방향)
  const [ex,ey]=tf(P.x-ox,P.z-oz);const fa=Math.atan2(camFwd()[0],camFwd()[1]);
  x.translate(ex,ey);x.rotate(mini?fa-P.face:Math.PI-P.face);x.fillStyle='#fff';x.beginPath();x.moveTo(0,-8);x.lineTo(6,6);x.lineTo(0,3);x.lineTo(-6,6);x.closePath();x.fill();
  x.restore();
  if(mini){x.strokeStyle='rgba(201,197,214,.55)';x.lineWidth=2;x.beginPath();x.arc(cx,cy,W/2-2,0,7);x.stroke()}}

/* ═══════════════ HUD ═══════════════ */
function hud(){const e=ENS.length>1?null:ENS[0];
  const fb=$('fuseBar');if(fb){if(fuseOn()){const f=S.fuse;fb.classList.add('on');fb.querySelector('b').textContent=Math.max(0,Math.ceil(f.limit-f.t));fb.querySelector('i').style.width=(100-f.t/f.limit*100)+'%';fb.querySelector('span').textContent=f.kind==='brand'?`흡융 낙인 ${f.stacks}겹 — 흡융 사슬을 흘려보내거나 가까이서 「공허의 시야」`:`흡융 핵 ${f.cores.filter(c=>!c.dead).length}개 남음 — 부수거나 「공허의 시야」로 지워라`}else fb.classList.remove('on')}
  const hp=ENS.reduce((s,x)=>s+Math.max(0,x.hp),0),mx=ENS.reduce((s,x)=>s+x.max,0);
  $('aHp').style.width=(hp/mx*100)+'%';$('aLag').style.width=(hp/mx*100)+'%';$('aNum').textContent=`${Math.ceil(hp)} / ${mx}`;
  const ch=[];if(e){if(curId==='furor'&&e.stacks)ch.push(['red',`열기 ${e.stacks}`]);if(curId==='teror')ch.push(e.flags.eye?['gry','공포 수확 소멸']:['vio',`공포 수확 +${e.stacks*2}`]);
    if(curId==='phobia'){ch.push(e.barrier?['vio','성흔 장벽 · 받는 피해 절반']:['gry',`장벽 깨짐 ${Math.ceil(Math.max(0,e.brokenT))}초`]);if(e.fed)ch.push(['red',`포식 +${e.fed*4}`])}
    if(S.omen)ch.push(['red','흡융의 징조']);if(fuseOn())ch.push(['red',(S.fuse.kind==='brand'?'흡융 낙인':'흡융 핵 전개')+' · 피해 무효'])
    if(e.vuln>0)ch.push(['org',`무방비 · 받는 피해 ×${FUSE.vuln}`]);
    if(e.state==='stun'&&!cine)ch.push(['gry','경직'])}
  $('aChips').innerHTML=ch.map(c=>`<span class="chip ${c[0]}">${c[1]}</span>`).join('');
  $('pHp').style.width=Math.max(0,P.hp/P.max*100)+'%';$('pHpN').textContent=Math.max(0,Math.ceil(P.hp))+(P.shield?` (+${P.shield})`:'');
  $('pRing').style.setProperty('--v',P.void);$('pRing').classList.toggle('full',P.void>=40);$('pVdN').textContent=P.void;
  $('pUlt').style.width=P.ult+'%';$('pUltN').textContent=Math.floor(P.ult)+'%';
  $('pSy').style.width=P.sync+'%';$('pSyN').textContent=P.sync+'%'+(P.sync>=80?' 승화':'');$('syncRow').classList.toggle('hot',P.sync>=80);
  const lr=$('linkRow');if(lr){const lit=linkLit();if(!lr.dataset.ok){lr.innerHTML='<span class="ln"></span>'+LINKS.map(l=>`<img src="img/emblems/${l.em}.webp" alt="${l.n} ${l.name}" title="${l.n}번 ${l.name}">`).join('');lr.dataset.ok=1}
    lr.querySelectorAll('img').forEach((im,i)=>im.classList.toggle('on',lit.includes(i)));lr.querySelector('.ln').textContent=linkMax()?'링크 MAX':`링크 Lv.${lit.length-1}`;lr.classList.toggle('max',linkMax())}
  const pc=[];if(P.arche>0)pc.push(['vio',`아르케 해방 ${Math.ceil(P.arche)}초`]);if(P.fear>0)pc.push(['vio','공포']);if(P.bind>0)pc.push(['red','사슬']);if(P.crit>0)pc.push(['gry',`설계 ×2 (${P.crit})`]);if(P.immune)pc.push(['gry','공포 면역']);if(P.weapon==='ter')pc.push(['vio','테로르 장착']);
  $('pChips').innerHTML=pc.map(c=>`<span class="chip ${c[0]}">${c[1]}</span>`).join('');
  const mode=skillMode(),skName=mode==='reson'?SKILL.reson.ter.btn:SKILL[mode].btn;
  document.querySelectorAll('[data-k="void"]').forEach(b=>{b.classList.toggle('ready',P.void>=40);b.classList.toggle('off',P.void<40)});
  const cdMain=P[skillCdKey(mode)];
  document.querySelectorAll('[data-k="skill"]').forEach(b=>{b.classList.toggle('off',cdMain>0);const c=b.querySelector('.cd');if(c)c.textContent=cdMain>0?Math.ceil(cdMain):'';const n=b.querySelector('b');if(n)n.textContent=b.id==='tE'?skName.split(/[ ·]+/).pop():skName});
  document.querySelectorAll('[data-k="ult"]').forEach(b=>{b.classList.toggle('ready',P.ult>=100);b.classList.toggle('off',P.ult<100);b.style.setProperty('--u',P.ult)});
  document.querySelectorAll('[data-k="swap"] b').forEach(b=>b.textContent=WNAME[nextWeapon()])}
// 매 프레임: 상호작용 안내, 화면 밖 보스 화살표, 미니맵
let miniT=0;
function overlay(){const it=interactTarget();const pr=$('prompt'),bi=$('bInteract');
  if(it){$('promptText').textContent=it.label;pr.classList.add('on');bi.classList.add('on');bi.querySelector('b').textContent=it.kind==='judge'?(DEF.label||'단죄'):'줍기'}else{pr.classList.remove('on');bi.classList.remove('on')}
  const e=nearestCore()||((!DEF.noJudge&&ENS[0]&&!ENS[0].dead)?ENS[0]:nearest());const ar=$('offArrow');
  if(e&&!cine){const [sx,sy,ok]=E.project(e.x,1.2,e.z);const W=cv.clientWidth,H=cv.clientHeight;
    if(!ok||sx<0||sx>W||sy<0||sy>H){let dx=sx-W/2,dy=sy-H/2;if(!ok){dx=-dx;dy=-dy}const a=Math.atan2(dy,dx);const r=Math.min(W,H)*.42;
      ar.style.left=(W/2+Math.cos(a)*r)+'px';ar.style.top=(H/2+Math.sin(a)*r)+'px';ar.style.transform=`translate(-50%,-50%) rotate(${a}rad)`;ar.classList.add('on');ar.classList.toggle('warn',e.state==='wind')}
    else ar.classList.remove('on')}else ar.classList.remove('on');
  if(++miniT%2===0)drawMap($('miniC'),true)}

/* ═══════════════ 동작 (애니메이션) ═══════════════ */
function playerMotion(){if(P.heavyAtk)return'V';const W=W_();return W.moves[P.combo%W.moves.length]}
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
  if(P.arche>0)drawHalo('eden',P.x,P.y,P.z,P.drawYaw,Math.min(1,P.arche*1.5,(ARCHE.dur-P.arche)*3));
  if(P.resonT>0)drawHalo('gold',P.x,P.y,P.z,P.drawYaw,Math.min(1,P.resonT*2));
  for(const e of ENS)if(curId==='nesis'&&!e.dead)drawHalo('nesis',e.x,e.hop||0,e.z,e.yaw,fuseOn()||S.omen?1:.35,e.rig.scale);
  const pt=P.iframe>0?[.85,.85,1.25]:null;
  P.rig.draw(P.x,P.y,P.z,P.drawYaw,{flash:P.flash>0?.2:0,tint:pt,emit:P.arche>0?[.07,.02,.12]:P.weapon==='ter'?[.06,0,.1]:null});
  for(const e of ENS){if(e.alpha<=0)continue;let fl=e.flash>0?.18:0,emit=null,tint=null;
    if(e.state==='wind'&&e.att){const p=.5+.5*Math.sin(S.time*18);emit=e.att.parry?[.22*p,.11*p,0]:[.28*p,0,.02*p]}
    if(e.state==='stun')tint=[.65,.65,.75];
    e.rig.draw(e.x,e.hop||0,e.z,e.yaw,{flash:fl,emit,tint,alpha:e.alpha})}
  for(const e of ENS)if(e.barrier&&!e.dead){const p=.55+.15*Math.sin(S.time*3);E.quad(E.geo('ring:0.86'),E.m4.trs(e.x,1,e.z,Math.PI/2,E.yawTo(e.x,e.z),0,1.25,1,1.35),E.tex.band,[.6,.4,1,p*.8],{add:1})}
  for(const it of S.items){const c=ITEMS[it.type].col;E.quad(E.geo('ctr'),E.m4.trs(it.x,.75,it.z,0,E.yawTo(it.x,it.z),0,1.2,1.2,1),E.tex.glow,[c[0],c[1],c[2],.45],{add:1})}
  if(P.weapon==='ter')E.quad(E.geo('ctr'),E.m4.trs(P.x,P.y+1,P.z,0,E.yawTo(P.x,P.z),0,2.2,2.6,1),E.tex.glow,[.55,.2,.8,.28],{add:1});
  if(IN.atkDown&&!IN.heavyFired&&IN.atkT>.15&&grounded()){const k=Math.min(1,IN.atkT/HOLD),c=Weapons.trail(P.rig.weaponR);E.quad(E.geo('ctr'),E.m4.trs(P.x,1,P.z,0,E.yawTo(P.x,P.z),0,1.4+k,1.4+k,1),E.tex.glow,[c[0],c[1],c[2],.2+.35*k],{add:1})}
  if(S.fuse)for(const c of S.fuse.cores){if(c.dead)continue;const pul=1+.08*Math.sin(S.time*6+c.ph),y=1.2+Math.sin(S.time*2+c.ph)*.12,rot=S.time*1.5+c.ph,hp=c.hp/c.max;
    E.mesh(E.geo('sphere'),E.m4.trs(c.x,y,c.z,0,rot,0,.42*pul,.42*pul,.42*pul),{c:[1,.75,.5],e:[.6+c.flash*3,.35,.15],outline:.03,flash:c.flash>0?.3:0});
    E.quad(E.geo('ring:0.8'),E.m4.trs(c.x,y,c.z,Math.PI/2+.5*Math.sin(rot),rot,0,1.15,1,1.15),E.tex.band,[.45,.75,1,.75],{add:1});
    E.quad(E.geo('ctr'),E.m4.trs(c.x,y,c.z,0,E.yawTo(c.x,c.z),0,2.4*pul,2.4*pul,1),E.tex.glow,[1,.55,.25,.5],{add:1});
    E.quad(E.geo('flat'),E.m4.trs(c.x,.05,c.z,0,0,0,2.4,1,2.4),E.tex.glow,[1,.5,.2,.35*hp+.15],{add:1})}
  if(fuseOn()&&S.fuse.kind==='cores'){const f=S.fuse,k=f.t/f.limit;FX.telegraph({x:0,z:0,dir:[0,1]},{shape:'circle',_cx:0,_cz:0,r:ARENA,parry:0},k)}
  if(fuseOn()&&S.fuse.kind==='brand'){const f=S.fuse,k=f.t/f.limit,t=S.time;
    E.quad(E.geo('ring:0.86'),E.m4.trs(P.x,P.y+2.35,P.z,0,t*2,0,.5+.25*k,1,.5+.25*k),E.tex.band,[1,.55,.25,.9],{add:1});
    for(let i=0;i<f.stacks;i++){const a=t*2.4+i*Math.PI*2/FUSE.brandStacks;E.quad(E.geo('ctr'),E.m4.trs(P.x+Math.sin(a)*.6,P.y+2.35,P.z+Math.cos(a)*.6,0,E.yawTo(P.x,P.z),0,.45,.45,1),E.tex.glow,[1,.6,.3,.95],{add:1})}
    E.quad(E.geo('flat'),E.m4.trs(P.x,.05,P.z,0,0,0,1.6+k*1.6,1,1.6+k*1.6),E.tex.glow,[1,.45,.2,.25+.4*k],{add:1})}
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
  if(fuseOn()&&S.fuse.kind==='brand'&&mode==='smart'&&P.void>=40){const e=ENS[0];if(Math.hypot(e.x-P.x,e.z-P.z)<5.5){q.void=1;return}}
  if(fuseOn()){const c=nearestCore();if(c){const dx=c.x-P.x,dz=c.z-P.z,d=Math.hypot(dx,dz)||1;if(mode==='smart'&&P.void>=40&&d<4.5){q.void=1;return}if(d>2){q._wx=dx/d;q._wz=dz/d;if(d>5&&mode==='smart')q.dash=1}else{q._wx=0;q._wz=0;q.atk=1}return}}
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
    if(P[skillCdKey(skillMode())]<=0&&d<3)q.skill=1;
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
  get state(){return{P,ENS,DEF,tut,S}}};
})();
