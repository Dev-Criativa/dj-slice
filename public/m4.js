(() => {
  const handImage = '/m4-hand.jpg';
  let cameraStream = null, torchOn = false;
  let busy = false;
  function stopStream(stream){stream?.getTracks().forEach(t=>t.stop());}
  function torchError(e){
    const n=e&&e.name;
    if(n==='NotAllowedError'||n==='SecurityError')return 'NÃO FOI DADA AUTORIZAÇÃO À CÂMARA. NO IPHONE: TOCA EM "AA" NA BARRA DO ENDEREÇO → DEFINIÇÕES DO SITE → CÂMARA → PERMITIR. OU USA A LANTERNA DO TELEMÓVEL.';
    if(n==='NotReadableError'||n==='AbortError')return 'A CÂMARA ESTÁ A SER USADA POR OUTRA APP. FECHA-A E TENTA DE NOVO, OU USA A LANTERNA DO TELEMÓVEL.';
    if(n==='NotFoundError'||n==='OverconstrainedError')return 'ESTE TELEMÓVEL NÃO DEIXA O BROWSER CONTROLAR A LANTERNA. USA A LANTERNA DO TELEMÓVEL.';
    return 'NÃO FOI POSSÍVEL ACENDER A LANTERNA'+(n?' ('+n+')':'')+'. USA A LANTERNA DO TELEMÓVEL.';
  }
  function setLabel(button,status,on){
    button.classList.toggle('is-on',on);button.setAttribute('aria-pressed',String(on));
    button.querySelector('.m4-button-label').textContent=on?'APAGAR A LANTERNA':'ACENDER A LANTERNA';
    status.textContent=on?'A TUA LUZ ESTÁ LIGADA. FAZ PARTE DO MOMENTO!':'LANTERNA DESLIGADA.';
  }
  async function setTorch(button, status) {
    if (busy) return;
    if (!navigator.mediaDevices?.getUserMedia) { status.textContent='ESTE BROWSER NÃO CONTROLA A LANTERNA. USA A LANTERNA DO TELEMÓVEL.'; return; }
    busy = true;
    // Trabalha sempre com uma referência local: se o stream for parado a meio (mudança de momento),
    // não rebenta por cameraStream passar a null.
    let stream = cameraStream;
    try {
      if (torchOn) { stopStream(stream); if (cameraStream===stream) cameraStream=null; torchOn=false; setLabel(button,status,false); return; }
      if (!stream) { stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); cameraStream = stream; }
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState==='ended') throw Object.assign(new Error('track ended'),{name:'AbortError'});
      const caps = track.getCapabilities?.() || {};
      if ('torch' in caps && !caps.torch) { stopStream(stream); if (cameraStream===stream) cameraStream=null; status.textContent='ESTE TELEMÓVEL NÃO DEIXA O BROWSER CONTROLAR A LANTERNA. USA A LANTERNA DO TELEMÓVEL.'; return; }
      await track.applyConstraints({advanced:[{torch:true}]});
      torchOn = true; setLabel(button,status,true);
    } catch (e) {
      stopStream(stream); if (cameraStream===stream) cameraStream=null; torchOn=false;
      status.textContent = torchError(e);
    } finally { busy = false; }
  }
  function renderM4(){
    const content=document.querySelector('#content'); if(!content)return;
    const source=content.querySelector('.device-call');
    if(!source||!source.textContent.toUpperCase().includes('LIGHTS')||content.dataset.m4Ready==='1')return;
    content.dataset.m4Ready='1';content.classList.add('m4-content');document.querySelector('.mobile')?.classList.add('m4-mode');
    content.innerHTML=`<h2 class="m4-headline"><span class="m4-line-one">TURN ON</span><span class="m4-line-two">THE LIGHTS.</span></h2><div class="m4-visual"><img src="${handImage}" alt="Ilustração de uma mão a segurar um telemóvel com a lanterna acesa"></div><p class="m4-instruction">LEVANTA O TELEMÓVEL.<br>ILUMINA A FESTA.</p><button type="button" class="m4-torch-button" aria-pressed="false"><span class="m4-torch-icon" aria-hidden="true">✦</span><span class="m4-button-label">ACENDER A LANTERNA</span></button><p class="m4-status" role="status" aria-live="polite">TOCA PARA ACENDER A LUZ DO TEU TELEMÓVEL.</p>`;
    const button=content.querySelector('.m4-torch-button'),status=content.querySelector('.m4-status');
    button.addEventListener('click',()=>setTorch(button,status));
  }
  function stopM4(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}torchOn=false;}
  window.renderM4=renderM4;
  window.stopM4=stopM4;
  const observer=new MutationObserver(renderM4);
  function start(){const content=document.querySelector('#content');if(content){observer.observe(content,{childList:true,subtree:true});renderM4();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopM4();});
  window.addEventListener('pagehide',stopM4);
})();