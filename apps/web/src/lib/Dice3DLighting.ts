import * as THREE from 'three';

/** Identical lights and directions for flying and settled die geometry.
 * Different light rigs made the same unchanged die look like a different
 * object at the exact instant the animated mesh was handed off. */
export function installDiceLighting(scene:THREE.Scene):void{
  scene.add(new THREE.AmbientLight(0xfff4e6,1.1));
  const overhead=new THREE.DirectionalLight(0xffffff,2.4);
  overhead.position.set(-250,570,900);
  scene.add(overhead);
  const bounce=new THREE.DirectionalLight(0x86b5da,.8);
  bounce.position.set(510,-270,600);
  scene.add(bounce);
}
