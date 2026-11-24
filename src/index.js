const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const clean=(x,n=240)=>String(x??"").trim().slice(0,n);
async function event(env,code){return env.DB.prepare("SELECT * FROM events WHERE code=?").bind(code.toUpperCase()).first()}
async function admin(req,env){const t=req.headers.get("authorization")?.replace("Bearer ","");return !!t&&!!env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN}
async function state(env,e){
 const [msgs,tracks,poll,opts]=await Promise.all([
 env.DB.prepare("SELECT id,guest_name,body FROM messages WHERE event_id=? AND status='published' ORDER BY id DESC LIMIT 25").bind(e.id).all(),
 env.DB.prepare("SELECT id,tidal_id,title,artist,album,artwork_url,votes FROM tracks WHERE event_id=? ORDER BY votes DESC,id LIMIT 25").bind(e.id).all(),
 env.DB.prepare("SELECT * FROM polls WHERE event_id=? AND active=1 ORDER BY id DESC LIMIT 1").bind(e.id).first(),
 env.DB.prepare("SELECT o.id,o.label,(SELECT COUNT(*) FROM poll_votes v WHERE v.option_id=o.id) votes FROM poll_options o JOIN polls p ON p.id=o.poll_id WHERE p.event_id=? AND p.active=1 ORDER BY o.sort_order").bind(e.id).all()
 ]);
 return {event:{code:e.code,title:e.title,activeMoment:e.active_moment},messages:msgs.results,tracks:tracks.results,poll:poll?{...poll,options:opts.results}:null};
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 let p=u.pathname;
 const aliases={"/qr":"/qr.html","/guest":"/guest.html","/admin":"/admin.html","/room":"/room.html"};
 if(aliases[p]){u.pathname=aliases[p];return env.ASSETS.fetch(new Request(u,req));}
 if(!p.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(p==="/api/login"&&req.method==="POST"){const b=await req.json();return String(b.pin)===env.ADMIN_PIN?J({token:env.ADMIN_TOKEN}):J({error:"PIN incorrecto"},401)}
 const m=p.match(/^\/api\/([A-Z0-9_-]+)\/(.*)$/i);if(!m)return J({error:"Endpoint inválido"},404);
 const e=await event(env,m[1]);if(!e)return J({error:"Evento não encontrado"},404);
 const a=m[2],key=req.headers.get("x-voter-key")||"";
 if(a==="state"&&req.method==="GET")return J(await state(env,e));
 if(a==="message"&&req.method==="POST"){const b=await req.json(),msg=clean(b.message);if(msg.length<2)return J({error:"Mensagem demasiado curta"},400);await env.DB.prepare("INSERT INTO messages(event_id,guest_name,body) VALUES(?,?,?)").bind(e.id,clean(b.name,40)||"Guest",msg).run();return J({ok:true,moderated:true})}
 if(a==="poll/vote"&&req.method==="POST"){if(!key)return J({error:"Voter key em falta"},400);if(e.active_moment!=="m2")return J({error:"Poll fechada"},409);const b=await req.json(),poll=await env.DB.prepare("SELECT id FROM polls WHERE event_id=? AND active=1 ORDER BY id DESC LIMIT 1").bind(e.id).first();if(!poll)return J({error:"Poll não configurada"},404);await env.DB.prepare("INSERT INTO poll_votes(poll_id,option_id,voter_key) VALUES(?,?,?) ON CONFLICT(poll_id,voter_key) DO UPDATE SET option_id=excluded.option_id").bind(poll.id,Number(b.optionId),key).run();return J({ok:true})}
 if(a==="tracks"&&req.method==="GET")return J({error:"Pesquisa TIDAL por ligar: exige credenciais e validação do endpoint autorizado"},503);
 if(a==="tracks"&&req.method==="POST"){const b=await req.json();if(e.active_moment!=="m1")return J({error:"Sugestões fechadas"},409);if(b.source!=="tidal"||!b.tidalId)return J({error:"A faixa tem de vir da pesquisa TIDAL"},400);await env.DB.prepare("INSERT OR IGNORE INTO tracks(event_id,tidal_id,title,artist,album,artwork_url) VALUES(?,?,?,?,?,?)").bind(e.id,clean(b.tidalId,100),clean(b.title,180),clean(b.artist,180),clean(b.album,180),clean(b.artworkUrl,500)).run();return J({ok:true})}
 if(a.startsWith("track/")&&a.endsWith("/vote")&&req.method==="POST"){if(!key)return J({error:"Voter key em falta"},400);if(e.active_moment!=="m1")return J({error:"Votação fechada"},409);const id=Number(a.split("/")[1]);await env.DB.prepare("INSERT OR IGNORE INTO track_votes(track_id,voter_key) SELECT id,? FROM tracks WHERE id=? AND event_id=?").bind(key,id,e.id).run();await env.DB.prepare("UPDATE tracks SET votes=(SELECT COUNT(*) FROM track_votes WHERE track_id=?) WHERE id=?").bind(id,id).run();return J({ok:true})}
 if(!await admin(req,env))return J({error:"Acesso admin necessário"},401);
 if(a==="admin"&&req.method==="GET"){const r=await env.DB.prepare("SELECT id,guest_name,body,status FROM messages WHERE event_id=? AND status='pending' ORDER BY id").bind(e.id).all();return J({pending:r.results})}
 if(a==="moment"&&req.method==="POST"){const b=await req.json();if(!["m1","m2","m3","m4"].includes(b.moment))return J({error:"Momento inválido"},400);await env.DB.prepare("UPDATE events SET active_moment=? WHERE id=?").bind(b.moment,e.id).run();return J({ok:true})}
 if(a.startsWith("message/")&&req.method==="PATCH"){const id=Number(a.split("/")[1]),b=await req.json();if(!["published","rejected","hidden"].includes(b.status))return J({error:"Estado inválido"},400);await env.DB.prepare("UPDATE messages SET status=? WHERE id=? AND event_id=?").bind(b.status,id,e.id).run();return J({ok:true})}
 if(a==="poll"&&req.method==="POST"){const b=await req.json(),opts=(b.options||[]).map(x=>clean(x,80)).filter(Boolean).slice(0,5);if(opts.length<2)return J({error:"Poll precisa de duas opções"},400);await env.DB.prepare("UPDATE polls SET active=0 WHERE event_id=?").bind(e.id).run();const r=await env.DB.prepare("INSERT INTO polls(event_id,question,active) VALUES(?,?,1)").bind(e.id,clean(b.question,180)||"Choose your side").run();for(let i=0;i<opts.length;i++)await env.DB.prepare("INSERT INTO poll_options(poll_id,label,sort_order) VALUES(?,?,?)").bind(r.meta.last_row_id,opts[i],i).run();return J({ok:true})}
 return J({error:"Acção não suportada"},404);
}};
