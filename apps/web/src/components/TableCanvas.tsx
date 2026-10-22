import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Application,Assets,Circle,Container,Graphics,Point,Rectangle,RenderLayer,Sprite,Text} from 'pixi.js';
import CardRadialWheel from './CardRadialWheel';
import {makeCoin,coinHighlight,type CoinAppearance} from './CoinArt';
import {createDrawerBody,drawerPalette} from './RealisticSideDrawer';
const COIN_ACTIONS=['Duplicate Coin','+1','+10','+100','+1000',
  'Color Selector','−1','−10','−100','−1000'] as const;
// Display numerals are deliberately separate from the numeric action values.
const COIN_RADIAL_LABELS=['⧉','+I','+X','+C','+M','◉','−I','−X','−C','−M'] as const;
const COIN_PALETTE=['#d8b979','#d77770','#83c4c7','#97b68d',
  '#9e8dd2','#f2c27c','#f1a6cb','#dde4ea','#657da2','#44464a'];
// Ten real, independently clickable buttons sit over a compact scalloped
// ring; the empty middle is reserved for the miniature physical coin.
const COIN_RADIAL_SIZE=116;
const coinSector=(index:number)=>{
  const center=COIN_RADIAL_SIZE/2;
  const coord=(angle:number,r:number)=>({x:center+r*Math.cos(angle*Math.PI/180),
    y:center-r*Math.sin(angle*Math.PI/180)});
  const a=180-index*36,p=coord(a+17.5,55),q=coord(a-17.5,55);
  const innerStart=coord(a+17.5,21),innerEnd=coord(a-17.5,21);
  const t=coord(a,40);
  return {d:`M${innerStart.x} ${innerStart.y} L${p.x} ${p.y} A55 55 0 0 1 ${q.x} ${q.y} L${innerEnd.x} ${innerEnd.y} A21 21 0 0 0 ${innerStart.x} ${innerStart.y} Z`,
    x:t.x,y:t.y};
};
import {makeDie,DICE_TYPES,diceLabel} from './DiceArt';
import type {StaticDice3DRenderer,StaticDiePlacement} from '../lib/Dice3DStatic';
import {formatDiceSelection} from '../lib/actionDisplay';
import {diceRackLocations} from '../lib/diceCoordinates';
import {bookOpenPoseX,bookSavedOffset,drawerInnerWell,isBookWithinDrawer} from '../lib/bookDrawerPlacement';
import {fitActionScreenToWheel,actionScreenContactCenter} from '../lib/actionScreenFit';
import {resolveDiceTheme,type DiceAppearance} from '../lib/diceThemes';
import {stepDicePhysics,throwVelocity,type DiceBody,type CollisionRect} from '../lib/dicePhysics';
import {makePseudo3DBook} from './Pseudo3DBook';
import {wheelPosition,radialMembership,radialTapMembership,type RadialAction} from '../lib/radialWheel.ts';
import {cardGestureOptions,isDoubleCardTap,GESTURE_HOLD_MS,GESTURE_MOVE_THRESHOLD,type CardGestureAction} from '../lib/cardGestures';
import {cardStackMembers,nearestFrameIndex,playerSeatRotation,viewerTableRotation,tcgMatCells,tcgMatRegions,tcgMatOrigin,opponentAtTablePoint,groupedMatchupLayout,oneOnOneMatchupLayout,castleGridLayout,castleIndependentFocusLayout,castleArrowsVisible,nextCastleAllySeat,nextCastleFocusedSeat,type CastleSideFocus,opponentAcrossDivider,BATTLEFIELD_PLAYMAT_PADDING,battlefieldFitBounds,toggleOpponentRelation,type OpponentRelation,type CastleMode,neighboringOpponentSeat,centerMergeKey,tcgSnapPoint,tcgDropZone,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,TCG_ROW_COLORS,isTcgRemoveDrop,tcgRegionLabel,tcgMatLocal,tcgMatWorld,BOARD_CENTER,BOARD_W,TABLE_APOTHEM,TABLE_SEAT_RADIUS,TABLE_VIEW_RADIUS,MIN_TABLE_ZOOM,clampTableZoom,clampTablePan,type GameState,type Player,type TableObject,type PlaymatAppearance,type PlaymatSectionStyle,playmatSectionIndex,playmatAppearanceForSeat,opponentRelationButtonPosition,OPPONENT_RELATION_COLORS,OPPONENT_RELATION_BUTTON_RADIUS,OPPONENT_RELATION_BUTTON_HIT_RADIUS,viewButtonPosition,VIEW_BUTTON_RADIUS,VIEW_BUTTON_HIT_RADIUS,tcgSettingsButtonPosition,coinNumericValue,validCoinText} from '@sennet/core';
interface Props{diceHoldMs:number;diceFadeMs:number;latestAction:string;canUndo:boolean;canRedo:boolean;onUndo:()=>void;onRedo:()=>void;bookDesign:'tiny'|'dragon'|'journal'|'arcane'|'strapped';bookDock:'left'|'right'|'free';bookOffset:{x:number;y:number};onBookMove:(point:{x:number;y:number})=>void;onBookOpen:()=>void;drawer?:ReactNode;wheelMode:'mobile'|'docked'|'hold';state:GameState;seat:number;playerName:string;actorId:string;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number)=>void;onMoveStack:(id:string,x:number,y:number)=>void;onMoveSelection:(ids:string[],anchorId:string,x:number,y:number)=>void;onDrawMat:()=>void;onOpenTcgSettings:()=>void;onCardAction:(id:string,action:"tap"|"flip")=>void;onGestureAction:(id:string,action:CardGestureAction)=>void;onRadialAction:(ids:string[],action:RadialAction,destination?:string)=>void;playmat:PlaymatAppearance;diceAppearance:DiceAppearance;mergeOpacity:number;mergeHoverMs:number;onMergeCenter:(seat:number,boundary:number,merged:boolean)=>void;onViewChange?:(view:{x:number;y:number;scale:number})=>void;coinAppearance:CoinAppearance;customCoinValue:number;customCoinText:string;onCustomCoinText:(text:string)=>void;onCustomCoinValue:(value:number)=>void;onTokenPlace:(value:number,sign:1|-1,x:number,y:number,carrierId?:string,color?:string,coinText?:string)=>void;onCoinModify:(id:string,changes:{delta?:number;color?:string;coinText?:string})=>void;onCoinDuplicate:(id:string)=>void;onTokenAdjust:(ids:string[],value:number,sign:1|-1)=>void;onDiceThrow:(throws:{sides:number;rolls:number[];x:number;y:number;rotation:number;quaternion?:[number,number,number,number];altitude?:number}[])=>void;
onDiceReroll:(id:string,rolls:number[],x:number,y:number,rotation:number,quaternion?:[number,number,number,number],altitude?:number)=>void;readonly?:boolean}
/** Bottom -> top: player names, accessories, playmat, buttons, objects.
 * RenderLayer keeps logical parent transforms intact across all seat views. */
type TablePaintLayers={labels:RenderLayer;accessories:RenderLayer;
  playmats:RenderLayer;buttons:RenderLayer;objects:RenderLayer};
function createTablePaintLayers():TablePaintLayers{
  return {labels:new RenderLayer(),accessories:new RenderLayer(),
    playmats:new RenderLayer(),buttons:new RenderLayer(),
    objects:new RenderLayer()};
}
const FONT='Inter, ui-sans-serif, system-ui, sans-serif';
// Pixi book gestures and DOM camera gestures must share one pointer guard.
let activeBookPointer:number|null=null;
const COLORS={wood:0x79593b,woodDark:0x342b23,felt:0x183d39,line:0x426761,gold:0xd6b681};
const rgb=(s:string)=>parseInt(s.replace('#',''),16)||0x95b7b2;
/** Unified walnut/brass button casing, matching the actual wooden side drawers
 * and the action-screen frame. Preserve original radii, hitboxes and gestures. */
function woodenControl(radius:number,finish:string,active=false):Graphics{
  const p=drawerPalette(finish);
  return new Graphics()
    .circle(0,1,radius+1).fill({color:p.deep,alpha:.98})
    .circle(0,0,radius).fill({color:active?p.highlight:p.base,alpha:.99})
    .circle(0,0,radius-.9).stroke({color:p.hardware,width:1.55,alpha:.98})
    .circle(0,0,radius-3).stroke({color:p.deep,width:2,alpha:.82})
    .circle(0,0,radius-5).stroke({color:p.highlight,width:.8,alpha:.62})
    .arc(-2,-1,radius-5,3.85,5.35).stroke({color:p.hardware,width:1.2,alpha:.85});
}
function label(text:string,size:number,color:number,weight:'normal'|'bold'='normal'){
  const t=new Text({text,resolution:Math.min(4,Math.max(2,window.devicePixelRatio||1)),style:{fontFamily:FONT,fontSize:size,fill:color,fontWeight:weight,align:'center'}});t.anchor.set(.5);return t;
}
/** Procedure-generated finishes keep the mat crisp at any camera zoom.
 * Textures are drawn over the optional background image but under the label.
 */
function addPlaymatFinish(mat:Container,x:number,y:number,w:number,h:number,
  section:PlaymatSectionStyle,seed:number,isCenterColumn:boolean){
  const matte=section.textureLayers.matte;
  const sandy=section.textureLayers.sandy;
  const glossy=section.textureLayers.glossy;
  const finish=new Graphics();
  finish.eventMode='none';
  if(matte.enabled&&matte.opacity>0){
    // Very fine interrupted horizontal fibers rather than a flat color wash.
    for(let py=y+7;py<y+h-6;py+=8){
      const offset=(Math.floor(py)+seed*7)%11;
      for(let px=x+6+offset;px<x+w-9;px+=28){
        finish.moveTo(px,py).lineTo(Math.min(px+12,x+w-6),py);
      }
    }
    finish.stroke({color:0x9dbbb4,alpha:matte.opacity*.32,width:.55});
  }
  if(sandy.enabled&&sandy.opacity>0){
    // Deterministic micro-particles: no animation or random reshuffling.
    const num=Math.min(680,Math.ceil(w*h/100));
    for(let i=0;i<num;i++){
      const u=((i*73+seed*41)%997)/997,v=((i*197+seed*29)%991)/991;
      const px=x+6+u*(w-12),py=y+6+v*(h-12);
      finish.circle(px,py,i%8===0?1.35:.65);
    }
    finish.fill({color:0xc7d2b9,alpha:sandy.opacity*.6});
  }
  if(glossy.enabled&&glossy.opacity>0){
    const band=Math.max(9,h*.21);
    finish.roundRect(x+5,y+5,w-10,band,5)
      .fill({color:0xffffff,alpha:glossy.opacity*.20});
    finish.moveTo(x+8,y+band+6).lineTo(x+w-8,y+band+6)
      .stroke({color:0xd2e9df,alpha:glossy.opacity*.50,width:1});
    finish.moveTo(x+8,y+h-8).lineTo(x+w-8,y+h-8)
      .stroke({color:0x051910,alpha:glossy.opacity*.28,width:3});
  }
  mat.addChild(finish);
  if(section.innerShadow){
    const depth=section.shadowOpacity;
    const shadow=new Graphics()
      .roundRect(x+3,y+3,w-6,h-6,5)
      .stroke({color:0x000000,alpha:depth*.7,width:5})
      .moveTo(x+6,y+7).lineTo(x+w-6,y+7)
      .stroke({color:0x000000,alpha:depth*.8,width:5})
      .moveTo(x+7,y+7).lineTo(x+7,y+h-7)
      .stroke({color:0x000000,alpha:depth*.65,width:4});
    shadow.eventMode='none';mat.addChild(shadow);
  }
  if(section.innerBevel){
    const bevel=new Graphics()
      .roundRect(x+2.5,y+2.5,w-5,h-5,6)
      .stroke({color:0xf4ebd2,alpha:section.bevelOpacity*.30,width:1})
      .moveTo(x+5,y+h-4).lineTo(x+w-5,y+h-4)
      .stroke({color:0x020c08,alpha:section.bevelOpacity*.75,width:2})
      .moveTo(x+w-4,y+5).lineTo(x+w-4,y+h-5)
      .stroke({color:0x02150f,alpha:section.bevelOpacity*.6,width:2});
    bevel.eventMode='none';mat.addChild(bevel);
  }
  if(section.outerBevel){
    // Both exposed outer edges and 4-unit gaps between regions are embossed.
    const outside=new Graphics()
      .roundRect(x-1,y-1,w+2,h+2,8)
      .stroke({color:isCenterColumn?0xd7cbac:0x36554b,
        alpha:section.bevelOpacity*.68,width:2.2})
      .roundRect(x-2,y-2,w+4,h+4,9)
      .stroke({color:0x000000,alpha:section.bevelOpacity*.36,width:1.8});
    outside.eventMode='none';mat.addChild(outside);
  }
}
/** The image is ALWAYS inserted directly above the base fill and below
 * procedural textures, the grid, shadows, bevels and text—even if the asset
 * loads after those layers were built. Repeat uses the current pocket's crop.
 * Span uses ONE shared mat-wide crop, masked individually by each pocket.
 */
function addPlaymatImage(mat:Container,base:Graphics,x:number,y:number,w:number,h:number,url:string,span:boolean){
  Assets.load(url).then(texture=>{
    if(mat.destroyed||base.destroyed||!texture.width||!texture.height)return;
    const sprite=new Sprite(texture);
    sprite.eventMode='none';
    const targetX=span?-TCG_MAT_WIDTH/2:x+2;
    const targetY=span?-TCG_MAT_HEIGHT/2:y+2;
    const targetW=span?TCG_MAT_WIDTH:w-4;
    const targetH=span?TCG_MAT_HEIGHT:h-4;
    const scale=Math.max(targetW/texture.width,targetH/texture.height);
    sprite.width=texture.width*scale;sprite.height=texture.height*scale;
    sprite.position.set(targetX+(targetW-sprite.width)/2,targetY+(targetH-sprite.height)/2);
    const mask=new Graphics().roundRect(x+2,y+2,w-4,h-4,6).fill(0xffffff);
    mask.eventMode='none';
    // Never append the sprite: asynchronous loading must not put a picture
    // on top of the matte/gravel/gloss, shadow, bevel or label overlays.
    mat.addChildAt(sprite,mat.getChildIndex(base)+1);
    mat.addChild(mask);
    sprite.mask=mask;
  }).catch(()=>{/* Preserve the procedural finish if a remote asset is blocked. */});
}
/** Recessed, bevel-edged TCG playing mat. Cards use exactly the same
 * cell coordinates on every client; drag release is snapped in core. */
