import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,applyCommand,tcgMatCells,playerSeatRotation,cardStackMembers
} from '../src/index.ts';

const seat=0;
const play=tcgMatCells(seat).find(cell=>cell.row===2&&cell.column===1);
const elsewhere=tcgMatCells(seat).find(cell=>cell.row===0&&cell.column===1);
const card=(id,x,y,scale=1,order=0)=>({
  id,kind:'card',name:id,x,y,zone:'TABLE',matSeat:seat,
  rotation:0,scale,order,faceUp:true,color:'#778899'
});
const action=(type,payload)=>({
  type,payload,actor:'P1',id:'test-'+type
});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<0.001,
  `Expected ${actual} to be near ${expected}`);

test('dropping a full-size card onto another centers it and places it on top',()=>{
  const table=createGame('tcg','local',false);
  table.objects=[card('base',play.x,play.y,1,25),
    card('moving',elsewhere.x,elsewhere.y,1,1)];
  const after=applyCommand(table,action('MOVE',{
    id:'moving',x:play.x+10,y:play.y+11,snapMergedSeat:seat
  }));
  const moved=after.objects.find(item=>item.id==='moving');
  near(moved.x,play.x);
  near(moved.y,play.y);
  assert.equal(moved.zone,'TABLE');
  assert.ok(moved.order>after.objects.find(o=>o.id==='base').order);
  assert.equal(cardStackMembers(after,'base').length,2);
});

test('half-size cards land in one of four quadrants of a full-size base',()=>{
  const angle=playerSeatRotation(seat),cos=Math.cos(angle),sin=Math.sin(angle);
  for(const [qx,qy] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
    const table=createGame('tcg','local',false);
    table.objects=[card('base',play.x,play.y,1),
      card('moving',elsewhere.x,elsewhere.y,.5)];
    const x=play.x+qx*11*cos-qy*14*sin;
    const y=play.y+qx*11*sin+qy*14*cos;
    const after=applyCommand(table,action('MOVE',{
      id:'moving',x,y,snapMergedSeat:seat
    }));
    const moved=after.objects.find(o=>o.id==='moving');
    near(moved.x,play.x+qx*15.5*cos-qy*22*sin);
    near(moved.y,play.y+qx*15.5*sin+qy*22*cos);
    assert.equal(moved.zone,'TABLE');
  }
});

test('dragging an entire pile onto another keeps members together above destination',()=>{
  const table=createGame('tcg','local',false);
  table.objects=[card('destination',play.x,play.y,1,8),
    card('a',elsewhere.x,elsewhere.y,1,0),
    card('b',elsewhere.x,elsewhere.y,1,1)];
  const after=applyCommand(table,action('MOVE_STACK',{
    id:'a',x:play.x+5,y:play.y+5,snapMergedSeat:seat
  }));
  for(const id of ['a','b']){
    const moved=after.objects.find(o=>o.id===id);
    near(moved.x,play.x);near(moved.y,play.y);
    assert.ok(moved.order>8);
  }
  assert.equal(cardStackMembers(after,'destination').length,3);
});

test('deck shuffling changes the actual draw order and is deterministic',()=>{
  const table=createGame('tcg');
  const before=table.objects.filter(o=>o.zone==='DECK'&&o.matSeat===seat)
    .sort((a,b)=>a.order-b.order).map(o=>o.id);
  const shuffled=applyCommand(table,action('SHUFFLE',{matSeat:seat,seed:583}));
  const after=shuffled.objects.filter(o=>o.zone==='DECK'&&o.matSeat===seat)
    .sort((a,b)=>a.order-b.order).map(o=>o.id);
  assert.notDeepEqual(after,before);
  assert.deepEqual(applyCommand(table,action('SHUFFLE',{matSeat:seat,seed:583})),shuffled);
  const drawn=applyCommand(shuffled,action('DRAW',{matSeat:seat}));
  assert.equal(drawn.objects.find(o=>o.zone==='HAND')?.id,after[0]);
});

test('two-card radial shuffle cannot return an unchanged order',()=>{
  const table=createGame('tcg');
  const before=table.objects.filter(o=>['alpha-1','alpha-2'].includes(o.id))
    .sort((a,b)=>a.order-b.order).map(o=>o.id);
  const after=applyCommand(table,action('BATCH_CARD_ACTION',{
    action:'shuffle',ids:['alpha-1','alpha-2'],seed:37
  }));
  const actual=after.objects.filter(o=>['alpha-1','alpha-2'].includes(o.id))
    .sort((a,b)=>a.order-b.order).map(o=>o.id);
  assert.deepEqual(actual,[...before].reverse());
});
