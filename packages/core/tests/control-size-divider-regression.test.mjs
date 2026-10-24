import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VIEW_BUTTON_RADIUS,viewButtonPosition,TCG_MAT_HEIGHT,TCG_MAT} from '../src/index.ts';
import {
  EYE_CONTROL_DIAMETER_PX,WOODEN_CONTROL_WORLD_DIAMETER,fixedMatControlScale,fitMatAttachedRadial
} from '../../../apps/web/src/lib/actionRadialFit.ts';

const table=readFileSync(new URL('../../../apps/web/src/components/TableCanvas.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../../../apps/web/src/styles.css',import.meta.url),'utf8');

test('merge, Eye, Castle, stack controls all use the same SMALL 16px diameter',()=>{
  assert.equal(2*(VIEW_BUTTON_RADIUS+1),WOODEN_CONTROL_WORLD_DIAMETER);
  assert.equal(EYE_CONTROL_DIAMETER_PX,16);
  assert.match(table,/woodenControl\(VIEW_BUTTON_RADIUS,seatPlaymat\.sideBoxStyle\?\?'walnut',merged\)/);
  assert.match(table,/createEyeStyleCounter\(count,playmat\.sideBoxStyle/);
  assert.match(styles,/width:var\(--sennet-control-size,16px\)!important/);
  assert.ok(!styles.includes('width:34px!important;height:34px!important'));
  assert.equal(viewButtonPosition('eye').x,-22);
  assert.equal(viewButtonPosition('castle').x,22);
});

test('Eye and Castle share a fixed playmat anchor, their size and separation never change',()=>{
  assert.match(table,/controls\.position\.set\(0,eyePosition\.y\)/);
  assert.match(table,/controls\.addChild\(eye\)/);
  assert.match(table,/controls\.addChild\(castle\)/);
  assert.match(table,/group\.scale\.set\(inverse\)/);
  assert.ok(!table.includes('eye.position.x=-halfSpacing'));
  assert.ok(!table.includes('castle.position.x=halfSpacing'));
  for(const zoom of [.035,.25,.5,1,1.5,4,12]){
    const scale=fixedMatControlScale(zoom);
    assert.ok(Math.abs(zoom*scale*WOODEN_CONTROL_WORLD_DIAMETER-16)<1e-8);
    assert.ok(Math.abs(zoom*scale*44-44*16/34)<1e-8);
  }
});

test('merge positions remain in their true playmat gutters',()=>{
  const y=Array.from({length:3},(_,boundary)=>-TCG_MAT_HEIGHT/2+
    (boundary+1)*TCG_MAT.rowHeight+(boundary+.5)*TCG_MAT.gap);
  assert.ok(y[0]<y[1]&&y[1]<y[2]);
  assert.match(table,/marker\.position\.set\(0,gapCenter\)/);
  assert.match(table,/merge\.scale\.set\(fixedMatControlScale\(matPx,targetPixels\)\)/);
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

test('all tabletop controls use CSS pixel scale, never physical framebuffer resolution',()=>{
  assert.match(table,/rect\.width\/app\.screen\.width/);
  assert.match(table,/rect\.height\/app\.screen\.height/);
  const controls=table.split('const control=eyeHitTarget.current;')[1]
    .split('const hand=tcgMatCells')[0];
  assert.ok(!controls.includes('rect.width/app.renderer.width'));
  assert.ok(!controls.includes('rect.height/app.renderer.height'));
  assert.match(styles,/\.sennet-stack-count svg\s*\{[^}]*width:var\(--sennet-control-size,16px\)!important/s);
});

test('mat controls only change inverse scale; world anchor and merge positions remain immutable',()=>{
  const fragment=table.split('const control=eyeHitTarget.current;')[1].split('const hand=tcgMatCells')[0];
  assert.match(fragment,/group\.scale\.set\(inverse\)/);
  assert.match(fragment,/merge\.scale\.set\(fixedMatControlScale\(matPx,targetPixels\)\)/);
  assert.ok(!/\.position\.set|\.position\.x\s*=|\.position\.y\s*=/.test(fragment));
});

test('one session reference uses the opponent Sword/Shield size in initial Eye view',()=>{
  assert.match(table,/controlReferencePixels=useRef<number\|null>\(null\)/);
  assert.match(table,/if\(controlReferencePixels\.current===null\)\{/);
  assert.match(table,/eyeOpponentReferencePixels\(/);
  assert.match(table,/mount\.current\.style\.setProperty\('--sennet-control-size'/);
  assert.match(table,/fixedMatControlScale\(pxPerWorld,targetPixels\)/);
  assert.match(table,/fixedMatControlScale\(matPx,targetPixels\)/);
});

test('opponent Sword/Shield, navigation, gears, and every merge register for inverse scaling',()=>{
  assert.match(table,/onMergeReady\(marker\)/);
  assert.match(table,/onMergeReady\(settings\)/);
  assert.match(table,/onMergeReady\(button\)/);
  assert.ok(!table.includes('if(seat===viewerSeat)onMergeReady(marker)'));
});
