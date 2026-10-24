import {useEffect,useRef,useState} from 'react';
import {RADIAL_ACTIONS,RADIAL_CATEGORIES,radialHit,type RadialAction} from '../lib/radialWheel.ts';

type Props={
 x:number;y:number;size:number;count:number;allLocked:boolean;pointerId:number|null;docked?:boolean;half?:boolean;tapLabel?:'Tap'|'Untap';
 onChoose:(action:RadialAction)=>void;
 onCancel:()=>void;
 onMoveDock?:(position:{x:number;y:number})=>void;
 onExpandedChange?:(expanded:boolean)=>void;
};
// Vector-traced from the supplied white-arrow stacked-cards icon. Using a
// path (not a background-filled image) keeps the icon transparent and crisp
// in State's dark wedge at any radial size.
const SHUFFLE_DECK_ICON_PATH='M84,47 72,58 52,80 34,77 9,70 4,76 4,89 5,91 45,102 50,102 84,65Z M49,91 51,92 50,99 48,98Z M20,91 24,90 36,93 39,96 36,97 21,93Z M8,83 11,82 16,84 20,84 44,90 45,92 40,93 31,90 27,90 11,86Z M80,62 81,65 56,91 55,88Z M82,55 76,63 51,89 6,78 7,76 12,76 33,82 51,85 80,54Z M96,43 88,51 87,54 95,46Z M85,38 45,30 8,67 50,77 85,40Z M82,40 50,75 46,75 14,67 12,65 45,32 80,38Z M77,41 47,35 17,64 49,72Z M61,29 61,30 85,34 88,37 88,39 92,35Z M55,28 55,29 57,29 60,26 66,26 95,32 97,34 87,45 87,47 100,34 99,31 60,24Z M16,20 13,20 5,30 1,40 0,47 3,46 3,41 7,31Z M90,21 84,15 74,10 63,8 50,9 41,12 31,18 19,30 12,41 10,38 8,39 11,46 19,45 20,43 19,42 16,43 15,41 23,29 37,17 52,11 72,12 81,16 88,22Z M45,4 49,5 54,3 68,3 75,5 75,3 63,0 52,1Z';
// White vector trace of the user-supplied hands-revealing-a-card icon.
// Its transparent path contains no eye glyph or background square.
const REVEAL_HANDS_ICON_PATH='M0,226 L0,230 L3,234 L10,234 L24,203 L34,189 L51,173 L69,162 L88,155 L103,152 L163,152 L171,158 L174,164 L173,173 L167,180 L163,182 L112,182 L108,184 L106,188 L109,204 L121,219 L136,226 L200,227 L207,234 L207,242 L202,248 L197,250 L177,250 L173,253 L173,260 L177,263 L184,264 L189,269 L191,275 L188,282 L183,286 L162,286 L156,290 L156,296 L159,299 L166,300 L172,305 L174,310 L173,316 L167,322 L143,323 L139,327 L140,334 L152,338 L156,343 L157,349 L152,357 L149,359 L21,359 L15,363 L15,368 L19,372 L151,372 L161,367 L167,360 L170,351 L167,336 L176,332 L185,321 L187,309 L184,300 L195,294 L202,284 L204,274 L201,263 L211,258 L219,247 L219,226 L293,227 L291,232 L292,247 L300,258 L310,263 L307,274 L309,284 L316,294 L327,300 L324,309 L326,321 L335,332 L344,336 L341,345 L342,355 L346,363 L353,369 L360,372 L492,372 L496,368 L496,363 L490,359 L423,358 L426,348 L424,338 L415,327 L406,323 L409,312 L406,299 L400,292 L389,286 L392,277 L391,267 L384,256 L372,250 L375,242 L373,227 L393,226 L405,249 L416,260 L432,269 L455,273 L460,270 L461,265 L457,260 L444,259 L431,254 L414,239 L405,218 L405,188 L403,184 L399,182 L348,182 L338,173 L338,161 L348,152 L408,152 L433,158 L460,173 L476,188 L487,203 L499,232 L504,235 L508,234 L511,230 L511,226 L500,199 L489,183 L477,170 L463,159 L432,144 L410,139 L343,140 L334,145 L326,156 L324,171 L327,182 L184,182 L187,171 L185,156 L177,145 L168,140 L101,139 L73,146 L56,154 L34,170 L11,199Z M354,346 L357,340 L364,336 L403,336 L411,342 L412,352 L404,359 L362,359 L356,354Z M337,310 L343,301 L349,299 L384,299 L390,301 L394,305 L396,312 L394,317 L389,322 L348,323 L344,322 L338,316Z M320,275 L322,269 L330,263 L369,263 L376,267 L379,274 L377,281 L371,286 L328,286 L323,282Z M304,234 L308,229 L316,226 L350,226 L356,228 L361,233 L362,240 L359,246 L352,250 L314,250 L305,244Z M279,196 L391,195 L392,212 L280,213Z M245,196 L265,195 L266,212 L246,213Z M121,196 L231,195 L232,212 L138,213 L131,210 L123,202Z';
/** Three illustrated Scale tools, drawn like Shuffle rather than font glyphs.
 * All remain visual-only: the existing radial sectors own pointer events. */
