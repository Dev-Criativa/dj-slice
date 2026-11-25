(() => {
  const illustration = `<img class="pizza-illustration" src="/m3-pizza.webp" alt="Mão a segurar uma fatia de pizza">`;
  function closeModal(modal){modal?.classList.remove('visible');}
  function renderPizza(){
    const content=document.querySelector('#content');if(!content||content.dataset.pizzaReady==='1')return;
    content.dataset.pizzaReady='1';content.classList.add('pizza-content');document.querySelector('.mobile')?.classList.add('pizza-mode');
    content.innerHTML=`
      <h2 class="pizza-headline"><span>GRAB A</span><em>PIZZA SLICE!</em></h2>
      <div class="pizza-art">${illustration}</div>
      <p class="pizza-instruction">TROCA UMA FICHA<br>POR UMA FATIA.</p>
      <button type="button" class="pizza-claim"><span aria-hidden="true">◢</span> QUERO UMA FATIA</button>
      <div class="pizza-modal" aria-hidden="true">
        <section class="pizza-modal-card" role="dialog" aria-modal="true" aria-labelledby="pizza-modal-title">
          <button class="pizza-modal-close" type="button" aria-label="Fechar">×</button>
          <p class="pizza-modal-kicker">PEDE & FATIA · INSTRUÇÕES</p>
          <h3 id="pizza-modal-title">A TUA FATIA<br>ESTÁ À ESPERA.</h3>
          <p>Vai ao balcão das pizzas e troca uma das tuas fichas por uma fatia.</p>
          <strong>SEM LIMITES.<br>COME ATÉ NÃO CONSEGUIRES PASSAR NAS PORTAS!</strong>
          <button type="button" class="pizza-modal-ok">ENTENDIDO</button>
        </section>
      </div>`;
    const modal=content.querySelector('.pizza-modal'),open=content.querySelector('.pizza-claim'),close=content.querySelector('.pizza-modal-close'),ok=content.querySelector('.pizza-modal-ok');
    const show=()=>{modal.classList.add('visible');modal.setAttribute('aria-hidden','false');close.focus();};
    const hide=()=>{closeModal(modal);modal.setAttribute('aria-hidden','true');open.focus();};
    open.addEventListener('click',show);close.addEventListener('click',hide);ok.addEventListener('click',hide);
    modal.addEventListener('click',e=>{if(e.target===modal)hide();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('visible'))hide();});
  }
  window.renderPizza=renderPizza;
})();