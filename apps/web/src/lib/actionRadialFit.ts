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

/** The radial is physically attached to the bottom center of the mat.
 * Original diameter: 30% of the on-screen mat width, including any
 * 1v1/Castle seat transform; no fixed corner docking or independent size.
 * Fit only when needed to keep the expanded semicircle visible. */
export function fitMatAttachedRadial(
  handCenterX:number,handBottomY:number,visibleMatWidth:number,
  viewportWidth:number,viewportHeight:number
):{x:number;y:number;size:number}{
  const diameter=Math.max(1,Number.isFinite(visibleMatWidth)?visibleMatWidth*.30:1);
  // Always stay physically attached to the playmat, regardless of viewport edges.
  return {x:handCenterX,y:handBottomY,size:diameter};
}
