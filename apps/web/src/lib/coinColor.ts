export type RGB={r:number;g:number;b:number};
export type HSV={h:number;s:number;v:number};
const limit=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function normalizeHex(input:string):string|null{
  const s=input.trim().replace(/^#/,'');
  if(/^[\da-fA-F]{3}$/.test(s))return '#'+s.split('').map(c=>c+c).join('').toLowerCase();
  if(/^[\da-fA-F]{6}$/.test(s))return '#'+s.toLowerCase();
  return null;
}
export function hexToRgb(hex:string):RGB{
  const clean=normalizeHex(hex)??'#d8b979';
  return {r:parseInt(clean.slice(1,3),16),
    g:parseInt(clean.slice(3,5),16),b:parseInt(clean.slice(5,7),16)};
}
export function rgbToHex(rgb:RGB):string{
  return '#'+([rgb.r,rgb.g,rgb.b] as number[]).map(c=>
    Math.round(limit(Number.isFinite(c)?c:0,0,255)).toString(16).padStart(2,'0')).join('');
}
export function rgbToHsv({r,g,b}:RGB):HSV{
  const R=r/255,G=g/255,B=b/255;
  const max=Math.max(R,G,B),min=Math.min(R,G,B),delta=max-min;
  let h=0;
  if(delta>0){
    if(max===R)h=60*(((G-B)/delta+6)%6);
    else if(max===G)h=60*((B-R)/delta+2);
    else h=60*((R-G)/delta+4);
  }
  return {h:((h+360)%360),s:max===0?0:delta/max,v:max};
}
export function hsvToRgb({h,s,v}:HSV):RGB{
  const H=((h%360)+360)%360,S=limit(s,0,1),V=limit(v,0,1);
  const c=V*S,x=c*(1-Math.abs((H/60)%2-1)),m=V-c;
  const [r,g,b]=H<60?[c,x,0]:H<120?[x,c,0]:H<180?[0,c,x]:
    H<240?[0,x,c]:H<300?[x,0,c]:[c,0,x];
  return {r:Math.round((r+m)*255),g:Math.round((g+m)*255),
    b:Math.round((b+m)*255)};
}
export function hsvToHex(hsv:HSV):string{return rgbToHex(hsvToRgb(hsv))}
export function wheelPointToHsv(x:number,y:number,radius:number,value:number):HSV{
  const dx=x-radius,dy=y-radius;
  const angle=Math.atan2(dy,dx)*180/Math.PI;
  return {h:((180-angle)%360+360)%360,
    s:limit(Math.hypot(dx,dy)/radius,0,1),v:limit(value,0,1)};
}
export function hsvToWheelPoint(hsv:HSV,radius:number):{x:number;y:number}{
  const angle=(180-hsv.h)*Math.PI/180;
  return {x:radius+radius*hsv.s*Math.cos(angle),
    y:radius+radius*hsv.s*Math.sin(angle)};
}
