import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,applyCommand,replay,tcgMatCells,tcgMatLocal,tcgMatWorld,
  tcgMatRegions,centerMergeKey,tcgPlacementPoint,tcgCardZoneHalfExtents,
  normalizePlaymatAppearance,defaultPlaymatAppearance,TCG_MAT
} from '../src/index.ts';
import {receiptForCommand} from '../../../apps/web/src/lib/actionReceipt.ts';

const seat=0;
const cell=(row)=>tcgMatCells(seat).find(c=>c.column===1&&c.row===row);
const local=(p)=>tcgMatLocal(p.x,p.y,seat);
const world=(x,y)=>tcgMatWorld(x,y,seat);
const close=(a,b,eps=.00001)=>assert.ok(Math.abs(a-b)<=eps,a+' != '+b);

test('free-placement preference defaults to OFF and migrates old player appearance',()=>{
  assert.equal(defaultPlaymatAppearance().freePlacement,false);
  assert.equal(normalizePlaymatAppearance({snapMerged:true}).freePlacement,false);
  assert.equal(normalizePlaymatAppearance({freePlacement:true}).freePlacement,true);
});

test('unmerged PLAY and HAND have freely chosen horizontal x and a fixed y center',()=>{
  for(const row of [0,1,2,3]){
    const c=cell(row),p=local(c);
    for(const offset of [13.5,36.7,-25.4]){
      const query=world(p.x+offset,p.y+1.8);
      const dest=tcgPlacementPoint(query.x,query.y,[],false,seat,1,true);
      assert.ok(dest?.freePlacement);
      const q=local(dest);
      close(q.x,p.x+offset);close(q.y,p.y);
      assert.equal(dest.row,row);assert.equal(dest.lastRow,row);
    }
  }
});

test('unmerged horizontal drop outside zone clamps entire card inside nearest permissible slot',()=>{
  const c=cell(2),p=local(c);
  const dest=tcgPlacementPoint(...Object.values(world(p.x+c.width/2+5,p.y)),[],false,seat,1,true);
  assert.ok(dest?.freePlacement);
  const q=local(dest);
  close(q.x,p.x+c.width/2-TCG_MAT.cardWidth/2);
  close(q.y,p.y);
});

test('merged PLAY zone permits arbitrary x/y with entire card contained',()=>{
  const merged=[centerMergeKey(seat,1)],region=tcgMatRegions(seat,merged)
    .find(c=>c.column===1&&c.row===1);
  assert.ok(region);
  const center=local(region);
  const original=world(center.x+51.25,center.y+21.75);
  const dest=tcgPlacementPoint(original.x,original.y,merged,false,seat,1,true);
  assert.ok(dest?.freePlacement);
  close(local(dest).x,center.x+51.25);
  close(local(dest).y,center.y+21.75);
  const outside=world(center.x+region.width/2+11,center.y+region.height/2+8);
  const constrained=tcgPlacementPoint(outside.x,outside.y,merged,false,seat,1,true);
  assert.ok(constrained?.freePlacement);
  const q=local(constrained),ext=tcgCardZoneHalfExtents();
  close(q.x,center.x+region.width/2-ext.x);
  close(q.y,center.y+region.height/2-ext.y);
});

test('a rotated card must fit within bounds using its whole rotated footprint',()=>{
  const merged=[centerMergeKey(seat,0)];
  const zone=tcgMatRegions(seat,merged).find(r=>r.column===1&&r.row===0);
  assert.ok(zone);
  const center=local(zone);
  const edge=world(center.x+zone.width/2+4,center.y+zone.height/2+3);
  const pos=tcgPlacementPoint(edge.x,edge.y,merged,false,seat,1,true,90);
  assert.ok(pos);
  const actual=local(pos),half=tcgCardZoneHalfExtents(1,90);
  assert.ok(actual.x+half.x<=center.x+zone.width/2+1e-6);
  assert.ok(actual.y+half.y<=center.y+zone.height/2+1e-6);
});

test('snapping enabled retains exact half-slot anchors',()=>{
  const c=cell(2),center=local(c);
  const candidate=world(center.x+(3.5-3)*c.width/TCG_MAT.centerCards,center.y);
  const result=tcgPlacementPoint(candidate.x,candidate.y,[],false,seat,1,false);
  assert.ok(result);
  assert.equal(result.slot,3.5);
  assert.equal(result.freePlacement,undefined);
});

test('command replay and zone-based Action Log use free placement percentages',()=>{
  const initial=createGame('tcg');
  const hero=initial.objects.find(o=>o.id==='hero-a');assert.ok(hero);
  const desired=local(cell(2));
  const query=world(desired.x+22.3,desired.y+1);
  const evt={id:'test-free-command',actor:'local',type:'MOVE',
    payload:{id:hero.id,x:query.x,y:query.y,snapMergedSeat:seat,
      snapMerged:false,freePlacement:true},seq:initial.seq+1,at:1792651959000};
  const next=applyCommand(initial,evt);
  const after=next.objects.find(o=>o.id===hero.id);assert.ok(after);
  close(local(after).x,desired.x+22.3);
  close(local(after).y,desired.y);
  assert.deepEqual(replay(initial,[evt]),next);
  const loc=receiptForCommand(evt,initial,next).location;
  assert.match(loc,/PLAY 01/);
  assert.match(loc,/\([0-9]+%, [0-9]+%\)/);
  const snappedEvent={...evt,id:'test-slot-command',payload:{...evt.payload,freePlacement:false}};
  const snapped=applyCommand(initial,snappedEvent);
  const slotLoc=receiptForCommand(snappedEvent,initial,snapped).location;
  assert.match(slotLoc,/PLAY 01/);
  assert.match(slotLoc,/\([0-9.]+, [0-9.]+\)/);
  assert.doesNotMatch(slotLoc,/%/);
});
