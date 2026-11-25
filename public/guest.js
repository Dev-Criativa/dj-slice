let renderedMoment = null;

function voteMessage(seconds) {
  if (!(Number(seconds) > 0)) return '';
  const mins = Math.max(1, Math.ceil(Number(seconds) / 60));
  return 'O TEU VOTO JÁ FOI REGISTADO. VOLTA A TENTAR EM ' + mins + ' MIN.';
}
function renderMusicStatus(voting) {
  const status = document.querySelector('#music-vote-status');
  if (!status) return;
  const wait = Number(voting?.musicRetryAfterSeconds) || 0;
  status.textContent = wait > 0 ? 'O TEU VOTO JÁ FOI REGISTADO. PODES SUGERIR OU VOTAR DE NOVO EM ' + Math.max(1, Math.ceil(wait / 60)) + ' MIN.' : '';
  status.hidden = !status.textContent;
  const input = document.querySelector('#q');
  if (input) {
    const locked = wait > 0;
    if (input.disabled !== locked) {
      input.disabled = locked;
      input.placeholder = locked ? 'Pesquisa disponível quando o tempo acabar' : 'Pesquisa por música ou artista';
      document.querySelectorAll('#results button, #suggestions button').forEach(b => { if (!b.classList.contains('selected')) b.disabled = locked; });
    }
  }
}
function renderPoll(poll, voting) {
  const question = document.querySelector('#poll-question');
  const options = document.querySelector('#poll-options');
  if (!question || !options) return;
  question.textContent = poll?.question || 'A votação ainda não está disponível.';
  const items = [...(poll?.options || [])].sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));
  const remaining = Number(voting?.styleWarsRetryAfterSeconds) || 0;
  const myOption = voting?.myStyleWarsOptionId == null ? null : String(voting.myStyleWarsOptionId);
  const notice = voteMessage(remaining);
  options.innerHTML = (notice ? '<p class="vote-cooldown" role="status">' + esc(notice) + '</p>' : '') + (items.length
    ? items.map(option => {
        const selected = myOption === String(option.id);
        return '<button class="option' + (selected ? ' selected' : '') + '" data-id="' + esc(option.id) + '"' + (remaining > 0 ? ' disabled' : '') + '>' + esc(option.label) + (selected ? ' ✓' : '') + '</button>';
      }).join('')
    : '<p class="poll-empty">A votação ainda não tem opções. Aguarda que o DJ a configure.</p>');
  options.querySelectorAll('[data-id]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api('poll/vote', {method:'POST',body:JSON.stringify({optionId:button.dataset.id})});
        await draw();
      } catch (error) {
        alert(error.message);
        await draw();
      }
    };
  });
}

// Top 5 (o mesmo que o projector mostra), com botão para votar.
let topTracksKey = '';
function renderTopTracks(tracks, voting) {
  const box = document.querySelector('#top-tracks');
  if (!box) return;
  const list = (tracks || []).slice(0, 5);
  const locked = (Number(voting?.musicRetryAfterSeconds) || 0) > 0;
  const key = JSON.stringify([locked, list.map(t => [t.id, t.votes])]);
  if (key === topTracksKey) return;
  topTracksKey = key;
  box.innerHTML = list.length
    ? list.map((t, i) => {
        const votes = Number(t.votes) || 0;
        return '<button type="button" class="track-result" data-vote="' + esc(t.id) + '"' + (locked ? ' disabled' : '') + '><strong>' + (i + 1) + '. ' + esc(t.title) + '</strong><span>' + esc(t.artist) + ' · ' + votes + (votes === 1 ? ' voto' : ' votos') + '</span></button>';
      }).join('')
    : '<p class="search-status">Ainda não há músicas na lista. Sugere a primeira!</p>';
  box.querySelectorAll('[data-vote]').forEach(button => {
    const t = list.find(x => String(x.id) === button.dataset.vote);
    button.onclick = () => showTrackConfirm(t, async () => {
      await api('track/' + encodeURIComponent(t.id) + '/vote', {method:'POST', body:'{}'});
      topTracksKey = '';
      await draw();
    }, 'CONFIRMAR VOTO');
  });
}

