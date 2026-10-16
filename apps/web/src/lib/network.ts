import type {Command,EventRecord,GameKind,GameState,Player} from '@sennet/core';
export interface RoomCallbacks {onState:(state:GameState)=>void;onEvent:(event:EventRecord)=>void;onPlayers:(players:Player[])=>void;onStatus:(s:string)=>void;onError:(s:string)=>void}
export class RoomConnection {
  private ws:WebSocket;
  private pending:Command[]=[];
  constructor(address:string,room:string,kind:GameKind,actor:string,seat:number,name:string,handlers:RoomCallbacks){
    this.ws=new WebSocket(address);
    this.ws.onopen=()=>{
      this.ws.send(JSON.stringify({type:'join',room,kind,actor,seat,name}));
      handlers.onStatus('Connected · synchronizing…');
    };
    this.ws.onmessage=event=>{
      try{
        const msg=JSON.parse(String(event.data));
        if(msg.type==='joined')handlers.onStatus(msg.seat===null?'Spectating':'Connected · seat '+(msg.seat+1));
        if(msg.type==='snapshot')handlers.onState(msg.state);
        if(msg.type==='event')handlers.onEvent(msg.event);
        if(msg.type==='presence')handlers.onPlayers(msg.players);
        if(msg.type==='error')handlers.onError(msg.message);
      }catch(e){handlers.onError(String(e));}
    };
    this.ws.onclose=()=>handlers.onStatus('Offline · disconnected');
    this.ws.onerror=()=>handlers.onError('Network connection failed');
  }
  send(command:Command){
    if(this.ws.readyState!==WebSocket.OPEN)throw new Error('Room is not connected');
    this.ws.send(JSON.stringify({type:'command',command}));
  }
  close(){this.ws.close();}
}
