/* 액팅 소울 : 0 — engine.js  v0.9.6
   3D 렌더링 엔진 (외부 라이브러리 없음, WebGL 1)
   - 툰 셰이딩 + 외곽선(인버티드 헐) 메시
   - 기본 도형: box / sphere / cyl(원기둥·원뿔대) / limb / disc / arc / ring / quad
   - 텍스처 쿼드(파티클·바닥 표시)
   캐릭터·무기·이펙트·배경 파일은 이 엔진의 E.mesh / E.quad 만 사용한다. */
(window.AS_VERSIONS=window.AS_VERSIONS||{})['engine.js']='0.9.6';

(function(){
'use strict';
const E=window.AS3D={};
let gl,cv,PT,PQ;

/* ═══════════ 행렬 ═══════════ */
const M4=E.m4={
  id(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])},
  mul(a,b,o){o=o||new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o},
  // 이동 · 회전(Y·X·Z 순) · 크기
  trs(tx,ty,tz,rx,ry,rz,sx,sy,sz){const cx=Math.cos(rx||0),sxn=Math.sin(rx||0),cy=Math.cos(ry||0),syn=Math.sin(ry||0),cz=Math.cos(rz||0),szn=Math.sin(rz||0);
    if(sx===undefined){sx=sy=sz=1}
    return new Float32Array([
      (cy*cz+syn*sxn*szn)*sx, (cx*szn)*sx, (-syn*cz+cy*sxn*szn)*sx, 0,
      (-cy*szn+syn*sxn*cz)*sy, (cx*cz)*sy, (syn*szn+cy*sxn*cz)*sy, 0,
      (syn*cx)*sz, (-sxn)*sz, (cy*cx)*sz, 0,
      tx||0,ty||0,tz||0,1])},
  persp(fovy,asp,n,f){const t=1/Math.tan(fovy/2),nf=1/(n-f);return new Float32Array([t/asp,0,0,0,0,t,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0])},
  lookAt(ex,ey,ez,cx,cy,cz){let zx=ex-cx,zy=ey-cy,zz=ez-cz,l=Math.hypot(zx,zy,zz);zx/=l;zy/=l;zz/=l;
    let xx=zz,xz=-zx;l=Math.hypot(xx,xz)||1;xx/=l;xz/=l;const xy=0;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*ex+xy*ey+xz*ez),-(yx*ex+yy*ey+yz*ez),-(zx*ex+zy*ey+zz*ez),1])},
  apply(m,x,y,z){return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],m[3]*x+m[7]*y+m[11]*z+m[15]]}
};

/* ═══════════ 셰이더 ═══════════ */
const VST=`attribute vec3 aP;attribute vec3 aN;uniform mat4 uM,uV,uP;uniform float uOut;varying vec3 vN,vW;varying float vD;
void main(){vec4 w=uM*vec4(aP,1.);vec3 n=normalize((uM*vec4(aN,0.)).xyz);w.xyz+=n*uOut;vW=w.xyz;vN=n;vec4 v=uV*w;vD=-v.z;gl_Position=uP*v;}`;
const FST=`precision mediump float;
uniform vec3 uC,uE,uFog,uL,uLC,uCam,uRim,uGL;uniform float uA,uFlash,uFogN,uFogF,uGround,uR,uOutPass,uFlat;varying vec3 vN,vW;varying float vD;
void main(){float f=smoothstep(uFogN,uFogF,vD);
 if(uOutPass>.5){gl_FragColor=vec4(mix(uC,uFog,f),uA);return;}
 vec3 n=normalize(vN);float d=dot(n,normalize(uL));
 float band=mix(.52,1.,smoothstep(-.02,.06,d));band=mix(band,1.,uFlat);
 vec3 v=normalize(uCam-vW);float rim=pow(1.-max(dot(n,v),0.),3.);
 vec3 c=uC*band*uLC+uRim*rim*.55*(1.-uFlat)+uE;float a=uA;
 if(uGround>.5){vec2 g=vW.xz/1.7;vec2 q=fract(g);float ln=min(step(q.x,.035)+step(q.y,.035),1.);vec2 id=floor(g);
  float h=fract(sin(dot(id,vec2(12.9898,78.233)))*43758.5453);float r=length(vW.xz);
  c=uC*(.72+.4*h)*(1.-.32*ln)*uLC+uGL*(1.-smoothstep(0.,uR*.75,r))*.22;a=1.-smoothstep(uR*.85,uR*1.4,r);}
 c+=vec3(uFlash);c=mix(c,uFog,f);gl_FragColor=vec4(c,a);}`;
