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
    assert.equal(r.statusCode,200);assert.equal(r.body.cobertura,'ultimas_100');assert.equal(r.body.dados.length,1);
  }
});
test('não devolve corpos de erro potencialmente confidenciais', async () => {
  const r=await executar({fonte:'bling',recurso:'pedidos'},{bling:async()=>{throw Object.assign(new Error('token=segredo'),{status:401});}});
  assert.equal(r.statusCode,401);assert.ok(!JSON.stringify(r.body).includes('segredo'));
});
