import {useEffect,useRef,useState} from 'react';
import {Application,Assets,Circle,Container,Graphics,Point,Rectangle,Sprite,Text} from 'pixi.js';
import {cardStackMembers,nearestFrameIndex,playerSeatRotation,viewerTableRotation,tcgMatCells,tcgMatRegions,tcgMatOrigin,opponentAtTablePoint,centerMergeKey,tcgSnapPoint,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,BOARD_CENTER,BOARD_W,TABLE_APOTHEM,TABLE_SEAT_RADIUS,TABLE_VIEW_RADIUS,MIN_TABLE_ZOOM,clampTableZoom,clampTablePan,type GameState,type Player,type TableObject} from '@sennet/core';
interface Props{state:GameState;seat:number;playerName:string;actorId:string;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number)=>void;onMoveStack:(id:string,x:number,y:number)=>void;stackHoldMs:number;mergeOpacity:number;mergeHoverMs:number;onMergeCenter:(seat:number,boundary:number,merged:boolean)=>void;onViewChange?:(view:{x:number;y:number;scale:number})=>void;readonly?:boolean}
const FONT='Inter, ui-sans-serif, system-ui, sans-serif';
const COLORS={wood:0x79593b,woodDark:0x342b23,felt:0x183d39,line:0x426761,gold:0xd6b681};
const rgb=(s:string)=>parseInt(s.replace('#',''),16)||0x95b7b2;
function label(text:string,size:number,color:number,weight:'normal'|'bold'='normal'){
  const t=new Text({text,resolution:Math.min(4,Math.max(2,window.devicePixelRatio||1)),style:{fontFamily:FONT,fontSize:size,fill:color,fontWeight:weight,align:'center'}});t.anchor.set(.5);return t;
}
/** Recessed, bevel-edged TCG playing mat. Cards use exactly the same
 * cell coordinates on every client; drag release is snapped in core. */
function drawTcgMats(
  board:Container,state:GameState,viewerSeat:number,readonly:boolean,
  opacity:number,hoverMs:number,
  onMerge:(seat:number,boundary:number,merged:boolean)=>void,
  onEyeTap:()=>void,onEyeHold:()=>void,onControlDown:(pointerId:number)=>void,
  hoverTimers:Set<number>,seatLayers:Map<number,Container>|null,eyeHoldMs:number
){
  for(let seat=0;seat<12;seat++){
    if(seatLayers&&!seatLayers.has(seat))continue;
    const parent=seatLayers?.get(seat)??board;
    const cells=tcgMatCells(seat);
    const topLeft=cells.find(c=>c.column===0&&c.row===0)!;
    const bottomRight=cells.find(c=>c.column===2&&c.row===3)!;
    const mat=new Container();
    mat.position.set((topLeft.x+bottomRight.x)/2,(topLeft.y+bottomRight.y)/2);
    mat.rotation=topLeft.angle;
    parent.addChild(mat);
    mat.addChild(new Graphics()
      .roundRect(-TCG_MAT_WIDTH/2-4,-TCG_MAT_HEIGHT/2-4,TCG_MAT_WIDTH+8,TCG_MAT_HEIGHT+8,12)
      .fill({color:0x101e1a,alpha:.82})
      .stroke({color:0x8d7855,width:1,alpha:.46}));
    const cos=Math.cos(topLeft.angle),sin=Math.sin(topLeft.angle);
    // Joined center rows are rendered as ONE pocket. The side columns
    // remain four separate single-card rectangles.
    for(const cell of tcgMatRegions(seat,state.centerMerges)){
      const dx=cell.x-mat.x,dy=cell.y-mat.y;
      const x=dx*cos+dy*sin-cell.width/2;
      const y=-dx*sin+dy*cos-cell.height/2;
      const w=cell.width,h=cell.height;
      mat.addChild(new Graphics()
        .roundRect(x,y,w,h,8).fill({color:0x0d2622,alpha:.98})
          .stroke({color:0x988d72,width:1.5,alpha:.76})
        .roundRect(x+2,y+2,w-4,h-4,6).fill({color:0x1b3935,alpha:.94})
          .stroke({color:0x071915,width:1.8,alpha:.90})
        .roundRect(x+5,y+5,w-10,h-10,5).stroke({color:0x9bb5a2,width:1,alpha:.14})
        .moveTo(x+8,y+4).lineTo(x+w-8,y+4).stroke({color:0x020c0a,alpha:.55,width:2})
        .moveTo(x+4,y+8).lineTo(x+4,y+h-8).stroke({color:0x06140f,alpha:.48,width:2})
        .moveTo(x+8,y+h-4).lineTo(x+w-8,y+h-4).stroke({color:0xd4c9a5,alpha:.22,width:1.5}));
    }
    // Boundary line is precisely as wide as this player's playmat.
    mat.addChild(new Graphics().moveTo(-TCG_MAT_WIDTH/2,TCG_MAT_HEIGHT/2+12)
      .lineTo(TCG_MAT_WIDTH/2,TCG_MAT_HEIGHT/2+12)
      .stroke({color:0xbda47b,width:2,alpha:.83}));

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

    // Circular eye tool lives at the TOP of the local mat.
    if(seat===viewerSeat){
      const eye=new Container();
      eye.position.set(0,-TCG_MAT_HEIGHT/2-64);
      eye.eventMode='static';
      eye.hitArea=new Circle(0,0,38);
      eye.cursor='pointer';
      eye.addChild(new Graphics()
        .circle(0,0,32).fill({color:0x183a33,alpha:.96})
        .stroke({color:0xe4cf9d,alpha:1,width:2.5})
        .ellipse(0,0,18,11).stroke({color:0xf4e4bd,width:2.8})
        .circle(0,0,6).fill({color:0xf6e4c1})
        .circle(2,-2,2).fill({color:0x3f5e53}));
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
      const move=e=>{
        if(pressedPointer!==e.pointerId||pending===null)return;
        if(Math.hypot(e.clientX-firstX,e.clientY-firstY)>7){
          pressedPointer=null;clear();
        }
      };
      eye.on('globalpointermove',move);
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
    }
  }
}
/** Reframe arbitrary opponent into the opposing (top) position without
 * changing a single game coordinate. Pieces remain logically at their seats.
 */
