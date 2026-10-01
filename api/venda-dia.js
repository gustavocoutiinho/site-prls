// Faturamento por dia no período (Bling). Protegido por sessão.
// GET /api/venda-dia?inicio=YYYY-MM-DD&fim=YYYY-MM-DD[&force=1]
// Cacheado: o Cockpit e a Visão pedem a mesma janela, e cada varredura pagina os pedidos do mês
// inteiro no Bling (limite ~3 req/s). Sem cache, duas telas abertas já bastavam pra levar 429.
const { fetchVendaDia } = require('./_lib/bling');
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
    const chave = 'vendadia_' + inicio + '_' + fim;
    const hoje = new Date().toISOString().slice(0, 10);
    const force = q.force === '1';
    const cacheRow = await getKv(chave).catch(() => null);
    if (!force && cacheRow && cacheRow.valor) {
      const fechado = fim < hoje;
      const calc = new Date(cacheRow.calculado_em).getTime();
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime();
      if (definitivo || Date.now() - calc < 5 * 60 * 1000) {
        res.statusCode = 200; res.end(JSON.stringify(Object.assign({ cache: true }, cacheRow.valor))); return;
      }
    }
    let r;
    try {
      r = await fetchVendaDia(inicio, fim);
    } catch (e) {
      // Bling fora agora (tipicamente 429): devolve o último cálculo bom em vez de deixar a tela
      // sem venda do dia. Buraco vira "R$ 0" na leitura de quem olha, e zero falso é pior.
      if (cacheRow && cacheRow.valor) {
        res.statusCode = 200;
        res.end(JSON.stringify(Object.assign({ cache: true, degradado: true, erro: e.message }, cacheRow.valor)));
        return;
      }
      throw e;
    }
    const out = Object.assign({ inicio, fim }, r);
    try { await setKv(chave, out); } catch (e) { /* best-effort */ }
    res.statusCode = 200; res.end(JSON.stringify(Object.assign({ cache: false }, out)));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status; res.end(JSON.stringify({ error: e.message, needsAuth: status === 409 }));
  }
};

module.exports.config = { maxDuration: 60 };