function drawTcgMats(
  board:Container,layers:TablePaintLayers,state:GameState,viewerSeat:number,readonly:boolean,
  opacity:number,hoverMs:number,playmat:PlaymatAppearance,
  bookDesign:Props['bookDesign'],bookDock:Props['bookDock'],bookOffset:Props['bookOffset'],onBookOpen:()=>void,onBookMove:Props['onBookMove'],
  onToggleRelation:(seat:number,choice:'enemy'|'ally')=>void,
  onFocusCastleSeat:(seat:number)=>void,
  selectedOpponent:number|null,relations:Readonly<Record<number,OpponentRelation>>,
  onMerge:(seat:number,boundary:number,merged:boolean)=>void,
  onEyeTap:()=>void,onEyeHold:()=>void,onCastleTap:()=>void,onCastleHold:()=>void,onOpenTcgSettings:()=>void,castleActive:boolean,castleMode:CastleMode|'focus',castleBaseMode:CastleMode,focused:Readonly<CastleSideFocus>,onCycleOpponent:(direction:'left'|'right',sourceSeat:number)=>void,onControlDown:(pointerId:number)=>void,
  hoverTimers:Set<number>,seatLayers:Map<number,Container>|null,
  eyeHoldMs:number,selectedEnemy:number|null,
  drawerState:{left:boolean;right:boolean},drawerGroups:Map<number,Container>,drawerTabs:Map<number,Container>,onToggleDrawer:(side:-1|1)=>void
){
  const drawnSeats=seatLayers
    ? [...seatLayers.keys()]
    : Array.from({length:12},(_,i)=>i);
  for(const seat of drawnSeats){
    // Personal appearance belongs only to the current viewer's own mat.
    // Opponents use the default appearance in both table and versus views.
    const seatPlaymat=playmatAppearanceForSeat(playmat,viewerSeat,seat);
    const parent=seatLayers?.get(seat)??board;
    const cells=tcgMatCells(seat);
    const topLeft=cells.find(c=>c.column===0&&c.row===0)!;
    const bottomRight=cells.find(c=>c.column===2&&c.row===3)!;
    const mat=new Container();
    mat.position.set((topLeft.x+bottomRight.x)/2,(topLeft.y+bottomRight.y)/2);
    mat.rotation=topLeft.angle;
    parent.addChild(mat);
    // A transform-only mat owns separate painter surfaces. Its masked
    // drawers must not be nested inside the playmat's render layer.
    const surface=new Container();
    mat.addChild(surface);
    layers.playmats.attach(surface);
    if(castleActive&&seat!==viewerSeat){
      // The actual playmat surface focuses a classified Castle opponent.
      // Child controls and draggable cards retain their own pointer input.
      // Using the transformed Pixi hit area also works for scaled All grids.
      mat.eventMode='static';
      // Navigation arrows sit ON the mat's side borders. A hit area
      // confined to the backing rectangle cuts off the outer half of
      // each arrow, causing taps to be missed after Castle focus.
      // Keep the full arrows hittable while checking the mat bounds when
      // the background itself (rather than a control) receives the tap.
      const hitMargin=19;
      mat.hitArea=new Rectangle(-TCG_MAT_WIDTH/2-hitMargin,
        -TCG_MAT_HEIGHT/2-hitMargin,
        TCG_MAT_WIDTH+2*hitMargin,TCG_MAT_HEIGHT+2*hitMargin);
      mat.cursor='pointer';
      mat.on('pointertap',event=>{
        // Interactive arrows/Sword/Shield stop propagation themselves.
        // Do not treat taps in their outside hit-circle clearance as
        // a second click on the mat; only the actual backing selects it.
        const at=mat.toLocal(event.global);
        if(Math.abs(at.x)>TCG_MAT_WIDTH/2||
           Math.abs(at.y)>TCG_MAT_HEIGHT/2)return;
        event.stopPropagation();
        onFocusCastleSeat(seat);
      });
    }
    // In enemy view, opposite edges touch the central dividing line
    // without overlap. Ally view uses normal full-height mat backings.
    const duel=seatLayers!==null;
    // The bottom side (viewer and all allies) never extends over the
    // divider; every enemy pocket stops at it, regardless of selection.
    const isEnemy=duel&&seat!==viewerSeat&&
      opponentAcrossDivider(castleActive?'castle':'eye',relations[seat]??null);
    const backingTop=duel&&!isEnemy
      ?-TCG_MAT_HEIGHT/2
      :-TCG_MAT_HEIGHT/2-4;
    const backingBottom=isEnemy
      ?TCG_MAT_HEIGHT/2
      :TCG_MAT_HEIGHT/2+4;
    surface.addChild(new Graphics()
      .roundRect(-TCG_MAT_WIDTH/2-4,backingTop,TCG_MAT_WIDTH+8,
        backingBottom-backingTop,duel?7:12)
      .fill({color:0x101e1a,alpha:.82})
      .stroke({color:0x466059,width:1,alpha:.46}));
    // Two empty trays are siblings of the mat pockets in the SAME transformed
    // container, so Castle/Eye/ordinary views all carry them automatically.
    if(seat===viewerSeat){
      const trayW=TCG_MAT.cardWidth;
      // Exact zone edges: row 1 = PLAY 02; row 3 = HAND.
      // Match the pockets, including the gaps between their rows.
      const trayTop=-TCG_MAT_HEIGHT/2+(TCG_MAT.rowHeight+TCG_MAT.gap);
      const trayBottom=TCG_MAT_HEIGHT/2;
      const trayH=trayBottom-trayTop;
      const woodFinish=playmat.sideBoxStyle??'walnut';
      for(const side of [-1,1]){
        const cx=side*(TCG_MAT_WIDTH/2+trayW/2+3),cy=(trayTop+trayBottom)/2;
        // High-resolution wood, hand-worked chamfers, brass corner pins,
        // recessed velvet, and stable baked light/shadow. The drawer remains
        // one Pixi object in the SAME tabletop coordinate system as cards.
        const tray=createDrawerBody(cx,cy,trayW,trayH,woodFinish);
        const drawerGroup=new Container();
        drawerGroup.eventMode='auto';
        drawerGroup.addChild(tray);
        mat.addChild(drawerGroup);
        layers.accessories.attach(drawerGroup);
        drawerGroups.set(side,drawerGroup);
        // The drawer slides UNDER the mat. Only the genuine outer wooden
        // sidewall remains uncovered (~10 tabletop units) when fully shut.
        // A stencil clips everything else behind the playmat, including
        // the dice, coins, and the book. No handles or separate controls.
        const mask=new Graphics();
        const clipX=side===1?TCG_MAT_WIDTH/2:-TCG_MAT_WIDTH/2-180;
        mask.rect(clipX,-TCG_MAT_HEIGHT/2-25,180,TCG_MAT_HEIGHT+50)
          .fill(0xffffff);
        mask.eventMode='none';
        mat.addChild(mask);
        // A regular scene-tree stencil clips the drawer in accessory layer 4.
        drawerGroup.mask=mask;
        const bodyOuterX=cx+side*(trayW+24)/2;
        const wallX=side===1?bodyOuterX-12:bodyOuterX;
        const wall=new Graphics().rect(wallX,
          cy-trayH/2-8,12,trayH+16).fill({color:0xffffff,alpha:.001});
        // This is the EXISTING outer wall: clicking it opens/closes the
        // drawer, while its wood grain remains the only visible artwork.
        wall.eventMode='static';
        wall.cursor='pointer';
        wall.on('pointerdown',e=>{
          e.stopPropagation();onControlDown(e.pointerId);
        });
        wall.on('pointertap',e=>{
          e.stopPropagation();onToggleDrawer(side as -1|1);
        });
        drawerGroup.addChild(wall);
        drawerTabs.set(side,wall);

      }
    }
    if(seat===viewerSeat){
      const side=bookDock==='left'?-1:1;
      // A closed hardcover's natural portrait ratio, projected onto the
      // tabletop. Its 3D footprint uses practically all of the tray width.
      const bw=TCG_MAT.cardWidth-18;
      const bh=bw/.76;
      const trayBottom=TCG_MAT_HEIGHT/2;
      const bx=side*(TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3)+bookOffset.x;
      const by=trayBottom-bh*.44-10+bookOffset.y;
      const book=makePseudo3DBook(bookDesign,bw,bh);
      book.position.set(bx,by);
      // A physical book can be loose on the felt OR stowed in EITHER
      // drawer. Test its footprint against the actual inner wooden walls;
      // do not infer attachment merely from the Book Design/Dock setting.
      const trayW=TCG_MAT.cardWidth;
      const trayTop=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
      const trayH=trayBottom-trayTop;
      const wellFor=(drawerSide:-1|1)=>drawerInnerWell(
        drawerSide*(TCG_MAT_WIDTH/2+trayW/2+3),
        (trayTop+trayBottom)/2,trayW,trayH);
      const fits=(drawerSide:-1|1,x:number,y:number,shift=0)=>
        isBookWithinDrawer(x,y,bw*1.06,bh*1.06,wellFor(drawerSide),shift);
      let stowedIn:-1|1|null=null;
      const stow=(drawerSide:-1|1,openX:number,y:number)=>{
        const drawer=drawerGroups.get(drawerSide);
        if(!drawer)return;
        layers.objects.detach(book);
        // Child of the wooden tray: inherits its 245ms slide, stencil and
        // draw order beneath the felt while remaining above the tray floor.
        drawer.addChild(book);
        book.position.set(openX,y);
        stowedIn=drawerSide;
      };
      const free=(x:number,y:number)=>{
        mat.addChild(book);
        book.position.set(x,y);
        layers.objects.attach(book);
        stowedIn=null;
      };
      const initialStow=([-1,1] as const).find(s=>fits(s,bx,by));
      if(initialStow!==undefined)stow(initialStow,bx,by);
      else free(bx,by);

      let release:((event:PointerEvent)=>void)|null=null;
      book.on('pointerdown',e=>{
        if(e.button!==0)return;
        e.stopPropagation();
        activeBookPointer=e.pointerId;
        const stage=document.querySelector<HTMLCanvasElement>('.pixi-host canvas');
        if(!stage){activeBookPointer=null;return;}
        const rect=stage.getBoundingClientRect();
        const startX=e.global.x,startY=e.global.y;
        const previouslyStowed=stowedIn;
        const homeDrawer=previouslyStowed!==null?drawerGroups.get(previouslyStowed):null;
        // Lift out of the clipped drawer BEFORE dragging. The book now
        // remains selectable across the drawer wall and entire playmat.
        const originalX=book.position.x+(homeDrawer?.position.x??0);
        const originalY=book.position.y;
        if(previouslyStowed!==null)free(originalX,originalY);
        let moved=false;
        const onMove=(event:PointerEvent)=>{
          if(event.pointerId!==e.pointerId)return;
          event.stopPropagation();
          if(event.cancelable)event.preventDefault();
          const global=new Point(
            startX+(event.clientX-e.clientX)*stage.clientWidth/rect.width,
            startY+(event.clientY-e.clientY)*stage.clientHeight/rect.height);
          const start=mat.toLocal(new Point(startX,startY));
          const current=mat.toLocal(global);
          const dx=current.x-start.x,dy=current.y-start.y;
          if(Math.hypot(dx,dy)>4)moved=true;
          book.position.set(originalX+dx,originalY+dy);
        };
        const onUp=(event:PointerEvent)=>{
          if(event.pointerId!==e.pointerId)return;
          event.stopPropagation();
          window.removeEventListener('pointermove',onMove,true);
          window.removeEventListener('pointerup',onUp,true);
          window.removeEventListener('pointercancel',onUp,true);
          activeBookPointer=null;
          release=null;
          if(event.type==='pointercancel'||!moved){
            free(originalX,originalY);
            if(previouslyStowed!==null&&homeDrawer)
              stow(previouslyStowed,bookOpenPoseX(originalX,homeDrawer.position.x),originalY);
            if(event.type!=='pointercancel')onBookOpen();
            return;
          }
          // A drop wholly inside an OPEN drawer becomes part of that
          // drawer, whichever side it is. Outside either well the book
          // remains a freely draggable top-layer physical object.
          const target=([-1,1] as const).find(s=>{
            const drawer=drawerGroups.get(s);
            return drawer&&!(s===-1?drawerState.left:drawerState.right)&&
              fits(s,book.position.x,book.position.y,drawer.position.x);
          });
          const visibleX=book.position.x,visibleY=book.position.y;
          const openX=target===undefined?visibleX:
            bookOpenPoseX(visibleX,drawerGroups.get(target)?.position.x??0);
          if(target!==undefined)stow(target,openX,visibleY);
          // bx/by already contain the prior offset. Preserve it when saving
          // the movement delta, otherwise every drop jumps on scene rebuild.
          onBookMove({x:bookSavedOffset(bookOffset.x,openX,bx),
            y:bookSavedOffset(bookOffset.y,visibleY,by)});
        };
        release=onUp;
        window.addEventListener('pointermove',onMove,true);
        window.addEventListener('pointerup',onUp,true);
        window.addEventListener('pointercancel',onUp,true);
      });
      book.on('destroyed',()=>{if(release)activeBookPointer=null;});
      // A stored book shares the moving drawer; a lifted book is free.
    }
    const cos=Math.cos(topLeft.angle),sin=Math.sin(topLeft.angle);
    // Joined center rows are rendered as ONE pocket. The side columns
    // remain four separate single-card rectangles.
    for(const cell of tcgMatRegions(seat,state.centerMerges)){
      const dx=cell.x-mat.x,dy=cell.y-mat.y;
      const x=dx*cos+dy*sin-cell.width/2;
      const y=-dx*sin+dy*cos-cell.height/2;
      const w=cell.width,h=cell.height;
      const merged=cell.column===1&&cell.lastRow>cell.row;
      const isCenterColumn=cell.column===1;
      const accent=TCG_ROW_COLORS[merged&&cell.row===0&&cell.lastRow===2?1:cell.row];
      const section=seatPlaymat.sections[playmatSectionIndex(cell.row,cell.column)];
      const base=new Graphics()
        .roundRect(x,y,w,h,8).fill({color:0x00050a,alpha:.98})
        // Only the CENTER battlefield/Hand pockets retain colored lines.
        // Side (outer) columns use a subdued neutral border, not yellow.
        .stroke({color:isCenterColumn?accent:0x253d36,
          width:merged?2:1,alpha:isCenterColumn?(merged?.7:.3):.32})
        .roundRect(x+2,y+2,w-4,h-4,6)
        .fill({color:isCenterColumn?accent:0x253d36,
          alpha:isCenterColumn?(merged?.13:.055):.025})
        .stroke({color:0x071915,width:1.8,alpha:.90});
      base.eventMode='none';surface.addChild(base);
      const spanImage=seatPlaymat.imageMode==='span';
      const imageId=spanImage?seatPlaymat.spanningImageId:section.imageId;
      const image=seatPlaymat.images[imageId];
      if(image)addPlaymatImage(surface,base,x,y,w,h,image,spanImage);
      addPlaymatFinish(surface,x,y,w,h,section,seat*12+cell.row*3+cell.column,isCenterColumn);
      // Remove colored grid lines from both OUTER columns. Keep the
      // colored guide lines in the middle playing area unchanged.
      if(isCenterColumn){
        const grid=new Graphics();
        for(let gx=x+10;gx<x+w-5;gx+=10)grid.moveTo(gx,y+5).lineTo(gx,y+h-5);
        for(let gy=y+10;gy<y+h-5;gy+=10)grid.moveTo(x+5,gy).lineTo(x+w-5,gy);
        grid.stroke({color:accent,alpha:merged?.08:.03,width:.5});
        grid.eventMode='none';surface.addChild(grid);
      }
      const text=label(tcgRegionLabel(cell.row,cell.column,cell.lastRow),cell.column!==1?8:merged?12:10,accent, 'bold');
      text.style.fontFamily='Orbitron, '+FONT;
      text.alpha=merged?1:.6;text.eventMode='none';
      // Center EVERY center-column label. Side labels face toward the
      // middle: left reads one way, right reads the opposite way.
      text.position.set(x+w/2,y+h/2);
      if(cell.column===0)text.rotation=-Math.PI/2;
      if(cell.column===2)text.rotation=Math.PI/2;
      surface.addChild(text);
    }
    // No separate gold/yellow outer border beneath the mat: only the
    // central playing area keeps its colored guide lines.

    // Three lightweight hover-to-arm controls sit in the center-column
    // gutters. A merge keeps its control (shown as minus) for reversal.
    for(let boundary=0;boundary<3;boundary++){
      const index=centerMergeKey(seat,boundary);
      const merged=Boolean(state.centerMerges?.includes(index));
      const marker=new Container();
      const gapCenter=-TCG_MAT_HEIGHT/2+(boundary+1)*TCG_MAT.rowHeight+
        (boundary+.5)*TCG_MAT.gap;
      marker.position.set(0,gapCenter);
      marker.alpha=opacity;
      marker.eventMode=seat===viewerSeat&&!readonly?'static':'none';
      marker.hitArea=new Circle(0,0,19);
      marker.cursor='default';
      marker.addChild(woodenControl(16,seatPlaymat.sideBoxStyle??'walnut',merged));
      const sign=label(merged?'−':'+',29,0xf4e1b9,'bold');
      sign.eventMode='none';sign.position.set(0,-1);marker.addChild(sign);
      if(seat===viewerSeat&&!readonly){
        let armed=false;
        let timer:number|null=null;
        const disarm=()=>{
          if(timer!==null){window.clearTimeout(timer);hoverTimers.delete(timer);timer=null;}
          armed=false;marker.alpha=opacity;marker.cursor='default';
        };
        const arm=()=>{
          if(timer!==null)window.clearTimeout(timer);
          timer=window.setTimeout(()=>{
            if(marker.destroyed)return;
            hoverTimers.delete(timer!);timer=null;armed=true;
            marker.alpha=Math.max(.68,opacity);marker.cursor='pointer';
          },hoverMs);
          hoverTimers.add(timer);
        };
        marker.on('pointerover',arm);
        marker.on('pointerout',disarm);
        marker.on('pointerdown',e=>{
          if(!armed)return;
          e.stopPropagation();onControlDown(e.pointerId);
        });
        marker.on('pointertap',e=>{
          if(!armed)return;
          e.stopPropagation();
          disarm();
          onMerge(seat,boundary,!merged);
        });
      }
      mat.addChild(marker);
      layers.buttons.attach(marker);
    }

    // These are visual-view controls, not game commands. On the opponent's
    // rotated mat, positive local X appears on the LEFT of the screen.
    // Left = seat number decrement (counter-clockwise in full-table view).
    // Right = seat number increment (clockwise), always skipping our seat.
    if(seatLayers&&(
      !castleActive&&seat===selectedOpponent||
      castleActive&&castleArrowsVisible(viewerSeat,seat,castleMode,
        castleBaseMode,selectedOpponent,selectedEnemy,focused,relations)
    )){
      const allyHere=castleActive&&relations[seat]==='ally';
      for(const direction of ['left','right'] as const){
        const left=direction==='left';
        const button=new Container();
        // On enemy mats local +X points screen-left; on allied mats
        // the same local axis points right. Keep arrow signs consistent
        // with the screen and the numbered table seating order.
        button.position.set((left?(allyHere?-1:1):(allyHere?1:-1))*TCG_MAT_WIDTH/2,0);
        button.eventMode='static';
        button.hitArea=new Circle(0,0,19);
        button.cursor='pointer';
        button.addChild(woodenControl(16,seatPlaymat.sideBoxStyle??'walnut'));
        // A 180-degree facing rotation makes a local right-arrow appear
        // as a LEFT arrow on screen, and vice-versa.
        const tip=allyHere?(left?-5:5):(left?5:-5);
        const base=-tip*.8;
        button.addChild(new Graphics()
          .moveTo(base,-7).lineTo(tip,0).lineTo(base,7)
          .stroke({color:0xf4e1b9,width:2.7,cap:'round',join:'round'}));
        button.on('pointerdown',e=>{
          if(e.button!==0)return;
          e.stopPropagation();onControlDown(e.pointerId);
        });
        button.on('pointertap',e=>{
          e.stopPropagation();
          onCycleOpponent(direction,seat);
        });
        mat.addChild(button);
        layers.buttons.attach(button);
      }
    }

    // Eye and Castle centers straddle the PLAY 03 top border,
    // symmetrically around the owning player's local mat center.
    if(seat===viewerSeat){
      const eye=new Container();
      // The center of each circle straddles PLAY 03's top line,
      // not a viewport-relative position.
      const eyePosition=viewButtonPosition('eye');
      eye.position.set(eyePosition.x,eyePosition.y);
      eye.eventMode='static';
      eye.hitArea=new Circle(0,0,VIEW_BUTTON_HIT_RADIUS);
      eye.cursor='pointer';
      eye.addChild(woodenControl(VIEW_BUTTON_RADIUS,seatPlaymat.sideBoxStyle??'walnut'));
      eye.addChild(new Graphics().ellipse(0,0,10,6).stroke({color:0xf4e4bd,width:1.8})
        .circle(0,0,3.3).fill({color:0xf6e4c1})
        .circle(1,-1,1.2).fill({color:0x3f5e53}));
      // The pointer must remain almost motionless for the 250 ms hold.
      let pending:number|null=null;
      let pressedPointer:number|null=null;
      let held=false;
      let firstX=0,firstY=0;
      const clear=()=>{
        if(pending!==null){window.clearTimeout(pending);hoverTimers.delete(pending);pending=null;}
      };
      eye.on('pointerdown',e=>{
        if(e.button!==0)return;
        e.stopPropagation();onControlDown(e.pointerId);
        clear();pressedPointer=e.pointerId;held=false;
        firstX=e.clientX;firstY=e.clientY;
        pending=window.setTimeout(()=>{
          if(pressedPointer===null||eye.destroyed)return;
          hoverTimers.delete(pending!);pending=null;
          held=true;onEyeHold();
        },eyeHoldMs);
        hoverTimers.add(pending);
      });
      eye.on('globalpointermove',e=>{
        if(pressedPointer!==e.pointerId||pending===null)return;
        if(Math.hypot(e.clientX-firstX,e.clientY-firstY)>7){
          pressedPointer=null;clear();
        }
      });
      eye.on('pointerup',e=>{
        if(pressedPointer!==e.pointerId)return;
        const wasHeld=held;
        pressedPointer=null;clear();
        e.stopPropagation();
        if(!wasHeld)onEyeTap();
      });
      eye.on('pointerupoutside',()=>{pressedPointer=null;clear();});
      eye.on('pointercancel',()=>{pressedPointer=null;clear();});
      mat.addChild(eye);
      layers.buttons.attach(eye);
      // Same size as the eye and merge controls. Castle switches to the
      // classified-only battlefield, excluding every unmarked opponent.
      const castle=new Container();
      const castlePosition=viewButtonPosition('castle');
      castle.position.set(castlePosition.x,castlePosition.y);
      castle.eventMode='static';
      castle.cursor='pointer';
      castle.hitArea=new Circle(0,0,VIEW_BUTTON_HIT_RADIUS);
      castle.addChild(woodenControl(VIEW_BUTTON_RADIUS,seatPlaymat.sideBoxStyle??'walnut',castleActive));
      const castleMark=new Graphics();
      // Crenellated wall with two towers and a dark arched gate.
      castleMark
        .rect(-10,-7,5,5).rect(-3,-7,6,5).rect(5,-7,5,5)
        .fill(0xf4e4bd)
        .rect(-10,-3,20,12).fill(0xf4e4bd)
        .rect(-12,-10,7,5).rect(5,-10,7,5).fill(0xf4e4bd)
        .rect(-12,-6,7,15).rect(5,-6,7,15).fill(0xf4e4bd)
        .roundRect(-3,2,6,8,3).fill(rgb(drawerPalette(seatPlaymat.sideBoxStyle??'walnut').deep))
        .moveTo(-12,9).lineTo(12,9)
        .stroke({color:0xf4e4bd,width:1.4});
      castleMark.eventMode='none';
      castle.addChild(castleMark);
      // Tap retains the existing enter/exit behavior. A stationary
      // 250-ms hold toggles Castle Single / All without also tapping.
      let castleTimer:number|null=null;
      let castlePointer:number|null=null;
      let castleHeld=false;
      let castleX=0,castleY=0;
      const cancelCastleTimer=()=>{
        if(castleTimer!==null){
          window.clearTimeout(castleTimer);
          hoverTimers.delete(castleTimer);
          castleTimer=null;
        }
      };
      castle.on('pointerdown',e=>{
        if(e.button!==0)return;
        e.stopPropagation();onControlDown(e.pointerId);
        cancelCastleTimer();
        castlePointer=e.pointerId;castleHeld=false;
        castleX=e.clientX;castleY=e.clientY;
        castleTimer=window.setTimeout(()=>{
          if(castlePointer===null||castle.destroyed)return;
          hoverTimers.delete(castleTimer!);castleTimer=null;
          castleHeld=true;onCastleHold();
        },eyeHoldMs);
        hoverTimers.add(castleTimer);
      });
      castle.on('globalpointermove',e=>{
        if(castlePointer!==e.pointerId||castleTimer===null)return;
        if(Math.hypot(e.clientX-castleX,e.clientY-castleY)>7){
          castlePointer=null;cancelCastleTimer();
        }
      });
      castle.on('pointerup',e=>{
        if(castlePointer!==e.pointerId)return;
        const held=castleHeld;
        castlePointer=null;cancelCastleTimer();
        e.stopPropagation();
        if(!held)onCastleTap();
      });
      castle.on('pointerupoutside',()=>{castlePointer=null;cancelCastleTimer();});
      castle.on('pointercancel',()=>{castlePointer=null;cancelCastleTimer();});
      // The inner glyph stays the same in both views; this tiny corner
      // label makes the current Castle mode visible even with no allies.
      const modeMark=label(castleMode==='focus'?'•':castleMode==='single'?'1':'∞',9,0xf9e0a7,'bold');
      modeMark.position.set(11,11);modeMark.eventMode='none';
      castle.addChild(modeMark);
      mat.addChild(castle);
      layers.buttons.attach(castle);
      // The gear circle is CENTERED on the exact bottom-right corner
      // where the viewer's HAND bottom border meets its right edge.
      // It stays on the mat in every view, with the same 32-unit diameter
      // and 19-unit hit radius as Eye and Castle.
      const settings=new Container();
      const position=tcgSettingsButtonPosition();
      settings.position.set(position.x,position.y);
      settings.eventMode='static';
      settings.cursor='pointer';
      settings.hitArea=new Circle(0,0,VIEW_BUTTON_HIT_RADIUS);
      settings.addChild(woodenControl(VIEW_BUTTON_RADIUS,seatPlaymat.sideBoxStyle??'walnut'));
      // Eight-tooth fine-line gear, centered on the same 32-unit disk.
      const gear=new Graphics();
      for(let i=0;i<32;i++){
        const angle=i*Math.PI/16-Math.PI/2;
        const radius=i%4===1||i%4===2?10.8:8.2;
        const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
        if(i===0)gear.moveTo(x,y);else gear.lineTo(x,y);
      }
      gear.closePath().fill({color:0xf4e4bd});
      gear.circle(0,0,4).fill(rgb(drawerPalette(seatPlaymat.sideBoxStyle??'walnut').deep))
        .circle(0,0,2.8).stroke({color:0xf4e4bd,width:.85});
      gear.eventMode='none';
      settings.addChild(gear);
      settings.on('pointerdown',e=>{
        if(e.button!==0)return;
        e.stopPropagation();
        onControlDown(e.pointerId); // Never pan or drag the tabletop.
      });
      settings.on('pointertap',e=>{
        if(e.button!==0)return;
        e.stopPropagation();
        onOpenTcgSettings();
      });
      mat.addChild(settings);
      layers.buttons.attach(settings);
    }
    // Every other mat in Opponent Mode owns its own centered Sword and
    // Shield controls. The Eye remains exclusive to the viewer's mat.
    // These are local display choices, not multiplayer game commands.
    if(seatLayers&&seat!==viewerSeat){
        for(const choice of ['enemy','ally'] as const){
          const isSword=choice==='enemy';
          const active=relations[seat]===choice;
          const palette=OPPONENT_RELATION_COLORS[choice];
          const button=new Container();
          const enemySide=opponentAcrossDivider(
            castleActive?'castle':'eye',relations[seat]??null);
          // Anchor to THIS opponent's own PLAY 03 top line, not the
          // viewer's screen edge or central battlefield divider.
          const position=opponentRelationButtonPosition(choice,enemySide);
          button.position.set(position.x,position.y);
          button.eventMode='static';
          button.cursor='pointer';
          button.hitArea=new Circle(0,0,OPPONENT_RELATION_BUTTON_HIT_RADIUS);
          button.addChild(woodenControl(OPPONENT_RELATION_BUTTON_RADIUS,seatPlaymat.sideBoxStyle??'walnut',active));
          const glyph=new Graphics();
          if(isSword){
            // Single upright sword: blade, crossguard, grip, pommel.
            glyph.moveTo(-1,2).lineTo(6,-8).lineTo(9,-11)
              .lineTo(8,-6).lineTo(1,3)
              .stroke({color:0xf4e4bd,width:2,cap:'round',join:'round'});
            glyph.moveTo(-6,-1).lineTo(3,6)
              .moveTo(-2,3).lineTo(-7,9)
              .stroke({color:0xf4e4bd,width:2.5,cap:'round',join:'round'});
            glyph.circle(-8,10,1.7).fill(0xf4e4bd);
          }else{
            glyph.moveTo(0,-10).lineTo(8,-6).lineTo(7,3)
              .quadraticCurveTo(4,9,0,11)
              .quadraticCurveTo(-4,9,-7,3)
              .lineTo(-8,-6).closePath()
              .stroke({color:0xf4e4bd,width:2,join:'round'});
            glyph.moveTo(0,-7).lineTo(0,8)
              .stroke({color:0xf4e4bd,alpha:.55,width:1.2});
          }
          // Keep the icon oriented with the owner and their PLAY 03 row,
          // exactly like the other markings on their playmat.
          glyph.eventMode='none';button.addChild(glyph);
          button.on('pointerdown',e=>{
            if(e.button!==0)return;
            e.stopPropagation();
            onControlDown(e.pointerId);
          });
          button.on('pointertap',e=>{
            e.stopPropagation();
            onToggleRelation(seat,choice);
          });
          mat.addChild(button);
          layers.buttons.attach(button);
        }
    }
  }
}
/** Reframe arbitrary opponent into the opposing (top) position without
 * changing a single game coordinate. Pieces remain logically at their seats.
 */
