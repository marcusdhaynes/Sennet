import type {Command,EventRecord,GameKind,GameState,Player,SharedAppearance} from '@sennet/core';

export interface RoomCallbacks {
  onState:(state:GameState)=>void;
  onEvent:(event:EventRecord)=>void;
  onPlayers:(players:Player[])=>void;
  onStatus:(status:string)=>void;
  onError:(message:string)=>void;
  onJoined?:(seat:number|null,room:string)=>void;
}
type JoinMessage={
  type:'join';room:string;kind:GameKind;actor:string;seat:number;name:string;token:string;
};
type RoomMessage={
  type:string;message?:string;error?:string;seat?:number|null;room?:string;
  state?:GameState;event?:EventRecord;players?:Player[];
};
const LOOP=1800;
/** Image data is uploaded as tiny preview textures, never unbounded originals.
 * The owner's full-resolution local playmat remains untouched. */
async function compactAppearance(appearance:SharedAppearance):Promise<SharedAppearance>{
  if(!appearance.playmat)return appearance;
  const images:Record<string,string>={};
  for(const [id,url] of Object.entries(appearance.playmat.images??{})){
    if(!url.startsWith('data:image/')||url.length<24000){images[id]=url;continue;}
    try{
      const image=new Image();
      image.src=url;
      await image.decode();
      const aspect=image.naturalWidth/Math.max(1,image.naturalHeight);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(aspect>=1?320:320*aspect));
      canvas.height=Math.max(1,Math.round(aspect>=1?320/aspect:320));
      canvas.getContext('2d')?.drawImage(image,0,0,canvas.width,canvas.height);
      const preview=canvas.toDataURL('image/webp',.66);
      if(preview.length<60000)images[id]=preview;
    }catch{/* Preserve other image settings even if this source cannot decode. */}
  }
  return {...appearance,playmat:{...appearance.playmat,images}};
}


/** WSS preferred; same-origin HTTPS requests are the VPN-friendly fallback.
 * Server authority is identical for both paths. Player secrets travel in POST
 * bodies, never in shared invite links or URLs. */
