import {WebSocket,WebSocketServer} from 'ws';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import {applyCommand,createGame,projectForActor,sanitizeObject,normalizePlaymatAppearance,type SharedAppearance,type Command,type EventRecord,type GameKind,type GameState,type Player} from '@sennet/core';
const PORT=Number(process.env.PORT||8787);
const DATA_DIR=process.env.SENNET_DATA_DIR||'.sennet-server';
const MAX_MESSAGE=1024*1024;
type RoomEntry={state:GameState;history:EventRecord[];seen:Set<string>;sockets:Set<WebSocket>;owner:string;identities:Record<string,string>};
const rooms=new Map<string,RoomEntry>();
const loadingRooms=new Map<string,Promise<RoomEntry>>();
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
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(u.pathname.startsWith('/api/room/')){void httpRoom(req,res,u.pathname);return;}
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
  const pending=loadingRooms.get(room);if(pending)return pending;
  const task=(async():Promise<RoomEntry>=>{
  let state=createGame(kind,room,false),history:EventRecord[]=[],owner=actor,identities:Record<string,string>={};
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
  })();
  loadingRooms.set(room,task);
  try{return await task;}finally{loadingRooms.delete(room);}
}
const persistQueues=new Map<string,Promise<void>>();
function persist(room:string){
  const entry=rooms.get(room);if(!entry)return;
  const payload=JSON.stringify({state:entry.state,history:entry.history.slice(-3000),owner:entry.owner,identities:entry.identities});
  const next=(persistQueues.get(room)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(DATA_DIR,{recursive:true});const destination=join(DATA_DIR,`${room}.json`);
    const temporary=destination+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,payload,'utf8');await rename(temporary,destination);});
  persistQueues.set(room,next.catch(error=>{console.error('Room autosave failed for '+room,error);throw error;}));
  void next.catch(()=>{});
}
function send(ws:WebSocket,message:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));}
function broadcast(room:string,message:unknown){for(const ws of rooms.get(room)?.sockets||[])send(ws,message);}
function projectedSnapshot(room:string,ws:WebSocket){const entry=rooms.get(room);if(!entry)return;const actor=sessions.get(ws)?.actor||'';send(ws,{type:'snapshot',state:projectForActor(entry.state,actor)});}

/** HTTPS fallback for VPNs, browsers, and corporate gateways that block
 * WebSocket upgrade. POST bodies never place player secrets in URLs or logs.
 * Each response is the actor-projected authoritative state. */
