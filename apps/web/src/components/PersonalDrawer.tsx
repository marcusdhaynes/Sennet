import {useEffect,useRef,useState,type CSSProperties,type PointerEvent as Pointer} from 'react';
export type CommandBook='sennet'|'games'|'settings';
const BOOKS=[{id:'sennet',name:'Sennet',subtitle:'Instructions',n:'01'},{id:'games',name:'Games',subtitle:'Games & library',n:'02'},{id:'settings',name:'Settings',subtitle:'Preferences',n:'03'}] as const;
const KEY='sennet.personal-drawer.books.v1';
function storedBooks():CommandBook[]{try{const a:unknown=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?BOOKS.map(b=>b.id).filter(id=>a.includes(id)):[];}catch{return [];}}
type Gesture={id:CommandBook;pointerId:number;startX:number;startY:number;offsetX:number;offsetY:number;moved:boolean};
type Drag={id:CommandBook;x:number;y:number;over:boolean};
export default function PersonalDrawer({openBook,activeBook}:{openBook:(id:CommandBook)=>void;activeBook:CommandBook|null}){
  const [size,setSize]=useState(()=>({w:window.innerWidth,h:window.innerHeight}));
  const [open,setOpen]=useState(false);
  const [stored,setStored]=useState<CommandBook[]>(storedBooks);
  const [drag,setDrag]=useState<Drag|null>(null);
  const gesture=useRef<Gesture|null>(null),drawer=useRef<HTMLDivElement>(null);
  useEffect(()=>{const resize=()=>setSize({w:window.innerWidth,h:window.innerHeight});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(stored));}catch{/* Storage may be disabled */}},[stored]);
  const {w,h}=size,scale=Math.min(w/710,h/630),seatY=h/2+259*scale;
  const dw=Math.min(w-16,Math.max(260,Math.min(520,400*scale)));
  const dh=Math.min(152,Math.max(105,105*scale)),dy=seatY-dh+6;
  const bw=w<=640?Math.min(87,Math.max(69,w*.21)):Math.min(112,Math.max(66,w*.084));
  const bh=w<=640?Math.min(116,Math.max(91,w*.28)):Math.min(150,Math.max(87,w*.112));
  const tableY=seatY-dh-bh*.67-26,drawerY=dy+dh*.46;
  const tabletop=BOOKS.filter(b=>!stored.includes(b.id)),inside=BOOKS.filter(b=>stored.includes(b.id));
  function inDrawer(x:number,y:number){const r=drawer.current?.getBoundingClientRect();return Boolean(open&&r&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);}
  function place(id:CommandBook,into:boolean){setStored(previous=>{
    if(previous.includes(id)===into)return previous;
    return into?[...previous,id]:previous.filter(item=>item!==id);
  });}
  function down(e:Pointer<HTMLButtonElement>,id:CommandBook){
    if(e.button!==0)return;
    const b=e.currentTarget.getBoundingClientRect();
    gesture.current={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-(b.left+b.width/2),offsetY:e.clientY-(b.top+b.height/2),moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:Pointer<HTMLButtonElement>){
    const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
    if(!g.moved&&Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<7)return;
    g.moved=true;setDrag({id:g.id,x:e.clientX-g.offsetX,y:e.clientY-g.offsetY,over:inDrawer(e.clientX,e.clientY)});
  }
  function up(e:Pointer<HTMLButtonElement>){
    const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
    gesture.current=null;
    if(g.moved){place(g.id,inDrawer(e.clientX,e.clientY));setDrag(null);}
    else openBook(g.id);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const drawerStyle={left:w/2,top:dy,width:dw,height:dh,['--drawer-distance' as string]:String(dh-18)+'px'} as CSSProperties;
  return <>
    <div ref={drawer} className={'personal-drawer'+(open?' is-open':'')} style={drawerStyle} aria-hidden={!open}>
      <div className="personal-drawer-inner" data-book-drop-area="" />
      <div className="personal-drawer-handle" aria-hidden="true"/>
    </div>
    <div className="books-layer" aria-label="Tabletop command books">
      {BOOKS.map(b=>{
        const docked=stored.includes(b.id),group=docked?inside:tabletop,index=group.findIndex(a=>a.id===b.id);
        const x=w/2+(index-(group.length-1)/2)*(docked?Math.min(101,dw/3.55):bw+Math.max(10,Math.min(28,w*.02)));
        const y=docked?(open?drawerY:seatY-14):tableY;
        const active=drag?.id===b.id?drag:null;
        const factor=active?(active.over?.57:1):docked?(open?.57:.12):1;
        const visible=!docked||open||Boolean(active);
        const angle=docked||active?0:b.id==='sennet'?-7:b.id==='games'?3:9;
        const style={left:active?active.x:x,top:active?active.y:y,opacity:visible?1:0,['--book-scale' as string]:factor,['--book-angle' as string]:String(angle)+'deg',zIndex:active?12:docked?8:6} as CSSProperties;
        return <button key={b.id} type="button" className={'table-book book-'+b.id+(docked?' is-stored':'')+(active?' is-dragging':'')+(activeBook===b.id?' opened':'')}
          style={style} tabIndex={docked&&!open?-1:0}
          aria-label={'Open '+b.name+'. '+(docked?'In your drawer':'On the table')+'. Drag to '+(docked?'table':'drawer')+'.'}
          title={'Open '+b.name+' • drag to '+(docked?'table':'drawer')+' • arrow down to store / up to return'}
          onPointerDown={e=>down(e,b.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{gesture.current=null;setDrag(null);}}
          onClick={e=>{if(e.detail===0)openBook(b.id);}}
          onKeyDown={e=>{if(open&&e.key==='ArrowDown'){e.preventDefault();place(b.id,true);}if(open&&e.key==='ArrowUp'){e.preventDefault();place(b.id,false);}}}>
          <span className="book-spine" aria-hidden="true"/><span className="book-cover"><span className="book-ornament">✦</span><span className="book-title">{b.name}</span><span className="book-rule"/><span className="book-subtitle">{b.subtitle}</span><span className="book-number">{b.n}</span></span>
        </button>;
      })}
    </div>
    <button type="button" className={'seat-drawer-trigger'+(open?' is-open':'')} aria-expanded={open}
      aria-label={open?'Close your book drawer':'Open your book drawer'}
      title={open?'Close your drawer':'Open your drawer'}
      style={{left:w/2,top:seatY,width:Math.max(76,72*scale),height:Math.max(42,38*scale)}} onClick={()=>setOpen(v=>!v)}>
      <span className="visually-hidden">{open?'Close':'Open'} your drawer</span>
      <span className="drawer-indicator" aria-hidden="true">{open?'⌄':'⌃'}</span>
    </button>
  </>;
}