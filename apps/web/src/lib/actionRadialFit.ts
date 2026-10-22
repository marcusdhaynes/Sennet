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
