let renderedMoment = null;

function renderPoll(poll) {
  const question = document.querySelector('#poll-question');
  const options = document.querySelector('#poll-options');
  if (!question || !options) return;
  question.textContent = poll?.question || 'A votação ainda não está disponível.';
  const items = poll?.options || [];
  options.innerHTML = items.length
    ? items.map(option => `<button class="option" data-id="${esc(option.id)}">${esc(option.label)}</button>`).join('')
    : '<p class="poll-empty">A votação ainda não tem opções. Aguarda que o DJ a configure.</p>';
  options.querySelectorAll('[data-id]').forEach(button => {
    button.onclick = async () => {
      try {
        await api('poll/vote', {method:'POST',body:JSON.stringify({optionId:button.dataset.id})});
        button.textContent += ' ✓';
        button.disabled = true;
      } catch (error) { alert(error.message); }
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
      if (moment === 'm2') renderPoll(d.poll);
      return;
    }
    renderedMoment = moment;

    if (moment === 'm1') {
      content.innerHTML = '<h2>Sugere uma música</h2><div class="track-search"><input id="q" autocomplete="off" placeholder="Pesquisa por música ou artista"><div id="suggestions" class="track-suggestions"></div><div id="results" class="track-results"></div></div><hr><h2>Mural de mensagens</h2><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      bindTrackSearch();
      bindMessage();
    } else if (moment === 'm2') {
      content.innerHTML = '<h2 id="poll-question">A carregar votação…</h2><div id="poll-options"></div><hr><h2>Mural de mensagens</h2><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      renderPoll(d.poll);
      bindMessage();
    } else if (moment === 'm3') {
      content.innerHTML = '<h2>MIDNIGHT SLICE</h2>Está na hora da pizza. Vai buscar uma fatia.';
    } else {
      content.innerHTML = '<h2>TURN ON THE LIGHTS</h2>Acende a lanterna do teu telemóvel.';
    }
  } catch (error) {
    document.querySelector('#content').textContent = error.message;
  }
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
   results.querySelectorAll('[data-track]').forEach(b=>b.onclick=async()=>{
    const t=JSON.parse(b.dataset.track);b.disabled=true;b.classList.add('selected');
    try{await api('tracks',{method:'POST',body:JSON.stringify({source:'tidal',tidalId:t.tidalId,title:t.title,artist:t.artist,album:t.album})});b.innerHTML='<strong>'+esc(t.title)+'</strong><span>Adicionada à lista ✓</span>'}
    catch(error){b.disabled=false;alert(error.message)}
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
