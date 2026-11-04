// Faturamento e pedidos por CANAL DE VENDA (loja no Bling: Pedido Manual, Loja Virtual Shopify,
// ATACADO, TikTokShop) no período. Protegido por sessão. Rápido (só listagem, sem detalhe por
// pedido) — cache: período fechado = definitivo; mês corrente vale 1h.
// GET /api/canais?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
const { fetchPorLoja } = require('./_lib/bling');
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
      res.statusCode = 400; res.end(JSON.stringify({ error: 'inicio e fim obrigatório (YYYY-MM-DD)' })); return;
    }
    const chave = 'canais_' + inicio + '_' + fim;
    const hoje = new Date().toISOString().slice(0, 10);
    const force = q.force === '1';
    const cache = !force ? await getKv(chave).catch(() => null) : null;
    if (cache && cache.valor) {
      const fechado = fim < hoje;
      const calc = new Date(cache.calculado_em).getTime();
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime();
      if (definitivo || Date.now() - calc < 3600 * 1000) {
        res.statusCode = 200; res.end(JSON.stringify(Object.assign({ cache: true }, cache.valor))); return;
      }
    }
    const r = await fetchPorLoja(inicio, fim);
    try { await setKv(chave, r); } catch (e) { /* best-effort */ }
    res.statusCode = 200;
    res.end(JSON.stringify(Object.assign({ cache: false }, r)));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status; res.end(JSON.stringify({ error: e.message, needsAuth: status === 409 }));
  }
};

module.exports.config = { maxDuration: 60 };