function bindM3Modal(content) {
  const modal = content.querySelector('.m3-modal'), open = content.querySelector('.m3-button');
  if (!modal || !open) return;
  const close = modal.querySelector('.pizza-modal-close'), ok = modal.querySelector('.pizza-modal-ok');
  const show = () => { modal.classList.add('visible'); modal.setAttribute('aria-hidden', 'false'); ok.focus(); };
  const hide = () => { modal.classList.remove('visible'); modal.setAttribute('aria-hidden', 'true'); open.focus(); };
  open.onclick = show; close.onclick = hide; ok.onclick = hide;
  modal.onclick = e => { if (e.target === modal) hide(); };
}

async function draw() {
  try {
    const myMsg = auraMessageId();
    const d = await api('state' + (myMsg ? '?msg=' + myMsg : ''));
    const moment = d.event.activeMoment;
    const content = document.querySelector('#content');
    document.querySelector('#title').textContent = d.event.title;
    document.querySelector('#event-brand').textContent = d.event.title;
    document.title = d.event.title;
    document.querySelector('#intro').textContent = 'A experiência acompanha o momento da festa.';

    // Mantém a interface e os campos intactos; actualiza os dados dinâmicos da poll.
    if (moment === renderedMoment) {
      if (moment === 'm2') renderPoll(d.poll, d.voting);
      if (moment === 'm1') { renderMusicStatus(d.voting); renderTopTracks(d.tracks, d.voting); }
      if (moment === 'm1' || moment === 'm2') renderAura(d.myMessage, d.banned);
      return;
    }
    renderedMoment = moment;
    topTracksKey = '';
    window.stopM4?.();
    delete content.dataset.m4Ready;
    delete content.dataset.pizzaReady;
    content.classList.remove('m3-content','m4-content','pizza-content');
    document.querySelector('.mobile')?.classList.remove('m3-mode','m4-mode','pizza-mode');

    if (moment === 'm1') {
      content.innerHTML = '<h2>Sugere uma música</h2><p id="music-vote-status" class="vote-cooldown" role="status" hidden></p><div class="track-search"><input id="q" autocomplete="off" placeholder="Pesquisa por música ou artista"><div id="suggestions" class="track-suggestions"></div><div id="results" class="track-results"></div></div><h2>Vota nas que já estão na lista</h2><div id="top-tracks" class="track-results"></div><hr><h2>Farmador de Aura</h2><p id="aura-status" class="vote-cooldown" role="status" hidden></p><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      renderMusicStatus(d.voting);
      renderTopTracks(d.tracks, d.voting);
      bindTrackSearch();
      bindMessage();
      renderAura(d.myMessage, d.banned);
    } else if (moment === 'm2') {
      content.innerHTML = '<h2 id="poll-question">A carregar votação…</h2><div id="poll-options"></div><hr><h2>Farmador de Aura</h2><p id="aura-status" class="vote-cooldown" role="status" hidden></p><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      renderPoll(d.poll, d.voting);
      bindMessage();
      renderAura(d.myMessage, d.banned);
    } else if (moment === 'm3') {
      content.classList.add('m3-content');
      document.querySelector('.mobile')?.classList.add('m3-mode');
      content.innerHTML = '<h2 class="m3-headline"><span>MIDNIGHT</span><span>SLICE.</span></h2>'
        + '<div class="m3-visual"><img src="/m3-pizza.webp" alt="Ilustração de uma mão a segurar uma fatia de pizza" onerror="this.parentNode.classList.add(\'is-missing\')"></div>'
        + '<p class="m3-instruction">A PIZZA ESTÁ SERVIDA.<br>VAI BUSCAR A TUA FATIA.</p>'
        + '<button type="button" class="m3-button"><span class="m3-button-icon" aria-hidden="true">◢</span><span>COMO PEDIR A FATIA</span></button>'
        + '<div class="pizza-modal m3-modal" aria-hidden="true"><section class="pizza-modal-card" role="dialog" aria-modal="true" aria-labelledby="m3-modal-title">'
        + '<button class="pizza-modal-close" type="button" aria-label="Fechar">×</button>'
        + '<p class="pizza-modal-kicker">PEDE &amp; FATIA · MIDNIGHT SLICE</p>'
        + '<h3 id="m3-modal-title">A TUA FATIA<br>ESTÁ À ESPERA.</h3>'
        + '<p>Vai ao balcão das pizzas e troca uma das tuas fichas por uma fatia.</p>'
        + '<strong>SEM LIMITES.<br>COME ATÉ NÃO CONSEGUIRES PASSAR NAS PORTAS!</strong>'
        + '<button type="button" class="pizza-modal-ok">ENTENDIDO</button></section></div>';
      bindM3Modal(content);
    } else if (moment === 'm4') {
      content.innerHTML = '<div class="device-call" data-m4-trigger><h2>TURN ON<br><em>THE LIGHTS.</em></h2><p>LIGA A LANTERNA DO TEU TELEMÓVEL.</p></div>';
      window.renderM4?.();
    } else if (moment === 'm5') {
      window.renderPizza?.();
    } else {
      content.innerHTML = '<div class="device-call"><p>A AGUARDAR O PRÓXIMO MOMENTO.</p></div>';
    }
  } catch (error) {
    // Falha pontual com um ecrã já desenhado: mantém o ecrã (não interrompe a lanterna do M4
    // nem o que o convidado está a escrever) e tenta de novo na próxima actualização.
    if (renderedMoment) return;
    document.querySelector('#content').textContent = error.message;
  }
}

