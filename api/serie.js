// Série mensal de faturamento (últimos N meses) do Bling. Cache POR MÊS (dentro de fetchSerieCached):
// meses fechados são definitivos (registrados uma vez), só o mês corrente reatualiza. Protegido por sessão.
// GET /api/serie?meses=18
const { fetchSerieCached } = require('./_lib/bling');
const { getFechamentos, aplica } = require('./_lib/fechamento');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autenticado' })); return; }
  try {
    const q = req.query || {};
    let meses = parseInt(q.meses, 10);
    if (!meses || meses < 1 || meses > 36) meses = 18;
    const calc = await fetchSerieCached(meses, q.force === '1');
    // mês com fechamento oficial registrado entra com o valor oficial (o do Bling vai junto)
    const fechs = await getFechamentos(calc.map((r) => r.mes));
    const serie = calc.map((r) => (fechs[r.mes] ? aplica(r, 'faturamento', fechs[r.mes]) : r));
    res.statusCode = 200;
    res.end(JSON.stringify({ meses, serie }));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status;
    res.end(JSON.stringify({ error: e.message }));
  }
};

module.exports.config = { maxDuration: 60 };
