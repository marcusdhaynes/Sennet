import {useEffect,useRef,useState} from 'react';

export type CommandBook='sennet'|'games'|'settings';

const BOOKS=[
  {id:'sennet',name:'Sennet',subtitle:'Instructions',n:'01'},
  {id:'games',name:'Games',subtitle:'Games & library',n:'02'},
  {id:'settings',name:'Settings',subtitle:'Preferences',n:'03'}
] as const;

/** The name/number tag IS the book drawer. Click Player 01 (or the
 * corresponding seat number) to expand the tag upward and reveal its books.
 * There are no hover, pin, countdown, or outside-click handlers.
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

  return <div ref={root} className={'player-hub'+(open?' is-open':'')}>
    <button type="button" className="player-hub-tab"
      onClick={()=>setOpen(previous=>!previous)}
      aria-controls={shelfId} aria-expanded={open}
      aria-label={label+(displayName?', '+displayName:'')+'. '+(open?'Collapse':'Expand')+' books'}
      title={open?'Collapse your books':'Expand your books'}>
      <span className="player-hub-number">{label}</span>
    </button>
    <div id={shelfId} className="player-hub-content" aria-hidden={!open}>
      {displayName&&<div className="player-hub-name">{displayName}</div>}
      <div className="player-hub-books" aria-label="Your command books">
        {BOOKS.map(book=><button key={book.id} type="button"
          className={'table-book book-'+book.id+(activeBook===book.id?' opened':'')}
          tabIndex={open?0:-1}
          aria-label={'Open '+book.name+' book'}
          title={'Open '+book.name}
          onClick={()=>openBook(book.id)}>
          <span className="book-spine" aria-hidden="true"/>
          <span className="book-cover">
            <span className="book-ornament">✦</span>
            <span className="book-title">{book.name}</span>
            <span className="book-rule"/>
            <span className="book-subtitle">{book.subtitle}</span>
            <span className="book-number">{book.n}</span>
          </span>
        </button>)}
      </div>
      <nav className="player-hub-utilities" aria-label="Table utilities"><button type="button" onClick={onLog} tabIndex={open?0:-1} title="Show action log">▤ <span>Log</span></button><button type="button" onClick={onRecall} tabIndex={open?0:-1} title="Restore previous table">↶ <span>Recall</span></button></nav>
    </div>
  </div>;
}
