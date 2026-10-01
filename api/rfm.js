// RFM (Recência, Frequência, Valor) por cliente a partir dos pedidos de venda do Bling.
// Não exige escopo Contatos: id/nome/data/total vêm no pedido. GET /api/rfm?fim=YYYY-MM-DD
// (default: hoje). Cache 6h no kv (varre o histórico todo, é custoso).
const { fetchRFM } = require('./_lib/bling');
const { getKv, setKv } = require('./_lib/supa');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autenticado' })); return; }
  try {
    const q = req.query || {};
    const hoje = new Date().toISOString().slice(0, 10);
    const fim = q.fim && /^\d{4}-\d{2}-\d{2}$/.test(q.fim) ? q.fim : hoje;
    const chave = 'rfm_' + fim;
    const force = q.force === '1';
    const cache = !force ? await getKv(chave).catch(() => null) : null;
    if (cache && cache.valor) {
      const calc = new Date(cache.calculado_em).getTime();
      if (Date.now() - calc < 6 * 3600 * 1000) {
        res.statusCode = 200; res.end(JSON.stringify(Object.assign({ cache: true }, cache.valor))); return;
      }
    }
    const r = await fetchRFM(fim);
    try { await setKv(chave, r); } catch (e) { /* best-effort */ }
    res.statusCode = 200;
    res.end(JSON.stringify(Object.assign({ cache: false }, r)));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status; res.end(JSON.stringify({ error: e.message, needsAuth: status === 409 }));
  }
};

module.exports.config = { maxDuration: 300 };
