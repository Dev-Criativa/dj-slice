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
  const all=(tracks||[]);
  const list=all.slice(0,5);
  const total=all.reduce((sum,track)=>sum+(Number(track.votes)||0),0);
  const max=Math.max(1,...all.map(track=>Number(track.votes)||0));
  el('primary-label').textContent='TOP MÚSICAS · '+total+' VOTOS';
  el('primary-content').innerHTML=list.length
    ? list.map((track,index)=>{
       const votes=Number(track.votes)||0;
       const share=total?Math.round(votes/total*100):0;
       const width=Math.round(votes/max*100);
       return `<div class="room-ranking"><b>${index+1}</b><div class="room-track-info"><div class="room-track-line"><strong>${esc(track.title)}</strong><em>${votes} ${votes===1?'voto':'votos'} · ${share}%</em><span>${esc(track.artist)}</span></div><div class="room-track-bar"><i style="width:${width}%"></i></div></div></div>`;
      }).join('')
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
    document.querySelector('.room-screen').classList.toggle('moment-call',moment==='m3'||moment==='m4');
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
      el('body').textContent='É HORA DA FATIA. VAI BUSCAR A TUA!';
    }else{
      el('headline').innerHTML='TURN ON<br><em>THE LIGHTS.</em>';
      el('body').textContent='TELEMÓVEIS NO AR. ACENDE A LANTERNA!';
    }
  }catch(error){el('body').textContent='À espera de ligação ao evento…'}
}
draw();
setInterval(draw,2500);
