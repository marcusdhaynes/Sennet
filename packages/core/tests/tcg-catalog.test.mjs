import test from 'node:test';
import assert from 'node:assert/strict';
import {TCGS,normalizeTcgCard,loadTcgCatalog,configFor} from '../../../apps/web/src/lib/tcgCatalog.ts';

test('Seven requested TCGs have distinct catalogues, providers and deck sections',()=>{
 assert.equal(TCGS.length,7);
 assert.equal(new Set(TCGS.map(g=>g.id)).size,7);
 for(const game of TCGS){
  assert.ok(game.url.startsWith('https://'));
  assert.ok(game.sections.includes('Main'));
  assert.ok(game.formats.length);
  assert.ok(configFor(game.id)===game);
 }
 assert.ok(configFor('onepiece').sections.includes('Leader'));
 assert.ok(configFor('onepiece').sections.includes('DON!!'));
 assert.ok(configFor('yugioh').sections.includes('Extra'));
 assert.ok(configFor('mtg').sections.includes('Commander'));
 assert.ok(configFor('riftbound').sections.includes('Rune'));
});
test('Provider adapters retain real card IDs, sets, art, colors, and specialized stats',()=>{
 const cases=[
  ['lorcana',{id:'crd_13',name:'Elsa',type:['Character'],ink:'Amethyst',cost:8,
   image_uris:{digital:{small:'https://cards.lorcast.io/card.avif'}},
   collector_number:'207',set:{name:'The First Chapter'},text:'Deep freeze',prices:{usd:3.2}},
   {id:'lorcana:crd_13',set:'The First Chapter',cost:'8',image:'https://cards.lorcast.io/card.avif'}],
  ['gundam',{product_id:'GD01-001_p1',card_number:'GD01-001',name:'RX-78',card_type:'UNIT',
   color:'Blue',ap_raw:'+1',hp:5,level:3,effect:'Repair',image_url:'https://www.gundam-gcg.com/card.jpg'},
   {id:'gundam:GD01-001_p1',number:'GD01-001',type:'UNIT',cost:''}],
  ['mtg',{id:'card-uuid',name:'Sol Ring',set_name:'Commander Masters',
   type_line:'Artifact',cmc:1,color_identity:[],oracle_text:'Add two mana',
   image_uris:{small:'https://cards.scryfall.io/card.jpg'},prices:{usd:'1.52'},legalities:{commander:'legal'}},
   {id:'mtg:card-uuid',cost:'1',price:1.52}],
  ['onepiece',{card_set_id:'OP01-001',card_name:'Roronoa Zoro',card_type:'Character',
   card_color:'Red',card_cost:'3',card_power:'5000',card_text:'Double attack',
   card_image:'https://example.com/onepiece.png',set_name:'Romance Dawn',counter_amount:'1000'},
   {id:'onepiece:OP01-001',number:'OP01-001',cost:'3',text:'Double attack'}],
  ['pokemon',{id:'base1-4',name:'Charizard',image:'https://assets.tcgdex.net/en/base/base1/4',
   localId:'4',rarity:'Rare Holo',hp:120,types:['Fire'],category:'Pokemon'},
   {id:'pokemon:base1-4',number:'4',image:'https://assets.tcgdex.net/en/base/base1/4/low.webp'}],
  ['riftbound',{id:'OGN-11',name:'Jinx',set:'Origins',type:'Champion',faction:'Chaos',
   description:'Deal damage',stats:{cost:3,might:5},media:[{type:'thumbnail',url:'https://assets.riotgames.com/jinx.jpg'}]},
   {id:'riftbound:OGN-11',type:'Champion',cost:'3',text:'Deal damage'}],
  ['yugioh',{id:46986414,name:'Dark Magician',type:'Normal Monster',attribute:'DARK',
   atk:2500,def:2100,card_images:[{image_url_small:'https://images.ygoprodeck.com/card.jpg'}],
   card_prices:[{tcgplayer_price:'0.75'}],banlist_info:{ban_tcg:'Limited'}},
   {id:'yugioh:46986414',price:0.75,type:'Normal Monster'}]
 ];
 for(const [game,data,expected] of cases){
  const normalized=normalizeTcgCard(game,data);
  assert.ok(normalized,game+' must normalize');
  for(const [field,value] of Object.entries(expected))
   assert.deepEqual(normalized[field],value,game+' '+field);
  assert.equal(normalized.game,game);
  assert.equal(typeof normalized.name,'string');
  assert.ok(normalized.id.length>game.length+1);
 }
});
test('Catalogue endpoints fetch full indexes in one bulk request when supported',async()=>{
 const previous=globalThis.fetch;
 const requests=[];
 const fixtures={
  'https://api.tcgdex.net/v2/en/cards':[{id:'base1-4',name:'Charizard'}],
  'https://db.ygoprodeck.com/api/v7/cardinfo.php':{data:[{id:1,name:'Blue-Eyes'}]},
  'https://api.scryfall.com/bulk-data/oracle-cards':{download_uri:'https://data.scryfall.io/oracle.json'},
  'https://data.scryfall.io/oracle.json':[{id:'example',name:'Forest'}],
  'https://api.gcgapi.com/v1/bulk':'{"product_id":"GD01-001","name":"Gundam"}\n'
 };
 globalThis.fetch=async input=>{
  const url=String(input);requests.push(url);
  if(!(url in fixtures))throw Error('Unexpected test request: '+url);
  const fixture=fixtures[url];
  return new Response(typeof fixture==='string'?fixture:JSON.stringify(fixture),{status:200});
 };
 try{
  for(const game of ['pokemon','yugioh','mtg','gundam']){
   const updates=[];const before=requests.length;
   const result=await loadTcgCatalog(game,new AbortController().signal,u=>updates.push(u));
   assert.equal(result.length,1,game+' returns the entire tiny fixture');
   assert.ok(updates.some(u=>u.partial?.length===1));
   assert.equal(requests.length-before,game==='mtg'?2:1);
  }
 }finally{globalThis.fetch=previous;}
});
