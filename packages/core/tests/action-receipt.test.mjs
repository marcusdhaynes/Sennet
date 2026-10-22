import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createGame,replay} from '../src/index.ts';
import {receiptForCommand,receiptTimestamp,mergeReceipt,parseReplayFile,RECEIPT_SCHEMA}
  from '../../../apps/web/src/lib/actionReceipt.ts';

test('receipt date and exact 12-hour time use YYYYMMDD and HHMMSSTT',()=>{
  const moment=new Date(2026,9,22,6,52,39).getTime();
  assert.deepEqual(receiptTimestamp(moment),{date:'20261022',time:'065239AM'});
  assert.equal(receiptTimestamp(new Date(2026,9,22,0,0,0).getTime()).time,'120000AM');
  assert.equal(receiptTimestamp(new Date(2026,9,22,12,34,56).getTime()).time,'123456PM');
  assert.equal(receiptTimestamp(new Date(2026,9,22,23,59,59).getTime()).time,'115959PM');
});

test('move receipt shows the exact old and new coordinates',()=>{
  const initial=createGame('tcg');
  const target=initial.objects.find(x=>x.id==='hero-a');
  assert.ok(target);
  const event={id:'move-a',actor:'local',type:'MOVE',
    payload:{id:target.id,x:target.x+43,y:target.y-17},
    seq:initial.seq+1,at:1_792_656_759_000};
  const moved=applyCommand(initial,event);
  const row=receiptForCommand(event,initial,moved);
  assert.equal(row.type,'Move');
  assert.match(row.location, / → /);
  assert.ok(row.location.includes(Math.round(target.x)+','+Math.round(target.y)));
  assert.ok(row.location.includes(Math.round(target.x+43)+','+Math.round(target.y-17)));
  assert.ok(row.description.length>0);
  assert.equal(row.commandId,event.id);
});

test('versioned receipt restores deterministic replay plus undo/redo cursor',()=>{
  const initial=createGame('tcg');
  const target=initial.objects.find(x=>x.id==='hero-a');
  assert.ok(target);
  const mk=(id,seq,x)=>({id,actor:'local',type:'MOVE',
    payload:{id:target.id,x,y:target.y},seq,at:1_792_656_759_000+seq*1000});
  const first=mk('first',initial.seq+1,target.x+20);
  const second=mk('second',initial.seq+2,target.x+35);
  const state=applyCommand(initial,first);
  const ui={id:'ui-drawer',at:first.at+25,type:'Expand',location:'Right drawer',
    description:'Open drawer'};
  const parsed=parseReplayFile({schema:RECEIPT_SCHEMA,id:'saved',initial,
    history:[first],redoStack:[second],receipt:[ui],seat:0});
  assert.deepEqual(parsed.game,state);
  assert.deepEqual(parsed.redoStack,[second]);
  assert.ok(parsed.receipt.some(r=>r.id==='ui-drawer'));
  assert.ok(parsed.receipt.some(r=>r.commandId==='first'));
  assert.deepEqual(replay(parsed.initial,[...parsed.history,...parsed.redoStack.reverse()]),
    applyCommand(state,second));
});

test('reject missing, duplicate, or reordered actions instead of corrupting replay',()=>{
  const initial=createGame('tcg');
  const target=initial.objects.find(x=>x.id==='hero-a');
  assert.ok(target);
  const first={id:'first',actor:'local',type:'MOVE',
    payload:{id:target.id,x:target.x+20,y:target.y},
    seq:initial.seq+1,at:1_792_656_759_000};
  const input={schema:RECEIPT_SCHEMA,initial,history:[first]};
  assert.throws(()=>parseReplayFile({...input,history:[{...first,seq:initial.seq+4}]}),
    /missing|duplicated|reordered/);
  assert.throws(()=>parseReplayFile({...input,history:[first,first]}),
    /missing|duplicated|reordered/);
  assert.throws(()=>parseReplayFile({...input,redoStack:[{...first,seq:first.seq+1}]}),
    /incompatible/);
  assert.deepEqual(mergeReceipt(undefined,initial,[first]).map(r=>r.type),['Move']);
});
