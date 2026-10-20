import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Application,Assets,Circle,Container,Graphics,Point,Rectangle,Sprite,Text} from 'pixi.js';
import CardRadialWheel from './CardRadialWheel';
import {wheelPosition,radialMembership,radialTapMembership,type RadialAction} from '../lib/radialWheel.ts';
import {cardGestureOptions,isDoubleCardTap,GESTURE_HOLD_MS,GESTURE_MOVE_THRESHOLD,type CardGestureAction} from '../lib/cardGestures';
import {cardStackMembers,nearestFrameIndex,playerSeatRotation,viewerTableRotation,tcgMatCells,tcgMatRegions,tcgMatOrigin,opponentAtTablePoint,groupedMatchupLayout,oneOnOneMatchupLayout,castleGridLayout,castleIndependentFocusLayout,castleArrowsVisible,nextCastleAllySeat,nextCastleFocusedSeat,type CastleSideFocus,opponentAcrossDivider,BATTLEFIELD_PLAYMAT_PADDING,battlefieldFitBounds,toggleOpponentRelation,type OpponentRelation,type CastleMode,neighboringOpponentSeat,centerMergeKey,tcgSnapPoint,tcgDropZone,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,TCG_ROW_COLORS,isTcgRemoveDrop,tcgRegionLabel,tcgMatLocal,tcgMatWorld,BOARD_CENTER,BOARD_W,TABLE_APOTHEM,TABLE_SEAT_RADIUS,TABLE_VIEW_RADIUS,MIN_TABLE_ZOOM,clampTableZoom,clampTablePan,type GameState,type Player,type TableObject,type PlaymatAppearance,type PlaymatSectionStyle,playmatSectionIndex,playmatAppearanceForSeat,opponentRelationButtonPosition,OPPONENT_RELATION_COLORS,OPPONENT_RELATION_BUTTON_RADIUS,OPPONENT_RELATION_BUTTON_HIT_RADIUS,viewButtonPosition,VIEW_BUTTON_RADIUS,VIEW_BUTTON_HIT_RADIUS,tcgSettingsButtonPosition} from '@sennet/core';
interface Props{bookDesign:'tiny'|'dragon'|'journal'|'arcane'|'strapped';bookDock:'left'|'right'|'free';bookOffset:{x:number;y:number};onBookMove:(point:{x:number;y:number})=>void;onBookOpen:()=>void;drawer?:ReactNode;wheelMode:'mobile'|'docked'|'hold';state:GameState;seat:number;playerName:string;actorId:string;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number)=>void;onMoveStack:(id:string,x:number,y:number)=>void;onMoveSelection:(ids:string[],anchorId:string,x:number,y:number)=>void;onDrawMat:()=>void;onOpenTcgSettings:()=>void;onCardAction:(id:string,action:"tap"|"flip")=>void;onGestureAction:(id:string,action:CardGestureAction)=>void;onRadialAction:(ids:string[],action:RadialAction,destination?:string)=>void;playmat:PlaymatAppearance;mergeOpacity:number;mergeHoverMs:number;onMergeCenter:(seat:number,boundary:number,merged:boolean)=>void;onViewChange?:(view:{x:number;y:number;scale:number})=>void;readonly?:boolean}
const FONT='Inter, ui-sans-serif, system-ui, sans-serif';
// Pixi book gestures and DOM camera gestures must share one pointer guard.
let activeBookPointer:number|null=null;
const COLORS={wood:0x79593b,woodDark:0x342b23,felt:0x183d39,line:0x426761,gold:0xd6b681};
const rgb=(s:string)=>parseInt(s.replace('#',''),16)||0x95b7b2;
/** Integrate a soft resistance band across each wall of the two wooden trays.
 * The integral is continuous: objects can pass through the wall with sustained
 * dragging but never hit an artificial hard stop or teleport across it. */
