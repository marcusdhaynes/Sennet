import test from 'node:test';
import assert from 'node:assert/strict';
import {measureDieRelease,dieLaunchVelocity}
  from '../../../apps/web/src/lib/diceThrowEngine.ts';
import {containDiceInView}
  from '../../../apps/web/src/lib/diceScreenWalls.ts';

const directions=[
  ['right',1,0],['left',-1,0],['down',0,1],['up',0,-1],
  ['down-right',1,1],['down-left',-1,1],
  ['up-right',1,-1],['up-left',-1,-1]
];
for(const [name,x,y] of directions){
  test('launch trajectory follows actual '+name+' flick',()=>{
    const samples=[
      {x:300,y:240,t:100},{x:300+x*8,y:240+y*8,t:120},
      {x:300+x*18,y:240+y*18,t:142},
      {x:300+x*31,y:240+y*31,t:162}
    ];
    const release={x:300+x*34,y:240+y*34};
    const g=measureDieRelease(samples,release,168);
    assert.equal(g.flick,true);
    assert.ok(g.dx*x+g.dy*y>0,'gesture must match release direction');
    const v=dieLaunchVelocity(g.dx,g.dy,g.durationMs,false);
    assert.ok(v.x*x-v.y*y>0,'world velocity must match CSS flick direction');
    assert.ok(Math.abs(v.x)>0||Math.abs(v.y)>0);
    assert.ok(v.z>0);
  });
}
test('last meaningful movement wins if hand reverses direction',()=>{
  const samples=[
    {x:120,y:80,t:0},{x:90,y:80,t:36},
    {x:115,y:80,t:69},{x:140,y:80,t:96}
  ];
  const g=measureDieRelease(samples,{x:146,y:80},101);
  assert.ok(g.flick);
  assert.ok(g.dx>0,'must throw right, not use old drag left');
});
test('stopping and holding over the die is a vertical drop',()=>{
  const samples=[{x:30,y:30,t:0},{x:100,y:30,t:45}];
  assert.equal(measureDieRelease(samples,{x:100,y:30},300).flick,false);
  assert.deepEqual(dieLaunchVelocity(500,-100,25,true),
    {x:0,y:0,z:0,spinX:0,spinY:0,spinZ:0});
});
test('tiny last-second tremor cannot reverse meaningful flick',()=>{
  const samples=[
    {x:100,y:100,t:0},{x:117,y:100,t:20},
    {x:139,y:100,t:38},{x:138.8,y:100,t:40}
  ];
  const g=measureDieRelease(samples,{x:138.8,y:100},43);
  assert.ok(g.flick);
  assert.ok(g.dx>0);
});
test('clamping launch position BEFORE applying velocity preserves throw heading',()=>{
  const screen={left:0,right:640,top:0,bottom:480};
  for(const [name,x,y] of directions){
    const body={position:{x:x<0?2:x>0?638:320,
      y:y<0?2:y>0?478:240},velocity:{x:0,y:0}};
    containDiceInView(body,screen,32,480);
    const v=dieLaunchVelocity(x*35,y*35,50,false);
    body.velocity.x=v.x;body.velocity.y=v.y;
    assert.ok(body.velocity.x*x-body.velocity.y*y>0,name+' reversed at launch');
  }
});
