/** Persistent tabletop renderer for the EXACT same Three.js solids used
 * during Cannon throws. Pixi owns hit testing; this canvas owns only visuals.
 * Keeping a single renderer prevents context churn and restores the die's
 * settled quaternion exactly when the throw finishes. */
import * as THREE from 'three';
import type {Container} from 'pixi.js';
import {createDie3DModel} from './Dice3D';

export interface StaticDiePlacement {
  piece:Container;
  sides:number;
  quaternion?:[number,number,number,number];
  quantity?:number;
  result?:string;
  source?:boolean;
}
interface DieVisual {
  piece:Container;
  group:THREE.Group;
  shadow:THREE.Mesh;
  result?:HTMLElement;
}
export interface StaticDice3DRenderer {
  setEntries:(entries:StaticDiePlacement[])=>void;
  sync:()=>void;
  destroy:()=>void;
}
export function createStaticDice3D(host:HTMLElement,canvas:HTMLCanvasElement):StaticDice3DRenderer{
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
    }
    visuals.length=0;
  };
  const setEntries=(next:StaticDiePlacement[])=>{
    if(stopped)return;
    clear();
    entries=next;
    for(const e of entries){
      const {group}=createDie3DModel(e.sides);
      const q=e.quaternion??[0,0,0,1];
      group.quaternion.set(...q);
      scene.add(group);
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(57,57),
        new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,
          depthWrite:false,opacity:.54}));
      shadow.position.z=.4;scene.add(shadow);
      let result:HTMLSpanElement|undefined;
      // Multiple selected dice retain their physical TOP face and shape.
      // Show the aggregate separately, without a rectangular die replacement.
      if(!e.source&&e.quantity&&e.quantity>1&&e.result){
        result=document.createElement('span');
        result.className='sennet-dice-aggregate';
        result.textContent='Σ '+e.result+'  ×'+e.quantity;
        host.appendChild(result);
      }
      visuals.push({piece:e.piece,group,shadow,result});
    }
  };
  const sync=()=>{
    if(stopped)return;
    const now=performance.now();
    if(now-lastFrame<28)return;
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
    const xScale=w/canvas.width,yScale=h/canvas.height;
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
      const sf=Math.max(.15,Math.min(4,scale));
      visual.group.position.set(x,h-y,24*sf);
      visual.group.scale.setScalar(sf);
      visual.group.visible=true;
      visual.shadow.position.set(x,h-y,1);
      visual.shadow.scale.setScalar(sf);
      visual.shadow.visible=true;
      if(visual.result){
        visual.result.style.display='block';
        visual.result.style.left=x+'px';
        visual.result.style.top=(y+20*sf)+'px';
      }
    }
    renderer.render(scene,camera);
  };
  const destroy=()=>{
    if(stopped)return;
    stopped=true;clear();shadowTexture.dispose();
    renderer.dispose();renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  return {setEntries,sync,destroy};
}
