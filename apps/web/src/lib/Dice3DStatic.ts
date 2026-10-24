/** Persistent tabletop renderer for the EXACT same Three.js solids used
 * during Cannon throws. Pixi owns hit testing; this canvas owns only visuals.
 * Keeping a single renderer prevents context churn and restores the die's
 * settled quaternion exactly when the throw finishes. */
import * as THREE from 'three';
import {installDiceLighting} from './Dice3DLighting.ts';
import type {Container} from 'pixi.js';
import {createDie3DModel,radiusFor} from './Dice3DGeometry';
import {diceToCssTransform,DICE_SOURCE_RACK_SCALE,DICE_RACK_LABEL_OFFSET} from './diceCoordinates';
import type {DiceThemeId} from './diceThemes';
import {looseDieOpacity} from './diceCoordinates';
import {TCG_MAT_WIDTH} from '@sennet/core';

export interface StaticDiePlacement {
  id:string;
  piece:Container;
  sides:number;
  themeId?:DiceThemeId;
  quaternion?:[number,number,number,number];
  altitude?:number;
  quantity?:number;
  result?:string;
  source?:boolean;
  /** Engraved drawer caption rendered in the same Three layer as its source. */
  caption?:string;
  /** Sources live behind the playmat when their drawer is retracted. */
  drawerClosed?:boolean;
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
  revealPlane?:THREE.Plane;
  result?:HTMLElement;
  caption?:THREE.Sprite;
  hidden:{piece:Container;visible:boolean}[];
}
export interface StaticDice3DRenderer {
  setEntries:(entries:StaticDiePlacement[])=>void;
  sync:(force?:boolean)=>void;
  setSourceQuantity:(sides:number,quantity:number)=>void;
  setEmphasis:(id:string,highlight:boolean)=>void;
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
  // Independent 3D drawer solids respect the moving Pixi playmat edge.
  renderer.localClippingEnabled=true;
  renderer.domElement.className='sennet-static-dice-3d';
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;'+
    'pointer-events:none;z-index:88;display:block';
  host.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  installDiceLighting(scene);
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
  // Captions belong to the very same WebGL scene, clip plane and camera as
  // their dice. No independently sorted Pixi text can float above a closed
  // drawer or lag while the drawer slides.
  const makeCaption=(value:string)=>{
    const text=document.createElement('canvas');
    text.width=192;text.height=72;
    const ctx=text.getContext('2d');
    if(ctx){
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='800 39px Inter,system-ui,sans-serif';
      ctx.shadowColor='rgba(0,0,0,.9)';
      ctx.shadowBlur=8;ctx.shadowOffsetY=4;
      ctx.lineWidth=8;ctx.lineJoin='round';
      ctx.strokeStyle='#0d150f';
      ctx.strokeText(value,96,34);
      ctx.fillStyle='#ffedbe';
      ctx.fillText(value,96,34);
    }
    const texture=new THREE.CanvasTexture(text);
    texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({
      map:texture,transparent:true,depthTest:false,depthWrite:false,
      toneMapped:false
    });
    const sprite=new THREE.Sprite(material);
    sprite.renderOrder=12;
    scene.add(sprite);
    return sprite;
  };
  const disposeCaption=(sprite:THREE.Sprite|undefined)=>{
    if(!sprite)return;
    scene.remove(sprite);
    const material=sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();material.dispose();
  };

