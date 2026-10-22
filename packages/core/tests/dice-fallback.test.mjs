import test from 'node:test';
import assert from 'node:assert/strict';
import {fairFace,fallbackDiceResults} from '../../../apps/web/src/lib/diceFallback.ts';

test('graphics failure rolls all selected denominations with valid faces',()=>{
  const results=fallbackDiceResults([
    {sides:2,quantity:3,x:310,y:220},
    {sides:6,quantity:5,x:340,y:220},
    {sides:20,quantity:1,x:375,y:220},
    {sides:100,quantity:2,x:400,y:220}
  ],800,500,-250,120);
  assert.deepEqual(results.map(r=>r.rolls.length),[3,5,1,2]);
  for(const result of results){
    assert.ok(result.rolls.every(v=>Number.isInteger(v)&&v>=1&&v<=result.sides));
    assert.ok(result.x>=0&&result.x<=800);
    assert.ok(result.y>=0&&result.y<=500);
    assert.deepEqual(result.quaternion,[0,0,0,1]);
    assert.equal(result.altitude,0);
  }
});
test('fallback stays within tiny viewports and accepts zero-length aim',()=>{
  for(const [w,h] of [[100,100],[300,600],[1400,800]]){
    const res=fallbackDiceResults([{sides:6,quantity:1,x:w,y:h}],w,h,0,0);
    assert.ok(res[0].x>=0&&res[0].x<=w);
    assert.ok(res[0].y>=0&&res[0].y<=h);
  }
});
test('fallback face sampling never goes outside legal dice faces',()=>{
  for(const sides of [2,4,6,8,10,12,20,100])
    for(let i=0;i<150;i++){
      const value=fairFace(sides);
      assert.ok(value>=1&&value<=sides);
    }
});
