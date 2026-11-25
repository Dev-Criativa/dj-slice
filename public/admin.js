const root = document.querySelector('#root');
let token = sessionStorage.getItem('ee-admin');
let moderationTimer = null;
let activeTab = 'control';

async function a(path, opt = {}) {
  return api(path, {...opt, headers:{...(opt.headers || {}), authorization:'Bearer ' + token}});
}

async function login() {
  const response = await fetch('/api/login', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({pin:document.querySelector('#pin').value})
  });
  const data = await response.json();
  if (!response.ok || !data.token) return alert(data.error || 'Autenticação não configurada.');
  token = data.token;
  sessionStorage.setItem('ee-admin', token);
  panel();
}
document.querySelector('#login')?.addEventListener('click', login);

function panel() {
  root.innerHTML = `
    <nav class="admin-tabs">
      <button class="secondary" data-tab="control">CONTROLO</button>
      <button class="secondary" data-tab="pending">POR APROVAR</button>
      <button class="secondary" data-tab="all">GESTÃO DE MENSAGENS</button>
      <button class="secondary" data-tab="windows">ABRIR JANELAS</button>
    </nav>
    <section id="admin-view"></section>
    <hr><button id="logout" class="secondary">TERMINAR SESSÃO</button>
  `;
  root.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => showTab(button.dataset.tab);
  });
  document.querySelector('#logout').onclick = () => {
    sessionStorage.removeItem('ee-admin');
    token = null;
    if (moderationTimer) clearInterval(moderationTimer);
    root.innerHTML = '<label>PIN DE ADMINISTRAÇÃO</label><input id="pin" type="password" autocomplete="current-password"><button id="login">ENTRAR</button>';
    document.querySelector('#login').onclick = login;
  };
  showTab(activeTab);
  if (moderationTimer) clearInterval(moderationTimer);
  moderationTimer = setInterval(() => {
    if (activeTab === 'pending' || activeTab === 'all') loadMessages();
  }, 5000);
}

function showTab(tab) {
  activeTab = tab;
  root.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active',button.dataset.tab===tab));
  const view = document.querySelector('#admin-view');
  if (tab === 'windows') {
    view.innerHTML = `
      <h2>Abrir janelas</h2>
      <p>Cada ecrã abre numa janela própria. Carregar de novo traz a mesma janela para a frente.</p>
      <div class="window-list">
        <article class="item window-item">
          <div><strong>PROJECTOR</strong><p>Ecrã da sala. Arrasta a janela para o projector e põe em ecrã inteiro.</p></div>
          <button data-open="room">ABRIR ↗</button>
        </article>
        <article class="item window-item">
          <div><strong>PARTY PEOPLE</strong><p>Pré-visualização do ecrã do público, em tamanho de telemóvel. Só leitura: nada do que fizeres aqui conta.</p></div>
          <button data-open="guest">ABRIR ↗</button>
        </article>
        <article class="item window-item">
          <div><strong>ECRÃ QR</strong><p>QR de entrada na festa, para um ecrã à porta.</p></div>
          <button class="secondary" data-open="qr">ABRIR ↗</button>
        </article>
        <article class="item window-item">
          <div><strong>DJ</strong><p>Top 15 mais votadas: o DJ marca "A tocar" (aparece no projector) e tira as que já tocaram. Entra com o PIN do DJ.</p></div>
          <button data-open="dj">ABRIR ↗</button>
        </article>
      </div>`;
    const ev = encodeURIComponent(CODE);
    const targets = {
      room: ['/room?event=' + ev, 'dj-slice-room', ''],
      guest: ['/guest?event=' + ev + '&preview=1', 'dj-slice-guest-preview', 'popup,width=400,height=860'],
      qr: ['/qr?event=' + ev, 'dj-slice-qr', ''],
      dj: ['/dj?event=' + ev, 'dj-slice-dj', '']
    };
    view.querySelectorAll('[data-open]').forEach(button => button.onclick = () => {
      const [url, name, features] = targets[button.dataset.open];
      const w = window.open(url, name, features);
      if (w) w.focus(); else alert('O browser bloqueou a janela. Permite pop-ups para este site.');
    });
  } else if (tab === 'control') {
    view.innerHTML = `
      <h2>Momento activo</h2>
      <div class="moment-controls">
        ${['m1','m2','m3','m4','m5'].map((moment,i) => `<button data-m="${moment}">M${i+1} · ${['MÚSICA','STYLE WARS','MIDNIGHT SLICE','LIGHTS','PIZZA'][i]}</button>`).join('')}
      </div>
      <hr><h2>Configurar votação</h2>
      <input id="question" value="Que género ganha esta noite?">
      <input id="o1" value="HOUSE"><input id="o2" value="AFROBEATS"><input id="o3" value="TECHNO">
      <button id="save">GUARDAR VOTAÇÃO</button>`;
    view.querySelectorAll('[data-m]').forEach(button => button.onclick = async () => {
      try {
        await a('moment',{method:'POST',body:JSON.stringify({moment:button.dataset.m})});
        view.querySelectorAll('[data-m]').forEach(item => item.classList.toggle('active',item===button));
      } catch (error) { alert(error.message); }
    });
    document.querySelector('#save').onclick = async () => {
      try {
        await a('poll',{method:'POST',body:JSON.stringify({
          question:document.querySelector('#question').value,
          options:['o1','o2','o3'].map(id=>document.querySelector('#'+id).value)
        })});
        alert('Votação guardada e activada.');
      } catch (error) { alert(error.message); }
    };
  } else {
    view.innerHTML = `<h2>${tab==='pending'?'Mensagens por aprovar':'Todas as mensagens'}</h2>
      <p>${tab==='pending'?'Aprova ou rejeita as mensagens antes de aparecerem na projecção.':'Edita, retira da projecção ou elimina definitivamente qualquer mensagem.'}</p>
      <div id="messages">A carregar…</div>
      <h2>Banidos</h2><p>Telemóveis banidos não podem enviar mensagens ("Farmaste tudo menos aura! Foste banid@!"). Votar e pesquisar continuam a funcionar.</p>
      <div id="bans">A carregar…</div>`;
    loadMessages();
  }
}

