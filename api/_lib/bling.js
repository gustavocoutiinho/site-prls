// Integração Bling API v3 (OAuth 2.0 + faturamento). Zero dependência: fetch/Buffer nativos.
const { getAuth, saveAuth, getKv, setKv, getKvMany } = require('./supa');

const AUTH_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize';
// Token no host oficial da API (o www passou a recusar chamada de API em set/2026). O www fica só
// como reserva, caso o host oficial não responda como endpoint de token.
const TOKEN_URLS = ['https://api.bling.com.br/Api/v3/oauth/token', 'https://www.bling.com.br/Api/v3/oauth/token'];
// Desde o início de set/2026 o Bling recusa chamada de API no host www: "A URL 'www.bling.com.br' está
// bloqueada para requisições de API. Por favor, utilize o endpoint oficial: 'api.bling.com.br'" (403).
// Foi isso que deixou o portal sem ler pedido nenhum de 02/09 a 15/09.
const API = 'https://api.bling.com.br/Api/v3';

// GET com retry automático: 429 (rate limit ~3 req/s), 5xx (instabilidade do Bling) e erro de rede.
// Backoff crescente. Só desiste depois de esgotar as tentativas.
// Freio de mão: a API do Bling aceita ~3 chamadas por segundo e responde 429 (que demora minutos
// pra soltar) quando passa. Toda chamada passa por esta fila, que garante um intervalo mínimo entre
// elas mesmo quando várias partes do portal pedem dado ao mesmo tempo. Sem isso, duas telas abertas
// já bastavam pra derrubar a leitura do mês inteiro.
const INTERVALO_MS = 380;
let ultimaChamada = 0;
let fila = Promise.resolve();
function vez() {
  fila = fila.then(async () => {
    const espera = Math.max(0, INTERVALO_MS - (Date.now() - ultimaChamada));
    if (espera) await new Promise((r) => setTimeout(r, espera));
    ultimaChamada = Date.now();
  });
  return fila;
}

// Resumo do corpo de erro do Bling (tipo/mensagem), pra "403" deixar de ser um número mudo.
function corpoErro(txt) {
  try {
    const j = JSON.parse(txt); const e = j && j.error;
    if (e) return ' · ' + [e.type, e.message, e.description].filter(Boolean).join(' · ').slice(0, 220);
  } catch (x) { /* não era JSON */ }
  return txt ? ' · ' + String(txt).replace(/\s+/g, ' ').slice(0, 160) : '';
}

async function getJson(url, hdrs, tries = 5) {
  for (let t = 0; t < tries; t++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000); // teto por tentativa: upstream travado não segura a function até o maxDuration
    try {
      await vez();
      const r = await fetch(url, { headers: { 'enable-jwt': '1', ...hdrs }, signal: ctrl.signal });
      clearTimeout(timer);
      if ((r.status === 429 || r.status >= 500) && t < tries - 1) {
        // 429 do Bling não solta em 1 segundo: espera crescendo (2s, 5s, 10s, 17s) em vez de insistir.
        await new Promise((res) => setTimeout(res, 2000 + 1500 * t * t + 500 * t));
        continue;
      }
      if (!r.ok) console.error('[bling] http ' + r.status + ' apos ' + (t + 1) + 'x: ' + url.replace(/^https?:\/\/[^/]+/, ''));
      return r;
    } catch (e) {
      clearTimeout(timer);
      if (t < tries - 1) { await new Promise((res) => setTimeout(res, 1200 * (t + 1))); continue; }
      console.error('[bling] rede/timeout apos ' + tries + 'x: ' + (e && e.message));
      throw e;
    }
  }
}

function basicAuth() {
  const id = process.env.BLING_CLIENT_ID;
  const secret = process.env.BLING_CLIENT_SECRET;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

function authorizeUrl(state) {
  const u = new URL(AUTH_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', process.env.BLING_CLIENT_ID);
  u.searchParams.set('state', state);
  return u.toString();
}

async function tokenRequest(params) {
  let r, j, ultimoErro;
  for (const url of TOKEN_URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'enable-jwt': '1',
        },
        body: new URLSearchParams(params),
        signal: ctrl.signal,
      });
    } catch (e) { ultimoErro = e; r = null; } finally { clearTimeout(timer); }
    if (!r) continue;                                          // rede: tenta o próximo host
    // Só troca de host se ESTE host não serve de endpoint de token (bloqueado/inexistente). Um 400/401
    // é resposta de verdade sobre o refresh_token (uso único) e não adianta repetir em outro host.
    if ([403, 404, 405].indexOf(r.status) >= 0 && url !== TOKEN_URLS[TOKEN_URLS.length - 1]) continue;
    break;
  }
  if (!r) throw ultimoErro || new Error('bling token sem resposta');
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('bling token ' + r.status + ': ' + JSON.stringify(j));
  await persist(j);
  return j;
}

async function persist(tok) {
  const ttl = Number(tok.expires_in || 21600); // 6h padrão
  const expires_at = new Date(Date.now() + (ttl - 120) * 1000).toISOString();
  await saveAuth({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at,
    scope: tok.scope || null,
  });
}

