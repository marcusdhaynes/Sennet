/** Shared, lazily loaded Three.js visual geometry. Cannon physics is
 * deliberately excluded: displaying stationary dice does not load Cannon. */
import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {diceTheme,DEFAULT_DICE_THEME,type DiceThemeId} from './diceThemes.ts';
export interface NumberedFace {normal:THREE.Vector3;value:number}
export const radiusFor=(sides:number)=>sides===2?13.4:sides===100?14:13.7;
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
/** 52 evenly spaced vertices create a convex 100-triangle polyhedron
 * (Euler: F=2V-4), much closer to an actual faceted D100 than a sphere. */
function hundredFacets(r:number):THREE.BufferGeometry{
  const count=52,goldenAngle=Math.PI*(3-Math.sqrt(5));
  const points=Array.from({length:count},(_,i)=>{
    const y=1-2*(i+.5)/count;
    const ring=Math.sqrt(Math.max(0,1-y*y)),theta=i*goldenAngle;
    return new THREE.Vector3(Math.cos(theta)*ring*r,y*r,
      Math.sin(theta)*ring*r);
  });
  const hull=new ConvexGeometry(points);
  return hull.index?hull.toNonIndexed():hull;
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
    case 100:return hundredFacets(r);
    default:return new THREE.IcosahedronGeometry(r,1).toNonIndexed();
  }
}
/** One canvas atlas and ONE mesh for all dice numerals: a hundred-sided
 * die still uses a single draw call for all 100 labels. */
function faceLabels(geometry:THREE.BufferGeometry,sides:number,r:number,
  group:THREE.Group,themeId:DiceThemeId):NumberedFace[]{
  const attrs=geometry.getAttribute('position');
  const records=new Map<string,{normal:THREE.Vector3;center:THREE.Vector3;count:number}>();
  for(let i=0;i+2<attrs.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(attrs,i);
    const b=new THREE.Vector3().fromBufferAttribute(attrs,i+1);
    const c=new THREE.Vector3().fromBufferAttribute(attrs,i+2);
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const center=a.clone().add(b).add(c).multiplyScalar(1/3);
    if(normal.dot(center)<0)normal.negate();
    const key=normal.toArray().map(x=>x.toFixed(2)).join('/');
    const old=records.get(key);
    if(old){old.center.add(center);old.count++;}
    else records.set(key,{normal,center,count:1});
  }
  const faces:NumberedFace[]=sides===2?[
    {normal:new THREE.Vector3(0,0,1),value:1},
    {normal:new THREE.Vector3(0,0,-1),value:2}
  ]:Array.from(records.values()).map((face,i)=>({
    normal:face.normal,value:i%sides+1
  }));
  const entries=sides===2?[
    {normal:faces[0].normal,center:new THREE.Vector3(0,0,2.25),value:'H'},
    {normal:faces[1].normal,center:new THREE.Vector3(0,0,-2.25),value:'T'}
  ]:Array.from(records.values()).map((face,i)=>({
    normal:face.normal,center:face.center.clone().divideScalar(face.count)
      .addScaledVector(face.normal,.47),value:String(i%sides+1)
  }));
  const cell=72,cols=Math.min(10,entries.length),rows=Math.ceil(entries.length/cols);
  const canvas=document.createElement('canvas');
  canvas.width=cols*cell;canvas.height=rows*cell;
  const ctx=canvas.getContext('2d');
  if(!ctx)return faces;
  const theme=diceTheme(themeId);
  const pos:number[]=[],uv:number[]=[];
  const up=new THREE.Vector3(0,0,1);
  entries.forEach((entry,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 '+(entry.value.length>2?37:47)+'px system-ui,sans-serif';
    ctx.lineWidth=7;ctx.strokeStyle=theme.base;
    ctx.strokeText(entry.value,col*cell+cell/2,row*cell+cell/2+2);
    ctx.fillStyle=theme.ink;ctx.fillText(entry.value,
      col*cell+cell/2,row*cell+cell/2+2);
    const half=sides===2?8.3:sides===100?3.1:sides>=20?4.3:sides>=12?5.2:6.2;
    const rotation=new THREE.Quaternion().setFromUnitVectors(up,entry.normal);
    const corners=[[-half,-half],[half,-half],[half,half],[-half,half]]
      .map(([x,y])=>new THREE.Vector3(x,y,0)
        .applyQuaternion(rotation).add(entry.center));
    const u0=(col*cell+4)/canvas.width,u1=((col+1)*cell-4)/canvas.width;
    const v0=1-((row+1)*cell-4)/canvas.height,
      v1=1-(row*cell+4)/canvas.height;
    for(const [ix,u,v] of [[0,u0,v0],[1,u1,v0],[2,u1,v1],
      [0,u0,v0],[2,u1,v1],[3,u0,v1]] as [number,number,number][]){
      const p=corners[ix];pos.push(p.x,p.y,p.z);uv.push(u,v);
    }
  });
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  const labels=new THREE.BufferGeometry();
  labels.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  labels.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,
    alphaTest:.06,side:THREE.DoubleSide,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2});
  const mesh=new THREE.Mesh(labels,material);
  mesh.renderOrder=3;group.add(mesh);
  return faces;
}
/** Procedural colors and swirls add organic material character without
 * downloading JPGs or bloating the package with source art. */