function resistTrayWalls(start:{x:number;y:number},target:{x:number;y:number},seat:number){
 const origin=tcgMatOrigin(seat),c=Math.cos(origin.angle),sn=Math.sin(origin.angle);
 const local=(p:{x:number;y:number})=>{const dx=p.x-origin.x,dy=p.y-origin.y;
   return {x:dx*c+dy*sn,y:-dx*sn+dy*c};};
 const a=local(start),b=local(target);
 const top=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
 const bottom=TCG_MAT_HEIGHT/2;
 const width=TCG_MAT.cardWidth;
 const band=7,strength=.68;
 const soften=(from:number,to:number,wall:number)=>
   strength*band*(Math.atan((to-wall)/band)-Math.atan((from-wall)/band));
 let x=b.x,y=b.y;
 for(const side of [-1,1]){
   const cx=side*(TCG_MAT_WIDTH/2+width/2+3);
   const lo=cx-width/2-4,hi=cx+width/2+4;
   // Each rectangle has a resistant inner AND outer wall, including ends.
   if(Math.max(a.y,b.y)>=top-10&&Math.min(a.y,b.y)<=bottom+10){
     for(const wall of [lo,hi])x-=soften(a.x,b.x,wall);
   }
   if(Math.max(a.x,b.x)>=lo-10&&Math.min(a.x,b.x)<=hi+10){
     for(const wall of [top,bottom])y-=soften(a.y,b.y,wall);
   }
 }
 return {x:origin.x+x*c-y*sn,y:origin.y+x*sn+y*c};
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
  board:Container,state:GameState,viewerSeat:number,readonly:boolean,
  opacity:number,hoverMs:number,playmat:PlaymatAppearance,
  bookDesign:Props['bookDesign'],bookDock:Props['bookDock'],bookOffset:Props['bookOffset'],onBookOpen:()=>void,onBookMove:Props['onBookMove'],
  onToggleRelation:(seat:number,choice:'enemy'|'ally')=>void,
  onFocusCastleSeat:(seat:number)=>void,
  selectedOpponent:number|null,relations:Readonly<Record<number,OpponentRelation>>,
  onMerge:(seat:number,boundary:number,merged:boolean)=>void,
  onEyeTap:()=>void,onEyeHold:()=>void,onCastleTap:()=>void,onCastleHold:()=>void,onOpenTcgSettings:()=>void,castleActive:boolean,castleMode:CastleMode|'focus',castleBaseMode:CastleMode,focused:Readonly<CastleSideFocus>,onCycleOpponent:(direction:'left'|'right',sourceSeat:number)=>void,onControlDown:(pointerId:number)=>void,
  hoverTimers:Set<number>,seatLayers:Map<number,Container>|null,
  eyeHoldMs:number,selectedEnemy:number|null
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
    mat.addChild(new Graphics()
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
      const finishes={
        walnut:[0x34251d,0x6b4830,0x120e0d,0xb68a59],
        carved:[0x765033,0xaf8050,0x3c2330,0xe3bf83],
        maple:[0xb88551,0xe0ba80,0x715037,0xf2d6a4],
        ebony:[0x15191a,0x383335,0x090d0e,0x907b71],
        mahogany:[0x4b201d,0x883c31,0x240f13,0xc88164]
      } as const;
      const [wood,rim,well,shine]=finishes[playmat.sideBoxStyle??'walnut'];
      for(const side of [-1,1]){
        const cx=side*(TCG_MAT_WIDTH/2+trayW/2+3),cy=(trayTop+trayBottom)/2;
        const tray=new Graphics()
          .roundRect(cx-trayW/2-4,cy-trayH/2-5,trayW+8,trayH+10,7)
          .fill({color:wood}).stroke({color:shine,width:1.6})
          .roundRect(cx-trayW/2,cy-trayH/2,trayW,trayH,4)
          .fill({color:rim})
          .roundRect(cx-trayW/2+7,cy-trayH/2+7,trayW-14,trayH-14,3)
          .fill({color:well}).stroke({color:0x08090a,width:2})
          .moveTo(cx-trayW/2+5,cy-trayH/2+5)
          .lineTo(cx+trayW/2-5,cy-trayH/2+5)
          .stroke({color:shine,width:2,alpha:.72});
        if(playmat.sideBoxStyle==='carved'){
          for(let i=0;i<6;i++){
            const y=cy-trayH/2+16+i*(trayH-32)/5;
            tray.moveTo(cx-trayW/2+2,y).lineTo(cx-trayW/2+6,y+5)
              .moveTo(cx+trayW/2-2,y).lineTo(cx+trayW/2-6,y+5)
              .stroke({color:shine,width:1,alpha:.8});
          }
        }
        tray.eventMode='none';mat.addChild(tray);
      }
    }
    if(seat===viewerSeat){
      const trayTop=-TCG_MAT_HEIGHT/2+(TCG_MAT.rowHeight+TCG_MAT.gap);
      const trayBottom=TCG_MAT_HEIGHT/2;
      const side=bookDock==='left'?-1:1;
      const bw=TCG_MAT.cardWidth*.63,bh=TCG_MAT.cardHeight*.64;
      const bx=side*(TCG_MAT_WIDTH/2+TCG_MAT.cardWidth/2+3)+bookOffset.x;
      const by=trayBottom-bh/2-9+bookOffset.y;
      const palettes={
        tiny:[0x7e3035,0xd5a45d,0x251919],
        dragon:[0x124960,0x3fbbcb,0x081c28],
        journal:[0x751e35,0xc97999,0x2b1025],
        arcane:[0x4a321f,0xe8c16c,0x271b15],
        strapped:[0x70412a,0xa78960,0x332019]
      } as const;
      const [cover,foil,spine]=palettes[bookDesign];
      const book=new Container();book.position.set(bx,by);book.eventMode='static';book.cursor='grab';
      // Layered miniature hardcover: beveled boards, visible ivory page block,
      // leather spine, corner furniture, gilt tooling and raised medallion.
      const face=new Graphics()
        .roundRect(-bw/2+2,-bh/2+4,bw+1,bh,4)
        .fill({color:0x2a1b15}).stroke({color:0x080708,width:1.5})
        .roundRect(-bw/2+4,-bh/2+1,bw-3,bh-1,3)
        .fill({color:0xf1deb3}).stroke({color:0xb9a382,width:1})
        .roundRect(-bw/2+3,-bh/2+3,bw-5,bh-7,2)
        .stroke({color:0xc7b590,width:.65,alpha:.9})
        .roundRect(-bw/2-2,-bh/2-3,bw,bh,4)
        .fill({color:cover}).stroke({color:foil,width:1.3})
        .roundRect(-bw/2-2,-bh/2-3,8,bh,3)
        .fill({color:spine}).stroke({color:foil,width:.7})
        .roundRect(-bw/2+9,-bh/2+3,bw-17,bh-12,2)
        .stroke({color:foil,width:1,alpha:.95})
        .roundRect(-bw/2+12,-bh/2+6,bw-23,bh-18,2)
        .stroke({color:foil,width:.5,alpha:.68});
      for(const v of [-1,1]){
        for(const h of [-1,1]){
          const x=v<0?-bw/2+10:bw/2-8;
          const y=h<0?-bh/2+5:bh/2-9;
          face.circle(x,y,1.7).fill({color:foil})
            .circle(x,y,.65).fill({color:0x402c25});
        }
      }
      if(bookDesign==='tiny'||bookDesign==='strapped'){
        face.roundRect(-bw/2-2,-bh/2+8,bw,8,1)
          .fill({color:spine,alpha:.9}).stroke({color:foil,width:.7});
        face.roundRect(-bw/2-2,bh/2-13,bw,7,1)
          .fill({color:spine,alpha:.9}).stroke({color:foil,width:.7});
      }
      if(bookDesign==='dragon'||bookDesign==='journal'){
        face.moveTo(10,-bh/2+9).lineTo(bw/2-12,-3)
          .lineTo(10,bh/2-14).stroke({color:foil,width:1.4,alpha:.8});
      }
      if(bookDesign==='arcane'){
        for(let i=0;i<8;i++){
          const theta=i*Math.PI/4;
          face.moveTo(3+Math.cos(theta)*11,-2+Math.sin(theta)*11)
            .lineTo(3+Math.cos(theta)*15,-2+Math.sin(theta)*15)
            .stroke({color:foil,width:.85});
        }
      }
      const emblem=label(bookDesign==='dragon'?'♜':bookDesign==='arcane'?'✧':'✦',
        15,foil,'bold');
      emblem.position.set(3,-2);
      const titlePlate=label('SENNET',5.3,foil,'bold');
      titlePlate.position.set(3,bh/2-15);
      book.addChild(face,emblem,titlePlate);
      let release:((event:PointerEvent)=>void)|null=null;
      book.on('pointerdown',e=>{
        if(e.button!==0)return;
        e.stopPropagation();
        activeBookPointer=e.pointerId;
        const stage=document.querySelector<HTMLCanvasElement>('.pixi-host canvas');
        if(!stage){activeBookPointer=null;return;}
        const rect=stage.getBoundingClientRect();
        const startX=e.global.x,startY=e.global.y;
        const originalX=book.position.x,originalY=book.position.y;
        const initialOffset={...bookOffset};
        let moved=false;
        const onMove=(event:PointerEvent)=>{
          if(event.pointerId!==e.pointerId)return;
          event.stopPropagation();
          if(event.cancelable)event.preventDefault();
          const global=new Point((event.clientX-rect.left)*stage.clientWidth/rect.width,
            (event.clientY-rect.top)*stage.clientHeight/rect.height);
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
          if(moved)onBookMove({x:initialOffset.x+book.position.x-originalX,
            y:initialOffset.y+book.position.y-originalY});
          else if(event.type!=='pointercancel')onBookOpen();
        };
        release=onUp;
        window.addEventListener('pointermove',onMove,true);
        window.addEventListener('pointerup',onUp,true);
        window.addEventListener('pointercancel',onUp,true);
      });
      book.on('destroyed',()=>{if(release)activeBookPointer=null;});
      mat.addChild(book);
      // Capture the drag before the table background can initiate camera pan.
      book.hitArea=new Rectangle(-bw/2-5,-bh/2-7,bw+10,bh+14);
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
      base.eventMode='none';mat.addChild(base);
      const spanImage=seatPlaymat.imageMode==='span';
      const imageId=spanImage?seatPlaymat.spanningImageId:section.imageId;
      const image=seatPlaymat.images[imageId];
      if(image)addPlaymatImage(mat,base,x,y,w,h,image,spanImage);
      addPlaymatFinish(mat,x,y,w,h,section,seat*12+cell.row*3+cell.column,isCenterColumn);
      // Remove colored grid lines from both OUTER columns. Keep the
      // colored guide lines in the middle playing area unchanged.
      if(isCenterColumn){
        const grid=new Graphics();
        for(let gx=x+10;gx<x+w-5;gx+=10)grid.moveTo(gx,y+5).lineTo(gx,y+h-5);
        for(let gy=y+10;gy<y+h-5;gy+=10)grid.moveTo(x+5,gy).lineTo(x+w-5,gy);
        grid.stroke({color:accent,alpha:merged?.08:.03,width:.5});
        grid.eventMode='none';mat.addChild(grid);
      }
      const text=label(tcgRegionLabel(cell.row,cell.column,cell.lastRow),cell.column!==1?8:merged?12:10,accent, 'bold');
      text.style.fontFamily='Orbitron, '+FONT;
      text.alpha=merged?1:.6;text.eventMode='none';
      // Center EVERY center-column label. Side labels face toward the
      // middle: left reads one way, right reads the opposite way.
      text.position.set(x+w/2,y+h/2);
      if(cell.column===0)text.rotation=-Math.PI/2;
      if(cell.column===2)text.rotation=Math.PI/2;
      mat.addChild(text);
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
      marker.addChild(new Graphics().circle(0,0,16)
        .fill({color:0x102b29,alpha:.9})
        .stroke({color:0xe5d4ac,width:1.5,alpha:.95}));
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
        button.addChild(new Graphics()
          .circle(0,0,16).fill({color:0x102b29,alpha:.96})
          .stroke({color:0xe5d4ac,alpha:.95,width:1.5}));
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
      eye.addChild(new Graphics()
        .circle(0,0,VIEW_BUTTON_RADIUS).fill({color:0x183a33,alpha:.96})
        .stroke({color:0xe4cf9d,alpha:1,width:1.5})
        .ellipse(0,0,10,6).stroke({color:0xf4e4bd,width:1.8})
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
      // Same size as the eye and merge controls. Castle switches to the
      // classified-only battlefield, excluding every unmarked opponent.
      const castle=new Container();
      const castlePosition=viewButtonPosition('castle');
      castle.position.set(castlePosition.x,castlePosition.y);
      castle.eventMode='static';
      castle.cursor='pointer';
      castle.hitArea=new Circle(0,0,VIEW_BUTTON_HIT_RADIUS);
      castle.addChild(new Graphics().circle(0,0,VIEW_BUTTON_RADIUS)
        .fill({color:castleActive?0x426750:0x183a33,alpha:.96})
        .stroke({color:castleActive?0xf5d69a:0xe4cf9d,
          width:castleActive?2.4:1.5,alpha:1}));
      const castleMark=new Graphics();
      // Crenellated wall with two towers and a dark arched gate.
      castleMark
        .rect(-10,-7,5,5).rect(-3,-7,6,5).rect(5,-7,5,5)
        .fill(0xf4e4bd)
        .rect(-10,-3,20,12).fill(0xf4e4bd)
        .rect(-12,-10,7,5).rect(5,-10,7,5).fill(0xf4e4bd)
        .rect(-12,-6,7,15).rect(5,-6,7,15).fill(0xf4e4bd)
        .roundRect(-3,2,6,8,3).fill(0x183a33)
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
      settings.addChild(new Graphics()
        .circle(0,0,VIEW_BUTTON_RADIUS).fill({color:0x183a33,alpha:.96})
        .stroke({color:0xe4cf9d,alpha:1,width:1.5}));
      // Eight-tooth fine-line gear, centered on the same 32-unit disk.
      const gear=new Graphics();
      for(let i=0;i<32;i++){
        const angle=i*Math.PI/16-Math.PI/2;
        const radius=i%4===1||i%4===2?10.8:8.2;
        const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
        if(i===0)gear.moveTo(x,y);else gear.lineTo(x,y);
      }
      gear.closePath().fill({color:0xf4e4bd});
      gear.circle(0,0,4).fill(0x183a33)
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
          button.addChild(new Graphics()
            .circle(0,0,OPPONENT_RELATION_BUTTON_RADIUS)
            .fill({color:active?palette.active:palette.idle,alpha:1})
            .stroke({color:active?palette.outlineActive:palette.outlineIdle,
              alpha:1,width:active?2.5:1.5}));
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
function drawBackground(board:Container,state:GameState,seat:number,playerName:string,readonly:boolean,
  opacity:number,hoverMs:number,onMerge:(seat:number,boundary:number,merged:boolean)=>void,
  onEyeTap:()=>void,onEyeHold:()=>void,onCastleTap:()=>void,onCastleHold:()=>void,onOpenTcgSettings:()=>void,onCycleOpponent:(direction:'left'|'right',sourceSeat:number)=>void,onToggleRelation:(seat:number,choice:'enemy'|'ally')=>void,onFocusCastleSeat:(seat:number)=>void,onControlDown:(id:number)=>void,hoverTimers:Set<number>,playmat:PlaymatAppearance,
  bookDesign:Props['bookDesign'],bookDock:Props['bookDock'],bookOffset:Props['bookOffset'],onBookOpen:()=>void,onBookMove:Props['onBookMove'],
  duelOpponent:number|null,castleActive:boolean,castleMode:CastleMode|'focus',
  castleBaseMode:CastleMode,focused:Readonly<CastleSideFocus>,
  viewport:{width:number;height:number},
  relations:Readonly<Record<number,OpponentRelation>>,eyeHoldMs:number,
  selectedEnemy:number|null):Map<number,Container>|null{
  const players=state.players;
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
  const layers=duelOpponent===null&&!castleActive
    ?null:makeDuelSeatLayers(board,seat,duelOpponent,relations,castleActive,
      castleMode,castleBaseMode,focused,viewport,selectedEnemy);
  if(state.kind==='tcg')drawTcgMats(board,state,seat,readonly,opacity,hoverMs,playmat,
    bookDesign,bookDock,bookOffset,onBookOpen,onBookMove,
    onToggleRelation,onFocusCastleSeat,duelOpponent,relations,onMerge,
    onEyeTap,onEyeHold,onCastleTap,onCastleHold,onOpenTcgSettings,castleActive,castleMode,
    castleBaseMode,focused,onCycleOpponent,onControlDown,hoverTimers,layers,
    eyeHoldMs,selectedEnemy);
  for(let i=0;i<12;i++){
    // Retractable HTML edge labels replace physical chair/name blocks
    // in the versus mode, preserving the full play area for cards.
    if(layers)continue;
    const angle=i*Math.PI/6-Math.PI/2;
    const x=BOARD_CENTER+(TABLE_APOTHEM+34)*Math.cos(angle);
    const y=BOARD_CENTER+(TABLE_APOTHEM+34)*Math.sin(angle);
    const mine=i===seat;
    // The local seat is represented by its interactive book-drawer tag.
    if(mine)continue;
    const player=players.find(p=>p.seat===i);
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
  }
  return layers;
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
function createPiece(o:TableObject,isSelected:boolean){
  const box=new Container();box.position.set(o.x,o.y);box.eventMode=o.locked?'none':'static';box.cursor=o.locked?'default':'grab';
  const shadow=new Graphics().ellipse(4,13,33,12).fill({color:0x050c0b,alpha:.32});box.addChild(shadow);
  if(o.kind==='deck-box'){
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
export default function TableCanvas({bookDesign,bookDock,bookOffset,onBookMove,onBookOpen,drawer,wheelMode,state,seat,playerName,actorId,selected,onSelect,onMove,onMoveStack,onMoveSelection,onDrawMat,onOpenTcgSettings,onCardAction,onGestureAction,onRadialAction,mergeOpacity,mergeHoverMs,playmat,onMergeCenter,onViewChange,readonly=false}:Props){
  const [ready,setReady]=useState(false);
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight});
  // Docked radial follows the actual hand-zone boundary in playmat/world
  // coordinates, not viewport dimensions. Camera zoom is its only scaling.
  const [dockGeometry,setDockGeometry]=useState({x:0,y:0,size:0});
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
  const callbacks=useRef({onSelect,onMove,onMoveStack,onMoveSelection,onDrawMat,onOpenTcgSettings,onCardAction,onGestureAction,onRadialAction,onMergeCenter,onViewChange});callbacks.current={onSelect,onMove,onMoveStack,onMoveSelection,onDrawMat,onOpenTcgSettings,onCardAction,onGestureAction,onRadialAction,onMergeCenter,onViewChange};
  type ActiveDrag={
    id:string;pointerId:number;visual:Container;card:boolean;
    x:number;y:number;startX:number;startY:number;
    startClientX:number;startClientY:number;moved:boolean;
    whole:boolean;held:boolean;wheel:boolean;locked:boolean;selection:boolean;
    stackIds:string[];members:{id:string;x:number;y:number}[];
    timer:number|null;
  };
  const drag=useRef<ActiveDrag|null>(null);
  const visuals=useRef(new Map<string,Container>());
  const cancelActiveDrag=useRef<()=>void>(()=>{});
  const snapHighlight=useRef<Graphics|null>(null);
  const currentKind=useRef(state.kind);currentKind.current=state.kind;
  const currentState=useRef(state);currentState.current=state;
  const playmatRef=useRef(playmat);playmatRef.current=playmat;
  const oldLocations=useRef(new Map<string,{x:number;y:number}>());
  const animations=useRef<number[]>([]);
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
          setDockGeometry(previous=>
            Math.abs(previous.x-next.x)<.35&&Math.abs(previous.y-next.y)<.35&&
            Math.abs(previous.size-next.size)<.35?previous:next);
        }

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
    visuals.current.clear();
    snapHighlight.current=null;
    board.rotation=viewerTableRotation(seat);
    const seatGroups=drawBackground(board,state,seat,playerName,readonly,mergeOpacity,mergeHoverMs,
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
      viewport,relations,250,eyeView.castleSelectedEnemy??null);
    duelLayers.current=seatGroups;
    updateView.current();
    const snapOverlay=new Graphics();snapOverlay.eventMode='none';board.addChild(snapOverlay);snapHighlight.current=snapOverlay;
    // Every TCG seat has its own physical DECK pocket; sending a card
    // to the top/bottom via gestures must not leave an extra visible card
    // because its source ID uses a different prefix than that deck.
    const pileKey=(o:TableObject)=>state.kind==='tcg'?
      'seat-'+String(o.matSeat??seat):o.id.split('-')[0];
    const deckTop=new Map<string,TableObject>();
    for(const o of state.objects.filter(o=>o.zone==='DECK').sort((a,b)=>a.order-b.order))
      if(!deckTop.has(pileKey(o)))deckTop.set(pileKey(o),o);
    const visible=state.objects.filter(o=>o.zone!=='DECK'||
      deckTop.get(pileKey(o))?.id===o.id);
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
    // Use browser <img> elements for actual card art, just like the Deck
    // Builder. Third-party card art often disallows WebGL/CORS texture uploads
    // even while rendering perfectly in an ordinary HTML image.
    const artLayers:{piece:Container;img:HTMLImageElement}[]=[];
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
    };
    session.current?.app.ticker.add(syncCardArtwork);
    for(const obj of visible){
      const assumedOwner=obj.matSeat??
        (obj.owner===actorId||obj.owner==='local'?seat:
          state.players.find(p=>p.id===obj.owner)?.seat)??
        (state.kind==='tcg'?tcgSnapPoint(obj.x,obj.y,state.centerMerges,true)?.seat:undefined);
      if(seatGroups&&!seatGroups.has(assumedOwner??-1))continue;
      const piece=createPiece(obj,obj.id===selected||selectedSet.current.has(obj.id));
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
      const old=oldLocations.current.get(obj.id);
      if(old && (Math.abs(old.x-obj.x)>2 || Math.abs(old.y-obj.y)>2)){
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
        const img=document.createElement('img');
        img.alt=obj.faceUp?obj.name:obj.name+' card back';
        img.draggable=false;
        img.decoding='async';
        img.loading='eager';
        img.style.cssText='position:absolute;left:0;top:0;width:62px;height:88px;'+
          'display:none;pointer-events:none;user-select:none;object-fit:fill;'+
          'transform-origin:0 0;border-radius:6px;will-change:transform;z-index:5';
        img.onload=()=>{if(img.isConnected)img.style.display='block';};
        img.onerror=()=>{img.style.display='none';};
        imagesRoot.appendChild(img);
        img.src=url;
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
        piece.eventMode='static';piece.cursor=obj.locked?'pointer':'grab';
        piece.on('pointerdown',(e)=>{
          if(e.button!==0)return;
          e.stopPropagation();
          cancelActiveDrag.current();
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
            stackIds,
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
    }
    // Rendering on state change intentionally reconstructs a small scene. Large games will use
    // keyed incremental sprites and texture budgets without changing the core state protocol.
    oldLocations.current=new Map(state.objects.map(o=>[o.id,{x:o.x,y:o.y}]));
    app.renderer.render(app.stage);
    syncCardArtwork();
    return ()=>{
      session.current?.app.ticker.remove(syncCardArtwork);
      for(const layer of artLayers){layer.img.onload=null;layer.img.onerror=null;layer.img.remove();}
    };
  },[state,seat,playerName,actorId,selected,selectedIds,readonly,ready,mergeOpacity,mergeHoverMs,playmat,bookDesign,bookDock,bookOffset,eyeView,relations,viewport]);
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
      // Apply gentle resistance to crossings of either side of each tray.
      // Never block the move; a longer pull carries objects through.
      if(currentKind.current==='tcg'){
        const resisted=resistTrayWalls(
          {x:d.startX,y:d.startY},{x:d.x,y:d.y},seatRef.current);
        d.x=Math.max(0,Math.min(BOARD_W,resisted.x));
        d.y=Math.max(0,Math.min(BOARD_W,resisted.y));
      }
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
        const cell=d.card&&currentKind.current==='tcg'?tcgSnapPoint(
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
        callbacks.current.onMove(d.id,Math.round(d.x),Math.round(d.y));
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
      // On sufficiently tall displays, the mat fills 96% of screen width.
      const widthFit=.96*w/TCG_MAT_WIDTH;
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
      const bounds=battlefieldFitBounds(lineup.columns);
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
      !!target.closest('.tcg-card-action-menu');
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
      if(event.target===session.current?.app.canvas&&!drag.current&&
        controlPointer.current!==event.pointerId){
        setGestureMenu(null);
        if(radialOpen.current&&Date.now()-radialOpenedAt.current>450)setRadialWheel(null);
        if(selectedSet.current.size){
          selectedSet.current=new Set();
          setSelectedIds([]);
          callbacks.current.onSelect(null);
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
      if(event.key==='Escape'){setGestureMenu(null);setRadialWheel(null);lastTap.current=null;}
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

    {drawer&&<div data-outward={playerTagGeometry.outward} className="sennet-player-tag-anchor" style={{left:playerTagGeometry.x,top:playerTagGeometry.y,'--seat-scale':playerTagGeometry.scale,'--drawer-width':`${playerTagGeometry.width}px`} as React.CSSProperties}>{drawer}</div>}
    {state.kind==='tcg'&&!readonly&&seat>=0&&seat<12&&(wheelMode!=='hold'||radialWheel)&&<div className="sennet-radial-overlay">
      <CardRadialWheel
        x={wheelMode==='docked'?dockGeometry.x:wheelMode==='mobile'?Math.max(76,Math.min(viewport.width-76,dockPosition?.x??viewport.width-88)):radialWheel!.x} y={wheelMode==='docked'?dockGeometry.y:wheelMode==='mobile'?Math.max(76,Math.min(viewport.height-76,dockPosition?.y??viewport.height-88)):radialWheel!.y} size={wheelMode==='docked'?dockGeometry.size:wheelMode==='mobile'?152:radialWheel!.size} docked={wheelMode==='mobile'} half={wheelMode==='docked'} onMoveDock={saveDockPosition}
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
