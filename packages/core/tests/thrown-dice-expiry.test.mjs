import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand,createGame,expireThrownDice,replay,
  thrownDieDeadlines,THROWN_DIE_LIFETIME_MS
} from '../src/index.ts';

const startedAt=1_750_000_000_000;
const fresh=()=>({...createGame('tcg'),objects:[]});
const thrown=(sides=6,expiry=startedAt+THROWN_DIE_LIFETIME_MS)=>({
  id:'new-roll',actor:'local',type:'THROW_TRAY',
  payload:{seat:0,expiresAt:expiry,throws:[{
    sides,rolls:[1],x:2000,y:2000,rotation:0
  }]}
});
const record=(command,at=startedAt)=>({...command,seq:1,at});

test('thrown die is present until, but not at, its ten-second expiry',()=>{
  const game=applyCommand(fresh(),thrown());
  assert.equal(game.objects.length,1);
  assert.equal(game.objects[0].throwExpiresAt,startedAt+10_000);
  assert.equal(expireThrownDice(game,startedAt+9_999).objects.length,1);
  assert.equal(expireThrownDice(game,startedAt+10_000).objects.length,0);
});
test('flipcoins obey identical expiry and do not remove regular dice',()=>{
  const initial=fresh();
  initial.objects.push({
    id:'permanent-die',kind:'die',name:'Source',x:40,y:40,rotation:0,
    zone:'TABLE',order:0,faceUp:true,color:'#cbd7d5',sides:6,value:1
  });
  const game=applyCommand(initial,thrown(2));
  assert.equal(game.objects.find(o=>o.throwDice).sides,2);
  const gone=expireThrownDice(game,startedAt+10_000);
  assert.deepEqual(gone.objects.map(o=>o.id),['permanent-die']);
});
test('REROLL_DIE restarts exactly ten seconds without spawning a new die',()=>{
  let game=applyCommand(fresh(),thrown());
  game=applyCommand(game,{
    id:'reroll',actor:'local',type:'REROLL_DIE',
    payload:{id:'new-roll-throw-0',rolls:[4],x:1900,y:1900,rotation:50,
      expiresAt:startedAt+18_000}
  });
  assert.equal(game.objects[0].throwExpiresAt,startedAt+18_000);
  assert.equal(expireThrownDice(game,startedAt+10_000).objects.length,1);
  assert.equal(expireThrownDice(game,startedAt+18_000).objects.length,0);
});
test('expired throws cannot be resurrected by restoring JSON or replaying undo',()=>{
  const original=thrown();
  const game=applyCommand(fresh(),original);
  const fromStorage=JSON.parse(JSON.stringify({game,history:[record(original)]}));
  assert.equal(expireThrownDice(fromStorage.game,startedAt+10_001,
    fromStorage.history).objects.length,0);
  assert.equal(expireThrownDice(replay(fresh(),[original]),startedAt+10_001,
    [record(original)]).objects.length,0);
});
test('legacy throws use historical event time; missing history expires safely',()=>{
  const oldCommand=thrown();
  delete oldCommand.payload.expiresAt;
  const legacy=applyCommand(fresh(),oldCommand);
  assert.equal(legacy.objects[0].throwExpiresAt,undefined);
  const log=[record(oldCommand)];
  assert.equal(thrownDieDeadlines(legacy,log).get('new-roll-throw-0'),
    startedAt+THROWN_DIE_LIFETIME_MS);
  assert.equal(expireThrownDice(legacy,startedAt+9_999,log).objects.length,1);
  assert.equal(expireThrownDice(legacy,startedAt+10_000,log).objects.length,0);
  assert.equal(expireThrownDice(legacy,startedAt+1,[]).objects.length,0);
});
