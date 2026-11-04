// Retorna o faturamento (soma de pedidos de venda) do Bling por período.
// Cache curto (kv): mês fechado = definitivo; mês corrente vale 5 min (evita rebater no Bling
// toda vez que um painel abre — os 5 painéis pedem o mesmo mês). GET /api/faturamento?inicio&fim
const { fetchFaturamento } = require('./_lib/bling');
const { getKv, setKv } = require('./_lib/supa');
const { mesCheio, getFechamento, aplica } = require('./_lib/fechamento');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'nao_autenticado' })); return;
  }
  try {
    const q = req.query || {};
    const inicio = q.inicio;
    const fim = q.fim;
    if (!inicio || !fim || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'inicio e fim obrigatórios no formato YYYY-MM-DD' }));
      return;
    }
    const chave = 'faturamento_' + inicio + '_' + fim;
    const hoje = new Date().toISOString().slice(0, 10);
    const force = q.force === '1';

    // mês cheio com fechamento oficial registrado: o total oficial manda (o do Bling vai junto)
    const fech = await getFechamento(mesCheio(inicio, fim));
    const cache = !force ? await getKv(chave).catch(() => null) : null;
    if (cache && cache.valor && typeof cache.valor.faturamento === 'number') {
      const fechado = fim < hoje;
      const calc = new Date(cache.calculado_em).getTime();
      // Período fechado só vira definitivo 10 dias depois de terminar: o Bling ainda muda (pedido
      // cancelado, pedido que vira atendido). Até lá o cálculo vale 6h; mês corrente vale 5 min.
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime() + 10 * 86400000;
      const idadeMs = Date.now() - calc;
      if (definitivo || idadeMs < (fechado ? 6 * 3600 * 1000 : 5 * 60 * 1000)) {
        res.statusCode = 200; res.end(JSON.stringify(aplica(Object.assign({ cache: true }, cache.valor), 'faturamento', fech))); return;
      }
    }

    const r = await fetchFaturamento(inicio, fim);
    const out = { faturamento: r.total, pedidos: r.pedidos, clientesUnicos: r.clientesUnicos, inicio, fim };
    try { await setKv(chave, out); } catch (e) { /* best-effort */ }
    res.statusCode = 200;
    res.end(JSON.stringify(aplica(Object.assign({ cache: false }, out), 'faturamento', fech)));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status;
    res.end(JSON.stringify({ error: e.message, needsAuth: status === 409 }));
  }
};
