import {Container,Graphics,Text} from 'pixi.js';

export const DICE_TYPES=[2,4,6,8,10,12,20,100] as const;
export type DiceType=typeof DICE_TYPES[number];
export const diceLabel=(sides:number)=>sides===2?'FLIP': 'D'+String(sides).padStart(2,'0');
const ink=(value:string,size:number,color:number)=>{
  const t=new Text({text:value,resolution:3,style:{
    fontFamily:'Inter, system-ui, sans-serif',fontSize:size,fontWeight:'900',
    fill:color,align:'center',stroke:{color:0x211e18,width:.65}}});
  t.anchor.set(.5);t.eventMode='none';return t;
};
export function makeDie(sides:number,number?:string,selected=0):Container{
  const root=new Container();
  root.eventMode='none';
  const radius=17;
  const metal=sides===2?0xd5b87f:sides===20?0xb0a2ce:sides===100?0xa5c2ba:
    sides===12?0xd2a891:sides===10?0xa3bccc:sides===8?0xb3aecc:
    sides===4?0xc6af8b:0xb9c6b9;
  const edge=0x342b2c;
  const sidesOfShape=sides===2?32:sides===4?3:sides===6?4:
    sides===8?6:sides===10?5:sides===12?7:sides===20?8:10;
  const angleStart=sides===4?-Math.PI/2:sides===6?Math.PI/4:-Math.PI/2;
  const points=Array.from({length:sidesOfShape},(_,i)=>{
    const a=angleStart+i*2*Math.PI/sidesOfShape;
    return [Math.cos(a)*radius,Math.sin(a)*radius];
  });
  const flat=points.flat();
  const art=new Graphics();
  art.ellipse(2.8,5,radius*.9,radius*.48).fill({color:0x000000,alpha:.36});
  art.poly(flat).fill({color:edge}).stroke({color:0x100f15,width:2.1});
  const inner=points.map(([x,y])=>[x*.87-1,y*.87-1]).flat();
  art.poly(inner).fill({color:metal}).stroke({color:0xfce9c1,width:1.3,alpha:.82});
  if(sides===2){
    art.circle(0,0,12.6).stroke({color:0xf9dfac,width:1.4})
      .circle(0,0,9.4).stroke({color:0x79603d,width:1,alpha:.65});
  }else{
    for(const [x,y] of points)
      art.moveTo(x*.82,y*.82).lineTo(0,0).stroke({color:0x382e36,alpha:.36,width:.9});
    art.poly(points.slice(0,3).flat()).stroke({color:0xffffff,width:1.2,alpha:.25});
  }
  root.addChild(art);
  if(number!==undefined){
    const size=number.length>7?7:number.length>4?8:number.length>2?10:15;
    const panel=new Graphics().roundRect(-15,-10,30,20,6)
      .fill({color:0x132326,alpha:.93})
      .stroke({color:0xf6dea4,width:1.1});
    root.addChild(panel);
    const face=ink(number,size,0xffe7aa);
    root.addChild(face);
  }else{
    const emblem=ink(sides===2?'⇅':String(sides),sides===100?10:13,0x1a2630);
    root.addChild(emblem);
  }
  if(selected>0){
    root.addChild(new Graphics().circle(0,0,21)
      .stroke({color:0x8dfff2,width:2.2,alpha:.96}));
    const count=new Graphics().circle(17,-14,10)
      .fill({color:0x112c30})
      .stroke({color:0xffe4a7,width:1.3});
    root.addChild(count);
    const text=ink(String(selected),11,0xfff0cc);
    text.position.set(17,-14);root.addChild(text);
  }
  return root;
}
