/** Sennet's deterministic, renderer-independent tabletop domain and command protocol. */
export type GameKind = 'sandbox' | 'boardgame' | 'tcg' | 'rpg' | 'wargame' | 'dice' | 'party' | 'custom';
export type PlayMode = 'sandbox' | 'turn-based' | 'asynchronous';
export type ObjectKind = 'card' | 'deck' | 'token' | 'miniature' | 'die' | 'tile' | 'board' | 'marker';
export type Zone = 'TABLE' | 'DECK' | 'HAND' | 'DISCARD';
export interface TableObject {
  id: string; kind: ObjectKind; name: string; x: number; y: number;
  rotation: number; faceUp: boolean; color: string; owner?: string;
  zone: Zone; order: number; sides?: number; value?: number;
  frameUrls?: string[]; faceUrl?: string; backUrl?: string;
  locked?: boolean; height?: number; description?: string;
}
export interface Player { id: string; seat: number; name: string; online: boolean; bot?: boolean }
export interface GameState {
  version: 1; roomId: string; kind: GameKind; mode: PlayMode;
  seq: number; turnSeat: number; round: number; objects: TableObject[];
  players: Player[]; message: string;
}
export type CommandType = 'ADD' | 'MOVE' | 'ROTATE' | 'FLIP' | 'DELETE' | 'CLONE' | 'ROLL' | 'DRAW' | 'SHUFFLE' | 'NEXT_TURN' | 'SET_MODE';
export interface Command {
  id: string; actor: string; type: CommandType; payload: Record<string, unknown>;
}
export interface EventRecord extends Command { seq: number; at: number }
export type GamePack = {
  schema: 'sennet.pack/1'; id: string; name: string; author: string; kind: GameKind;
  description?: string; image?: string; objects: TableObject[];
  lua?: string; assetBaseUrl?: string; license?: string;
};
export const SEATS = 12;
export const BOARD_W = 1000;
export const BOARD_H = 660;

/**
 * A TCG mat has four rows, three columns, and 4 tabletop-unit gutters.
 * Both outer columns hold one 62x88 card each. The center is a wider
 * play area. All coordinates are canonical tabletop coordinates, so a
 * replay and every remote client arrive at the same snapped position.
 */
export const TCG_MAT = {
  x:500,y:330,cardWidth:62,cardHeight:88,
  rowHeight:94,outerWidth:66,centerWidth:192,gap:4,rows:4,columns:3,
  snapOutside:26
} as const;
export interface TcgMatCell {
  row:number;column:number;x:number;y:number;width:number;height:number;
}
export function tcgMatCells():TcgMatCell[] {
  const m=TCG_MAT;
  const widths=[m.outerWidth,m.centerWidth,m.outerWidth];
  const left=m.x-(widths.reduce((a,b)=>a+b,0)+(m.columns-1)*m.gap)/2;
  const top=m.y-(m.rows*m.rowHeight+(m.rows-1)*m.gap)/2;
  const cells:TcgMatCell[]=[];
  let offset=left;
  for(let col=0;col<widths.length;col++){
    for(let row=0;row<m.rows;row++){
      cells.push({
        row,column:col,x:offset+widths[col]/2,
        y:top+row*(m.rowHeight+m.gap)+m.rowHeight/2,
        width:widths[col],height:m.rowHeight
      });
    }
    offset+=widths[col]+m.gap;
  }
  return cells;
}
export function tcgSnapPoint(x:number,y:number):TcgMatCell|null {
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  let best:TcgMatCell|null=null,bestDistance=Infinity;
  for(const cell of tcgMatCells()){
    // Find the true closest rectangle, not the nearest center. This is
    // important for the deliberately wider center column.
    const dx=Math.max(0,Math.abs(x-cell.x)-cell.width/2);
    const dy=Math.max(0,Math.abs(y-cell.y)-cell.height/2);
    const d=Math.hypot(dx,dy);
    if(d<bestDistance-1e-9){
      best=cell;bestDistance=d;
    } else if(Math.abs(d-bestDistance)<1e-9&&best){
      // Inside the narrow gap between two zones: prefer the center
      // of the nearer zone so a card cannot unpredictably switch sides.
      const old=Math.hypot(x-best.x,y-best.y);
      const next=Math.hypot(x-cell.x,y-cell.y);
      if(next<old){best=cell;}
    }
  }
  return bestDistance<=TCG_MAT.snapOutside?best:null;
}
/** Rotates the whole table so the viewer's seat sits on the bottom edge. */
export function viewerTableRotation(seat:number):number {
  return Math.PI - ((((seat%SEATS)+SEATS)%SEATS)*Math.PI/6);
}
/** A seated player's nameplate faces their own chair. */
export function playerSeatRotation(seat:number):number {
  return -Math.PI + ((((seat%SEATS)+SEATS)%SEATS)*Math.PI/6);
}
export const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
export const finite = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export const createId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c${Math.random().toString(36).slice(2)}`;

const deck = (prefix: string, x: number, y: number, count: number, owner?: string): TableObject[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i+1}`, kind: 'card', name: `${prefix === 'alpha' ? 'A' : 'B'} · ${i+1}`,
    x, y, rotation: 0, faceUp: false, color: i % 3 === 0 ? '#6f93a0' : i % 3 === 1 ? '#ad8cbd' : '#dcab74',
    zone: 'DECK', order: i, owner
  }));
