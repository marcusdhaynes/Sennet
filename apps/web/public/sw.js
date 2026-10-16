// Offline shell caching only. Community media is intentionally NOT cached by this service worker.
const CACHE='sennet-shell-v1';
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./favicon.svg','./manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(response.ok && (event.request.destination==='script'||event.request.destination==='style'||event.request.mode==='navigate'||event.request.destination==='image'))cache.put(event.request,response.clone());
      return response;
    }catch{return await cache.match(event.request)||await cache.match('./')||Response.error();}
  })());
});
