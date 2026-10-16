import {useEffect,useRef,useState} from 'react';
import {Application,Assets,Container,Graphics,Point,Rectangle,Sprite,Text} from 'pixi.js';
import {nearestFrameIndex,playerSeatRotation,viewerTableRotation,tcgMatCells,tcgSnapPoint,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,BOARD_CENTER,BOARD_W,TABLE_APOTHEM,TABLE_SEAT_RADIUS,TABLE_VIEW_RADIUS,type GameState,type Player,type TableObject} from '@sennet/core';
interface Props{state:GameState;seat:number;playerName:string;actorId:string;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number)=>void;onViewChange?:(view:{x:number;y:number;scale:number})=>void;readonly?:boolean}
const FONT='Inter, ui-sans-serif, system-ui, sans-serif';
const COLORS={wood:0x79593b,woodDark:0x342b23,felt:0x183d39,line:0x426761,gold:0xd6b681};
const rgb=(s:string)=>parseInt(s.replace('#',''),16)||0x95b7b2;
function label(text:string,size:number,color:number,weight:'normal'|'bold'='normal'){
  const t=new Text({text,style:{fontFamily:FONT,fontSize:size,fill:color,fontWeight:weight,align:'center'}});t.anchor.set(.5);return t;
}
/** Recessed, bevel-edged TCG playing mat. Cards use exactly the same
 * cell coordinates on every client; drag release is snapped in core. */
