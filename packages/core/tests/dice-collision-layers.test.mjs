import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import {DIE_COLLISION_LAYER,SCREEN_BOUNDARY_LAYER}
  from '../../../apps/web/src/lib/Dice3D.ts';

const die=(x,y,z,vx=0)=>{
  const b=new CANNON.Body({mass:1,
    collisionFilterGroup:DIE_COLLISION_LAYER,
    collisionFilterMask:SCREEN_BOUNDARY_LAYER,
    shape:new CANNON.Sphere(5)});
  b.position.set(x,y,z);b.velocity.set(vx,0,0);
  return b;
};
const boundary=(shape,x=0,y=0,z=0)=>{
  const b=new CANNON.Body({mass:0,shape,
    collisionFilterGroup:SCREEN_BOUNDARY_LAYER,
    collisionFilterMask:DIE_COLLISION_LAYER});
  b.position.set(x,y,z);return b;
};
test('dice pass straight through other dice without imparting any impulse',()=>{
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,0)});
  const a=die(0,0,40,60),b=die(40,0,40,-60);
  world.addBody(a);world.addBody(b);
  for(let i=0;i<50;i++)world.step(1/120);
  assert.ok(a.position.x>b.position.x,'dice must pass one another');
  assert.ok(a.velocity.x>0&&b.velocity.x<0,'no die-to-die impulse may reverse velocity');
});
test('a screen wall still physically blocks and reflects thrown dice',()=>{
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,0)});
  const wall=boundary(new CANNON.Box(new CANNON.Vec3(1,100,100)),40,0,40);
  const a=die(0,0,40,130);
  world.addBody(wall);world.addBody(a);
  for(let i=0;i<90;i++)world.step(1/120);
  assert.ok(a.position.x<=35.5,'die cannot pass screen wall');
  assert.ok(a.velocity.x<0,'wall must reverse outward velocity');
});
test('supporting floor remains solid so dice settle and display a rolled face',()=>{
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,-98)});
  const floor=boundary(new CANNON.Plane());
  const a=die(0,0,35);
  world.addBody(floor);world.addBody(a);
  for(let i=0;i<300;i++)world.step(1/120);
  assert.ok(a.position.z>=4.7,'die must not fall through floor');
  assert.ok(a.position.z<=6,'die must land on supporting floor');
});
