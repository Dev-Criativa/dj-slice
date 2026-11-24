function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const code=new URLSearchParams(location.search).get('event')||'PARTY2026';
async function draw(){
  try{
    const response=await fetch(`/api/${encodeURIComponent(code)}/state`,{cache:'no-store'});
    if(!response.ok) throw new Error('Evento indisponível');
    const d=await response.json(), m=d.event.activeMoment;
    document.querySelector('#moment').textContent=m.toUpperCase();
    const h=document.querySelector('#headline'), b=document.querySelector('#body'), f=document.querySelector('#feed');
    if(m==='m1'){
      h.innerHTML='O que vem a seguir<br><em>na pista?</em>';
      b.textContent='Lê o QR Code, sugere uma música e vota.';
      f.innerHTML='<h2>As mais votadas</h2>'+(d.tracks||[]).slice(0,8).map(t=>`<p>${esc(t.title)} — ${esc(t.artist)} · ${t.votes}</p>`).join('')+(d.messages||[]).map(x=>`<p>“${esc(x.body)}”</p>`).join('');
    }else if(m==='m2'){
      h.textContent=d.poll?.question||'SONG WARS';
      b.textContent='Lê o QR Code e vota no teu lado.';
      f.innerHTML=(d.poll?.options||[]).map(o=>`<p>${esc(o.label)} · ${o.votes}</p>`).join('')+(d.messages||[]).map(x=>`<p>“${esc(x.body)}”</p>`).join('');
    }else if(m==='m3'){
      h.innerHTML='MIDNIGHT<br><em>SLICE.</em>';
      b.textContent='A pizza está servida. Vai buscar uma fatia.';
      f.innerHTML='';
    }else{
      h.innerHTML='TURN ON<br><em>THE LIGHTS.</em>';
      b.textContent='Liga a lanterna do teu telemóvel.';
      f.innerHTML='';
    }
  }catch(e){document.querySelector('#body').textContent='À espera de ligação ao evento…'}
}
draw();setInterval(draw,2500);
