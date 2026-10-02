// Metas por período (mês): meta da loja + meta por vendedora — o gestor define aqui.
// GET  /api/metas?periodo=YYYY-MM  -> { periodo, metas:{natasha,alyssa,total} | null, loja: número | null }
// POST /api/metas  { periodo, metas:{natasha,alyssa}? , loja? }  (merge: só sobrescreve o que vier)
// Laís saiu do time em 08/2026: não entra mais no total. O que já estava gravado no KV fica lá
// (não apagamos histórico), só deixa de ser somado e de aparecer no portal.
const { getKv, setKv } = require('./_lib/supa');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autenticado' })); return; }
  try {
    if (req.method === 'GET') {
      const periodo = (req.query || {}).periodo;
      if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'periodo YYYY-MM obrigatório' })); return; }
      const row = await getKv('metas_' + periodo).catch(() => null);
      const v = (row && row.valor) || null;
      const loja = v && Number(v.loja) > 0 ? Number(v.loja) : null;
      const temVend = v && (v.natasha || v.alyssa);
      res.statusCode = 200; res.end(JSON.stringify({ periodo, metas: temVend ? v : null, loja }));
      return;
    }
    if (req.method === 'POST') {
      let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const periodo = body && body.periodo;
      if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'periodo YYYY-MM obrigatório' })); return; }
      // Merge com o que já existe: salvar só a meta da loja não apaga as das vendedoras (e vice-versa).
      const atualRow = await getKv('metas_' + periodo).catch(() => null);
      const atual = (atualRow && atualRow.valor) || {};
      const clean = {
        natasha: Number(atual.natasha) || 0,
        alyssa: Number(atual.alyssa) || 0,
      };
      // Meta de quem saiu do time continua gravada (histórico do mês), só não soma nem aparece.
      if (atual.lais !== undefined) clean.lais = Number(atual.lais) || 0;
      if (body && body.metas && typeof body.metas === 'object') {
        const m = body.metas;
        if (m.natasha !== undefined) clean.natasha = Number(m.natasha) || 0;
        if (m.alyssa !== undefined) clean.alyssa = Number(m.alyssa) || 0;
      }
      clean.total = clean.natasha + clean.alyssa;
      const lojaAtual = Number(atual.loja) || 0;
      clean.loja = body && body.loja !== undefined ? (Number(body.loja) || 0) : lojaAtual;
      await setKv('metas_' + periodo, clean);
      res.statusCode = 200; res.end(JSON.stringify({ ok: true, periodo, metas: clean, loja: clean.loja }));
      return;
    }
    res.statusCode = 405; res.end(JSON.stringify({ error: 'método não suportado' }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
};

module.exports.config = { maxDuration: 15 };
