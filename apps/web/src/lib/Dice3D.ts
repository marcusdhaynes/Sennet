/** Real 3D dice: WebGL geometry + a rigid-body solver. This module is loaded
 * only while dice are airborne; the rest of Sennet remains Pixi-based. */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface Dice3DSource {sides:number;quantity:number;x:number;y:number}
export interface Dice3DRect {left:number;top:number;right:number;bottom:number}
export interface Dice3DResult {sides:number;rolls:number[];x:number;y:number;rotation:number}
export interface Dice3DOptions {
  host:HTMLElement;width:number;height:number;
  sources:Dice3DSource[];aimX:number;aimY:number;durationMs:number;
  trays:Dice3DRect[];obstacles:{x:number;y:number}[];
  done:(results:Dice3DResult[])=>void;
}
const radiusFor=(sides:number)=>sides===2?19:sides===100?21:20;
const colorFor=(sides:number)=>({
  2:0xd5b87f,4:0xc6af8b,6:0x9cc7ba,8:0xa59dd7,
  10:0x82b9d4,12:0xcfa090,20:0xb69dd7,100:0x77bbaa
} as Record<number,number>)[sides]??0xd0bc97;
const rand=(max:number)=>{
  const word=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;
  do{crypto.getRandomValues(word);}while(word[0]>=limit);
  return word[0]%max+1;
};
/** Ten planar kite faces of a pentagonal trapezohedron, not a cone or
 * billboard. Each quadrilateral is triangulated only for GPU/solver use. */
