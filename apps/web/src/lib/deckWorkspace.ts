import {configFor,type CatalogCard,type TcgId} from './tcgCatalog';
export interface DeckEntry{card:CatalogCard;section:string;quantity:number;owned:number;notes:string;tags:string[]}
export interface SavedDeck{id:string;game:TcgId;name:string;format:string;description:string;updated:number;entries:DeckEntry[]}
const STORAGE='sennet.deck-workspace.v1';
export const newDeck=(game:TcgId):SavedDeck=>({
 id:'deck-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
 game,name:'Untitled deck',format:configFor(game).formats[0],
 description:'',updated:Date.now(),entries:[]
});
export function deckQuantity(deck:SavedDeck,section?:string){
 return deck.entries.filter(x=>!section||x.section===section).reduce((total,e)=>total+e.quantity,0);
}
export function changeDeckEntry(deck:SavedDeck,card:CatalogCard,section:string,delta:number):SavedDeck{
 if(card.game!==deck.game||!Number.isFinite(delta)||!delta)return deck;
 const found=deck.entries.find(e=>e.card.id===card.id&&e.section===section);
 const quantity=Math.max(0,Math.min(99,(found?.quantity??0)+delta));
 const entries=deck.entries.filter(e=>!(e.card.id===card.id&&e.section===section));
 if(quantity)entries.push({...found,card,section,quantity,owned:found?.owned??0,
  notes:found?.notes??'',tags:found?.tags??[]});
 return {...deck,entries,updated:Date.now()};
}
export function patchDeckEntry(deck:SavedDeck,section:string,id:string,update:Partial<DeckEntry>){
 return {...deck,updated:Date.now(),entries:deck.entries.map(e=>e.section===section&&e.card.id===id
  ?{...e,...update,quantity:Math.max(1,Math.min(99,Math.round(update.quantity??e.quantity))),
    owned:Math.max(0,Math.min(999,Math.round(update.owned??e.owned)))}:e)};
}
export type DeckCheck={severity:'notice'|'warning';message:string};
export function deckChecks(deck:SavedDeck):DeckCheck[]{
 const a:DeckCheck[]=[];
 const qty=(section:string)=>deckQuantity(deck,section);
 const main=qty('Main');const name=deck.game;
 const advisory=(pass:boolean,message:string)=>{if(!pass)a.push({severity:'warning',message});};
 if(name==='pokemon'||name==='lorcana')advisory(main===60,'Typical constructed decks have 60 Main cards.');
 if(name==='onepiece'){
  advisory(main===50,'Typical constructed decks have 50 Main cards.');
  advisory(qty('Leader')===1,'Select one Leader.');
  advisory(qty('DON!!')===10,'A DON!! deck normally has 10 cards.');
 }
 if(name==='gundam')advisory(main===50,'Typical constructed decks have 50 Main cards.');
 if(name==='yugioh'){
  advisory(main>=40&&main<=60,'Main Deck normally has 40–60 cards.');
  advisory(qty('Extra')<=15,'Extra Deck has up to 15 cards.');
  advisory(qty('Sideboard')<=15,'Side Deck has up to 15 cards.');
 }
 if(name==='mtg'){
  if(deck.format==='Commander')advisory(main+qty('Commander')===100&&qty('Commander')>=1,
    'Commander decks generally contain 100 cards including commanders.');
  else if(deck.format==='Limited')advisory(main>=40,'Limited decks usually have at least 40 cards.');
  else if(deck.format==='Standard'||deck.format==='Pioneer'||deck.format==='Modern')
   advisory(main>=60,'This constructed format usually requires at least 60 cards.');
  if(deck.format==='Standard'||deck.format==='Pioneer'||deck.format==='Modern')
   advisory(qty('Sideboard')<=15,'Sideboards typically have up to 15 cards.');
 }
 if(name==='riftbound')a.push({severity:'notice',message:
   'Riftbound restrictions and official legality require a Riot-approved catalogue and rules. This builder does not certify legal decks.'});
 const limit=configFor(deck.game).maxCopies;
 const totals=new Map<string,number>();
 for(const e of deck.entries){
  if(e.section==='Maybeboard')continue;
  const normalized=e.card.name.toLowerCase().trim();
  totals.set(normalized,(totals.get(normalized)||0)+e.quantity);
 }
 for(const [cardName,count] of totals){
  if(count>limit&&!(name==='mtg'&&/basic (land|plains|island|swamp|mountain|forest)/i.test(cardName))){
   a.push({severity:'notice',message:cardName+' ×'+count+' exceeds the typical '+limit+
     '-copy guideline; verify card-specific exceptions and your format.'});
  }
 }
 for(const e of deck.entries){
  if(e.owned<e.quantity&&e.owned>0)a.push({severity:'notice',message:
    e.card.name+': '+(e.quantity-e.owned)+' more copy/copies needed.'});
  const status=e.card.legalities[deck.format.toLowerCase()]||'';
  if(status&&status!=='legal')a.push({severity:'warning',message:e.card.name+' is '+status+
    ' in '+deck.format+' (provider data; check latest official rules).'});
  if(name==='yugioh'&&deck.format==='TCG'&&e.card.attributes.TCG){
   a.push({severity:'notice',message:e.card.name+' banlist: '+e.card.attributes.TCG+
     ' — verify currently applicable tournament rules.'});
  }
 }
 return a.slice(0,24);
}
export function readDecks():SavedDeck[]{
 try{
  const raw=JSON.parse(localStorage.getItem(STORAGE)||'[]');
  if(!Array.isArray(raw))return [];
  return raw.filter(d=>d&&typeof d.id==='string'&&Array.isArray(d.entries)&&
   configFor(d.game as TcgId)).slice(0,100).map(d=>({
    ...d,entries:d.entries.filter((e:DeckEntry)=>e?.card?.id&&e.quantity>0).slice(0,1000)
   }));
 }catch{return [];}
}
export function saveDecks(decks:SavedDeck[]){
 try{localStorage.setItem(STORAGE,JSON.stringify(decks.slice(0,100)));}
 catch{/* If local storage is full, browser session remains usable. */}
}
export function parseTextDeck(text:string,lookup:CatalogCard[],section='Main'){
 const normalized=new Map<string,CatalogCard>();
 for(const card of lookup){
  const name=card.name.toLowerCase();
  if(!normalized.has(name))normalized.set(name,card);
 }
 const lines=text.split(/\r?\n/);const matches:{card:CatalogCard;quantity:number;section:string}[]=[];
 const missing:string[]=[];
 let target=section;
 for(const line of lines){
  const trimmed=line.trim();if(!trimmed)continue;
  const header=trimmed.match(/^\[(.+)\]$/);
  if(header){target=header[1];continue;}
  const match=trimmed.match(/^(?:(\d+)\s*[x×]?\s+)?(.+?)(?:\s+[x×](\d+))?$/i);
  if(!match)continue;
  const quantity=Math.max(1,Math.min(99,Number(match[1]||match[3]||1)));
  const name=match[2].trim();
  const card=normalized.get(name.toLowerCase());
  if(card)matches.push({card,quantity,section:target});else missing.push(trimmed);
 }
 return {matches,missing};
}
export function toTextDeck(deck:SavedDeck){
 return configFor(deck.game).sections.map(section=>{
  const entries=deck.entries.filter(e=>e.section===section);
  return entries.length?'['+section+']\n'+entries.sort((a,b)=>a.card.name.localeCompare(b.card.name))
   .map(e=>e.quantity+' '+e.card.name).join('\n'):'';
 }).filter(Boolean).join('\n\n');
}
export function deckStats(deck:SavedDeck){
 const entries=deck.entries.filter(e=>e.section!=='Maybeboard');
 const total=entries.reduce((sum,e)=>sum+e.quantity,0);
 const unique=new Set(entries.map(e=>e.card.id)).size;
 const costBuckets=Array.from({length:8},(_,i)=>({
  label:i===7?'7+':String(i),
  value:entries.filter(e=>Number(e.card.cost)>=i&&(i===7||Number(e.card.cost)<i+1)
    &&e.card.cost!=='').reduce((sum,e)=>sum+e.quantity,0)
 }));
 const colorCount=new Map<string,number>();
 const typeCount=new Map<string,number>();
 for(const e of entries){
  for(const color of e.card.colors)colorCount.set(color,(colorCount.get(color)||0)+e.quantity);
  for(const type of e.card.types.slice(0,1))typeCount.set(type,(typeCount.get(type)||0)+e.quantity);
 }
 return {total,unique,costBuckets,colors:[...colorCount].sort((a,b)=>b[1]-a[1]),
  types:[...typeCount].sort((a,b)=>b[1]-a[1]),price:entries.reduce((total,e)=>
    total+(e.card.price??0)*e.quantity,0),
  unknownPrices:entries.some(e=>e.card.price===null)};
}
