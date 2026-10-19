import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDeckImport,detectDeckGame,matchDeckImport,normalizeCardName} from '../../../apps/web/src/lib/universalDeckImport.ts';
import {normalizeTcgCard} from '../../../apps/web/src/lib/tcgCatalog.ts';
import {changeDeckEntry,newDeck,deckQuantity} from '../../../apps/web/src/lib/deckWorkspace.ts';

const lorcana="4 Mother Gothel - Selfish Manipulator\n4 The Queen's Castle - Mirror Chamber\n2 Jafar - Striking Illusionist\n4 Hidden Inkcaster\n4 Ursula's Garden - Full of the Unfortunate\n2 Diablo - Devoted Herald\n4 Genie - Main Attraction\n4 Amethyst Chromicon\n4 Peter Pan - Never Land Prankster\n2 Transport Pod\n4 Show Me More!\n4 The Return of Hercules\n4 Donald Duck - Perfect Gentleman\n4 White Agony Plains - Golden Lagoon\n2 Webby Vanderquack - Junior Prospector\n4 Pocahontas - Following the Wind\n2 Mystical Inkcaster\n2 Genie - Magical Researcher\n4 Ring of Stones - Place of Legends\n2 DunBroch Family Tapestry\n2 The Great Illuminary - Abandoned Laboratory";
const empty=new AbortController().signal;
test('User Lorcana example: 21 complete names, quantities and correct auto-detection',async()=>{
 const parsed=parseDeckImport(lorcana);
 assert.equal(parsed.rows.length,21);
 assert.equal(parsed.rows[0].name,'Mother Gothel - Selfish Manipulator');
 assert.equal(parsed.rows[1].name,"The Queen's Castle - Mirror Chamber");
 assert.equal(parsed.rows.at(-1).name,'The Great Illuminary - Abandoned Laboratory');
 assert.equal(parsed.rows[3].name,'Hidden Inkcaster');
 assert.ok(parsed.rows.every(row=>row.quantity===2||row.quantity===4));
 assert.equal(parsed.ignored.length,0);
 const detected=await detectDeckGame(parsed,{},empty);
 assert.equal(detected.game,'lorcana');
 assert.equal(detected.confidence,'strong');
 const catalog=parsed.rows.map((row,index)=>{
  const [name,version]=row.name.split(' - ');
  return normalizeTcgCard('lorcana',{
   id:'test_'+index,name,version,collector_number:index+1,
   set:{name:'Whispers of the Dreaming',code:'14'},
   type:['Character'],ink:'Amethyst'
  });
 });
 const resolved=matchDeckImport(parsed,catalog,'lorcana');
 assert.equal(resolved.matched.length,21);
 assert.deepEqual(resolved.missing,[]);
 const deck=resolved.matched.reduce((old,{row,card,section})=>
  changeDeckEntry(old,card,section,row.quantity),newDeck('lorcana'));
 assert.equal(deckQuantity(deck),parsed.rows.reduce((n,row)=>n+row.quantity,0));
 assert.ok(deck.entries.some(e=>e.card.name==='Mother Gothel - Selfish Manipulator'));
});
test('All seven game names can be specified in structured imported deck files',async()=>{
 const fixtures=[
  ['Disney Lorcana','lorcana'],['Magic: The Gathering','mtg'],
  ['One Piece','onepiece'],['Pokémon TCG','pokemon'],
  ['Yu-Gi-Oh!','yugioh'],['Gundam Card Game','gundam'],['Riftbound','riftbound']
 ];
 for(const [label,game] of fixtures){
  const parsed=parseDeckImport(JSON.stringify({game:label,cards:[{name:'Card Name',quantity:2}]}),'deck.json');
  assert.equal(parsed.rows.length,1);
  assert.equal((await detectDeckGame(parsed,{},empty)).game,game);
 }
});
test('Text formats: Arena sets, MTGO sideboard, sections, quantity placements and Unicode',()=>{
 const input=[
  'Deck','4 Lightning Bolt (2X2) 117','2x Counterspell','x3 Brainstorm',
  '1 Sol Ring *F*','Sideboard','SB: 2 Spell Pierce',
  '[Commander]','1 Atraxa, Praetors’ Voice',
  '// Maybeboard','1 Force of Will','[Main]','Lightning Bolt x2'
 ].join('\n');
 const p=parseDeckImport(input);
 assert.equal(p.rows.length,8);
 assert.deepEqual(p.rows[0],{
  name:'Lightning Bolt',setCode:'2X2',number:'117',quantity:4,section:'Main',raw:'4 Lightning Bolt (2X2) 117'});
 assert.equal(p.rows[1].quantity,2);
 assert.equal(p.rows[2].quantity,3);
 assert.equal(p.rows[4].section,'Sideboard');
 assert.equal(p.rows[5].section,'Commander');
 assert.equal(p.rows[6].section,'Maybeboard');
 assert.equal(p.rows[7].quantity,2);
 assert.equal(normalizeCardName("The Queen’s Castle – Mirror Chamber"),
  normalizeCardName("The Queen's Castle - Mirror Chamber"));
});
test('CSV with quoted commas, Pokémon printing hints and section names',()=>{
 const csv='Name,Qty,Section,Set Code,Card Number\n' +
  '"Atraxa, Praetors’ Voice",1,Commander,CMM,1\n'+
  'Charizard ex,4,Main,OBF,125\n';
 const p=parseDeckImport(csv,'export.csv');
 assert.equal(p.rows.length,2);
 assert.equal(p.rows[0].name,'Atraxa, Praetors’ Voice');
 assert.equal(p.rows[0].section,'Commander');
 assert.equal(p.rows[0].setCode,'CMM');
 assert.equal(p.rows[1].quantity,4);
 assert.equal(p.rows[1].number,'125');
});
test('YDK and XML Cockatrice formats preserve zones',async()=>{
 const ydk=parseDeckImport('#created by Yu-Gi-Oh!\n#main\n46986414\n#extra\n89631139\n!side\n46986414','deck.ydk');
 assert.equal(ydk.hint,'yugioh');
 assert.deepEqual(ydk.rows.map(r=>r.section),['Main','Extra','Sideboard']);
 const c=normalizeTcgCard('yugioh',{id:46986414,name:'Dark Magician',type:'Normal Monster'});
 const result=matchDeckImport(ydk,[c],'yugioh');
 assert.equal(result.matched.length,2);
 assert.equal(result.missing.length,1);
 const xml=parseDeckImport('<?xml version="1.0"?><cockatrice_deck><zone name="main"><card number="4" name="Sol Ring"/></zone><zone name="side"><card number="2" name="Lightning Bolt"/></zone></cockatrice_deck>','my.cod');
 assert.equal(xml.rows.length,2);
 assert.deepEqual(xml.rows.map(x=>x.section),['Main','Sideboard']);
});
test('Generic JSON exports including board object keyed by card IDs',()=>{
 const p=parseDeckImport(JSON.stringify({
  game:'mtg',name:'My Commander List',
  mainboard:{card1:{quantity:4,card:{name:'Sol Ring'}}},
  sideboard:[{quantity:2,name:'Spell Pierce'}]
 }),'mydeck.json');
 assert.equal(p.rows.length,2);
 assert.equal(p.rows[0].quantity,4);
 assert.equal(p.rows[0].name,'Sol Ring');
 assert.equal(p.rows[1].section,'Sideboard');
});
test('No unreliable blind game guess for a list of unrelated / unknown cards',async()=>{
 const c=parseDeckImport('3 The Totally Unknown Card\n4 Another Totally Unpublished Card');
 // Providers unavailable; no invented matches or game changes.
 const fetchOld=globalThis.fetch;
 globalThis.fetch=async()=>{throw new TypeError('Network unavailable');};
 try{
  const result=await detectDeckGame(c,{},empty);
  assert.equal(result.game,null);
  assert.equal(result.confidence,'uncertain');
 }finally{globalThis.fetch=fetchOld;}
});
