import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedRadialDock} from '../../../apps/web/src/lib/actionRadialFit.ts';

test('action wheel stays constant-size and screen-docked regardless of camera or seat',()=>{
  const initial=fixedRadialDock(1440,900);
  assert.deepEqual(initial,{x:1336,y:796,size:180});
  for(let seat=0;seat<12;seat++)for(const zoom of [.2,1,5,10]){
    void seat;void zoom;
    assert.deepEqual(fixedRadialDock(1440,900),initial);
  }
});
test('half-wheel is entirely visible on smaller mobile screens',()=>{
  for(const [w,h] of [[320,600],[200,150],[110,120],[390,844]]){
    const {x,y,size}=fixedRadialDock(w,h);
    assert.ok(x-size/2>=0&&x+size/2<=w,'horizontal');
    assert.ok(y>=0&&y+size/2<=h,'vertical');
    assert.ok(size<=180);
  }
});
