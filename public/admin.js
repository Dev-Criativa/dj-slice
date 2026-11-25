// PEDE & FATIA — Party Controller (admin)
// Menu: Party Controller · Mensagens (Por aprovar, Gestão, Devices) · Abrir janelas (Projector, Party People, QR Invite, DJ Controller)
const root = document.querySelector('#root');
const navEl = document.querySelector('#adm-nav');
const subEl = document.querySelector('#adm-subnav');
let token = sessionStorage.getItem('ee-admin');
let route = {section: 'party', sub: ''};
let refreshTimer = null;
let live = {moment: '', pending: 0, since: null};
const LONG_MINUTES = 30; // a partir daqui o contador fica vermelho (o momento pode ter ficado esquecido)
function elapsed() {
  if (!live.since) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(live.since).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return {s, text: (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'), min: Math.floor(s / 60)};
}
function tick() {
  // Cronómetro dentro do selo do topo: "NO AR HÁ 12:34 · M1 · MÚSICA". Fica vermelho a partir de LONG_MINUTES.
  const el = document.querySelector('#adm-live-text'); if (!el || !live.moment) return;
  const e = elapsed(), m = MOMENTS.find(x => x[0] === live.moment), long = !!e && e.min >= LONG_MINUTES;
  el.textContent = 'NO AR' + (e ? ' HÁ ' + e.text : '') + ' · ' + String(live.moment).toUpperCase() + (m ? ' · ' + m[1] : '');
  const chip = document.querySelector('#adm-live');
  chip?.classList.toggle('is-long', long);
  if (chip) chip.title = long ? 'Este momento está no ar há mais de ' + LONG_MINUTES + ' minutos' : '';
}
setInterval(tick, 1000);

const MOMENTS = [
  ['m1', 'MÚSICA', 'Sugestões TIDAL, votos e Farmador de Aura'],
  ['m2', 'STYLE WARS', 'Votação de estilos e Farmador de Aura'],
  ['m3', 'MIDNIGHT SLICE', 'A pizza está servida'],
  ['m4', 'LIGHTS', 'Lanternas dos telemóveis acesas'],
  ['m5', 'QR CODE', 'QR de entrada no projector e nos telemóveis']
];
const MENU = [
  {id: 'party', label: 'PARTY CONTROLLER'},
  {id: 'messages', label: 'MENSAGENS', subs: [['pending', 'POR APROVAR'], ['manage', 'GESTÃO'], ['devices', 'DEVICES']]},
  {id: 'windows', label: 'ABRIR JANELAS', subs: [['projector', 'PROJECTOR'], ['people', 'PARTY PEOPLE'], ['qr', 'QR INVITE'], ['dj', 'DJ CONTROLLER']]}
];

async function a(path, opt = {}) {
  return api(path, {...opt, headers: {...(opt.headers || {}), authorization: 'Bearer ' + token}});
}
const $ = sel => document.querySelector(sel);
const fmtTime = s => s ? String(s).replace('T', ' ').slice(11, 16) : '';
const shortId = id => String(id || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
function toast(text, kind = '') {
  let t = $('#adm-toast');
  if (!t) { t = document.createElement('div'); t.id = 'adm-toast'; document.body.appendChild(t); }
  t.className = 'adm-toast show ' + kind; t.textContent = text;
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- login ----------
async function login() {
  const err = $('#login-error'); err.textContent = '';
  try {
    const r = await fetch('/api/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({pin: $('#pin').value})});
    const d = await r.json();
    if (!r.ok || !d.token) throw new Error(d.error || 'Autenticação não configurada.');
    token = d.token; sessionStorage.setItem('ee-admin', token); start();
  } catch (e) { err.textContent = e.message; }
}
$('#login').onclick = login;
$('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#logout').onclick = () => { sessionStorage.removeItem('ee-admin'); token = null; location.hash = ''; location.reload(); };

// ---------- navegação ----------
function readHash() {
  const [section, sub] = location.hash.replace('#', '').split('/');
  if (!section || section === 'home') { route = {section: 'home', sub: ''}; return; }
  const m = MENU.find(x => x.id === section) || MENU[0];
  route = {section: m.id, sub: m.subs ? (m.subs.find(s => s[0] === sub) ? sub : m.subs[0][0]) : ''};
}
function go(section, sub) { location.hash = section + (sub ? '/' + sub : ''); }
document.querySelector('.adm-brand').addEventListener('click', () => { if (token) go('home'); });
window.addEventListener('hashchange', () => { if (token) { readHash(); render(); } });

function renderNav() {
  navEl.hidden = false;
  navEl.innerHTML = MENU.map(m => `<button class="adm-tab${route.section === m.id ? ' active' : ''}" data-section="${m.id}">${m.label}${m.id === 'messages' && live.pending ? `<span class="adm-badge">${live.pending}</span>` : ''}</button>`).join('');
  navEl.querySelectorAll('[data-section]').forEach(b => b.onclick = () => go(b.dataset.section));
  const m = MENU.find(x => x.id === route.section) || {};
  subEl.hidden = !m.subs;
  subEl.innerHTML = m.subs ? m.subs.map(([id, label]) => `<button class="adm-subtab${route.sub === id ? ' active' : ''}" data-sub="${id}">${label}${id === 'pending' && live.pending ? `<span class="adm-badge">${live.pending}</span>` : ''}</button>`).join('') : '';
  subEl.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => go(route.section, b.dataset.sub));
}

function start() {
  $('#logout').hidden = false;
  readHash();
  render();
  refreshLive();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    refreshLive();
    if (route.section === 'messages' && !document.querySelector('.adm-editing')) render(true);
    if (route.section === 'party') { try { const st = await api('state'); renderPollLive(st); renderMusicLive(st); renderSummary(st); setCtx(st); markMoment(st.event.activeMoment); renderStats(st); } catch {} }
  }, 5000);
}

async function refreshLive() {
  try {
    const [st, adm] = await Promise.all([api('state'), a('admin')]);
    live.moment = st.event.activeMoment; live.pending = (adm.pending || []).length; live.since = st.event.momentSince || null;
    const m = MOMENTS.find(x => x[0] === live.moment);
    $('#adm-live').hidden = false;
    tick();
    renderNav();
    if (route.section === 'home') renderHome();
  } catch (e) { if (e.status === 401) { sessionStorage.removeItem('ee-admin'); location.reload(); } }
}

function render(quiet) {
  renderNav();
  const s = route.section, sub = route.sub;
  if (s === 'home') return renderHome();
  if (s === 'party') return renderParty();
  if (s === 'messages') return sub === 'devices' ? renderDevices() : renderMessages(sub, quiet);
  if (s === 'windows') return ({projector: renderProjector, people: renderPeople, qr: renderQr, dj: renderDj})[sub]();
}

// ---------- Índice (página inicial do admin) ----------
function renderHome() {
  const m = MOMENTS.find(x => x[0] === live.moment);
  const cards = [
    ['01', 'PARTY CONTROLLER', 'Momento no ar, Style Wars e resultados ao vivo', 'go:party', m ? 'NO AR · ' + m[1] : ''],
    ['02', 'MENSAGENS', 'Farmador de Aura: aprovar, rejeitar, editar', 'go:messages/pending', live.pending ? live.pending + ' POR APROVAR' : ''],
    ['03', 'DEVICES', 'Telemóveis que enviaram mensagens: banir / desbanir', 'go:messages/devices', ''],
    ['04', 'PROJECTOR', 'Ecrã da sala. Abre numa janela para o projector', 'open:room', '↗'],
    ['05', 'PARTY PEOPLE', 'O ecrã do público, em pré-visualização', 'open:guest', '↗'],
    ['06', 'QR INVITE', 'Gerar, descarregar e imprimir o QR de entrada', 'go:windows/qr', ''],
    ['07', 'DJ CONTROLLER', 'Top 15, A tocar / Tocada e PIN do DJ', 'go:windows/dj', '']
  ];
  root.innerHTML = `
    <section class="adm-home">
      <p class="adm-home-kicker">A FESTA TAMBÉM É DO PÚBLICO.</p>
      <h1>Controla<br><em>a festa.</em></h1>
      <div class="adm-home-grid">${cards.map(([n, title, desc, action, tag]) => `
        <button class="adm-home-card" data-action="${action}">
          <span class="adm-home-n">${n}</span>${tag ? `<span class="adm-home-tag${tag === '↗' ? ' ext' : ''}">${tag}</span>` : ''}
          <strong>${title}</strong><span class="adm-home-desc">${desc}</span>
        </button>`).join('')}</div>
    </section>`;
  root.querySelectorAll('[data-action]').forEach(b => b.onclick = () => {
    const [kind, target] = b.dataset.action.split(':');
    if (kind === 'open') openScreen(target); else { const [s, sub] = target.split('/'); go(s, sub); }
  });
}

// ---------- Party Controller ----------
async function renderParty() {
  root.innerHTML = `
    <div class="adm-grid">
      <section class="adm-card adm-span">
        <header class="adm-card-head"><h2>Momento activo</h2><small>Toca num momento para o pôr no ar em todos os ecrãs.</small></header>
        <div class="adm-moments">${MOMENTS.map(([id, name, desc], i) => `<button class="adm-moment" data-m="${id}"><b>M${i + 1}</b><strong>${name}</strong><span>${desc}</span><em>NO AR</em></button>`).join('')}</div>
      </section>
      <div class="adm-ctx-tabs adm-span" role="tablist">
        <button class="adm-ctx-tab" data-ctx="music" role="tab">♪ MÚSICA</button>
        <button class="adm-ctx-tab" data-ctx="poll" role="tab">⚔ STYLE WARS</button>
        <button class="adm-ctx-tab" data-ctx="summary" role="tab">Σ RESUMO</button>
        <small id="ctx-hint"></small>
      </div>
      <section class="adm-card adm-span adm-music" id="ctx-music" hidden>
        <header class="adm-card-head"><h2>Música ao vivo</h2><small>Sugestões e votos do M1. Actualiza sozinho.</small></header>
        <div class="adm-music-grid">
          <div class="adm-music-side">
            <div class="adm-now" id="music-now"><small>A TOCAR</small><strong>—</strong></div>
            <div class="adm-stats adm-music-stats" id="music-stats"></div>
            <div class="adm-row"><button class="adm-ghost" data-open="dj">DJ CONTROLLER ↗</button><button class="adm-ghost" data-open="room">PROJECTOR ↗</button></div>
          </div>
          <div class="adm-poll-live adm-music-live">
            <div class="adm-live-head"><span class="adm-dot"></span><b>MAIS VOTADAS</b><small id="music-total"></small></div>
            <div id="music-results" class="adm-results"><p class="adm-muted">A carregar…</p></div>
          </div>
        </div>
      </section>
      <section class="adm-card adm-span adm-summary" id="ctx-summary" hidden>
        <header class="adm-card-head"><h2>Resumo</h2><small>Música (M1) e Style Wars (M2) num só olhar. Actualiza sozinho.</small></header>
        <div class="adm-summary-grid">
          <div class="adm-poll-live"><div class="adm-live-head"><b>♪ MÚSICA · M1</b><small id="sum-music-total"></small></div><div id="sum-music"></div></div>
          <div class="adm-poll-live"><div class="adm-live-head"><b>⚔ STYLE WARS · M2</b><small id="sum-poll-total"></small></div><div id="sum-poll"></div></div>
        </div>
      </section>
      <section class="adm-card adm-span adm-poll" id="ctx-poll" hidden>
        <header class="adm-card-head"><h2>Style Wars</h2><small>Votação do M2. Os resultados actualizam sozinhos.</small></header>
        <div class="adm-poll-grid">
          <div class="adm-poll-edit">
            <div class="adm-block">
              <span class="adm-block-tag">1 · PERGUNTA</span>
              <textarea id="question" rows="2" maxlength="180">Que género ganha esta noite?</textarea>
            </div>
            <div class="adm-block">
              <span class="adm-block-tag">2 · OPÇÕES <em>(2 a 5)</em></span>
              <div id="poll-options" class="adm-options"></div>
              <button class="adm-ghost adm-add" id="opt-add">+ ADICIONAR OPÇÃO</button>
            </div>
            <div class="adm-row"><button id="save">GUARDAR E ACTIVAR</button></div>
            <p class="adm-muted adm-small">Guardar cria uma votação nova: os votos recomeçam do zero.</p>
          </div>
          <div class="adm-poll-live">
            <div class="adm-live-head"><span class="adm-dot"></span><b>RESULTADOS AO VIVO</b><small id="poll-total"></small></div>
            <p id="poll-live-q" class="adm-poll-q"></p>
            <div id="poll-results" class="adm-results"><p class="adm-muted">A carregar…</p></div>
          </div>
        </div>
      </section>
      <section class="adm-card">
        <header class="adm-card-head"><h2>Ao vivo</h2><small id="adm-stats-time"></small></header>
        <div class="adm-stats" id="adm-stats"><p class="adm-muted">A carregar…</p></div>
      </section>
      <section class="adm-card">
        <header class="adm-card-head"><h2>Abrir ecrãs</h2><small>Cada ecrã abre na sua janela; carregar de novo traz a mesma janela para a frente.</small></header>
        <div class="adm-row screen-shortcuts">
          <button class="adm-ghost" data-open="room">PROJECTOR ↗</button>
          <button class="adm-ghost" data-open="dj">DJ CONTROLLER ↗</button>
          <button class="adm-ghost" data-open="qr">ECRÃ QR ↗</button>
          <button class="adm-ghost" data-open="guest">PARTY PEOPLE ↗</button>
        </div>
      </section>
    </div>`;
  bindOpen(root);
  const opts = $('#poll-options');
  const renumber = () => { [...opts.children].forEach((row, i) => { row.querySelector('b').textContent = i + 1; row.querySelector('input').placeholder = 'Opção ' + (i + 1); }); $('#opt-add').hidden = opts.children.length >= 5; };
  const addOpt = (v = '') => {
    if (opts.children.length >= 5) return;
    const row = document.createElement('div'); row.className = 'adm-opt';
    row.innerHTML = '<b></b><input maxlength="80"><button class="adm-ghost adm-x" title="Remover opção" aria-label="Remover opção">×</button>';
    row.querySelector('input').value = v;
    row.querySelector('button').onclick = () => { if (opts.children.length > 2) { row.remove(); renumber(); } else toast('A votação precisa de pelo menos 2 opções.', 'err'); };
    opts.appendChild(row); renumber();
  };
  try {
    const st = await api('state');
    markMoment(st.event.activeMoment);
    if (st.poll) { $('#question').value = st.poll.question || ''; (st.poll.options || []).forEach(o => addOpt(o.label)); }
    renderStats(st); renderPollLive(st); renderMusicLive(st); renderSummary(st); setCtx(st);
  } catch {}
  if (!opts.children.length) ['HOUSE', 'AFROBEATS', 'TECHNO'].forEach(addOpt);
  $('#opt-add').onclick = () => addOpt();
  root.querySelectorAll('[data-ctx]').forEach(b => b.onclick = async () => { ctxChoice = b.dataset.ctx; try { setCtx(await api('state')); } catch { setCtx(null); } });
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
    try { await a('moment', {method: 'POST', body: JSON.stringify({moment: b.dataset.m})}); markMoment(b.dataset.m); live.since = new Date().toISOString(); live.moment = b.dataset.m; tick(); ctxChoice = null; try { setCtx(await api('state')); } catch {} live.moment = b.dataset.m; refreshLive(); toast('No ar: ' + b.dataset.m.toUpperCase(), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  $('#save').onclick = async () => {
    const options = [...opts.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) return toast('Preenche pelo menos 2 opções.', 'err');
    const votes = Number($('#poll-results')?.dataset.total || 0);
    if (votes > 0 && !confirm('A votação actual tem ' + votes + (votes === 1 ? ' voto' : ' votos') + '. Guardar cria uma votação nova e os votos recomeçam do zero. Continuar?')) return;
    try {
      await a('poll', {method: 'POST', body: JSON.stringify({question: $('#question').value, options})});
      toast('Style Wars guardado e activado.', 'ok');
      renderPollLive(await api('state'));
    } catch (e) { toast(e.message, 'err'); }
  };
}
// Separador do cartão de contexto: segue o momento no ar (M1 = música, resto = Style Wars) até o admin escolher.
let ctxChoice = null;
function setCtx(st) {
  const am = st && st.event.activeMoment;
  const auto = am === 'm1' ? 'music' : am === 'm2' ? 'poll' : 'summary';
  const kind = ctxChoice || auto;
  const m = $('#ctx-music'), p = $('#ctx-poll'), s = $('#ctx-summary'); if (!m || !p || !s) return;
  m.hidden = kind !== 'music'; p.hidden = kind !== 'poll'; s.hidden = kind !== 'summary';
  root.querySelectorAll('[data-ctx]').forEach(b => b.classList.toggle('active', b.dataset.ctx === kind));
  const hint = $('#ctx-hint');
  if (hint) hint.innerHTML = ctxChoice ? 'escolhido por ti · <button class="adm-link" id="ctx-auto">seguir o momento no ar</button>' : 'segue o momento no ar';
  const back = $('#ctx-auto'); if (back) back.onclick = () => { ctxChoice = null; setCtx(st); };
}
function renderMusicLive(st) {
  const box = $('#music-results'); if (!box) return;
  const tracks = st.tracks || [], top = tracks.slice(0, 10), n = st.nowPlaying;
  const total = tracks.reduce((s, t) => s + (Number(t.votes) || 0), 0);
  const max = Math.max(1, ...top.map(t => Number(t.votes) || 0));
  $('#music-now strong').textContent = n ? n.title + ' — ' + n.artist : 'Nada marcado pelo DJ';
  $('#music-total').textContent = total + (total === 1 ? ' voto' : ' votos') + (st.event.activeMoment === 'm1' ? ' · M1 NO AR' : ' · M1 fora do ar');
  $('#music-stats').innerHTML = [['MÚSICAS NA LISTA', tracks.length], ['VOTOS', total], ['LÍDER', top[0] ? top[0].title : '—', 'wide']]
    .map(([k, v, c]) => `<div class="adm-stat ${c || ''}"><small>${k}</small><strong>${esc(String(v))}</strong></div>`).join('');
  box.innerHTML = top.length ? top.map((t, i) => {
    const v = Number(t.votes) || 0, pct = total ? Math.round(v / total * 100) : 0;
    return `<div class="adm-result${i === 0 && v > 0 ? ' lead' : ''}"><div class="adm-result-line"><span title="${esc(t.title + ' — ' + t.artist)}"><b>${i + 1}</b>${esc(t.title)} <em class="adm-artist">${esc(t.artist)}</em></span><strong>${pct}%</strong><small>${v} ${v === 1 ? 'voto' : 'votos'}</small></div><div class="adm-bar"><i style="width:${Math.round(v / max * 100)}%"></i></div></div>`;
  }).join('') + (tracks.length > 10 ? `<p class="adm-muted adm-small">+ ${tracks.length - 10} músicas na lista</p>` : '')
    : '<p class="adm-empty">Ainda não há sugestões do público.</p>';
}
function miniBars(items, total) {
  const max = Math.max(1, ...items.map(i => i.v));
  return items.map((i, n) => `<div class="adm-result${n === 0 && i.v > 0 ? ' lead' : ''}"><div class="adm-result-line"><span title="${esc(i.label)}"><b>${n + 1}</b>${esc(i.label)}</span><strong>${total ? Math.round(i.v / total * 100) : 0}%</strong><small>${i.v}</small></div><div class="adm-bar"><i style="width:${Math.round(i.v / max * 100)}%"></i></div></div>`).join('');
}
function renderSummary(st) {
  const box = $('#sum-music'); if (!box) return;
  const tracks = st.tracks || [], mt = tracks.reduce((s, x) => s + (Number(x.votes) || 0), 0), n = st.nowPlaying;
  $('#sum-music-total').textContent = mt + (mt === 1 ? ' voto' : ' votos') + ' · ' + tracks.length + ' músicas';
  box.innerHTML = `<p class="adm-sum-line"><small>A TOCAR</small><strong>${n ? esc(n.title) : '—'}</strong></p>`
    + (tracks.length ? miniBars(tracks.slice(0, 3).map(x => ({label: x.title + ' — ' + x.artist, v: Number(x.votes) || 0})), mt) : '<p class="adm-empty">Sem sugestões.</p>');
  const poll = st.poll, opts = poll ? poll.options || [] : [], pt = opts.reduce((s, o) => s + (Number(o.votes) || 0), 0);
  $('#sum-poll-total').textContent = pt + (pt === 1 ? ' voto' : ' votos');
  const sorted = [...opts].map(o => ({label: o.label, v: Number(o.votes) || 0})).sort((x, y) => y.v - x.v);
  $('#sum-poll').innerHTML = poll ? `<p class="adm-sum-line"><small>PERGUNTA</small><strong>${esc(poll.question)}</strong></p>` + miniBars(sorted, pt) : '<p class="adm-empty">Sem votação configurada.</p>';
}
function renderPollLive(st) {
  const box = $('#poll-results'); if (!box) return;
  const poll = st.poll, options = poll ? [...(poll.options || [])] : [];
  const total = options.reduce((n, o) => n + (Number(o.votes) || 0), 0);
  const max = Math.max(1, ...options.map(o => Number(o.votes) || 0));
  box.dataset.total = total;
  $('#poll-live-q').textContent = poll ? poll.question : 'Ainda não há votação configurada.';
  $('#poll-total').textContent = total + (total === 1 ? ' voto' : ' votos') + (st.event.activeMoment === 'm2' ? ' · M2 NO AR' : ' · M2 fora do ar');
  box.innerHTML = options.length ? options.map((o, i) => {
    const v = Number(o.votes) || 0, pct = total ? Math.round(v / total * 100) : 0, lead = v === max && v > 0;
    return `<div class="adm-result${lead ? ' lead' : ''}"><div class="adm-result-line"><span><b>${i + 1}</b>${esc(o.label)}</span><strong>${pct}%</strong><small>${v} ${v === 1 ? 'voto' : 'votos'}</small></div><div class="adm-bar"><i style="width:${total ? Math.round(v / max * 100) : 0}%"></i></div></div>`;
  }).join('') : '<p class="adm-empty">Guarda uma votação para começar.</p>';
}
function markMoment(m) { root.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('active', b.dataset.m === m)); }
async function renderStats(st) {
  let adm = {pending: [], messages: []}, dev = {devices: []};
  try { [adm, dev] = await Promise.all([a('admin'), a('devices')]); } catch {}
  const box = $('#adm-stats'); if (!box) return;
  const published = (adm.messages || []).filter(m => m.status === 'published').length;
  const banned = (dev.devices || []).filter(d => d.banned).length;
  const votes = (st.tracks || []).reduce((n, t) => n + (Number(t.votes) || 0), 0);
  box.innerHTML = [
    ['A TOCAR', st.nowPlaying ? st.nowPlaying.title : '—', 'wide'],
    ['MÚSICAS NA LISTA', (st.tracks || []).length], ['VOTOS EM MÚSICAS', votes],
    ['MENSAGENS POR APROVAR', (adm.pending || []).length, (adm.pending || []).length ? 'hot' : ''],
    ['AURAS PUBLICADAS', published], ['DEVICES BANIDOS', banned]
  ].map(([k, v, cls]) => `<div class="adm-stat ${cls || ''}"><small>${k}</small><strong>${esc(String(v))}</strong></div>`).join('');
  const t = $('#adm-stats-time'); if (t) t.textContent = 'actualizado ' + new Date().toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'});
}

// ---------- Mensagens ----------
let manageFilter = 'all';
async function renderMessages(sub, quiet) {
  if (!quiet) root.innerHTML = `<section class="adm-card adm-span"><p class="adm-muted">A carregar…</p></section>`;
  let data;
  try { data = await a('admin'); } catch (e) { root.innerHTML = `<section class="adm-card"><p class="adm-error">${esc(e.message)}</p></section>`; return; }
  live.pending = (data.pending || []).length; renderNav();
  const pending = sub === 'pending';
  let list = pending ? (data.pending || []) : (data.messages || []);
  if (!pending && manageFilter !== 'all') list = list.filter(m => manageFilter === 'removed' ? (m.status === 'rejected' || m.status === 'hidden') : m.status === manageFilter);
  const filters = pending ? '' : `<div class="adm-chips">${[['all', 'TODAS'], ['published', 'PUBLICADAS'], ['pending', 'POR APROVAR'], ['removed', 'REJEITADAS / RETIRADAS']].map(([id, l]) => `<button class="adm-chip${manageFilter === id ? ' active' : ''}" data-filter="${id}">${l}</button>`).join('')}</div>`;
  root.innerHTML = `
    <section class="adm-card adm-span">
      <header class="adm-card-head"><h2>${pending ? 'Por aprovar' : 'Gestão de mensagens'}</h2>
        <small>${pending ? 'Aprova ou rejeita antes de aparecerem no projector. Actualiza sozinho.' : 'Publica, retira, edita, elimina ou bane o telemóvel que enviou.'}</small></header>
      ${filters}
      <div class="adm-list" id="messages">${list.map(messageItem).join('') || `<p class="adm-empty">${pending ? 'Nada por aprovar. 🎉' : 'Não há mensagens nesta lista.'}</p>`}</div>
    </section>`;
  root.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { manageFilter = b.dataset.filter; renderMessages(sub); });
  const find = id => list.find(m => String(m.id) === String(id));
  root.querySelectorAll('[data-publish]').forEach(b => b.onclick = () => updateMessage(b.dataset.publish, {status: 'published'}, 'Publicada.'));
  root.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => updateMessage(b.dataset.hide, {status: 'hidden'}, 'Retirada da projecção.'));
  root.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => updateMessage(b.dataset.reject, {status: 'rejected'}, 'Rejeitada.'));
  root.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteMessage(b.dataset.delete));
  root.querySelectorAll('[data-ban]').forEach(b => b.onclick = () => banFromMessage(find(b.dataset.ban)));
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editInline(find(b.dataset.edit)));
}
const STATUS = {pending: 'POR APROVAR', published: 'PUBLICADA', rejected: 'REJEITADA', hidden: 'RETIRADA'};
function messageItem(m) {
  const actions = [
    m.status !== 'published' ? `<button data-publish="${m.id}">${m.status === 'pending' ? 'APROVAR' : 'PUBLICAR'}</button>` : `<button class="adm-ghost" data-hide="${m.id}">RETIRAR</button>`,
    m.status === 'pending' ? `<button class="adm-ghost" data-reject="${m.id}">REJEITAR</button>` : '',
    `<button class="adm-ghost" data-edit="${m.id}">EDITAR</button>`,
    m.canBan && !m.banned ? `<button class="adm-danger" data-ban="${m.id}">BANIR</button>` : '',
    `<button class="adm-danger adm-icon" data-delete="${m.id}" title="Eliminar definitivamente">ELIMINAR</button>`
  ].join('');
  return `<article class="adm-msg" data-id="${m.id}">
    <div class="adm-msg-meta"><strong>${esc(m.guest_name)}</strong><span class="adm-pill s-${m.status}">${STATUS[m.status] || esc(m.status)}</span>${m.banned ? '<span class="adm-pill s-banned">BANID@</span>' : ''}<small>${fmtTime(m.created_at)}</small></div>
    <p class="adm-msg-body">${esc(m.body)}</p>
    <div class="adm-row adm-actions">${actions}</div></article>`;
}
async function updateMessage(id, changes, ok) {
  try { await a('message/' + id, {method: 'PATCH', body: JSON.stringify(changes)}); if (ok) toast(ok, 'ok'); render(true); refreshLive(); }
  catch (e) { toast(e.message, 'err'); }
}
async function deleteMessage(id) {
  if (!confirm('Eliminar definitivamente esta mensagem? Não pode ser anulado.')) return;
  try { await a('message/' + id, {method: 'DELETE'}); toast('Eliminada.', 'ok'); render(true); refreshLive(); } catch (e) { toast(e.message, 'err'); }
}
async function banFromMessage(m) {
  if (!m || !confirm('Banir ' + (m.guest_name || 'este convidado') + '? O telemóvel deixa de poder enviar mensagens e as mensagens dele por aprovar ou publicadas são retiradas.')) return;
  try { await a('message/' + m.id + '/ban', {method: 'POST', body: '{}'}); toast('Banid@.', 'ok'); render(true); refreshLive(); } catch (e) { toast(e.message, 'err'); }
}
function editInline(m) {
  const card = root.querySelector(`.adm-msg[data-id="${m.id}"]`); if (!card) return;
  card.classList.add('adm-editing');
  card.innerHTML = `<label>NOME</label><input class="e-name" value="${esc(m.guest_name)}"><label>MENSAGEM</label><textarea class="e-body">${esc(m.body)}</textarea>
    <div class="adm-row"><button class="e-save">GUARDAR</button><button class="adm-ghost e-cancel">CANCELAR</button></div>`;
  card.querySelector('.e-cancel').onclick = () => render(true);
  card.querySelector('.e-save').onclick = () => updateMessage(m.id, {guest_name: card.querySelector('.e-name').value, body: card.querySelector('.e-body').value}, 'Mensagem actualizada.');
}

