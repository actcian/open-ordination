const CACHE='open-ordination-v3';
const ASSETS=['./','./index.html','./trainer.html','./manifest.webmanifest','./favicon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function injectTrainerLink(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;

  let html=await response.text();
  if(html.includes('data-loop-trainer-entry')){
    return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  }

  const entry=`
  <a data-loop-trainer-entry href="./trainer.html" style="display:block;margin:12px 0;padding:16px 18px;border-radius:18px;background:linear-gradient(135deg,#2b2118,#74461f);color:#fff;text-decoration:none;box-shadow:0 8px 24px #74461f22">
    <div style="font-size:18px;font-weight:800">🔁 Loop Trainer — ฝึกวนเสียงคนจริง</div>
    <div style="opacity:.86;margin-top:3px;font-size:14px">ตั้ง A/B Loop · ปรับความเร็ว · ฟังช่วงเดิมซ้ำจนติดหู → แตะเพื่อเข้าโหมดฝึก</div>
  </a>`;

  const marker='  <div class="tabs">';
  if(html.includes(marker)) html=html.replace(marker,entry+'\n\n'+marker);
  else html=html.replace('<body>','<body>'+entry);

  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  const isMainNav=event.request.mode==='navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/open-ordination'));

  if(isMainNav){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      let response;
      try{
        response=await fetch(event.request);
        if(response.ok) cache.put('./index.html',response.clone());
      }catch(e){
        response=await cache.match('./index.html') || await cache.match('./');
      }
      return injectTrainerLink(response);
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match('./index.html')))
  );
});