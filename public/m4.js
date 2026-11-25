(() => {
  const handImage = '/m4-hand.jpg';
  let cameraStream = null, torchOn = false;
  async function setTorch(button, status) {
    if (!navigator.mediaDevices?.getUserMedia) { status.textContent='Este navegador não permite controlar a lanterna. Usa o botão físico do telemóvel.'; return; }
    try {
      if (!cameraStream) cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const track=cameraStream.getVideoTracks()[0], caps=track.getCapabilities?.()||{};
      if (!caps.torch) { status.textContent='A lanterna não está disponível neste navegador. Usa o botão físico do telemóvel.'; cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; return; }
      torchOn=!torchOn; await track.applyConstraints({advanced:[{torch:torchOn}]});
      button.classList.toggle('is-on',torchOn); button.setAttribute('aria-pressed',String(torchOn));
      button.querySelector('.m4-button-label').textContent=torchOn?'APAGAR A LANTERNA':'ACENDER A LANTERNA';
      status.textContent=torchOn?'A TUA LUZ ESTÁ LIGADA. FAZ PARTE DO MOMENTO!':'LANTERNA DESLIGADA.';
      if(!torchOn){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
    } catch(e) { status.textContent='Não foi possível activar a lanterna. Verifica a autorização da câmara ou usa o botão físico.'; if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;torchOn=false; }
  }
  function renderM4(){
    const content=document.querySelector('#content'); if(!content)return;
    const source=content.querySelector('.device-call');
    if(!source||!source.textContent.includes('LIGHTS')||content.dataset.m4Ready==='1')return;
    content.dataset.m4Ready='1';content.classList.add('m4-content');document.querySelector('.mobile')?.classList.add('m4-mode');document.querySelector('.mobile')?.classList.add('m4-mode');
    content.innerHTML=`<div class="m4-kicker">TURN ON THE</div><h2 class="m4-headline">LIGHTS<span>!</span></h2><div class="m4-visual"><img src="${handImage}" alt="Ilustração de uma mão a segurar um telemóvel com a lanterna acesa"></div><p class="m4-instruction">LEVANTA O TELEMÓVEL.<br>ILUMINA A FESTA.</p><button type="button" class="m4-torch-button" aria-pressed="false"><span class="m4-torch-icon" aria-hidden="true">✦</span><span class="m4-button-label">ACENDER A LANTERNA</span></button><p class="m4-status" role="status" aria-live="polite">TOCA PARA ACENDER A LUZ DO TEU TELEMÓVEL.</p>`;
    const button=content.querySelector('.m4-torch-button'),status=content.querySelector('.m4-status');
    button.addEventListener('click',()=>setTorch(button,status));
  }
  const observer=new MutationObserver(renderM4);
  function start(){const content=document.querySelector('#content');if(content){observer.observe(content,{childList:true,subtree:true});renderM4();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;torchOn=false;}});
})();