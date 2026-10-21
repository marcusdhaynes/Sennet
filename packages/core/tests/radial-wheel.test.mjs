import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createGame,createId,replay,sanitizeObject}
 from '../src/index.ts';
import {RADIAL_CATEGORIES,RADIAL_ACTIONS,radialHit,radialMembership,radialTapMembership,wheelPosition}
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
 assert.deepEqual(RADIAL_CATEGORIES,['Position','State','Scale']);
 assert.equal(RADIAL_ACTIONS.length,3);
 assert.deepEqual(RADIAL_ACTIONS.map(group=>group.map(o=>o.label)),[
  ['+45°','Tap','−45°'],
  ['Shuffle','Flip','Reveal'],
  ['Increase','Original','Decrease']
 ]);
 assert.equal(RADIAL_ACTIONS.flat().length,9);
 assert.equal(new Set(RADIAL_ACTIONS.flat().map(o=>o.id)).size,9,'Each sector now has its own action');
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
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,1);
 state=apply(state,'scale-original',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,1);
 for(let i=0;i<12;i++)state=apply(state,'scale-bigger',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,7);
 for(let i=0;i<12;i++)state=apply(state,'scale-smaller',target);
 for(const id of target)assert.equal(state.objects.find(c=>c.id===id).scale,1);
 assert.equal(sanitizeObject({...target[0],kind:'card',scale:100}).scale,7);
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
   assert.equal(item.faceUp,zone!=='DECK');
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


test('Lorcana-style stacked cards take wheel operations together without affecting unselected cards',()=>{
 const {local,ids}=stateWithCards();
 const lorcanaNames=[
  'Mother Gothel - Selfish Manipulator',
  "The Queen's Castle - Mirror Chamber",
  'Jafar - Striking Illusionist',
  'Hidden Inkcaster'
 ];
 const base=local.objects.find(o=>o.id===ids[0]);
 const clustered={...local,objects:local.objects.map(o=>{
  const idx=ids.indexOf(o.id);
  return idx>=0&&idx<4?{...o,name:lorcanaNames[idx],
   x:base.x,y:base.y,zone:'TABLE',matSeat:0,order:idx}:o;
 })};
 const selected=ids.slice(0,4);
 let after=apply(clustered,'flip',selected);
 after=apply(after,'rotate-cw',selected);
 after=apply(after,'scale-bigger',selected);
 after=apply(after,'shuffle',selected,{seed:491});
 after=apply(after,'lock',selected);
 for(const id of selected){
  const card=after.objects.find(o=>o.id===id);
  assert.equal(card.faceUp,false);
  assert.equal(card.rotation,45);
  assert.equal(card.scale,1.5);
  assert.equal(card.locked,true);
 }
 assert.deepEqual(after.objects.find(o=>o.id===ids[4]),
  clustered.objects.find(o=>o.id===ids[4]));
 const unlocked=apply(after,'lock',selected);
 const hand=apply(unlocked,'send-to',selected,{destination:'HAND',matSeat:0});
 for(const id of selected)assert.equal(hand.objects.find(o=>o.id===id).zone,'HAND');
});


test('Selected card groups translate as one atomic event without shifting relative spacing',()=>{
 const {local,ids}=stateWithCards();
 const targets=ids.slice(0,3);
 const anchor=local.objects.find(c=>c.id===targets[0]);
 const p=targets.map(id=>local.objects.find(o=>o.id===id));
 const before=p.map(o=>({x:o.x,y:o.y,zone:o.zone,rotation:o.rotation}));
 const cmd=command('move',targets,{anchorId:anchor.id,x:anchor.x+43,y:anchor.y+31});
 const after=applyCommand(local,cmd);
 const cards=targets.map(id=>after.objects.find(o=>o.id===id));
 const dx=cards[0].x-before[0].x,dy=cards[0].y-before[0].y;
 assert.ok(Math.abs(dx)+Math.abs(dy)>0);
 for(let i=0;i<cards.length;i++){
  assert.equal(cards[i].x-before[i].x,dx);
  assert.equal(cards[i].y-before[i].y,dy);
  assert.equal(cards[i].rotation,before[i].rotation);
 }
 assert.deepEqual(replay(local,[cmd]),after);
 assert.equal(after.seq,local.seq+1);
 assert.deepEqual(after.objects.find(o=>o.id===ids[4]),local.objects.find(o=>o.id===ids[4]));
 assert.throws(()=>apply(local,'move',targets,{anchorId:'not-selected',x:1,y:1}),/Invalid selected-group/);
 assert.throws(()=>apply(local,'move',targets,{anchorId:targets[0],x:NaN,y:1}),/Invalid selected-group/);
 const blocked={...local,objects:local.objects.map(o=>
  o.id===targets[1]?{...o,locked:true}:o)};
 assert.throws(()=>apply(blocked,'move',targets,{anchorId:targets[0],x:10,y:10}),/locked/);
});


