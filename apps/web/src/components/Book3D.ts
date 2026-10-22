/** Real Three.js hardcover rendered into a cached transparent tabletop sprite.
 * This keeps one Pixi gesture target and avoids running a second perpetual
 * animation loop for an object that is normally stationary.
 */
import * as THREE from 'three';
import type {TomeDesign} from './Pseudo3DBook';

const themes:Record<TomeDesign,{leather:string;dark:string;foil:string;paper:string;strap?:boolean;glyph:string}>={
  tiny:{leather:'#753039',dark:'#341d26',foil:'#dfba76',paper:'#ead8b7',glyph:'✦'},
  dragon:{leather:'#16465b',dark:'#071d2c',foil:'#d2b77a',paper:'#f2e6cf',glyph:'✧'},
  journal:{leather:'#713044',dark:'#2c1625',foil:'#e5bbaa',paper:'#e7d7bf',glyph:'❖'},
  arcane:{leather:'#573a28',dark:'#25180f',foil:'#f3cd83',paper:'#eee0bb',glyph:'✴'},
  strapped:{leather:'#65402d',dark:'#2d1d17',foil:'#cda873',paper:'#ebdfc6',strap:true,glyph:'◆'}
};
const cache=new Map<TomeDesign,Promise<HTMLCanvasElement>>();
export function getBookCanvas(design:TomeDesign):Promise<HTMLCanvasElement>{
  let cached=cache.get(design);
  if(!cached){
    cached=Promise.resolve().then(()=>renderBook(design));
    cache.set(design,cached);
    cached.catch(()=>{if(cache.get(design)===cached)cache.delete(design);});
  }
  return cached;
}
function roundedCover(width:number,height:number,radius:number):THREE.Shape{
  const s=new THREE.Shape(),x=width/2,y=height/2,r=radius;
  s.moveTo(-x+r,-y);
  s.lineTo(x-r,-y);s.quadraticCurveTo(x,-y,x,-y+r);
  s.lineTo(x,y-r);s.quadraticCurveTo(x,y,x-r,y);
  s.lineTo(-x+r,y);s.quadraticCurveTo(-x,y,-x,y-r);
  s.lineTo(-x,-y+r);s.quadraticCurveTo(-x,-y,-x+r,-y);
  return s;
}
function decoratedCover(style:typeof themes[TomeDesign]):THREE.CanvasTexture{
  const canvas=document.createElement('canvas');
  canvas.width=768;canvas.height=1024;
  const g=canvas.getContext('2d');
  if(!g)throw Error('Canvas drawing is unavailable');
  const gold=style.foil;
  g.clearRect(0,0,768,1024);
  // Framed blind embossing: double gilt rules, rounded corner ornaments,
  // spine-side hinge and fine binding filigree.
  g.strokeStyle=gold;g.lineJoin='round';
  g.globalAlpha=.84;g.lineWidth=8;g.strokeRect(67,66,634,891);
  g.globalAlpha=.48;g.lineWidth=3;g.strokeRect(85,84,598,855);
  g.globalAlpha=.67;g.lineWidth=2;
  for(const sy of [1,-1])for(const sx of [1,-1]){
    g.save();g.translate(sx===1?110:658,sy===1?122:900);g.scale(sx,sy);
    g.beginPath();g.moveTo(0,72);g.bezierCurveTo(0,14,16,0,72,0);g.stroke();
    g.beginPath();g.moveTo(11,53);g.quadraticCurveTo(19,19,53,11);g.stroke();
    g.beginPath();g.arc(14,14,5,0,Math.PI*2);g.fillStyle=gold;g.fill();
    g.restore();
  }
  g.globalAlpha=.95;g.fillStyle=gold;g.textAlign='center';
  g.font='bold 117px Georgia, Times New Roman, serif';
  g.fillText('SENNET',384,304);
  g.globalAlpha=.96;g.font='bold 40px Georgia, serif';
  g.fillText('SETTINGS',384,357);
  g.lineWidth=3;g.beginPath();g.moveTo(221,388);g.lineTo(547,388);g.stroke();
  g.globalAlpha=.85;
  g.beginPath();g.arc(384,572,147,0,Math.PI*2);g.stroke();
  g.beginPath();g.arc(384,572,131,0,Math.PI*2);g.stroke();
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,p1=122,p2=i%3===0?171:157;
    g.beginPath();g.moveTo(384+Math.cos(a)*p1,572+Math.sin(a)*p1);
    g.lineTo(384+Math.cos(a)*p2,572+Math.sin(a)*p2);g.stroke();
  }
  g.textAlign='center';g.textBaseline='middle';
  g.font='bold 173px Georgia, serif';g.fillText(style.glyph,384,578);
  g.globalAlpha=.90;g.font='italic 33px Georgia, serif';
  g.fillText('THE TABLETOP COMPANION',384,835);
  g.globalAlpha=1;
  const t=new THREE.CanvasTexture(canvas);
  t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