async function exchangeCode(code) {
  return tokenRequest({ grant_type: 'authorization_code', code });
}

// Coalescing em memória: várias chamadas concorrentes na mesma instância (o cockpit dispara ~7 endpoints
// juntos) compartilham UMA renovação, em vez de cada uma queimar o refresh_token (uso único no Bling) e
// as perdedoras virarem 500. A corrida cross-instância continua coberta pelo re-read do banco no catch.
let _refreshing = null;
async function getValidToken() {
  const auth = await getAuth();
  if (!auth || !auth.access_token) throw new Error('bling_nao_conectado');
  if (auth.expires_at && new Date(auth.expires_at) > new Date()) return auth.access_token;
  if (!auth.refresh_token) throw new Error('bling_sem_refresh');
  if (!_refreshing) {
    _refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh_token })
      .then((t) => t.access_token)
      .catch(async (e) => {
        // corrida: outra invocação já renovou. Re-lê o banco e usa o token novo se estiver válido.
        const fresh = await getAuth().catch(() => null);
        if (fresh && fresh.access_token && fresh.expires_at && new Date(fresh.expires_at) > new Date()) return fresh.access_token;
        throw e;
      })
      .finally(() => { _refreshing = null; });
  }
  return _refreshing;
}

// ESPELHO DO BLING (31/08/2026). O painel do Bling conta como venda do mês só o que está
// ATENDIDO (situacao.valor === 1). O portal contava tudo que não era cancelado, então somava
// também "Em aberto" (0) e "Em andamento" (3) e ficava ACIMA do Bling: em agosto/2026 dava
// R$ 171.419,37 / 436 pedidos contra R$ 168.684,10 / 425 do painel (12 pedidos, R$ 3.230,26 de
// diferença). Regra do Gustavo: o portal é espelho do Bling, não uma segunda contabilidade.
// Pedido em aberto vira faturamento no dia em que o Bling o marca como atendido.
function efetivado(p) { return !!(p && p.situacao && Number(p.situacao.valor) === 1); }

// Venda já registrada mas ainda NÃO atendida (em aberto / em andamento). Não entra no faturamento
// (o Bling também não conta), mas o portal mostra à parte pra ninguém achar que a venda sumiu.
function pendente(p) { const v = p && p.situacao ? Number(p.situacao.valor) : null; return v === 0 || v === 3; }

// A sincronização Shopify->Bling as vezes grava o MESMO pedido de origem (numeroLoja) como 2-3
// registros de pedido distintos no Bling (ids diferentes, ex: reedição de item reprocessada como
// novo registro em vez de update). Sem dedupe, esses pedidos entram 2-3x na soma de faturamento.
//
// IMPORTANTE: numeroLoja NÃO é um identificador único e confiável por si só — auditoria do histórico
// completo (2024-2026) achou numeroLoja repetido entre CLIENTES DIFERENTES com produtos e datas
// totalmente distintas (2 vendas reais e legítimas que só coincidem nesse campo). Deduplicar só por
// numeroLoja apagaria vendas de verdade. Por isso o agrupamento exige TAMBÉM: mesmo contato, mesmo
// total (centavos) e datas a no máximo 3 dias de diferença — janela que cobre reedição/reprocessamento
// rápido de um pedido, sem capturar coincidências de valor ao longo de semanas/meses. Pedidos sem
// numeroLoja (venda manual/direta) não entram nesse risco e passam direto.
function dedupePorNumeroLoja(pedidos) {
  const JANELA_DIAS_MS = 3 * 86400000;
  const porNumLoja = new Map();
  const out = [];
  for (const p of pedidos) {
    const nl = p.numeroLoja;
    if (!nl) { out.push(p); continue; }
    if (!porNumLoja.has(nl)) porNumLoja.set(nl, []);
    porNumLoja.get(nl).push(p);
  }
  let removidos = 0;
  for (const grupo of porNumLoja.values()) {
    if (grupo.length === 1) { out.push(grupo[0]); continue; }
    const usados = new Array(grupo.length).fill(false);
    for (let i = 0; i < grupo.length; i++) {
      if (usados[i]) continue;
      const cluster = [grupo[i]];
      usados[i] = true;
      const a = grupo[i];
      for (let j = i + 1; j < grupo.length; j++) {
        if (usados[j]) continue;
        const b = grupo[j];
        const mesmoContato = (a.contato && a.contato.id) === (b.contato && b.contato.id);
        const mesmoTotal = Math.abs(Number(a.total || 0) - Number(b.total || 0)) < 0.01;
        const dt = Math.abs(new Date(a.data) - new Date(b.data));
        if (mesmoContato && mesmoTotal && dt <= JANELA_DIAS_MS) { cluster.push(b); usados[j] = true; }
      }
      if (cluster.length === 1) { out.push(cluster[0]); continue; }
      let melhor = cluster[0];
      for (const p of cluster.slice(1)) {
        const mOk = efetivado(melhor), pOk = efetivado(p);
        if (pOk && !mOk) melhor = p;
        else if (pOk === mOk && p.id > melhor.id) melhor = p;
      }
      out.push(melhor);
      removidos += cluster.length - 1;
    }
  }
  if (removidos > 0) console.error('[bling] dedupe numeroLoja removeu ' + removidos + ' pedido(s) duplicado(s) de ' + pedidos.length);
  return out;
}

