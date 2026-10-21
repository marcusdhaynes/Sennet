import type {EventRecord,GameState} from '@sennet/core';
type Roll={sides:number;rolls:number[]};
function isRoll(value:unknown):value is Roll{
  if(!value||typeof value!=='object')return false;
  const r=value as Record<string,unknown>;
  return typeof r.sides==='number'&&Array.isArray(r.rolls)&&
    r.rolls.every(n=>typeof n==='number'&&Number.isFinite(n));
}
export function formatDiceRoll(throws:readonly Roll[]):string{
  let total=0;
  const parts=throws.map(roll=>{
    const sides=roll.sides;
    const numbers=roll.rolls;
    if(sides===2){
      const heads=numbers.filter(n=>n===1).length;
      return numbers.length+'Flip('+
        numbers.map(n=>n===1?'H':'T').join('+')+')'+(heads?'':'');
    }
    total+=numbers.reduce((a,b)=>a+b,0);
    return numbers.length+'D'+sides+'('+numbers.join('+')+')';
  });
  if(throws.length&&throws.every(x=>x.sides===2))
    return 'Flip = '+parts.join(', ');
  return 'Roll = '+total+' ['+parts.join(', ')+']';
}
/** Latest journal record, not a separately maintained description, so undo
 * and redo always show precisely the state currently at the timeline tip. */
export function formatActionDisplay(event:EventRecord,_initial:GameState,history:readonly EventRecord[]):string{
  const p=event.payload??{};
  if(event.type==='THROW_TRAY'){
    const rolls=Array.isArray(p.throws)?p.throws.filter(isRoll):[];
    return rolls.length?formatDiceRoll(rolls):'Dice throw';
  }
  if(event.type==='REROLL_DIE'){
    const original=history.find(e=>e.type==='THROW_TRAY'&&
      Array.isArray(e.payload.throws)&&
      e.payload.throws.some((_:unknown,i:number)=>e.id+'-throw-'+i===p.id));
    const throws=original&&Array.isArray(original.payload.throws)?original.payload.throws:[];
    const n=typeof p.id==='string'?Number(p.id.split('-throw-').at(-1)):0;
    const originalSides=isRoll(throws[n])?throws[n].sides:6;
    const entry={sides:originalSides,rolls:Array.isArray(p.rolls)?
      p.rolls.filter((x):x is number=>typeof x==='number'):[]};
    return 'Reroll · '+formatDiceRoll([entry]);
  }
  const objects=p.object&&typeof p.object==='object'?
    [(p.object as Record<string,unknown>).name]:[];
  const action=event.type==='BATCH_CARD_ACTION'?String(p.action??'Card action'):
    event.type==='COIN_MODIFY'?'Coin adjusted':
    event.type==='TOKEN_ADJUST'?'Coins changed':
    event.type==='TOKEN_PLACE'?'Coin placed':
    event.type==='MOVE_STACK'?'Stack moved':
    event.type==='SET_ZONE'?'Card zone changed':
    event.type.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
  const suffix=[...objects,p.id,typeof p.delta==='number'?
    (p.delta>0?'+':'')+p.delta:undefined]
    .filter(x=>typeof x==='string'||typeof x==='number').map(String);
  return action+(suffix.length?' · '+suffix.join(' · '):'');
}
