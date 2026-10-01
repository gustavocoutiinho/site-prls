const { criarPonte } = require('./_lib/espelho');
const { getValidToken } = require('./_lib/bling');

async function ler(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok) throw Object.assign(new Error('Falha na origem'), { status: r.status });
  const body = await r.json();
  if (body.success === false) throw Object.assign(new Error('Falha na origem'), { status: 502 });
  return body;
}
module.exports = criarPonte({
  segredo: () => process.env.PRLS_ESPELHO_SECRET,
  bling: async path => (await ler('https://api.bling.com.br/Api/v3' + path, { Authorization: 'Bearer ' + await getValidToken(), Accept: 'application/json', 'enable-jwt': '1' })).data,
  suri: async (path, continuation) => {
    const base = process.env.PRLS_SURI_URL;
    if (!base || !base.startsWith('https://') || !process.env.PRLS_SURI_TOKEN) throw new Error('Suri não configurada');
    const headers = { Authorization: 'Bearer ' + process.env.PRLS_SURI_TOKEN, Accept: 'application/json' };
    if (continuation) headers['x-ms-continuation'] = String(continuation);
    return ler(base.replace(/\/$/, '') + path, headers);
  },
});
