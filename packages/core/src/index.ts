/** Sennet's deterministic, renderer-independent tabletop domain and command protocol. */
export type GameKind = 'sandbox' | 'boardgame' | 'tcg' | 'rpg' | 'wargame' | 'dice' | 'party' | 'custom';
export type PlayMode = 'sandbox' | 'turn-based' | 'asynchronous';
export type ObjectKind = 'card' | 'deck' | 'deck-box' | 'token' | 'miniature' | 'die' | 'tile' | 'board' | 'marker';
export type Zone = 'TABLE' | 'DECK' | 'HAND' | 'DISCARD';
export interface TableObject {
  id: string; kind: ObjectKind; name: string; x: number; y: number;
  rotation: number; faceUp: boolean; color: string; owner?: string;
  zone: Zone; order: number; sides?: number; value?: number;
  frameUrls?: string[]; faceUrl?: string; backUrl?: string;
  locked?: boolean; height?: number; description?: string; matSeat?: number; counters?: number; scale?: number; carrierId?: string; tokenCoin?: boolean; coinText?: string; tokenSign?: 1|-1; throwDice?: boolean; throwRolls?: number[]; throwQuantity?: number; throwTotal?: number; throwQuaternion?: [number,number,number,number]; throwAltitude?:number; throwExpiresAt?:number;
}
export interface Player { id: string; seat: number; name: string; online: boolean; bot?: boolean }
export interface GameState {
  version: 1; roomId: string; kind: GameKind; mode: PlayMode;
  seq: number; turnSeat: number; round: number; objects: TableObject[];
  players: Player[]; message: string; centerMerges?: number[];
}
/** Loose thrown dice (including the two-sided flipcoin) are permanent
 * deletions after 10 seconds; unlike the drawer generators themselves. */
