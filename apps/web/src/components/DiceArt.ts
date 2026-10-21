import {Container,Graphics,Text} from 'pixi.js';

/** PBR-like miniature *icons* in the storage rack. The thrown versions are
 * genuine Three.js meshes simulated by Cannon physics in Dice3D.ts. */
export const DICE_TYPES=[2,4,6,8,10,12,20,100] as const;
export type DiceType=typeof DICE_TYPES[number];
export const diceLabel=(sides:number)=>sides===2?'FLIP':'D'+String(sides).padStart(2,'0');
const pigment=(sides:number)=>({
  2:0xd5b87f,4:0xc7b087,6:0xa0c5b3,8:0xaea3d5,
  10:0x95bad0,12:0xd0a28b,20:0xbaa6d9,100:0x82c1ae
} as Record<number,number>)[sides]??0xc4b59b;
const shade=(base:number,mult:number)=>{
  const channel=(shift:number)=>Math.max(0,Math.min(255,
    Math.round(((base>>shift)&255)*mult)));
  return (channel(16)<<16)|(channel(8)<<8)|channel(0);
};
const number=(value:string,size:number,color:number)=>{
  const t=new Text({text:value,resolution:3,style:{
    fontFamily:'Inter,system-ui,sans-serif',fontSize:size,fontWeight:'900',
    fill:color,align:'center',stroke:{color:0x182329,width:.55}}});
  t.anchor.set(.5);t.eventMode='none';return t;
};
export function makeDie(sides:number,result?:string,selected=0):Container{
  const root=new Container();root.eventMode='none';
  const base=pigment(sides),r=16.1,n=sides===2?32:sides===4?3:
    sides===6?4:sides===8?6:sides===10?5:sides===12?7:
    sides===20?8:12;
  const offset=sides===6?Math.PI/4:-Math.PI/2;
  const verts=Array.from({length:n},(_,i)=>{
    const a=offset+i*2*Math.PI/n;
    return {x:Math.cos(a)*r,y:Math.sin(a)*r};
  });
  const g=new Graphics();
  g.ellipse(3.1,7.3,r*.98,6.3).fill({color:0x000000,alpha:.44});
  // Cast top-faceted geometric volumes with actual visible sidewalls.
  const behind=verts.map(v=>({x:v.x+1.6,y:v.y+4.2}));
  const coords=(pts:{x:number;y:number}[])=>pts.flatMap(v=>[v.x,v.y]);
  g.poly(coords(behind)).fill(shade(base,.37));
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    if((verts[i].y+verts[j].y)/2<-.5)continue;
    const side=[verts[i],verts[j],behind[j],behind[i]];
    g.poly(coords(side)).fill(shade(base,.39+.24*Math.max(0,
      Math.cos(offset+i*2*Math.PI/n))))
      .stroke({color:0x2b272b,width:.65,alpha:.92});
  }
  if(sides===2){
    g.circle(0,0,r).fill(shade(base,.82))
      .stroke({color:0xf7e3ba,width:1.5});
    g.circle(0,0,r-2.3).fill(base)
      .stroke({color:0x8d683e,width:1.1});
    g.circle(0,0,r-4.8).stroke({color:0xfff2d4,alpha:.72,width:1});
    g.arc(0,0,r-3.3,3.5,5.15).stroke({color:0xffffff,alpha:.69,width:1.7});
  }else{
    // Colored triangular facets and angled specular reflections make the
    // permanent icon visually consistent with the real rolling solid.
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      const light=Math.sin((i+.32)*2*Math.PI/n)*.18+
        Math.cos((i+.7)*2*Math.PI/n)*.12;
      const triangle=[verts[i],verts[j],{x:0,y:0}];
      g.poly(coords(triangle))
        .fill(shade(base,.85+light))
        .stroke({color:shade(base,.53),width:.55,alpha:.5});
    }
    g.poly(coords(verts)).stroke({color:0xffe7b5,width:1.25,alpha:.82});
    g.moveTo(verts[0].x*.85,verts[0].y*.85)
      .lineTo(verts[1].x*.85,verts[1].y*.85)
      .stroke({color:0xffffff,width:1.8,alpha:.7});
    g.moveTo(verts[n-1].x*.81,verts[n-1].y*.81)
      .lineTo(verts[0].x*.81,verts[0].y*.81)
      .stroke({color:0xffffff,width:.6,alpha:.36});
  }
  root.addChild(g);
  if(result!==undefined){
    root.addChild(new Graphics().roundRect(-14.7,-9.8,29.4,19.6,5)
      .fill({color:0x17262c,alpha:.97})
      .stroke({color:0xf9dfae,width:1.2}));
    const size=result.length>7?6.5:result.length>4?7.5:
      result.length>2?9:13.2;
    const t=number(result,size,0xffeed0);t.position.y=-.4;root.addChild(t);
  }else{
    const t=number(sides===2?'⇅':String(sides),sides===100?10:13.2,
      sides===2?0x3e3527:0x21323c);
    t.position.y=-.5;root.addChild(t);
  }
  if(selected){
    root.addChild(new Graphics().circle(0,0,20.7)
      .stroke({color:0x9affeb,width:2.25}));
    const counter=new Graphics().circle(17,-14,9.8)
      .fill(0x172e34).stroke({color:0xffe8af,width:1.35});
    root.addChild(counter);
    const t=number(String(selected),10.8,0xfff6d8);
    t.position.set(17,-14);root.addChild(t);
  }
  return root;
}
