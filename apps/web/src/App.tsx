import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {ArrowLeft,BookOpen,Check,ChevronRight,Code2,Copy,Dices,Download,FlipHorizontal,Globe2,Layers,Link2,Minus,Play,Plus,RotateCw,Save,Search,Settings2,ShieldCheck,Shuffle,SkipForward,Trash2,Upload,Users,Wifi,WifiOff,X,Zap} from 'lucide-react';
import {applyCommand,createGame,createId,gameFromPack,parseGamePack,replay,type Command,type EventRecord,type GameKind,type GamePack,type GameState,type PlayMode,type TableObject} from '@sennet/core';
import {runLua,SAMPLE_LUA} from '@sennet/lua';
import TableCanvas from './components/TableCanvas';
import {RoomConnection} from './lib/network';
import {choosePseudoBotAction} from './lib/bot';
import {directUpload,downloadText,getPacks,importPackFile,importPackUrl,rememberPack} from './lib/storage';

type Book = 'sennet'|'games'|'settings';
type GamePage = 'all'|'recent'|'library'|'tools';
type SettingsPage = 'general'|'multiplayer'|'scripting';
type SavedSession = {id:string;title:string;updated:number;initial:GameState;game:GameState;history:EventRecord[]};
const KINDS:{id:GameKind;label:string;description:string;symbol:string}[]=[
  {id:'sandbox',label:'Sandbox',description:'An open table with no rules.',symbol:'◈'},
  {id:'boardgame',label:'Board Games',description:'Boards, tiles, pawns and strategy.',symbol:'♟'},
  {id:'tcg',label:'Trading Card Games',description:'Cards, decks, hands and battles.',symbol:'▤'},
  {id:'rpg',label:'Tabletop RPGs',description:'Campaigns, maps and characters.',symbol:'⚔'},
  {id:'wargame',label:'Wargames',description:'Miniatures and tactical encounters.',symbol:'♜'},
  {id:'dice',label:'Dice & Tiles',description:'Dice, dominoes and tabletop classics.',symbol:'⚄'},
  {id:'party',label:'Party Games',description:'Quick games with friends.',symbol:'✦'},
  {id:'custom',label:'Custom Games',description:'Build whatever you can imagine.',symbol:'✳'}
];
const ACTOR_KEY='sennet.actor.v1';
const RECENT_KEY='sennet.recent.v1';
function emptyTable():GameState{return {...createGame('sandbox'),objects:[],players:[],message:'A fresh table. Open a book to begin.'};}
function localActor(){try{let id=localStorage.getItem(ACTOR_KEY);if(!id){id='player_'+createId();localStorage.setItem(ACTOR_KEY,id);}return id;}catch{return 'player-local';}}
function recentGames():SavedSession[]{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.slice(0,8):[];}catch{return [];}}
const json=(value:unknown)=>JSON.stringify(value,null,2);
const nameFor=(kind:GameKind)=>KINDS.find(k=>k.id===kind)?.label||kind;
const Tabs=({items,active,change}:{items:{id:string;label:string}[];active:string;change:(value:string)=>void})=><div className="book-tabs" role="tablist">{items.map(item=><button role="tab" aria-selected={active===item.id} className={active===item.id?'current':''} key={item.id} onClick={()=>change(item.id)}>{item.label}</button>)}</div>;

