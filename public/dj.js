// Ecrã do DJ: vê as 15 músicas mais votadas, marca "A tocar" e tira músicas da lista ("Tocada").
const djRoot = document.querySelector('#dj-root');
let djToken = sessionStorage.getItem('ee-dj');
let djTimer = null, djBusy = false, djLastKey = '';

async function dj(path, opt = {}) {
  return api(path, {...opt, headers:{...(opt.headers || {}), authorization:'Bearer ' + djToken}});
}

async function djLogin() {
  const err = document.querySelector('#dj-error');
  err.textContent = '';
  try {
    const r = await fetch('/api/dj-login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pin:document.querySelector('#pin').value,event:CODE})});
    const d = await r.json();
    if (!r.ok || !d.token) throw new Error(d.error || 'PIN incorrecto');
    djToken = d.token;
    sessionStorage.setItem('ee-dj', djToken);
    djPanel();
  } catch (e) { err.textContent = e.message; }
}
document.querySelector('#login').onclick = djLogin;
document.querySelector('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') djLogin(); });

function djLogout() {
  sessionStorage.removeItem('ee-dj'); djToken = null;
  if (djTimer) clearInterval(djTimer);
  location.reload();
}

function djPanel() {
  djRoot.innerHTML = `
    <div class="dj-now" id="dj-now"></div>
    <div class="dj-head"><h2>Mais votadas</h2><small id="dj-updated"></small></div>
    <ol class="dj-list" id="dj-queue"></ol>
    <details class="dj-played"><summary>Tocadas <span id="dj-played-count"></span></summary><ol class="dj-list" id="dj-played"></ol></details>
    <p id="dj-error" class="dj-error" role="alert"></p>
    <button id="dj-logout" class="secondary">TERMINAR SESSÃO</button>`;
  document.querySelector('#dj-logout').onclick = djLogout;
  djLastKey = '';
  djLoad();
  if (djTimer) clearInterval(djTimer);
  djTimer = setInterval(() => { if (!djBusy) djLoad(); }, 4000);
}

function trackLine(t, i) {
  const votes = Number(t.votes) || 0;
  return '<span class="dj-rank">' + (i + 1) + '</span><span class="dj-info" title="' + esc(t.title + ' — ' + t.artist) + '"><strong>' + esc(t.title) + '</strong><em>' + esc(t.artist) + '</em></span><span class="dj-votes">' + votes + (votes === 1 ? ' voto' : ' votos') + '</span>';
}

async function djLoad() {
  try {
    const d = await dj('dj');
    document.querySelector('#dj-status').textContent = 'DJ · ' + String(d.event.activeMoment || '').toUpperCase();
    document.querySelector('#dj-updated').textContent = 'actualizado ' + new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const key = JSON.stringify([d.nowPlaying, d.queue.map(t => [t.id, t.votes]), d.played.map(t => t.id)]);
    if (key === djLastKey) return;
    djLastKey = key;
    const now = d.nowPlaying;
    document.querySelector('#dj-now').innerHTML = now
      ? '<small>A TOCAR</small><div class="dj-now-track"><span class="dj-info"><strong>' + esc(now.title) + '</strong><em>' + esc(now.artist) + '</em></span><button class="secondary" data-act="played" data-id="' + now.id + '">TOCADA ✓</button></div>'
      : '<small>A TOCAR</small><p class="dj-empty">Nada marcado. Carrega em <b>A TOCAR</b> numa música da lista.</p>';
    document.querySelector('#dj-queue').innerHTML = d.queue.length
      ? d.queue.map((t, i) => '<li class="dj-item">' + trackLine(t, i) + '<span class="dj-actions"><button data-act="playing" data-id="' + t.id + '">▶ A TOCAR</button><button class="secondary" data-act="played" data-id="' + t.id + '">TOCADA</button></span></li>').join('')
      : '<li class="dj-empty">Ainda não há sugestões do público.</li>';
    document.querySelector('#dj-played-count').textContent = '(' + d.played.length + ')';
    document.querySelector('#dj-played').innerHTML = d.played.length
      ? d.played.map((t, i) => '<li class="dj-item is-played">' + trackLine(t, i) + '<span class="dj-actions"><button class="secondary" data-act="queued" data-id="' + t.id + '">DEVOLVER</button></span></li>').join('')
      : '<li class="dj-empty">Nenhuma música tocada.</li>';
    djRoot.querySelectorAll('[data-act]').forEach(b => b.onclick = () => djSet(b.dataset.id, b.dataset.act, b));
    document.querySelector('#dj-error').textContent = '';
  } catch (e) {
    if (e.status === 401) { djLogout(); return; }
    const err = document.querySelector('#dj-error'); if (err) err.textContent = e.message;
  }
}

async function djSet(id, status, button) {
  djBusy = true; button.disabled = true;
  try { await dj('dj/track/' + id, {method:'POST', body:JSON.stringify({status})}); djLastKey = ''; await djLoad(); }
  catch (e) { document.querySelector('#dj-error').textContent = e.message; button.disabled = false; }
  finally { djBusy = false; }
}

if (djToken) djPanel();
