import {Container,Sprite,Texture} from 'pixi.js';

/** Material library: cached, procedural high-resolution textures provide
 * visual depth without creating another 3D scene or physics body. Source
 * geometry, hit testing, and drawer animations stay in the Pixi tabletop. */
export type DrawerFinish='walnut'|'carved'|'maple'|'ebony'|'mahogany';
type Palette={base:string;highlight:string;deep:string;grain:string;
  liner:string;hardware:string;hardwareDark:string};
const PALETTES:Record<DrawerFinish,Palette>={
  walnut:{base:'#67452f',highlight:'#bb8854',deep:'#201710',
    grain:'#28180e',liner:'#132a26',hardware:'#d0ac70',hardwareDark:'#4f3c26'},
  carved:{base:'#99663e',highlight:'#dfaf72',deep:'#322015',
    grain:'#553319',liner:'#342629',hardware:'#e1c183',hardwareDark:'#72502c'},
  maple:{base:'#c8a16e',highlight:'#ffe2aa',deep:'#755337',
    grain:'#79543a',liner:'#32413b',hardware:'#d6bf94',hardwareDark:'#6d6556'},
  ebony:{base:'#343537',highlight:'#777271',deep:'#0d1013',
    grain:'#141819',liner:'#0c1c20',hardware:'#b7ada0',hardwareDark:'#464748'},
  mahogany:{base:'#813e30',highlight:'#c37a58',deep:'#2a1513',
    grain:'#421a13',liner:'#302027',hardware:'#d5a37c',hardwareDark:'#5c3430'}
};
export function drawerPalette(finish:string):Palette{
  return PALETTES[finish as DrawerFinish]??PALETTES.walnut;
}
const textureCache=new Map<string,Texture>();
function rng(seed:number){
  let n=seed>>>0;
  return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
}
function canvasOf(w:number,h:number,render:(ctx:CanvasRenderingContext2D)=>void):HTMLCanvasElement{
  const c=document.createElement('canvas'),pixelScale=3;
  c.width=Math.ceil(w*pixelScale);c.height=Math.ceil(h*pixelScale);
  const ctx=c.getContext('2d');
  if(ctx){ctx.setTransform(pixelScale,0,0,pixelScale,0,0);
    ctx.lineJoin='round';ctx.lineCap='round';render(ctx);}
  return c;
}
function path(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
function fillRound(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,
  fill:string|CanvasGradient){
  path(ctx,x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
}
function line(ctx:CanvasRenderingContext2D,x0:number,y0:number,x1:number,y1:number,
  color:string,width=1){
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function ringFastener(ctx:CanvasRenderingContext2D,x:number,y:number,light:string,dark:string,r=2.5){
  const shade=ctx.createRadialGradient(x-.9,y-1,.2,x+.6,y+.8,r+1.2);
  shade.addColorStop(0,'#ffedc3');shade.addColorStop(.22,light);
  shade.addColorStop(.67,dark);shade.addColorStop(1,'#181714');
  ctx.beginPath();ctx.arc(x,y,r+1,0,Math.PI*2);ctx.fillStyle='#090c0ca5';ctx.fill();
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=shade;ctx.fill();
  line(ctx,x-1,y+.4,x+1,y-.4,'#29201bbc',.7);
}
export function createDrawerBody(
  centerX:number,centerY:number,width:number,height:number,finish:string
):Sprite{
  const key=['drawer-body',finish,width.toFixed(2),height.toFixed(2)].join(':');
  let texture=textureCache.get(key);
  const W=width+24,H=height+24;
  if(!texture){
    const palette=drawerPalette(finish),rand=rng(71243+finish.length*1343);
    const canvas=canvasOf(W,H,ctx=>{
      // Ambient-occlusion/cast shadow: the wooden tray rests on the mat.
      ctx.shadowColor='#060b09c9';ctx.shadowBlur=8;
      ctx.shadowOffsetX=2;ctx.shadowOffsetY=5;
      fillRound(ctx,6,5,W-12,H-13,10,palette.deep);
      ctx.shadowColor='transparent';ctx.shadowBlur=0;
      ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
      // Thick solid-wood sidewalls, each face shaded like an actual bevel.
      const timber=ctx.createLinearGradient(5,0,W-5,0);
      timber.addColorStop(0,palette.deep);
      timber.addColorStop(.055,palette.highlight);
      timber.addColorStop(.18,palette.base);
      timber.addColorStop(.57,palette.base);
      timber.addColorStop(.84,palette.deep);
      timber.addColorStop(.94,palette.highlight);
      timber.addColorStop(1,palette.deep);
      fillRound(ctx,5,4,W-10,H-13,8,timber);
      // Deterministic curved end-grain fibers. Never animate/reseed on
      // selection or camera movement; the wood is one immutable object.
      ctx.save();
      path(ctx,6,5,W-12,H-16,8);ctx.clip();
      for(let k=0;k<185;k++){
        const x=5+rand()*(W-10),y0=rand()*H;
        const len=18+rand()*116,bend=(rand()-.5)*3;
        ctx.beginPath();ctx.moveTo(x,y0);
        ctx.bezierCurveTo(x+bend,y0+len*.25,
          x-bend*.5,y0+len*.70,x+(rand()-.5)*2,y0+len);
        ctx.strokeStyle=k%4===0?'#fff0c619':palette.grain+'37';
        ctx.lineWidth=k%11===0?1.45:.4+rand()*.4;
        ctx.stroke();
      }
      // A faint organic knot in each panel, not repeating horizontal stripes.
      for(const knot of [{x:8,y:H*.30},{x:W-8,y:H*.69}]){
        for(let j=0;j<3;j++){
          ctx.beginPath();ctx.ellipse(knot.x,knot.y,1.8+j*1.8,8+j*8,.05,0,Math.PI*2);
          ctx.strokeStyle=palette.grain+'30';ctx.lineWidth=.6;ctx.stroke();
        }
      }
      ctx.restore();
      // Warm beveled top and deep shadowed inner edge.
      path(ctx,5.5,4.5,W-11,H-14,8);
      ctx.strokeStyle='#fff3d067';ctx.lineWidth=1.7;ctx.stroke();
      path(ctx,8,7,W-16,H-20,6);
      ctx.strokeStyle=palette.deep;ctx.lineWidth=3;ctx.stroke();
      const wellX=14,wellY=15,wellW=W-28,wellH=H-35;
      fillRound(ctx,wellX-3,wellY-3,wellW+6,wellH+6,5,'#100e0d');
      const cavity=ctx.createLinearGradient(wellX,wellY,wellX+wellW,wellY);
      cavity.addColorStop(0,'#050807');
      cavity.addColorStop(.08,palette.liner);
      cavity.addColorStop(.5,palette.liner);
      cavity.addColorStop(.92,palette.liner);
      cavity.addColorStop(1,'#020706');
      fillRound(ctx,wellX,wellY,wellW,wellH,4,cavity);
      // Micro-fibered felt/suede liner, naturally darkened at the edges.
      ctx.save();path(ctx,wellX,wellY,wellW,wellH,4);ctx.clip();
      for(let j=0;j<1700;j++){
        const x=wellX+rand()*wellW,y=wellY+rand()*wellH;
        line(ctx,x,y,x+(rand()-.5)*1.1,y+rand()*1.2,
          j%3===0?'#c2c1a91b':'#030a081a',.35);
      }
      const vignette=ctx.createLinearGradient(0,wellY,0,wellY+wellH);
      vignette.addColorStop(0,'#00000082');
      vignette.addColorStop(.13,'#00000018');
      vignette.addColorStop(.84,'#00000011');
      vignette.addColorStop(1,'#000000a0');
      ctx.fillStyle=vignette;ctx.fillRect(wellX,wellY,wellW,wellH);
      ctx.restore();
      // Real inner wall with a light-catching lip and a dark cast shadow.
      line(ctx,wellX,wellY,wellX+wellW,wellY,'#fff4d452',1.45);
      line(ctx,wellX,wellY,wellX,wellY+wellH,'#dcb78545',1.15);
      line(ctx,wellX+wellW,wellY,wellX+wellW,wellY+wellH,'#030909cc',2.5);
      line(ctx,wellX,wellY+wellH,wellX+wellW,wellY+wellH,'#040708d5',2.4);
      // Joinery and inset corner hardware — physically sized, not stickers.
      for(const y of [11,H-20]){
        for(const x of [10,W-10]){
          ringFastener(ctx,x,y,palette.hardware,palette.hardwareDark,1.8);
        }
      }
      // Vertical brass pinstripe is nearly invisible until it catches light.
      line(ctx,10.8,19,10.8,H-26,palette.hardware+'38',.7);
      line(ctx,W-10.8,19,W-10.8,H-26,palette.hardware+'2c',.7);
    });
    texture=Texture.from(canvas);
    textureCache.set(key,texture);
  }
  const sprite=new Sprite(texture);
  sprite.x=centerX-W/2;sprite.y=centerY-H/2;
  sprite.width=W;sprite.height=H;
  sprite.eventMode='none';
  return sprite;
}
export function createDrawerHandle(side:-1|1,closed:boolean,finish:string):Container{
  const palette=drawerPalette(finish),key=['drawer-pull',finish,side,closed].join(':');
  let texture=textureCache.get(key);
  const W=38,H=76;
  if(!texture){
    const canvas=canvasOf(W,H,ctx=>{
      const cx=W/2;
      ctx.shadowColor='#060809ad';ctx.shadowBlur=6;ctx.shadowOffsetX=2;
      ctx.shadowOffsetY=3;
      const back=ctx.createLinearGradient(5,0,33,0);
      back.addColorStop(0,'#201a16');
      back.addColorStop(.17,palette.hardwareDark);
      back.addColorStop(.35,palette.hardware);
      back.addColorStop(.55,'#ffe6ad');
      back.addColorStop(.78,palette.hardwareDark);
      back.addColorStop(1,'#151414');
      fillRound(ctx,7,5,24,66,9,back);
      ctx.shadowColor='transparent';ctx.shadowBlur=0;
      ctx.shadowOffsetX=ctx.shadowOffsetY=0;
      path(ctx,7.6,5.6,22.8,64.8,8);
      ctx.strokeStyle='#f9dfa16e';ctx.lineWidth=1.2;ctx.stroke();
      const recess=ctx.createLinearGradient(10,0,27,0);
      recess.addColorStop(0,'#1b1613');
      recess.addColorStop(.45,palette.hardwareDark);
      recess.addColorStop(1,'#100d0b');
      fillRound(ctx,11,14,16,49,6,recess);
      // A sculpted raised loop handle, cast-shadow then reflective metal,
      // with a readable central void like actual machined drawer hardware.
      ctx.beginPath();ctx.ellipse(cx+1,38,8.4,18.2,0,0,Math.PI*2);
      ctx.strokeStyle='#050807a9';ctx.lineWidth=6.5;ctx.stroke();
      const metal=ctx.createLinearGradient(10,25,27,53);
      metal.addColorStop(0,palette.hardwareDark);
      metal.addColorStop(.18,palette.hardware);
      metal.addColorStop(.32,'#fff1ce');
      metal.addColorStop(.61,palette.hardware);
      metal.addColorStop(.85,palette.hardwareDark);
      metal.addColorStop(1,'#24201b');
      ctx.beginPath();ctx.ellipse(cx,36,7.8,17.5,0,0,Math.PI*2);
      ctx.strokeStyle=metal;ctx.lineWidth=4.2;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx-1,35,6.7,15.9,0,2.6,5.9);
      ctx.strokeStyle='#fff6d2a8';ctx.lineWidth=.85;ctx.stroke();
      for(const y of [11,65])ringFastener(ctx,cx,y,palette.hardware,palette.hardwareDark,2);
      // Tiny engraved inward/outward chevron inside the loop.
      const direction=closed?-side:side;
      ctx.beginPath();ctx.moveTo(cx-direction*3,35);
      ctx.lineTo(cx+direction*1.5,39);
      ctx.lineTo(cx-direction*3,43);
      ctx.strokeStyle='#ffedc7b8';ctx.lineWidth=1.5;ctx.stroke();
    });
    texture=Texture.from(canvas);
    textureCache.set(key,texture);
  }
  const handle=new Container();
  handle.addChild(new Sprite(texture));
  handle.children[0].position.set(-W/2,-H/2);
  handle.children[0].eventMode='none';
  return handle;
}