// Soma o total dos pedidos de venda EFETIVADOS no período (exclui cancelados, exclui duplicatas de
// sync por numeroLoja) + clientes únicos.
// Nomes dos canais de venda (loja.id) cadastrados no Bling da PRLS, confirmados com o Gustavo em
// 25/07/2026 (a API do Bling não expõe endpoint de nome de loja, só o id numérico). 0 = sem
// integração (venda direta/balcão, lançada à mão). Ajustar aqui se a PRLS cadastrar um canal novo.
const NOMES_LOJA = {
  0: 'Pedido Manual',
  205403538: 'Loja Virtual Shopify',
  206020434: 'ATACADO',
  206043068: 'TikTokShop',
};

// Uma listagem só do período. A MESMA página de pedidos alimenta faturamento, venda por dia e
// clientes únicos: antes o overview chamava fetchFaturamento e fetchVendaDia em paralelo e as duas
// paginavam os mesmos pedidos ao mesmo tempo, dobrando a pressão no limite de ~3 req/s do Bling
// (foi assim que a Visão levou 429 e ficou sem número em 31/08/2026).
async function listarPedidos(dataInicial, dataFinal) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  let pagina = 1;
  const all = [];
  while (pagina <= 200) {
    const url = `${API}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&limite=100`;
    const r = await getJson(url, H); // getJson tem retry no 429 (rate limit do Bling)
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  return all;
}

// Retrato completo do período numa varredura: faturamento, pedidos, clientes únicos, venda por dia
// e quebra por LOJA (canal do Bling). Tudo do mesmo conjunto de pedidos, no mesmo instante: é o que
// garante que a soma das lojas feche exatamente com o faturamento do mês (quebra calculada numa
// chamada separada já divergiu do total e confundiu a leitura).
async function fetchPeriodo(dataInicial, dataFinal) {
  const all = await listarPedidos(dataInicial, dataFinal);
  let total = 0, pedidos = 0;
  const clientes = new Set();
  const porDia = {}, porLoja = {};
  for (const p of dedupePorNumeroLoja(all)) {
    if (!efetivado(p)) continue;
    const v = Number(p.total || 0);
    total += v; pedidos++;
    if (p.contato && p.contato.id) clientes.add(p.contato.id);
    const d = (p.data || '').slice(0, 10);
    if (d) { if (!porDia[d]) porDia[d] = { faturamento: 0, pedidos: 0 }; porDia[d].faturamento += v; porDia[d].pedidos += 1; }
    const lid = (p.loja && p.loja.id) || 0;
    if (!porLoja[lid]) porLoja[lid] = { faturamento: 0, pedidos: 0 };
    porLoja[lid].faturamento += v; porLoja[lid].pedidos += 1;
  }
  // pendentes: contabilizados à parte, nunca somados ao faturamento
  let pendTotal = 0, pendPedidos = 0;
  for (const p of dedupePorNumeroLoja(all)) { if (!pendente(p)) continue; pendTotal += Number(p.total || 0); pendPedidos++; }
  const dias = Object.keys(porDia).sort().map((d) => ({ dia: d, faturamento: Math.round(porDia[d].faturamento * 100) / 100, pedidos: porDia[d].pedidos }));
  // Toda loja cadastrada entra, mesmo zerada: sumir do painel esconde canal que parou de vender.
  const ids = Object.keys(NOMES_LOJA).map(Number);
  Object.keys(porLoja).map(Number).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
  const lojas = ids.map((id) => ({
    id, nome: NOMES_LOJA[id] || ('Canal ' + id),
    faturamento: Math.round(((porLoja[id] && porLoja[id].faturamento) || 0) * 100) / 100,
    pedidos: (porLoja[id] && porLoja[id].pedidos) || 0,
  })).sort((a, b) => b.faturamento - a.faturamento);
  return { total: Math.round(total * 100) / 100, pedidos, clientesUnicos: clientes.size, dias, lojas,
    pendentes: { total: Math.round(pendTotal * 100) / 100, pedidos: pendPedidos } };
}

async function fetchFaturamento(dataInicial, dataFinal) {
  const r = await fetchPeriodo(dataInicial, dataFinal);
  return { total: r.total, pedidos: r.pedidos, clientesUnicos: r.clientesUnicos };
}

// Soma a quantidade de itens (pares) dos pedidos no período. Custoso: 1 request por pedido.
// Respeita o rate limit do Bling (~3 req/s) em lotes; teto pra não estourar em janelas grandes (ano).
async function fetchPares(dataInicial, dataFinal, teto = 600) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const all = [];
  let pagina = 1;
  while (pagina <= 200) {
    const url = `${API}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&limite=100`;
    const r = await getJson(url, H);
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  const ids = dedupePorNumeroLoja(all).filter(efetivado).map((p) => p.id);
  if (ids.length > teto) return { pares: null, pedidos: ids.length, completo: false };
  let pares = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const batch = ids.slice(i, i + 3);
    const results = await Promise.all(batch.map((id) =>
      getJson(`${API}/pedidos/vendas/${id}`, H).then((r) => (r && r.ok ? r.json() : null)).catch(() => null)
    ));
    for (const j of results) {
      if (j && j.data && Array.isArray(j.data.itens)) for (const it of j.data.itens) pares += Number(it.quantidade || 0);
    }
    if (i + 3 < ids.length) await new Promise((res) => setTimeout(res, 500));
  }
  return { pares: Math.round(pares), pedidos: ids.length, completo: true };
}

