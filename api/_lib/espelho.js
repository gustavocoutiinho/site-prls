// Ponte exclusiva de leitura da PRLS Atacado. Não aceita URLs ou métodos do consumidor.
const { timingSafeEqual } = require('node:crypto');
const LOJA = '206020434';
const CANAL = 'wp685312314657220';
const keys = (o, campos) => Object.fromEntries(campos.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const falha = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const numero = value => { if (!/^\d{1,20}$/.test(String(value || ''))) throw falha(400, 'Identificador inválido.'); return String(value); };
const pedidoValido = p => { if (!p || String(p.loja?.id) !== LOJA) throw falha(404, 'Pedido fora do atacado.'); return p; };
const contatoValido = id => { if (!new RegExp('^' + CANAL + ':\\d{8,16}$').test(String(id || ''))) throw falha(400, 'Contato fora do atacado.'); return id; };

function criarPonte({ bling, suri, eventos, segredo }) {
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
      let dados, continuacao = null, cobertura = 'pagina', assinatura = null;
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
        } else if (q.recurso === 'recebiveis') {
          const p = pedidoValido(await bling('/pedidos/vendas/' + numero(q.pedido)));
          const cliente = numero(p.contato?.id);
          const inicio = /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : '2000-01-01';
          const lista = await bling(`/contas/receber?idContato=${cliente}&tipoFiltroData=E&dataInicial=${inicio}&pagina=${pagina}&limite=100`);
          if (!Array.isArray(lista)) throw falha(502, 'Lista de recebíveis inválida.');
          assinatura = require('node:crypto').createHash('sha256').update(JSON.stringify(lista.map(c => String(c.id)).sort())).digest('hex');
          dados = lista.filter(c => c.origem?.tipoOrigem === 'venda' && String(c.origem.id) === String(p.id) && String(c.contato?.id) === cliente).map(c => ({...c, pedido_atacado_id:String(p.id), loja:{id:LOJA}}));
          continuacao = lista.length === 100 ? String(Number(pagina)+1) : null;
          cobertura = 'recebiveis_originados_no_pedido';
        } else if (q.recurso === 'produtos') {
          dados = await bling(`/produtos/lojas?idLoja=${LOJA}&pagina=${pagina}&limite=100`);
          if (!Array.isArray(dados) || dados.some(p => String(p.loja?.id) !== LOJA)) throw falha(502, 'Catálogo sem identificação da loja.');
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
          if (dados.length) {
            const ids = [...new Set(dados.map(v => numero(v.produto?.id)))];
            const filtro = ids.map(id => 'idsProdutos[]=' + id).join('&');
            const cadastros = await bling('/produtos?criterio=5&tipo=T&limite=100&' + filtro);
            const saldos = await bling('/estoques/saldos?' + filtro);
            if (!Array.isArray(cadastros) || !Array.isArray(saldos) || cadastros.some(c => !ids.includes(String(c.id))) || saldos.some(e => !ids.includes(String(e.produto?.id)))) throw falha(502, 'Catálogo divergente.');
            dados = dados.map(v => ({ ...v, cadastro: cadastros.find(c => String(c.id) === String(v.produto.id)) || null, estoque: saldos.filter(e => String(e.produto?.id) === String(v.produto.id)), cobertura_cadastro: 'resumo_em_lote' }));
            if (dados.some(v => !v.cadastro || !v.estoque.length)) cobertura = 'cadastro_ou_saldo_ausente';
          }
        } else if (q.recurso === 'depositos') {
          dados = await bling(`/depositos?pagina=${pagina}&limite=100`);
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
        } else if (q.recurso === 'produto') {
          const vinculo = await bling('/produtos/lojas/' + numero(q.id));
          if (String(vinculo?.loja?.id) !== LOJA) throw falha(404, 'Produto fora do atacado.');
          const id = numero(vinculo.produto?.id);
          const cadastro = await bling('/produtos/' + id);
          const estoque = await bling('/estoques/saldos?idsProdutos[]=' + id);
          if (String(cadastro?.id) !== id || !Array.isArray(estoque) || estoque.some(e => String(e.produto?.id) !== id)) throw falha(502, 'Produto divergente.');
          dados = { ...vinculo, cadastro, estoque };
        } else if (q.recurso === 'situacoes') {
          dados = await bling('/situacoes/modulos');
        } else if (q.recurso === 'pagamentos') {
          dados = await bling(`/formas-pagamentos?pagina=${pagina}&limite=100`);
          continuacao = dados.length === 100 ? String(Number(pagina) + 1) : null;
        } else throw falha(400, 'Recurso não permitido.');
      } else if (q.fonte === 'suri') {
        if (q.recurso === 'eventos') {
          const apos = q.apos === undefined ? '0' : numero(q.apos);
          const lista = await eventos(apos);
          if (!Array.isArray(lista)) throw falha(502, 'Lista de eventos inválida.');
          let ultimo = BigInt(apos);
          dados = lista.map(linha => {
            const id = numero(linha.id), e = linha.payload, p = e?.payload, u = p?.user;
            if (BigInt(id) <= ultimo || !['new-contact','change-queue','finish-attendance'].includes(e?.type) || u?.ChannelId !== CANAL) throw falha(502, 'Evento divergente.');
            contatoValido(u.Id);
            ultimo = BigInt(id);
            const payload = keys(p, ['departmentId','attendanceTime','attendant','tags','userTags']);
            payload.user = keys(u, ['Id','Name','Phone','Email','ChannelId','DefaultDepartmentId','DateCreate','LastActivity','LastMessageActivity','Tags','UserTags','Agent','Note']);
            if (e.type === 'finish-attendance') payload.messages = p.messages || [];
            return { id, evento: { id: e.id, type: e.type, timestamp: e.timestamp, payload } };
          });
          continuacao = lista.length === 25 ? String(ultimo) : null;
          cobertura = 'eventos_preservados_do_atacado';
        } else if (q.recurso === 'contatos') {
          const resultado = await suri('/contacts/list', req.headers['x-suri-continuation']);
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
          const id = encodeURIComponent(contatoValido(q.id));
          for (const limite of [5000, 1000, 100]) {
            const r = await suri('/contacts/' + id + '/messages?limit=' + limite);
            dados = Array.isArray(r) ? r : r.data;
            if (!Array.isArray(dados)) throw falha(502, 'Formato de mensagens inválido.');
            if (Buffer.byteLength(JSON.stringify(dados), 'utf8') <= 4000000) {
              cobertura = 'ate_' + limite + '_sem_comprovacao_de_totalidade';
              break;
            }
            if (limite === 100) throw falha(502, 'Histórico excede o tamanho seguro.');
          }
        } else if (q.recurso === 'canais') {
          const r = await suri('/channels');
          dados = (Array.isArray(r) ? r : r.data).filter(c => c.id === CANAL);
        } else if (q.recurso === 'departamentos') {
          const r = await suri('/departments');
          dados = (Array.isArray(r) ? r : r.data).filter(d => d.id === 'cb55605860');
        } else throw falha(400, 'Recurso não permitido.');
      } else throw falha(400, 'Fonte não permitida.');
      responder(200, { fonte: q.fonte, recurso: q.recurso, dados, continuacao, cobertura, assinatura, consultado_em: new Date().toISOString(), loja: LOJA, canal: CANAL });
    } catch (e) {
      // Nunca devolver corpo da API externa: pode conter tokens, URLs ou dados de outro canal.
      responder([400,401,403,404,429].includes(e.status) ? e.status : 502, { erro: 'Consulta indisponível.', codigo: e.status || 502 });
    }
  };
}
module.exports = { criarPonte };