export class RoomConnection {
  private ws:WebSocket|null=null;
  private stopped=false;
  private joined=false;
  private mode:'websocket'|'http'|'opening'='opening';
  private tick:number|undefined;
  private timeout:number|undefined;
  private lastSeq=-1;
  private lastPresence='';
  private failures=0;
  private appearance:SharedAppearance|null=null;
  private lastCosmetics='';
  private appearanceRevision=0;
  private readonly httpRoot:string;
  private readonly payload:JoinMessage;
  private readonly handlers:RoomCallbacks;
  constructor(address:string,room:string,kind:GameKind,actor:string,seat:number,name:string,token:string,handlers:RoomCallbacks){
    const url=new URL(address);
    if(url.protocol!=='ws:'&&url.protocol!=='wss:')throw Error('A ws:// or wss:// server URL is required');
    this.httpRoot=url.protocol==='wss:'?'https://'+url.host:'http://'+url.host;
    this.payload={type:'join',room,kind,actor,seat,name,token};
    this.handlers=handlers;
    this.startWebSocket(address);
  }
  private announce(joined:RoomMessage,viaHttp=false){
    this.joined=true;this.failures=0;
    if(this.appearance)this.publishAppearance(this.appearance);
    this.handlers.onJoined?.(joined.seat??null,joined.room||this.payload.room);
    this.handlers.onStatus(joined.seat==null?'Watching table · all seats occupied':
      'Online · seat '+(joined.seat+1)+(viaHttp?' · VPN-compatible mode':''));
  }
  private receiveSnapshot(state:GameState){
    const cosmetics=JSON.stringify(state.appearances||{});
    if(state.seq!==this.lastSeq||cosmetics!==this.lastCosmetics){
      this.lastCosmetics=cosmetics;
      this.lastSeq=state.seq;
      this.handlers.onState(state);
    }
    const presence=JSON.stringify(state.players);
    if(presence!==this.lastPresence){
      this.lastPresence=presence;
      this.handlers.onPlayers(state.players);
    }
  }
  private startWebSocket(address:string){
    this.mode='opening';
    this.handlers.onStatus('Connecting securely…');
    try{
      const socket=new WebSocket(address);
      this.ws=socket;
      this.timeout=window.setTimeout(()=>this.startHttp(),5000);
      socket.onopen=()=>{
        if(this.stopped||this.ws!==socket){socket.close();return;}
        socket.send(JSON.stringify(this.payload));
        this.handlers.onStatus('Joining saved table…');
      };
      socket.onmessage=event=>{
        if(this.stopped||this.ws!==socket)return;
        try{
          const msg=JSON.parse(String(event.data)) as RoomMessage;
          if(msg.type==='joined'){
            this.mode='websocket';this.clearTimer();this.announce(msg);return;
          }
          if(msg.type==='snapshot'&&msg.state){this.receiveSnapshot(msg.state);return;}
          if(msg.type==='event'&&msg.event){this.lastSeq=msg.event.seq;this.handlers.onEvent(msg.event);return;}
          if(msg.type==='presence'&&msg.players){
            this.lastPresence=JSON.stringify(msg.players);this.handlers.onPlayers(msg.players);return;
          }
          if(msg.type==='error'){
            this.handlers.onError(msg.message||'Room request was rejected');
            if(!this.joined){this.stopped=true;this.clearTimer();socket.close();}
          }
        }catch(error){this.handlers.onError(String(error));}
      };
      socket.onerror=()=>{if(!this.stopped&&this.mode!=='http')this.handlers.onStatus('Trying compatible connection…');};
      socket.onclose=()=>{if(!this.stopped&&this.mode!=='http')this.startHttp();};
    }catch{this.startHttp();}
  }
  private clearTimer(){
    if(this.timeout!==undefined){window.clearTimeout(this.timeout);this.timeout=undefined;}
  }
  private async post(path:string,body:Record<string,unknown>):Promise<RoomMessage>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(this.httpRoot+'/api/room/'+path,{
        method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...this.payload,...body}),
        signal:controller.signal
      });
      const result=await response.json() as RoomMessage;
      if(!response.ok)throw Error(result.error||'Relay responded with '+response.status);
      return result;
    }finally{window.clearTimeout(timer);}
  }
  private startHttp(){
    if(this.stopped||this.mode==='http')return;
    this.mode='http';this.clearTimer();
    this.ws?.close();this.ws=null;this.joined=false;
    this.handlers.onStatus('Connecting through VPN-compatible HTTPS…');
    void this.poll(true);
  }
  private async poll(join:boolean){
    if(this.stopped||this.mode!=='http')return;
    try{
      const msg=await this.post(join?'join':'sync',{});
      if(this.stopped||this.mode!=='http')return;
      if(join){this.announce(msg,true);}
      if(msg.state)this.receiveSnapshot(msg.state);
      this.failures=0;
    }catch(error){
      if(this.stopped)return;
      const message=error instanceof Error?error.message:String(error);
      this.failures++;
      this.handlers.onStatus(this.failures===1?'Reconnecting over HTTPS…':'Cannot reach multiplayer server · retrying…');
      if(this.failures===1||this.failures%5===0)this.handlers.onError(
        message.includes('Failed to fetch')?'The relay is unreachable. Check the hosting URL, network or VPN settings.':message);
      this.joined=false;
    }
    const delay=this.failures?Math.min(12000,1200*Math.pow(1.6,Math.min(5,this.failures))):LOOP;
    this.tick=window.setTimeout(()=>this.poll(!this.joined),delay);
  }
  publishAppearance(appearance:SharedAppearance){
    this.appearance=appearance;
    if(!this.joined)return;
    const revision=++this.appearanceRevision;
    void compactAppearance(appearance).then(compact=>{
      if(this.stopped||!this.joined||revision!==this.appearanceRevision)return;
      if(this.mode==='websocket'&&this.ws?.readyState===WebSocket.OPEN){
        this.ws.send(JSON.stringify({type:'appearance',appearance:compact}));
      }else if(this.mode==='http'){
        void this.post('appearance',{appearance:compact}).then(msg=>{
          if(!this.stopped&&msg.state)this.receiveSnapshot(msg.state);
        }).catch(error=>this.handlers.onError('Could not sync appearance: '+String(error)));
      }
    }).catch(error=>this.handlers.onError('Unable to prepare shared artwork: '+String(error)));
  }
  requestSnapshot(){
    if(this.mode==='websocket'&&this.ws?.readyState===WebSocket.OPEN)
      this.ws.send(JSON.stringify({type:'resync'}));
    else if(this.mode==='http'&&this.joined)
      void this.post('sync',{}).then(msg=>{if(msg.state)this.receiveSnapshot(msg.state);}).catch(()=>{});
  }
  send(command:Command){
    if(!this.joined)throw new Error('Still connecting. Please retry your move.');
    if(this.mode==='websocket'&&this.ws?.readyState===WebSocket.OPEN){
      this.ws.send(JSON.stringify({type:'command',command}));return;
    }
    if(this.mode==='http'){
      void this.post('command',{command}).then(msg=>{
        if(this.stopped)return;
        if(msg.state)this.receiveSnapshot(msg.state);
      }).catch(error=>{
        this.handlers.onError('Move was not confirmed; checking the saved game. '+String(error));
        this.requestSnapshot();
      });
      return;
    }
    throw new Error('Room is reconnecting. Please retry your move.');
  }
  close(){
    if(this.stopped)return;
    const wasHttp=this.mode==='http'&&this.joined;
    this.stopped=true;this.clearTimer();
    if(this.tick!==undefined)window.clearTimeout(this.tick);
    this.ws?.close();this.ws=null;
    if(wasHttp)void this.post('leave',{}).catch(()=>{});
  }
}
