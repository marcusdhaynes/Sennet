import {useDeferredValue,useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {ArrowDownToLine,BarChart3,Check,Download,FileInput,Filter,Layers,Plus,RefreshCw,Save,Search,Settings2,Trash2,Upload,X} from 'lucide-react';
import {configFor,detailCard,loadTcgCatalog,TCGS,type CatalogCard,type CatalogUpdate,type TcgId} from '../lib/tcgCatalog';
import {changeDeckEntry,deckChecks,deckQuantity,deckStats,newDeck,patchDeckEntry,readDecks,saveDecks,toTextDeck,type SavedDeck} from '../lib/deckWorkspace';
import {parseDeckImport,detectDeckGame,matchDeckImport,type ImportData,type ImportMatch,type Detection} from '../lib/universalDeckImport';
type Props={onClose:()=>void;onLoadOnTable:(deck:SavedDeck)=>void;initialGame?:TcgId;
 snapMerged:boolean;onSnapMerged:(value:boolean)=>void;
 mergeHoverMs:number;onMergeHoverMs:(value:number)=>void;};
const ALL='All';
function download(name:string,content:string,type='text/plain'){
 const uri=URL.createObjectURL(new Blob([content],{type}));
 const link=document.createElement('a');link.href=uri;link.download=name;link.click();
 window.setTimeout(()=>URL.revokeObjectURL(uri),1000);
}
export default function TcgDeckBuilder({onClose,onLoadOnTable,initialGame='pokemon',
 snapMerged,onSnapMerged,mergeHoverMs,onMergeHoverMs}:Props){
 const [decks,setDecks]=useState<SavedDeck[]>(readDecks);
 const [activeId,setActiveId]=useState(()=>{
  try{return localStorage.getItem('sennet.deck-active.v1')||'';}catch{return '';}
 });
 const [game,setGame]=useState<TcgId>(()=>{
  try{const saved=localStorage.getItem('sennet.tcg.preferred.v1');
   return TCGS.some(t=>t.id===saved)?saved as TcgId:initialGame;}catch{return initialGame;}
 });
 const [cards,setCards]=useState<CatalogCard[]>([]);
 const [loading,setLoading]=useState(false);
 const [status,setStatus]=useState('Ready');
 const [error,setError]=useState('');
 const [query,setQuery]=useState(''),search=useDeferredValue(query);
 const [setFilter,setSetFilter]=useState(ALL);
 const [rarity,setRarity]=useState(ALL),[type,setType]=useState(ALL),[color,setColor]=useState(ALL);
 const [cost,setCost]=useState(ALL),[sort,setSort]=useState('name');
 const [ownedOnly,setOwnedOnly]=useState(false);
 const [section,setSection]=useState('Main'),[page,setPage]=useState(1);
 const [chosen,setChosen]=useState<CatalogCard|null>(null);
 const [view,setView]=useState<'cards'|'stats'|'import'>('cards');
 const [mobilePanel,setMobilePanel]=useState<'browse'|'deck'>('browse');
 const [showFilters,setShowFilters]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [showImages,setShowImages]=useState(()=>{
  try{return localStorage.getItem('sennet.tcg.images.v1')!=='off';}catch{return true;}
 });
 const [riotEndpoint,setRiotEndpoint]=useState(()=>{
  try{return localStorage.getItem('sennet.tcg.riftbound.endpoint.v1')||'';}catch{return '';}
 });
 const [compact,setCompact]=useState(()=>{
  try{return localStorage.getItem('sennet.tcg.compact.v1')==='on';}catch{return false;}
 });
 const [importText,setImportText]=useState('');
 const [importChoice,setImportChoice]=useState<TcgId|'auto'>('auto');
 const [importPending,setImportPending]=useState<{parsed:ImportData;game:TcgId;detection:Detection}|null>(null);
 const [importResolved,setImportResolved]=useState<ImportMatch|null>(null);
 const [importStatus,setImportStatus]=useState('');
 const [importRunning,setImportRunning]=useState(false);
 const [notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const controller=useRef<AbortController|null>(null);
 const importAbort=useRef<AbortController|null>(null);
 const forceReload=useRef(false);
 const config=configFor(game);
 const active=decks.find(d=>d.id===activeId&&d.game===game);
 const message=(msg:string)=>{setNotice(msg);window.setTimeout(()=>setNotice(s=>s===msg?'':s),4000);};
 const edit=(fn:(deck:SavedDeck)=>SavedDeck)=>setDecks(old=>old.map(d=>d.id===activeId?fn(d):d));
 const create=(id:TcgId)=>{
  const entry=newDeck(id);setDecks(old=>[entry,...old]);setActiveId(entry.id);setSection('Main');
 };
 useEffect(()=>{saveDecks(decks);},[decks]);
 useEffect(()=>{try{localStorage.setItem('sennet.tcg.riftbound.endpoint.v1',riotEndpoint);}catch{/* ephemeral */}},[riotEndpoint]);
 useEffect(()=>{try{localStorage.setItem('sennet.tcg.images.v1',showImages?'on':'off');}catch{/* ephemeral */}},[showImages]);
 useEffect(()=>{try{localStorage.setItem('sennet.tcg.compact.v1',compact?'on':'off');}catch{/* ephemeral */}},[compact]);
 useEffect(()=>{try{localStorage.setItem('sennet.deck-active.v1',activeId);}catch{/* ephemeral */}},[activeId]);
 useEffect(()=>{
  if(active)return;
  const existing=decks.find(d=>d.game===game);
  if(existing){setActiveId(existing.id);return;}
  create(game);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[game,activeId,active?.id]);
 useEffect(()=>{
  const abort=new AbortController();controller.current?.abort();controller.current=abort;
  setCards([]);setChosen(null);setStatus('Connecting to '+config.provider+'…');setError('');setLoading(true);
  const shouldForce=forceReload.current;
  forceReload.current=false;
  void loadTcgCatalog(game,abort.signal,(update:CatalogUpdate)=>{
   if(abort.signal.aborted)return;
   setStatus(update.label);
   if(update.partial)setCards(update.partial);
  },shouldForce).then(all=>{
   if(abort.signal.aborted)return;
   setCards(all);setStatus(all.length.toLocaleString()+' indexed cards');
  }).catch((e:unknown)=>{
   if(abort.signal.aborted)return;
   const failure=e instanceof Error?e.message:String(e);
   setError(failure);
   setStatus(failure.startsWith('One Piece partial catalogue:')?
    'One Piece · incomplete catalogue':'Catalogue unavailable');
  }).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[game,config.provider,refresh]);
 const facets=useMemo(()=>{
  const distinct=(fn:(c:CatalogCard)=>string[])=>[...new Set(cards.flatMap(fn).filter(Boolean))].sort();
  return {sets:distinct(c=>[c.set]),types:distinct(c=>c.types.length?c.types:[c.type]),
   rarities:distinct(c=>[c.rarity]),colors:distinct(c=>c.colors),costs:distinct(c=>[c.cost])};
 },[cards]);
 const ownedIds=useMemo(()=>new Set(active?.entries.filter(e=>e.owned>0).map(e=>e.card.id)||[]),[active]);
 const matches=useMemo(()=>{
  const fragments=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const result=cards.filter(c=>{
   if(setFilter!==ALL&&c.set!==setFilter||rarity!==ALL&&c.rarity!==rarity||
      type!==ALL&&!c.types.includes(type)&&c.type!==type||
      color!==ALL&&!c.colors.includes(color)||cost!==ALL&&c.cost!==cost)return false;
   if(ownedOnly&&!ownedIds.has(c.id))return false;
   const hay=(c.name+' '+c.number+' '+c.set+' '+c.type+' '+c.text+' '+Object.values(c.attributes).join(' ')).toLowerCase();
   return fragments.every(f=>hay.includes(f));
  });
  if(sort==='cost')result.sort((a,b)=>(Number(a.cost)||0)-(Number(b.cost)||0)||a.name.localeCompare(b.name));
  else if(sort==='price')result.sort((a,b)=>(a.price||0)-(b.price||0));
  else if(sort==='set')result.sort((a,b)=>a.set.localeCompare(b.set)||a.name.localeCompare(b.name));
  else if(sort==='rarity')result.sort((a,b)=>a.rarity.localeCompare(b.rarity)||a.name.localeCompare(b.name));
  else result.sort((a,b)=>a.name.localeCompare(b.name));
  return result;
 },[cards,search,setFilter,rarity,type,color,cost,ownedOnly,ownedIds,sort]);
 useEffect(()=>setPage(1),[search,setFilter,rarity,type,color,cost,ownedOnly,sort,game]);
 const entries=useMemo(()=>active?.entries.filter(e=>e.section===section)
  .sort((a,b)=>a.card.name.localeCompare(b.card.name))||[],[active,section]);
 const stats=useMemo(()=>active?deckStats(active):null,[active]);
 const warnings=useMemo(()=>active?deckChecks(active):[],[active]);
 const PAGE=80,pages=Math.max(1,Math.ceil(matches.length/PAGE));
 const add=(card:CatalogCard,step=1,to=section)=>{
  edit(d=>changeDeckEntry(d,card,to,step));
 };
 const chooseCard=(c:CatalogCard)=>{
  setChosen(c);
  if(c.game==='pokemon'&&!c.type){
   const abort=new AbortController();
   void detailCard(c.game,c.id,abort.signal).then(full=>{
    if(full)setChosen(old=>old?.id===c.id?{...old,...full}:old);
   }).catch(()=>{});
  }
 };
 const pickGame=(id:TcgId)=>{
  forceReload.current=false;
  setGame(id);setActiveId(decks.find(d=>d.game===id)?.id||'');
  setSection('Main');setQuery('');setSetFilter(ALL);setRarity(ALL);
  setType(ALL);setColor(ALL);setCost(ALL);setPage(1);
 };
 const exportDeck=(extension:'txt'|'json')=>{
  if(!active)return;
  const basename=active.name.replace(/[^a-z0-9 _-]/gi,'_')||'Sennet deck';
  download(basename+'.'+extension,extension==='txt'?toTextDeck(active):JSON.stringify(active,null,2),
   extension==='json'?'application/json':'text/plain');
 };

 const startImport=async(text:string,source:string)=>{
  importAbort.current?.abort();
  const cancel=new AbortController();importAbort.current=cancel;
  setImportPending(null);setImportResolved(null);setImportRunning(true);
  setImportStatus('Reading deck format and identifying the TCG…');
  try{
   if(source.toLowerCase().endsWith('.json')||text.trim().startsWith('{')){
    try{
     const raw=JSON.parse(text) as SavedDeck;
     if(TCGS.some(t=>t.id===raw.game)&&Array.isArray(raw.entries)&&
       raw.entries.every(e=>e?.card?.game===raw.game&&e.card.id&&e.quantity>0)){
      // Native Sennet exports contain all card metadata, so restore them
      // with full fidelity even if the provider API is temporarily offline.
      const copy:SavedDeck={...newDeck(raw.game),name:String(raw.name||'Imported deck').slice(0,90),
       format:String(raw.format||configFor(raw.game).formats[0]),
       description:String(raw.description||'').slice(0,1000),
       entries:raw.entries.slice(0,1000).map(e=>({...e,quantity:Math.min(99,e.quantity)}))};
      setDecks(d=>[copy,...d]);pickGame(copy.game);setActiveId(copy.id);
      setImportStatus('Native Sennet deck restored · '+copy.entries.length+' entries');
      message('Restored '+configFor(copy.game).name+' deck with all card details');
      return;
     }
    }catch{/* Use the cross-platform importer for other JSON exports. */}
   }
   const parsed=parseDeckImport(text,source);
   if(!parsed.rows.length){
    setImportStatus(parsed.ignored.join(' · ')||'No card entries found in this decklist.');return;
   }
   const recognition:Detection=importChoice==='auto'
     ?await detectDeckGame(parsed,{[game]:cards},cancel.signal)
     :{game:importChoice,confidence:'certain',reason:'TCG selected by you'};
   if(cancel.signal.aborted)return;
   if(!recognition.game){
    setImportStatus(recognition.reason+' Choose a TCG below and retry.');return;
   }
   const target=recognition.game;
   setImportPending({parsed,game:target,detection:recognition});
   setImportStatus('Detected '+configFor(target).name+' · '+recognition.reason+
     '. Matching '+parsed.rows.length+' entries against the card catalogue…');
   // Switching the game loads that provider's full catalogue. Do not
   // import into the previously selected game by accident.
   if(target!==game)pickGame(target);
  }catch(e){
   if(!cancel.signal.aborted)setImportStatus(e instanceof Error?e.message:String(e));
  }finally{
   if(!cancel.signal.aborted)setImportRunning(false);
  }
 };
 useEffect(()=>{
  if(!importPending||importPending.game!==game||loading)return;
  if(!cards.length||cards[0].game!==game){
   if(error)setImportStatus('Could not load '+config.name+': '+error+
     '. Refresh its catalogue, then retry the import.');
   return;
  }
  const resolved=matchDeckImport(importPending.parsed,cards,game);
  setImportResolved(resolved);
  setImportStatus(config.name+' identified · '+resolved.matched.length+
    ' matched lines · '+resolved.missing.length+' need review.');
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[importPending,game,cards,loading,error]);
 const commitImport=()=>{
  if(!importPending||!importResolved?.matched.length)return;
  const {parsed,game:target}=importPending;
  const fresh=newDeck(target);
  fresh.name=(parsed.name||'Imported '+configFor(target).name+' deck').slice(0,90);
  if(configFor(target).formats.some(f=>f.toLowerCase()===parsed.format.toLowerCase()))
   fresh.format=parsed.format;
  const finished=importResolved.matched.reduce((deck,{row,card,section})=>
   changeDeckEntry(deck,card,section,row.quantity),fresh);
  setDecks(prev=>[finished,...prev]);pickGame(target);setActiveId(finished.id);
  setImportStatus('Saved new '+configFor(target).name+' deck · '+
   importResolved.matched.length+' card lines');
  message('Imported deck · '+importResolved.matched.length+' matched, '+
   importResolved.missing.length+' unmatched');
  setImportPending(null);setImportResolved(null);setView('cards');
 };
 const importFile=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
   if(file.size>3_000_000)throw Error('Deck file is too large (3 MB limit).');
   // Binary MTGO .dek exports may be zipped; we never guess at them.
   const content=await file.text();
   if(content.includes('\uFFFD')&&file.name.toLowerCase().endsWith('.dek'))
    throw Error('Binary .dek cannot be read directly; export a text/CSV/XML decklist.');
   setImportText(content);
   await startImport(content,file.name);
  }catch(e){setImportStatus(e instanceof Error?e.message:String(e));}
 };
 return <div className="tcg-builder-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
 <section className="tcg-builder" role="dialog" aria-modal="true" aria-label="Universal TCG deck builder">
  <header className="tcgb-header">
   <div className="tcgb-brand"><div className="tcgb-icon"><Settings2 size={18}/></div><div><b>TCG STUDIO</b><small>Universal deck builder</small></div></div>
   <div className="tcgb-pickers">
    <label>TCG<select aria-label="Select trading card game" value={game} onChange={e=>pickGame(e.target.value as TcgId)}>
     {TCGS.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
    <label>Deck<select aria-label="Select saved deck" value={activeId} onChange={e=>setActiveId(e.target.value)}>
     {decks.filter(d=>d.game===game).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <button title="Create new deck" aria-label="Create new deck" onClick={()=>create(game)}><Plus size={18}/></button>
   </div>
   <button className={settingsOpen?'is-active':''} title="TCG and deck builder settings"
    onClick={()=>setSettingsOpen(v=>!v)} aria-label="Open TCG settings"><Settings2 size={16}/><span>Settings</span></button>
   <button title="Close" aria-label="Close TCG settings" onClick={onClose}><X size={19}/></button>
  </header>
  <nav className="tcgb-mobile-navigation" aria-label="Mobile deck builder navigation">
    <button className={mobilePanel==='browse'?'active':''} aria-pressed={mobilePanel==='browse'} onClick={()=>setMobilePanel('browse')}><Search size={17}/> Browse cards</button>
    <button className={mobilePanel==='deck'?'active':''} aria-pressed={mobilePanel==='deck'} onClick={()=>setMobilePanel('deck')}><Layers size={17}/> My deck <span>{active?deckQuantity(active):0}</span></button>
   </nav>
  <div className={'tcgb-main tcgb-mobile-'+mobilePanel}>
   <section className="tcgb-library">
    <div className="tcgb-searchrow">
     <label className="tcgb-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search names, texts, effects, numbers…" aria-label="Search cards"/></label>
     <button className={showFilters?'is-active':''} onClick={()=>setShowFilters(v=>!v)} title="Toggle card filters"><Filter size={17}/></button>
     <button disabled={loading} onClick={()=>{forceReload.current=true;setRefresh(v=>v+1);}} title="Refresh the complete card catalogue"><RefreshCw size={17}/></button>
    </div>
    {showFilters&&<div className="tcgb-filters">
     {([['Set',setFilter,setSetFilter,facets.sets],['Type',type,setType,facets.types],
      ['Rarity',rarity,setRarity,facets.rarities],['Color',color,setColor,facets.colors],
      ['Cost',cost,setCost,facets.costs]] as [string,string,(v:string)=>void,string[]][])
      .map(([title,value,update,options])=><label key={title}>{title}
       <select value={value} onChange={e=>update(e.target.value)}><option value={ALL}>All</option>
        {options.map(v=><option value={v} key={v}>{v}</option>)}</select></label>)}
     <button onClick={()=>{setSetFilter(ALL);setType(ALL);setRarity(ALL);setColor(ALL);setCost(ALL);}}>Reset</button>
    </div>}
    <div className="tcgb-resultbar"><span>{matches.length.toLocaleString()} cards {loading?'· loading…':''}</span>
     <label>Sort<select aria-label="Sort cards" value={sort} onChange={e=>setSort(e.target.value)}>
      <option value="name">Name</option><option value="set">Set</option><option value="cost">Cost</option>
      <option value="rarity">Rarity</option><option value="price">Price</option></select></label>
     <label className="tcgb-owned-filter"><input type="checkbox" checked={ownedOnly} onChange={e=>setOwnedOnly(e.target.checked)}/> Owned</label>
    </div>
    {error&&cards.length>0&&<div className="tcgb-provider-warning" role="alert">
     <span>{error}</span>
     <button disabled={loading} onClick={()=>{forceReload.current=true;setRefresh(v=>v+1);}}>
      Retry incomplete categories</button>
    </div>}
    <div className={'tcgb-results'+(compact?' dense':'')}>
     {matches.slice((page-1)*PAGE,page*PAGE).map(c=><div className="tcgb-result" key={c.id}>
      <button className="tcgb-thumb" onClick={()=>chooseCard(c)} title="Card details">
       {showImages&&c.image?<img src={c.image} loading="lazy" alt="" />:<span>✦</span>}</button>
      <button className="tcgb-result-text" onClick={()=>chooseCard(c)}>
       <strong>{c.name}</strong><small>{[c.set,c.number].filter(Boolean).join(' · ')}</small>
       <span>{[c.type,c.colors.join('/')].filter(Boolean).join(' · ')}</span>
      </button>
      <button title={'Add to '+section} aria-label={'Add '+c.name} className="tcgb-add" onClick={()=>add(c)}><Plus size={17}/></button>
     </div>)}
     {!matches.length&&<div className="tcgb-empty">
      {loading?'Loading card catalogue…':game==='riftbound'&&error?
       <p>Official Riftbound cards require a Riot-approved application. <a href={config.url} target="_blank" rel="noreferrer">Request Riot approval</a>, then configure the authorized catalog in TCG Settings. No public key or unofficial mirror is used.</p>
       :error||'No cards match your filters.'}
     </div>}
    </div>
    <footer className="tcgb-pagination"><span>{status}</span><nav>
     <button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>‹</button><small>{page} / {pages}</small>
     <button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>›</button>
    </nav></footer>
   </section>
   <aside className="tcgb-deck">
    <div className="tcgb-deckhead"><div className="tcgb-deckmeta">
     <label>Deck name<input maxLength={90} value={active?.name||''} onChange={e=>edit(d=>({...d,name:e.target.value,updated:Date.now()}))}/></label>
     <label>Format<select value={active?.format||config.formats[0]} onChange={e=>edit(d=>({...d,format:e.target.value,updated:Date.now()}))}>
      {config.formats.map(f=><option key={f}>{f}</option>)}</select></label>
    </div>
    <div className="tcgb-numbers"><strong>{active?deckQuantity(active):0}<small> cards</small></strong>
     <span>{stats?.unique||0} unique</span><span>{stats?.unknownPrices?'From $':'$'}{(stats?.price||0).toFixed(2)}</span>
     <span className={warnings.some(w=>w.severity==='warning')?'tcgb-alert':''}>{warnings.length} notices</span>
    </div>
    <nav className="tcgb-sections">{config.sections.map(s=><button className={section===s?'active':''} key={s} onClick={()=>setSection(s)}>
     {s}<small>{active?deckQuantity(active,s):0}</small></button>)}</nav>
    <nav className="tcgb-tabs">
     <button className={view==='cards'?'active':''} onClick={()=>setView('cards')}><Layers size={14}/> Cards</button>
     <button className={view==='stats'?'active':''} onClick={()=>setView('stats')}><BarChart3 size={14}/> Stats</button>
     <button className={view==='import'?'active':''} onClick={()=>setView('import')}><FileInput size={14}/> Import</button>
    </nav></div>
    <div className="tcgb-deckbody">
     {view==='cards'&&<>{entries.map(e=><div className="tcgb-entry" key={e.card.id+e.section}>
      <button onClick={()=>chooseCard(e.card)} className="tcgb-entry-label"><strong>{e.card.name}</strong><small>{e.card.set} · {e.card.number}</small></button>
      <div className="tcgb-counter"><button aria-label="Minus one" onClick={()=>add(e.card,-1,e.section)}>−</button>
       <span>{e.quantity}</span><button aria-label="Plus one" onClick={()=>add(e.card,1,e.section)}>+</button></div>
     </div>)}
      {!entries.length&&<div className="tcgb-empty">Choose cards from the left and press + to add them to {section}.</div>}</>}
     {view==='stats'&&stats&&<div className="tcgb-statistics">
      <div className="tcgb-statline"><span>Total</span><b>{stats.total}</b><span>Unique</span><b>{stats.unique}</b></div>
      <h4>Cost curve</h4><div className="tcgb-bars">{stats.costBuckets.map(b=><div key={b.label} title={b.label+': '+b.value}>
       <div style={{height:Math.max(2,100*b.value/Math.max(1,...stats.costBuckets.map(v=>v.value)))+'%'}}/><small>{b.label}</small></div>)}</div>
      <h4>Colors</h4><div className="tcgb-stats-list">{stats.colors.map(([name,count])=><div key={name}>{name}<b>{count}</b></div>)}</div>
      <h4>Types</h4><div className="tcgb-stats-list">{stats.types.map(([name,count])=><div key={name}>{name}<b>{count}</b></div>)}</div>
      <h4>Deck checks</h4>{warnings.length?warnings.map((w,i)=><p className="tcgb-warning" key={i}>{w.message}</p>):
       <p className="tcgb-help">No structural warnings. Check the latest official format rules before competitive play.</p>}
      <label>Notes<textarea rows={3} value={active?.description||''} onChange={e=>edit(d=>({...d,description:e.target.value,updated:Date.now()}))}/></label>
     </div>}
     {view==='import'&&<div className="tcgb-import">
      <p className="tcgb-help">Auto-detects the TCG from card names, set identifiers, or the file format. Paste card lists, or upload TXT, CSV, JSON, YDK, DEC, DCK, XML, COD and Markdown deck exports.</p>
      <textarea rows={9} value={importText} aria-label="Universal decklist input"
       onChange={e=>{setImportText(e.target.value);setImportPending(null);setImportResolved(null);setImportStatus('');}}
       placeholder={'4 Mother Gothel - Selfish Manipulator\n4 The Queen\'s Castle - Mirror Chamber\n2 Jafar - Striking Illusionist'}/>
      <label>Identify game<select aria-label="Deck import game detection" value={importChoice}
       onChange={e=>setImportChoice(e.target.value as TcgId|'auto')}>
       <option value="auto">Auto-detect TCG</option>
       {TCGS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      <div className="tcgb-import-actions">
       <button onClick={()=>void startImport(importText,'Pasted decklist')}
        disabled={importRunning||!importText.trim()}>
        <FileInput size={14}/>{importRunning?'Identifying…':'Detect & preview'}</button>
       <label className="tcgb-file"><Upload size={14}/> Upload deck file
        <input type="file" accept=".txt,.csv,.json,.ydk,.dec,.dek,.dck,.xml,.cod,.md,.tsv,.deck"
         onChange={event=>void importFile(event)}/></label>
      </div>
      {importStatus&&<p className="tcgb-import-status" role="status">{importStatus}</p>}
      {importPending&&<div className="tcgb-import-preview">
       <strong>{configFor(importPending.game).name}</strong>
       <small>{importPending.detection.confidence} detection · {importPending.parsed.rows.length} lines</small>
       {importResolved&&<>
        <div className="tcgb-import-counts">
         <span>{importResolved.matched.length} matched</span>
         <span>{importResolved.missing.length} unmatched</span>
        </div>
        {importResolved.missing.length>0&&<div className="tcgb-missing">
         <b>Needs review — these cards will NOT be silently replaced:</b>
         {importResolved.missing.slice(0,60).map((row,i)=><small key={i}>{row.raw}</small>)}
        </div>}
        {importPending.parsed.ignored.length>0&&<div className="tcgb-missing">
         <b>Unrecognized lines:</b>
         {importPending.parsed.ignored.slice(0,20).map((row,i)=><small key={i}>{row}</small>)}
        </div>}
        <button className="tcgb-load" disabled={!importResolved.matched.length}
         onClick={commitImport}>Create new deck with {importResolved.matched.length} matched lines</button>
       </>}
      </div>}
      <p className="tcgb-help">Imports never overwrite existing decks. If a provider or format cannot be recognized, choose a TCG manually. Private deck URLs and proprietary binary formats require an export file.</p>
     </div>}
    </div>
    <footer className="tcgb-actions"><button onClick={()=>exportDeck('txt')}><Download size={14}/> TXT</button>
     <button onClick={()=>exportDeck('json')}><Save size={14}/> JSON</button>
     <button className="tcgb-load" disabled={!active||!active.entries.length} onClick={()=>{
      if(active)onLoadOnTable(active);
     }}><ArrowDownToLine size={14}/> Table</button>
     <button className="tcgb-delete" title="Delete deck" onClick={()=>{
      if(active&&window.confirm('Delete deck '+active.name+'?')){setDecks(ds=>ds.filter(d=>d.id!==active.id));setActiveId('');}
     }}><Trash2 size={14}/></button></footer>
   </aside>
  </div>
  <footer className="tcgb-footnote"><span><a href={config.url} target="_blank" rel="noreferrer">{config.provider}</a> · {game==='riftbound'?'Riot authorization required':'Locally cached · 24h'} · Unofficial catalogue viewer</span>
   {notice&&<span role="status"><Check size={13}/>{notice}</span>}</footer>
  {settingsOpen&&<div className="tcgb-settings-pane" aria-label="TCG settings">
   <div className="tcgb-settings-heading"><div><strong>TCG & DECK BUILDER SETTINGS</strong>
    <small>Table interactions · card browser · catalogue</small></div>
    <button onClick={()=>setSettingsOpen(false)} aria-label="Return to deck builder"><X size={17}/></button></div>
   <div className="tcgb-settings-content">
    <section><h3>Table interactions</h3>
     <label className="tcgb-toggle"><input type="checkbox" checked={snapMerged}
      onChange={e=>onSnapMerged(e.target.checked)}/>
      <span><b>Snap while merged</b><small>Use the 13 horizontal card positions even when play zones are merged.</small></span></label>
     <p><strong>Card selection hold: 250 ms (fixed)</strong> — keep the pointer still to select; tap further cards once. Drag past the 13 px resistance to move your selection, or hold a selected card to open the wheel.</p>
     <label>Merge hover delay <strong>{mergeHoverMs} ms</strong>
      <input type="range" min="0" max="3000" step="100" value={mergeHoverMs}
       onChange={e=>onMergeHoverMs(Number(e.target.value))}/></label>
    </section>
    <section><h3>Card browser</h3>
     <label className="tcgb-toggle"><input type="checkbox" checked={showImages}
      onChange={e=>setShowImages(e.target.checked)}/>
      <span><b>Show card artwork</b><small>Load image thumbnails lazily for visible catalogue cards.</small></span></label>
     <label className="tcgb-toggle"><input type="checkbox" checked={compact}
      onChange={e=>setCompact(e.target.checked)}/>
      <span><b>Dense results</b><small>Fit more cards onscreen with smaller rows.</small></span></label>
     <div className="tcgb-setting-actions">
      <button onClick={()=>{
       try{localStorage.setItem('sennet.tcg.preferred.v1',game);}catch{/* ephemeral */}
       message(config.name+' set as preferred TCG');
      }}>Save {config.name} as default</button>
      <button disabled={loading} onClick={()=>{forceReload.current=true;setSettingsOpen(false);setRefresh(v=>v+1);}}>Refresh {config.provider} catalogue</button>
     </div>
    </section>
    <section><h3>Decks & providers</h3>
     <p>Decks autosave in this browser. Export JSON to preserve full card and section data, or TXT for portable card counts and names.</p>
     <p>Card filters and sections adapt to each TCG. Structural checks are advisory; format rules and banned lists can change.</p>
     <p>Riftbound uses only officially authorized Riot content. An approved application and a secure server-side catalogue endpoint are required; API keys must not be embedded in this website.</p>
     <label>Approved Riot catalogue endpoint (URL only)
      <input value={riotEndpoint} placeholder="https://your-relay.example/api/tcg/riftbound/catalog"
       onChange={e=>setRiotEndpoint(e.target.value)} aria-label="Authorized Riftbound catalogue URL"/></label>
     <button disabled={loading} onClick={()=>{
      try{
       if(riotEndpoint.trim()){
        const endpoint=new URL(riotEndpoint.trim());
        if(endpoint.protocol!=='https:'&&endpoint.hostname!=='localhost')throw Error('HTTPS required');
        localStorage.setItem('sennet.tcg.riftbound.endpoint.v1',endpoint.href);
       }else localStorage.removeItem('sennet.tcg.riftbound.endpoint.v1');
       message('Riot endpoint saved (no secret stored)');
       if(game==='riftbound'){setSettingsOpen(false);forceReload.current=true;setRefresh(v=>v+1);}
      }catch(e){message(e instanceof Error?e.message:'Invalid endpoint URL');}
     }}>Apply Riot endpoint</button>
     <a target="_blank" rel="noreferrer" href={config.url}>View {config.provider} API documentation ↗</a>
    </section>
   </div>
  </div>}
  {chosen&&!settingsOpen&&<div className="tcgb-preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setChosen(null);}}>
   <aside className="tcgb-preview"><header><b>{chosen.name}</b><button onClick={()=>setChosen(null)} aria-label="Close details"><X size={17}/></button></header>
    <div className="tcgb-preview-content">
     {showImages&&chosen.image&&<img src={chosen.image} loading="lazy" alt={chosen.name}/>}
     <div><small>{chosen.set} · {chosen.number}</small><p>{[chosen.type,chosen.colors.join('/'),chosen.rarity].filter(Boolean).join(' · ')}</p>
      {chosen.cost&&<p>Cost: {chosen.cost}</p>}
      {chosen.text&&<pre>{chosen.text}</pre>}
      {Object.entries(chosen.attributes).filter(([,v])=>v).map(([k,v])=><div className="tcgb-attribute" key={k}><span>{k}</span><b>{v}</b></div>)}
      <button className="tcgb-load" onClick={()=>{add(chosen);setChosen(null);}}><Plus size={16}/> Add to {section}</button>
      {active?.entries.filter(e=>e.card.id===chosen.id).map(e=><div className="tcgb-card-notes" key={e.section}>
       <h4>{e.section} · {e.quantity} copies</h4>
       <label>Owned<input type="number" value={e.owned} min="0" max="999"
        onChange={event=>edit(d=>patchDeckEntry(d,e.section,e.card.id,{owned:Number(event.target.value)}))}/></label>
       <label>Tags<input value={e.tags.join(', ')} placeholder="Combo, draw, synergy…"
        onChange={event=>edit(d=>patchDeckEntry(d,e.section,e.card.id,{tags:event.target.value.split(',').map(t=>t.trim()).filter(Boolean)}))}/></label>
       <label>Notes<input value={e.notes} placeholder="Notes"
        onChange={event=>edit(d=>patchDeckEntry(d,e.section,e.card.id,{notes:event.target.value}))}/></label>
      </div>)}
     </div>
    </div>
   </aside></div>}
 </section></div>;
}
