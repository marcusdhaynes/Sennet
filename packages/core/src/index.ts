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
  locked?: boolean; height?: number; description?: string; matSeat?: number;
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
export const BOARD_W = 4000;
export const BOARD_H = 4000;
export const BOARD_CENTER = BOARD_W / 2;
export const TABLE_APOTHEM = 1650;
export const TABLE_SEAT_RADIUS = 1730;
export const TABLE_VIEW_RADIUS = 1800;
/** Zoom 1 is the opening fit-to-table view and the farthest permitted zoom-out. */
export const MIN_TABLE_ZOOM = 1;
export const MAX_TABLE_ZOOM = 18;
export function clampTableZoom(value:number):number {
  return Number.isFinite(value) ? Math.min(MAX_TABLE_ZOOM,Math.max(MIN_TABLE_ZOOM,value)) : MIN_TABLE_ZOOM;
}


/**
 * One independent four-row/three-column mat per seat. The middle rectangle
 * fits SEVEN cards side-by-side, without introducing extra visible columns.
 * The mat width also defines the player's tangent boundary line.
 * The whole duodecagonal table is sized so even the INNER corners of all
 * twelve mats remain strictly inside their own 30-degree seat sectors.
 */
export const TCG_MAT = {
  cardWidth:62,cardHeight:88,rowHeight:94,
  outerWidth:66,centerWidth:7*62+6*2,
  centerCards:7,gap:4,rows:4,columns:3,
  snapOutside:26,outerRadius:1580
} as const;
export const TCG_MAT_WIDTH=TCG_MAT.outerWidth*2+TCG_MAT.centerWidth+TCG_MAT.gap*2;
export const TCG_MAT_HEIGHT=TCG_MAT.rowHeight*TCG_MAT.rows+TCG_MAT.gap*(TCG_MAT.rows-1);
export interface TcgMatCell {
  seat:number;row:number;column:number;
  x:number;y:number;width:number;height:number;
  angle:number; // Mat local x/y axes, oriented toward the owning seat
}
export interface TcgSnapLocation extends TcgMatCell {slot:number}
export function tcgMatOrigin(seat:number):{x:number;y:number;angle:number} {
  const index=((seat%SEATS)+SEATS)%SEATS;
  const radial=-Math.PI/2+index*Math.PI/6;
  const distance=TCG_MAT.outerRadius-TCG_MAT_HEIGHT/2;
  return {x:BOARD_CENTER+distance*Math.cos(radial),
    y:BOARD_CENTER+distance*Math.sin(radial),
    angle:-Math.PI+index*Math.PI/6};
}
export function tcgMatCells(seat=0):TcgMatCell[] {
  const m=TCG_MAT;
  const widths=[m.outerWidth,m.centerWidth,m.outerWidth];
  const top=-TCG_MAT_HEIGHT/2;
  const transform=tcgMatOrigin(seat),cos=Math.cos(transform.angle),sin=Math.sin(transform.angle);
  const cells:TcgMatCell[]=[];
  let offset=-TCG_MAT_WIDTH/2;
  for(let col=0;col<widths.length;col++){
    for(let row=0;row<m.rows;row++){
      const localX=offset+widths[col]/2;
      const localY=top+row*(m.rowHeight+m.gap)+m.rowHeight/2;
      cells.push({seat:((seat%SEATS)+SEATS)%SEATS,row,column:col,
        x:transform.x+localX*cos-localY*sin,
        y:transform.y+localX*sin+localY*cos,
        width:widths[col],height:m.rowHeight,angle:transform.angle});
    }
    offset+=widths[col]+m.gap;
  }
  return cells;
}
export function allTcgMatCells():TcgMatCell[] {
  return Array.from({length:SEATS},(_,seat)=>tcgMatCells(seat)).flat();
}
/** Convert point into the owning mat's unrotated coordinates. */
export function tcgMatLocal(x:number,y:number,seat:number):{x:number;y:number} {
  const o=tcgMatOrigin(seat),dx=x-o.x,dy=y-o.y;
  return {x:dx*Math.cos(o.angle)+dy*Math.sin(o.angle),
    y:-dx*Math.sin(o.angle)+dy*Math.cos(o.angle)};
}
export function tcgMatWorld(x:number,y:number,seat:number):{x:number;y:number} {
  const o=tcgMatOrigin(seat);
  return {x:o.x+x*Math.cos(o.angle)-y*Math.sin(o.angle),
    y:o.y+x*Math.sin(o.angle)+y*Math.cos(o.angle)};
}
/** Closest rectangle test, then nearest card position in wide middle zone.
 * Returns null when the card is beyond a small edge tolerance.
 * Logic is fully deterministic: the network transmits only drop coordinates.
 */
