import test from 'node:test';
import assert from 'node:assert/strict';
import {fitDockedRadial} from '../../../apps/web/src/lib/actionRadialFit.ts';
function fullyVisible(fit,viewport){
  const r=fit.size/2;
  assert.ok(fit.x-r>=7.99,'radial left edge visible');
  assert.ok(fit.x+r<=viewport.width-7.99,'radial right edge visible');
  assert.ok(fit.y>=7.99,'radial top edge visible');
  assert.ok(fit.y+r<=viewport.height-7.99,'radial bottom edge visible');
}
test('Castle grid: oversized expanded half-wheel scales down to fit',()=>{
  const viewport={width:380,height:420};
  const fit=fitDockedRadial(410,397,530,viewport.width,viewport.height);
  fullyVisible(fit,viewport);
  assert.ok(fit.size<=viewport.width-16);
});
test('1v1: docking near lower corner never hides expanded actions',()=>{
  const viewport={width:1280,height:720};
  const fit=fitDockedRadial(1240,690,290,viewport.width,viewport.height);
  fullyVisible(fit,viewport);
});
test('normal table: retain the original size where it already fits',()=>{
  const fit=fitDockedRadial(500,620,150,1200,900);
  assert.deepEqual(fit,{x:500,y:620,size:150});
});