function tenSidedGeometry(radius:number):THREE.BufferGeometry{
  const phi=Math.PI/5,cos=Math.cos(phi);
  const apex=radius,low=radius*(1-cos)/(1+cos);
  const ring=Array.from({length:10},(_,i)=>{
    const angle=2*Math.PI*i/10;
    return new THREE.Vector3(Math.cos(angle)*radius*.94,
      Math.sin(angle)*radius*.94,(i%2?low:-low));
  });
  const top=new THREE.Vector3(0,0,apex),bottom=new THREE.Vector3(0,0,-apex);
  const coords:number[]=[];
  const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>{
    const cross=b.clone().sub(a).cross(c.clone().sub(a));
    const center=a.clone().add(b).add(c);
    const oriented=cross.dot(center)<0?[a,c,b]:[a,b,c];
    for(const vertex of oriented)coords.push(vertex.x,vertex.y,vertex.z);
  };
  for(let i=0;i<5;i++){
    const j=2*i,a=ring[j],b=ring[j+1],c=ring[(j+2)%10],d=ring[(j+3)%10];
    triangle(top,a,b);triangle(top,b,c);
    triangle(bottom,b,c);triangle(bottom,c,d);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  geom.computeVertexNormals();return geom;
}
export function dieGeometry(sides:number,r:number):THREE.BufferGeometry{
  switch(sides){
    case 2:{
      const g=new THREE.CylinderGeometry(r,r,4,32,1);
      g.rotateX(Math.PI/2);return g.toNonIndexed();
    }
    case 4:return new THREE.TetrahedronGeometry(r,0).toNonIndexed();
    case 6:return new THREE.BoxGeometry(r*1.67,r*1.67,r*1.67).toNonIndexed();
    case 8:return new THREE.OctahedronGeometry(r,0).toNonIndexed();
    case 10:return tenSidedGeometry(r);
    case 12:return new THREE.DodecahedronGeometry(r,0).toNonIndexed();
    case 20:return new THREE.IcosahedronGeometry(r,0).toNonIndexed();
    default:return new THREE.SphereGeometry(r,25,3).toNonIndexed();
  }
}
interface NumberedFace {normal:THREE.Vector3;value:number}
function faceLabels(geometry:THREE.BufferGeometry,sides:number,r:number,
  group:THREE.Group):NumberedFace[]{
  // Include D100 numerals on every small facet. The flip coin gets its
  // own HEADS/TAILS marking on its two flat surfaces.
  const attr=geometry.getAttribute('position'),faces=new Map<string,{
    normal:THREE.Vector3;center:THREE.Vector3;count:number
  }>();
  for(let i=0;i+2<attr.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(attr,i),
      b=new THREE.Vector3().fromBufferAttribute(attr,i+1),
      c=new THREE.Vector3().fromBufferAttribute(attr,i+2);
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const centroid=a.clone().add(b).add(c).multiplyScalar(1/3);
    if(normal.dot(centroid)<0)normal.negate();
    const key=[normal.x,normal.y,normal.z].map(v=>v.toFixed(2)).join(':');
    const prev=faces.get(key);
    if(prev){prev.center.add(centroid);prev.count++;}
    else faces.set(key,{normal,center:centroid,count:1});
  }
  if(sides===2){
    const faces2=[{normal:new THREE.Vector3(0,0,1),value:1},
      {normal:new THREE.Vector3(0,0,-1),value:2}];
    for(const entry of faces2){
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const ctx=canvas.getContext('2d');if(!ctx)continue;
      ctx.fillStyle='#fff6da';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='900 84px system-ui,sans-serif';
      ctx.strokeStyle='#282b2c';ctx.lineWidth=6;
      ctx.strokeText(entry.value===1?'H':'T',64,66);
      ctx.fillText(entry.value===1?'H':'T',64,66);
      const texture=new THREE.CanvasTexture(canvas);
      const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,
        depthWrite:false,side:THREE.DoubleSide});
      const label=new THREE.Mesh(new THREE.PlaneGeometry(17,17),material);
      label.position.set(0,0,entry.value===1?2.3:-2.3);
      label.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),entry.normal);
      label.renderOrder=3;group.add(label);
    }
    return faces2;
  }
  const result:NumberedFace[]=[];
  let i=0;
  for(const face of faces.values()){
    const value=i%sides+1;i++;
    result.push({normal:face.normal,value});
    // Each outward-facing planar facet receives its own numeral.
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
    const ctx=canvas.getContext('2d');
    if(!ctx)continue;
    ctx.clearRect(0,0,96,96);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 63px system-ui,sans-serif';
    ctx.strokeStyle='#18282d';ctx.lineWidth=8;
    ctx.strokeText(String(value),48,50);
    ctx.fillStyle='#fff5d2';ctx.fillText(String(value),48,50);
    const tex=new THREE.CanvasTexture(canvas);
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
    const label=new THREE.Mesh(new THREE.PlaneGeometry(sides===100?4.6:sides===20?7.5:11,
      sides===100?4.6:sides===20?7.5:11),mat);
    label.position.copy(face.center.divideScalar(face.count)).addScaledVector(face.normal,.8);
    label.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),face.normal);
    label.renderOrder=3;group.add(label);
  }
  return result;
}
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
  wx:number,wy:number,wz:number,friction:CANNON.Material){
  const body=new CANNON.Body({mass:0,material:friction,
    shape:new CANNON.Box(new CANNON.Vec3(wx/2,wy/2,wz/2))});
  body.position.set(x,y,z);world.addBody(body);
}
export function roll3DDice(opts:Dice3DOptions):()=>void{
  const {host,width:w,height:h}=opts;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,
    premultipliedAlpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(w,h,false);
  renderer.setClearColor(0x000000,0);
  const canvas=renderer.domElement;
  canvas.className='sennet-dice-3d-layer';canvas.style.cssText=
    'position:absolute;left:0;top:0;width:100%;height:100%;'+
    'pointer-events:none;z-index:12;display:block';
  host.appendChild(canvas);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,.1,1600);
  camera.position.set(w/2,h/2,1100);camera.lookAt(w/2,h/2,0);
  scene.add(new THREE.AmbientLight(0xfff4e6,1.1));
  const key=new THREE.DirectionalLight(0xffffff,2.4);
  key.position.set(w*.22,h*.79,850);scene.add(key);
  const fill=new THREE.DirectionalLight(0x86b5da,.8);
  fill.position.set(w*.8,h*.15,600);scene.add(fill);
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,-1050)});
  world.allowSleep=true;(world.solver as CANNON.GSSolver).iterations=12;
  const dieMat=new CANNON.Material('polyhedral'),wallMat=new CANNON.Material('felt');
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat,wallMat,
    {friction:.43,restitution:.35}));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat,dieMat,
    {friction:.30,restitution:.56}));
  const floor=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:wallMat});
  world.addBody(floor);
  const z=78,wall=17;
  boxAt(world,-wall/2,h/2,z,wall,h,2*z,wallMat);
  boxAt(world,w+wall/2,h/2,z,wall,h,2*z,wallMat);
  boxAt(world,w/2,-wall/2,z,w,wall,2*z,wallMat);
  boxAt(world,w/2,h+wall/2,z,w,wall,2*z,wallMat);
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
  const throwSpeed=THREE.MathUtils.clamp(
    aimLength/Math.max(.15,Math.min(.8,opts.durationMs/1000))*.95,210,950);
  const vx=aimLength>5?opts.aimX/aimLength:1,
    vy=aimLength>5?-opts.aimY/aimLength:.19;
  const objects:{sides:number;quantity:number;mesh:THREE.Group;
    body:CANNON.Body;faces:NumberedFace[];shadow:THREE.Mesh}[]=[];
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const ctx=shadowCanvas.getContext('2d');
  if(ctx){const g=ctx.createRadialGradient(32,32,2,32,32,31);
    g.addColorStop(0,'#00000085');g.addColorStop(1,'#00000000');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);}
  const shadowTex=new THREE.CanvasTexture(shadowCanvas);
  for(let i=0;i<opts.sources.length;i++){
    const source=opts.sources[i],side=source.sides,r=radiusFor(side);
    const geom=dieGeometry(side,r);
    geom.computeVertexNormals();
    const mesh=new THREE.Group();
    const material=new THREE.MeshStandardMaterial({color:colorFor(side),
      roughness:.31,metalness:.28,flatShading:true,side:THREE.DoubleSide});
    mesh.add(new THREE.Mesh(geom,material));
    const rimMaterial=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.35});
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom,23),rimMaterial));
    const faces=faceLabels(geom,side,r,mesh);
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
    if(opts.sources.length>1){
      const meanX=opts.sources.reduce((n,s)=>n+s.x,0)/opts.sources.length;
      const meanY=opts.sources.reduce((n,s)=>n+s.y,0)/opts.sources.length;
      startX=meanX+(i%3-1)*37;
      startY=meanY+Math.floor(i/3)*35-25;
    }
    // Spawn on the table side of any tray rim, not inside its walls.
    for(const tray of opts.trays){
      if(startX>=tray.left-r&&startX<=tray.right+r&&
         startY>=tray.top-r&&startY<=tray.bottom+r){
        startX=tray.right+r+13;
      }
    }
    const scatter=(i-(opts.sources.length-1)/2)*.18;
    const theta=Math.atan2(vy,vx)+scatter;
    body.position.set(THREE.MathUtils.clamp(startX,30,w-30),h-
      THREE.MathUtils.clamp(startY,30,h-30),65+i*7);
    body.quaternion.setFromEuler(Math.random()*Math.PI*2,
      Math.random()*Math.PI*2,Math.random()*Math.PI*2,'XYZ');
    body.velocity.set(Math.cos(theta)*throwSpeed*(.85+Math.random()*.26),
      Math.sin(theta)*throwSpeed*(.85+Math.random()*.26),
      215+throwSpeed*.2);
    body.angularVelocity.set((Math.random()-.5)*24,(Math.random()-.5)*24,
      (Math.random()-.5)*23);
    world.addBody(body);scene.add(mesh);
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(32,48),
      new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:.44,depthWrite:false}));
    shadow.position.z=.4;scene.add(shadow);
    objects.push({sides:side,quantity:source.quantity,mesh,body,faces,shadow});
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
    shadowTex.dispose();renderer.dispose();
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
        obj.sides===100?rand(100):winning.value;
      const rolls=Array.from({length:obj.quantity},(_,i)=>i===0?visible:rand(obj.sides));
      return {sides:obj.sides,rolls,
        x:THREE.MathUtils.clamp(obj.body.position.x,0,w),
        y:THREE.MathUtils.clamp(h-obj.body.position.y,0,h),
        rotation:Math.atan2(2*(q.w*q.z+q.x*q.y),
          1-2*(q.y*q.y+q.z*q.z))*180/Math.PI};
    });
    cleanup();opts.done(result);
  };
  const tick=(now:number)=>{
    if(stopped)return;
    const elapsed=(now-started)/1000,dt=Math.min(.05,(now-previous)/1000);
    previous=now;world.step(1/60,dt,4);
    for(const obj of objects){
      const b=obj.body,m=obj.mesh;
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
  };
  frame=requestAnimationFrame(tick);
  return cleanup;
}
