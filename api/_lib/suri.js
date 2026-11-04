// Stats do Suri (canal WhatsApp da PRLS) lidas do MinerOS via RPC agregada prls_suri_stats.
// A RPC (SECURITY DEFINER) devolve só contagens do período; nunca dados de conversa individuais.
const MINEROS_URL = process.env.MINEROS_URL;
const MINEROS_KEY = process.env.MINEROS_ANON_KEY;

// Chama uma RPC do MinerOS com timeout + retry (a RPC varre muitos eventos e pode oscilar;
// sem isto, uma resposta lenta virava "Suri indisponível" na tela).
async function rpc(nome, body, tries) {
  tries = tries || 3;
  if (!MINEROS_URL || !MINEROS_KEY) throw new Error('mineros_nao_configurado');
  let err;
  for (let t = 0; t < tries; t++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(`${MINEROS_URL}/rest/v1/rpc/${nome}`, {
        method: 'POST',
        headers: { apikey: MINEROS_KEY, Authorization: `Bearer ${MINEROS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error('suri ' + r.status + ': ' + JSON.stringify(j));
      return j;
    } catch (e) { clearTimeout(timer); err = e; if (t < tries - 1) await new Promise((res) => setTimeout(res, 600 * (t + 1))); }
  }
  throw err;
}

async function fetchSuriStats(inicio, fim) {
  const j = await rpc('prls_suri_stats', { p_inicio: inicio, p_fim: fim });
  return {
    conversas: Number((j && j.conversas) || 0),
    atendimentos: Number((j && j.atendimentos) || 0),
    mensagensRecebidas: Number((j && j.mensagens_recebidas) || 0),
  };
}

// Pessoas únicas e atendimentos por atendente (vendedora) no período — base da conversão por vendedora.
async function fetchSuriPorAtendente(inicio, fim) {
  const rows = await rpc('prls_suri_por_atendente', { p_inicio: inicio, p_fim: fim });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    atendente: r.atendente || '', email: r.email || '',
    pessoas: Number(r.pessoas || 0), atendimentos: Number(r.atendimentos || 0),
  }));
}

module.exports = { fetchSuriStats, fetchSuriPorAtendente };
