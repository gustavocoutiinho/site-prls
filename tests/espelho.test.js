const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarPonte } = require('../api/_lib/espelho');
const segredo = 'x'.repeat(48);
async function executar(query, deps = {}, method = 'GET', authorization = 'Bearer ' + segredo) {
  const chamadas = [];
  const handler = criarPonte({ segredo: () => segredo, bling: async p => { chamadas.push(p); return []; }, suri: async p => { chamadas.push(p); return []; }, ...deps });
  const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(body) { this.body=JSON.parse(body); } };
  await handler({method,headers:{authorization},query},res);
  return { ...res, chamadas };
}
test('recusa credencial ausente, malformada e métodos de escrita sem consultar origens', async () => {
  for (const auth of ['', 'Bearer errado', 'Bearer ' + 'é'.repeat(48)]) {
    const r=await executar({}, {}, 'GET', auth);assert.equal(r.statusCode,401);assert.deepEqual(r.chamadas,[]);
  }
  for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await executar({}, {}, method)).statusCode,405);
});
test('recusa recursos arbitrários e identificadores que tentam alterar a URL', async () => {
  assert.equal((await executar({fonte:'bling',recurso:'https://exemplo.invalid'})).statusCode,400);
  assert.equal((await executar({fonte:'bling',recurso:'pedido',id:'1?loja=2'})).statusCode,400);
});
test('pedidos ficam restritos à loja atacado e não entram em cache compartilhado', async () => {
  const r=await executar({fonte:'bling',recurso:'pedidos'});
  assert.match(r.chamadas[0],/idLoja=206020434/);assert.equal(r.headers['Cache-Control'],'private, no-store');
  assert.equal((await executar({fonte:'bling',recurso:'pedido',id:'1'},{bling:async()=>({id:1,loja:{id:99}})})).statusCode,404);
});
test('cliente exige pedido de atacado, impedindo consultar contato arbitrário', async () => {
  let n=0;
  const r=await executar({fonte:'bling',recurso:'cliente',pedido:'1'},{bling:async()=>{n++;return {id:1,loja:{id:99},contato:{id:2}};}});
  assert.equal(r.statusCode,404);assert.equal(n,1);
});
test('filtra canais Suri e preserva indicação de base incompleta', async () => {
  const r=await executar({fonte:'suri',recurso:'contatos'},{suri:async()=>({success:true,data:{items:[{id:'wp685312314657220:5511999999999',channelId:'wp685312314657220',name:'Atacado'},{id:'varejo:1',channelId:'varejo',name:'Varejo'}],continuationToken:'mais'}})});
  assert.equal(r.body.dados.length,1);assert.equal(r.body.continuacao,'mais');assert.equal(r.body.cobertura.length,64);
  assert.equal((await executar({fonte:'suri',recurso:'mensagens',id:'varejo:1'})).statusCode,400);
});
test('histórico aceita array puro e envelope real e nunca declara completude', async () => {
  for (const payload of [[{id:'1'}],{success:true,data:[{id:'1'}]}]) {
    const r=await executar({fonte:'suri',recurso:'mensagens',id:'wp685312314657220:5511999999999'},{suri:async()=>payload});
    assert.equal(r.statusCode,200);assert.equal(r.body.cobertura,'ate_5000_sem_comprovacao_de_totalidade');assert.equal(r.body.dados.length,1);
  }
});
test('não devolve corpos de erro potencialmente confidenciais', async () => {
  const r=await executar({fonte:'bling',recurso:'pedidos'},{bling:async()=>{throw Object.assign(new Error('token=segredo'),{status:401});}});
  assert.equal(r.statusCode,401);assert.ok(!JSON.stringify(r.body).includes('segredo'));
});

test('catálogo em lote só aceita cadastros e saldos dos produtos vinculados à loja', async () => {
  const respostas = {
    '/produtos/lojas?idLoja=206020434&pagina=1&limite=100': [{id: 1, loja:{id:206020434}, produto:{id:77}}],
    '/produtos?criterio=5&tipo=T&limite=100&idsProdutos[]=77': [{id:77,nome:'Produto'}],
    '/estoques/saldos?idsProdutos[]=77': [{produto:{id:77},saldoFisicoTotal:2}],
  };
  const ponte = criarPonte({bling:async p=>respostas[p], suri:async()=>{}, segredo:()=> 's'.repeat(40)});
  const req = {method:'GET',headers:{authorization:'Bearer '+ 's'.repeat(40)},query:{fonte:'bling',recurso:'produtos'}};
  const res = {setHeader(){}, end(v){this.body=JSON.parse(v)}};
  await ponte(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.dados[0].cadastro.id,77);
  assert.equal(res.body.dados[0].estoque[0].saldoFisicoTotal,2);
  respostas['/estoques/saldos?idsProdutos[]=77']=[{produto:{id:88}}];
  await ponte(req,res);
  assert.equal(res.statusCode,502);
});

