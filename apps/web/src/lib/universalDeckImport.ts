
import {TCGS,configFor,normalizeTcgCard,type CatalogCard,type TcgId} from './tcgCatalog';
export type ImportRow={name:string;quantity:number;section:string;raw:string;setCode?:string;number?:string;cardId?:string};
export type ImportData={rows:ImportRow[];name:string;format:string;hint:TcgId|null;ignored:string[];source:string};
export type ImportMatch={matched:{row:ImportRow;card:CatalogCard;section:string}[];missing:ImportRow[]};
export type Detection={game:TcgId|null;confidence:'certain'|'strong'|'uncertain';reason:string};
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const val=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
const quantity=(v:unknown)=>Math.max(1,Math.min(99,Number.parseInt(val(v),10)||1));
export const normalizeCardName=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[‘’ʼ]/g,"'").replace(/[–—−]/g,'-').replace(/&/g,'and')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const gameHint=(v:unknown):TcgId|null=>{
 const n=normalizeCardName(val(v));
 const known:Record<string,TcgId>={
  lorcana:'lorcana','disney lorcana':'lorcana',
  mtg:'mtg','magic the gathering':'mtg',magic:'mtg',
  onepiece:'onepiece','one piece':'onepiece',
  pokemon:'pokemon','pokemon tcg':'pokemon',
  yugioh:'yugioh','yu gi oh':'yugioh',ygo:'yugioh',
  gundam:'gundam',gcg:'gundam','gundam card game':'gundam',
  riftbound:'riftbound'
 };
 return known[n]||null;
};
const section=(v:string)=>{
 const key=normalizeCardName(v.replace(/\(\d+\)/g,'').replace(/:\s*\d+$/,''));
 if(/^(main|mainboard|main deck|deck|decklist|cards|pokemon|trainer|trainers|energy|characters|actions|items|locations|units|pilots)$/.test(key))return 'Main';
 if(/^(side|sideboard|side deck|sb)$/.test(key))return 'Sideboard';
 if(/^(extra|extra deck|fusion|synchro|xyz|link monsters)$/.test(key))return 'Extra';
 if(/^(commander|commanders|command zone|general)$/.test(key))return 'Commander';
 if(key==='companion')return 'Companion';
 if(/^(leader|leaders)$/.test(key))return 'Leader';
 if(/^(don|don deck|don cards)$/.test(key))return 'DON!!';
 if(/^(resource|resources)$/.test(key))return 'Resource';
 if(/^(rune|runes)$/.test(key))return 'Rune';
 if(/^(legend|legends)$/.test(key))return 'Legend';
 if(/^(champion|champions)$/.test(key))return 'Champion';
 if(/^(maybe|maybeboard|considering|wishlist|not in deck)$/.test(key))return 'Maybeboard';
 return null;
};
function cardFields(source:string){
 let name=source.trim().replace(/\s*\*(?:F|foil)\*$/i,'');
 let setCode:string|undefined,number:string|undefined;
 let m=name.match(/^(.*?)\s+\(([a-z0-9_]{2,10})\)\s+([\da-z]+)$/i);
 if(m){name=m[1];setCode=m[2];number=m[3];}
 else if((m=name.match(/^\[([A-Z0-9_-]{2,12})\]\s+(.+)$/i))){setCode=m[1];name=m[2];}
 else if((m=name.match(/^(.*?)\s+\[([A-Z0-9_]{2,10})\]\s*(\d+)?$/i))){
  name=m[1];setCode=m[2];number=m[3];
 }else if((m=name.match(/^(.*?)\s+([A-Z][A-Z0-9]{1,6})\s+(\d{1,4}[a-z]?)$/))){
  name=m[1];setCode=m[2];number=m[3];
 }
 return {name:name.trim(),...(setCode?{setCode}:{}),...(number?{number}:{})};
}
function parsePlain(text:string,source:string):ImportData{
 const rows:ImportRow[]=[],ignored:string[]=[];
 let into='Main',hint:TcgId|null=null,title='',format='',ydk=false;
 for(const input of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')){
  const raw=input.trim();if(!raw)continue;
  if(/^#main$|^#extra$|^!side$/i.test(raw)){
   into=/extra/i.test(raw)?'Extra':/side/i.test(raw)?'Sideboard':'Main';
   ydk=true;hint='yugioh';continue;
  }
  const header=raw.match(/^\[(.+)\]$|^\/\/\s*(main|sideboard|commander|extra|maybeboard)\s*$|^#{1,3}\s*([a-z !&/]+)\s*$|^([a-z !&/]+?)(?:\s*(?:\(\d+\)|:\s*\d+))?\s*:?\s*$/i);
  const label=header?.[1]||header?.[2]||header?.[3]||header?.[4]||'';
  const zone=section(label);
  if(zone){into=zone;continue;}
  const meta=raw.match(/^(game|tcg|deck\s*name|title|format)\s*[:=]\s*(.+)$/i);
  if(meta){const field=normalizeCardName(meta[1]);
   if(field==='game'||field==='tcg')hint=gameHint(meta[2])||hint;
   else if(field==='format')format=meta[2];else title=meta[2];
   continue;
  }
  if(/^https?:\/\/\S+$/.test(raw)){ignored.push('A deck URL needs a text/CSV export: '+raw);continue;}
  if(/^#|^\/\//.test(raw))continue;
  let line=raw.replace(/^[-•*]\s+/,'').trim(),place=into;
  if(/^SB:\s*/i.test(line)){place='Sideboard';line=line.replace(/^SB:\s*/i,'');}
  if(/^\d{5,12}$/.test(line)&&ydk){
   rows.push({name:line,cardId:line,quantity:1,section:place,raw});continue;
  }
  if(/^\|.*\|$/.test(line)){
   const cells=line.split('|').slice(1,-1).map(v=>v.trim());
   if(cells.some(v=>/^:?-{2,}:?$/.test(v)))continue;
   const count=cells.findIndex(v=>/^\d{1,3}$/.test(v));
   const name=cells.find((v,i)=>i!==count&&/[a-z]/i.test(v));
   if(count!==-1&&name){
    rows.push({...cardFields(name),quantity:quantity(cells[count]),section:place,raw});continue;
   }
  }
  let amount=1,m=line.match(/^(\d{1,3})\s*[x×]?\s+(.+)$/i);
  if(m){amount=quantity(m[1]);line=m[2];}
  else if((m=line.match(/^[x×]\s*(\d{1,3})\s+(.+)$/i))){amount=quantity(m[1]);line=m[2];}
  else if((m=line.match(/^(.+?)\s+[x×]\s*(\d{1,3})$/i))){amount=quantity(m[2]);line=m[1];}
  else if((m=line.match(/^(.+?)\s*[|:;]\s*(\d{1,3})$/))){amount=quantity(m[2]);line=m[1];}
  line=line.replace(/\s+\/\/.*$/,'').trim();
  const fields=cardFields(line.replace(/\s+#[\w-]+(?:\s+#[\w-]+)*$/,''));
  if(!fields.name||!/[a-z0-9]/i.test(fields.name)){ignored.push(raw);continue;}
  rows.push({...fields,quantity:amount,section:place,raw});
 }
 return {rows,name:title,format,hint,ignored,source};
}
function csvRows(text:string):string[][]{
 const out:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(ch===','||ch==='\t')){row.push(cell);cell='';}
  else if(!quoted&&(ch==='\n'||ch==='\r')){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(cell);if(row.some(v=>v.trim()))out.push(row);row=[];cell='';
  }else cell+=ch;
 }
 row.push(cell);if(row.some(v=>v.trim()))out.push(row);
 return out;
}
function structured(value:unknown,source:string):ImportData{
 const doc=obj(value),inner=obj(doc.deck);
 const hint=gameHint(doc.game||doc.tcg||inner.game||inner.tcg);
 const rows:ImportRow[]=[],ignored:string[]=[];
 const add=(data:unknown,place:string,key='')=>{
  if(rows.length>=5000)return;
  if(typeof data==='string'){
   for(const row of parsePlain(data,source).rows)rows.push({...row,section:place});
   return;
  }
  const item=obj(data),child=obj(item.card);
  const name=val(item.name||item.cardName||item.card_name||child.name||key);
  const id=val(item.cardId||item.card_id||item.passcode||item.id||child.id);
  if(!name&&!id)return;
  rows.push({...cardFields(name||id),
   quantity:quantity(item.quantity??item.qty??item.count??item.amount??1),
   section:section(val(item.section||item.zone||place))||place,
   raw:name||id,...(id?{cardId:id}:{})});
 };
 const gather=(input:unknown,place:string)=>{
  if(Array.isArray(input))for(const row of input.slice(0,5000))add(row,place);
  else if(typeof input==='string')add(input,place);
  else for(const [name,data] of Object.entries(obj(input)).slice(0,5000))add(data,place,name);
 };
 const entries=inner.entries||doc.entries;
 if(Array.isArray(entries))gather(entries,'Main');
 else{
  const groups=obj(inner.boards||doc.boards||inner.sections||doc.sections||inner);
  let any=false;
  for(const [name,value] of Object.entries(groups)){
   const zone=section(name);if(!zone)continue;
   gather(value,zone);any=true;
  }
  if(!any)gather(inner.cards||doc.cards||inner.decklist||doc.decklist||doc.list||[],'Main');
 }
 if(!rows.length)ignored.push('No readable deck entries in JSON.');
 return {rows,name:val(doc.name||inner.name||doc.title||inner.title),
  format:val(doc.format||inner.format),hint,ignored,source};
}
function xmlDeck(text:string,source:string):ImportData{
 const rows:ImportRow[]=[];
 const attr=(s:string,key:string)=>{
  const m=s.match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*["\\x27]([^"\\x27]*)["\\x27]','i'));
  return m?.[1]||'';
 };
 let area='Main';
 for(const match of text.matchAll(/<zone\b[^>]*>|<\/zone>|<card\b[^>]*\/?>/gi)){
  const tag=match[0];
  if(/^<zone/i.test(tag)){area=section(attr(tag,'name'))||'Main';continue;}
  if(/^<\/zone/i.test(tag)){area='Main';continue;}
  const name=attr(tag,'name')||attr(tag,'cardname')||attr(tag,'CatID')||attr(tag,'id');
  if(!name)continue;
  rows.push({name,raw:tag,quantity:quantity(attr(tag,'number')||attr(tag,'Quantity')||attr(tag,'Count')),
   section:attr(tag,'Sideboard')==='true'?'Sideboard':area,
   ...(attr(tag,'CatID')?{cardId:attr(tag,'CatID')}:{})});
 }
 return {rows,name:'',format:'',hint:'mtg',ignored:rows.length?[]:['No XML card entries found'],source};
}
export function parseDeckImport(text:string,source='Pasted decklist'):ImportData{
 const input=text.trim();
 if(input.length>3_000_000)throw Error('Deck import exceeds 3 MB.');
 if(!input)return {rows:[],name:'',format:'',hint:null,ignored:[],source};
 if(/^[\[{]/.test(input)){
  try{
   const v:unknown=JSON.parse(input);
   return structured(Array.isArray(v)?{cards:v}:v,source);
  }catch{
   if(/\.json$/i.test(source))throw Error('The JSON file is malformed');
  }
 }
 if(/^<\?xml|^<deck\b|^<cockatrice\b/i.test(input))return xmlDeck(input,source);
 const first=input.split(/\r?\n/)[0]||'';
 if(/[,\t]/.test(first)&&/\b(name|card|quantity|qty|count|copies|passcode)\b/i.test(first)){
  const grid=csvRows(input),keys=grid[0].map(normalizeCardName);
  const col=(names:string[])=>keys.findIndex(x=>names.includes(x));
  const name=col(['name','card','card name','cardname','card title']);
  const identifier=col(['card id','cardid','passcode','id']);
  if(name>=0||identifier>=0){
   const amount=col(['quantity','qty','count','copies','amount']);
   const zone=col(['section','zone','board','category','deck']);
   const set=col(['set','set code','setcode']);
   const number=col(['collector number','card number','local id']);
   const rows:ImportRow[]=grid.slice(1,5001).flatMap(data=>{
    const title=data[name]||data[identifier]||'';
    if(!title.trim())return [];
    return [{...cardFields(title),raw:data.join(','),quantity:quantity(data[amount]),
     section:section(data[zone]||'')||'Main',
     ...(identifier>=0&&data[identifier]?{cardId:data[identifier]}:{}),
     ...(set>=0&&data[set]?{setCode:data[set]}:{}),
     ...(number>=0&&data[number]?{number:data[number]}:{})}];
   });
   return {rows,name:'',format:'',hint:null,ignored:[],source};
  }
 }
 return parsePlain(input,source);
}
export function matchDeckImport(parsed:ImportData,cards:readonly CatalogCard[],game:TcgId):ImportMatch{
 const byName=new Map<string,CatalogCard[]>(),byId=new Map<string,CatalogCard[]>();
 for(const card of cards){
  if(card.game!==game)continue;
  const name=normalizeCardName(card.name);
  const names=byName.get(name)||[];names.push(card);byName.set(name,names);
  for(const key of [card.id,card.id.split(':').slice(1).join(':'),card.number]){
   if(!key)continue;
   const id=normalizeCardName(key);
   const list=byId.get(id)||[];list.push(card);byId.set(id,list);
  }
 }
 const matched:ImportMatch['matched']=[],missing:ImportRow[]=[];
 for(const row of parsed.rows){
  const key=normalizeCardName(row.name);
  let options=byName.get(key);
  if(!options?.length&&row.cardId)options=byId.get(normalizeCardName(row.cardId));
  if(!options?.length&&/^\d{5,12}$/.test(row.name))options=byId.get(key);
  if(!options?.length){missing.push(row);continue;}
  const set=normalizeCardName(row.setCode||'');
  const number=normalizeCardName(row.number||'');
  const rank=(card:CatalogCard)=>
   (number&&normalizeCardName(card.number)===number?10:0)+
   (set&&(normalizeCardName(card.set)===set||
    normalizeCardName(card.attributes['Set Code']||'')===set)?8:0);
  const choice=[...options].sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id))[0];
  const zone=configFor(game).sections.some(s=>s===row.section)?row.section:'Main';
  matched.push({row,card:choice,section:zone});
 }
 return {matched,missing};
}
