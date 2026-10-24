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
 // All three operators use symmetric vector strokes about the card's exact
 // center (50,50). Font glyph ascenders and baselines cannot shift them.
 const symbol=kind==='scale-bigger'
  ? 'M50 36V64 M36 50H64'
  : kind==='scale-smaller'
    ? 'M36 50H64'
    : 'M36 43H64 M36 57H64';
 return <g stroke="#fff" strokeLinejoin="round">
  <rect x="22" y="10" width="56" height="80" rx="6"
    fill="#fff" fillOpacity=".08" strokeWidth="5"/>
  <path d={symbol} fill="none" strokeWidth="7"
    strokeLinecap="round"/>
 </g>;
}
// High-contrast, transparent vector trace of the supplied +45° angle icon.
// Kept separate from the rotate-ccw symbol and the radial hit-test model.
const ROTATE_45_CLOCKWISE_ICON_PATH='M50.4,63.3 49.9,70.4 51.9,70.9 53.2,70 54.7,70.1 55.9,71.3 56,72.8 55.7,73.5 54.2,74.5 52.6,74.3 51.6,73.1 49.5,73.9 49.5,74.4 50.4,75.7 52.4,76.7 54.3,76.8 56.1,76.3 57.4,75.3 58.3,73.8 58.5,71.2 58.2,70.2 57.2,68.8 56,68.1 53.7,67.9 52.5,68.3 52.7,65.5 57.6,65.5 57.6,63.3Z M44.4,63.3 37.9,71.2 37.8,73.4 44.3,73.4 44.4,76.5 46.9,76.5 46.9,73.5 48.5,73.4 48.5,71.3 46.9,71.2 46.9,63.3Z M44.3,67 44.4,71.2 41,71.3 40.9,70.9Z M61.5,62.8 59.8,63.9 59.3,65.9 60.5,67.8 62.6,68.2 64.3,67.1 64.7,64.9 63.4,63.1Z M61.8,64 62.7,64.2 63.4,65 63.4,66 62.4,67 61.3,66.8 60.6,65.9 60.8,64.7Z M88.1,10.3 86.7,9.5 84.6,10 5.4,87.6 5,88.5 5.3,89.7 6.5,90.5 93.3,90.5 94.3,90 94.9,89 94.8,87.7 93.1,86.5 69.6,86.4 74.9,82.6 74.7,81.9 72.6,81.2 73.9,73.8 73.8,68.4 72.7,62.7 71.2,58.4 69.3,54.8 66.3,50.7 63.7,48.1 66.1,45.9 66.1,45.4 58.7,43.9 57.8,44.1 57.2,45.1 59.3,52.2 60.1,52.5 61.7,50 63.7,51.8 67.7,57.3 70.5,64.3 71.4,70.1 71.3,74.8 70.7,78.4 70.1,80.3 67.5,79.2 66.9,79.5 68.5,86.5 12.5,86.5 88.2,12.7 88.5,11.2Z';
// Vector-traced directly from the supplied white 45° closing icon.
// The independent path preserves the pair of closing arrows and the angle.
const ROTATE_45_COUNTERCLOCKWISE_ICON_PATH='M40.6,59.1 L40.3,64.2 L41.9,64.3 L42.7,63.8 L43.7,63.7 L44.7,64.4 L44.8,66 L43.7,67.1 L42.4,66.9 L41.8,66 L40,66.1 L40.5,67.4 L41.8,68.4 L44.7,68.4 L46.4,66.9 L46.8,65.7 L46.6,64.3 L46.2,63.3 L45.3,62.5 L43.1,62.3 L42.2,62.8 L42.2,60.5 L46.1,60.4 L46.2,59.1Z M36.2,59.1 L32.2,65.1 L32.2,66.5 L36.3,66.6 L36.4,68.4 L38.1,68.5 L38.1,66.7 L39.4,66.6 L39.4,65.2 L38.1,65.1 L38.1,59.1Z M36.4,60.9 L36.4,65.1 L33.8,65.2Z M49,59.1 L48,60.1 L48,61.9 L49.2,63 L50.6,63 L51.8,62 L51.8,60 L50.6,59Z M49.4,59.9 L50.3,59.9 L51,60.5 L51,61.4 L50,62.2 L49.4,62.1 L48.8,61.3 L48.8,60.6Z M91.8,54.7 L90.4,55.3 L86.3,61.9 L86.4,62.8 L86.8,63.2 L88,63.3 L90.8,59.7 L90.7,64.4 L89.4,68.9 L88.2,71.4 L85.7,74.8 L79.8,80.1 L79.7,81 L80.2,81.8 L81.7,81.7 L84.5,79.5 L87.5,76.4 L89.8,73.5 L91.2,70.9 L92.4,67.7 L93.1,64.4 L93.2,61.5 L94.9,63.4 L95.8,63.4 L96.5,62.9 L96.6,62 L92.6,55.3Z M61.1,21.4 L60.2,21 L58.8,21.3 L3.5,76.7 L3.2,77.4 L3.5,78.7 L4.6,79.3 L69.4,79.1 L70,78.4 L70.2,77.2 L69.4,76.2 L68.6,76 L9,75.9 L61.2,23.7 L61.5,22.3Z M67.2,18.1 L66.8,19.2 L67.4,20.1 L72.2,22.6 L76.8,25.6 L80.1,28.4 L83.4,31.9 L87,37.7 L88.3,42 L85.5,39.5 L84.4,39.7 L83.9,40.9 L89.3,47.1 L90.7,47.2 L91.2,46.6 L94.2,40 L94.1,38.7 L93.5,38.2 L92.3,38.5 L90.8,41.5 L89.4,37.2 L87.4,33.3 L84.7,29.6 L81.6,26.4 L77.6,23.1 L74,20.8 L68.7,18Z';
// White silhouette traced from the supplied card-tapping/turning icon.
// Behind it, two muted dashed outlines depict the card's prior orientation.
const TAP_CARD_ICON_PATH='M242.0,400.0 L239.0,410.0 L239.0,644.0 L246.0,661.0 L265.0,677.0 L381.0,681.0 L749.0,680.0 L770.0,670.0 L781.0,655.0 L784.0,645.0 L784.0,411.0 L773.0,389.0 L756.0,377.0 L274.0,375.0 L254.0,384.0Z M269.0,413.0 L280.0,404.0 L743.0,404.0 L755.0,417.0 L754.0,642.0 L743.0,651.0 L280.0,651.0 L268.0,638.0Z M286.0,432.0 L284.0,616.0 L290.0,628.0 L299.0,634.0 L721.0,635.0 L737.0,623.0 L739.0,439.0 L734.0,428.0 L724.0,421.0 L302.0,420.0Z M295.0,438.0 L302.0,431.0 L720.0,431.0 L728.0,439.0 L728.0,617.0 L721.0,624.0 L303.0,624.0 L295.0,616.0Z M431.0,484.0 L414.0,516.0 L416.0,547.0 L434.0,574.0 L469.0,595.0 L503.0,602.0 L554.0,595.0 L588.0,575.0 L607.0,547.0 L610.0,521.0 L601.0,496.0 L582.0,475.0 L554.0,460.0 L520.0,453.0 L487.0,455.0 L457.0,465.0Z M430.0,513.0 L450.0,487.0 L471.0,475.0 L499.0,468.0 L524.0,468.0 L552.0,475.0 L573.0,487.0 L593.0,513.0 L595.0,534.0 L586.0,555.0 L566.0,573.0 L531.0,586.0 L492.0,586.0 L457.0,573.0 L437.0,555.0 L428.0,534.0Z M330.0,264.0 L332.0,277.0 L348.0,282.0 L392.0,244.0 L448.0,214.0 L503.0,200.0 L559.0,199.0 L601.0,207.0 L636.0,220.0 L675.0,243.0 L706.0,271.0 L649.0,259.0 L640.0,268.0 L645.0,284.0 L735.0,309.0 L744.0,309.0 L753.0,300.0 L732.0,215.0 L725.0,201.0 L712.0,199.0 L705.0,204.0 L706.0,232.0 L679.0,212.0 L639.0,191.0 L595.0,177.0 L556.0,171.0 L490.0,174.0 L433.0,190.0 L375.0,222.0Z';
// Exact vector trace of the supplied curling-card Flip artwork.
// Transparent silhouette; interior voids preserve the original illustration.
const FLIP_CARD_ICON_PATH='M76.89,30.98 76.62,31.07 76.27,32.76 76.27,35.96 76.53,38.18 78.22,47.07 78.49,50.44 78.4,54.71 77.78,58.53 76.89,61.47 75.47,64.67 73.42,67.87 90.58,56.13 92.53,54.09 93.16,52.4 93.07,50.62 92.27,49.02 86.58,42.8Z M96,50 95.64,48.67 94.67,46.98 88.53,40.04 79.73,29.29 78.93,28.49 77.87,27.87 76.27,27.69 74.76,28.31 73.78,29.47 73.24,30.8 72.89,33.02 73.07,37.56 74.93,48.4 74.67,48.67 73.42,49.11 69.51,48.93 61.07,47.69 47.11,45.2 45.42,45.29 13.33,61.11 4.98,65.02 4.27,65.64 4,66.18 4,66.98 4.71,67.96 5.6,68.31 36.18,74.53 53.07,78.18 55.82,78.53 57.6,78 65.07,73.29 68.71,70.44 70.93,68.22 72.09,66.8 73.42,64.76 74.84,61.91 75.82,59.07 76.44,56.22 76.71,53.64 76.71,49.91 76.27,45.73 74.67,37.47 74.49,33.02 75.02,30.36 75.73,29.47 76.27,29.2 77.33,29.29 78.31,30 88.71,42.71 93.96,48.4 94.67,49.82 94.93,50.89 94.93,52.58 94.4,54.18 95.2,53.38 95.64,52.58 96,51.24Z M75.11,50.62 75.02,54.71 74.4,58.18 73.16,61.73 71.29,64.93 69.87,66.71 66.76,69.56 62.58,72.49 56.18,76.31 54.67,76.31 19.91,69.02 8,66.36 8.18,65.82 45.96,47.07 46.58,46.98 56.89,48.84 68.44,50.62 71.38,50.89 73.33,50.89 74.93,50.44Z M68,58.36 67.64,57.56 66.31,56.4 64.71,55.69 62.76,55.16 57.69,54.53 53.6,54.53 50.22,54.8 46.84,55.33 43.02,56.22 38.04,58 35.73,59.24 33.96,60.76 33.24,62 33.16,63.07 33.78,64.31 35.11,65.29 36.71,65.91 39.02,66.44 43.47,66.89 48.36,66.8 51.73,66.44 58.04,65.2 63.2,63.42 65.69,62.09 67.11,60.93 68,59.51Z M66.49,58.53 66.4,59.51 65.33,60.67 62.58,62.27 57.78,63.96 52.27,65.11 46.04,65.64 40.18,65.38 36.71,64.58 35.38,63.87 34.67,62.98 34.67,62.36 34.93,61.73 36,60.67 39.11,58.89 43.73,57.29 49.51,56.13 55.2,55.69 60.89,56.04 64.44,56.93 65.78,57.64Z M73.87,52.31 71.73,52.4 66.49,51.87 48.44,48.84 47.73,49.47 46.49,49.91 44.8,50 44.09,49.82 17.96,63.24 17.87,63.51 18.84,64.4 18.84,65.2 18.4,65.82 17.24,66.53 52.71,74 54.76,72.76 56.44,72.22 57.51,72.04 60.36,72.13 68.53,66.71 70.04,65.11 71.11,63.6 60.53,70.62 58.04,70.53 56.18,70.8 54.13,71.42 52,72.58 21.6,66.27 21.24,66 21.96,65.02 21.96,64.13 21.07,63.16 44.18,51.07 44.89,51.24 46.76,51.16 47.73,50.89 49.16,50 64.62,52.58 69.6,53.2 73.87,53.2Z M71.82,26.09 71.29,25.64 62.67,21.56 61.42,21.56 60.98,22 60.89,22.53 62.22,25.82 61.96,26 58.58,26.62 54.93,27.87 51.73,29.47 48.98,31.33 46.04,34 44.27,36.13 42.49,38.89 41.6,40.67 41.33,41.73 42.31,42.18 44.18,42.53 45.78,39.42 47.91,36.58 50.93,33.73 54.22,31.6 56.27,30.62 58.49,29.82 62.49,28.93 62.67,29.11 62.93,32.84 63.47,33.29 64.27,33.29 71.82,26.8Z';
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
     {act.id==='tap-toggle'
       ? <svg x={p.x-(half?24:35)} y={p.y-(half?24:35)}
           width={half?48:70} height={half?48:70}
           viewBox="130 110 730 720" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <rect x="389" y="296" width="246" height="430" rx="26"
             fill="none" stroke="#666" strokeWidth="17"
             strokeLinecap="round" strokeDasharray="20 15"/>
           <rect x="414" y="321" width="197" height="378" rx="4"
             fill="none" stroke="#666" strokeWidth="8"
             strokeLinecap="round" strokeDasharray="15 13"/>
           <path d={TAP_CARD_ICON_PATH} fill="#fff" fillRule="evenodd"/>
         </svg>
       : act.id==='rotate-ccw'
       ? <svg x={p.x-(half?24:35)} y={p.y-(half?24:35)}
           width={half?48:70} height={half?48:70}
           viewBox="0 0 100 100" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <path d={ROTATE_45_COUNTERCLOCKWISE_ICON_PATH}
             fill="#fff" fillRule="evenodd"/>
         </svg>
       : act.id==='rotate-cw'
       ? <svg x={p.x-(half?24:35)} y={p.y-(half?24:35)}
           width={half?48:70} height={half?48:70}
           viewBox="0 0 100 100" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <path d={ROTATE_45_CLOCKWISE_ICON_PATH}
             fill="#fff" fillRule="evenodd" stroke="#181225"
             strokeWidth=".65" strokeLinejoin="round" paintOrder="stroke"/>
         </svg>
       : act.id==='shuffle'
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
           viewBox="0 0 100 100" aria-hidden="true"
           style={{pointerEvents:'none',overflow:'visible'}}>
           <path d={FLIP_CARD_ICON_PATH} fill="#fff" fillRule="evenodd"/>
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