test('recebíveis exigem origem no pedido e cliente correto, mantendo paginação da lista bruta', async () => {
 const pedido={id:1,loja:{id:'206020434'},contato:{id:2},data:'2026-01-01'};
 const lista=Array.from({length:100},(_,i)=>({id:i+1,origem:{id:3,tipoOrigem:'venda'},contato:{id:2}}));
 const deps={bling:async path=>path.startsWith('/pedidos/')?pedido:lista};
 let r=await executar({fonte:'bling',recurso:'recebiveis',pedido:'1'},deps);
 assert.equal(r.statusCode,200);assert.equal(r.body.dados.length,0);assert.equal(r.body.continuacao,'2');assert.equal(r.body.assinatura.length,64);
 lista[0].origem.id=1;
 r=await executar({fonte:'bling',recurso:'recebiveis',pedido:'1'},deps);assert.equal(r.body.dados.length,1);assert.equal(r.body.dados[0].pedido_atacado_id,'1');
 lista[0].contato.id=4;
 r=await executar({fonte:'bling',recurso:'recebiveis',pedido:'1'},deps);assert.equal(r.body.dados.length,0);
 pedido.loja.id='varejo';
 r=await executar({fonte:'bling',recurso:'recebiveis',pedido:'1'},deps);assert.equal(r.statusCode,404);
});

test('eventos restringem canal, cursor e campos pessoais ao contrato', async () => {
  const linha = {id:'10',payload:{id:'evento1',type:'new-contact',payload:{user:{Id:'wp685312314657220:5511999999999',ChannelId:'wp685312314657220',Variables:{segredo:'não expor'}}}}};
  const deps = {eventos:async()=>[linha]};
  let r=await executar({fonte:'suri',recurso:'eventos',apos:'0'},deps);
  assert.equal(r.statusCode,200);assert.equal(r.body.dados.length,1);
  assert.equal(r.body.dados[0].evento.payload.user.Variables,undefined);
  r=await executar({fonte:'suri',recurso:'eventos',apos:'10'},deps);assert.equal(r.statusCode,502);
  r=await executar({fonte:'suri',recurso:'eventos',apos:'0&limit=100'},deps);assert.equal(r.statusCode,400);
  linha.payload.payload.user.ChannelId='varejo';
  r=await executar({fonte:'suri',recurso:'eventos'},deps);assert.equal(r.statusCode,502);
});

test('histórico amplia a consulta e reduz o lote quando excede o tamanho seguro', async () => {
 const caminhos=[];
 const r=await executar({fonte:'suri',recurso:'mensagens',id:'wp685312314657220:5511999999999'},{suri:async p=>{caminhos.push(p);return p.endsWith('limit=5000')?[{id:'grande',text:'x'.repeat(4000001)}]:[{id:'menor'}];}});
 assert.equal(r.statusCode,200);
 assert.equal(caminhos.length,2);
 assert.ok(caminhos[0].endsWith('limit=5000'));assert.ok(caminhos[1].endsWith('limit=1000'));
 assert.equal(r.body.cobertura,'ate_1000_sem_comprovacao_de_totalidade');
 assert.equal(r.body.dados[0].id,'menor');
});
test('listagem usa rota atual e encaminha continuação sem alterar o token', async () => {
  const token = 'continuacao-real';
  let chamada;
  const handler = criarPonte({segredo:()=>segredo,suri:async (...args)=>{chamada=args;return {data:{items:[],continuationToken:null}};}});
  const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
  await handler({method:'GET',headers:{authorization:'Bearer '+segredo,'x-suri-continuation':token},query:{fonte:'suri',recurso:'contatos'}},res);
  assert.deepEqual(chamada,['/contacts/list',token]);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.continuacao,null);
});
