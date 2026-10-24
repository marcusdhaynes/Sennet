import test from 'node:test';
import assert from 'node:assert/strict';
import {fitDockedRadial,fitSelfMatWithHud,radialHoverMatrix} from '../../../apps/web/src/lib/actionRadialFit.ts';
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

/** Viewport-fit regression: the hand-edge semicircle used to extend below
 * the last visible pixel after the camera maximized the rectangular mat. */
for(const {width,height,held} of [
 {width:862,height:491,held:0},
 {width:862,height:491,held:126},
 {width:390,height:620,held:140},
 {width:1440,height:900,held:0},
 {width:600,height:360,held:126}
]){
 test(`self mat keeps radial in frame at ${width}x${height} (hand ${held})`,()=>{
  const matW=628,matH=444,outerW=628+2*(62+18);
  const top=26,lcd=40;
  const layout=fitSelfMatWithHud(width,height,matW,matH,outerW,top,lcd,held);
  assert.ok(layout.scale>0);
  const centerY=height/2+layout.offsetY;
  const topEdge=centerY-(matH/2+top)*layout.scale;
  const bottomEdge=centerY+(matH/2+layout.radialBottom)*layout.scale;
  assert.ok(topEdge>=11.9,`Top control clipped: ${topEdge}`);
  assert.ok(bottomEdge<=height-held-11.9,
    `Wheel clipped: ${bottomEdge} > ${height-held-12}`);
  const fullWidth=outerW*layout.scale;
  assert.ok(fullWidth<=width-23.9);
 });
}

test('half radial hover magnifier preserves actual button location at bottom edge',()=>{
 const rect={left:120,top:440,width:180,height:90};
 const m=radialHoverMatrix(rect,true);
 const center={x:200*m.a+m.e,y:200*m.d+m.f};
 assert.deepEqual(center,{x:210,y:440});
 const outer={x:200*m.a+m.e,y:360*m.d+m.f};
 assert.deepEqual(outer,{x:210,y:512});
});
test('full radial hover magnifier preserves actual wheel center',()=>{
 const rect={left:90,top:85,width:220,height:220};
 const m=radialHoverMatrix(rect,false);
 assert.deepEqual({x:200*m.a+m.e,y:200*m.d+m.f},
  {x:200,y:195});
});