function makeDuelSeatLayers(board:Container,viewerSeat:number,opponentSeat:number){
  const layers=new Map<number,Container>();
  const outward=-Math.PI/2+viewerSeat*Math.PI/6;
  const dx=Math.cos(outward),dy=Math.sin(outward);
  const separation=TCG_MAT_HEIGHT+116;
  for(const which of [viewerSeat,opponentSeat]){
    const origin=tcgMatOrigin(which);
    const side=which===viewerSeat?1:-1;
    const group=new Container();
    group.pivot.set(origin.x,origin.y);
    group.position.set(BOARD_CENTER+dx*separation/2*side,
      BOARD_CENTER+dy*separation/2*side);
    group.rotation=which===viewerSeat?0:(viewerSeat+6-which)*Math.PI/6;
    board.addChild(group);layers.set(which,group);
  }
  return layers;
}
function drawBackground(board:Container,state:GameState,seat:number,playerName:string,readonly:boolean,
  opacity:number,hoverMs:number,onMerge:(seat:number,boundary:number,merged:boolean)=>void,
  onEyeTap:()=>void,onEyeHold:()=>void,onControlDown:(id:number)=>void,hoverTimers:Set<number>,
  duelOpponent:number|null,eyeHoldMs:number):Map<number,Container>|null{
  const players=state.players;
  const backdrop=new Graphics().rect(0,0,BOARD_W,BOARD_W).fill(0x142723);
  board.addChild(backdrop);
  if(duelOpponent===null){
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
  const layers=duelOpponent===null?null:makeDuelSeatLayers(board,seat,duelOpponent);
  if(state.kind==='tcg')drawTcgMats(board,state,seat,readonly,opacity,hoverMs,onMerge,
    onEyeTap,onEyeHold,onControlDown,hoverTimers,layers,eyeHoldMs);
  for(let i=0;i<12;i++){
    if(layers&&!layers.has(i))continue;
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
    const nickname=mine?'YOU':player?.name||'';
    const seatText=label(nickname?nickname.slice(0,10):String(i+1),
      nickname?37:41,mine?0x263a32:0xe7e0c9,'bold');
    seatText.position.set(0,-1);
    chair.addChild(seatText);
    (layers?.get(i)??board).addChild(chair);
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
function createPiece(o:TableObject,isSelected:boolean){
  const box=new Container();box.position.set(o.x,o.y);box.eventMode=o.locked?'none':'static';box.cursor=o.locked?'default':'grab';
  const shadow=new Graphics().ellipse(4,13,33,12).fill({color:0x050c0b,alpha:.32});box.addChild(shadow);
  if(o.kind==='board'){
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
export default function TableCanvas({state,seat,playerName,actorId,selected,onSelect,onMove,onMoveStack,stackHoldMs,mergeOpacity,mergeHoverMs,onMergeCenter,onViewChange,readonly=false}:Props){
  const [ready,setReady]=useState(false);
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
  const callbacks=useRef({onSelect,onMove,onMoveStack,onMergeCenter,onViewChange});callbacks.current={onSelect,onMove,onMoveStack,onMergeCenter,onViewChange};
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
        if(w!==lastWidth||h!==lastHeight){app.renderer.resize(w,h);lastWidth=w;lastHeight=h;}
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
        const point=board.toGlobal(new Point(BOARD_CENTER+TABLE_SEAT_RADIUS*Math.cos(angle),
          BOARD_CENTER+TABLE_SEAT_RADIUS*Math.sin(angle)));
        if(callbacks.current.onViewChange&&
          (Math.abs(lastView.current.x-point.x)>.4||
           Math.abs(lastView.current.y-point.y)>.4||
           Math.abs(lastView.current.scale-scale)>1e-5)){
          lastView.current={x:point.x,y:point.y,scale};
          callbacks.current.onViewChange({x:point.x,y:point.y,scale});
        }
      };
      updateView.current=rescale;
      resizeObserver=new ResizeObserver(rescale);resizeObserver.observe(mount.current!);rescale();
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
    updateView.current();
    drawBackground(board,state,seat,playerName,readonly,mergeOpacity,mergeHoverMs,
      (target,boundary,merged)=>callbacks.current.onMergeCenter(target,boundary,merged),
      ()=>focusMyMat.current(),id=>{controlPointer.current=id;},hoverTimers.current);
    const snapOverlay=new Graphics();snapOverlay.eventMode='none';board.addChild(snapOverlay);snapHighlight.current=snapOverlay;
    const deckTop=new Map<string,TableObject>();
    for(const o of state.objects.filter(o=>o.zone==='DECK').sort((a,b)=>a.order-b.order))if(!deckTop.has(o.id.split('-')[0]))deckTop.set(o.id.split('-')[0],o);
    const visible=state.objects.filter(o=>o.zone!=='DECK'||deckTop.has(o.id.split('-')[0])&&deckTop.get(o.id.split('-')[0])?.id===o.id);
    visible.sort((a,b)=>Number(a.kind==='board')-Number(b.kind==='board')); // Boards drawn behind movable pieces
    visible.sort((a,b)=>(a.kind==='board'?0:1)-(b.kind==='board'?0:1));
    for(const obj of visible){
      const piece=createPiece(obj,obj.id===selected);
      visuals.current.set(obj.id,piece);
      if(drag.current?.id===obj.id){
        drag.current.visual=piece;
        if(drag.current.whole)markHeldStack(piece,drag.current.members.length);
      }
      // An owned piece faces its owner's seat; the remaining pieces face the local viewer.
      const ownerSeat=obj.matSeat??(obj.owner===actorId||obj.owner==='local'?seat:state.players.find(p=>p.id===obj.owner)?.seat);
      piece.rotation=playerSeatRotation(ownerSeat??seat)+obj.rotation*Math.PI/180;
      board.addChild(piece);
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
            id:obj.id,pointerId:e.pointerId,visual:piece,card:obj.kind==='card',
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
    // Rendering on state change intentionally reconstructs a small scene. Large games will use
    // keyed incremental sprites and texture budgets without changing the core state protocol.
    oldLocations.current=new Map(state.objects.map(o=>[o.id,{x:o.x,y:o.y}]));
    app.renderer.render(app.stage);
  },[state,seat,playerName,actorId,selected,readonly,ready,stackHoldMs,mergeOpacity,mergeHoverMs]);
  useEffect(()=>{
    const clearHighlight=()=>{
      const hint=snapHighlight.current;
      if(hint&&!hint.destroyed)hint.clear();
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
      const local=current.board.toLocal(point,current.app.stage);
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
        hint.clear();
        const cell=d.card&&currentKind.current==='tcg'?tcgSnapPoint(d.x,d.y,currentState.current.centerMerges):null;
        if(cell){
          const zone=tcgMatRegions(cell.seat,currentState.current.centerMerges).find(c=>c.row===cell.row&&c.column===cell.column)!;
          hint.position.set(zone.x,zone.y);hint.rotation=zone.angle;
          hint.roundRect(-zone.width/2+3,-zone.height/2+3,zone.width-6,zone.height-6,5)
            .fill({color:0xc7d8ac,alpha:.18})
            .stroke({color:0xf6daa2,width:2.4,alpha:.9});
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
      // Fit 96% of the screen width, not merely a fixed zoom multiplier.
      // The tall mat can extend vertically: panning remains constrained
      // to the area present in the original view.
      const targetZoom=clampTableZoom(.96*w/(TCG_MAT_WIDTH*fit));
      const targetScale=fit*targetZoom;
      const unboundedPanX=(BOARD_CENTER-localX)*targetScale;
      const unboundedPanY=(BOARD_CENTER-localY)*targetScale;
      const limit=clampTablePan(unboundedPanX,unboundedPanY,targetZoom,w,h);
      const original={...camera.current};
      interruptFocus();
      const started=performance.now(),duration=360;
      const animate=(now:number)=>{
        const t=Math.min(1,(now-started)/duration);
        const eased=1-Math.pow(1-t,3);
        camera.current.zoom=original.zoom+(targetZoom-original.zoom)*eased;
        camera.current.panX=original.panX+(limit.panX-original.panX)*eased;
        camera.current.panY=original.panY+(limit.panY-original.panY)*eased;
        updateView.current();
        if(t<1)activeFocusAnimation.current=requestAnimationFrame(animate);
        else activeFocusAnimation.current=null;
      };
      activeFocusAnimation.current=requestAnimationFrame(animate);
    };
    const zoomAt=(x:number,y:number,ratio:number)=>{
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
      interruptFocus();
      camera.current.panX+=dx;camera.current.panY+=dy;
      updateView.current();
    };
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
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
    const reset=()=>{interruptFocus();camera.current={zoom:MIN_TABLE_ZOOM,panX:0,panY:0};updateView.current();};
    const key=(event:KeyboardEvent)=>{
      const target=event.target;
      if(target instanceof HTMLElement&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(event.key==='0'){reset();}
      if(event.key==='+'||event.key==='='){event.preventDefault();zoomAt(host.clientWidth/2,host.clientHeight/2,1.25);}
      if(event.key==='-'){event.preventDefault();zoomAt(host.clientWidth/2,host.clientHeight/2,1/1.25);}
    };
    host.addEventListener('wheel',wheel,{passive:false});
    host.addEventListener('pointerdown',down);
    host.addEventListener('contextmenu',preventMenu);
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
    window.addEventListener('blur',blur);
    window.addEventListener('keydown',key);
    function preventMenu(event:MouseEvent){event.preventDefault();}
    return()=>{
      interruptFocus();focusMyMat.current=()=>{};
      host.removeEventListener('wheel',wheel);
      host.removeEventListener('pointerdown',down);
      host.removeEventListener('contextmenu',preventMenu);
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
      window.removeEventListener('blur',blur);
      window.removeEventListener('keydown',key);
    };
  },[]);
  return <div ref={mount} className="pixi-host" role="img" aria-label="Interactive twelve-seat tabletop. Drag empty space with mouse or touch to move the camera; drag cards and pieces to move them."/>;
}
