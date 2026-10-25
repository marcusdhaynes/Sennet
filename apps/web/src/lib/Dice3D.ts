/** Real 3D dice: WebGL geometry + a rigid-body solver. This module is loaded
 * only while dice are airborne; the rest of Sennet remains Pixi-based. */
import * as THREE from 'three';
import {installDiceLighting} from './Dice3DLighting.ts';
import {createDie3DModel,dieGeometry,radiusFor,type NumberedFace} from './Dice3DGeometry.ts';
import {DEFAULT_DICE_THEME,type DiceThemeId} from './diceThemes.ts';
export {dieGeometry,createDie3DModel} from './Dice3DGeometry.ts';
import * as CANNON from 'cannon-es';
import {containDiceInView,safeDiceFootprint,visibleDiceBounds,type DiceScreenBounds,type ScreenRect} from './diceScreenWalls.ts';

export interface Dice3DSource {sides:number;quantity:number;x:number;y:number;scale?:number;themeId?:DiceThemeId}
const rand=(max:number)=>{
  const word=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;
  do{crypto.getRandomValues(word);}while(word[0]>=limit);
  return word[0]%max+1;
};
export interface Dice3DRect {left:number;top:number;right:number;bottom:number}
/** The source rack is inside the RIGHT drawer. Place a thrown solid past
 * the rim ON THE SIDE OF ITS FLICK, never always on the right as before.
 * Screen-space Y increases downward, matching aimY and tray coordinates. */
