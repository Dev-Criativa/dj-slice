const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const clean=(x,n=240)=>String(x??"").trim().slice(0,n);
async function event(env,code){return env.DB.prepare("SELECT * FROM events WHERE code=?").bind(code.toUpperCase()).first()}
async function admin(req,env){const t=req.headers.get("authorization")?.replace("Bearer ","");return !!t&&!!env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN}
let tidalTokenCache={token:null,expiresAt:0};
async function tidalToken(env){
 if(!env.TIDAL_CLIENT_ID||!env.TIDAL_CLIENT_SECRET)throw new Error("Pesquisa TIDAL ainda não configurada no servidor.");
 if(tidalTokenCache.token&&Date.now()<tidalTokenCache.expiresAt)return tidalTokenCache.token;
 const basic=btoa(env.TIDAL_CLIENT_ID+":"+env.TIDAL_CLIENT_SECRET);
 const response=await fetch("https://auth.tidal.com/v1/oauth2/token",{method:"POST",headers:{"Authorization":"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
 const data=await response.json();
 if(!response.ok||!data.access_token)throw new Error("Não foi possível autenticar na TIDAL.");
 tidalTokenCache={token:data.access_token,expiresAt:Date.now()+Math.max(60,(data.expires_in||3600)-120)*1000};
 return data.access_token;
}
function tidalArtistNames(item,included){
 const rel=item.relationships?.artists?.data||[];
 return rel.map(r=>included.find(x=>x.type===r.type&&x.id===r.id)?.attributes?.name).filter(Boolean).join(", ")||"Artista";
}
async function tidalSearch(env,q){
 const token=await tidalToken(env),url=new URL("https://openapi.tidal.com/v2/searchResults");
 url.searchParams.set("filter[query]",q);url.searchParams.set("countryCode","PT");url.searchParams.set("include","tracks.artists,tracks.albums");
 const response=await fetch(url,{headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.api+json"}});
 const payload=await response.json();
 if(!response.ok)throw new Error("A pesquisa TIDAL não está disponível ("+response.status+"): "+(payload.errors?.[0]?.detail||payload.errors?.[0]?.title||"erro da API"));
 const root=(payload.data||[]).find(x=>x.type==="searchResults")||(Array.isArray(payload.data)?payload.data[0]:payload.data);
 const included=payload.included||[];
 const refs=root?.relationships?.tracks?.data||[];
 const tracks=refs.map(ref=>included.find(x=>x.type===ref.type&&x.id===ref.id)).filter(Boolean);
 return tracks.slice(0,8).map(t=>({tidalId:t.id,title:t.attributes?.title||"Sem título",artist:tidalArtistNames(t,included),album:(t.relationships?.albums?.data||[]).map(r=>included.find(x=>x.type===r.type&&x.id===r.id)?.attributes?.title).filter(Boolean)[0]||"",duration:t.attributes?.duration||0,source:"tidal"}));
}
async function tidalSuggestions(env,q){
 const token=await tidalToken(env),url=new URL("https://openapi.tidal.com/v2/searchSuggestions");
 url.searchParams.set("filter[query]",q);url.searchParams.set("countryCode","PT");
 const response=await fetch(url,{headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.api+json"}});
 const payload=await response.json();
 if(!response.ok)return [];
 return (payload.data||[]).slice(0,5).map(x=>x.attributes?.query||x.attributes?.text||x.id||"").filter(Boolean);
}
async function cooldownRemaining(env,eventId,key,scope){
 const row=await env.DB.prepare("SELECT CAST((julianday(voted_at)+5.0/1440-julianday('now'))*86400 AS INTEGER)+1 AS seconds FROM voting_cooldowns WHERE event_id=? AND voter_key=? AND scope=?").bind(eventId,key,scope).first();
 return Math.max(0,Number(row?.seconds)||0);
}
async function claimCooldown(env,eventId,key,scope){
 const claimed=await env.DB.prepare("INSERT INTO voting_cooldowns(event_id,voter_key,scope,voted_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(event_id,voter_key,scope) DO UPDATE SET voted_at=CURRENT_TIMESTAMP WHERE datetime(voting_cooldowns.voted_at)<=datetime('now','-5 minutes') RETURNING voted_at").bind(eventId,key,scope).first();
 if(claimed)return {ok:true};
 return {ok:false,retryAfterSeconds:await cooldownRemaining(env,eventId,key,scope)};
}
function cooldownError(seconds){
 const mins=Math.max(1,Math.ceil(seconds/60));
 return new Response(JSON.stringify({error:"O TEU VOTO JÁ FOI REGISTADO. VOLTA A TENTAR EM "+mins+" MIN.",code:"VOTE_COOLDOWN",retryAfterSeconds:seconds}),{status:429,headers:{"content-type":"application/json","cache-control":"no-store","retry-after":String(Math.max(1,seconds))}});
}
async function state(env,e,key){
 const [msgs,tracks,poll,opts]=await Promise.all([
 env.DB.prepare("SELECT id,guest_name,body FROM messages WHERE event_id=? AND status='published' ORDER BY id DESC LIMIT 25").bind(e.id).all(),
 env.DB.prepare("SELECT t.id,t.tidal_id,t.title,t.artist,t.album,t.artwork_url,(COALESCE((SELECT COUNT(*) FROM track_votes v WHERE v.track_id=t.id),0)+COALESCE((SELECT COUNT(*) FROM track_vote_events v WHERE v.track_id=t.id),0)) AS votes FROM tracks t WHERE t.event_id=? ORDER BY votes DESC,t.id ASC LIMIT 25").bind(e.id).all(),
 env.DB.prepare("SELECT * FROM polls WHERE event_id=? AND active=1 ORDER BY id DESC LIMIT 1").bind(e.id).first(),
 env.DB.prepare("SELECT o.id,o.label,(SELECT COUNT(*) FROM poll_votes v WHERE v.option_id=o.id) votes FROM poll_options o JOIN polls p ON p.id=o.poll_id WHERE p.event_id=? AND p.active=1 ORDER BY o.sort_order").bind(e.id).all()
 ]);
 const [styleCooldown,musicCooldown,myVote]=await Promise.all([
  cooldownRemaining(env,e.id,key,"style_wars"),
  cooldownRemaining(env,e.id,key,"music"),
  poll?env.DB.prepare("SELECT option_id FROM poll_votes WHERE poll_id=? AND voter_key=?").bind(poll.id,key).first():Promise.resolve(null)
 ]);
 return {event:{code:e.code,title:env.EVENT_TITLE||e.title,activeMoment:e.active_moment},messages:msgs.results,tracks:tracks.results,poll:poll?{...poll,options:opts.results}:null,voting:{styleWarsRetryAfterSeconds:styleCooldown,musicRetryAfterSeconds:musicCooldown,myStyleWarsOptionId:myVote?.option_id??null}};
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 let p=u.pathname;
 const aliases={"/qr":"/qr.html","/guest":"/guest.html","/admin":"/admin.html","/room":"/room.html"};
 if(aliases[p]){u.pathname=aliases[p];return env.ASSETS.fetch(new Request(u,req));}
 if(!p.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(p==="/api/login"&&req.method==="POST"){const b=await req.json();return String(b.pin)===env.ADMIN_PIN&&!!env.ADMIN_TOKEN?J({token:env.ADMIN_TOKEN}):J({error:"PIN incorrecto ou autenticação não configurada"},401)}
 const m=p.match(/^\/api\/([A-Z0-9_-]+)\/(.*)$/i);if(!m)return J({error:"Endpoint inválido"},404);
 const e=await event(env,m[1]);if(!e)return J({error:"Evento não encontrado"},404);
 const a=m[2],key=req.headers.get("x-voter-key")||"";
 if(a==="state"&&req.method==="GET")return J(await state(env,e,key));
 if(a==="message"&&req.method==="POST"){const b=await req.json(),msg=clean(b.message);if(msg.length<2)return J({error:"Mensagem demasiado curta"},400);await env.DB.prepare("INSERT INTO messages(event_id,guest_name,body) VALUES(?,?,?)").bind(e.id,clean(b.name,40)||"Guest",msg).run();return J({ok:true,moderated:true})}
 if(a==="poll/vote"&&req.method==="POST"){
  if(!key)return J({error:"Voter key em falta"},400);
  if(e.active_moment!=="m2")return J({error:"Poll fechada"},409);
  const b=await req.json(),poll=await env.DB.prepare("SELECT id FROM polls WHERE event_id=? AND active=1 ORDER BY id DESC LIMIT 1").bind(e.id).first();
  if(!poll)return J({error:"Poll não configurada"},404);
  const option=await env.DB.prepare("SELECT id FROM poll_options WHERE id=? AND poll_id=?").bind(Number(b.optionId),poll.id).first();
  if(!option)return J({error:"Essa opção já não pertence à votação activa. Actualiza a página."},400);
  const claim=await claimCooldown(env,e.id,key,"style_wars");
  if(!claim.ok)return cooldownError(claim.retryAfterSeconds);
  await env.DB.prepare("INSERT INTO poll_votes(poll_id,option_id,voter_key) VALUES(?,?,?) ON CONFLICT(poll_id,voter_key) DO UPDATE SET option_id=excluded.option_id").bind(poll.id,option.id,key).run();
  return J({ok:true,optionId:option.id});
 }
 if(a==="tracks"&&req.method==="GET"){
 const q=clean(u.searchParams.get("q"),100);if(q.length<2)return J({results:[],suggestions:[]});
 try{const [results,suggestions]=await Promise.all([tidalSearch(env,q),tidalSuggestions(env,q)]);return J({results,suggestions});}
 catch(error){return J({error:error.message},503)}
 }
 if(a==="tracks"&&req.method==="POST"){
  const b=await req.json();
  if(e.active_moment!=="m1")return J({error:"Sugestões fechadas"},409);
  if(!key)return J({error:"Voter key em falta"},400);
  if(b.source!=="tidal"||!b.tidalId)return J({error:"A faixa tem de vir da pesquisa TIDAL"},400);
  const claim=await claimCooldown(env,e.id,key,"music");
  if(!claim.ok)return cooldownError(claim.retryAfterSeconds);
  const tidalId=clean(b.tidalId,100);
  await env.DB.prepare("INSERT OR IGNORE INTO tracks(event_id,tidal_id,title,artist,album,artwork_url) VALUES(?,?,?,?,?,?)").bind(e.id,tidalId,clean(b.title,180),clean(b.artist,180),clean(b.album,180),clean(b.artworkUrl,500)).run();
  const track=await env.DB.prepare("SELECT id FROM tracks WHERE event_id=? AND tidal_id=?").bind(e.id,tidalId).first();
  if(!track)return J({error:"Não foi possível registar a música."},500);
  await env.DB.prepare("INSERT INTO track_vote_events(event_id,track_id,voter_key) VALUES(?,?,?)").bind(e.id,track.id,key).run();
  return J({ok:true,trackId:track.id,voteAdded:true});
 }
 if(a.startsWith("track/")&&a.endsWith("/vote")&&req.method==="POST"){
  if(!key)return J({error:"Voter key em falta"},400);
  if(e.active_moment!=="m1")return J({error:"Votação fechada"},409);
  const id=Number(a.split("/")[1]);
  const track=await env.DB.prepare("SELECT id FROM tracks WHERE id=? AND event_id=?").bind(id,e.id).first();
  if(!track)return J({error:"Música não encontrada."},404);
  const claim=await claimCooldown(env,e.id,key,"music");
  if(!claim.ok)return cooldownError(claim.retryAfterSeconds);
  await env.DB.prepare("INSERT INTO track_vote_events(event_id,track_id,voter_key) VALUES(?,?,?)").bind(e.id,id,key).run();
  return J({ok:true,voteAdded:true});
 }
 if(!await admin(req,env))return J({error:"Acesso admin necessário"},401);
 if(a==="admin"&&req.method==="GET"){
   const [pending,all]=await Promise.all([
     env.DB.prepare("SELECT id,guest_name,body,status,created_at FROM messages WHERE event_id=? AND status='pending' ORDER BY id DESC").bind(e.id).all(),
     env.DB.prepare("SELECT id,guest_name,body,status,created_at FROM messages WHERE event_id=? ORDER BY id DESC LIMIT 300").bind(e.id).all()
   ]);
   return J({pending:pending.results,messages:all.results});
 }
 if(a==="moment"&&req.method==="POST"){const b=await req.json();if(!["m1","m2","m3","m4"].includes(b.moment))return J({error:"Momento inválido"},400);await env.DB.prepare("UPDATE events SET active_moment=? WHERE id=?").bind(b.moment,e.id).run();return J({ok:true})}
 if(a.startsWith("message/")&&req.method==="PATCH"){
   const id=Number(a.split("/")[1]),b=await req.json();
   if(!Number.isInteger(id)||id<1)return J({error:"Mensagem inválida"},400);
   if(b.status!==undefined&&!["pending","published","rejected","hidden"].includes(b.status))return J({error:"Estado inválido"},400);
   if(b.body!==undefined||b.guest_name!==undefined){
     const current=await env.DB.prepare("SELECT id FROM messages WHERE id=? AND event_id=?").bind(id,e.id).first();
     if(!current)return J({error:"Mensagem não encontrada"},404);
     const body=b.body===undefined?null:clean(b.body,240),name=b.guest_name===undefined?null:clean(b.guest_name,40);
     if(body!==null&&body.length<2)return J({error:"A mensagem tem de ter pelo menos 2 caracteres"},400);
     if(body!==null)await env.DB.prepare("UPDATE messages SET body=? WHERE id=? AND event_id=?").bind(body,id,e.id).run();
     if(name!==null)await env.DB.prepare("UPDATE messages SET guest_name=? WHERE id=? AND event_id=?").bind(name||"Guest",id,e.id).run();
   }
   if(b.status!==undefined)await env.DB.prepare("UPDATE messages SET status=? WHERE id=? AND event_id=?").bind(b.status,id,e.id).run();
   return J({ok:true});
 }
 if(a.startsWith("message/")&&req.method==="DELETE"){
   const id=Number(a.split("/")[1]);
   if(!Number.isInteger(id)||id<1)return J({error:"Mensagem inválida"},400);
   const result=await env.DB.prepare("DELETE FROM messages WHERE id=? AND event_id=?").bind(id,e.id).run();
   return result.meta.changes?J({ok:true}):J({error:"Mensagem não encontrada"},404);
 }
 if(a==="poll"&&req.method==="POST"){const b=await req.json(),opts=(b.options||[]).map(x=>clean(x,80)).filter(Boolean).slice(0,5);if(opts.length<2)return J({error:"Poll precisa de duas opções"},400);await env.DB.prepare("UPDATE polls SET active=0 WHERE event_id=?").bind(e.id).run();const r=await env.DB.prepare("INSERT INTO polls(event_id,question,active) VALUES(?,?,1)").bind(e.id,clean(b.question,180)||"Choose your side").run();for(let i=0;i<opts.length;i++)await env.DB.prepare("INSERT INTO poll_options(poll_id,label,sort_order) VALUES(?,?,?)").bind(r.meta.last_row_id,opts[i],i).run();return J({ok:true})}
 return J({error:"Acção não suportada"},404);
}};