const root=document.querySelector('#root');let token=sessionStorage.getItem('ee-admin');
async function a(path,opt={}){return api(path,{...opt,headers:{...(opt.headers||{}),authorization:'Bearer '+token}})}
async function login(){let r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:document.querySelector('#pin').value})}),d=await r.json();if(!r.ok)return alert(d.error);token=d.token;sessionStorage.setItem('ee-admin',token);panel()}
document.querySelector('#login')?.addEventListener('click',login);
async function panel(){
 root.innerHTML=`<h2>Display routes</h2><button id="openQR" class="secondary">OPEN QR CODE DISPLAY ↗</button><button id="openRoom" class="secondary">OPEN ROOM DISPLAY ↗</button><hr><h2>Activate room moment</h2>${['m1','m2','m3','m4'].map((m,i)=>`<button data-m="${m}">M${i+1} · ${['TIDAL','SONG WARS','MIDNIGHT SLICE','LIGHTS'][i]}</button>`).join('')}<hr><h2>Poll editor</h2><input id="question" value="Which genre wins tonight?"><input id="o1" value="HOUSE"><input id="o2" value="AFROBEATS"><input id="o3" value="TECHNO"><button id="save">SAVE POLL</button><hr><h2>Messages awaiting approval</h2><div id="messages"></div>`;
 document.querySelector('#openQR').onclick=()=>window.open('/qr?event='+encodeURIComponent(CODE),'qr-display');
 document.querySelector('#openRoom').onclick=()=>window.open('/room?event='+encodeURIComponent(CODE),'room-display');
 root.querySelectorAll('[data-m]').forEach(b=>b.onclick=async()=>{try{await a('moment',{method:'POST',body:JSON.stringify({moment:b.dataset.m})});alert('Momento activado no Room Display.')}catch(e){alert(e.message)}});
 document.querySelector('#save').onclick=async()=>{try{await a('poll',{method:'POST',body:JSON.stringify({question:document.querySelector('#question').value,options:['o1','o2','o3'].map(x=>document.querySelector('#'+x).value)})});alert('Poll guardada e activada.')}catch(e){alert(e.message)}};
 moderate();
}
async function moderate(){try{let d=await a('admin');document.querySelector('#messages').innerHTML=(d.pending||[]).map(m=>`<p>${esc(m.guest_name)}: ${esc(m.body)} <button data-id="${m.id}">PUBLISH</button></p>`).join('')||'No pending messages';document.querySelectorAll('[data-id]').forEach(b=>b.onclick=async()=>{await a('message/'+b.dataset.id,{method:'PATCH',body:JSON.stringify({status:'published'})});moderate()})}catch(e){document.querySelector('#messages').textContent=e.message}}
if(token)panel();
