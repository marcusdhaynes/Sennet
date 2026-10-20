import {Container, Graphics, Rectangle, Text} from 'pixi.js';

export type TomeDesign = 'tiny'|'dragon'|'journal'|'arcane'|'strapped';

const palettes: Record<TomeDesign, {leather:number;shadow:number;foil:number;edge:number;paper:number}> = {
  tiny:{leather:0x84383b,shadow:0x321c21,foil:0xe4b970,edge:0xb15d5a,paper:0xead7b6},
  dragon:{leather:0x15536c,shadow:0x081e2b,foil:0x9de7ee,edge:0x246980,paper:0xe8d9b8},
  journal:{leather:0x79283c,shadow:0x2c1024,foil:0xe49cb2,edge:0xa94c63,paper:0xe8d5b9},
  arcane:{leather:0x5a3a21,shadow:0x27170d,foil:0xf0d08a,edge:0x825735,paper:0xe9dabe},
  strapped:{leather:0x77452d,shadow:0x2c1b15,foil:0xc6a17a,edge:0xa06742,paper:0xead9b7}
};

/**
 * Project an actual three-dimensional book solid onto the playmat's 2.5D plane.
 * All cover, spine, page-block and edge vertices share one projection;
 * there are no unrelated flat rectangles masquerading as a book.
 * The returned local origin is the middle of its projected footprint.
 */
