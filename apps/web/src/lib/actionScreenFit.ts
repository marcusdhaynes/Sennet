/** Layout the action LCD using actual, projected tabletop edges.
 * Width is deliberately NEVER clamped: its left edge must coincide with the
 * playmat and its right edge must meet the radial wheel, at any camera zoom.
 * The wheel's x is its center and diameter is its full SVG width (the
 * docked half-wheel still uses that complete horizontal diameter).
 */
export function fitActionScreenToWheel(
  matEdgeLeftX:number,
  matEdgeRightX:number,
  radialCenterX:number,
  radialDiameter:number,
  topY:number,
  cameraScale:number
):{left:number;y:number;width:number;heightScale:number;visible:boolean}{
  const left=Math.min(matEdgeLeftX,matEdgeRightX);
  const right=radialCenterX-radialDiameter/2;
  const width=right-left;
  const valid=[left,right,width,topY,cameraScale].every(Number.isFinite);
  return {left,y:topY,width:valid?Math.max(0,width):0,
    heightScale:cameraScale,
    visible:valid&&width>0&&cameraScale>0};
}
