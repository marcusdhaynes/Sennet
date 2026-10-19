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
  locked?: boolean; height?: number; description?: string; matSeat?: number;
}
export interface Player { id: string; seat: number; name: string; online: boolean; bot?: boolean }
export interface GameState {
  version: 1; roomId: string; kind: GameKind; mode: PlayMode;
  seq: number; turnSeat: number; round: number; objects: TableObject[];
  players: Player[]; message: string; centerMerges?: number[];
}
export type CommandType = 'ADD' | 'MOVE' | 'MOVE_STACK' | 'SET_CENTER_MERGE' | 'ROTATE' | 'FLIP' | 'DELETE' | 'CLONE' | 'ROLL' | 'DRAW' | 'SHUFFLE' | 'NEXT_TURN' | 'SET_MODE';
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
    snapMerged:false
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
  return {sections,images,imageMode,spanningImageId,selectedSections,snapMerged:input.snapMerged===true};
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
export function battlefieldFitBounds(columns:number,padding=BATTLEFIELD_PLAYMAT_PADDING){
  const pad=Math.max(0,padding);
  const count=Math.max(1,Math.trunc(columns));
  const step=TCG_MAT_WIDTH+Math.max(ALLY_MAT_GAP,2*pad);
  return {
    width:TCG_MAT_WIDTH+(count-1)*step+2*pad,
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
/** Gear belongs to the viewing player's OWN mat, not the screen edge.
 * Like Eye/Castle, its center straddles the physical mat border.
 * The shared bottom-edge padding accommodates the full hit circle in
 * Castle and Eye views, while the right inset keeps it in the mat.
 */
export function tcgSettingsButtonPosition():{x:number;y:number}{
  return {
    x:TCG_MAT_WIDTH/2-PLAYMAT_BOTTOM_BUTTON_OFFSET,
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
    width/(2*TCG_MAT_WIDTH+6*pad)
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
  const viewerLeft=-visibleW/2+pad;
  const viewerCenter=world(viewerLeft+TCG_MAT_WIDTH/2,visibleH/4);
  mats.set(viewerSeat,{...viewerCenter,rotation:0,scale:1});
  // Preserve the generous viewer-to-ally clearance, independently of
  // the very tight spacing WITHIN each automatically optimized grid.
  const playerGap=2*pad;
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
  grid(drawnAllies,{
    left:viewerLeft+TCG_MAT_WIDTH+playerGap,
    right:visibleW/2-pad,
    top:pad,bottom:visibleH/2-pad
  },false);
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
  return castleGridLayout(viewerSeat,displayed,'all',
    allyFocus??activeAlly,viewport,padding);
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
export function tcgSnapPoint(x:number,y:number,merged:readonly number[]=[],snapMerged=false,snapMergedSeat?:number):TcgSnapLocation|null {
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
      const spotDistance=Math.hypot(slotDistance,local.y-anchor.y);
      if(best&&Math.abs(zoneDistance-bestZoneDistance)<=eps&&
         spotDistance>=bestSpotDistance-eps)continue;
      const snapped=tcgMatWorld(nearestX,anchor.y,seat);
      best={...cell,...snapped,slot};
      bestZoneDistance=zoneDistance;
      bestSpotDistance=spotDistance;
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
    ...(typeof input.owner === 'string' ? {owner:textValue(input.owner,80)} : {}),
    ...(Number.isInteger(input.matSeat)&&Number(input.matSeat)>=0&&Number(input.matSeat)<SEATS ? {matSeat:Number(input.matSeat)} : {}),
    ...(kind==='die'?{sides:clamp(Math.floor(finite(input.sides,6)),2,100),value:clamp(Math.floor(finite(input.value,1)),1,100)}:{}),
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

export function validateCommand(state: GameState, command: Command): string | null {
  if (!command || typeof command !== 'object' || !command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) return 'Invalid command';
  if (!command.actor || !command.id || command.id.length > 120 || command.actor.length > 120) return 'Invalid actor or command ID';
  const types: CommandType[]=['ADD','MOVE','MOVE_STACK','SET_CENTER_MERGE','ROTATE','FLIP','DELETE','CLONE','ROLL','DRAW','SHUFFLE','NEXT_TURN','SET_MODE'];
  if (!types.includes(command.type)) return 'Unsupported action';
  if (state.mode !== 'sandbox' && command.type !== 'SET_MODE' && command.type !== 'SET_CENTER_MERGE') {
    const current = state.players.find(p=>p.seat===state.turnSeat);
    if (state.players.length && current?.id!==command.actor) return `Waiting for seat ${state.turnSeat+1}`;
  }
  const id=String(command.payload.id ?? '');
  const target=state.objects.find(o=>o.id===id);
  if (['MOVE','MOVE_STACK','ROTATE','FLIP','DELETE','CLONE','ROLL'].includes(command.type)) {
    if(!target) return 'Object does not exist';
    if(target.locked) return 'Object is locked';
    if (target.owner && target.owner!==command.actor && state.kind==='tcg') return 'This card belongs to another player';
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
  if(command.type==='DRAW'&&command.payload.matSeat!==undefined){
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
  switch(command.type) {
    case 'ADD':objects.push(sanitizeObject(p.object as Record<string,unknown>)); message='New object placed';break;
    case 'MOVE': if(obj){
      const x=clamp(finite(p.x,obj.x),0,BOARD_W);
      const y=clamp(finite(p.y,obj.y),0,BOARD_H);
      // A physical deck box is a freely movable tabletop accessory, not
      // a card: do not snap it into card slots or modify deck contents.
      const snapEligible=state.kind==='tcg'&&obj.kind!=='board'&&obj.kind!=='deck-box';
      const snapped=snapEligible?tcgSnapPoint(x,y,state.centerMerges,p.snapMerged===true,
        Number.isInteger(p.snapMergedSeat)&&Number(p.snapMergedSeat)>=0&&Number(p.snapMergedSeat)<SEATS
          ?Number(p.snapMergedSeat):undefined):null;
      obj.x=snapped?snapped.x:x;
      obj.y=snapped?snapped.y:y;
      if(snapped) { obj.matSeat=snapped.seat;
        // Playing a card from a deck or hand makes it a public table card.
        if(obj.kind==='card' || obj.kind==='deck')obj.zone='TABLE';
        message=`Placed ${obj.name} on seat ${snapped.seat+1}, row ${snapped.row+1}, column ${snapped.column+1}, position ${snapped.slot+1}`;
      } else {
        if(snapEligible)delete obj.matSeat;
        message=`Moved ${obj.name}`;
      }
      // A normal short drag lifts only this card from a deck stack.
      if(obj.kind==='card' && obj.zone==='DECK')obj.zone='TABLE';
    }break;
    case 'MOVE_STACK': if(obj){
      // One atomic command moves the entire source stack, preserving each
      // card's ordering, face state, ownership, zone and small offsets.
      // Every peer derives identical membership from the pre-move state.
      const cards=cardStackMembers(state,obj.id);
      const requestedX=clamp(finite(p.x,obj.x),0,BOARD_W);
      const requestedY=clamp(finite(p.y,obj.y),0,BOARD_H);
      const snapped=state.kind==='tcg'?tcgSnapPoint(requestedX,requestedY,state.centerMerges,p.snapMerged===true,
        Number.isInteger(p.snapMergedSeat)&&Number(p.snapMergedSeat)>=0&&Number(p.snapMergedSeat)<SEATS
          ?Number(p.snapMergedSeat):undefined):null;
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
      message=`Moved stack of ${cards.length} cards`;
    }break;
    case 'ROTATE': if(obj){obj.rotation=((obj.rotation+finite(p.degrees,30))%360+360)%360;message=`Rotated ${obj.name}`;}break;
    case 'FLIP':if(obj){obj.faceUp=!obj.faceUp;message=`Flipped ${obj.name}`;}break;
    case 'DELETE':objects=objects.filter(o=>o.id!==p.id);message='Object removed';break;
    case 'CLONE':if(obj){objects.push({...obj,id:textValue(p.newId||createId(),80),x:clamp(obj.x+45,0,BOARD_W),y:clamp(obj.y+40,0,BOARD_H)});message=`Duplicated ${obj.name}`;}break;
    case 'ROLL':if(obj){const n=obj.sides||6;const rng=prng(finite(p.seed,1));obj.value=1+Math.floor(rng()*n);message=`Rolled ${obj.name}: ${obj.value}`;}break;
    case 'DRAW':{
      const available=objects.filter(o=>o.zone==='DECK' && (!p.prefix||o.id.startsWith(String(p.prefix))) &&
        (p.matSeat===undefined||(o.matSeat===p.matSeat&&(!o.owner||o.owner===command.actor)))).sort((a,b)=>a.order-b.order);
      const card=available[0];if(!card) throw new Error('No cards in that deck');
      card.zone='HAND';card.owner=command.actor;card.faceUp=false;
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
      const list=objects.filter(o=>o.zone==='DECK' && (!p.prefix || o.id.startsWith(String(p.prefix))));const rand=prng(finite(p.seed,1));
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
  return {...state,objects,turnSeat,round,mode,centerMerges,seq:state.seq+1,message};
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
  return {schema:'sennet.pack/1',id:textValue(pack.id),name:textValue(pack.name),author:textValue(pack.author||'Community'),kind,description:textValue(pack.description,250),license:textValue(pack.license,80),objects:pack.objects.map((o:unknown)=>sanitizeObject(o as Record<string,unknown>)),
    ...(kind==='tcg'&&Array.isArray(pack.centerMerges)?{
      centerMerges:[...new Set(pack.centerMerges.filter((n:unknown):n is number=>
        typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<SEATS*3))].sort((a,b)=>a-b)
    }:{}) ,
    ...(typeof pack.lua==='string'&&pack.lua.length<=30000?{lua:pack.lua}:{})};
}
export function gameFromPack(pack:GamePack):GameState{return {...createGame(pack.kind),objects:pack.objects,centerMerges:pack.centerMerges??[],message:`Loaded ${pack.name} by ${pack.author}`};}
