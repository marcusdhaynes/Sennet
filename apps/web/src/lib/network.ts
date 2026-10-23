import type {Command,EventRecord,GameKind,GameState,Player} from '@sennet/core';

export interface RoomCallbacks {
  onState:(state:GameState)=>void;
  onEvent:(event:EventRecord)=>void;
  onPlayers:(players:Player[])=>void;
  onStatus:(status:string)=>void;
  onError:(message:string)=>void;
  onJoined?:(seat:number|null,room:string)=>void;
}

/** One logical multiplayer session survives tab sleep, transient disconnects and relay restarts.
 * Only the authoritative server snapshot can complete a reconnect; commands are never
 * silently replayed after an uncertain send (avoids duplicate moves). */
export class RoomConnection {
  private ws:WebSocket|null=null;
  private stopped=false;
  private attempt=0;
  private retry:number|undefined;
  private joined=false;
  private readonly address:string;
  private readonly joinMessage:{type:'join';room:string;kind:GameKind;actor:string;seat:number;name:string;token:string};
  private readonly handlers:RoomCallbacks;

  constructor(address:string,room:string,kind:GameKind,actor:string,seat:number,name:string,token:string,handlers:RoomCallbacks){
    this.address=address;
    this.joinMessage={type:'join',room,kind,actor,seat,name,token};
    this.handlers=handlers;
    this.open();
  }

  private open(){
    if(this.stopped)return;
    this.joined=false;
    this.handlers.onStatus(this.attempt?'Reconnecting to saved table…':'Connecting to table…');
    const ws=new WebSocket(this.address);
    this.ws=ws;
    ws.onopen=()=>{
      if(this.stopped||this.ws!==ws){ws.close();return;}
      ws.send(JSON.stringify(this.joinMessage));
      this.handlers.onStatus('Synchronizing table…');
    };
    ws.onmessage=event=>{
      if(this.stopped||this.ws!==ws)return;
      try{
        const msg=JSON.parse(String(event.data));
        if(msg.type==='joined'){
          this.joined=true;this.attempt=0;
          this.handlers.onStatus(msg.seat===null?'Watching table · all seats occupied':'Online · seat '+(msg.seat+1));
          this.handlers.onJoined?.(msg.seat,msg.room);
        }
        if(msg.type==='snapshot')this.handlers.onState(msg.state);
        if(msg.type==='event')this.handlers.onEvent(msg.event);
        if(msg.type==='presence')this.handlers.onPlayers(msg.players);
        if(msg.type==='error'){
          this.handlers.onError(String(msg.message||'The room rejected your request'));
          if(!this.joined){
            this.stopped=true;
            this.handlers.onStatus('Unable to join · check room details');
            ws.close();
          }
        }
      }catch(e){this.handlers.onError(String(e));}
    };
    ws.onerror=()=>{if(!this.stopped&&this.attempt===0)this.handlers.onStatus('Connection interrupted…');};
    ws.onclose=()=>{
      if(this.stopped||this.ws!==ws)return;
      this.joined=false;
      const delay=Math.min(12000,700*Math.pow(1.7,Math.min(this.attempt++,6)));
      this.handlers.onStatus('Offline · reconnecting automatically…');
      this.retry=window.setTimeout(()=>this.open(),delay);
    };
  }

  requestSnapshot(){
    if(this.ws?.readyState===WebSocket.OPEN&&this.joined){
      this.ws.send(JSON.stringify({type:'resync'}));
    }
  }

  send(command:Command){
    if(!this.joined||this.ws?.readyState!==WebSocket.OPEN)
      throw new Error('Reconnecting · your move was not sent. Please retry.');
    this.ws.send(JSON.stringify({type:'command',command}));
  }

  close(){
    this.stopped=true;
    if(this.retry!==undefined)window.clearTimeout(this.retry);
    this.ws?.close();
    this.ws=null;
  }
}
