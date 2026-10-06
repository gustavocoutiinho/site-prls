const {test}=require('node:test');const assert=require('node:assert/strict');
const {filtroAtendimentos,normalizarAtendimentos}=require('../api/_lib/suri-atendimentos');
const registro={user:{id:'wp685312314657220:5511999999999',channelId:'wp685312314657220',identificationDocument:'privado',variables:{segredo:'não exportar'}},protocol:'123',startDate:'2026-10-01T10:00:00Z',endDate:'2026-10-01T11:00:00Z',attendantId:'a'};
test('filtro fixa canal e permite somente períodos válidos de até 31 dias',()=>{
 assert.equal(filtroAtendimentos('2026-10-01','2026-10-31').channelId,registro.user.channelId);
 for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2026-01-01','2026-03-01'],['ontem','hoje']])assert.throws(()=>filtroAtendimentos(a,b));
});
test('identidade estável distingue transferências e minimiza dados pessoais',()=>{
 const [a]=normalizarAtendimentos({data:[registro]});const [b]=normalizarAtendimentos([registro]);
 assert.equal(a.id,b.id);assert.equal(a.contato_id,registro.user.id);assert.equal(a.user,undefined);
 assert.notEqual(a.id,normalizarAtendimentos([{...registro,attendantId:'b'}])[0].id);
});
test('recusa outro canal e atendimento sem identidade',()=>{
 for(const r of [{...registro,user:{...registro.user,channelId:'varejo'}},{...registro,protocol:null}])assert.throws(()=>normalizarAtendimentos([r]));
});