const VSQ=`attribute vec3 aP;attribute vec2 aUV;uniform mat4 uM,uV,uP;varying vec2 vUV;varying float vD;
void main(){vec4 v=uV*uM*vec4(aP,1.);vD=-v.z;vUV=aUV;gl_Position=uP*v;}`;
const FSQ=`precision mediump float;uniform sampler2D uT;uniform vec4 uTint;uniform float uFlash,uCut,uFogN,uFogF;uniform vec3 uFog;varying vec2 vUV;varying float vD;
void main(){vec4 t=texture2D(uT,vUV);if(t.a<uCut)discard;vec3 c=t.rgb*uTint.rgb+vec3(uFlash);float f=smoothstep(uFogN,uFogF,vD);c=mix(c,uFog,f*.6);gl_FragColor=vec4(c,t.a*uTint.a);}`;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function prog(vs,fs,attrs,unis){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const o={p,a:{},u:{}};for(const a of attrs)o.a[a]=gl.getAttribLocation(p,a);for(const u of unis)o.u[u]=gl.getUniformLocation(p,u);return o}

/* ═══════════ 도형 ═══════════ */
// 바깥을 향하도록 삼각형 방향을 자동 보정
function fixWinding(P,I,stride){for(let i=0;i<I.length;i+=3){const a=I[i]*stride,b=I[i+1]*stride,c=I[i+2]*stride;
  const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const mx=P[a+3]+P[b+3]+P[c+3],my=P[a+4]+P[b+4]+P[c+4],mz=P[a+5]+P[b+5]+P[c+5];
  if(nx*mx+ny*my+nz*mz<0){const t=I[i+1];I[i+1]=I[i+2];I[i+2]=t}}}
function upload(P,I,kind){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(P),gl.STATIC_DRAW);
  const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(I),gl.STATIC_DRAW);
  return kind==='pn'?{b,ib,n:I.length,stride:24,layout:[['aP',3,0],['aN',3,12]]}:{b,ib,n:I.length,stride:20,layout:[['aP',3,0],['aUV',2,12]]}}
const GEN={
  box(){const P=[],I=[];const F=[[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]];
    for(const [nx,ny,nz] of F){const u=ny?[1,0,0]:[nz,0,-nx];const v=[ny*u[2]-nz*u[1],nz*u[0]-nx*u[2],nx*u[1]-ny*u[0]];const b=P.length/6;
      for(const [a,c] of [[-1,-1],[1,-1],[1,1],[-1,1]])P.push(nx*.5+u[0]*a*.5+v[0]*c*.5,ny*.5+u[1]*a*.5+v[1]*c*.5,nz*.5+u[2]*a*.5+v[2]*c*.5,nx,ny,nz);
      I.push(b,b+1,b+2,b,b+2,b+3)}return[P,I]},
  sphere(lat=10,lon=14){const P=[],I=[];for(let i=0;i<=lat;i++){const t=i/lat*Math.PI;for(let j=0;j<=lon;j++){const p=j/lon*Math.PI*2;const x=Math.sin(t)*Math.cos(p),y=Math.cos(t),z=Math.sin(t)*Math.sin(p);P.push(x*.5,y*.5,z*.5,x,y,z)}}
    for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){const a=i*(lon+1)+j,b=a+lon+1;I.push(a,b,a+1,b,b+1,a+1)}return[P,I]},
  // 원뿔대: 아래 반지름 r0, 위 반지름 r1, y 0→1
  frustum(r0,r1,seg=12,caps=true){const P=[],I=[];const slope=(r0-r1);
    for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);const ny=slope,l=Math.hypot(1,ny);P.push(c*r0*.5,0,s*r0*.5,c/l,ny/l,s/l, c*r1*.5,1,s*r1*.5,c/l,ny/l,s/l)}
    for(let i=0;i<seg;i++){const k=i*2;I.push(k,k+1,k+3,k,k+3,k+2)}
    if(caps){for(const [y,r,ny] of [[0,r0,-1],[1,r1,1]]){if(r<=0)continue;const c0=P.length/6;P.push(0,y,0,0,ny,0);for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;P.push(Math.cos(a)*r*.5,y,Math.sin(a)*r*.5,0,ny,0)}for(let i=0;i<seg;i++)I.push(c0,c0+1+i,c0+2+i)}}
    return[P,I]},
  // 팔다리: 관절에서 아래(-y)로 길이 1, 위 반지름 1, 아래 0.8
  limb(){const [P,I]=GEN.frustum(.8,1,10,true);for(let i=0;i<P.length;i+=6)P[i+1]-=1;return[P,I]},
  disc(r=1,seg=56){const P=[0,0,0,0,1,0],I=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;P.push(Math.cos(a)*r,0,Math.sin(a)*r,0,1,0)}for(let i=1;i<=seg;i++)I.push(0,i,i+1);return[P,I]}
};
const QGEN={
  bb:[[-.5,0,0,0,1, .5,0,0,1,1, .5,1,0,1,0, -.5,1,0,0,0],[0,1,2,0,2,3]],
  ctr:[[-.5,-.5,0,0,1, .5,-.5,0,1,1, .5,.5,0,1,0, -.5,.5,0,0,0],[0,1,2,0,2,3]],
  flat:[[-.5,0,-.5,0,1, .5,0,-.5,1,1, .5,0,.5,1,0, -.5,0,.5,0,0],[0,1,2,0,2,3]],
  flatF:[[-.5,0,0,0,1, .5,0,0,1,1, .5,0,1,1,0, -.5,0,1,0,0],[0,1,2,0,2,3]],
};
// 호(가로 평면, +z 방향 중심, 각도 ang, 안쪽 r0 바깥 1) — 베기 궤적용
function arcGeo(ang,r0,seg=24){const P=[],I=[];for(let i=0;i<=seg;i++){const t=i/seg,a=-ang/2+ang*t,s=Math.sin(a),c=Math.cos(a);P.push(s*r0,0,c*r0,t,1, s,0,c,t,0)}
  for(let i=0;i<seg;i++){const k=i*2;I.push(k,k+1,k+3,k,k+3,k+2)}return[P,I]}
