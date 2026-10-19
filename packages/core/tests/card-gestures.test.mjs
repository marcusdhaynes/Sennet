import test from 'node:test';
import assert from 'node:assert/strict';
import {cardGestureOptions,isDoubleCardTap,GESTURE_HOLD_MS,GESTURE_MOVE_THRESHOLD}
 from '../../../apps/web/src/lib/cardGestures.ts';
import {applyCommand,createGame,createId,cardStackMembers,replay,tcgMatCells}
 from '../src/index.ts';
const run=(state,type,payload,serial=1,actor='local')=>
 applyCommand(state,{id:'gesture-'+serial+'-'+createId(),actor,type,payload});
test('Touch and touchpad action panel exposes card, pile, counter and fallback operations',()=>{
 const state=createGame('tcg');
 const card=state.objects.find(o=>o.kind==='card'&&o.zone==='DECK');
 assert.ok(card);
 const available=new Set(cardGestureOptions(card,'tcg').map(o=>o.action));
 for(const action of ['tap','flip','rotate-cw','rotate-ccw','rotate-180',
  'counter-add','counter-remove','hand','deck-top','deck-bottom','discard',
  'draw','shuffle','duplicate','remove','inspect'])assert.ok(available.has(action),action);
 const dice={...card,kind:'die',zone:'TABLE'};
 const extras=new Set(cardGestureOptions(dice,'tcg').map(x=>x.action));
 assert.ok(extras.has('roll'));
 assert.ok(!extras.has('hand'));
 assert.ok(!extras.has('tap'));
 assert.ok(GESTURE_HOLD_MS>=250);
 assert.ok(GESTURE_MOVE_THRESHOLD>=4);
});
test('Double-tap classifier never confuses separate cards or normal drags',()=>{
 const last={id:'card-a',at:1000,x:200,y:150};
 assert.ok(isDoubleCardTap(last,'card-a',1210,203,152));
 assert.ok(!isDoubleCardTap(last,'card-a',1320,203,152));
 assert.ok(!isDoubleCardTap(last,'card-b',1100,203,152));
 assert.ok(!isDoubleCardTap(last,'card-a',1100,275,150));
 assert.ok(!isDoubleCardTap(last,'card-a',900,200,150));
});
test('Finger-accessible counter actions clamp, sanitize, replay and respect locks',()=>{
 const initial=createGame('tcg');
 const card=initial.objects.find(o=>o.kind==='card');
 assert.ok(card);
 const increase={id:'cnt-1',actor:'local',type:'ADJUST_COUNTER',payload:{id:card.id,delta:3}};
 const decrease={id:'cnt-2',actor:'local',type:'ADJUST_COUNTER',payload:{id:card.id,delta:-1}};
 const after=replay(initial,[increase,decrease]);
 assert.equal(after.objects.find(o=>o.id===card.id).counters,2);
 assert.deepEqual(applyCommand(applyCommand(initial,increase),decrease),after);
 const zero=run(after,'ADJUST_COUNTER',{id:card.id,delta:-99},3);
 assert.equal(zero.objects.find(o=>o.id===card.id).counters,0);
 const max=run(after,'ADJUST_COUNTER',{id:card.id,delta:999},4);
 assert.equal(max.objects.find(o=>o.id===card.id).counters,999);
 assert.throws(()=>run(initial,'ADJUST_COUNTER',{id:card.id,delta:1001},5),/Invalid counter/);
 const locked={...initial,objects:initial.objects.map(o=>o.id===card.id?{...o,locked:true}:o)};
 assert.throws(()=>run(locked,'ADJUST_COUNTER',{id:card.id,delta:1},6),/locked/);
});
test('Touch menu sends TCG cards to hand, top/bottom deck and discard deterministically',()=>{
 const initial=createGame('tcg');
 const card=initial.objects.find(o=>o.kind==='card'&&o.zone==='DECK');
 assert.ok(card);
 const cardSeat=card.matSeat??0;
 const hand=run(initial,'SET_ZONE',{id:card.id,matSeat:cardSeat,zone:'HAND'},7);
 let moved=hand.objects.find(o=>o.id===card.id);
 assert.equal(moved.zone,'HAND');assert.equal(moved.owner,'local');
 assert.equal(moved.faceUp,false);assert.equal(moved.matSeat,cardSeat);
 const discard=run(hand,'SET_ZONE',{id:card.id,matSeat:cardSeat,zone:'DISCARD'},8);
 moved=discard.objects.find(o=>o.id===card.id);
 assert.equal(moved.zone,'DISCARD');assert.equal(moved.faceUp,true);
 const deckBottom=run(discard,'SET_ZONE',{id:card.id,matSeat:cardSeat,zone:'DECK',bottom:true},9);
 moved=deckBottom.objects.find(o=>o.id===card.id);
 assert.equal(moved.zone,'DECK');assert.equal(moved.faceUp,false);
 const otherOrders=deckBottom.objects.filter(o=>o.id!==card.id&&o.matSeat===cardSeat&&o.zone==='DECK').map(o=>o.order);
 assert.ok(otherOrders.every(n=>moved.order>n));
 const deckTop=run(deckBottom,'SET_ZONE',{id:card.id,matSeat:cardSeat,zone:'DECK'},10);
 moved=deckTop.objects.find(o=>o.id===card.id);
 assert.equal(moved.order,0);
 const siblings=deckTop.objects.filter(o=>o.id!==card.id&&o.matSeat===cardSeat&&o.zone==='DECK');
 assert.ok(siblings.every(o=>o.order>=1));
 const cells=tcgMatCells(cardSeat);
 const deckCell=cells.find(o=>o.row===1&&o.column===2);
 assert.equal(moved.x,deckCell.x);assert.equal(moved.y,deckCell.y);
 assert.throws(()=>run(initial,'SET_ZONE',{id:card.id,matSeat:cardSeat,zone:'INVALID'},11),/Invalid destination/);
 assert.throws(()=>run(initial,'SET_ZONE',{id:card.id,matSeat:12,zone:'HAND'},12),/Invalid destination mat/);
 const command={id:'zone-1',actor:'local',type:'SET_ZONE',payload:{
  id:card.id,matSeat:cardSeat,zone:'HAND'
 }};
 const once=applyCommand(initial,command);
 assert.deepEqual(replay(initial,[command]),once,'Zone gestures replay identically');
 assert.equal(once.seq,initial.seq+1);
});
