import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowRight,Box,Check,ChevronDown,ChevronRight,Code2,Copy,Dices,Download,ExternalLink,FileJson,FlipHorizontal,Gamepad2,Globe2,Grid2X2,Layers,Link2,Menu,MonitorSmartphone,MoreHorizontal,Move,PackageOpen,Play,Plus,Redo2,RotateCw,Save,ScrollText,Search,Settings2,ShieldCheck,Shuffle,SlidersHorizontal,SkipForward,SquareStack,Trash2,Upload,Users,Wifi,WifiOff,X,Zap} from 'lucide-react';
import {applyCommand,createGame,createId,gameFromPack,parseGamePack,replay,type Command,type EventRecord,type GameKind,type GamePack,type GameState,type PlayMode,type TableObject} from '@sennet/core';
import {runLua,SAMPLE_LUA} from '@sennet/lua';
import TableCanvas from './components/TableCanvas';
import {RoomConnection} from './lib/network';
import {choosePseudoBotAction} from './lib/bot';
import {directUpload,downloadText,getPacks,importPackFile,importPackUrl,rememberPack} from './lib/storage';
type Page='discover'|'table'|'workshop'|'decks'|'settings';
const KINDS: {id:GameKind;label:string;desc:string;icon:string;accent:string}[]=[
  {id:'sandbox',label:'Sandbox',desc:'No rules. Infinite possibilities.',icon:'◈',accent:'#a3d5ba'},
  {id:'boardgame',label:'Board Games',desc:'Every classic, reimagined.',icon:'▦',accent:'#e4c28c'},
  {id:'tcg',label:'Trading Cards',desc:'Build decks. Make your move.',icon:'▤',accent:'#bca7e1'},
  {id:'rpg',label:'Tabletop RPG',desc:'Tell stories together.',icon:'⚔',accent:'#d6aa94'},
  {id:'wargame',label:'Wargames',desc:'Your battlefield awaits.',icon:'♜',accent:'#c4bc91'},
  {id:'dice',label:'Dice & Tiles',desc:'A roll of the imagination.',icon:'⚄',accent:'#c5dae9'},
  {id:'party',label:'Party Games',desc:'Better together.',icon:'✦',accent:'#f0bc87'},
  {id:'custom',label:'Custom Games',desc:'Made by the community.',icon:'✳',accent:'#91c9c6'}
];
const ACTOR_KEY='sennet.actor.v1';
function actorId(){let id=localStorage.getItem(ACTOR_KEY);if(!id){id='user_'+createId().replace(/-/g,'');localStorage.setItem(ACTOR_KEY,id);}return id;}
const shortId=()=>createId().slice(0,8);
const encode=(v:unknown)=>JSON.stringify(v,null,2);
const friendly=(kind:GameKind)=>KINDS.find(x=>x.id===kind)?.label||kind;
const DEFAULT_WS=import.meta.env.VITE_SENNET_WS_URL||'';
const RESTORED:(null|{initial:GameState;game:GameState;history:EventRecord[]})=(()=>{try{const data=JSON.parse(localStorage.getItem('sennet.local-session.v1')||'null');return data?.initial?.version===1 && data?.game?.version===1 && Array.isArray(data.history)?data:null;}catch{return null;}})();
function SectionTitle({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){return <div className="section-title"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>}
export default function App(){
  const [page,setPage]=useState<Page>('discover');
  const [initial,setInitial]=useState<GameState>(()=>RESTORED?.initial||createGame('sandbox'));
  const [game,setGame]=useState<GameState>(()=>RESTORED?.game||initial);
  const stateRef=useRef(game);stateRef.current=game;
  const [history,setHistory]=useState<EventRecord[]>(()=>RESTORED?.history||[]);
  const [selected,setSelected]=useState<string|null>(null);
  const [seat,setSeat]=useState(0);
  const [notice,setNotice]=useState('');
  const [onlineStatus,setOnlineStatus]=useState('Offline · local-first');
  const [endpoint,setEndpoint]=useState(()=>localStorage.getItem('sennet.ws')||DEFAULT_WS);
  const [room,setRoom]=useState(()=>new URLSearchParams(location.search).get('room')||'');
  const [playerName,setPlayerName]=useState(()=>localStorage.getItem('sennet.name')||'Player');
  const connection=useRef<RoomConnection|null>(null);
  const [isConnected,setConnected]=useState(false);
  const [replayAt,setReplayAt]=useState<number|null>(null);
  const [search,setSearch]=useState('');
  const [script,setScript]=useState(SAMPLE_LUA);
  const [luaResult,setLuaResult]=useState('');
  const [packs,setPacks]=useState<GamePack[]>(getPacks);
  const [packUrl,setPackUrl]=useState('');
  const [signedPut,setSignedPut]=useState('');
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [workshopName,setWorkshopName]=useState('My tabletop creation');
  const [cardRows,setCardRows]=useState([{name:'The Wanderer',amount:4},{name:'Moon Sentinel',amount:3},{name:'Golden Oracle',amount:2}]);
  const [newCard,setNewCard]=useState('');
  const [deckName,setDeckName]=useState('The First Deck');
  const [assetName,setAssetName]=useState('My miniature');
  const [spriteUrls,setSpriteUrls]=useState('');
  const [spriteColor,setSpriteColor]=useState('#9fbaa8');
  const actor=useMemo(actorId,[]);
  const count=game.objects.length;
  const activeObject=game.objects.find(o=>o.id===selected);
  const preview=replayAt===null?game:replay(initial,history.slice(0,Math.max(0,history.findIndex(h=>h.seq===replayAt)+1)));
  function alertUser(message:string){setNotice(message);window.setTimeout(()=>setNotice(n=>n===message?'':n),4800);}
  function takeAction(type:Command['type'],payload:Record<string,unknown>={}){
    if(replayAt!==null){alertUser('Exit replay before making a move');return;}
    const command:Command={id:createId(),actor:isConnected?actor:'local',type,payload};
    if(isConnected){
      try{connection.current?.send(command);}catch(err){alertUser(String(err));}
    }else{
      try{
        const next=applyCommand(stateRef.current,command);stateRef.current=next;setGame(next);
        setHistory(h=>[...h,{...command,seq:next.seq,at:Date.now()}]);
      }catch(err){alertUser(err instanceof Error?err.message:String(err));}
    }
  }
  function startGame(kind:GameKind){
    if(isConnected){disconnect();}
    const state=createGame(kind);setInitial(state);setGame(state);stateRef.current=state;setHistory([]);setSelected(null);setReplayAt(null);setPage('table');
  }
  function loadPack(pack:GamePack){
    if(isConnected)disconnect();
    const next=gameFromPack(pack);setInitial(next);setGame(next);stateRef.current=next;setHistory([]);setSelected(null);setReplayAt(null);setPage('table');
  }
  function disconnect(){connection.current?.close();connection.current=null;setConnected(false);setOnlineStatus('Offline · local-first');}
  function joinRoom(){
    try{
      if(!endpoint)throw new Error('Enter a WebSocket server URL first');
      const uri=new URL(endpoint);if(!['ws:','wss:'].includes(uri.protocol))throw new Error('Use ws:// or wss://');
      if(location.protocol==='https:'&&uri.protocol!=='wss:')throw new Error('HTTPS websites require a secure wss:// server');
      const roomId=room.trim()||`table-${shortId()}`;
      if(!/^[a-zA-Z0-9_-]{3,48}$/.test(roomId))throw new Error('Room names must be 3–48 letters, numbers, - or _');
      if(connection.current)disconnect();
      localStorage.setItem('sennet.ws',endpoint);localStorage.setItem('sennet.name',playerName);
      setRoom(roomId);setOnlineStatus('Connecting…');
      const next=new RoomConnection(endpoint,roomId,game.kind,actor,seat,playerName,{
        onState:state=>{stateRef.current=state;setGame(state);setInitial(state);setHistory([]);setReplayAt(null);setConnected(true);},
        onEvent:record=>{try{
          if(record.seq!==stateRef.current.seq+1)throw new Error('Sequence gap');
          const nextState=applyCommand(stateRef.current,record);stateRef.current=nextState;setGame(nextState);setHistory(h=>[...h,record]);
        }catch(err){alertUser('Out of sync: reconnect to resynchronize');}},
        onPlayers:players=>{setGame(g=>({...g,players}));stateRef.current={...stateRef.current,players};},
        onStatus:setOnlineStatus,onError:alertUser
      });
      connection.current=next;
      const url=new URL(location.href);url.searchParams.set('room',roomId);historyReplace(url);
      setPage('table');
    }catch(error){alertUser(error instanceof Error?error.message:String(error));}
  }
  function historyReplace(url:URL){window.history.replaceState({},'',url.toString());}
  useEffect(()=>()=>connection.current?.close(),[]);
  useEffect(()=>{if(game.roomId==='local'&&!isConnected){try{localStorage.setItem('sennet.local-session.v1',JSON.stringify({initial,game,history:history.slice(-500)}));}catch{/* Local storage quota exceeded. */}}},[initial,game,history,isConnected]);
  function exportActions(){downloadText(`sennet-${game.kind}-${Date.now()}-replay.json`,encode({schema:'sennet.replay/1',initial,history}));}
  function exportPack(){
    const pack:GamePack={schema:'sennet.pack/1',id:`sennet.${shortId()}`,name:workshopName,author:playerName,kind:game.kind,objects:game.objects,description:'Created with Sennet',license:'Creator supplied'};
    downloadText(`${pack.id}.json`,encode(pack));rememberPack(pack);setPacks(getPacks());alertUser('Game pack exported. Host the file anywhere you choose.');
  }
  async function importLocalPack(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    try{const pack=await importPackFile(file);rememberPack(pack);setPacks(getPacks());alertUser(`Imported ${pack.name}`);}catch(err){alertUser(String(err));}
    e.target.value='';
  }
  async function importRemote(){try{const pack=await importPackUrl(packUrl);rememberPack(pack);setPacks(getPacks());setPackUrl('');alertUser(`Added ${pack.name}`);}catch(err){alertUser(String(err));}}
  async function publishDirect(){
    if(!uploadFile){alertUser('Select a file to upload');return;}
    try{await directUpload(uploadFile,signedPut);alertUser('Uploaded directly to your storage. Sennet did not receive the file.');}
    catch(err){alertUser(String(err));}
  }
  function addSprite(){
    const frames=spriteUrls.split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);
    if(!frames.length){alertUser('Enter at least one HTTPS image URL');return;}
    const source={id:createId(),kind:'miniature',name:assetName,x:500,y:330,color:spriteColor,frameUrls:frames};
    takeAction('ADD',{object:source});setPage('table');alertUser('Sprite miniature added to table');
  }
  function undoLocal(){
    if(isConnected){alertUser('Undo in online rooms requires an agreed server command');return;}
    if(!history.length)return;
    const remaining=history.slice(0,-1),next=replay(initial,remaining);
    stateRef.current=next;setGame(next);setHistory(remaining);setReplayAt(null);
  }
  function botTurn(){
    if(isConnected){alertUser('Pseudo-AI demo is available offline');return;}
    const cmd=choosePseudoBotAction(game);
    if(cmd)takeAction(cmd.type,cmd.payload);else alertUser('No available move');
  }
  async function executeLua(){
    try{
      setLuaResult('Running Lua in an isolated worker…');
      const actions=await runLua(script,{kind:game.kind,objects:game.objects.map(o=>({id:o.id,kind:o.kind,x:o.x,y:o.y}))});
      for(const item of actions){if(['ADD','MOVE','ROTATE','FLIP','DELETE','CLONE','ROLL','DRAW','SHUFFLE','NEXT_TURN'].includes(item.type)){takeAction(item.type as Command['type'],item.payload);}}
      setLuaResult(`Lua completed · ${actions.length} action(s) proposed and submitted`);
    }catch(err){setLuaResult(`Lua error: ${String(err)}`);}
  }
  function createDeck(){
    const state=createGame('tcg');
    let order=0;
    const list:TableObject[]=cardRows.flatMap(row=>Array.from({length:row.amount},(_,i)=>({id:`deck-${createId()}`,kind:'card' as const,name:row.name,x:268,y:493,rotation:0,faceUp:false,color:['#ae94ce','#8dafad','#cfa47b'][order++%3],zone:'DECK' as const,order:order,owner:undefined})));
    const next={...state,objects:[...state.objects.filter(o=>o.zone!=='DECK'),...list],message:`${deckName}: ${list.length} cards ready`};
    setGame(next);setInitial(next);stateRef.current=next;setHistory([]);setSelected(null);setPage('table');alertUser(`${deckName} loaded on the table`);
  }
  const filteredKinds=KINDS.filter(k=>(k.label+' '+k.desc).toLowerCase().includes(search.toLowerCase()));
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>setPage('discover')} aria-label="Sennet home"><span className="brand-mark">S</span><span className="brand-word">SENNET<span className="brand-dot">.</span><small>YOUR TABLETOP. YOUR RULES.</small></span></button>
      <div className="nav-label">PLAY</div>
      <nav className="nav-list">
        <button className={page==='discover'?'active':''} onClick={()=>setPage('discover')}><Grid2X2 size={18}/> Discover <ChevronRight size={14} className="nav-end"/></button>
        <button className={page==='table'?'active':''} onClick={()=>setPage('table')}><Layers size={18}/> The Table {game.seq>0?<span className="small-counter">{game.seq}</span>:null}</button>
        <button className={page==='decks'?'active':''} onClick={()=>setPage('decks')}><SquareStack size={18}/> Deck Lab</button>
      </nav>
      <div className="nav-label second">CREATE</div>
      <nav className="nav-list">
        <button className={page==='workshop'?'active':''} onClick={()=>setPage('workshop')}><PackageOpen size={18}/> Workshop</button>
        <button className={page==='settings'?'active':''} onClick={()=>setPage('settings')}><Settings2 size={18}/> Settings</button>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><div className="note-icon"><Globe2 size={18}/></div><strong>Made for every table.</strong><span>Browser · Windows · Linux · macOS · Android · iOS</span></div>
        <div className="profile"><div className="avatar">P</div><div><strong>{playerName}</strong><span>{isConnected?'Online table':'Local session'}</span></div><div className={`online-dot ${isConnected?'on':''}`}/></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>SENNET</span><ChevronRight size={14}/><strong>{page==='discover'?'Discover':page==='table'?'The Table':page==='decks'?'Deck Lab':page==='workshop'?'Workshop':'Settings'}</strong></div><div className="top-actions"><span className={`connection-status ${isConnected?'is-online':''}`}>{isConnected?<Wifi size={14}/>:<WifiOff size={14}/>} {onlineStatus}</span><button className="icon-button" title="Settings" onClick={()=>setPage('settings')}><SlidersHorizontal size={18}/></button><span className="top-avatar">P</span></div></header>
      {page==='discover'&&<div className="page-content discover-page">
        <div className="hero"><div className="hero-copy"><span className="hero-tag"><span className="hero-spark">✧</span> THE TABLETOP, REIMAGINED</span><h1>Every world begins<br/>at a <em>table.</em></h1><p>Cards, dice, miniatures, and whatever you can imagine. Twelve seats. Infinite ways to play. No 3D engine required.</p><div className="hero-buttons"><button className="button primary" onClick={()=>startGame('sandbox')}><Play size={16} fill="currentColor"/> Enter Sandbox <ArrowRight size={17}/></button><button className="button outline" onClick={()=>setPage('workshop')}><Plus size={17}/> Import a Game</button></div></div><div className="hero-visual" aria-hidden="true"><div className="hero-orbit orbit-one"></div><div className="hero-orbit orbit-two"></div><div className="hero-table"><div className="hero-inner"><span className="card-illustration card-a">✦</span><span className="card-illustration card-b">♜</span><span className="table-glyph">S</span><span className="coin coin-one">☀</span><span className="coin coin-two">☾</span></div></div></div></div>
        <div className="content-heading"><div><span className="eyebrow">CHOOSE YOUR EXPERIENCE</span><h2>What are we playing?</h2></div><div className="search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a game type…" aria-label="Search game types"/></div></div>
        <div className="game-grid">{filteredKinds.map(k=><button key={k.id} className="game-card" onClick={()=>startGame(k.id)} style={{'--card-accent':k.accent} as React.CSSProperties}><span className="game-icon">{k.icon}</span><span className="game-card-text"><strong>{k.label}</strong><span>{k.desc}</span></span><ArrowRight size={18} className="game-chevron"/></button>)}</div>
        <div className="feature-strip"><div><Zap size={22}/><strong>Lightweight by design</strong><span>Smart 2.5D rendering</span></div><div><Users size={22}/><strong>Up to 12 seats</strong><span>Live or take your time</span></div><div><Code2 size={22}/><strong>Script anything</strong><span>Powered by Lua</span></div><div><Globe2 size={22}/><strong>Bring your own storage</strong><span>Your assets, your host</span></div></div>
      </div>}
      {page==='table'&&<div className="table-page"><div className="table-header"><div><span className="eyebrow">LIVE WORKSPACE / {game.kind.toUpperCase()}</span><h2>{friendly(game.kind)} <span className="muted-heading">/ Table {game.roomId==='local'?'01':game.roomId}</span></h2></div><div className="table-header-actions"><button className="button ghost" onClick={()=>{navigator.clipboard?.writeText(encode({initial,history}));alertUser('Replay copied');}}><Copy size={15}/> Copy Moves</button><button className="button outline" onClick={exportActions}><Download size={15}/> Export Replay</button></div></div>
        <div className="table-workspace"><div className="board-column"><div className="board-toolbar"><div className="mode-switch">{(['sandbox','turn-based','asynchronous'] as PlayMode[]).map(m=><button className={game.mode===m?'selected':''} key={m} onClick={()=>takeAction('SET_MODE',{mode:m})}>{m==='sandbox'?'Live sandbox':m==='turn-based'?'Turn-based':'Async'}</button>)}</div><div className="board-badges"><span><Users size={14}/>{game.players.length||1} player{(game.players.length||1)>1?'s':''}</span><span><Layers size={14}/>{count} objects</span></div></div><div className="board-frame"><TableCanvas state={preview} seat={seat} selected={selected} onSelect={setSelected} onMove={(id,x,y)=>{const old=game.objects.find(o=>o.id===id);if(!old||Math.hypot(old.x-x,old.y-y)<2)return;takeAction('MOVE',{id,x,y});}} readonly={replayAt!==null}/><div className="board-overlay top-left"><span className="tiny-indicator"/> 2.5D / 12 SEATS</div><div className="board-overlay bottom-left">DRAG TO MOVE · SELECT TO EDIT · ALL MOVES RECORDED</div></div><div className="seat-panel"><div className="seat-heading"><strong>YOUR PERSPECTIVE</strong><span>Choose one of 12 viewing angles</span></div><div className="seats">{Array.from({length:12},(_,i)=><button key={i} className={seat===i?'seat-active':''} onClick={()=>setSeat(i)} title={`Seat ${i+1}, ${i*30}°`}>{i+1}</button>)}</div></div><div className="quick-actions"><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'card',name:'New card',x:500,y:325,faceUp:true,color:'#bcabdc'}})}><Plus size={17}/> Card</button><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'token',name:'Token',x:500,y:325,color:'#9bbfac'}})}><Plus size={17}/> Token</button><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'die',name:'D6',x:500,y:325,color:'#dfd3b1',sides:6,value:1}})}><Dices size={17}/> Die</button><button onClick={()=>takeAction('DRAW',{})}><SquareStack size={17}/> Draw</button><button onClick={()=>takeAction('SHUFFLE',{seed:Date.now()%1000000})}><Shuffle size={17}/> Shuffle</button><button onClick={undoLocal}><Redo2 size={17} style={{transform:'scaleX(-1)'}}/> Undo</button><button onClick={botTurn}><Zap size={17}/> Bot move</button><button onClick={()=>takeAction('NEXT_TURN')}><SkipForward size={17}/> End turn</button></div></div>
          <aside className="inspector"><div className="inspector-title"><div><span className="eyebrow">OBJECT INSPECTOR</span><h3>{activeObject?activeObject.name:'No selection'}</h3></div><MoreHorizontal size={18}/></div>{activeObject?<div className="inspector-content"><div className="selected-preview"><span style={{color:activeObject.color}}>{activeObject.kind==='card'?'▤':activeObject.kind==='die'?'⚄':activeObject.kind==='miniature'?'♟':'◈'}</span><small>{activeObject.kind.toUpperCase()}</small></div><div className="object-meta"><span>TYPE</span><strong>{activeObject.kind}</strong></div><div className="object-meta"><span>POSITION</span><strong>{Math.round(activeObject.x)}, {Math.round(activeObject.y)}</strong></div><div className="object-meta"><span>ROTATION</span><strong>{activeObject.rotation}°</strong></div><div className="object-meta"><span>ZONE</span><strong>{activeObject.zone}</strong></div><div className="tool-grid"><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:-30})}><RotateCw size={16} style={{transform:'scaleX(-1)'}}/> −30°</button><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:30})}><RotateCw size={16}/> +30°</button><button onClick={()=>takeAction('FLIP',{id:selected})}><FlipHorizontal size={16}/> Flip</button><button onClick={()=>takeAction('CLONE',{id:selected,newId:createId()})}><Copy size={16}/> Clone</button>{activeObject.kind==='die'&&<button onClick={()=>takeAction('ROLL',{id:selected,seed:Date.now()})}><Dices size={16}/> Roll</button>}<button className="danger" onClick={()=>{takeAction('DELETE',{id:selected});setSelected(null);}}><Trash2 size={16}/> Remove</button></div></div>:<div className="inspector-empty"><div className="empty-symbol">✧</div><h4>Make your move</h4><p>Select any piece on the table to rotate, flip, clone, or remove it.</p></div>}<div className="inspector-divider"/><div className="panel-heading"><strong>TURN HISTORY</strong><span>{history.length} actions</span></div><div className="history-list">{history.length===0?<p className="empty-history">Every move you make appears here. One action, one tiny message.</p>:history.slice(-8).reverse().map(h=><button key={h.id} onClick={()=>setReplayAt(h.seq)} className={replayAt===h.seq?'history-active':''}><span className="history-index">{String(h.seq).padStart(2,'0')}</span><span>{h.type.replaceAll('_',' ').toLowerCase()}</span><span className="history-time">#{h.seq}</span></button>)}</div>{replayAt!==null&&<button className="button primary full-width" onClick={()=>setReplayAt(null)}><Play size={15}/> Return to live game</button>}
            <div className="inspector-footer">{game.mode!=='sandbox'&&<div className="turn-status">ROUND {game.round} · SEAT {game.turnSeat+1}'S TURN</div>}<span>{game.message}</span></div>
          </aside></div></div>}
      {page==='workshop'&&<div className="page-content workshop-page"><SectionTitle eyebrow="SENNET WORKSHOP" title="Create. Share. Play." description="Your games and models belong to you. Publish them from your own storage; Sennet just connects the pieces."/>
        <div className="workshop-grid"><section className="surface-card"><div className="card-top-icon"><FileJson size={22}/></div><h3>Import a community game</h3><p>Load any valid Sennet game pack. Host packs on GitHub Pages, personal websites, or your own object storage.</p><div className="input-row"><input value={packUrl} onChange={e=>setPackUrl(e.target.value)} placeholder="https://your-host/game.json"/><button className="button primary compact" onClick={importRemote}><Link2 size={16}/> Import</button></div><label className="upload-drop"><Upload size={18}/><span>Or select a .json game pack</span><input type="file" accept=".json,application/json" onChange={importLocalPack}/></label></section>
        <section className="surface-card"><div className="card-top-icon amber"><Save size={22}/></div><h3>Export your current table</h3><p>Turn the board, tokens, cards and external sprite references into a portable JSON game. Sennet doesn't host the assets.</p><label className="input-label" htmlFor="workshop-title">GAME NAME</label><input id="workshop-title" value={workshopName} onChange={e=>setWorkshopName(e.target.value)}/><button className="button primary full-width" onClick={exportPack}><ArrowDownToLine size={16}/> Export game pack</button></section>
        <section className="surface-card"><div className="card-top-icon violet"><Box size={22}/></div><h3>Add a pseudo-3D miniature</h3><p>Paste 12, 24, or 36 HTTPS sprite URLs, in clockwise rotation order. The closest frame appears from each seat.</p><label className="input-label">MINIATURE NAME</label><input value={assetName} onChange={e=>setAssetName(e.target.value)}/><label className="input-label">SPRITE IMAGE URLS (ONE PER LINE)</label><textarea rows={3} value={spriteUrls} onChange={e=>setSpriteUrls(e.target.value)} placeholder={'https://my-bucket/mini/frame-00.webp\nhttps://my-bucket/mini/frame-01.webp'}/><div className="input-row"><input type="color" aria-label="Fallback sprite color" value={spriteColor} onChange={e=>setSpriteColor(e.target.value)}/><button className="button primary compact" onClick={addSprite}><Plus size={16}/> Add to Table</button></div></section>
        <section className="surface-card"><div className="card-top-icon mint"><Globe2 size={22}/></div><h3>Upload to your own cloud</h3><p>Provide a time-limited signed PUT URL from your storage provider. Your browser sends the file directly there — not to Sennet.</p><label className="input-label">SIGNED UPLOAD URL</label><input value={signedPut} onChange={e=>setSignedPut(e.target.value)} placeholder="https://your-bucket/asset?signature=…" type="password"/><label className="upload-drop"><Upload size={18}/><span>{uploadFile?`${uploadFile.name} · ${(uploadFile.size/1024).toFixed(0)} KB`:'Choose model, sprites or game pack'}</span><input type="file" accept=".json,.png,.webp,.glb,.gltf,.zip" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/></label><button className="button primary full-width" onClick={publishDirect}><Upload size={16}/> Upload straight to my storage</button><p className="small-print">Raw .glb models require offline sprite conversion before Sennet can display them. Do not paste cloud secret access keys here.</p></section>
        </div><div className="library-heading"><h3>Your local game library</h3><span>{packs.length} community packs</span></div>{packs.length?<div className="library-grid">{packs.map(pack=><button className="library-card" key={pack.id} onClick={()=>loadPack(pack)}><div className="library-icon">▣</div><strong>{pack.name}</strong><span>{pack.author} · {friendly(pack.kind)}</span><small>{pack.objects.length} objects <ArrowRight size={14}/></small></button>)}</div>:<div className="library-empty"><PackageOpen size={28}/><strong>Your workshop is ready</strong><span>Import a game or export your creation to get started.</span></div>}
        <div className="info-note"><ShieldCheck size={19}/><p><strong>Creator-owned storage.</strong> Sennet stores small game metadata and move logs; all large assets can stay on creator-controlled storage. Owners remain responsible for hosting availability, CORS, access permissions and licensing.</p></div>
      </div>}
      {page==='decks'&&<div className="page-content decks-page"><SectionTitle eyebrow="THE DECK LAB" title="Build your next legend." description="Assemble a starter deck, load it on the table, and export it as an independent Sennet game pack."/><div className="deck-layout"><section className="surface-card"><span className="eyebrow">DECK DETAILS</span><label className="input-label">DECK NAME</label><input value={deckName} onChange={e=>setDeckName(e.target.value)}/><div className="deck-stat"><span>Total cards</span><strong>{cardRows.reduce((a,c)=>a+c.amount,0)}</strong></div><div className="deck-stat"><span>Unique cards</span><strong>{cardRows.length}</strong></div><div className="deck-stat"><span>Format</span><strong>Open / Sandbox</strong></div><button className="button primary full-width" onClick={createDeck}><Play size={16}/> Load deck on table</button></section><section className="surface-card deck-editor"><div className="card-list-title"><h3>Card collection</h3><span>Up to 60 cards in starter deck</span></div><div className="deck-rows">{cardRows.map((card,i)=><div className="deck-row" key={i}><div className="card-thumb">✦</div><strong>{card.name}</strong><div className="quantity"><button onClick={()=>setCardRows(a=>a.map((c,n)=>n===i?{...c,amount:Math.max(1,c.amount-1)}:c))}>−</button><span>{card.amount}</span><button onClick={()=>setCardRows(a=>a.map((c,n)=>n===i?{...c,amount:Math.min(60,c.amount+1)}:c))}>+</button></div><button className="icon-button" aria-label={`Remove ${card.name}`} onClick={()=>setCardRows(a=>a.filter((_,n)=>n!==i))}><X size={16}/></button></div>)}</div><div className="input-row"><input placeholder="New card name" value={newCard} onChange={e=>setNewCard(e.target.value)}/><button className="button outline compact" onClick={()=>{if(newCard.trim()){setCardRows(a=>[...a,{name:newCard.trim(),amount:1}]);setNewCard('');}}}><Plus size={16}/> Add card</button></div><p className="small-print">Deck validation for specific TCG rule sets is handled by individual game packs.</p></section></div></div>}
      {page==='settings'&&<div className="page-content settings-page"><SectionTitle eyebrow="PREFERENCES & CONNECTIONS" title="Your table. Your way." description="Configure a multiplayer relay. Offline tables and bots require no server or account."/><div className="settings-grid"><section className="surface-card"><h3><Users size={20}/> Multiplayer room</h3><p>Run the included server locally or deploy it to a WebSocket-capable host. GitHub Pages cannot host the relay.</p><label className="input-label">WEBSOCKET SERVER</label><input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="wss://your-sennet-relay.example"/><label className="input-label">ROOM ID</label><div className="input-row"><input value={room} onChange={e=>setRoom(e.target.value)} placeholder="table-123"/><button className="button outline compact" onClick={()=>setRoom(`table-${shortId()}`)}>Generate</button></div><label className="input-label">DISPLAY NAME</label><input value={playerName} onChange={e=>setPlayerName(e.target.value)} maxLength={32}/><div className="input-row"><button className="button primary" onClick={joinRoom}><Wifi size={16}/> Join / create table</button><button className="button outline" onClick={disconnect}><WifiOff size={16}/> Disconnect</button></div>{room&&<button className="subtle-link" onClick={()=>{const link=new URL(location.href);link.searchParams.set('room',room);navigator.clipboard?.writeText(link.href);alertUser('Room link copied');}}><Copy size={14}/> Copy invite link</button>}</section><section className="surface-card"><h3><Code2 size={20}/> Lua scripting</h3><p>Lua 5.4 executes inside a disposable Web Worker and may propose validated tabletop actions.</p><textarea className="code-editor" rows={9} spellCheck={false} value={script} onChange={e=>setScript(e.target.value)}/><button className="button primary" onClick={executeLua}><Play size={16}/> Run Lua on table</button><div className="lua-result">{luaResult||'Ready to execute script.'}</div><p className="small-print">This is an experimental, local-only scripting playground. Public user scripts need stricter per-game permissions and resource limits before production release.</p></section><section className="surface-card"><h3><MonitorSmartphone size={20}/> Multiplatform</h3><p>Sennet's shared web client is designed for all major desktop and mobile platforms using Tauri 2 wrappers. Platform binaries require separate native build/signing pipelines.</p><div className="platform-tags"><span>Web</span><span>PWA (planned)</span><span>Windows</span><span>macOS</span><span>Linux</span><span>Android</span><span>iOS</span></div></section><section className="surface-card"><h3><ShieldCheck size={20}/> Storage policy</h3><p><strong>Zero large-file storage by design.</strong> The multiplayer server stores gameplay metadata and history, not uploaded games, models or textures. Those live wherever their creator hosts them.</p><div className="stat-row"><strong>Offline first</strong><Check size={18}/></div><div className="stat-row"><strong>Encrypted HTTPS assets</strong><Check size={18}/></div><div className="stat-row"><strong>Client-to-owner direct upload</strong><Check size={18}/></div></section></div></div>}
      <footer className="footer"><span>SENNET © 2026 · BUILT FOR PLAY</span><span>ALPHA 0.1.0 <span className="footer-separator">•</span> OPEN TABLETOP FOUNDATION</span></footer>
      {notice&&<div className="toast" role="status"><span className="toast-symbol">✦</span>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={14}/></button></div>}
    </main>
  </div>;
}