async function loadMessages() {
  try {
    const data = await a('admin');
    const target = document.querySelector('#messages');
    if (!target) return;
    const messages = activeTab === 'pending' ? (data.pending || []) : (data.messages || []);
    target.innerHTML = messages.map(message => `
      <article class="item message-item">
        <div class="message-meta"><strong>${esc(message.guest_name)}</strong><small>${esc(message.status)}${message.banned ? ' · BANID@' : ''}</small></div>
        <p>${esc(message.body)}</p>
        <div class="message-actions">
          ${message.status !== 'published' ? `<button data-publish="${message.id}">APROVAR / PUBLICAR</button>` : `<button class="secondary" data-hide="${message.id}">RETIRAR DA PROJECÇÃO</button>`}
          <button class="secondary" data-edit="${message.id}">EDITAR</button>
          ${message.status === 'pending' ? `<button class="danger" data-reject="${message.id}">REJEITAR</button>` : ''}
          <button class="danger" data-delete="${message.id}">BIN / ELIMINAR</button>
          ${message.canBan && !message.banned ? `<button class="danger" data-ban="${message.id}">BANIR</button>` : ''}
        </div>
      </article>`).join('') || 'Não existem mensagens nesta lista.';
    target.querySelectorAll('[data-publish]').forEach(button => button.onclick = () => updateMessage(button.dataset.publish,{status:'published'}));
    target.querySelectorAll('[data-hide]').forEach(button => button.onclick = () => updateMessage(button.dataset.hide,{status:'hidden'}));
    target.querySelectorAll('[data-reject]').forEach(button => button.onclick = () => updateMessage(button.dataset.reject,{status:'rejected'}));
    target.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => editMessage(messages.find(item=>String(item.id)===button.dataset.edit)));
    target.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => deleteMessage(button.dataset.delete));
    target.querySelectorAll('[data-ban]').forEach(button => button.onclick = () => banAuthor(messages.find(item=>String(item.id)===button.dataset.ban)));
    const bansBox = document.querySelector('#bans');
    if (bansBox) {
      const bans = data.bans || [];
      bansBox.innerHTML = bans.length ? bans.map(b => `<article class="item message-item"><div class="message-meta"><strong>${esc(b.guest_name || 'Guest')}</strong><small>BANID@ · ${esc(b.created_at || '')}</small></div><div class="message-actions"><button class="secondary" data-unban="${esc(b.id)}">DESBANIR</button></div></article>`).join('') : 'Ninguém está banido.';
      bansBox.querySelectorAll('[data-unban]').forEach(button => button.onclick = () => unban(button.dataset.unban));
    }
  } catch (error) {
    const target = document.querySelector('#messages');
    if (target) target.textContent = error.message;
  }
}

async function updateMessage(id, changes) {
  try { await a('message/'+id,{method:'PATCH',body:JSON.stringify(changes)}); await loadMessages(); }
  catch (error) { alert(error.message); }
}

async function editMessage(message) {
  if (!message) return;
  const name = prompt('Nome:',message.guest_name);
  if (name === null) return;
  const body = prompt('Mensagem:',message.body);
  if (body === null) return;
  await updateMessage(message.id,{guest_name:name,body});
}

async function banAuthor(message) {
  if (!message) return;
  if (!confirm('Banir ' + (message.guest_name || 'este convidado') + '? O telemóvel deixa de poder enviar mensagens e as mensagens dele por aprovar ou publicadas são retiradas.')) return;
  try { await a('message/' + message.id + '/ban', {method:'POST', body:'{}'}); await loadMessages(); }
  catch (error) { alert(error.message); }
}

async function unban(id) {
  try { await a('ban/' + encodeURIComponent(id), {method:'DELETE'}); await loadMessages(); }
  catch (error) { alert(error.message); }
}

async function deleteMessage(id) {
  if (!confirm('Eliminar definitivamente esta mensagem? Esta acção não pode ser anulada.')) return;
  try { await a('message/'+id,{method:'DELETE'}); await loadMessages(); }
  catch (error) { alert(error.message); }
}

if (token) panel();
