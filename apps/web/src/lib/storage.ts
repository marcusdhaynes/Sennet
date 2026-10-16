import {parseGamePack,type GamePack} from '@sennet/core';
const KEY='sennet.packs.v1';
export function getPacks():GamePack[]{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return [];}}
export function rememberPack(pack:GamePack){const others=getPacks().filter(p=>p.id!==pack.id);localStorage.setItem(KEY,JSON.stringify([pack,...others].slice(0,30)));}
export async function importPackUrl(raw:string):Promise<GamePack>{
  const uri=new URL(raw);
  if(uri.protocol!=='https:' && !(uri.protocol==='http:'&&['localhost','127.0.0.1'].includes(uri.hostname)))throw new Error('Pack URLs must use HTTPS');
  const resp=await fetch(uri.href,{mode:'cors',credentials:'omit',redirect:'error'});
  if(!resp.ok)throw new Error(`Host returned ${resp.status}`);
  const contentLength=Number(resp.headers.get('content-length')||0);
  if(contentLength>2_000_000)throw new Error('Pack manifests must be under 2MB');
  const text=await resp.text();if(text.length>2_000_000)throw new Error('Pack manifests must be under 2MB');
  return parseGamePack(JSON.parse(text));
}
export async function importPackFile(file:File):Promise<GamePack>{
  if(file.size>2_000_000)throw new Error('Pack manifests must be under 2MB');
  return parseGamePack(JSON.parse(await file.text()));
}
export function downloadText(name:string,text:string,mime='application/json'){
  const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** Upload directly from the player's browser to their own bucket/provider using an
 * existing short-lived presigned PUT URL; the Sennet server never handles file bytes. */
export async function directUpload(file:File,signedPutUrl:string):Promise<void>{
  const u=new URL(signedPutUrl);
  if(u.protocol!=='https:' && !['localhost','127.0.0.1'].includes(u.hostname))throw new Error('Signed destination must use HTTPS');
  const response=await fetch(u.href,{method:'PUT',body:file,headers:{'Content-Type':file.type||'application/octet-stream'},mode:'cors',credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error(`Direct upload failed: HTTP ${response.status}. Check bucket CORS and signed headers.`);
}
