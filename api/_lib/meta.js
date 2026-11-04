// Puxa o investimento em mídia (spend) do Meta Ads por período.
// Usa o token do app Miner Ads (META_ACCESS_TOKEN) e a conta PRLS-01 (META_AD_ACCOUNT_ID).
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID; // ex: act_1095851494225797
const GV = 'v25.0';

async function fetchSpend(inicio, fim) {
  if (!TOKEN || !ACCOUNT) throw new Error('meta_nao_configurado');
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since: inicio, until: fim }),
    fields: 'spend,impressions,clicks,cpc,cpm',
    level: 'account',
    access_token: TOKEN,
  });
  const url = `https://graph.facebook.com/${GV}/${ACCOUNT}/insights?${params.toString()}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    if (j.error && (j.error.code === 190 || j.error.type === 'OAuthException')) throw new Error('meta_token_invalido');
    throw new Error((j.error && j.error.message) || ('meta ' + r.status));
  }
  const row = (j.data && j.data[0]) || {};
  return {
    spend: Number(row.spend || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    cpc: Number(row.cpc || 0),
    cpm: Number(row.cpm || 0),
  };
}

// Insights por CAMPANHA no período: revela onde o investimento vai e quais campanhas retornam.
async function fetchCampanhas(inicio, fim) {
  if (!TOKEN || !ACCOUNT) throw new Error('meta_nao_configurado');
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since: inicio, until: fim }),
    fields: 'campaign_name,spend,impressions,clicks,cpc,ctr',
    level: 'campaign',
    limit: '80',
    access_token: TOKEN,
  });
  const url = `https://graph.facebook.com/${GV}/${ACCOUNT}/insights?${params.toString()}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    if (j.error && (j.error.code === 190 || j.error.type === 'OAuthException')) throw new Error('meta_token_invalido');
    throw new Error((j.error && j.error.message) || ('meta ' + r.status));
  }
  return (j.data || []).map((row) => ({
    campanha: row.campaign_name || '(sem nome)',
    spend: Number(row.spend || 0),
    impressoes: Number(row.impressions || 0),
    cliques: Number(row.clicks || 0),
    cpc: Number(row.cpc || 0),
    ctr: Number(row.ctr || 0),
  })).sort((a, b) => b.spend - a.spend);
}

module.exports = { fetchSpend, fetchCampanhas };
