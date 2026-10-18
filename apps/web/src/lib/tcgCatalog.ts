/** Provider adapters for the seven catalogues. Never put provider secrets in the browser.
 * First paint can use a cached normalized catalogue; a refresh replaces it
 * atomically. Bulk endpoints are preferred over high-frequency API paging.
 */
export const TCGS=[
  {id:'lorcana',name:'Disney Lorcana',provider:'Lorcast',url:'https://lorcast.com/docs/api',sections:['Main','Sideboard','Maybeboard'],formats:['Core','Infinity','Custom'],maxCopies:4},
  {id:'gundam',name:'Gundam',provider:'GCG API',url:'https://api.gcgapi.com/docs',sections:['Main','Resource','Sideboard','Maybeboard'],formats:['Constructed','Custom'],maxCopies:4},
  {id:'mtg',name:'Magic: The Gathering',provider:'Scryfall',url:'https://scryfall.com/docs/api',sections:['Main','Sideboard','Commander','Companion','Maybeboard'],formats:['Standard','Pioneer','Modern','Legacy','Vintage','Pauper','Commander','Brawl','Limited','Custom'],maxCopies:4},
  {id:'onepiece',name:'One Piece',provider:'OPTCG API',url:'https://www.optcgapi.com/documentation',sections:['Main','Leader','DON!!','Sideboard','Maybeboard'],formats:['Constructed','Custom'],maxCopies:4},
  {id:'pokemon',name:'Pokémon',provider:'TCGdex',url:'https://tcgdex.dev/',sections:['Main','Sideboard','Maybeboard'],formats:['Standard','Expanded','Unlimited','Custom'],maxCopies:4},
  {id:'riftbound',name:'Riftbound',provider:'Riot Games',url:'https://developer.riotgames.com/docs/riftbound',sections:['Main','Champion','Legend','Rune','Sideboard','Maybeboard'],formats:['Constructed','Custom'],maxCopies:3},
  {id:'yugioh',name:'Yu-Gi-Oh!',provider:'YGOPRODeck',url:'https://ygoprodeck.com/api-guide/',sections:['Main','Extra','Sideboard','Maybeboard'],formats:['TCG','OCG','Master Duel','Speed Duel','Rush Duel','Custom'],maxCopies:3}
] as const;
export type TcgId=(typeof TCGS)[number]['id'];
export type DeckSection=string;
export type CatalogCard={
  id:string;name:string;game:TcgId;number:string;set:string;rarity:string;
  type:string;types:string[];colors:string[];cost:string;text:string;image:string;
  price:number|null;legalities:Record<string,string>;attributes:Record<string,string>;
};
export type CatalogUpdate={loaded:number;label:string;partial?:CatalogCard[]};
const small=(v:unknown)=>String(v??'').slice(0,500);
const s=(v:unknown)=>v===null||v===undefined?'':small(v);
const n=(v:unknown):number|null=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const arr=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
const rec=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const words=(v:unknown):string[]=>Array.isArray(v)?v.map(x=>s(x)).filter(Boolean):s(v)?[s(v)]:[];
const img=(v:unknown)=>typeof v==='string'&&/^https:\/\//i.test(v)?v:'';
const key=(game:TcgId,id:unknown)=>game+':'+s(id);
const card=(game:TcgId,id:unknown,name:unknown,opts:Partial<CatalogCard>={}):CatalogCard=>({
 id:key(game,id),game,name:s(name)||'Unnamed card',number:'',set:'',rarity:'',type:'',types:[],colors:[],
 cost:'',text:'',image:'',price:null,legalities:{},attributes:{},...opts
});
export function normalizeTcgCard(game:TcgId,value:unknown):CatalogCard|null{
 const x=rec(value);if(!x||!Object.keys(x).length)return null;
 const imageUris=rec(x.image_uris),digital=rec(imageUris.digital),set=rec(x.set);
 if(game==='lorcana')return card(game,x.id,x.name,{
  number:s(x.collector_number),set:s(set.name||set.code),rarity:s(x.rarity),
  type:words(x.type).join(' / '),types:words(x.type),
  colors:words(x.ink),cost:s(x.cost),text:s(x.text),
  image:img(digital.small||digital.normal),price:n(rec(x.prices).usd),
  legalities:Object.fromEntries(Object.entries(rec(x.legalities)).map(([k,v])=>[k,s(v)])),
  attributes:{Inkable:s(x.inkwell),Strength:s(x.strength),Willpower:s(x.willpower),Lore:s(x.lore)}
 });
 if(game==='gundam')return card(game,x.product_id||x.card_number,x.name,{
  number:s(x.card_number),set:s(x.set_name||x.set_code),rarity:s(x.rarity),
  type:s(x.card_type),types:words(x.card_type),colors:words(x.color),
  cost:s(x.cost),text:s(x.effect),image:img(x.image_url),
  attributes:{AP:s(x.ap_raw??x.ap),HP:s(x.hp_raw??x.hp),Level:s(x.level),Traits:s(x.trait)}
 });
 if(game==='mtg'){
  const faces=arr(x.card_faces);
  const first=faces[0]||{};const facesUris=rec(first.image_uris);
  return card(game,x.id,x.name,{
   number:s(x.collector_number),set:s(x.set_name||x.set),rarity:s(x.rarity),
   type:s(x.type_line||first.type_line),types:s(x.type_line||first.type_line).split(/[\s—]+/).filter(Boolean),
   colors:words(x.color_identity),cost:s(x.cmc??x.mana_cost),
   text:s(x.oracle_text||first.oracle_text),image:img(rec(x.image_uris).small||facesUris.small),
   price:n(rec(x.prices).usd),legalities:Object.fromEntries(
    Object.entries(rec(x.legalities)).map(([k,v])=>[k,s(v)])),
   attributes:{Mana:s(x.mana_cost),Power:s(x.power),Toughness:s(x.toughness),Artist:s(x.artist)}
  });
 }
 if(game==='onepiece')return card(game,
  x.card_image_id||x.card_set_id||x.card_id||x.card_no||x.card_number||x.id,
  x.card_name||x.name,{
  number:s(x.card_set_id||x.card_id||x.card_no||x.card_number),
  set:s(x.set_name||x.set||x.set_id||x.set_id_name),
  rarity:s(x.rarity),type:s(x.card_type||x.type),types:words(x.card_type||x.type),
  colors:words(x.card_color||x.color).flatMap(a=>a.split('/')).map(a=>a.trim()).filter(Boolean),
  cost:s(x.card_cost??x.cost??x.life),
  text:s(x.card_text||x.card_effect||x.effect||x.text),
  image:img(x.card_image||x.image_url||x.card_image_url),
  attributes:{Power:s(x.card_power??x.power),Counter:s(x.counter_amount??x.counter),
   Attribute:s(x.attribute),Life:s(x.life),Traits:s(x.sub_types)}
 });
 if(game==='pokemon'){
  const original=rec(x.set);
  return card(game,x.id,x.name,{
   number:s(x.localId||x.number),set:s(original.name||original.id||s(x.id).replace(/-[^-]+$/,'')),
   rarity:s(x.rarity),type:s(x.category),types:words(x.category),colors:words(x.types),
   cost:s(x.retreat),text:words(x.effect).join('\n')||words(x.abilities).map(a=>s(rec(a).effect)).join('\n'),
   image:img(x.image)?s(x.image)+ '/low.webp':'',
   legalities:Object.fromEntries(Object.entries(rec(x.legal)).map(([k,v])=>[k,s(v)])),
   attributes:{HP:s(x.hp),Stage:s(x.stage),Dex:s(x.dexId)}
  });
 }
 if(game==='riftbound'){
  const art=rec(x.art);const media=arr(x.media);
  return card(game,x.id||x.collectorNumber,x.name,{
   number:s(x.collectorNumber),set:s(x.set),rarity:s(x.rarity),
   type:s(x.type),types:words(x.type),colors:words(x.faction||x.domain),
   cost:s(rec(x.stats).cost??rec(x.stats).energy),
   text:s(x.description),image:img(art.thumbnailURL||art.fullURL||
    media.find(m=>/image|thumbnail|card/i.test(s(m.type)))?.url),
   attributes:{Energy:s(rec(x.stats).energy),Might:s(rec(x.stats).might),
     Tags:words(x.tags).join(', '),Keywords:words(x.keywords).join(', ')}
  });
 }
 if(game==='yugioh'){
  const ci=rec(arr(x.card_images)[0]);const prices=rec(arr(x.card_prices)[0]);
  const banned=rec(x.banlist_info);
  return card(game,x.id,x.name,{
   number:s(x.id),set:s(arr(x.card_sets)[0]?.set_name),rarity:s(arr(x.card_sets)[0]?.set_rarity),
   type:s(x.type),types:words(x.type),colors:words(x.attribute),
   cost:s(x.level??x.linkval),text:s(x.desc),image:img(ci.image_url_small||ci.image_url),
   price:n(prices.tcgplayer_price),attributes:{
     ATK:s(x.atk),DEF:s(x.def),Race:s(x.race),Attribute:s(x.attribute),
     Archetype:s(x.archetype),TCG:s(banned.ban_tcg),OCG:s(banned.ban_ocg),
     'Master Duel':s(banned.ban_goat)
   }
  });
 }
 return null;
}
function unique(cards:CatalogCard[]){const seen=new Set<string>();return cards.filter(x=>{
 if(!x.id||seen.has(x.id))return false;seen.add(x.id);return true;
});}
const cacheMemory=new Map<TcgId,CatalogCard[]>();
const CACHE_AGE=24*60*60*1000;
const DB='sennet-tcg-catalog-v1';
let dbPromise:Promise<IDBDatabase|null>|null=null;
function database():Promise<IDBDatabase|null>{
 if(typeof indexedDB==='undefined')return Promise.resolve(null);
 if(!dbPromise)dbPromise=new Promise(resolve=>{
  try{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{req.result.createObjectStore('catalogs');};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);
  }catch{resolve(null);}
 });
 return dbPromise;
}
async function readCache(game:TcgId):Promise<{time:number;cards:CatalogCard[]}|null>{
 const db=await database();if(!db)return null;
 return new Promise(resolve=>{try{const tx=db.transaction('catalogs','readonly');
  const req=tx.objectStore('catalogs').get(game);
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);}
  catch{resolve(null);}
 });
}
async function writeCache(game:TcgId,cards:CatalogCard[]){
 const db=await database();if(!db)return;
 try{const tx=db.transaction('catalogs','readwrite');
   tx.objectStore('catalogs').put({time:Date.now(),cards},game);
 }catch{/* Quota and private browsing must never block the builder. */}
}
const wait=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
 if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
 const timer=window.setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 function abort(){window.clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));}
 signal.addEventListener('abort',abort,{once:true});
});
async function json(url:string,signal:AbortSignal){
 const response=await fetch(url,{signal,headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('Provider HTTP '+response.status+' ('+new URL(url).hostname+')');
 return response.json();
}
const toCards=(game:TcgId,items:unknown)=>unique(arr(items).map(x=>normalizeTcgCard(game,x)).filter(
 (x):x is CatalogCard=>x!==null));
async function fetchCatalog(game:TcgId,onUpdate:(v:CatalogUpdate)=>void,signal:AbortSignal){
 const publish=(label:string,cards:CatalogCard[],partial=false)=>onUpdate({
  loaded:cards.length,label,...(partial?{partial:cards}:{}),
 });
 if(game==='lorcana'){
  const sets=arr(rec(await json('https://api.lorcast.com/v0/sets',signal)).results);
  if(!sets.length)throw Error('Lorcast did not return any sets.');
  const all:CatalogCard[]=[];
  // Lorcast asks for 50-100 ms between requests. Use one paced request
  // at a time; concurrency here would defeat that provider-wide limit.
  for(const [index,set] of sets.entries()){
   if(signal.aborted)throw new DOMException('Cancelled','AbortError');
   await wait(110,signal);
   const result=await json('https://api.lorcast.com/v0/sets/'+encodeURIComponent(s(set.code||set.id))+'/cards',signal);
   all.push(...toCards(game,Array.isArray(result)?result:rec(result).results));
   if(index%2===0||index===sets.length-1)publish('Loaded set '+(index+1)+' / '+sets.length,all,true);
  }
  return unique(all);
 }
 if(game==='gundam'){
  // The unmetered official bulk endpoint is the fastest full catalogue;
  // NDJSON avoids dozens of requests against the 60/min keyless limit.
  try{
   const response=await fetch('https://api.gcgapi.com/v1/bulk',{signal});
   if(!response.ok)throw Error('Bulk HTTP '+response.status);
   const raw=await response.text();
   const cards=toCards(game,raw.split('\n').filter(Boolean).map(line=>JSON.parse(line)));
   if(!cards.length)throw Error('Empty bulk data');
   publish('Full bulk catalogue',cards,true);return cards;
  }catch(error){
   if(signal.aborted)throw error;
   const all:CatalogCard[]=[];
   const first=rec(await json('https://api.gcgapi.com/v1/cards?limit=250&offset=0',signal));
   all.push(...toCards(game,first.data));
   const total=Math.max(all.length,n(rec(first._meta).total)||all.length);
   publish('Loaded '+all.length+' / '+total,all,true);
   for(let offset=250;offset<total;offset+=250){
    await wait(1100,signal); // Anonymous tier ~60 requests/minute
    const page=rec(await json('https://api.gcgapi.com/v1/cards?limit=250&offset='+offset,signal));
    all.push(...toCards(game,page.data));
    publish('Loaded '+Math.min(offset+250,total)+' / '+total,all,true);
   }
   return unique(all);
  }
 }
 if(game==='mtg'){
  const meta=rec(await json('https://api.scryfall.com/bulk-data/default-cards',signal));
  if(!img(meta.download_uri))throw Error('Scryfall has no bulk download URL');
  publish('Downloading all default-language printings',[]);
  const bulk=await json(s(meta.download_uri),signal);
  const cards=toCards(game,bulk);
  publish('Full default-language printing catalogue',cards,true);return cards;
 }
 if(game==='onepiece'){
  // Four provider-defined public bulk endpoints include booster sets,
  // starter decks, promos and DON!! cards. Two workers are sufficient.
  const paths=['allSetCards','allSTCards','allPromoCards','allDonCards'];
  const all:CatalogCard[]=[];
  let next=0;
  async function worker(){
   while(next<paths.length){
    const index=next++,result=await json('https://optcgapi.com/api/'+paths[index]+'/',signal);
    const items=Array.isArray(result)?result:(rec(result).data||rec(result).cards||rec(result).results);
    all.push(...toCards(game,items));
    publish('Loaded '+(index+1)+' / '+paths.length+' card categories',all,true);
   }
  }
  await Promise.all([worker(),worker()]);
  return unique(all);
 }
 if(game==='pokemon'){
  // TCGdex lists ALL cards in one response; brief records can be expanded
  // on demand without blocking the initial complete card index.
  const all=toCards(game,await json('https://api.tcgdex.net/v2/en/cards',signal));
  publish('Full card index',all,true);return all;
 }
 if(game==='yugioh'){
  const all=toCards(game,rec(await json('https://db.ygoprodeck.com/api/v7/cardinfo.php',signal)).data);
  publish('Full card catalogue',all,true);return all;
 }
 // Riot requires app-specific approval and server-held credentials.
 // This URL must be a trusted configured server endpoint, NOT a client key.
 const server=import.meta.env.VITE_SENNET_RIFTBOUND_CATALOG_URL;
 if(!server)throw new Error('Riftbound requires Riot approval and a secure server catalogue endpoint. Configure VITE_SENNET_RIFTBOUND_CATALOG_URL after approval; no API key belongs in a web page.');
 const address=new URL(server,window.location.origin);
 if(address.protocol!=='https:'&&address.hostname!=='localhost')throw Error('Secure HTTPS Riftbound endpoint required');
 const result=rec(await json(address.href,signal));
 const sets=arr(result.sets);
 const cards=sets.length?toCards(game,sets.flatMap(set=>arr(set.cards).map(c=>({...c,set:c.set||set.name||set.id})))):
  toCards(game,result.cards||result.data);
 if(!cards.length)throw Error('Riot endpoint returned no usable cards');
 publish('Authorized Riot catalogue',cards,true);return cards;
}
export async function loadTcgCatalog(
 game:TcgId,signal:AbortSignal,onUpdate:(update:CatalogUpdate)=>void,force=false
):Promise<CatalogCard[]>{
 const cached=cacheMemory.get(game)||null;
 if(cached&&!force){onUpdate({loaded:cached.length,label:'Loaded from memory',partial:cached});return cached;}
 const disk=await readCache(game);
 if(signal.aborted)throw new DOMException('Cancelled','AbortError');
 if(disk?.cards?.length&&!force){
  cacheMemory.set(game,disk.cards);
  onUpdate({loaded:disk.cards.length,label:'Cached catalogue',partial:disk.cards});
  if(Date.now()-disk.time<CACHE_AGE)return disk.cards;
 }
 try{
  const cards=await fetchCatalog(game,onUpdate,signal);
  if(!cards.length)throw Error('No cards received from provider');
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  cacheMemory.set(game,cards);
  void writeCache(game,cards);
  return cards;
 }catch(error){
  if(!signal.aborted&&disk?.cards?.length){
   onUpdate({loaded:disk.cards.length,label:'Offline/stale catalogue — refresh failed',partial:disk.cards});
   return disk.cards;
  }
  throw error;
 }
}
export async function detailCard(game:TcgId,id:string,signal:AbortSignal){
 if(game!=='pokemon')return null;
 const data=await json('https://api.tcgdex.net/v2/en/cards/'+encodeURIComponent(id.split(':').slice(1).join(':')),signal);
 return normalizeTcgCard(game,data);
}
export function configFor(game:TcgId){return TCGS.find(t=>t.id===game)!;}
