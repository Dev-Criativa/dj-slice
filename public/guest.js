let renderedMoment = null;

async function draw() {
  try {
    const d = await api('state');
    const moment = d.event.activeMoment;
    const content = document.querySelector('#content');

    document.querySelector('#title').textContent = d.event.title;
    document.querySelector('#intro').textContent = 'The experience changes with the event.';

    // Rebuild the interface only when the Admin changes the active moment.
    // This keeps text fields intact while the screen refreshes in the background.
    if (moment === renderedMoment) return;
    renderedMoment = moment;

    if (moment === 'm1') {
      content.innerHTML = '<h2>Search TIDAL</h2><input id="q" placeholder="Artist or track"><button id="search">SEARCH</button><div id="results"></div><hr><h2>Message wall</h2><input id="name" placeholder="Name"><textarea id="msg" placeholder="Write a message"></textarea><button id="send">SEND FOR APPROVAL</button>';

      document.querySelector('#search').onclick = async () => {
        const query = document.querySelector('#q').value.trim();
        if (!query) return;
        const results = document.querySelector('#results');
        results.textContent = 'Searching…';
        try {
          const response = await api('tracks?q=' + encodeURIComponent(query));
          results.textContent = response.error || 'TIDAL connection pending.';
        } catch (error) {
          results.textContent = error.message;
        }
      };

      document.querySelector('#send').onclick = async () => {
        const name = document.querySelector('#name').value.trim();
        const message = document.querySelector('#msg').value.trim();
        if (!message) {
          alert('Please write a message first.');
          return;
        }
        try {
          await api('message', {
            method: 'POST',
            body: JSON.stringify({ name, message })
          });
          document.querySelector('#msg').value = '';
          alert('Sent for approval');
        } catch (error) {
          alert(error.message);
        }
      };
    } else if (moment === 'm2') {
      content.innerHTML =
        `<h2>${esc(d.poll?.question || 'Song Wars')}</h2>` +
        (d.poll?.options || []).map(option =>
          `<button class="option" data-id="${esc(option.id)}">${esc(option.label)}</button>`
        ).join('') +
        '<hr><input id="name" placeholder="Name"><textarea id="msg" placeholder="Message"></textarea><button id="send">SEND FOR APPROVAL</button>';

      content.querySelectorAll('[data-id]').forEach(button => {
        button.onclick = async () => {
          try {
            await api('poll/vote', {
              method: 'POST',
              body: JSON.stringify({ optionId: button.dataset.id })
            });
            button.textContent += ' ✓';
            button.disabled = true;
          } catch (error) {
            alert(error.message);
          }
        };
      });

      document.querySelector('#send').onclick = async () => {
        const name = document.querySelector('#name').value.trim();
        const message = document.querySelector('#msg').value.trim();
        if (!message) {
          alert('Please write a message first.');
          return;
        }
        try {
          await api('message', {
            method: 'POST',
            body: JSON.stringify({ name, message })
          });
          document.querySelector('#msg').value = '';
          alert('Sent for approval');
        } catch (error) {
          alert(error.message);
        }
      };
    } else if (moment === 'm3') {
      content.innerHTML = '<h2>MIDNIGHT SLICE</h2>Pizza time.';
    } else {
      content.innerHTML = '<h2>TURN ON THE LIGHTS</h2>Switch on your mobile torch.';
    }
  } catch (error) {
    document.querySelector('#content').textContent = error.message;
  }
}

draw();
setInterval(draw, 3000);
