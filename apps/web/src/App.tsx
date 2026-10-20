import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {ArrowLeft,BookOpen,Check,ChevronRight,Code2,Copy,Dices,Download,FlipHorizontal,Globe2,Layers,Link2,Minus,Package,Play,Plus,RotateCw,Save,Search,Settings2,ShieldCheck,Shuffle,SkipForward,Trash2,Upload,Users,Wifi,WifiOff,X,Zap} from 'lucide-react';
import {applyCommand,createGame,createId,gameFromPack,parseGamePack,replay,type Command,type EventRecord,type GameKind,type GamePack,type GameState,type PlayMode,type TableObject,BOARD_CENTER,tcgMatCells,isTcgRemoveDrop,cardStackMembers,defaultPlaymatAppearance,normalizePlaymatAppearance,type PlaymatAppearance} from '@sennet/core';
import {runLua,SAMPLE_LUA} from '@sennet/lua';
import TableCanvas from './components/TableCanvas';
import TcgDeckBuilder from './components/TcgDeckBuilder';
import type {SavedDeck} from './lib/deckWorkspace';
import {tcgCardBack,cachedTcgCatalog} from './lib/tcgCatalog';
import PlaymatEditor from './components/PlaymatEditor';
import PersonalDrawer from './components/PersonalDrawer';
import {RoomConnection} from './lib/network';
import {choosePseudoBotAction} from './lib/bot';
import {directUpload,downloadText,getPacks,importPackFile,importPackUrl,rememberPack} from './lib/storage';

type Book = 'sennet'|'games'|'settings';
type GamePage = 'all'|'recent'|'library'|'tools';
type SettingsPage = 'general'|'playmat'|'deckbuilder'|'multiplayer'|'scripting';
type SavedSession = {id:string;title:string;updated:number;initial:GameState;game:GameState;history:EventRecord[];seat?:number};
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
const LAST_SESSION_KEY='sennet.last-play-session.v1';
const REWIND_SESSION_KEY='sennet.rewind-play-session.v1';
const MERGE_OPACITY_KEY='sennet.merge-control-opacity.v1';
const MERGE_DELAY_KEY='sennet.merge-hover-delay.v2';
const PREVIOUS_MERGE_DELAY_KEY='sennet.merge-hover-delay.v1';
const LEGACY_PLAYMAT_KEY='sennet.playmat.appearance.v1';
const PLAYMAT_KEY_PREFIX='sennet.playmat.appearance.v2.';
const scopedPlaymatKey=(playerId:string)=>PLAYMAT_KEY_PREFIX+encodeURIComponent(playerId);
function storedPlaymatAppearance(playerId:string):PlaymatAppearance{
  try{
    const own=localStorage.getItem(scopedPlaymatKey(playerId));
    if(own!==null)return normalizePlaymatAppearance(JSON.parse(own));
    // One-time migration: attach the earlier browser-wide appearance to
    // the player identity already established on this installation.
    // Remove the old key so subsequent identities do not inherit it.
    const legacy=localStorage.getItem(LEGACY_PLAYMAT_KEY);
    if(legacy!==null){
      const migrated=normalizePlaymatAppearance(JSON.parse(legacy));
      localStorage.setItem(scopedPlaymatKey(playerId),JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_PLAYMAT_KEY);
      return migrated;
    }
  }catch{/* Storage missing or damaged; use built-in look. */}
  return defaultPlaymatAppearance();
}
const MERGE_OPACITY_DEFAULT=.16;
const MERGE_DELAY_DEFAULT=250;
function storedPreference(key:string,fallback:number,min:number,max:number):number{
  try{
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    const value=Number(raw);
    return Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
  }catch{return fallback;}
}
function storedMergeHoverMs():number{
  try{
    const newer=localStorage.getItem(MERGE_DELAY_KEY);
    if(newer!==null)return storedPreference(MERGE_DELAY_KEY,MERGE_DELAY_DEFAULT,100,2500);
    const older=localStorage.getItem(PREVIOUS_MERGE_DELAY_KEY);
    if(older!==null){
      const previous=Number(older);
      // Version 1 automatically persisted its 500 ms default on first visit.
      // Migrate that original default to 250 ms; retain other custom timings.
      if(Number.isFinite(previous)&&previous>=100&&previous<=2500&&previous!==500)return previous;
    }
  }catch{/* Storage unavailable. */}
  return MERGE_DELAY_DEFAULT;
}
function emptyTable():GameState{return {...createGame('sandbox'),objects:[],players:[],message:'A fresh table. Open a book to begin.'};}
function localActor(){try{let id=localStorage.getItem(ACTOR_KEY);if(!id){id='player_'+createId();localStorage.setItem(ACTOR_KEY,id);}return id;}catch{return 'player-local';}}
function recentGames():SavedSession[]{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.slice(0,8):[];}catch{return [];}}
function lastSession():SavedSession|null{
 try{
  const session=JSON.parse(localStorage.getItem(LAST_SESSION_KEY)||'null') as SavedSession|null;
  return session&&typeof session.id==='string'&&session.game?.version===1&&
    Array.isArray(session.game.objects)&&Array.isArray(session.history)?session:null;
 }catch{return null;}
}
const json=(value:unknown)=>JSON.stringify(value,null,2);
const nameFor=(kind:GameKind)=>KINDS.find(k=>k.id===kind)?.label||kind;
const Tabs=({items,active,change}:{items:{id:string;label:string}[];active:string;change:(value:string)=>void})=><div className="book-tabs" role="tablist">{items.map(item=><button role="tab" aria-selected={active===item.id} className={active===item.id?'current':''} key={item.id} onClick={()=>change(item.id)}>{item.label}</button>)}</div>;

