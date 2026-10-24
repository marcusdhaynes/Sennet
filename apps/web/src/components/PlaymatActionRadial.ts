import {Container,Graphics,Text} from 'pixi.js';
import {RADIAL_ACTIONS,RADIAL_CATEGORIES,type RadialAction} from '../lib/radialWheel';

/** Native Pixi radial: a real child of the player's playmat container.
 * It inherits the exact same transform, pan, redraw and rotation as cards/dice.
 * No HTML position projection or DOM camera-follow animation is involved. */
export function makePlaymatRadial(
 x:number,y:number,matWidth:number,
 choose:(action:RadialAction)=>void,
 onExpansion:(expanded:boolean)=>void,
 getSelectionLabel:()=>string
):Container{
 const wheel=new Container();
 wheel.position.set(x,y);
 wheel.label='playmat-action-radial';
 wheel.eventMode='static';
 wheel.sortableChildren=true;
 const radius=matWidth*.15;
 let collapsed=false;
 let activeCategory=1;
 let holdTimer:number|undefined;
 const children:Container[]=[];
 const sector=(inner:number,outer:number,start:number,end:number,color:number,stroke:number)=>{
   const g=new Graphics();
   const angle=(deg:number)=>((deg-90)*Math.PI/180);
   const p=(r:number,deg:number)=>({x:Math.cos(angle(deg))*r,y:Math.sin(angle(deg))*r});
   const a=p(inner,start);
   g.moveTo(a.x,a.y);
   const steps=Math.max(8,Math.ceil((end-start)/3));
   for(let i=0;i<=steps;i++){const q=p(outer,start+(end-start)*i/steps);g.lineTo(q.x,q.y);}
   for(let i=steps;i>=0;i--){const q=p(inner,start+(end-start)*i/steps);g.lineTo(q.x,q.y);}
   g.closePath().fill(color).stroke({color:stroke,width:Math.max(.5,radius*.008)});
   return g;
 };
 const txt=(value:string,x:number,y:number,size:number)=>{
   const t=new Text({text:value,style:{fontFamily:'Arial, sans-serif',fontSize:size,fontWeight:'bold',fill:0xfff6f0,align:'center',stroke:{color:0x20172f,width:Math.max(.3,size*.025)}}});
   t.anchor.set(.5);t.position.set(x,y);t.eventMode='none';
   return t;
 };
 const polar=(r:number,deg:number)=>({x:Math.sin(deg*Math.PI/180)*r,y:-Math.cos(deg*Math.PI/180)*r});
 const draw=()=>{
   for(const child of children){wheel.removeChild(child);child.destroy({children:true});}
   children.length=0;
   const add=(child:Container)=>{wheel.addChild(child);children.push(child);};
   if(!collapsed){
     // The lower half of the same 30%-mat-width action semicircle.
     add(new Graphics().arc(0,0,radius,0,Math.PI).lineTo(0,0).closePath().fill({color:0x0c1016,alpha:.42}));
     for(let i=0;i<3;i++){
       const start=90+i*60;
       const inner=sector(radius*.335,radius*.61,start,start+60,i===activeCategory?0x714db6:0x28203c,0x8f78ac);
       inner.eventMode='static';inner.cursor='pointer';
       inner.on('pointerdown',e=>{e.stopPropagation();activeCategory=i;draw();});
       add(inner);
       const label=polar(radius*.47,start+30);
       add(txt(RADIAL_CATEGORIES[i],label.x,label.y,Math.max(8,radius*.13)));
       for(let j=0;j<3;j++){
         const action=RADIAL_ACTIONS[i][j];
         const begin=start+j*20,end=begin+20;
         const outer=sector(radius*.635,radius*.96,begin,end,i===activeCategory?0x382853:0x120e1b,0x665080);
         outer.eventMode='static';outer.cursor='pointer';
         outer.on('pointerover',()=>{outer.tint=0xc4a9ff;});
         outer.on('pointerout',()=>{outer.tint=0xffffff;});
         outer.on('pointerdown',event=>{event.stopPropagation();choose(action.id);});
         add(outer);
         const labelPos=polar(radius*.80,(begin+end)/2);
         const glyph=action.id==='tap-toggle'?'↷':action.id==='rotate-cw'?'↻':action.id==='rotate-ccw'?'↺':action.id==='shuffle'?'⇄':action.id==='flip'?'⇅':action.id==='reveal'?'▣':action.label;
         add(txt(glyph,labelPos.x,labelPos.y,Math.max(9,radius*.19)));
       }
     }
   }
   const center=new Graphics().circle(0,0,radius*.32).fill(0x1c142c).stroke({color:0xad94cf,width:Math.max(1,radius*.015)});
   center.eventMode='static';center.cursor='pointer';
   center.on('pointerdown',event=>{
     event.stopPropagation();
     if(holdTimer!==undefined)clearTimeout(holdTimer);
     holdTimer=window.setTimeout(()=>{
       holdTimer=undefined;collapsed=!collapsed;draw();onExpansion(!collapsed);
     },450);
   });
   const stop=()=>{if(holdTimer!==undefined){clearTimeout(holdTimer);holdTimer=undefined;}};
   center.on('pointerup',stop);center.on('pointerupoutside',stop);center.on('pointercancel',stop);
   add(center);
   add(txt(getSelectionLabel(),0,radius*.09,Math.max(8,radius*.13)));
 };
 draw();
 wheel.on('destroyed',()=>{if(holdTimer!==undefined)clearTimeout(holdTimer);});
 return wheel;
}
