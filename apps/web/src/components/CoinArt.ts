import {Container,Graphics,Text} from 'pixi.js';

/** All finishes are vector-based; no texture fetching or GPU assets required. */
export type CoinFinish='polished'|'brushed'|'matte'|'enamel';
export interface CoinAppearance {finish:CoinFinish;shine:number;bevel:number;size:number}
export const DEFAULT_COIN_APPEARANCE:CoinAppearance={
  finish:'polished',shine:75,bevel:65,size:.9
};
const fillText=(text:string,size:number,color:number)=>{
  const obj=new Text({text,resolution:3,style:{
    fontFamily:'Inter, system-ui, sans-serif',fontSize:size,
    fontWeight:'900',fill:color,align:'center'
  }});
  obj.anchor.set(.5);obj.eventMode='none';return obj;
};
export function coinHighlight(g:Graphics,half:1|-1|0,r=16){
  g.clear();
  if(!half)return;
  const top=half===1;
  g.moveTo(-r,0).arc(0,0,r,top?Math.PI:0,top?Math.PI*2:Math.PI)
    .lineTo(r*(top?1:-1),0).closePath()
    .fill({color:top?0x7dfdd7:0xffa1bb,alpha:.27})
    .stroke({color:top?0x8fffea:0xffbdce,width:1.8,alpha:.95});
}
export function makeCoin(value:number|string,style:CoinAppearance,source=false,sign:1|-1=1,color='#d8b979',editable=false){
  const coin=new Container();
  const finish=style.finish,shine=Math.max(0,Math.min(100,style.shine))/100;
  const bevel=Math.max(0,Math.min(100,style.bevel))/100,r=16;
  coin.scale.set(1.08*Math.max(.75,Math.min(1.3,style.size)));
  const validColor=/^#[0-9a-fA-F]{6}$/.test(color);
  const selectedTint=validColor?parseInt(color.slice(1),16):0xd8b979;
  const defaultEditable=editable&&!validColor;
  const shaded=(base:number,factor:number)=>{
    const channels=[(base>>16)&255,(base>>8)&255,base&255];
    const adjusted=channels.map(n=>Math.max(0,Math.min(255,Math.round(n*factor))));
    return adjusted[0]*65536+adjusted[1]*256+adjusted[2];
  };
  const metal=defaultEditable?0x9aaeb6:shaded(selectedTint,finish==='matte'?.78:1.04);
  const rimDark=shaded(selectedTint,.36);
  const rimLight=shaded(selectedTint,1.35);
  const rim=new Graphics().circle(1,2,r+1.5).fill({color:0x050d10,alpha:.5})
    .circle(0,0,r+1).fill({color:rimDark})
    .circle(0,0,r).fill(metal).stroke({color:rimLight,width:.75+bevel,alpha:.55+.28*shine})
    .circle(0,0,r-2.6).stroke({color:shaded(selectedTint,.24),width:1.3+bevel,alpha:.86});
  coin.addChild(rim);
  // Emulate a pressed two-piece enamel / precious-metal medallion.
  // Color is authoritative for EVERY finish, including the silvery editable
  // coin, inner seal and both halves of the pressed medallion.
  const top=shaded(selectedTint,finish==='matte'?.69:.92);
  const bottom=shaded(selectedTint,finish==='matte'?.96:1.16);
  if(editable){
    // Single pressed silvery face for the freeform annotation coin.
    // Both machined rings remain perfect circles, independent of the text.
    coin.addChild(new Graphics()
      .circle(0,0,r-2).fill({color:shaded(selectedTint,1.01)})
      .circle(-5,-6,4.3).fill({color:0xffffff,alpha:.13})
      .circle(0,0,r-2.7).stroke({color:rimLight,alpha:.68,width:.85})
      .circle(0,0,r-4.7).stroke({color:rimDark,alpha:.8,width:1.15}));
  }else coin.addChild(new Graphics()
    .moveTo(-r+2,0).arc(0,0,r-2,Math.PI,Math.PI*2)
    .lineTo(r-2,0).closePath().fill(top)
    .moveTo(r-2,0).arc(0,0,r-2,0,Math.PI)
    .lineTo(-r+2,0).closePath().fill(bottom)
    .moveTo(-r+2,0).lineTo(r-2,0)
    .stroke({color:0x392822,width:2.4})
    .moveTo(-r+3,-1).lineTo(r-3,-1)
    .stroke({color:0xfce7bd,alpha:.6*shine,width:.85})
    .circle(0,0,r-3).stroke({color:0xffffff,width:.55,alpha:.25*shine}));
  if(finish==='brushed'){
    const lines=new Graphics();
    for(let i=-12;i<13;i+=3)
      lines.moveTo(-12,i).lineTo(12,i-2).stroke({color:0xffffff,alpha:.055,width:.7});
    lines.eventMode='none';coin.addChild(lines);
  }
  if(finish==='polished'||finish==='enamel'){
    coin.addChild(new Graphics()
      .arc(0,0,r-4,Math.PI*1.12,Math.PI*1.66)
      .stroke({color:0xffffff,alpha:.12+.48*shine,width:1.3+shine})
      .arc(0,0,r-4,Math.PI*.08,Math.PI*.58)
      .stroke({color:0x35271b,alpha:.2,width:1.5}));
  }
  const disk=new Graphics().circle(0,0,10.3)
    .fill({color:rimDark}).stroke({color:rimLight,width:1.6})
    .circle(0,0,9.1).fill({color:shaded(selectedTint,1.24)})
    .stroke({color:shaded(selectedTint,.47),width:.65});
  coin.addChild(disk);
  const str=String(value);
  const text=fillText(str,str.length>12?4.5:str.length>8?5:str.length>4?6.1:str.length>3?7.1:str.length>2?8:8.8,
    ((((selectedTint>>16)&255)*.2126+((selectedTint>>8)&255)*.7152+
      (selectedTint&255)*.0722)>145)?0x233027:0xfff7e8);
  // Glyphs may scale, but the text can NEVER resize the circular metal.
  text.scale.set(Math.min(1,17/Math.max(1,text.width)));
  text.position.set(0,-.2);coin.addChild(text);
  coin.eventMode='none';
  return coin;
}