const httpPresence=new Map<string,number>();
const PRESENCE_TTL=15000;
const presenceKey=(room:string,actor:string)=>room+'|'+actor;
function updatePresence(room:string){
  const entry=rooms.get(room);if(!entry)return;
  const now=Date.now();
  let changed=false;
  entry.state.players=entry.state.players.map(player=>{
    const wsOnline=[...entry.sockets].some(socket=>
      socket.readyState===WebSocket.OPEN&&sessions.get(socket)?.actor===player.id);
    const viaHttp=(httpPresence.get(presenceKey(room,player.id))||0)>now-PRESENCE_TTL;
    const online=wsOnline||viaHttp;
    if(player.online!==online)changed=true;
    return player.online===online?player:{...player,online};
  });
  if(changed){broadcast(room,{type:'presence',players:entry.state.players});persist(room);}
}
function authorize(entry:NonNullable<ReturnType<typeof rooms.get>>,actor:string,token:string){
  if(!/^[a-zA-Z0-9_-]{6,80}$/.test(actor)||!/^[a-f0-9]{32,128}$/i.test(token))
    throw new Error('Invalid player identity');
  const signature=createHash('sha256').update(token).digest('hex');
  if(entry.identities[actor]&&entry.identities[actor]!==signature)
    throw new Error('That saved player belongs to a different browser identity');
  return signature;
}
function setAppearance(room:string,actor:string,value:unknown){
  const entry=rooms.get(room);
  if(!entry?.state.players.some(p=>p.id===actor))throw Error('Only seated players can share customizations');
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid appearance');
  const raw=value as Record<string,unknown>;
  const incoming=JSON.stringify(raw);
  if(incoming.length>800000)throw Error('Appearance too large to share');
  const next:SharedAppearance={};
  if(raw.playmat!==undefined)next.playmat=normalizePlaymatAppearance(raw.playmat);
  if(raw.dice&&typeof raw.dice==='object'){
    const d=raw.dice as {all?:unknown;overrides?:unknown};
    next.dice={all:String(d.all||'classic').slice(0,40),overrides:{}};
    if(d.overrides&&typeof d.overrides==='object')
      for(const [k,v] of Object.entries(d.overrides).slice(0,20))
        if(/^\d{1,3}$/.test(k)&&typeof v==='string')
          next.dice.overrides[k]=v.slice(0,40);
  }
  if(raw.coin&&typeof raw.coin==='object'){
    const c=raw.coin as Record<string,unknown>;
    next.coin={finish:String(c.finish||'polished').slice(0,20),
      shine:Math.max(0,Math.min(100,Number(c.shine)||0)),
      bevel:Math.max(0,Math.min(100,Number(c.bevel)||0)),
      size:Math.max(.55,Math.min(1.3,Number(c.size)||1))};
  }
  if(typeof raw.coinText==='string')next.coinText=raw.coinText.slice(0,20);
  if(typeof raw.coinValue==='number')next.coinValue=Math.max(1,Math.min(9999,Math.floor(raw.coinValue)));
  if(typeof raw.labelScale==='number')next.labelScale=Math.max(.75,Math.min(2,raw.labelScale||1.25));
  entry.state.appearances={...entry.state.appearances,[actor]:next};
  persist(room);
  for(const client of entry.sockets)projectedSnapshot(room,client);
}
function applyAction(room:string,actor:string,rawAction:Command){
  const entry=rooms.get(room);
  if(!entry||!entry.state.players.some(player=>player.id===actor))throw new Error('Not seated in this room');
  if(!rawAction||typeof rawAction!=='object')throw new Error('Bad command');
  const command:Command={...rawAction,actor,id:String(rawAction.id||'').slice(0,120)};
  if(!command.id)throw new Error('Missing action ID');
  if(entry.seen.has(command.id))return null;
  if(command.type==='SET_MODE'&&entry.owner!==actor)throw new Error('Only the room creator may change mode');
  if(command.type==='ADD'&&command.payload?.object&&typeof command.payload.object==='object'){
    command.payload={...command.payload,object:sanitizeObject({...command.payload.object as Record<string,unknown>,owner:undefined})};
  }
  if(command.type==='ROLL'||command.type==='SHUFFLE')command.payload={...command.payload,seed:randomInt(1,2147483647)};
  const updated=applyCommand(entry.state,command);entry.state=updated;
  const record:EventRecord={...command,seq:updated.seq,at:Date.now()};
  entry.history.push(record);entry.seen.add(record.id);
  if(entry.history.length>4000)entry.history=entry.history.slice(-3000);
  persist(room);
  if(['DRAW','SHUFFLE','SET_ZONE','MOVE','MOVE_STACK','FLIP','BATCH_CARD_ACTION'].includes(command.type)){
    for(const client of entry.sockets)projectedSnapshot(room,client);
  }else broadcast(room,{type:'event',event:record});
  return record;
}
async function readRequest(req:IncomingMessage):Promise<Record<string,unknown>>{
  if(req.method!=='POST')throw new Error('POST required');
  let source='';
  for await(const part of req){
    source+=part.toString('utf8');
    if(source.length>MAX_MESSAGE)throw new Error('Request too large');
  }
  const value=JSON.parse(source) as unknown;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid request body');
  return value as Record<string,unknown>;
}
async function httpRoom(req:IncomingMessage,res:ServerResponse,path:string){
  try{
    const body=await readRequest(req);
    const room=String(body.room||''),actor=String(body.actor||''),token=String(body.token||'');
    if(!safeRoom(room))throw new Error('Invalid room code');
    let entry;
    if(path==='/api/room/join'){
      const kinds:GameKind[]=['sandbox','boardgame','tcg','rpg','wargame','dice','party','custom'];
      entry=await loadRoom(room,kinds.includes(body.kind as GameKind)?body.kind as GameKind:'sandbox',actor);
      const hash=authorize(entry,actor,token);
      let player=entry.state.players.find(p=>p.id===actor);
      if(!player){
        const reserved=new Set(entry.state.players.map(p=>p.seat));
        const preferred=Number.isInteger(body.seat)&&Number(body.seat)>=0&&Number(body.seat)<12?Number(body.seat):undefined;
        const seat=preferred!==undefined&&!reserved.has(preferred)?preferred:Array.from({length:12},(_,i)=>i).find(i=>!reserved.has(i));
        if(seat!==undefined){
          player={id:actor,seat,name:String(body.name||'Player').slice(0,32),online:true};
          entry.state.players.push(player);
        }
      }
      entry.identities[actor]=hash;
      httpPresence.set(presenceKey(room,actor),Date.now());
      updatePresence(room);persist(room);
      res.end(JSON.stringify({type:'joined',room,seat:player?.seat??null,owner:entry.owner,
        state:projectForActor(entry.state,actor)}));return;
    }
    entry=rooms.get(room);
    if(!entry)throw new Error('This room is not active. Join first.');
    authorize(entry,actor,token);
    if(!entry.identities[actor])throw new Error('Join first');
    if(path==='/api/room/leave'){
      httpPresence.delete(presenceKey(room,actor));updatePresence(room);
      res.end(JSON.stringify({ok:true}));return;
    }
    httpPresence.set(presenceKey(room,actor),Date.now());
    updatePresence(room);
    if(path==='/api/room/command'){
      applyAction(room,actor,body.command as Command);
    }else if(path==='/api/room/appearance'){
      setAppearance(room,actor,body.appearance);
    }else if(path!=='/api/room/sync')throw new Error('Unknown room action');
    res.end(JSON.stringify({type:'snapshot',state:projectForActor(entry.state,actor)}));
  }catch(error){
    res.writeHead(400);
    res.end(JSON.stringify({error:error instanceof Error?error.message:'Room request failed'}));
  }
}
const presenceSweep=setInterval(()=>{
  for(const room of rooms.keys())updatePresence(room);
},5000);
presenceSweep.unref();

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
      if(msg.type==='appearance'){setAppearance(session.room,session.actor,msg.appearance);return;}
      if(msg.type==='command'){
        if(!entry.state.players.some(p=>p.id===session.actor))throw new Error('Spectators cannot modify the table');
        const record=applyAction(session.room,session.actor,msg.command as Command);
        if(!record)send(ws,{type:'duplicate',id:String(msg.command?.id||'')});
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
    updatePresence(s.room);broadcast(s.room,{type:'presence',players:entry.state.players});persist(s.room);
  });
});
server.listen(PORT,()=>console.log(`Sennet relay: http://localhost:${PORT} — gameplay logs only; no uploaded files`));
