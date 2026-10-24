import test from 'node:test';
import assert from 'node:assert/strict';
import {fitMatAttachedRadial} from '../../../apps/web/src/lib/actionRadialFit.ts';

test('radial attaches to HAND bottom midpoint at constant CSS pixel size',()=>{
  const fit=fitMatAttachedRadial(420,580,600,1200,800);
  assert.deepEqual(fit,{x:420,y:580,size:180});
});
test('radial follows the playmat as camera pans, unlike a fixed corner HUD',()=>{
  const first=fitMatAttachedRadial(320,380,300,1200,800);
  const second=fitMatAttachedRadial(500,560,300,1200,800);
  assert.deepEqual(first,{x:320,y:380,size:180});
  assert.deepEqual(second,{x:500,y:560,size:180});
});
test('radial ignores zoomed/castle transformed mat width',()=>{
  const close=fitMatAttachedRadial(400,400,200,1200,800);
  const zoomed=fitMatAttachedRadial(400,400,400,1200,800);
  assert.equal(close.size,180);
  assert.equal(zoomed.size,180);
});
test('radial stays physically anchored even in a tight viewport',()=>{
  const fit=fitMatAttachedRadial(600,800,800,600,640);
  assert.equal(fit.x,600);
  assert.equal(fit.y,800);
  assert.equal(fit.size,180);
});

// Camera position, viewport and nested Castle seat transforms cannot change
// the wheel's rendered CSS dimensions.
test('radial pixel dimensions are invariant across the full camera range',()=>{
  for(const zoom of [.12,.25,1,2,8,30,48]){
    for(const seatScale of [.04,.2,1,3]){
      for(const [width,height] of [[390,740],[1440,900],[2560,1440]]){
        const fit=fitMatAttachedRadial(20*zoom,30*zoom,628*zoom*seatScale,width,height);
        assert.equal(fit.size,180);
        assert.equal(fit.x,20*zoom);
        assert.equal(fit.y,30*zoom);
      }
    }
  }
});
