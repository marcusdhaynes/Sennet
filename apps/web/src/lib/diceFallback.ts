/** A safe, replayable outcome when 3D rendering is unavailable or loses
 * its GPU context mid-roll. Results are committed as normal THROW_TRAY and
 * REROLL_DIE commands, including the exact sampled faces. */
export interface RollFallbackSource {
  sides:number;quantity:number;x:number;y:number
}
export interface RollFallbackResult {
  sides:number;rolls:number[];x:number;y:number;rotation:number;
  quaternion:[number,number,number,number];altitude:number
}
const between=(n:number,low:number,high:number)=>
  Math.max(low,Math.min(high,n));
/** Generate a uniformly distributed integer, with no modulo bias. */
export function fairFace(sides:number):number{
  const faces=Math.max(2,Math.min(100,Math.trunc(sides)||6));
  if(typeof crypto!=='undefined'&&typeof crypto.getRandomValues==='function'){
    const word=new Uint32Array(1);
    const limit=Math.floor(4294967296/faces)*faces;
    do{crypto.getRandomValues(word);}while(word[0]>=limit);
    return (word[0]%faces)+1;
  }
  return Math.floor(Math.random()*faces)+1;
}
export function fallbackDiceResults(
  sources:readonly RollFallbackSource[],width:number,height:number,
  aimX:number,aimY:number
):RollFallbackResult[]{
  const w=Math.max(80,width||80),h=Math.max(80,height||80);
  const magnitude=Math.hypot(aimX,aimY);
  const vector=magnitude>5?{x:aimX/magnitude,y:aimY/magnitude}:{x:-.9,y:-.35};
  const centerX=w/2,centerY=h/2;
  return sources.map((source,i)=>{
    const sides=Number.isFinite(source.sides)?Math.max(2,Math.min(100,Math.trunc(source.sides))):6;
    const quantity=between(Math.trunc(source.quantity)||1,1,20);
    const throws=Array.from({length:quantity},()=>fairFace(sides));
    // Land inside the visible tabletop, not back inside the closed drawer.
    const offset=(i-(sources.length-1)/2)*45;
    const projectedX=source.x+vector.x*125;
    const projectedY=source.y+vector.y*125;
    const x=between(
      Math.abs(projectedX-centerX)>w*.43?centerX+offset:projectedX+offset,
      28,w-28);
    const y=between(
      Math.abs(projectedY-centerY)>h*.43?centerY+offset*.5:projectedY+offset*.5,
      28,h-28);
    return {sides,rolls:throws,x,y,rotation:0,
      quaternion:[0,0,0,1],altitude:0};
  });
}
