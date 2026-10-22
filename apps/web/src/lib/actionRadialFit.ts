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

/** Fixed-size, lower-right half-wheel HUD. Neither tabletop camera zoom nor
 * seat-specific projected mat coordinates appear in this calculation.
 * The entire 180px semicircle is visible except on exceptionally small
 * viewports, where it scales uniformly to fit. */
export function fixedRadialDock(width:number,height:number,padding=14):
  {x:number;y:number;size:number}{
  const w=Math.max(1,width),h=Math.max(1,height);
  const safe=Math.max(0,Math.min(padding,w/4,h/4));
  const size=Math.max(1,Math.min(180,w-2*safe,2*(h-2*safe)));
  return {x:w-safe-size/2,y:h-safe-size/2,size};
}
