import test from 'node:test';
import assert from 'node:assert/strict';
import {drawerInnerWell,isBookWithinDrawer,bookOpenPoseX} from
  '../../../apps/web/src/lib/bookDrawerPlacement.ts';

test('a book centered in the open drawer belongs to that drawer',()=>{
  const well=drawerInnerWell(250,45,62,290);
  assert.equal(isBookWithinDrawer(250,158.5,44*1.06,44/0.76*1.06,well),true);
});
test('a book resting on the playmat cannot inherit drawer movement',()=>{
  const well=drawerInnerWell(250,45,62,290);
  assert.equal(isBookWithinDrawer(120,100,46,60,well),false);
});
test('the same book moves in lockstep with its drawer',()=>{
  const well=drawerInnerWell(250,45,62,290);
  const shift=-67;
  assert.equal(isBookWithinDrawer(250+shift,158.5,46,60,well,shift),true);
  assert.equal(bookOpenPoseX(250+shift,shift),250);
});
test('a partially outside book does not snap into a drawer',()=>{
  const well=drawerInnerWell(250,45,62,290);
  assert.equal(isBookWithinDrawer(300,158,46,60,well),false);
});
test('left and right drawers use the same fit rules',()=>{
  const left=drawerInnerWell(-250,45,62,290);
  assert.equal(isBookWithinDrawer(-250,150,46,60,left),true);
  assert.equal(isBookWithinDrawer(250,150,46,60,left),false);
});