function ScaleCardIcon({kind}:{kind:'scale-bigger'|'scale-smaller'|'scale-original'}){
 const common={fill:'none',stroke:'#ffffff',strokeWidth:4.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 if(kind==='scale-bigger')return <g {...common}>
  <rect x="8" y="32" width="32" height="42" rx="3" transform="rotate(-10 24 53)" strokeOpacity=".65"/>
  <rect x="35" y="19" width="40" height="53" rx="4" fill="#ffffff" fillOpacity=".13"/>
  <rect x="42" y="27" width="26" height="37" rx="2" strokeWidth="2.8" strokeOpacity=".9"/>
  <path d="M57 19 83 5 M68 5h15v15" strokeWidth="5.8"/>
  <path d="M83 43v20 M73 53h20" strokeWidth="6.8"/>
 </g>;
 if(kind==='scale-smaller')return <g {...common}>
  <rect x="8" y="8" width="47" height="60" rx="4" fill="#ffffff" fillOpacity=".14"/>
  <rect x="15" y="15" width="33" height="46" rx="2" strokeWidth="2.7" strokeOpacity=".9"/>
  <rect x="49" y="42" width="31" height="40" rx="3"/>
  <path d="M74 13 50 36 M50 23v13h14" strokeWidth="5.8"/>
  <path d="M11 82h23" strokeWidth="6.2"/>
 </g>;
 return <g {...common}>
  <rect x="23" y="20" width="49" height="63" rx="4" fill="#ffffff" fillOpacity=".13"/>
  <rect x="30" y="27" width="35" height="49" rx="2" strokeWidth="2.8"/>
  <path d="M13 38 A38 38 0 0 1 84 30" strokeWidth="5.8"/>
  <path d="m70 27 17 5 1-18" strokeWidth="5.8"/>
  <path d="M40 47h16 M40 55h16" strokeWidth="4.6"/>
 </g>;
}
const cx=200,cy=200;
// Uniform type across all categories and all actions; smaller outer
// text stays inside the narrowest 40-degree wedge at compact sizes.
function point(radius:number,angle:number){
 const radians=angle*Math.PI/180;
 return {x:cx+Math.sin(radians)*radius,y:cy-Math.cos(radians)*radius};
}
function sector(inside:number,outside:number,a:number,b:number){
 const start=point(outside,a+0.4),end=point(outside,b-0.4),
  innerEnd=point(inside,b-0.4),innerStart=point(inside,a+0.4);
 const large=b-a>180?1:0;
 return ['M',start.x,start.y,'A',outside,outside,0,large,1,end.x,end.y,
  'L',innerEnd.x,innerEnd.y,'A',inside,inside,0,large,0,innerStart.x,innerStart.y,'Z'].join(' ');
}
export default function CardRadialWheel({x,y,size,count,allLocked,pointerId,onChoose,onCancel,docked=false,half=false,tapLabel='Tap',onMoveDock,onExpandedChange}:Props){
 const [dragOffset,setDragOffset]=useState<{x:number;y:number}|null>(null);
 const [category,setCategory]=useState<number|null>(null);
 const [collapsed,setCollapsed]=useState(false);
 const toggleCollapsed=()=>{
   const next=!collapsed;
   setCollapsed(next);
   onExpandedChange?.(!next);
 };
 const centerTimer=useRef<number|null>(null);
 const clearCenterTimer=()=>{if(centerTimer.current!==null){window.clearTimeout(centerTimer.current);centerTimer.current=null;}};
 const clearHighlight=()=>{state.current.category=null;state.current.action=null;setCategory(null);setAction(null);};
 useEffect(()=>{const outside=(event:PointerEvent)=>{
  if(!(event.target instanceof Node)||!document.querySelector('.card-radial-wheel')?.contains(event.target))clearHighlight();
 };document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[]);
 useEffect(()=>()=>clearCenterTimer(),[]);
 const [action,setAction]=useState<RadialAction|null>(null);
 const state=useRef({category:null as number|null,action:null as RadialAction|null});
 const track=(clientX:number,clientY:number)=>{
  const rect=document.querySelector('.card-radial-wheel')?.getBoundingClientRect();
  if(!rect)return;
  const hit=radialHit((clientX-rect.left-rect.width/2)*400/rect.width,
                      half?(clientY-rect.top)*200/rect.height:(clientY-rect.top-rect.height/2)*400/rect.height);
  if(hit.category!==null){
   state.current.category=hit.category;
   setCategory(hit.category);
  }
  // Crossing the inner ring reveals its group; the outer ring highlights
  // exactly one action, and lifting anywhere else does nothing.
  state.current.action=hit.ring==='outer'?hit.action:null;
  setAction(state.current.action);
 };
 useEffect(()=>{
  if(pointerId===null)return;
  const move=(event:PointerEvent)=>{
   if(event.pointerId===pointerId)track(event.clientX,event.clientY);
  };
  const up=(event:PointerEvent)=>{
   if(event.pointerId!==pointerId)return;
   track(event.clientX,event.clientY);
   const selected=state.current.action;
   // Releasing a held pointer only highlights an action. The wheel
   // remains open until a deliberate click, X, or outside click.
   void selected;
   // Release over the inner ring keeps the wheel available for tapping.
  };
  const cancel=(event:PointerEvent)=>{
   // Browser touch-gesture cancellation is not an explicit request to
   // close the wheel. Keep it open for a subsequent deliberate tap.
   if(event.pointerId===pointerId){state.current.action=null;setAction(null);}
  };
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',cancel);
  return()=>{
   window.removeEventListener('pointermove',move);
   window.removeEventListener('pointerup',up);
   window.removeEventListener('pointercancel',cancel);
  };
 // Wheel open is tied to one held pointer; visual state is local.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[pointerId,onChoose,onCancel]);
 return <div className={'card-radial-wheel'+(collapsed?' is-collapsed':'')+(half?' is-half':'')} style={{width:size,height:half?size/2:size,left:(dragOffset?.x??x)-size/2,top:half?y:(dragOffset?.y??y)-size/2,transition:half||dragOffset?'none':'left .38s cubic-bezier(.18,.82,.2,1), top .38s cubic-bezier(.18,.82,.2,1)'}}
  role="dialog" aria-label={'Selected '+count+' cards · radial action wheel'}
  onContextMenu={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}>
  <svg viewBox={half?"0 200 400 200":"0 0 400 400"} role="img" aria-label="Position, Scale and State action wheel">
   <g className="sennet-radial-rings" aria-hidden={collapsed} style={{pointerEvents:collapsed?'none':'auto'}}>
   <circle cx={200} cy={200} r={198} fill="#0c1016" fillOpacity=".42"/>
   {RADIAL_CATEGORIES.map((name,i)=>{
    const mid=half?90+i*60+30:i*120+60,p=point(94,mid),active=category===i;
    return <g key={name} tabIndex={0} role="button" aria-label={name+' actions'}
     onPointerEnter={()=>{state.current.category=i;setCategory(i);}}
     onClick={()=>{state.current.category=i;setCategory(i);}}
     onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setCategory(i);state.current.category=i;}}}>
     <path d={sector(67,122,half?90+i*60:i*120,half?150+i*60:i*120+120)}
      fill={active?'#714db6':'#28203c'} stroke={active?'#d3beec':'#8f78ac'} strokeWidth={active?2.5:1.3}/>
     <text x={p.x} y={p.y+5} transform={i===0||i===2?`rotate(${half?(i===0?-45:45):(i===0?60:-60)} ${p.x} ${p.y})`:undefined} textAnchor="middle" fontSize="22.5" fontWeight="700" fill="#f9f4ff" pointerEvents="none">{name}</text>
    </g>;
   })}
   {RADIAL_CATEGORIES.map((group,i)=>Array.from({length:3},(_,j)=>{
    const act=RADIAL_ACTIONS[i][j],mid=half?90+i*60+j*20+10:i*120+j*40+20,p=point(157,mid);
    const actionLabel=act.id==='tap-toggle'?tapLabel:act.label;
     const help=act.id==='reveal'?'Reveal':act.id==='flip'?'Flip':act.id==='shuffle'?'Shuffle':act.id==='scale-bigger'?'Increase':act.id==='scale-smaller'?'Decrease':act.id==='scale-original'?'Original':actionLabel;
    const selected=category===i,hot=action===act.id;
    // Compared with the previous 18px radial text: State/Scale symbols are
    // 3× (54px); the three Position commands are 2× (36px).
    const glyphSize=i===0?36:54;
    return <g key={act.id} aria-label={help} role="button" tabIndex={selected?0:-1}
      onPointerEnter={()=>{if(!selected){setCategory(i);state.current.category=i;}state.current.action=act.id;setAction(act.id);}}
      onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(!collapsed)onChoose(act.id);}}
      onClick={e=>{e.preventDefault();e.stopPropagation();}}
      onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selected){e.preventDefault();onChoose(act.id);}}}
      style={{pointerEvents:'auto'}}>
     <path d={sector(127,192,half?90+i*60+j*20:i*120+j*40,half?90+i*60+(j+1)*20:i*120+(j+1)*40)}
      fill={hot?'#9472d8':selected?'#382853':'#120e1b'}
      stroke={hot?'#f4e2ff':selected?'#9077b1':'#443556'}
      strokeWidth={hot?2.8:1.4}/>
     {act.id==='shuffle'
       ? <svg x={p.x-(half?24:33)} y={p.y-(half?24:33)}
           width={half?48:66} height={half?48:66}
           viewBox="0 0 104 106" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <path d={SHUFFLE_DECK_ICON_PATH} fill="#fff"
             fillRule="evenodd" stroke="#fff" strokeWidth=".35" strokeLinejoin="round"/>
         </svg>
       : act.id==='reveal'
       ? <svg x={p.x-(half?25:35)} y={p.y-(half?16:23)}
           width={half?50:70} height={half?32:46}
           viewBox="0 105 512 300" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <path d={REVEAL_HANDS_ICON_PATH} fill="#fff" fillRule="evenodd"/>
         </svg>
       : (act.id==='scale-bigger'||act.id==='scale-smaller'||act.id==='scale-original')
       ? <svg x={p.x-(half?26:35)} y={p.y-(half?26:35)}
           width={half?52:70} height={half?52:70}
           viewBox="0 0 100 100" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <ScaleCardIcon kind={act.id}/>
         </svg>
       : act.id==='flip'
       ? <svg x={p.x-(half?26:35)} y={p.y-(half?26:35)}
           width={half?52:70} height={half?52:70}
           viewBox="0 0 100 100" role="img" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           {/* A face-down card turns over into a face-up card. The single
               curved return arrow reads as flipping, not deck shuffling. */}
           <g stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
             <rect x="49" y="30" width="37" height="49" rx="4"
               fill="none" strokeWidth="5" transform="rotate(12 67.5 54.5)"/>
             <path d="M37 20 61 26 61 78 37 72Z"
               fill="#fff" strokeWidth="3.2"/>
             <path d="M32 24 42 20 42 73 32 77Z" fill="#fff"
               strokeWidth="2.5"/>
             <path d="M22 24C29 8 60 5 76 20" fill="none"
               strokeWidth="6"/>
             <path d="m60 17 19 7-2-19" fill="none"
               strokeWidth="6"/>
             <path d="M55 43 71 47M55 51 67 54" fill="none"
               strokeWidth="3.2" opacity=".95"/>
           </g>
         </svg>
       : <text x={p.x} y={p.y}
           textAnchor="middle" dominantBaseline="central"
           fontSize={glyphSize} fontWeight="700"
           textLength={half&&i===0?49:undefined}
           lengthAdjust={half&&i===0?'spacingAndGlyphs':undefined}
           fill="#f8f3ff" stroke="#20172f" strokeWidth=".6"
           paintOrder="stroke" pointerEvents="none">{actionLabel}</text>}
    </g>;
   }))}
   </g>
   <g className="sennet-radial-center" role="button" tabIndex={0} aria-label={collapsed?'Hold to expand the action radial':'Hold to collapse the action radial'}
     onPointerDown={e=>{e.stopPropagation();clearCenterTimer();const startX=e.clientX,startY=e.clientY;
       e.preventDefault();
       // After a stationary hold collapses the wheel, movement of the
       // same held pointer must NOT start a drag or pan the table.
       let moved=false,longHeld=false;
       centerTimer.current=window.setTimeout(()=>{
         longHeld=true;toggleCollapsed();clearHighlight();centerTimer.current=null;
       },450);
       const bound=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
       const bounds=()=>({x:Math.max(size/2,window.innerWidth-size/2),y:Math.max(size/2,window.innerHeight-size/2)});
       const move=(ev:PointerEvent)=>{
         if(ev.pointerId!==e.pointerId)return;
         ev.stopImmediatePropagation();ev.preventDefault();
         if(longHeld)return; // Collapse consumes the pointer until release.
         const dx=ev.clientX-startX,dy=ev.clientY-startY;
         if(Math.hypot(dx,dy)>6)moved=true;
         if(moved){
           clearCenterTimer();
           if(docked&&!half){
             const max=bounds();
             setDragOffset({x:bound(x+dx,size/2,max.x),y:bound(y+dy,size/2,max.y)});
           }
         }
       };
       const cleanup=()=>{
         window.removeEventListener('pointermove',move,true);
         window.removeEventListener('pointerup',finish,true);
         window.removeEventListener('pointercancel',finish,true);
       };
       const finish=(ev:PointerEvent)=>{
         if(ev.pointerId!==e.pointerId)return;
         ev.stopImmediatePropagation();ev.preventDefault();
         clearCenterTimer();cleanup();
         if(!longHeld&&docked&&!half&&moved){
           const max=bounds();
           const position={x:bound(x+ev.clientX-startX,size/2,max.x),y:bound(y+ev.clientY-startY,size/2,max.y)};
           const home={x:bound(window.innerWidth-88,size/2,max.x),y:bound(window.innerHeight-88,size/2,max.y)};
           // Home magnet is six pixels only; all other in-bounds placements persist.
           onMoveDock?.(Math.hypot(position.x-home.x,position.y-home.y)<=6?home:position);
         }
         setDragOffset(null);
       };
       // Capture before the playmat's pan/zoom handlers see this pointer.
       window.addEventListener('pointermove',move,{capture:true,passive:false});
       window.addEventListener('pointerup',finish,{capture:true,passive:false});
       window.addEventListener('pointercancel',finish,{capture:true,passive:false});
     }}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleCollapsed();clearHighlight();}}}>
   <circle cx="200" cy="200" r="64" fill="#1c142c" stroke="#ad94cf" strokeWidth={collapsed?5:3}/>
   <text x="200" y={half?225:201} fill="#fff6e9" fontWeight="800" fontSize={half?21:22} textAnchor="middle">{count} Selected</text>
   </g>
  </svg>
  

 </div>;
}
