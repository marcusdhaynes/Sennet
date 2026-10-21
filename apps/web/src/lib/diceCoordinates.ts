/** The static Three.js die overlay lives in CSS pixels, while Pixi's
 * toGlobal() reports *logical* renderer pixels. The HTML canvas's width
 * attribute is its DPR-scaled GPU backing size and MUST NOT be used here. */
export function diceToCssTransform(
  cssWidth:number,cssHeight:number,pixiWidth:number,pixiHeight:number
):{x:number;y:number}{
  if(!Number.isFinite(cssWidth)||!Number.isFinite(cssHeight)||
    !Number.isFinite(pixiWidth)||!Number.isFinite(pixiHeight)||
    cssWidth<=0||cssHeight<=0||pixiWidth<=0||pixiHeight<=0)
    return {x:1,y:1};
  return {x:cssWidth/pixiWidth,y:cssHeight/pixiHeight};
}
export function diceRackLocations(
  boxX:number,top:number
):{x:number;y:number}[]{
  // The narrow side drawer is 62 units wide. Keep centers 24 units
  // apart; the shared real-3D rack meshes have a 0.62 footprint.
  return Array.from({length:8},(_,i)=>({
    x:boxX+(i%2===0?-12:12),
    y:top+41+Math.floor(i/2)*62
  }));
}
