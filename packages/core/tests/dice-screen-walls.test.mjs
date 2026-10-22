import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleDiceBounds,containDiceInView,safeDiceFootprint}
  from '../../../apps/web/src/lib/diceScreenWalls.ts';

test('entire game viewport is solid at every browser size',()=>{
  for(const [w,h] of [[390,844],[1280,720],[1920,1080],[230,350]]){
    const limits=visibleDiceBounds({left:0,top:0,width:w,height:h},w,h,w,h);
    assert.deepEqual(limits,{left:0,top:0,right:w,bottom:h});
    for(const [x,y,vx,vy] of [[-200,100,-1200,0],[w+400,250,1200,0],
      [w/2,-180,0,1200],[w/2,h+380,0,-1200]]){
      const body={position:{x,y:h-y},velocity:{x:vx,y:vy},angularVelocity:{x:2,y:4,z:6}};
      assert.equal(containDiceInView(body,limits,19,h),true);
      assert.ok(body.position.x>=19&&body.position.x<=w-19);
      assert.ok(h-body.position.y>=19&&h-body.position.y<=h-19);
      assert.ok(body.velocity.x===0||Math.sign(body.velocity.x)!==Math.sign(vx));
    }
  }
});
test('large dice bounce off right/left without tunneling during powerful throws',()=>{
  const b={position:{x:1000,y:190},velocity:{x:1420,y:300}};
  const bounds={left:0,right:600,top:0,bottom:400};
  for(let i=0;i<70;i++){
    b.position.x+=b.velocity.x/60;b.position.y+=b.velocity.y/60;
    containDiceInView(b,bounds,38,400);
    assert.ok(b.position.x>=39&&b.position.x<=561);
    assert.ok(b.position.y>=39&&b.position.y<=361);
  }
});
test('visible area shrinks with browser viewport and clipped parent',()=>{
  const box={left:-80,top:-20,width:1100,height:800};
  const clipped=visibleDiceBounds(box,900,600,1100,800,
    [{left:20,top:30,width:600,height:530}]);
  assert.deepEqual(clipped,{left:100,top:50,right:700,bottom:580});
  const body={position:{x:900,y:799},velocity:{x:900,y:800}};
  containDiceInView(body,clipped,28,800);
  assert.ok(body.position.x<=671);
  assert.ok(body.position.y<=749);
});
test('rotation-safe footprint is always greater than the visible die body',()=>{
  assert.equal(safeDiceFootprint(14,21),26.15);
  assert.ok(safeDiceFootprint(14,14)>14);
});
test('small screens keep an oversized die centered rather than oscillating',()=>{
  const box={left:0,right:22,top:0,bottom:20};
  const die={position:{x:400,y:-60},velocity:{x:1000,y:-1000}};
  containDiceInView(die,box,30,20);
  assert.equal(die.position.x,11);
  assert.equal(die.position.y,10);
  containDiceInView(die,box,30,20);
  assert.equal(die.position.x,11);
  assert.equal(die.position.y,10);
});