export function spawnOutsideTray(
  x:number,y:number,r:number,trays:readonly Dice3DRect[],aimX:number,aimY:number
):{x:number;y:number}{
  let px=x,py=y;
  for(const tray of trays){
    if(px<tray.left-r||px>tray.right+r||
       py<tray.top-r||py>tray.bottom+r)continue;
    if(Math.abs(aimX)>=Math.abs(aimY))
      px=aimX<0?tray.left-r-13:tray.right+r+13;
    else
      py=aimY<0?tray.top-r-13:tray.bottom+r+13;
  }
  return {x:px,y:py};
}
export interface Dice3DResult {sides:number;rolls:number[];x:number;y:number;rotation:number;quaternion:[number,number,number,number];altitude:number}
export interface Dice3DOptions {
  host:HTMLElement;width:number;height:number;
  sources:Dice3DSource[];aimX:number;aimY:number;durationMs:number;
  /** A picked-up die must launch at the pointer, not be pushed out of a source tray. */
  reroll?:boolean;
  /** Released gently from a held position: gravity only, no forced throw. */
  gentleDrop?:boolean;
  /** Source was picked up and released at this exact screen coordinate. */
  heldRelease?:boolean;
  trays:Dice3DRect[];obstacles:{x:number;y:number}[];
  done:(results:Dice3DResult[])=>void;
  /** A GPU/context/physics failure must never strand the roll in flight. */
  onError?:(error:unknown)=>void;
  /** True only once the replacement 3D renderer has painted the outcome. */
  canHandoff?:()=>boolean;
}
// Adjacent dice must fit within a 62-unit drawer.
export function convexShape(geom:THREE.BufferGeometry):CANNON.Shape{
  const attr=geom.getAttribute('position');
  const vertices:CANNON.Vec3[]=[],indices=new Map<string,number>(),faces:number[][]=[];
  for(let i=0;i+2<attr.count;i+=3){
    const face:number[]=[];
    for(let j=0;j<3;j++){
      const x=attr.getX(i+j),y=attr.getY(i+j),z=attr.getZ(i+j);
      const key=[x,y,z].map(v=>v.toFixed(4)).join(':');
      let n=indices.get(key);
      if(n===undefined){n=vertices.length;indices.set(key,n);vertices.push(new CANNON.Vec3(x,y,z));}
      face.push(n);
    }
    const a=vertices[face[0]],b=vertices[face[1]],c=vertices[face[2]];
    const cross=new CANNON.Vec3();
    b.vsub(a).cross(c.vsub(a),cross);
    const center=new CANNON.Vec3((a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3,(a.z+b.z+c.z)/3);
    if(cross.dot(center)<0)[face[1],face[2]]=[face[2],face[1]];
    if(new Set(face).size===3)faces.push(face);
  }
  return new CANNON.ConvexPolyhedron({vertices,faces});
}
function boxAt(world:CANNON.World,x:number,y:number,z:number,
  wx:number,wy:number,wz:number,friction:CANNON.Material):CANNON.Body{
  const body=new CANNON.Body({mass:0,material:friction,
    shape:new CANNON.Box(new CANNON.Vec3(wx/2,wy/2,wz/2))});
  body.position.set(x,y,z);world.addBody(body);
  return body;
}
export function roll3DDice(opts:Dice3DOptions):()=>void{
  const {host,width:w,height:h}=opts;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,
    premultipliedAlpha:false,powerPreference:'high-performance'});
  try{
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
  renderer.setSize(w,h,false);
  renderer.setClearColor(0x000000,0);
  const canvas=renderer.domElement;
  canvas.className='sennet-dice-3d-layer';canvas.style.cssText=
    'position:absolute;left:0;top:0;width:100%;height:100%;'+
    'pointer-events:none;z-index:89;display:block';
  host.appendChild(canvas);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,.1,1600);
  camera.position.set(w/2,h/2,1100);camera.lookAt(w/2,h/2,0);
  installDiceLighting(scene);
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,-1050)});
  world.allowSleep=true;(world.solver as CANNON.GSSolver).iterations=12;
  const dieMat=new CANNON.Material('polyhedral'),wallMat=new CANNON.Material('felt');
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat,wallMat,
    {friction:.43,restitution:.35}));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat,dieMat,
    {friction:.30,restitution:.56}));
  const floor=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:wallMat});
  world.addBody(floor);
  // The original 156-unit-high walls allowed powerful throws to vault
  // straight over the screen edge. Tall rigid walls give real rebounds;
  // a post-step sphere constraint guarantees no high-speed tunnelling.
  const wall=22,wallHeight=1600,wallCenterZ=wallHeight/2;
  const screenWalls=[
    boxAt(world,-wall/2,h/2,wallCenterZ,wall,h+wall*2,wallHeight,wallMat),
    boxAt(world,w+wall/2,h/2,wallCenterZ,wall,h+wall*2,wallHeight,wallMat),
    boxAt(world,w/2,h+wall/2,wallCenterZ,w+wall*2,wall,wallHeight,wallMat),
    boxAt(world,w/2,-wall/2,wallCenterZ,w+wall*2,wall,wallHeight,wallMat)
  ];
  const visibleViewport=():DiceScreenBounds=>{
    const screen=host.getBoundingClientRect();
    const clips:ScreenRect[]=[];
    // The browser screen and every genuinely clipped parent are physical
    // boundaries too (e.g., when the app lives in a smaller embedded pane).
    for(let parent=host.parentElement;parent;parent=parent.parentElement){
      const style=window.getComputedStyle(parent);
      if(['hidden','clip','auto','scroll'].includes(style.overflowX)||
         ['hidden','clip','auto','scroll'].includes(style.overflowY)){
        const area=parent.getBoundingClientRect();
        clips.push({left:area.left,top:area.top,width:area.width,height:area.height});
      }
    }
    const vv=window.visualViewport;
    if(vv)clips.push({left:vv.offsetLeft,top:vv.offsetTop,
      width:vv.width,height:vv.height});
    return visibleDiceBounds({left:screen.left,top:screen.top,
      width:screen.width,height:screen.height},
      window.innerWidth,window.innerHeight,w,h,clips);
  };
  const moveScreenWalls=(bounds:DiceScreenBounds)=>{
    screenWalls[0].position.x=bounds.left-wall/2;
    screenWalls[1].position.x=bounds.right+wall/2;
    screenWalls[2].position.y=h-bounds.top+wall/2;
    screenWalls[3].position.y=h-bounds.bottom-wall/2;
    for(const barrier of screenWalls){
      barrier.aabbNeedsUpdate=true;
      barrier.wakeUp();
    }
  };
  let currentScreenBounds=visibleViewport();
  moveScreenWalls(currentScreenBounds);
  for(const tray of opts.trays){
    const left=Math.min(tray.left,tray.right),right=Math.max(tray.left,tray.right),
      top=Math.min(tray.top,tray.bottom),bottom=Math.max(tray.top,tray.bottom);
    const cy=h-(top+bottom)/2,cz=55,thick=9;
    // A frame rather than a solid slab: dice can bounce off every tray edge.
    boxAt(world,left-thick/2,cy,cz,thick,bottom-top+thick,110,wallMat);
    boxAt(world,right+thick/2,cy,cz,thick,bottom-top+thick,110,wallMat);
    boxAt(world,(left+right)/2,h-top+thick/2,cz,right-left+thick,thick,110,wallMat);
    boxAt(world,(left+right)/2,h-bottom-thick/2,cz,right-left+thick,thick,110,wallMat);
  }
  for(const p of opts.obstacles.slice(-70)){
    const fixed=new CANNON.Body({mass:0,material:wallMat,
      shape:new CANNON.Sphere(12)});
    fixed.position.set(p.x,h-p.y,12);world.addBody(fixed);
  }
  const aimLength=Math.hypot(opts.aimX,opts.aimY);
  // A held drop has ZERO horizontal launch. A throw follows the last
  // pointer-movement vector (not the start-to-release drag displacement).
  const gentleDrop=opts.gentleDrop===true;
  const throwSpeed=gentleDrop?0:THREE.MathUtils.clamp(
    aimLength/Math.max(.035,Math.min(.24,opts.durationMs/1000))*1.08,180,1250);
  const vx=aimLength>1?opts.aimX/aimLength:0;
  const vy=aimLength>1?-opts.aimY/aimLength:0;
  const objects:{sides:number;quantity:number;scale:number;mesh:THREE.Group;
    body:CANNON.Body;faces:NumberedFace[];shadow:THREE.Mesh;screenRadius:number}[]=[];
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const ctx=shadowCanvas.getContext('2d');
  if(ctx){const g=ctx.createRadialGradient(32,32,2,32,32,31);
    g.addColorStop(0,'#00000085');g.addColorStop(1,'#00000000');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);}
  const shadowTex=new THREE.CanvasTexture(shadowCanvas);
  for(let i=0;i<opts.sources.length;i++){
    const source=opts.sources[i],side=source.sides,
      r=radiusFor(side)*Math.max(.08,Math.min(4,source.scale??1));
    const {group:mesh,geometry:geom,faces}=createDie3DModel(side,r,source.themeId??DEFAULT_DICE_THEME);
    geom.computeBoundingSphere();
    const screenRadius=Math.max(32,safeDiceFootprint(r,geom.boundingSphere?.radius??r));
    const body=new CANNON.Body({mass:side===2?.85:1.05+side/170,
      material:dieMat,linearDamping:.13,angularDamping:.14,
      allowSleep:true,sleepSpeedLimit:.22,sleepTimeLimit:.7});
    body.addShape(side===2?
      new CANNON.Cylinder(r,r,4,32):convexShape(geom),
      undefined,side===2?new CANNON.Quaternion().setFromAxisAngle(
        new CANNON.Vec3(1,0,0),Math.PI/2):undefined);
    let startX=source.x,startY=source.y;
    // Spawn a mixed throw as a close but NON-intersecting cluster. Widely
    // separated dice started in different storage slots rarely collided.
    // These small staggered offsets give Cannon real die-to-die contacts.
    if(!opts.reroll&&opts.sources.length>1){
      const meanX=opts.sources.reduce((n,s)=>n+s.x,0)/opts.sources.length;
      const meanY=opts.sources.reduce((n,s)=>n+s.y,0)/opts.sources.length;
      startX=meanX+(i%3-1)*37;
      startY=meanY+Math.floor(i/3)*35-25;
    }
    // The rim remains physically solid; release on the aim-facing side.
    // Inward flicks from the right drawer must launch LEFT into play.
    if(!opts.reroll&&!opts.heldRelease&&!gentleDrop){
      const launch=spawnOutsideTray(startX,startY,r,opts.trays,opts.aimX,opts.aimY);
      startX=launch.x;startY=launch.y;
    }
    // A held die released INSIDE a raised wooden tray otherwise launches
    // at z=48 while the tray rim extends to z=110. Cannon immediately
    // strikes the wall and may fling the die sideways/opposite its flick.
    // For a real throw, the hand lifts it over that lip before the launch;
    // for a gentle drop it stays over the exact release point.
    const insideTray=opts.trays.some(t=>
      startX>=Math.min(t.left,t.right)-r&&startX<=Math.max(t.left,t.right)+r&&
      startY>=Math.min(t.top,t.bottom)-r&&startY<=Math.max(t.top,t.bottom)+r);
    const handLaunchHeight=opts.heldRelease&&!gentleDrop&&insideTray?126+r:0;
    body.position.set(THREE.MathUtils.clamp(startX,r+2,w-r-2),h-
      THREE.MathUtils.clamp(startY,r+2,h-r-2),
      Math.max(r+6,(gentleDrop?65:48)*(source.scale??1),handLaunchHeight)+i*7);
    body.quaternion.setFromEuler(Math.random()*Math.PI*2,
      Math.random()*Math.PI*2,Math.random()*Math.PI*2,'XYZ');
    // True drop: gravity and contact alone. Zero planar velocity means
    // neither the die nor its animation can shoot in a random direction.
    // A genuine throw gets an upward arc and spin coupled to travel direction.
    const spread=.97+Math.random()*.06;
    const spin=Math.min(25,Math.max(7,throwSpeed/(Math.max(8,r)*3.2)));
    body.velocity.set(vx*throwSpeed*spread,vy*throwSpeed*spread,
      gentleDrop?0:205+throwSpeed*.27);
    body.angularVelocity.set(gentleDrop?(Math.random()-.5)*1.2:
      vy*spin+(Math.random()-.5)*3.5,
      gentleDrop?(Math.random()-.5)*1.2:
      -vx*spin+(Math.random()-.5)*3.5,
      gentleDrop?(Math.random()-.5)*.8:(Math.random()-.5)*9);
    containDiceInView(body,currentScreenBounds,screenRadius,h);
    world.addBody(body);scene.add(mesh);
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(32,48),
      new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:.44,depthWrite:false}));
    shadow.position.z=.4;scene.add(shadow);
    objects.push({sides:side,quantity:source.quantity,scale:source.scale??1,
      mesh,body,faces,shadow,screenRadius});
  }
  let stopped=false,frame=0,started=performance.now(),previous=started;
  const cleanup=()=>{
    if(stopped)return;
    stopped=true;if(frame)cancelAnimationFrame(frame);
    canvas.remove();
    scene.traverse(child=>{
      if(child instanceof THREE.Mesh||child instanceof THREE.LineSegments){
        child.geometry.dispose();
        const materials=Array.isArray(child.material)?child.material:[child.material];
        for(const m of materials){
          if(m instanceof THREE.MeshBasicMaterial&&m.map&&m.map!==shadowTex)m.map.dispose();
          m.dispose();
        }
      }
    });
    shadowTex.dispose();renderer.dispose();renderer.forceContextLoss();
  };
  const complete=()=>{
    const result:Dice3DResult[]=objects.map(obj=>{
      const q=new THREE.Quaternion(obj.body.quaternion.x,obj.body.quaternion.y,
        obj.body.quaternion.z,obj.body.quaternion.w);
      const winning=obj.faces.reduce((best,f)=>{
        const score=f.normal.clone().applyQuaternion(q).z;
        return score>best.score?{score,value:f.value}:best;
      },{score:-Infinity,value:rand(obj.sides)});
      const visible=obj.sides===2?
        new THREE.Vector3(0,0,1).applyQuaternion(q).z>=0?1:2:
        winning.value;
      const rolls=Array.from({length:obj.quantity},(_,i)=>i===0?visible:rand(obj.sides));
      // Clamp once more before saving, with the full model's footprint.
      containDiceInView(obj.body,currentScreenBounds,obj.screenRadius,h);
      return {sides:obj.sides,rolls,
        x:obj.body.position.x,
        y:h-obj.body.position.y,
        rotation:Math.atan2(2*(q.w*q.z+q.x*q.y),
          1-2*(q.y*q.y+q.z*q.z))*180/Math.PI,
        quaternion:[q.x,q.y,q.z,q.w] as [number,number,number,number],
        altitude:Math.max(0,obj.body.position.z/Math.max(.08,obj.scale))};
    });
    // Preserve the visible final frame until the static renderer has drawn
    // the exact recorded quaternion; otherwise a die visibly teleports.
    opts.done(result);
    // Never remove the animated mesh before the STATIC THREE renderer has
    // actually painted the exact final quaternion. The old fixed two-frame
    // delay could reveal a flat placeholder (or a blank frame) on slow GPUs.
    const handoffStarted=performance.now();
    const transfer=()=>{
      if(stopped)return;
      if(opts.canHandoff?.()||performance.now()-handoffStarted>1800){
        cleanup();return;
      }
      frame=requestAnimationFrame(transfer);
    };
    frame=requestAnimationFrame(transfer);
  };
  const tick=(now:number)=>{
    if(stopped)return;
    try{
      const elapsed=(now-started)/1000,dt=Math.min(.05,(now-previous)/1000);
      previous=now;
      currentScreenBounds=visibleViewport();
      moveScreenWalls(currentScreenBounds);
      world.step(1/60,dt,4);
      for(const obj of objects){
        const b=obj.body,m=obj.mesh;
        // Apply to every integration, BEFORE painting; at no point can the
        // die's full visible geometry escape any edge of the player's screen.
        if(containDiceInView(b,currentScreenBounds,obj.screenRadius,h)){
          b.aabbNeedsUpdate=true;
          b.wakeUp();
        }
        m.position.set(b.position.x,b.position.y,b.position.z);
        m.quaternion.set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w);
        obj.shadow.position.set(b.position.x,b.position.y,.4);
        obj.shadow.scale.setScalar(1+Math.min(1,b.position.z/150));
        (obj.shadow.material as THREE.MeshBasicMaterial).opacity=
          Math.max(.1,.45-Math.max(0,b.position.z)*.002);
      }
      renderer.render(scene,camera);
      if(elapsed>1.5&&objects.every(o=>o.body.sleepState===CANNON.Body.SLEEPING||
        (o.body.velocity.length()<13&&o.body.angularVelocity.length()<.55&&o.body.position.z<32))||
        elapsed>6){complete();return;}
      frame=requestAnimationFrame(tick);
    }catch(error){
      cleanup();
      opts.onError?.(error);
    }
  };
  frame=requestAnimationFrame(tick);
  return cleanup;
  }catch(error){
    // A partially initialized 3D scene must not consume GPU contexts.
    try{renderer.dispose();renderer.forceContextLoss();}
    finally{renderer.domElement.remove();}
    throw error;
  }
}