test('After first 250ms hold selection mode uses ONE tap per next card or stack',()=>{
 const first=radialMembership(new Set(), 'a',['a','b'],false);
 assert.deepEqual(first,['a','b']);
 const second=radialTapMembership(new Set(first),'c',['c','d']);
 assert.deepEqual(second,['a','b','c','d']);
 // A short tap on an already selected stack deselects just its members.
 assert.deepEqual(radialTapMembership(new Set(second),'a',['a','b']),['c','d']);
 assert.deepEqual(radialTapMembership(new Set(['c']),'c',['c']),[]);
});
test('Stationary hold is 250ms, movement resistance starts after 13 screen pixels',async()=>{
 const {GESTURE_HOLD_MS,GESTURE_MOVE_THRESHOLD}=await import('../../../apps/web/src/lib/cardGestures.ts');
 assert.equal(GESTURE_HOLD_MS,250);
 assert.equal(GESTURE_MOVE_THRESHOLD,13);
 assert.ok(GESTURE_MOVE_THRESHOLD>7,'Drag threshold must provide slight deliberate resistance');
});
test('Compact radial layout keeps outer actions in the requested order',()=>{
 assert.deepEqual(RADIAL_ACTIONS[0].map(a=>a.id),['rotate-cw','tap-toggle','rotate-ccw']);
 assert.deepEqual(RADIAL_ACTIONS[1].map(a=>a.id),['shuffle','flip','reveal']);
 assert.deepEqual(RADIAL_ACTIONS[2].map(a=>a.id),['scale-bigger','scale-original','scale-smaller']);
 for(const [index,group] of RADIAL_ACTIONS.entries()){
  for(const [position,action] of group.entries()){
   const radians=(index*120+position*40+20)*Math.PI/180;
   const hit=radialHit(160*Math.sin(radians),-160*Math.cos(radians));
   assert.equal(hit.action,action.id);
  }
 }
});


test('Selected group stays rigid when dragging toward the board boundary',()=>{
 const {local,ids}=stateWithCards();
 const first=ids[0],second=ids[1];
 const initial={...local,objects:local.objects.map(o=>
   o.id===first?{...o,x:70,y:70}:o.id===second?{...o,x:120,y:120}:o)};
 const changed=apply(initial,'move',[first,second],
  {anchorId:first,x:-10000,y:-10000});
 const a=changed.objects.find(o=>o.id===first);
 const b=changed.objects.find(o=>o.id===second);
 assert.equal(a.x,0);
 assert.equal(a.y,0);
 assert.equal(b.x-a.x,50,'Group drag must preserve x offset');
 assert.equal(b.y-a.y,50,'Group drag must preserve y offset');
});

test('Reveal exposes selected cards without toggling a face-up card back down',()=>{
 const {local,ids}=stateWithCards();
 const hidden={...local,objects:local.objects.map(o=>ids.slice(0,2).includes(o.id)?{...o,faceUp:false}:o)};
 const shown=apply(hidden,'reveal',ids.slice(0,3));
 assert.ok(ids.slice(0,3).every(id=>shown.objects.find(o=>o.id===id)?.faceUp===true));
 const repeat=apply(shown,'reveal',ids.slice(0,3));
 assert.ok(ids.slice(0,3).every(id=>repeat.objects.find(o=>o.id===id)?.faceUp===true));
});

test('LCD left edge meets playmat; right edge touches wheel across zoom and pan',async()=>{
  const {fitActionScreenToWheel}=await import('../../../apps/web/src/lib/actionScreenFit.ts');
  const eq=(actual,expected,what)=>assert.ok(Math.abs(actual-expected)<1e-6,
    what+': '+actual+' vs '+expected);
  for(const zoom of [.25,.5,1,1.5,3]){
    const panX=320,panelY=680+zoom*25;
    const matLeft=panX-240*zoom,matRight=panX+240*zoom;
    const wheelCenter=panX+25*zoom,wheelSize=144*zoom;
    const radialLeft=wheelCenter-wheelSize/2;
    const result=fitActionScreenToWheel(matLeft,matRight,wheelCenter,
      wheelSize,panelY,zoom);
    assert.equal(result.visible,true);
    eq(result.left,matLeft,'LCD left edge at zoom '+zoom);
    eq(result.left+result.width,radialLeft,'LCD touches wheel at zoom '+zoom);
    eq(result.y,panelY,'LCD stays below mat');
    eq(result.heightScale,zoom,'LCD height follows camera');
    const reversed=fitActionScreenToWheel(matRight,matLeft,wheelCenter,
      wheelSize,panelY,zoom);
    eq(reversed.left,result.left,'reversed mat left edge');
    eq(reversed.width,result.width,'reversed mat width');
  }
  const noRoom=fitActionScreenToWheel(200,600,195,80,700,1);
  assert.equal(noRoom.visible,false);
  assert.equal(noRoom.width,0);
});

test('action display rests flush against playmat with no camera-dependent gap',async()=>{
  const {ACTION_LCD_HEIGHT,actionScreenContactCenter}=await import(
    '../../../apps/web/src/lib/actionScreenFit.ts');
  for(const matHeight of [294,390,488]){
    const localCenter=actionScreenContactCenter(matHeight);
    assert.equal(localCenter-ACTION_LCD_HEIGHT/2,matHeight/2);
    for(const zoom of [.25,.5,1,1.6,3]){
      const screenTop=(localCenter-ACTION_LCD_HEIGHT/2)*zoom+230;
      const matBottom=matHeight/2*zoom+230;
      assert.ok(Math.abs(screenTop-matBottom)<1e-7,
        'screen should touch mat at zoom '+zoom);
    }
  }
});
