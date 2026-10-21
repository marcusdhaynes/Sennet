import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createGame,minimalCoinChange,replay,playerSeatRotation,cardContainsPoint}
  from '../src/index.ts';

const action=(state,type,payload,id='t-1')=>
  applyCommand(state,{id,actor:'local',type,payload});
const coins=(state,id)=>state.objects.filter(o=>o.tokenCoin&&o.carrierId===id);
const total=(pieces)=>pieces.reduce((sum,c)=>sum+(c.tokenSign??1)*(c.value??0),0);

test('coin change is exact, minimal and deterministic with user custom values',()=>{
  assert.deepEqual(minimalCoinChange(60,1),[50,10]);
  assert.deepEqual(minimalCoinChange(80,1),[50,30]);
  assert.deepEqual(minimalCoinChange(17,7),[10,7]);
  assert.deepEqual(minimalCoinChange(0,3),[]);
  assert.deepEqual(minimalCoinChange(3,7),[3]);
});
test('a selected card combines additions and deductions as few coins as possible',()=>{
  let state=createGame('tcg');
  state=action(state,'TOKEN_ADJUST',{ids:['hero-a'],value:30,sign:1,custom:1,seat:0},'plus30');
  state=action(state,'TOKEN_ADJUST',{ids:['hero-a'],value:20,sign:1,custom:1,seat:0},'plus20');
  assert.deepEqual(coins(state,'hero-a').map(c=>c.value),[50]);
  state=action(state,'TOKEN_ADJUST',{ids:['hero-a'],value:100,sign:-1,custom:1,seat:0},'minus100');
  assert.deepEqual(coins(state,'hero-a').map(c=>c.value),[50]);
  assert.equal(total(coins(state,'hero-a')),-50);
  state=action(state,'TOKEN_ADJUST',{ids:['hero-a'],value:50,sign:1,custom:1,seat:0},'plus50');
  assert.equal(coins(state,'hero-a').length,0);
});
test('drag-generated copies attach and follow their cards through replay',()=>{
  const initial=createGame('tcg');
  const card=initial.objects.find(o=>o.id==='hero-a');
  assert.ok(card);
  const commands=[
    {id:'token-copy',actor:'local',type:'TOKEN_PLACE',payload:{
      value:20,sign:-1,x:card.x+12,y:card.y-12,seat:0,carrierId:card.id
    }},
    {id:'card-move',actor:'local',type:'MOVE',payload:{
      id:card.id,x:card.x+70,y:card.y+50
    }}
  ];
  const state=commands.reduce((state,command)=>applyCommand(state,command),initial);
  const child=state.objects.find(o=>o.id==='token-copy-coin');
  const moved=state.objects.find(o=>o.id==='hero-a');
  assert.ok(child);assert.ok(moved);
  assert.equal(child.carrierId,'hero-a');
  assert.equal(child.tokenSign,-1);
  assert.equal(child.value,20);
  assert.equal(Math.round(child.x-(moved.x-card.x)),Math.round(card.x+12));
  assert.equal(Math.round(child.y-(moved.y-card.y)),Math.round(card.y-12));
  assert.deepEqual(state,replay(initial,commands));
});
test('multi-selected cards each get their own distinct serialized coins',()=>{
  const state=action(createGame('tcg'),'TOKEN_ADJUST',{
    ids:['hero-a','hero-b'],value:10,sign:1,custom:1,seat:0
  },'multi');
  assert.equal(coins(state,'hero-a').length,1);
  assert.equal(coins(state,'hero-b').length,1);
  assert.notEqual(coins(state,'hero-a')[0].id,coins(state,'hero-b')[0].id);
});

const pointOn=(card,lx,ly)=>{
  const angle=playerSeatRotation(card.matSeat??0)+card.rotation*Math.PI/180;
  const scale=card.scale??1;
  return {x:card.x+scale*(lx*Math.cos(angle)-ly*Math.sin(angle)),
    y:card.y+scale*(lx*Math.sin(angle)+ly*Math.cos(angle))};
};
const near=(x,y,message)=>assert.ok(Math.abs(x-y)<1e-5,message+': '+x+' != '+y);

