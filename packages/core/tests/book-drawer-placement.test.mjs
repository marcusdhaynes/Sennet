import test from 'node:test';
import assert from 'node:assert/strict';
import {drawerInnerWell,isBookWithinDrawer,isBookCenterWithinDrawer,bookOpenPoseX,bookSavedOffset} from
  '../../../apps/web/src/lib/bookDrawerPlacement.ts';

test('a book centered in the open drawer belongs to that drawer',()=>{
  const well=drawerInnerWell(250,49,62,290);
  assert.equal(isBookWithinDrawer(250,158.5,44*1.06,44/0.76*1.06,well),true);
});
test('a book resting on the playmat cannot inherit drawer movement',()=>{
  const well=drawerInnerWell(250,49,62,290);
  assert.equal(isBookWithinDrawer(120,100,46,60,well),false);
});
test('the same book moves in lockstep with its drawer',()=>{
  const well=drawerInnerWell(250,49,62,290);
  const shift=-67;
  assert.equal(isBookWithinDrawer(250+shift,158.5,46,60,well,shift),true);
  assert.equal(bookOpenPoseX(250+shift,shift),250);
});
test('a partially outside book does not snap into a drawer',()=>{
  const well=drawerInnerWell(250,49,62,290);
  assert.equal(isBookWithinDrawer(300,158,46,60,well),false);
});
test('left and right drawers use the same fit rules',()=>{
  const left=drawerInnerWell(-250,49,62,290);
  assert.equal(isBookWithinDrawer(-250,150,46,60,left),true);
  assert.equal(isBookWithinDrawer(250,150,46,60,left),false);
});

test('saved offset does not apply the previous book offset twice',()=>{
  const baseRight=250,oldOffset=-24;
  const start=baseRight+oldOffset;
  const drop=start-40;
  const saved=bookSavedOffset(oldOffset,drop,start);
  assert.equal(saved,-64);
  assert.equal(baseRight+saved,drop);
});
test('drop in opposite drawer persists its open-pose coordinate',()=>{
  const baseRight=250,oldOffset=10,leftDrop=-250;
  const saved=bookSavedOffset(oldOffset,leftDrop,baseRight+oldOffset);
  assert.equal(baseRight+saved,leftDrop);
});

test('right-drawer book snap is available as soon as the book center is within the walls',()=>{
  const right=drawerInnerWell(320,42,62,294);
  assert.equal(isBookCenterWithinDrawer(320,151,right),true);
  assert.equal(isBookCenterWithinDrawer(320-32,151,right),true);
  assert.equal(isBookCenterWithinDrawer(320-45,151,right),false);
  assert.equal(isBookCenterWithinDrawer(200,151,right),false);
});
test('right-drawer snap resets previous free offset to the home coordinate',()=>{
  const right=drawerInnerWell(320,42,62,294);
  const originalBaseX=320,previousOffsetX=-110;
  const start=originalBaseX+previousOffsetX;
  const saved=bookSavedOffset(previousOffsetX,right.x,start);
  assert.equal(originalBaseX+saved,right.x);
});
