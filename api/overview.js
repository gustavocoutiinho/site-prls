// Snapshot gerencial cruzado do período numa única chamada: Bling (faturamento, pedidos, clientes
// únicos, venda por dia) + Meta (spend/impressões/cliques) + Suri (conversas/atendimentos). Cada
// fonte é tolerante a falha (allSettled): se o Meta cair, o resto vem mesmo assim (ok:false na fonte).
// Base da Visão Executiva (pulso do dia, ROAS, CAC, funil, comparativos) sem disparar N chamadas.
// GET /api/overview?inicio=YYYY-MM-DD&fim=YYYY-MM-DD[&force=1]
const { fetchPeriodo } = require('./_lib/bling');
const { fetchSpend } = require('./_lib/meta');
const { fetchSuriStats } = require('./_lib/suri');
const { getKv, setKv } = require('./_lib/supa');
const { mesCheio, getFechamento, aplica } = require('./_lib/fechamento');
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
    const hoje = new Date().toISOString().slice(0, 10);
    const force = q.force === '1';
    const chave = 'overview_' + inicio + '_' + fim;

    // lê o cache SEMPRE: mesmo com force=1 ele serve de rede pra uma fonte que falhar agora
    const fech = await getFechamento(mesCheio(inicio, fim));
    // o total oficial do mês (quando registrado) substitui só na RESPOSTA, nunca no cache
    const comOficial = (v) => {
      if (!fech || !v || !v.bling || !v.bling.ok) return v;
      return Object.assign({}, v, { bling: aplica(v.bling, 'faturamento', fech) });
    };
    const cacheRow = await getKv(chave).catch(() => null);
    const cache = !force ? cacheRow : null;
    if (cache && cache.valor) {
      const fechado = fim < hoje;
      const calc = new Date(cache.calculado_em).getTime();
      // período fechado: definitivo só 10 dias depois (o Bling ainda muda); até lá vale 6h
      const definitivo = fechado && calc > new Date(fim + 'T23:59:59').getTime() + 10 * 86400000;
      if (definitivo || Date.now() - calc < (fechado ? 6 * 3600 * 1000 : 4 * 60 * 1000)) { // corrente: 4min, "quase ao vivo" sem martelar as APIs
        res.statusCode = 200; res.end(JSON.stringify(comOficial(Object.assign({ cache: true }, cache.valor)))); return;
      }
    }

    // Uma varredura só do Bling serve faturamento E venda por dia (a listagem é a mesma). Duas
    // chamadas em paralelo pediam as mesmas páginas ao mesmo tempo e estouravam o limite de ~3 req/s.
    // Meta e Suri são outras APIs, seguem em paralelo sem problema.
    const [fat, meta, suri] = await Promise.allSettled([
      fetchPeriodo(inicio, fim),
      fetchSpend(inicio, fim),
      fetchSuriStats(inicio, fim),
    ]);
    const ok = (s) => s.status === 'fulfilled';
    const err = (s) => String((s.reason && s.reason.message) || s.reason || 'erro');
    const out = {
      periodo: { inicio, fim, hoje },
      bling: ok(fat)
        ? { ok: true, faturamento: fat.value.total, pedidos: fat.value.pedidos, clientesUnicos: fat.value.clientesUnicos }
        : { ok: false, erro: err(fat) },
      dias: ok(fat) ? { ok: true, lista: fat.value.dias } : { ok: false, erro: err(fat) },
      // quebra por loja (canal do Bling) da MESMA varredura: a soma fecha com o faturamento acima
      lojas: ok(fat) ? { ok: true, lista: fat.value.lojas } : { ok: false, erro: err(fat) },
      // venda registrada e ainda não atendida: fora do faturado (o Bling também não conta), mostrada à parte
      pendentes: ok(fat) ? Object.assign({ ok: true }, fat.value.pendentes) : { ok: false },
      meta: ok(meta)
        ? { ok: true, spend: meta.value.spend, impressoes: meta.value.impressions, cliques: meta.value.clicks, cpc: meta.value.cpc, cpm: meta.value.cpm }
        : { ok: false, erro: err(meta) },
      suri: ok(suri)
        ? { ok: true, conversas: suri.value.conversas, atendimentos: suri.value.atendimentos, mensagens: suri.value.mensagensRecebidas }
        : { ok: false, erro: err(suri) },
    };
    // Fonte que falhou AGORA (tipicamente 429 do Bling) não pode virar buraco na tela: se o cálculo
    // anterior tinha o dado, reaproveita marcando de onde veio. Buraco vira "R$ 0" na leitura de
    // quem olha, e zero falso é pior que dado de 5 minutos atrás.
    const ant = (cacheRow && cacheRow.valor) || null;
    if (ant) {
      ['bling', 'dias', 'lojas', 'meta', 'suri'].forEach((k) => {
        if (out[k] && out[k].ok === false && ant[k] && ant[k].ok) {
          out[k] = Object.assign({}, ant[k], { doCache: true, calculado_em: cacheRow.calculado_em });
        }
      });
    }
    // só cacheia se pelo menos o Bling (fonte principal) veio
    if (out.bling.ok) { try { await setKv(chave, out); } catch (e) { /* best-effort */ } }
    res.statusCode = 200;
    res.end(JSON.stringify(comOficial(Object.assign({ cache: false }, out))));
  } catch (e) {
    const status = /bling_nao_conectado|bling_sem_refresh/.test(e.message) ? 409 : 500;
    res.statusCode = status; res.end(JSON.stringify({ error: e.message, needsAuth: status === 409 }));
  }
};

module.exports.config = { maxDuration: 30 };
