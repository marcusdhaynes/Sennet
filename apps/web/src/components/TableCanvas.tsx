import {useEffect,useRef,useState} from 'react';
import {Application,Assets,Container,Graphics,Point,Rectangle,Sprite,Text} from 'pixi.js';
import {nearestFrameIndex,type GameState,type TableObject} from '@sennet/core';
interface Props{state:GameState;seat:number;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number)=>void;readonly?:boolean}
const FONT='Inter, ui-sans-serif, system-ui, sans-serif';
const COLORS={wood:0x79593b,woodDark:0x342b23,felt:0x183d39,line:0x426761,gold:0xd6b681};
const rgb=(s:string)=>parseInt(s.replace('#',''),16)||0x95b7b2;
function label(text:string,size:number,color:number,weight:'normal'|'bold'='normal'){
  const t=new Text({text,style:{fontFamily:FONT,fontSize:size,fill:color,fontWeight:weight,align:'center'}});t.anchor.set(.5);return t;
}
function drawBackground(board:Container,seat:number){
  const backdrop=new Graphics().rect(-200,-200,1400,1100).fill(0x142723);
  board.addChild(backdrop);
  const points=Array.from({length:12},(_,i)=>{const a=(i*Math.PI/6)-Math.PI/12;return {x:500+292*Math.cos(a),y:330+281*Math.sin(a)};});
  const pts=points.flatMap(p=>[p.x,p.y]);
  board.addChild(new Graphics().poly(pts).fill(COLORS.woodDark).stroke({color:0x110f0c,width:18}));
  board.addChild(new Graphics().poly(points.map(p=>[500+(p.x-500)*.975,330+(p.y-330)*.975]).flat()).fill(COLORS.wood).stroke({color:COLORS.gold,width:3,alpha:.75}));
  board.addChild(new Graphics().poly(points.map(p=>[500+(p.x-500)*.918,330+(p.y-330)*.918]).flat()).fill(COLORS.felt).stroke({color:0x112d2b,width:4}));
  const grid=new Graphics();
  for(let x=230;x<=770;x+=45)grid.moveTo(x,70).lineTo(x,590).stroke({color:COLORS.line,alpha:.13,width:1});
  for(let y=70;y<=590;y+=45)grid.moveTo(210,y).lineTo(790,y).stroke({color:COLORS.line,alpha:.13,width:1});
  board.addChild(grid);
  const ring=new Graphics().circle(500,330,157).stroke({color:0xb89c70,width:1,alpha:.15}).circle(500,330,72).stroke({color:0xb89c70,width:1,alpha:.12});
  board.addChild(ring);
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6-Math.PI/2;
    const x=500+271*Math.cos(angle),y=330+259*Math.sin(angle);
    const dot=new Graphics().circle(x,y,13).fill(i===seat?0xe4c48d:0x31544c).stroke({color:i===seat?0xf8dfab:0x657a67,width:1.4});board.addChild(dot);
    const number=label(String(i+1),12,i===seat?0x243b35:0xcbd2bb,'bold');number.position.set(x,y);board.addChild(number);
  }
  const title=label('S E N N E T',42,0x759080,'bold');title.alpha=.15;title.position.set(500,330);board.addChild(title);
  const subtitle=label('THE TABLE IS YOURS',9,0x89aa94);subtitle.alpha=.24;subtitle.position.set(500,363);board.addChild(subtitle);
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
export default function TableCanvas({state,seat,selected,onSelect,onMove,readonly=false}:Props){
  const [ready,setReady]=useState(false);
  const mount=useRef<HTMLDivElement>(null);
  const session=useRef<{app:Application;scene:Container;board:Container}|null>(null);
  const callbacks=useRef({onSelect,onMove});callbacks.current={onSelect,onMove};
  const drag=useRef<{id:string;visual:Container;x:number;y:number}|null>(null);
  const oldLocations=useRef(new Map<string,{x:number;y:number}>());
  const animations=useRef<number[]>([]);
  useEffect(()=>{
    let disposed=false;let resizeObserver:ResizeObserver|undefined;
    const app=new Application();
    (async()=>{
      await app.init({width:1000,height:660,backgroundColor:0x101e1d,antialias:true,resolution:Math.min(window.devicePixelRatio||1,2),preference:'webgl',autoDensity:true});
      if(disposed){app.destroy(true);return;}
      const scene=new Container(),board=new Container();board.position.set(500,330);board.pivot.set(500,330);
      scene.addChild(board);app.stage.addChild(scene);mount.current?.appendChild(app.canvas);
      session.current={app,scene,board};setReady(true);
      const rescale=()=>{
        if(!mount.current)return;
        const w=Math.max(100,mount.current.clientWidth),h=Math.max(100,mount.current.clientHeight);
        app.renderer.resize(w,h);const s=Math.min(w/1000,h/660);
        scene.scale.set(s);scene.position.set((w-1000*s)/2,(h-660*s)/2);
      };
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
    board.rotation=-seat*Math.PI/6;
    drawBackground(board,seat);
    const deckTop=new Map<string,TableObject>();
    for(const o of state.objects.filter(o=>o.zone==='DECK').sort((a,b)=>a.order-b.order))if(!deckTop.has(o.id.split('-')[0]))deckTop.set(o.id.split('-')[0],o);
    const visible=state.objects.filter(o=>o.zone!=='DECK'||deckTop.has(o.id.split('-')[0])&&deckTop.get(o.id.split('-')[0])?.id===o.id);
    visible.sort((a,b)=>Number(a.kind==='board')-Number(b.kind==='board')); // Boards drawn behind movable pieces
    visible.sort((a,b)=>(a.kind==='board'?0:1)-(b.kind==='board'?0:1));
    for(const obj of visible){
      const piece=createPiece(obj,obj.id===selected);
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
          e.stopPropagation();drag.current={id:obj.id,visual:piece,x:obj.x,y:obj.y};callbacks.current.onSelect(obj.id);
        });
      }
    }
    // Rendering on state change intentionally reconstructs a small scene. Large games will use
    // keyed incremental sprites and texture budgets without changing the core state protocol.
    oldLocations.current=new Map(state.objects.map(o=>[o.id,{x:o.x,y:o.y}]));
    app.renderer.render(app.stage);
  },[state,seat,selected,readonly,ready]);
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      const d=drag.current,current=session.current;if(!d||!current||!mount.current)return;
      const rect=current.app.canvas.getBoundingClientRect();
      const p=new Point((event.clientX-rect.left)*current.app.renderer.width/rect.width,(event.clientY-rect.top)*current.app.renderer.height/rect.height);
      const local=current.board.toLocal(p,current.app.stage);
      d.x=Math.max(175,Math.min(825,local.x));d.y=Math.max(80,Math.min(580,local.y));d.visual.position.set(d.x,d.y);
    };
    const end=()=>{const d=drag.current;if(!d)return;drag.current=null;callbacks.current.onMove(d.id,Math.round(d.x),Math.round(d.y));};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};
  },[]);
  return <div ref={mount} className="pixi-host" role="img" aria-label="Interactive twelve-seat tabletop. Select or drag pieces with mouse or touch."/>;
}
