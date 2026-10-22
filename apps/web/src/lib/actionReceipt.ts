import {applyCommand,replay,tcgMatLocal,tcgMatRegions,tcgRegionLabel,TCG_MAT,
  type TcgMatRegion,type EventRecord,type GameState,type TableObject} from '@sennet/core';

/** Human-readable audit rows are presentation only. The authoritative replay
 * always uses initial + ordered EventRecord commands, never these summaries. */
export interface ReceiptRow {
  id:string;at:number;type:string;location:string;description:string;
  commandId?:string;
}
export const RECEIPT_SCHEMA='sennet.replay/2' as const;

const pad=(n:number,w=2)=>String(n).padStart(w,'0');
export function receiptTimestamp(at:number):{date:string;time:string}{
  if(!Number.isFinite(at)||at<=0)return {date:'--------',time:'--------'};
  const d=new Date(at);
  if(!Number.isFinite(d.getTime()))return {date:'--------',time:'--------'};
  const hour=d.getHours();
  return {
    date:pad(d.getFullYear(),4)+pad(d.getMonth()+1)+pad(d.getDate()),
    time:pad(hour%12||12)+pad(d.getMinutes())+pad(d.getSeconds())+
      (hour>=12?'PM':'AM')
  };
}
const cap=(s:string)=>s.replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const string=(v:unknown)=>typeof v==='string'?v:'';
const obj=(s:GameState,id:string)=>s.objects.find(o=>o.id===id);
const at=(o:TableObject|null|undefined,merged:readonly number[],
  freePlacement:boolean,snapMerged:boolean):string=>{
  if(!o)return '';
  // Snap position or % is local to the ACTUAL owning mat, never a world
  // coordinate. Merged regions use the entire combined zone footprint.
  if(typeof o.matSeat==='number'&&o.matSeat>=0&&o.matSeat<12){
    const point=tcgMatLocal(o.x,o.y,o.matSeat);
    const regions=tcgMatRegions(o.matSeat,merged);
    let candidate:TcgMatRegion|null=null,best=Infinity;
    for(const region of regions){
      const anchor=tcgMatLocal(region.x,region.y,o.matSeat);
      const d=Math.hypot(Math.max(0,Math.abs(point.x-anchor.x)-region.width/2),
        Math.max(0,Math.abs(point.y-anchor.y)-region.height/2));
      if(d<best){best=d;candidate=region;}
    }
    if(candidate&&best<Math.max(TCG_MAT.snapOutside,6)){
      const r=candidate,center=tcgMatLocal(r.x,r.y,o.matSeat);
      const zone=tcgRegionLabel(r.row,r.column,r.lastRow);
      const free=freePlacement&&r.column===1||
        r.column===1&&r.lastRow>r.row&&!snapMerged;
      const coord=free?(()=>{
        const x=100*(point.x-(center.x-r.width/2))/r.width;
        const y=100*(point.y-(center.y-r.height/2))/r.height;
        return '('+Math.round(Math.max(0,Math.min(100,x)))+'%, '+
          Math.round(Math.max(0,Math.min(100,y)))+'%)';
      })():(()=>{
        // Original card slots are x=1..7, half slots use .5.
        const rawX=r.column===1?
          1+(point.x-center.x)/(r.width/TCG_MAT.centerCards)+
            (TCG_MAT.centerCards-1)/2:1;
        const x=Math.max(1,Math.min(TCG_MAT.centerCards,
          Math.round(rawX*2)/2));
        // Within a merged zone the row and half-row are expressed
        // relative to that zone's first original row.
        const topRow=center.y-(r.lastRow-r.row)*(TCG_MAT.rowHeight+TCG_MAT.gap)/2;
        const rawY=1+(point.y-topRow)/(TCG_MAT.rowHeight+TCG_MAT.gap);
        const y=Math.max(1,Math.min(r.lastRow-r.row+1,
          Math.round(rawY*2)/2));
        return '('+x+', '+y+')';
      })();
      return 'P'+(o.matSeat+1)+' · '+zone+' '+coord;
    }
  }
  return (o.zone!=='TABLE'?o.zone:'Table')+
    (typeof o.matSeat==='number'?' · P'+(o.matSeat+1):'');
};
const locOf=(before:TableObject|null|undefined,after:TableObject|null|undefined,
  mergedBefore:readonly number[],mergedAfter:readonly number[],
  freePlacement:boolean,snapMerged:boolean)=>{
  const from=at(before,mergedBefore,freePlacement,snapMerged);
  const to=at(after,mergedAfter,freePlacement,snapMerged);
  if(from&&to&&from!==to)return from+' → '+to;
  return to||from||'Table';
};
function names(items:TableObject[],hidden=false):string{
  return hidden?'Hidden card':items.length>2?
    items.length+' objects':items.map(o=>o.name||o.kind).join(', ');
}
const actionTypes:Record<string,string>={
  ADD:'Add',MOVE:'Move',MOVE_STACK:'Move',SET_CENTER_MERGE:'Merge',
  ROTATE:'Rotate',FLIP:'Flip',DELETE:'Delete',CLONE:'Duplicate',
  ROLL:'Roll',DRAW:'Draw',SHUFFLE:'Shuffle',NEXT_TURN:'Turn',
  SET_MODE:'Mode',ADJUST_COUNTER:'Counter',SET_ZONE:'Move',
  BATCH_CARD_ACTION:'Action',TOKEN_PLACE:'Add',TOKEN_ADJUST:'Counter',
  THROW_TRAY:'Roll',COIN_MODIFY:'Modify',REROLL_DIE:'Reroll'
};
/** All command types retain their raw payload in the session file.
 * The receipt is deliberately compact and is computed from true snapshots. */
