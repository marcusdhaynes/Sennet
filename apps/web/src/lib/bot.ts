import {type Command,type GameState,createId} from '@sennet/core';
/** Explicit, reproducible heuristic bot; not a model or a claim of strategic intelligence. */
export function choosePseudoBotAction(state:GameState):Command|null{
  const dice=state.objects.find(o=>o.kind==='die'&&!o.locked);
  const token=state.objects.find(o=>['token','miniature','card'].includes(o.kind)&&o.zone==='TABLE'&&!o.locked);
  const n=state.seq;
  if(n%3===0&&dice)return{id:createId(),actor:'local',type:'ROLL',payload:{id:dice.id,seed:(n+19)*991}};
  if(token)return{id:createId(),actor:'local',type:'MOVE',payload:{id:token.id,x:Math.max(240,Math.min(760,token.x+Math.round(Math.cos(n*1.77)*70))),y:Math.max(145,Math.min(500,token.y+Math.round(Math.sin(n*1.23)*65)))}};
  return null;
}