test('a small piece is attached only if its CENTER is inside the rotated card',()=>{
  let state=createGame('tcg');
  state=action(state,'ROTATE',{id:'hero-a',degrees:45},'rotate-first');
  const card=state.objects.find(o=>o.id==='hero-a');
  const inside=pointOn(card,30.6,43.6),outside=pointOn(card,31.2,0);
  assert.ok(cardContainsPoint(card,inside.x,inside.y));
  assert.ok(!cardContainsPoint(card,outside.x,outside.y));
  state=action(state,'ADD',{object:{
    id:'chip',kind:'token',name:'Chip',x:1000,y:1000,rotation:0,
    faceUp:true,color:'#ffffff',zone:'TABLE',order:500
  }},'add-chip');
  state=action(state,'MOVE',{id:'chip',...inside},'move-inside');
  let chip=state.objects.find(o=>o.id==='chip');
  near(chip.x,inside.x,'precise X');near(chip.y,inside.y,'precise Y');
  assert.equal(chip.carrierId,'hero-a');
  state=action(state,'MOVE',{id:'chip',...outside},'move-outside');
  chip=state.objects.find(o=>o.id==='chip');
  near(chip.x,outside.x,'outside X');near(chip.y,outside.y,'outside Y');
  assert.equal(chip.carrierId,undefined,'partial overlap without center does not attach');
});
test('drag-created coins never jump to a card center or other grid location',()=>{
  const state=createGame('tcg');
  const card=state.objects.find(o=>o.id==='hero-a');
  const spot=pointOn(card,23.125,-31.75);
  const attached=action(state,'TOKEN_PLACE',{
    seat:0,value:50,sign:1,...spot,carrierId:card.id
  },'mint');
  const coin=attached.objects.find(o=>o.id==='mint-coin');
  near(coin.x,spot.x,'mint X');near(coin.y,spot.y,'mint Y');
  assert.equal(coin.carrierId,card.id);
  assert.notEqual(coin.x,card.x);
  assert.notEqual(coin.y,card.y);
  assert.throws(()=>action(state,'TOKEN_PLACE',{
    seat:0,value:50,sign:1,x:card.x+500,y:card.y+500,carrierId:card.id
  },'invalid-mint'),/center must be inside/);
  const free=action(state,'TOKEN_PLACE',{
    seat:0,value:20,sign:-1,x:card.x+78.375,y:card.y+69.25
  },'free-mint').objects.find(o=>o.id==='free-mint-coin');
  near(free.x,card.x+78.375,'free X');near(free.y,card.y+69.25,'free Y');
  assert.equal(free.carrierId,undefined);
});
test('coins and similar loose objects retain their offsets on move, rotate, scale',()=>{
  let state=createGame('tcg');
  const card=state.objects.find(o=>o.id==='hero-a');
  const spot=pointOn(card,17,-29);
  state=action(state,'TOKEN_PLACE',{seat:0,value:30,sign:1,
    ...spot,carrierId:card.id},'create-coin');
  state=action(state,'ADD',{object:{id:'small-die',kind:'die',name:'D6',
    x:1000,y:1000,rotation:0,faceUp:true,zone:'TABLE',order:300,color:'#ffffff'
  }},'create-die');
  const dieSpot=pointOn(card,-22,36);
  state=action(state,'MOVE',{id:'small-die',...dieSpot},'attach-die');
  const original=state.objects.find(o=>o.id==='create-coin-coin');
  const dieOriginal=state.objects.find(o=>o.id==='small-die');
  assert.equal(dieOriginal.carrierId,card.id);
  // Group movement changes only the parent; both carried objects follow it.
  state=action(state,'MOVE',{id:card.id,x:card.x+80,y:card.y+97},'move-card');
  let nextCard=state.objects.find(o=>o.id===card.id);
  let coin=state.objects.find(o=>o.id==='create-coin-coin');
  let die=state.objects.find(o=>o.id==='small-die');
  near(coin.x-nextCard.x,original.x-card.x,'move coin dx');
  near(die.y-nextCard.y,dieOriginal.y-card.y,'move die dy');
  state=action(state,'ROTATE',{id:card.id,degrees:90},'rotate-card');
  nextCard=state.objects.find(o=>o.id===card.id);
  coin=state.objects.find(o=>o.id==='create-coin-coin');
  die=state.objects.find(o=>o.id==='small-die');
  near(coin.x-nextCard.x,-(original.y-card.y),'rotated coin dx');
  near(coin.y-nextCard.y,original.x-card.x,'rotated coin dy');
  near(die.x-nextCard.x,-(dieOriginal.y-card.y),'rotated die dx');
  state=action(state,'BATCH_CARD_ACTION',{ids:[card.id],action:'scale-bigger'},'scale-card');
  nextCard=state.objects.find(o=>o.id===card.id);
  coin=state.objects.find(o=>o.id==='create-coin-coin');
  near(coin.x-nextCard.x,-1.5*(original.y-card.y),'scaled coin dx');
  near(coin.y-nextCard.y,1.5*(original.x-card.x),'scaled coin dy');
  assert.equal(coin.carrierId,card.id);
  assert.equal(die.carrierId,card.id);
});
test('a selected coin moves freely, and detaches only when its CENTER leaves a card',()=>{
  let state=createGame('tcg');
  const card=state.objects.find(o=>o.id==='hero-a');
  state=action(state,'TOKEN_PLACE',{seat:0,value:20,sign:1,...pointOn(card,12,8),
    carrierId:card.id},'coin-for-selection');
  const coin=state.objects.find(o=>o.id==='coin-for-selection-coin');
  const inside=pointOn(card,-18,17);
  state=action(state,'BATCH_CARD_ACTION',{ids:[coin.id],action:'move',anchorId:coin.id,
    x:inside.x,y:inside.y,snapMerged:true,snapMergedSeat:0},'move-selected-coin');
  let moved=state.objects.find(o=>o.id===coin.id);
  near(moved.x,inside.x,'selected free X');
  near(moved.y,inside.y,'selected free Y');
  assert.equal(moved.carrierId,card.id);
  const outside=pointOn(card,32.5,0);
  state=action(state,'BATCH_CARD_ACTION',{ids:[coin.id],action:'move',anchorId:coin.id,
    x:outside.x,y:outside.y,snapMerged:true,snapMergedSeat:0},'move-selected-away');
  moved=state.objects.find(o=>o.id===coin.id);
  near(moved.x,outside.x,'detached X');
  near(moved.y,outside.y,'detached Y');
  assert.equal(moved.carrierId,undefined);
});
test('card-zone changes preserve the physical coin association',()=>{
  let state=createGame('tcg');
  const card=state.objects.find(o=>o.id==='hero-a');
  state=action(state,'TOKEN_PLACE',{seat:0,value:10,sign:1,
    ...pointOn(card,12,12),carrierId:card.id},'coin-persist');
  state=action(state,'SET_ZONE',{id:card.id,zone:'HAND',matSeat:0},'card-to-hand');
  assert.equal(state.objects.find(o=>o.id==='coin-persist-coin').carrierId,card.id);
  assert.equal(state.objects.find(o=>o.id==='coin-persist-coin').x,
    state.objects.find(o=>o.id===card.id).x+
    (pointOn(card,12,12).x-card.x));
});

