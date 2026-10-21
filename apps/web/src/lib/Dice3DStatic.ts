/** Persistent tabletop renderer for the EXACT same Three.js solids used
 * during Cannon throws. Pixi owns hit testing; this canvas owns only visuals.
 * Keeping a single renderer prevents context churn and restores the die's
 * settled quaternion exactly when the throw finishes. */
import * as THREE from 'three';
import type {Container} from 'pixi.js';
import {createDie3DModel,radiusFor} from './Dice3DGeometry';
import {diceToCssTransform} from './diceCoordinates';
import type {DiceThemeId} from './diceThemes';
import {looseDieOpacity} from './diceCoordinates';

export interface StaticDiePlacement {
  id:string;
  piece:Container;
  sides:number;
  themeId?:DiceThemeId;
  quaternion?:[number,number,number,number];
  quantity?:number;
  result?:string;
  source?:boolean;
  shownAt?:number;
  fadeAfterMs?:number;
}
interface DieVisual {
  id:string;
  sides:number;
  themeId?:DiceThemeId;
  piece:Container;
  group:THREE.Group;
  shadow:THREE.Mesh;
  result?:HTMLElement;
  hidden:{piece:Container;visible:boolean}[];
}
export interface StaticDice3DRenderer {
  setEntries:(entries:StaticDiePlacement[])=>void;
  sync:(force?:boolean)=>void;
  setSourceQuantity:(sides:number,quantity:number)=>void;
  getRenderedRevision:()=>number;
  destroy:()=>void;
}
export function createStaticDice3D(
  host:HTMLElement,canvas:HTMLCanvasElement,
  pixiSize:()=>{width:number;height:number}
):StaticDice3DRenderer{
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,
    powerPreference:'low-power',premultipliedAlpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
  renderer.setClearColor(0,0);
  renderer.domElement.className='sennet-static-dice-3d';
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;'+
    'pointer-events:none;z-index:9;display:block';
  host.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffebd5,1.15));
  const key=new THREE.DirectionalLight(0xffffff,2.35);
  key.position.set(-350,500,950);scene.add(key);
  const bounce=new THREE.DirectionalLight(0x8aaee6,.65);
  bounce.position.set(600,-350,600);scene.add(bounce);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1800);
  camera.position.set(0,0,1100);
  const shadowCanvas=document.createElement('canvas');
  shadowCanvas.width=64;shadowCanvas.height=64;
  const ctx=shadowCanvas.getContext('2d');
  if(ctx){
    const gradient=ctx.createRadialGradient(32,32,2,32,32,30);
    gradient.addColorStop(0,'rgba(0,0,0,.48)');
    gradient.addColorStop(.6,'rgba(0,0,0,.15)');
    gradient.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  }
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  const visuals:DieVisual[]=[];
  let entries:StaticDiePlacement[]=[];
  let stopped=false,lastFrame=0,w=0,h=0;
  let entriesRevision=0,renderedRevision=0;
  // Texture-backed face numerals MUST retain their native transparency.
  // Blindly making every material opaque creates visible rectangles when a
  // tumbling die changes to its resting model.
  const materialDefaults=new WeakMap<THREE.Material,{
    transparent:boolean;opacity:number;depthWrite:boolean
  }>();
  const disposeGroup=(group:THREE.Group)=>{
    group.traverse(child=>{
      if(child instanceof THREE.Mesh||child instanceof THREE.LineSegments){
        child.geometry.dispose();
        const ms=Array.isArray(child.material)?child.material:[child.material];
        for(const mat of ms){
          if(mat instanceof THREE.MeshBasicMaterial&&mat.map&&mat.map!==shadowTexture)
            mat.map.dispose();
          mat.dispose();
        }
      }
    });
  };
  const clear=()=>{
    for(const visual of visuals){
      scene.remove(visual.group,visual.shadow);
      disposeGroup(visual.group);
      visual.shadow.geometry.dispose();
      (visual.shadow.material as THREE.Material).dispose();
      visual.result?.remove();
      for(const item of visual.hidden){
        if(!item.piece.destroyed)item.piece.visible=item.visible;
      }
    }
    visuals.length=0;
  };
  const setEntries=(next:StaticDiePlacement[])=>{
    if(stopped)return;
    const previous=new Map(visuals.map(visual=>[visual.id,visual]));
    const updated:DieVisual[]=[];
    for(const e of next){
      const old=previous.get(e.id);
      if(old)previous.delete(e.id);
      const reusable=old&&old.sides===e.sides&&old.themeId===e.themeId;
      let visual:DieVisual;
      if(reusable){
        visual=old;
        // The Pixi presentation is reconstructed after selection changes,
        // but the GPU buffers, PBR material and atlas need not be.
        for(const item of old.hidden){
          if(!item.piece.destroyed)item.piece.visible=item.visible;
        }
        const children=e.source?e.piece.children.slice(0,1):e.piece.children;
        visual.hidden=children.map(piece=>({piece:piece as Container,visible:piece.visible}));
        visual.piece=e.piece;
        for(const item of visual.hidden)item.piece.visible=false;
      }else{
        if(old){
          scene.remove(old.group,old.shadow);
          disposeGroup(old.group);
          old.shadow.geometry.dispose();
          (old.shadow.material as THREE.Material).dispose();
          old.result?.remove();
          for(const item of old.hidden){
            if(!item.piece.destroyed)item.piece.visible=item.visible;
          }
        }
        const {group}=createDie3DModel(e.sides,undefined,e.themeId);
        scene.add(group);
        const shadow=new THREE.Mesh(new THREE.CircleGeometry(32,48),
          new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,
            depthWrite:false,opacity:.44}));
        shadow.position.z=.4;scene.add(shadow);
        const children=e.source?e.piece.children.slice(0,1):e.piece.children;
        const hidden=children.map(piece=>({piece:piece as Container,visible:piece.visible}));
        for(const item of hidden)item.piece.visible=false;
        visual={id:e.id,sides:e.sides,themeId:e.themeId,piece:e.piece,
          group,shadow,hidden};
      }
      const q=e.quaternion??[0,0,0,1];
      visual.group.quaternion.set(...q);
      // A selected source's tiny count belongs DIRECTLY on the center of
      // its real 3D die, never in a floating selection/roll panel.
      if(e.source&&(e.quantity??0)>0){
        if(!visual.result){
          visual.result=document.createElement('span');
          host.appendChild(visual.result);
        }
        visual.result.className='sennet-dice-source-count';
        visual.result.textContent=String(e.quantity);
      }else{
        visual.result?.remove();
        visual.result=undefined;
      }
      updated.push(visual);
    }
    for(const orphan of previous.values()){
      scene.remove(orphan.group,orphan.shadow);
      disposeGroup(orphan.group);
      orphan.shadow.geometry.dispose();
      (orphan.shadow.material as THREE.Material).dispose();
      orphan.result?.remove();
      for(const item of orphan.hidden)
        if(!item.piece.destroyed)item.piece.visible=item.visible;
    }
    visuals.splice(0,visuals.length,...updated);
    entries=next;
    entriesRevision++;
  };
  const sync=(force=false)=>{
    if(stopped)return;
    const now=performance.now();
    if(!force&&now-lastFrame<28)return;
    lastFrame=now;
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    if(Math.abs(rect.width-w)>.2||Math.abs(rect.height-h)>.2){
      w=rect.width;h=rect.height;
      renderer.setSize(w,h,false);
      camera.left=-w/2;camera.right=w/2;
      camera.top=h/2;camera.bottom=-h/2;
      camera.position.set(w/2,h/2,1100);camera.lookAt(w/2,h/2,0);
      camera.updateProjectionMatrix();
    }
    // Pixi's stage coordinates are LOGICAL renderer pixels. canvas.width
    // and canvas.height are GPU backing pixels (multiplied by device DPR).
    // Mixing them displaced every die and shrank it on high-DPI displays.
    const logical=pixiSize();
    const transform=diceToCssTransform(w,h,logical.width,logical.height);
    const xScale=transform.x,yScale=transform.y;
    for(let i=0;i<visuals.length;i++){
      const visual=visuals[i],entry=entries[i];
      // Sliding drawers can hide their entire subtree. A child may still
      // report visible=true when an ancestor drawer is tucked under the mat.
      let visible=!visual.piece.destroyed;
      let ancestor:Container|null=visible?visual.piece:null;
      while(ancestor){
        if(!ancestor.visible){visible=false;break;}
        ancestor=ancestor.parent;
      }
      if(!entry||!visible){
        visual.group.visible=false;visual.shadow.visible=false;
        if(visual.result)visual.result.style.display='none';
        continue;
      }
      const p=visual.piece.toGlobal({x:0,y:0});
      const edge=visual.piece.toGlobal({x:1,y:0});
      const scale=Math.hypot(edge.x-p.x,edge.y-p.y)*Math.max(xScale,yScale);
      const x=p.x*xScale,y=p.y*yScale;
      // One unchanging size in physical TABLE units for each tray die;
      // the Pixi camera provides the ONLY view-dependent scaling.
      // The compact rack copy is smaller than a die resting on the board,
      // so two polyhedra fit comfortably in the original narrow drawer.
      const rackScale=entry.source?.62:1;
      const sf=scale*rackScale;
      visual.group.position.set(x,h-y,radiusFor(entry.sides)*sf);
      visual.group.scale.setScalar(sf);
      const opacity=entry.source?1:
        looseDieOpacity(Date.now()-(entry.shownAt??Date.now()),entry.fadeAfterMs??0);
      visual.group.visible=opacity>0;
      // Unlike hiding the whole canvas, material alpha fades only the
      // actual free die and preserves other dice and wooden drawer contents.
      if(opacity>0)visual.group.traverse(object=>{
        if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){
          const materials=Array.isArray(object.material)?object.material:[object.material];
          for(const material of materials){
            let original=materialDefaults.get(material);
            if(!original){
              original={transparent:material.transparent,opacity:material.opacity,
                depthWrite:material.depthWrite};
              materialDefaults.set(material,original);
            }
            material.transparent=original.transparent||opacity<.999;
            material.opacity=original.opacity*opacity;
            material.depthWrite=opacity<.999?false:original.depthWrite;
          }
        }
      });
      visual.shadow.position.set(x,h-y,.4);
      visual.shadow.scale.setScalar(sf);
      (visual.shadow.material as THREE.MeshBasicMaterial).opacity=.44*opacity;
      visual.shadow.visible=opacity>0;
      if(visual.result){
        visual.result.style.display=opacity>0?'block':'none';
        visual.result.style.opacity=String(opacity);
        visual.result.style.left=x+'px';
        visual.result.style.top=y+'px';
        const counterSize=Math.max(10,Math.min(18,15*sf));
        visual.result.style.width=counterSize+'px';
        visual.result.style.height=counterSize+'px';
        visual.result.style.fontSize=Math.max(8,Math.min(11,9.5*sf))+'px';
      }
    }
    renderer.render(scene,camera);
    renderedRevision=entriesRevision;
  };
  const destroy=()=>{
    if(stopped)return;
    stopped=true;clear();shadowTexture.dispose();
    renderer.dispose();renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  const setSourceQuantity=(sides:number,quantity:number)=>{
    const id='source-'+sides;
    const current=entries.find(e=>e.id===id);
    if(!current||current.quantity===quantity)return;
    setEntries(entries.map(e=>e.id===id?{...e,quantity}:e));
    sync(true);
  };
  return {setEntries,sync,setSourceQuantity,
    getRenderedRevision:()=>renderedRevision,destroy};
}
