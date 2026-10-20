import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createGame,createId,replay,sanitizeObject}
 from '../src/index.ts';
import {RADIAL_CATEGORIES,RADIAL_ACTIONS,radialHit,radialMembership,wheelPosition}
 from '../../../apps/web/src/lib/radialWheel.ts';

const command=(action,ids,extra={},actor='local')=>({
  id:createId(),actor,type:'BATCH_CARD_ACTION',payload:{action,ids,...extra}
});
const apply=(state,action,ids,extra={},actor='local')=>
 applyCommand(state,command(action,ids,extra,actor));
const stateWithCards=()=>{
 const original=createGame('tcg');
 const sample=original.objects.filter(o=>o.kind==='card').slice(0,5);
 assert.equal(sample.length,5);
 const local={...original,objects:original.objects.map(o=>
   sample.some(c=>c.id===o.id)?{...o,zone:'TABLE',owner:'local',
    matSeat:0,faceUp:true,rotation:0,scale:1}:o)};
 return {local,ids:sample.map(o=>o.id)};
};
test('Reference wheel defines exactly 3 inner sections and 9 unique outer actions',()=>{
 assert.deepEqual(RADIAL_CATEGORIES,['Position','Scale','Location']);
 assert.equal(RADIAL_ACTIONS.length,3);
 assert.deepEqual(RADIAL_ACTIONS.map(group=>group.map(o=>o.label)),[
  ['Flip','+45° Rotate','−45° Rotate'],
  ['Restore Original Size','Scale 50% Smaller','Scale 50% Bigger'],
  ['Shuffle','Send To','Lock / Unlock']
 ]);
 assert.equal(new Set(RADIAL_ACTIONS.flat().map(o=>o.id)).size,9);
 for(let group=0;group<3;group++)for(let i=0;i<3;i++){
  const degrees=group*120+i*40+20;
  const point=(radius)=>({
   dx:Math.sin(degrees*Math.PI/180)*radius,
   dy:-Math.cos(degrees*Math.PI/180)*radius
  });
  assert.deepEqual(radialHit(...Object.values(point(92))),{
    ring:'inner',category:group,action:null
  });
  assert.deepEqual(radialHit(...Object.values(point(154))),{
    ring:'outer',category:group,action:RADIAL_ACTIONS[group][i].id
  });
 }
 assert.equal(radialHit(0,0).action,null);
 assert.equal(radialHit(211,0).ring,'outside');
 const pos=wheelPosition(2,2,320,540,280);
 assert.ok(pos.x>=146&&pos.y>=146);
 assert.ok(pos.x+140<=320&&pos.y+140<=540);
});
test('First hold selects entire stack; additional holds add cards; second hold preserves selection',()=>{
 const initial=new Set(['a']);
 assert.deepEqual(radialMembership(initial,'b',['b','c','d'],false),['a','b','c','d']);
 const selected=new Set(['a','b','c','d']);
 assert.deepEqual(radialMembership(selected,'b',['b','c','d'],true),['a','b','c','d']);
 assert.deepEqual(radialMembership(new Set(), 'top',['top','bottom'],false),['top','bottom']);
});
test('Position wheel: Flip, +45° and −45° apply atomically to ALL selected',()=>{
 const {local,ids}=stateWithCards();
 const target=ids.slice(0,3),untouched=ids[3];
 let state=apply(local,'flip',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).faceUp,false);
 assert.equal(state.objects.find(c=>c.id===untouched).faceUp,true);
 state=apply(state,'rotate-cw',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).rotation,45);
 state=apply(state,'rotate-ccw',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).rotation,0);
 state=apply(state,'rotate-ccw',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).rotation,315);
});
test('Scale wheel: original, 50% smaller and 50% bigger clamp safely',()=>{
 const {local,ids}=stateWithCards(),target=ids.slice(0,4);
 let state=apply(local,'scale-smaller',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,0.5);
 state=apply(state,'scale-bigger',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,0.75);
 state=apply(state,'scale-original',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,1);
 for(let i=0;i<12;i++)state=apply(state,'scale-bigger',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,4);
 for(let i=0;i<12;i++)state=apply(state,'scale-smaller',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,0.25);
 assert.equal(sanitizeObject({...target[0],kind:'card',scale:100}).scale,4);
});
test('Location wheel: shuffle is seeded deterministic and changes selected ordering only',()=>{
 const {local,ids}=stateWithCards();
 const picked=ids.slice(0,4);
 const initial={...local,objects:local.objects.map(o=>{
  const index=picked.indexOf(o.id);
  return index<0?o:{...o,order:index};
 })};
 const next=apply(initial,'shuffle',picked,{seed:9082});
 const replayed=apply(initial,'shuffle',picked,{seed:9082});
 assert.deepEqual(next.objects,replayed.objects);
 const before=picked.map(id=>initial.objects.find(c=>c.id===id).order);
 const after=picked.map(id=>next.objects.find(c=>c.id===id).order);
 assert.deepEqual(after.slice().sort((a,b)=>a-b),before.slice().sort((a,b)=>a-b));
 assert.notDeepEqual(after,before,'A seeded shuffle can change physical stack order');
 const other=ids[4];
 assert.deepEqual(next.objects.find(c=>c.id===other),initial.objects.find(c=>c.id===other));
});
test('Location wheel: Send To applies to all selected with no partial updates',()=>{
 const {local,ids}=stateWithCards(),picked=ids.slice(0,3);
 for(const [destination,zone] of [
  ['HAND','HAND'],['DECK_TOP','DECK'],['DECK_BOTTOM','DECK'],
  ['DISCARD','DISCARD'],['TABLE','TABLE']
 ]){
  const state=apply(local,'send-to',picked,{destination,matSeat:0});
  for(const id of picked){
   const item=state.objects.find(c=>c.id===id);
   assert.equal(item.zone,zone);assert.equal(item.matSeat,0);
   assert.equal(item.faceUp,zone==='TABLE'||zone==='DISCARD');
  }
  assert.equal(state.seq,local.seq+1);
 }
 assert.throws(()=>apply(local,'send-to',picked,{destination:'UNKNOWN',matSeat:0}),/Invalid send-to/);
});
test('Location wheel: Lock toggles selected cards and blocks other actions until unlocked',()=>{
 const {local,ids}=stateWithCards(),picked=ids.slice(0,3);
 const locked=apply(local,'lock',picked);
 for(const id of picked)assert.equal(locked.objects.find(o=>o.id===id).locked,true);
 assert.throws(()=>apply(locked,'flip',picked),/locked/);
 const unlocked=apply(locked,'lock',picked);
 for(const id of picked)assert.equal(unlocked.objects.find(o=>o.id===id).locked,false);
 const mixed={...local,objects:local.objects.map(o=>
  o.id===ids[0]?{...o,owner:'somebody-else'}:o)};
 assert.throws(()=>apply(mixed,'scale-bigger',picked),/another player/);
 assert.deepEqual(mixed.objects,local.objects.map(o=>o.id===ids[0]?
  {...o,owner:'somebody-else'}:o),'Validation cannot mutate an invalid group');
});
test('Nine actions replay exactly and card scale persists through sanitization',()=>{
 const {local,ids}=stateWithCards();
 const actions=[
  command('flip',ids.slice(0,2)),
  command('rotate-cw',ids.slice(0,2)),
  command('rotate-ccw',ids.slice(0,2)),
  command('scale-smaller',ids.slice(0,2)),
  command('scale-bigger',ids.slice(0,2)),
  command('scale-original',ids.slice(0,2)),
  command('shuffle',ids.slice(0,3),{seed:2351}),
  command('send-to',ids.slice(0,2),{destination:'DISCARD',matSeat:0}),
  command('lock',ids.slice(0,2))
 ];
 const sequential=actions.reduce((state,cmd)=>applyCommand(state,cmd),local);
 assert.deepEqual(replay(local,actions),sequential);
 assert.equal(sequential.seq,local.seq+9);
});
