// Network-first application shell. Offline navigation can use a cached page,
// but a missing JavaScript/CSS chunk must NEVER be replaced with HTML:
// doing so produces a blank screen from a strict module MIME-type error.
const CACHE='sennet-shell-v2';
const SCOPE=self.registration.scope;
const SHELL=new URL('./',SCOPE).href;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Installation should not fail merely because an optional icon is missing.
    try{await cache.add(SHELL);}catch{/* Offline first visits still proceed. */}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>
      name.startsWith('sennet-shell-')&&name!==CACHE
    ).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.href.startsWith(SCOPE))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const navigation=request.mode==='navigate';
    const asset=['script','style','image','font'].includes(request.destination);
    try{
      const response=await fetch(request);
      if(response.ok){
        if(navigation&&url.pathname===new URL(SHELL).pathname){
          await cache.put(SHELL,response.clone()).catch(()=>{});
        }else if(asset){
          // Never cache an HTML error page under a script or stylesheet URL.
          const type=response.headers.get('content-type')||'';
          const valid=request.destination==='script'?/javascript|ecmascript/i.test(type):
            request.destination==='style'?/text\/css/i.test(type):
            request.destination==='image'?/image\//i.test(type):
            /font|octet-stream/i.test(type);
          if(valid)await cache.put(request,response.clone()).catch(()=>{});
        }
      }
      return response;
    }catch{
      if(navigation)return await cache.match(SHELL)||Response.error();
      // Exact-URL asset fallback only. The previous SW incorrectly
      // returned the cached index.html for nonexistent JS and CSS files.
      if(asset)return await cache.match(request)||Response.error();
      return Response.error();
    }
  })());
});
