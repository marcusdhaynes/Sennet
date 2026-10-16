export interface LuaAction {type:string;payload:Record<string,unknown>}
/** Disposable Worker with a hard wall-clock timeout. No app globals exposed to Lua. */
export async function runLua(script:string,context:Record<string,unknown>={},maxMs=750):Promise<LuaAction[]> {
  if (script.length>30000)throw new Error('Script exceeds 30KB limit');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./lua.worker.ts',import.meta.url),{type:'module'});
    let finished=false;
    const finish=(error?:Error,actions?:LuaAction[])=>{
      if(finished)return;finished=true;clearTimeout(timer);worker.terminate();
      if(error)reject(error);else resolve(actions||[]);
    };
    const timer=setTimeout(()=>finish(new Error('Lua script execution timed out')),maxMs);
    worker.onmessage=(e:MessageEvent<{ok:boolean;actions?:LuaAction[];error?:string}>)=>e.data.ok?finish(undefined,e.data.actions):finish(new Error(e.data.error||'Lua script failed'));
    worker.onerror=e=>finish(new Error(e.message||'Lua worker failed'));
    worker.postMessage({script,context});
  });
}
export const SAMPLE_LUA=`-- Sennet Lua sandbox example\n-- emit(type, JSON payload). The host validates every proposed action.\nemit('ADD', '{"object":{"id":"lua-token","kind":"token","name":"Lua summoned","x":500,"y":330,"color":"#e0bc7e"}}')`;
