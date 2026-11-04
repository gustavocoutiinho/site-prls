// Soma a quantidade de itens (pares) vendidos no período. Protegido por sessão.
// Custoso (1 request por pedido no Bling), então usa cache por período:
// - período fechado (fim < hoje) → cache é definitivo (nunca muda).
// - período em aberto (inclui hoje) → cache vale 6h; depois recalcula.
// GET /api/pares?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
const { fetchPares } = require('./_lib/bling');
const { getParesCache, saveParesCache } = require('./_lib/supa');
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
    const periodo = inicio + '_' + fim;
    const hoje = new Date().toISOString().slice(0, 10);

    const cache = await getParesCache(periodo).catch(() => null);
    if (cache) {
      const fechado = fim < hoje;
      const calc = new Date(cache.calculado_em).getTime();
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime();
      const idadeMs = Date.now() - calc;
      if (definitivo || idadeMs < 6 * 3600 * 1000) {
        res.statusCode = 200;
        res.end(JSON.stringify({ inicio, fim, pares: cache.pares, pedidos: cache.pedidos, completo: true, cache: true }));
        return;
      }
    }

    const r = await fetchPares(inicio, fim);
    if (r.completo && typeof r.pares === 'number') {
      try { await saveParesCache(periodo, r.pares, r.pedidos); } catch (e) { /* cache é best-effort */ }
    }
    res.statusCode = 200;
    res.end(JSON.stringify(Object.assign({ inicio, fim, cache: false }, r)));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status;
    res.end(JSON.stringify({ error: e.message }));
  }
};

module.exports.config = { maxDuration: 300 };
