import {useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import {legacy} from '../lib/tcgLegacy';

type Card=typeof legacy.cards[number];
type Props={onBattle:()=>void;onTools:()=>void;onSettings:()=>void;onCard:(card:Card)=>void;onToken:(name:string,color:string)=>void};
function read<T,>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem('sennet.tcg.'+key)||'null')??fallback;}catch{return fallback;}}
export default function TcgApp({onBattle,onTools,onSettings,onCard,onToken}:Props){
  const [game,setGame]=useState(()=>read('game','All TCGs'));
  const [dark,setDark]=useState(()=>read('dark',true));
  const [collapsed,setCollapsed]=useState<string[]>(()=>read('collapsed',[]));
  const [page,setPage]=useState('Home');
  const [query,setQuery]=useState('');
  const [recent,setRecent]=useState<string[]>(()=>read('recent',[]));
  const [collection,setCollection]=useState<string[]>(()=>read('collection',[]));
  const [detail,setDetail]=useState<Card|null>(null);
  const [filters,setFilters]=useState(false);
  const [type,setType]=useState('All');
  useEffect(()=>{try{for(const [key,value] of Object.entries({game,dark,collapsed,recent,collection}))localStorage.setItem('sennet.tcg.'+key,JSON.stringify(value));}catch{/* Browser storage can be disabled. */}},[game,dark,collapsed,recent,collection]);
  const cards=legacy.cards.filter(c=>(game==='All TCGs'||c.game===game)&&(type==='All'||c.type===type)&&c.name.toLowerCase().includes(query.toLowerCase()));
  const group=game==='Magic: The Gathering'?0:game==='Pokémon TCG'?1:game==='Yu-Gi-Oh!'?2:3;
  const changes=legacy.changes.slice(group===0?0:group===1?4:group===2?7:10,group===0?4:group===1?7:group===2?10:13);
  function open(card:Card){setDetail(card);setRecent(old=>[card.name,...old.filter(n=>n!==card.name)].slice(0,12));}
  function section(title:string,children:ReactNode){const closed=collapsed.includes(title);return <section className="tcg-section"><button className="tcg-section-title" aria-expanded={!closed} onClick={()=>setCollapsed(a=>closed?a.filter(t=>t!==title):[...a,title])}>{title}<span>{closed?'+':'−'}</span></button>{!closed&&<div className="tcg-section-body">{children}</div>}</section>;}
  function gallery(items:readonly Card[]){return <div className="tcg-cards">{items.map(c=><button key={c.name} onClick={()=>open(c)}><img src={c.image} alt={c.name} loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/><span>{c.name}</span></button>)}</div>;}
  return <div className={'tcg-app '+(dark?'tcg-dark':'tcg-light')} style={{'--tcg-accent':legacy.games.find(g=>g.name===game)?.color||'#333333'} as CSSProperties}>
    <header className="tcg-header"><button aria-label="Toggle TCG light mode" onClick={()=>setDark(v=>!v)}>{dark?'☾':'☀'}</button><label><span className="sr-only">Trading card game</span><select aria-label="Trading card game" value={game} onChange={e=>{setGame(e.target.value);setType('All');}}><option>All TCGs</option>{legacy.games.map(g=><option key={g.name} value={g.name}>{g.name} · {g.year}</option>)}</select></label></header>
    <div className="tcg-body">
      {page==='Home'&&<>
        {section('Latest Changes',<><small>Archived app preview · 7 April 2026</small>{changes.map(c=><p key={c.text}><b>{c.tag}</b> {c.text}</p>)}</>)}
        {section('Recently Viewed',recent.length?gallery(legacy.cards.filter(c=>recent.includes(c.name)).sort((a,b)=>recent.indexOf(a.name)-recent.indexOf(b.name))):<div className="tcg-cards">{['https://cards.scryfall.io/normal/front/d/e/deeb1f3f-1606-404d-9047-ad7f9d5b7442.jpg?1562854731','https://cards.scryfall.io/normal/front/9/a/9a74a71c-4f51-4dfe-8656-66daa5f96ef2.jpg?1623593247','https://cards.scryfall.io/normal/front/a/c/acbc170d-01ab-4674-903b-c499642a46bc.jpg?1608911281'].map((url,i)=><img className="tcg-preview-card" key={url} src={url} alt={'Archived recently viewed card '+(i+1)} loading="lazy"/>)}</div>)}
        <div className="tcg-shortcuts"><button onClick={()=>setPage('Trading')}>⇄<span>Trading</span></button><button onClick={()=>setPage('Rule Book')}>▤<span>Rule Book</span></button><button disabled={!cards.length} onClick={()=>open(cards[Math.floor(Math.random()*cards.length)])}>⤨<span>Random Card</span></button></div>
        <button className="tcg-filter" onClick={()=>setFilters(v=>!v)} aria-expanded={filters}>Random Card Filters</button>{filters&&<label>Card type<select value={type} onChange={e=>setType(e.target.value)}>{['All','Monster','Pokemon','Artifact'].map(t=><option key={t}>{t}</option>)}</select><small>The archive contains six sample cards; format and rarity data were not implemented.</small></label>}
        {section('News',<><small>Historical demo articles from the original app</small>{legacy.news.slice(group*2,group*2+2).map(n=><article className="tcg-news" key={n.title}><img src={n.image} alt="" loading="lazy"/><div><strong>{n.title}</strong><p>{n.author}</p><small>Archived preview</small></div></article>)}</>)}
      </>}
      {page==='Search'&&<><h2>Search cards</h2><input aria-label="Search sample cards" placeholder="Search the archived sample cards…" value={query} onChange={e=>setQuery(e.target.value)}/><p>Six sample cards imported from your Android app.</p>{gallery(cards)}{!cards.length&&<p>No sample cards match this game or search.</p>}</>}
      {page==='Collection'&&<><h2>Collection</h2><p>Cards you save here stay in this browser.</p>{gallery(legacy.cards.filter(c=>collection.includes(c.name)&&(game==='All TCGs'||c.game===game)))}{!collection.length&&<p>Open a card in Search and choose Save to collection.</p>}</>}
      {page==='Decks'&&<><h2>Decks</h2><p>Use Sennet’s existing deck builder and game library.</p><button onClick={onTools}>Open deck builder and table tools</button></>}
      {page==='Trading'&&<><h2>Trading</h2><p>This tile was a placeholder in the Android app. Your collection is available here for planning trades.</p><button onClick={()=>setPage('Collection')}>View collection</button></>}
      {page==='Rule Book'&&<><h2>Rule Book</h2><p>The Android app did not include rules content. Sennet’s guide explains the table controls.</p><button onClick={onSettings}>Open Sennet settings and controls</button></>}
      {page==='Tokens'&&<><h2>Tokens</h2><p>Place a token on your current mat. These actions use Sennet’s move history.</p>{['Basic','Positive','Negative'].map((kind,k)=><section key={kind}><h3>{kind}</h3><div className="tcg-token-grid">{(k===0?['#FF3B30','#FF9500','#FFCC00','#4CD964','#007AFF','#5856D6','#FF2D55','#8E8E93']:k===1?['#A57C00','#FF006E','#5856D6','#007AFF','#FF3B30','#4CD964']:['#FF9500','#00FF87','#5856D6','#00F5FF','#FF006E','#8E8E93']).map((color,i)=><button key={color} aria-label={kind+' token '+(i+1)} style={{background:k===1?'white':k===2?'#0a0a0a':color,color,borderColor:color}} onClick={()=>onToken(kind+' '+(k===0?'■':k===1?['★','ϟ','↑','◆','♥','●'][i]:['△','⬡','Ⅱ','○','◇','⌛'][i]),color)}>{k===0?'■':k===1?['★','ϟ','↑','◆','♥','●'][i]:['△','⬡','Ⅱ','○','◇','⌛'][i]}</button>)}</div></section>)}<button onClick={onTools}>Cards, hand, deck and history controls</button><button onClick={onSettings}>Settings</button></>}
    </div>
    <nav className="tcg-nav" aria-label="TCG app">{['Home','Search','Collection','Decks','Battleground','Tokens'].map(p=><button key={p} aria-current={page===p?'page':undefined} onClick={()=>p==='Battleground'?onBattle():setPage(p)}>{p}</button>)}</nav>
    {detail&&<div className="tcg-detail" role="dialog" aria-modal="true" aria-label={detail.name}><button autoFocus aria-label="Close card" onClick={()=>setDetail(null)}>×</button><img src={detail.image} alt={detail.name}/><h3>{detail.name}</h3><p>{detail.game} · {detail.type}</p><button onClick={()=>setCollection(a=>a.includes(detail.name)?a.filter(n=>n!==detail.name):[...a,detail.name])}>{collection.includes(detail.name)?'Remove from collection':'Save to collection'}</button><button onClick={()=>{onCard(detail);setDetail(null);}}>Place on current table</button></div>}
  </div>;
}