function showTrackConfirm(track,onConfirm,kicker){
 let modal=document.querySelector('#track-confirm');
 if(!modal){
  modal=document.createElement('div');modal.id='track-confirm';modal.className='track-confirm';modal.innerHTML='<div class="track-confirm-card" role="dialog" aria-modal="true" aria-labelledby="track-confirm-title"><p class="track-confirm-kicker">CONFIRMAR SUGESTÃO</p><h3 id="track-confirm-title"></h3><p class="track-confirm-artist"></p><div class="track-confirm-actions"><button type="button" class="secondary" id="track-back">VOLTAR</button><button type="button" id="track-confirm-yes">CONFIRMAR</button></div></div>';document.body.appendChild(modal);
 }
 modal.querySelector('.track-confirm-kicker').textContent=kicker||'CONFIRMAR SUGESTÃO';
 modal.querySelector('h3').textContent=track.title;
 modal.querySelector('.track-confirm-artist').textContent=track.artist;
 modal.classList.add('visible');
 const back=modal.querySelector('#track-back'),yes=modal.querySelector('#track-confirm-yes');
 back.onclick=()=>modal.classList.remove('visible');
 yes.onclick=async()=>{yes.disabled=true;try{await onConfirm();modal.classList.remove('visible')}catch(error){alert(error.message)}finally{yes.disabled=false}};
 modal.onclick=e=>{if(e.target===modal)modal.classList.remove('visible')};
}
function bindTrackSearch(){
 const input=document.querySelector('#q'),results=document.querySelector('#results'),suggestions=document.querySelector('#suggestions');
 let timer=null,lastQuery='',requestId=0;
 async function search(){
  const q=input.value.trim();if(q.length<2){results.innerHTML='';suggestions.innerHTML='';return}
  const id=++requestId;lastQuery=q;results.innerHTML='<p class="search-status">A procurar na TIDAL…</p>';
  try{
   const data=await api('tracks?q='+encodeURIComponent(q));
   if(id!==requestId||input.value.trim()!==lastQuery)return;
   suggestions.innerHTML=(data.suggestions||[]).map(s=>'<button type="button" class="suggestion" data-query="'+esc(s)+'">'+esc(s)+'</button>').join('');
   suggestions.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>{input.value=b.dataset.query;search()});
   results.innerHTML=(data.results||[]).length?(data.results||[]).map(t=>'<button type="button" class="track-result" data-track="'+esc(JSON.stringify(t))+'"><strong>'+esc(t.title)+'</strong><span>'+esc(t.artist)+'</span></button>').join(''):'<p class="search-status">Não encontrámos resultados. Experimenta outro termo.</p>';
   results.querySelectorAll('[data-track]').forEach(b=>b.onclick=()=>{
    const t=JSON.parse(b.dataset.track);
    showTrackConfirm(t,async()=>{
     await api('tracks',{method:'POST',body:JSON.stringify({source:'tidal',tidalId:t.tidalId,title:t.title,artist:t.artist,album:t.album})});
     // Depois da escolha: limpa a pesquisa e fecha a lista (a mensagem de cooldown confirma o voto).
     clearTimeout(timer);requestId++;lastQuery='';input.value='';input.blur();results.innerHTML='';suggestions.innerHTML='';
     await draw();
    });
   });
  }catch(error){if(id===requestId)results.innerHTML='<p class="search-status">'+esc(error.message)+'</p>';if(error.code==='SEARCH_COOLDOWN')draw()}
 }
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,500)});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);search()}});
}

