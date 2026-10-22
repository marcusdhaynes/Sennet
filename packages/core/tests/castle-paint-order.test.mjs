import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_PAINT_ORDER,playmatPaintLayer}
  from '../../../apps/web/src/lib/castlePaintOrder.ts';

test('Castle opponent playmats render behind every other paint layer',()=>{
  assert.equal(TABLE_PAINT_ORDER[0],'castleOpponentPlaymats');
  const front=['labels','accessories','playmats','buttons','objects'];
  assert.deepEqual(TABLE_PAINT_ORDER.slice(1),front);
  assert.equal(new Set(TABLE_PAINT_ORDER).size,TABLE_PAINT_ORDER.length);
});

test('Castle backgrounds for all other players use the lowest paint layer',()=>{
  for(let viewer=0;viewer<12;viewer++)
    for(let seat=0;seat<12;seat++)
      assert.equal(playmatPaintLayer(true,seat,viewer),
        seat===viewer?'playmats':'castleOpponentPlaymats',
        'viewer '+viewer+', seat '+seat);
});

test('Own playmat and non-Castle modes preserve original layer',()=>{
  for(const active of [false,true])
    for(let seat=0;seat<12;seat++){
      assert.equal(playmatPaintLayer(active,seat,seat),'playmats');
      assert.equal(playmatPaintLayer(false,seat,(seat+1)%12),'playmats');
    }
});