export const THROWN_DIE_LIFETIME_MS=10_000;
export type CommandType = 'ADD' | 'MOVE' | 'MOVE_STACK' | 'SET_CENTER_MERGE' | 'ROTATE' | 'FLIP' | 'DELETE' | 'CLONE' | 'ROLL' | 'DRAW' | 'SHUFFLE' | 'NEXT_TURN' | 'SET_MODE' | 'ADJUST_COUNTER' | 'SET_ZONE' | 'BATCH_CARD_ACTION' | 'TOKEN_PLACE' | 'TOKEN_ADJUST' | 'THROW_TRAY' | 'COIN_MODIFY' | 'REROLL_DIE';
export interface Command {
  id: string; actor: string; type: CommandType; payload: Record<string, unknown>;
}
export interface EventRecord extends Command { seq: number; at: number }
export type GamePack = {
  schema: 'sennet.pack/1'; id: string; name: string; author: string; kind: GameKind;
  description?: string; image?: string; objects: TableObject[];
  lua?: string; assetBaseUrl?: string; license?: string; centerMerges?: number[];
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
export const MAX_TABLE_ZOOM = 48;
export function clampTableZoom(value:number):number {
  return Number.isFinite(value) ? Math.min(MAX_TABLE_ZOOM,Math.max(MIN_TABLE_ZOOM,value)) : MIN_TABLE_ZOOM;
}

/**
 * Keep the entire camera viewport inside the world rectangle visible at
 * the initial fit-to-table zoom. Pan is measured in screen pixels relative
 * to the centered initial camera.
 *
 * At zoom=1 the viewport already fills the permitted area: no panning.
 * At zoom=2 only half that area is shown, giving half a viewport of travel
 * along either axis. All camera inputs share these limits.
 */
export function clampTablePan(
  panX:number, panY:number, zoom:number, viewportWidth:number, viewportHeight:number
):{panX:number;panY:number}{
  const excess=clampTableZoom(zoom)-MIN_TABLE_ZOOM;
  const width=Number.isFinite(viewportWidth)?Math.max(0,viewportWidth):0;
  const height=Number.isFinite(viewportHeight)?Math.max(0,viewportHeight):0;
  const limitX=width*excess/2,limitY=height*excess/2;
  const x=Number.isFinite(panX)?panX:0,y=Number.isFinite(panY)?panY:0;
  return {
    panX:limitX===0?0:Math.min(limitX,Math.max(-limitX,x)),
    panY:limitY===0?0:Math.min(limitY,Math.max(-limitY,y))
  };
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
export type PlaymatTextureKind='matte'|'sandy'|'glossy';
export interface PlaymatTextureSetting {enabled:boolean;opacity:number}
export type PlaymatTextureLayers=Record<PlaymatTextureKind,PlaymatTextureSetting>;
export interface PlaymatSectionStyle {
  imageId:string;textureLayers:PlaymatTextureLayers;
  innerShadow:boolean;shadowOpacity:number;innerBevel:boolean;
  outerBevel:boolean;bevelOpacity:number;
}
export type PlaymatImageMode='repeat'|'span';
export interface PlaymatAppearance {
  sections:PlaymatSectionStyle[];
  images:Record<string,string>;
  imageMode:PlaymatImageMode;
  spanningImageId:string;
  selectedSections:number[];
  snapMerged:boolean;
  freePlacement:boolean;
  sideBoxStyle:'walnut'|'carved'|'maple'|'ebony'|'mahogany';
}
export const DEFAULT_PLAYMAT_SECTION_STYLE:PlaymatSectionStyle={
  imageId:'',
  textureLayers:{
    matte:{enabled:true,opacity:.18},
    sandy:{enabled:false,opacity:.18},
    glossy:{enabled:true,opacity:.18}
  },
  innerShadow:true,shadowOpacity:.25,innerBevel:true,
  outerBevel:false,bevelOpacity:.25
};
export function defaultPlaymatAppearance():PlaymatAppearance {
  return {
    sections:Array.from({length:12},()=>({
      ...DEFAULT_PLAYMAT_SECTION_STYLE,
      textureLayers:{
        matte:{...DEFAULT_PLAYMAT_SECTION_STYLE.textureLayers.matte},
        sandy:{...DEFAULT_PLAYMAT_SECTION_STYLE.textureLayers.sandy},
        glossy:{...DEFAULT_PLAYMAT_SECTION_STYLE.textureLayers.glossy}
      }
    })),
    images:{},imageMode:'repeat',spanningImageId:'',selectedSections:Array.from({length:12},(_,i)=>i),
    snapMerged:false,freePlacement:false,sideBoxStyle:'walnut'
  };
}
/** Each client applies its stored appearance only to its own seat.
 * Other seats get the built-in appearance—not the current viewer's image,
 * texture, transparency, or bevel preferences.
 * These appearance preferences are deliberately excluded from GameState.
 */
export function playmatAppearanceForSeat(
  personal:PlaymatAppearance, viewerSeat:number, targetSeat:number
):PlaymatAppearance{
  return viewerSeat===targetSeat?personal:defaultPlaymatAppearance();
}
/** Persisted preferences can be old-format data or untrusted imported JSON.
 * Migrate existing texture dropdown selections without losing their opacity. */
export function normalizePlaymatAppearance(value:unknown):PlaymatAppearance {
  const defaults=defaultPlaymatAppearance();
  if(!value||typeof value!=='object')return defaults;
  const input=value as Partial<PlaymatAppearance>;
  const images:Record<string,string>={};
  if(input.images&&typeof input.images==='object'&&!Array.isArray(input.images)){
    for(const [key,url] of Object.entries(input.images).slice(0,24)){
      if(!/^bg_[a-z0-9_-]{4,80}$/i.test(key)||typeof url!=='string'||url.length>2000000)continue;
      if(/^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(url))images[key]=url;
    }
  }
  const opacity=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)
    ?Math.min(1,Math.max(0,v)):fallback;
  const kinds:PlaymatTextureKind[]=['matte','sandy','glossy'];
  const sections=defaults.sections.map((original,i)=>{
    const raw=Array.isArray(input.sections)?input.sections[i]:null;
    if(!raw||typeof raw!=='object')return original;
    const legacy=raw as Partial<PlaymatSectionStyle>&{texture?:unknown;textureOpacity?:unknown};
    const oldTexture=typeof legacy.texture==='string'?legacy.texture:null;
    const validLegacy=['none','matte','sandy','glossy','matte-glossy'].includes(oldTexture??'');
    const oldOpacity=opacity(legacy.textureOpacity,.18);
    const textureLayers={} as PlaymatTextureLayers;
    for(const key of kinds){
      const previous=original.textureLayers[key];
      const candidate=legacy.textureLayers?.[key];
      const isObject=candidate!==null&&typeof candidate==='object';
      const priorEnabled=validLegacy
        ?(oldTexture===key||(oldTexture==='matte-glossy'&&(key==='matte'||key==='glossy')))
        :previous.enabled;
      textureLayers[key]={
        enabled:isObject&&typeof candidate.enabled==='boolean'?candidate.enabled:priorEnabled,
        opacity:isObject?opacity(candidate.opacity,validLegacy?oldOpacity:previous.opacity)
          :validLegacy?oldOpacity:previous.opacity
      };
    }
    return {
      imageId:typeof legacy.imageId==='string'&&images[legacy.imageId]?legacy.imageId:'',
      textureLayers,
      innerShadow:typeof legacy.innerShadow==='boolean'?legacy.innerShadow:original.innerShadow,
      shadowOpacity:opacity(legacy.shadowOpacity,original.shadowOpacity),
      innerBevel:typeof legacy.innerBevel==='boolean'?legacy.innerBevel:original.innerBevel,
      outerBevel:typeof legacy.outerBevel==='boolean'?legacy.outerBevel:original.outerBevel,
      bevelOpacity:opacity(legacy.bevelOpacity,original.bevelOpacity)
    };
  });
  const selectedSections=Array.isArray(input.selectedSections)
    ?[...new Set(input.selectedSections.filter((n):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<12))].sort((a,b)=>a-b)
    :defaults.selectedSections;
  const imageMode=input.imageMode==='span'?'span':'repeat';
  const spanningImageId=typeof input.spanningImageId==='string'&&images[input.spanningImageId]
    ?input.spanningImageId:'';
  return {sections,images,imageMode,spanningImageId,selectedSections,snapMerged:input.snapMerged===true,
    freePlacement:input.freePlacement===true,
    sideBoxStyle:['walnut','carved','maple','ebony','mahogany'].includes(String(input.sideBoxStyle))
      ?input.sideBoxStyle as PlaymatAppearance['sideBoxStyle']:'walnut'};
}
export function playmatSectionIndex(row:number,column:number):number {return row*3+column;}
export const TCG_MAT_WIDTH=TCG_MAT.outerWidth*2+TCG_MAT.centerWidth+TCG_MAT.gap*2;
export const TCG_MAT_HEIGHT=TCG_MAT.rowHeight*TCG_MAT.rows+TCG_MAT.gap*(TCG_MAT.rows-1);
export interface TcgMatCell {
  seat:number;row:number;column:number;
  x:number;y:number;width:number;height:number;
  angle:number; // Mat local x/y axes, oriented toward the owning seat
}
/** Slot 0..6 is unchanged; half-integer slots mark the six positions
 * BETWEEN existing slots in every unmerged PLAY and HAND pocket.
 */
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
/** Exact card pocket hit test (no magnetic snap margin). */
export function tcgDropZone(x:number,y:number,seat:number):{
 zone:'DECK'|'HAND'|'DISCARD'|'TABLE'|'REMOVE';
 faceUp:boolean;deckBottom:boolean;row:number;column:number
}|null{
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 const p=tcgMatLocal(x,y,seat);
 for(const cell of tcgMatCells(seat)){
  const center=tcgMatLocal(cell.x,cell.y,seat);
  if(Math.abs(p.x-center.x)>cell.width/2||
     Math.abs(p.y-center.y)>cell.height/2)continue;
  const {row,column}=cell;
  const zone=row===1&&column===2?'DECK':
    row===3&&column===1?'HAND':
    row===2&&column===2?'DISCARD':
    row===3&&column===2?'REMOVE':'TABLE';
  const faceUp=column===1||zone==='DISCARD'||zone==='REMOVE'||
   (column===0&&(row===0||row===2))||(column===2&&row===0);
  const deckBottom=zone==='DECK'&&p.y>center.y;
  return {zone,faceUp,deckBottom,row,column};
 }
 return null;
}
/** An enabled boundary is seat*3+row, with row 0,1,2. */
export function centerMergeKey(seat:number,boundary:number):number {
  return seat*3+boundary;
}
export interface TcgMatRegion extends TcgMatCell {lastRow:number}
export const TCG_ZONE_LABELS = [
  ['LOCATIONS','PLAY 03','LEADERS'],
  ['RESERVE','PLAY 02','DECK'],
  ['WAIT','PLAY 01','DISCARD'],
  ['RESOURCE','HAND','REMOVE']
] as const;
export const TCG_ROW_COLORS = [0x00f5ff,0x00ff87,0xffd700,0xff006e] as const;
export function tcgRegionLabel(row:number,column:number,lastRow=row):string {
  if(column!==1||row===lastRow)return TCG_ZONE_LABELS[row]?.[column]??'';
  if(row===0&&lastRow===2)return 'TOTAL BATTLEFIELD';
  if(row===0&&lastRow===1)return 'ZONE 02+03';
  if(row===1&&lastRow===2)return 'ZONE 01+02';
  return TCG_ZONE_LABELS.slice(row,lastRow+1).map(labels=>labels[1]).join(' + ');
}
/** Destructive drop targets use the actual pocket, never the outside snap margin. */
export function isTcgRemoveDrop(x:number,y:number,seat:number):boolean {
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  const cell=tcgMatCells(seat).find(c=>c.row===3&&c.column===2)!;
  const point=tcgMatLocal(x,y,seat),center=tcgMatLocal(cell.x,cell.y,seat);
  return Math.abs(point.x-center.x)<=cell.width/2&&Math.abs(point.y-center.y)<=cell.height/2;
}
/** The two wooden accessory boxes are independent of the card pockets.
 * Dropping the CENTER of a used die in either one deletes that die; source
 * generators never disappear. */
export function isTcgSideBoxDrop(x:number,y:number,seat:number):boolean {
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  const local=tcgMatLocal(x,y,seat);
  const half=TCG_MAT.cardWidth/2+4;
  const center=TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3;
  const top=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap-5;
  return local.y>=top&&local.y<=TCG_MAT_HEIGHT/2+5&&
    (Math.abs(local.x-center)<=half||Math.abs(local.x+center)<=half);
}
/** Render and snap to contiguous merged center-row groups. Side rows remain separate. */
export function tcgMatRegions(seat:number,merged:readonly number[]=[]):TcgMatRegion[] {
  const cells=tcgMatCells(seat);
  const result:TcgMatRegion[]=cells.filter(c=>c.column!==1).map(c=>({...c,lastRow:c.row}));
  for(let first=0;first<TCG_MAT.rows;){
    let last=first;
    while(last<TCG_MAT.rows-1&&merged.includes(centerMergeKey(seat,last)))last++;
    const a=cells.find(c=>c.column===1&&c.row===first)!;
    const b=cells.find(c=>c.column===1&&c.row===last)!;
    result.push({...a,x:(a.x+b.x)/2,y:(a.y+b.y)/2,
      height:(last-first+1)*TCG_MAT.rowHeight+(last-first)*TCG_MAT.gap,lastRow:last});
    first=last+1;
  }
  return result;
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
/** Hit-test seats and whole mats independently of cards or other objects.
 * This is used when the eye tool is waiting for an opponent selection. */
export interface OpposingMatLayout {
  player:{x:number;y:number;rotation:number};
  opponent:{x:number;y:number;rotation:number};
}
/** Visual-only framing. Source table seats, card coordinates and replay remain unchanged. */
/** From the numbered, zoomed-out seating arrangement: increasing seat
 * numbers run clockwise. Skip the viewer's seat when cycling opponents. */
export function neighboringOpponentSeat(
  viewerSeat:number,currentOpponent:number,direction:'left'|'right'
):number {
  const own=((Math.trunc(viewerSeat)%SEATS)+SEATS)%SEATS;
  let next=((Math.trunc(currentOpponent)%SEATS)+SEATS)%SEATS;
  const delta=direction==='left'?-1:1;
  // With twelve positions exactly one step can land on the viewer.
  do {next=(next+delta+SEATS)%SEATS;}while(next===own);
  return next;
}
export function opposingMatLayout(viewerSeat:number,opponentSeat:number):OpposingMatLayout {
  const radial=-Math.PI/2+viewerSeat*Math.PI/6;
  const dx=Math.cos(radial),dy=Math.sin(radial);
  // Centers are one mat-height apart: their inside edges meet at the seam.
  const distance=TCG_MAT_HEIGHT/2;
  return {
    player:{x:BOARD_CENTER+dx*distance,y:BOARD_CENTER+dy*distance,rotation:0},
    opponent:{x:BOARD_CENTER-dx*distance,y:BOARD_CENTER-dy*distance,
      rotation:(viewerSeat+6-opponentSeat)*Math.PI/6}
  };
}
export type OpponentRelation='enemy'|'ally'|null;
/** Opponent controls stay fully inside their own half of the battlefield.
 * Enemy mats face 180° toward the viewer, so the physical screen-TOP is
 * their local BOTTOM edge. Mirror X too: Sword stays on the screen-left,
 * Shield on the screen-right, even for an upside-down opponent mat.
 * An inset beyond the hit radius keeps controls away from the dividing
 * line (for allies) and from viewport clipping (for enemies).
 */
/** Every control circle is CENTERED ON THE BOTTOM BOUNDARY OF THE HAND
 * SECTION (row 4, middle column), measured in that playmat owner's local
 * coordinate system. This is the physical row's bottom border, NOT an
 * inset inside the mat, not the divider, and not the screen-bottom edge.
 *
 * Enemy mats are rotated 180 degrees. Their Hand-bottom edge therefore
 * appears along the screen-TOP, correctly following that opponent's own
 * perspective. All pairs share the same symmetrical horizontal spacing.
 */
export const PLAYMAT_BOTTOM_BUTTON_RADIUS=16;
export const PLAYMAT_BOTTOM_BUTTON_HIT_RADIUS=19;
export const PLAYMAT_BOTTOM_BUTTON_OFFSET=22;
/** Balanced clear space around every mat in Eye and Castle views.
 * The Play 03 top-line circles extend 19 units past the mat, plus 3
 * additional units of antialiasing clearance.
 * Applied equally at the divider, outer viewport edges, and between mats.
 */
export const BATTLEFIELD_PLAYMAT_PADDING=PLAYMAT_BOTTOM_BUTTON_HIT_RADIUS+3;
export function battlefieldFitBounds(columns:number,padding=BATTLEFIELD_PLAYMAT_PADDING,
  includeSideBoxes=false){
  const pad=Math.max(0,padding);
  const count=Math.max(1,Math.trunc(columns));
  const step=TCG_MAT_WIDTH+Math.max(ALLY_MAT_GAP,2*pad);
  // Eye view must frame the full geometry of both retractable boxes,
  // including wood trim and an exposed drawer pull at either extreme.
  const outside=includeSideBoxes?TCG_MAT.cardWidth+18:0;
  return {
    width:TCG_MAT_WIDTH+(count-1)*step+2*pad+2*outside,
    height:2*TCG_MAT_HEIGHT+4*pad
  };
}
// Row 0 (zero-indexed) is PLAY 03. All view and relationship
// buttons straddle its top edge, using the owning player's coordinates.
export const TCG_PLAY03_TOP_LINE_Y=-TCG_MAT_HEIGHT/2;
// Preserve the independent HAND-edge geometry for existing consumers.
export const TCG_HAND_BOTTOM_LINE_Y=
  -TCG_MAT_HEIGHT/2+
  (TCG_MAT.rows-1)*(TCG_MAT.rowHeight+TCG_MAT.gap)+
  TCG_MAT.rowHeight;
// Legacy API alias: the button line is now the top of PLAY 03.
export const PLAYMAT_BOTTOM_BUTTON_Y=TCG_PLAY03_TOP_LINE_Y;
export const VIEW_BUTTON_RADIUS=PLAYMAT_BOTTOM_BUTTON_RADIUS;
export const VIEW_BUTTON_HIT_RADIUS=PLAYMAT_BOTTOM_BUTTON_HIT_RADIUS;
export const VIEW_BUTTON_CASTLE_OFFSET=PLAYMAT_BOTTOM_BUTTON_OFFSET;
export function viewButtonPosition(control:'eye'|'castle'):{
  x:number;y:number
}{
  return {
    x:control==='eye'?-PLAYMAT_BOTTOM_BUTTON_OFFSET:PLAYMAT_BOTTOM_BUTTON_OFFSET,
    y:TCG_PLAY03_TOP_LINE_Y
  };
}
/** The gear's CENTER is the exact bottom-right corner of the viewer's
 * own playmat: the right edge meets the HAND bottom edge. Its hit circle
 * straddles BOTH borders equally. Eye/Castle viewport padding already
 * reserves 22 units, enough for the full 19-unit hit radius.
 */
export function tcgSettingsButtonPosition():{x:number;y:number}{
  return {
    x:TCG_MAT_WIDTH/2,
    y:TCG_MAT_HEIGHT/2
  };
}
/** Shared visual colors: consistent inactive role identity, unmistakable
 * vibrant selected states, and contrasting outlines.
 */
export const OPPONENT_RELATION_COLORS={
  enemy:{idle:0x913044,active:0xff526d,outlineIdle:0xd18d99,outlineActive:0xffdfca},
  ally:{idle:0x275d99,active:0x48b6ff,outlineIdle:0x92bfe8,outlineActive:0xd9f6ff}
} as const;
export const OPPONENT_RELATION_BUTTON_OFFSET=PLAYMAT_BOTTOM_BUTTON_OFFSET;
export const OPPONENT_RELATION_BUTTON_RADIUS=PLAYMAT_BOTTOM_BUTTON_RADIUS;
export const OPPONENT_RELATION_BUTTON_HIT_RADIUS=PLAYMAT_BOTTOM_BUTTON_HIT_RADIUS;
export function opponentRelationButtonPosition(choice:'enemy'|'ally',_enemySide=false){
  return {
    // This is from the MAT OWNER'S perspective. An enemy mat rotates
    // naturally; do not invert coordinates based on the local viewer.
    x:choice==='enemy'?-OPPONENT_RELATION_BUTTON_OFFSET:OPPONENT_RELATION_BUTTON_OFFSET,
    y:TCG_PLAY03_TOP_LINE_Y
  };
}
/** Only one role can be active for an opponent; activating it again clears it. */
export function toggleOpponentRelation(
  current:OpponentRelation,choice:'enemy'|'ally'
):OpponentRelation {
  return current===choice?null:choice;
}
/** Allied mates stay side-by-side on the same (bottom) side of the divider,
 * share the player's upright orientation, and do not overlap. Coordinates
 * remain canonical: this is solely a re-framing of seat layers. */
export const ALLY_MAT_GAP=18;
export function alliedMatLayout(viewerSeat:number,allySeat:number):OpposingMatLayout {
  const radial=-Math.PI/2+viewerSeat*Math.PI/6;
  const downX=Math.cos(radial),downY=Math.sin(radial);
  const playerAngle=tcgMatOrigin(viewerSeat).angle;
  const rightX=Math.cos(playerAngle),rightY=Math.sin(playerAngle);
  const spacing=(TCG_MAT_WIDTH+ALLY_MAT_GAP)/2;
  const midX=BOARD_CENTER+downX*TCG_MAT_HEIGHT/2;
  const midY=BOARD_CENTER+downY*TCG_MAT_HEIGHT/2;
  return {
    player:{x:midX-rightX*spacing,y:midY-rightY*spacing,rotation:0},
    opponent:{x:midX+rightX*spacing,y:midY+rightY*spacing,
      rotation:(viewerSeat-allySeat)*Math.PI/6}
  };
}
/** The enemy-facing side is an invariant of Opponent Mode.
 * Shield is the ONLY relation that permits a side-by-side arrangement.
 * Sword, a neutral opponent, and transitions from a previous Ally all use
 * the exact same opposite-side geometry relative to the current viewer.
 */
export function matchupMatLayout(
  viewerSeat:number,opponentSeat:number,relation:OpponentRelation
):OpposingMatLayout {
  return relation==='ally'
    ?alliedMatLayout(viewerSeat,opponentSeat)
    :opposingMatLayout(viewerSeat,opponentSeat);
}
/** Every Sword-marked enemy stays in the upper/opposing row—even
 * while a Shield-marked ally is selected. All allied seats share the
 * player's lower row and face the player's direction. Unmarked selected
 * opponents retain the classic across-the-table presentation.
 *
 * This transforms visuals only; canonical tabletop positions never change.
 */
export function groupedMatchupLayout(
  viewerSeat:number,selectedSeat:number|null,
  relations:Readonly<Record<number,OpponentRelation>>,padding=0
):{mats:Map<number,OpposingMatLayout['player']>;enemySeats:number[];allySeats:number[];columns:number} {
  const pad=Math.max(0,padding);
  const seats=Array.from({length:SEATS},(_,seat)=>seat)
    .filter(seat=>seat!==viewerSeat);
  const enemySeats=seats.filter(seat=>relations[seat]==='enemy'||
    (seat===selectedSeat&&relations[seat]!=='ally'));
  const allySeats=seats.filter(seat=>relations[seat]==='ally');
  const bottomSeats=[viewerSeat,...allySeats];
  const radial=-Math.PI/2+viewerSeat*Math.PI/6;
  const downX=Math.cos(radial),downY=Math.sin(radial);
  const originAngle=tcgMatOrigin(viewerSeat).angle;
  const rightX=Math.cos(originAngle),rightY=Math.sin(originAngle);
  // Keep at least one full pad on EITHER side of adjacent playmats.
  const distance=TCG_MAT_WIDTH+Math.max(ALLY_MAT_GAP,2*pad);
  const mats=new Map<number,OpposingMatLayout['player']>();
  const add=(list:readonly number[],y:number,enemy:boolean)=>{
    for(let index=0;index<list.length;index++){
      const seat=list[index];
      const x=(index-(list.length-1)/2)*distance;
      mats.set(seat,{
        x:BOARD_CENTER+rightX*x+downX*y,
        y:BOARD_CENTER+rightY*x+downY*y,
        rotation:seat===viewerSeat?0:
          (viewerSeat+(enemy?6:0)-seat)*Math.PI/6
      });
    }
  };
  add(enemySeats,-TCG_MAT_HEIGHT/2-pad,true);
  add(bottomSeats,TCG_MAT_HEIGHT/2+pad,false);
  return {
    mats,enemySeats,allySeats,
    columns:Math.max(enemySeats.length,bottomSeats.length)
  };
}
/** Castle is viewer-local: Single displays exactly one Shield-marked
 * ally; All lays them out to the right without ever shrinking or shifting
 * the viewer's left-hand mat. Enemy mats remain across the central divide.
 * World positions are screen-relative after viewerTableRotation(), so this
 * geometry is independent of which of the twelve seats is occupied.
 */
export type CastleMode='single'|'all';
/** Twelve table positions leave at most ten allies when the viewer and
 * at least one enemy are present. The layout still handles 11 defensively.
 */
export const CASTLE_MAX_ALLIES=SEATS-2;
/** Close spacing for GRID NEIGHBORS only. Do not change the much wider
 * existing padding around the viewer's full-size playmat.
 */
export const CASTLE_GRID_GAP=6;

/** Maximum UNIFORM mat scale over every rectangular row/column arrangement.
 * Vertical seams allow the scaled Play 03 button to protrude beyond its mat.
 * Horizontal seams can be very tight because buttons sit near the center.
 */
export function bestCastleGridShape(count:number,areaW:number,areaH:number){
  const n=Math.max(0,Math.trunc(count));
  if(!n)return {cols:0,rows:0,scale:0,gapX:CASTLE_GRID_GAP,gapY:CASTLE_GRID_GAP};
  let bestCols=1,bestRows=n,bestScale=0;
  for(let cols=1;cols<=n;cols++){
    const rows=Math.ceil(n/cols);
    const availableW=areaW-(cols-1)*CASTLE_GRID_GAP;
    const availableH=areaH-(rows-1)*CASTLE_GRID_GAP;
    if(availableW<=0||availableH<=0)continue;
    const scale=Math.min(1,
      availableW/(cols*TCG_MAT_WIDTH),
      availableH/(rows*TCG_MAT_HEIGHT+(rows-1)*VIEW_BUTTON_HIT_RADIUS));
    if(scale>bestScale+1e-9||
      (Math.abs(scale-bestScale)<=1e-9&&rows<bestRows)){
      bestScale=scale;bestCols=cols;bestRows=rows;
    }
  }
  const s=Math.max(0.000001,bestScale);
  return {cols:bestCols,rows:bestRows,scale:s,
    gapX:CASTLE_GRID_GAP,
    gapY:CASTLE_GRID_GAP+VIEW_BUTTON_HIT_RADIUS*s};
}

export function castleAllySeats(
  viewerSeat:number,relations:Readonly<Record<number,OpponentRelation>>
):number[]{
  return Array.from({length:SEATS},(_,seat)=>seat)
    .filter(seat=>seat!==viewerSeat&&relations[seat]==='ally');
}
export function nextCastleAllySeat(
  viewerSeat:number,current:number|null,
  direction:'left'|'right',relations:Readonly<Record<number,OpponentRelation>>
):number|null{
  const allies=castleAllySeats(viewerSeat,relations);
  if(!allies.length)return null;
  if(current===null||!allies.includes(current))return allies[0];
  const next=(allies.indexOf(current)+(direction==='right'?1:-1)+allies.length)%allies.length;
  return allies[next];
}
export interface CastleMatPlacement {x:number;y:number;rotation:number;scale:number}
export function castleGridLayout(
  viewerSeat:number,relations:Readonly<Record<number,OpponentRelation>>,
  mode:CastleMode,selectedAlly:number|null,
  viewport:{width:number;height:number},
  padding=BATTLEFIELD_PLAYMAT_PADDING
):{
  mats:Map<number,CastleMatPlacement>;allySeats:number[];enemySeats:number[];
  selectedAlly:number|null;cameraScale:number
}{
  const pad=Math.max(0,padding);
  const width=Math.max(1,viewport.width),height=Math.max(1,viewport.height);
  const cameraScale=Math.min(
    height/(2*TCG_MAT_HEIGHT+4*pad),
    width/(2*TCG_MAT_WIDTH+3*pad)
  );
  const visibleW=width/cameraScale,visibleH=height/cameraScale;
  const rotation=viewerTableRotation(viewerSeat);
  const cos=Math.cos(rotation),sin=Math.sin(rotation);
  // Convert stable screen-up/down coordinates to world coordinates before
  // the board's rotation is applied. Never introduce a viewport pan.
  const world=(x:number,y:number)=>({
    x:BOARD_CENTER+x*cos+y*sin,
    y:BOARD_CENTER-x*sin+y*cos
  });
  const mats=new Map<number,CastleMatPlacement>();
  const allies=castleAllySeats(viewerSeat,relations);
  const enemySeats=Array.from({length:SEATS},(_,seat)=>seat)
    .filter(seat=>seat!==viewerSeat&&relations[seat]==='enemy');
  const active=selectedAlly!==null&&allies.includes(selectedAlly)
    ?selectedAlly:allies[0]??null;
  // The viewer is always full-size, at precisely the same left edge and
  // vertical midpoint for Single, All, and any ally/enemy count.
  // Keep the viewer centered on the lower half of the zoomed battlefield.
  // Allies will alternate around this anchor instead of pushing it left.
  const viewerLeft=-TCG_MAT_WIDTH/2;
  const viewerCenter=world(0,visibleH/4);
  mats.set(viewerSeat,{...viewerCenter,rotation:0,scale:1});
  // Match the small outer wall clearance to the inner viewer-to-ally gap.
  // Center each wing in its remaining lane, sharing unused space equally.
  const playerGap=pad;
  const grid=(
    seats:readonly number[],rect:{left:number;right:number;top:number;bottom:number},
    enemy:boolean
  )=>{
    if(!seats.length)return;
    const areaW=rect.right-rect.left,areaH=rect.bottom-rect.top;
    // Compute the mathematically largest uniform scale for this count,
    // for every shape from a tall column to a single horizontal row.
    const shape=bestCastleGridShape(seats.length,areaW,areaH);
    const {cols,scale:s,gapX,gapY}=shape;
    const cellW=TCG_MAT_WIDTH*s,cellH=TCG_MAT_HEIGHT*s;
    const totalH=shape.rows*cellH+(shape.rows-1)*gapY;
    for(let index=0;index<seats.length;index++){
      const row=Math.floor(index/cols),col=index%cols;
      const entries=Math.min(cols,seats.length-row*cols);
      const rowWidth=entries*cellW+(entries-1)*gapX;
      const x=(rect.left+rect.right-rowWidth)/2+col*(cellW+gapX)+cellW/2;
      const y=(rect.top+rect.bottom-totalH)/2+row*(cellH+gapY)+cellH/2;
      const seat=seats[index];
      mats.set(seat,{...world(x,y),
        rotation:(viewerSeat+(enemy?6:0)-seat)*Math.PI/6,scale:s});
    }
  };
  grid(enemySeats,{
    left:-visibleW/2+pad,right:visibleW/2-pad,
    top:-visibleH/2+pad,bottom:-pad
  },true);
  const drawnAllies=mode==='single'?(active===null?[]:[active]):allies;
  if(drawnAllies.length){
    const bottomTop=pad,bottomEnd=visibleH/2-pad;
    const availableWidth=Math.max(1,(visibleW-TCG_MAT_WIDTH)/2-pad-playerGap);
    const availableHeight=Math.max(1,bottomEnd-bottomTop);
    // Symmetric wings: 1 right, 1 left, 2 right, 2 left...
    // Each wing gets equal available area and a uniform scale.
    const right=drawnAllies.filter((_,i)=>i%2===0);
    const left=drawnAllies.filter((_,i)=>i%2===1);
    const maxCount=Math.max(right.length,left.length);
    const shape=bestCastleGridShape(maxCount,availableWidth,availableHeight);
    const s=shape.scale,cellW=TCG_MAT_WIDTH*s,cellH=TCG_MAT_HEIGHT*s;
    const placeWing=(seats:readonly number[],side:'left'|'right')=>{
      const totalH=shape.rows*cellH+(shape.rows-1)*shape.gapY;
      for(let i=0;i<seats.length;i++){
        const row=Math.floor(i/shape.cols),col=i%shape.cols;
        const entries=Math.min(shape.cols,seats.length-row*shape.cols);
        const rowWidth=entries*cellW+(entries-1)*shape.gapX;
        const centerX=side==='right'
          ?TCG_MAT_WIDTH/2+playerGap+availableWidth/2
          :-TCG_MAT_WIDTH/2-playerGap-availableWidth/2;
        const x=centerX-rowWidth/2+col*(cellW+shape.gapX)+cellW/2;
        const y=(bottomTop+bottomEnd-totalH)/2+row*(cellH+shape.gapY)+cellH/2;
        const allySeat=seats[i];
        mats.set(allySeat,{...world(x,y),
          rotation:(viewerSeat-allySeat)*Math.PI/6,scale:s});
      }
    };
    placeWing(right,'right');
    placeWing(left,'left');
  }
  return {mats,allySeats:allies,enemySeats,selectedAlly:active,cameraScale};
}
/** Each side of Castle All can independently show its complete grid or
 * one focused mat. Focusing an Ally leaves the entire Enemy grid untouched,
 * and vice versa. With both sides focused exactly three mats remain:
 * viewer + one Ally + one Enemy. Focus is local presentation only.
 *
 * Invalid or stale role selections are ignored so a switched/cleared
 * Sword/Shield relationship cannot make a player appear on the wrong side.
 */
export interface CastleSideFocus{
  ally:number|null;
  enemy:number|null;
}
export function castleIndependentFocusLayout(
  viewerSeat:number,
  relations:Readonly<Record<number,OpponentRelation>>,
  mode:CastleMode,selectedAlly:number|null,
  focused:Readonly<CastleSideFocus>,
  viewport:{width:number;height:number},
  padding=BATTLEFIELD_PLAYMAT_PADDING,
  selectedEnemy:number|null=null
):ReturnType<typeof castleGridLayout>{
  const available=(role:'ally'|'enemy')=>
    Array.from({length:SEATS},(_,seat)=>seat)
      .filter(seat=>seat!==viewerSeat&&relations[seat]===role);
  const allies=available('ally'),enemies=available('enemy');
  const valid=(seat:number|null,role:'ally'|'enemy')=>
    seat!==null&&seat!==viewerSeat&&relations[seat]===role?seat:null;
  const allyFocus=valid(focused.ally,'ally');
  const enemyFocus=valid(focused.enemy,'enemy');
  const activeAlly=valid(selectedAlly,'ally')??allies[0]??null;
  const activeEnemy=valid(selectedEnemy,'enemy')??enemies[0]??null;
  // A focus overrides ONLY its own side. Otherwise Single means one
  // participant from EACH role and All means all participants from EACH.
  // This deliberately does not use castleGridLayout's ally-only "single"
  // option: both Sword and Shield groups must follow the same toggle.
  const drawnAllies=allyFocus!==null?[allyFocus]:
    mode==='single'?(activeAlly===null?[]:[activeAlly]):allies;
  const drawnEnemies=enemyFocus!==null?[enemyFocus]:
    mode==='single'?(activeEnemy===null?[]:[activeEnemy]):enemies;
  const displayed:Record<number,OpponentRelation>={};
  for(const seat of drawnAllies)displayed[seat]='ally';
  for(const seat of drawnEnemies)displayed[seat]='enemy';
  // Keep the SAME viewport-based camera, viewer anchor and per-half grid
  // rectangles as All, independent of which side is single or focused.
  const layout=castleGridLayout(viewerSeat,displayed,'all',
    allyFocus??activeAlly,viewport,padding);
  // Castle presentation needs to use the spare width between the viewer and
  // both wings. The baseline grid used that space as empty air because the
  // viewer was hard-coded to scale 1. Grow the viewer into the clearance,
  // without moving the allies or changing their uniform grid scales.
  const own=layout.mats.get(viewerSeat);
  if(own){
    const scale=layout.cameraScale;
    const visibleW=Math.max(1,viewport.width)/scale;
    const visibleH=Math.max(1,viewport.height)/scale;
    const rot=viewerTableRotation(viewerSeat);
    const project=(p:CastleMatPlacement)=>{
      const dx=p.x-BOARD_CENTER,dy=p.y-BOARD_CENTER;
      return {x:dx*Math.cos(rot)-dy*Math.sin(rot),
        y:dx*Math.sin(rot)+dy*Math.cos(rot)};
    };
    const stable=castleGridLayout(viewerSeat,relations,'all',activeAlly,viewport,padding);
    const wingMats=[...stable.mats].filter(([id])=>relations[id]==='ally')
      .map(([,p])=>({pos:project(p),half:TCG_MAT_WIDTH*p.scale/2}));
    const nearestLeft=Math.max(-visibleW/2,
      ...wingMats.filter(m=>m.pos.x<0).map(m=>m.pos.x+m.half));
    const nearestRight=Math.min(visibleW/2,
      ...wingMats.filter(m=>m.pos.x>0).map(m=>m.pos.x-m.half));
    const freeHalf=Math.min(-nearestLeft,nearestRight)-Math.max(0,padding);
    const verticalHalf=visibleH/4-Math.max(0,padding);
    const viewerScale=Math.max(1,Math.min(1.32,
      2*freeHalf/TCG_MAT_WIDTH,2*verticalHalf/TCG_MAT_HEIGHT));
    // Keep a real safety gap even in narrow portrait screens.
    if(viewerScale>1+1e-8)own.scale=viewerScale;
  }
  return layout;
}
/** Pure per-mat arrow policy. In Castle Single BOTH roles have
 * navigation. In mixed focus, a side's arrows stay active independently
 * of whether the other side is in All, Single, or already focused.
 */
export function castleArrowsVisible(
  viewerSeat:number,seat:number,mode:CastleMode|'focus',
  baseMode:CastleMode,selectedAlly:number|null,selectedEnemy:number|null,
  focused:Readonly<CastleSideFocus>,
  relations:Readonly<Record<number,OpponentRelation>>
):boolean{
  if(seat===viewerSeat||seat<0||seat>=SEATS)return false;
  const role=relations[seat];
  if(role!=='ally'&&role!=='enemy')return false;
  if(mode==='all')return false;
  if(mode==='single')return role==='ally'
    ?seat===selectedAlly:seat===selectedEnemy;
  const focusedSeat=role==='ally'?focused.ally:focused.enemy;
  const selectedSeat=role==='ally'?selectedAlly:selectedEnemy;
  return focusedSeat===seat||
    focusedSeat===null&&baseMode==='single'&&selectedSeat===seat;
}
/** Focus a marked Castle ally or enemy in isolation without changing the
 * all/single preference. Reuses the same locked Castle camera and the same
 * full-size left-aligned viewer mat, regardless of the chosen opponent.
 * Unmarked seats cannot be focused.
 */
export function castleFocusedLayout(
  viewerSeat:number,targetSeat:number,
  relations:Readonly<Record<number,OpponentRelation>>,
  viewport:{width:number;height:number},
  padding=BATTLEFIELD_PLAYMAT_PADDING
):ReturnType<typeof castleGridLayout>|null{
  if(!Number.isInteger(targetSeat)||targetSeat<0||targetSeat>=SEATS||
     targetSeat===viewerSeat)return null;
  const relation=relations[targetSeat];
  if(relation!=='ally'&&relation!=='enemy')return null;
  return castleGridLayout(viewerSeat,{[targetSeat]:relation},'single',
    relation==='ally'?targetSeat:null,viewport,padding);
}
/** Cycle only players with the SAME relationship as the focused seat.
 * This keeps a focused enemy on the enemy side and a focused ally beside
 * the viewer instead of silently changing teams while cycling.
 */
export function nextCastleFocusedSeat(
  viewerSeat:number,current:number,direction:'left'|'right',
  relations:Readonly<Record<number,OpponentRelation>>
):number|null{
  const role=relations[current];
  if(role!=='ally'&&role!=='enemy')return null;
  const seats=Array.from({length:SEATS},(_,seat)=>seat)
    .filter(seat=>seat!==viewerSeat&&relations[seat]===role);
  const index=seats.indexOf(current);
  if(index<0)return null;
  return seats[(index+(direction==='left'?-1:1)+seats.length)%seats.length];
}
/** Eye ALWAYS shows exactly the viewer and the selected opponent on
 * opposite sides of the divider, regardless of Sword/Shield status.
 * Only Castle distributes marked allies beside the player.
 */
export function oneOnOneMatchupLayout(
  viewerSeat:number,opponentSeat:number,
  _relations:Readonly<Record<number,OpponentRelation>>,padding=0
):ReturnType<typeof groupedMatchupLayout>{
  return groupedMatchupLayout(viewerSeat,opponentSeat,{},padding);
}
/** Eye ignores Sword/Shield classification for visual facing; Castle
 * alone puts allies on the viewer's side of the divider.
 */
export function opponentAcrossDivider(
  mode:'eye'|'castle',relation:OpponentRelation
):boolean{
  return mode==='eye'||relation!=='ally';
}
export function opponentAtTablePoint(x:number,y:number,viewerSeat:number):number|null {
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  for(let seat=0;seat<SEATS;seat++){
    if(seat===viewerSeat)continue;
    const local=tcgMatLocal(x,y,seat);
    if(Math.abs(local.x)<=TCG_MAT_WIDTH/2+12&&
      Math.abs(local.y)<=TCG_MAT_HEIGHT/2+12)return seat;
    // Chair, name and seat number share the same hit target.
    const theta=seat*Math.PI/6-Math.PI/2;
    const chairX=BOARD_CENTER+TABLE_SEAT_RADIUS*Math.cos(theta);
    const chairY=BOARD_CENTER+TABLE_SEAT_RADIUS*Math.sin(theta);
    const angle=playerSeatRotation(seat);
    const dx=x-chairX,dy=y-chairY;
    const lx=dx*Math.cos(angle)+dy*Math.sin(angle);
    const ly=-dx*Math.sin(angle)+dy*Math.cos(angle);
    if(Math.abs(lx)<=125&&Math.abs(ly)<=66)return seat;
  }
  return null;
}

/** Snap to the nearest valid play ZONE, then its nearest legal card SLOT.
 * Unmerged PLAY/HAND center zones expose the original seven anchors AND
 * six interstitial half-slots (13 independently selectable anchors per row).
 * Outside a pocket, ties in the gaps are decided by the actual nearest
 * card spot—not the midpoint of a wide middle zone.
 *
 * Merged middle zones retain their existing freeform default unless
 * their owner explicitly enabled snap-while-merged.
 * The same pure function drives move commands and the drag preview.
 */
export function tcgSnapPoint(x:number,y:number,merged:readonly number[]=[],snapMerged=false,snapMergedSeat?:number,cardScale=1):TcgSnapLocation|null {
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  let best:TcgSnapLocation|null=null;
  let bestZoneDistance=Infinity,bestSpotDistance=Infinity;
  const eps=1e-8;
  for(let seat=0;seat<SEATS;seat++){
    const local=tcgMatLocal(x,y,seat);
    for(const cell of tcgMatRegions(seat,merged)){
      const anchor=tcgMatLocal(cell.x,cell.y,seat);
      const distanceX=Math.max(0,Math.abs(local.x-anchor.x)-cell.width/2);
      const distanceY=Math.max(0,Math.abs(local.y-anchor.y)-cell.height/2);
      const zoneDistance=Math.hypot(distanceX,distanceY);
      const seatMaySnap=snapMerged&&(snapMergedSeat===undefined||snapMergedSeat===seat);
      if(cell.column===1&&cell.lastRow>cell.row&&!seatMaySnap){
        // Keep the ENTIRE merged battlefield freeform: a drop inside a
        // joined pocket must not be stolen by any neighboring zone.
        if(zoneDistance<=eps)return null;
        continue;
      }
      if(zoneDistance>TCG_MAT.snapOutside)continue;
      if(zoneDistance>bestZoneDistance+eps)continue;

      const isCenter=cell.column===1;
      const positions=isCenter?TCG_MAT.centerCards:1;
      const slotWidth=cell.width/positions;
      // Keep original positions 0..6 exactly where they are. Odd half-step
      // anchors 0.5..5.5 fill the gaps without changing any card geometry.
      // Prefer original integer slots on an exact equidistant tie.
      let slot=0,nearestX=anchor.x;
      let slotDistance=Infinity;
      const anchors=isCenter?2*positions-1:1;
      for(let i=0;i<anchors;i++){
        const candidateSlot=isCenter?i/2:0;
        const candidateX=anchor.x+
          (candidateSlot-(positions-1)/2)*slotWidth;
        const distance=Math.abs(local.x-candidateX);
        if(distance<slotDistance-eps||
          (Math.abs(distance-slotDistance)<=eps&&
           Number.isInteger(candidateSlot)&&!Number.isInteger(slot))){
          slot=candidateSlot;nearestX=candidateX;slotDistance=distance;
        }
      }
      // An enabled merged PLAY zone retains EVERY unmerged row center,
      // plus the seams between adjacent rows: don't collapse all card
      // placements onto one centerline.
      let nearestY=anchor.y;
      if(isCenter&&cell.lastRow>cell.row&&seatMaySnap){
        // Read the canonical unmerged row centers, including actual mat
        // gaps; never approximate row stride from the whole mat height.
        const rows=tcgMatCells(seat)
          .filter(original=>original.column===1&&original.row>=cell.row&&
            original.row<=cell.lastRow)
          .map(original=>tcgMatLocal(original.x,original.y,seat).y);
        const candidates=rows.flatMap((value,i)=>i<rows.length-1?
          [value,(value+rows[i+1])/2]:[value]);
        nearestY=candidates.reduce((best,value)=>
          Math.abs(local.y-value)<Math.abs(local.y-best)?value:best,candidates[0]);
      }
      const spotDistance=Math.hypot(slotDistance,local.y-nearestY);
      if(best&&Math.abs(zoneDistance-bestZoneDistance)<=eps&&
         spotDistance>=bestSpotDistance-eps)continue;
      // A 50%-scale card occupies precisely one of four quadrants
      // inside an ordinary 100%-card slot, preserving all existing
      // full-size anchor positions and the older interstitial slots.
      if(cardScale===0.5){
        nearestX+=(local.x>=nearestX?1:-1)*TCG_MAT.cardWidth/4;
        nearestY+=(local.y>=nearestY?1:-1)*TCG_MAT.cardHeight/4;
      }
      const snapped=tcgMatWorld(nearestX,nearestY,seat);
      best={...cell,...snapped,slot};
      bestZoneDistance=zoneDistance;
      bestSpotDistance=spotDistance;
    }
  }
  return best;
}
/** Project a rotated card's entire footprint into playmat coordinates. */
export function tcgCardZoneHalfExtents(cardScale=1,rotation=0):{x:number;y:number}{
  const scale=Number.isFinite(cardScale)&&cardScale>0?cardScale:1;
  const angle=(Number.isFinite(rotation)?rotation:0)*Math.PI/180;
  const cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
  return {x:(TCG_MAT.cardWidth*cos+TCG_MAT.cardHeight*sin)*scale/2,
    y:(TCG_MAT.cardHeight*cos+TCG_MAT.cardWidth*sin)*scale/2};
}
export interface TcgPlacementLocation extends TcgSnapLocation{freePlacement?:boolean}
/** Shared deterministic resolver: free horizontal alignment in separate
 * center PLAY/HAND pockets; free X/Y inside merged pockets. Clamp the
 * ENTIRE card inside the nearest region, even when its center is just
 * outside it. Side pockets and other players retain existing behavior. */
export function tcgPlacementPoint(
  x:number,y:number,merged:readonly number[]=[],snapMerged=false,
  preferredSeat?:number,cardScale=1,freePlacement=false,cardRotation=0
):TcgPlacementLocation|null{
  if(!freePlacement||!Number.isInteger(preferredSeat)||
    Number(preferredSeat)<0||Number(preferredSeat)>=SEATS)
    return tcgSnapPoint(x,y,merged,snapMerged,preferredSeat,cardScale);
  const seat=Number(preferredSeat),local=tcgMatLocal(x,y,seat);
  if(!Number.isFinite(local.x)||!Number.isFinite(local.y))return null;
  const ext=tcgCardZoneHalfExtents(cardScale,cardRotation);
  let closest:TcgMatRegion|null=null,dist=Infinity;
  for(const region of tcgMatRegions(seat,merged)){
    const anchor=tcgMatLocal(region.x,region.y,seat);
    const dx=Math.max(0,Math.abs(local.x-anchor.x)-region.width/2);
    const dy=Math.max(0,Math.abs(local.y-anchor.y)-region.height/2);
    const d=Math.hypot(dx,dy);
    if(d<dist-1e-8){closest=region;dist=d;}
  }
  // If the card still overlaps a PLAY/HAND center region, prefer that
  // zone to the adjacent outer column. This lets a release a few pixels
  // beyond its edge settle fully back inside instead of jumping columns.
  const centerOverlap=tcgMatRegions(seat,merged).filter(r=>r.column===1)
    .map(region=>{
      const anchor=tcgMatLocal(region.x,region.y,seat);
      const dx=Math.max(0,Math.abs(local.x-anchor.x)-region.width/2);
      const dy=Math.max(0,Math.abs(local.y-anchor.y)-region.height/2);
      return {region,dx,dy,d:Math.hypot(dx,dy)};
    }).filter(hit=>hit.dx<=ext.x&&hit.dy<=ext.y)
    .sort((a,b)=>a.d-b.d)[0];
  if(centerOverlap&&closest?.column!==1&&
    // Do not steal intentional drops in the center of outer pockets.
    centerOverlap.dx<=Math.max(4,ext.x*.65)&&
    centerOverlap.dy<=Math.max(4,ext.y*.65)){
    closest=centerOverlap.region;dist=centerOverlap.d;
  }
  if(!closest||dist>Math.max(TCG_MAT.snapOutside,ext.x,ext.y))
    return tcgSnapPoint(x,y,merged,snapMerged,preferredSeat,cardScale);
  if(closest.column!==1)return tcgSnapPoint(x,y,merged,snapMerged,preferredSeat,cardScale);
  const anchor=tcgMatLocal(closest.x,closest.y,seat);
  const xMin=anchor.x-closest.width/2+ext.x,xMax=anchor.x+closest.width/2-ext.x;
  const yMin=anchor.y-closest.height/2+ext.y,yMax=anchor.y+closest.height/2-ext.y;
  const clampedX=xMin<=xMax?Math.max(xMin,Math.min(xMax,local.x)):anchor.x;
  const clampedY=closest.row!==closest.lastRow&&yMin<=yMax
    ?Math.max(yMin,Math.min(yMax,local.y)):anchor.y;
  const point=tcgMatWorld(clampedX,clampedY,seat);
  return {...closest,...point,slot:0,freePlacement:true};
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
      ...deck('alpha',0,0,12).map(o=>({...o,...tcgSnapPoint(tcgMatCells(0).find(c=>c.row===1&&c.column===2)!.x,tcgMatCells(0).find(c=>c.row===1&&c.column===2)!.y)!,matSeat:0})),
      ...deck('beta',0,0,12).map(o=>({...o,...tcgSnapPoint(tcgMatCells(6).find(c=>c.row===1&&c.column===2)!.x,tcgMatCells(6).find(c=>c.row===1&&c.column===2)!.y)!,matSeat:6})),
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
/** A normalized orientation is required for stable replay of the 3D die. */
export function validThrowQuaternion(value:unknown):value is [number,number,number,number] {
  return Array.isArray(value)&&value.length===4&&value.every(n=>typeof n==='number'&&Number.isFinite(n))&&
    Math.abs(value.reduce((sum,n)=>sum+n*n,0)-1)<.035;
}
/** Literal coin faces are display text, not an evaluated expression.
 * The editable coin accepts digit strings, commas and +/- signs only. */
export function validCoinText(value:unknown): value is string {
  return typeof value==='string'&&value.length<=20&&/^[0-9,+-]*$/.test(value);
}
export function coinNumericValue(text:string):{value:number;sign:1|-1} {
  const normalized=text.replaceAll(',','');
  const parsed=/^[+-]?\d+$/.test(normalized)?Number(normalized):0;
  return {value:Math.max(0,Math.min(9999,Math.abs(parsed)||0)),
    sign:parsed<0||text.trim().startsWith('-')?-1:1};
}
export function sanitizeObject(input: Record<string,unknown>): TableObject {
  const kinds: ObjectKind[] = ['card','deck','deck-box','token','miniature','die','tile','board','marker'];
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
    ...(typeof input.carrierId==='string'&&input.carrierId!==input.id ? {carrierId:textValue(input.carrierId,80)} : {}),
    ...(kind==='token'&&input.tokenCoin===true?{tokenCoin:true,tokenSign:input.tokenSign===-1?-1 as const:1 as const,value:clamp(finite(input.value,1),0,9999),
      ...(validCoinText(input.coinText)?{coinText:input.coinText}:{})}:{}),
    ...(input.scale!==undefined ? {scale:clamp(Math.round(finite(input.scale,1)*2)/2,0.5,7)} : {}),
    ...(input.counters!==undefined ? {counters:clamp(Math.floor(finite(input.counters,0)),0,999)} : {}),
    ...(typeof input.owner === 'string' ? {owner:textValue(input.owner,80)} : {}),
    ...(Number.isInteger(input.matSeat)&&Number(input.matSeat)>=0&&Number(input.matSeat)<SEATS ? {matSeat:Number(input.matSeat)} : {}),
    ...(kind==='die'?{sides:clamp(Math.floor(finite(input.sides,6)),2,100),value:clamp(Math.floor(finite(input.value,1)),1,100)}:{}),
    ...(kind==='die'&&input.throwDice===true?{
      throwDice:true,
      throwRolls:Array.isArray(input.throwRolls)?
        input.throwRolls.slice(0,20).map(v=>Math.floor(finite(v,1))):[],
      throwQuantity:clamp(Math.floor(finite(input.throwQuantity,1)),1,20),
      throwTotal:clamp(Math.floor(finite(input.throwTotal,1)),0,2000),
      ...(validThrowQuaternion(input.throwQuaternion)?{throwQuaternion:input.throwQuaternion as [number,number,number,number]}:{}),
      ...(typeof input.throwAltitude==='number'&&Number.isFinite(input.throwAltitude)?
        {throwAltitude:clamp(input.throwAltitude,0,500)}:{}),
      ...(typeof input.throwExpiresAt==='number'&&Number.isFinite(input.throwExpiresAt)&&input.throwExpiresAt>0?
        {throwExpiresAt:input.throwExpiresAt}:{})
    }:{}),
    ...(frameUrls?.length?{frameUrls}:{}),
    ...(safeUrl(input.faceUrl)?{faceUrl:safeUrl(input.faceUrl)}:{}),
    ...(safeUrl(input.backUrl)?{backUrl:safeUrl(input.backUrl)}:{}),
    ...(typeof input.description==='string'?{description:textValue(input.description,250)}:{})
  };
}
/** Cards sharing one exact physical spot are a stack. This deliberately
 * excludes separate hands and adjacent cards on the seven-card mat. Stacks
 * are reconstructed from public positions, not client-submitted ID lists. */
export const STACK_POSITION_TOLERANCE = 2;
export function cardStackMembers(state:GameState,id:string):TableObject[] {
  const anchor=state.objects.find(o=>o.id===id);
  if(!anchor || !['card','deck'].includes(anchor.kind) || !['TABLE','DECK'].includes(anchor.zone))return [];
  return state.objects.filter(o=>
    (o.kind==='card'||o.kind==='deck') &&
    o.zone===anchor.zone &&
    (o.matSeat??null)===(anchor.matSeat??null) &&
    Math.hypot(o.x-anchor.x,o.y-anchor.y)<=STACK_POSITION_TOLERANCE
  );
}


/** A card carries a loose accessory if and only if the accessory CENTER is
 * inside the card's rotated, scaled rectangle. The coin's size is irrelevant.
 * Seats use the exact same baseline orientation as the Pixi card renderer. */
export function cardContainsPoint(card:TableObject,x:number,y:number,fallbackSeat=0):boolean {
  if((card.kind!=='card'&&card.kind!=='deck')||card.zone!=='TABLE')return false;
  const angle=playerSeatRotation(card.matSeat??fallbackSeat)+card.rotation*Math.PI/180;
  const dx=x-card.x,dy=y-card.y;
  const lx=dx*Math.cos(angle)+dy*Math.sin(angle);
  const ly=-dx*Math.sin(angle)+dy*Math.cos(angle);
  const scale=card.scale??1;
  return Math.abs(lx)<=31*scale+1e-8&&Math.abs(ly)<=44*scale+1e-8;
}
export function cardAtPoint(objects:readonly TableObject[],x:number,y:number,
  fallbackSeat=0,excludingId?:string,preferredId?:string):TableObject|undefined {
  const eligible=(o:TableObject)=>o.id!==excludingId&&
    cardContainsPoint(o,x,y,fallbackSeat);
  const preferred=objects.find(o=>o.id===preferredId);
  if(preferred&&eligible(preferred))return preferred;
  // The last card in a physical pile is drawn on top; use it as carrier.
  return [...objects].reverse().find(eligible);
}
const isLooseAccessory=(object:TableObject)=>
  object.kind==='token'||object.kind==='marker'||
  object.kind==='die'||object.kind==='miniature';

export function validateCommand(state: GameState, command: Command): string | null {
  if (!command || typeof command !== 'object' || !command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) return 'Invalid command';
  if (!command.actor || !command.id || command.id.length > 120 || command.actor.length > 120) return 'Invalid actor or command ID';
  const types: CommandType[]=['ADD','MOVE','MOVE_STACK','SET_CENTER_MERGE','ROTATE','FLIP','DELETE','CLONE','ROLL','DRAW','SHUFFLE','NEXT_TURN','SET_MODE','ADJUST_COUNTER','SET_ZONE','BATCH_CARD_ACTION','TOKEN_PLACE','TOKEN_ADJUST','THROW_TRAY','COIN_MODIFY','REROLL_DIE'];
  if (!types.includes(command.type)) return 'Unsupported action';
  if (state.mode !== 'sandbox' && command.type !== 'SET_MODE' && command.type !== 'SET_CENTER_MERGE') {
    const current = state.players.find(p=>p.seat===state.turnSeat);
    if (state.players.length && current?.id!==command.actor) return `Waiting for seat ${state.turnSeat+1}`;
  }
  const id=String(command.payload.id ?? '');
  const target=state.objects.find(o=>o.id===id);
  if (['MOVE','MOVE_STACK','ROTATE','FLIP','DELETE','CLONE','ROLL','ADJUST_COUNTER','SET_ZONE'].includes(command.type)) {
    if(!target) return 'Object does not exist';
    if(target.locked) return 'Object is locked';
    if (target.owner && target.owner!==command.actor && state.kind==='tcg') return 'This card belongs to another player';
  }
  if(command.type==='BATCH_CARD_ACTION'){
    if(state.kind!=='tcg')return 'Selection wheel is only available for TCG cards';
    const raw=command.payload.ids;
    if(!Array.isArray(raw)||!raw.length||raw.length>1000||
       raw.some(id=>typeof id!=='string'||!id||id.length>80)||
       new Set(raw).size!==raw.length)return 'Invalid selected card IDs';
    const action=String(command.payload.action||'');
    if(!['flip','reveal','tap-toggle','rotate-cw','rotate-ccw','scale-original','scale-smaller',
         'scale-bigger','shuffle','send-to','lock','move'].includes(action))
      return 'Invalid wheel action';
    const selected=raw.map(id=>state.objects.find(o=>o.id===id));
    if(selected.some(o=>!o||!['card','deck','token','marker'].includes(o.kind)))
      return 'Selection contains missing or unsupported cards';
    if(selected.some(o=>o!.owner&&o!.owner!==command.actor))
      return 'Selection includes another player\'s card';
    if(action!=='lock'&&selected.some(o=>o!.locked))
      return 'Selection contains a locked card';
    if(action==='move'){
      if(typeof command.payload.anchorId!=='string'||!raw.includes(command.payload.anchorId)||
        !Number.isFinite(command.payload.x)||!Number.isFinite(command.payload.y))
        return 'Invalid selected-group move';
    }
    if(action==='send-to'){
      if(selected.some(o=>o!.kind!=='card'&&o!.kind!=='deck'))
        return 'Only cards can be sent to a pile';
      const destination=String(command.payload.destination);
      if(!['HAND','DECK_TOP','DECK_BOTTOM','DISCARD','TABLE'].includes(destination))
        return 'Invalid send-to destination';
      const seat=Number(command.payload.matSeat);
      if(!Number.isInteger(seat)||seat<0||seat>=SEATS)return 'Invalid destination mat';
      if(state.players.length&&state.players.find(player=>player.id===command.actor)?.seat!==seat)
        return 'You can only send cards to your own mat';
    }
    if(action==='shuffle'&&selected.some(o=>o!.kind!=='card'&&o!.kind!=='deck'))
      return 'Only card stacks can be shuffled';
  }
  if(command.type==='REROLL_DIE'){
    if(command.payload.expiresAt!==undefined&&
       (typeof command.payload.expiresAt!=='number'||!Number.isFinite(command.payload.expiresAt)||
         command.payload.expiresAt<=0||command.payload.expiresAt>1e15))
      return 'Invalid die expiration';
    if(!target?.throwDice||target.kind!=='die')return 'Only thrown dice can be rerolled';
    if(target.locked)return 'Die is locked';
    if(target.owner&&target.owner!==command.actor)return 'Die belongs to another player';
    const rolls=command.payload.rolls;
    if(!Array.isArray(rolls)||rolls.length!==(target.throwQuantity??1)||
       rolls.some(n=>!Number.isInteger(n)||n<1||n>(target.sides??6)))
      return 'Reroll must preserve the selected dice quantity and range';
    if(!Number.isFinite(command.payload.x)||!Number.isFinite(command.payload.y)||
       Number(command.payload.x)<0||Number(command.payload.x)>BOARD_W||
       Number(command.payload.y)<0||Number(command.payload.y)>BOARD_H||
       !Number.isFinite(command.payload.rotation))return 'Invalid reroll landing';
    if(command.payload.quaternion!==undefined&&!validThrowQuaternion(command.payload.quaternion))
      return 'Invalid 3D die orientation';
    if(command.payload.altitude!==undefined&&
       (typeof command.payload.altitude!=='number'||!Number.isFinite(command.payload.altitude)||
        Number(command.payload.altitude)<0||Number(command.payload.altitude)>500))
      return 'Invalid die resting height';
  }
  if(command.type==='COIN_MODIFY'){
    if(!target?.tokenCoin)return 'Only physical coins can be modified';
    const delta=command.payload.delta;
    const color=command.payload.color,coinText=command.payload.coinText;
    if(delta===undefined&&color===undefined&&coinText===undefined)return 'No coin adjustment supplied';
    if(coinText!==undefined&&(!validCoinText(coinText)||target.coinText===undefined))
      return 'Only editable coins accept digits, commas, + and -';
    if(delta!==undefined&&![1,10,100,1000,-1,-10,-100,-1000].includes(Number(delta)))
      return 'Invalid coin increment';
    if(color!==undefined&&(typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color)))
      return 'Invalid coin color';
  }
  if(command.type==='THROW_TRAY'){
    if(command.payload.expiresAt!==undefined&&
       (typeof command.payload.expiresAt!=='number'||!Number.isFinite(command.payload.expiresAt)||
         command.payload.expiresAt<=0||command.payload.expiresAt>1e15))
      return 'Invalid throw expiration';
    if(state.kind!=='tcg')return 'Dice tray is available for TCG tables';
    const seat=command.payload.seat;
    if(!Number.isInteger(seat)||Number(seat)<0||Number(seat)>=SEATS)return 'Invalid dice seat';
    if(state.players.length&&state.players.find(player=>player.id===command.actor)?.seat!==seat)
      return 'You can only throw dice from your own tray';
    const throws=command.payload.throws;
    if(!Array.isArray(throws)||throws.length<1||throws.length>20)return 'Select 1–20 physical dice';
    const seen=new Set<number>();
    let totalDice=0;
    for(const entry of throws){
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return 'Invalid dice throw';
      const t=entry as Record<string,unknown>,sides=t.sides;
      if(typeof sides!=='number'||![2,4,6,8,10,12,20,100].includes(sides))
        return 'Invalid die';
      seen.add(sides);
      const rolls=t.rolls;
      if(!Array.isArray(rolls)||rolls.length<1||rolls.length>20||
         rolls.some(v=>!Number.isInteger(v)||Number(v)<1||Number(v)>sides))
        return 'Invalid dice result';
      totalDice+=rolls.length;
      if(typeof t.x!=='number'||typeof t.y!=='number'||
         !Number.isFinite(t.x)||!Number.isFinite(t.y)||
         t.x<0||t.y<0||t.x>BOARD_W||t.y>BOARD_H)
        return 'Invalid dice landing position';
      if(typeof t.rotation!=='number'||!Number.isFinite(t.rotation))return 'Invalid die rotation';
      if(t.quaternion!==undefined&&!validThrowQuaternion(t.quaternion))
        return 'Invalid 3D die orientation';
      if(t.altitude!==undefined&&
         (typeof t.altitude!=='number'||!Number.isFinite(t.altitude)||t.altitude<0||t.altitude>500))
        return 'Invalid die resting height';
    }
    // New throws use one entry per die through 20; historical recordings
    // stored small quantities grouped. Both MUST stay replayable.
    // Repeated denominations are valid only when all those entries
    // represent single physical dice; reject duplicate aggregate entries.
    const byType=new Map<number,number[]>();
    for(const entry of throws){
      const t=entry as {sides:number;rolls:number[]};
      byType.set(t.sides,[...(byType.get(t.sides)??[]),t.rolls.length]);
    }
    if([...byType.values()].some(group=>group.length>1&&group.some(n=>n!==1)))
      return 'Invalid or duplicate die';
    if(totalDice>20&&(throws.length>8||seen.size!==throws.length))
      return 'Large throws must group by die type';
    if(state.objects.length+throws.length>1000)return 'Maximum objects reached';
  }
  if(command.type==='TOKEN_PLACE'||command.type==='TOKEN_ADJUST'){
    if(state.kind!=='tcg')return 'Coins are available on TCG tables';
    const value=Number(command.payload.value);
    if(!Number.isInteger(value)||value<0||value>9999)return 'Coin value must be 0–9999';
    const seat=Number(command.payload.seat);
    if(!Number.isInteger(seat)||seat<0||seat>=SEATS)return 'Invalid token seat';
    if(state.players.length&&state.players.find(player=>player.id===command.actor)?.seat!==seat)
      return 'You can only use coins on your own mat';
    if(command.type==='TOKEN_PLACE'){
      if(command.payload.coinText!==undefined&&!validCoinText(command.payload.coinText))
        return 'Invalid editable coin text';
      if(state.objects.length>=1000)return 'Maximum objects reached';
      const x=Number(command.payload.x),y=Number(command.payload.y);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>BOARD_W||y<0||y>BOARD_H)
        return 'Invalid token placement';
      if(command.payload.sign!==1&&command.payload.sign!==-1)return 'Invalid token side';
      if(command.payload.carrierId!==undefined){
        const card=state.objects.find(o=>o.id===command.payload.carrierId);
        if(!card||!['card','deck'].includes(card.kind)||card.zone!=='TABLE'||card.locked||
           (card.owner&&card.owner!==command.actor)||
           !cardContainsPoint(card,x,y,seat))
          return 'Coin center must be inside an available card';
      }
    }else{
      const ids=command.payload.ids;
      if(!Array.isArray(ids)||!ids.length||ids.length>100||
         ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)
        return 'Select cards before applying coins';
      if(command.payload.sign!==1&&command.payload.sign!==-1)return 'Invalid coin adjustment';
      for(const id of ids){
        const card=state.objects.find(o=>o.id===id);
        if(!card||!['card','deck'].includes(card.kind)||card.locked||
           (card.owner&&card.owner!==command.actor))return 'Selection contains an unavailable card';
      }
      const custom=Number(command.payload.custom);
      if(!Number.isInteger(custom)||custom<1||custom>9999)return 'Invalid custom coin value';
    }
  }
  if(command.type==='ADJUST_COUNTER'){
    if(!Number.isInteger(command.payload.delta)||Math.abs(Number(command.payload.delta))>999)
      return 'Invalid counter adjustment';
  }
  if(command.type==='SET_ZONE'){
    if(state.kind!=='tcg'||!target||!['card','deck'].includes(target.kind))
      return 'Only TCG cards can change piles';
    if(!['HAND','DECK','DISCARD'].includes(String(command.payload.zone)))
      return 'Invalid destination zone';
    const seat=command.payload.matSeat;
    if(!Number.isInteger(seat)||Number(seat)<0||Number(seat)>=SEATS)
      return 'Invalid destination mat';
    if(state.players.length&&state.players.find(p=>p.id===command.actor)?.seat!==seat)
      return 'You can only move cards into your own piles';
  }
  if(command.type==='MOVE_STACK') {
    const stack=cardStackMembers(state,id);
    if(stack.length<2)return 'No stack to move';
    if(stack.some(o=>o.locked))return 'Stack contains a locked card';
    if(state.kind==='tcg'&&stack.some(o=>o.owner && o.owner!==command.actor))
      return 'Stack contains another player\'s card';
  }
  if(command.type==='SET_CENTER_MERGE'){
    const seat=command.payload.seat,boundary=command.payload.boundary;
    if(state.kind!=='tcg')return 'Center merging is only supported on TCG mats';
    if(typeof seat!=='number'||!Number.isInteger(seat)||seat<0||seat>=SEATS||
       typeof boundary!=='number'||!Number.isInteger(boundary)||boundary<0||boundary>=3||
       typeof command.payload.merged!=='boolean')return 'Invalid center mat merge';
    if(state.players.length&&state.players.find(p=>p.id===command.actor)?.seat!==seat)
      return 'You can only merge sections on your own mat';
  }
  if((command.type==='DRAW'||command.type==='SHUFFLE')&&command.payload.matSeat!==undefined){
    const seat=command.payload.matSeat;
    if(state.kind!=='tcg'||typeof seat!=='number'||!Number.isInteger(seat)||seat<0||seat>=SEATS)
      return 'Invalid draw mat';
    if(state.players.length&&state.players.find(p=>p.id===command.actor)?.seat!==seat)
      return 'You can only draw from your own mat';
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
/** Exact, fewest-coin positive change, including the user's Custom denomination.
 * Stable tie-breaking prefers higher denominations. A missing exact solution
 * preserves the signed total using an explicitly valued Custom remainder. */
export function minimalCoinChange(amount:number,custom:number):number[]{
  if(!Number.isInteger(amount)||amount<0||amount>20000)throw new Error('Coin total must be 0–20,000');
  const choices=[...new Set([100,50,30,20,10,custom].filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>b-a);
  if(!amount)return [];
  const count=new Int32Array(amount+1).fill(1000000),last=new Int32Array(amount+1);
  count[0]=0;
  for(let n=1;n<=amount;n++)for(const coin of choices){
    if(coin>n||count[n-coin]>=1000000)continue;
    if(count[n-coin]+1<count[n]){
      count[n]=count[n-coin]+1;last[n]=coin;
    }
  }
  if(count[amount]===1000000)return [amount];
  const result:number[]=[];
  for(let remainder=amount;remainder>0;remainder-=last[remainder])result.push(last[remainder]);
  return result;
}
function prng(seed:number) { let x=seed|0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}; }
export function applyCommand(state: GameState, command: Command): GameState {
  const error=validateCommand(state,command);
  if(error) throw new Error(error);
  const p=command.payload;
  let objects=state.objects.map(o=>({...o}));
  let message=`${command.actor.slice(0,12)} · ${command.type.toLowerCase().replaceAll('_',' ')}`;
  let turnSeat=state.turnSeat,round=state.round,mode=state.mode;
  let centerMerges=state.centerMerges??[];
  const obj=objects.find(o=>o.id===p.id);
  const beforeById=new Map(state.objects.map(o=>[o.id,o]));
  // All physical card drops share the same destination rules, whether
  // one card, one stack or a multi-selection is dragged. Deck order and
  // orientation change atomically in the same replayable command.
  const applyPocketDrop=(cards:TableObject[],x:number,y:number,seat:number)=>{
    let pocket=tcgDropZone(x,y,seat);
    // A merged PLAY/HAND region contains the former inter-row seams.
    // Those seams are fully playable, but the old unmerged pocket test
    // returns null there. Classify by the nearest original row so moving
    // a card out of HAND (or into it) updates face-up/owner/zone correctly.
    if(!pocket&&p.freePlacement===true){
      const local=tcgMatLocal(x,y,seat);
      const region=tcgMatRegions(seat,centerMerges).find(r=>{
        if(r.column!==1||r.lastRow===r.row)return false;
        const center=tcgMatLocal(r.x,r.y,seat);
        return Math.abs(local.x-center.x)<=r.width/2+1e-6&&
          Math.abs(local.y-center.y)<=r.height/2+1e-6;
      });
      if(region){
        const rows=tcgMatCells(seat).filter(cell=>cell.column===1&&
          cell.row>=region.row&&cell.row<=region.lastRow);
        const closest=rows.reduce((best,cell)=>{
          const y0=tcgMatLocal(best.x,best.y,seat).y;
          const y1=tcgMatLocal(cell.x,cell.y,seat).y;
          return Math.abs(local.y-y1)<Math.abs(local.y-y0)?cell:best;
        },rows[0]);
        pocket={zone:closest.row===3?'HAND':'TABLE',faceUp:true,
          deckBottom:false,row:closest.row,column:1};
      }
    }
    if(!pocket){
      for(const card of cards)if(card.zone==='DECK'){
        card.zone='TABLE';card.faceUp=true;
      }
      return;
    }
    if(pocket.zone==='DECK'){
      const ids=new Set(cards.map(card=>card.id));
      const otherDeck=objects.filter(card=>!ids.has(card.id)&&
        card.zone==='DECK'&&card.matSeat===seat);
      const deckFaceUp=otherDeck.length>0?
        otherDeck.every(card=>card.faceUp):
        cards.every(card=>card.zone==='DECK'&&card.faceUp);
      const stack=cards.slice().sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
      let base=0;
      if(pocket.deckBottom)base=1+Math.max(-1,...otherDeck.map(card=>card.order));
      else for(const other of otherDeck)other.order+=stack.length;
      const deckCell=tcgMatCells(seat).find(cell=>cell.row===1&&cell.column===2)!;
      stack.forEach((card,i)=>{
        card.zone='DECK';card.faceUp=deckFaceUp;card.matSeat=seat;
        card.x=deckCell.x;card.y=deckCell.y;card.order=base+i;
      });
      return;
    }
    for(const card of cards){
      card.zone=pocket.zone==='HAND'?'HAND':
        pocket.zone==='DISCARD'?'DISCARD':'TABLE';
      card.faceUp=pocket.faceUp;
      card.matSeat=seat;
      if(pocket.zone==='HAND')card.owner=command.actor;
    }
  };
  switch(command.type) {
    case 'ADD':{
      const added=sanitizeObject(p.object as Record<string,unknown>);
      if(isLooseAccessory(added)&&added.zone==='TABLE'){
        const parent=cardAtPoint(objects,added.x,added.y,added.matSeat??0,added.id);
        if(parent){
          added.carrierId=parent.id;
          if(parent.matSeat!==undefined)added.matSeat=parent.matSeat;
        }else delete added.carrierId;
      }
      objects.push(added);message='New object placed';
    }break;
    case 'MOVE': if(obj){
      const x=clamp(finite(p.x,obj.x),0,BOARD_W);
      const y=clamp(finite(p.y,obj.y),0,BOARD_H);
      // A physical deck box is a freely movable tabletop accessory, not
      // a card: do not snap it into card slots or modify deck contents.
      // Small tabletop accessories have pixel-accurate free placement.
      // Only cards/decks/tiles use the playmat slot-magnet system.
      const snapEligible=state.kind==='tcg'&&
        (obj.kind==='card'||obj.kind==='deck'||obj.kind==='tile');
      const snapped=snapEligible?tcgPlacementPoint(x,y,state.centerMerges,p.snapMerged===true,
        Number.isInteger(p.snapMergedSeat)&&Number(p.snapMergedSeat)>=0&&Number(p.snapMergedSeat)<SEATS
          ?Number(p.snapMergedSeat):undefined,obj.scale??1,p.freePlacement===true,obj.rotation):null;
      obj.x=snapped?snapped.x:x;
      obj.y=snapped?snapped.y:y;
      if(snapped) { obj.matSeat=snapped.seat;
        if(obj.kind==='card'||obj.kind==='deck')
          applyPocketDrop([obj],snapped.freePlacement?snapped.x:x,
            snapped.freePlacement?snapped.y:y,snapped.seat);
        message=`Placed ${obj.name} on seat ${snapped.seat+1}, row ${snapped.row+1}, column ${snapped.column+1}, position ${snapped.slot+1}`;
      } else {
        if(snapEligible)delete obj.matSeat;
        message=`Moved ${obj.name}`;
      }
      // A normal short drag lifts only this card from a deck stack.
      if(obj.kind==='card'&&obj.zone==='DECK'&&!snapped)obj.zone='TABLE';
    }break;
    case 'MOVE_STACK': if(obj){
      // One atomic command moves the entire source stack, preserving each
      // card's ordering, face state, ownership, zone and small offsets.
      // Every peer derives identical membership from the pre-move state.
      const cards=cardStackMembers(state,obj.id);
      const requestedX=clamp(finite(p.x,obj.x),0,BOARD_W);
      const requestedY=clamp(finite(p.y,obj.y),0,BOARD_H);
      const snapped=state.kind==='tcg'?tcgPlacementPoint(requestedX,requestedY,state.centerMerges,p.snapMerged===true,
        Number.isInteger(p.snapMergedSeat)&&Number(p.snapMergedSeat)>=0&&Number(p.snapMergedSeat)<SEATS
          ?Number(p.snapMergedSeat):undefined,obj.scale??1,p.freePlacement===true,obj.rotation):null;
      const dx=(snapped?.x??requestedX)-obj.x;
      const dy=(snapped?.y??requestedY)-obj.y;
      const ids=new Set(cards.map(o=>o.id));
      for(const card of objects){
        if(!ids.has(card.id))continue;
        card.x=clamp(card.x+dx,0,BOARD_W);
        card.y=clamp(card.y+dy,0,BOARD_H);
        if(state.kind==='tcg'){
          if(snapped)card.matSeat=snapped.seat;
          else delete card.matSeat;
        }
      }
      if(snapped){
        const placed=objects.filter(card=>ids.has(card.id));
        if(placed.length&&placed.every(card=>card.kind==='card'||card.kind==='deck'))
          applyPocketDrop(placed,snapped.freePlacement?snapped.x:requestedX,
            snapped.freePlacement?snapped.y:requestedY,snapped.seat);
      }
      message=`Moved stack of ${cards.length} cards`;
    }break;
    case 'BATCH_CARD_ACTION':{
      const ids=p.ids as string[],action=String(p.action);
      const idSet=new Set(ids);
      const picked=objects.filter(card=>idSet.has(card.id));
      if(action==='move'){
        // Resolve snap from ONE pressed anchor and translate every selected
        // piece by the same delta; never independently snap cards or let
        // a group drift apart. Atomic event = one undo/replay step.
        const anchor=picked.find(card=>card.id===p.anchorId)!;
        const tx=clamp(Number(p.x),0,BOARD_W),ty=clamp(Number(p.y),0,BOARD_H);
        const snapped=(anchor.kind==='card'||anchor.kind==='deck'||anchor.kind==='tile')
          ?tcgPlacementPoint(tx,ty,state.centerMerges,p.snapMerged===true,
          Number.isInteger(p.snapMergedSeat)&&Number(p.snapMergedSeat)>=0&&Number(p.snapMergedSeat)<SEATS
            ?Number(p.snapMergedSeat):undefined,anchor.scale??1,p.freePlacement===true,anchor.rotation):null;
        // Clamp the shared translation against the whole selection's
        // bounding box, not each card individually. Otherwise a card
        // hitting a table edge could pull the group out of formation.
        const minX=Math.min(...picked.map(card=>card.x));
        const maxX=Math.max(...picked.map(card=>card.x));
        const minY=Math.min(...picked.map(card=>card.y));
        const maxY=Math.max(...picked.map(card=>card.y));
        const dx=clamp((snapped?.x??tx)-anchor.x,-minX,BOARD_W-maxX);
        const dy=clamp((snapped?.y??ty)-anchor.y,-minY,BOARD_H-maxY);
        for(const card of picked){
          card.x=card.x+dx;
          card.y=card.y+dy;
          if(snapped)card.matSeat=snapped.seat;
          else delete card.matSeat;
          if(card.zone==='DECK'&&snapped)card.zone='TABLE';
        }
        if(snapped&&picked.every(card=>card.kind==='card'||card.kind==='deck'))
          applyPocketDrop(picked,snapped.freePlacement?snapped.x:tx,
            snapped.freePlacement?snapped.y:ty,snapped.seat);
      }
      if(action==='flip')for(const card of picked)card.faceUp=!card.faceUp;
      if(action==='reveal')for(const card of picked)card.faceUp=true;
      if(action==='tap-toggle')for(const card of picked){
        const current=((card.rotation%360)+360)%360;
        card.rotation=current===0?90:0;
      }
      if(action==='rotate-cw'||action==='rotate-ccw'){
        const step=action==='rotate-cw'?45:-45;
        for(const card of picked)card.rotation=((card.rotation+step)%360+360)%360;
      }
      if(action==='scale-original')for(const card of picked)card.scale=1;
      if(action==='scale-smaller')for(const card of picked)
        card.scale=clamp(Math.round((card.scale??1)*2)/2-0.5,0.5,7);
      if(action==='scale-bigger')for(const card of picked)
        card.scale=clamp(Math.round((card.scale??1)*2)/2+0.5,0.5,7);
      if(action==='lock'){
        const lock=picked.some(card=>!card.locked);
        for(const card of picked)card.locked=lock;
      }
      if(action==='shuffle'){
        // Reassign the chosen cards' deck order as one atomic,
        // seeded Fisher–Yates permutation. Outside cards stay put.
        const ordered=[...picked].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
        const shuffled=[...ordered];
        const random=prng(finite(p.seed,1));
        for(let i=shuffled.length-1;i>0;i--){
          const j=Math.floor(random()*(i+1));
          [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
        }
        // Capture existing ranks BEFORE mutating any card. A shuffled
        // element can be the original first card; reading ordered[0].order
        // inside forEach would otherwise make the base rank drift.
        const ranks=ordered.map(card=>card.order);
        const distinct=new Set(ranks).size===ranks.length;
        shuffled.forEach((card,index)=>{
          card.order=distinct?ranks[index]:ranks[0]+index;
        });
      }
      if(action==='send-to'){
        const destination=String(p.destination),seat=Number(p.matSeat);
        const isDeck=destination==='DECK_TOP'||destination==='DECK_BOTTOM';
        const zone:Zone=isDeck?'DECK':destination as Zone;
        const rowCol=zone==='HAND'?[3,1]:zone==='DECK'?[1,2]:
          zone==='DISCARD'?[1,0]:[2,1];
        const cell=tcgMatCells(seat).find(c=>c.row===rowCol[0]&&c.column===rowCol[1])!;
        const others=objects.filter(o=>!idSet.has(o.id)&&o.matSeat===seat&&o.zone==='DECK');
        const base=destination==='DECK_BOTTOM'?
          1+Math.max(-1,...others.map(o=>o.order)):0;
        if(destination==='DECK_TOP')
          for(const other of others)other.order+=picked.length;
        for(let i=0;i<picked.length;i++){
          const card=picked[i];card.zone=zone;card.matSeat=seat;
          card.owner=command.actor;
          card.faceUp=zone!=='DECK';
          card.x=cell.x;card.y=cell.y;
          if(zone==='DECK')card.order=base+i;
          else if(zone==='HAND'){
            const local=tcgMatLocal(cell.x,cell.y,seat);
            const point=tcgMatWorld(local.x+((i%7)-3)*(TCG_MAT.cardWidth+2),local.y,seat);
            card.x=point.x;card.y=point.y;
          }else if(zone==='TABLE'){
            const local=tcgMatLocal(cell.x,cell.y,seat);
            const point=tcgMatWorld(local.x+((i%7)-3)*(TCG_MAT.cardWidth+2),local.y,seat);
            card.x=point.x;card.y=point.y;
          }
        }
      }
      message=picked.length+' selected cards · '+action.replaceAll('-', ' ');
    }break;
    case 'THROW_TRAY':{
      const thrown=p.throws as Array<{sides:number;rolls:number[];x:number;y:number;rotation:number;quaternion?:[number,number,number,number];altitude?:number}>;
      const summaries:string[]=[];
      for(let i=0;i<thrown.length;i++){
        const toss=thrown[i],isCoin=toss.sides===2;
        const heads=toss.rolls.filter(n=>n===1).length;
        const sum=toss.rolls.reduce((acc,n)=>acc+n,0);
        const total=isCoin?heads:sum;
        const label=isCoin?'Flip Coin':'D'+String(toss.sides).padStart(2,'0');
        const face=isCoin?
          toss.rolls.length===1?(heads?'HEADS':'TAILS'):
            heads+'H / '+(toss.rolls.length-heads)+'T':String(total);
        const carrier=cardAtPoint(objects,toss.x,toss.y,Number(p.seat));
        objects.push(sanitizeObject({
          id:command.id+'-throw-'+i,kind:'die',throwDice:true,
          throwRolls:toss.rolls,throwQuantity:toss.rolls.length,throwTotal:total,
          ...(typeof p.expiresAt==='number'?{throwExpiresAt:p.expiresAt}:{}),
          sides:toss.sides,value:isCoin?(heads?1:2):Math.min(100,total),
          ...(toss.quaternion?{throwQuaternion:toss.quaternion}:{}),
          ...(toss.altitude!==undefined?{throwAltitude:toss.altitude}:{}),
          name:label,x:toss.x,y:toss.y,rotation:toss.rotation,
          zone:'TABLE',order:objects.length+100,faceUp:true,
          color:isCoin?'#d5b87f':'#b9c6b9',matSeat:carrier?.matSeat??Number(p.seat),
          ...(carrier?{carrierId:carrier.id}:{}),
          description:label+' × '+toss.rolls.length+': '+toss.rolls.join(', ')+' → '+face
        }));
        summaries.push(label+' ×'+toss.rolls.length+' = '+face);
      }
      message='Dice throw · '+summaries.join(' · ');
    }break;
    case 'REROLL_DIE':if(obj){
      const rolls=(p.rolls as number[]).slice();
      const heads=rolls.filter(v=>v===1).length;
      const total=obj.sides===2?heads:rolls.reduce((a,b)=>a+b,0);
      obj.throwRolls=rolls;obj.throwQuantity=rolls.length;obj.throwTotal=total;
      if(typeof p.expiresAt==='number')obj.throwExpiresAt=p.expiresAt;
      obj.value=obj.sides===2?(heads?1:2):Math.min(100,total);
      obj.x=Number(p.x);obj.y=Number(p.y);
      obj.rotation=((Number(p.rotation)%360)+360)%360;
      if(validThrowQuaternion(p.quaternion))obj.throwQuaternion=p.quaternion;
      if(typeof p.altitude==='number'&&Number.isFinite(p.altitude))
        obj.throwAltitude=clamp(p.altitude,0,500);
      const face=obj.sides===2?(rolls.length===1?(heads?'HEADS':'TAILS'):
        heads+'H / '+(rolls.length-heads)+'T'):String(total);
      obj.description=obj.name+' × '+rolls.length+': '+rolls.join(', ')+' → '+face;
      const carrier=cardAtPoint(objects,obj.x,obj.y,obj.matSeat??0,obj.id);
      if(carrier){obj.carrierId=carrier.id;obj.matSeat=carrier.matSeat??obj.matSeat;}
      else delete obj.carrierId;
      message='Rerolled '+obj.name+' ×'+rolls.length+' = '+face;
    }break;
    case 'COIN_MODIFY':if(obj){
      if(p.delta!==undefined)obj.value=clamp((obj.value??0)+Number(p.delta),0,9999);
      if(typeof p.color==='string')obj.color=p.color;
      if(validCoinText(p.coinText)&&obj.coinText!==undefined){
        obj.coinText=p.coinText;
        const numeric=coinNumericValue(p.coinText);
        obj.value=numeric.value;obj.tokenSign=numeric.sign;
      }
      obj.name=obj.coinText??String(obj.value);
      message='Coin '+obj.id+' · '+obj.value+(p.color?' · color updated':'');
    }break;
    case 'TOKEN_PLACE':{
      const x=Number(p.x),y=Number(p.y),value=Number(p.value),sign=p.sign as 1|-1;
      // Trust the physical coin center, never a nearby slot or a requested
      // carrier ID on its own. Keep the exact drop coordinates.
      const carrier=cardAtPoint(objects,x,y,Number(p.seat),undefined,
        typeof p.carrierId==='string'?p.carrierId:undefined);
      objects.push(sanitizeObject({
        id:command.id+'-coin',kind:'token',tokenCoin:true,
        tokenSign:validCoinText(p.coinText)?coinNumericValue(p.coinText).sign:sign,value,
        ...(validCoinText(p.coinText)?{coinText:p.coinText}:{}),
        name:validCoinText(p.coinText)?p.coinText:String(value),x,y,rotation:0,zone:'TABLE',order:objects.length,
        color:typeof p.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(p.color)?p.color:'#d8b979',...(carrier?{carrierId:carrier.id,matSeat:carrier.matSeat??Number(p.seat)}:{matSeat:Number(p.seat)})
      }));
      message=(sign===1?'+':'−')+value+' coin placed'+(carrier?' on '+carrier.name:'');
    }break;
    case 'TOKEN_ADJUST':{
      const ids=p.ids as string[],value=Number(p.value),sign=p.sign as 1|-1,custom=Number(p.custom);
      for(const id of ids){
        const card=objects.find(o=>o.id===id)!;
        const attached=objects.filter(o=>o.tokenCoin&&o.carrierId===id);
        const existing=attached.reduce((sum,o)=>sum+(o.tokenSign??1)*(o.value??0),0);
        const newTotal=existing+sign*value;
        if(Math.abs(newTotal)>20000)throw new Error('Coin total exceeds 20,000');
        const change=minimalCoinChange(Math.abs(newTotal),custom);
        // Check capacity before committing any replacement; one command
        // produces one deterministic replayable state for all selected cards.
        if(objects.length-attached.length+change.length>1000)
          throw new Error('Maximum objects reached');
        const removed=new Set(attached.map(o=>o.id));
        objects=objects.filter(o=>!removed.has(o.id));
        change.forEach((denomination,index)=>{
          // Automatically issued change is deliberately placed *on* the
          // card in its own rotated frame, rather than snap-pulled to the
          // middle of a playmat slot. Manual placements are never changed.
          const col=index%3,row=Math.floor(index/3)%4;
          const layer=Math.floor(index/12)%3;
          const lx=(-19+col*19+layer*2)*(card.scale??1);
          const ly=(-23+row*15+layer*2)*(card.scale??1);
          const angle=playerSeatRotation(card.matSeat??Number(p.seat))+
            card.rotation*Math.PI/180;
          const x=card.x+lx*Math.cos(angle)-ly*Math.sin(angle);
          const y=card.y+lx*Math.sin(angle)+ly*Math.cos(angle);
          objects.push(sanitizeObject({
            id:command.id+'-'+id+'-'+index,kind:'token',tokenCoin:true,
            tokenSign:newTotal<0?-1:1,value:denomination,name:String(denomination),
            x:clamp(x,0,BOARD_W),y:clamp(y,0,BOARD_H),
            rotation:card.rotation,zone:'TABLE',order:objects.length,
            matSeat:card.matSeat??Number(p.seat),carrierId:id,color:attached[0]?.color??'#d8b979'
          }));
        });
      }
      message=ids.length+' card(s) · '+(sign===1?'+':'−')+value+' in minimal coins';
    }break;
    case 'ADJUST_COUNTER':if(obj){
      obj.counters=clamp((obj.counters??0)+Number(p.delta),0,999);
      message=obj.name+' · '+obj.counters+' counters';
    }break;
    case 'SET_ZONE':if(obj){
      const zone=p.zone as 'HAND'|'DECK'|'DISCARD',seat=Number(p.matSeat);
      const position=zone==='DECK'?[1,2]:zone==='DISCARD'?[1,0]:[3,1];
      const cell=tcgMatCells(seat).find(c=>c.row===position[0]&&c.column===position[1])!;
      obj.x=cell.x;obj.y=cell.y;obj.zone=zone;obj.matSeat=seat;
      obj.faceUp=zone!=='DECK';obj.owner=command.actor;
      if(zone==='DECK'){
        const others=objects.filter(other=>other.id!==obj.id&&other.zone==='DECK'&&other.matSeat===seat);
        if(p.bottom===true){
          obj.order=1+Math.max(-1,...others.map(other=>other.order));
        }else{
          for(const other of others)other.order++;
          obj.order=0;
        }
      }
      if(zone==='HAND'){
        const existing=objects.filter(other=>other.id!==obj.id&&other.zone==='HAND'&&other.matSeat===seat);
        const local=tcgMatLocal(cell.x,cell.y,seat);
        const point=tcgMatWorld(local.x+((existing.length)%7-3)*(TCG_MAT.cardWidth+2),local.y,seat);
        obj.x=point.x;obj.y=point.y;
      }
      message=obj.name+' → '+(zone==='DISCARD'?'discard':zone==='DECK'?'deck':'hand');
    }break;
    case 'ROTATE': if(obj){obj.rotation=((obj.rotation+finite(p.degrees,30))%360+360)%360;message=`Rotated ${obj.name}`;}break;
    case 'FLIP':if(obj){obj.faceUp=!obj.faceUp;message=`Flipped ${obj.name}`;}break;
    case 'DELETE':objects=objects.filter(o=>o.id!==p.id);message='Object removed';break;
    case 'CLONE':if(obj){
      const clone={...obj,id:textValue(p.newId||createId(),80),
        x:clamp(obj.x+45,0,BOARD_W),y:clamp(obj.y+40,0,BOARD_H)};
      if(isLooseAccessory(clone)){
        const carrier=cardAtPoint(objects,clone.x,clone.y,clone.matSeat??0,clone.id);
        if(carrier){
          clone.carrierId=carrier.id;
          if(carrier.matSeat!==undefined)clone.matSeat=carrier.matSeat;
        }else delete clone.carrierId;
      }
      objects.push(clone);message=`Duplicated ${obj.name}`;
    }break;
    case 'ROLL':if(obj){const n=obj.sides||6;const rng=prng(finite(p.seed,1));obj.value=1+Math.floor(rng()*n);message=`Rolled ${obj.name}: ${obj.value}`;}break;
    case 'DRAW':{
      const available=objects.filter(o=>o.zone==='DECK' && (!p.prefix||o.id.startsWith(String(p.prefix))) &&
        (p.matSeat===undefined||(o.matSeat===p.matSeat&&(!o.owner||o.owner===command.actor)))).sort((a,b)=>a.order-b.order);
      const card=available[0];if(!card) throw new Error('No cards in that deck');
      card.zone='HAND';card.owner=command.actor;card.faceUp=true;
      const handCount=objects.filter(o=>o.zone==='HAND'&&o.owner===command.actor&&(p.matSeat===undefined||o.matSeat===p.matSeat)).length;
      const seat=typeof p.matSeat==='number'?p.matSeat:state.players.find(player=>player.id===command.actor)?.seat??0;
      const handPosition=p.matSeat===undefined
        ?tcgMatWorld(((handCount-1)%7-3)*69,TCG_MAT_HEIGHT/2+100,seat)
        :(()=>{const hand=tcgMatCells(seat).find(c=>c.row===3&&c.column===1)!;
          const local=tcgMatLocal(hand.x,hand.y,seat);
          return tcgMatWorld(local.x+((handCount-1)%7-3)*(TCG_MAT.cardWidth+2),local.y,seat);})();
      card.x=handPosition.x;card.y=handPosition.y;
      if(p.matSeat===undefined)delete card.matSeat;else card.matSeat=seat;
      message=`${command.actor.slice(0,8)} drew a card`;break;
    }
    case 'SHUFFLE':{
      const list=objects.filter(o=>o.zone==='DECK' &&
        (p.matSeat===undefined||o.matSeat===p.matSeat) &&
        (!p.prefix || o.id.startsWith(String(p.prefix))));const rand=prng(finite(p.seed,1));
      for(let i=list.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
      list.forEach((o,i)=>o.order=i);message=`Shuffled ${list.length} cards`;break;
    }
    case 'NEXT_TURN':{
      const seats=state.players.map(p=>p.seat).sort((a,b)=>a-b);
      const next=seats.find(s=>s>state.turnSeat)??seats[0]??((state.turnSeat+1)%SEATS);
      if(next<=state.turnSeat)round++;turnSeat=next;message=`Seat ${next+1}'s turn`;break;
    }
    case 'SET_CENTER_MERGE':{
      const key=centerMergeKey(Number(p.seat),Number(p.boundary));
      centerMerges=(p.merged?[...centerMerges.filter(v=>v!==key),key]:
        centerMerges.filter(v=>v!==key)).sort((a,b)=>a-b);
      message=(p.merged?'Merged':'Separated')+` seat ${Number(p.seat)+1} center rows ${Number(p.boundary)+1} and ${Number(p.boundary)+2}`;
      break;
    }
    case 'SET_MODE': mode=p.mode as PlayMode;message=`Mode: ${mode}`;break;
  }
  // Carry smaller pieces as children of a larger card. Only a deliberate
  // physical drop creates/replaces a carrier; rotating or moving a carrier
  // transforms its descendants about the original carrier center.
  const movingIds=new Set<string>();
  if(command.type==='MOVE'||command.type==='MOVE_STACK'){
    if(typeof p.id==='string')movingIds.add(p.id);
    if(command.type==='MOVE_STACK'&&typeof p.id==='string')
      for(const member of cardStackMembers(state,p.id))movingIds.add(member.id);
  }
  if(command.type==='BATCH_CARD_ACTION'&&p.action==='move'&&Array.isArray(p.ids))
    for(const id of p.ids)if(typeof id==='string')movingIds.add(id);
  const positionChanged=(a:TableObject,b:TableObject)=>
    Math.hypot(a.x-b.x,a.y-b.y)>0.00001;
  const carrying=objects.filter(o=>o.kind==='card'||o.kind==='deck');
  const sizeOf=(o:TableObject)=>({
    w:(o.kind==='card'||o.kind==='deck'?62:o.kind==='board'?310:o.tokenCoin?26:52)*(o.scale??1),
    h:(o.kind==='card'||o.kind==='deck'?88:o.kind==='board'?206:o.tokenCoin?26:52)*(o.scale??1)
  });
  if(movingIds.size){
    for(const child of objects){
      if(!movingIds.has(child.id))continue;
      const old=beforeById.get(child.id);
      if(!old||!positionChanged(old,child))continue;
      // Carry relationships start/end at the precise DROP CENTER, never at
      // a magnetic card slot or when only the object's edges overlap a card.
      if(child.zone!=='TABLE'){delete child.carrierId;continue;}
      let parent:TableObject|undefined;
      if(isLooseAccessory(child)){
        parent=cardAtPoint(carrying,child.x,child.y,
          child.matSeat??Number(p.snapMergedSeat??p.seat??0),child.id);
      }else{
        const size=sizeOf(child);
        const candidates=carrying.filter(card=>{
          if(card.id===child.id||card.zone!=='TABLE'||movingIds.has(card.id))return false;
          const larger=sizeOf(card);
          if(larger.w<=size.w+1||larger.h<=size.h+1)return false;
          const angle=playerSeatRotation(card.matSeat??0)+card.rotation*Math.PI/180;
          const dx=child.x-card.x,dy=child.y-card.y;
          const lx=dx*Math.cos(angle)+dy*Math.sin(angle);
          const ly=-dx*Math.sin(angle)+dy*Math.cos(angle);
          return Math.abs(lx)<=larger.w/2-size.w/4 &&
            Math.abs(ly)<=larger.h/2-size.h/4;
        }).sort((a,b)=>sizeOf(a).w*sizeOf(a).h-sizeOf(b).w*sizeOf(b).h);
        parent=candidates[0];
      }
      // An object can never attach to its own descendant.
      let ancestor=parent,cyclic=false;
      while(ancestor){
        if(ancestor.id===child.id){cyclic=true;break;}
        ancestor=objects.find(o=>o.id===ancestor!.carrierId);
      }
      if(parent&&!cyclic){
        child.carrierId=parent.id;
        // Child and carrier must share the same physical seat for rendering,
        // even when an accessory is dragged from one seat onto another.
        if(parent.matSeat!==undefined)child.matSeat=parent.matSeat;
      }else delete child.carrierId;
    }
  }
  // Compose transforms in topological order to support nested carriers.
  const visited=new Set<string>();
  const updating=new Set<string>();
  const propagate=(child:TableObject)=>{
    if(visited.has(child.id)||updating.has(child.id))return;
    updating.add(child.id);
    const parent=objects.find(o=>o.id===child.carrierId);
    if(parent){
      propagate(parent);
      const oldParent=beforeById.get(parent.id);
      const oldChild=beforeById.get(child.id);
      if(oldParent&&oldChild&&!movingIds.has(child.id)&&
         (positionChanged(parent,oldParent)||
          parent.rotation!==oldParent.rotation||
          (parent.scale??1)!==(oldParent.scale??1))){
        // The point on the card scales and rotates about the carrier center,
        // while the accessory retains its own un-snapped local position.
        const delta=(parent.rotation-oldParent.rotation)*Math.PI/180;
        const ratio=(parent.scale??1)/(oldParent.scale??1);
        const dx=(oldChild.x-oldParent.x)*ratio,dy=(oldChild.y-oldParent.y)*ratio;
        child.x=clamp(parent.x+dx*Math.cos(delta)-dy*Math.sin(delta),0,BOARD_W);
        child.y=clamp(parent.y+dx*Math.sin(delta)+dy*Math.cos(delta),0,BOARD_H);
        // If the user explicitly rotated BOTH the carrier and its coin
        // in one selection, the coin has already received that angle.
        // Propagate the carrier's movement without double-rotating it.
        if(child.rotation===oldChild.rotation)
          child.rotation=((oldChild.rotation+parent.rotation-oldParent.rotation)%360+360)%360;
        if(parent.matSeat!==undefined)child.matSeat=parent.matSeat;
      }
    }
    updating.delete(child.id);visited.add(child.id);
  };
  for(const piece of objects)propagate(piece);
  // Attachments survive card movements and zone changes until explicitly
  // removed, or the carrier is deleted. Never silently discard their link.
  for(const piece of objects)
    if(piece.carrierId&&!objects.some(parent=>parent.id===piece.carrierId))
      delete piece.carrierId;
  return {...state,objects,turnSeat,round,mode,centerMerges,seq:state.seq+1,message};
}
/** Legacy saves did not timestamp thrown dice: recover their creation
 * and most recent reroll from the persisted action log if available.
 * An undatable legacy loose die is already expired: never resurrect it. */
export function thrownDieDeadlines(state:GameState,events:readonly EventRecord[]=[]):Map<string,number>{
  const legacy=new Map<string,number>();
  for(const event of events){
    const expires=typeof event.payload.expiresAt==='number'&&Number.isFinite(event.payload.expiresAt)
      ?event.payload.expiresAt
      :Number.isFinite(event.at)?event.at+THROWN_DIE_LIFETIME_MS:0;
    if(event.type==='THROW_TRAY'){
      const throws=event.payload.throws;
      if(Array.isArray(throws))for(let i=0;i<throws.length;i++)
        legacy.set(event.id+'-throw-'+i,expires);
    }else if(event.type==='REROLL_DIE'&&typeof event.payload.id==='string')
      legacy.set(event.payload.id,expires);
  }
  const deadlines=new Map<string,number>();
  for(const obj of state.objects)if(obj.throwDice){
    const deadline=Number.isFinite(obj.throwExpiresAt)?
      obj.throwExpiresAt!:legacy.get(obj.id)??0;
    deadlines.set(obj.id,deadline);
  }
  return deadlines;
}
/** No ephemeral view-only fade: removes expired dice/flipcoins from the
 * authoritative objects array. Pure, so it also guards replay and loads. */
export function expireThrownDice(
  state:GameState,now:number,events:readonly EventRecord[]=[]
):GameState{
  const deadlines=thrownDieDeadlines(state,events);
  if(![...deadlines.values()].some(deadline=>deadline<=now))return state;
  return {...state,objects:state.objects.filter(o=>!o.throwDice||
    (deadlines.get(o.id)??0)>now)};
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
    if(o.zone==='DECK'&&!o.faceUp)return {...o,name:'Face-down card',description:undefined,faceUrl:undefined,frameUrls:undefined,faceUp:false,color:'#253c43',value:undefined,order:0};
    return o;
  })};
}
export function parseGamePack(value:unknown):GamePack {
  if(!value||typeof value!=='object')throw new Error('Pack must be a JSON object');
  const pack=value as Record<string,unknown>;
  if(pack.schema!=='sennet.pack/1'||typeof pack.id!=='string'||typeof pack.name!=='string'||!Array.isArray(pack.objects)||pack.objects.length>1000)throw new Error('Invalid Sennet pack schema');
  const validKinds:GameKind[]=['sandbox','boardgame','tcg','rpg','wargame','dice','party','custom'];
  const kind=validKinds.includes(pack.kind as GameKind)?pack.kind as GameKind:'custom';
  return {schema:'sennet.pack/1',id:textValue(pack.id),name:textValue(pack.name),author:textValue(pack.author||'Community'),kind,description:textValue(pack.description,250),license:textValue(pack.license,80),objects:pack.objects.map((o:unknown)=>sanitizeObject(o as Record<string,unknown>)),
    ...(kind==='tcg'&&Array.isArray(pack.centerMerges)?{
      centerMerges:[...new Set(pack.centerMerges.filter((n:unknown):n is number=>
        typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<SEATS*3))].sort((a,b)=>a-b)
    }:{}) ,
    ...(typeof pack.lua==='string'&&pack.lua.length<=30000?{lua:pack.lua}:{})};
}
export function gameFromPack(pack:GamePack):GameState{return {...createGame(pack.kind),objects:pack.objects,centerMerges:pack.centerMerges??[],message:`Loaded ${pack.name} by ${pack.author}`};}
