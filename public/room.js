function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const code=new URLSearchParams(location.search).get('event')||'PARTY2026';
const el=id=>document.getElementById(id);

function renderMessages(messages){
  const list=(messages||[]).slice(0,4);
  el('messages-content').innerHTML=list.length
    ? list.map(message=>`<div class="room-message">“${esc(message.body)}”<span>— ${esc(message.guest_name||'')}</span></div>`).join('')
    : '<p class="room-empty">As mensagens do público aparecem aqui.</p>';
}

function renderTracks(tracks){
  const list=(tracks||[]).slice(0,5);
  el('primary-label').textContent='TOP MÚSICAS';
  el('primary-content').innerHTML=list.length
    ? list.map((track,index)=>`<div class="room-ranking"><b>${index+1}</b><div><strong>${esc(track.title)}</strong><span>${esc(track.artist)}</span></div><em>${Number(track.votes)||0}</em></div>`).join('')
    : '<p class="room-empty">As sugestões e os votos aparecem aqui.</p>';
}

function renderPoll(poll){
  el('primary-label').textContent='RESULTADO DA VOTAÇÃO';
  const options=poll?.options||[];
  const total=options.reduce((sum,option)=>sum+(Number(option.votes)||0),0);
  el('primary-content').innerHTML=options.length
    ? options.slice(0,5).map(option=>{
        const votes=Number(option.votes)||0;
        const percent=total?Math.round(votes/total*100):0;
        return `<div class="room-poll-option"><div class="room-poll-meta"><strong>${esc(option.label)}</strong><span>${percent}% · ${votes}</span></div><div class="room-bar"><i style="width:${percent}%"></i></div></div>`;
      }).join('')
    : '<p class="room-empty">A votação ainda não está disponível.</p>';
}

async function draw(){
  try{
    const response=await fetch(`/api/${encodeURIComponent(code)}/state`,{cache:'no-store'});
    if(!response.ok) throw new Error('Evento indisponível');
    const data=await response.json();
    const moment=data.event.activeMoment;
    el('event-brand').textContent='PEDE & FATIA';
    document.title='PEDE & FATIA — Projecção';
    el('moment').textContent=moment.toUpperCase();
    el('dashboard').hidden=moment==='m3'||moment==='m4';

    if(moment==='m1'){
      el('headline').innerHTML='O que toca<br><em>a seguir?</em>';
      el('body').textContent='Sugere uma música. Vota. Faz parte da festa.';
      renderTracks(data.tracks);
      renderMessages(data.messages);
    }else if(moment==='m2'){
      el('headline').textContent=data.poll?.question||'SONG WARS';
      el('body').textContent='Vota no teu lado. Os resultados aparecem em directo.';
      renderPoll(data.poll);
      renderMessages(data.messages);
    }else if(moment==='m3'){
      el('headline').innerHTML='MIDNIGHT<br><em>SLICE.</em>';
      el('body').textContent='A pizza está servida. Vai buscar uma fatia.';
    }else{
      el('headline').innerHTML='TURN ON<br><em>THE LIGHTS.</em>';
      el('body').textContent='Liga a lanterna do teu telemóvel.';
    }
  }catch(error){el('body').textContent='À espera de ligação ao evento…'}
}
draw();
setInterval(draw,2500);
