let renderedMoment = null;

async function draw() {
  try {
    const d = await api('state');
    const moment = d.event.activeMoment;
    const content = document.querySelector('#content');
    document.querySelector('#title').textContent = d.event.title;
    document.querySelector('#intro').textContent = 'A experiência acompanha o momento da festa.';

    // Só reconstruir a interface quando o Admin muda o momento activo.
    if (moment === renderedMoment) return;
    renderedMoment = moment;

    if (moment === 'm1') {
      content.innerHTML = '<h2>Sugere uma música</h2><input id="q" placeholder="Artista ou música"><button id="search">PESQUISAR</button><div id="results"></div><hr><h2>Mural de mensagens</h2><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      document.querySelector('#search').onclick = async () => {
        const query = document.querySelector('#q').value.trim();
        if (!query) return;
        const results = document.querySelector('#results');
        results.textContent = 'A pesquisar…';
        try {
          const response = await api('tracks?q=' + encodeURIComponent(query));
          results.textContent = response.error || 'A ligação ao catálogo TIDAL ainda não está activa.';
        } catch (error) { results.textContent = error.message; }
      };
      bindMessage();
    } else if (moment === 'm2') {
      content.innerHTML =
        `<h2>${esc(d.poll?.question || 'Duelo de músicas')}</h2>` +
        (d.poll?.options || []).map(option =>
          `<button class="option" data-id="${esc(option.id)}">${esc(option.label)}</button>`
        ).join('') +
        '<hr><h2>Mural de mensagens</h2><input id="name" placeholder="O teu nome"><textarea id="msg" placeholder="Escreve uma mensagem"></textarea><button id="send">ENVIAR PARA APROVAÇÃO</button>';
      content.querySelectorAll('[data-id]').forEach(button => {
        button.onclick = async () => {
          try {
            await api('poll/vote', {method:'POST',body:JSON.stringify({optionId:button.dataset.id})});
            button.textContent += ' ✓';
            button.disabled = true;
          } catch (error) { alert(error.message); }
        };
      });
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
