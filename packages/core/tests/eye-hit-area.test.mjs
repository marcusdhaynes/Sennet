import test from 'node:test';
import assert from 'node:assert/strict';
import {VIEW_BUTTON_CASTLE_OFFSET,VIEW_BUTTON_HIT_RADIUS}
  from '../src/index.ts';
import {eyeHitBounds} from '../../../apps/web/src/lib/eyeHitArea.ts';

test('Eye icon has a minimum 48 × 44 pixel target in zoomed-out overview',()=>{
  for(const scale of [.075,.1,.2,.35,.5,1]){
    const hit=eyeHitBounds(scale);
    assert.ok(hit.width*scale>=48-1e-8,'screen width '+scale);
    assert.ok(hit.height*scale>=44-1e-8,'screen height '+scale);
    assert.ok(hit.x<=-VIEW_BUTTON_HIT_RADIUS);
    assert.ok(hit.x+hit.width>=0,'visual icon remains clickable');
    assert.ok(hit.y<=0&&hit.y+hit.height>=0);
  }
});

test('enlarged Eye click area never overlaps nearby Castle control',()=>{
  const eye=-VIEW_BUTTON_CASTLE_OFFSET,castle=VIEW_BUTTON_CASTLE_OFFSET;
  for(const scale of [.07,.12,.3,1,4]){
    const h=eyeHitBounds(scale);
    const rightEdge=eye+h.x+h.width;
    const castleLeft=castle-VIEW_BUTTON_HIT_RADIUS;
    assert.ok(rightEdge<castleLeft,
      'target must never swallow taps on Castle at '+scale);
  }
});

test('Eye visible glyph size stays independent from the enlarged hit box',()=>{
  const x=eyeHitBounds(2);
  assert.equal(x.width,2*VIEW_BUTTON_HIT_RADIUS);
  assert.equal(x.height,2*VIEW_BUTTON_HIT_RADIUS);
  assert.equal(x.x,-VIEW_BUTTON_HIT_RADIUS);
});
