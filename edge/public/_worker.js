// Proxy do domínio pede-e-fatia.criativa.org (Cloudflare Pages) para o Worker dj-slice.
// O DNS de criativa.org está no cPanel: o Pages aceita um CNAME externo, o Worker não.
// Tudo o que chega ao domínio é passado tal e qual ao Worker através de um service binding.
export default {
  async fetch(request, env) {
    return env.APP.fetch(request);
  }
};
