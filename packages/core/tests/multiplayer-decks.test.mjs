import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createGame,projectForActor,tcgMatCells} from '../src/index.ts';

test('new TCG pickup tables start with zero cards, while test fixtures remain available',()=>{
  const live=createGame('tcg','pickup-room',false);
  assert.deepEqual(live.objects,[]);
  assert.ok(createGame('tcg').objects.length>0);
});

test('multiplayer deck upload inserts only the owners cards at their saved seat',()=>{
  let state=createGame('tcg','pickup-room',false);
  state={...state,players:[
    {id:'player_a',seat:2,name:'A',online:true},
    {id:'player_b',seat:5,name:'B',online:true}
  ]};
  const cell=tcgMatCells(2).find(c=>c.column===2&&c.row===1);
  const raw=Array.from({length:12},(_,i)=>({
    id:'a-'+i,kind:'card',name:'Private '+i,x:cell.x,y:cell.y,matSeat:2,
    faceUrl:'https://example.org/cards/'+i+'.png',faceUp:false,
    zone:'DECK',color:'#aabbee',rotation:0,order:i
  }));
  const command={id:'upload-1',actor:'player_a',type:'ADD_MANY',payload:{objects:raw}};
  state=applyCommand(state,command);
  assert.equal(state.objects.length,12);
  assert.ok(state.objects.every(o=>o.owner==='player_a'&&o.matSeat===2));
  assert.equal(projectForActor(state,'player_b').objects[0].name,'Face-down card');
  assert.equal(projectForActor(state,'player_b').objects[0].faceUrl,undefined);
  assert.equal(projectForActor(state,'player_a').objects[0].name,'Face-down card');
  assert.throws(()=>applyCommand(state,{...command,id:'upload-2'}),/Duplicate deck card ID/);
  assert.throws(()=>applyCommand(state,{...command,id:'upload-3',actor:'player_b'}),/Invalid deck card or seat/);
});