export function makePseudo3DBook(design:TomeDesign,width:number,height:number):Container{
  const c=palettes[design];
  const book=new Container();
  const thickness=Math.max(5.2,width*.105);
  const halfW=width/2,halfH=height/2;
  const project=(x:number,y:number,z:number)=>({
    x:x+y*.065-z*.075,
    y:y*.855+x*.033-z*.68
  });
  type Vertex=ReturnType<typeof project>;
  const quad=(gfx:Graphics,points:Vertex[],color:number,alpha=1)=>{
    gfx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)gfx.lineTo(points[i].x,points[i].y);
    gfx.closePath().fill({color,alpha});
    return gfx;
  };
  const outline=(gfx:Graphics,points:Vertex[],color:number,width=1,alpha=1)=>{
    gfx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)gfx.lineTo(points[i].x,points[i].y);
    gfx.closePath().stroke({color,width,alpha});
    return gfx;
  };
  const plane=(x0:number,y0:number,x1:number,y1:number,z:number)=>[
    project(x0,y0,z),project(x1,y0,z),project(x1,y1,z),project(x0,y1,z)
  ];
  const body=new Graphics();
  // A soft footprint only; the shadow cannot interfere with dragging.
  quad(body,plane(-halfW-3,-halfH+1,halfW+5,halfH+7,-2),0x080a0b,.30);
  // Solid back board: three distinct visible surfaces, not a 2D outline.
  quad(body,plane(-halfW,-halfH,halfW,halfH,0),c.shadow);
  quad(body,[
    project(-halfW,halfH,0),project(halfW,halfH,0),
    project(halfW,halfH,2.2),project(-halfW,halfH,2.2)
  ],c.edge);
  // Warm ivory page block sits between front and back boards.
  const pageLeft=-halfW+7,pageRight=halfW-3,pageTop=-halfH+3,pageBottom=halfH-4;
  const pageBase=2.2,pageTopZ=thickness-1.4;
  quad(body,plane(pageLeft,pageTop,pageRight,pageBottom,pageTopZ),c.paper);
  quad(body,[
    project(pageLeft,pageBottom,pageBase),project(pageRight,pageBottom,pageBase),
    project(pageRight,pageBottom,pageTopZ),project(pageLeft,pageBottom,pageTopZ)
  ],0xc9b38e);
  quad(body,[
    project(pageRight,pageTop,pageBase),project(pageRight,pageBottom,pageBase),
    project(pageRight,pageBottom,pageTopZ),project(pageRight,pageTop,pageTopZ)
  ],0xf3e3c5);
  // Fine individual page edges continue along the full fore edge.
  for(let i=1;i<7;i++){
    const z=pageBase+(pageTopZ-pageBase)*i/7;
    const a=project(pageLeft+2,pageBottom+.12,z);
    const b=project(pageRight-.5,pageBottom+.12,z);
    body.moveTo(a.x,a.y).lineTo(b.x,b.y)
      .stroke({color:i%2?0x9a8361:0xfff2d9,width:.43,alpha:.62});
  }
  // Hardcover overhangs the page block on all three free edges.
  quad(body,[
    project(-halfW,halfH,thickness-1.5),project(halfW,halfH,thickness-1.5),
    project(halfW,halfH,thickness+1),project(-halfW,halfH,thickness+1)
  ],c.edge);
  quad(body,[
    project(halfW,-halfH,thickness-1.5),project(halfW,halfH,thickness-1.5),
    project(halfW,halfH,thickness+1),project(halfW,-halfH,thickness+1)
  ],c.shadow);
  const topCover=plane(-halfW,-halfH,halfW,halfH,thickness+1);
  quad(body,topCover,c.leather);
  outline(body,topCover,c.shadow,1.3);
  // The binding is an extruded, convex spine with separate highlights.
  const spineWidth=Math.max(6,width*.10);
  quad(body,[
    project(-halfW,-halfH,.6),project(-halfW,halfH,.6),
    project(-halfW,halfH,thickness+1.9),project(-halfW,-halfH,thickness+1.9)
  ],c.shadow);
  quad(body,plane(-halfW,-halfH,-halfW+spineWidth,halfH,thickness+1.5),c.shadow);
  const binding=plane(-halfW+spineWidth*.60,-halfH+2,-halfW+spineWidth*.60+1.1,halfH-2,thickness+1.75);
  quad(body,binding,c.foil,.78);
  // Foil-inlaid cover has exactly the same vanishing geometry as the model.
  const inset=Math.max(6,width*.095);
  const border=plane(-halfW+inset,-halfH+inset*.68,halfW-inset*.75,halfH-inset*.72,thickness+1.15);
  outline(body,border,c.foil,.95,.90);
  const border2=plane(-halfW+inset+3,-halfH+inset*.68+4,halfW-inset*.75-3,halfH-inset*.72-4,thickness+1.2);
  outline(body,border2,c.foil,.37,.48);
  // Embossed clasp and filigree live on the modeled cover plane.
  const center=project(spineWidth*.25,-height*.055,thickness+1.55);
  const emblemRadius=Math.max(7,width*.135);
  body.ellipse(center.x,center.y,emblemRadius,emblemRadius*.86)
    .fill({color:c.shadow}).stroke({color:c.foil,width:1.25});
  body.ellipse(center.x,center.y,emblemRadius*.75,emblemRadius*.65)
    .stroke({color:c.foil,width:.6,alpha:.9});
  for(const x of [-halfW+inset+5,halfW-inset*.75-5]){
    for(const y of [-halfH+inset*.68+7,halfH-inset*.72-7]){
      const p=project(x,y,thickness+1.7);
      body.circle(p.x,p.y,1.55).fill({color:c.foil});
    }
  }
  if(design==='strapped'||design==='tiny'){
    for(const y of [-halfH+height*.21,halfH-height*.21]){
      quad(body,plane(-halfW+spineWidth*.8,y-3.3,halfW-1,y+3.3,thickness+1.8),
        c.shadow,.92);
      const p=project(halfW-width*.23,y,thickness+1.95);
      body.roundRect(p.x-3,p.y-3.1,6,6.2,1)
        .stroke({color:c.foil,width:1.3});
    }
  }
  book.addChild(body);
  const mark=new Text({text:design==='dragon'?'✦':design==='arcane'?'✧':'◆',
    style:{fontFamily:'Georgia, serif',fontSize:emblemRadius*1.55,fill:c.foil,
      fontWeight:'bold'}});
  mark.anchor.set(.5);mark.position.set(center.x,center.y-.4);
  book.addChild(mark);
  const captionPoint=project(spineWidth*.28,height*.29,thickness+2);
  const caption=new Text({text:'SENNET',resolution:2,
    style:{fontFamily:'Georgia, serif',fontSize:Math.max(6.5,width*.115),
      fontWeight:'bold',letterSpacing:1.1,fill:c.foil}});
  caption.anchor.set(.5);caption.position.set(captionPoint.x,captionPoint.y);
  caption.rotation=.025;
  book.addChild(caption);
  // Collision-free hit rectangle is exclusively for selecting this object.
  book.eventMode='static';book.cursor='grab';
  book.hitArea=new Rectangle(-width*.57,-height*.48,width*1.2,height*.98);
  return book;
}
