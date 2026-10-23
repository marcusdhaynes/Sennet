import {WebSocket,WebSocketServer} from 'ws';
import {createServer} from 'node:http';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import {applyCommand,createGame,projectForActor,sanitizeObject,type Command,type EventRecord,type GameKind,type GameState,type Player} from '@sennet/core';
const PORT=Number(process.env.PORT||8787);
const DATA_DIR=process.env.SENNET_DATA_DIR||'.sennet-server';
const MAX_MESSAGE=16*1024;
const rooms=new Map<string,{state:GameState;history:EventRecord[];seen:Set<string>;sockets:Set<WebSocket>;owner:string;identities:Record<string,string>}>();
const sessions=new WeakMap<WebSocket,{room:string;actor:string}>();
// Riot keys are NEVER sent to browsers. Sennet's optional relay fetches
// authorized content once per day, then serves a short-lived public cache.
// Riftbound cannot operate before Riot approves this exact application.
let riftboundCache:{expires:number;data:unknown}|null=null;
let riftboundPending:Promise<unknown>|null=null;
async function authorizedRiftbound(){
  if(riftboundCache&&riftboundCache.expires>Date.now())return riftboundCache.data;
  if(riftboundPending)return riftboundPending;
  const key=process.env.SENNET_RIOT_API_KEY;
  if(!key)throw new Error('Riot approval / SENNET_RIOT_API_KEY required');
  riftboundPending=(async()=>{
    const response=await fetch('https://americas.api.riotgames.com/riftbound/content/v1/contents?locale=en',{
      headers:{'X-Riot-Token':key,Accept:'application/json'},
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok)throw new Error('Riot API HTTP '+response.status);
    const data:unknown=await response.json();
    if(!data||typeof data!=='object')throw new Error('Invalid Riot content payload');
    riftboundCache={data,expires:Date.now()+24*60*60*1000};
    return data;
  })();
  try{return await riftboundPending;}finally{riftboundPending=null;}
}
const server=createServer((req,res)=>{
  const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/health'){res.end(JSON.stringify({ok:true,rooms:rooms.size,version:'0.1.0'}));return;}
  if(u.pathname==='/api/tcg/riftbound/catalog'){
    if(req.method!=='GET'){res.writeHead(405);res.end(JSON.stringify({error:'Read only'}));return;}
    res.setHeader('X-Content-Type-Options','nosniff');
    void authorizedRiftbound().then(data=>{
      res.setHeader('Cache-Control','public, max-age=3600');
      res.end(JSON.stringify(data));
    }).catch(error=>{
      res.setHeader('Cache-Control','no-store');
      res.writeHead(process.env.SENNET_RIOT_API_KEY?502:503);
      res.end(JSON.stringify({error:error instanceof Error?error.message:'Riot API unavailable'}));
    });
    return;
  }
  res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));
});
const wss=new WebSocketServer({server,maxPayload:MAX_MESSAGE,perMessageDeflate:false});
const safeRoom=(id:string)=>/^[a-zA-Z0-9_-]{3,48}$/.test(id);
async function loadRoom(room:string,kind:GameKind,actor:string) {
  const cached=rooms.get(room);if(cached)return cached;
  let state=createGame(kind,room),history:EventRecord[]=[],owner=actor,identities:Record<string,string>={};
  try {
    const stored=JSON.parse(await readFile(join(DATA_DIR,`${room}.json`),'utf8'));
    if(stored?.state?.version===1 && Array.isArray(stored.history)){
      state=stored.state;history=stored.history;owner=stored.owner||actor;
      identities=stored.identities&&typeof stored.identities==='object'?stored.identities:{};
      state.players=state.players.map((p:Player)=>({...p,online:false}));
    }
  }catch{/* New room. */}
  const entry={state,history,seen:new Set<string>(history.map(a=>a.id)),sockets:new Set<WebSocket>(),owner,identities};
  rooms.set(room,entry);return entry;
}
const persistQueues=new Map<string,Promise<void>>();
function persist(room:string){
  const entry=rooms.get(room);if(!entry)return;
  const payload=JSON.stringify({state:entry.state,history:entry.history.slice(-3000),owner:entry.owner,identities:entry.identities});
  const next=(persistQueues.get(room)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(DATA_DIR,{recursive:true});const destination=join(DATA_DIR,`${room}.json`);
    const temporary=destination+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,payload,'utf8');await rename(temporary,destination);});
  persistQueues.set(room,next);
}
function send(ws:WebSocket,message:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));}
function broadcast(room:string,message:unknown){for(const ws of rooms.get(room)?.sockets||[])send(ws,message);}
function projectedSnapshot(room:string,ws:WebSocket){const entry=rooms.get(room);if(!entry)return;const actor=sessions.get(ws)?.actor||'';send(ws,{type:'snapshot',state:projectForActor(entry.state,actor)});}
const rate=new WeakMap<WebSocket,{at:number,count:number}>();
// Ping inactive browser tabs and detect dead sockets without erasing their saved seats.
const alive=new WeakMap<WebSocket,boolean>();
const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){
    if(alive.get(ws)===false){ws.terminate();continue;}
    alive.set(ws,false);if(ws.readyState===WebSocket.OPEN)ws.ping();
  }
},30000);
heartbeat.unref();
wss.on('connection',ws=>{
  alive.set(ws,true);
  ws.on('pong',()=>alive.set(ws,true));
  ws.on('message',async raw=>{
    try {
      const r=rate.get(ws)||{at:Date.now(),count:0};if(Date.now()-r.at>1000){r.at=Date.now();r.count=0;}r.count++;rate.set(ws,r);
      if(r.count>25)throw new Error('Rate limit exceeded');
      const msg=JSON.parse(raw.toString());
      if(msg.type==='join'){
        if(sessions.has(ws))throw new Error('Already joined');
        const room=String(msg.room||'');const actor=String(msg.actor||'');
        const token=String(msg.token||'');
        if(!safeRoom(room)||!/^[a-zA-Z0-9_-]{6,80}$/.test(actor))throw new Error('Invalid room or identity');
        if(!/^[a-f0-9]{32,128}$/i.test(token))throw new Error('A saved player identity is required');
        const kinds:GameKind[]=['sandbox','boardgame','tcg','rpg','wargame','dice','party','custom'];
        const entry=await loadRoom(room,kinds.includes(msg.kind)?msg.kind:'sandbox',actor);
        const signature=createHash('sha256').update(token).digest('hex');
        if(entry.identities[actor]&&entry.identities[actor]!==signature)
          throw new Error('That saved player belongs to a different browser identity');
        // Existing pre-upgrade player seats can be migrated on their first return.
        if(!entry.identities[actor])entry.identities[actor]=signature;
        const occupied=entry.state.players.find(p=>p.id===actor);
        let seat=occupied?.seat;
        if(seat===undefined){
          const desired=Number.isInteger(msg.seat)&&msg.seat>=0&&msg.seat<12?msg.seat:undefined;
          const taken=new Set(entry.state.players.map(p=>p.seat));
          seat=desired!==undefined&&!taken.has(desired)?desired:Array.from({length:12},(_,i)=>i).find(i=>!taken.has(i));
          if(seat!==undefined){entry.state.players.push({id:actor,seat,name:String(msg.name||'Player').slice(0,32),online:true});}
        } else {entry.state.players=entry.state.players.map(p=>p.id===actor?{...p,online:true}:p);}
        sessions.set(ws,{room,actor});entry.sockets.add(ws);
        send(ws,{type:'joined',actor,seat:seat??null,owner:entry.owner,room});
        projectedSnapshot(room,ws);broadcast(room,{type:'presence',players:entry.state.players});persist(room);
        return;
      }
      const session=sessions.get(ws);if(!session)throw new Error('Join room first');
      const entry=rooms.get(session.room)!;
      if(msg.type==='resync'){projectedSnapshot(session.room,ws);return;}
      if(msg.type==='command'){
        if(!entry.state.players.some(p=>p.id===session.actor))throw new Error('Spectators cannot modify the table');
        const rawAction=msg.command as Command;
        if(!rawAction||typeof rawAction!=='object')throw new Error('Bad command');
        const command={...rawAction,actor:session.actor,id:String(rawAction.id||'').slice(0,120)};
        if(!command.id)throw new Error('Missing action ID');
        if(entry.seen.has(command.id)){send(ws,{type:'duplicate',id:command.id});return;}
        if(command.type==='SET_MODE'&&entry.owner!==session.actor)throw new Error('Only the room creator may change mode');
        if(command.type==='ADD'&&command.payload?.object && typeof command.payload.object==='object'){
          command.payload={...command.payload,object:sanitizeObject({...command.payload.object as Record<string,unknown>,owner:undefined})};
        }
        if(command.type==='ROLL'||command.type==='SHUFFLE')command.payload={...command.payload,seed:randomInt(1,2147483647)};
        const updated=applyCommand(entry.state,command);entry.state=updated;
        const record:EventRecord={...command,seq:updated.seq,at:Date.now()};entry.history.push(record);entry.seen.add(record.id);
        persist(session.room);
        // Event-only transport for public moves. Private draws and deck ordering require
        // an authoritative per-view snapshot to prevent transmitting hidden information.
        // Moving a card into a private hand/deck requires actor-specific
        // snapshots, exactly like drawing or shuffling, so spectators never
        // retain the card's identity in a public event replay.
        if(['DRAW','SHUFFLE','SET_ZONE','MOVE','MOVE_STACK','FLIP'].includes(command.type)||
           command.type==='BATCH_CARD_ACTION'){
          for(const client of entry.sockets)projectedSnapshot(session.room,client);
        } else {
          broadcast(session.room,{type:'event',event:record});
        }
        return;
      }
      throw new Error('Unsupported message');
    }catch(e){send(ws,{type:'error',message:e instanceof Error?e.message:'Server error'});}
  });
  ws.on('close',()=>{
    const s=sessions.get(ws);if(!s)return;
    const entry=rooms.get(s.room);if(!entry)return;
    entry.sockets.delete(ws);
    if(![...entry.sockets].some(client=>sessions.get(client)?.actor===s.actor))entry.state.players=entry.state.players.map(p=>p.id===s.actor?{...p,online:false}:p);
    broadcast(s.room,{type:'presence',players:entry.state.players});persist(s.room);
  });
});
server.listen(PORT,()=>console.log(`Sennet relay: http://localhost:${PORT} — gameplay logs only; no uploaded files`));
