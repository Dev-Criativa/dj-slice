let renderedMoment = null;

function voteMessage(seconds) {
  if (!(Number(seconds) > 0)) return '';
  const mins = Math.max(1, Math.ceil(Number(seconds) / 60));
  return 'O TEU VOTO JÁ FOI REGISTADO. VOLTA A TENTAR EM ' + mins + ' MIN.';
}
function renderMusicStatus(voting) {
  const status = document.querySelector('#music-vote-status');
  if (!status) return;
  status.textContent = voteMessage(voting?.musicRetryAfterSeconds);
  status.hidden = !status.textContent;
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

async function draw() {
  try {
    const d = await api('state');
    const moment = d.event.activeMoment;
    const content = document.querySelector('#content');
    document.querySelector('#title').textContent = d.event.title;
    document.querySelector('#event-brand').textContent = d.event.title;
    document.title = d.event.title;
    document.querySelector('#intro').textContent = 'A experiência acompanha o momento da festa.';

    // Mantém a interface e os campos intactos; actualiza os dados dinâmicos da poll.
    if (moment === renderedMoment) {
      if (moment === 'm2') renderPoll(d.poll, d.voting);
      if (moment === 'm1') renderMusicStatus(d.voting);
      return;
    }
    renderedMoment = moment;
    window.stopM4?.();
    delete content.dataset.m4Ready;
    delete content.dataset.pizzaReady;
    content.classList.remove('m4-content','pizza-content');
    document.querySelector('.mobile')?.classList.remove('m4-mode','pizza-mode');

    if (moment === 'm1') {
      content.innerHTML = '<h2>Sugere uma música</h2><p id="music-vote-status" class="vote-cooldown" role="status" hidden></p><div class="track-search"><input id="q" autocomplete="off" placeholder="Pesquisa por música ou artista"><div id="suggestions" class="track-suggestions"></div><div id="results" class="track-results"></div></div><hr><h2>Mural de mensagens</h2><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      renderMusicStatus(d.voting);
      bindTrackSearch();
      bindMessage();
    } else if (moment === 'm2') {
      content.innerHTML = '<h2 id="poll-question">A carregar votação…</h2><div id="poll-options"></div><hr><h2>Mural de mensagens</h2><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      renderPoll(d.poll, d.voting);
      bindMessage();
    } else if (moment === 'm3') {
      content.innerHTML = '<div class="device-call"><h2>MIDNIGHT<br><em>SLICE.</em></h2><p>A PIZZA ESTÁ SERVIDA. VAI BUSCAR A TUA FATIA.</p></div>';
    } else if (moment === 'm4') {
      content.innerHTML = '<div class="device-call" data-m4-trigger><h2>TURN ON<br><em>THE LIGHTS.</em></h2><p>LIGA A LANTERNA DO TEU TELEMÓVEL.</p></div>';
      window.renderM4?.();
    } else if (moment === 'm5') {
      window.renderPizza?.();
    } else {
      content.innerHTML = '<div class="device-call"><p>A AGUARDAR O PRÓXIMO MOMENTO.</p></div>';
    }
  } catch (error) {
    renderedMoment = null;
    document.querySelector('#content').textContent = error.message;
  }
}

function showTrackConfirm(track,onConfirm){
 let modal=document.querySelector('#track-confirm');
 if(!modal){
  modal=document.createElement('div');modal.id='track-confirm';modal.className='track-confirm';modal.innerHTML='<div class="track-confirm-card" role="dialog" aria-modal="true" aria-labelledby="track-confirm-title"><p class="track-confirm-kicker">CONFIRMAR SUGESTÃO</p><h3 id="track-confirm-title"></h3><p class="track-confirm-artist"></p><div class="track-confirm-actions"><button type="button" class="secondary" id="track-back">VOLTAR</button><button type="button" id="track-confirm-yes">CONFIRMAR</button></div></div>';document.body.appendChild(modal);
 }
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
     b.disabled=true;b.classList.add('selected');b.innerHTML='<strong>'+esc(t.title)+'</strong><span>Voto registado ✓</span>';
     await draw();
    });
   });
  }catch(error){if(id===requestId)results.innerHTML='<p class="search-status">'+esc(error.message)+'</p>'}
 }
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,320)});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);search()}});
}

function bindMessage() {
  document.querySelector('#send').onclick = async () => {
    const name = document.querySelector('#name').value.trim();
    const message = document.querySelector('#msg').value.trim();
    if (!message) return alert('Escreve uma mensagem primeiro.');
    try {
      await api('message', {method:'POST',body:JSON.stringify({name,message})});
      document.querySelector('#msg').value = '';
      alert('Mensagem enviada para aprovação.');
    } catch (error) { alert(error.message); }
  };
}

draw();
setInterval(draw, 3000);
