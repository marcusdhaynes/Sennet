import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,BookOpen,Check,ChevronRight,Code2,Copy,Dices,Download,FlipHorizontal,Globe2,Layers,Link2,Minus,Package,Play,Plus,RotateCw,Save,Search,Settings2,ShieldCheck,Shuffle,SkipForward,Trash2,Upload,Users,Wifi,WifiOff,X,Zap} from 'lucide-react';
import {applyCommand,createGame,createId,gameFromPack,parseGamePack,replay,expireThrownDice,thrownDieDeadlines,THROWN_DIE_LIFETIME_MS,type Command,type EventRecord,type GameKind,type GamePack,type GameState,type PlayMode,type TableObject,BOARD_CENTER,tcgMatCells,tcgMatLocal,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,isTcgRemoveDrop,cardStackMembers,defaultPlaymatAppearance,normalizePlaymatAppearance,type PlaymatAppearance,type SharedAppearance} from '@sennet/core';
import {runLua,SAMPLE_LUA} from '@sennet/lua';
import TableCanvas from './components/TableCanvas';
import {formatActionDisplay} from './lib/actionDisplay';
import {mergeReceipt,parseReplayFile,receiptForCommand,receiptTimestamp,RECEIPT_SCHEMA,
  type ReceiptRow} from './lib/actionReceipt';
import {DEFAULT_COIN_APPEARANCE,type CoinAppearance,type CoinFinish} from './components/CoinArt';
import {DICE_THEMES,DICE_SIDES,DEFAULT_DICE_APPEARANCE,
  normalizeDiceAppearance,type DiceAppearance,type DiceThemeId,diceLabel}
  from './lib/diceThemes';
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
type SavedSession = {id:string;title:string;updated:number;initial:GameState;game:GameState;history:EventRecord[];seat?:number;
  redoStack?:EventRecord[];receipt?:ReceiptRow[]};
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
const TOKEN_KEY='sennet.player-token.v1';
const ONLINE_ROOMS_KEY='sennet.online-rooms.v1';
type OnlineRoom={room:string;endpoint:string;updated:number;seat:number|null};
function onlineRooms():OnlineRoom[]{
  try{
    const list=JSON.parse(localStorage.getItem(ONLINE_ROOMS_KEY)||'[]');
    return Array.isArray(list)?list.filter((item):item is OnlineRoom=>
      typeof item?.room==='string'&&typeof item?.endpoint==='string').slice(0,10):[];
  }catch{return [];}
}
function playerToken():string{
  let saved='';
  try{saved=localStorage.getItem(TOKEN_KEY)||'';}catch{}
  if(/^[a-f0-9]{64}$/i.test(saved))return saved;
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const fresh=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  try{localStorage.setItem(TOKEN_KEY,fresh);}catch{}
  return fresh;
}
function normalizeRelay(raw:string):string{
  const value=raw.trim();
  const url=new URL(value);
  if(url.protocol==='https:')url.protocol='wss:';
  if(url.protocol==='http:')url.protocol='ws:';
  if(url.protocol!=='ws:'&&url.protocol!=='wss:')throw Error('Enter the HTTPS or WSS address of your Sennet relay.');
  if(location.protocol==='https:'&&url.protocol!=='wss:')throw Error('Online Sennet requires a secure HTTPS or WSS address.');
  return url.origin;
}
function inviteUrl(room:string,endpoint:string):string{
  const url=new URL(window.location.href);
  url.searchParams.set('room',room);
  url.searchParams.set('relay',endpoint);
  return url.href;
}
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
/** Every saved-session entrypoint must drop expired physical dice and
 * flipcoins BEFORE they can reappear on the renderer. */
