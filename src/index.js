const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const clean=(x,n=240)=>String(x??"").trim().slice(0,n);
async function event(env,code){return env.DB.prepare("SELECT * FROM events WHERE code=?").bind(code.toUpperCase()).first()}
async function admin(req,env){const t=req.headers.get("authorization")?.replace("Bearer ","");return !!t&&!!env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN}
// Credenciais TIDAL: TIDAL_CLIENT_ID/SECRET e, opcionalmente, TIDAL_CLIENT_ID_2/SECRET_2, _3, ...
// Os pedidos rodam entre as credenciais; uma credencial que receba 429 fica em pausa e passa-se à seguinte.
const tidalState=new Map();let tidalNext=0;
class TidalBusyError extends Error{constructor(){super("MUITA GENTE A PESQUISAR AO MESMO TEMPO. TENTA DAQUI A POUCO.");this.status=503}}
function tidalCredentials(env){
 const list=[];
 if(env.TIDAL_CLIENT_ID&&env.TIDAL_CLIENT_SECRET)list.push({id:env.TIDAL_CLIENT_ID,secret:env.TIDAL_CLIENT_SECRET});
 for(let n=2;n<=5;n++){const id=env["TIDAL_CLIENT_ID_"+n],secret=env["TIDAL_CLIENT_SECRET_"+n];if(id&&secret)list.push({id,secret});}
 return list;
}
function tidalSlot(cred){let st=tidalState.get(cred.id);if(!st){st={token:null,expiresAt:0,pausedUntil:0};tidalState.set(cred.id,st)}return st}
async function tidalToken(cred,st){
 if(st.token&&Date.now()<st.expiresAt)return st.token;
 const response=await fetch("https://auth.tidal.com/v1/oauth2/token",{method:"POST",headers:{"Authorization":"Basic "+btoa(cred.id+":"+cred.secret),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
 const data=await response.json().catch(()=>({}));
 if(response.status===429){st.pausedUntil=Date.now()+retryMs(response);return null}
 if(!response.ok||!data.access_token)throw new Error("Não foi possível autenticar na TIDAL.");
 st.token=data.access_token;st.expiresAt=Date.now()+Math.max(60,(data.expires_in||3600)-120)*1000;
 return st.token;
}
function retryMs(response){const s=Number(response.headers.get("retry-after"));return (s>0?Math.min(s,300):30)*1000}
// Faz um GET à API TIDAL com a próxima credencial disponível. Devolve {response,payload}.
async function tidalGet(env,url){
 const creds=tidalCredentials(env);
 if(!creds.length)throw new Error("Pesquisa TIDAL ainda não configurada no servidor.");
 for(let tries=0;tries<creds.length;tries++){
  const cred=creds[tidalNext++%creds.length],st=tidalSlot(cred);
  if(Date.now()<st.pausedUntil)continue;
  const token=await tidalToken(cred,st);if(!token)continue;
  const response=await fetch(url,{headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.api+json"}});
  if(response.status===429){st.pausedUntil=Date.now()+retryMs(response);continue}
  if(response.status===401){st.token=null;st.expiresAt=0}
  return {response,payload:await response.json().catch(()=>({}))};
 }
 throw new TidalBusyError();
}
// Cache de pesquisas: memória do isolate + Cache API da Cloudflare, 10 minutos.
const SEARCH_TTL=600,searchMemory=new Map();
function searchCacheKey(q){return new Request("https://tidal-search.cache/v1?q="+encodeURIComponent(q.toLowerCase().replace(/\s+/g," ").trim()))}
async function cachedSearch(env,q,ctx){
 const key=searchCacheKey(q),k=key.url,hit=searchMemory.get(k);
 if(hit&&hit.expiresAt>Date.now())return hit.data;
 const cache=globalThis.caches?.default;
 if(cache){try{const r=await cache.match(key);if(r){const data=await r.json();remember(k,data);return data}}catch{}}
 const results=await tidalSearch(env,q);
 const suggestions=results.length<3?await tidalSuggestions(env,q).catch(()=>[]):[];
 const data={results,suggestions};
 remember(k,data);
 if(cache){const put=cache.put(key,new Response(JSON.stringify(data),{headers:{"content-type":"application/json","cache-control":"public, max-age="+SEARCH_TTL}})).catch(()=>{});ctx?.waitUntil?ctx.waitUntil(put):await put}
 return data;
}
function remember(k,data){if(searchMemory.size>=500)searchMemory.delete(searchMemory.keys().next().value);searchMemory.set(k,{data,expiresAt:Date.now()+SEARCH_TTL*1000})}
// Limite por dispositivo (Workers Rate Limiting). Sem binding configurado, não limita.
async function withinLimit(limiter,key){if(!limiter||!key)return true;try{return (await limiter.limit({key})).success}catch{return true}}
function tooFast(message){return new Response(JSON.stringify({error:message,code:"RATE_LIMITED",retryAfterSeconds:60}),{status:429,headers:{"content-type":"application/json","cache-control":"no-store","retry-after":"60"}})}
function tidalArtistNames(item,included){
 const rel=item.relationships?.artists?.data||[];
 return rel.map(r=>included.find(x=>x.type===r.type&&x.id===r.id)?.attributes?.name).filter(Boolean).join(", ")||"Artista";
}
async function tidalSearch(env,q){
 const url=new URL("https://openapi.tidal.com/v2/searchResults");
 url.searchParams.set("filter[query]",q);url.searchParams.set("countryCode","PT");url.searchParams.set("include","tracks.artists,tracks.albums");
 const {response,payload}=await tidalGet(env,url);
 if(!response.ok)throw new Error("A pesquisa TIDAL não está disponível ("+response.status+"): "+(payload.errors?.[0]?.detail||payload.errors?.[0]?.title||"erro da API"));
 const root=Array.isArray(payload.data)?(payload.data.find(x=>x.type==="searchResults")||payload.data[0]):payload.data;
 const included=payload.included||[];
 const refs=root?.relationships?.tracks?.data||[];
 const tracks=refs.map(ref=>included.find(x=>x.type===ref.type&&x.id===ref.id)).filter(Boolean);
 const seen=new Set(),unique=[];
 for(const t of tracks){const k=((t.attributes?.title||"")+"|"+tidalArtistNames(t,included)).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();if(seen.has(k))continue;seen.add(k);unique.push(t)}
 return unique.slice(0,8).map(t=>({tidalId:t.id,title:t.attributes?.title||"Sem título",artist:tidalArtistNames(t,included),album:(t.relationships?.albums?.data||[]).map(r=>included.find(x=>x.type===r.type&&x.id===r.id)?.attributes?.title).filter(Boolean)[0]||"",duration:t.attributes?.duration||0,source:"tidal"}));
}
async function tidalSuggestions(env,q){
 const url=new URL("https://openapi.tidal.com/v2/searchSuggestions");
 url.searchParams.set("filter[query]",q);url.searchParams.set("countryCode","PT");
 const {response,payload}=await tidalGet(env,url);
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
const TRACK_VOTES="(COALESCE((SELECT baseline_votes FROM track_vote_baselines b WHERE b.track_id=t.id),0)+COALESCE((SELECT COUNT(*) FROM track_votes v WHERE v.track_id=t.id),0)+COALESCE((SELECT COUNT(*) FROM track_vote_events v WHERE v.track_id=t.id),0))";
// Lista de músicas por tocar (ranking). Tolerante a uma base de dados sem a migração 0004.
async function queuedTracks(env,eventId,limit){
 try{return await env.DB.prepare("SELECT t.id,t.tidal_id,t.title,t.artist,t.album,t.artwork_url,"+TRACK_VOTES+" AS votes FROM tracks t WHERE t.event_id=? AND t.play_status='queued' ORDER BY votes DESC,t.id ASC LIMIT ?").bind(eventId,limit).all()}
 catch{return await env.DB.prepare("SELECT t.id,t.tidal_id,t.title,t.artist,t.album,t.artwork_url,"+TRACK_VOTES+" AS votes FROM tracks t WHERE t.event_id=? ORDER BY votes DESC,t.id ASC LIMIT ?").bind(eventId,limit).all()}
}
async function nowPlaying(env,eventId){try{return await env.DB.prepare("SELECT t.id,t.title,t.artist,"+TRACK_VOTES+" AS votes FROM tracks t WHERE t.event_id=? AND t.play_status='playing' LIMIT 1").bind(eventId).first()}catch{return null}}
// Música que já tocou ou está a tocar não volta a receber sugestões/votos (sem gastar o cooldown).
async function playedError(env,where,...args){
 let r=null;try{r=await env.DB.prepare("SELECT play_status FROM tracks WHERE "+where).bind(...args).first()}catch{}
 if(r?.play_status==="played")return J({error:"ESSA JÁ TOCOU! ESCOLHE OUTRA.",code:"ALREADY_PLAYED"},409);
 if(r?.play_status==="playing")return J({error:"ESSA ESTÁ A TOCAR AGORA! ESCOLHE OUTRA.",code:"NOW_PLAYING"},409);
 return null;
}
async function sha256(text){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function randomHex(bytes){return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,"0")).join("")}
const DJ_SESSION_HOURS=24;
// DJ: token do env (DJ_TOKEN), token do admin, ou uma sessão criada com o PIN definido no admin.
// Opções da votação activa com o total de votos (todos os votos; sem a migração 0007, um por telemóvel).
async function pollOptions(env,eventId){
 try{return await env.DB.prepare("SELECT o.id,o.label,(SELECT COUNT(*) FROM poll_vote_events v WHERE v.option_id=o.id) votes FROM poll_options o JOIN polls p ON p.id=o.poll_id WHERE p.event_id=? AND p.active=1 ORDER BY o.sort_order").bind(eventId).all()}
 catch{return await env.DB.prepare("SELECT o.id,o.label,(SELECT COUNT(*) FROM poll_votes v WHERE v.option_id=o.id) votes FROM poll_options o JOIN polls p ON p.id=o.poll_id WHERE p.event_id=? AND p.active=1 ORDER BY o.sort_order").bind(eventId).all()}
}
async function isDj(req,env,eventId){const t=req.headers.get("authorization")?.replace("Bearer ","");if(!t)return false;
 if((env.DJ_TOKEN&&t===env.DJ_TOKEN)||(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN))return true;
 try{return !!(await env.DB.prepare("SELECT 1 AS ok FROM dj_sessions WHERE token_hash=? AND event_id=? AND created_at>datetime('now',?)").bind(await sha256(t),eventId,"-"+DJ_SESSION_HOURS+" hours").first())}catch{return false}}
async function loginAllowed(req,env){if(!env.LOGIN_LIMITER)return true;try{return (await env.LOGIN_LIMITER.limit({key:"login:"+(req.headers.get("cf-connecting-ip")||"unknown")})).success}catch{return true}}
const LOGIN_SLOW=()=>J({error:"Demasiadas tentativas. Espera um minuto."},429);
const BAN_TEXT="FARMASTE TUDO MENOS AURA! FOSTE BANID@!";
// Tolerante a uma base de dados sem a migração 0003 (trata como não banido).
async function isBanned(env,eventId,key){if(!key)return false;try{return !!(await env.DB.prepare("SELECT 1 AS b FROM bans WHERE event_id=? AND voter_key=?").bind(eventId,key).first())}catch{return false}}
function searchCooldownError(seconds){
 const mins=Math.max(1,Math.ceil(seconds/60));
 return new Response(JSON.stringify({error:"O TEU VOTO JÁ FOI REGISTADO. PODES PESQUISAR DE NOVO EM "+mins+" MIN.",code:"SEARCH_COOLDOWN",retryAfterSeconds:seconds}),{status:429,headers:{"content-type":"application/json","cache-control":"no-store","retry-after":String(Math.max(1,seconds))}});
}
function cooldownError(seconds){
 const mins=Math.max(1,Math.ceil(seconds/60));
 return new Response(JSON.stringify({error:"O TEU VOTO JÁ FOI REGISTADO. VOLTA A TENTAR EM "+mins+" MIN.",code:"VOTE_COOLDOWN",retryAfterSeconds:seconds}),{status:429,headers:{"content-type":"application/json","cache-control":"no-store","retry-after":String(Math.max(1,seconds))}});
}
async function state(env,e,key,msgId=0){
 const [msgs,tracks,poll,opts]=await Promise.all([
 env.DB.prepare("SELECT id,guest_name,body FROM messages WHERE event_id=? AND status='published' ORDER BY id DESC LIMIT 25").bind(e.id).all(),
 queuedTracks(env,e.id,25),
 env.DB.prepare("SELECT * FROM polls WHERE event_id=? AND active=1 ORDER BY id DESC LIMIT 1").bind(e.id).first(),
 pollOptions(env,e.id)
 ]);
 const [styleCooldown,musicCooldown,myVote]=await Promise.all([
  cooldownRemaining(env,e.id,key,"style_wars"),
  cooldownRemaining(env,e.id,key,"music"),
  poll?env.DB.prepare("SELECT option_id FROM poll_votes WHERE poll_id=? AND voter_key=?").bind(poll.id,key).first():Promise.resolve(null)
 ]);
 const banned=await isBanned(env,e.id,key);
 const playing=await nowPlaying(env,e.id);
 const mine=msgId>0?await env.DB.prepare("SELECT id,status FROM messages WHERE id=? AND event_id=?").bind(msgId,e.id).first():null;
 return {event:{code:e.code,title:env.EVENT_TITLE||e.title,activeMoment:e.active_moment,momentSince:e.moment_since?String(e.moment_since).replace(" ","T")+"Z":null},messages:msgs.results,tracks:tracks.results,poll:poll?{...poll,options:opts.results}:null,voting:{styleWarsRetryAfterSeconds:styleCooldown,musicRetryAfterSeconds:musicCooldown,myStyleWarsOptionId:myVote?.option_id??null},nowPlaying:playing,banned,myMessage:msgId>0?(mine?{id:mine.id,status:mine.status}:{id:msgId,status:'deleted'}):null};
}
export default {async fetch(req,env,ctx){
 const u=new URL(req.url);
 let p=u.pathname;
 // A raiz e as antigas páginas de preparação levam o público direto à festa.
 if(p==="/"||p==="/index.html"||p==="/screen"||p==="/screen.html"){const to=new URL("/guest",u.origin);to.searchParams.set("event",u.searchParams.get("event")||env.EVENT_CODE||"PARTY2026");return Response.redirect(to.href,302)}
 const aliases={"/qr":"/qr.html","/guest":"/guest.html","/admin":"/admin.html","/room":"/room.html","/dj":"/dj.html"};
 if(aliases[p]){u.pathname=aliases[p];return env.ASSETS.fetch(new Request(u,req));}
 if(!p.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(p==="/api/dj-login"&&req.method==="POST"){if(!await loginAllowed(req,env))return LOGIN_SLOW();const b=await req.json().catch(()=>({}));const pin=String(b.pin??"");
  const ev=await event(env,String(b.event||env.EVENT_CODE||"PARTY2026"));
  if(ev&&/^\d{4}$/.test(pin)){try{const acc=await env.DB.prepare("SELECT pin_hash,salt FROM dj_access WHERE event_id=?").bind(ev.id).first();
   if(acc&&acc.pin_hash===await sha256(acc.salt+":"+pin)){const token=randomHex(24);await env.DB.prepare("INSERT INTO dj_sessions(token_hash,event_id) VALUES(?,?)").bind(await sha256(token),ev.id).run();return J({token,role:"dj"})}}catch{}}
  if(env.DJ_PIN&&env.DJ_TOKEN&&pin===env.DJ_PIN)return J({token:env.DJ_TOKEN,role:"dj"});
  if(env.ADMIN_PIN&&env.ADMIN_TOKEN&&pin===env.ADMIN_PIN)return J({token:env.ADMIN_TOKEN,role:"admin"});
  return J({error:"PIN incorrecto"},401)}
 if(p==="/api/login"&&req.method==="POST"){if(!await loginAllowed(req,env))return LOGIN_SLOW();const b=await req.json();return String(b.pin)===env.ADMIN_PIN&&!!env.ADMIN_TOKEN?J({token:env.ADMIN_TOKEN}):J({error:"PIN incorrecto ou autenticação não configurada"},401)}
 const m=p.match(/^\/api\/([A-Z0-9_-]+)\/(.*)$/i);if(!m)return J({error:"Endpoint inválido"},404);
 const e=await event(env,m[1]);if(!e)return J({error:"Evento não encontrado"},404);
 const a=m[2],key=req.headers.get("x-voter-key")||"";
 if(a==="state"&&req.method==="GET")return J(await state(env,e,key,Number(u.searchParams.get("msg"))||0));
 if(a==="message"&&req.method==="POST"){if(!await withinLimit(env.MESSAGE_LIMITER,key))return tooFast("ESTÁS A ENVIAR MENSAGENS DEPRESSA DEMAIS. TENTA DAQUI A UM MINUTO.");const b=await req.json(),msg=clean(b.message);if(msg.length<2)return J({error:"Mensagem demasiado curta"},400);if(await isBanned(env,e.id,key))return J({error:BAN_TEXT,code:"BANNED"},403);
 let ins;try{ins=await env.DB.prepare("INSERT INTO messages(event_id,guest_name,body,voter_key) VALUES(?,?,?,?) RETURNING id").bind(e.id,clean(b.name,40)||"Guest",msg,key||null).first()}
 catch{ins=await env.DB.prepare("INSERT INTO messages(event_id,guest_name,body) VALUES(?,?,?) RETURNING id").bind(e.id,clean(b.name,40)||"Guest",msg).first()}
 return J({ok:true,moderated:true,id:ins?.id??null})}
 if(a==="poll/vote"&&req.method==="POST"){
  if(!key)return J({error:"Voter key em falta"},400);
  if(e.active_moment!=="m2")return J({error:"Poll fechada"},409);
  const b=await req.json(),poll=await env.DB.prepare("SELECT id FROM polls WHERE event_id=? AND active=1 ORDER BY id DESC LIMIT 1").bind(e.id).first();
  if(!poll)return J({error:"Poll não configurada"},404);
  const option=await env.DB.prepare("SELECT id FROM poll_options WHERE id=? AND poll_id=?").bind(Number(b.optionId),poll.id).first();
  if(!option)return J({error:"Essa opção já não pertence à votação activa. Actualiza a página."},400);
  const claim=await claimCooldown(env,e.id,key,"style_wars");
  if(!claim.ok)return cooldownError(claim.retryAfterSeconds);
  // poll_votes guarda só a última escolha do telemóvel (para o ✓); poll_vote_events guarda cada voto (para os totais).
  await env.DB.prepare("INSERT INTO poll_votes(poll_id,option_id,voter_key) VALUES(?,?,?) ON CONFLICT(poll_id,voter_key) DO UPDATE SET option_id=excluded.option_id").bind(poll.id,option.id,key).run();
  try{await env.DB.prepare("INSERT INTO poll_vote_events(poll_id,option_id,voter_key) VALUES(?,?,?)").bind(poll.id,option.id,key).run()}catch{}
  return J({ok:true,optionId:option.id});
 }
 if(a==="tracks"&&req.method==="GET"){
 const q=clean(u.searchParams.get("q"),100);if(q.length<2)return J({results:[],suggestions:[]});
 if(e.active_moment!=="m1")return J({error:"Sugestões fechadas"},409);
 if(!key)return J({error:"Voter key em falta"},400);
 const wait=await cooldownRemaining(env,e.id,key,"music");
 if(wait>0)return searchCooldownError(wait);
 if(!await withinLimit(env.SEARCH_LIMITER,key))return tooFast("ESTÁS A PESQUISAR DEPRESSA DEMAIS. ESPERA UM MINUTO.");
 try{return J(await cachedSearch(env,q,ctx));}
 catch(error){return J({error:error.message},error.status||503)}
 }
 if(a==="tracks"&&req.method==="POST"){
  const b=await req.json();
  if(e.active_moment!=="m1")return J({error:"Sugestões fechadas"},409);
  if(!key)return J({error:"Voter key em falta"},400);
  if(b.source!=="tidal"||!b.tidalId)return J({error:"A faixa tem de vir da pesquisa TIDAL"},400);
  const tidalId=clean(b.tidalId,100);
  const played=await playedError(env,"event_id=? AND tidal_id=?",e.id,tidalId);if(played)return played;
  const claim=await claimCooldown(env,e.id,key,"music");
  if(!claim.ok)return cooldownError(claim.retryAfterSeconds);
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
  const played=await playedError(env,"id=? AND event_id=?",id,e.id);if(played)return played;
  const claim=await claimCooldown(env,e.id,key,"music");
  if(!claim.ok)return cooldownError(claim.retryAfterSeconds);
  await env.DB.prepare("INSERT INTO track_vote_events(event_id,track_id,voter_key) VALUES(?,?,?)").bind(e.id,id,key).run();
  return J({ok:true,voteAdded:true});
 }
 if(a==="dj"&&req.method==="GET"){
  if(!await isDj(req,env,e.id))return J({error:"Acesso DJ necessário"},401);
  // Todas as músicas votadas ainda por tocar, incluindo a que está a tocar (fica na lista, marcada, até ser "Tocada").
  let queue;try{queue=(await env.DB.prepare("SELECT t.id,t.title,t.artist,t.play_status AS status,"+TRACK_VOTES+" AS votes FROM tracks t WHERE t.event_id=? AND t.play_status IN ('queued','playing') ORDER BY votes DESC,t.id ASC LIMIT 1000").bind(e.id).all()).results}
  catch{queue=(await queuedTracks(env,e.id,1000)).results}
  let played=[];try{played=(await env.DB.prepare("SELECT t.id,t.title,t.artist,t.played_at,"+TRACK_VOTES+" AS votes FROM tracks t WHERE t.event_id=? AND t.play_status='played' ORDER BY t.played_at DESC,t.id DESC LIMIT 50").bind(e.id).all()).results}catch{}
  return J({event:{code:e.code,title:env.EVENT_TITLE||e.title,activeMoment:e.active_moment},nowPlaying:await nowPlaying(env,e.id),queue,played});
 }
 if(a.startsWith("dj/track/")&&req.method==="POST"){
  if(!await isDj(req,env,e.id))return J({error:"Acesso DJ necessário"},401);
  const id=Number(a.split("/")[2]),b=await req.json().catch(()=>({}));
  if(!Number.isInteger(id)||id<1)return J({error:"Música inválida"},400);
  if(!["playing","played","queued"].includes(b.status))return J({error:"Estado inválido"},400);
  const track=await env.DB.prepare("SELECT id FROM tracks WHERE id=? AND event_id=?").bind(id,e.id).first();
  if(!track)return J({error:"Música não encontrada"},404);
  try{
   if(b.status==="playing")await env.DB.batch([
    // A anterior volta à lista (só passa a "Tocada" quando o DJ a marca).
    env.DB.prepare("UPDATE tracks SET play_status='queued' WHERE event_id=? AND play_status='playing' AND id<>?").bind(e.id,id),
    env.DB.prepare("UPDATE tracks SET play_status='playing',played_at=NULL WHERE id=? AND event_id=?").bind(id,e.id)]);
   else if(b.status==="played")await env.DB.prepare("UPDATE tracks SET play_status='played',played_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=?").bind(id,e.id).run();
   else await env.DB.prepare("UPDATE tracks SET play_status='queued',played_at=NULL WHERE id=? AND event_id=?").bind(id,e.id).run();
  }catch{return J({error:"Ecrã do DJ indisponível: falta aplicar a migração 0004."},409)}
  return J({ok:true});
 }
 if(!await admin(req,env))return J({error:"Acesso admin necessário"},401);
 if(a==="admin"&&req.method==="GET"){
   const [pending,all]=await Promise.all([
     env.DB.prepare("SELECT id,guest_name,body,status,created_at FROM messages WHERE event_id=? AND status='pending' ORDER BY id DESC").bind(e.id).all(),
     env.DB.prepare("SELECT id,guest_name,body,status,created_at FROM messages WHERE event_id=? ORDER BY id DESC LIMIT 300").bind(e.id).all()
   ]);
   let bans=[];try{bans=(await env.DB.prepare("SELECT voter_key,guest_name,created_at FROM bans WHERE event_id=? ORDER BY created_at DESC").bind(e.id).all()).results}catch{}
   let keys={};try{for(const r of (await env.DB.prepare("SELECT id,voter_key FROM messages WHERE event_id=? AND voter_key IS NOT NULL").bind(e.id).all()).results)keys[r.id]=r.voter_key}catch{}
   const banned=new Set(bans.map(b=>b.voter_key));
   const decorate=list=>list.map(m=>({...m,canBan:!!keys[m.id],banned:!!keys[m.id]&&banned.has(keys[m.id])}));
   return J({pending:decorate(pending.results),messages:decorate(all.results),bans:bans.map(b=>({id:b.voter_key,guest_name:b.guest_name,created_at:b.created_at}))});
 }
 if(a==="dj-pin"&&req.method==="GET"){
   try{const r=await env.DB.prepare("SELECT updated_at FROM dj_access WHERE event_id=?").bind(e.id).first();return J({set:!!r,updatedAt:r?.updated_at||null,envPin:!!env.DJ_PIN})}
   catch{return J({set:false,updatedAt:null,envPin:!!env.DJ_PIN,unavailable:true})}
 }
 if(a==="dj-pin"&&req.method==="POST"){
   const b=await req.json().catch(()=>({}));const pin=String(b.pin??"");
   if(!/^\d{4}$/.test(pin))return J({error:"O PIN do DJ tem de ter 4 números."},400);
   if(env.ADMIN_PIN&&pin===String(env.ADMIN_PIN))return J({error:"Escolhe um PIN diferente do PIN do admin."},400);
   const salt=randomHex(16);
   try{await env.DB.batch([
     env.DB.prepare("INSERT INTO dj_access(event_id,pin_hash,salt,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(event_id) DO UPDATE SET pin_hash=excluded.pin_hash,salt=excluded.salt,updated_at=CURRENT_TIMESTAMP").bind(e.id,await sha256(salt+":"+pin),salt),
     env.DB.prepare("DELETE FROM dj_sessions WHERE event_id=?").bind(e.id)])}
   catch{return J({error:"PIN do DJ indisponível: falta aplicar a migração 0005."},409)}
   return J({ok:true});
 }
 if(a==="dj-pin"&&req.method==="DELETE"){
   try{await env.DB.batch([env.DB.prepare("DELETE FROM dj_access WHERE event_id=?").bind(e.id),env.DB.prepare("DELETE FROM dj_sessions WHERE event_id=?").bind(e.id)])}
   catch{return J({error:"PIN do DJ indisponível: falta aplicar a migração 0005."},409)}
   return J({ok:true});
 }
 if(a==="moment-times"&&req.method==="GET"){
   // Total de segundos no ar por momento (o activo inclui o tempo a decorrer, calculado no cliente a partir de since).
   try{const rows=(await env.DB.prepare("SELECT moment,seconds FROM moment_totals WHERE event_id=?").bind(e.id).all()).results;
     const totals={};for(const r of rows)totals[r.moment]=Number(r.seconds)||0;
     return J({totals,active:e.active_moment,since:e.moment_since?String(e.moment_since).replace(" ","T")+"Z":null})}
   catch{return J({totals:{},unavailable:true})}
 }
 if(a==="moment-times/reset"&&req.method==="POST"){
   try{await env.DB.batch([env.DB.prepare("DELETE FROM moment_totals WHERE event_id=?").bind(e.id),env.DB.prepare("UPDATE events SET moment_since=CURRENT_TIMESTAMP WHERE id=?").bind(e.id)])}
   catch{return J({error:"Tempos indisponíveis: falta aplicar a migração 0006."},409)}
   return J({ok:true});
 }
 if(a==="moment"&&req.method==="POST"){const b=await req.json();if(!["m1","m2","m3","m4","m5"].includes(b.moment))return J({error:"Momento inválido"},400);
   // Cada vez que um momento é (re)iniciado, o tempo que o anterior esteve no ar soma-se ao total dele
   // e o contador volta a zero. Sem a migração 0006, actualiza só o momento.
   try{await env.DB.batch([
     env.DB.prepare("INSERT INTO moment_totals(event_id,moment,seconds) SELECT id,active_moment,MAX(0,CAST(strftime('%s','now') AS INTEGER)-CAST(strftime('%s',moment_since) AS INTEGER)) FROM events WHERE id=? AND moment_since IS NOT NULL AND active_moment IS NOT NULL ON CONFLICT(event_id,moment) DO UPDATE SET seconds=seconds+excluded.seconds").bind(e.id),
     env.DB.prepare("UPDATE events SET moment_since=CURRENT_TIMESTAMP,active_moment=? WHERE id=?").bind(b.moment,e.id)])}
   catch{await env.DB.prepare("UPDATE events SET active_moment=? WHERE id=?").bind(b.moment,e.id).run()}
   return J({ok:true})}
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
 if(a.startsWith("message/")&&a.endsWith("/ban")&&req.method==="POST"){
   const id=Number(a.split("/")[1]);
   if(!Number.isInteger(id)||id<1)return J({error:"Mensagem inválida"},400);
   let m;try{m=await env.DB.prepare("SELECT id,guest_name,voter_key FROM messages WHERE id=? AND event_id=?").bind(id,e.id).first()}catch{return J({error:"Ban indisponível: falta aplicar a migração 0003."},409)}
   if(!m)return J({error:"Mensagem não encontrada"},404);
   if(!m.voter_key)return J({error:"Esta mensagem é anterior ao sistema de ban: não tem telemóvel associado."},409);
   await env.DB.prepare("INSERT OR IGNORE INTO bans(event_id,voter_key,guest_name) VALUES(?,?,?)").bind(e.id,m.voter_key,m.guest_name).run();
   // Retira tudo o que esse telemóvel tem por aprovar ou publicado.
   await env.DB.prepare("UPDATE messages SET status='rejected' WHERE event_id=? AND voter_key=? AND status IN ('pending','published')").bind(e.id,m.voter_key).run();
   return J({ok:true});
 }
 if(a==="devices"&&req.method==="GET"){
   // Telemóveis que enviaram mensagens (só os que têm voter_key, i.e. depois da migração 0003).
   try{
     const rows=(await env.DB.prepare("SELECT m.voter_key AS id,(SELECT guest_name FROM messages x WHERE x.voter_key=m.voter_key AND x.event_id=m.event_id ORDER BY x.id DESC LIMIT 1) AS name,COUNT(*) AS total,SUM(m.status='pending') AS pending,SUM(m.status='published') AS published,SUM(m.status IN ('rejected','hidden')) AS rejected,MAX(m.created_at) AS last_at,EXISTS(SELECT 1 FROM bans b WHERE b.event_id=m.event_id AND b.voter_key=m.voter_key) AS banned FROM messages m WHERE m.event_id=? AND m.voter_key IS NOT NULL GROUP BY m.voter_key ORDER BY banned DESC,last_at DESC LIMIT 300").bind(e.id).all()).results;
     const extra=(await env.DB.prepare("SELECT voter_key AS id,guest_name AS name,created_at FROM bans b WHERE event_id=? AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.event_id=b.event_id AND m.voter_key=b.voter_key)").bind(e.id).all()).results;
     return J({devices:[...rows.map(r=>({...r,banned:!!r.banned})),...extra.map(r=>({id:r.id,name:r.name,total:0,pending:0,published:0,rejected:0,last_at:r.created_at,banned:true}))]});
   }catch{return J({devices:[],unavailable:true})}
 }
 if(a.startsWith("ban/")&&req.method==="POST"){
   const key=decodeURIComponent(a.slice(4));if(!key)return J({error:"Telemóvel inválido"},400);
   try{
     const last=await env.DB.prepare("SELECT guest_name FROM messages WHERE event_id=? AND voter_key=? ORDER BY id DESC LIMIT 1").bind(e.id,key).first();
     await env.DB.batch([
       env.DB.prepare("INSERT OR IGNORE INTO bans(event_id,voter_key,guest_name) VALUES(?,?,?)").bind(e.id,key,last?.guest_name||null),
       env.DB.prepare("UPDATE messages SET status='rejected' WHERE event_id=? AND voter_key=? AND status IN ('pending','published')").bind(e.id,key)]);
   }catch{return J({error:"Ban indisponível: falta aplicar a migração 0003."},409)}
   return J({ok:true});
 }
 if(a.startsWith("ban/")&&req.method==="DELETE"){
   const key=decodeURIComponent(a.slice(4));
   if(!key)return J({error:"Ban inválido"},400);
   const r=await env.DB.prepare("DELETE FROM bans WHERE event_id=? AND voter_key=?").bind(e.id,key).run();
   return r.meta.changes?J({ok:true}):J({error:"Ban não encontrado"},404);
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