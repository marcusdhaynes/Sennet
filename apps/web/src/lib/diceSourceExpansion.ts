/** One THREE/Cannon body per die until 20 total; use the original
 * quantity-aggregated bodies for larger rolls to avoid GPU/physics overload.
 * This planning step is also used by non-WebGL fallback and replay. */
export interface DiceSourceQuantity {
  sides:number;quantity:number;x:number;y:number;scale?:number;
}
export function expandDiceSources<T extends DiceSourceQuantity>(sources:readonly T[]):T[]{
  const total=sources.reduce((sum,s)=>sum+Math.max(0,Math.trunc(s.quantity)||0),0);
  if(total>20)return sources.map(s=>({...s}));
  const expanded:T[]=[];
  for(const source of sources){
    const count=Math.max(0,Math.trunc(source.quantity)||0);
    for(let i=0;i<count;i++)expanded.push({...source,quantity:1});
  }
  return expanded;
}
export function diceResultsAreIndividual<T extends {rolls:readonly number[]}>(results:readonly T[]){
  return results.every(r=>r.rolls.length===1)&&results.length<=20;
}