function ringGeo(r0,seg=48){const P=[],I=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,s=Math.sin(a),c=Math.cos(a);P.push(s*r0,0,c*r0,i/seg,1, s,0,c,i/seg,0)}
  for(let i=0;i<seg;i++){const k=i*2;I.push(k,k+1,k+3,k,k+3,k+2)}return[P,I]}
const geoCache={};
E.geo=function(name){if(geoCache[name])return geoCache[name];let g;
  if(QGEN[name])g=upload(QGEN[name][0],QGEN[name][1],'pu');
  else if(name.startsWith('arc')){const [,ang,r0]=name.split(':');const [P,I]=arcGeo(+ang*Math.PI/180,+r0);g=upload(P,I,'pu')}
  else if(name.startsWith('ring')){const [,r0]=name.split(':');const [P,I]=ringGeo(+r0);g=upload(P,I,'pu')}
  else{let P,I;if(name==='box')[P,I]=GEN.box();else if(name==='sphere')[P,I]=GEN.sphere();else if(name==='sphereLo')[P,I]=GEN.sphere(6,8);
    else if(name==='limb')[P,I]=GEN.limb();else if(name==='disc')[P,I]=GEN.disc();
    else if(name.startsWith('cyl')){const [,r0,r1,seg]=name.split(':');[P,I]=GEN.frustum(r0===undefined?1:+r0,r1===undefined?1:+r1,seg?+seg:12)}
    else if(name==='cone')[P,I]=GEN.frustum(1,0,10);else if(name==='cone4')[P,I]=GEN.frustum(1,0,4);
    else throw new Error('알 수 없는 도형: '+name);
    fixWinding(P,I,6);g=upload(P,I,'pn')}
  return geoCache[name]=g};
function bindGeo(g,pr){gl.bindBuffer(gl.ARRAY_BUFFER,g.b);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ib);
  for(const [name,size,off] of g.layout){const loc=pr.a[name];if(loc<0)continue;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,g.stride,off)}}

/* ═══════════ 텍스처 ═══════════ */
const T=E.tex={};
E.texFrom=function(src){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return{t,w:src.width,h:src.height}};
E.canvasTex=function(name,w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);return T[name]=E.texFrom(c)};

/* ═══════════ 상태 ═══════════ */
const S=E.state={view:null,proj:null,cam:[0,5,8],fog:[0,0,0],fogN:10,fogF:30,light:[.35,.9,.25],lightC:[1,1,1],rim:[.6,.6,.8],gl:[1,1,1],arena:11};
E.init=function(canvas){cv=canvas;gl=cv.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:true});if(!gl)return false;
  PT=prog(VST,FST,['aP','aN'],['uM','uV','uP','uOut','uC','uE','uFog','uL','uLC','uCam','uRim','uGL','uA','uFlash','uFogN','uFogF','uGround','uR','uOutPass','uFlat']);
  PQ=prog(VSQ,FSQ,['aP','aUV'],['uM','uV','uP','uT','uTint','uFlash','uCut','uFogN','uFogF','uFog']);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);E.gl=gl;return true};
