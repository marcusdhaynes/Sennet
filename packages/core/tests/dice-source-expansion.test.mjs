import test from 'node:test';
import assert from 'node:assert/strict';
import {expandDiceSources} from '../../../apps/web/src/lib/diceSourceExpansion.ts';

test('one through twenty total dice use individual physics bodies',()=>{
  for(const n of [1,2,6,19,20]){
    const sources=expandDiceSources([{sides:6,quantity:n,x:200,y:200,themeId:'copper'}]);
    assert.equal(sources.length,n);
    assert.ok(sources.every(s=>s.quantity===1&&s.sides===6&&s.themeId==='copper'));
  }
});
test('mixed dice use their actual combined count, including 20 boundary',()=>{
  const small=expandDiceSources([{sides:6,quantity:14,x:4,y:3},{sides:20,quantity:6,x:5,y:2}]);
  assert.deepEqual(small.map(s=>s.sides),[...Array(14).fill(6),...Array(6).fill(20)]);
  const large=expandDiceSources([{sides:6,quantity:15,x:4,y:3},{sides:20,quantity:6,x:5,y:2}]);
  assert.deepEqual(large.map(s=>s.quantity),[15,6]);
});
test('large dice groups stay one body per denomination',()=>{
  const result=expandDiceSources([{sides:6,quantity:20,x:1,y:1},{sides:4,quantity:15,x:2,y:2}]);
  assert.equal(result.length,2);
  assert.equal(result[0].quantity,20);
  assert.equal(result[1].quantity,15);
});
