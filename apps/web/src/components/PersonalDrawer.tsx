import {useEffect,useRef,useState} from 'react';

export type CommandBook='sennet'|'games'|'settings';


/** The invisible name/number hit target IS the book drawer. Click Player 01 (or the
 * corresponding seat number) to expand the tag upward and reveal its books.
 * Selection and outside-pointer interaction always dismiss the drawer.
 */
export default function PersonalDrawer({openBook,activeBook,seat,name,onLog,onRecall}:{
  openBook:(id:CommandBook)=>void;
  activeBook:CommandBook|null;
  seat:number;
  name:string;
  onLog:()=>void;
  onRecall:()=>void;
}){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);
    };
    document.addEventListener('pointerdown',close,true);
    return()=>document.removeEventListener('pointerdown',close,true);
  },[open]);
  const label='Player '+String(seat+1).padStart(2,'0');
  const displayName=name.trim().replace(/^player(?:\s+|$)/i,'').trim();
  const shelfId='personal-player-books';

  return <div ref={root} className={'player-hub'+(open?' is-open':'')} onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
    <button type="button" className="player-hub-tab"
      onClick={()=>setOpen(previous=>!previous)}
      aria-controls={shelfId} aria-expanded={open}
      aria-label={label+(displayName?', '+displayName:'')+'. '+(open?'Collapse':'Expand')+' books'}
      title={open?'Collapse your books':'Expand your books'}>
      <span className="player-hub-number">{label}</span>
    </button>
    <div id={shelfId} className="player-hub-content" aria-hidden={!open}>
      {displayName&&<div className="player-hub-name">{displayName}</div>}
      <div className="player-hub-books"><button type="button" className="unified-book-shortcut" onClick={()=>{setOpen(false);openBook('sennet');}}>Open Sennet Tome</button></div>
      <nav className="player-hub-utilities" aria-label="Table utilities"><button type="button" onClick={()=>{setOpen(false);onLog();}} tabIndex={open?0:-1} title="Show action log">▤ <span>Log</span></button><button type="button" onClick={()=>{setOpen(false);onRecall();}} tabIndex={open?0:-1} title="Restore previous table">↶ <span>Recall</span></button></nav>
    </div>
  </div>;
}