function makeProceduralTexture(themeId:DiceThemeId){
  const theme=diceTheme(themeId);
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d')!;
  const gradient=ctx.createLinearGradient(0,0,128,128);
  gradient.addColorStop(0,theme.second);
  gradient.addColorStop(.48,theme.base);
  gradient.addColorStop(1,theme.second);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  let seed=Array.from(theme.id).reduce((n,c)=>((n*33)^c.charCodeAt(0))>>>0,5381);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  if(theme.family==='stone'||theme.family==='pearlescent'||theme.family==='cosmic'){
    for(let i=0;i<18;i++){
      const baseY=random()*128;
      ctx.beginPath();ctx.moveTo(-10,baseY);
      for(let x=0;x<=140;x+=4)
        ctx.lineTo(x,baseY+Math.sin(x*.045+i*.97)*10+
          Math.cos(x*.09+i)*5);
      ctx.strokeStyle=i%3===0?theme.edge:theme.second;
      ctx.globalAlpha=theme.family==='stone'?.31:.18;
      ctx.lineWidth=.5+random()*2.2;ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  if(theme.family==='cosmic'||theme.family==='crystal'||
     theme.family==='pearlescent'){
    for(let i=0;i<190;i++){
      const x=random()*128,y=random()*128,r=.15+random()*.8;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
      ctx.globalAlpha=.15+random()*.5;ctx.fillStyle=theme.edge;ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.anisotropy=2;
  return tex;
}
function sphericalUV(geometry:THREE.BufferGeometry){
  const pos=geometry.getAttribute('position'),uv:number[]=[];
  for(let i=0;i<pos.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(pos,i).normalize();
    uv.push(.5+Math.atan2(v.z,v.x)/(2*Math.PI),
      .5+Math.asin(THREE.MathUtils.clamp(v.y,-1,1))/Math.PI);
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
}
/** The ONE visual model used for storage, flying and landed dice. */
export function createDie3DModel(sides:number,r=radiusFor(sides),themeId:DiceThemeId=DEFAULT_DICE_THEME){
  const geometry=dieGeometry(sides,r);
  geometry.computeVertexNormals();
  sphericalUV(geometry);
  const theme=diceTheme(themeId);
  const group=new THREE.Group();
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,
    map:makeProceduralTexture(themeId),
    roughness:theme.roughness,metalness:theme.metalness,
    flatShading:true,side:THREE.DoubleSide,
    clearcoat:theme.family==='metal'?.55:.82,
    clearcoatRoughness:theme.family==='stone'?.25:.08,
    iridescence:theme.family==='pearlescent'?.65:0,
    iridescenceIOR:1.24});
  group.add(new THREE.Mesh(geometry,material));
  const edges=new THREE.LineBasicMaterial({color:theme.edge,transparent:true,
    opacity:sides===100?.14:.38});
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry,23),edges));
  const faces=faceLabels(geometry,sides,r,group,themeId);
  return {group,geometry,faces};
}
