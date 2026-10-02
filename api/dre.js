// Inputs manuais da DRE por período.
// GET  /api/dre?periodo=YYYY-MM  -> { periodo, valores: { campo: valor } }
// POST /api/dre  { periodo, valores: {...} }
const { getDre, upsertDreMany } = require('./_lib/supa');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autenticado' })); return; }
  try {
    if (req.method === 'GET') {
      const periodo = (req.query || {}).periodo;
      if (!periodo) { res.statusCode = 400; res.end(JSON.stringify({ error: 'periodo obrigatório' })); return; }
      const rows = await getDre(periodo);
      const valores = {};
      (rows || []).forEach((r) => { valores[r.campo] = Number(r.valor); });
      res.statusCode = 200;
      res.end(JSON.stringify({ periodo, valores }));
      return;
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const periodo = body && body.periodo;
      const valores = (body && body.valores) || {};
      if (!periodo) { res.statusCode = 400; res.end(JSON.stringify({ error: 'periodo obrigatório' })); return; }
      await upsertDreMany(periodo, valores, null);
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'método não suportado' }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
