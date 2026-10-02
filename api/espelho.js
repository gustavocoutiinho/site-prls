const { criarPonte } = require('./_lib/espelho');
const { getValidToken, getJson } = require('./_lib/bling');

async function ler(url, headers) {
  const r = url.startsWith('https://api.bling.com.br/Api/v3/')
    ? await getJson(url, headers, 3)
    : await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok) throw Object.assign(new Error('Falha na origem'), { status: r.status });
  const body = await r.json();
  if (body.success === false) throw Object.assign(new Error('Falha na origem'), { status: 502 });
  return body;
}
module.exports = criarPonte({
  segredo: () => (process.env.PRLS_ESPELHO_SECRET || '').trim(),
  bling: async path => (await ler('https://api.bling.com.br/Api/v3' + path, { Authorization: 'Bearer ' + await getValidToken(), Accept: 'application/json', 'enable-jwt': '1' })).data,
  eventos: async apos => {
    const token = (process.env.PRLS_MINEROS_SERVICE_KEY || '').trim();
    if (!token) throw new Error('Fonte de eventos não configurada');
    const filtro = new URLSearchParams({ select: 'id,payload', evento: 'in.(new-contact,change-queue,finish-attendance)', 'payload->payload->user->>ChannelId': 'eq.wp685312314657220', id: 'gt.' + apos, order: 'id.asc', limit: '25' });
    return ler('https://frocxapiowyjrdhlirnu.supabase.co/rest/v1/prls_suri_webhook_logs?' + filtro, { apikey: token, Authorization: 'Bearer ' + token });
  },
  suri: async (path, continuation) => {
    const base = (process.env.PRLS_SURI_URL || '').trim();
    if (!base || !base.startsWith('https://') || !process.env.PRLS_SURI_TOKEN) throw new Error('Suri não configurada');
    const headers = { Authorization: 'Bearer ' + process.env.PRLS_SURI_TOKEN.trim(), Accept: 'application/json' };
    if (continuation) headers['x-ms-continuation'] = String(continuation);
    return ler(base.replace(/\/$/, '') + path, headers);
  },
});