export default function App(){
  const [restored]=useState(lastSession);
  const [game,setGame]=useState<GameState>(()=>restored?.game??emptyTable());
  const [initial,setInitial]=useState<GameState>(()=>restored?.initial??emptyTable());
  const [history,setHistory]=useState<EventRecord[]>(()=>restored?.history??[]);
  const current=useRef(game);current.current=game;
  const sessionId=useRef(restored?.id??createId());
  const [recent,setRecent]=useState<SavedSession[]>(recentGames);
  const [book,setBook]=useState<Book|null>(null);
  const [tcgStudioOpen,setTcgStudioOpen]=useState(false);
  const [gamesPage,setGamesPage]=useState<GamePage>('all');
  const [settingsPage,setSettingsPage]=useState<SettingsPage>('general');
  const [selected,setSelected]=useState<string|null>(null);
  const [seat,setSeat]=useState(()=>restored?.seat??0);
  const [mergeOpacity,setMergeOpacity]=useState(()=>storedPreference(MERGE_OPACITY_KEY,MERGE_OPACITY_DEFAULT,.05,.5));
  const [mergeHoverMs,setMergeHoverMs]=useState(storedMergeHoverMs);
  // Resolve identity before reading appearance. One player's saved playmat
  // can never be loaded as the default for another player identity.
  const actor=useMemo(localActor,[]);
  const [playmat,setPlaymat]=useState<PlaymatAppearance>(()=>storedPlaymatAppearance(actor));
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
  const [actionLogOpen,setActionLogOpen]=useState(false);
  const [wheelMode,setWheelMode]=useState<'mobile'|'docked'|'hold'>(()=>{const mode=localStorage.getItem('sennet.wheel.mode.v1');return mode==='hold'?'hold':mode==='docked'?'mobile':mode==='mobile'?'mobile':'docked';});
  useEffect(()=>{try{localStorage.setItem('sennet.wheel.mode.v1',wheelMode);}catch{/* Storage unavailable. */}},[wheelMode]);
  const connection=useRef<RoomConnection|null>(null);
  const activeObject=game.objects.find(o=>o.id===selected);
  const replayIndex=replayAt===null?-1:history.findIndex(h=>h.seq===replayAt);
  const viewedGame=replayAt===null?game:replay(initial,history.slice(0,replayIndex+1));
  function inform(message:string){setNotice(message);window.setTimeout(()=>setNotice(s=>s===message?'':s),4500);}
  function resetWith(next:GameState,id=createId(),past:EventRecord[]=[],origin:GameState=next){
    if(!connection.current&&(current.current.objects.length>0||history.length>0)){
      const previous:SavedSession={
        id:sessionId.current,title:nameFor(current.current.kind),
        updated:Date.now(),game:current.current,initial,history,seat
      };
      try{localStorage.setItem(REWIND_SESSION_KEY,JSON.stringify(previous));}
      catch{/* Continue without persistence when browser storage is full. */}
    }
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
  useEffect(()=>{try{localStorage.setItem(MERGE_OPACITY_KEY,String(mergeOpacity));}catch{/* Storage unavailable. */}},[mergeOpacity]);
  useEffect(()=>{try{localStorage.setItem(MERGE_DELAY_KEY,String(mergeHoverMs));}catch{/* Storage unavailable. */}},[mergeHoverMs]);
  useEffect(()=>{
    try{localStorage.setItem(scopedPlaymatKey(actor),JSON.stringify(playmat));}
    catch{inform('Not enough browser storage to save this playmat image. Try a smaller image.');}
  },[actor,playmat]);
  useEffect(()=>{
    if(isConnected)return;
    const snapshot:SavedSession={
      id:sessionId.current,title:nameFor(game.kind),updated:Date.now(),
      initial,game,history:history.slice(-500),seat
    };
    try{localStorage.setItem(LAST_SESSION_KEY,JSON.stringify(snapshot));}
    catch{/* Storage quota or private session: current play remains usable. */}
  },[game,history,initial,isConnected,seat]);
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
    const pack:GamePack={schema:'sennet.pack/1',id:'sennet.'+createId().slice(0,8),name:packTitle,author:playerName,kind:game.kind,objects:game.objects,centerMerges:game.centerMerges,license:'Creator supplied'};
    downloadText(pack.id+'.json',json(pack));rememberPack(pack);setPacks(getPacks());inform('Game exported. You can host it on your own storage.');
  }
  function placeDeckBox(){
    // Spawn beside the deck (LEADERS pocket, directly above DECK) so the
    // new physical accessory does not cover the playable deck stack.
    // It stays owned by this mat when the battlefield is re-framed.
    const cell=game.kind==='tcg'
      ?tcgMatCells(seat).find(c=>c.row===0&&c.column===2):null;
    const id=createId();
    takeAction('ADD',{object:{
      id,kind:'deck-box',name:'Deck box',
      x:cell?.x??BOARD_CENTER+90,y:cell?.y??BOARD_CENTER,
      ...(cell?{matSeat:seat}:{}),
      color:'#34544a',rotation:0,faceUp:true
    }});
    if(replayAt===null){setSelected(id);setBook(null);}
  }
  function addSprite(){
    const urls=spriteUrls.split(/[\s,]+/).filter(Boolean);
    if(!urls.length){inform('Enter image URLs for your miniature.');return;}
    takeAction('ADD',{object:{id:createId(),kind:'miniature',name:assetName,x:BOARD_CENTER,y:BOARD_CENTER,frameUrls:urls,color:'#b89d78'}});
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
      id:'deck-'+createId(),kind:'card' as const,name:card.name,x:tcgMatCells(seat).find(c=>c.row===1&&c.column===2)!.x,y:tcgMatCells(seat).find(c=>c.row===1&&c.column===2)!.y,rotation:0,faceUp:false,color:'#a7a0c7',zone:'DECK' as const,matSeat:seat,order:order++
    })));
    resetWith({...next,objects,message:deckName+' · '+objects.length+' cards'});
  }
  async function loadStudioDeck(deck:SavedDeck){
    if(isConnected){inform('To replace a live multiplayer table, disconnect first.');return;}
    if(replayAt!==null){inform('Exit replay first.');return;}
    // Saved/imported decks may contain name-only cards or older catalogue
    // entries with blank artwork. Resolve images before building table pieces.
    const catalog=await cachedTcgCatalog(deck.game);
    const byId=new Map(catalog.map(card=>[card.id,card]));
    const byName=new Map(catalog.filter(card=>!!card.image)
      .map(card=>[card.name.trim().toLowerCase(),card]));
    const imageFor=new Map<string,string>();
    for(const entry of deck.entries){
      const card=entry.card;
      let url=card.image||byId.get(card.id)?.image||
        byName.get(card.name.trim().toLowerCase())?.image||'';
      if(url)imageFor.set(card.id,url);
    }
    const next=createGame('tcg');
    const cells=tcgMatCells(seat);
    const placement=(section:string)=>{
      const position:Record<string,[number,number]>={
        Main:[1,2],Extra:[1,0],Sideboard:[0,0],Leader:[0,2],
        Commander:[0,2],Companion:[2,0],'DON!!':[3,0],
        Resource:[3,0],Rune:[3,0],Legend:[0,2],Champion:[0,2]
      };
      const [row,col]=position[section]??[0,0];
      return cells.find(c=>c.row===row&&c.column===col)!;
    };
    let order=0;
    const objects:TableObject[]=deck.entries.filter(e=>e.section!=='Maybeboard')
      .flatMap(entry=>{
        const where=placement(entry.section);
        return Array.from({length:Math.min(99,entry.quantity)},()=>({
          id:'studio-'+createId(),kind:'card' as const,name:entry.card.name,
          x:where.x,y:where.y,matSeat:seat,rotation:0,
          zone:entry.section==='Main'?'DECK' as const:'TABLE' as const,
          faceUp:entry.section!=='Main',color:'#a7a0c7',
          ...(imageFor.get(entry.card.id)?{faceUrl:imageFor.get(entry.card.id)}:{}),
          ...(tcgCardBack(deck.game)?{backUrl:tcgCardBack(deck.game)}:{}),
          description:entry.card.text.slice(0,250),order:order++
        }));
      });
    resetWith({...next,objects,message:deck.name+' · '+objects.length+' cards loaded'});
    setTcgStudioOpen(false);
    inform(deck.name+' loaded onto the table');
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
  return <div className="sennet-home">
    <div className="table-world">
      <TableCanvas state={viewedGame} seat={seat} playerName={playerName} actorId={actor} selected={selected}
        onSelect={setSelected} wheelMode={wheelMode}
        onOpenTcgSettings={()=>{setBook('settings');setSettingsPage('playmat');}}
        onDrawMat={()=>takeAction('DRAW',{matSeat:seat})}
        onCardAction={(id,action)=>{
          const card=game.objects.find(o=>o.id===id);
          if(!card)return;
          if(action==='flip')takeAction('FLIP',{id});
          else takeAction('ROTATE',{id,degrees:card.rotation%180>=90?-90:90});
        }}
        onGestureAction={(id,action)=>{
          const card=current.current.objects.find(o=>o.id===id);
          if(!card)return;
          if(action==='tap')takeAction('ROTATE',{id,degrees:card.rotation%180>=90?-90:90});
          else if(action==='flip')takeAction('FLIP',{id});
          else if(action==='rotate-cw')takeAction('ROTATE',{id,degrees:90});
          else if(action==='rotate-ccw')takeAction('ROTATE',{id,degrees:-90});
          else if(action==='rotate-180')takeAction('ROTATE',{id,degrees:180});
          else if(action==='counter-add')takeAction('ADJUST_COUNTER',{id,delta:1});
          else if(action==='counter-remove')takeAction('ADJUST_COUNTER',{id,delta:-1});
          else if(action==='duplicate')takeAction('CLONE',{id,newId:createId()});
          else if(action==='remove'){
            if(window.confirm('Remove '+card.name+' from the table?'))takeAction('DELETE',{id});
          }else if(action==='hand'||action==='deck-top'||action==='deck-bottom'||action==='discard'){
            takeAction('SET_ZONE',{id,matSeat:seat,
              zone:action==='hand'?'HAND':action==='discard'?'DISCARD':'DECK',
              bottom:action==='deck-bottom'});
          }else if(action==='draw')takeAction('DRAW',{matSeat:seat});
          else if(action==='shuffle')takeAction('SHUFFLE',{seed:Date.now()%10000000,matSeat:seat});
          else if(action==='roll')takeAction('ROLL',{id,seed:Date.now()%10000000});
        }}
        onRadialAction={(ids,action)=>{
          // One authoritative event applies to the ENTIRE selection.
          // State is validated atomically; invalid or opponent-owned
          // groups never partially mutate.
          takeAction('BATCH_CARD_ACTION',{ids,action,
            ...(action==='shuffle'?{seed:Date.now()%10000000}:{}),
});
        }}
        onMoveSelection={(ids,anchorId,x,y)=>{
          takeAction('BATCH_CARD_ACTION',{action:'move',ids,anchorId,x,y,
            snapMerged:playmat.snapMerged,snapMergedSeat:seat});
        }}
        mergeOpacity={mergeOpacity} mergeHoverMs={mergeHoverMs} playmat={playmat}
        onMergeCenter={(targetSeat,boundary,merged)=>takeAction('SET_CENTER_MERGE',{seat:targetSeat,boundary,merged})}
        onMoveStack={(id,x,y)=>{
          const old=game.objects.find(o=>o.id===id);
          if(old&&Math.hypot(old.x-x,old.y-y)>=2)
            takeAction('MOVE_STACK',{id,x,y,snapMerged:playmat.snapMerged,snapMergedSeat:seat});
        }}
        onMove={(id,x,y)=>{
          const old=game.objects.find(o=>o.id===id);
          if(old&&Math.hypot(old.x-x,old.y-y)>=2)
            takeAction('MOVE',{id,x,y,snapMerged:playmat.snapMerged,snapMergedSeat:seat});
        }} readonly={replayAt!==null}/>
    </div>
    {actionLogOpen&&<aside className="sennet-action-log" aria-label="Table action history">
      <header><strong>Action log</strong><span>{history.length} events</span>
        <button type="button" onClick={()=>setActionLogOpen(false)} aria-label="Close action log">×</button></header>
      <div className="sennet-action-log-entries" role="log" aria-live="off">
        {history.slice().reverse().map(h=>{
          const ids=[h.payload?.id,...(Array.isArray(h.payload?.ids)?h.payload.ids:[])].filter((v):v is string=>typeof v==='string');
          const references=ids.map(id=>game.objects.find(o=>o.id===id)??initial.objects.find(o=>o.id===id)).filter((o):o is NonNullable<typeof o>=>!!o);
          const hidden=references.some(card=>(card.zone==='HAND'||card.zone==='DECK')&&!card.faceUp);
          const player=game.players.find(p=>p.id===h.actor);
          const action=h.type==='BATCH_CARD_ACTION'?String(h.payload.action??'card action').replaceAll('-',' '):h.type.toLowerCase().replaceAll('_',' ');
          const names=hidden?'[Hidden card]':references.map(card=>card.name).join(', ');
          const details=[names,typeof h.payload.degrees==='number'?String(h.payload.degrees)+'°':'',
            typeof h.payload.zone==='string'?'Zone: '+h.payload.zone:'',
            typeof h.payload.x==='number'&&typeof h.payload.y==='number'?'Position: '+Math.round(h.payload.x)+', '+Math.round(h.payload.y):'',
            typeof h.payload.matSeat==='number'?'Seat '+(h.payload.matSeat+1):'',
            ids.length>1?ids.length+' objects':''].filter(Boolean).join(' · ');
          return <div className="sennet-action-log-entry" key={h.id}>
            <span className="sennet-log-seq">#{h.seq}</span>
            <span><strong>{player?.name??(h.actor==='local'?playerName:h.actor.slice(0,12))}</strong> · {action}
              <small>{new Date(h.at).toLocaleTimeString()} · {details||'Table action'}</small>
            </span>
            <span className="sennet-log-share" title={hidden?'Hidden until a player explicitly reveals the card':'Public action'} aria-label={hidden?'Hidden card':'Public action'}>♧</span>
          </div>;
        })}
      </div>
    </aside>}
    <PersonalDrawer activeBook={book} openBook={setBook} seat={seat} name={playerName} onLog={()=>setActionLogOpen(v=>!v)} onRecall={()=>{
        let saved:SavedSession|null=null;
        try{saved=JSON.parse(localStorage.getItem(REWIND_SESSION_KEY)||'null') as SavedSession|null;}
        catch{/* Ignore a corrupted previous session. */}
        saved??=lastSession();
        if(saved?.game&&Array.isArray(saved.game.objects)){
          loadRecent(saved);
          setSeat(saved.seat??seat);
        }else inform('No saved play session yet.');
      }}/>
    {tcgStudioOpen&&<TcgDeckBuilder onClose={()=>setTcgStudioOpen(false)}
      onLoadOnTable={loadStudioDeck}
      snapMerged={playmat.snapMerged}
      onSnapMerged={value=>setPlaymat(p=>({...p,snapMerged:value}))}
      mergeHoverMs={mergeHoverMs} onMergeHoverMs={setMergeHoverMs}/>}
    {book&&<div className="reader-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setBook(null);}}>
      <section className="reader" role="dialog" aria-modal="true" aria-label={book+' book'}>
        <header className="reader-header"><span className="reader-mark">S</span><div><span className="reader-eyebrow">SENNET · VOLUME {book==='sennet'?'01':book==='games'?'02':'03'}</span><h1>{book==='sennet'?'Sennet':book==='games'?'Games':'Settings'}</h1></div>
          <button className="reader-close" onClick={()=>setBook(null)} aria-label="Close book"><X size={22}/></button>
        </header>
        <div className="reader-content">
          {book==='sennet'&&<div className="guide">
            <p className="intro">Your tabletop. Your rules. Your player name and seat tab contains three books.</p>
            <div className="guide-grid">
              <article><span>01</span><h3>Start with Games</h3><p>Open the Games book to choose a game type, resume a recent table, or load a community game from your library.</p></article>
              <article><span>02</span><h3>Move &amp; zoom</h3><p>Drag pieces across the felt. Mouse-wheel scroll or two-finger touchpad scrolling zooms around the pointer. Pinch on a touchscreen to zoom. Click and drag empty table space to move the camera; grab a card to move only that card. Double-click the table (or press 0) to reset the view.</p></article>
              <article><span>03</span><h3>Your seat &amp; books</h3><p>The compact gold Player ## tab tucks against the bottom of the screen. Clicking it expands the drawer upward and outward: the gold tag stays on top, with the books below. The green section and any custom display name appear only when expanded; the extra word Player is omitted from that green name label. Click the tag again to collapse it. Hovering does nothing. Choose your seat in Settings.</p></article>
              <article><span>04</span><h3>Individual TCG mats</h3><p>Every seat has its own four-row mat with seven original horizontal card slots in each PLAY and HAND row plus six in-between positions, for 13 selectable positions per row. Tap the Eye centered on the top line of your Play 03 zone to focus it. Hold it for 0.25 seconds, then select any opponent to bring both mats together in a full-height opposing view: theirs above, yours below, separated by the battlefield divider. Other players have a small retractable name/seat tag. Your own gold Player ## tab rises when clicked, revealing Sennet, Games, and Settings underneath it. The green book section stays concealed when collapsed. There is no caret, hover activation, auto-close timer, or separate bookshelf. In Opponent Mode, every other visible player's mat has a Sword and Shield pair whose circle centers sit directly on the Play 03 zone's top boundary from that player's perspective. Tap that player's Sword to mark them as an Enemy across the divider, or their Shield to place them beside you facing your direction. The Eye and Castle sit side by side, evenly centered on the top line of your Play 03 zone, with each circle straddling that line. The Eye keeps its original tap-and-hold controls and shows a one-on-one view with exactly one selected opponent always across from you; Castle defaults to All View: every marked Ally is placed in an optimally scaled grid to the right of your full-size mat, which stays anchored on the left. Hold Castle for 0.25 seconds to toggle BOTH groups to Single View: one Ally beside you and one Enemy across the divider. Both have left/right arrows that cycle independently through their own teammates or opponents. Hold Castle again to return BOTH groups to All View. In Castle All View, click an Ally mat to focus just that Ally while all Enemies remain in their unchanged All grid; click an Enemy mat to focus just that Enemy while all Allies remain as they were. You may focus both sides independently, leaving exactly three mats: yours, one Ally, and one Enemy. Each focused mat has its Sword/Shield and same-role left/right arrows. Focus is neither Single nor All; tap Castle to leave or hold Castle to resume toggling from the previous broad mode. Marked Enemies remain opposite you above the divider in both modes, and unclassified players stay hidden. Tap Castle to enter or leave the battlefield. Only one of Sword or Shield can be selected; tap the active icon again to clear it. Each opponent keeps their own setting. Eye always places the one selected opponent across the divider, even when marked Ally; only Castle puts all marked allies beside you and all marked enemies across from you. Use the circular left/right arrows centered on the selected opponent mat’s left and right edges to cycle counter-clockwise or clockwise through the numbered seats. While facing an opponent the camera is fixed—dragging or zooming the view is disabled, but cards can still be moved. Tap the eye again for the full table, or hold it to return to your mat alone. Hover over + or − to join or separate center sections. All changes can be replayed. The mat retains the original LOCATIONS, RESERVE, WAIT, RESOURCE, LEADERS, DECK, DISCARD and REMOVE pockets, three PLAY rows and HAND. Use the DECK arrow or D to draw; select a card and press T to tap/untap or F to flip. Drop a card or token into your REMOVE pocket to remove it.</p></article>
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
              <div className="tool-section"><h3>Place an object</h3><div className="tool-buttons"><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'card',name:'New card',x:BOARD_CENTER,y:BOARD_CENTER,faceUp:true,color:'#b49acb'}})}><Plus size={17}/> Card</button><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'token',name:'Token',x:BOARD_CENTER,y:BOARD_CENTER,color:'#b1bb8c'}})}><Plus size={17}/> Token</button><button onClick={()=>takeAction('ADD',{object:{id:createId(),kind:'die',name:'D6',x:BOARD_CENTER,y:BOARD_CENTER,color:'#dbd8c4',sides:6,value:1}})}><Dices size={17}/> Die</button><button onClick={placeDeckBox} title="Place a small top-down raised deck box on your table"><Package size={17}/> Deck box</button></div></div>
              <div className="tool-section"><h3>Game commands</h3><div className="tool-buttons"><button onClick={()=>takeAction('DRAW')}><Layers size={17}/> Draw</button><button onClick={()=>takeAction('SHUFFLE',{seed:Date.now()%10000000})}><Shuffle size={17}/> Shuffle</button><button onClick={botMove}><Zap size={17}/> Bot move</button><button onClick={()=>takeAction('NEXT_TURN')}><SkipForward size={17}/> End turn</button><button onClick={undo}><ArrowLeft size={17}/> Undo</button></div></div>
              <div className="tool-section"><h3>{activeObject?'Selected: '+activeObject.name:'Selected object'}</h3>{activeObject?<div className="tool-buttons"><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:-30})}><RotateCw size={16}/> −30°</button><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:30})}><RotateCw size={16}/> +30°</button><button onClick={()=>takeAction('FLIP',{id:selected})}><FlipHorizontal size={16}/> Flip</button><button onClick={()=>takeAction('CLONE',{id:selected,newId:createId()})}><Copy size={16}/> Clone</button>{activeObject.kind==='die'&&<button onClick={()=>takeAction('ROLL',{id:selected,seed:Date.now()})}><Dices size={16}/> Roll</button>}<button onClick={()=>{takeAction('DELETE',{id:selected});setSelected(null);}}><Trash2 size={16}/> Remove</button></div>:<p>Click a piece on the table to select it, then reopen this book.</p>}</div>
              {game.kind==='tcg'&&<details className="reader-details"><summary>TCG playmat controls</summary><div>
                <p><strong>Hold one card for 0.25 seconds without moving</strong> to start selection mode (a whole stack can be selected together). Then simply <strong>tap/click other cards or stacks once</strong> to add them; tap a selected one to remove it from the selection. Drag any selected card to move the entire group in one undoable action. There's a small 13-pixel resistance before cards start moving, to prevent accidental drags.</p>
                <p><strong>Hold a selected card for 0.25 seconds</strong> to open the smaller two-ring action wheel over that card, then slide to the desired action and release. After a first hold, sliding also opens the wheel rather than dragging the selection accidentally. The inner rings are Position, Scale, Location. Their three outer actions, in order, are <strong>−45°, Flip, +45°</strong>; <strong>−50%, Original, +50%</strong>; and <strong>Shuffle, Send, Lock/Unlock</strong>. Send lets you choose Hand, Deck Top, Deck Bottom, Discard, or Play. Every wheel action applies to all selected cards together. Clear Selection ends selection mode.</p>
                <p>Regular gestures are preserved: <strong>tap/click</strong> to select, <strong>drag</strong> to move one card, <strong>hold then drag</strong> to move a whole stack, and <strong>double-tap/double-click</strong> to tap/untap. A trackpad two-finger click or mouse right-click also opens the wheel directly; the existing keyboard and other card controls remain available.</p>
                <p>The card menu offers Flip, Inspect, rotate ±90°/180°, counters +/−, duplicate, remove, and—on TCG cards—send to hand, deck top/bottom, or discard. On the deck pile, Draw and Shuffle are available too. Removing a card requires confirmation. Pinch on a touchscreen or scroll with two fingers on a touchpad to zoom the TABLE; drag empty felt to pan. In Eye and Castle matches the camera remains locked, but card gestures still work. The ↓ button on DECK draws a card with one touch. All changes are undoable and replayable.</p>
                <div className="tool-buttons"><button onClick={()=>takeAction('DRAW',{matSeat:seat})}>Draw from my mat</button>{activeObject?.kind==='card'&&<><button onClick={()=>takeAction('ROTATE',{id:selected,degrees:activeObject.rotation%180>=90?-90:90})}>Tap / untap</button><button onClick={()=>takeAction('FLIP',{id:selected})}>Flip selected card</button></>}</div>
                {(['Basic','Positive','Negative'] as const).map((kind,k)=><div key={kind}><h4>{kind} tokens</h4><div className="tool-buttons">{(k===0?['#FF3B30','#FF9500','#FFCC00','#4CD964','#007AFF','#5856D6','#FF2D55','#8E8E93']:k===1?['#A57C00','#FF006E','#5856D6','#007AFF','#FF3B30','#4CD964']:['#FF9500','#00FF87','#5856D6','#00F5FF','#FF006E','#8E8E93']).map((color,i)=>{const symbol=k===0?'■':k===1?['★','ϟ','↑','◆','♥','●'][i]:['△','⬡','Ⅱ','○','◇','⌛'][i];return <button key={color} aria-label={kind+' token '+(i+1)} style={{color:k===0?'#111':color,background:k===0?color:k===1?'#fff':'#0a0a0a',borderColor:color}} onClick={()=>{const cell=tcgMatCells(seat).find(c=>c.row===2&&c.column===1)!;takeAction('ADD',{object:{id:createId(),kind:'token',name:kind+' '+symbol,color,x:cell.x,y:cell.y,matSeat:seat}});}}>{symbol}</button>;})}</div></div>)}
              </div></details>}
              <details className="reader-details"><summary>Build a starter TCG deck</summary><div><label>Deck name<input value={deckName} onChange={e=>setDeckName(e.target.value)}/></label>{cards.map((card,i)=><div key={i} className="card-editor-row"><span>{card.name}</span><button aria-label={'Remove '+card.name} onClick={()=>setCards(a=>a.filter((_,j)=>j!==i))}><X size={13}/></button><button onClick={()=>setCards(a=>a.map((c,j)=>i===j?{...c,amount:Math.max(1,c.amount-1)}:c))}><Minus size={13}/></button><strong>{card.amount}</strong><button onClick={()=>setCards(a=>a.map((c,j)=>i===j?{...c,amount:Math.min(60,c.amount+1)}:c))}><Plus size={13}/></button></div>)}<div className="field-row"><input value={cardName} onChange={e=>setCardName(e.target.value)} placeholder="Card name"/><button onClick={()=>{if(cardName.trim()){setCards(a=>[...a,{name:cardName.trim(),amount:1}]);setCardName('');}}}>Add</button></div><button className="reader-secondary" onClick={createDeck}>Load deck onto table</button></div></details>
              <details className="reader-details"><summary>Move history and replay</summary><div><p>{history.length} actions recorded in compact command format.</p><div className="history-entries">{history.slice(-10).reverse().map(h=><button key={h.id} onClick={()=>{setReplayAt(h.seq);setBook(null);}}>{h.seq}. {h.type.toLowerCase().replaceAll('_',' ')}</button>)}</div>{replayAt!==null&&<button className="reader-secondary" onClick={()=>setReplayAt(null)}>Exit replay</button>}<button className="reader-secondary" onClick={()=>downloadText('sennet-replay.json',json({schema:'sennet.replay/1',initial,history}))}><Download size={15}/> Export moves</button></div></details>
              <button className="reader-primary" onClick={()=>setBook(null)}>Return to table <ChevronRight size={16}/></button>
            </>}
          </>}
          {book==='settings'&&<>
            <Tabs items={[{id:'general',label:'General'},{id:'playmat',label:'Playmat'},{id:'deckbuilder',label:'Deckbuilder'},{id:'multiplayer',label:'Multiplayer'},{id:'scripting',label:'Lua Scripting'}]} active={settingsPage} change={v=>setSettingsPage(v as SettingsPage)}/>
            {settingsPage==='general'&&<><div className="reader-heading"><div><h2>Your perspective</h2><p>Your own seat is always positioned at the bottom. The table rotates around it.</p></div></div>
              <div className="reader-block"><h3>Player</h3><label>Display name<input value={playerName} maxLength={32} onChange={e=>setPlayerName(e.target.value)}/></label><label>My seat<select value={seat} onChange={e=>setSeat(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>Player {String(i+1).padStart(2,'0')}</option>)}</select></label></div>
              <div className="reader-block"><h3>View controls</h3><p>Scroll the mouse wheel or two-finger touchpad to zoom. Pinch with two fingers on a touchscreen. After zooming in, click and drag empty tabletop space (left mouse button) or drag with one finger to pan. The camera cannot move beyond the area visible at startup. At maximum zoom-out, camera panning is locked. Dragging a card moves the card instead. Middle-mouse drag and Shift + scroll also pan. Press + / − to zoom and 0 to reset. Double-clicking does not change the zoom. The Eye on the top line of your Play 03 zone focuses it; hold for 0.25 seconds to choose an opponent. In Opponent Mode, each other visible player's mat has two circular controls whose centers sit directly on the top line of its Play 03 zone, from that player's perspective: Sword (Enemy, across the divider) and Shield (Ally, alongside you, facing the same way). Your own Play 03 zone has an evenly centered Eye/Castle pair directly on its top boundary. The Eye works exactly as before. Tap Castle to open or close the divided battlefield; unclassified seats disappear. Hold Castle for 0.25 seconds to switch BOTH sides together between Single View (one Ally and one Enemy, each with independent left/right cycling arrows) and All View (all Allies and all Enemies in their respective optimized grids). Click an Ally or Enemy mat to focus that player on their side without changing the opposite side's All grid or existing focus. Focus both sides to display only your full-size mat, one Ally, and one Enemy, with each focused player's relation buttons and same-side cycling arrows. Focus is neither All nor Single, and the next Castle hold continues the previous mode toggle. Your mat remains full-size and fixed to the left in both views, with existing spacing preserved; Enemies stay above the divider. Click Sword or Shield on the specific player's mat to change that player's relationship. They are mutually exclusive, toggle off on a second click, and are remembered separately per opponent on this browser. Eye is strictly one-on-one with the selected opponent always across the divide, regardless of Ally or Enemy classification. Castle always shows marked Enemies across from you and marked Allies beside you; All View shows both groups in grids, while Single View shows one player from each group with independent left/right arrows. Without a Sword or Shield selection, a chosen Eye opponent appears across from you by default.  The left and right circular arrows centered on the opponent's exact side borders between rows 2 and 3 cycle through opponents by their full-table seat positions: left counter-clockwise, right clockwise, skipping your seat. The opponent-view camera is locked: mouse/touchpad wheel, drag, pinch and zoom/reset shortcuts cannot pan or zoom. Cards and match controls remain interactive. The player areas fill the screen, and the Eye and Castle remain merge-button-sized along the top line of Play 03. All PLAY and HAND rows have six additional half-slot card anchors between their original seven horizontal positions. Player names and seat numbers stay tucked behind the top and bottom screen edges: hover over a small, semi-transparent caret tab for 0.25 seconds to reveal its compact name/seat label. Tag transparency uses the merge-button setting. They stay open while hovered and retract 1 second after the pointer leaves, unless clicked to pin. Tap the eye again for the full table or hold it to return to your mat alone. Vector mats stay sharp; raster card art is limited by its source image resolution.</p></div>
              <div className="reader-block">
                <h3>Card stacks</h3>
                <p>A stationary <strong>0.25-second hold</strong> starts selection mode. Tap more cards or stacks once to add them; tap selected cards to remove them. Drag any selected card to move the entire selection together. A small <strong>13 px</strong> breakaway threshold resists accidental motion.</p>
                <p>Hold a selected card for another 0.25 seconds to open the compact radial wheel. Slide outward and release to apply one of its nine actions to every selected card. Moving before the hold completes drags the selection instead. After a first stationary hold, moving brings up the wheel. These timings are deliberately fixed for consistent touch and trackpad behavior.</p>
              </div>
              <div className="reader-block"><h3>Radial wheel</h3><p>Choose exactly one way to access card actions.</p>
                <div className="sennet-wheel-mode-options" role="radiogroup" aria-label="Radial wheel activation">
                  <label><input type="radio" name="radial-mode" checked={wheelMode==='mobile'} onChange={()=>setWheelMode('mobile')}/><strong>Mobile</strong><span className="sennet-info-tip" tabIndex={0} title="Lets you move the full radial anywhere on the playmat and remembers its position." aria-label="Docked: Keeps the action wheel visible in the bottom-right corner for selected cards.">ⓘ</span></label>
                  <label><input type="radio" name="radial-mode" checked={wheelMode==='docked'} onChange={()=>setWheelMode('docked')}/><strong>Docked</strong><span className="sennet-info-tip" tabIndex={0} title="Displays all radial actions in a bottom-centered half-wheel beneath the playmat edge." aria-label="Docked: Displays every action in a bottom-centered half-wheel beneath the playmat edge.">ⓘ</span></label>
                  <label><input type="radio" name="radial-mode" checked={wheelMode==='hold'} onChange={()=>setWheelMode('hold')}/><strong>Hold</strong><span className="sennet-info-tip" tabIndex={0} title="Opens the action wheel when you hold an already-selected card." aria-label="Hold: Opens the action wheel when you hold an already-selected card.">ⓘ</span></label>
                </div>
              </div>
              <div className="reader-block"><h3>Play mode</h3><div className="tool-buttons">{(['sandbox','turn-based','asynchronous'] as PlayMode[]).map(m=><button className={game.mode===m?'highlight':''} key={m} onClick={()=>takeAction('SET_MODE',{mode:m})}>{m==='sandbox'?'Live Sandbox':m==='turn-based'?'Turn Based':'Asynchronous'}</button>)}</div></div>
              <div className="reader-block"><h3>Current table</h3><p>{nameFor(game.kind)} · {game.objects.length} objects · {history.length} moves</p><button className="reader-secondary" onClick={returnToEmpty}>Clear view and open an empty table</button></div>
            </>}
            {settingsPage==='playmat'&&
              <><PlaymatEditor appearance={playmat} setAppearance={setPlaymat}
                merges={viewedGame.centerMerges??[]} seat={seat} inform={inform}/>
              <div className="reader-block">
                <h3>TCG center-section controls</h3>
                <p>On your playmat, hover over a small circular + button between the four middle sections. After the hover delay, click to combine neighboring sections into a larger, freely usable area. Snapping inside merged sections is off by default and can be enabled under Playmat → Card placement. Hover and click − to separate the sections again.</p>
                <label htmlFor="merge-control-opacity">Button transparency — <strong>{Math.round((1-mergeOpacity)*100)}% transparent</strong>
                  <input id="merge-control-opacity" aria-label="Center merge button transparency" type="range"
                    min={.05} max={.5} step={.01} value={mergeOpacity}
                    onChange={e=>setMergeOpacity(Number(e.target.value))}/>
                </label>
                <label htmlFor="merge-hover-delay">Hover to activate — <strong>{(mergeHoverMs/1000).toFixed(2)} seconds</strong>
                  <input id="merge-hover-delay" aria-label="Center merge hover duration" type="range"
                    min={100} max={2500} step={50} value={mergeHoverMs}
                    onChange={e=>setMergeHoverMs(Number(e.target.value))}/>
                </label>
                <div className="tool-buttons"><button onClick={()=>{setMergeOpacity(MERGE_OPACITY_DEFAULT);setMergeHoverMs(MERGE_DELAY_DEFAULT);}}>Restore default appearance</button></div>
                <p>Both preferences are saved in this browser. Merges themselves belong to the table and appear in saved games and replays.</p>
              </div>
              </>
            }
            {settingsPage==='deckbuilder'&&<div className="reader-block"><h2>Deckbuilder</h2><p>Build, import, and load decks directly onto the table.</p><button className="reader-primary" onClick={()=>{setBook(null);setTcgStudioOpen(true);}}>Open Deckbuilder</button></div>}
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
