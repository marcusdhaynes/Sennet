// Run after: node --experimental-strip-types --test packages/core/tests/*.test.mjs (Node >=22.16)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyCommand,replay,nearestFrameIndex,projectForActor,parseGamePack} from '../src/index.ts';
const c=(type,payload={},actor='P1')=>({id:`${type}-${Math.random()}`,actor,type,payload});
test('12-seat angular sprite selection wraps correctly',()=>{
  assert.equal(nearestFrameIndex(0,0,12),0);
  assert.equal(nearestFrameIndex(1,0,12),1);
  assert.equal(nearestFrameIndex(11,0,12),11);
  assert.equal(nearestFrameIndex(3,90,24),0);
});
test('commands replay deterministically',()=>{
  const start=createGame('sandbox');
  const actions=[c('MOVE',{id:'token-moon',x:620,y:275}),c('ROTATE',{id:'token-moon',degrees:45}),c('FLIP',{id:'card-demo'}),c('ROLL',{id:'die-d6',seed:123456})];
  assert.deepEqual(replay(start,actions),actions.reduce((s,a)=>applyCommand(s,a),start));
  assert.equal(replay(start,actions).seq,4);
});
test('invalid or locked movement is rejected',()=>{
  assert.throws(()=>applyCommand(createGame('sandbox'),c('MOVE',{id:'nonexistent',x:500})),/does not exist/);
  assert.throws(()=>applyCommand(createGame('boardgame'),c('MOVE',{id:'game-board',x:500})),/locked/);
});
test('private hand details are redacted for other actors',()=>{
  let s=createGame('tcg');s=applyCommand(s,c('DRAW',{prefix:'alpha'}));
  const card=s.objects.find(o=>o.zone==='HAND');assert.ok(card);
  const privateView=projectForActor(s,'P2').objects.find(o=>o.id===card.id);
  assert.equal(privateView?.name,'Hidden card');
  assert.equal(projectForActor(s,'P1').objects.find(o=>o.id===card.id)?.name,card.name);
});
test('pack sanitization disallows javascript assets',()=>{
  const p=parseGamePack({schema:'sennet.pack/1',id:'foo',name:'Foo',objects:[{id:'x',kind:'miniature',name:'X',faceUrl:'javascript:alert(1)',frameUrls:['https://example.org/x.png','file:///etc/passwd']}]});
  assert.equal(p.objects[0].faceUrl,undefined);
  assert.deepEqual(p.objects[0].frameUrls,['https://example.org/x.png']);
});

test('event protocol rejects nondeterministic object IDs',()=>{
  assert.throws(()=>applyCommand(createGame('sandbox'),c('ADD',{object:{kind:'token',name:'X'}})),/Object ID required/);
  assert.throws(()=>applyCommand(createGame('sandbox'),c('CLONE',{id:'token-moon'})),/Clone ID required/);
});