function makeDuelSeatLayers(
  board:Container,viewerSeat:number,opponentSeat:number|null,
  relations:Readonly<Record<number,OpponentRelation>>,castleActive:boolean,
  castleMode:CastleMode|'focus',castleBaseMode:CastleMode,
  focused:Readonly<CastleSideFocus>,viewport:{width:number;height:number},
  selectedEnemy:number|null
){
  const layers=new Map<number,Container>();
  // Each Castle half is independent. Focusing one role never removes or
  // shrinks the unfocused role's grid; two focuses leave exactly three mats.
  const layout=castleActive
    ?castleIndependentFocusLayout(viewerSeat,relations,
      castleMode==='focus'?castleBaseMode:castleMode,opponentSeat,
      castleMode==='focus'?focused:{ally:null,enemy:null},
      viewport,BATTLEFIELD_PLAYMAT_PADDING,selectedEnemy)
    :oneOnOneMatchupLayout(viewerSeat,opponentSeat!,relations,BATTLEFIELD_PLAYMAT_PADDING);
  // Render the viewer last so Eye/Castle controls stay on top.
  const order=[...layout.mats.keys()].filter(seat=>seat!==viewerSeat);
  order.push(viewerSeat);
  for(const which of order){
    const origin=tcgMatOrigin(which);
    const target=layout.mats.get(which)!;
    const group=new Container();
    group.pivot.set(origin.x,origin.y);
    group.position.set(target.x,target.y);
    group.rotation=target.rotation;
    group.scale.set('scale' in target&&typeof target.scale==='number'?target.scale:1);
    board.addChild(group);layers.set(which,group);
  }
  return layers;
}
function drawBackground(board:Container,layers:TablePaintLayers,state:GameState,seat:number,playerName:string,readonly:boolean,
  opacity:number,hoverMs:number,onMerge:(seat:number,boundary:number,merged:boolean)=>void,
  onEyeTap:()=>void,onEyeHold:()=>void,onCastleTap:()=>void,onCastleHold:()=>void,onOpenTcgSettings:()=>void,onCycleOpponent:(direction:'left'|'right',sourceSeat:number)=>void,onToggleRelation:(seat:number,choice:'enemy'|'ally')=>void,onFocusCastleSeat:(seat:number)=>void,onControlDown:(id:number)=>void,hoverTimers:Set<number>,playmat:PlaymatAppearance,
  bookDesign:Props['bookDesign'],bookDock:Props['bookDock'],bookOffset:Props['bookOffset'],onBookOpen:()=>void,onBookMove:Props['onBookMove'],
  duelOpponent:number|null,castleActive:boolean,castleMode:CastleMode|'focus',
  castleBaseMode:CastleMode,focused:Readonly<CastleSideFocus>,
  viewport:{width:number;height:number},
  relations:Readonly<Record<number,OpponentRelation>>,eyeHoldMs:number,
  selectedEnemy:number|null,
  drawerState:{left:boolean;right:boolean},drawerGroups:Map<number,Container>,drawerTabs:Map<number,Container>,onToggleDrawer:(side:-1|1)=>void):Map<number,Container>|null{
  const backdrop=new Graphics().rect(0,0,BOARD_W,BOARD_W).fill(0x142723);
  board.addChild(backdrop);
  if(duelOpponent!==null||castleActive){
    // The classified-only Castle and Eye opponent modes share one divider.
    // Wide felt planes fill spare screen width without deforming cards.
    const panels=new Container();
    panels.position.set(BOARD_CENTER,BOARD_CENTER);
    panels.rotation=-viewerTableRotation(seat);
    // Extend both colored player areas beyond any possible viewport.
    // The halves remain full-screen even on very narrow screens where
    // fitting the side arrows forces a smaller camera magnification.
    const span=BOARD_W*2;
    panels.addChild(new Graphics()
      .rect(-span/2,-BOARD_W,span,BOARD_W)
        .fill({color:0x203b35})
      .rect(-span/2,0,span,BOARD_W)
        .fill({color:0x24443b})
      .moveTo(-span/2,0).lineTo(span/2,0)
        .stroke({color:0xbc9a62,width:2.4,alpha:.86}));
    board.addChild(panels);
  }else{
    const radius=TABLE_APOTHEM/Math.cos(Math.PI/12);
    const points=Array.from({length:12},(_,i)=>{
      const a=(i*Math.PI/6)-Math.PI/2-Math.PI/12;
      return {x:BOARD_CENTER+radius*Math.cos(a),y:BOARD_CENTER+radius*Math.sin(a)};
    });
    const pts=points.flatMap(p=>[p.x,p.y]);
    board.addChild(new Graphics().poly(pts).fill(COLORS.woodDark)
      .stroke({color:0x110f0c,width:18}));
    board.addChild(new Graphics().poly(points.map(p=>[
      BOARD_CENTER+(p.x-BOARD_CENTER)*.991,
      BOARD_CENTER+(p.y-BOARD_CENTER)*.991]).flat()).fill(COLORS.wood)
      .stroke({color:COLORS.gold,width:3,alpha:.75}));
    board.addChild(new Graphics().poly(points.map(p=>[
      BOARD_CENTER+(p.x-BOARD_CENTER)*.972,
      BOARD_CENTER+(p.y-BOARD_CENTER)*.972]).flat()).fill(COLORS.felt)
      .stroke({color:0x112d2b,width:4}));
  }
  const seatLayers=duelOpponent===null&&!castleActive
    ?null:makeDuelSeatLayers(board,seat,duelOpponent,relations,castleActive,
      castleMode,castleBaseMode,focused,viewport,selectedEnemy);
  if(state.kind==='tcg')drawTcgMats(board,layers,state,seat,readonly,opacity,hoverMs,playmat,
    bookDesign,bookDock,bookOffset,onBookOpen,onBookMove,
    onToggleRelation,onFocusCastleSeat,duelOpponent,relations,onMerge,
    onEyeTap,onEyeHold,onCastleTap,onCastleHold,onOpenTcgSettings,castleActive,castleMode,
    castleBaseMode,focused,onCycleOpponent,onControlDown,hoverTimers,seatLayers,
    eyeHoldMs,selectedEnemy,drawerState,drawerGroups,drawerTabs,onToggleDrawer);
  for(let i=0;i<12;i++){
    // Retractable HTML edge labels replace physical chair/name blocks
    // in the versus mode, preserving the full play area for cards.
    if(seatLayers)continue;
    const angle=i*Math.PI/6-Math.PI/2;
    const x=BOARD_CENTER+(TABLE_APOTHEM+34)*Math.cos(angle);
    const y=BOARD_CENTER+(TABLE_APOTHEM+34)*Math.sin(angle);
    // Draw every seat, including the local one, as IDENTICAL plain text.
    // A transparent HTML target over the local caption keeps its book
    // shelf clickable without painting another visible nameplate.
    const chair=new Container();
    chair.position.set(x,y);
    chair.rotation=playerSeatRotation(i);
    chair.addChild(new Graphics().roundRect(-78,-25,156,50,10)
      .fill(0xc9a66a).stroke({color:0xf0d6a5,width:1.5}));
    const seatText=label('Player '+String(i+1).padStart(2,'0'),
      22,0x263a32,'bold');
    seatText.position.set(0,-1);
    chair.addChild(seatText);
    board.addChild(chair);
    layers.labels.attach(chair);
  }
  return seatLayers;
}
function markHeldStack(piece:Container,count:number){
  const indicator=new Graphics().ellipse(0,0,44,58)
    .stroke({color:0xffdd88,width:3,alpha:.98});
  indicator.eventMode='none';
  piece.addChild(indicator);
  const text=label(String(count)+' cards',14,0xffe5a0,'bold');
  text.position.set(0,-64);text.eventMode='none';piece.addChild(text);
}
/** Fixed-elevation, top-down 2.5D deck box. Every face is procedural:
 * slight extrusion, contact shadow, inset lid, brushed edge, latch, and
 * highlights. No perspective camera or network asset is required.
 * The entire object turns as one sprite with its player's seat.
 */
function deckBoxArt(o:TableObject):Container{
  const art=new Container();
  const casing=rgb(o.color);
  // Diffuse contact shadow falls down-right; the raised base is darker
  // than the lid, giving the impression of thickness from directly above.
  art.addChild(new Graphics()
    .roundRect(-34+5,-45+12,68,94,11)
    .fill({color:0x020908,alpha:.18})
    .roundRect(-33+3,-45+9,67,94,10)
    .fill({color:0x020908,alpha:.23})
    .roundRect(-34,-41,68,94,10)
    .fill(0x0c1917)
    .stroke({color:0x101c19,width:1.5}));
  // Dark edge of the box is visible below the beveled top shell.
  art.addChild(new Graphics()
    .roundRect(-34,-45,68,93,10)
    .fill({color:0x18322e})
    .stroke({color:0x081814,width:2})
    .moveTo(-29,43).lineTo(28,43)
    .stroke({color:0x53675b,alpha:.55,width:1.4})
    .moveTo(31,-35).lineTo(31,37)
    .stroke({color:0x020b0a,alpha:.6,width:4}));
  // Soft leather/plastic lid, framed by a thin satin-brass perimeter.
  art.addChild(new Graphics()
    .roundRect(-32,-47,64,87,9)
    .fill({color:casing})
    .stroke({color:0xc4ae83,width:1.7,alpha:.85})
    .roundRect(-28,-43,56,79,7)
    .stroke({color:0xf7e3b6,width:1,alpha:.26})
    .roundRect(-25,-39,50,71,6)
    .fill({color:0x091c17,alpha:.26})
    .stroke({color:0x0c2420,width:1.5,alpha:.6}));
  // Top-left rim catches light; the far rim drops into shadow.
  art.addChild(new Graphics()
    .moveTo(-29,26).lineTo(-29,-37).quadraticCurveTo(-28,-43,-21,-43)
    .lineTo(22,-43)
    .stroke({color:0xf1e4c0,width:1.5,alpha:.44,cap:'round'})
    .moveTo(28,-36).lineTo(28,30)
    .stroke({color:0x020b0a,width:3,alpha:.45})
    .moveTo(-22,35).lineTo(24,35)
    .stroke({color:0x020c0b,width:2.2,alpha:.56}));
  // Raised hinge/seam and a centered understated Sennet crest.
  art.addChild(new Graphics()
    .moveTo(-24,-23).lineTo(24,-23)
    .stroke({color:0x020b09,width:2.5,alpha:.66})
    .moveTo(-24,-25).lineTo(24,-25)
    .stroke({color:0xe2cea2,width:1,alpha:.5})
    .moveTo(0,-13).lineTo(13,0).lineTo(0,13).lineTo(-13,0).closePath()
    .fill({color:0x0e2722,alpha:.52})
    .stroke({color:0xc8ad79,width:1.3,alpha:.8})
    .circle(-22,-35,1.2).circle(22,-35,1.2)
    .fill({color:0xe5cc94,alpha:.74}));
  const crest=label('S',17,0xe2c991,'bold');
  crest.position.set(0,-1);crest.eventMode='none';art.addChild(crest);
  // Short front magnetic pull-tab emphasizes this is a BOX, not a card.
  art.addChild(new Graphics()
    .roundRect(-13,33,26,10,3)
    .fill(0x132420)
    .stroke({color:0xa88d61,width:1.2})
    .roundRect(-8,35,16,4,2)
    .fill({color:0xceb384,alpha:.8})
    .moveTo(-7,36).lineTo(7,36)
    .stroke({color:0xfcdf9c,alpha:.32,width:1}));
  return art;
}
/** Imported card art is rendered as DOM <img> above WebGL for CORS safety.
 * Coins need a matching DOM visual *above that artwork*, otherwise even a
 * perfectly z-sorted Pixi coin disappears behind the card's image.
 * This overlay is display-only: Pixi keeps all hit tests and drag gestures.
 */
function coinDomVisual(value:number|string,sign:1|-1,source:boolean,style:CoinAppearance,color='#d8b979',editable=false):HTMLDivElement{
  const root=document.createElement('div');
  root.className='sennet-coin-above-card';
  root.dataset.finish=style.finish;
  if(editable)root.dataset.variant='editable';
  root.style.setProperty('--coin-size',String(style.size));
  root.style.setProperty('--coin-shine',String(style.shine/100));
  root.style.setProperty('--coin-bevel',String(style.bevel/100));
  root.style.setProperty('--coin-accent',color);
  const face=document.createElement('div');
  face.className='sennet-coin-above-card-face';
  // The central value is the only face marking. Both halves remain interactive.
  const center=document.createElement('span');
  center.className='sennet-coin-above-card-number';
  const text=String(value);
  center.textContent=text;
  center.style.fontSize=String(text.length>12?4.2:text.length>9?5.2:text.length>6?6.4:
    text.length>4?8:text.length===4?10.2:text.length===3?12:text.length===2?13.6:15)+'px';
  face.append(center);root.appendChild(face);
  return root;
}
function createPiece(o:TableObject,isSelected:boolean,coinStyle:CoinAppearance){
  const box=new Container();box.position.set(o.x,o.y);box.eventMode=o.locked?'none':'static';box.cursor=o.locked?'default':'grab';
  // Diffuse overhead contact shading, not the old oversized oval/rectangle.
  const shadow=new Graphics();
  if(o.kind==='die'){
    shadow.ellipse(0,5,14,6).fill({color:0x010b0a,alpha:.17});
    shadow.ellipse(0,5,10,3.8).fill({color:0x020b09,alpha:.11});
  }else{
    shadow.ellipse(3,o.tokenCoin?3:13,o.tokenCoin?7:33,o.tokenCoin?3.3:12)
      .fill({color:0x050c0b,alpha:o.tokenCoin?.14:.32});
  }
  shadow.eventMode='none';box.addChild(shadow);
  if(o.tokenCoin){
    box.hitArea=new Circle(0,0,17*coinStyle.size*1.08);
    box.addChild(makeCoin(o.coinText??o.value??1,coinStyle,false,o.tokenSign??1,o.color,o.coinText!==undefined));
    if(isSelected)box.addChild(new Graphics().circle(0,0,18*coinStyle.size*1.08).stroke({color:0x9effee,width:2.2}));
  }else if(o.kind==='deck-box'){
    // Keep its clickable footprint precise; other tabletop pieces
    // underneath or alongside remain selectable.
    box.hitArea=new Rectangle(-38,-51,76,107);
    box.addChild(deckBoxArt(o));
  }else if(o.kind==='board'){
    box.addChild(new Graphics().roundRect(-155,-103,310,206,10).fill(0x362c22).stroke({color:0xcbb68c,width:4}));
    const face=new Graphics().roundRect(-148,-95,296,190,6).fill(rgb(o.color));
    for(let i=-140;i<148;i+=37)for(let j=-91;j<95;j+=37){face.rect(i,j,37,37).fill({color:0x151d18,alpha:(Math.round(i/37)+Math.round(j/37))%2===0?.2:.04});}
    box.addChild(face);
    const t=label(o.name,12,0xf2ead7,'bold');t.position.set(0,-110);box.addChild(t);
  }else if(o.kind==='card'||o.kind==='deck'){
    box.addChild(new Graphics().roundRect(-31,-44,62,88,7).fill(0x101e20).stroke({color:isSelected?0xf4d59b:0x6d6c60,width:isSelected?3:1}));
    box.addChild(new Graphics().roundRect(-27,-40,54,80,5).fill(o.faceUp?rgb(o.color):0x253c43));
    if(o.faceUp){box.addChild(new Graphics().roundRect(-22,-31,44,42,3).fill({color:0xede8cf,alpha:.25}));
      const emblem=label('✦',29,0xf1e7d0);emblem.position.set(0,-10);box.addChild(emblem);
      const tx=label(o.name.length>12?o.name.slice(0,11)+'…':o.name,9,0x172826,'bold');tx.position.set(0,24);box.addChild(tx);
    }else{box.addChild(new Graphics().roundRect(-20,-28,40,57,4).stroke({color:0x819f98,width:1.5}).roundRect(-14,-22,28,45,3).stroke({color:0x4a746d,width:1.5}));const t=label('S',24,0xd2bb8f,'bold');box.addChild(t);}
  }else if(o.kind==='die'&&o.throwDice){
    box.hitArea=new Circle(0,0,19);
    const rolls=o.throwRolls??[];
    const heads=rolls.filter(n=>n===1).length;
    const display=o.sides===2?(rolls.length<=1?(heads?'H':'T'):heads+'H/'+(rolls.length-heads)+'T'):
      String(o.throwTotal??o.value??1);
    box.addChild(makeDie(o.sides??6,display));
    if((o.throwQuantity??1)>1){
      const quantity=label('×'+o.throwQuantity,8,0xffe7aa,'bold');
      quantity.position.set(0,25);box.addChild(quantity);
    }
  }else if(o.kind==='die'){
    box.addChild(new Graphics().roundRect(-23,-22,46,45,8).fill(0x9aa7aa).stroke({color:0x303a38,width:2}));
    box.addChild(new Graphics().roundRect(-22,-27,42,43,7).fill(rgb(o.color)).stroke({color:0xe8eadd,width:1}));
    const number=label(String(o.value||1),22,0x273d3d,'bold');number.position.set(0,-7);box.addChild(number);
    const sides=label(`D${o.sides||6}`,10,0xe2d5af,'bold');sides.position.set(0,31);box.addChild(sides);
  }else if(o.kind==='miniature'){
    box.addChild(new Graphics().ellipse(0,15,26,12).fill(0x161e1b).stroke({color:0xd8bb81,width:2}));
    box.addChild(new Graphics().roundRect(-14,-19,28,36,9).fill(rgb(o.color)).stroke({color:0xe6d7af,width:2}));
    box.addChild(new Graphics().circle(0,-24,11).fill(0xf0d6b4).stroke({color:0x5b4837,width:2}));
    const head=label('◆',12,0x425950);head.position.set(0,-24);box.addChild(head);
    const name=label(o.name.slice(0,14),10,0xf0e7d8,'bold');name.position.set(0,32);box.addChild(name);
  }else{
    box.addChild(new Graphics().circle(0,0,26).fill(0x101e1d).stroke({color:isSelected?0xf9d29a:0x8f997f,width:3}));
    box.addChild(new Graphics().circle(0,-4,24).fill(rgb(o.color)).stroke({color:0xffffff,width:1,alpha:.37}));
    const t=label(o.name.length>7?'✦':o.name, o.name.length>7?25:11,0x172c2a,'bold');t.position.set(0,-4);box.addChild(t);
  }
  // Selection is indicated through the existing card border only.
  if(o.locked){
    const lock=label('LOCKED',8,0xffd496,'bold');
    lock.position.set(0,51);lock.eventMode='none';box.addChild(lock);
  }
  if((o.counters??0)>0){
    const counter=new Container();
    counter.position.set(27,-37);counter.eventMode='none';
    counter.addChild(new Graphics().circle(0,0,14)
      .fill({color:0x1f3d31,alpha:.98})
      .stroke({color:0xf1d39a,width:2}));
    const number=label(String(o.counters),13,0xffebbc,'bold');
    number.eventMode='none';counter.addChild(number);
    box.addChild(counter);
  }
  return box;
}
/** In opposing view, player identification retracts off-screen while a
 * small arrow tab remains visible. A 250ms dwell reveals it; without a
 * click it automatically retracts after one second. Click to pin open. */
/** In opponent view, identities stay open while hovered (or pinned).
 * A 250ms dwell opens them; after leaving, wait one second before closing.
 * Re-entering cancels the pending retraction.
 */
function RetractableSeatLabel({side,seat,idleOpacity}:{side:'top'|'bottom';seat:number;idleOpacity:number}){
  const [shown,setShown]=useState(false);
  const [pinned,setPinned]=useState(false);
  const hovered=useRef(false);
  const hoverTimer=useRef<number|null>(null);
  const retractTimer=useRef<number|null>(null);
  const clear=(ref:{current:number|null})=>{
    if(ref.current!==null){window.clearTimeout(ref.current);ref.current=null;}
  };
  useEffect(()=>()=>{clear(hoverTimer);clear(retractTimer);},[]);
  const scheduleHover=()=>{
    hovered.current=true;
    clear(retractTimer);
    if(pinned||shown)return;
    clear(hoverTimer);
    hoverTimer.current=window.setTimeout(()=>{
      hoverTimer.current=null;
      if(hovered.current)setShown(true);
    },250);
  };
  const leave=()=>{
    hovered.current=false;
    clear(hoverTimer);
    if(!pinned&&shown){
      clear(retractTimer);
      retractTimer.current=window.setTimeout(()=>{
        retractTimer.current=null;
        if(!hovered.current)setShown(false);
      },1000);
    }
  };
  const toggle=()=>{
    clear(hoverTimer);
    clear(retractTimer);
    if(pinned){
      // Unpinning while hovered must not collapse the nameplate.
      setPinned(false);setShown(hovered.current);
    }else{
      setPinned(true);setShown(true);
    }
  };
  const displayName='Player '+String(seat+1).padStart(2,'0');
  return <div
    className={'opponent-seat-tab '+side+(shown?' expanded':'')}
    style={{opacity:shown?1:idleOpacity}}
    onPointerDown={event=>event.stopPropagation()}
    onPointerEnter={scheduleHover} onPointerLeave={leave}>
    <button type="button" className="opponent-seat-tab-button"
      aria-label={displayName+'. Hover to reveal or click to pin.'}
      aria-expanded={shown} aria-pressed={pinned}
      onClick={toggle}>
      <span className="opponent-seat-tab-label">
        <span className="opponent-seat-tab-title">{displayName}</span>
        <span className="opponent-seat-tab-pin">{pinned?'PINNED':'CLICK TO PIN'}</span>
      </span>
      <span className="opponent-seat-tab-grip" aria-hidden="true">{side==='top'?'⌄':'⌃'}</span>
    </button>
  </div>;
}

/** Opponent relations belong to this viewer's local identity, not the
 * shared game/replay. Record keys are numbered seats on the full table. */
