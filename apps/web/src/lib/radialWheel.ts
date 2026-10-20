/** Shared deterministic radial-wheel model. Geometric hit testing uses
 * an upright polar angle: 0° is 12 o'clock, clockwise positive.
 */
export const RADIAL_CATEGORIES=['Position','Scale','Location'] as const;
export type RadialCategory=(typeof RADIAL_CATEGORIES)[number];
export const RADIAL_ACTIONS=[
 [{id:'flip',label:'Flip'}, {id:'rotate-cw',label:'+45° Rotate'}, {id:'rotate-ccw',label:'−45° Rotate'}],
 [{id:'scale-original',label:'Restore Original Size'}, {id:'scale-smaller',label:'Scale 50% Smaller'}, {id:'scale-bigger',label:'Scale 50% Bigger'}],
 [{id:'shuffle',label:'Shuffle'}, {id:'send-to',label:'Send To'}, {id:'lock',label:'Lock / Unlock'}]
] as const;
export type RadialAction=(typeof RADIAL_ACTIONS)[number][number]['id'];
export type RadialHit={ring:'center'|'inner'|'outer'|'outside';category:number|null;action:RadialAction|null};
/** Coordinates are normalized to SVG viewBox 400 centered at (200,200). */
export function radialHit(dx:number,dy:number):RadialHit{
 const r=Math.hypot(dx,dy),angle=((Math.atan2(dx,-dy)*180/Math.PI)+360)%360;
 const category=Math.min(2,Math.floor(angle/120));
 if(r<65)return {ring:'center',category:null,action:null};
 if(r<122)return {ring:'inner',category,action:null};
 if(r<127)return {ring:'outside',category:null,action:null};
 if(r<=195){
  const segment=Math.min(2,Math.floor((angle-category*120)/40));
  return {ring:'outer',category,action:RADIAL_ACTIONS[category][segment].id};
 }
 return {ring:'outside',category:null,action:null};
}
export function wheelPosition(x:number,y:number,w:number,h:number,size:number){
 const radius=size/2,padding=6;
 return {
  x:Math.max(radius+padding,Math.min(Math.max(radius+padding,w-radius-padding),x)),
  y:Math.max(radius+padding,Math.min(Math.max(radius+padding,h-radius-padding),y))
 };
}
export function radialMembership(
 selected:ReadonlySet<string>,pressedId:string,
 stackIds:readonly string[],isSecondHold:boolean
):string[]{
 // First hold ADDS a complete stack; second hold never drops selection.
 if(isSecondHold&&selected.has(pressedId))return [...selected];
 return [...new Set([...selected,...(stackIds.length?stackIds:[pressedId])])];
}
