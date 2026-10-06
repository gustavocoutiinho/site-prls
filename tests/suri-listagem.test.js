const { test } = require('node:test');
const assert = require('node:assert/strict');
const { opcoesListagem } = require('../api/_lib/suri-listagem');
test('consulta usa canal fixo, ordem estável e token no corpo', () => {
  const first = opcoesListagem();
  const token = 'x'.repeat(15000);
  const next = opcoesListagem(token);
  assert.equal(first.method, 'POST');
  assert.deepEqual(JSON.parse(first.body), {limit:100,channelId:'wp685312314657220',orderBy:'dateCreated',orderType:'asc'});
  assert.deepEqual(JSON.parse(next.body), {...JSON.parse(first.body),continuationToken:token});
});
test('recusa token inválido ou excessivo', () => {
  for (const token of [[],{},'x'.repeat(60001)]) assert.throws(()=>opcoesListagem(token));
});
