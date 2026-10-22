/** Bounds of the ACTUALLY VISIBLE Pixi/3D tabletop in its CSS-pixel
 * dice-simulation coordinate system. Right/bottom are exclusive screen edges.
 * Parent overflow clipping and the browser viewport may shrink these walls. */
export interface DiceScreenBounds {left:number;top:number;right:number;bottom:number}
export interface ScreenRect {left:number;top:number;width:number;height:number}
export interface DiceKinematicBody {
  position:{x:number;y:number};
  velocity:{x:number;y:number};
  angularVelocity?:{x:number;y:number;z:number};
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function visibleDiceBounds(
  host:ScreenRect,viewportWidth:number,viewportHeight:number,
  simulationWidth:number,simulationHeight:number,clips:readonly ScreenRect[]=[]
):DiceScreenBounds{
  const w=Math.max(1,simulationWidth),h=Math.max(1,simulationHeight);
  if(!Number.isFinite(host.width)||!Number.isFinite(host.height)||
     host.width<=0||host.height<=0) return {left:0,top:0,right:w,bottom:h};
  let l=Math.max(0,host.left),t=Math.max(0,host.top);
  let r=Math.min(viewportWidth,host.left+host.width);
  let b=Math.min(viewportHeight,host.top+host.height);
  for(const clip of clips){
    l=Math.max(l,clip.left);t=Math.max(t,clip.top);
    r=Math.min(r,clip.left+clip.width);
    b=Math.min(b,clip.top+clip.height);
  }
  if(r<=l||b<=t)return {left:0,top:0,right:w,bottom:h};
  return {
    left:clamp((l-host.left)*w/host.width,0,w),
    right:clamp((r-host.left)*w/host.width,0,w),
    top:clamp((t-host.top)*h/host.height,0,h),
    bottom:clamp((b-host.top)*h/host.height,0,h)
  };
}
/** Resolve the die's ENTIRE bounding sphere against all four screen walls,
 * not just its center. Invoked after each Cannon integration so fast, tall,
 * spinning or high-bouncing dice can never tunnel or fly out of view.
 * World/camera Y points up; bounds here use CSS (downward) coordinates. */
export function containDiceInView(
  body:DiceKinematicBody,screen:DiceScreenBounds,
  radius:number,physicsHeight:number,restitution=.63
):boolean{
  const r=Math.max(0,Number.isFinite(radius)?radius:0);
  const width=Math.max(0,screen.right-screen.left);
  const height=Math.max(0,screen.bottom-screen.top);
  // Tight layouts: center large die rather than oscillate between walls.
  const mx=Math.min(r+1,Math.max(0,width/2));
  const my=Math.min(r+1,Math.max(0,height/2));
  const left=screen.left+mx,right=screen.right-mx;
  const top=physicsHeight-screen.top-my;
  const bottom=physicsHeight-screen.bottom+my;
  const bounce=clamp(restitution,0,1);
  let touched=false;
  if(body.position.x<left){
    body.position.x=left;
    if(body.velocity.x<0)body.velocity.x=-body.velocity.x*bounce;
    touched=true;
  }else if(body.position.x>right){
    body.position.x=right;
    if(body.velocity.x>0)body.velocity.x=-body.velocity.x*bounce;
    touched=true;
  }
  if(body.position.y<bottom){
    body.position.y=bottom;
    if(body.velocity.y<0)body.velocity.y=-body.velocity.y*bounce;
    touched=true;
  }else if(body.position.y>top){
    body.position.y=top;
    if(body.velocity.y>0)body.velocity.y=-body.velocity.y*bounce;
    touched=true;
  }
  if(touched&&body.angularVelocity){
    body.angularVelocity.x*=.96;
    body.angularVelocity.y*=.96;
    body.angularVelocity.z*=.96;
  }
  return touched;
}
/** CSS pixels of each full die (including corners and face numerals).
 * Rotating polyhedra can extend beyond their nominal radius. */
export function safeDiceFootprint(nominalRadius:number,geometrySphereRadius:number):number{
  return Math.max(1,nominalRadius,geometrySphereRadius)*1.15+2;
}