function pruneSession(s:SavedSession):SavedSession{
  const now=Date.now();
  return {...s,game:expireThrownDice(s.game,now,s.history),
    initial:expireThrownDice(s.initial,now,s.history)};
}
function recentGames():SavedSession[]{
  try{
    const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
    return Array.isArray(value)?value.filter((s):s is SavedSession=>
      !!s&&s.game?.version===1&&Array.isArray(s.game.objects)&&Array.isArray(s.history))
      .slice(0,8).map(pruneSession):[];
  }catch{return [];}
}
function lastSession():SavedSession|null{
 try{
  const session=JSON.parse(localStorage.getItem(LAST_SESSION_KEY)||'null') as SavedSession|null;
  return session&&typeof session.id==='string'&&session.game?.version===1&&
    Array.isArray(session.game.objects)&&Array.isArray(session.history)?pruneSession(session):null;
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
  const [redoStack,setRedoStack]=useState<EventRecord[]>(()=>restored?.redoStack??[]);
  const [receipt,setReceipt]=useState<ReceiptRow[]>(()=>mergeReceipt(
    restored?.receipt,restored?.initial??emptyTable(),restored?.history??[]));
  const current=useRef(game);current.current=game;
  const sessionId=useRef(restored?.id??createId());
  const [recent,setRecent]=useState<SavedSession[]>(recentGames);
  const [book,setBook]=useState<Book|null>(null);
  const [bookDesign,setBookDesign]=useState<'tiny'|'dragon'|'journal'|'arcane'|'strapped'>(()=>(localStorage.getItem('sennet.book.design') as 'tiny'|'dragon'|'journal'|'arcane'|'strapped')||'dragon');
  // New book footprint starts at the bottom of the RIGHT tray even when an
  // earlier version saved the old miniature's position or left dock.
  const [bookDock,setBookDock]=useState<'left'|'right'|'free'>(()=>(localStorage.getItem('sennet.book.dock.v2') as 'left'|'right'|'free')||'right');
  const [bookOffset,setBookOffset]=useState<{x:number;y:number}>(()=>{try{return JSON.parse(localStorage.getItem('sennet.book.offset.v2')||'{"x":0,"y":0}');}catch{return {x:0,y:0};}});
  useEffect(()=>{localStorage.setItem('sennet.book.design',bookDesign)},[bookDesign]);
  useEffect(()=>{localStorage.setItem('sennet.book.dock.v2',bookDock)},[bookDock]);
  useEffect(()=>{localStorage.setItem('sennet.book.offset.v2',JSON.stringify(bookOffset))},[bookOffset]);
  // Token appearance and the Custom generator are independent user preferences.
  // Physical coin copies live in the normal replayable game state instead.


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
  const [labelScale,setLabelScale]=useState<number>(()=>storedPreference('sennet.mat.label-scale.v1',1.25,.75,2));
  const [coinAppearance,setCoinAppearance]=useState<CoinAppearance>(()=>{try{
    const saved=JSON.parse(localStorage.getItem('sennet.coin.appearance.v1')||'null');
    return saved&&['polished','brushed','matte','enamel'].includes(saved.finish)&&
      Number.isFinite(saved.shine)&&Number.isFinite(saved.bevel)&&Number.isFinite(saved.size)
      ?{finish:saved.finish,shine:Math.max(0,Math.min(100,saved.shine)),
        bevel:Math.max(0,Math.min(100,saved.bevel)),size:Math.max(.55,Math.min(1.3,saved.size))}
      :DEFAULT_COIN_APPEARANCE;
  }catch{return DEFAULT_COIN_APPEARANCE;}});
  const [diceHoldMs,setDiceHoldMs]=useState(()=>{
    try{const n=Number(localStorage.getItem('sennet.dice.hold.ms'));
      return n>=100&&n<=1500?n:250;}catch{return 250;}
  });
  const [autoDeselect,setAutoDeselect]=useState(()=>localStorage.getItem('sennet.selection.auto')!=='false');
  const [deselectMs,setDeselectMs]=useState(()=>{
    const n=Number(localStorage.getItem('sennet.selection.idle.ms'));
    return Number.isFinite(n)&&n>=500&&n<=30000?n:3000;
  });
  const [cardViewHoldMs,setCardViewHoldMs]=useState(()=>{
    const n=Number(localStorage.getItem('sennet.card.inspect.hold.ms'));
    return Number.isFinite(n)&&n>=100&&n<=1500?n:250;
  });
  // The held-hand presentation and the stationary-card selection gesture
  // are independent. Earlier versions accidentally wired one switch to both.
  const [handHoldView,setHandHoldView]=useState(()=>localStorage.getItem('sennet.hand.hold.view')==='true');
  const [holdSelectStacks,setHoldSelectStacks]=useState(()=>localStorage.getItem('sennet.cards.hold.select')==='true');
  const [handPlayMode,setHandPlayMode]=useState(()=>localStorage.getItem('sennet.hand.play00')==='true');
  useEffect(()=>{try{
    localStorage.setItem('sennet.selection.auto',String(autoDeselect));
    localStorage.setItem('sennet.selection.idle.ms',String(deselectMs));
    localStorage.setItem('sennet.card.inspect.hold.ms',String(cardViewHoldMs));
    localStorage.setItem('sennet.hand.hold.view',String(handHoldView));
    localStorage.setItem('sennet.cards.hold.select',String(holdSelectStacks));
    localStorage.setItem('sennet.hand.play00',String(handPlayMode));
  }catch{}},[autoDeselect,deselectMs,cardViewHoldMs,handHoldView,holdSelectStacks,handPlayMode]);
  // Thrown pieces are removed permanently at exactly 10 seconds.
  // The built-in dice/flipcoin generators in the tray are not disposable.
  const diceFadeMs=THROWN_DIE_LIFETIME_MS;
  const [diceAppearance,setDiceAppearance]=useState<DiceAppearance>(()=>{
    try{return normalizeDiceAppearance(JSON.parse(localStorage.getItem('sennet.dice.appearance.v1')||'null'));}
    catch{return {...DEFAULT_DICE_APPEARANCE};}
  });
  const [customCoinText,setCustomCoinText]=useState<string>(()=>{
    try{
      const text=localStorage.getItem('sennet.coin.custom.text.v1');
      return text!==null&&/^[0-9,+-]{0,20}$/.test(text)?text:'1';
    }catch{return '1';}
  });
  const [customCoinValue,setCustomCoinValue]=useState<number>(()=>{
    try{const saved=Number(localStorage.getItem('sennet.coin.custom.v1'));
      return Number.isInteger(saved)&&saved>=1&&saved<=9999?saved:1;
    }catch{return 1;}
  });
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
  const [endpoint,setEndpoint]=useState(()=>new URLSearchParams(window.location.search).get('relay')||
    localStorage.getItem('sennet.ws')||import.meta.env.VITE_SENNET_WS_URL||'wss://sennet-multiplayer.onrender.com');
  const [room,setRoom]=useState(()=>new URLSearchParams(window.location.search).get('room')||'');
  const [playerName,setPlayerName]=useState(()=>localStorage.getItem('sennet.name')||'Player');
  const [onlineStatus,setOnlineStatus]=useState(()=>endpoint?'Ready to connect':'Hosting not configured · local table only');
  const [joinInput,setJoinInput]=useState(()=>new URLSearchParams(window.location.search).get('room')||'');
  const [showHosting,setShowHosting]=useState(()=>!endpoint);
  const [hostingBusy,setHostingBusy]=useState(false);
  const [hostingHealth,setHostingHealth]=useState<'untested'|'ready'|'error'>('untested');
  const [createAfterSetup,setCreateAfterSetup]=useState(false);
  const [isConnected,setConnected]=useState(false);
  const [onlineRoomsList,setOnlineRoomsList]=useState<OnlineRoom[]>(onlineRooms);
  const [replayAt,setReplayAt]=useState<number|null>(null);
  const [actionLogOpen,setActionLogOpen]=useState(false);
  const receiptUpload=useRef<HTMLInputElement|null>(null);
  const writeReceipt=(type:string,location:string,description:string)=>{
    setReceipt(rows=>[...rows,{id:createId(),at:Date.now(),type,location,description}]);
  };
  const connection=useRef<RoomConnection|null>(null);
  const snapshotRoom=useRef('');
  const appearanceRef=useRef<()=>SharedAppearance>(()=>({}));
  appearanceRef.current=()=>({playmat,dice:diceAppearance,coin:coinAppearance,
    coinText:customCoinText,coinValue:customCoinValue,labelScale,bookDesign,bookDock,bookOffset});
  const activeObject=game.objects.find(o=>o.id===selected);
  const replayIndex=replayAt===null?-1:history.findIndex(h=>h.seq===replayAt);
  const viewedGame=replayAt===null?game:expireThrownDice(
    replay(initial,history.slice(0,replayIndex+1)),Date.now(),
    history.slice(0,replayIndex+1));
  function inform(message:string){setNotice(message);window.setTimeout(()=>setNotice(s=>s===message?'':s),4500);}
  function resetWith(next:GameState,id=createId(),past:EventRecord[]=[],origin:GameState=next,
    audit:ReceiptRow[]=[],redo:EventRecord[]=[]){
    if(!connection.current&&(current.current.objects.length>0||history.length>0)){
      const previous:SavedSession=pruneSession({
        id:sessionId.current,title:nameFor(current.current.kind),
        updated:Date.now(),game:current.current,initial,history,seat,redoStack,receipt
      });
      try{localStorage.setItem(REWIND_SESSION_KEY,JSON.stringify(previous));}
      catch{/* Continue without persistence when browser storage is full. */}
    }
    if(connection.current)disconnect();
    const cleanGame=expireThrownDice(next,Date.now(),past);
    const cleanOrigin=expireThrownDice(origin,Date.now(),past);
    sessionId.current=id;current.current=cleanGame;setInitial(cleanOrigin);
    setGame(cleanGame);setHistory(past);setRedoStack(redo);
    setReceipt(mergeReceipt(audit,cleanOrigin,past));
    setSelected(null);setReplayAt(null);setBook(null);setActionLogOpen(false);
  }
  function startGame(kind:GameKind){resetWith(createGame(kind,'local',false));}
  function loadPack(pack:GamePack){resetWith(gameFromPack(pack));}
  function loadRecent(s:SavedSession){resetWith(s.game,s.id,s.history,s.initial,s.receipt,s.redoStack);}
  function returnToEmpty(){resetWith(emptyTable());}
  function takeAction(type:Command['type'],payload:Record<string,unknown>={}){
    if(replayAt!==null){inform('Exit replay mode before making a move.');return;}
    const command:Command={id:createId(),actor:isConnected?actor:'local',type,
      payload:type==='THROW_TRAY'||type==='REROLL_DIE'
        ?{...payload,expiresAt:Date.now()+THROWN_DIE_LIFETIME_MS}:payload};
    if(isConnected){
      // Apply movement optimistically on this client's playmat, instead of
      // waiting for the relay round trip to snap a just-released card.
      // The next authoritative onState always reconciles the preview.
      const immediate=type==='MOVE'||type==='MOVE_STACK'||
        (type==='BATCH_CARD_ACTION'&&payload.action==='move');
      const before=current.current;
      if(immediate){
        try{
          const preview=applyCommand(before,command);
          current.current=preview;setGame(preview);
        }catch{/* The server will validate and resolve the command. */}
      }
      try{connection.current?.send(command);}
      catch(e){if(immediate){current.current=before;setGame(before);}inform(String(e));}
      return;
    }
    try{
      const before=current.current;
      const next=applyCommand(before,command);current.current=next;setGame(next);
      const event:EventRecord={...command,seq:next.seq,at:Date.now()};
      setRedoStack([]);
      setHistory(h=>[...h,event]);
      setReceipt(rows=>[...rows,receiptForCommand(event,before,next)]);
    }catch(e){inform(e instanceof Error?e.message:String(e));}
  }
  function disconnect(){
    connection.current?.close();connection.current=null;snapshotRoom.current='';
    setConnected(false);setOnlineStatus(endpoint?'Ready to join another table':'Hosting not configured · local table only');
    const link=new URL(window.location.href);
    link.searchParams.delete('room');link.searchParams.delete('relay');
    window.history.replaceState({},'',link);
  }
  function joinRoom(options?:{room?:string;endpoint?:string}){
    try{
      const raw=(options?.endpoint??endpoint).trim();
      if(!raw){
        setCreateAfterSetup(!options?.room);setShowHosting(true);
        setOnlineStatus('Hosting not configured · connect a relay below');
        return;
      }
      const address=normalizeRelay(raw);
      const roomId=(options?.room??room).trim()||('table-'+createId().replaceAll('-','').slice(0,16));
      if(!/^[a-z0-9_-]{3,48}$/i.test(roomId))throw new Error('Room code must be 3–48 letters, numbers, dashes or underscores.');
      connection.current?.close();connection.current=null;setConnected(false);
      setEndpoint(address);setRoom(roomId);setJoinInput(roomId);setOnlineStatus('Connecting…');
      try{localStorage.setItem('sennet.ws',address);localStorage.setItem('sennet.name',playerName);}catch{}
      window.history.replaceState({},'',inviteUrl(roomId,address));
      connection.current=new RoomConnection(address,roomId,game.kind==='sandbox'&&!options?.room?'tcg':game.kind,actor,seat,playerName,playerToken(),{
        onJoined:(assigned,joinedRoom)=>{
          if(assigned!==null)setSeat(assigned);
          connection.current?.publishAppearance(appearanceRef.current());
          const known:OnlineRoom={room:joinedRoom,endpoint:address,updated:Date.now(),seat:assigned};
          setOnlineRoomsList(previous=>{
            const next=[known,...previous.filter(entry=>entry.room!==joinedRoom||entry.endpoint!==address)].slice(0,10);
            try{localStorage.setItem(ONLINE_ROOMS_KEY,JSON.stringify(next));}catch{}
            return next;
          });
        },
        onState:state=>{
          const clean=expireThrownDice(state,Date.now());
          const cosmeticsOnly=snapshotRoom.current===clean.roomId&&clean.seq===current.current.seq;
          current.current=clean;setGame(clean);
          if(!cosmeticsOnly){
            snapshotRoom.current=clean.roomId;
            setInitial(clean);setHistory([]);setRedoStack([]);setReceipt([]);
            setReplayAt(null);setBook(null);
          }
          setConnected(true);
        },
        onEvent:event=>{try{
          if(event.seq!==current.current.seq+1)throw new Error('Sequence gap');
          const before=current.current;
          const next=expireThrownDice(applyCommand(before,event),Date.now(),[event as EventRecord]);
          current.current=next;setGame(next);
          setHistory(h=>[...h,event as EventRecord]);
          setReceipt(rows=>[...rows,receiptForCommand(event as EventRecord,before,next)]);
        }catch{connection.current?.requestSnapshot();}},
        onPlayers:players=>{const next={...current.current,players};current.current=next;setGame(next);},
        onStatus:setOnlineStatus,onError:inform
      });
    }catch(e){inform(e instanceof Error?e.message:String(e));}
  }
  function createOnlineTable(){
    if(!endpoint.trim())setCreateAfterSetup(true);
    joinRoom({room:''});
  }
  function joinEnteredTable(){
    const value=joinInput.trim();
    if(!value){inform('Paste your invitation link or a room code.');return;}
    try{
      if(value.toLowerCase().startsWith('https://')||value.toLowerCase().startsWith('http://')){
        const link=new URL(value);
        const roomCode=link.searchParams.get('room');
        const relayUrl=link.searchParams.get('relay');
        if(!roomCode)throw Error('The link does not contain a Sennet room code.');
        if(!relayUrl&&!endpoint){setShowHosting(true);throw Error('This invitation does not include a hosting address.');}
        joinRoom({room:roomCode,endpoint:relayUrl||endpoint});
      }else joinRoom({room:value});
    }catch(error){inform(error instanceof Error?error.message:String(error));}
  }
  async function testRelay(){
    setHostingBusy(true);setHostingHealth('untested');
    try{
      const address=normalizeRelay(endpoint);
      const check=address.replace(/^wss:/,'https:').replace(/^ws:/,'http:')+'/health';
      const response=await fetch(check,{mode:'cors',cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Server returned HTTP '+response.status);
      const json=await response.json();
      if(json?.ok!==true)throw Error('This address is not a Sennet multiplayer relay.');
      try{localStorage.setItem('sennet.ws',address);}catch{}
      setEndpoint(address);setHostingHealth('ready');setShowHosting(false);
      setOnlineStatus('Relay reachable · ready to connect');
      if(createAfterSetup){setCreateAfterSetup(false);joinRoom({room:'',endpoint:address});}
      else inform('Relay connected and saved. You can create or join a table.');
    }catch(error){
      setHostingHealth('error');setShowHosting(true);
      inform('Cannot reach Sennet relay: '+(error instanceof Error?error.message:String(error)));
    }finally{setHostingBusy(false);}
  }
  async function shareRoom(){
    if(!room||!endpoint){inform('Create or join a room before sharing.');return;}
    const url=inviteUrl(room,endpoint);
    try{
      if(navigator.share)await navigator.share({title:'Join my Sennet table',url});
      else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);inform('Invitation link copied!');}
      else{window.prompt('Copy this invite link',url);}
    }catch{/* User dismissed system share sheet. */}
  }
  const autoJoinTried=useRef(false);
  useEffect(()=>{
    if(autoJoinTried.current)return;
    autoJoinTried.current=true;
    const params=new URLSearchParams(window.location.search);
    const invitation=params.get('room');
    if(!invitation)return;
    const address=params.get('relay')||endpoint;
    if(address)joinRoom({room:invitation,endpoint:address});
    else{setBook('settings');setSettingsPage('multiplayer');setOnlineStatus('Invite received · configure your relay to join');}
  },[]);
  useEffect(()=>()=>connection.current?.close(),[]);
  useEffect(()=>{
    const deadlines=thrownDieDeadlines(game,history);
    if(!deadlines.size)return;
    const next=Math.min(...deadlines.values());
    const timeout=window.setTimeout(()=>{
      const clean=expireThrownDice(current.current,Date.now(),history);
      if(clean!==current.current){
        current.current=clean;
        setGame(clean);
        setSelected(chosen=>chosen&&clean.objects.some(o=>o.id===chosen)?chosen:null);
      }
    },Math.max(0,next-Date.now()));
    return()=>window.clearTimeout(timeout);
  },[game,history]);
  useEffect(()=>{try{localStorage.setItem(MERGE_OPACITY_KEY,String(mergeOpacity));}catch{/* Storage unavailable. */}},[mergeOpacity]);
  useEffect(()=>{try{localStorage.setItem('sennet.coin.custom.v1',String(customCoinValue));}catch{}},[customCoinValue]);
  useEffect(()=>{try{localStorage.setItem('sennet.mat.label-scale.v1',String(labelScale));}catch{}},[labelScale]);
  useEffect(()=>{
    connection.current?.publishAppearance(appearanceRef.current());
  },[playmat,diceAppearance,coinAppearance,customCoinText,customCoinValue,labelScale,bookDesign,bookDock,bookOffset]);
  useEffect(()=>{try{localStorage.setItem('sennet.coin.custom.text.v1',customCoinText);}catch{}},[customCoinText]);
  useEffect(()=>{try{localStorage.setItem('sennet.coin.appearance.v1',JSON.stringify(coinAppearance));}catch{}},[coinAppearance]);
  useEffect(()=>{try{localStorage.setItem('sennet.dice.appearance.v1',JSON.stringify(diceAppearance));}catch{}},[diceAppearance]);
  useEffect(()=>{try{localStorage.setItem('sennet.dice.hold.ms',String(diceHoldMs));}catch{}},[diceHoldMs]);
  useEffect(()=>{try{localStorage.setItem(MERGE_DELAY_KEY,String(mergeHoverMs));}catch{/* Storage unavailable. */}},[mergeHoverMs]);
  useEffect(()=>{
    try{localStorage.setItem(scopedPlaymatKey(actor),JSON.stringify(playmat));}
    catch{inform('Not enough browser storage to save this playmat image. Try a smaller image.');}
  },[actor,playmat]);
  useEffect(()=>{
    if(isConnected)return;
    const snapshot:SavedSession={
      id:sessionId.current,title:nameFor(game.kind),updated:Date.now(),
      initial,game,history,redoStack,receipt,seat
    };
    try{localStorage.setItem(LAST_SESSION_KEY,JSON.stringify(snapshot));}
    catch{/* Storage quota or private session: current play remains usable. */}
  },[game,history,initial,isConnected,seat,redoStack,receipt]);
  useEffect(()=>{
    if(isConnected||(game.objects.length===0&&history.length===0))return;
    setRecent(old=>{
      const saved:SavedSession={id:sessionId.current,title:nameFor(game.kind),
        updated:Date.now(),initial,game,history,redoStack,receipt,seat};
      const updated=[saved,...old.filter(item=>item.id!==saved.id)].slice(0,8);
      try{localStorage.setItem(RECENT_KEY,JSON.stringify(updated));}catch{/* Storage may be full. */}
      return updated;
    });
  },[game,history,initial,isConnected,redoStack,receipt,seat]);
  useEffect(()=>{
    const handleKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setBook(null);setReplayAt(null);}};
    window.addEventListener('keydown',handleKey);return()=>window.removeEventListener('keydown',handleKey);
  },[]);
  async function importLocal(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>25_000_000)throw Error('Game file must be 25 MB or smaller.');
      const raw=JSON.parse(await file.text()) as {schema?:string};
      if(raw.schema==='sennet.replay/1'||raw.schema===RECEIPT_SCHEMA){
        const loaded=parseReplayFile(raw);
        if(isConnected)disconnect();
        resetWith(loaded.game!,loaded.id||createId(),loaded.history,loaded.initial,
          loaded.receipt,loaded.redoStack);
        setSeat(loaded.seat);
        inform('Restored full replay and undo/redo history.');
      }else{
        const pack=parseGamePack(raw);
        rememberPack(pack);setPacks(getPacks());inform('Imported '+pack.name);
      }
    }catch(e){inform(String(e));}
    event.target.value='';
  }
  async function importRemote(){try{const pack=await importPackUrl(packUrl);rememberPack(pack);setPacks(getPacks());setPackUrl('');inform('Added '+pack.name);}catch(e){inform(String(e));}}
  const replayFile=()=>({
    schema:RECEIPT_SCHEMA,id:sessionId.current,exportedAt:Date.now(),
    initial,history,redoStack,receipt,seat,game:current.current
  });
  const exportReceipt=()=>downloadText('sennet-session-'+sessionId.current+'.json',json(replayFile()));
  async function importReceipt(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    try{
      if(file.size>25_000_000)throw Error('Game file must be 25 MB or smaller.');
      const restored=parseReplayFile(JSON.parse(await file.text()));
      if(isConnected)disconnect();
      resetWith(restored.game!,restored.id||createId(),restored.history,
        restored.initial,restored.receipt,restored.redoStack);
      setSeat(restored.seat);
      setActionLogOpen(true);
      inform('Game receipt imported. Replay and undo/redo restored.');
    }catch(e){inform(e instanceof Error?e.message:String(e));}
  }
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
    if(replayAt!==null){inform('Exit replay mode before undoing.');return;}
    const previous=history.slice(0,-1);const next=expireThrownDice(
      replay(initial,previous),Date.now(),previous);
    setRedoStack(stack=>[...stack,history[history.length-1]]);
    current.current=next;setGame(next);setHistory(previous);setSelected(null);setReplayAt(null);
    writeReceipt('Undo','Game · #'+history[history.length-1].seq,
      history[history.length-1].type.replaceAll('_',' '));
  }
  function redo(){
    if(isConnected){inform('Redo requires server approval in an online game.');return;}
    if(replayAt!==null){inform('Exit replay mode before redoing.');return;}
    if(!redoStack.length)return;
    const record=redoStack[redoStack.length-1];
    try{
      // Replay from the initial snapshot guarantees redo is the exact
      // same state transition, with no newly randomized roll values.
      const past=[...history,record],next=expireThrownDice(
        replay(initial,past),Date.now(),past);
      current.current=next;setGame(next);setHistory(past);
      setRedoStack(items=>items.slice(0,-1));setSelected(null);
      writeReceipt('Redo','Game · #'+record.seq,record.type.replaceAll('_',' '));
    }catch(error){inform(String(error));}
  }
  const orderedReceipt=useMemo(()=>receipt.slice().sort((a,b)=>a.at-b.at),
    [receipt]);
  const latestAction=history.length?formatActionDisplay(history[history.length-1],
    initial,history):'Ready · actions appear here';
  function botMove(){
    if(isConnected){inform('The demo bot is available offline.');return;}
    const action=choosePseudoBotAction(current.current);
    if(action)takeAction(action.type,action.payload);else inform('No available move.');
  }
  async function addDeckToLiveTable(objects:TableObject[]):Promise<void>{
    if(game.kind!=='tcg'){inform('Start or join a Trading Card Game table before adding your deck.');return;}
    if(!isConnected){inform('Join an online table first.');return;}
    const count=objects.length;
    for(let i=0;i<count;i+=24){
      const batch=objects.slice(i,i+24).map(o=>({...o,matSeat:seat,owner:actor}));
      try{connection.current?.send({id:createId(),type:'ADD_MANY',actor,payload:{objects:batch}});}
      catch(error){inform('Deck upload interrupted: '+String(error));return;}
      if(i+24<count)await new Promise(resolve=>window.setTimeout(resolve,85));
    }
    inform('Submitted '+count+' cards to your multiplayer table.');
  }
  function createDeck(){
    const next=createGame('tcg');
    let order=0;
    const objects:TableObject[]=cards.flatMap(card=>Array.from({length:card.amount},()=>({
      id:'deck-'+createId(),kind:'card' as const,name:card.name,x:tcgMatCells(seat).find(c=>c.row===1&&c.column===2)!.x,y:tcgMatCells(seat).find(c=>c.row===1&&c.column===2)!.y,rotation:0,faceUp:false,color:'#a7a0c7',zone:'DECK' as const,matSeat:seat,order:order++
    })));
    if(isConnected){void addDeckToLiveTable(objects);return;}
    resetWith({...next,objects,message:deckName+' · '+objects.length+' cards'});
  }
  async function loadStudioDeck(deck:SavedDeck){
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
    if(isConnected){
      await addDeckToLiveTable(objects);
    }else resetWith({...next,objects,message:deck.name+' · '+objects.length+' cards loaded'});
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
    <div className="sennet-multiplayer-dock" role="group" aria-label="Multiplayer quick access">
      <button type="button" className="sennet-multiplayer-open" onClick={()=>{
        setSettingsPage('multiplayer');setBook('settings');
      }} title="Host or join a table">
        {isConnected?<Wifi size={15}/>:<Users size={15}/>}
        <span>{isConnected?'Table '+room:'Play together'}</span>
        {isConnected&&<small>{game.players.filter(p=>p.online).length} online</small>}
      </button>
      {isConnected&&<button type="button" className="sennet-multiplayer-share"
        onClick={shareRoom} title="Share invitation"><Link2 size={16}/></button>}
    </div>
    <div className="table-world">
      <TableCanvas bookDesign={bookDesign} bookDock={bookDock} bookOffset={bookOffset} onBookMove={point=>{
          writeReceipt('Move','Book · '+Math.round(bookOffset.x)+','+Math.round(bookOffset.y)+
            ' → '+Math.round(point.x)+','+Math.round(point.y),'Reposition');
          setBookOffset(point);
        }} onBookOpen={()=>{writeReceipt('Open','Book','Sennet');setBook('sennet');}} state={viewedGame} labelScale={labelScale} seat={seat} playerName={playerName} actorId={actor} selected={selected}
        onSelect={setSelected} wheelMode="docked"
        autoDeselect={autoDeselect} deselectMs={deselectMs} cardViewHoldMs={cardViewHoldMs}
        handHoldView={handHoldView} holdSelectStacks={holdSelectStacks} handPlayMode={handPlayMode}
        onOpenReceipt={()=>setActionLogOpen(true)}
        onInterfaceAction={(type,location,description)=>writeReceipt(type,location,description)}
        latestAction={latestAction} canUndo={!isConnected&&replayAt===null&&history.length>0}
        canRedo={!isConnected&&replayAt===null&&redoStack.length>0}
        onUndo={undo} onRedo={redo} drawer={<PersonalDrawer activeBook={book} openBook={setBook} seat={seat} name={playerName} onLog={()=>setActionLogOpen(v=>!v)} onRecall={()=>{
        let saved:SavedSession|null=null;
        try{saved=JSON.parse(localStorage.getItem(REWIND_SESSION_KEY)||'null') as SavedSession|null;}
        catch{/* Ignore a corrupted previous session. */}
        saved??=lastSession();
        if(saved?.game&&Array.isArray(saved.game.objects)){
          loadRecent(saved);
          setSeat(saved.seat??seat);
        }else inform('No saved play session yet.');
      }}/>}
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
          // Shuffling a card in a pile shuffles the whole physical pile,
          // rather than silently shuffling only the one visible card.
          if(action==='shuffle'){
            // Shuffle only the pressed physical pile on this player's mat.
            // Do not expand an unrelated multi-selection across other seats.
            const anchor=current.current.objects.find(o=>o.id===ids[0]);
            if(!anchor||anchor.matSeat!==seat)return;
            const expanded=cardStackMembers(current.current,anchor.id)
              .filter(card=>card.matSeat===seat&&card.zone===anchor.zone&&
                (!card.owner||card.owner===actor||card.owner==='local'));
            ids=(expanded.length?expanded:[anchor]).map(card=>card.id);
          }
          // One authoritative event applies to the ENTIRE selection.
          // State is validated atomically; invalid or opponent-owned
          // groups never partially mutate.
          takeAction('BATCH_CARD_ACTION',{ids,action,
            ...(action==='shuffle'?{seed:Date.now()%10000000}:{}),
});
        }}
        onMoveSelection={(ids,anchorId,x,y)=>{
          takeAction('BATCH_CARD_ACTION',{action:'move',ids,anchorId,x,y,
            snapMerged:playmat.snapMerged,snapMergedSeat:seat,
            freePlacement:playmat.freePlacement});
        }}
        mergeOpacity={mergeOpacity} mergeHoverMs={mergeHoverMs} playmat={playmat}
        diceAppearance={diceAppearance} diceHoldMs={diceHoldMs} diceFadeMs={diceFadeMs}
        coinAppearance={coinAppearance} customCoinValue={customCoinValue}
        customCoinText={customCoinText} onCustomCoinText={setCustomCoinText}
        onCustomCoinValue={setCustomCoinValue}
        onTokenPlace={(value,sign,x,y,carrierId,color,coinText)=>takeAction('TOKEN_PLACE',
          {value,sign,x,y,seat,...(carrierId?{carrierId}:{}),
          ...(color?{color}:{}),...(coinText!==undefined?{coinText}:{})})}
        onCoinModify={(id,changes)=>takeAction('COIN_MODIFY',{id,...changes})}
        onCoinDuplicate={id=>takeAction('CLONE',{id,newId:createId()})}
        onTokenAdjust={(ids,value,sign)=>takeAction('TOKEN_ADJUST',{ids,value,sign,custom:customCoinValue,seat})}
        onDicePlace={(sides,x,y)=>takeAction('ADD',{object:{id:createId(),kind:'die',name:'D'+String(sides).padStart(2,'0'),x,y,rotation:0,faceUp:true,color:'#b9c6b9',zone:'TABLE',order:game.objects.length+100,sides,value:1,matSeat:seat,description:'Placed die',throwDice:true,throwRolls:[1],throwQuantity:1,throwTotal:1,throwExpiresAt:Date.now()+THROWN_DIE_LIFETIME_MS}})}
        onDiceThrow={throws=>takeAction('THROW_TRAY',{seat,throws})}
        onDiceReroll={(id,rolls,x,y,rotation,quaternion,altitude)=>takeAction('REROLL_DIE',{id,rolls,x,y,rotation,quaternion,altitude})}
        onMergeCenter={(targetSeat,boundary,merged)=>takeAction('SET_CENTER_MERGE',{seat:targetSeat,boundary,merged})}
        onMoveStack={(id,x,y)=>{
          const old=game.objects.find(o=>o.id===id);
          if(old&&Math.hypot(old.x-x,old.y-y)>=2)
            takeAction('MOVE_STACK',{id,x,y,snapMerged:playmat.snapMerged,snapMergedSeat:seat,
            freePlacement:playmat.freePlacement});
        }}
        onMove={(id,x,y)=>{
          const old=game.objects.find(o=>o.id===id);
          if(old&&Math.hypot(old.x-x,old.y-y)>=2){
            const local=tcgMatLocal(x,y,seat);
            const right=TCG_MAT_WIDTH/2+3;
            const top=-TCG_MAT_HEIGHT/2+TCG_MAT.rowHeight+TCG_MAT.gap;
            if((old.tokenCoin||old.kind==='die')&&local.x>=right&&local.x<=right+TCG_MAT.cardWidth&&
              local.y>=top&&local.y<=TCG_MAT_HEIGHT/2){
              takeAction('DELETE',{id});return;
            }
            if(old.kind==='die'){
              const left=-TCG_MAT_WIDTH/2-3;
              if(local.x<=left&&local.x>=left-TCG_MAT.cardWidth&&
                local.y>=top&&local.y<=TCG_MAT_HEIGHT/2){
                takeAction('DELETE',{id});return;
              }
            }
            takeAction('MOVE',{id,x,y,snapMerged:playmat.snapMerged,snapMergedSeat:seat,
            freePlacement:playmat.freePlacement});
          }
        }} readonly={replayAt!==null}/>
    </div>
    {actionLogOpen&&createPortal(<div className="sennet-receipt-backdrop"
      onPointerDown={event=>{if(event.target===event.currentTarget)setActionLogOpen(false);}}>
      <section className="sennet-receipt" role="dialog" aria-modal="true"
        aria-label="Sennet action log">
        <header className="sennet-receipt-header">
          <div className="sennet-receipt-insignia">S</div>
          <div><span className="sennet-receipt-eyebrow">SENNET · TABLE ACTIVITY</span>
            <h2>Action Log</h2><small>{orderedReceipt.length} actions · Full session</small></div>
          <button type="button" className="sennet-receipt-close"
            aria-label="Close receipt" onClick={()=>setActionLogOpen(false)}>×</button>
        </header>
        <div className="sennet-receipt-scroll">
          <table className="sennet-receipt-table">
            <colgroup><col className="sennet-receipt-time-column"/><col className="sennet-receipt-type-column"/>
              <col className="sennet-receipt-location-column"/><col/></colgroup>
            <thead><tr><th scope="col">Time</th><th scope="col">Type</th>
              <th scope="col">Location</th><th scope="col">Description</th></tr></thead>
            <tbody>{orderedReceipt.map(row=>{
              const date=receiptTimestamp(row.at);
              return <tr key={row.id}>
                <td className="sennet-receipt-timestamp">
                  <span>{date.date}</span><span>{date.time}</span></td>
                <td><strong>{row.type}</strong></td>
                <td>{row.location}</td><td>{row.description}</td>
              </tr>;
            })}</tbody>
          </table>
          {!orderedReceipt.length&&<p className="sennet-receipt-empty">
            No actions recorded yet. Table actions appear here automatically.</p>}
        </div>
        <footer className="sennet-receipt-footer">
          <small>YYYYMMDD · HHMMSSTT<br/>Full commands and undo/redo saved in session JSON</small>
          <div className="sennet-receipt-actions">
            <input ref={receiptUpload} hidden type="file" accept=".json,application/json"
              onChange={importReceipt}/>
            <button type="button" onClick={()=>receiptUpload.current?.click()}>Import</button>
            <button type="button" onClick={exportReceipt}>Export game + log</button>
          </div>
        </footer>
      </section>
    </div>,document.body)}
    {tcgStudioOpen&&<TcgDeckBuilder onClose={()=>setTcgStudioOpen(false)}
      onLoadOnTable={loadStudioDeck}
      snapMerged={playmat.snapMerged}
      onSnapMerged={value=>setPlaymat(p=>({...p,snapMerged:value}))}
      mergeHoverMs={mergeHoverMs} onMergeHoverMs={setMergeHoverMs}/>}
    {book&&createPortal(<div className="reader-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setBook(null);}}>
      <section className={"reader unified-tome reader-open-book tome-"+bookDesign} role="dialog" aria-modal="true" aria-label={book+' book'}>
        <div className="reader-cover-board" aria-hidden="true"/>
        <div className="reader-page-stack" aria-hidden="true"/>
        <div className="unified-tome-tabs" role="tablist" aria-label="Tome sections">{(['sennet','games','settings'] as const).map(tab=><button key={tab} type="button" role="tab" aria-selected={book===tab} className={book===tab?'active':''} onClick={()=>setBook(tab)}>{tab==='sennet'?'Sennet':tab==='games'?'Games':'Settings'}</button>)}</div>
        <div className="reader-spread">
          <section className="reader-page reader-page-left" aria-label="Left page">
            <div className="reader-page-topline"><span>✦ &nbsp; SENNET &nbsp; ✦</span><span>VOL. {book==='sennet'?'I':book==='games'?'II':'III'}</span></div>
            <header className="reader-header">
              <span className="reader-mark">S</span>
              <div><span className="reader-eyebrow">THE SENNET LIBRARY · VOLUME {book==='sennet'?'01':book==='games'?'02':'03'}</span><h1>{book==='sennet'?'Sennet':book==='games'?'Games':'Settings'}</h1></div>
            </header>
            <div className="reader-left-content">
              <div className="reader-engraving" aria-hidden="true"><span>❧</span><i/><span>❧</span></div>
              <p className="reader-left-kicker">{book==='sennet'?'The tabletop companion':book==='games'?'The games collection':'The settings folio'}</p>
              <p className="reader-lead">{book==='sennet'?'Your tabletop. Your rules. A living guide to the world of Sennet.':
                book==='games'?'Every tabletop begins with a choice. Open a game, resume a session, or shape your own.':
                'The finer details of your table, carefully bound in one place.'}</p>
              <div className="reader-printed-rule" aria-hidden="true"><span>✦</span></div>
              {book==='sennet'&&<nav className="reader-chapter-index" aria-label="Manual chapters">
                <h2>Contents</h2>
                {['Start with Games','Move & zoom','Your seat & books','Individual TCG mats','Bring your own games','Multiplayer'].map((chapter,i)=>
                  <button type="button" key={chapter} onClick={()=>document.getElementById('sennet-guide-'+(i+1))?.scrollIntoView({behavior:'smooth',block:'start'})}>
                    <span>{String(i+1).padStart(2,'0')}</span><span>{chapter}</span><span className="reader-index-dots" aria-hidden="true"/></button>)}
              </nav>}
              {book==='games'&&<nav className="reader-chapter-index reader-volume-navigation" aria-label="Game chapters">
                <h2>Browse the collection</h2>
                <Tabs items={[{id:'all',label:'All Games'},{id:'recent',label:'Recent'},{id:'library',label:'Library'},{id:'tools',label:'Table Tools'}]} active={gamesPage} change={v=>setGamesPage(v as GamePage)}/>
              </nav>}
              {book==='settings'&&<nav className="reader-chapter-index reader-volume-navigation" aria-label="Settings chapters">
                <h2>Chapters</h2>
                <Tabs items={[{id:'general',label:'General'},{id:'playmat',label:'Playmat'},{id:'deckbuilder',label:'Deckbuilder'},{id:'multiplayer',label:'Multiplayer'},{id:'scripting',label:'Lua Scripting'}]} active={settingsPage} change={v=>setSettingsPage(v as SettingsPage)}/>
              </nav>}
              <div className="reader-seal" aria-hidden="true"><span>✧</span><strong>S</strong><span>✧</span></div>
            </div>
            <footer className="reader-page-number"><span>SENNET · YOUR TABLETOP, YOUR RULES</span><span>— {book==='sennet'?'1':book==='games'?'3':'5'} —</span></footer>
          </section>
          <div className="reader-spine-gutter" aria-hidden="true"/>
          <section className="reader-page reader-page-right" aria-label="Right page">
            <header className="reader-right-header">
              <span>{book==='sennet'?'THE TABLETOP MANUAL':book==='games'?'GAMES & SESSIONS':'CUSTOMIZATION & CONTROLS'}</span>
              <button className="reader-close" onClick={()=>setBook(null)} aria-label="Close book"><X size={20}/></button>
            </header>
            <div className="reader-content">
          {book==='sennet'&&<div className="guide">
            <p className="intro">Your tabletop. Your rules. Your player name and seat tab contains three books.</p>
            <div className="guide-grid">
              <article id="sennet-guide-1"><span>01</span><h3>Start with Games</h3><p>Open the Games book to choose a game type, resume a recent table, or load a community game from your library.</p></article>
              <article id="sennet-guide-2"><span>02</span><h3>Move &amp; zoom</h3><p>Drag pieces across the felt. Mouse-wheel scroll or two-finger touchpad scrolling zooms around the pointer. Pinch on a touchscreen to zoom. Click and drag empty table space to move the camera; grab a card to move only that card. Double-click the table (or press 0) to reset the view.</p></article>
              <article id="sennet-guide-3"><span>03</span><h3>Your seat &amp; books</h3><p>The compact gold Player ## tab tucks against the bottom of the screen. Clicking it expands the drawer upward and outward: the gold tag stays on top, with the books below. The green section and any custom display name appear only when expanded; the extra word Player is omitted from that green name label. Click the tag again to collapse it. Hovering does nothing. Choose your seat in Settings.</p></article>
              <article id="sennet-guide-4"><span>04</span><h3>Individual TCG mats</h3><p>Every seat has its own four-row mat with seven original horizontal card slots in each PLAY and HAND row plus six in-between positions, for 13 selectable positions per row. Tap the Eye centered on the top line of your Play 03 zone to focus it. Hold it for 0.25 seconds, then select any opponent to bring both mats together in a full-height opposing view: theirs above, yours below, separated by the battlefield divider. Other players have a small retractable name/seat tag. Your own gold Player ## tab rises when clicked, revealing Sennet, Games, and Settings underneath it. The green book section stays concealed when collapsed. There is no caret, hover activation, auto-close timer, or separate bookshelf. In Opponent Mode, every other visible player's mat has a Sword and Shield pair whose circle centers sit directly on the Play 03 zone's top boundary from that player's perspective. Tap that player's Sword to mark them as an Enemy across the divider, or their Shield to place them beside you facing your direction. The Eye and Castle sit side by side, evenly centered on the top line of your Play 03 zone, with each circle straddling that line. The Eye keeps its original tap-and-hold controls and shows a one-on-one view with exactly one selected opponent always across from you; Castle defaults to All View: every marked Ally is placed in an optimally scaled grid to the right of your full-size mat, which stays anchored on the left. Hold Castle for 0.25 seconds to toggle BOTH groups to Single View: one Ally beside you and one Enemy across the divider. Both have left/right arrows that cycle independently through their own teammates or opponents. Hold Castle again to return BOTH groups to All View. In Castle All View, click an Ally mat to focus just that Ally while all Enemies remain in their unchanged All grid; click an Enemy mat to focus just that Enemy while all Allies remain as they were. You may focus both sides independently, leaving exactly three mats: yours, one Ally, and one Enemy. Each focused mat has its Sword/Shield and same-role left/right arrows. Focus is neither Single nor All; tap Castle to leave or hold Castle to resume toggling from the previous broad mode. Marked Enemies remain opposite you above the divider in both modes, and unclassified players stay hidden. Tap Castle to enter or leave the battlefield. Only one of Sword or Shield can be selected; tap the active icon again to clear it. Each opponent keeps their own setting. Eye always places the one selected opponent across the divider, even when marked Ally; only Castle puts all marked allies beside you and all marked enemies across from you. Use the circular left/right arrows centered on the selected opponent mat’s left and right edges to cycle counter-clockwise or clockwise through the numbered seats. While facing an opponent the camera is fixed—dragging or zooming the view is disabled, but cards can still be moved. Tap the eye again for the full table, or hold it to return to your mat alone. Hover over + or − to join or separate center sections. All changes can be replayed. The mat retains the original LOCATIONS, RESERVE, WAIT, RESOURCE, LEADERS, DECK, DISCARD and REMOVE pockets, three PLAY rows and HAND. Use the DECK arrow or D to draw; select a card and press T to tap/untap or F to flip. Drop a card or token into your REMOVE pocket to remove it.</p></article>
              <article id="sennet-guide-5"><span>05</span><h3>Bring your own games</h3><p>Import JSON game packs and externally hosted sprite sheets. Large creator files stay on their own hosting.</p></article>
              <article id="sennet-guide-6"><span>06</span><h3>Multiplayer</h3><p>Click Play together to create a table, invite friends with one link, and resume any saved seat from the same browser. Online games need a separately hosted WebSocket relay; shared progress is saved there.</p></article>
            </div>
            <button className="reader-primary" onClick={()=>{setBook('games');setGamesPage('all');}}>Open Games <ChevronRight size={17}/></button>
          </div>}
          {book==='games'&&<>
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
              <details className="reader-details"><summary>Move history and replay</summary><div><p>{history.length} actions recorded in compact command format.</p><div className="history-entries">{history.slice(-10).reverse().map(h=><button key={h.id} onClick={()=>{setReplayAt(h.seq);setBook(null);}}>{h.seq}. {h.type.toLowerCase().replaceAll('_',' ')}</button>)}</div>{replayAt!==null&&<button className="reader-secondary" onClick={()=>setReplayAt(null)}>Exit replay</button>}<button className="reader-secondary" onClick={exportReceipt}><Download size={15}/> Export moves</button></div></details>
              <button className="reader-primary" onClick={()=>setBook(null)}>Return to table <ChevronRight size={16}/></button>
            </>}
          </>}
          {book==='settings'&&<>
            {settingsPage==='general'&&<div className="reader-block"><h3>Customization</h3>
              <label>Book Design<select value={bookDesign} onChange={e=>setBookDesign(e.target.value as typeof bookDesign)}>
                <option value="tiny">Tiny Tome · Leather & Brass</option><option value="dragon">Dragon Codex · Azure Enamel</option><option value="journal">Campaign Journal · Crimson</option><option value="arcane">Arcane Notebook · Gold Sigil</option><option value="strapped">Strapped Journal · Aged Hide</option>
              </select></label>
              <h4>Dock Position</h4><label>Left Box<select value={bookDock==='left'?'book':'empty'} onChange={e=>{setBookDock(e.target.value==='book'?'left':'right');setBookOffset({x:0,y:0});}}><option value="empty">Empty</option><option value="book">Book</option></select></label>
              <label>Right Box<select value={bookDock==='right'?'book':'empty'} onChange={e=>{setBookDock(e.target.value==='book'?'right':'left');setBookOffset({x:0,y:0});}}><option value="empty">Empty</option><option value="book">Book</option></select></label>
              <button className="reader-secondary" onClick={()=>{setBookDock('right');setBookOffset({x:0,y:0});}}>Reset book to right box</button>
              </div>}
            {settingsPage==='general'&&<><div className="reader-heading"><div><h2>Your perspective</h2><p>Your own seat is always positioned at the bottom. The table rotates around it.</p></div></div>
              <div className="reader-block"><h3>Player</h3><label>Display name<input value={playerName} maxLength={32} onChange={e=>setPlayerName(e.target.value)}/></label><label>My seat<select value={seat} onChange={e=>setSeat(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>Player {String(i+1).padStart(2,'0')}</option>)}</select></label></div>
              <div className="reader-block"><h3>View controls</h3><p>Scroll the mouse wheel or two-finger touchpad to zoom. Pinch with two fingers on a touchscreen. After zooming in, click and drag empty tabletop space (left mouse button) or drag with one finger to pan. The camera cannot move beyond the area visible at startup. At maximum zoom-out, camera panning is locked. Dragging a card moves the card instead. Middle-mouse drag and Shift + scroll also pan. Press + / − to zoom and 0 to reset. Double-clicking does not change the zoom. The Eye on the top line of your Play 03 zone focuses it; hold for 0.25 seconds to choose an opponent. In Opponent Mode, each other visible player's mat has two circular controls whose centers sit directly on the top line of its Play 03 zone, from that player's perspective: Sword (Enemy, across the divider) and Shield (Ally, alongside you, facing the same way). Your own Play 03 zone has an evenly centered Eye/Castle pair directly on its top boundary. The Eye works exactly as before. Tap Castle to open or close the divided battlefield; unclassified seats disappear. Hold Castle for 0.25 seconds to switch BOTH sides together between Single View (one Ally and one Enemy, each with independent left/right cycling arrows) and All View (all Allies and all Enemies in their respective optimized grids). Click an Ally or Enemy mat to focus that player on their side without changing the opposite side's All grid or existing focus. Focus both sides to display only your full-size mat, one Ally, and one Enemy, with each focused player's relation buttons and same-side cycling arrows. Focus is neither All nor Single, and the next Castle hold continues the previous mode toggle. Your mat remains full-size and fixed to the left in both views, with existing spacing preserved; Enemies stay above the divider. Click Sword or Shield on the specific player's mat to change that player's relationship. They are mutually exclusive, toggle off on a second click, and are remembered separately per opponent on this browser. Eye is strictly one-on-one with the selected opponent always across the divide, regardless of Ally or Enemy classification. Castle always shows marked Enemies across from you and marked Allies beside you; All View shows both groups in grids, while Single View shows one player from each group with independent left/right arrows. Without a Sword or Shield selection, a chosen Eye opponent appears across from you by default.  The left and right circular arrows centered on the opponent's exact side borders between rows 2 and 3 cycle through opponents by their full-table seat positions: left counter-clockwise, right clockwise, skipping your seat. Eye and Castle views initially fit the complete playmat and attached action radial. Mouse wheel, touchpad pinch, touch pinch, or + may zoom in; − may zoom back out only to that fitted view, never farther. Drag-to-pan remains locked in opponent views. Eye, Castle, merge buttons and stack counters are all uniformly small (16 pixels), fixed in screen size at every zoom level, and remain attached to their playmat positions. Cards and match controls remain interactive. The player areas fill the screen, and the Eye and Castle remain merge-button-sized along the top line of Play 03. All PLAY and HAND rows have six additional half-slot card anchors between their original seven horizontal positions. Player names and seat numbers stay tucked behind the top and bottom screen edges: hover over a small, semi-transparent caret tab for 0.25 seconds to reveal its compact name/seat label. Tag transparency uses the merge-button setting. They stay open while hovered and retract 1 second after the pointer leaves, unless clicked to pin. Tap the eye again for the full table or hold it to return to your mat alone. Vector mats stay sharp; raster card art is limited by its source image resolution.</p></div>
              <div className="reader-block">
                <h3>Card gestures and selections</h3>
                <label><input type="checkbox" checked={handHoldView}
                  onChange={e=>setHandHoldView(e.target.checked)}/> Held Hand View — show my hand close to me, fanned along the bottom of the screen (Arena / Tabletop Simulator style). Drag a card into the playmat to play it.</label>
                <label><input type="checkbox" checked={holdSelectStacks}
                  onChange={e=>setHoldSelectStacks(e.target.checked)}/> Hold-to-select stacks instead of hold-to-inspect cards</label>
                <label>Card-view hold time — {cardViewHoldMs} ms
                  <input type="range" min="100" max="1500" step="50"
                    value={cardViewHoldMs} onChange={e=>setCardViewHoldMs(Number(e.target.value))}/></label>
                <label><input type="checkbox" checked={autoDeselect}
                  onChange={e=>setAutoDeselect(e.target.checked)}/> Automatically deselect inactive selections</label>
                <label>Inactive selection delay — {(deselectMs/1000).toFixed(1)} seconds
                  <input type="range" min="500" max="30000" step="500"
                    disabled={!autoDeselect} value={deselectMs}
                    onChange={e=>setDeselectMs(Number(e.target.value))}/></label>
                <label><input type="checkbox" checked={handPlayMode}
                  onChange={e=>setHandPlayMode(e.target.checked)}/> Play 00 hand layout: screen at upper-left; compact purple action controls at upper-right</label>
              </div>
              <div className="reader-block">
                <h3>Card stacks</h3>
                <p>A stationary <strong>0.25-second hold</strong> starts selection mode. Tap more cards or stacks once to add them; tap selected cards to remove them. Drag any selected card to move the entire selection together. A small <strong>13 px</strong> breakaway threshold resists accidental motion.</p>
                <p>Use the fixed radial at the bottom center of your playmat to apply actions to selected cards. Hold its center to collapse or expand the wheel.</p>
              </div>
              <div className="reader-block"><h3>Play mode</h3><div className="tool-buttons">{(['sandbox','turn-based','asynchronous'] as PlayMode[]).map(m=><button className={game.mode===m?'highlight':''} key={m} onClick={()=>takeAction('SET_MODE',{mode:m})}>{m==='sandbox'?'Live Sandbox':m==='turn-based'?'Turn Based':'Asynchronous'}</button>)}</div></div>
              <div className="reader-block"><h3>Current table</h3><p>{nameFor(game.kind)} · {game.objects.length} objects · {history.length} moves</p><button className="reader-secondary" onClick={returnToEmpty}>Clear view and open an empty table</button></div>
            </>}
            {settingsPage==='playmat'&&
              <><div className="reader-block"><h3>Playmat label size</h3>
                <label htmlFor="playmat-label-scale">Label scale — {Math.round(labelScale*100)}%
                <input id="playmat-label-scale" type="range" min={75} max={200} step={5}
                  value={Math.round(labelScale*100)} onChange={e=>setLabelScale(Number(e.target.value)/100)}/></label>
                <button className="reader-secondary" type="button" onClick={()=>setLabelScale(1.25)}>Reset to 125%</button>
              </div><div className="reader-block"><h3>Wooden side boxes</h3><p>Two empty wooden trays, one card wide and three cards tall, follow your playmat in every view.</p>
                <label htmlFor="wood-box-finish">Wood finish</label>
                <select id="wood-box-finish" value={playmat.sideBoxStyle}
                  onChange={e=>setPlaymat(p=>({...p,sideBoxStyle:e.target.value as PlaymatAppearance['sideBoxStyle']}))}>
                  <option value="walnut">Dark walnut tray</option>
                  <option value="carved">Carved wooden chest</option>
                  <option value="maple">Light maple</option>
                  <option value="ebony">Ebony</option>
                  <option value="mahogany">Mahogany</option>
                </select>
              </div>
              <div className="reader-block"><h3>Right tray · Dice, flip coin &amp; coin generators</h3>
                <p>Flip Coin, D04, D06, D08, D10, D12, D20 and D100 are permanent in the right box, between the two coin generators and the book. Tap a die to select one, tap repeatedly to increase its count (maximum 20). Select different dice to combine them. Drag any selected die to throw the entire selection with natural motion, screen and tray wall rebounds, and collisions between the dice. Reaching 20 automatically throws the selection. Only one physical die of each type appears after a throw, but every selected roll is calculated and logged. The centered face displays the combined result; inspect a thrown die for its individual results.</p>
              </div>
              <div className="reader-block">
                <h3>Die interactions</h3>
                <p>Hold a die, move it naturally with the cursor, then release to reroll. A quick click repeats the result bubble. Loose dice slowly fade out after the selected time; source dice stay in the box.</p>
                <label>Hold to pick up — {(diceHoldMs/1000).toFixed(2)} seconds
                  <input type="range" min={100} max={1000} step={50} value={diceHoldMs}
                    onChange={e=>setDiceHoldMs(Number(e.target.value))}/>
                </label>
                <p><strong>Loose die &amp; flipcoin lifetime:</strong> 10 seconds.
                  The result fades near the end, then is permanently removed.
                  Use Undo or return it to the drawer before the deadline to
                  remove or recover it. Source generators never disappear.</p>
              </div>
              <div className="reader-block sennet-dice-appearance-settings">
                <h3>Dice Appearance</h3>
                <p>Choose the finish for every die and the flip coin. Styles use lightweight, procedurally rendered materials—no texture downloads. The same finish appears in the tray, during 3D rolls, and after landing.</p>
                <div className="sennet-dice-theme-grid" role="group" aria-label="Dice designs">
                  {DICE_THEMES.map(theme=>
                    <button type="button" key={theme.id}
                      className={'sennet-dice-theme-card'+(diceAppearance.all===theme.id?' selected':'')}
                      aria-pressed={diceAppearance.all===theme.id}
                      onClick={()=>setDiceAppearance(p=>({...p,all:theme.id}))}>
                      <span className="sennet-dice-theme-preview" style={{
                        background:`radial-gradient(circle at 26% 23%, ${theme.second}, ${theme.base} 57%, #161926 100%)`,
                        borderColor:theme.edge,
                        boxShadow:`inset -5px -6px 7px #0007,inset 3px 3px 5px #fff6,0 4px 10px #0006`,
                        color:theme.ink
                      }} aria-hidden="true">20</span>
                      <span>{theme.name}</span>
                    </button>)}
                </div>
                <h4>Individual die designs</h4>
                <p>Optional overrides let each die have its own appearance. “Use set” follows the selected theme above.</p>
                <div className="sennet-dice-per-die">
                  {DICE_SIDES.map(sides=><label key={sides}>
                    <span>{diceLabel(sides)}</span>
                    <select aria-label={diceLabel(sides)+' appearance'}
                      value={diceAppearance.overrides[String(sides)]??''}
                      onChange={e=>setDiceAppearance(p=>{
                        const overrides={...p.overrides};
                        if(!e.target.value)delete overrides[String(sides)];
                        else overrides[String(sides)]=e.target.value as DiceThemeId;
                        return {...p,overrides};
                      })}>
                      <option value="">Use set</option>
                      {DICE_THEMES.map(theme=><option value={theme.id} key={theme.id}>{theme.name}</option>)}
                    </select>
                  </label>)}
                </div>
                <button type="button" className="reader-secondary"
                  onClick={()=>setDiceAppearance({all:DEFAULT_DICE_APPEARANCE.all,overrides:{}})}>
                  Reset dice designs
                </button>
              </div>
              <div className="reader-block"><h3>Token coins</h3>
                <p>The upper 1 coin is an editable inscription: click its number and type digits, commas, + or −. It has no radial. The lower 10 coin retains the radial for duplication, arithmetic and color. Drag either to place a matching coin. Small cabinet handles retract each drawer.</p>
                <label>Editable coin inscription
                  <input type="text" inputMode="text" maxLength={20}
                    aria-label="Editable 1 coin inscription"
                    value={customCoinText}
                    onChange={e=>{
                      const value=e.target.value;
                      if(/^[0-9,+-]{0,20}$/.test(value)){
                        setCustomCoinText(value);
                        const n=Math.abs(Number(value.replaceAll(',','')));
                        if(Number.isInteger(n)&&n>=1&&n<=9999)setCustomCoinValue(n);
                      }
                    }}/>
                </label>
                <label>Finish<select value={coinAppearance.finish}
                  onChange={e=>setCoinAppearance(p=>({...p,finish:e.target.value as CoinFinish}))}>
                  <option value="polished">Polished metal</option><option value="brushed">Brushed metal</option>
                  <option value="matte">Antique matte</option><option value="enamel">Lacquered enamel</option>
                </select></label>
                <label>Shine — {coinAppearance.shine}%<input type="range" min={0} max={100} step={5}
                  value={coinAppearance.shine} onChange={e=>setCoinAppearance(p=>({...p,shine:Number(e.target.value)}))}/></label>
                <label>Rim depth — {coinAppearance.bevel}%<input type="range" min={0} max={100} step={5}
                  value={coinAppearance.bevel} onChange={e=>setCoinAppearance(p=>({...p,bevel:Number(e.target.value)}))}/></label>
                <label>Coin size — {Math.round(coinAppearance.size*100)}%<input type="range" min={.55} max={1.3} step={.05}
                  value={coinAppearance.size} onChange={e=>setCoinAppearance(p=>({...p,size:Number(e.target.value)}))}/></label>
                <button className="reader-secondary" onClick={()=>setCoinAppearance(DEFAULT_COIN_APPEARANCE)}>Restore coin appearance</button>
              </div><PlaymatEditor appearance={playmat} setAppearance={setPlaymat}
                merges={viewedGame.centerMerges??[]} seat={seat} inform={inform}/>
              <div className="reader-block">
                <h3>TCG center-section controls</h3>
                <p>On your playmat, hover over a small circular + button between the four middle sections. After the hover delay, click to combine neighboring sections into a larger, freely usable area. Use Playmat → Card placement to switch between precise snap slots and boundary-contained free placement. Hover and click − to separate the sections again.</p>
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
            {settingsPage==='multiplayer'&&<div className="sennet-play-together">
              <div className="reader-heading"><div><h2>Play Together</h2>
                <p>Create a table, share its link, and pick up any game later. No accounts needed for invited friends.</p></div></div>
              <section className="sennet-multi-status" aria-live="polite">
                <span className={'sennet-multi-status-led '+(isConnected?'online':endpoint?'waiting':'missing')}/>
                <div><strong>{isConnected?'Connected to '+room:endpoint?'Ready for multiplayer':'Online hosting not connected'}</strong>
                  <small>{onlineStatus}{isConnected?' · Your table autosaves on the server':''}</small></div>
              </section>
              <div className="sennet-online-cards">
                <section className="sennet-online-card">
                  <div className="sennet-online-card-mark"><Plus size={19}/></div>
                  <strong>Start a table</strong>
                  <p>Make a new shared room. Friends join using one invitation link.</p>
                  <button type="button" className="reader-primary" onClick={createOnlineTable}>Create online table <ChevronRight size={17}/></button>
                </section>
                <section className="sennet-online-card">
                  <div className="sennet-online-card-mark"><Users size={19}/></div>
                  <strong>Join a friend</strong>
                  <p>Paste the invitation link or room code.</p>
                  <input value={joinInput} onChange={e=>setJoinInput(e.target.value)}
                    placeholder="Paste invite link or room code" aria-label="Invite link or room code"
                    onKeyDown={e=>{if(e.key==='Enter')joinEnteredTable();}}/>
                  <button type="button" className="reader-secondary" onClick={joinEnteredTable}>Join table <ChevronRight size={17}/></button>
                </section>
              </div>
              {isConnected&&<section className="sennet-online-current">
                <div className="sennet-online-current-header"><strong>Current table</strong><span>{room}</span></div>
                <div className="tool-buttons">
                  <button type="button" className="reader-primary" onClick={shareRoom}><Link2 size={16}/> Copy / share invitation</button>
                  <button type="button" onClick={disconnect}><WifiOff size={16}/> Leave table</button>
                </div>
                <div className="sennet-online-players" aria-label="Saved players">
                  {game.players.map(player=><span key={player.id} className={player.online?'online':'away'}>
                    <i/>{player.name} · seat {player.seat+1}{player.id===actor?' (you)':''}{!player.online?' · away':''}
                  </span>)}
                </div>
                <small>Shared pieces and seats are saved automatically. Leaving does not erase your place.</small>
              </section>}
              {onlineRoomsList.length>0&&<section className="sennet-saved-rooms">
                <h3>Continue a saved game</h3>
                {onlineRoomsList.map(previous=><button type="button" key={previous.endpoint+'|'+previous.room}
                  onClick={()=>joinRoom({room:previous.room,endpoint:previous.endpoint})}>
                  <RotateCw size={15}/><span>{previous.room}</span><small>{previous.seat===null?'Spectator':'Seat '+((previous.seat??0)+1)}</small>
                </button>)}
              </section>}
              <details className="sennet-hosting-panel" open={showHosting}
                onToggle={event=>setShowHosting(event.currentTarget.open)}>
                <summary><Settings2 size={15}/><span>{endpoint?'Multiplayer connection settings':'Set up online hosting once'}</span>
                  <small>{endpoint?'Edit or test server':'Required to create online rooms'}</small></summary>
                <div className="sennet-hosting-body">
                  <p>Sennet needs one online server for everyone's shared games. This is not a VPN error. Once hosted, friends never need to set up a server.</p>
                  <a className="sennet-hosting-deploy" href="https://render.com/deploy?repo=https://github.com/marcusdhaynes/Sennet"
                    target="_blank" rel="noopener noreferrer">Deploy Sennet relay on Render <ChevronRight size={15}/></a>
                  <small>Render may charge for the persistent disk and hosting. The preconfigured blueprint keeps games saved between restarts.</small>
                  <label>Multiplayer server address
                    <input value={endpoint} onChange={e=>{setEndpoint(e.target.value);setHostingHealth('untested');}}
                      placeholder="https://your-service.onrender.com"/>
                  </label>
                  <button type="button" className="reader-primary" disabled={hostingBusy||!endpoint.trim()}
                    onClick={testRelay}>{hostingBusy?'Checking connection…':'Save & test connection'} <Wifi size={16}/></button>
                  {hostingHealth==='ready'&&<small className="sennet-hosting-ok"><Check size={14}/> Server is reachable.</small>}
                  {hostingHealth==='error'&&<small className="sennet-hosting-error">Unable to connect. Check the server's /health page and deployment status.</small>}
                  <small>Uses secure WSS for real-time play, with HTTPS fallback for compatible VPN and firewall connections.</small>
                </div>
              </details>
            </div>}
            {settingsPage==='scripting'&&<><div className="reader-heading"><div><h2>Lua scripting</h2><p>Run experimental local game scripts in an isolated worker.</p></div></div>
              <div className="reader-block"><label>Lua script<textarea rows={12} className="code-edit" spellCheck={false} value={script} onChange={e=>setScript(e.target.value)}/></label><button className="reader-secondary" onClick={executeLua}><Play size={16}/> Run script</button><p>{scriptOutput||'Ready to execute.'}</p></div>
              <p className="reader-footnote"><ShieldCheck size={15}/> Untrusted public scripts need stricter per-game limits before production multiplayer.</p>
            </>}
          </>}
            </div>
            <footer className="reader-footer"><span>✧ &nbsp; SENNET LIBRARY &nbsp; ✧</span><span>— {book==='sennet'?'2':book==='games'?'4':'6'} —</span></footer>
          </section>
        </div>
      </section>
    </div>,document.body)}
    {replayAt!==null&&!book&&<button className="replay-return" onClick={()=>setReplayAt(null)}>Replay · Return to live table <X size={16}/></button>}
    {notice&&<div className="table-toast" role="status">{notice}<button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={14}/></button></div>}
  </div>;
}
