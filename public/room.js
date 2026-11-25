function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const code=new URLSearchParams(location.search).get('event')||'PARTY2026';
const el=id=>document.getElementById(id);
const guestUrl=new URL('/guest',location.origin);guestUrl.searchParams.set('event',code);
let qrReady=false;
function setupProjectorQR(){const box=el('projector-qr');if(!box||qrReady||!window.QRCode)return;if(!box.childElementCount){new QRCode(box,{text:guestUrl.href,width:116,height:116,colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}qrReady=true;}

function renderMessages(messages){
  const list=(messages||[]).slice(0,4);
  el('messages-content').innerHTML=list.length
    ? list.map(message=>`<div class="room-message">“${esc(message.body)}”<span>— ${esc(message.guest_name||'')}</span></div>`).join('')
    : '<p class="room-empty">As mensagens do público aparecem aqui.</p>';
}

function renderTracks(tracks){
  const all=(tracks||[]);
  const list=all; // todas as que o servidor devolve; fitRanking() esconde as que não cabem
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
  requestAnimationFrame(fitRanking);
}
// Mostra tantas músicas quantas couberem no painel: esconde a partir da primeira que sairia do fundo.
function fitRanking(){
  const box=el('primary-content');if(!box)return;
  const rows=[...box.querySelectorAll('.room-ranking')];
  rows.forEach(row=>row.hidden=false);
  const limit=box.getBoundingClientRect().bottom+1;
  let cut=false;
  rows.forEach(row=>{if(cut||row.getBoundingClientRect().bottom>limit){cut=true;row.hidden=true;}});
}
window.addEventListener('resize',fitRanking);
// Recalcula quando as fontes acabam de carregar e quando o painel muda de tamanho (ex.: aparece "A TOCAR").
document.fonts?.ready.then(fitRanking);
if(window.ResizeObserver){const ro=new ResizeObserver(()=>requestAnimationFrame(fitRanking));const pc=el('primary-content');if(pc)ro.observe(pc);}
function renderPoll(poll){
  el('primary-label').textContent='RESULTADO DA VOTAÇÃO';
  const options=[...(poll?.options||[])].sort((a,b)=>(Number(b.votes)||0)-(Number(a.votes)||0));
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
    const rawMoment=String(data.event.activeMoment||'').toLowerCase().trim();
    const moment=['m1','m2','m3','m4','m5'].includes(rawMoment)?rawMoment:'';
    const qr=el('join-qr');
    qr.classList.toggle('visible',moment==='m1'||moment==='m2');
    setupProjectorQR();
    // M5 = QR grande de entrada
    const big=el('big-qr');if(big){big.hidden=moment!=='m5';if(moment==='m5'&&!big.childElementCount&&window.QRCode)new QRCode(big,{text:guestUrl.href,width:720,height:720,colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}
    document.querySelector('.room-screen').classList.toggle('moment-qr',moment==='m5');
    document.querySelector('.room-screen').classList.toggle('moment-call',moment==='m3'||moment==='m4'||moment==='m5'||!moment);
    el('event-brand').textContent='PEDE & FATIA';
    document.title='PEDE & FATIA — Projecção';
    el('moment').textContent=moment.toUpperCase();
    el('dashboard').hidden=moment!=='m1'&&moment!=='m2';

    const np=el('now-playing');
    if(np){const n=data.nowPlaying;np.hidden=!(moment==='m1'&&n);if(n)np.innerHTML=`<small>A TOCAR</small><strong>${esc(n.title)}</strong><em>${esc(n.artist)}</em>`;}
    if(moment==='m1'){
      el('headline').innerHTML='O que toca<br><em>a seguir?</em>';
      el('body').textContent='Sugere uma música. Vota. Faz parte da festa.';
      renderTracks(data.tracks);
      renderMessages(data.messages);
    }else if(moment==='m2'){
      const pollQuestion=String(data.poll?.question||'SONG WARS');
      el('headline').innerHTML=esc(pollQuestion).replace(/\s+(ESTA)\b/i,'<br>$1');
      el('body').textContent='Vota no teu lado. Os resultados aparecem em directo.';
      renderPoll(data.poll);
      renderMessages(data.messages);
    }else if(moment==='m3'){
      el('headline').innerHTML='MIDNIGHT<br><em>SLICE.</em>';
      el('body').textContent='A PIZZA ESTÁ SERVIDA. VAI BUSCAR A TUA FATIA.';
    }else if(moment==='m4'){
      el('headline').innerHTML='TURN ON<br><em>THE LIGHTS.</em>';
      el('body').textContent='LIGA A LANTERNA DO TEU TELEMÓVEL.';
    }else if(moment==='m5'){
      el('headline').innerHTML='ENTRA NA<br><em>FESTA.</em>';
      el('body').textContent='APONTA A CÂMARA E PARTICIPA.';
    }else{
      el('headline').innerHTML='PEDE<br><em>&amp; FATIA</em>';
      el('body').textContent='A AGUARDAR O PRÓXIMO MOMENTO.';
    }
  }catch(error){el('body').textContent='À espera de ligação ao evento…'}
}
draw();
setInterval(draw,2500);
