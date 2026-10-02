const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/crm/espelho');
async function run(query, responses, method='GET', authorization='Bearer teste') {
 const calls=[];const handler=createHandler({key:()=> 'teste',getToken:async()=> 'oauth-na-origem',request:async(url,options)=>{calls.push({url,method:options.method});return responses.shift();}});
 let body;const res={setHeader(){},end(value){body=JSON.parse(value);}};
 await handler({method,headers:{authorization},query},res);return {status:res.statusCode,body,calls};
}
const ok=data=>({ok:true,status:200,json:async()=>({data})});
test('situação vem da origem somente após confirmar pedido varejista',async()=>{
 const r=await run({resource:'order',id:'123'},[ok({id:123,loja:{id:0},situacao:{id:9}}),ok({id:9,nome:'Atendido'})]);
 assert.equal(r.body.data.situacao.nome,'Atendido');assert.equal(r.calls.length,2);assert.ok(r.calls.every(c=>c.method==='GET'));
});
test('pedido atacadista não libera consulta de situação',async()=>{
 const r=await run({resource:'order',id:'123'},[ok({id:123,loja:{id:206020434},situacao:{id:9}})]);
 assert.equal(r.status,404);assert.equal(r.calls.length,1);
});
test('falha de escopo de situação não elimina pedido confirmado',async()=>{
 const r=await run({resource:'order',id:'123'},[ok({id:123,loja:{id:0},situacao:{id:9}}),{ok:false,status:403}]);
 assert.equal(r.status,200);assert.equal(r.body.data.situacao.nome,undefined);
});
test('metadados de depósitos não expõem campos além de identificação',async()=>{
 const r=await run({resource:'deposits'},[ok([{id:1,descricao:'Geral',situacao:1,privado:'não retornar'}])]);
 assert.deepEqual(r.body.data,[{id:1,nome:'Geral',situacao:1}]);
});
test('preserva autenticação e bloqueia escrita e recurso arbitrário',async()=>{
 for (const [method,key,status] of [['POST','Bearer teste',405],['GET','Bearer errado',401]]) {
  const r=await run({resource:'deposits'},[],method,key);assert.equal(r.status,status);assert.equal(r.calls.length,0);
 }
 const r=await run({resource:'financeiro'},[]);assert.equal(r.status,400);assert.equal(r.calls.length,0);
});
test('alterações recentes preservam paginação e retornam só IDs dos registros fora de escopo',async()=>{
 const until=new Date().toISOString().slice(0,10)+' 00:00:00';
 const since=new Date(Date.now()-86400000).toISOString().slice(0,10)+' 00:00:00';
 const r=await run({resource:'orders_changes',since,until},[ok([{id:1,loja:{id:0}},{id:2,loja:{id:206020434},contato:{nome:'Não expor'}}])]);
 assert.equal(r.status,200);assert.equal(r.body.data.length,1);assert.deepEqual(r.body.out_of_scope_ids,['2']);assert.ok(!JSON.stringify(r.body).includes('Não expor'));
});
test('recusa janela de alterações arbitrária',async()=>{
 const r=await run({resource:'orders_changes',since:'2020-01-01 00:00:00',until:'2026-01-01 00:00:00'},[]);
 assert.equal(r.status,400);assert.equal(r.calls.length,0);
});
