/// <reference lib="webworker" />
import {LuaFactory} from 'wasmoon';
self.onmessage=async (event: MessageEvent<{script:string;context:Record<string,unknown>}>)=>{
  const actions: Array<{type:string;payload:Record<string,unknown>}> = [];
  try {
    const engine=await new LuaFactory().createEngine();
    try {
      // Basic standard-library removal is defense in depth. Execution occurs in a disposable
      // Worker terminated by the host watchdog; never expose filesystem/network capabilities.
      await engine.doString(`os=nil;io=nil;package=nil;debug=nil;require=nil;loadfile=nil;dofile=nil;load=nil;collectgarbage=nil;coroutine=nil`);
      engine.global.set('emit', (type: string, payload:unknown) => {
        if (actions.length>=32) throw new Error('Script action quota exceeded');
        const value=typeof payload==='string'?JSON.parse(payload):payload;
        if (!value || typeof value!=='object') throw new Error('Action payload must be a table or JSON object');
        actions.push({type:String(type),payload:value as Record<string,unknown>});
      });
      engine.global.set('context_json', JSON.stringify(event.data.context));
      await engine.doString(event.data.script);
      self.postMessage({ok:true,actions});
    }finally{ engine.global.close(); }
  } catch(error) { self.postMessage({ok:false,error:String(error)}); }
};