test('newly added and duplicated accessories determine attachment by their center',()=>{
  let state=createGame('tcg');
  const card=state.objects.find(o=>o.id==='hero-a');
  const where=pointOn(card,20,15);
  state=action(state,'ADD',{object:{id:'new-die',kind:'die',name:'New die',
    ...where,rotation:0,faceUp:true,color:'#ffffff',zone:'TABLE',order:900
  }},'new-die-add');
  assert.equal(state.objects.find(o=>o.id==='new-die').carrierId,card.id);
  state=action(state,'CLONE',{id:'new-die',newId:'new-die-clone'},'clone-die');
  const duplicate=state.objects.find(o=>o.id==='new-die-clone');
  assert.equal(duplicate.carrierId,undefined,
    'a clone must not inherit an attachment when its center is outside');
  near(duplicate.x,where.x+45,'copy X is not magnetized');
  near(duplicate.y,where.y+40,'copy Y is not magnetized');
});
test('rotating an attached coin on its own does not get cancelled by its carrier',()=>{
  let state=createGame('tcg');
  const card=state.objects.find(o=>o.id==='hero-a');
  const where=pointOn(card,18,15);
  state=action(state,'TOKEN_PLACE',{seat:0,value:10,sign:1,
    ...where,carrierId:card.id},'self-rotate');
  state=action(state,'ROTATE',{id:'self-rotate-coin',degrees:90},'self-rotate-action');
  const coin=state.objects.find(o=>o.id==='self-rotate-coin');
  assert.equal(coin.rotation,90);
  near(coin.x,where.x,'self rotation X');
  near(coin.y,where.y,'self rotation Y');
  assert.equal(coin.carrierId,card.id);
});