export function tcgSnapPoint(x:number,y:number):TcgSnapLocation|null {
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  let best:TcgSnapLocation|null=null,dist=Infinity,centerDist=Infinity;
  for(let seat=0;seat<SEATS;seat++){
    const local=tcgMatLocal(x,y,seat);
    for(const cell of tcgMatCells(seat)){
      const anchor=tcgMatLocal(cell.x,cell.y,seat);
      const dx=Math.max(0,Math.abs(local.x-anchor.x)-cell.width/2);
      const dy=Math.max(0,Math.abs(local.y-anchor.y)-cell.height/2);
      const distance=Math.hypot(dx,dy);
      if(distance>TCG_MAT.snapOutside)continue;
      const midDist=Math.hypot(local.x-anchor.x,local.y-anchor.y);
      if(distance>dist+1e-8 || (Math.abs(distance-dist)<=1e-8 && midDist>=centerDist))continue;
      const positions=cell.column===1?TCG_MAT.centerCards:1;
      const slot=Math.min(positions-1,Math.max(0,
        Math.round((local.x-(anchor.x-cell.width/2)+(cell.column===1?-0.5:0))/ (cell.width/positions)-0.5)));
      // All 7 card anchors are within the same single wide, rounded rectangle.
      const snappedLocalX=anchor.x+(slot-(positions-1)/2)*(cell.width/positions);
      const snapped=tcgMatWorld(snappedLocalX,anchor.y,seat);
      best={...cell,...snapped,slot};
      dist=distance;centerDist=midDist;
    }
  }
  return best;
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
    x:x+BOARD_CENTER-500, y:y+BOARD_CENTER-330, rotation: 0, faceUp: false, color: i % 3 === 0 ? '#6f93a0' : i % 3 === 1 ? '#ad8cbd' : '#dcab74',
    zone: 'DECK', order: i, owner
  }));
const object = (id: string, kind: ObjectKind, name: string, x: number, y: number, color: string, extra: Partial<TableObject> = {}): TableObject => ({
  id, kind, name, x:x+BOARD_CENTER-500, y:y+BOARD_CENTER-330, color, zone: 'TABLE', order: 0, rotation: 0, faceUp: true, ...extra
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
    tcg: [
      ...deck('alpha',0,0,12).map(o=>({...o,...tcgSnapPoint(tcgMatCells(0).find(c=>c.row===3&&c.column===0)!.x,tcgMatCells(0).find(c=>c.row===3&&c.column===0)!.y)!,matSeat:0})),
      ...deck('beta',0,0,12).map(o=>({...o,...tcgSnapPoint(tcgMatCells(6).find(c=>c.row===3&&c.column===0)!.x,tcgMatCells(6).find(c=>c.row===3&&c.column===0)!.y)!,matSeat:6})),
      object('hero-a','card','Guardian',500,330,'#6baaa6',{...tcgSnapPoint(tcgMatCells(0).find(c=>c.row===2&&c.column===1)!.x,tcgMatCells(0).find(c=>c.row===2&&c.column===1)!.y)!,matSeat:0}),
      object('hero-b','card','Invoker',500,330,'#ba8ab6',{...tcgSnapPoint(tcgMatCells(6).find(c=>c.row===2&&c.column===1)!.x,tcgMatCells(6).find(c=>c.row===2&&c.column===1)!.y)!,matSeat:6})
    ],
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
    x:clamp(finite(input.x,BOARD_CENTER),0,BOARD_W),y:clamp(finite(input.y,BOARD_CENTER),0,BOARD_H),
    rotation: ((finite(input.rotation)%360)+360)%360,
    color,faceUp:input.faceUp!==false,
    zone:['TABLE','DECK','HAND','DISCARD'].includes(String(input.zone)) ? input.zone as Zone : 'TABLE',
    order:clamp(Math.floor(finite(input.order)),0,1000000),
    ...(input.locked===true ? {locked:true} : {}),
    ...(typeof input.owner === 'string' ? {owner:textValue(input.owner,80)} : {}),
    ...(Number.isInteger(input.matSeat)&&Number(input.matSeat)>=0&&Number(input.matSeat)<SEATS ? {matSeat:Number(input.matSeat)} : {}),
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
      if(snapped) { obj.matSeat=snapped.seat;
        // Playing a card from a deck or hand makes it a public table card.
        obj.zone='TABLE';
        message=`Placed ${obj.name} on seat ${snapped.seat+1}, row ${snapped.row+1}, column ${snapped.column+1}, position ${snapped.slot+1}`;
      } else {
        if(state.kind==='tcg' && obj.kind==='card')delete obj.matSeat;
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
      card.zone='HAND';card.owner=command.actor;card.faceUp=false;
      const handCount=objects.filter(o=>o.zone==='HAND'&&o.owner===command.actor).length;
      const seat=state.players.find(player=>player.id===command.actor)?.seat??0;
      const handPosition=tcgMatWorld(((handCount-1)%7-3)*69,TCG_MAT_HEIGHT/2+100,seat);
      card.x=handPosition.x;card.y=handPosition.y;delete card.matSeat;
      message=`${command.actor.slice(0,8)} drew a card`;break;
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
