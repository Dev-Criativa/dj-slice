const root = document.querySelector('#root');
let token = sessionStorage.getItem('ee-admin');
let moderationTimer = null;

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
    <h2>Ecrãs</h2>
    <p>Abre cada ecrã numa janela independente. Arrasta o Room Display para o projector.</p>
    <button id="openQR" class="secondary">ABRIR ECRÃ QR ↗</button>
    <button id="openRoom" class="secondary">ABRIR PROJECÇÃO ↗</button>
    <hr>
    <h2>Momento activo</h2>
    <div class="moment-controls">
      ${['m1','m2','m3','m4'].map((moment,i) => `<button data-m="${moment}">M${i+1} · ${['MÚSICA','SONG WARS','MIDNIGHT SLICE','LIGHTS'][i]}</button>`).join('')}
    </div>
    <hr>
    <h2>Configurar votação</h2>
    <input id="question" value="Que género ganha esta noite?">
    <input id="o1" value="HOUSE">
    <input id="o2" value="AFROBEATS">
    <input id="o3" value="TECHNO">
    <button id="save">GUARDAR VOTAÇÃO</button>
    <hr>
    <h2>Mensagens por aprovar</h2>
    <div id="messages">A carregar…</div>
    <button id="logout" class="secondary">TERMINAR SESSÃO</button>
  `;

  document.querySelector('#openQR').onclick = () => window.open('/qr?event='+encodeURIComponent(CODE),'dj-slice-qr');
  document.querySelector('#openRoom').onclick = () => window.open('/room?event='+encodeURIComponent(CODE),'dj-slice-room');
  root.querySelectorAll('[data-m]').forEach(button => {
    button.onclick = async () => {
      try {
        await a('moment',{method:'POST',body:JSON.stringify({moment:button.dataset.m})});
        root.querySelectorAll('[data-m]').forEach(item => item.classList.toggle('active', item === button));
      } catch (error) { alert(error.message); }
    };
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
  document.querySelector('#logout').onclick = () => {
    sessionStorage.removeItem('ee-admin');
    token = null;
    if (moderationTimer) clearInterval(moderationTimer);
    root.innerHTML = '<label>PIN de administração</label><input id="pin" type="password"><button id="login">ENTRAR</button>';
    document.querySelector('#login').onclick = login;
  };

  moderate();
  if (moderationTimer) clearInterval(moderationTimer);
  moderationTimer = setInterval(moderate, 4000);
}

async function moderate() {
  try {
    const data = await a('admin');
    const target = document.querySelector('#messages');
    if (!target) return;
    target.innerHTML = (data.pending || []).map(message => `
      <div class="item">
        <strong>${esc(message.guest_name)}</strong><p>${esc(message.body)}</p>
        <button data-publish="${message.id}">PUBLICAR</button>
        <button class="danger" data-reject="${message.id}">REJEITAR</button>
      </div>`).join('') || 'Não há mensagens pendentes.';
    target.querySelectorAll('[data-publish]').forEach(button => button.onclick = () => updateMessage(button.dataset.publish,'published'));
    target.querySelectorAll('[data-reject]').forEach(button => button.onclick = () => updateMessage(button.dataset.reject,'rejected'));
  } catch (error) {
    const target = document.querySelector('#messages');
    if (target) target.textContent = error.message;
  }
}

async function updateMessage(id,status) {
  try {
    await a('message/'+id,{method:'PATCH',body:JSON.stringify({status})});
    moderate();
  } catch (error) { alert(error.message); }
}

if (token) panel();
