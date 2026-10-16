import {WebSocket,WebSocketServer} from 'ws';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomInt,randomUUID} from 'node:crypto';
import {applyCommand,createGame,projectForActor,sanitizeObject,type Command,type EventRecord,type GameKind,type GameState,type Player} from '@sennet/core';
const PORT=Number(process.env.PORT||8787);
const DATA_DIR=process.env.SENNET_DATA_DIR||'.sennet-server';
const MAX_MESSAGE=16*1024;
const rooms=new Map<string,{state:GameState;history:EventRecord[];seen:Set<string>;sockets:Set<WebSocket>;owner:string}>();
const sessions=new WeakMap<WebSocket,{room:string;actor:string}>();
const server=createServer((req,res)=>{
  const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/health'){res.end(JSON.stringify({ok:true,rooms:rooms.size,version:'0.1.0'}));return;}
  res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));
});
const wss=new WebSocketServer({server,maxPayload:MAX_MESSAGE,perMessageDeflate:false});
const safeRoom=(id:string)=>/^[a-zA-Z0-9_-]{3,48}$/.test(id);
async function loadRoom(room:string,kind:GameKind,actor:string) {
  const cached=rooms.get(room);if(cached)return cached;
  let state=createGame(kind,room),history:EventRecord[]=[],owner=actor;
  try {
    const stored=JSON.parse(await readFile(join(DATA_DIR,`${room}.json`),'utf8'));
    if(stored?.state?.version===1 && Array.isArray(stored.history)){
      state=stored.state;history=stored.history;owner=stored.owner||actor;
      state.players=state.players.map((p:Player)=>({...p,online:false}));
    }
  }catch{/* New room. */}
  const entry={state,history,seen:new Set<string>(history.map(a=>a.id)),sockets:new Set<WebSocket>(),owner};
  rooms.set(room,entry);return entry;
}
const persistQueues=new Map<string,Promise<void>>();
function persist(room:string){
  const entry=rooms.get(room);if(!entry)return;
  const payload=JSON.stringify({state:entry.state,history:entry.history.slice(-3000),owner:entry.owner});
  const next=(persistQueues.get(room)||Promise.resolve()).catch(()=>{}).then(async()=>{await mkdir(DATA_DIR,{recursive:true});await writeFile(join(DATA_DIR,`${room}.json`),payload,'utf8');});
  persistQueues.set(room,next);
}
function send(ws:WebSocket,message:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));}
function broadcast(room:string,message:unknown){for(const ws of rooms.get(room)?.sockets||[])send(ws,message);}
function projectedSnapshot(room:string,ws:WebSocket){const entry=rooms.get(room);if(!entry)return;const actor=sessions.get(ws)?.actor||'';send(ws,{type:'snapshot',state:projectForActor(entry.state,actor)});}
const rate=new WeakMap<WebSocket,{at:number,count:number}>();
wss.on('connection',ws=>{
  ws.on('message',async raw=>{
    try {
      const r=rate.get(ws)||{at:Date.now(),count:0};if(Date.now()-r.at>1000){r.at=Date.now();r.count=0;}r.count++;rate.set(ws,r);
      if(r.count>25)throw new Error('Rate limit exceeded');
      const msg=JSON.parse(raw.toString());
      if(msg.type==='join'){
        if(sessions.has(ws))throw new Error('Already joined');
        const room=String(msg.room||'');const actor=String(msg.actor||'');
        if(!safeRoom(room)||!/^[a-zA-Z0-9_-]{6,80}$/.test(actor))throw new Error('Invalid room or identity');
        const kinds:GameKind[]=['sandbox','boardgame','tcg','rpg','wargame','dice','party','custom'];
        const entry=await loadRoom(room,kinds.includes(msg.kind)?msg.kind:'sandbox',actor);
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
        if(['DRAW','SHUFFLE'].includes(command.type)){
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
