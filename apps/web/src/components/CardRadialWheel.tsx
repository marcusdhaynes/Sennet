import {useEffect,useRef,useState} from 'react';
import {RADIAL_ACTIONS,RADIAL_CATEGORIES,radialHit,type RadialAction} from '../lib/radialWheel.ts';

type Props={
 x:number;y:number;size:number;count:number;allLocked:boolean;pointerId:number|null;docked?:boolean;tapLabel?:'Tap'|'Untap';
 onChoose:(action:RadialAction)=>void;
 onCancel:()=>void;
};
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
function multiline(label:string){
 if(label==='Original')return ['Original'];
 if(label==='−50%'||label==='+50%')return [label];
 if(label==='Lock / Unlock')return ['Lock /','Unlock'];
 return [label];
}
export default function CardRadialWheel({x,y,size,count,allLocked,pointerId,onChoose,onCancel,docked=false,tapLabel='Tap'}:Props){
 const [dragOffset,setDragOffset]=useState<{x:number;y:number}|null>(null);
 const dragActive=useRef(false);
 const dragPoint=useRef<{id:number;x:number;y:number;originX:number;originY:number;startX:number;startY:number}|null>(null);
 const startDockDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
   if(!docked)return;
   event.preventDefault();event.stopPropagation();
   dragActive.current=true;
   dragPoint.current={id:event.pointerId,x:event.clientX,y:event.clientY,originX:x,originY:y,startX:event.clientX,startY:event.clientY};
   event.currentTarget.setPointerCapture(event.pointerId);
 };
 const dragDock=(event:React.PointerEvent<HTMLButtonElement>)=>{
   const d=dragPoint.current;if(!d||event.pointerId!==d.id)return;
   const nextX=d.originX+event.clientX-d.startX,nextY=d.originY+event.clientY-d.startY;
   setDragOffset({x:nextX,y:nextY});
 };
 const finishDockDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
   const d=dragPoint.current;if(!d||event.pointerId!==d.id)return;
   dragPoint.current=null;dragActive.current=false;
   // Let the wheel animate smoothly home rather than retaining its drop position.
   setDragOffset(null);
 };
 const [category,setCategory]=useState<number|null>(null);
 const [collapsed,setCollapsed]=useState(false);
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
                      (clientY-rect.top-rect.height/2)*400/rect.height);
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
 return <div className={'card-radial-wheel'+(collapsed?' is-collapsed':'')} style={{width:size,height:size,left:(dragOffset?.x??x)-size/2,top:(dragOffset?.y??y)-size/2,transition:dragOffset?'none':'left .38s cubic-bezier(.18,.82,.2,1), top .38s cubic-bezier(.18,.82,.2,1)'}}
  role="dialog" aria-label={'Selected '+count+' cards · radial action wheel'}
  onContextMenu={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}>
  <svg viewBox="0 0 400 400" role="img" aria-label="Position, Scale and State action wheel">
   <g className="sennet-radial-rings" aria-hidden={collapsed} style={{pointerEvents:collapsed?'none':'auto'}}>
   <circle cx={200} cy={200} r={198} fill="#0c1016" fillOpacity=".42"/>
   {RADIAL_CATEGORIES.map((name,i)=>{
    const mid=i*120+60,p=point(94,mid),active=category===i;
    return <g key={name} tabIndex={0} role="button" aria-label={name+' actions'}
     onPointerEnter={()=>{state.current.category=i;setCategory(i);}}
     onClick={()=>{state.current.category=i;setCategory(i);}}
     onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setCategory(i);state.current.category=i;}}}>
     <path d={sector(67,122,i*120,i*120+120)}
      fill={active?'#714db6':'#28203c'} stroke={active?'#d3beec':'#8f78ac'} strokeWidth={active?2.5:1.3}/>
     <text x={p.x} y={p.y+5} transform={i===0||i===2?`rotate(${i===0?60:-60} ${p.x} ${p.y})`:undefined} textAnchor="middle" fontSize="15" fontWeight="700" fill="#f9f4ff" pointerEvents="none">{name}</text>
    </g>;
   })}
   {RADIAL_CATEGORIES.map((group,i)=>Array.from({length:3},(_,j)=>{
    const act=RADIAL_ACTIONS[i][j],mid=i*120+j*40+20,p=point(157,mid);
    const actionLabel=act.id==='lock'&&allLocked?'Unlock':act.id==='tap-toggle'?tapLabel:act.label;
    const selected=category===i,hot=action===act.id;
    return <g key={act.id} aria-label={actionLabel} role="button" tabIndex={selected?0:-1}
      onPointerEnter={()=>{if(!selected){setCategory(i);state.current.category=i;}state.current.action=act.id;setAction(act.id);}}
      onClick={e=>{e.stopPropagation();onChoose(act.id);}}
      onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selected){e.preventDefault();onChoose(act.id);}}}
      style={{pointerEvents:'auto'}}>
     <path d={sector(127,192,i*120+j*40,i*120+(j+1)*40)}
      fill={hot?'#9472d8':selected?'#382853':'#120e1b'}
      stroke={hot?'#f4e2ff':selected?'#9077b1':'#443556'}
      strokeWidth={hot?2.8:1.4}/>
     {<text x={p.x} y={p.y-(multiline(actionLabel).length-1)*7}
       textAnchor="middle" fontSize="12" fontWeight="700" fill="#f8f3ff" pointerEvents="none">
       {multiline(actionLabel).map((s,k)=><tspan key={s} x={p.x} dy={k?14:0}>{s}</tspan>)}
     </text>}
    </g>;
   }))}
   </g>
   <g className="sennet-radial-center" role="button" tabIndex={0} aria-label={collapsed?'Hold to expand wheel':'Hold to collapse wheel'}
     onPointerDown={e=>{e.stopPropagation();clearCenterTimer();const startX=e.clientX,startY=e.clientY;
       centerTimer.current=window.setTimeout(()=>{setCollapsed(v=>!v);clearHighlight();centerTimer.current=null;},450);
       const move=(ev:PointerEvent)=>{if(ev.pointerId===e.pointerId&&Math.hypot(ev.clientX-startX,ev.clientY-startY)>12)clearCenterTimer();};
       const finish=(ev:PointerEvent)=>{if(ev.pointerId===e.pointerId){clearCenterTimer();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);}};
       window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
     }}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setCollapsed(v=>!v);clearHighlight();}}}>
   <circle cx="200" cy="200" r="64" fill="#1c142c" stroke="#baa2d2" strokeWidth="2"/>
   <text x="200" y="190" fill="#fff6e9" fontWeight="800" fontSize="24" textAnchor="middle">{count}</text>
   <text x="200" y="207" fill="#dfcaea" fontSize="14" textAnchor="middle">{count===1?'CARD SELECTED':'CARDS SELECTED'}</text>
   <text x="200" y="224" fill="#bca9c9" fontSize="14" textAnchor="middle">{collapsed?'Hold to expand':category===null?'Hold to shrink':RADIAL_CATEGORIES[category]}</text>
   </g>
  </svg>
  {docked&&<button className="sennet-radial-drag-handle" type="button" aria-label="Move radial wheel" title="Drag to move wheel" onPointerDown={startDockDrag} onPointerMove={dragDock} onPointerUp={finishDockDrag} onPointerCancel={finishDockDrag}>⠿</button>}
  {!docked&&<button className="card-radial-close" type="button" aria-label="Close wheel" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onCancel();}}>×</button>}
 </div>;
}