async function renderDevices() {
  root.innerHTML = `<section class="adm-card adm-span"><p class="adm-muted">A carregar…</p></section>`;
  let d;
  try { d = await a('devices'); } catch (e) { root.innerHTML = `<section class="adm-card"><p class="adm-error">${esc(e.message)}</p></section>`; return; }
  const list = d.devices || [];
  root.innerHTML = `
    <section class="adm-card adm-span">
      <header class="adm-card-head"><h2>Devices</h2><small>Telemóveis que enviaram mensagens. Um telemóvel banido não pode enviar mensagens (votar e pesquisar continuam). Janela anónima conta como outro telemóvel.</small></header>
      ${d.unavailable ? '<p class="adm-error">Indisponível até ser aplicada a migração 0003.</p>' : ''}
      <div class="adm-list" id="bans">${list.map(x => `
        <article class="adm-device${x.banned ? ' is-banned' : ''}">
          <div class="adm-device-id"><strong>${esc(x.name || 'Guest')}</strong><code>#${shortId(x.id)}</code>${x.banned ? '<span class="adm-pill s-banned">BANID@</span>' : ''}</div>
          <div class="adm-device-stats"><span><b>${x.total}</b> mensagens</span><span><b>${x.published}</b> publicadas</span><span><b>${x.pending}</b> por aprovar</span><span><b>${x.rejected}</b> rejeitadas</span><small>última ${fmtTime(x.last_at)}</small></div>
          <div class="adm-row">${x.banned ? `<button class="adm-ghost" data-unban="${esc(x.id)}">DESBANIR</button>` : `<button class="adm-danger" data-ban-device="${esc(x.id)}" data-name="${esc(x.name || '')}">BANIR</button>`}</div>
        </article>`).join('') || '<p class="adm-empty">Ninguém está banido e ainda não há telemóveis com mensagens.</p>'}</div>
    </section>`;
  root.querySelectorAll('[data-unban]').forEach(b => b.onclick = async () => { try { await a('ban/' + encodeURIComponent(b.dataset.unban), {method: 'DELETE'}); toast('Desbanid@.', 'ok'); renderDevices(); } catch (e) { toast(e.message, 'err'); } });
  root.querySelectorAll('[data-ban-device]').forEach(b => b.onclick = async () => {
    if (!confirm('Banir ' + (b.dataset.name || 'este telemóvel') + '? As mensagens dele por aprovar ou publicadas são retiradas.')) return;
    try { await a('ban/' + encodeURIComponent(b.dataset.banDevice), {method: 'POST', body: '{}'}); toast('Banid@.', 'ok'); renderDevices(); refreshLive(); } catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- Abrir janelas ----------
function screenUrl(key) {
  const ev = encodeURIComponent(CODE);
  return ({room: '/room?event=' + ev, guest: '/guest?event=' + ev + '&preview=1', qr: '/qr?event=' + ev, dj: '/dj?event=' + ev})[key];
}
function openScreen(key) {
  const names = {room: 'dj-slice-room', guest: 'dj-slice-guest-preview', qr: 'dj-slice-qr', dj: 'dj-slice-dj'};
  const w = window.open(screenUrl(key), names[key], key === 'guest' ? 'popup,width=400,height=860' : '');
  if (w) w.focus(); else toast('O browser bloqueou a janela. Permite pop-ups para este site.', 'err');
}
function bindOpen(scope) { scope.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openScreen(b.dataset.open)); }

function renderProjector() {
  root.innerHTML = `
    <section class="adm-card adm-span">
      <header class="adm-card-head"><h2>Projector</h2><small>Ecrã da sala. Abre, arrasta a janela para o projector e põe em ecrã inteiro (F11 / ⌃⌘F).</small></header>
      <div class="adm-row"><button data-open="room">ABRIR PROJECTOR ↗</button></div>
      <div class="adm-preview adm-preview-16x9"><iframe title="Pré-visualização do projector" src="${screenUrl('room')}" loading="lazy" tabindex="-1"></iframe></div>
    </section>`;
  bindOpen(root); fitPreviews();
}
function renderPeople() {
  root.innerHTML = `
    <section class="adm-card adm-span adm-people">
      <div>
        <header class="adm-card-head"><h2>Party People</h2><small>O ecrã do público, em tempo real. Só leitura: nada do que fizeres aqui conta como voto ou mensagem.</small></header>
        <div class="adm-row"><button data-open="guest">ABRIR EM JANELA ↗</button></div>
      </div>
      <div class="adm-phone"><iframe title="Pré-visualização do ecrã do público" src="${screenUrl('guest')}" loading="lazy"></iframe></div>
    </section>`;
  bindOpen(root);
}
function renderQr() {
  const guest = new URL('/guest', location.origin); guest.searchParams.set('event', CODE);
  const custom = new URL('/guest', 'https://pede-e-fatia.criativa.org'); custom.searchParams.set('event', CODE);
  root.innerHTML = `
    <section class="adm-card adm-span adm-qr">
      <div>
        <header class="adm-card-head"><h2>QR Invite</h2><small>Gera o QR de entrada na festa para imprimir, partilhar ou mostrar num ecrã à porta.</small></header>
        <label for="qr-url">ENDEREÇO DO CONVITE</label>
        <div class="adm-chips" id="qr-presets">
          <button class="adm-chip active" data-url="${guest.href}">ESTE ENDEREÇO</button>
          <button class="adm-chip" data-url="${custom.href}">PEDE-E-FATIA.CRIATIVA.ORG</button>
        </div>
        <input id="qr-url" value="${guest.href}">
        <label for="qr-title">TEXTO POR CIMA (IMPRESSÃO)</label><input id="qr-title" value="ENTRA NA FESTA">
        <label for="qr-size">TAMANHO DO PNG</label>
        <select id="qr-size"><option value="512">512 px</option><option value="1024" selected>1024 px</option><option value="2048">2048 px (impressão grande)</option></select>
        <div class="adm-row"><button id="qr-download">DESCARREGAR PNG</button><button class="adm-ghost" id="qr-print">IMPRIMIR</button><button class="adm-ghost" id="qr-copy">COPIAR LINK</button><button class="adm-ghost" data-open="qr">ABRIR ECRÃ QR ↗</button></div>
        <p class="adm-muted" id="qr-note"></p>
      </div>
      <div class="adm-qr-preview"><div id="qr-box"></div><small id="qr-label"></small></div>
    </section>`;
  bindOpen(root);
  const box = $('#qr-box'), url = $('#qr-url');
  const draw = () => {
    box.replaceChildren();
    try { new QRCode(box, {text: url.value, width: 240, height: 240, colorDark: '#111111', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M}); } catch {}
    box.querySelector('canvas')?.setAttribute('aria-hidden', 'true');
    $('#qr-label').textContent = url.value;
    $('#qr-note').textContent = url.value.includes('criativa.org') ? 'O domínio pede-e-fatia.criativa.org só funciona depois de o CNAME estar activo no cPanel.' : '';
  };
  url.oninput = draw;
  root.querySelectorAll('[data-url]').forEach(b => b.onclick = () => { root.querySelectorAll('[data-url]').forEach(x => x.classList.toggle('active', x === b)); url.value = b.dataset.url; draw(); });
  const big = () => { const n = Number($('#qr-size').value), tmp = document.createElement('div'); new QRCode(tmp, {text: url.value, width: n, height: n, colorDark: '#111111', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M}); return tmp.querySelector('canvas').toDataURL('image/png'); };
  $('#qr-download').onclick = () => { const l = document.createElement('a'); l.href = big(); l.download = 'pede-e-fatia-qr-' + CODE + '.png'; l.click(); };
  $('#qr-copy').onclick = async () => { try { await navigator.clipboard.writeText(url.value); toast('Link copiado.', 'ok'); } catch { toast(url.value); } };
  $('#qr-print').onclick = () => {
    const w = window.open('', 'qr-print'); if (!w) return toast('Permite pop-ups para imprimir.', 'err');
    w.document.write(`<!doctype html><title>QR — PEDE & FATIA</title><style>body{margin:0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}h1{font-size:44px;margin:0 0 6px;letter-spacing:-.02em}h2{font-size:22px;margin:0 0 28px;font-weight:600}img{width:70vmin;max-width:520px;image-rendering:pixelated}p{font:14px monospace;margin-top:18px;word-break:break-all}</style><div><h1>${esc($('#qr-title').value)}</h1><h2>PEDE &amp; FATIA</h2><img src="${big()}" alt="QR"><p>${esc(url.value)}</p></div><script>onload=()=>setTimeout(()=>print(),200)<\/script>`);
    w.document.close();
  };
  draw();
}
async function renderDj() {
  root.innerHTML = `
    <div class="adm-grid">
      <section class="adm-card">
        <header class="adm-card-head"><h2>DJ Controller</h2><small>Top 15 mais votadas: o DJ marca "A tocar" (aparece no projector) e tira as que já tocaram.</small></header>
        <div class="adm-now" id="adm-now"><small>A TOCAR</small><strong>—</strong></div>
        <div class="adm-row"><button data-open="dj">ABRIR DJ CONTROLLER ↗</button></div>
      </section>
      <section class="adm-card">
        <header class="adm-card-head"><h2>PIN do DJ</h2><small>Cria um PIN de 4 números sempre que quiseres. Com ele o DJ só entra no ecrã do DJ.</small></header>
        <p id="djPinState" class="adm-muted">A verificar…</p>
        <div class="dj-pin-row">
          <input id="djPin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="0000">
          <button id="djPinGen" class="adm-ghost">GERAR</button>
          <button id="djPinSave">GUARDAR PIN DO DJ</button>
          <button id="djPinDel" class="adm-danger" hidden>REMOVER</button>
        </div>
        <p id="djPinMsg" class="dj-pin-msg" role="status"></p>
      </section>
    </div>`;
  bindOpen(root); bindDjPin();
  try { const st = await api('state'); const n = st.nowPlaying; $('#adm-now strong').textContent = n ? n.title + ' — ' + n.artist : 'Nada marcado'; } catch {}
}

// PIN do DJ: o admin cria/muda quando quiser. O PIN só é mostrado no momento em que é guardado.
async function loadDjPin() {
  const state = $('#djPinState'); if (!state) return;
  try {
    const d = await a('dj-pin');
    state.textContent = d.unavailable ? 'PIN do DJ indisponível até ser aplicada a migração 0005.'
      : d.set ? 'O DJ tem PIN próprio (definido ' + String(d.updatedAt || '').replace('T', ' ').slice(0, 16) + ' UTC). Com ele só entra no ecrã do DJ.'
      : 'Sem PIN próprio: o DJ entra com o PIN do admin (e fica com acesso ao admin).';
    $('#djPinDel').hidden = !d.set;
  } catch (e) { state.textContent = e.message; }
}
function bindDjPin() {
  const input = $('#djPin'), msg = $('#djPinMsg'); if (!input) return;
  input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); };
  $('#djPinGen').onclick = () => { input.value = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0'); msg.textContent = 'PIN gerado. Carrega em GUARDAR PIN DO DJ para o activar.'; };
  $('#djPinSave').onclick = async () => {
    const pin = input.value;
    if (!/^\d{4}$/.test(pin)) { msg.textContent = 'O PIN tem de ter 4 números.'; return; }
    try {
      await a('dj-pin', {method: 'POST', body: JSON.stringify({pin})});
      msg.innerHTML = 'PIN do DJ activo: <strong class="dj-pin-show">' + pin + '</strong> — passa-o ao DJ agora; depois não volta a ser mostrado. A sessão anterior do DJ foi terminada.';
      input.value = ''; loadDjPin();
    } catch (e) { msg.textContent = e.message; }
  };
  $('#djPinDel').onclick = async () => {
    if (!confirm('Remover o PIN do DJ? A sessão do DJ é terminada e ele passa a precisar do PIN do admin.')) return;
    try { await a('dj-pin', {method: 'DELETE'}); msg.textContent = 'PIN do DJ removido.'; loadDjPin(); } catch (e) { msg.textContent = e.message; }
  };
  loadDjPin();
}

// Pré-visualização 16:9 do projector: escala um iframe de 1600x900 para a largura do cartão.
function fitPreviews() {
  document.querySelectorAll('.adm-preview-16x9').forEach(p => { const f = p.querySelector('iframe'); if (f) f.style.transform = 'scale(' + (p.clientWidth / 1600) + ')'; });
}
window.addEventListener('resize', fitPreviews);

if (token) start();