// Conta clientes cuja 1ª compra caiu no período (novos de verdade). Varre o histórico de pedidos
// até dataFinal e guarda a menor data por contato. Só listagem (100/página), sem detalhe: ~9s p/ ~1800 pedidos.
async function fetchNovosClientes(dataInicial, dataFinal) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const primeira = {};
  const all = [];
  let pagina = 1;
  while (pagina <= 1000) {
    const url = `${API}/pedidos/vendas?dataFinal=${dataFinal}&pagina=${pagina}&limite=100`;
    const r = await getJson(url, H); // retry no 429
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  for (const p of dedupePorNumeroLoja(all)) { if (!efetivado(p)) continue; const c = p.contato && p.contato.id; if (c) { const d = p.data; if (!primeira[c] || d < primeira[c]) primeira[c] = d; } }
  let novos = 0;
  for (const c in primeira) { if (primeira[c] >= dataInicial && primeira[c] <= dataFinal) novos++; }
  return { novos, baseHistorica: Object.keys(primeira).length };
}

// Mapa {id: nome} dos vendedores cadastrados no Bling.
async function fetchVendedoresMapa() {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const mapa = {};
  let pagina = 1;
  while (pagina <= 20) {
    const r = await getJson(`${API}/vendedores?pagina=${pagina}&limite=100`, H);
    if (!r || !r.ok) break;
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    for (const v of data) mapa[v.id] = (v.contato && v.contato.nome) || v.nome || ('Vendedor ' + v.id);
    if (data.length < 100) break;
    pagina++;
  }
  return mapa;
}


// Faturamento e pedidos por vendedor E por canal (loja) no MESMO período, a partir do MESMO
// conjunto de pedidos (detalhe de cada um, buscado uma vez só). As duas quebras vêm sempre juntas
// de propósito: se cada uma fosse calculada por uma chamada separada (com cache próprio), os
// totais podem divergir por terem sido calculados em instantes diferentes — o que já confundiu o
// Gustavo no Cockpit (Placar e Canais mostrando somas diferentes). Custoso (detalhe de cada
// pedido), teto pra janelas grandes.
async function fetchPorVendedor(dataInicial, dataFinal, teto = 700) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const nomes = await fetchVendedoresMapa();
  const all = [];
  let pagina = 1;
  while (pagina <= 200) {
    const r = await getJson(`${API}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&limite=100`, H);
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  const ids = dedupePorNumeroLoja(all).filter(efetivado).map((p) => p.id);
  if (ids.length > teto) return { vendedores: null, pedidos: ids.length, completo: false };
  const acc = {}, accLoja = {};
  for (let i = 0; i < ids.length; i += 3) {
    const batch = ids.slice(i, i + 3);
    const results = await Promise.all(batch.map((id) =>
      getJson(`${API}/pedidos/vendas/${id}`, H).then((r) => (r && r.ok ? r.json() : null)).catch(() => null)
    ));
    for (const jd of results) {
      if (!jd || !jd.data) continue;
      const vid = (jd.data.vendedor && jd.data.vendedor.id) || 0;
      if (!acc[vid]) acc[vid] = { faturamento: 0, pedidos: 0 };
      acc[vid].faturamento += Number(jd.data.total || 0);
      acc[vid].pedidos += 1;
      // Acumula por loja NO MESMO loop (mesmo conjunto de pedidos, mesmo instante) — assim
      // Placar (por vendedor) e Canais (por loja) sempre fecham no mesmo total, nunca divergem
      // por terem sido calculados em momentos diferentes.
      const lid = (jd.data.loja && jd.data.loja.id) || 0;
      if (!accLoja[lid]) accLoja[lid] = { faturamento: 0, pedidos: 0 };
      accLoja[lid].faturamento += Number(jd.data.total || 0);
      accLoja[lid].pedidos += 1;
    }
    if (i + 3 < ids.length) await new Promise((res) => setTimeout(res, 500));
  }
  const vendedores = Object.keys(acc).filter((vid) => vid !== '0').map((vid) => ({
    id: Number(vid), nome: nomes[vid] || ('Vendedor ' + vid),
    faturamento: Math.round(acc[vid].faturamento * 100) / 100, pedidos: acc[vid].pedidos,
  })).sort((a, b) => b.faturamento - a.faturamento);
  const sv = acc['0'] || { faturamento: 0, pedidos: 0 };
  const canais = Object.keys(accLoja).map((lid) => ({
    id: Number(lid), nome: NOMES_LOJA[lid] || ('Canal ' + lid),
    faturamento: Math.round(accLoja[lid].faturamento * 100) / 100, pedidos: accLoja[lid].pedidos,
  })).sort((a, b) => b.faturamento - a.faturamento);
  return {
    vendedores, semVendedor: { faturamento: Math.round(sv.faturamento * 100) / 100, pedidos: sv.pedidos },
    canais, pedidos: ids.length, completo: true,
  };
}