export default function App(){
  const [game,setGame]=useState<GameState>(emptyTable);
  const [initial,setInitial]=useState<GameState>(emptyTable);
  const [history,setHistory]=useState<EventRecord[]>([]);
  const current=useRef(game);current.current=game;
  const sessionId=useRef(createId());
  const [recent,setRecent]=useState<SavedSession[]>(recentGames);
  const [book,setBook]=useState<Book|null>(null);
  const [gamesPage,setGamesPage]=useState<GamePage>('all');
  const [settingsPage,setSettingsPage]=useState<SettingsPage>('general');
  const [selected,setSelected]=useState<string|null>(null);
  const [seat,setSeat]=useState(0);
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [packs,setPacks]=useState<GamePack[]>(getPacks);
  const [packUrl,setPackUrl]=useState('');
  const [packTitle,setPackTitle]=useState('My tabletop creation');
  const [assetName,setAssetName]=useState('New miniature');
  const [spriteUrls,setSpriteUrls]=useState('');
  const [signedUrl,setSignedUrl]=useState('');
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [deckName,setDeckName]=useState('My first deck');
  const [cardName,setCardName]=useState('');
  const [cards,setCards]=useState([{name:'The Wanderer',amount:4},{name:'Moon Sentinel',amount:3},{name:'Golden Oracle',amount:2}]);
  const [script,setScript]=useState(SAMPLE_LUA);
  const [scriptOutput,setScriptOutput]=useState('');
  const [endpoint,setEndpoint]=useState(()=>localStorage.getItem('sennet.ws')||import.meta.env.VITE_SENNET_WS_URL||'');
  const [room,setRoom]=useState(()=>new URLSearchParams(window.location.search).get('room')||'');
  const [playerName,setPlayerName]=useState(()=>localStorage.getItem('sennet.name')||'Player');
  const [onlineStatus,setOnlineStatus]=useState('Offline · local game');
  const [isConnected,setConnected]=useState(false);
  const [replayAt,setReplayAt]=useState<number|null>(null);
  const connection=useRef<RoomConnection|null>(null);
  const actor=useMemo(localActor,[]);
  const activeObject=game.objects.find(o=>o.id===selected);
  const replayIndex=replayAt===null?-1:history.findIndex(h=>h.seq===replayAt);
  const viewedGame=replayAt===null?game:replay(initial,history.slice(0,replayIndex+1));

  function inform(message:string){setNotice(message);window.setTimeout(()=>setNotice(s=>s===message?'':s),4500);}
  function resetWith(next:GameState,id=createId(),past:EventRecord[]=[],origin:GameState=next){
    if(connection.current)disconnect();
    sessionId.current=id;current.current=next;setInitial(origin);setGame(next);setHistory(past);setSelected(null);setReplayAt(null);setBook(null);
  }
  function startGame(kind:GameKind){resetWith(createGame(kind));}
  function loadPack(pack:GamePack){resetWith(gameFromPack(pack));}
  function loadRecent(s:SavedSession){resetWith(s.game,s.id,s.history,s.initial);}
  function returnToEmpty(){resetWith(emptyTable());}
  function takeAction(type:Command['type'],payload:Record<string,unknown>={}){
    if(replayAt!==null){inform('Exit replay mode before making a move.');return;}
    const command:Command={id:createId(),actor:isConnected?actor:'local',type,payload};
    if(isConnected){try{connection.current?.send(command);}catch(e){inform(String(e));}return;}
    try{
      const next=applyCommand(current.current,command);current.current=next;setGame(next);
      setHistory(h=>[...h,{...command,seq:next.seq,at:Date.now()}]);
    }catch(e){inform(e instanceof Error?e.message:String(e));}
  }
  function disconnect(){connection.current?.close();connection.current=null;setConnected(false);setOnlineStatus('Offline · local game');}
  function joinRoom(){
    try{
      const url=new URL(endpoint);
      if(!['ws:','wss:'].includes(url.protocol))throw new Error('Use a ws:// or wss:// relay address.');
      if(location.protocol==='https:'&&url.protocol!=='wss:')throw new Error('HTTPS needs a secure wss:// relay.');
      const roomId=room.trim()||('table-'+createId().slice(0,8));
      if(!/^[a-z0-9_-]{3,48}$/i.test(roomId))throw new Error('Room ID must be 3–48 letters, numbers, dashes or underscores.');
      disconnect();localStorage.setItem('sennet.ws',endpoint);localStorage.setItem('sennet.name',playerName);
      setRoom(roomId);setOnlineStatus('Connecting…');
      const link=new URL(location.href);link.searchParams.set('room',roomId);window.history.replaceState({},'',link);
      connection.current=new RoomConnection(endpoint,roomId,game.kind,actor,seat,playerName,{
        onState:state=>{current.current=state;setGame(state);setInitial(state);setHistory([]);setReplayAt(null);setConnected(true);setBook(null);},
        onEvent:event=>{try{if(event.seq!==current.current.seq+1)throw new Error('Sequence gap');const next=applyCommand(current.current,event);current.current=next;setGame(next);setHistory(h=>[...h,event as EventRecord]);}catch{inform('Out of sync. Reconnect to resynchronize.');}},
        onPlayers:players=>{const next={...current.current,players};current.current=next;setGame(next);},
        onStatus:setOnlineStatus,onError:inform
      });
    }catch(e){inform(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>()=>connection.current?.close(),[]);
  useEffect(()=>{
    if(isConnected||(game.objects.length===0&&history.length===0))return;
    setRecent(old=>{
      const saved:SavedSession={id:sessionId.current,title:nameFor(game.kind),updated:Date.now(),initial,game,history:history.slice(-500)};
      const updated=[saved,...old.filter(item=>item.id!==saved.id)].slice(0,8);
      try{localStorage.setItem(RECENT_KEY,JSON.stringify(updated));}catch{/* Storage may be full. */}
      return updated;
    });
  },[game,history,initial,isConnected]);
  useEffect(()=>{
    const handleKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setBook(null);setReplayAt(null);}};
    window.addEventListener('keydown',handleKey);return()=>window.removeEventListener('keydown',handleKey);
  },[]);
  async function importLocal(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;
    try{const pack=await importPackFile(file);rememberPack(pack);setPacks(getPacks());inform('Imported '+pack.name);}catch(e){inform(String(e));}
    event.target.value='';
  }
  async function importRemote(){try{const pack=await importPackUrl(packUrl);rememberPack(pack);setPacks(getPacks());setPackUrl('');inform('Added '+pack.name);}catch(e){inform(String(e));}}
  function exportGame(){
    const pack:GamePack={schema:'sennet.pack/1',id:'sennet.'+createId().slice(0,8),name:packTitle,author:playerName,kind:game.kind,objects:game.objects,license:'Creator supplied'};
    downloadText(pack.id+'.json',json(pack));rememberPack(pack);setPacks(getPacks());inform('Game exported. You can host it on your own storage.');
  }
  function addSprite(){
    const urls=spriteUrls.split(/[\s,]+/).filter(Boolean);
    if(!urls.length){inform('Enter image URLs for your miniature.');return;}
    takeAction('ADD',{object:{id:createId(),kind:'miniature',name:assetName,x:500,y:330,frameUrls:urls,color:'#b89d78'}});
    setBook(null);
  }
  async function uploadDirect(){
    if(!uploadFile){inform('Choose a file first.');return;}
    try{await directUpload(uploadFile,signedUrl);inform('File uploaded directly to your storage, not Sennet.');}
    catch(e){inform(String(e));}
  }
  function undo(){
    if(isConnected){inform('Undo requires a server-approved action in an online game.');return;}
    if(!history.length)return;
    const previous=history.slice(0,-1);const next=replay(initial,previous);
    current.current=next;setGame(next);setHistory(previous);setReplayAt(null);
  }
  function botMove(){
    if(isConnected){inform('The demo bot is available offline.');return;}
    const action=choosePseudoBotAction(current.current);
    if(action)takeAction(action.type,action.payload);else inform('No available move.');
  }
  function createDeck(){
    const next=createGame('tcg');
    let order=0;
    const objects:TableObject[]=cards.flatMap(card=>Array.from({length:card.amount},()=>({
      id:'deck-'+createId(),kind:'card' as const,name:card.name,x:270,y:490,rotation:0,faceUp:false,color:'#a7a0c7',zone:'DECK' as const,order:order++
    })));
    resetWith({...next,objects,message:deckName+' · '+objects.length+' cards'});
  }
  async function executeLua(){
    try{
      setScriptOutput('Running Lua…');
      const actions=await runLua(script,{kind:game.kind,objects:game.objects.map(o=>({id:o.id,kind:o.kind,x:o.x,y:o.y}))});
      for(const action of actions){
        if(['ADD','MOVE','ROTATE','FLIP','DELETE','CLONE','ROLL','DRAW','SHUFFLE','NEXT_TURN'].includes(action.type))takeAction(action.type as Command['type'],action.payload);
      }
      setScriptOutput('Lua completed · '+actions.length+' action(s) submitted.');
    }catch(e){setScriptOutput('Lua error: '+String(e));}
  }
  const BOOKS:{id:Book;number:string;subtitle:string}[]=[
    {id:'sennet',number:'01',subtitle:'Instructions'},
    {id:'games',number:'02',subtitle:'Games & library'},
    {id:'settings',number:'03',subtitle:'Preferences'}
  ];
  return <div className="sennet-home">
    <div className="table-world">
      <TableCanvas state={viewedGame} seat={seat} playerName={playerName} actorId={actor} selected={selected}
        onSelect={setSelected} onMove={(id,x,y)=>{
          const old=game.objects.find(o=>o.id===id);if(old&&Math.hypot(old.x-x,old.y-y)>=2)takeAction('MOVE',{id,x,y});
        }} readonly={replayAt!==null}/>
    </div>
    <div className="table-books" aria-label="Tabletop command books">
      {BOOKS.map(b=><button key={b.id} className={'table-book book-'+b.id+(book===b.id?' opened':'')} onClick={()=>setBook(b.id)} aria-label={'Open '+b.id+' book'}>
        <span className="book-spine" aria-hidden="true"/><span className="book-cover">
          <span className="book-ornament">✦</span><span className="book-title">{b.id==='sennet'?'Sennet':b.id==='games'?'Games':'Settings'}</span>
          <span className="book-rule"/><span className="book-subtitle">{b.subtitle}</span><span className="book-number">{b.number}</span>
        </span>
      </button>)}
    </div>
    {book&&<div className="reader-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setBook(null);}}>
      <section className="reader" role="dialog" aria-modal="true" aria-label={book+' book'}>
        <header className="reader-header"><span className="reader-mark">S</span><div><span className="reader-eyebrow">SENNET · VOLUME {book==='sennet'?'01':book==='games'?'02':'03'}</span><h1>{book==='sennet'?'Sennet':book==='games'?'Games':'Settings'}</h1></div>
          <button className="reader-close" onClick={()=>setBook(null)} aria-label="Close book"><X size={22}/></button>
        </header>
        <div className="reader-content">
          {book==='sennet'&&<div className="guide">
            <p className="intro">Your tabletop. Your rules. Everything begins at an empty table with three books.</p>
            <div className="guide-grid">
              <article><span>01</span><h3>Start with Games</h3><p>Open the Games book to choose a game type, resume a recent table, or load a community game from your library.</p></article>
              <article><span>02</span><h3>Move your pieces</h3><p>Drag cards, tokens and miniatures directly across the felt. Select a piece to adjust it using Games → Table Tools.</p></article>
              <article><span>03</span><h3>Always your seat</h3><p>Your seat remains at the bottom. Every other seat and its pieces are oriented relative to you. Choose a seat in Settings.</p></article>
              <article><span>04</span><h3>Replay every move</h3><p>Actions are stored as compact commands, not video. Export or replay them from Games → Table Tools.</p></article>
              <article><span>05</span><h3>Bring your own games</h3><p>Import JSON game packs and externally hosted sprite sheets. Large creator files stay on their own hosting.</p></article>
              <article><span>06</span><h3>Multiplayer</h3><p>Connect a secure relay through Settings to join a shared table. Local tabletop play works without a connection.</p></article>
            </div>
            <button className="reader-primary" onClick={()=>{setBook('games');setGamesPage('all');}}>Open Games <ChevronRight size={17}/></button>
          </div>}
          {book==='games'&&<>
            <Tabs items={[{id:'all',label:'All Games'},{id:'recent',label:'Recent'},{id:'library',label:'Library'},{id:'tools',label:'Table Tools'}]} active={gamesPage} change={v=>setGamesPage(v as GamePage)}/>
            {gamesPage==='all'&&<><div className="reader-heading"><div><h2>Choose a game</h2><p>Make the table yours. Your selection loads directly onto the felt.</p></div><label className="book-search"><Search size={15}/><input placeholder="Search games…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
              <div className="game-choices">{KINDS.filter(k=>(k.label+k.description).toLowerCase().includes(search.toLowerCase())).map(k=><button className="game-choice" key={k.id} onClick={()=>startGame(k.id)}>
                <span className="game-symbol">{k.symbol}</span><span><strong>{k.label}</strong><small>{k.description}</small></span><ChevronRight size={18}/></button>)}</div>
            </>}
            {gamesPage==='recent'&&<><div className="reader-heading"><div><h2>Recent tables</h2><p>Continue any locally saved tabletop session.</p></div></div>
              {recent.length?<div className="entry-list">{recent.map(s=><button key={s.id} onClick={()=>loadRecent(s)}><Layers size={21}/><span><strong>{s.title}</strong><small>{s.game.objects.length} objects · {s.history.length} moves · {new Date(s.updated).toLocaleString()}</small></span><ChevronRight size={19}/></button>)}</div>:<p className="reader-empty">No recent games. Start one from All Games to save it here.</p>}
              <button className="reader-secondary" onClick={returnToEmpty}>Return to an empty table</button>
            </>}
            {gamesPage==='library'&&<>
              <div className="reader-heading"><div><h2>Game library</h2><p>Community game packs and your own creations.</p></div></div>
              {packs.length?<div className="entry-list">{packs.map(p=><button key={p.id} onClick={()=>loadPack(p)}><BookOpen size={21}/><span><strong>{p.name}</strong><small>{p.author} · {nameFor(p.kind)} · {p.objects.length} objects</small></span><ChevronRight size={19}/></button>)}</div>:<p className="reader-empty">Your library is empty. Import a game to add it here.</p>}
              <div className="reader-block"><h3>Import a game</h3><p>Use a direct HTTPS link to a Sennet JSON game pack, or select one from your device.</p>
                <div className="field-row"><input value={packUrl} onChange={e=>setPackUrl(e.target.value)} placeholder="https://your-storage/game.json"/><button onClick={importRemote}>Import URL</button></div>
                <label className="file-picker"><Upload size={18}/> Import JSON game pack <input type="file" accept=".json,application/json" onChange={importLocal}/></label>
              </div>
              <details className="reader-details"><summary>Export your current game</summary><div><label>Game name<input value={packTitle} onChange={e=>setPackTitle(e.target.value)}/></label><button className="reader-secondary" onClick={exportGame}><Download size={16}/> Export portable game pack</button></div></details>
              <details className="reader-details"><summary>Add a sprite-based miniature</summary><div><label>Miniature name<input value={assetName} onChange={e=>setAssetName(e.target.value)}/></label><label>Image URLs (one per line)<textarea rows={3} value={spriteUrls} onChange={e=>setSpriteUrls(e.target.value)} placeholder="https://your-storage/frame-00.webp"/></label><button className="reader-secondary" onClick={addSprite}><Plus size={16}/> Place miniature on table</button></div></details>
              <details className="reader-details"><summary>Upload to your own storage</summary><div><p>Files go directly from your browser to your storage provider, not to Sennet. Provide a short-lived presigned PUT URL.</p><label>Signed upload URL<input type="password" value={signedUrl} onChange={e=>setSignedUrl(e.target.value)}/></label><label className="file-picker"><Upload size={16}/>{uploadFile?uploadFile.name:'Choose file'}<input type="file" accept=".json,.png,.webp,.glb,.gltf,.zip" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/></label><button className="reader-secondary" onClick={uploadDirect}>Upload directly</button></div></details>
            </>}
            {gamesPage==='tools'&&<><div className="reader-heading"><div><h2>Table tools</h2><p>All tabletop actions live inside your books.</p></div></div>
              <div className="tool-section"><h3>Place an object</h3><div className="tool-buttons"><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'card',name:'New card',x:500,y:330,faceUp:true,color:'#b49acb'}})}><Plus size={17}/> Card</button><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'token',name:'Token',x:500,y:330,color:'#b1bb8c'}})}><Plus size={17}/> Token</button><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'die',name:'D6',x:500,y:330,color:'#dbd8c4',sides:6,value:1}})}><Dices size={17}/> Die</button></div></div>
              <div className="tool-section"><h3>Game commands</h3><div className="tool-buttons"><button onClick={()=>takeAction('DRAW')}><Layers size={17}/> Draw</button><button onClick={()=>takeAction('SHUFFLE',{seed:Date.now()%10000000})}><Shuffle size={17}/> Shuffle</button><button onClick={botMove}><Zap size={17}/> Bot move</button><button onClick={()=>takeAction('NEXT_TURN')}><SkipForward size={17}/> End turn</button><button onClick={undo}><ArrowLeft size={17}/> Undo</button></div></div>
              <div className="tool-section"><h3>{activeObject?'Selected: '+activeObject.name:'Selected object'}</h3>{activeObject?<div className="tool-buttons"><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:-30})}><RotateCw size={16}/> −30°</button><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:30})}><RotateCw size={16}/> +30°</button><button onClick={()=>takeAction('FLIP',{id:selected})}><FlipHorizontal size={16}/> Flip</button><button onClick={()=>takeAction('CLONE',{id:selected,newId:createId()})}><Copy size={16}/> Clone</button>{activeObject.kind==='die'&&<button onClick={()=>takeAction('ROLL',{id:selected,seed:Date.now()})}><Dices size={16}/> Roll</button>}<button onClick={()=>{takeAction('DELETE',{id:selected});setSelected(null);}}><Trash2 size={16}/> Remove</button></div>:<p>Click a piece on the table to select it, then reopen this book.</p>}</div>
              <details className="reader-details"><summary>Build a starter TCG deck</summary><div><label>Deck name<input value={deckName} onChange={e=>setDeckName(e.target.value)}/></label>{cards.map((card,i)=><div key={i} className="card-editor-row"><span>{card.name}</span><button aria-label={'Remove '+card.name} onClick={()=>setCards(a=>a.filter((_,j)=>j!==i))}><X size={13}/></button><button onClick={()=>setCards(a=>a.map((c,j)=>i===j?{...c,amount:Math.max(1,c.amount-1)}:c))}><Minus size={13}/></button><strong>{card.amount}</strong><button onClick={()=>setCards(a=>a.map((c,j)=>i===j?{...c,amount:Math.min(60,c.amount+1)}:c))}><Plus size={13}/></button></div>)}<div className="field-row"><input value={cardName} onChange={e=>setCardName(e.target.value)} placeholder="Card name"/><button onClick={()=>{if(cardName.trim()){setCards(a=>[...a,{name:cardName.trim(),amount:1}]);setCardName('');}}}>Add</button></div><button className="reader-secondary" onClick={createDeck}>Load deck onto table</button></div></details>
              <details className="reader-details"><summary>Move history and replay</summary><div><p>{history.length} actions recorded in compact command format.</p><div className="history-entries">{history.slice(-10).reverse().map(h=><button key={h.id} onClick={()=>{setReplayAt(h.seq);setBook(null);}}>{h.seq}. {h.type.toLowerCase().replaceAll('_',' ')}</button>)}</div>{replayAt!==null&&<button className="reader-secondary" onClick={()=>setReplayAt(null)}>Exit replay</button>}<button className="reader-secondary" onClick={()=>downloadText('sennet-replay.json',json({schema:'sennet.replay/1',initial,history}))}><Download size={15}/> Export moves</button></div></details>
              <button className="reader-primary" onClick={()=>setBook(null)}>Return to table <ChevronRight size={16}/></button>
            </>}
          </>}
          {book==='settings'&&<>
            <Tabs items={[{id:'general',label:'General'},{id:'multiplayer',label:'Multiplayer'},{id:'scripting',label:'Lua Scripting'}]} active={settingsPage} change={v=>setSettingsPage(v as SettingsPage)}/>
            {settingsPage==='general'&&<><div className="reader-heading"><div><h2>Your perspective</h2><p>Your own seat is always positioned at the bottom. The table rotates around it.</p></div></div>
              <div className="reader-block"><h3>Player</h3><label>Display name<input value={playerName} maxLength={32} onChange={e=>setPlayerName(e.target.value)}/></label><label>My seat<select value={seat} onChange={e=>setSeat(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>Seat {i+1}</option>)}</select></label></div>
              <div className="reader-block"><h3>Play mode</h3><div className="tool-buttons">{(['sandbox','turn-based','asynchronous'] as PlayMode[]).map(m=><button className={game.mode===m?'highlight':''} key={m} onClick={()=>takeAction('SET_MODE',{mode:m})}>{m==='sandbox'?'Live Sandbox':m==='turn-based'?'Turn Based':'Asynchronous'}</button>)}</div></div>
              <div className="reader-block"><h3>Current table</h3><p>{nameFor(game.kind)} · {game.objects.length} objects · {history.length} moves</p><button className="reader-secondary" onClick={returnToEmpty}>Clear view and open an empty table</button></div>
            </>}
            {settingsPage==='multiplayer'&&<><div className="reader-heading"><div><h2>Multiplayer</h2><p>Join a room through a secure WebSocket relay. The public GitHub Pages site runs locally until a relay is configured.</p></div></div>
              <div className="reader-block"><div className="status-line">{isConnected?<Wifi size={16}/>:<WifiOff size={16}/>} {onlineStatus}</div><label>Server URL<input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="wss://your-sennet-relay.example"/></label><label>Room ID<input value={room} onChange={e=>setRoom(e.target.value)} placeholder="friends-table"/></label><div className="tool-buttons"><button onClick={joinRoom}><Wifi size={16}/> Join / Create</button><button onClick={disconnect}><WifiOff size={16}/> Disconnect</button><button onClick={()=>{const link=new URL(location.href);link.searchParams.set('room',room);navigator.clipboard?.writeText(link.href);inform('Invite link copied.');}}><Copy size={16}/> Copy invite</button></div></div>
            </>}
            {settingsPage==='scripting'&&<><div className="reader-heading"><div><h2>Lua scripting</h2><p>Run experimental local game scripts in an isolated worker.</p></div></div>
              <div className="reader-block"><label>Lua script<textarea rows={12} className="code-edit" spellCheck={false} value={script} onChange={e=>setScript(e.target.value)}/></label><button className="reader-secondary" onClick={executeLua}><Play size={16}/> Run script</button><p>{scriptOutput||'Ready to execute.'}</p></div>
              <p className="reader-footnote"><ShieldCheck size={15}/> Untrusted public scripts need stricter per-game limits before production multiplayer.</p>
            </>}
          </>}
        </div>
        <footer className="reader-footer"><span>SENNET · YOUR TABLETOP, YOUR RULES</span><span>ESC TO CLOSE</span></footer>
      </section>
    </div>}
    {replayAt!==null&&!book&&<button className="replay-return" onClick={()=>setReplayAt(null)}>Replay · Return to live table <X size={16}/></button>}
    {notice&&<div className="table-toast" role="status">{notice}<button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={14}/></button></div>}
  </div>;
}
