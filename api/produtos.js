// Vendas por produto no período (Bling, todos os canais). Custoso (detalhe de cada pedido),
// por isso cache: mês fechado = definitivo; mês corrente vale 6h. GET /api/produtos?inicio&fim
const { fetchProdutos } = require('./_lib/bling');
const { getKv, setKv } = require('./_lib/supa');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autenticado' })); return; }
  try {
    const q = req.query || {};
    const inicio = q.inicio, fim = q.fim;
    if (!inicio || !fim || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'inicio e fim obrigatórios (YYYY-MM-DD)' })); return;
    }
    const chave = 'produtos_' + inicio + '_' + fim;
    const hoje = new Date().toISOString().slice(0, 10);
    const force = q.force === '1';
    const cache = !force ? await getKv(chave).catch(() => null) : null;
    if (cache && cache.valor) {
      const fechado = fim < hoje;
      const calc = new Date(cache.calculado_em).getTime();
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime();
      if (definitivo || Date.now() - calc < 6 * 3600 * 1000) {
        res.statusCode = 200; res.end(JSON.stringify(Object.assign({ cache: true }, cache.valor))); return;
      }
    }
    const r = await fetchProdutos(inicio, fim);
    const out = Object.assign({ inicio, fim }, r);
    if (r.completo) { try { await setKv(chave, out); } catch (e) { /* best-effort */ } }
    res.statusCode = 200;
    res.end(JSON.stringify(Object.assign({ cache: false }, out)));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status; res.end(JSON.stringify({ error: e.message, needsAuth: status === 409 }));
  }
};

module.exports.config = { maxDuration: 300 };