// Faturamento e pedidos por CANAL DE VENDA (loja) no período. Diferente de fetchPorVendedor: o
// campo loja.id já vem na listagem resumida, então não precisa buscar detalhe pedido a pedido —
// rápido mesmo em janelas grandes (série/ano). Aplica o mesmo dedupe por numeroLoja.
async function fetchPorLoja(dataInicial, dataFinal) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const all = [];
  let pagina = 1;
  while (pagina <= 200) {
    const r = await getJson(`${API}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&limite=100`, H);
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  const acc = {};
  for (const p of dedupePorNumeroLoja(all)) {
    if (!efetivado(p)) continue;
    const lid = (p.loja && p.loja.id) || 0;
    if (!acc[lid]) acc[lid] = { faturamento: 0, pedidos: 0 };
    acc[lid].faturamento += Number(p.total || 0);
    acc[lid].pedidos += 1;
  }
  const canais = Object.keys(acc).map((lid) => ({
    id: Number(lid), nome: NOMES_LOJA[lid] || ('Canal ' + lid),
    faturamento: Math.round(acc[lid].faturamento * 100) / 100, pedidos: acc[lid].pedidos,
  })).sort((a, b) => b.faturamento - a.faturamento);
  return { canais, pedidos: canais.reduce((a, c) => a + c.pedidos, 0) };
}

// Faturamento por dia no período (só listagem, sem detalhe). Rápido: usa data+total do resumido.
async function fetchVendaDia(dataInicial, dataFinal) {
  const r = await fetchPeriodo(dataInicial, dataFinal);
  return { dias: r.dias, pedidos: r.pedidos };
}

// Série mensal de faturamento (faturamento + pedidos por mês), últimos N meses. Só listagem, sem detalhe.
async function fetchSerie(meses) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const hoje = new Date();
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const ini = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    const fim = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(new Date(y, m + 1, 0).getDate()).padStart(2, '0');
    let pagina = 1;
    const mesAll = [];
    while (pagina <= 100) {
      const r = await getJson(`${API}/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}&pagina=${pagina}&limite=100`, H);
      if (!r.ok) throw new Error('bling serie ' + r.status + corpoErro(await r.text().catch(() => '')));
      const j = await r.json();
      const data = Array.isArray(j.data) ? j.data : [];
      if (!data.length) break;
      mesAll.push(...data);
      if (data.length < 100) break;
      pagina++;
    }
    let total = 0, pedidos = 0;
    for (const p of dedupePorNumeroLoja(mesAll)) { if (!efetivado(p)) continue; total += Number(p.total || 0); pedidos++; }
    out.push({ mes: ini.slice(0, 7), faturamento: Math.round(total * 100) / 100, pedidos });
  }
  return out;
}

// Série mensal com cache POR MÊS: mês fechado grava uma vez e vira definitivo (nunca mais bate no
// Bling); mês corrente atualiza a cada 5 min. Um mês recém-fechado é finalizado uma vez (refetch)
// caso só tenha cache de quando ainda era o mês corrente. Chaves kv: serie_mes_YYYY-MM.
async function fetchSerieCached(meses, force) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const curYM = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  let H = null;
  async function ensureH() {
    if (!H) { const t = await getValidToken(); H = { Authorization: `Bearer ${t}`, Accept: 'application/json' }; }
    return H;
  }
  async function fetchMes(y, m) {
    const hh = await ensureH();
    const ini = y + '-' + pad(m + 1) + '-01';
    const fim = y + '-' + pad(m + 1) + '-' + pad(new Date(y, m + 1, 0).getDate());
    let pagina = 1;
    const mesAll = [];
    while (pagina <= 100) {
      const r = await getJson(`${API}/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}&pagina=${pagina}&limite=100`, hh);
      if (!r.ok) throw new Error('bling serie ' + r.status + corpoErro(await r.text().catch(() => '')));
      const j = await r.json();
      const data = Array.isArray(j.data) ? j.data : [];
      if (!data.length) break;
      mesAll.push(...data);
      if (data.length < 100) break;
      pagina++;
    }
    let total = 0, pedidos = 0;
    for (const p of dedupePorNumeroLoja(mesAll)) { if (!efetivado(p)) continue; total += Number(p.total || 0); pedidos++; }
    return { faturamento: Math.round(total * 100) / 100, pedidos };
  }
  // monta a lista de meses e lê todo o cache de uma vez
  const metas = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    metas.push({ y: d.getFullYear(), m: d.getMonth(), ym: d.getFullYear() + '-' + pad(d.getMonth() + 1) });
  }
  const cacheMap = await getKvMany(metas.map((x) => 'serie_mes_' + x.ym)).catch(() => ({}));
  const out = [];
  for (const meta of metas) {
    const chave = 'serie_mes_' + meta.ym;
    const c = cacheMap[chave];
    const fechado = meta.ym < curYM;
    if (c && c.valor && typeof c.valor.faturamento === 'number') {
      const calc = new Date(c.calculado_em).getTime();
      if (fechado) {
        // Mês fechado ainda muda no Bling depois do dia 1 (pedido cancelado, pedido que vira atendido).
        // Agosto/2026 congelou em 01/09 06:01 com R$ 172.720,54 / 438 pedidos e no dia 15 o mesmo mês
        // já era R$ 171.775,08 / 435. Por isso só vira definitivo 10 dias depois de fechar; até lá o
        // cálculo vale 6h (o cron diário das 6h mantém em dia).
        const inicioMesSeguinte = new Date(meta.y, meta.m + 1, 1).getTime();
        const carencia = inicioMesSeguinte + 10 * 86400000;
        const recente = calc >= inicioMesSeguinte && (Date.now() - calc) < 6 * 3600 * 1000;
        if (calc >= carencia || (!force && recente)) { out.push({ mes: meta.ym, faturamento: c.valor.faturamento, pedidos: c.valor.pedidos }); continue; }
      } else if (!force && (Date.now() - calc) < 5 * 60 * 1000) {
        out.push({ mes: meta.ym, faturamento: c.valor.faturamento, pedidos: c.valor.pedidos }); continue;
      }
    }
    const r = await fetchMes(meta.y, meta.m);
    out.push({ mes: meta.ym, faturamento: r.faturamento, pedidos: r.pedidos });
    try { await setKv(chave, { faturamento: r.faturamento, pedidos: r.pedidos }); } catch (e) { /* best-effort */ }
  }
  return out;
}

