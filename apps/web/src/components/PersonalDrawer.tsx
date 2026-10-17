import {useEffect,useRef,useState} from 'react';

export type CommandBook='sennet'|'games'|'settings';

const BOOKS=[
  {id:'sennet',name:'Sennet',subtitle:'Instructions',n:'01'},
  {id:'games',name:'Games',subtitle:'Games & library',n:'02'},
  {id:'settings',name:'Settings',subtitle:'Preferences',n:'03'}
] as const;

/** One combined player identity tag and bookshelf.
 * Replaces the old stand-alone personal drawer AND the floating books.
 * The name/seat tag stays accessible in every tabletop view and the
 * existing Sennet, Games, and Settings readers are unchanged.
 */
export default function PersonalDrawer({openBook,activeBook,seat,name}:{
  openBook:(id:CommandBook)=>void;
  activeBook:CommandBook|null;
  seat:number;
  name:string;
}){
  const [open,setOpen]=useState(false);
  const [pinned,setPinned]=useState(false);
  const hovered=useRef(false);
  const root=useRef<HTMLDivElement>(null);
  const hoverTimer=useRef<number|null>(null);
  const retractTimer=useRef<number|null>(null);

  const clear=(timer:{current:number|null})=>{
    if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null;}
  };

  const enter=()=>{
    hovered.current=true;
    clear(retractTimer);
    if(open)return;
    clear(hoverTimer);
    hoverTimer.current=window.setTimeout(()=>{
      hoverTimer.current=null;
      if(hovered.current)setOpen(true);
    },250);
  };

  const leave=()=>{
    hovered.current=false;
    clear(hoverTimer);
    if(!pinned){
      clear(retractTimer);
      retractTimer.current=window.setTimeout(()=>{
        retractTimer.current=null;
        if(!hovered.current)setOpen(false);
      },1000);
    }
  };

  const toggle=()=>{
    clear(hoverTimer);clear(retractTimer);
    if(pinned){
      setPinned(false);
      setOpen(hovered.current);
    }else{
      setPinned(true);
      setOpen(true);
    }
  };

  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{
      if(!root.current?.contains(event.target as Node)){
        clear(hoverTimer);clear(retractTimer);
        hovered.current=false;
        setPinned(false);setOpen(false);
      }
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        clear(hoverTimer);clear(retractTimer);
        setPinned(false);setOpen(false);
      }
    };
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',key);
    return ()=>{
      document.removeEventListener('pointerdown',dismiss);
      document.removeEventListener('keydown',key);
      clear(hoverTimer);clear(retractTimer);
    };
  },[]);

  const displayName=name.trim()||'Player';
  const shelfId='personal-player-books';

  return <div ref={root} className={'player-hub'+(open?' is-open':'')}
    onPointerEnter={enter} onPointerLeave={leave}
    onPointerDown={event=>event.stopPropagation()}>
    <div id={shelfId} className="player-hub-panel" aria-hidden={!open}>
      <div className="player-hub-books" aria-label="Your command books">
        {BOOKS.map(book=><button key={book.id} type="button"
          className={'table-book book-'+book.id+(activeBook===book.id?' opened':'')}
          tabIndex={open?0:-1}
          aria-label={'Open '+book.name+' book'}
          title={'Open '+book.name}
          onClick={()=>{
            setPinned(false);setOpen(false);hovered.current=false;
            openBook(book.id);
          }}>
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
    </div>
    <button type="button" className="player-hub-tab"
      onClick={toggle}
      aria-controls={shelfId} aria-expanded={open}
      aria-label={displayName+', seat '+(seat+1)+'. '+(open?'Close':'Open')+' your books'}
      title={open?'Close your books':'Open your books'}>
      <span className="player-hub-grip" aria-hidden="true">{open?'⌄':'⌃'}</span>
      <span className="player-hub-identity">
        <span className="player-hub-name">{displayName}</span>
        <span className="player-hub-seat">SEAT {seat+1}</span>
      </span>
    </button>
  </div>;
}