  // The tabletop's Three canvas is confined beneath the HTML interface.
  // Hovered dice therefore need an independent, pointer-transparent renderer
  // appended to body. It reuses the actual die geometry/face textures and
  // quaternion, but copies materials to remove the drawer clip plane.
  // Unlike raising a z-index inside .pixi-host, this cannot be occluded by
  // another stacking context (cards, drawers, modals or radial previews).
  type HoverTarget={
    visual:DieVisual;entry:StaticDiePlacement;
    x:number;y:number;scale:number;
  };
  let hoverStage:{
    renderer:THREE.WebGLRenderer;scene:THREE.Scene;
    camera:THREE.OrthographicCamera;
    mesh:THREE.Group|null;from:THREE.Group|null;
  }|null=null;
  const releaseHoverMesh=()=>{
    if(!hoverStage)return;
    const stage=hoverStage;
    const mesh=stage.mesh;
    if(!mesh)return;
    stage.scene.remove(mesh);
    mesh.traverse(obj=>{
      if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments){
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        // Geometry and texture maps are shared with the canonical die.
        // Only materials are unique to the hover copy.
        for(const mat of materials)mat.dispose();
      }
    });
    stage.mesh=null;stage.from=null;
  };
  const hideHoverPreview=()=>{
    if(hoverStage)hoverStage.renderer.domElement.style.display='none';
  };
  const getHoverStage=()=>{
    if(hoverStage)return hoverStage;
    const topRenderer=new THREE.WebGLRenderer({
      alpha:true,antialias:true,powerPreference:'low-power',
      premultipliedAlpha:false
    });
    topRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
    topRenderer.setClearColor(0,0);
    topRenderer.domElement.className='sennet-dice-hover-top-layer';
    topRenderer.domElement.style.cssText=[
      'position:fixed','left:0','top:0','width:128px','height:128px',
      'z-index:2147483647','pointer-events:none','user-select:none',
      'display:none','filter:drop-shadow(0 8px 12px #000d)'
    ].join(';');
    document.body.appendChild(topRenderer.domElement);
    const topScene=new THREE.Scene();
    installDiceLighting(topScene);
    const topCamera=new THREE.OrthographicCamera(-64,64,64,-64,.1,1800);
    topCamera.position.set(0,0,1100);
    topCamera.lookAt(0,0,0);
    hoverStage={renderer:topRenderer,scene:topScene,camera:topCamera,
      mesh:null,from:null};
    return hoverStage;
  };
  const drawHoverPreview=(target:HoverTarget|null,rect:DOMRect)=>{
    if(!target){hideHoverPreview();return;}
    const stage=getHoverStage();
    if(stage.from!==target.visual.group||!stage.mesh){
      releaseHoverMesh();
      const copied=target.visual.group.clone(true);
      copied.traverse(obj=>{
        if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments){
          const cloneMaterial=(mat:THREE.Material)=>{
            const cloned=mat.clone();
            cloned.clippingPlanes=[];
            return cloned;
          };
          obj.material=Array.isArray(obj.material)
            ?obj.material.map(cloneMaterial):cloneMaterial(obj.material);
        }
      });
      stage.mesh=copied;
      stage.from=target.visual.group;
      stage.scene.add(copied);
    }
    const zoomScale=target.scale*3;
    const visualRadius=(radiusFor(target.entry.sides)+6)*zoomScale;
    // Allow the 3x model enough transparent room for corner-to-corner
    // rotation. At extraordinary camera zooms, cap framebuffer allocation.
    const diameter=Math.round(Math.min(720,Math.max(112,visualRadius*2)));
    const fittedScale=Math.min(zoomScale,
      (diameter/2-8)/(radiusFor(target.entry.sides)+4));
    const {renderer:topRenderer,camera:topCamera,mesh}=stage;
    if(!mesh)return;
    topRenderer.setSize(diameter,diameter,false);
    topCamera.left=-diameter/2;topCamera.right=diameter/2;
    topCamera.top=diameter/2;topCamera.bottom=-diameter/2;
    topCamera.updateProjectionMatrix();
    mesh.quaternion.copy(target.visual.group.quaternion);
    mesh.position.set(0,0,(target.entry.altitude??radiusFor(target.entry.sides))*fittedScale);
    mesh.scale.setScalar(fittedScale);
    const element=topRenderer.domElement;
    element.style.left=(rect.left+target.x-diameter/2)+'px';
    element.style.top=(rect.top+target.y-diameter/2)+'px';
    element.style.display='block';
    topRenderer.render(stage.scene,topCamera);
  };
  const destroyHoverPreview=()=>{
    releaseHoverMesh();
    if(!hoverStage)return;
    hoverStage.renderer.dispose();
    hoverStage.renderer.forceContextLoss();
    hoverStage.renderer.domElement.remove();
    hoverStage=null;
  };

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
      disposeCaption(visual.caption);
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
    // A refreshed table can dispose a model backing the magnified preview.
    // Rebind the top-layer copy to the new source on the next sync.
    releaseHoverMesh();
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
        const children=e.source?e.piece.children.slice(0,2):e.piece.children;
        visual.hidden=children.map(piece=>({piece:piece as Container,visible:piece.visible}));
        visual.piece=e.piece;
        for(const item of visual.hidden)item.piece.visible=false;
      }else{
        if(old){
          scene.remove(old.group,old.shadow);
          disposeCaption(old.caption);
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
        const children=e.source?e.piece.children.slice(0,2):e.piece.children;
        const hidden=children.map(piece=>({piece:piece as Container,visible:piece.visible}));
        for(const item of hidden)item.piece.visible=false;
        visual={id:e.id,sides:e.sides,themeId:e.themeId,piece:e.piece,
          group,shadow,hidden};
      }
      if(e.source){
        // Each mesh and its shadow share a plane updated with the drawer.
        // Unlike a visibility toggle this progressively clips the geometry.
        const plane=visual.revealPlane??new THREE.Plane();
        visual.revealPlane=plane;
        visual.group.traverse(part=>{
          if(part instanceof THREE.Mesh||part instanceof THREE.LineSegments){
            const materials=Array.isArray(part.material)?part.material:[part.material];
            for(const material of materials)material.clippingPlanes=[plane];
          }
        });
        (visual.shadow.material as THREE.Material).clippingPlanes=[plane];
        if(e.caption&&!visual.caption)visual.caption=makeCaption(e.caption);
        if(visual.caption){
          (visual.caption.material as THREE.SpriteMaterial).clippingPlanes=[plane];
        }
      }else if(visual.caption){
        disposeCaption(visual.caption);visual.caption=undefined;
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
        visual.result.textContent='×'+String(e.quantity);
      }else{
        visual.result?.remove();
        visual.result=undefined;
      }
      updated.push(visual);
    }
    for(const orphan of previous.values()){
      scene.remove(orphan.group,orphan.shadow);
      disposeCaption(orphan.caption);
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
  const emphasized=new Set<string>();
  let activeHoverId:string|null=null;
  const sync=(force=false)=>{
    if(stopped)return;
    const now=performance.now();
    if(!force&&now-lastFrame<14)return;
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
    let hoverTarget:HoverTarget|null=null;
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
      if(!entry||!visible||entry.drawerClosed){
        visual.group.visible=false;visual.shadow.visible=false;
        if(visual.caption)visual.caption.visible=false;
        if(visual.result)visual.result.style.display='none';
        continue;
      }
      const p=visual.piece.toGlobal({x:0,y:0});
      const edge=visual.piece.toGlobal({x:1,y:0});
      const scale=Math.hypot(edge.x-p.x,edge.y-p.y)*Math.max(xScale,yScale);
      const x=p.x*xScale,y=p.y*yScale;
      let exposed=true;
      if(entry.source&&visual.revealPlane){
        const playmat=visual.piece.parent?.parent;
        if(playmat){
          // Three uses upward-positive Y, whereas Pixi points down.
          // Compute the plane from the mat's actual camera transform.
          const pivot=playmat.toGlobal({x:TCG_MAT_WIDTH/2+4,y:0});
          const outward=playmat.toGlobal({x:TCG_MAT_WIDTH/2+5,y:0});
          const normal=new THREE.Vector3(
            (outward.x-pivot.x)*xScale,(pivot.y-outward.y)*yScale,0
          ).normalize();
          const edgePoint=new THREE.Vector3(pivot.x*xScale,h-pivot.y*yScale,0);
          visual.revealPlane.setFromNormalAndCoplanarPoint(normal,edgePoint);
          exposed=normal.dot(new THREE.Vector3(x,h-y,0).sub(edgePoint))>0;
        }
      }
      // Source dice match the right-drawer coins; Pixi fallbacks, hit
      // targets and 3D meshes all use the same scale at any camera zoom.
      const rackScale=entry.source?DICE_SOURCE_RACK_SCALE:1;
      // Keep the canonical die at normal size. Only its top-level hover
      // clone becomes 3x; the drawer label remains fixed to the source.
      const sf=scale*rackScale;
      // A die's resting height is the support point of its actual convex
      // hull, not its bounding-sphere radius. Keep the height sampled from
      // the final Cannon frame to prevent the last-frame vertical jump.
      visual.group.position.set(x,h-y,(entry.altitude??radiusFor(entry.sides))*sf);
      visual.group.scale.setScalar(sf);
      if(visual.caption){
        const captionAt=visual.piece.toGlobal({x:0,y:DICE_RACK_LABEL_OFFSET});
        visual.caption.position.set(captionAt.x*xScale,h-captionAt.y*yScale,1.2);
        // No hover zoom: the caption stays on its original drawer baseline.
        visual.caption.scale.set(42*scale,15*scale,1);
        visual.caption.visible=true;
      }
      const opacity=entry.source?1:
        looseDieOpacity(Date.now()-(entry.shownAt??Date.now()),entry.fadeAfterMs??0);
      visual.group.visible=opacity>0;
      if(visual.caption)visual.caption.visible=opacity>0;
      if(entry.id===activeHoverId&&opacity>0&&exposed){
        hoverTarget={visual,entry,x,y,scale:sf};
      }
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
        visual.result.style.display=opacity>0&&(!entry.source||exposed)?'flex':'none';
        visual.result.style.opacity=String(opacity);
        // Contrast-rich ×N marker floats above-right of the mesh instead
        // of obscuring its number and follows source scaling/camera zoom.
        visual.result.style.left=x+12*sf+'px';
        visual.result.style.top=y-14*sf+'px';
        const counterSize=Math.max(19,Math.min(27,24*sf));
        visual.result.style.width=counterSize+'px';
        visual.result.style.height=Math.max(16,Math.min(21,18*sf))+'px';
        visual.result.style.fontSize=Math.max(10,Math.min(13,11*sf))+'px';
      }
    }
    renderer.render(scene,camera);
    drawHoverPreview(hoverTarget,rect);
    renderedRevision=entriesRevision;
  };
  const destroy=()=>{
    if(stopped)return;
    stopped=true;destroyHoverPreview();clear();shadowTexture.dispose();
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
  const setEmphasis=(id:string,highlight:boolean)=>{
    if(highlight){
      emphasized.delete(id);
      emphasized.add(id);
      activeHoverId=id;
    }else{
      emphasized.delete(id);
      if(activeHoverId===id)activeHoverId=[...emphasized].pop()??null;
    }
    sync(true);
  };
  return {setEntries,sync,setSourceQuantity,setEmphasis,
    getRenderedRevision:()=>renderedRevision,destroy};
}