export function receiptForCommand(
  event:EventRecord,before:GameState,after:GameState
):ReceiptRow{
  const p=event.payload;
  const ids=[string(p.id),...(
    Array.isArray(p.ids)?p.ids.filter((x):x is string=>typeof x==='string'):[]
  )].filter(Boolean);
  const created=p.object&&typeof p.object==='object'?p.object as Partial<TableObject>:null;
  if(created?.id&&!ids.includes(created.id))ids.push(created.id);
  if(typeof p.newId==='string'&&!ids.includes(p.newId))ids.push(p.newId);
  const old=ids.map(id=>obj(before,id)).filter((o):o is TableObject=>!!o);
  const now=ids.map(id=>obj(after,id)).filter((o):o is TableObject=>!!o);
  const original=old[0],updated=now[0];
  const action=string(p.action);
  let type=actionTypes[event.type]??cap(event.type);
  if(event.type==='BATCH_CARD_ACTION'&&action){
    const named:Record<string,string>={move:'Move',expand:'Expand',
      collapse:'Collapse','scale-up':'Expand','scale-down':'Collapse',
      'deck-top':'Move','deck-bottom':'Move',duplicate:'Duplicate',
      remove:'Delete',tap:'Rotate',untap:'Rotate'};
    type=named[action]??cap(action);
  }
  const freePlacement=p.freePlacement===true;
  const snapMerged=p.snapMerged===true;
  let location=locOf(original,updated,before.centerMerges??[],
    after.centerMerges??[],freePlacement,snapMerged);
  if(ids.length>1&&event.type==='BATCH_CARD_ACTION'&&action==='move'){
    const from=[...new Set(old.map(o=>at(o,before.centerMerges??[],
      freePlacement,snapMerged)))].filter(Boolean).join(' + ');
    const to=[...new Set(now.map(o=>at(o,after.centerMerges??[],
      freePlacement,snapMerged)))].filter(Boolean).join(' + ');
    location=from&&to&&from!==to?from+' → '+to:to||from||location;
  }
  let description=names(now.length?now:old);
  if(event.type==='ADD'&&created)description=created.name||created.kind||'Object';
  if(event.type==='MOVE_STACK')description=(description||'Stack')+' · Stack';
  if(event.type==='TOKEN_PLACE'){
    location=now.length?at(now[0],after.centerMerges??[],freePlacement,snapMerged):
      'P'+(Number(p.seat??0)+1)+' · Table';
    description='Coin '+(num(p.value)??'');
  }
  if(event.type==='THROW_TRAY'){
    const throws=Array.isArray(p.throws)?p.throws:[];
    description=throws.map(x=>{
      const item=x as {sides?:number;rolls?:unknown[]};
      const rolls=Array.isArray(item.rolls)?item.rolls.filter(n=>
        typeof n==='number'&&Number.isFinite(n)) as number[]:[];
      const label=item.sides===2?'Flip':'D'+item.sides;
      if(item.sides===2)
        return label+' ×'+(rolls.length||1)+' · '+rolls.filter(n=>n===1).length+'H';
      return label+' ×'+(rolls.length||1)+
        (rolls.length?' = '+rolls.reduce((a,n)=>a+n,0):'');
    }).join(', ')||'Dice';
    location='P'+(Number(p.seat??0)+1)+' · Dice tray → Table';
  }
  if(event.type==='REROLL_DIE')description=updated
    ?(updated.sides===2?'Flip':'D'+(updated.sides??6))+
      ' ×'+(updated.throwQuantity??1)+' = '+(updated.throwTotal??updated.value??0)
    :(description||'Die')+' · Reroll';
  if(event.type==='SET_CENTER_MERGE'){
    location='P'+(Number(p.seat??0)+1)+' · PLAY '+(Number(p.boundary??0)+1);
    type=p.merged?'Merge':'Split';
    description=p.merged?'Join zones':'Separate zones';
  }
  if(event.type==='NEXT_TURN'){
    location='Table';description='Next turn';
  }
  if(event.type==='SHUFFLE'){location='Deck';description='Shuffle deck';}
  if(event.type==='SET_MODE'){location='Table';description=string(p.mode)||'Mode';}
  if(event.type==='DRAW'){location='P'+(Number(p.matSeat??0)+1)+' · Deck → Hand';description='Draw card';}
  if(event.type==='ROTATE'&&num(p.degrees)!==null)
    description=(description?description+' · ':'')+p.degrees+'°';
  if(event.type==='ADJUST_COUNTER'||event.type==='TOKEN_ADJUST'){
    const delta=num(p.delta)??num(p.value);
    if(delta!==null)description=(description?description+' · ':'')+(delta>=0?'+':'')+delta;
  }
  if(event.type==='BATCH_CARD_ACTION'&&action&& !description)
    description=cap(action);
  const privateCard=[...old,...now].some(o=>o.kind==='card'&&
    (o.zone==='HAND'||o.zone==='DECK')&&!o.faceUp);
  if(privateCard)description=names(old.length?old:now,true);
  if(!description)description=event.type.toLowerCase().replaceAll('_',' ');
  return {id:'cmd-'+event.id,at:event.at,type,location,
    description,commandId:event.id};
}
export function rowsFromHistory(initial:GameState,history:EventRecord[]):ReceiptRow[]{
  const rows:ReceiptRow[]=[];
  let state=initial;
  for(const event of history){
    try{
      const next=applyCommand(state,event);
      rows.push(receiptForCommand(event,state,next));
      state=next;
    }catch{
      rows.push({id:'cmd-'+event.id,at:event.at,
        type:actionTypes[event.type]??cap(event.type),
        location:'Table',description:'Historical event',commandId:event.id});
    }
  }
  return rows;
}
export function mergeReceipt(
  original:ReceiptRow[]|undefined,initial:GameState,history:EventRecord[]
):ReceiptRow[]{
  const items=Array.isArray(original)?original.filter(r=>
    !!r&&typeof r.id==='string'&&typeof r.type==='string'&&
    typeof r.location==='string'&&typeof r.description==='string'&&
    Number.isFinite(r.at)):[];
  const seen=new Set(items.map(r=>r.commandId).filter(Boolean));
  return [...items,...rowsFromHistory(initial,history).filter(r=>!seen.has(r.commandId))]
    .sort((a,b)=>a.at-b.at);
}
export interface ReplayFile {
  schema:typeof RECEIPT_SCHEMA;
  id:string;exportedAt:number;initial:GameState;
  history:EventRecord[];redoStack:EventRecord[];
  receipt:ReceiptRow[];seat:number;game?:GameState;
}
function validState(value:unknown):value is GameState{
  const v=value as Partial<GameState>|null;
  return !!v&&typeof v==='object'&&v.version===1&&
    typeof v.kind==='string'&&Number.isSafeInteger(v.seq)&&
    Array.isArray(v.objects)&&Array.isArray(v.players);
}
function validRecord(value:unknown):value is EventRecord{
  const e=value as Partial<EventRecord>|null;
  return !!e&&typeof e==='object'&&typeof e.id==='string'&&
    typeof e.type==='string'&&typeof e.actor==='string'&&
    !!e.payload&&typeof e.payload==='object'&&!Array.isArray(e.payload)&&
    Number.isSafeInteger(e.seq)&&typeof e.at==='number';
}
export function parseReplayFile(raw:unknown):ReplayFile{
  if(!raw||typeof raw!=='object')throw Error('Invalid game receipt.');
  const v=raw as Partial<ReplayFile>&{schema?:string};
  if(v.schema!==RECEIPT_SCHEMA&&v.schema!=='sennet.replay/1')
    throw Error('Not a Sennet game receipt or replay file.');
  if(!validState(v.initial)||!Array.isArray(v.history)||
    !v.history.every(validRecord)||v.history.length>100000)
    throw Error('The replay has an invalid initial state or action history.');
  let seq=v.initial.seq;
  const unique=new Set<string>();
  for(const event of v.history){
    if(event.seq!==++seq||unique.has(event.id))
      throw Error('Replay has a missing, duplicated, or reordered action.');
    unique.add(event.id);
  }
  const redo=v.schema===RECEIPT_SCHEMA&&Array.isArray(v.redoStack)?
    v.redoStack:[];
  if(!redo.every(validRecord)||redo.length>100000)
    throw Error('Invalid redo history.');
  // Redo stack is stored in push order: pop its LAST record first.
  const continuation=[...v.history,...[...redo].reverse()];
  for(let i=0;i<continuation.length;i++){
    if(continuation[i].seq!==v.initial.seq+i+1||
      (i>=v.history.length&&unique.has(continuation[i].id)))
      throw Error('Redo history is incompatible with the replay cursor.');
  }
  // Fail closed on malformed payloads. No partial or invented reconstruction.
  replay(v.initial,continuation);
  const current=replay(v.initial,v.history);
  return {schema:RECEIPT_SCHEMA,id:typeof v.id==='string'?v.id:'',
    exportedAt:typeof v.exportedAt==='number'?v.exportedAt:0,
    initial:v.initial,history:v.history,redoStack:redo,game:current,
    seat:Number.isInteger(v.seat)&&Number(v.seat)>=0&&Number(v.seat)<12?Number(v.seat):0,
    receipt:mergeReceipt(v.receipt,v.initial,v.history)};
}