const object = (id: string, kind: ObjectKind, name: string, x: number, y: number, color: string, extra: Partial<TableObject> = {}): TableObject => ({
  id, kind, name, x, y, color, zone: 'TABLE', order: 0, rotation: 0, faceUp: true, ...extra
});
export function createGame(kind: GameKind = 'sandbox', roomId = 'local'): GameState {
  const shared = [
    object('token-moon','token','Moon',425,280,'#8fbdc1'),
    object('token-sun','token','Sun',560,355,'#d9aa73'),
    object('die-d6','die','D6',500,250,'#dce3df',{sides:6,value:3}),
    object('card-demo','card','The Wanderer',360,365,'#a6a2d8'),
    object('mini-demo','miniature','Sentinel',610,252,'#be9576')
  ];
  const presets: Record<GameKind, TableObject[]> = {
    sandbox: shared,
    boardgame: [object('game-board','board','Checkered board',500,330,'#ad9879',{locked:true}), ...Array.from({length:8},(_,i)=>object(`pawn-${i}`,'token',`Piece ${i+1}`,370+i*37,300,i%2?'#bf9d70':'#86b6a8'))],
    tcg: [...deck('alpha',260,484,12),...deck('beta',736,172,12),object('hero-a','card','Guardian',452,468,'#6baaa6'),object('hero-b','card','Invoker',542,212,'#ba8ab6')],
    rpg: [object('map','board','Campaign Map',500,330,'#538175',{locked:true}),object('hero','miniature','Hero',460,290,'#d9c391'),object('enemy','miniature','Goblin',570,367,'#b69e89'),object('rpg-die','die','D20',340,440,'#dce3df',{sides:20,value:17})],
    wargame: [object('map','board','Battlefield',500,330,'#647e60',{locked:true}),...Array.from({length:6},(_,i)=>object(`soldier-${i}`,'miniature',`Unit ${i+1}`,345+60*(i%3),235+150*Math.floor(i/3),i<3?'#bd9985':'#83b5a6'))],
    dice: [4,6,8,10,12,20].map((sides,i)=>object(`die-${sides}`,'die',`D${sides}`,290+i*82,340,i%2?'#edc890':'#c1c9e9',{sides,value:1})),
    party: [object('prompt-card','card','Your turn',500,320,'#e8bd77'),...shared.slice(0,2)],
    custom: []
  };
  return { version:1, roomId, kind, mode:'sandbox', seq:0, turnSeat:0, round:1, objects:presets[kind], players:[], message:'Table ready. Your rules, your world.' };
}
function textValue(v: unknown, max = 120): string { return String(v ?? '').slice(0,max); }
function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 2048) return undefined;
  try { const u = new URL(v); return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)) ? u.href : undefined; } catch { return undefined; }
}
export function sanitizeObject(input: Record<string,unknown>): TableObject {
  const kinds: ObjectKind[] = ['card','deck','token','miniature','die','tile','board','marker'];
  const kind = kinds.includes(input.kind as ObjectKind) ? input.kind as ObjectKind : 'token';
  const color = typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : '#95b7b2';
  const frameUrls = Array.isArray(input.frameUrls) ? input.frameUrls.slice(0,72).map(safeUrl).filter((s):s is string=>!!s) : undefined;
  return {
    id: textValue(input.id || createId(),80), kind, name: textValue(input.name || kind,80),
    x:clamp(finite(input.x,500),0,BOARD_W),y:clamp(finite(input.y,330),0,BOARD_H),
    rotation: ((finite(input.rotation)%360)+360)%360,
    color,faceUp:input.faceUp!==false,
    zone:['TABLE','DECK','HAND','DISCARD'].includes(String(input.zone)) ? input.zone as Zone : 'TABLE',
    order:clamp(Math.floor(finite(input.order)),0,1000000),
    ...(input.locked===true ? {locked:true} : {}),
    ...(typeof input.owner === 'string' ? {owner:textValue(input.owner,80)} : {}),
    ...(kind==='die'?{sides:clamp(Math.floor(finite(input.sides,6)),2,100),value:clamp(Math.floor(finite(input.value,1)),1,100)}:{}),
    ...(frameUrls?.length?{frameUrls}:{}),
    ...(safeUrl(input.faceUrl)?{faceUrl:safeUrl(input.faceUrl)}:{}),
    ...(safeUrl(input.backUrl)?{backUrl:safeUrl(input.backUrl)}:{}),
    ...(typeof input.description==='string'?{description:textValue(input.description,250)}:{})
  };
}
export function validateCommand(state: GameState, command: Command): string | null {
  if (!command || typeof command !== 'object' || !command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) return 'Invalid command';
  if (!command.actor || !command.id || command.id.length > 120 || command.actor.length > 120) return 'Invalid actor or command ID';
  const types: CommandType[]=['ADD','MOVE','ROTATE','FLIP','DELETE','CLONE','ROLL','DRAW','SHUFFLE','NEXT_TURN','SET_MODE'];
  if (!types.includes(command.type)) return 'Unsupported action';
  if (state.mode !== 'sandbox' && command.type !== 'SET_MODE') {
    const current = state.players.find(p=>p.seat===state.turnSeat);
    if (state.players.length && current?.id!==command.actor) return `Waiting for seat ${state.turnSeat+1}`;
  }
  const id=String(command.payload.id ?? '');
  const target=state.objects.find(o=>o.id===id);
  if (['MOVE','ROTATE','FLIP','DELETE','CLONE','ROLL'].includes(command.type)) {
    if(!target) return 'Object does not exist';
    if(target.locked) return 'Object is locked';
    if (target.owner && target.owner!==command.actor && state.kind==='tcg') return 'This card belongs to another player';
  }
  if (command.type === 'ADD' && state.objects.length >= 1000) return 'Maximum objects reached';
  if (command.type === 'ADD' && (!command.payload.object || typeof command.payload.object !== 'object' || Array.isArray(command.payload.object))) return 'Invalid object';
  if (command.type === 'ADD' && (typeof (command.payload.object as Record<string,unknown>).id !== 'string' || !String((command.payload.object as Record<string,unknown>).id).trim())) return 'Object ID required for deterministic replay';
  if (command.type === 'ADD' && state.objects.some(o=>o.id===String((command.payload.object as Record<string,unknown>).id))) return 'Duplicate object ID';
  if (command.type === 'CLONE' && (typeof command.payload.newId !== 'string' || !String(command.payload.newId).trim())) return 'Clone ID required for deterministic replay';
  if (command.type === 'CLONE' && state.objects.some(o=>o.id===String(command.payload.newId))) return 'Duplicate clone ID';
  if (command.type==='SET_MODE' && !['sandbox','turn-based','asynchronous'].includes(String(command.payload.mode))) return 'Invalid play mode';
  if (command.type==='DRAW' && !state.objects.some(o=>o.zone==='DECK')) return 'Deck is empty';
  return null;
}
function prng(seed:number) { let x=seed|0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}; }
export function applyCommand(state: GameState, command: Command): GameState {
  const error=validateCommand(state,command);
  if(error) throw new Error(error);
  const p=command.payload;
  let objects=state.objects.map(o=>({...o}));
  let message=`${command.actor.slice(0,12)} · ${command.type.toLowerCase().replaceAll('_',' ')}`;
  let turnSeat=state.turnSeat,round=state.round,mode=state.mode;
  const obj=objects.find(o=>o.id===p.id);
  switch(command.type) {
    case 'ADD':objects.push(sanitizeObject(p.object as Record<string,unknown>)); message='New object placed';break;
    case 'MOVE': if(obj){
      const x=clamp(finite(p.x,obj.x),0,BOARD_W);
      const y=clamp(finite(p.y,obj.y),0,BOARD_H);
      const snapped=(state.kind==='tcg' && obj.kind==='card')?tcgSnapPoint(x,y):null;
      obj.x=snapped?snapped.x:x;
      obj.y=snapped?snapped.y:y;
      if(snapped) {
        // Playing a card from a deck or hand makes it a public table card.
        obj.zone='TABLE';
        message=`Placed ${obj.name} in mat row ${snapped.row+1}, column ${snapped.column+1}`;
      } else {
        message=`Moved ${obj.name}`;
      }
    }break;
    case 'ROTATE': if(obj){obj.rotation=((obj.rotation+finite(p.degrees,30))%360+360)%360;message=`Rotated ${obj.name}`;}break;
    case 'FLIP':if(obj){obj.faceUp=!obj.faceUp;message=`Flipped ${obj.name}`;}break;
    case 'DELETE':objects=objects.filter(o=>o.id!==p.id);message='Object removed';break;
    case 'CLONE':if(obj){objects.push({...obj,id:textValue(p.newId||createId(),80),x:clamp(obj.x+45,0,BOARD_W),y:clamp(obj.y+40,0,BOARD_H)});message=`Duplicated ${obj.name}`;}break;
    case 'ROLL':if(obj){const n=obj.sides||6;const rng=prng(finite(p.seed,1));obj.value=1+Math.floor(rng()*n);message=`Rolled ${obj.name}: ${obj.value}`;}break;
    case 'DRAW':{
      const available=objects.filter(o=>o.zone==='DECK' && (!p.prefix||o.id.startsWith(String(p.prefix)))).sort((a,b)=>a.order-b.order);
      const card=available[0];if(!card) throw new Error('No cards in that deck');
      card.zone='HAND';card.owner=command.actor;card.faceUp=false;card.x=460+((objects.filter(o=>o.zone==='HAND' && o.owner===command.actor).length-1)%6)*45;card.y=580;message=`${command.actor.slice(0,8)} drew a card`;break;
    }
    case 'SHUFFLE':{
      const list=objects.filter(o=>o.zone==='DECK' && (!p.prefix || o.id.startsWith(String(p.prefix))));const rand=prng(finite(p.seed,1));
      for(let i=list.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
      list.forEach((o,i)=>o.order=i);message=`Shuffled ${list.length} cards`;break;
    }
    case 'NEXT_TURN':{
      const seats=state.players.map(p=>p.seat).sort((a,b)=>a-b);
      const next=seats.find(s=>s>state.turnSeat)??seats[0]??((state.turnSeat+1)%SEATS);
      if(next<=state.turnSeat)round++;turnSeat=next;message=`Seat ${next+1}'s turn`;break;
    }
    case 'SET_MODE': mode=p.mode as PlayMode;message=`Mode: ${mode}`;break;
  }
  return {...state,objects,turnSeat,round,mode,seq:state.seq+1,message};
}
export function replay(initial:GameState,commands:readonly Command[]):GameState{return commands.reduce((s,c)=>applyCommand(s,c),initial);}
export function nearestFrameIndex(seat:number,rotationDegrees:number,frameCount:number):number {
  if(frameCount<=0)return 0;
  const angle=((seat*30-rotationDegrees)%360+360)%360;
  return Math.round(angle/360*frameCount)%frameCount;
}
export function projectForActor(state:GameState,viewerId:string):GameState {
  return {...state,objects:state.objects.map(o=>{
    if(o.zone==='HAND' && o.owner!==viewerId) return {...o,name:'Hidden card',description:undefined,faceUrl:undefined,frameUrls:undefined,faceUp:false,color:'#253c43',value:undefined,order:0};
    if(o.zone==='DECK')return {...o,name:'Face-down card',description:undefined,faceUrl:undefined,frameUrls:undefined,faceUp:false,color:'#253c43',value:undefined,order:0};
    return o;
  })};
}
export function parseGamePack(value:unknown):GamePack {
  if(!value||typeof value!=='object')throw new Error('Pack must be a JSON object');
  const pack=value as Record<string,unknown>;
  if(pack.schema!=='sennet.pack/1'||typeof pack.id!=='string'||typeof pack.name!=='string'||!Array.isArray(pack.objects)||pack.objects.length>1000)throw new Error('Invalid Sennet pack schema');
  const validKinds:GameKind[]=['sandbox','boardgame','tcg','rpg','wargame','dice','party','custom'];
  const kind=validKinds.includes(pack.kind as GameKind)?pack.kind as GameKind:'custom';
  return {schema:'sennet.pack/1',id:textValue(pack.id),name:textValue(pack.name),author:textValue(pack.author||'Community'),kind,description:textValue(pack.description,250),license:textValue(pack.license,80),objects:pack.objects.map((o:unknown)=>sanitizeObject(o as Record<string,unknown>)),...(typeof pack.lua==='string'&&pack.lua.length<=30000?{lua:pack.lua}:{})};
}
export function gameFromPack(pack:GamePack):GameState{return {...createGame(pack.kind),objects:pack.objects,message:`Loaded ${pack.name} by ${pack.author}`};}