// Farmador de Aura: estado da última mensagem deste telemóvel.
// pending -> bloqueado; rejected/hidden -> negada; published -> farmada. Depois de decidida, pode enviar outra.
const AURA_KEY = 'ee-aura-' + CODE;
function auraMessageId() { try { return Number(localStorage.getItem(AURA_KEY)) || 0; } catch { return 0; } }
const AURA_TEXT = {
  pending: 'A TUA AURA ESTÁ À ESPERA DE APROVAÇÃO.',
  rejected: 'A TUA AURA FOI NEGADA. FARMA ALGO MELHOR.',
  hidden: 'A TUA AURA FOI NEGADA. FARMA ALGO MELHOR.',
  published: 'A TUA AURA FOI FARMADA. TODOS VÃO SABER!!'
};
let auraNotice = '', auraBanned = false;
function renderAura(myMessage, banned) {
  const status = document.querySelector('#aura-status');
  if (!status) return;
  const st = myMessage?.status;
  if (st === 'deleted') { try { localStorage.removeItem(AURA_KEY); } catch {} }
  if (banned !== undefined) auraBanned = !!banned;
  const locked = st === 'pending' || auraBanned;
  const text = auraBanned ? 'FARMASTE TUDO MENOS AURA! FOSTE BANID@!' : (AURA_TEXT[st] || auraNotice);
  status.textContent = text;
  status.hidden = !text;
  status.classList.toggle('aura-ok', st === 'published');
  status.classList.toggle('aura-no', auraBanned || st === 'rejected' || st === 'hidden');
  status.classList.toggle('aura-ban', auraBanned);
  if (auraBanned) status.classList.remove('aura-ok');
  ['#name', '#msg', '#send'].forEach(sel => { const el = document.querySelector(sel); if (el) el.disabled = locked; });
}
function bindMessage() {
  const send = document.querySelector('#send');
  try { const saved = localStorage.getItem('ee-name'); if (saved) document.querySelector('#name').value = saved; } catch {}
  send.onclick = async () => {
    const name = document.querySelector('#name').value.trim();
    const message = document.querySelector('#msg').value.trim();
    if (!message) { auraNotice = 'ESCREVE UMA MENSAGEM PRIMEIRO.'; renderAura(null); return; }
    send.disabled = true;
    try {
      const r = await api('message', {method:'POST', body:JSON.stringify({name, message})});
      try { if (r.id) localStorage.setItem(AURA_KEY, String(r.id)); if (name) localStorage.setItem('ee-name', name); } catch {}
      document.querySelector('#msg').value = '';
      auraNotice = '';
      renderAura({id: r.id, status: 'pending'});
    } catch (error) {
      if (error.code === 'BANNED') { renderAura(null, true); return; }
      auraNotice = String(error.message || 'NÃO FOI POSSÍVEL ENVIAR.').toUpperCase();
      renderAura(null);
      send.disabled = false;
    }
  };
}

draw();
setInterval(draw, 3000);
