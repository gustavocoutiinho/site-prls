// POST /api/auth/request { email } -> envia magic link se o domínio for autorizado.
const { emailAllowed, makeMagic, sendMagicEmail } = require('../_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'método' })); return; }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const email = ((body && body.email) || '').trim().toLowerCase();
    if (!emailAllowed(email)) {
      // não revela se o e-mail é ou não autorizado
      res.statusCode = 200; res.end(JSON.stringify({ ok: true }));
      return;
    }
    const token = makeMagic(email);
    // Base fixa: não confiar no host header (forjável -> apontaria o magic link pro domínio do atacante).
    const base = process.env.APP_URL || 'https://prls.vercel.app';
    const link = base + '/api/auth/verify?token=' + encodeURIComponent(token);
    await sendMagicEmail(email, link);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
