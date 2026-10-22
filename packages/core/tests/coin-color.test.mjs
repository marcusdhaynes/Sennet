import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHex,hexToRgb,rgbToHex,rgbToHsv,hsvToHex,wheelPointToHsv,hsvToWheelPoint} from '../../../apps/web/src/lib/coinColor.ts';
test('hex/RGB/HSV precise reversible coin coloring',()=>{
  for(const color of ['#87d7ff','#000000','#ffffff','#ff0033','#d8b979','#0088ff','#9900d3','#55aa00']){
    const hsv=rgbToHsv(hexToRgb(color));
    const roundTrip=hexToRgb(hsvToHex(hsv));
    const original=hexToRgb(color);
    for(const k of ['r','g','b'])assert.ok(Math.abs(roundTrip[k]-original[k])<=1,color+' '+k);
  }
});
test('accept hex formats and reject invalid/overflow',()=>{
  assert.equal(normalizeHex('#AbF'),'#aabbff');
  assert.equal(normalizeHex('87D7FF'),'#87d7ff');
  assert.equal(normalizeHex('not a color'),null);
  assert.equal(rgbToHex({r:300,g:-2,b:127}),'#ff007f');
});
test('wheel positions match hue sectors and saturation',()=>{
  for(const hue of [0,45,90,150,200,270,359]){
    const point=hsvToWheelPoint({h:hue,s:.72,v:.83},120);
    const selected=wheelPointToHsv(point.x,point.y,120,.83);
    assert.ok(Math.abs(selected.h-hue)<.0001);
    assert.ok(Math.abs(selected.s-.72)<.0001);
  }
  assert.equal(wheelPointToHsv(120,120,120,1).s,0);
});
