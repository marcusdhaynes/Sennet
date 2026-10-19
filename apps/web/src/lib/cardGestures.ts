import type {TableObject} from '@sennet/core';
export type CardGestureAction=
  'tap'|'flip'|'rotate-cw'|'rotate-ccw'|'rotate-180'|
  'counter-add'|'counter-remove'|'duplicate'|'hand'|'deck-top'|'deck-bottom'|
  'discard'|'remove'|'draw'|'shuffle'|'roll'|'inspect';
export type GestureOption={action:CardGestureAction;label:string;group:'quick'|'piles'|'other'};
export const GESTURE_DOUBLE_TAP_MS=315;
export const GESTURE_HOLD_MS=550;
export const GESTURE_MOVE_THRESHOLD=7;
export function isDoubleCardTap(
 last:{id:string;at:number;x:number;y:number}|null,
 id:string,at:number,x:number,y:number
):boolean{
 return !!last&&last.id===id&&at>=last.at&&at-last.at<=GESTURE_DOUBLE_TAP_MS&&
   Math.hypot(x-last.x,y-last.y)<=28;
}
/** Every command is reachable through touch-and-hold or a secondary click;
 * gestures that might destroy information need an explicit action.
 */
export function cardGestureOptions(o:TableObject,kind:string):GestureOption[]{
 const options:GestureOption[]=[
  {action:'inspect',label:'Inspect',group:'quick'},
  {action:'flip',label:'Flip',group:'quick'},
  {action:'rotate-cw',label:'Rotate +90°',group:'quick'},
  {action:'rotate-ccw',label:'Rotate −90°',group:'quick'},
  {action:'rotate-180',label:'Rotate 180°',group:'quick'},
  {action:'duplicate',label:'Duplicate',group:'other'},
  {action:'remove',label:'Remove',group:'other'}
 ];
 if(o.kind==='card'||o.kind==='deck'){
  options.splice(1,0,{action:'tap',label:'Tap / untap',group:'quick'});
  if(kind==='tcg')options.push(
   {action:'counter-add',label:'Counter +',group:'quick'},
   {action:'counter-remove',label:'Counter −',group:'quick'},
   {action:'hand',label:'To hand',group:'piles'},
   {action:'deck-top',label:'Top of deck',group:'piles'},
   {action:'deck-bottom',label:'Bottom of deck',group:'piles'},
   {action:'discard',label:'To discard',group:'piles'}
  );
  if(o.zone==='DECK')options.push(
   {action:'draw',label:'Draw card',group:'piles'},
   {action:'shuffle',label:'Shuffle deck',group:'piles'}
  );
 }else if(o.kind==='token'||o.kind==='marker'){
  options.push({action:'counter-add',label:'Counter +',group:'quick'},
   {action:'counter-remove',label:'Counter −',group:'quick'});
 }else if(o.kind==='die'){
  options.push({action:'roll',label:'Roll die',group:'quick'});
 }
 return options;
}
