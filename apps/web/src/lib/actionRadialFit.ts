import {CONTROL_PIXELS} from './controlPixels.ts';
/** Keep the EXPANDED action radial inside the screen even when the
 * playmat is enlarged by 1v1 or Castle camera framing. The docked radial
 * is a semicircle (180 × 90 logical px) originating at the hand edge. */
export function fitDockedRadial(
  x:number,y:number,diameter:number,
  viewportWidth:number,viewportHeight:number,padding=8
):{x:number;y:number;size:number}{
  const w=Math.max(1,viewportWidth),h=Math.max(1,viewportHeight);
  const availableW=Math.max(1,w-2*padding);
  const availableH=Math.max(1,h-2*padding);
  // Fit the entire width and half-wheel height, not merely its center.
  const size=Math.max(1,Math.min(Math.max(1,diameter),availableW,availableH*2));
  const radius=size/2,halfHeight=size/2;
  const cx=Math.max(padding+radius,Math.min(w-padding-radius,x));
  const cy=Math.max(padding,Math.min(h-padding-halfHeight,y));
  return {x:cx,y:cy,size};
}

/** Project the mat anchor while keeping the approved CSS pixel diameter. */
export function fitMatAttachedRadial(
  handCenterX:number,handBottomY:number,_visibleMatWidth:number,
  _viewportWidth:number,_viewportHeight:number
):{x:number;y:number;size:number}{
  const diameter=CONTROL_PIXELS.radial;
  // Always stay physically attached to the playmat, regardless of viewport edges.
  return {x:handCenterX,y:handBottomY,size:diameter};
}

/** Fit the REAL occupied silhouette of a focused player mat, including
 * top control circles, the complete lower semicircular action radial and
 * the action screen. Optionally reserve bottom viewport space for a
 * player-facing Arena-style held hand.
 *
 * The returned offset is the mat center's displacement from screen center.
 * Calculating this from the asymmetric extremities prevents the radial
 * bottom being cropped even at the largest fitting camera zoom.
 */
export function fitSelfMatWithHud(
  viewportWidth:number,viewportHeight:number,
  matWidth:number,matHeight:number,completeMatWidth:number,
  topControlReach:number,lcdReach:number,heldHandPixels=0,padding=12
):{scale:number;offsetY:number;radialBottom:number}{
  const w=Math.max(1,viewportWidth),h=Math.max(1,viewportHeight);
  const reserve=Math.max(0,Math.min(h*.65,heldHandPixels));
  const top=Math.max(0,topControlReach);
  const fixedDepth=CONTROL_PIXELS.radial/2;
  const usableH=Math.max(1,h-reserve-padding*2);
  const usableW=Math.max(1,w-padding*2);
  const silhouette=matHeight+top;
  const scale=Math.min(usableW/Math.max(1,completeMatWidth),
    Math.max(1,usableH-fixedDepth)/Math.max(1,silhouette),
    usableH/Math.max(1,silhouette+lcdReach));
  const bottom=Math.max(fixedDepth/scale,lcdReach);
  // The mat occupies the center of the free viewport (above the held hand).
  // The radial extends farther below the mat than the Eye extends above.
  const offsetY=(top-bottom)*scale/2-reserve/2;
  return {scale,offsetY,radialBottom:bottom};
}

/** Map a docked radial SVG viewBox to a body-level hover preview.
 * The HALF wheel's viewBox begins at y=200, so applying a bare
 * getScreenCTM() or the SVG element's top as y=0 displaces its artwork.
 * These values are CSS viewport pixels, independent of camera transforms. */
export function radialHoverMatrix(
  rect:{left:number;top:number;width:number;height:number},
  half:boolean
):{a:number;d:number;e:number;f:number}{
  const a=rect.width/400;
  const d=rect.height/(half?200:400);
  return {a,d,e:rect.left,f:rect.top-(half?200*d:0)};
}

/** Maximum initial Eye/Castle magnification that leaves the entire
 * MAT-ATTACHED bottom semicircle visible. Never moves the wheel itself.
 *
 * Eye places the player's center one half-mat below the divider.
 * Castle places the viewer one quarter viewport below the divider.
 * Both are zoomed about the viewport center, so we solve for the exact
 * lower extent rather than applying an arbitrary 80% fudge factor. */
export function fitBattleRadialZoom(
  baseScale:number,height:number,matWidth:number,matHeight:number,
  mode:'eye'|'castle',padding=14
):number{
  if(![baseScale,height,matWidth,matHeight].every(Number.isFinite)||
    baseScale<=0||height<=0||matWidth<=0||matHeight<=0)return Math.max(0,baseScale)||1;
  const radius=CONTROL_PIXELS.radial/2;
  const eyeBottomDistance=baseScale*(matHeight+22);
  const castleBottomDistance=height/4+baseScale*matHeight/2;
  const distance=mode==='castle'?castleBottomDistance:eyeBottomDistance;
  const room=Math.max(1,height/2-padding-radius);
  return baseScale*Math.min(1,room/Math.max(1,distance));
}

/** Small circular controls match the approved screenshot, in CSS pixels. */
export const EYE_CONTROL_DIAMETER_PX=CONTROL_PIXELS.circle;
export const WOODEN_CONTROL_WORLD_DIAMETER=34;
/** Screen-fixed visual scaling. The target is the
 * approved screenshot. */
export function fixedMatControlScale(pxPerWorldUnit:number,targetPixels=EYE_CONTROL_DIAMETER_PX):number{
  const pixels=Number.isFinite(targetPixels)&&targetPixels>0
    ?targetPixels:EYE_CONTROL_DIAMETER_PX;
  return Number.isFinite(pxPerWorldUnit)&&pxPerWorldUnit>0
    ?pixels/(WOODEN_CONTROL_WORLD_DIAMETER*pxPerWorldUnit)
    :pixels/WOODEN_CONTROL_WORLD_DIAMETER;
}
