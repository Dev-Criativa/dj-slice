function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const code=new URLSearchParams(location.search).get('event')||'PARTY2026';
async function draw(){
  try{
    const d=await fetch(`/api/${encodeURIComponent(code)}/state`).then(r=>r.json());
    const m=d.event.activeMoment;
    document.querySelector('#moment').textContent=m.toUpperCase();
    const h=document.querySelector('#headline'), b=document.querySelector('#body'), f=document.querySelector('#feed');
    if(m==='m1'){
      h.innerHTML='What’s next<br><em>on the dancefloor?</em>';
      b.textContent='Scan the QR Code Display to search TIDAL and vote.';
      f.innerHTML='<h2>Most wanted</h2>'+(d.tracks||[]).slice(0,8).map(t=>`<p>${esc(t.title)} — ${esc(t.artist)} · ${t.votes}</p>`).join('')+(d.messages||[]).map(x=>`<p>“${esc(x.body)}”</p>`).join('');
    }else if(m==='m2'){
      h.textContent=d.poll?.question||'SONG WARS';
      b.textContent='Scan the QR Code Display to vote for your side.';
      f.innerHTML=(d.poll?.options||[]).map(o=>`<p>${esc(o.label)} · ${o.votes}</p>`).join('')+(d.messages||[]).map(x=>`<p>“${esc(x.body)}”</p>`).join('');
    }else if(m==='m3'){
      h.innerHTML='MIDNIGHT<br><em>SLICE.</em>';
      b.textContent='Pizza is served. Grab a slice at the pizza stand.';
      f.innerHTML='';
    }else{
      h.innerHTML='TURN ON<br><em>THE LIGHTS.</em>';
      b.textContent='Turn on the lights of your mobile.';
      f.innerHTML='';
    }
  }catch(e){document.querySelector('#body').textContent='A aguardar ligação ao evento…'}
}
draw();setInterval(draw,2500);
