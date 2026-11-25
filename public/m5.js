(() => {
  const illustration = `
  <svg class="pizza-illustration" viewBox="0 0 620 560" role="img" aria-label="Mão ilustrada a segurar uma fatia de pizza">
    <defs>
      <linearGradient id="crust" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe3a0"/><stop offset="1" stop-color="#d88a35"/></linearGradient>
      <linearGradient id="cheese" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff0c1"/><stop offset="1" stop-color="#e9a84e"/></linearGradient>
      <pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#201914" opacity=".7"/></pattern>
    </defs>
    <g stroke="#17120f" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
      <path fill="url(#crust)" d="M150 110 Q176 34 258 52 L510 154 Q544 171 524 206 L493 251 Q470 272 439 255 L174 168 Q128 151 150 110Z"/>
      <path fill="url(#cheese)" d="M153 145 L520 213 L401 456 Q385 493 370 450 L349 412 Q336 390 321 423 L302 462 Q286 483 279 447 L265 394 Q253 365 235 395 L212 430 Q194 447 192 410 L187 355 Q182 331 164 350 L143 373 Q121 386 125 350Z"/>
      <path fill="#b52c45" d="M261 183 Q280 155 316 174 Q340 192 327 222 Q305 247 274 229 Q248 212 261 183Z"/>
      <path fill="#b52c45" d="M390 245 Q414 220 443 244 Q465 267 443 293 Q416 309 392 286 Q375 265 390 245Z"/>
      <path fill="#b52c45" d="M202 267 Q220 247 244 265 Q259 287 239 307 Q215 319 198 298 Q186 280 202 267Z"/>
      <path fill="url(#dots)" stroke="none" d="M153 145 L520 213 L401 456 Q385 493 370 450 L349 412 Q336 390 321 423 L302 462 Q286 483 279 447 L265 394 Q253 365 235 395 L212 430 Q194 447 192 410 L187 355 Q182 331 164 350 L143 373 Q121 386 125 350Z"/>
      <path fill="#f4c47e" d="M88 517 Q105 429 145 352 Q170 304 193 292 L226 269 Q251 254 266 270 Q276 286 257 305 L222 336 Q209 354 207 383 L216 444 Q215 481 190 516Z"/>
      <path fill="#f4c47e" d="M75 516 Q44 470 54 424 Q61 386 88 374 Q111 365 126 385 L151 421 Q165 443 157 477 L141 540Z"/>
      <path fill="#6a302d" d="M53 432 Q67 391 91 385 Q111 379 124 400 L140 426 Q117 421 101 444 Q81 463 75 493Z"/>
      <path fill="#241b17" d="M39 510 Q78 474 155 493 L208 560 L0 560Z"/>
      <path fill="none" stroke="#e8b66d" stroke-width="5" d="M17 527 L35 507 M31 544 L51 510 M48 552 L67 513 M65 556 L84 518 M83 558 L101 523"/>
    </g>
    <path d="M266 177 Q281 161 302 171" fill="none" stroke="#f6d9a5" stroke-width="5" opacity=".7"/>
    <path d="M390 239 Q408 229 423 241" fill="none" stroke="#f6d9a5" stroke-width="5" opacity=".7"/>
    <g fill="none" stroke="#f3c36f" stroke-width="8" stroke-linecap="round"><path d="M540 90 l34 -34 M554 140 l49 -12 M526 40 l7 -34"/></g>
  </svg>`;
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