function drawTcgMats(board:Container){
  for(let seat=0;seat<12;seat++){
    const cells=tcgMatCells(seat);
    const topLeft=cells.find(c=>c.column===0&&c.row===0)!;
    const bottomRight=cells.find(c=>c.column===2&&c.row===3)!;
    const mat=new Container();
    mat.position.set((topLeft.x+bottomRight.x)/2,(topLeft.y+bottomRight.y)/2);
    mat.rotation=topLeft.angle;
    board.addChild(mat);
    mat.addChild(new Graphics()
      .roundRect(-TCG_MAT_WIDTH/2-4,-TCG_MAT_HEIGHT/2-4,TCG_MAT_WIDTH+8,TCG_MAT_HEIGHT+8,12)
      .fill({color:0x101e1a,alpha:.82})
      .stroke({color:0x8d7855,width:1,alpha:.46}));
    const cos=Math.cos(topLeft.angle),sin=Math.sin(topLeft.angle);
    for(const cell of cells){
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
    // Individual tangent-side boundary, exactly matching mat width.
    mat.addChild(new Graphics().moveTo(-TCG_MAT_WIDTH/2,TCG_MAT_HEIGHT/2+12)
      .lineTo(TCG_MAT_WIDTH/2,TCG_MAT_HEIGHT/2+12)
      .stroke({color:0xbda47b,width:2,alpha:.83}));
  }
}
function drawBackground(board:Container,seat:number,players:Player[],playerName:string,gameKind:GameState['kind']){
  const backdrop=new Graphics().rect(0,0,BOARD_W,BOARD_W).fill(0x142723);
  board.addChild(backdrop);
  const radius=TABLE_APOTHEM/Math.cos(Math.PI/12);
  const points=Array.from({length:12},(_,i)=>{const a=(i*Math.PI/6)-Math.PI/2-Math.PI/12;return {x:BOARD_CENTER+radius*Math.cos(a),y:BOARD_CENTER+radius*Math.sin(a)};});
  const pts=points.flatMap(p=>[p.x,p.y]);
  board.addChild(new Graphics().poly(pts).fill(COLORS.woodDark).stroke({color:0x110f0c,width:18}));
  board.addChild(new Graphics().poly(points.map(p=>[BOARD_CENTER+(p.x-BOARD_CENTER)*.991,BOARD_CENTER+(p.y-BOARD_CENTER)*.991]).flat()).fill(COLORS.wood).stroke({color:COLORS.gold,width:3,alpha:.75}));
  board.addChild(new Graphics().poly(points.map(p=>[BOARD_CENTER+(p.x-BOARD_CENTER)*.972,BOARD_CENTER+(p.y-BOARD_CENTER)*.972]).flat()).fill(COLORS.felt).stroke({color:0x112d2b,width:4}));
  if(gameKind==='tcg')drawTcgMats(board);
  // Each chair is attached to the shared tabletop, then the whole board is rotated
  // so the viewer's seat is always on the near (bottom) edge.
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6-Math.PI/2;
    const x=BOARD_CENTER+TABLE_SEAT_RADIUS*Math.cos(angle),y=BOARD_CENTER+TABLE_SEAT_RADIUS*Math.sin(angle);
    const mine=i===seat;
    const player=players.find(p=>p.seat===i);
    const chair=new Container();
    chair.position.set(x,y);
    chair.rotation=playerSeatRotation(i);
    chair.addChild(new Graphics().roundRect(-31,-15,62,30,8)
      .fill(mine?0xc6aa74:player?0x365b50:0x29483d)
      .stroke({color:mine?0xf0d6a5:player?0xa4c1a9:0x698476,width:1.4}));
    const nickname=mine?'YOU':player?.name||'';
    const seatText=label(nickname?nickname.slice(0,10):String(i+1),nickname?10:12,mine?0x263a32:0xe7e0c9,'bold');
    seatText.position.set(0,-1);
    chair.addChild(seatText);
    board.addChild(chair);
  }

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
export default function TableCanvas({state,seat,playerName,actorId,selected,onSelect,onMove,onViewChange,readonly=false}:Props){
  const [ready,setReady]=useState(false);
  const mount=useRef<HTMLDivElement>(null);
  const session=useRef<{app:Application;scene:Container;board:Container}|null>(null);
  const camera=useRef({zoom:1,panX:0,panY:0});
  const updateView=useRef<()=>void>(()=>{});
  const seatRef=useRef(seat);seatRef.current=seat;
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const mousePan=useRef<number|null>(null);
  const lastView=useRef({x:NaN,y:NaN,scale:NaN});
  const callbacks=useRef({onSelect,onMove,onViewChange});callbacks.current={onSelect,onMove,onViewChange};
  const drag=useRef<{id:string;visual:Container;x:number;y:number;card:boolean}|null>(null);
  const snapHighlight=useRef<Graphics|null>(null);
  const currentKind=useRef(state.kind);currentKind.current=state.kind;
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
      const rescale=()=>{
        if(!mount.current)return;
        const w=Math.max(100,mount.current.clientWidth),h=Math.max(100,mount.current.clientHeight);
        app.renderer.resize(w,h);
        const fit=Math.min(w/(TABLE_VIEW_RADIUS*2),h/(TABLE_VIEW_RADIUS*2));
        const c=camera.current,scale=fit*c.zoom;
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
    return()=>{disposed=true;resizeObserver?.disconnect();session.current=null;drag.current=null;try{app.destroy(true);}catch{/* init may still be in flight */}};
  },[]);
  useEffect(()=>{
    const current=session.current;
    if(!current)return;
    const {app,board}=current;
    animations.current.forEach(id=>cancelAnimationFrame(id));animations.current=[];
    board.removeChildren().forEach(child=>child.destroy({children:true}));
    snapHighlight.current=null;
    board.rotation=viewerTableRotation(seat);
    updateView.current();
    drawBackground(board,seat,state.players,playerName,state.kind);
    const snapOverlay=new Graphics();snapOverlay.eventMode='none';board.addChild(snapOverlay);snapHighlight.current=snapOverlay;
    const deckTop=new Map<string,TableObject>();
    for(const o of state.objects.filter(o=>o.zone==='DECK').sort((a,b)=>a.order-b.order))if(!deckTop.has(o.id.split('-')[0]))deckTop.set(o.id.split('-')[0],o);
    const visible=state.objects.filter(o=>o.zone!=='DECK'||deckTop.has(o.id.split('-')[0])&&deckTop.get(o.id.split('-')[0])?.id===o.id);
    visible.sort((a,b)=>Number(a.kind==='board')-Number(b.kind==='board')); // Boards drawn behind movable pieces
    visible.sort((a,b)=>(a.kind==='board'?0:1)-(b.kind==='board'?0:1));
    for(const obj of visible){
      const piece=createPiece(obj,obj.id===selected);
      // An owned piece faces its owner's seat; the remaining pieces face the local viewer.
      const ownerSeat=obj.matSeat??(obj.owner===actorId||obj.owner==='local'?seat:state.players.find(p=>p.id===obj.owner)?.seat);
      piece.rotation=playerSeatRotation(ownerSeat??seat)+obj.rotation*Math.PI/180;
      board.addChild(piece);
      if(drag.current?.id===obj.id) drag.current.visual=piece;
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
          e.stopPropagation();drag.current={id:obj.id,visual:piece,x:obj.x,y:obj.y,card:obj.kind==='card'};callbacks.current.onSelect(obj.id);
        });
      }
    }
    // Rendering on state change intentionally reconstructs a small scene. Large games will use
    // keyed incremental sprites and texture budgets without changing the core state protocol.
    oldLocations.current=new Map(state.objects.map(o=>[o.id,{x:o.x,y:o.y}]));
    app.renderer.render(app.stage);
  },[state,seat,playerName,actorId,selected,readonly,ready]);
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      const d=drag.current,current=session.current;if(!d||!current||!mount.current)return;
      const rect=current.app.canvas.getBoundingClientRect();
      const p=new Point((event.clientX-rect.left)*current.app.renderer.width/rect.width,(event.clientY-rect.top)*current.app.renderer.height/rect.height);
      const local=current.board.toLocal(p,current.app.stage);
      d.x=Math.max(0,Math.min(BOARD_W,local.x));d.y=Math.max(0,Math.min(BOARD_W,local.y));d.visual.position.set(d.x,d.y);
      const hint=snapHighlight.current;
      if(hint&&!hint.destroyed){
        hint.clear();
        const cell=d.card&&currentKind.current==='tcg'?tcgSnapPoint(d.x,d.y):null;
        if(cell){
          const zone=tcgMatCells(cell.seat).find(c=>c.row===cell.row&&c.column===cell.column)!;
          hint.position.set(zone.x,zone.y);hint.rotation=zone.angle;
          hint.roundRect(-zone.width/2+3,-zone.height/2+3,zone.width-6,zone.height-6,5)
            .fill({color:0xc7d8ac,alpha:.18})
            .stroke({color:0xf6daa2,width:2.4,alpha:.9});
        }
      }
    };
    const end=()=>{const d=drag.current;if(!d)return;
      drag.current=null;
      if(snapHighlight.current&&!snapHighlight.current.destroyed)snapHighlight.current.clear();
      // Start the snap tween at the pointer's release position, not where
      // the card was before the drag.
      oldLocations.current.set(d.id,{x:d.x,y:d.y});
      callbacks.current.onMove(d.id,Math.round(d.x),Math.round(d.y));
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};
  },[]);

  useEffect(()=>{
    const host=mount.current;if(!host)return;
    const clampZoom=(v:number)=>Math.min(18,Math.max(.65,v));
    const coordinates=(event:{clientX:number;clientY:number})=>{
      const r=host.getBoundingClientRect();
      return {x:event.clientX-r.left,y:event.clientY-r.top};
    };
    const zoomAt=(x:number,y:number,ratio:number)=>{
      const current=session.current;if(!current||!Number.isFinite(ratio)||ratio<=0)return;
      const {scene}=current,c=camera.current;
      const before=c.zoom,after=clampZoom(before*ratio);
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
          // The second finger cancels object movement and begins camera control.
          drag.current=null;
          if(snapHighlight.current&&!snapHighlight.current.destroyed)snapHighlight.current.clear();
        }
      }else if(event.button===1||event.button===2){
        event.preventDefault();
        mousePan.current=event.pointerId;
      }
    };
    const move=(event:PointerEvent)=>{
      if(mousePan.current===event.pointerId){
        pan(event.movementX,event.movementY);return;
      }
      const points=pointers.current;
      if(event.pointerType!=='touch'||!points.has(event.pointerId))return;
      const previous=points.get(event.pointerId)!;
      const allBefore=[...points.values()];
      points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      const allNow=[...points.values()];
      if(points.size>=2){
        const [a,b]=allBefore,[c,d]=allNow;
        const oldCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const newCenter={x:(c.x+d.x)/2,y:(c.y+d.y)/2};
        const oldDistance=Math.hypot(a.x-b.x,a.y-b.y);
        const newDistance=Math.hypot(c.x-d.x,c.y-d.y);
        const p=coordinates({clientX:oldCenter.x,clientY:oldCenter.y});
        if(oldDistance>5&&newDistance>5)zoomAt(p.x,p.y,newDistance/oldDistance);
        pan(newCenter.x-oldCenter.x,newCenter.y-oldCenter.y);
      }else if(!drag.current){
        // One-finger panning on an empty area; a touched card still drags.
        pan(event.clientX-previous.x,event.clientY-previous.y);
      }
    };
    const up=(event:PointerEvent)=>{
      pointers.current.delete(event.pointerId);
      if(mousePan.current===event.pointerId)mousePan.current=null;
    };
    const reset=()=>{camera.current={zoom:1,panX:0,panY:0};updateView.current();};
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
    host.addEventListener('dblclick',reset);
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
    window.addEventListener('keydown',key);
    function preventMenu(event:MouseEvent){event.preventDefault();}
    return()=>{
      host.removeEventListener('wheel',wheel);
      host.removeEventListener('pointerdown',down);
      host.removeEventListener('contextmenu',preventMenu);
      host.removeEventListener('dblclick',reset);
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
      window.removeEventListener('keydown',key);
    };
  },[]);
  return <div ref={mount} className="pixi-host" role="img" aria-label="Interactive twelve-seat tabletop. Select or drag pieces with mouse or touch."/>;
}
