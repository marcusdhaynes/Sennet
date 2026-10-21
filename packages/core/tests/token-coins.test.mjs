import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createGame,minimalCoinChange,replay,tcgMatWorld}
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
