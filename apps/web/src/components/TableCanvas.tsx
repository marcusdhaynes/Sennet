import {useEffect,useRef,useState} from 'react';
import {Application,Assets,Circle,Container,Graphics,Point,Rectangle,Sprite,Text} from 'pixi.js';
import {cardStackMembers,nearestFrameIndex,playerSeatRotation,viewerTableRotation,tcgMatCells,tcgMatRegions,tcgMatOrigin,opponentAtTablePoint,groupedMatchupLayout,oneOnOneMatchupLayout,castleGridLayout,castleIndependentFocusLayout,castleArrowsVisible,nextCastleAllySeat,nextCastleFocusedSeat,type CastleSideFocus,opponentAcrossDivider,BATTLEFIELD_PLAYMAT_PADDING,battlefieldFitBounds,toggleOpponentRelation,type OpponentRelation,type CastleMode,neighboringOpponentSeat,centerMergeKey,tcgSnapPoint,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,TCG_ROW_COLORS,isTcgRemoveDrop,tcgRegionLabel,tcgMatLocal,tcgMatWorld,BOARD_CENTER,BOARD_W,TABLE_APOTHEM,TABLE_SEAT_RADIUS,TABLE_VIEW_RADIUS,MIN_TABLE_ZOOM,clampTableZoom,clampTablePan,type GameState,type Player,type TableObject,type PlaymatAppearance,type PlaymatSectionStyle,playmatSectionIndex,playmatAppearanceForSeat,opponentRelationButtonPosition,OPPONENT_RELATION_COLORS,OPPONENT_RELATION_BUTTON_RADIUS,OPPONENT_RELATION_BUTTON_HIT_RADIUS,viewButtonPosition,VIEW_BUTTON_RADIUS,VIEW_BUTTON_HIT_RADIUS,tcgSettingsButtonPosition} from '@sennet/core';
interface Props{state:GameState;seat:number;playerName:string;actorId:string;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number)=>void;onMoveStack:(id:string,x:number,y:number)=>void;onDrawMat:()=>void;onOpenTcgSettings:()=>void;onCardAction:(id:string,action:"tap"|"flip")=>void;stackHoldMs:number;playmat:PlaymatAppearance;mergeOpacity:number;mergeHoverMs:number;onMergeCenter:(seat:number,boundary:number,merged:boolean)=>void;onViewChange?:(view:{x:number;y:number;scale:number})=>void;readonly?:boolean}
const FONT='Inter, ui-sans-serif, system-ui, sans-serif';
const COLORS={wood:0x79593b,woodDark:0x342b23,felt:0x183d39,line:0x426761,gold:0xd6b681};
const rgb=(s:string)=>parseInt(s.replace('#',''),16)||0x95b7b2;
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
      // Gear stays physically attached to the lower-right border of
      // the viewer's playmat in ALL modes (overview, Eye, Castle).
      // It shares exactly the Eye/Castle button and hit radii.
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
    onToggleRelation,onFocusCastleSeat,duelOpponent,relations,onMerge,
    onEyeTap,onEyeHold,onCastleTap,onCastleHold,onOpenTcgSettings,castleActive,castleMode,
    castleBaseMode,focused,onCycleOpponent,onControlDown,hoverTimers,layers,
    eyeHoldMs,selectedEnemy);
  for(let i=0;i<12;i++){
    // Retractable HTML edge labels replace physical chair/name blocks
    // in the versus mode, preserving the full play area for cards.
    if(layers)continue;
    const angle=i*Math.PI/6-Math.PI/2;
    const x=BOARD_CENTER+TABLE_SEAT_RADIUS*Math.cos(angle);
    const y=BOARD_CENTER+TABLE_SEAT_RADIUS*Math.sin(angle);
    const mine=i===seat;
    const player=players.find(p=>p.seat===i);
    const chair=new Container();
    chair.position.set(x,y);
    chair.rotation=playerSeatRotation(i);
    chair.addChild(new Graphics().roundRect(-112,-48,224,96,19)
      .fill(mine?0xc6aa74:player?0x365b50:0x29483d)
      .stroke({color:mine?0xf0d6a5:player?0xa4c1a9:0x698476,width:1.4}));
    const seatText=label('Player '+String(i+1).padStart(2,'0'),
      29,mine?0x263a32:0xe7e0c9,'bold');
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
    box.addChild(new Graphics().roundRect(-31,-41,62,88,7).fill(0x101e20).stroke({color:isSelected?0xf4d59b:0x6d6c60,width:isSelected?3:1}));
    box.addChild(new Graphics().roundRect(-27,-37,54,80,5).fill(o.faceUp?rgb(o.color):0x253c43));
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
  if(isSelected){box.addChild(new Graphics().ellipse(0,0,o.kind==='board'?172:43,o.kind==='board'?117:56).stroke({color:0xf8d18b,width:2,alpha:.9}));}
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
export default function TableCanvas({state,seat,playerName,actorId,selected,onSelect,onMove,onMoveStack,onDrawMat,onOpenTcgSettings,onCardAction,stackHoldMs,mergeOpacity,mergeHoverMs,playmat,onMergeCenter,onViewChange,readonly=false}:Props){
  const [ready,setReady]=useState(false);
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight});
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
  const callbacks=useRef({onSelect,onMove,onMoveStack,onDrawMat,onOpenTcgSettings,onCardAction,onMergeCenter,onViewChange});callbacks.current={onSelect,onMove,onMoveStack,onDrawMat,onOpenTcgSettings,onCardAction,onMergeCenter,onViewChange};
  type ActiveDrag={
    id:string;pointerId:number;visual:Container;card:boolean;
    x:number;y:number;startX:number;startY:number;
    startClientX:number;startClientY:number;moved:boolean;
    whole:boolean;members:{id:string;x:number;y:number}[];
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
        const angle=-Math.PI/2+seatRef.current*Math.PI/6;
        const localChair=new Point(BOARD_CENTER+TABLE_SEAT_RADIUS*Math.cos(angle),
          BOARD_CENTER+TABLE_SEAT_RADIUS*Math.sin(angle));
        const chairParent=duelLayers.current?.get(seatRef.current)??board;
        const point=chairParent.toGlobal(localChair);
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
      eyeView.kind==='versus'||eyeView.kind==='castle'?eyeView.opponent:null,
      eyeView.kind==='castle',eyeView.castleMode??preferredCastleMode.current,
      preferredCastleMode.current,
      {ally:eyeView.castleFocusedAlly??null,enemy:eyeView.castleFocusedEnemy??null},
      viewport,relations,250,eyeView.castleSelectedEnemy??null);
    duelLayers.current=seatGroups;
    updateView.current();
    const snapOverlay=new Graphics();snapOverlay.eventMode='none';board.addChild(snapOverlay);snapHighlight.current=snapOverlay;
    const deckTop=new Map<string,TableObject>();
    for(const o of state.objects.filter(o=>o.zone==='DECK').sort((a,b)=>a.order-b.order))if(!deckTop.has(o.id.split('-')[0]))deckTop.set(o.id.split('-')[0],o);
    const visible=state.objects.filter(o=>o.zone!=='DECK'||deckTop.has(o.id.split('-')[0])&&deckTop.get(o.id.split('-')[0])?.id===o.id);
    visible.sort((a,b)=>Number(a.kind==='board')-Number(b.kind==='board')); // Boards drawn behind movable pieces
    visible.sort((a,b)=>(a.kind==='board'?0:1)-(b.kind==='board'?0:1));
    for(const obj of visible){
      const assumedOwner=obj.matSeat??
        (obj.owner===actorId||obj.owner==='local'?seat:
          state.players.find(p=>p.id===obj.owner)?.seat)??
        (state.kind==='tcg'?tcgSnapPoint(obj.x,obj.y,state.centerMerges,true)?.seat:undefined);
      if(seatGroups&&!seatGroups.has(assumedOwner??-1))continue;
      const piece=createPiece(obj,obj.id===selected);
      visuals.current.set(obj.id,piece);
      if(drag.current?.id===obj.id){
        drag.current.visual=piece;
        if(drag.current.whole)markHeldStack(piece,drag.current.members.length);
      }
      // An owned piece faces its owner's seat; the remaining pieces face the local viewer.
      const ownerSeat=assumedOwner;
      piece.rotation=playerSeatRotation(ownerSeat??seat)+obj.rotation*Math.PI/180;
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
      const url=obj.faceUp ? (obj.frameUrls?.[nearestFrameIndex(seat,obj.rotation,obj.frameUrls.length)]||obj.faceUrl) : obj.backUrl;
      if(url){
        Assets.load(url).then(texture=>{
          if(piece.destroyed||!session.current)return;
          const sprite=new Sprite(texture);sprite.anchor.set(.5);const scale=Math.min(74/texture.width,105/texture.height);sprite.scale.set(scale);
          piece.addChild(sprite);
        }).catch(()=>{/* Fallback stays visible when creator's hosting is down or CORS blocks fetch. */});
      }
      if(!readonly&&!obj.locked){
        piece.on('pointerdown',(e)=>{
          // A short drag always grabs one card. Holding without motion
          // arms a stack pick, but never takes a card from another owner.
          if(e.button!==0)return;
          e.stopPropagation();
          cancelActiveDrag.current();
          const members=cardStackMembers(state,obj.id);
          const eligible=members.length>=2&&members.every(o=>!o.locked&&
            (state.kind!=='tcg'||!o.owner||o.owner===(state.players.length?actorId:'local')));
          const active:ActiveDrag={
            id:obj.id,pointerId:e.pointerId,visual:piece,card:obj.kind!=='board'&&obj.kind!=='deck-box',
            x:obj.x,y:obj.y,startX:obj.x,startY:obj.y,
            startClientX:e.clientX,startClientY:e.clientY,moved:false,
            whole:false,members:eligible?members.map(o=>({id:o.id,x:o.x,y:o.y})):[],
            timer:null
          };
          drag.current=active;
          if(eligible){
            active.timer=window.setTimeout(()=>{
              if(drag.current!==active||active.moved)return;
              active.timer=null;
              active.whole=true;
              if(!active.visual.destroyed)markHeldStack(active.visual,active.members.length);
            },Math.min(5000,Math.max(250,stackHoldMs)));
          }
          callbacks.current.onSelect(obj.id);
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
  },[state,seat,playerName,actorId,selected,readonly,ready,stackHoldMs,mergeOpacity,mergeHoverMs,playmat,eyeView,relations,viewport]);
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
      if(!d||d.pointerId!==event.pointerId||!current||!mount.current)return;
      if(!d.moved){
        if(Math.hypot(event.clientX-d.startClientX,event.clientY-d.startClientY)<6)return;
        d.moved=true;
        // Any motion before hold completes commits to picking the TOP card.
        if(d.timer!==null){window.clearTimeout(d.timer);d.timer=null;}
      }
      const rect=current.app.canvas.getBoundingClientRect();
      const point=new Point(
        (event.clientX-rect.left)*current.app.renderer.width/rect.width,
        (event.clientY-rect.top)*current.app.renderer.height/rect.height);
      // The opponent mat may be temporarily re-framed. Its own presentation
      // transform maps pointer movement back to canonical table coordinates.
      const parent=d.visual.parent??current.board;
      const local=parent.toLocal(point,current.app.stage);
      d.x=Math.max(0,Math.min(BOARD_W,local.x));
      d.y=Math.max(0,Math.min(BOARD_W,local.y));
      const dx=d.x-d.startX,dy=d.y-d.startY;
      if(d.whole){
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
        const cell=d.card&&currentKind.current==='tcg'?tcgSnapPoint(d.x,d.y,currentState.current.centerMerges,playmatRef.current.snapMerged,seatRef.current):null;
        if(cell){
          const zone=tcgMatRegions(cell.seat,currentState.current.centerMerges).find(c=>c.row===cell.row&&c.column===cell.column)!;
          const remove=isTcgRemoveDrop(d.x,d.y,seatRef.current);
          hint.position.set(zone.x,zone.y);hint.rotation=zone.angle;
          hint.roundRect(-zone.width/2+3,-zone.height/2+3,zone.width-6,zone.height-6,5)
            .fill({color:remove?0xff3b30:0xc7d8ac,alpha:.13})
            .stroke({color:remove?0xff3b30:0xf6daa2,width:1.5,alpha:.75});
          if(remove){
            const text=label('RELEASE TO REMOVE',7,0xff6b61,'bold');
            text.rotation=-Math.PI/2;hint.addChild(text);
          }else{
            // Show the precise snapped CARD SLOT in addition to the zone,
            // so each unmerged row previews exactly where the card will land.
            const dx=cell.x-zone.x,dy=cell.y-zone.y;
            const cos=Math.cos(zone.angle),sin=Math.sin(zone.angle);
            const sx=dx*cos+dy*sin,sy=-dx*sin+dy*cos;
            hint.roundRect(sx-TCG_MAT.cardWidth/2,sy-TCG_MAT.cardHeight/2,
              TCG_MAT.cardWidth,TCG_MAT.cardHeight,4)
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
      // Merely selecting or holding still is not a move.
      if(!d.moved)return;
      const dx=d.x-d.startX,dy=d.y-d.startY;
      if(d.whole){
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
    const selectOpponent=(event:PointerEvent)=>{
      if(viewRef.current.kind!=='targeting'||event.button!==0)return;
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
      // Cards, stacks, eye and opponent arrows still receive Pixi events,
      // but grabbing empty space must never pan a locked matchup.
      if(isBattleView(viewRef.current.kind))return;
      if(event.pointerType==='touch'){
        pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(pointers.current.size>=2){
          // Two touches switch to view manipulation, even if the first was
          // touching a card; do not commit a partial card drag.
          cancelActiveDrag.current();
          panPointer.current=null;
          if(snapHighlight.current&&!snapHighlight.current.destroyed)snapHighlight.current.clear();
          host.classList.remove('is-panning');
        }
      }
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
    {eyeView.kind==='versus'&&eyeView.opponent!==null&&
      <RetractableSeatLabel key={'opponent-'+eyeView.opponent}
        side="top"
        idleOpacity={mergeOpacity} seat={eyeView.opponent}/>}
    {/* Our own name/seat tag lives in the unified book shelf outside
        the canvas in ALL views. Do not create a duplicate bottom tag. */}
    {eyeView.kind==='targeting'&&<div className="opponent-target-prompt" role="status">
      <span>Choose an opponent's mat or seat</span>
      <button type="button" onClick={()=>{selectView({kind:'overview',opponent:null});resetCamera.current();}}>Cancel</button>
    </div>}
  </div>;
}
