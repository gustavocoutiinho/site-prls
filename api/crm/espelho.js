// Ponte de leitura B2C. As credenciais OAuth e do banco permanecem no portal PRLS.
const crypto = require('node:crypto');
const { getValidToken, getJson } = require('../_lib/bling');
const LOJAS_VAREJO = new Set(['0', '205403538', '206043068']);
const varejo = pedido => pedido && pedido.loja && LOJAS_VAREJO.has(String(pedido.loja.id));

function createHandler({ getToken = getValidToken, request = (url, options) => getJson(url, options.headers, 3), key = () => process.env.CRM_B2C_READ_KEY } = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-store');
    const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') return reply(405, { error: 'somente_leitura' });
    const secret = key();
    const given = String(req.headers.authorization || '');
    const expected = 'Bearer ' + (secret || '');
    if (!secret || Buffer.byteLength(given) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return reply(401, { error: 'nao_autorizado' });
    const q = req.query || {};
    const allowed = new Set(['products', 'orders', 'product', 'order', 'contact', 'deposits', 'price_lists', 'orders_changes']);
    if (!allowed.has(q.resource)) return reply(400, { error: 'recurso_invalido' });
    const page = Number(q.page || 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000) return reply(400, { error: 'pagina_invalida' });
    if (['product', 'order', 'contact'].includes(q.resource) && !/^\d{1,20}$/.test(String(q.id || ''))) return reply(400, { error: 'identificador_invalido' });
    try {
      const token = await getToken();
      const get = async (path, params = {}) => {
        const response = await request('https://api.bling.com.br/Api/v3' + path + '?' + new URLSearchParams(params), {
          method: 'GET', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(25000)
        });
        if (!response.ok) { const error = new Error('origem_indisponivel'); error.status = [401,403,404,429].includes(response.status) ? response.status : 502; throw error; }
        const result = await response.json();
        if (!result || !Array.isArray(result.data) && typeof result.data !== 'object') throw new Error('formato_invalido');
        return result.data;
      };
      if (q.resource === 'deposits' || q.resource === 'price_lists') {
        const rows = await get(q.resource === 'deposits' ? '/depositos' : '/listas-precos', { pagina: page, limite: 100 });
        if (!Array.isArray(rows)) throw new Error('formato_invalido');
        // Metadados de configuração, sem selecionar depósito/tabela por nome ou por suposição.
        const data = rows.map(row => ({ id: row.id, nome: row.nome || row.descricao || '', situacao: row.situacao ?? null }));
        return reply(200, { data, has_more: rows.length === 100 });
      }
      if (q.resource === 'products') {
        const data = await get('/produtos', { pagina: page, limite: 100, criterio: 5, tipo: 'T' });
        if (!Array.isArray(data)) throw new Error('formato_invalido');
        return reply(200, { data, has_more: data.length === 100 });
      }
      if (q.resource === 'orders_changes') {
        const validDate = value => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || ''));
        if (!validDate(q.since) || !validDate(q.until)) return reply(400, { error: 'periodo_invalido' });
        const start = Date.parse(q.since.replace(' ', 'T') + '-03:00');
        const end = Date.parse(q.until.replace(' ', 'T') + '-03:00');
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 7 * 86400000 || end > Date.now() + 60000) return reply(400, { error: 'periodo_invalido' });
        const rows = await get('/pedidos/vendas', { pagina: page, limite: 100, dataAlteracaoInicial: q.since, dataAlteracaoFinal: q.until });
        if (!Array.isArray(rows)) throw new Error('formato_invalido');
        return reply(200, { data: rows.filter(varejo), out_of_scope_ids: rows.filter(row => !varejo(row)).map(row => String(row.id)).filter(id => /^\d{1,20}$/.test(id)), has_more: rows.length === 100 });
      }
      if (q.resource === 'orders') {
        const year = Number(q.year);
        if (!Number.isInteger(year) || year < 2020 || year > new Date().getUTCFullYear()) return reply(400, { error: 'periodo_invalido' });
        const end = [year + '-12-31', new Date().toISOString().slice(0,10)].sort()[0];
        const data = await get('/pedidos/vendas', { pagina: page, limite: 100, dataInicial: year + '-01-01', dataFinal: end });
        if (!Array.isArray(data)) throw new Error('formato_invalido');
        return reply(200, { data: data.filter(varejo), has_more: data.length === 100 });
      }
      if (q.resource === 'order') {
        const data = await get('/pedidos/vendas/' + q.id);
        if (!varejo(data)) return reply(404, { error: 'registro_fora_do_varejo' });
        const statusId = String(data.situacao?.id || '');
        if (/^\d{1,20}$/.test(statusId)) {
          try {
            const status = await get('/situacoes/' + statusId);
            if (String(status?.id) === statusId && typeof status.nome === 'string') data.situacao.nome = status.nome;
          } catch (_) { /* mantém o pedido disponível quando o escopo de situações não está liberado */ }
        }
        return reply(200, { data });
      }
      if (q.resource === 'contact') {
        // Não libera cadastro arbitrário: exige pedido varejista confirmado na origem.
        let found = false;
        for (let p=1;p<=10;p++) {
          const orders = await get('/pedidos/vendas', { idContato: q.id, pagina: p, limite: 100 });
          if (!Array.isArray(orders)) throw new Error('formato_invalido');
          if (orders.some(varejo)) { found = true; break; }
          if (orders.length < 100) break;
          await new Promise(resolve => setTimeout(resolve,1000));
        }
        if (!found) return reply(404, { error: 'registro_fora_do_varejo' });
        await new Promise(resolve => setTimeout(resolve,400));
        return reply(200, { data: await get('/contatos/' + q.id) });
      }
      return reply(200, { data: await get('/produtos/' + q.id) });
    } catch (error) { return reply(error.status || 502, { error: 'consulta_na_origem_nao_confirmada' }); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.varejo = varejo;
module.exports.config = { maxDuration: 120 };