// Custo unitário de um produto do catálogo. Na v3 o custo pode estar em campos diferentes conforme
// o cadastro; tenta os mais prováveis. AJUSTAR aqui depois de ver o JSON real quando o escopo abrir.
function custoDe(p) {
  const cands = [
    p && p.precoCusto, p && p.preco_custo, p && p.custo, p && p.precoCompra,
    p && p.fornecedor && p.fornecedor.precoCusto,
    p && p.estoque && p.estoque.precoCusto,
  ];
  for (const c of cands) { const n = Number(c); if (n > 0) return n; }
  return 0;
}

// Extrai o tamanho (numeração de calçado) do item vendido. Prefere o nome ("TAMANHO:38"); cai no
// final do SKU ("...-38"). Retorna string do número (30..46) ou null.
function tamanhoDe(codigo, nome) {
  const mn = /TAMANHO:\s*(\d{2})/i.exec(nome || '');
  if (mn) return mn[1];
  const ms = /-(\d{2})$/.exec((codigo || '').trim());
  if (ms) { const n = +ms[1]; if (n >= 30 && n <= 46) return ms[1]; }
  return null;
}

// Extrai a cor do item vendido a partir do nome ("...COR:OURO;..."). Retorna a cor em maiúsculas ou null.
function corDe(nome) {
  const m = /COR:\s*([^;]+)/i.exec(nome || '');
  if (!m) return null;
  const c = m[1].trim().toUpperCase();
  return c && c.length <= 30 ? c : null;
}

// Mapa {SKU|#idProduto: {custo, cheio}} lido do catálogo /produtos do Bling. EXIGE o escopo
// "Produtos" no app OAuth; sem ele o Bling devolve 403 e a função joga o erro (o chamador trata
// com catch → null e a aba segue sem margem). Cache 24h no kv (custo muda pouco). __achouCusto
// diz se a listagem trouxe custo de fato (se não, precisa de fallback por detalhe do produto).
async function fetchCatalogoCustos(force) {
  const CHAVE = 'bling_custos';
  if (!force) {
    const c = await getKv(CHAVE).catch(() => null);
    if (c && c.valor && (Date.now() - new Date(c.calculado_em).getTime()) < 24 * 3600 * 1000) return c.valor;
  }
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const map = {};
  let pagina = 1, achouCusto = false;
  while (pagina <= 100) {
    const r = await getJson(`${API}/produtos?pagina=${pagina}&limite=100`, H);
    if (r.status === 403) throw new Error('bling_sem_escopo_produtos'); // escopo Produtos ainda não liberado
    if (!r.ok) throw new Error('bling produtos ' + r.status);
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    for (const p of data) {
      const sku = (p.codigo || '') + '';
      const custo = custoDe(p), cheio = Number(p.preco || 0);
      if (custo > 0) achouCusto = true;
      const rec = { custo, cheio };
      if (sku) map[sku] = rec;
      if (p.id) map['#' + p.id] = rec;
    }
    if (data.length < 100) break;
    pagina++;
  }
  map.__achouCusto = achouCusto;
  try { await setKv(CHAVE, map); } catch (e) { /* best-effort */ }
  return map;
}