E.pixelRatio=2;
E.resize=function(){const d=Math.min(E.pixelRatio,devicePixelRatio||1),w=Math.round(cv.clientWidth*d),h=Math.round(cv.clientHeight*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}return w&&h};
E.clear=function(){gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)};
E.camera=function(ex,ey,ez,tx,ty,tz,fovDeg){const asp=cv.width/cv.height;S.proj=M4.persp((fovDeg||(asp<1?58:48))*Math.PI/180,asp,.1,120);S.view=M4.lookAt(ex,ey,ez,tx,ty,tz);S.cam=[ex,ey,ez]};
E.env=function(o){Object.assign(S,o)};
let curProg=null;
function use(pr){if(curProg===pr)return;gl.useProgram(pr.p);curProg=pr}
function common(pr){gl.uniformMatrix4fv(pr.u.uV,false,S.view);gl.uniformMatrix4fv(pr.u.uP,false,S.proj);gl.uniform3fv(pr.u.uFog,S.fog);gl.uniform1f(pr.u.uFogN,S.fogN);gl.uniform1f(pr.u.uFogF,S.fogF)}
E.begin=function(){curProg=null;use(PT);common(PT);gl.uniform3fv(PT.u.uL,S.light);gl.uniform3fv(PT.u.uLC,S.lightC);gl.uniform3fv(PT.u.uCam,S.cam);gl.uniform3fv(PT.u.uRim,S.rim);gl.uniform3fv(PT.u.uGL,S.gl);gl.uniform1f(PT.u.uR,S.arena);
  use(PQ);common(PQ);curProg=null};
const Z3=[0,0,0];
/* 메시 그리기
   m = { c:[r,g,b] 색, e:[r,g,b] 발광, a:불투명도, flash:번쩍임, outline:외곽선 굵기(0=없음), oc:외곽선 색, ground:바닥 무늬, flat:그림자 없음 } */
E.mesh=function(g,M,m){use(PT);bindGeo(g,PT);gl.uniformMatrix4fv(PT.u.uM,false,M);
  const a=m.a===undefined?1:m.a;
  if(m.outline){gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);gl.uniform1f(PT.u.uOut,m.outline);gl.uniform1f(PT.u.uOutPass,1);gl.uniform3fv(PT.u.uC,m.oc||[.05,.04,.08]);gl.uniform1f(PT.u.uA,a);
    gl.drawElements(gl.TRIANGLES,g.n,gl.UNSIGNED_SHORT,0);gl.cullFace(gl.BACK)}
  else gl.enable(gl.CULL_FACE),gl.cullFace(gl.BACK);
  if(m.twoSided)gl.disable(gl.CULL_FACE);
  gl.uniform1f(PT.u.uOut,0);gl.uniform1f(PT.u.uOutPass,0);gl.uniform3fv(PT.u.uC,m.c);gl.uniform3fv(PT.u.uE,m.e||Z3);gl.uniform1f(PT.u.uA,a);
  gl.uniform1f(PT.u.uFlash,m.flash||0);gl.uniform1f(PT.u.uGround,m.ground?1:0);gl.uniform1f(PT.u.uFlat,m.flat||0);
  gl.drawElements(gl.TRIANGLES,g.n,gl.UNSIGNED_SHORT,0);gl.disable(gl.CULL_FACE)};
/* 텍스처 쿼드·호·고리 그리기 (add=가산 합성) */
E.quad=function(g,M,tx,tint,o={}){use(PQ);bindGeo(g,PQ);gl.uniformMatrix4fv(PQ.u.uM,false,M);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tx.t);gl.uniform1i(PQ.u.uT,0);
  gl.uniform4fv(PQ.u.uTint,tint);gl.uniform1f(PQ.u.uFlash,o.flash||0);gl.uniform1f(PQ.u.uCut,o.cut||0);
  if(o.add)gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(!!o.depth);
  gl.drawElements(gl.TRIANGLES,g.n,gl.UNSIGNED_SHORT,0);
  if(o.add)gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(true)};
E.yawTo=(x,z)=>Math.atan2(S.cam[0]-x,S.cam[2]-z);
E.project=function(x,y,z){if(!S.view)return[0,0,false];const v=M4.apply(S.view,x,y,z);const p=M4.apply(S.proj,v[0],v[1],v[2]);const w=p[3]||1;
  return[(p[0]/w*.5+.5)*cv.clientWidth,(1-(p[1]/w*.5+.5))*cv.clientHeight,w>0]};
})();
