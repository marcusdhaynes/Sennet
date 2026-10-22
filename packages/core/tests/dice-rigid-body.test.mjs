import test from 'node:test';
import assert from 'node:assert/strict';
import {dieGeometry,radiusFor} from '../../../apps/web/src/lib/Dice3DGeometry.ts';
import {convexShape} from '../../../apps/web/src/lib/Dice3D.ts';

test('every thrown polyhedral die has finite rigid-body geometry',()=>{
  for(const sides of [4,6,8,10,12,20,100]){
    const geometry=dieGeometry(sides,radiusFor(sides));
    try{
      const shape=convexShape(geometry);
      assert.ok(shape.vertices.length>=4,'vertices D'+sides);
      assert.ok(shape.faces.length>=4,'faces D'+sides);
      assert.ok(shape.faceNormals.every(n=>Number.isFinite(n.x)&&
        Number.isFinite(n.y)&&Number.isFinite(n.z)),'finite normals D'+sides);
      assert.ok(shape.vertices.every(p=>Number.isFinite(p.x)&&
        Number.isFinite(p.y)&&Number.isFinite(p.z)),'finite vertices D'+sides);
    }finally{geometry.dispose();}
  }
});
