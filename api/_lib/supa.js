// Acesso ao Supabase (minercrm) via REST, só com service key (server-side).
// Tabela: public.prls_portal_bling_auth (singleton id=1) — token OAuth do Bling.
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE = 'prls_portal_bling_auth';

function headers(extra) {
  return Object.assign({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, extra || {});
}

async function getAuth() {
  const r = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?id=eq.1&select=*`, { headers: headers() });
  if (!r.ok) throw new Error('supa get ' + r.status + ': ' + (await r.text()));
  const rows = await r.json();
  return rows[0] || null;
}

async function saveAuth(data) {
  const body = Object.assign({}, data, { updated_at: new Date().toISOString() });
  const r = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?id=eq.1`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('supa save ' + r.status + ': ' + (await r.text()));
  return (await r.json())[0];
}

// DRE inputs manuais
async function getDre(periodo) {
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_dre_entries?periodo=eq.${encodeURIComponent(periodo)}&select=campo,valor`, { headers: headers() });
  if (!r.ok) throw new Error('supa dre get ' + r.status);
  return await r.json();
}

async function upsertDre(periodo, campo, valor, updatedBy) {
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_dre_entries`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ periodo, campo, valor, updated_by: updatedBy || null, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('supa dre upsert ' + r.status + ': ' + (await r.text()));
  return (await r.json())[0];
}

async function upsertDreMany(periodo, valores, updatedBy) {
  const rows = Object.keys(valores || {}).map((campo) => ({
    periodo, campo, valor: Number(valores[campo]) || 0,
    updated_by: updatedBy || null, updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return true;
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_dre_entries`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error('supa dre upsert ' + r.status + ': ' + (await r.text()));
  return true;
}

// Cache de pares por período (evita recalcular item a item no Bling toda vez).
async function getParesCache(periodo) {
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_pares_cache?periodo=eq.${encodeURIComponent(periodo)}&select=*`, { headers: headers() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function saveParesCache(periodo, pares, pedidos) {
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_pares_cache`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ periodo, pares, pedidos, calculado_em: new Date().toISOString() }),
  });
  return r.ok;
}

// Cache genérico chave/valor (jsonb) — usado pela série mensal.
async function getKv(chave) {
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_kv_cache?chave=eq.${encodeURIComponent(chave)}&select=*`, { headers: headers() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function setKv(chave, valor) {
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_kv_cache`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ chave, valor, calculado_em: new Date().toISOString() }),
  });
  return r.ok;
}

// Lê várias chaves de uma vez → { chave: row } (evita N leituras na série mensal).
async function getKvMany(chaves) {
  if (!chaves || !chaves.length) return {};
  const inList = chaves.map((c) => '"' + encodeURIComponent(c) + '"').join(',');
  const r = await fetch(`${SUPA_URL}/rest/v1/prls_portal_kv_cache?chave=in.(${inList})&select=*`, { headers: headers() });
  if (!r.ok) return {};
  const rows = await r.json();
  const map = {};
  rows.forEach((row) => { map[row.chave] = row; });
  return map;
}

module.exports = { getAuth, saveAuth, getDre, upsertDre, upsertDreMany, getParesCache, saveParesCache, getKv, setKv, getKvMany };
