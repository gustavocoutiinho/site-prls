// Inicia o fluxo OAuth do Bling: gera state, seta cookie, redireciona para o Bling.
const { authorizeUrl } = require('../_lib/bling');
const { sessionFromReq } = require('../_lib/auth');

module.exports = async (req, res) => {
  // Só quem está logado no portal pode (re)conectar o Bling: o token é singleton compartilhado.
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end('Faça login no portal antes de conectar o Bling.'); return; }
  try {
    const state = 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    res.setHeader('Set-Cookie', `bling_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    res.writeHead(302, { Location: authorizeUrl(state) });
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end('Erro ao iniciar autorização: ' + e.message);
  }
};