function renderBook(design:TomeDesign):HTMLCanvasElement{
  const style=themes[design];
  const scene=new THREE.Scene();
  const width=900,height=1188;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setSize(width,height,false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.5;
  renderer.setClearColor(0x000000,0);
  // Nearly straight overhead: cover edges remain parallel to the cards.
  // The shallow pitch still reveals real pages, boards and spine thickness.
  const camera=new THREE.OrthographicCamera(-1.18,1.18,1.56,-1.56,.1,50);
  camera.position.set(0,-.78,10.8);camera.lookAt(0,0,.16);
  scene.add(new THREE.HemisphereLight(0xfaf0d8,0x172c32,2.15));
  const key=new THREE.DirectionalLight(0xffe3b9,3.6);
  key.position.set(-3,-4,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0xa2d3e0,2.1);
  rim.position.set(4,3,6);scene.add(rim);
  const leather=new THREE.MeshPhysicalMaterial({
    color:style.leather,roughness:.75,metalness:.04,
    clearcoat:.16,clearcoatRoughness:.55
  });
  const deep=new THREE.MeshStandardMaterial({color:style.dark,roughness:.9});
  const gold=new THREE.MeshStandardMaterial({color:style.foil,metalness:.78,roughness:.27});
  const goldMuted=new THREE.MeshStandardMaterial({color:style.foil,metalness:.52,roughness:.49});
  const paper=new THREE.MeshStandardMaterial({color:style.paper,roughness:.97});
  const leaf=new THREE.MeshStandardMaterial({color:0xb8a48a,roughness:.98});
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material|THREE.Material[],
    x:number,y:number,z:number):THREE.Mesh=>{
    const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);
    scene.add(item);return item;
  };
  const page=mesh(new THREE.BoxGeometry(1.70,2.41,.183),paper,.060,0,.154);
  // Layered fore-edge bands provide actual dimensional page texture.
  for(let i=0;i<24;i++){
    const z=.073+i*.0065;
    mesh(new THREE.BoxGeometry(.006,2.36,.002),i%3===0?leaf:paper,.916,0,z);
    mesh(new THREE.BoxGeometry(1.66,.006,.002),i%4===0?leaf:paper,.06,-1.211,z);
  }
  const coverShape=roundedCover(1.91,2.67,.075);
  const board=()=>new THREE.ExtrudeGeometry(coverShape,{
    depth:.057,bevelEnabled:true,bevelThickness:.014,bevelSize:.013,
    bevelSegments:3,steps:1,curveSegments:7
  });
  mesh(board(),[leather,deep],0,0,.025);
  mesh(board(),[leather,deep],0,0,.252);
  // Subtle leather hinge and curved sewn spine with five raised bands.
  mesh(new THREE.CylinderGeometry(.125,.13,2.53,32),leather,-.89,0,.18);
  mesh(new THREE.BoxGeometry(.024,2.50,.014),goldMuted,-.728,0,.330);
  for(const y of [-1.15,-.96,.96,1.15]){
    mesh(new THREE.CylinderGeometry(.132,.132,.036,32),goldMuted,-.89,y,.18);
  }
  // Filigree is embossed on the actual horizontal top-cover plane.
  const foiling=decoratedCover(style);
  const foilMat=new THREE.MeshBasicMaterial({map:foiling,transparent:true,
    depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  mesh(new THREE.PlaneGeometry(1.76,2.49),foilMat,.016,0,.340);
  // Gilded board edges and head/tail bands are independent solid geometry.
  for(const y of [-1.321,1.321]){
    mesh(new THREE.BoxGeometry(1.64,.025,.014),goldMuted,.085,y,.310);
  }
  for(const y of [-1.20,1.20]){
    for(const x of [-.77,.76]){
      mesh(new THREE.BoxGeometry(.125,.098,.021),gold,x,y,.352);
    }
  }
  if(style.strap){
    const belt=new THREE.MeshStandardMaterial({color:0x33261d,roughness:.88});
    for(const y of [-.67,.67]){
      mesh(new THREE.BoxGeometry(1.85,.105,.036),belt,.02,y,.367);
      mesh(new THREE.BoxGeometry(.19,.14,.043),gold,.63,y,.405);
      mesh(new THREE.BoxGeometry(.12,.085,.046),deep,.63,y,.428);
    }
  }
  // Contact shadow is transparent and stops the object looking pasted on.
  const shadowCanvas=document.createElement('canvas');
  shadowCanvas.width=128;shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext('2d');
  if(ctx){
    const grad=ctx.createRadialGradient(64,64,12,64,64,62);
    grad.addColorStop(0,'rgba(0,0,0,.43)');
    grad.addColorStop(.6,'rgba(0,0,0,.23)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  }
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  const shadowMat=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,
    depthWrite:false,side:THREE.DoubleSide});
  mesh(new THREE.PlaneGeometry(2.33,3.05),shadowMat,.13,.06,-.036);
  renderer.render(scene,camera);
  const out=document.createElement('canvas');
  out.width=width;out.height=height;
  const outctx=out.getContext('2d');
  if(!outctx){renderer.dispose();throw Error('2D canvas unavailable');}
  outctx.drawImage(renderer.domElement,0,0);
  scene.traverse(object=>{
    if(object instanceof THREE.Mesh){
      object.geometry.dispose();
      const mats=Array.isArray(object.material)?object.material:[object.material];
      for(const mat of mats)mat.dispose();
    }
  });
  foiling.dispose();shadowTexture.dispose();
  renderer.dispose();renderer.forceContextLoss();
  void page;return out;
}
