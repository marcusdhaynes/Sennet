import {Container,Graphics,Text} from 'pixi.js';
import {TCGS} from '../lib/tcgCatalog';

const label=(text:string,size:number,color=0xe8faff)=>{
 const t=new Text({text,style:{fontFamily:'Arial, sans-serif',fontSize:size,fontWeight:'bold',fill:color,align:'center'}});
 t.anchor.set(.5);t.eventMode='none';return t;
};
const button=(x:number,y:number,r:number,caption:string,callback:()=>void,color=0x19303d)=>{
 const root=new Container();root.position.set(x,y);
 const disk=new Graphics().circle(0,1.3,r+1).fill(0x081015)
  .circle(0,0,r).fill(color).stroke({color:0x58cada,width:1.1,alpha:.9});
 disk.eventMode='static';disk.cursor='pointer';disk.on('pointerdown',e=>{e.stopPropagation();callback();});
 root.addChild(disk);root.addChild(label(caption,Math.min(9,r*.91)));return root;
};
/** Styled, functional electronic life counter, with seven game selectors. */
export function buildLifeCounter(seat=0):Container{
 const root=new Container();root.label='life-counter-device';
 const shadow=new Graphics().ellipse(4,7,48,51).fill({color:0x02040a,alpha:.35});
 const body=new Graphics().circle(-4,1,48).fill(0x080c13)
  .circle(1,0,46).fill(0x291340).stroke({color:0x62418c,width:6})
  .circle(0,0,42).fill(0x0a0d17).stroke({color:0x8e60b9,width:2})
  .circle(0,0,35).fill(0x101923).stroke({color:0x13d4ec,width:2.8})
  .circle(0,0,25).fill(0x151d2b).stroke({color:0x34a8c1,width:2});
 root.addChild(shadow,body);
 const turn=label('TURN 1',6);turn.y=-29;root.addChild(turn);
 const player=label('Player 1',7);player.y=-13;root.addChild(player);
 const storageKey='sennet.life-counter.v1.'+seat;
 let saved:{total:number;round:number;active:number}|null=null;
 try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{/* private session */}
 let total=Number.isFinite(saved?.total)?saved!.total:40;
 let round=Number.isFinite(saved?.round)?saved!.round:1;
 let active=Number.isInteger(saved?.active)?Math.max(0,Math.min(TCGS.length-1,saved!.active)):0;
 const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify({total,round,active}));}catch{/* local-only */}};
 const amount=label(String(total),23,0xf3ffff);amount.y=6;root.addChild(amount);
 const redraw=()=>{amount.text=String(total);turn.text='TURN '+round;persist();};
 turn.text='TURN '+round;
 root.addChild(button(-18,9,6,'−',()=>{total--;redraw();}));
 root.addChild(button(18,9,6,'+',()=>{total++;redraw();}));
 const next=button(0,30,10,'NEXT',()=>{round++;redraw();},0x395365);root.addChild(next);
 const glyphs=['✦','◆','✧','☠','●','✥','★'];
 TCGS.forEach((game,i)=>{
  const angle=(i*360/TCGS.length-90)*Math.PI/180;
  const x=Math.cos(angle)*30,y=Math.sin(angle)*30;
  // Keep the status text legible by placing icons slightly outside display.
  const p=button(x,y,4.5,glyphs[i],()=>{active=i;gameName.text=game.name.slice(0,12);persist();});
  p.alpha=i===active?1:.82;root.addChild(p);
 });
 const gameName=label(TCGS[active].name.slice(0,12),4.3,0x65c9e4);gameName.y=20;root.addChild(gameName);
 // A contained external silhouette gives the housing depth above the drawer.
 root.eventMode='passive';
 return root;
}
export function buildDrawerMagnifier(onUse?:()=>void):Container{
 const root=new Container();root.label='magnifying-glass';
 root.addChild(new Graphics().ellipse(3,16,23,7).fill({color:0x020b0b,alpha:.23}));
 const handle=new Graphics().moveTo(8,9).lineTo(23,28)
  .stroke({color:0x1b191b,width:9,cap:'round'})
  .moveTo(8,9).lineTo(22,27).stroke({color:0x65513b,width:5,cap:'round'})
  .moveTo(9,10).lineTo(21,25).stroke({color:0xc8a777,width:1.3,cap:'round'});
 const lens=new Graphics().circle(-6,-7,17).fill(0x172127).stroke({color:0xbdc7c9,width:4})
  .circle(-6,-7,13).fill({color:0x8dd5ed,alpha:.23})
  .moveTo(-16,-16).quadraticCurveTo(-9,-22,0,-17)
  .stroke({color:0xffffff,width:2.5,alpha:.7,cap:'round'});
 root.addChild(handle,lens);
 const hit=new Graphics().circle(-6,-7,19).fill({color:0xffffff,alpha:.001});
 hit.eventMode='static';hit.cursor='zoom-in';hit.on('pointerdown',e=>{e.stopPropagation();onUse?.();});root.addChild(hit);
 return root;
}
export function buildDrawerCalculator():Container{
 const root=new Container();root.label='basic-calculator';
 const body=new Graphics().roundRect(-23,-35,46,70,6).fill(0x252c34)
  .stroke({color:0xadb6bb,width:2}).roundRect(-19,-30,38,15,2)
  .fill(0xb3cec6).stroke({color:0x384e49,width:1});
 root.addChild(body);
 let value='0',stored:number|null=null,op='';
 const screen=label(value,11,0x14282a);screen.x=12;screen.y=-22;root.addChild(screen);
 const names=['7','8','9','÷','4','5','6','×','1','2','3','−','C','0','=','+'];
 names.forEach((key,i)=>{
  const col=i%4,row=Math.floor(i/4);
  const x=-15+col*10,y=-7+row*11;
  const control=new Graphics().roundRect(x-4.3,y-4.4,8.6,8.8,2)
    .fill(key==='C'?0x983f48:key==='='?0x3b8e9a:i%4===3?0x455768:0x515c65)
    .stroke({color:0xabbac0,width:.55});
  control.eventMode='static';control.cursor='pointer';
  const keyText=label(key,6.3);keyText.position.set(x,y);
  control.on('pointerdown',e=>{
   e.stopPropagation();
   if(key==='C'){value='0';stored=null;op='';}
   else if('0123456789'.includes(key))value=value==='0'?key:(value+key).slice(-9);
   else if(key==='='){
    if(stored!==null){const v=Number(value);const n=op==='+'?stored+v:op==='−'?stored-v:op==='×'?stored*v:op==='÷'?(v?stored/v:0):v;value=String(Number(n.toFixed(5)));stored=null;op='';}
   }else {stored=Number(value);value='0';op=key;}
   screen.text=value.slice(-9);
  });
  root.addChild(control,keyText);
 });
 return root;
}