function readOpponentRelations(actorId:string):Record<number,OpponentRelation>{
  try{
    const input=JSON.parse(localStorage.getItem('sennet.opponent-relations.v1.'+
      encodeURIComponent(actorId))||'{}') as Record<string,unknown>;
    if(!input||typeof input!=='object'||Array.isArray(input))return {};
    const relations:Record<number,OpponentRelation>={};
    for(let seat=0;seat<12;seat++){
      const value=input[String(seat)];
      if(value==='enemy'||value==='ally')relations[seat]=value;
    }
    return relations;
  }catch{return {};}
}
type EyeView={
  kind:'overview'|'self'|'targeting'|'versus'|'castle';
  opponent:number|null;castleMode?:CastleMode|'focus';
  castleFocusedAlly?:number|null;castleFocusedEnemy?:number|null;
  castleSelectedEnemy?:number|null;
};
const isBattleView=(kind:EyeView['kind'])=>kind==='versus'||kind==='castle';
export default function TableCanvas({diceHoldMs,diceFadeMs,latestAction,canUndo,canRedo,onUndo,onRedo,bookDesign,bookDock,bookOffset,onBookMove,onBookOpen,drawer,wheelMode,state,seat,playerName,actorId,selected,onSelect,onMove,onMoveStack,onMoveSelection,onDrawMat,onOpenTcgSettings,onCardAction,onGestureAction,onRadialAction,mergeOpacity,mergeHoverMs,playmat,diceAppearance,onMergeCenter,onViewChange,coinAppearance,customCoinValue,customCoinText,onCustomCoinText,onCustomCoinValue,onTokenPlace,onTokenAdjust,onDiceThrow,onDiceReroll,onCoinModify,onCoinDuplicate,readonly=false}:Props){
  const [ready,setReady]=useState(false);
  const [diceQuantities,setDiceQuantities]=useState<Record<number,number>>({});
  const selectionReadout=formatDiceSelection(diceQuantities);
  const diceQuantitiesRef=useRef<Record<number,number>>({});
  const [boxClosed,setBoxClosed]=useState<{left:boolean;right:boolean}>(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('sennet.box.closed.v1')||'null');
      return {left:saved?.left===true,right:saved?.right===true};
    }catch{return {left:false,right:false};}
  });
  useEffect(()=>{try{localStorage.setItem('sennet.box.closed.v1',JSON.stringify(boxClosed));}catch{}},[boxClosed]);
  const drawerGroups=useRef(new Map<number,Container>());
  const drawerTabs=useRef(new Map<number,Container>());
  const lastBoxClosed=useRef(boxClosed);
  const toggleBox=(side:-1|1)=>setBoxClosed(previous=>({
    ...previous,[side===-1?'left':'right']:!previous[side===-1?'left':'right']
  }));
  const diceSources=useRef(new Map<number,Container>());
  const diceBadges=useRef(new Map<number,{body:Container;count:Text}>());
  const leftTrayMat=useRef<Container|null>(null);
  const dicePointer=useRef<{pointerId:number;sides:number;startX:number;startY:number;at:number}|null>(null);
  const diceThrowAnimation=useRef<number|null>(null);
  const staticDice3D=useRef<StaticDice3DRenderer|null>(null);
  const staticDiceEntries=useRef<StaticDiePlacement[]>([]);
  const dice3DActive=useRef(false);
  const dice3DStop=useRef<(()=>void)|null>(null);
  const [dice3DError,setDice3DError]=useState<string|null>(null);
  const diceFlying=useRef<Container[]>([]);
  const throwDiceNow=useRef<(sides:number,dx:number,dy:number,elapsed:number)=>void>(()=>{});
  const diceThrowCallback=useRef(onDiceThrow);diceThrowCallback.current=onDiceThrow;
  const diceRerollCallback=useRef(onDiceReroll);diceRerollCallback.current=onDiceReroll;
  const rerollPointer=useRef<{
    pointerId:number;id:string;x:number;y:number;lastX:number;lastY:number;
    at:number;held:boolean;timer:number;piece:Container;
    oldX:number;oldY:number
  }|null>(null);
  const rerollDieNow=useRef<(id:string,x:number,y:number,dx:number,dy:number,elapsed:number)=>void>(()=>{});
  const dieShownAt=useRef(new Map<string,{fingerprint:string;at:number}>());
  const artworkCache=useRef(new Map<string,{img:HTMLImageElement;url:string}>());
  const rollBubbles=useRef(new Map<string,{node:HTMLDivElement;timer:number}>());
  const showRollBubble=useRef<(id:string,result?:string)=>void>(()=>{});
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight});
  // Docked radial follows the actual hand-zone boundary in playmat/world
  // coordinates, not viewport dimensions. Camera zoom is its only scaling.
  // HUD geometry is stored without a React rerender per pan/zoom frame.
  // Only visibility changes need to trigger a React render.
  const [actionScreenVisible,setActionScreenVisible]=useState(false);
  const [playerTagGeometry,setPlayerTagGeometry]=useState({x:0,y:0,scale:1,width:320,outward:'bottom' as 'top'|'bottom'|'left'|'right'});

  const [eyeView,setEyeView]=useState<EyeView>({kind:'overview',opponent:null});
  const viewRef=useRef<EyeView>({kind:'overview',opponent:null});
  const [relations,setRelations]=useState<Record<number,OpponentRelation>>(()=>readOpponentRelations(actorId));
  const relationsRef=useRef(relations);relationsRef.current=relations;
  useEffect(()=>{
    try{localStorage.setItem('sennet.opponent-relations.v1.'+
      encodeURIComponent(actorId),JSON.stringify(relations));}
    catch{/* Local storage unavailable: the current session still works. */}
  },[actorId,relations]);
  const selectView=(next:EyeView)=>{viewRef.current=next;setEyeView(next);};
  const eyeTapHandler=useRef<()=>void>(()=>{});
  const eyeHoldHandler=useRef<()=>void>(()=>{});
  const castleTapHandler=useRef<()=>void>(()=>{});
  const castleHoldHandler=useRef<()=>void>(()=>{});
  const castleFocusHandler=useRef<(seat:number)=>void>(()=>{});
  const preferredCastleMode=useRef<CastleMode>('all');
  const lastCastleAlly=useRef<number|null>(null);
  const previousCastleView=useRef<EyeView>({kind:'self',opponent:null});
  const cycleOpponentHandler=useRef<(direction:'left'|'right',sourceSeat:number)=>void>(()=>{});
  const toggleRelationHandler=useRef<(targetSeat:number,choice:'enemy'|'ally')=>void>(()=>{});
  const focusOpponent=useRef<()=>void>(()=>{});
  const resetCamera=useRef<()=>void>(()=>{});
  const duelLayers=useRef<Map<number,Container>|null>(null);
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const mount=useRef<HTMLDivElement>(null);
  const actionLcdRef=useRef<HTMLDivElement|null>(null);
  const dockedWheelRef=useRef<HTMLDivElement|null>(null);
  const dockedWheelGeometry=useRef({x:0,y:0,size:0});
  const actionScreenLatest=useRef({left:0,y:0,width:0,heightScale:1,visible:false});
  const session=useRef<{app:Application;scene:Container;board:Container}|null>(null);
  const camera=useRef({zoom:MIN_TABLE_ZOOM,panX:0,panY:0});
  const updateView=useRef<()=>void>(()=>{});
  const seatRef=useRef(seat);seatRef.current=seat;
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  // Canvas pan belongs to the pointer that pressed empty space, never to a card drag.
  const panPointer=useRef<{id:number;x:number;y:number}|null>(null);
  const lastView=useRef({x:NaN,y:NaN,scale:NaN});
  const focusMyMat=useRef<()=>void>(()=>{});
  const activeFocusAnimation=useRef<number|null>(null);
  const controlPointer=useRef<number|null>(null);
  const hoverTimers=useRef(new Set<number>());
  const [gestureMenu,setGestureMenu]=useState<{id:string;x:number;y:number;inspect:boolean}|null>(null);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [coinEditing,setCoinEditing]=useState<{x:number;y:number;id?:string}|null>(null);
  const [coinDraft,setCoinDraft]=useState('');
  const [coinSources,setCoinSources]=useState<{values:Record<number,number>;colors:Record<number,string>}>(()=>{
    try{const saved=JSON.parse(localStorage.getItem('sennet.coin.sources.v1')||'null');
      return {values:saved?.values??{},colors:saved?.colors??{}};}
    catch{return {values:{},colors:{}};}
  });
  useEffect(()=>{try{localStorage.setItem('sennet.coin.sources.v1',JSON.stringify(coinSources));}catch{}},[coinSources]);
  const [coinMenu,setCoinMenu]=useState<{type:'source'|'copy';index?:number;id?:string;x:number;y:number}|null>(null);
  const [coinColorsOpen,setCoinColorsOpen]=useState(false);
  const radialCenterHold=useRef<number|null>(null);
  const clearRadialCenterHold=()=>{
    if(radialCenterHold.current!==null){
      window.clearTimeout(radialCenterHold.current);
      radialCenterHold.current=null;
    }
  };
  const coinSourcePress=useRef<{pointerId:number;index:number;x:number;y:number;
    startX:number;startY:number}|null>(null);
  const openCoinMenu=(piece:Container,type:'source'|'copy',id?:string,index?:number)=>{
    const current=session.current;if(!current)return;
    const p=piece.toGlobal(new Point(0,0)),rect=current.app.canvas.getBoundingClientRect();
    setCoinMenu({type,id,index,x:p.x*rect.width/current.app.renderer.width,
      y:p.y*rect.height/current.app.renderer.height});setCoinColorsOpen(false);
  };
  const applyCoinAction=(index:number)=>{
    const m=coinMenu;if(!m)return;
    if(index===5){setCoinColorsOpen(true);return;}
    const increments=[0,1,10,100,1000,0,-1,-10,-100,-1000];
    if(m.type==='copy'&&m.id){
      if(index===0)onCoinDuplicate(m.id);
      else onCoinModify(m.id,{delta:increments[index]});
    }else if(m.type==='source'&&m.index!==undefined){
      const i=m.index;
      if(i!==1){setCoinMenu(null);return;}
      const value=coinSources.values[0]??10;
      const color=coinSources.colors[0]??'#d8b979';
      if(index===0){
        const point=tcgMatWorld(0,
          -TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap+35+i*20,seat);
        onTokenPlace(value,1,point.x,point.y,undefined,color);
      }else{
        const next=Math.max(0,Math.min(9999,value+increments[index]));
        setCoinSources(p=>({...p,values:{...p.values,0:next}}));
      }
    }
    setCoinMenu(null);setCoinColorsOpen(false);
  };
  const applyCoinColor=(color:string)=>{
    const m=coinMenu;
    if(!m||!/^#[0-9a-fA-F]{6}$/.test(color))return;
    if(m.type==='copy'&&m.id)onCoinModify(m.id,{color});
    else if(m.type==='source'&&m.index!==undefined){
      setCoinSources(p=>({...p,colors:{...p.colors,[m.index===1?0:1]:color}}));
    }
    setCoinMenu(null);setCoinColorsOpen(false);
  };
  const selectedSet=useRef(new Set<string>());
  const [dockPosition,setDockPosition]=useState<{x:number;y:number}|null>(()=>{
    try {const saved=JSON.parse(localStorage.getItem('sennet.radial.dock-position.v2')||'null');
      return saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?saved:null;
    } catch {return null;}
  });
  const saveDockPosition=(position:{x:number;y:number})=>{
    const radius=76;
    const next={x:Math.max(radius,Math.min(window.innerWidth-radius,position.x)),
      y:Math.max(radius,Math.min(window.innerHeight-radius,position.y))};
    setDockPosition(next);
    try{localStorage.setItem('sennet.radial.dock-position.v2',JSON.stringify(next));}catch{/* Private browsing. */}
  };
  const [radialWheel,setRadialWheel]=useState<{
    x:number;y:number;size:number;pointerId:number|null;ids:string[];sendTo:boolean
  }|null>(null);
  const radialOpenedAt=useRef(0);
  const radialOpen=useRef(false);
  radialOpen.current=!!radialWheel;
  const wheelPointer=useRef<number|null>(null);
  const showRadialWheel=useRef<(id:string,x:number,y:number,pointerId:number|null)=>void>(()=>{});
  showRadialWheel.current=(id,x,y,pointerId)=>{
    if(wheelMode!=='hold')return;
    const rect=mount.current?.getBoundingClientRect();
    if(!rect)return;
    const size=Math.max(172,Math.min(258,rect.width-12,rect.height-12));
    const pos=wheelPosition(x-rect.left,y-rect.top,rect.width,rect.height,size);
    const ids=selectedSet.current.has(id)?[...selectedSet.current]:[id];
    radialOpenedAt.current=Date.now();
    setRadialWheel({x:pos.x,y:pos.y,size,pointerId,ids,sendTo:false});
    wheelPointer.current=pointerId;
    setGestureMenu(null);
    lastTap.current=null;
  };
  const updateSelection=(ids:string[])=>{
    selectedSet.current=new Set(ids);
    setSelectedIds(ids);
  };
  const lastTap=useRef<{id:string;at:number;x:number;y:number}|null>(null);
  const openGestureMenu=useRef<(id:string,x:number,y:number)=>void>(()=>{});
  openGestureMenu.current=(id,x,y)=>{
    const bounds=mount.current?.getBoundingClientRect();
    if(!bounds)return;
    const menuW=294,menuH=405;
    const left=Math.max(8,Math.min(Math.max(8,bounds.width-menuW-8),x-bounds.left-40));
    const top=Math.max(8,Math.min(Math.max(8,bounds.height-menuH-8),y-bounds.top-40));
    setGestureMenu({id,x:left,y:top,inspect:false});
    lastTap.current=null;
  };
  const callbacks=useRef({onSelect,onMove,onMoveStack,onMoveSelection,onDrawMat,onOpenTcgSettings,onCardAction,onGestureAction,onRadialAction,onMergeCenter,onViewChange,onTokenPlace,onTokenAdjust,onDiceThrow});callbacks.current={onSelect,onMove,onMoveStack,onMoveSelection,onDrawMat,onOpenTcgSettings,onCardAction,onGestureAction,onRadialAction,onMergeCenter,onViewChange,onTokenPlace,onTokenAdjust,onDiceThrow};
  type ActiveDrag={
    id:string;pointerId:number;visual:Container;card:boolean;
    x:number;y:number;startX:number;startY:number;
    startClientX:number;startClientY:number;moved:boolean;
    whole:boolean;held:boolean;wheel:boolean;locked:boolean;selection:boolean;
    stackIds:string[];members:{id:string;x:number;y:number}[];
    coinCenter:boolean;coinAnchor:{x:number;y:number}|null;
    timer:number|null;
  };
  const drag=useRef<ActiveDrag|null>(null);
  const visuals=useRef(new Map<string,Container>());
  const tokenDrag=useRef<{pointerId:number;value:number;sign:1|-1;
    coinText?:string;startX:number;startY:number;mat:Container;ghost:Container;
    ghostEl:HTMLDivElement;color:string}|null>(null);
  const commitCoinEdit=()=>{
    if(validCoinText(coinDraft)){
      if(coinEditing?.id)onCoinModify(coinEditing.id,{coinText:coinDraft});
      else {
        onCustomCoinText(coinDraft);
        const n=coinNumericValue(coinDraft).value;
        if(n>=1&&n<=9999)onCustomCoinValue(n);
      }
    }
    setCoinEditing(null);
  };
  const cancelActiveDrag=useRef<()=>void>(()=>{});
  const snapHighlight=useRef<Graphics|null>(null);
  const currentKind=useRef(state.kind);currentKind.current=state.kind;
  const currentState=useRef(state);currentState.current=state;
  const playmatRef=useRef(playmat);playmatRef.current=playmat;
  showRollBubble.current=(id,explicit)=>{
    const host=mount.current;
    const obj=currentState.current.objects.find(piece=>piece.id===id);
    if(!host||!obj?.throwDice)return;
    const total=obj.sides===2?
      (obj.throwRolls??[]).filter(n=>n===1).length:obj.throwTotal??obj.value??0;
    const line=explicit??(obj.sides===2?
      (obj.throwQuantity??1)===1?(total?'HEADS':'TAILS'):
        total+' Heads / '+((obj.throwQuantity??1)-total)+' Tails':
      'D'+String(obj.sides??6).padStart(2,'0')+'  '+total+
        ((obj.throwQuantity??1)>1?'  ×'+obj.throwQuantity:''));
    const old=rollBubbles.current.get(id);
    if(old){window.clearTimeout(old.timer);old.node.remove();}
    const node=document.createElement('div');
    node.className='sennet-dice-result-bubble';
    node.textContent=line;node.setAttribute('role','status');
    node.setAttribute('aria-label','Die result: '+line);
    host.appendChild(node);
    // Position the popup BEFORE its first animation frame. Previously it
    // began at 0,0 until the next Pixi ticker, so it often flashed outside
    // the die or appeared invisible during the render handoff.
    const piece=visuals.current.get(id),app=session.current?.app;
    if(piece&&!piece.destroyed&&app){
      const pos=piece.toGlobal(new Point(0,0));
      const rect=app.canvas.getBoundingClientRect();
      const x=pos.x*rect.width/app.renderer.width;
      const y=pos.y*rect.height/app.renderer.height;
      const edge=piece.toGlobal(new Point(1,0));
      const sc=Math.hypot(edge.x-pos.x,edge.y-pos.y);
      node.style.left=x+'px';
      node.style.top=(y-27*Math.max(.6,Math.min(1.5,sc)))+'px';
    }
    const timer=window.setTimeout(()=>{
      node.remove();
      if(rollBubbles.current.get(id)?.node===node)rollBubbles.current.delete(id);
    },2800);
    rollBubbles.current.set(id,{node,timer});
  };

  const oldLocations=useRef(new Map<string,{x:number;y:number}>());
  const animations=useRef<number[]>([]);

  /** Roll all selected denominations simultaneously using one visible body
   * per type. Extra copies are sampled fairly but represented by one die.
   * Game results are committed only after the bodies physically settle. */
  throwDiceNow.current=(pressed,dx,dy,elapsed)=>{
    const current=session.current,host=mount.current;
    if(!current||!host||currentState.current.kind!=='tcg'||dice3DActive.current)return;
    const selected={...diceQuantitiesRef.current};
    if(!selected[pressed])selected[pressed]=1;
    const types=DICE_TYPES.filter(sides=>(selected[sides]??0)>0);
    const mat=leftTrayMat.current;
    if(!mat||!types.length)return;
    const {app,board}=current;
    const rect=app.canvas.getBoundingClientRect();
    const sx=rect.width/app.renderer.width,sy=rect.height/app.renderer.height;
    if(rect.width<=0||rect.height<=0)return;
    const convert=(point:{x:number;y:number})=>({x:point.x*sx,y:point.y*sy});
    const origin=tcgMatOrigin(seatRef.current);
    const top=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
    const distance=TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3;
    const trays=[-1,1].map(side=>{
      const x=side*distance,w=TCG_MAT.cardWidth/2+4;
      const corners=[new Point(x-w,top-5),new Point(x+w,top-5),
        new Point(x+w,TCG_MAT_HEIGHT/2+5),new Point(x-w,TCG_MAT_HEIGHT/2+5)]
        .map(p=>convert(mat.toGlobal(p)));
      return {left:Math.min(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),
        right:Math.max(...corners.map(p=>p.x)),bottom:Math.max(...corners.map(p=>p.y))};
    });
    const sources=types.map(sides=>{
      const p=diceSources.current.get(sides)?.toGlobal(new Point(0,0))??
        mat.toGlobal(new Point(-distance,top+40));
      const origin=diceSources.current.get(sides);
      const edge=origin?.toGlobal(new Point(1,0))??new Point(p.x+1,p.y);
      const scale=Math.hypot(edge.x-p.x,edge.y-p.y)*Math.max(sx,sy);
      return {sides,quantity:selected[sides],
        scale,themeId:resolveDiceTheme(diceAppearance,sides),...convert(p)};
    });
    const obstacles=[...visuals.current.entries()].filter(([id])=>{
      const obj=currentState.current.objects.find(o=>o.id===id);
      return !!obj&&(obj.tokenCoin||obj.throwDice||obj.kind==='die');
    }).slice(-60).map(([,visual])=>convert(visual.toGlobal(new Point(0,0))));
    diceQuantitiesRef.current={};setDiceQuantities({});
    for(const sides of DICE_TYPES)staticDice3D.current?.setSourceQuantity(sides,0);
    for(const {body,count} of diceBadges.current.values()){
      body.children[0].visible=false;count.text='';
    }
    setDice3DError(null);dice3DActive.current=true;
    // Independent 3D viewport: no WebGL physics/rendering overhead while
    // playing cards or editing Sennet's 2D tabletop.
    import('../lib/Dice3D').then(({roll3DDice})=>{
      if(session.current?.app!==app){dice3DActive.current=false;return;}
      try{
        const beforePaint=staticDice3D.current?.getRenderedRevision()??0;
        const d=roll3DDice({host,width:rect.width,height:rect.height,
          canHandoff:()=> (staticDice3D.current?.getRenderedRevision()??0)>beforePaint,
          sources,aimX:dx,aimY:dy,durationMs:elapsed,trays,obstacles,
          done:results=>{
            dice3DActive.current=false;dice3DStop.current=null;
            if(session.current?.app!==app)return;
            const parent=duelLayers.current?.get(seatRef.current)??board;
            const throws=results.map(result=>{
              const point=parent.toLocal(new Point(result.x/sx,result.y/sy),app.stage);
              return {sides:result.sides,rolls:result.rolls,
                x:Math.max(0,Math.min(BOARD_W,point.x)),
                y:Math.max(0,Math.min(BOARD_W,point.y)),
                rotation:((result.rotation%360)+360)%360,
                quaternion:result.quaternion,altitude:result.altitude};
            });
            diceThrowCallback.current(throws);
          }});
        dice3DStop.current=d;
      }catch(err){
        dice3DActive.current=false;dice3DStop.current=null;
        setDice3DError('3D dice need WebGL support. '+String(err));
      }
    }).catch(err=>{
      dice3DActive.current=false;dice3DStop.current=null;
      setDice3DError('Could not load the 3D dice engine: '+String(err));
    });
    void origin;
  };
  rerollDieNow.current=(id,cursorX,cursorY,dx,dy,elapsed)=>{
    if(dice3DActive.current)return;
    const current=session.current,host=mount.current;
    const die=currentState.current.objects.find(o=>o.id===id);
    const visual=visuals.current.get(id);
    if(!current||!host||!die?.throwDice||!visual||die.locked)return;
    const {app,board}=current,rect=app.canvas.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const sx=rect.width/app.renderer.width,sy=rect.height/app.renderer.height;
    const pos=visual.toGlobal(new Point(0,0));
    // Screen-space cursor release is authoritative; never use the die's
    // old position or an arbitrary center-of-screen destination.
    const start={x:cursorX-rect.left,y:cursorY-rect.top};
    const edge=visual.toGlobal(new Point(1,0));
    const scale=Math.hypot(edge.x-pos.x,edge.y-pos.y)*Math.max(sx,sy);
    const origin=tcgMatOrigin(seatRef.current);
    const trayTop=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
    const distance=TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3;
    const toScreen=(p:Point)=>({x:p.x*sx,y:p.y*sy});
    const mat=new Container();
    mat.position.set(origin.x,origin.y);mat.rotation=origin.angle;
    // Source tray geometry must use the same transformed seat mat.
    const cameraMat=leftTrayMat.current;
    const trays=[-1,1].map(side=>{
      const x=side*distance,w=TCG_MAT.cardWidth/2+4;
      const corners=[new Point(x-w,trayTop-5),new Point(x+w,trayTop-5),
        new Point(x+w,TCG_MAT_HEIGHT/2+5),new Point(x-w,TCG_MAT_HEIGHT/2+5)]
        .map(p=>toScreen((cameraMat??board).toGlobal(p)));
      return {left:Math.min(...corners.map(p=>p.x)),
        right:Math.max(...corners.map(p=>p.x)),
        top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
    });
    const obstacles=[...visuals.current.entries()].filter(([otherId])=>{
      const other=currentState.current.objects.find(o=>o.id===otherId);
      return otherId!==id&&!!other&&(other.tokenCoin||other.throwDice||other.kind==='die');
    }).slice(-70).map(([,piece])=>toScreen(piece.toGlobal(new Point(0,0))));
    const parent=visual.parent??board;
    dice3DActive.current=true;setDice3DError(null);
    // Hide the old mesh only once airborne physics is initialized.
    import('../lib/Dice3D').then(({roll3DDice})=>{
      if(session.current?.app!==app){dice3DActive.current=false;return;}
      try{
        visual.visible=false;
        const beforePaint=staticDice3D.current?.getRenderedRevision()??0;
        const stop=roll3DDice({host,width:rect.width,height:rect.height,
          canHandoff:()=> (staticDice3D.current?.getRenderedRevision()??0)>beforePaint,
          sources:[{sides:die.sides??6,quantity:die.throwQuantity??1,
            themeId:resolveDiceTheme(diceAppearance,die.sides??6),scale,...start}],
          aimX:dx,aimY:dy,durationMs:elapsed,
          reroll:true,trays,obstacles,
          done:results=>{
            dice3DActive.current=false;dice3DStop.current=null;
            if(session.current?.app!==app)return;
            const result=results[0];
            dieShownAt.current.set(id,{fingerprint:'reroll-in-progress',at:Date.now()});
            const at=parent.toLocal(new Point(result.x/sx,result.y/sy),app.stage);
            diceRerollCallback.current(id,result.rolls,
              Math.max(0,Math.min(BOARD_W,at.x)),
              Math.max(0,Math.min(BOARD_W,at.y)),
              ((result.rotation%360)+360)%360,result.quaternion,result.altitude);
            if(!visual.destroyed)visual.visible=true;
          }});
        dice3DStop.current=stop;
      }catch(error){
        dice3DActive.current=false;dice3DStop.current=null;
        visual.position.set(die.x,die.y);visual.visible=true;
        setDice3DError('3D reroll unavailable: '+String(error));
      }
    }).catch(error=>{
      dice3DActive.current=false;dice3DStop.current=null;
      if(!visual.destroyed){
        visual.position.set(die.x,die.y);visual.visible=true;
      }
      setDice3DError('3D reroll unavailable: '+String(error));
    });
  };

  const addDiceCount=(sides:number)=>{
    if(diceThrowAnimation.current!==null||dice3DActive.current)return;
    const next=Math.min(20,(diceQuantitiesRef.current[sides]??0)+1);
    diceQuantitiesRef.current={...diceQuantitiesRef.current,[sides]:next};
    setDiceQuantities({...diceQuantitiesRef.current});
    staticDice3D.current?.setSourceQuantity(sides,next);
    const badge=diceBadges.current.get(sides);
    if(badge){
      badge.body.children[0].visible=true;badge.count.text='×'+next;
    }
    if(next===20){
      const source=diceSources.current.get(sides);
      const mat=leftTrayMat.current,from=source?.toGlobal(new Point(0,0));
      const into=mat?.toGlobal(new Point(-TCG_MAT_WIDTH/2+115,-TCG_MAT_HEIGHT/2+125));
      throwDiceNow.current(sides,(into?.x??0)-(from?.x??-100),
        (into?.y??0)-(from?.y??0),220);
    }
  };

  useEffect(()=>{
    let disposed=false;let resizeObserver:ResizeObserver|undefined;
    const app=new Application();
    (async()=>{
      await app.init({width:BOARD_W,height:BOARD_W,backgroundColor:0x101e1d,antialias:true,resolution:Math.min(window.devicePixelRatio||1,2),preference:'webgl',autoDensity:true});
      if(disposed){app.destroy(true);return;}
      const scene=new Container(),board=new Container();board.position.set(BOARD_CENTER,BOARD_CENTER);board.pivot.set(BOARD_CENTER,BOARD_CENTER);
      scene.addChild(board);app.stage.addChild(scene);mount.current?.appendChild(app.canvas);
      session.current={app,scene,board};setReady(true);
      let lastWidth=0,lastHeight=0;
      const rescale=()=>{
        if(!mount.current)return;
        const w=Math.max(100,mount.current.clientWidth),h=Math.max(100,mount.current.clientHeight);
        // Zoom and pan never resize the GPU framebuffer. Resizing is only
        // necessary when the actual viewport dimensions have changed.
        if(w!==lastWidth||h!==lastHeight){
          app.renderer.resize(w,h);lastWidth=w;lastHeight=h;
          setViewport(previous=>previous.width===w&&previous.height===h
            ?previous:{width:w,height:h});
        }
        const fit=Math.min(w/(TABLE_VIEW_RADIUS*2),h/(TABLE_VIEW_RADIUS*2));
        const c=camera.current,scale=fit*c.zoom;
        // The startup view is a hard camera boundary. Any pointer, wheel,
        // touchpad or pinch gesture can only reveal space already visible
        // when the full table is fitted to the viewport.
        const bounded=clampTablePan(c.panX,c.panY,c.zoom,w,h);
        c.panX=bounded.panX;c.panY=bounded.panY;
        scene.scale.set(scale);
        scene.position.set(w/2-BOARD_CENTER*scale+c.panX,h/2-BOARD_CENTER*scale+c.panY);
        const hand=tcgMatCells(seatRef.current).find(cell=>cell.row===3&&cell.column===1);
        if(hand){
          const bottom=new Point(
            hand.x-Math.sin(hand.angle)*hand.height/2,
            hand.y+Math.cos(hand.angle)*hand.height/2
          );
          const projected=(duelLayers.current?.get(seatRef.current)??board).toGlobal(bottom);
          const next={x:projected.x,y:projected.y,size:TCG_MAT_WIDTH*.30*scale};
          dockedWheelGeometry.current=next;
          const dock=dockedWheelRef.current;
          if(dock){
            // Constant 180-unit wheel; a single CSS transform applies the
            // same camera scale and translation as the Pixi playmat.
            const factor=next.size/180;
            dock.style.transform=`translate3d(${next.x-90*factor}px,${next.y}px,0) scale(${factor})`;
          }
          // Keep the LCD immediately below the playmat. Its LEFT edge
          // projects from the real playmat edge; its RIGHT edge meets the
          // leftmost point of the docked half-radial. Recalculate both using
          // the same Pixi camera transform on every zoom/pan/seat change.
          const parent=duelLayers.current?.get(seatRef.current)??board;
          const panelY=actionScreenContactCenter(TCG_MAT_HEIGHT);
          const matLeft=tcgMatWorld(-TCG_MAT_WIDTH/2,panelY,seatRef.current);
          const matRight=tcgMatWorld(TCG_MAT_WIDTH/2,panelY,seatRef.current);
          const anchor=tcgMatWorld(0,panelY,seatRef.current);
          const screen=parent.toGlobal(new Point(anchor.x,anchor.y));
          const projectedLeft=parent.toGlobal(new Point(matLeft.x,matLeft.y));
          const projectedRight=parent.toGlobal(new Point(matRight.x,matRight.y));
          const matScreenWidth=Math.hypot(
            projectedRight.x-projectedLeft.x,projectedRight.y-projectedLeft.y);
          const display=fitActionScreenToWheel(
            projectedLeft.x,projectedRight.x,projected.x,next.size,
            screen.y,matScreenWidth/TCG_MAT_WIDTH);
          actionScreenLatest.current=display;
          if(actionLcdRef.current){
            const lcd=actionLcdRef.current;
            lcd.style.left=display.left+'px';
            lcd.style.top=display.y+'px';
            lcd.style.width=(display.width/Math.max(.0001,display.heightScale))+'px';
            lcd.style.transform=`translateY(-50%) scale(${display.heightScale})`;
          }
          setActionScreenVisible(previous=>previous===display.visible?previous:display.visible);
        }

        // Do not wait for the throttled animation ticker to catch the 3D
        // die geometry up with a mouse/touchpad camera move.
        staticDice3D.current?.sync(true);
        const angle=-Math.PI/2+seatRef.current*Math.PI/6;
        const localChair=new Point(BOARD_CENTER+(TABLE_APOTHEM+34)*Math.cos(angle),
          BOARD_CENTER+(TABLE_APOTHEM+34)*Math.sin(angle));
        // Seat tags belong to the TABLE, never the dynamically transformed playmat layers.
        // Player labels belong exclusively to the physical table, never to
        // Castle/Eye opponent or viewer playmat layers.
        const point=board.toGlobal(localChair);
        const tableCenter=board.toGlobal(new Point(BOARD_CENTER,BOARD_CENTER));
        const dx=point.x-tableCenter.x,dy=point.y-tableCenter.y;
        const outward=Math.abs(dx)>Math.abs(dy)?(dx>0?'right' as const:'left' as const):(dy>0?'bottom' as const:'top' as const);
        const width=2*TABLE_APOTHEM*Math.tan(Math.PI/12)*scale;
        setPlayerTagGeometry(previous=>Math.abs(previous.x-point.x)<.05&&Math.abs(previous.y-point.y)<.05&&Math.abs(previous.scale-scale)<.00001&&Math.abs(previous.width-width)<.05&&previous.outward===outward?previous:{x:point.x,y:point.y,scale,width,outward});
        if(callbacks.current.onViewChange&&
          (Math.abs(lastView.current.x-point.x)>.4||
           Math.abs(lastView.current.y-point.y)>.4||
           Math.abs(lastView.current.scale-scale)>1e-5)){
          lastView.current={x:point.x,y:point.y,scale};
          callbacks.current.onViewChange({x:point.x,y:point.y,scale});
        }
      };
      updateView.current=rescale;
      resizeObserver=new ResizeObserver(()=>{
        const oldW=lastWidth,oldH=lastHeight;
        rescale();
        // Preserve complete PLAY 03 circle visibility after resizing,
        // not just when Eye/Castle is initially activated.
        if((lastWidth!==oldW||lastHeight!==oldH)&&
          (viewRef.current.kind==='versus'||viewRef.current.kind==='castle')){
          requestAnimationFrame(()=>focusOpponent.current());
        }
      });
      resizeObserver.observe(mount.current!);rescale();
    })().catch(err=>console.error('PixiJS initialization failed',err));
    return()=>{disposed=true;resizeObserver?.disconnect();cancelActiveDrag.current();
      for(const timer of hoverTimers.current)window.clearTimeout(timer);
      hoverTimers.current.clear();
      if(activeFocusAnimation.current!==null)cancelAnimationFrame(activeFocusAnimation.current);
      staticDice3D.current?.destroy();staticDice3D.current=null;
      for(const {img} of artworkCache.current.values()){
        img.onload=null;img.onerror=null;img.remove();
      }
      artworkCache.current.clear();
      for(const bubble of rollBubbles.current.values()){
        window.clearTimeout(bubble.timer);bubble.node.remove();
      }
      rollBubbles.current.clear();
      if(rerollPointer.current){
        window.clearTimeout(rerollPointer.current.timer);
        rerollPointer.current=null;
      }
      dice3DStop.current?.();dice3DStop.current=null;dice3DActive.current=false;
      if(diceThrowAnimation.current!==null)cancelAnimationFrame(diceThrowAnimation.current);
      for(const flying of diceFlying.current)if(!flying.destroyed)flying.destroy({children:true});
      diceFlying.current=[];dicePointer.current=null;
      session.current=null;try{app.destroy(true);}catch{/* init may still be in flight */}};
  },[]);
  useEffect(()=>{
    const current=session.current;
    if(!current)return;
    const {app,board}=current;
    animations.current.forEach(id=>cancelAnimationFrame(id));animations.current=[];
    for(const timer of hoverTimers.current)window.clearTimeout(timer);
    hoverTimers.current.clear();
    board.removeChildren().forEach(child=>child.destroy({children:true}));
    diceSources.current.clear();diceBadges.current.clear();leftTrayMat.current=null;
    drawerGroups.current.clear();drawerTabs.current.clear();
    visuals.current.clear();
    snapHighlight.current=null;
    board.rotation=viewerTableRotation(seat);
    const paintLayers=createTablePaintLayers();
    const seatGroups=drawBackground(board,paintLayers,state,seat,playerName,readonly,mergeOpacity,mergeHoverMs,
      (target,boundary,merged)=>callbacks.current.onMergeCenter(target,boundary,merged),
      ()=>eyeTapHandler.current(),()=>eyeHoldHandler.current(),
      ()=>castleTapHandler.current(),()=>castleHoldHandler.current(),
      ()=>callbacks.current.onOpenTcgSettings(),
       (direction,sourceSeat)=>cycleOpponentHandler.current(direction,sourceSeat),
      (targetSeat,choice)=>toggleRelationHandler.current(targetSeat,choice),
      targetSeat=>castleFocusHandler.current(targetSeat),
      id=>{controlPointer.current=id;},hoverTimers.current,playmat,
      bookDesign,bookDock,bookOffset,onBookOpen,onBookMove,
      eyeView.kind==='versus'||eyeView.kind==='castle'?eyeView.opponent:null,
      eyeView.kind==='castle',eyeView.castleMode??preferredCastleMode.current,
      preferredCastleMode.current,
      {ally:eyeView.castleFocusedAlly??null,enemy:eyeView.castleFocusedEnemy??null},
      viewport,relations,250,eyeView.castleSelectedEnemy??null,
      boxClosed,drawerGroups.current,drawerTabs.current,toggleBox);
    duelLayers.current=seatGroups;
    updateView.current();
    const snapOverlay=new Graphics();snapOverlay.eventMode='none';board.addChild(snapOverlay);
    paintLayers.objects.attach(snapOverlay);snapHighlight.current=snapOverlay;
    // Every TCG seat has its own physical DECK pocket; sending a card
    // to the top/bottom via gestures must not leave an extra visible card
    // because its source ID uses a different prefix than that deck.
    const pileKey=(o:TableObject)=>state.kind==='tcg'?
      'seat-'+String(o.matSeat??seat):o.id.split('-')[0];
    const deckTop=new Map<string,TableObject>();
    for(const o of state.objects.filter(o=>o.zone==='DECK').sort((a,b)=>a.order-b.order))
      if(!deckTop.has(pileKey(o)))deckTop.set(pileKey(o),o);
    const byId=new Map(state.objects.map(o=>[o.id,o]));
    const visible=state.objects.filter(o=>{
      // Carried tokens remain attached to cards in hands and decks, but a
      // hidden carrier must never leave floating coins exposed on the table.
      let ancestor=o;
      for(let n=0;ancestor.carrierId&&n<state.objects.length;n++){
        const parent=byId.get(ancestor.carrierId);
        if(!parent||parent.zone==='DECK'||(parent.zone==='HAND'&&
          parent.owner!==actorId&&parent.owner!=='local'))return false;
        ancestor=parent;
      }
      return o.zone!=='DECK'||deckTop.get(pileKey(o))?.id===o.id;
    });
    // Draw lower stack-order cards first, so a wheel Shuffle visibly
    // changes which overlapping card sits on top, without disrupting
    // object ordering elsewhere on the table.
    const drawGroup=(o:TableObject)=>[o.zone,o.matSeat??-1,
      Math.round(o.x*10),Math.round(o.y*10)].join(':');
    const footprint=(o:TableObject)=>(o.kind==='card'||o.kind==='deck'?62*88:
      o.kind==='board'?310*206:52*52)*Math.pow(o.scale??1,2);
    const ancestry=(o:TableObject):number=>{
      let depth=0,current=o,guard=0;
      while(current.carrierId&&guard++<state.objects.length){
        const parent=state.objects.find(item=>item.id===current.carrierId);
        if(!parent)break;
        depth++;current=parent;
      }
      return depth;
    };
    visible.sort((a,b)=>{
      if(a.kind==='board'||b.kind==='board')
        return Number(a.kind!=='board')-Number(b.kind!=='board');
      // Descendants render over carriers; otherwise smaller objects always
      // sit above bigger cards, including half-size cards and tokens.
      const da=ancestry(a),db=ancestry(b);
      if(da!==db)return da-db;
      const area=footprint(b)-footprint(a);
      if(Math.abs(area)>1)return area;
      return drawGroup(a)===drawGroup(b)?a.order-b.order:0;
    });
    // Selection contains only currently existing, visible members; never
    // allow a stale deleted card ID into a later wheel action.
    const validIds=new Set(state.objects.map(o=>o.id));
    if([...selectedSet.current].some(id=>!validIds.has(id))){
      const still=[...selectedSet.current].filter(id=>validIds.has(id));
      selectedSet.current=new Set(still);
      queueMicrotask(()=>setSelectedIds(still));
    }
    const staticEntries:StaticDiePlacement[]=[];
    for(const id of [...dieShownAt.current.keys()]){
      if(!state.objects.some(object=>object.id===id))dieShownAt.current.delete(id);
    }
    const coinLayers:{piece:Container;el:HTMLDivElement}[]=[];
    const showCoinAboveArtwork=(piece:Container,value:number|string,sign:1|-1,source:boolean,color='#d8b979',editable=false)=>{
      const el=coinDomVisual(value,sign,source,coinAppearance,color,editable);
      mount.current?.appendChild(el);
      coinLayers.push({piece,el});
      return el;
    };
    // The LEFT box is a permanent dice/coin rack. The first gesture on a
    // source counts it; dragging a source instead throws ALL selected types.
    // Quantities update without rebuilding the Pixi scene or disturbing cards.
    if(state.kind==='tcg'){
      const mat=drawerGroups.current.get(-1);
      if(!mat)throw new Error('Left drawer is missing');
      leftTrayMat.current=mat;
      const boxX=-(TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3);
      const top=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
      const slots=diceRackLocations(boxX,top);
      DICE_TYPES.forEach((sides,index)=>{
        const source=new Container();
        // The source belongs inside this drawer; a closed drawer never
        // leaks an unattached high-priority object through the playmat.
        source.visible=!boxClosed.left;
        // Fixed, real drawer-relative coordinates. Zooming and changing
        // the camera never edits these physical positions.
        source.position.set(slots[index].x,slots[index].y);
        const badge=diceQuantitiesRef.current[sides]??0;
        const face=makeDie(sides,undefined,badge);
        source.addChild(face);
        const name=label(diceLabel(sides),8,0xffedbe,'bold');
        name.position.set(0,18);
        source.addChild(name);
        // Live-updated badge is a separate child so click counting does
        // not create a new scene or interrupt another piece's drag.
        const quantity=new Container();
        const count=label(badge?'×'+badge:'',11,0xfff6d2,'bold');
        const backing=new Graphics().roundRect(-14,-8,28,17,7)
          .fill({color:0x15373a,alpha:.97})
          .stroke({color:0xcfece5,alpha:.85,width:1.1});
        backing.visible=badge>0;
        quantity.addChild(backing);quantity.addChild(count);
        quantity.position.set(0,0);
        // The visible count is rendered by the 3D overlay above the mesh.
        quantity.visible=false;
        quantity.eventMode='none';
        source.addChild(quantity);
        diceBadges.current.set(sides,{body:quantity,count});
        mat.addChild(source);paintLayers.objects.attach(source);
        diceSources.current.set(sides,source);
        staticEntries.push({id:'source-'+sides,piece:source,sides,source:true,
          drawerClosed:boxClosed.left,
          quantity:badge,themeId:resolveDiceTheme(diceAppearance,sides)});
        if(readonly)return;
        source.eventMode='static';source.cursor='grab';
        source.hitArea=new Circle(0,0,11);
        // A die's physical size must never change just because the pointer
        // enters its hit area. Use the native cursor, not hover zoom.
        source.on('pointerover',()=>{source.cursor='grab';});
        source.on('pointerout',()=>{source.cursor='grab';});
        source.on('pointerdown',e=>{
          if(e.button!==0)return;
          e.stopPropagation();
          controlPointer.current=e.pointerId;
          dicePointer.current={
            pointerId:e.pointerId,sides,startX:e.clientX,startY:e.clientY,at:performance.now()
          };
        });
      });
    }
    // Fixed, interactive source coins live inside the *local* right tray.
    // Their Pixi transform follows the mat in all three camera modes.
    if(state.kind==='tcg'){
      const mat=drawerGroups.current.get(1);
      if(!mat)throw new Error('Right drawer is missing');
      // Exactly two permanent sources: adjustable standard and entry-only Custom.
      const values=[coinNumericValue(customCoinText).value,coinSources.values[0]??10];
      const faces=[customCoinText,String(values[1])];
      const boxX=TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3;
      const top=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
      values.forEach((value,index)=>{
        const source=new Container();
        source.visible=!boxClosed.right;
        source.position.set(boxX,top+58+index*86);
        const isEditable=index===0;
        const color=coinSources.colors[isEditable?1:0]??(isEditable?'#c4d8d9':'#d8b979');
        source.addChild(makeCoin(isEditable?faces[index]:value,coinAppearance,true,1,color,isEditable));
        const highlight=new Graphics();
        highlight.scale.set(coinAppearance.size*1.08);
        highlight.eventMode='none';source.addChild(highlight);
        mat.addChild(source);
        paintLayers.objects.attach(source);
        const coinOverlay=showCoinAboveArtwork(source,isEditable?faces[index]:value,1,true,color,isEditable);
        if(readonly)return;
        source.eventMode='static';source.cursor='pointer';
        source.hitArea=new Circle(0,0,17.5*coinAppearance.size*1.08);
        const sideAt=(global:Point):1|-1|0=>{
          const here=source.toLocal(global);
          if(Math.hypot(here.x,here.y)<=Math.max(5,10.3*coinAppearance.size*1.08))return 0;
          return here.y<0?1:-1;
        };
        const highlightSide=(global:Point)=>{
          const side=sideAt(global);
          coinHighlight(highlight,side);
          coinOverlay.dataset.hover=String(side);
        };
        source.on('pointerover',e=>highlightSide(e.global));
        source.on('pointermove',e=>highlightSide(e.global));
        source.on('pointerout',()=>{
          coinHighlight(highlight,0);
          coinOverlay.dataset.hover='0';
        });
        source.on('pointerdown',e=>{
          if(e.button!==0)return;
          e.stopPropagation();
          controlPointer.current=e.pointerId;
          const sign=sideAt(e.global);
          if(sign===0){
            // Center-only click: white opens value editor, bronze opens radial.
            // Any movement cancels; no long-press or tray movement.
            const projected=source.toGlobal(new Point(0,0));
            const rect=app.canvas.getBoundingClientRect();
            coinSourcePress.current={pointerId:e.pointerId,index,
              x:projected.x*rect.width/app.renderer.width,
              y:projected.y*rect.height/app.renderer.height,
              startX:e.clientX,startY:e.clientY};
            return;
          }
          const ghost=makeCoin(isEditable?faces[index]:value,coinAppearance,false,sign,color,isEditable);
          ghost.visible=false;ghost.alpha=.85;mat.addChild(ghost);
          paintLayers.objects.attach(ghost);
          const ghostEl=showCoinAboveArtwork(ghost,isEditable?faces[index]:value,sign,false,color,isEditable);
          tokenDrag.current={pointerId:e.pointerId,value,sign,
            ...(isEditable?{coinText:faces[index]}:{}),
            startX:e.clientX,startY:e.clientY,mat,ghost,ghostEl,color};
        });
      });
    }
    // Slide actual contents behind the stationary mat stencil. The
    // outermost wall stays exposed and clickable even when closed.
    for(const side of [-1,1]){
      const body=drawerGroups.current.get(side);
      if(!body)continue;
      const closed=side===-1?boxClosed.left:boxClosed.right;
      const wasClosed=side===-1?lastBoxClosed.current.left:lastBoxClosed.current.right;
      // Drawer artwork is trayW + 24 wide, starts 3 units off the mat,
      // and extends 77 units out. Retract 67 => a 10-unit wooden lip.
      const shift=-side*(TCG_MAT.cardWidth+5);
      if(closed===wasClosed){
        body.position.x=closed?shift:0;
      }else{
        const start=performance.now(),duration=245;
        body.position.x=wasClosed?shift:0;
        const animate=(now:number)=>{
          if(body.destroyed)return;
          const t=Math.min(1,(now-start)/duration);
          const ease=1-Math.pow(1-t,3);
          body.position.x=(wasClosed?shift:0)+
            ((closed?shift:0)-(wasClosed?shift:0))*ease;
          if(t<1)animations.current.push(requestAnimationFrame(animate));
        };
        animations.current.push(requestAnimationFrame(animate));
      }
    }
    lastBoxClosed.current=boxClosed;
    // Use browser <img> elements for actual card art, just like the Deck
    // Builder. Third-party card art often disallows WebGL/CORS texture uploads
    // even while rendering perfectly in an ordinary HTML image.
    const artLayers:{piece:Container;img:HTMLImageElement}[]=[];
    const visibleArtworkIds=new Set<string>();
    const imagesRoot=mount.current;
    const syncCardArtwork=()=>{
      const root=mount.current;
      if(!root||!session.current)return;
      const rect=session.current.app.canvas.getBoundingClientRect();
      const sx=rect.width/session.current.app.screen.width;
      const sy=rect.height/session.current.app.screen.height;
      for(const {piece,img} of artLayers){
        if(piece.destroyed||!img.isConnected)continue;
        const p=piece.toGlobal(new Point(0,0));
        const right=piece.toGlobal(new Point(1,0));
        const down=piece.toGlobal(new Point(0,1));
        const aa=(right.x-p.x)*sx,bb=(right.y-p.y)*sy;
        const cc=(down.x-p.x)*sx,dd=(down.y-p.y)*sy;
        // Artwork is precisely the card body's width/height and follows
        // every Pixi camera/mat/seat/selection transform.
        const tx=p.x*sx-31*aa-44*cc;
        const ty=p.y*sy-31*bb-44*dd;
        img.style.transform=`matrix(${aa},${bb},${cc},${dd},${tx},${ty})`;
      }
      // A separate DOM layer at z-index 6 keeps every coin above every
      // imported card image (z-index 5), even during camera or card motion.
      for(const {piece,el} of coinLayers){
        if(piece.destroyed||!el.isConnected)continue;
        let visible=true,ancestor:Container|null=piece;
        while(ancestor){
          if(!ancestor.visible||
            ancestor===drawerGroups.current.get(-1)&&boxClosed.left||
            ancestor===drawerGroups.current.get(1)&&boxClosed.right){
            visible=false;break;
          }
          ancestor=ancestor.parent;
        }
        if(!visible){el.style.display='none';continue;}
        el.style.display='block';
        const p=piece.toGlobal(new Point(0,0));
        const right=piece.toGlobal(new Point(1,0));
        const down=piece.toGlobal(new Point(0,1));
        const aa=(right.x-p.x)*sx,bb=(right.y-p.y)*sy;
        const cc=(down.x-p.x)*sx,dd=(down.y-p.y)*sy;
        const tx=p.x*sx-18*aa-18*cc;
        const ty=p.y*sy-18*bb-18*dd;
        el.style.transform=`matrix(${aa},${bb},${cc},${dd},${tx},${ty})`;
      }
      staticDice3D.current?.sync();
      for(const [id,bubble] of rollBubbles.current){
        const piece=visuals.current.get(id);
        if(!piece||piece.destroyed){
          bubble.node.style.display='none';
          continue;
        }
        const pos=piece.toGlobal(new Point(0,0));
        const rect=app.canvas.getBoundingClientRect();
        const x=pos.x*rect.width/app.renderer.width;
        const y=pos.y*rect.height/app.renderer.height;
        bubble.node.style.left=x+'px';
        bubble.node.style.top=(y-27*Math.max(.6,Math.min(1.5,Math.hypot(
          piece.toGlobal(new Point(1,0)).x-pos.x,
          piece.toGlobal(new Point(1,0)).y-pos.y))))+'px';
        bubble.node.style.display='block';
      }
    };
    session.current?.app.ticker.add(syncCardArtwork);
    for(const obj of visible){
      const assumedOwner=obj.matSeat??
        (obj.owner===actorId||obj.owner==='local'?seat:
          state.players.find(p=>p.id===obj.owner)?.seat)??
        (state.kind==='tcg'?tcgSnapPoint(obj.x,obj.y,state.centerMerges,true)?.seat:undefined);
      if(seatGroups&&!seatGroups.has(assumedOwner??-1))continue;
      const piece=createPiece(obj,obj.id===selected||selectedSet.current.has(obj.id),coinAppearance);
      visuals.current.set(obj.id,piece);
      if(drag.current?.id===obj.id){
        drag.current.visual=piece;
        if(drag.current.whole)markHeldStack(piece,drag.current.members.length);
      }
      // An owned piece faces its owner's seat; the remaining pieces face the local viewer.
      const ownerSeat=assumedOwner;
      piece.rotation=playerSeatRotation(ownerSeat??seat)+obj.rotation*Math.PI/180;
      piece.scale.set(obj.scale??1);
      (seatGroups?.get(ownerSeat??-1)??board).addChild(piece);
      paintLayers.objects.attach(piece);
      if(obj.tokenCoin)showCoinAboveArtwork(piece,obj.coinText??obj.value??1,obj.tokenSign??1,false,obj.color,obj.coinText!==undefined);
      if(obj.throwDice){
        const heads=(obj.throwRolls??[]).filter(n=>n===1).length;
        const display=obj.sides===2?((obj.throwQuantity??1)===1?(heads?'H':'T'):
          heads+'H/'+((obj.throwQuantity??1)-heads)+'T'):String(obj.throwTotal??obj.value??1);
        const signature=(obj.throwRolls??[]).join(',')+'|'+obj.throwTotal;
        const previousRoll=dieShownAt.current.get(obj.id);
        if(!previousRoll||previousRoll.fingerprint!==signature){
          dieShownAt.current.set(obj.id,{fingerprint:signature,at:Date.now()});
          queueMicrotask(()=>showRollBubble.current(obj.id));
        }
        const shownAt=dieShownAt.current.get(obj.id)?.at??Date.now();
        staticEntries.push({id:obj.id,piece,sides:obj.sides??6,
          shownAt,fadeAfterMs:diceFadeMs,
          themeId:resolveDiceTheme(diceAppearance,obj.sides??6),quaternion:obj.throwQuaternion,
          altitude:obj.throwAltitude,
          quantity:obj.throwQuantity,result:display});
      }
      const old=oldLocations.current.get(obj.id);
      // A physically settled die must remain EXACTLY where it landed.
      if(!obj.throwDice&&old && (Math.abs(old.x-obj.x)>2 || Math.abs(old.y-obj.y)>2)){
        const start=performance.now(),duration=220;
        const animate=(now:number)=>{
          if(piece.destroyed)return;
          const t=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-t,3);
          piece.position.set(old.x+(obj.x-old.x)*ease,old.y+(obj.y-old.y)*ease);
          if(t<1)animations.current.push(requestAnimationFrame(animate));
        };
        animations.current.push(requestAnimationFrame(animate));
      }
      // Honor the individual card's exact artwork: a flipped card uses
      // its own back, not the artwork of the card beneath it or the
      // current game's generic placeholder.
      const frame=obj.frameUrls?.length
        ?obj.frameUrls[nearestFrameIndex(seat,obj.rotation,obj.frameUrls.length)]
        :undefined;
      // Owners always see their own hands, including hands saved before
      // the face-up-on-draw correction. Opponents receive redacted faces
      // through projectForActor and cannot recover private front art.
      const url=obj.faceUp ? (frame||obj.faceUrl) : (obj.backUrl||undefined);
      if(url&&(obj.kind==='card'||obj.kind==='deck')&&imagesRoot){
        // Reuse DOM card artwork across journal updates, particularly die
        // roll completion. Destroying/recreating every <img> made the ENTIRE
        // tabletop visibly flicker whenever a die stopped tumbling.
        visibleArtworkIds.add(obj.id);
        const cached=artworkCache.current.get(obj.id);
        let img:HTMLImageElement;
        if(cached){
          img=cached.img;
          if(cached.url!==url){
            cached.url=url;img.style.display='none';img.src=url;
          }
          if(!img.isConnected)imagesRoot.appendChild(img);
        }else{
          img=document.createElement('img');
          img.draggable=false;img.decoding='async';img.loading='eager';
          img.style.cssText='position:absolute;left:0;top:0;width:62px;height:88px;'+
            'display:none;pointer-events:none;user-select:none;object-fit:fill;'+
            'transform-origin:0 0;border-radius:6px;will-change:transform;z-index:85';
          img.onload=()=>{if(img.isConnected)img.style.display='block';};
          img.onerror=()=>{img.style.display='none';};
          imagesRoot.appendChild(img);
          artworkCache.current.set(obj.id,{img,url});
          img.src=url;
        }
        img.alt=obj.faceUp?obj.name:obj.name+' card back';
        artLayers.push({piece,img});
      }else if(url){
        Assets.load(url).then(texture=>{
          if(piece.destroyed||!session.current)return;
          const sprite=new Sprite(texture);sprite.anchor.set(.5);
          const scale=Math.min(74/texture.width,105/texture.height);
          sprite.scale.set(scale);
          piece.addChild(sprite);
        }).catch(()=>{/* Keep vector fallback for unavailable artwork. */});
      }
      if(!readonly){
        piece.eventMode='static';piece.cursor=obj.throwDice?'pointer':obj.locked?'pointer':'grab';
        piece.on('pointerdown',(e)=>{
          if(e.button!==0)return;
          e.stopPropagation();
          cancelActiveDrag.current();
          if(obj.throwDice){
            if(obj.locked||obj.owner&&obj.owner!==actorId)return;
            const old=rerollPointer.current;
            if(old)window.clearTimeout(old.timer);
            const held={
              pointerId:e.pointerId,id:obj.id,x:e.clientX,y:e.clientY,
              lastX:e.clientX,lastY:e.clientY,at:performance.now(),
              held:false,timer:0,piece,oldX:piece.x,oldY:piece.y
            };
            held.timer=window.setTimeout(()=>{
              if(rerollPointer.current!==held)return;
              held.held=true;
              piece.cursor='grabbing';
              // Physics starts only on release. Until then the actual
              // tabletop die follows the mouse under the 3D renderer.
            },diceHoldMs);
            rerollPointer.current=held;
            controlPointer.current=e.pointerId;
            return; // Never enter generic card dragging or selection logic.
          }
          const local=piece.toLocal(e.global);
          const coinCenter=!!obj.tokenCoin&&
            Math.hypot(local.x,local.y)<=Math.max(5,10.3*coinAppearance.size*1.08);
          // Center click is handled ON RELEASE. A stationary HOLD still
          // enters the exact same multiselection flow used by cards.
          const coinAnchor=coinCenter?piece.toGlobal(new Point(0,0)):null;
          if(state.kind==='tcg'&&obj.owner&&obj.owner!==actorId&&
             !(obj.owner==='local'&&!state.players.length))return;
          const physicalStack=cardStackMembers(state,obj.id).filter(card=>
            !card.owner||card.owner===actorId||
            (card.owner==='local'&&!state.players.length));
          const stackIds=physicalStack.length?physicalStack.map(card=>card.id):[obj.id];
          const wasSelected=selectedSet.current.has(obj.id);
          const multi=selectedSet.current.size>0&&wasSelected;
          const group=multi
            ?state.objects.filter(card=>selectedSet.current.has(card.id))
            :[obj];
          const active:ActiveDrag={
            id:obj.id,pointerId:e.pointerId,visual:piece,
            card:obj.kind!=='board'&&obj.kind!=='deck-box',
            x:obj.x,y:obj.y,startX:obj.x,startY:obj.y,
            startClientX:e.clientX,startClientY:e.clientY,moved:false,
            whole:false,held:false,wheel:false,
            locked:group.some(card=>!!card.locked),selection:multi,
            stackIds,coinCenter,coinAnchor,
            members:group.map(card=>({id:card.id,x:card.x,y:card.y})),timer:null
          };
          drag.current=active;
          setGestureMenu(null);
          // A hold is recognized ONLY after 250ms of no movement.
          // Movement before the timer drags the existing selected group
          // through a 13px resistance zone, without spawning a wheel.
          active.timer=window.setTimeout(()=>{
            if(drag.current!==active||active.moved)return;
            active.timer=null;active.held=true;
            if(wasSelected&&wheelMode==='hold'){
              active.wheel=true;
              showRadialWheel.current(obj.id,active.startClientX,
                active.startClientY,active.pointerId);
            }else{
              const ids=radialMembership(selectedSet.current,obj.id,stackIds,false);
              updateSelection(ids);
              active.selection=true;
              active.members=state.objects.filter(card=>ids.includes(card.id))
                .map(card=>({id:card.id,x:card.x,y:card.y}));
              active.locked=active.members.some(member=>
                !!state.objects.find(card=>card.id===member.id)?.locked);
            }
          },GESTURE_HOLD_MS);
          callbacks.current.onSelect(obj.id);
        });
        piece.on('rightdown',e=>{
          e.stopPropagation();
          cancelActiveDrag.current();
          callbacks.current.onSelect(obj.id);
          if(!selectedSet.current.has(obj.id)){
            const members=cardStackMembers(currentState.current,obj.id);
            updateSelection(radialMembership(selectedSet.current,obj.id,
              members.length?members.map(m=>m.id):[obj.id],false));
          }
          showRadialWheel.current(obj.id,e.clientX,e.clientY,null);
        });
      }
    }
    if(state.kind==='tcg'&&!readonly){
      const cell=tcgMatCells(seat).find(c=>c.row===1&&c.column===2)!;
      const center=tcgMatLocal(cell.x,cell.y,seat);
      const point=tcgMatWorld(center.x+cell.width/2-7,center.y-cell.height/2+7,seat);
      const draw=new Container();draw.position.set(point.x,point.y);draw.rotation=cell.angle;
      draw.eventMode='static';draw.cursor='pointer';draw.hitArea=new Circle(0,0,13);
      draw.addChild(new Graphics().circle(0,0,10).fill({color:0x00050a,alpha:.95}).stroke({color:0x00ff87,width:1}));
      draw.addChild(label('↓',16,0x00ff87,'bold'));
      draw.on('pointerdown',e=>{e.stopPropagation();controlPointer.current=e.pointerId;});
      draw.on('pointertap',e=>{e.stopPropagation();callbacks.current.onDrawMat();});
      (seatGroups?.get(seat)??board).addChild(draw);
      paintLayers.buttons.attach(draw);
    }
    // Hide truly removed cards, but keep every unchanged decoded image.
    for(const [id,cached] of artworkCache.current){
      if(!visibleArtworkIds.has(id)){
        cached.img.onload=null;cached.img.onerror=null;cached.img.remove();
        artworkCache.current.delete(id);
      }
    }
    // Rendering on state change intentionally reconstructs a small scene. Large games will use
    // keyed incremental sprites and texture budgets without changing the core state protocol.
    oldLocations.current=new Map(state.objects.map(o=>[o.id,{x:o.x,y:o.y}]));
    // Layers are appended last, after unlayered felt and table geometry.
    // Render order applies globally, not just inside one player's mat.
    board.addChild(paintLayers.labels,paintLayers.accessories,
      paintLayers.playmats,paintLayers.buttons,paintLayers.objects);
    app.renderer.render(app.stage);
    staticDiceEntries.current=staticEntries;
    staticDice3D.current?.setEntries(staticEntries);
    staticDice3D.current?.sync(true);
    syncCardArtwork();
    return ()=>{
      session.current?.app.ticker.remove(syncCardArtwork);
      // Do NOT reset the 3D scene during a normal Pixi rebuild.
      // New Pixi anchors arrive in the next effect and setEntries() updates
      // them by stable ID, without a visual resize/flicker or GPU reupload.
      staticDiceEntries.current=[];
      // Card images are intentionally retained across state changes.
      // They are released only when removed from the game or on unmount.
      for(const {el} of coinLayers)el.remove();
    };
  },[state,seat,playerName,actorId,selected,selectedIds,readonly,ready,mergeOpacity,mergeHoverMs,playmat,bookDesign,bookDock,bookOffset,eyeView,relations,viewport,coinAppearance,diceAppearance,customCoinValue,customCoinText,coinSources,boxClosed,diceFadeMs,diceHoldMs]);

  useEffect(()=>{
    if(!ready||!session.current||!mount.current)return;
    let cancelled=false;
    import('../lib/Dice3DStatic').then(({createStaticDice3D})=>{
      if(cancelled||!session.current||!mount.current)return;
      try{
        const renderer=createStaticDice3D(
          mount.current,session.current.app.canvas,
          ()=>({
            width:session.current?.app.renderer.width??0,
            height:session.current?.app.renderer.height??0
          })
        );
        staticDice3D.current=renderer;
        renderer.setEntries(staticDiceEntries.current);
        renderer.sync();
      }catch(error){
        setDice3DError('3D tabletop preview unavailable: '+String(error));
      }
    }).catch(error=>setDice3DError('3D tabletop preview unavailable: '+String(error)));
    return()=>{
      cancelled=true;
      staticDice3D.current?.destroy();staticDice3D.current=null;
    };
  },[ready]);

  useEffect(()=>{
    const end=(e:PointerEvent,commit:boolean)=>{
      const d=dicePointer.current;
      if(!d||d.pointerId!==e.pointerId)return;
      dicePointer.current=null;
      if(controlPointer.current===e.pointerId)controlPointer.current=null;
      if(!commit)return;
      const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
      if(Math.hypot(dx,dy)<10)addDiceCount(d.sides);
      else{
        // Include the source die in the throw even if it was not clicked
        // first. Previously selected denominations join automatically.
        throwDiceNow.current(d.sides,dx,dy,performance.now()-d.at);
      }
    };
    const up=(e:PointerEvent)=>end(e,true);
    const cancel=(e:PointerEvent)=>end(e,false);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',cancel);
    return()=>{
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',cancel);
    };
  },[]);

  useEffect(()=>{
    const move=(e:PointerEvent)=>{
      const active=rerollPointer.current;
      if(!active||active.pointerId!==e.pointerId)return;
      active.lastX=e.clientX;active.lastY=e.clientY;
      if(!active.held)return;
      const current=session.current,piece=active.piece;
      if(!current||piece.destroyed||!piece.parent)return;
      const rect=current.app.canvas.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return;
      const stagePoint=new Point(
        (e.clientX-rect.left)*current.app.renderer.width/rect.width,
        (e.clientY-rect.top)*current.app.renderer.height/rect.height);
      const local=piece.parent.toLocal(stagePoint,current.app.stage);
      // The model center itself remains exactly at the pointer.
      piece.position.set(local.x,local.y);
      staticDice3D.current?.sync();
    };
    const release=(e:PointerEvent)=>{
      const active=rerollPointer.current;
      if(!active||active.pointerId!==e.pointerId)return;
      rerollPointer.current=null;
      window.clearTimeout(active.timer);
      if(controlPointer.current===e.pointerId)controlPointer.current=null;
      if(!active.piece.destroyed){
        active.piece.cursor='pointer';
        // Keep the held 3D die right at the release cursor until its
        // airborne renderer takes ownership. Restoring the old position
        // here caused the very visible jerk before each reroll.
        if(!active.held)active.piece.position.set(active.oldX,active.oldY);
      }
      if(e.type!=='pointerup')return;
      if(!active.held){
        // A single quick click repeats the existing result bubble.
        showRollBubble.current(active.id);
        return;
      }
      const elapsed=Math.max(80,performance.now()-active.at);
      const dx=e.clientX-active.x,dy=e.clientY-active.y;
      rerollDieNow.current(active.id,e.clientX,e.clientY,dx,dy,elapsed);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',release);
    window.addEventListener('pointercancel',release);
    return()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',release);
      window.removeEventListener('pointercancel',release);
    };
  },[]);


  // A source is immutable: only a transient ghost travels with the pointer.
  // Commit one deterministic TOKEN_PLACE or TOKEN_ADJUST event on release.
  useEffect(()=>{
    const coordinates=(event:PointerEvent)=>{
      const current=session.current;if(!current)return null;
      const rect=current.app.canvas.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return null;
      return new Point(
        (event.clientX-rect.left)*current.app.renderer.width/rect.width,
        (event.clientY-rect.top)*current.app.renderer.height/rect.height);
    };
    const finish=(event:PointerEvent,commit:boolean)=>{
      const d=tokenDrag.current;
      if(!d||d.pointerId!==event.pointerId)return;
      tokenDrag.current=null;
      const current=session.current,at=coordinates(event);
      const traveled=Math.hypot(event.clientX-d.startX,event.clientY-d.startY);
      if(d.ghost&&!d.ghost.destroyed)d.ghost.destroy();
      d.ghostEl.remove();
      controlPointer.current=null;
      if(!commit||!current||!at)return;
      if(traveled<9){
        // A stationary click only acts when cards have been selected.
        const ids=[...selectedSet.current].filter(id=>{
          const card=currentState.current.objects.find(o=>o.id===id);
          return card&&(card.kind==='card'||card.kind==='deck');
        });
        if(ids.length)callbacks.current.onTokenAdjust(ids,d.value,d.sign);
        return;
      }
      const local=d.mat.toLocal(at,current.app.stage);
      const right=TCG_MAT_WIDTH/2+3;
      const trayTop=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
      // Every return disappears back into the permanently positioned coin.
      if(local.x>=right&&local.x<=right+TCG_MAT.cardWidth&&
         local.y>=trayTop&&local.y<=TCG_MAT_HEIGHT/2)return;
      let target:TableObject|undefined;
      // Coin drop coordinates must be in the SAME board/seat-layer space
      // used to render table objects. d.mat.parent is the drawer's rotated
      // playmat, so using it projected the drop into the wrong coordinate
      // system and made freshly placed coins vanish off the tabletop.
      let parent:Container|null=duelLayers.current?.get(seatRef.current)??current.board;
      for(const [id,piece] of [...visuals.current.entries()].reverse()){
        const card=currentState.current.objects.find(o=>o.id===id);
        if(!card||!['card','deck'].includes(card.kind)||card.zone!=='TABLE'||
           card.locked||(card.owner&&card.owner!==actorId))continue;
        const hit=piece.toLocal(at,current.app.stage);
        if(Math.abs(hit.x)<=31&&Math.abs(hit.y)<=44){
          target=card;parent=piece.parent;break;
        }
      }
      if(!parent)return;
      const spot=parent.toLocal(at,current.app.stage);
      callbacks.current.onTokenPlace(d.value,d.sign,
        spot.x,spot.y,target?.id,d.color,d.coinText);
    };
    const move=(event:PointerEvent)=>{
      const d=tokenDrag.current,at=coordinates(event);
      if(!d||d.pointerId!==event.pointerId||!at||d.ghost.destroyed)return;
      if(Math.hypot(event.clientX-d.startX,event.clientY-d.startY)<9)return;
      const local=d.mat.toLocal(at,session.current!.app.stage);
      d.ghost.position.copyFrom(local);d.ghost.visible=true;
    };
    const up=(event:PointerEvent)=>finish(event,true);
    const cancel=(event:PointerEvent)=>finish(event,false);
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',cancel);
    return()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',cancel);
    };
  },[actorId]);

  useEffect(()=>{
    const release=(e:PointerEvent)=>{
      const press=coinSourcePress.current;
      if(!press||press.pointerId!==e.pointerId)return;
      coinSourcePress.current=null;
      if(controlPointer.current===e.pointerId)controlPointer.current=null;
      if(e.type!=='pointerup'||
        Math.hypot(e.clientX-press.startX,e.clientY-press.startY)>=8)return;
      setCoinColorsOpen(false);
      if(press.index===0){
        // The FIRST, silver/white source uses an editable inline inscription.
        setCoinMenu(null);
        setCoinDraft(customCoinText);
        setCoinEditing({x:press.x,y:press.y});
      }else{
        setCoinEditing(null);
        setCoinMenu(m=>m?.type==='source'&&m.index===press.index
          ?null:{type:'source',index:press.index,x:press.x,y:press.y});
      }
    };
    const move=(e:PointerEvent)=>{
      const press=coinSourcePress.current;
      if(press?.pointerId===e.pointerId&&
        Math.hypot(e.clientX-press.startX,e.clientY-press.startY)>8)
        coinSourcePress.current=null;
    };
    window.addEventListener('pointerup',release);
    window.addEventListener('pointercancel',release);
    window.addEventListener('pointermove',move);
    return()=>{
      window.removeEventListener('pointerup',release);
      window.removeEventListener('pointercancel',release);
      window.removeEventListener('pointermove',move);
    };
  },[customCoinText]);
  useEffect(()=>{
    const clearHighlight=()=>{
      const hint=snapHighlight.current;
      if(hint&&!hint.destroyed){hint.clear();hint.removeChildren().forEach(child=>child.destroy());}
    };
    const discard=(restore=true)=>{
      const d=drag.current;
      if(!d)return;
      if(d.timer!==null)window.clearTimeout(d.timer);
      if(restore){
        for(const member of d.members.length?d.members:[{id:d.id,x:d.startX,y:d.startY}]){
          const visual=visuals.current.get(member.id);
          if(visual&&!visual.destroyed)visual.position.set(member.x,member.y);
        }
      }
      drag.current=null;
      clearHighlight();
    };
    cancelActiveDrag.current=()=>discard();
    const move=(event:PointerEvent)=>{
      const d=drag.current,current=session.current;
      if(!d||d.pointerId!==event.pointerId||!current||!mount.current||d.wheel)return;
      const distance=Math.hypot(event.clientX-d.startClientX,
        event.clientY-d.startClientY);
      if(!d.moved){
        if(distance<GESTURE_MOVE_THRESHOLD)return;
        // Once a stationary first hold has selected the stack, sliding
        // the finger invokes the wheel; it never jerks the cards away.
        if(d.held&&wheelMode==='hold'){
          d.wheel=true;
          showRadialWheel.current(d.id,d.startClientX,d.startClientY,d.pointerId);
          return;
        }
        if(d.locked){
          // Locked objects may be selected/unlocked but never dragged.
          // Movement invalidates a stationary hold: don't spawn the wheel
          // after the pointer has already crossed the resistance limit.
          if(d.timer!==null){window.clearTimeout(d.timer);d.timer=null;}
          d.moved=true;
          return;
        }
        d.moved=true;
        if(d.timer!==null){window.clearTimeout(d.timer);d.timer=null;}
      }
      // Breakaway friction: 13px must be overcome before moving a card.
      // Subtract that deadzone from pointer delta so cards NEVER jump.
      const rect=current.app.canvas.getBoundingClientRect();
      const coord=(clientX:number,clientY:number)=>new Point(
        (clientX-rect.left)*current.app.renderer.width/rect.width,
        (clientY-rect.top)*current.app.renderer.height/rect.height);
      const parent=d.visual.parent??current.board;
      const origin=parent.toLocal(coord(d.startClientX,d.startClientY),current.app.stage);
      const point=parent.toLocal(coord(event.clientX,event.clientY),current.app.stage);
      const factor=Math.max(0,(distance-GESTURE_MOVE_THRESHOLD)/Math.max(1,distance));
      d.x=Math.max(0,Math.min(BOARD_W,d.startX+(point.x-origin.x)*factor));
      d.y=Math.max(0,Math.min(BOARD_W,d.startY+(point.y-origin.y)*factor));
      const dx=d.x-d.startX,dy=d.y-d.startY;
      if(d.selection||d.whole){
        for(const m of d.members){
          const visual=visuals.current.get(m.id);
          if(visual&&!visual.destroyed)visual.position.set(m.x+dx,m.y+dy);
        }
      }else if(!d.visual.destroyed){
        d.visual.position.set(d.x,d.y);
      }
      const hint=snapHighlight.current;
      if(hint&&!hint.destroyed){
        if(hint.parent!==parent)parent.addChild(hint);
        hint.clear();hint.removeChildren().forEach(child=>child.destroy());
        const cardScale=currentState.current.objects.find(o=>o.id===d.id)?.scale??1;
        const dragged=currentState.current.objects.find(o=>o.id===d.id);
        const magnetic=dragged&&['card','deck','tile'].includes(dragged.kind);
        const cell=magnetic&&currentKind.current==='tcg'?tcgSnapPoint(
          d.x,d.y,currentState.current.centerMerges,
          playmatRef.current.snapMerged,seatRef.current,cardScale):null;
        if(cell){
          const zone=tcgMatRegions(cell.seat,currentState.current.centerMerges).find(c=>c.row===cell.row&&c.column===cell.column)!;
          const remove=isTcgRemoveDrop(d.x,d.y,seatRef.current);
          hint.position.set(zone.x,zone.y);hint.rotation=zone.angle;
          hint.roundRect(-zone.width/2+3,-zone.height/2+3,zone.width-6,zone.height-6,5)
            .fill({color:remove?0xff3b30:0xc7d8ac,alpha:.13})
            .stroke({color:remove?0xff3b30:0xf6daa2,width:1.5,alpha:.75});
          const deckPocket=d.card?tcgDropZone(d.x,d.y,cell.seat):null;
          if(deckPocket?.zone==='DECK'){
            const deckSide=deckPocket.deckBottom?'BOTTOM':'TOP';
            hint.roundRect(-zone.width/2+2,-zone.height/2+2,zone.width-4,zone.height-4,5)
              .fill({color:0xf6ce55,alpha:.23})
              .stroke({color:0xffe07a,width:3,alpha:1});
            const deckMarker=label('DECK '+deckSide,8,0xffe07a,'bold');
            deckMarker.rotation=-Math.PI/2;
            hint.addChild(deckMarker);
          }
          if(remove){
            const text=label('RELEASE TO REMOVE',7,0xff6b61,'bold');
            text.rotation=-Math.PI/2;hint.addChild(text);
          }else{
            // Show the precise snapped CARD SLOT in addition to the zone,
            // so each unmerged row previews exactly where the card will land.
            const dx=cell.x-zone.x,dy=cell.y-zone.y;
            const cos=Math.cos(zone.angle),sin=Math.sin(zone.angle);
            const sx=dx*cos+dy*sin,sy=-dx*sin+dy*cos;
            hint.roundRect(sx-TCG_MAT.cardWidth*cardScale/2,
              sy-TCG_MAT.cardHeight*cardScale/2,
              TCG_MAT.cardWidth*cardScale,TCG_MAT.cardHeight*cardScale,4)
              .fill({color:0x83dfe7,alpha:.19})
              .stroke({color:0xbafaff,width:2,alpha:.96});
          }
        }
      }
    };
    const end=(event:PointerEvent)=>{
      const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;
      if(d.timer!==null)window.clearTimeout(d.timer);
      drag.current=null;clearHighlight();
      // A locked card can be unlocked from its wheel, never moved.
      if(d.locked&&d.moved)return;
      // A simple tap joins selection mode. No further holds required.
      if(!d.moved){
        if(d.wheel||d.held)return;
        if(selectedSet.current.size>0){
          const ids=radialTapMembership(selectedSet.current,d.id,d.stackIds);
          updateSelection(ids);
          lastTap.current=null;
          return;
        }
        if(d.coinCenter){
          const object=currentState.current.objects.find(o=>o.id===d.id);
          const currentVisual=visuals.current.get(d.id);
          const app=session.current?.app;
          const coords=currentVisual&&!currentVisual.destroyed&&app
            ?currentVisual.toGlobal(new Point(0,0)):d.coinAnchor;
          if(coords&&app){
            const rect=app.canvas.getBoundingClientRect();
            const x=coords.x*rect.width/app.renderer.width;
            const y=coords.y*rect.height/app.renderer.height;
            if(object?.coinText!==undefined){
              setCoinDraft(object.coinText);
              setCoinEditing({id:d.id,x,y});
              setCoinMenu(null);
            }else if(object?.tokenCoin){
              setCoinEditing(null);
              setCoinMenu(previous=>previous?.type==='copy'&&previous.id===d.id
                ?null:{type:'copy',id:d.id,x,y});
              setCoinColorsOpen(false);
            }
          }
          lastTap.current=null;
          return;
        }
        const timestamp=Date.now();
        if(d.card&&isDoubleCardTap(lastTap.current,d.id,timestamp,event.clientX,event.clientY)){
          lastTap.current=null;
          const object=currentState.current.objects.find(o=>o.id===d.id);
          if(object?.kind==='card'||object?.kind==='deck')
            callbacks.current.onCardAction(d.id,'tap');
        }else lastTap.current={id:d.id,at:timestamp,x:event.clientX,y:event.clientY};
        return;
      }
      lastTap.current=null;
      const dx=d.x-d.startX,dy=d.y-d.startY;
      if(d.selection&&d.members.length>0){
        for(const m of d.members)oldLocations.current.set(m.id,{x:m.x+dx,y:m.y+dy});
        callbacks.current.onMoveSelection(d.members.map(m=>m.id),d.id,
          Math.round(d.x),Math.round(d.y));
      }else if(d.whole){
        for(const m of d.members)oldLocations.current.set(m.id,{x:m.x+dx,y:m.y+dy});
        callbacks.current.onMoveStack(d.id,Math.round(d.x),Math.round(d.y));
      }else{
        oldLocations.current.set(d.id,{x:d.x,y:d.y});
        // Accessories land exactly beneath their center, with no rounding
        // to a slot or nearby anchor.
        const object=currentState.current.objects.find(o=>o.id===d.id);
        const exact=object&&['token','marker','die','miniature'].includes(object.kind);
        callbacks.current.onMove(d.id,
          exact?d.x:Math.round(d.x),exact?d.y:Math.round(d.y));
      }
    };
    const cancel=(event:PointerEvent)=>{
      if(drag.current?.pointerId===event.pointerId)discard();
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',cancel);
    return()=>{
      cancelActiveDrag.current=()=>{};
      discard();
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',cancel);
    };
  },[]);

  useEffect(()=>{
    const host=mount.current;if(!host)return;
    // Zooming out stops at the same 100% fit-to-table view used on launch.
    const coordinates=(event:{clientX:number;clientY:number})=>{
      const r=host.getBoundingClientRect();
      return {x:event.clientX-r.left,y:event.clientY-r.top};
    };
    const interruptFocus=()=>{
      if(activeFocusAnimation.current!==null){
        cancelAnimationFrame(activeFocusAnimation.current);activeFocusAnimation.current=null;
      }
    };
    const animateTo=(zoom:number,panX:number,panY:number)=>{
      const w=host.clientWidth,h=host.clientHeight;
      // Locked opponent mode may need to show up to twelve mats at once.
      // Permit a below-normal fit scale ONLY there; the standard camera
      // retains its strict 100% full-table minimum zoom.
      const targetZoom=isBattleView(viewRef.current.kind)
        ?Math.min(48,Math.max(.12,Number.isFinite(zoom)?zoom:1))
        :clampTableZoom(zoom);
      const bounded=clampTablePan(panX,panY,targetZoom,w,h);
      const from={...camera.current};
      interruptFocus();
      const started=performance.now(),duration=360;
      const animate=(now:number)=>{
        const t=Math.min(1,(now-started)/duration),ease=1-Math.pow(1-t,3);
        camera.current.zoom=from.zoom+(targetZoom-from.zoom)*ease;
        camera.current.panX=from.panX+(bounded.panX-from.panX)*ease;
        camera.current.panY=from.panY+(bounded.panY-from.panY)*ease;
        updateView.current();
        if(t<1)activeFocusAnimation.current=requestAnimationFrame(animate);
        else activeFocusAnimation.current=null;
      };
      activeFocusAnimation.current=requestAnimationFrame(animate);
    };
    resetCamera.current=()=>animateTo(MIN_TABLE_ZOOM,0,0);
    focusMyMat.current=()=>{
      const current=session.current;
      if(!current||!host.clientWidth||!host.clientHeight)return;
      const {scene,board}=current,w=host.clientWidth,h=host.clientHeight;
      const fit=Math.min(w/(TABLE_VIEW_RADIUS*2),h/(TABLE_VIEW_RADIUS*2));
      if(fit<=0)return;
      const cells=tcgMatCells(seatRef.current);
      const a=cells.find(cell=>cell.column===0&&cell.row===0)!;
      const b=cells.find(cell=>cell.column===2&&cell.row===3)!;
      const origin=new Point((a.x+b.x)/2,(a.y+b.y)/2);
      const projected=board.toGlobal(origin);
      const localX=(projected.x-scene.x)/scene.scale.x;
      const localY=(projected.y-scene.y)/scene.scale.y;
      // Fit to the screen, including the view controls on PLAY 03.
      // Both actual wooden side drawers (plus slim pull handles) must fit.
      const completeMatWidth=TCG_MAT_WIDTH+2*(TCG_MAT.cardWidth+18);
      const widthFit=.94*w/completeMatWidth;
      const heightFit=.91*h/(TCG_MAT_HEIGHT+148);
      const zoom=clampTableZoom(Math.min(widthFit,heightFit)/fit);
      const scale=fit*zoom;
      const panX=(BOARD_CENTER-localX)*scale,panY=(BOARD_CENTER-localY)*scale;
      animateTo(zoom,panX,panY);
    };
    focusOpponent.current=()=>{
      const w=host.clientWidth,h=host.clientHeight;
      if(w<=0||h<=0)return;
      const fit=Math.min(w/(TABLE_VIEW_RADIUS*2),h/(TABLE_VIEW_RADIUS*2));
      // Fit the two player halves without stretching cards, including the
      // half-overhanging navigation circles centered ON the mat borders.
      const selected=viewRef.current.opponent;
      if(selected===null&&viewRef.current.kind!=='castle')return;
      if(viewRef.current.kind==='castle'){
        // Zoom depends ONLY on screen size, never on ally count or Castle
        // mode; the player's mat remains unscaled and fixed on the left.
        const layout=castleGridLayout(seatRef.current,relationsRef.current,
          viewRef.current.castleMode==='single'?'single':'all',
          viewRef.current.opponent,{width:w,height:h});
        animateTo(layout.cameraScale/fit,0,0);
        return;
      }
      const lineup=oneOnOneMatchupLayout(seatRef.current,selected!,relationsRef.current,BATTLEFIELD_PLAYMAT_PADDING);
      // Account for the FULL PLAY 03 circle hit radius, plus a minimal
      // 3-unit safety clearance, equally on all four sides of each mat.
      // This also gives both battlefield halves breathing room at the divider.
      const bounds=battlefieldFitBounds(lineup.columns,BATTLEFIELD_PLAYMAT_PADDING,true);
      const heightScale=h/bounds.height;
      const widthScale=w/bounds.width;
      animateTo(Math.min(heightScale,widthScale)/fit,0,0);
    };
    cycleOpponentHandler.current=(direction,sourceSeat)=>{
      const current=viewRef.current;
      if(current.kind==='castle'&&current.castleMode==='focus'){
        const role=relationsRef.current[sourceSeat];
        if(role!=='ally'&&role!=='enemy')return;
        const next=nextCastleFocusedSeat(seatRef.current,sourceSeat,
          direction,relationsRef.current);
        if(next===null||next===sourceSeat)return;
        cancelActiveDrag.current();
        if(role==='ally'){
          lastCastleAlly.current=next;
          selectView({...current,castleFocusedAlly:next,opponent:next});
        }else{
          selectView({...current,castleFocusedEnemy:next,castleSelectedEnemy:next});
        }
        return; // Cycle only this side; leave the opposite view untouched.
      }
      if(current.kind==='castle'&&current.castleMode==='single'){
        const role=relationsRef.current[sourceSeat];
        if(role!=='ally'&&role!=='enemy')return;
        const next=nextCastleFocusedSeat(seatRef.current,sourceSeat,
          direction,relationsRef.current);
        if(next===null||next===sourceSeat)return;
        cancelActiveDrag.current();
        if(role==='ally'){
          lastCastleAlly.current=next;
          selectView({...current,opponent:next});
        }else{
          selectView({...current,castleSelectedEnemy:next});
        }
        return; // Cycle this side only, never disturb the other player.
      }
      if(current.kind!=='versus'||current.opponent===null)return;
      const opponent=neighboringOpponentSeat(seatRef.current,current.opponent,direction);
      if(opponent===current.opponent)return;
      cancelActiveDrag.current();
      selectView({kind:'versus',opponent});
      // Eye always keeps the new selected seat opposite, even if an Ally.
      requestAnimationFrame(()=>focusOpponent.current());
    };
    toggleRelationHandler.current=(targetSeat,choice)=>{
      const selected=viewRef.current;
      if(!isBattleView(selected.kind)||targetSeat===seatRef.current||
         !Number.isInteger(targetSeat)||targetSeat<0||targetSeat>=12)return;
      const next={...relationsRef.current};
      next[targetSeat]=toggleOpponentRelation(next[targetSeat]??null,choice);
      relationsRef.current=next;
      setRelations(next);
      if(selected.kind==='castle'){
        const foes=Array.from({length:12},(_,s)=>s)
          .filter(s=>s!==seatRef.current&&next[s]==='enemy');
        const previousEnemy=selected.castleSelectedEnemy??null;
        const validEnemy=previousEnemy!==null&&foes.includes(previousEnemy)
          ?previousEnemy:foes[0]??null;
        if(selected.castleMode==='focus'){
          let ally=selected.castleFocusedAlly??null;
          let enemy=selected.castleFocusedEnemy??null;
          // Moving a focused player from Shield to Sword (or vice versa)
          // transfers only that player's focus to the new side. Clearing
          // the role releases only that side; keep the other side focused.
          if(ally===targetSeat&&next[targetSeat]!=='ally')ally=null;
          if(enemy===targetSeat&&next[targetSeat]!=='enemy')enemy=null;
          if((selected.castleFocusedAlly===targetSeat||
              selected.castleFocusedEnemy===targetSeat)&&
             next[targetSeat]==='ally')ally=targetSeat;
          if((selected.castleFocusedAlly===targetSeat||
              selected.castleFocusedEnemy===targetSeat)&&
             next[targetSeat]==='enemy')enemy=targetSeat;
          if(ally===null&&enemy===null){
            const selectedAlly=nextCastleAllySeat(seatRef.current,
              lastCastleAlly.current,'right',next);
            lastCastleAlly.current=selectedAlly;
            selectView({kind:'castle',opponent:selectedAlly,
              castleSelectedEnemy:validEnemy,
              castleMode:preferredCastleMode.current});
          }else{
            const selectedAlly=nextCastleAllySeat(seatRef.current,
              ally??selected.opponent,'right',next);
            selectView({...selected,opponent:ally??selectedAlly,
              castleSelectedEnemy:enemy??validEnemy,
              castleFocusedAlly:ally,castleFocusedEnemy:enemy});
          }
        }else{
          const ally=nextCastleAllySeat(seatRef.current,selected.opponent,'right',next);
          lastCastleAlly.current=ally;
          if(selected.opponent!==ally||selected.castleSelectedEnemy!==validEnemy)
            selectView({...selected,opponent:ally,castleSelectedEnemy:validEnemy});
        }
      }
      // The clicked mat may relocate from one side to the other; keep
      // the locked camera framing every marked opponent and ally.
      requestAnimationFrame(()=>focusOpponent.current());
    };
    castleFocusHandler.current=targetSeat=>{
      const current=viewRef.current;
      if(current.kind!=='castle'||targetSeat===seatRef.current)return;
      const role=relationsRef.current[targetSeat];
      if(role!=='ally'&&role!=='enemy')return;
      if(current.castleMode==='focus'&&
        (role==='ally'?current.castleFocusedAlly:current.castleFocusedEnemy)===targetSeat)return;
      cancelActiveDrag.current();panPointer.current=null;
      // The chosen side alone becomes a full-sized single-player view.
      // The other side retains either its complete All grid or its own
      // previous focus; never replace an Ally focus with an Enemy focus.
      selectView({...current,castleMode:'focus',
        opponent:role==='ally'?targetSeat:current.opponent,
        castleSelectedEnemy:role==='enemy'?targetSeat:current.castleSelectedEnemy??null,
        castleFocusedAlly:role==='ally'?targetSeat:current.castleFocusedAlly??null,
        castleFocusedEnemy:role==='enemy'?targetSeat:current.castleFocusedEnemy??null});
      // Focus is neither Single nor All. The next Castle hold continues
      // from the remembered broad-mode toggle without a camera jump.
    };
    castleTapHandler.current=()=>{
      const mode=viewRef.current;
      if(mode.kind==='castle'){
        // Castle is a separate filter, not a change to Eye semantics.
        const restore=previousCastleView.current;
        if(restore.kind==='versus'&&restore.opponent!==null){
          selectView(restore);
          requestAnimationFrame(()=>focusOpponent.current());
        }else if(restore.kind==='self'){
          selectView(restore);
          requestAnimationFrame(()=>focusMyMat.current());
        }else{
          selectView({kind:'overview',opponent:null});
          resetCamera.current();
        }
      }else{
        previousCastleView.current=mode;
        cancelActiveDrag.current();
        const ally=nextCastleAllySeat(seatRef.current,lastCastleAlly.current,
          'right',relationsRef.current);
        lastCastleAlly.current=ally;
        const enemy=Array.from({length:12},(_,s)=>s)
          .find(s=>s!==seatRef.current&&relationsRef.current[s]==='enemy')??null;
        selectView({kind:'castle',opponent:ally,castleMode:preferredCastleMode.current,
          castleSelectedEnemy:enemy});
        requestAnimationFrame(()=>focusOpponent.current());
      }
    };
    castleHoldHandler.current=()=>{
      const current=viewRef.current;
      const wasCastle=current.kind==='castle';
      const toggleFrom=wasCastle&&current.castleMode!=='focus'
        ?current.castleMode??preferredCastleMode.current
        :preferredCastleMode.current;
      const nextMode:CastleMode=toggleFrom==='all'?'single':'all';
      preferredCastleMode.current=nextMode;
      const ally=nextCastleAllySeat(seatRef.current,
        wasCastle?current.castleFocusedAlly??current.opponent:lastCastleAlly.current,
        'right',relationsRef.current);
      const enemies=Array.from({length:12},(_,s)=>s)
        .filter(s=>s!==seatRef.current&&relationsRef.current[s]==='enemy');
      const candidateEnemy=wasCastle
        ?current.castleFocusedEnemy??current.castleSelectedEnemy??null:null;
      const enemy=candidateEnemy!==null&&enemies.includes(candidateEnemy)
        ?candidateEnemy:enemies[0]??null;
      lastCastleAlly.current=ally;
      if(!wasCastle)previousCastleView.current=current;
      cancelActiveDrag.current();
      // A Castle hold ALWAYS changes BOTH sides as one mode switch,
      // including when both sides were previously independently focused.
      // Any focus ends here; the new mode itself determines the visible
      // Ally and Enemy lineups and their arrow controls.
      selectView({kind:'castle',opponent:ally,castleMode:nextMode,
        castleSelectedEnemy:enemy,castleFocusedAlly:null,castleFocusedEnemy:null});
      // Mode switch uses the SAME camera and leaves our left mat still.
      if(!wasCastle)requestAnimationFrame(()=>focusOpponent.current());
    };
    eyeTapHandler.current=()=>{
      const mode=viewRef.current.kind;
      if(mode==='overview'){
        selectView({kind:'self',opponent:null});
        requestAnimationFrame(()=>focusMyMat.current());
      }else{
        selectView({kind:'overview',opponent:null});
        resetCamera.current();
      }
    };
    eyeHoldHandler.current=()=>{
      if(isBattleView(viewRef.current.kind)){
        selectView({kind:'self',opponent:null});
        requestAnimationFrame(()=>focusMyMat.current());
      }else{
        selectView({kind:'targeting',opponent:null});
        resetCamera.current(); // reveal every available opponent to select
      }
    };
    const onCardMenu=(target:EventTarget|null)=>target instanceof Element&&
      !!target.closest('.tcg-card-action-menu, .sennet-coin-radial-layer, .sennet-dice-selection, .sennet-dice-engine-error, .sennet-action-lcd, .card-radial-wheel, .sennet-radial-overlay');
    const selectOpponent=(event:PointerEvent)=>{
      if(onCardMenu(event.target)||viewRef.current.kind!=='targeting'||event.button!==0)return;
      const current=session.current;
      if(!current)return;
      const rect=current.app.canvas.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return;
      const point=new Point(
        (event.clientX-rect.left)*current.app.renderer.width/rect.width,
        (event.clientY-rect.top)*current.app.renderer.height/rect.height);
      const local=current.board.toLocal(point,current.app.stage);
      const target=opponentAtTablePoint(local.x,local.y,seatRef.current);
      if(target===null)return;
      // Capture before Pixi gets pointerdown: cards and other objects
      // cannot steal a click intended to select the opponent's mat.
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      cancelActiveDrag.current();panPointer.current=null;
      selectView({kind:'versus',opponent:target});
      requestAnimationFrame(()=>focusOpponent.current());
    };
    const zoomAt=(x:number,y:number,ratio:number)=>{
      // Opposing view has a fixed matchup camera. Only the eye control may
      // leave it; ordinary zoom input must not break the two-mat layout.
      if(isBattleView(viewRef.current.kind))return;
      const current=session.current;if(!current||!Number.isFinite(ratio)||ratio<=0)return;
      interruptFocus();
      const {scene}=current,c=camera.current;
      const before=c.zoom,after=clampTableZoom(before*ratio);
      if(after===before)return;
      const localX=(x-scene.x)/scene.scale.x;
      const localY=(y-scene.y)/scene.scale.y;
      c.zoom=after;
      const fit=Math.min(host.clientWidth/(TABLE_VIEW_RADIUS*2),
        host.clientHeight/(TABLE_VIEW_RADIUS*2));
      const newScale=fit*after;
      c.panX=x-localX*newScale-(host.clientWidth/2-BOARD_CENTER*newScale);
      c.panY=y-localY*newScale-(host.clientHeight/2-BOARD_CENTER*newScale);
      updateView.current();
    };
    const pan=(dx:number,dy:number)=>{
      if(isBattleView(viewRef.current.kind))return;
      interruptFocus();
      camera.current.panX+=dx;camera.current.panY+=dy;
      updateView.current();
    };
    const wheel=(event:WheelEvent)=>{
      // Action tray owns its own scroll; never zoom or pan the table
      // while scrolling the tray on a touchpad or with a mouse wheel.
      if(onCardMenu(event.target))return;
      event.preventDefault();
      // Block wheel zoom, trackpad scroll/pinch and Shift+wheel pan.
      if(isBattleView(viewRef.current.kind))return;
      const point=coordinates(event);
      const factor=event.deltaMode===1?16:event.deltaMode===2?host.clientHeight:1;
      if(event.shiftKey&&!event.ctrlKey){
        pan(-event.deltaY*factor,-event.deltaX*factor);
      }else{
        // Standard mouse wheel, high-resolution touchpad two-finger scroll,
        // and browser touchpad pinch (ctrlKey wheel) use the same camera.
        zoomAt(point.x,point.y,Math.exp(-event.deltaY*factor*(event.ctrlKey?.009:.0018)));
      }
    };
    const down=(event:PointerEvent)=>{
      if(activeBookPointer===event.pointerId)return; // Book dragging never pans or clears the table.
      if(onCardMenu(event.target))return; // Menu taps never initiate tabletop pan.
      // Pixi targets live on the canvas. A selected card's pointerdown
      // sets drag.current before this host handler executes: it must not
      // be misclassified as an empty-space click.
      if(event.button===0&&event.target===session.current?.app.canvas&&
        !drag.current&&controlPointer.current!==event.pointerId){
        setGestureMenu(null);
        if(radialOpen.current&&Date.now()-radialOpenedAt.current>450)setRadialWheel(null);
        if(selectedSet.current.size||selectedRef.current!==null){
          selectedSet.current.clear();
          setSelectedIds([]);
          selectedRef.current=null;
          callbacks.current.onSelect(null);
          lastTap.current=null;
        }
      }
      // All modes track touch pointers, including locked Castle/Eye views.
      // A second finger always cancels any pending card move or stack
      // hold before the two touches can be mistaken for two card drags.
      if(event.pointerType==='touch'){
        pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(pointers.current.size>=2){
          cancelActiveDrag.current();
          panPointer.current=null;
          lastTap.current=null;
          if(snapHighlight.current&&!snapHighlight.current.destroyed)snapHighlight.current.clear();
          host.classList.remove('is-panning');
        }
      }
      // Cards, stacks, eye and opponent arrows remain interactive in
      // locked matchups; only camera gestures are disabled.
      if(isBattleView(viewRef.current.kind))return;
      // Pixi's piece pointerdown is dispatched on the canvas before this
      // bubbling handler. Its active object drag takes priority over panning.
      if(drag.current?.pointerId===event.pointerId||controlPointer.current===event.pointerId)return;
      if(event.pointerType==='touch'){
        if(pointers.current.size===1){
          panPointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};
        }
      }else if(event.button===0||event.button===1){
        // Left-button drag over any empty felt OR surrounding view moves the
        // camera intuitively. Middle mouse also works as a shortcut.
        if(event.button===1)event.preventDefault();
        panPointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};
      }
      if(panPointer.current?.id===event.pointerId){
        host.classList.add('is-panning');
        // Keep receiving moves after the pointer leaves the canvas.
        try{host.setPointerCapture(event.pointerId);}catch{/* Some devices reject capture. */}
      }
    };
    const move=(event:PointerEvent)=>{
      if(activeBookPointer===event.pointerId)return;
      if(isBattleView(viewRef.current.kind))return;
      const touches=pointers.current;
      if(event.pointerType==='touch'&&touches.has(event.pointerId)){
        const old=[...touches.values()];
        touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(touches.size>=2){
          const now=[...touches.values()];
          const [a,b]=old,[c,d]=now;
          const oldCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
          const newCenter={x:(c.x+d.x)/2,y:(c.y+d.y)/2};
          const oldDistance=Math.hypot(a.x-b.x,a.y-b.y);
          const newDistance=Math.hypot(c.x-d.x,c.y-d.y);
          const target=coordinates({clientX:oldCenter.x,clientY:oldCenter.y});
          if(oldDistance>5&&newDistance>5)zoomAt(target.x,target.y,newDistance/oldDistance);
          pan(newCenter.x-oldCenter.x,newCenter.y-oldCenter.y);
          return;
        }
      }
      const active=panPointer.current;
      if(!active||active.id!==event.pointerId)return;
      if(drag.current?.pointerId===event.pointerId)return;
      // Translation exactly follows the user's pointer in screen pixels.
      // Since it changes only the view transform, card positions are intact.
      const dx=event.clientX-active.x,dy=event.clientY-active.y;
      active.x=event.clientX;active.y=event.clientY;
      if(dx||dy)pan(dx,dy);
    };
    const up=(event:PointerEvent)=>{
      if(controlPointer.current===event.pointerId)controlPointer.current=null;
      pointers.current.delete(event.pointerId);
      if(panPointer.current?.id===event.pointerId){
        panPointer.current=null;
        host.classList.remove('is-panning');
      }
      if(host.hasPointerCapture(event.pointerId)){
        try{host.releasePointerCapture(event.pointerId);}catch{/* Capture already released. */}
      }
    };
    const blur=()=>{
      panPointer.current=null;
      pointers.current.clear();
      host.classList.remove('is-panning');
    };
    const reset=()=>{selectView({kind:'overview',opponent:null});resetCamera.current();};
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setCoinMenu(null);setCoinColorsOpen(false);setGestureMenu(null);setRadialWheel(null);lastTap.current=null;}
      const target=event.target;
      if(target instanceof HTMLElement&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(currentKind.current==='tcg'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        const key=event.key.toLowerCase();
        if(key==='d'){event.preventDefault();callbacks.current.onDrawMat();return;}
        const card=currentState.current.objects.find(o=>o.id===selectedRef.current&&o.kind==='card');
        if(card&&(key==='t'||key==='f')){
          event.preventDefault();callbacks.current.onCardAction(card.id,key==='t'?'tap':'flip');return;
        }
      }
      // Keyboard reset and +/- cannot bypass the opponent-view camera lock.
      // The eye button remains the explicit way to leave this view.
      if(isBattleView(viewRef.current.kind)){
        if(['0','+','=','-'].includes(event.key))event.preventDefault();
        return;
      }
      if(event.key==='0'){reset();}
      if(event.key==='+'||event.key==='='){event.preventDefault();zoomAt(host.clientWidth/2,host.clientHeight/2,1.25);}
      if(event.key==='-'){event.preventDefault();zoomAt(host.clientWidth/2,host.clientHeight/2,1/1.25);}
    };
    host.addEventListener('wheel',wheel,{passive:false});
    host.addEventListener('pointerdown',selectOpponent,true);
    host.addEventListener('pointerdown',down);
    host.addEventListener('contextmenu',preventMenu);
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
    window.addEventListener('blur',blur);
    window.addEventListener('keydown',key);
    function preventMenu(event:MouseEvent){event.preventDefault();}
    return()=>{
      interruptFocus();focusMyMat.current=()=>{};focusOpponent.current=()=>{};resetCamera.current=()=>{};eyeTapHandler.current=()=>{};eyeHoldHandler.current=()=>{};castleTapHandler.current=()=>{};castleHoldHandler.current=()=>{};castleFocusHandler.current=()=>{};cycleOpponentHandler.current=()=>{};toggleRelationHandler.current=()=>{};
      host.removeEventListener('wheel',wheel);
      host.removeEventListener('pointerdown',selectOpponent,true);
      host.removeEventListener('pointerdown',down);
      host.removeEventListener('contextmenu',preventMenu);
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
      window.removeEventListener('blur',blur);
      window.removeEventListener('keydown',key);
    };
  },[]);
  return <div ref={mount} className="pixi-host" role="img" aria-label="Interactive twelve-seat tabletop. Drag empty space to move the camera; drag cards to move them. Hold the eye control for a quarter second to choose an opponent.">
    {isBattleView(eyeView.kind)&&<div className="opponent-battle-divider" aria-hidden="true"/>}
    {coinEditing&&<input autoFocus className="sennet-coin-editor" type="text" inputMode="text" maxLength={20}
      aria-label="Edit coin inscription" value={coinDraft}
      onFocus={e=>e.currentTarget.select()}
      onChange={e=>{if(validCoinText(e.target.value))setCoinDraft(e.target.value);}}
      style={{left:coinEditing.x,top:coinEditing.y}} onPointerDown={e=>e.stopPropagation()}
      onBlur={commitCoinEdit} onKeyDown={e=>{
        if(e.key==='Enter'){e.preventDefault();commitCoinEdit();}
        if(e.key==='Escape')setCoinEditing(null);
      }}/>}

    {state.kind==='tcg'&&actionScreenVisible&&
      <div ref={node=>{
        actionLcdRef.current=node;
        if(node){
          const geometry=actionScreenLatest.current;
          node.style.left=geometry.left+'px';
          node.style.top=geometry.y+'px';
          node.style.width=(geometry.width/Math.max(.0001,geometry.heightScale))+'px';
          node.style.transform=`translateY(-50%) scale(${geometry.heightScale})`;
        }
      }} className="sennet-action-lcd" style={{transformOrigin:'left center'}}
      role="group" aria-label="Latest action with undo and redo"
        onPointerDown={event=>event.stopPropagation()}>
        <button type="button" className="sennet-action-lcd-button"
          onClick={onUndo} disabled={!canUndo}
          aria-label="Undo last action" title="Undo">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
            stroke="currentColor" strokeWidth="2.15" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5"/>
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
          </svg>
        </button>
        <div className="sennet-action-lcd-display" role="status"
          aria-live="polite" title={selectionReadout||latestAction}>
          <span>{selectionReadout||latestAction}</span>
        </div>
        {selectionReadout&&<button type="button" className="sennet-action-lcd-roll" title="Throw selected dice"
          onClick={()=>{const die=DICE_TYPES.find(s=>diceQuantities[s]);
            if(die!==undefined)throwDiceNow.current(die,0,0,240);}}>ROLL</button>}
        <button type="button" className="sennet-action-lcd-button"
          onClick={onRedo} disabled={!canRedo}
          aria-label="Redo last undone action" title="Redo">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
            stroke="currentColor" strokeWidth="2.15" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5"/>
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>
          </svg>
        </button>
      </div>}

    {dice3DError&&<div className="sennet-dice-engine-error" role="alert">
      {dice3DError}<button onClick={()=>setDice3DError(null)}>Dismiss</button>
    </div>}
    {coinMenu&&<div className="sennet-coin-radial-layer" onPointerDown={e=>{
      if(e.target===e.currentTarget){setCoinMenu(null);setCoinColorsOpen(false);}
      e.stopPropagation();
    }}>
      <div className="sennet-coin-radial" style={{left:coinMenu.x,top:coinMenu.y}}>
        <svg viewBox="0 0 116 116" aria-hidden="true" focusable="false" className="sennet-coin-ring">
          {COIN_ACTIONS.map((_,i)=><path key={i} d={coinSector(i).d}
            className="sennet-coin-sector"/>)}
        </svg>
        {COIN_ACTIONS.map((action,i)=>{
          const p=coinSector(i);
          const shown=COIN_RADIAL_LABELS[i];
          return <button type="button" key={i}
            className="sennet-coin-action-button"
            aria-label={'Position '+(i+1)+': '+action}
            title={action}
            style={{left:p.x,top:p.y}}
            onPointerDown={e=>{e.stopPropagation();}}
            onClick={e=>{e.preventDefault();e.stopPropagation();applyCoinAction(i);}}>
            {shown}
          </button>;
        })}
        <button type="button" className="sennet-coin-radial-center-hold"
          title="Hold for 0.25 seconds to close"
          aria-label="Hold coin center to close radial"
          onPointerDown={e=>{
            e.stopPropagation();
            clearRadialCenterHold();
            radialCenterHold.current=window.setTimeout(()=>{
              radialCenterHold.current=null;
              setCoinMenu(null);setCoinColorsOpen(false);
            },250);
          }}
          onPointerUp={e=>{e.stopPropagation();clearRadialCenterHold();}}
          onPointerCancel={e=>{e.stopPropagation();clearRadialCenterHold();}}
          onPointerLeave={e=>{e.stopPropagation();clearRadialCenterHold();}}/>
        {coinColorsOpen&&<div className="sennet-coin-palette">
          <strong>Coin color</strong>
          <div className="sennet-coin-palette-swatches">
            {COIN_PALETTE.map(color=><button key={color} type="button"
              aria-label={'Choose '+color} style={{background:color}}
              onClick={()=>applyCoinColor(color)}/>)}
          </div>
          <label>Custom <input aria-label="Custom coin color" type="color"
            defaultValue={coinMenu.type==='copy'?
              state.objects.find(o=>o.id===coinMenu.id)?.color??'#d8b979':
              coinSources.colors[coinMenu.index===1?0:1]??'#d8b979'}
            onChange={e=>applyCoinColor(e.target.value)}/></label>
        </div>}
      </div>
    </div>}
    {drawer&&<div data-outward={playerTagGeometry.outward} className="sennet-player-tag-anchor" style={{left:playerTagGeometry.x,top:playerTagGeometry.y,'--seat-scale':playerTagGeometry.scale,'--drawer-width':`${playerTagGeometry.width}px`} as React.CSSProperties}>{drawer}</div>}
    {state.kind==='tcg'&&!readonly&&seat>=0&&seat<12&&(wheelMode!=='hold'||radialWheel)&&<div className="sennet-radial-overlay">
      <div className={wheelMode==='docked'?'sennet-radial-camera-anchor':'sennet-radial-free-anchor'}
        ref={node=>{
          dockedWheelRef.current=wheelMode==='docked'?node:null;
          if(node&&wheelMode==='docked'){
            const geometry=dockedWheelGeometry.current;
            const factor=geometry.size/180;
            node.style.transform=`translate3d(${geometry.x-90*factor}px,${geometry.y}px,0) scale(${factor})`;
          }
        }}>
      <CardRadialWheel
        x={wheelMode==='docked'?90:wheelMode==='mobile'?Math.max(76,Math.min(viewport.width-76,dockPosition?.x??viewport.width-88)):radialWheel!.x} y={wheelMode==='docked'?0:wheelMode==='mobile'?Math.max(76,Math.min(viewport.height-76,dockPosition?.y??viewport.height-88)):radialWheel!.y} size={wheelMode==='docked'?180:wheelMode==='mobile'?152:radialWheel!.size} docked={wheelMode==='mobile'} half={wheelMode==='docked'} onMoveDock={saveDockPosition}
        count={wheelMode!=='hold'?(selectedIds.length||Number(!!selected)):radialWheel!.ids.length}
        allLocked={(wheelMode!=='hold'?(selectedIds.length?selectedIds:(selected?[selected]:[])):radialWheel!.ids).every(id=>state.objects.find(o=>o.id===id)?.locked)}
        pointerId={wheelMode!=='hold'?null:radialWheel!.pointerId}
        tapLabel={(wheelMode!=='hold'?(selectedIds.length?selectedIds:(selected?[selected]:[])):radialWheel!.ids).some(id=>{const card=state.objects.find(o=>o.id===id);return card&&((card.rotation%360)+360)%360!==0;})?'Untap':'Tap'}
        onChoose={action=>{
          const targets=wheelMode!=='hold'?(selectedIds.length?selectedIds:(selected?[selected]:[])):radialWheel!.ids;
          if(targets.length)callbacks.current.onRadialAction(targets,action);
          if(wheelMode==='hold')setRadialWheel(null);
          wheelPointer.current=null;
        }}
        onCancel={()=>{if(wheelMode==='hold')setRadialWheel(null);wheelPointer.current=null;}}
      />
      </div>
    </div>}
    {gestureMenu&&(()=>{
      const item=state.objects.find(o=>o.id===gestureMenu.id);
      if(!item)return null;
      const ownerLocked=!!item.owner&&item.owner!=='local'&&item.owner!==actorId;
      const actions=cardGestureOptions(item,state.kind);
      const fire=(action:CardGestureAction)=>{
        if(action==='inspect'){setGestureMenu(m=>m?{...m,inspect:!m.inspect}:null);return;}
        if(ownerLocked)return;
        callbacks.current.onGestureAction(item.id,action);
        if(action!=='counter-add'&&action!=='counter-remove')setGestureMenu(null);
      };
      return <div className="tcg-card-gesture-layer" onPointerDown={e=>e.stopPropagation()}>
        <div className="tcg-card-action-menu" style={{left:gestureMenu.x,top:gestureMenu.y}}
          role="dialog" aria-label={'Card actions for '+item.name}>
          <header><span><strong>{item.name}</strong><small>{item.zone} · {item.kind}
            {item.counters?' · '+item.counters+' counters':''}</small></span>
            <button type="button" aria-label="Close card actions"
              onClick={()=>setGestureMenu(null)}>×</button></header>
          {ownerLocked&&<p className="tcg-menu-locked">This card belongs to another player. Its actions are locked.</p>}
          {(['quick','piles','other'] as const).map(group=>{
            const options=actions.filter(a=>a.group===group);
            return options.length>0?<section key={group}>
              <small className="tcg-menu-group">{group==='quick'?'CARD':group==='piles'?'PILES':'MORE'}</small>
              <div className="tcg-card-action-grid">{options.map(option=>
                <button key={option.action} type="button"
                  disabled={ownerLocked&&option.action!=='inspect'}
                  onClick={()=>fire(option.action)}>{option.label}</button>)}</div>
            </section>:null;
          })}
          {gestureMenu.inspect&&<div className="tcg-card-inspect">
            {item.faceUrl&&<img src={item.faceUrl} alt={item.name}/>}
            <p>{item.description||'No additional card details.'}</p>
          </div>}
          <footer>Drag: move one · Hold + drag: stack · Double-tap: tap/untap</footer>
        </div>
      </div>;
    })()}
    {/* Our own name/seat tag lives in the unified book shelf outside
        the canvas in ALL views. Do not create a duplicate bottom tag. */}
    {eyeView.kind==='targeting'&&<div className="opponent-target-prompt" role="status">
      <span>Choose an opponent's mat or seat</span>
      <button type="button" onClick={()=>{selectView({kind:'overview',opponent:null});resetCamera.current();}}>Cancel</button>
    </div>}
  </div>;
}
