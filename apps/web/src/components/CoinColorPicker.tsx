import {useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import {hexToRgb,hsvToHex,hsvToRgb,rgbToHsv,rgbToHex,wheelPointToHsv,
  hsvToWheelPoint,normalizeHex,type HSV,type RGB} from '../lib/coinColor';

interface Props{
 initial:string;onApply:(hex:string)=>void;onCancel:()=>void;
}
const constrain=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const colorNumber=(n:number)=>Number.isFinite(n)?Math.round(n):0;
export default function CoinColorPicker({initial,onApply,onCancel}:Props){
 const initialHex=normalizeHex(initial)??'#d8b979';
 const [color,setColor]=useState<HSV>(()=>rgbToHsv(hexToRgb(initialHex)));
 const [text,setText]=useState(initialHex);
 const wheel=useRef<HTMLDivElement>(null);
 const hex=hsvToHex(color),rgb=hsvToRgb(color);
 const wheelPosition=hsvToWheelPoint(color,128);
 const update=(next:HSV)=>{
   const fresh={h:((next.h%360)+360)%360,s:constrain(next.s,0,1),
     v:constrain(next.v,0,1)};
   setColor(fresh);setText(hsvToHex(fresh));
 };
 const updateWheel=(e:PointerEvent<HTMLDivElement>)=>{
   const box=wheel.current?.getBoundingClientRect();
   if(!box)return;
   const x=(e.clientX-box.left)*256/box.width;
   const y=(e.clientY-box.top)*256/box.height;
   update(wheelPointToHsv(x,y,128,color.v));
 };
 const keyboard=(e:KeyboardEvent<HTMLDivElement>)=>{
   const v=e.shiftKey?.05:.012;
   if(e.key==='ArrowUp'){e.preventDefault();update({...color,s:constrain(color.s+v,0,1)});}
   if(e.key==='ArrowDown'){e.preventDefault();update({...color,s:constrain(color.s-v,0,1)});}
   if(e.key==='ArrowLeft'){e.preventDefault();update({...color,h:(color.h+358)%360});}
   if(e.key==='ArrowRight'){e.preventDefault();update({...color,h:(color.h+2)%360});}
 };
 const setRgb=(key:keyof RGB,value:string)=>{
   if(value==='')return;
   const n=Number(value);if(!Number.isFinite(n))return;
   const rgbNext={...rgb,[key]:constrain(Math.round(n),0,255)};
   update(rgbToHsv(rgbNext));
 };
 const setHsv=(key:keyof HSV,value:string)=>{
   if(value==='')return;
   const n=Number(value);if(!Number.isFinite(n))return;
   update({...color,[key]:key==='h'?((n%360)+360)%360:
     constrain(n,0,1)});
 };
 return <div className="coin-color-backdrop"
   onPointerDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)onCancel();}}>
   <section className="coin-color-dialog" role="dialog" aria-modal="true"
     aria-label="Customize coin color" onPointerDown={e=>e.stopPropagation()}>
     <div className="coin-color-title"><strong>Color</strong>
       <button type="button" aria-label="Close coin color picker" onClick={onCancel}>×</button>
     </div>
     <div className="coin-color-main">
       <div ref={wheel} className="coin-color-wheel" role="slider"
         aria-label="Hue and saturation wheel" tabIndex={0}
         aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(color.h)}
         aria-valuetext={'Hue '+Math.round(color.h)+'°, saturation '+Math.round(color.s*100)+'%'}
         onKeyDown={keyboard}
         onPointerDown={e=>{e.preventDefault();e.stopPropagation();
           e.currentTarget.setPointerCapture(e.pointerId);updateWheel(e);}}
         onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))updateWheel(e);}}
         onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))
           e.currentTarget.releasePointerCapture(e.pointerId);}}>
         <span className="coin-color-wheel-dark" style={{opacity:1-color.v}}/>
         <span className="coin-color-wheel-target"
           style={{left:wheelPosition.x/256*100+'%',top:wheelPosition.y/256*100+'%'}}/>
       </div>
       <div className="coin-color-value-wrap">
         <input className="coin-color-value" type="range" min="0" max="100" step=".1"
           aria-label="Brightness" value={Math.round(color.v*1000)/10}
           style={{background:`linear-gradient(to bottom,${hsvToHex({...color,v:1})},#000)`}}
           onChange={e=>update({...color,v:Number(e.target.value)/100})}/>
       </div>
     </div>
     <div className="coin-color-actions">
       <span className="coin-color-sample" style={{background:hex}} title="Selected coin color"/>
       <button className="coin-color-confirm" type="button" aria-label="Apply coin color"
         title="Apply" onClick={()=>onApply(hex)}>✓</button>
       <button className="coin-color-cancel" type="button" aria-label="Cancel color change"
         title="Cancel" onClick={onCancel}>×</button>
       <input aria-label="Hexadecimal color" className="coin-color-hex"
         spellCheck={false} maxLength={7} value={text}
         onChange={e=>{setText(e.target.value);
           const normalized=normalizeHex(e.target.value);
           if(normalized)setColor(rgbToHsv(hexToRgb(normalized)));}}
         onBlur={()=>setText(hex)}
         onKeyDown={e=>{if(e.key==='Enter'){const normalized=normalizeHex(text);
           if(normalized)onApply(normalized);}}}/>
     </div>
     <div className="coin-color-values">
       <div className="coin-color-channel-row">
         {(['r','g','b'] as const).map(k=><label key={k}><span>{k.toUpperCase()}</span>
           <input type="number" min={0} max={255} step={1} value={rgb[k]}
             aria-label={{r:'Red',g:'Green',b:'Blue'}[k]}
             onChange={e=>setRgb(k,e.target.value)}/></label>)}
       </div>
       <div className="coin-color-channel-row">
         {(['h','s','v'] as const).map(k=><label key={k}><span>{k.toUpperCase()}</span>
           <input type="number" min={0} max={k==='h'?359:1}
             step={k==='h'?1:.01}
             aria-label={{h:'Hue',s:'Saturation',v:'Value'}[k]}
             value={k==='h'?colorNumber(color.h):Number(color[k].toFixed(2))}
             onChange={e=>setHsv(k,e.target.value)}/></label>)}
       </div>
     </div>
   </section>
 </div>;
}
