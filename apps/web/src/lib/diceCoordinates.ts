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
/** Dice display at the compact source coin diameter, including flipcoins. */
export const DICE_SOURCE_RACK_SCALE=.902;
export function diceRackLocations(
  boxX:number,top:number
):{x:number;y:number}[]{
  // Two columns, four rows below the coin pair, above the book.
  // 31 units between rows leaves enough room for each 8px label.
  return Array.from({length:8},(_,i)=>({
    x:boxX+(i%2===0?-15:15),
    y:top+85+Math.floor(i/2)*31
  }));
}

/** Loose dice stay visible until their requested lifetime expires, then
 * dissolve over 850ms. Zero disables automatic fading. */
export function looseDieOpacity(elapsedMs:number,fadeAfterMs:number):number {
  if(fadeAfterMs<=0)return 1;
  if(elapsedMs<=fadeAfterMs)return 1;
  return Math.max(0,Math.min(1,1-(elapsedMs-fadeAfterMs)/850));
}