// Vendas por PRODUTO no período (todos os canais): agrega os itens de cada pedido (nome, quantidade,
// faturamento, nº de pedidos). Custoso (detalhe de cada pedido), com teto e usado com cache.
// Quando o catálogo de custos está disponível (escopo Produtos), anexa custo/margem por produto e
// agrega margem bruta + markdown do período. Sem escopo, cai no comportamento antigo (sem custo).
async function fetchProdutos(dataInicial, dataFinal, teto = 800) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const custoMap = await fetchCatalogoCustos().catch(() => null); // graceful: 403 (sem escopo) → null
  const all = [];
  let pagina = 1;
  while (pagina <= 200) {
    const r = await getJson(`${API}/pedidos/vendas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&limite=100`, H);
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  const ids = dedupePorNumeroLoja(all).filter(efetivado).map((p) => p.id);
  if (ids.length > teto) return { produtos: null, pedidos: ids.length, completo: false };
  const acc = {}, grade = {}, cores = {};
  let itensTot = 0, custoTot = 0, fatComCusto = 0, cheioTot = 0, fatComCheio = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const batch = ids.slice(i, i + 3);
    const results = await Promise.all(batch.map((id) =>
      getJson(`${API}/pedidos/vendas/${id}`, H).then((r) => (r && r.ok ? r.json() : null)).catch(() => null)
    ));
    for (const jd of results) {
      if (!jd || !jd.data || !Array.isArray(jd.data.itens)) continue;
      for (const it of jd.data.itens) {
        const nome = ((it.descricao || (it.produto && it.produto.nome) || 'Sem nome') + '').trim();
        const sku = (it.codigo || '') + '';
        const qtd = Number(it.quantidade || 0), val = Number(it.valor || 0);
        const ref = custoMap && (custoMap[sku] || (it.produto && it.produto.id && custoMap['#' + it.produto.id]));
        const custoU = ref && ref.custo ? Number(ref.custo) : 0;
        const cheioU = ref && ref.cheio ? Number(ref.cheio) : 0;
        if (!acc[nome]) acc[nome] = { produto: nome, sku, quantidade: 0, faturamento: 0, pedidos: 0, custo: 0 };
        acc[nome].quantidade += qtd;
        acc[nome].faturamento += val * qtd;
        acc[nome].pedidos += 1;
        acc[nome].custo += custoU * qtd;
        itensTot += qtd;
        const tam = tamanhoDe(sku, nome); if (tam) grade[tam] = (grade[tam] || 0) + qtd;
        const cor = corDe(nome); if (cor) { if (!cores[cor]) cores[cor] = { pares: 0, fat: 0 }; cores[cor].pares += qtd; cores[cor].fat += val * qtd; }
        if (custoU > 0) { custoTot += custoU * qtd; fatComCusto += val * qtd; }
        if (cheioU > 0) { cheioTot += cheioU * qtd; fatComCheio += val * qtd; }
      }
    }
    if (i + 3 < ids.length) await new Promise((res) => setTimeout(res, 500));
  }
  const produtos = Object.keys(acc).map((k) => {
    const p = acc[k];
    const fat = Math.round(p.faturamento * 100) / 100;
    const o = { produto: p.produto, sku: p.sku, quantidade: p.quantidade, faturamento: fat, pedidos: p.pedidos };
    if (p.custo > 0) { o.custo = Math.round(p.custo * 100) / 100; o.margemPct = p.faturamento ? Math.round((1 - p.custo / p.faturamento) * 1000) / 10 : null; }
    return o;
  }).sort((a, b) => b.faturamento - a.faturamento);
  const out = { produtos, pedidos: ids.length, itens: itensTot, completo: true, temCusto: custoTot > 0 };
  if (custoTot > 0) {
    out.custoTotal = Math.round(custoTot * 100) / 100;
    out.margemBrutaPct = fatComCusto ? Math.round((1 - custoTot / fatComCusto) * 1000) / 10 : null;
    out.faturamentoComCusto = Math.round(fatComCusto * 100) / 100;
  }
  if (cheioTot > 0 && fatComCheio > 0) out.markdownPct = Math.round((1 - fatComCheio / cheioTot) * 1000) / 10;
  if (Object.keys(grade).length) out.grade = grade;
  const ck = Object.keys(cores); if (ck.length) out.mixCor = ck.map((k) => ({ cor: k, pares: cores[k].pares, fat: Math.round(cores[k].fat * 100) / 100 })).sort((a, b) => b.fat - a.fat).slice(0, 10);
  return out;
}

// Segmentação RFM adaptada a varejo (nomes de negócio em pt-BR), a partir dos scores 1-5 de
// Recência, Frequência e Valor.
function segmentar(r, f, m) {
  if (r >= 4 && f >= 4) return 'Campeões';
  if (r >= 3 && f >= 3) return 'Fiéis';
  if (r >= 4 && f <= 2) return 'Novos / recentes';
  if (r >= 3 && f <= 2 && m >= 3) return 'Promissores';
  if (r <= 2 && f >= 4) return 'Não posso perder';
  if (r <= 2 && f >= 3) return 'Em risco';
  if (r <= 2 && f <= 2 && m >= 3) return 'Adormecidos de valor';
  if (r <= 1) return 'Hibernando';
  return 'Atenção';
}

