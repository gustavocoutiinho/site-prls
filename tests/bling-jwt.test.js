const {test}=require('node:test');
const assert=require('node:assert/strict');
test('renova token opaco uma vez, persiste JWT na fonte existente e o reutiliza',async()=>{
  process.env.SUPABASE_URL='https://banco.test';process.env.SUPABASE_SERVICE_KEY='teste';
  process.env.BLING_CLIENT_ID='teste';process.env.BLING_CLIENT_SECRET='teste';
  let auth={access_token:'opaco-antigo',refresh_token:'renovacao-teste',expires_at:'2099-01-01'};
  let renovacoes=0;
  const anterior=global.fetch;
  global.fetch=async(url,opts={})=>{
    if(String(url).includes('/oauth/token')){
      renovacoes++;assert.equal(opts.headers['enable-jwt'],'1');
      return new Response(JSON.stringify({access_token:'cabecalho.corpo.assinatura',refresh_token:'novo-teste',expires_in:21600}));
    }
    if(opts.method==='PATCH') auth={...auth,...JSON.parse(opts.body)};
    return new Response(JSON.stringify([auth]));
  };
  try {
    const {getValidToken}=require('../api/_lib/bling');
    assert.equal(await getValidToken(),'cabecalho.corpo.assinatura');
    assert.equal(await getValidToken(),'cabecalho.corpo.assinatura');
    assert.equal(renovacoes,1);assert.equal(auth.refresh_token,'novo-teste');
  }finally{global.fetch=anterior;}
});
