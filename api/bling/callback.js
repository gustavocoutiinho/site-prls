// Recebe o authorization code do Bling, troca por token e persiste no Supabase.
const { exchangeCode } = require('../_lib/bling');
const { sessionFromReq } = require('../_lib/auth');

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

module.exports = async (req, res) => {
  // Sessão obrigatória: sem ela, um terceiro completaria o fluxo e sobrescreveria o token da loja.
  if (!sessionFromReq(req)) { res.statusCode = 302; res.setHeader('Location', '/?auth=required'); res.end(); return; }
  try {
    const code = req.query && req.query.code;
    const state = req.query && req.query.state;
    if (!code) { res.statusCode = 400; res.end('Faltou o parâmetro code.'); return; }

    const cookies = parseCookies(req);
    if (cookies.bling_state && state && cookies.bling_state !== state) {
      res.statusCode = 400; res.end('State inválido (CSRF).'); return;
    }

    await exchangeCode(code);
    res.setHeader('Set-Cookie', 'bling_state=; Path=/; Max-Age=0');
    res.writeHead(302, { Location: '/#/financeiro?bling=conectado' });
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end('Erro ao conectar o Bling: ' + e.message);
  }
};
