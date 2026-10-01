// Ponte exclusiva de leitura da PRLS Atacado. Não aceita URLs ou métodos do consumidor.
const { timingSafeEqual } = require('node:crypto');
const LOJA = '206020434';
const CANAL = 'wp685312314657220';
const keys = (o, campos) => Object.fromEntries(campos.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const falha = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const numero = value => { if (!/^\d{1,20}$/.test(String(value || ''))) throw falha(400, 'Identificador inválido.'); return String(value); };
const pedidoValido = p => { if (!p || String(p.loja?.id) !== LOJA) throw falha(404, 'Pedido fora do atacado.'); return p; };
const contatoValido = id => { if (!new RegExp('^' + CANAL + ':\\d{8,16}$').test(String(id || ''))) throw falha(400, 'Contato fora do atacado.'); return id; };

function criarPonte({ bling, suri, segredo }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const responder = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    const esperado = segredo();
    const recebido = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!esperado || esperado.length < 32 || Buffer.byteLength(recebido) !== Buffer.byteLength(esperado) || !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) return responder(401, { erro: 'Acesso não autorizado.' });
    if (req.method !== 'GET') return responder(405, { erro: 'Somente leitura.' });
    try {
      const q = req.query || {};
      const pagina = q.pagina === undefined ? '1' : numero(q.pagina);
      if (Number(pagina) > 10000) throw falha(400, 'Página inválida.');
      let dados, continuacao = null, cobertura = 'pagina';
      if (q.fonte === 'bling') {
        if (q.recurso === 'pedidos') {
          dados = await bling(`/pedidos/vendas?idLoja=${LOJA}&pagina=${pagina}&limite=100`);
          if (!Array.isArray(dados)) throw falha(502, 'Formato de pedidos inválido.');
          dados.forEach(pedidoValido);
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
        } else if (q.recurso === 'pedido') {
          dados = pedidoValido(await bling('/pedidos/vendas/' + numero(q.id)));
        } else if (q.recurso === 'cliente' || q.recurso === 'nota') {
          const p = pedidoValido(await bling('/pedidos/vendas/' + numero(q.pedido)));
          const id = q.recurso === 'cliente' ? p.contato?.id : p.notaFiscal?.id;
          dados = id ? await bling((q.recurso === 'cliente' ? '/contatos/' : '/nfe/') + numero(id)) : null;
        } else if (q.recurso === 'produtos') {
          dados = await bling(`/produtos/lojas?idLoja=${LOJA}&pagina=${pagina}&limite=100`);
          if (!Array.isArray(dados) || dados.some(p => String(p.loja?.id) !== LOJA)) throw falha(502, 'Catálogo sem identificação da loja.');
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
        } else if (q.recurso === 'depositos') {
          dados = await bling(`/depositos?pagina=${pagina}&limite=100`);
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
        } else if (q.recurso === 'situacoes') {
          dados = await bling('/situacoes/modulos');
        } else if (q.recurso === 'pagamentos') {
          dados = await bling(`/formas-pagamentos?pagina=${pagina}&limite=100`);
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
        } else throw falha(400, 'Recurso não permitido.');
      } else if (q.fonte === 'suri') {
        if (q.recurso === 'contatos') {
          const resultado = await suri('/contacts?limit=1000', req.headers['x-suri-continuation']);
          const base = resultado.data || resultado;
          if (!Array.isArray(base.items)) throw falha(502, 'Formato de contatos inválido.');
          dados = base.items.filter(c => c.channelId === CANAL && String(c.id).startsWith(CANAL + ':')).map(c => keys(c, ['id','name','phone','email','channelId','defaultDepartmentId','dateCreate','lastActivity','lastMessageActivity','tags','userTags','agent','session','note']));
          continuacao = base.continuationToken || null;
          // A base sem filtro é usada só para detectar que a API ignorou a continuação.
          const ids = base.items.map(c => String(c.id)).sort();
          cobertura = require('node:crypto').createHash('sha256').update(JSON.stringify(ids)).digest('hex');
        } else if (q.recurso === 'contato') {
          const r = await suri('/contacts/' + encodeURIComponent(contatoValido(q.id)));
          const c = r.data || r;
          if (c.channelId !== CANAL || c.id !== q.id) throw falha(502, 'Contato divergente.');
          dados = keys(c, ['id','name','phone','email','channelId','defaultDepartmentId','dateCreate','lastActivity','lastMessageActivity','tags','userTags','agent','session','note']);
        } else if (q.recurso === 'mensagens') {
          const r = await suri('/contacts/' + encodeURIComponent(contatoValido(q.id)) + '/messages?limit=100');
          dados = Array.isArray(r) ? r : r.data;
          if (!Array.isArray(dados)) throw falha(502, 'Formato de mensagens inválido.');
          cobertura = 'ultimas_100';
        } else if (q.recurso === 'canais') {
          const r = await suri('/channels');
          dados = (Array.isArray(r) ? r : r.data).filter(c => c.id === CANAL);
        } else if (q.recurso === 'departamentos') {
          const r = await suri('/departments');
          dados = (Array.isArray(r) ? r : r.data).filter(d => d.id === 'cb55605860');
        } else throw falha(400, 'Recurso não permitido.');
      } else throw falha(400, 'Fonte não permitida.');
      responder(200, { fonte: q.fonte, recurso: q.recurso, dados, continuacao, cobertura, consultado_em: new Date().toISOString(), loja: LOJA, canal: CANAL });
    } catch (e) {
      // Nunca devolver corpo da API externa: pode conter tokens, URLs ou dados de outro canal.
      responder([400,401,403,404,429].includes(e.status) ? e.status : 502, { erro: 'Consulta indisponível.', codigo: e.status || 502 });
    }
  };
}
module.exports = { criarPonte };
