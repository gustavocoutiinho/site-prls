// Conversão por canal Suri (WhatsApp) no período. Protegido por sessão.
// GET /api/suri?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
const { fetchSuriStats } = require('./_lib/suri');
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
    const chave = 'suri_' + inicio + '_' + fim;
    const hoje = new Date().toISOString().slice(0, 10);
    // force=1: o "Atualizar" do portal recalcula tudo, então aqui também não pode devolver cache.
    const force = q.force === '1';
    const cache = !force ? await getKv(chave).catch(() => null) : null;
    if (cache && cache.valor) {
      const fechado = fim < hoje;
      const calc = new Date(cache.calculado_em).getTime();
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime();
      if (definitivo || Date.now() - calc < 10 * 60 * 1000) {
        res.statusCode = 200; res.end(JSON.stringify(Object.assign({ cache: true }, cache.valor))); return;
      }
    }
    const r = await fetchSuriStats(inicio, fim);
    const out = Object.assign({ inicio, fim }, r);
    try { await setKv(chave, out); } catch (e) { /* best-effort */ }
    res.statusCode = 200;
    res.end(JSON.stringify(Object.assign({ cache: false }, out)));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};

module.exports.config = { maxDuration: 30 };
