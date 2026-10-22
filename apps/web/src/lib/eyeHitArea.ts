import {VIEW_BUTTON_CASTLE_OFFSET,VIEW_BUTTON_HIT_RADIUS} from '@sennet/core';

/** Accessible Eye target in playmat-local units.
 * An ordinary 19-unit circle shrinks to only a few pixels at overview zoom.
 * Grow its INVISIBLE interactive rectangle to a minimum 48 × 44 px, with
 * most of the extra width on the LEFT side (away from the Castle button).
 * Never intrude into Castle's existing hitbox on the right.
 * The displayed wooden control and its hold/tap gestures are unchanged. */
export function eyeHitBounds(
  localPixelScale:number,minWidthPx=48,minHeightPx=44
):{x:number;y:number;width:number;height:number}{
  const scale=Number.isFinite(localPixelScale)&&localPixelScale>0
    ?localPixelScale:1;
  const right=VIEW_BUTTON_HIT_RADIUS;
  const left=Math.max(VIEW_BUTTON_HIT_RADIUS,minWidthPx/scale-right);
  const halfHeight=Math.max(VIEW_BUTTON_HIT_RADIUS,minHeightPx/(2*scale));
  // Eye and Castle are 2*VIEW_BUTTON_CASTLE_OFFSET apart.
  // Stop before their original clickable regions can overlap.
  const maxRight=2*VIEW_BUTTON_CASTLE_OFFSET-VIEW_BUTTON_HIT_RADIUS-1;
  const safeRight=Math.min(right,maxRight);
  return {x:-left,y:-halfHeight,width:left+safeRight,height:2*halfHeight};
}
