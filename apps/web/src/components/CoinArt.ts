import {Container,Graphics,Text} from 'pixi.js';

/** All finishes are vector-based; no texture fetching or GPU assets required. */
export type CoinFinish='polished'|'brushed'|'matte'|'enamel';
export interface CoinAppearance {finish:CoinFinish;shine:number;bevel:number;size:number}
export const DEFAULT_COIN_APPEARANCE:CoinAppearance={
  finish:'polished',shine:75,bevel:65,size:.78
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
export function makeCoin(value:number,style:CoinAppearance,source=false,sign:1|-1=1,color='#d8b979'){
  const coin=new Container();
  const finish=style.finish,shine=Math.max(0,Math.min(100,style.shine))/100;
  const bevel=Math.max(0,Math.min(100,style.bevel))/100,r=16;
  coin.scale.set(Math.max(.55,Math.min(1.3,style.size)));
  const metal=finish==='enamel'?0xbd9855:finish==='matte'?0x8d8172:finish==='brushed'?0xb8ae96:0xe3c38a;
  const rim=new Graphics().circle(1,2,r+1.5).fill({color:0x050d10,alpha:.5})
    .circle(0,0,r+1).fill({color:0x493b2b})
    .circle(0,0,r).fill(metal).stroke({color:0xffedbd,width:.75+bevel,alpha:.55+.28*shine})
    .circle(0,0,r-2.6).stroke({color:0x32271e,width:1.3+bevel,alpha:.86});
  coin.addChild(rim);
  // Emulate a pressed two-piece enamel / precious-metal medallion.
  const tint=/^#[0-9a-fA-F]{6}$/.test(color)&&color.toLowerCase()!=='#d8b979'?
    parseInt(color.slice(1),16):null;
  const shaded=(base:number,factor:number)=>{
    const r=Math.round(((base>>16)&255)*factor),g=Math.round(((base>>8)&255)*factor),b=Math.round((base&255)*factor);
    return Math.min(r,255)*65536+Math.min(g,255)*256+Math.min(b,255);
  };
  const top=tint===null?(finish==='enamel'?0xc14d50:finish==='matte'?0x7a6660:0xd2a45f):
    shaded(tint,finish==='matte'?.69:.96);
  const bottom=tint===null?(finish==='enamel'?0xe5dec6:finish==='matte'?0xc7bea7:0xf0e3c5):
    shaded(tint,finish==='matte'?.94:1.15);
  coin.addChild(new Graphics()
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
  if(source||sign===1){
    const plus=fillText('+',9,source?0xfbf4d9:0xddffde);
    plus.position.set(0,-10.2);coin.addChild(plus);
  }
  if(source||sign===-1){
    const minus=fillText('−',9,source?0x362d2d:0x982d4e);
    minus.position.set(0,10);coin.addChild(minus);
  }
  const disk=new Graphics().circle(0,0,7.1)
    .fill({color:0x27292b}).stroke({color:0xfde5aa,width:1.6})
    .circle(0,0,5.75).fill({color:finish==='enamel'?0xfff1d3:0xe5d6b4})
    .stroke({color:0x71644c,width:.65});
  coin.addChild(disk);
  const str=String(value);
  const text=fillText(str,str.length>4?4.8:str.length>3?5.7:str.length>2?6.6:7.7,0x28322e);
  text.position.set(0,-.2);coin.addChild(text);
  coin.eventMode='none';
  return coin;
}
