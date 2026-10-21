/** Screen-space tabletop dice physics: gravity, friction, walls, tray rims and pairwise collisions.
 * A fixed 1/60-second integration step gives repeatable trajectories at any refresh rate. */
export interface DiceBody {
  x:number;y:number;vx:number;vy:number;
  z:number;vz:number;angle:number;spin:number;
  radius:number;mass:number;leftTrayExited:boolean;fixed?:boolean;
}
export interface CollisionRect {left:number;top:number;right:number;bottom:number}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function stepDicePhysics(bodies:DiceBody[],dt:number,width:number,height:number,
  trays:readonly CollisionRect[]):void {
  const step=clamp(dt,0,1/30),margin=2;
  for(const b of bodies){
    if(b.fixed)continue;
    const beforeX=b.x,beforeY=b.y;
    b.x+=b.vx*step;b.y+=b.vy*step;
    b.z+=b.vz*step;b.vz-=1020*step;
    if(b.z<0){
      b.z=0;
      if(b.vz<0)b.vz=Math.abs(b.vz)>.95*100?-b.vz*.32:0;
      b.vx*=.82;b.vy*=.82;b.spin*=.78;
    }
    const drag=Math.exp(-(b.z>0?1.55:3.0)*step);
    b.vx*=drag;b.vy*=drag;b.spin*=Math.exp(-2.6*step);
    b.angle+=b.spin*step;
    if(b.x<b.radius+margin){b.x=b.radius+margin;b.vx=Math.abs(b.vx)*.67;b.spin*=-.84;}
    if(b.x>width-b.radius-margin){b.x=width-b.radius-margin;b.vx=-Math.abs(b.vx)*.67;b.spin*=-.84;}
    if(b.y<b.radius+margin){b.y=b.radius+margin;b.vy=Math.abs(b.vy)*.67;b.spin*=-.84;}
    if(b.y>height-b.radius-margin){b.y=height-b.radius-margin;b.vy=-Math.abs(b.vy)*.67;b.spin*=-.84;}
    for(let j=0;j<trays.length;j++){
      const t=trays[j];
      if(!b.leftTrayExited&&j===0){
        if(b.x<t.left-b.radius||b.x>t.right+b.radius||
           b.y<t.top-b.radius||b.y>t.bottom+b.radius)b.leftTrayExited=true;
        else continue;
      }
      const cx=clamp(b.x,t.left,t.right),cy=clamp(b.y,t.top,t.bottom);
      let nx=b.x-cx,ny=b.y-cy,d=Math.hypot(nx,ny);
      if(d>=b.radius)continue;
      // The normal is determined by the side of the rim approached on
      // the PREVIOUS frame. Otherwise a fast die briefly penetrating a tray
      // can be pushed farther inside instead of bouncing outward.
      if(beforeX<=t.left&&b.x>beforeX&&beforeY>=t.top-b.radius&&beforeY<=t.bottom+b.radius){
        nx=-1;ny=0;d=t.left-b.x;
      }else if(beforeX>=t.right&&b.x<beforeX&&beforeY>=t.top-b.radius&&beforeY<=t.bottom+b.radius){
        nx=1;ny=0;d=b.x-t.right;
      }else if(beforeY<=t.top&&b.y>beforeY&&beforeX>=t.left-b.radius&&beforeX<=t.right+b.radius){
        nx=0;ny=-1;d=t.top-b.y;
      }else if(beforeY>=t.bottom&&b.y<beforeY&&beforeX>=t.left-b.radius&&beforeX<=t.right+b.radius){
        nx=0;ny=1;d=b.y-t.bottom;
      }else if(d<1e-5){
        const edges=[Math.abs(b.x-t.left),Math.abs(t.right-b.x),
          Math.abs(b.y-t.top),Math.abs(t.bottom-b.y)];
        const edge=edges.indexOf(Math.min(...edges));
        nx=edge===0?-1:edge===1?1:0;
        ny=edge===2?-1:edge===3?1:0;
        d=0;
      }else{nx/=d;ny/=d;}
      const adjust=b.radius-d+0.5;
      b.x+=nx*adjust;b.y+=ny*adjust;
      const normal=b.vx*nx+b.vy*ny;
      if(normal<0){
        b.vx-=1.72*normal*nx;b.vy-=1.72*normal*ny;
        b.spin+=normal*.012;
        b.vz=Math.max(b.vz,85);
      }
    }
  }
  // Collision impulse with mass weighting, resolving penetration before
  // integrating the following frame. One physical body per die type.
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    const a=bodies[i],b=bodies[j];
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    const target=a.radius+b.radius;
    if(d>=target||Math.abs(a.z-b.z)>24||a.fixed&&b.fixed)continue;
    const nx=d>1e-5?dx/d:1,ny=d>1e-5?dy/d:0;
    const invA=a.fixed?0:1/a.mass,invB=b.fixed?0:1/b.mass,sum=invA+invB;
    if(sum<=0)continue;
    const penetration=(target-d+0.3)/sum;
    a.x-=nx*penetration*invA;a.y-=ny*penetration*invA;
    b.x+=nx*penetration*invB;b.y+=ny*penetration*invB;
    const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(relative>=0)continue;
    const impulse=-(1+.64)*relative/sum;
    a.vx-=impulse*invA*nx;a.vy-=impulse*invA*ny;
    b.vx+=impulse*invB*nx;b.vy+=impulse*invB*ny;
    a.spin-=relative*.008;b.spin+=relative*.008;
  }
}
export function throwVelocity(deltaX:number,deltaY:number,elapsedMs:number){
  const distance=Math.hypot(deltaX,deltaY);
  const duration=Math.max(.07,Math.min(.8,elapsedMs/1000));
  const speed=clamp(distance/(duration+.18)*1.4,180,1120);
  const dx=distance>0?deltaX/distance:1;
  const dy=distance>0?deltaY/distance:-.24;
  return {x:dx*speed,y:dy*speed,speed};
}
