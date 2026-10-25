/** One authoritative throw-direction pipeline, shared by drawer dice and rerolls.
 * Pointer and simulation input are CSS pixels with positive Y downward.
 * The physics engine converts only the Y velocity to its positive-up axis. */
export interface DiePointerSample {x:number;y:number;t:number}
export interface DieReleaseGesture {
  dx:number;dy:number;durationMs:number;flick:boolean;
}
const finite=(n:number)=>Number.isFinite(n);
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

/** Follow the LAST meaningful movement, not the full drag or an arbitrary
 * history timestamp. Once the hand reverses, older opposing samples must
 * not contribute to the launch direction. A stationary release is a drop. */
export function measureDieRelease(
  samples:readonly DiePointerSample[],release:{x:number;y:number},now:number
):DieReleaseGesture{
  const zero:DieReleaseGesture={dx:0,dy:0,durationMs:120,flick:false};
  if(!finite(now)||!finite(release.x)||!finite(release.y))return zero;
  const points=samples.filter(p=>finite(p.x)&&finite(p.y)&&finite(p.t)&&p.t<=now)
    .slice(-40);
  if(!points.length)return zero;
  const last=points[points.length-1];
  // Do not launch on stale momentum after the pointer has stopped.
  if(now-last.t>100)return zero;
  if(Math.hypot(release.x-last.x,release.y-last.y)>.5)
    points.push({x:release.x,y:release.y,t:now});
  let dx=0,dy=0,totalMs=0,lastDirection:{x:number;y:number}|null=null;
  let newestMotionAge=Infinity;
  for(let i=points.length-1;i>0;i--){
    const a=points[i-1],b=points[i];
    const sx=b.x-a.x,sy=b.y-a.y;
    const length=Math.hypot(sx,sy),dt=b.t-a.t;
    if(dt<=0||length<2||now-b.t>100)continue;
    if(!lastDirection){
      lastDirection={x:sx/length,y:sy/length};
      newestMotionAge=now-b.t;
    }else if((sx*lastDirection.x+sy*lastDirection.y)/length<.55){
      // A reversal or sharp turn defines a NEW throw direction.
      break;
    }
    if(now-a.t>115)break;
    dx+=sx;dy+=sy;totalMs+=dt;
    if(totalMs>=85)break;
  }
  const length=Math.hypot(dx,dy);
  const durationMs=clamp(totalMs,16,110);
  const speed=length/durationMs;
  if(!lastDirection||newestMotionAge>85||length<9||speed<.42)return zero;
  return {dx,dy,durationMs,flick:true};
}

export interface DieLaunchVelocity {
  x:number;y:number;z:number;
  spinX:number;spinY:number;spinZ:number;
}
/** Momentum always has a positive dot product with the user's final flick.
 * Random die orientation and collision responses happen AFTER launch, not
 * inside its direction vector. Gentle drops have no horizontal impulse. */
export function dieLaunchVelocity(
  aimX:number,aimY:number,durationMs:number,gentleDrop:boolean
):DieLaunchVelocity{
  const still:DieLaunchVelocity={x:0,y:0,z:0,spinX:0,spinY:0,spinZ:0};
  const length=Math.hypot(aimX,aimY);
  if(gentleDrop||!finite(length)||length<.5)return still;
  const speed=clamp(length/Math.max(.035,Math.min(.24,durationMs/1000))*1.08,180,1250);
  const nx=aimX/length,ny=-aimY/length;
  const spin=clamp(speed/46,7,25);
  return {x:nx*speed,y:ny*speed,z:205+speed*.27,
    spinX:ny*spin,spinY:-nx*spin,spinZ:0};
}
