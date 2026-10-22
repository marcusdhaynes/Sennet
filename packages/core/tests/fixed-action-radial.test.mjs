import test from 'node:test';
import assert from 'node:assert/strict';
import {fitMatAttachedRadial} from '../../../apps/web/src/lib/actionRadialFit.ts';

test('radial attaches to HAND bottom midpoint at original 30% mat size',()=>{
  const fit=fitMatAttachedRadial(420,580,600,1200,800);
  assert.deepEqual(fit,{x:420,y:580,size:180});
});
test('radial follows the playmat as camera pans, unlike a fixed corner HUD',()=>{
  const first=fitMatAttachedRadial(320,380,300,1200,800);
  const second=fitMatAttachedRadial(500,560,300,1200,800);
  assert.deepEqual(first,{x:320,y:380,size:90});
  assert.deepEqual(second,{x:500,y:560,size:90});
});
test('radial uses actual zoomed/castle transformed mat width',()=>{
  const close=fitMatAttachedRadial(400,400,200,1200,800);
  const zoomed=fitMatAttachedRadial(400,400,400,1200,800);
  assert.equal(close.size,60);
  assert.equal(zoomed.size,120);
});
test('expanded semicircle fits fully in a tight viewport',()=>{
  const fit=fitMatAttachedRadial(600,800,800,600,640);
  assert.ok(fit.x-fit.size/2>=8);
  assert.ok(fit.x+fit.size/2<=592);
  assert.ok(fit.y>=8&&fit.y+fit.size/2<=632);
});