// RFM (Recência, Frequência, Valor) por cliente a partir dos pedidos de venda. NÃO exige o escopo
// Contatos: id/nome/data/total já vêm no pedido resumido. Varre o histórico até dataFinal (só
// listagem, ~1 request por 100 pedidos). Scores 1-5 por quintil; recência invertida (mais recente =
// melhor). Retorna resumo por segmento + top clientes por valor. O escopo Contatos, quando ligado,
// enriquece nome/telefone/cidade depois (aqui o núcleo R/F/M já fecha).
async function fetchRFM(dataFinal) {
  const token = await getValidToken();
  const H = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const cli = {};
  const all = [];
  let pagina = 1;
  while (pagina <= 1000) {
    const r = await getJson(`${API}/pedidos/vendas?dataFinal=${dataFinal}&pagina=${pagina}&limite=100`, H);
    if (!r.ok) throw new Error('bling pedidos ' + r.status + corpoErro(await r.text().catch(() => '')));
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    pagina++;
  }
  let lidos = 0;
  for (const p of dedupePorNumeroLoja(all)) {
    if (!efetivado(p)) continue;
    const c = p.contato && p.contato.id;
    if (!c) continue;
    const d = (p.data || '').slice(0, 10);
    if (!cli[c]) cli[c] = { id: c, nome: (p.contato && p.contato.nome) || ('Cliente ' + c), pedidos: 0, valor: 0, ultima: d, primeira: d };
    cli[c].pedidos += 1;
    cli[c].valor += Number(p.total || 0);
    if (d && d > cli[c].ultima) cli[c].ultima = d;
    if (d && d < cli[c].primeira) cli[c].primeira = d;
    lidos++;
  }
  const clientes = Object.keys(cli).map((k) => cli[k]);
  const hoje = new Date(dataFinal + 'T00:00:00').getTime();
  clientes.forEach((x) => { x.recencia = Math.max(0, Math.round((hoje - new Date(x.ultima + 'T00:00:00').getTime()) / 86400000)); x.valor = Math.round(x.valor * 100) / 100; });
  // scores 1-5 por quintil. campo 'invert' true para recência (menor = melhor).
  function scoreQuintil(key, alvo, invert) {
    const vals = clientes.map((x) => x[key]).sort((a, b) => a - b);
    if (!vals.length) return;
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    const cortes = [q(0.2), q(0.4), q(0.6), q(0.8)];
    clientes.forEach((x) => {
      let s = 1; for (let i = 0; i < 4; i++) if (x[key] > cortes[i]) s = i + 2;
      x[alvo] = invert ? (6 - s) : s;
    });
  }
  scoreQuintil('recencia', 'rS', true);
  scoreQuintil('pedidos', 'fS', false);
  scoreQuintil('valor', 'mS', false);
  clientes.forEach((x) => { x.seg = segmentar(x.rS || 1, x.fS || 1, x.mS || 1); });
  const segs = {};
  clientes.forEach((x) => { if (!segs[x.seg]) segs[x.seg] = { seg: x.seg, clientes: 0, valor: 0, recSum: 0, pedSum: 0 }; const g = segs[x.seg]; g.clientes++; g.valor += x.valor; g.recSum += x.recencia; g.pedSum += x.pedidos; });
  const resumo = Object.keys(segs).map((k) => { const g = segs[k]; return { seg: g.seg, clientes: g.clientes, valor: Math.round(g.valor * 100) / 100, ticketMedio: g.clientes ? Math.round(g.valor / g.clientes * 100) / 100 : 0, recenciaMedia: g.clientes ? Math.round(g.recSum / g.clientes) : 0, freqMedia: g.clientes ? Math.round(g.pedSum / g.clientes * 10) / 10 : 0 }; }).sort((a, b) => b.valor - a.valor);
  const ordenados = clientes.slice().sort((a, b) => b.valor - a.valor);
  const top = ordenados.slice(0, 20).map((x) => ({ nome: x.nome, pedidos: x.pedidos, valor: x.valor, recencia: x.recencia, seg: x.seg }));
  const totalValor = clientes.reduce((a, x) => a + x.valor, 0);
  // Concentração (Pareto de clientes) + recompra
  const nTop10 = Math.max(1, Math.round(clientes.length * 0.1));
  const valTop10 = ordenados.slice(0, nTop10).reduce((a, x) => a + x.valor, 0);
  const recorrentes = clientes.filter((x) => x.pedidos >= 2).length;
  return {
    clientes: clientes.length, pedidos: lidos,
    ticketBase: clientes.length ? Math.round(totalValor / clientes.length * 100) / 100 : 0,
    valorTotal: Math.round(totalValor * 100) / 100,
    paretoTop10Pct: totalValor ? Math.round(valTop10 / totalValor * 1000) / 10 : 0,
    recompraPct: clientes.length ? Math.round(recorrentes / clientes.length * 1000) / 10 : 0,
    recorrentes, umaCompra: clientes.length - recorrentes,
    resumo, top, geradoEm: dataFinal,
  };
}

module.exports = { authorizeUrl, exchangeCode, getValidToken, fetchPeriodo, fetchFaturamento, fetchPares, fetchNovosClientes, fetchSerie, fetchSerieCached, fetchPorVendedor, fetchPorLoja, fetchVendaDia, fetchProdutos, fetchCatalogoCustos, fetchRFM };
