import {useDeferredValue,useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {ArrowDownToLine,BarChart3,Check,Download,FileInput,Filter,Layers,Plus,RefreshCw,Save,Search,Settings2,Trash2,Upload,X} from 'lucide-react';
import {configFor,detailCard,loadTcgCatalog,TCGS,type CatalogCard,type CatalogUpdate,type TcgId} from '../lib/tcgCatalog';
import {changeDeckEntry,deckChecks,deckQuantity,deckStats,newDeck,parseTextDeck,patchDeckEntry,readDecks,saveDecks,toTextDeck,type SavedDeck} from '../lib/deckWorkspace';
type Props={onClose:()=>void;onLoadOnTable:(deck:SavedDeck)=>void;initialGame?:TcgId;
 snapMerged:boolean;onSnapMerged:(value:boolean)=>void;
 stackHoldMs:number;onStackHoldMs:(value:number)=>void;
 mergeHoverMs:number;onMergeHoverMs:(value:number)=>void;};
const ALL='All';
function download(name:string,content:string,type='text/plain'){
 const uri=URL.createObjectURL(new Blob([content],{type}));
 const link=document.createElement('a');link.href=uri;link.download=name;link.click();
 window.setTimeout(()=>URL.revokeObjectURL(uri),1000);
}
export default function TcgDeckBuilder({onClose,onLoadOnTable,initialGame='pokemon',
 snapMerged,onSnapMerged,stackHoldMs,onStackHoldMs,mergeHoverMs,onMergeHoverMs}:Props){
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
 const [importText,setImportText]=useState(''),[unmatched,setUnmatched]=useState<string[]>([]);
 const [notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const controller=useRef<AbortController|null>(null);
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
 const importList=()=>{
  if(!active)return;
  const parsed=parseTextDeck(importText,cards,section);
  setUnmatched(parsed.missing);
  edit(start=>parsed.matches.reduce((current,item)=>
   changeDeckEntry(current,item.card,config.sections.some(s=>s===item.section)?item.section:section,item.quantity),start));
  message('Imported '+parsed.matches.length+' lines; '+parsed.missing.length+' unmatched');
 };
 const importJson=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
   if(file.size>4_000_000)throw Error('Deck file too large.');
   const parsed=JSON.parse(await file.text()) as SavedDeck;
   if(!TCGS.some(t=>t.id===parsed.game)||!Array.isArray(parsed.entries))throw Error('Not a Sennet deck JSON');
   const data:SavedDeck={...newDeck(parsed.game),
    name:String(parsed.name||'Imported deck').slice(0,90),
    format:String(parsed.format||configFor(parsed.game).formats[0]),
    description:String(parsed.description||''),
    entries:parsed.entries.filter(e=>e?.card?.game===parsed.game&&e.card.id&&
      configFor(parsed.game).sections.some(s=>s===e.section)&&e.quantity>0).slice(0,1000)};
   setDecks(d=>[data,...d]);setGame(data.game);setActiveId(data.id);
   message('Imported '+data.entries.length+' entries');
  }catch(e){message(e instanceof Error?e.message:'Invalid file');}
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
  <div className="tcgb-main">
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
      {loading?'Loading card catalogue…':error||'No cards match your filters.'}
      {game==='riftbound'&&<p>Riot requires an approved application and a secure server-held API key. <a href={config.url} target="_blank" rel="noreferrer">Riot access policy</a></p>}
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
      <p className="tcgb-help">Paste quantity + name, one card per line. Section headers such as [Main], [Extra], [Leader] are supported.</p>
      <textarea rows={10} value={importText} onChange={e=>setImportText(e.target.value)} placeholder={'[Main]\n4 Example Card'}/>
      <button disabled={!cards.length} onClick={importList}><FileInput size={14}/> Import text list</button>
      {unmatched.length>0&&<div className="tcgb-missing"><b>{unmatched.length} unmatched</b>{unmatched.slice(0,30).map((x,i)=><small key={i}>{x}</small>)}</div>}
      <label className="tcgb-file"><Upload size={14}/> Import Sennet deck JSON<input accept=".json,application/json" type="file" onChange={importJson}/></label>
     </div>}
    </div>
    <footer className="tcgb-actions"><button onClick={()=>exportDeck('txt')}><Download size={14}/> TXT</button>
     <button onClick={()=>exportDeck('json')}><Save size={14}/> JSON</button>
     <button className="tcgb-load" disabled={!active||!active.entries.length} onClick={()=>{
      if(active&&window.confirm('Load this deck on the table? The current local game will be replaced.'))onLoadOnTable(active);
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
     <label>Hold to pick up a stack <strong>{stackHoldMs} ms</strong>
      <input type="range" min="250" max="5000" step="250" value={stackHoldMs}
       onChange={e=>onStackHoldMs(Number(e.target.value))}/></label>
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
