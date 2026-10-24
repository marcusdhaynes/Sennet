import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VIEW_BUTTON_RADIUS,viewButtonPosition,TCG_MAT_HEIGHT,TCG_MAT} from '../src/index.ts';
import {
  EYE_CONTROL_DIAMETER_PX,fixedMatControlScale,fitMatAttachedRadial
} from '../../../apps/web/src/lib/actionRadialFit.ts';

const table=readFileSync(new URL('../../../apps/web/src/components/TableCanvas.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../../../apps/web/src/styles.css',import.meta.url),'utf8');

test('merge, Eye, Castle, stack controls use the same physical 34px diameter',()=>{
  assert.equal(2*(VIEW_BUTTON_RADIUS+1),EYE_CONTROL_DIAMETER_PX);
  assert.match(table,/woodenControl\(VIEW_BUTTON_RADIUS,seatPlaymat\.sideBoxStyle\?\?'walnut',merged\)/);
  assert.match(table,/createEyeStyleCounter\(count,playmat\.sideBoxStyle/);
  assert.match(table,/width:34px!important;height:34px!important/);
  assert.equal(viewButtonPosition('eye').x,-22);
  assert.equal(viewButtonPosition('castle').x,22);
});

test('Eye and Castle have one mat-attached anchor and constant 44px visual gap',()=>{
  assert.match(table,/controls\.position\.set\(0,eyePosition\.y\)/);
  assert.match(table,/controls\.addChild\(eye\)/);
  assert.match(table,/controls\.addChild\(castle\)/);
  assert.match(table,/group\.scale\.set\(inverse\)/);
  assert.ok(!table.includes('eye.position.x=-halfSpacing'));
  assert.ok(!table.includes('castle.position.x=halfSpacing'));
  for(const zoom of [.035,.25,.5,1,1.5,4,12]){
    const scale=fixedMatControlScale(zoom);
    assert.ok(Math.abs(zoom*scale*EYE_CONTROL_DIAMETER_PX-34)<1e-8);
    assert.ok(Math.abs(zoom*scale*44-44)<1e-8);
  }
});

test('merge positions remain in their true playmat gutters',()=>{
  const y=Array.from({length:3},(_,boundary)=>-TCG_MAT_HEIGHT/2+
    (boundary+1)*TCG_MAT.rowHeight+(boundary+.5)*TCG_MAT.gap);
  assert.ok(y[0]<y[1]&&y[1]<y[2]);
  assert.match(table,/marker\.position\.set\(0,gapCenter\)/);
  assert.match(table,/merge\.scale\.set\(inverse\)/);
  assert.ok(!table.includes('merge.position.x='));
});

test('Eye/Castle divider has one viewport-centered stroke and anchored camera',()=>{
  assert.match(styles,/\.opponent-battle-divider\s*\{[^}]*top:50%/s);
  assert.match(table,/if\(isBattleView\(kind\)\)\{[\s\S]*?c\.panX=0;c\.panY=0;/);
  const between=table.split('if(duelOpponent!==null||castleActive){')[1]
    .split('}else{')[0];
  assert.ok(!between.includes('.lineTo(span/2,0)'),
    'Do not double-paint a Pixi line under the viewport divider');
});

test('action radial cannot be moved separately from the physical playmat',()=>{
  assert.match(table,/const next=fitMatAttachedRadial\(/);
  assert.ok(!table.includes('?fitDockedRadial('));
  const p=fitMatAttachedRadial(21,455,620,250,300);
  assert.equal(p.x,21);
  assert.equal(p.y,455);
  assert.equal(p.size,186);
});
