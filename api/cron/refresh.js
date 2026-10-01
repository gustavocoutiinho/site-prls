// Cron diário (Vercel Cron): mantém o token do Bling vivo (renova antes de expirar por desuso)
// e reatualiza a série mensal cacheada — assim o portal nunca precisa reconectar o Bling e os
// meses ficam sempre atualizados, mesmo que ninguém abra o portal por semanas.
// Protegido pelo header Authorization que o Vercel Cron injeta com o CRON_SECRET.
const { getValidToken, fetchSerieCached } = require('../_lib/bling');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  const auth = req.headers.authorization || '';
  // Fail-closed: sem CRON_SECRET, nega (senão vira endpoint público de DoS no Bling + refresh de token).
  if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) {
    res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autorizado' })); return;
  }
  const out = { ok: true };
  try {
    await getValidToken();            // renova/valida o token do Bling (mantém vivo)
    out.bling = 'ok';
  } catch (e) { out.bling = 'erro: ' + e.message; }
  try {
    const serie = await fetchSerieCached(18); // registra os meses fechados + reatualiza o mês corrente (cache por mês)
    out.serie = serie.length + ' meses';
  } catch (e) { out.serie = 'erro: ' + e.message; }
  res.statusCode = 200;
  res.end(JSON.stringify(out));
};

module.exports.config = { maxDuration: 120 };
