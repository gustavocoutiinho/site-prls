// GET /api/auth/verify?token=... -> valida o magic link, cria sessão e redireciona.
const { verify, makeSession, sessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  try {
    const token = (req.query && req.query.token) || '';
    const p = verify(token);
    if (!p || p.t !== 'm') {
      res.statusCode = 302; res.setHeader('Location', '/?auth=invalid'); res.end();
      return;
    }
    const session = makeSession(p.email);
    const days = Number(process.env.AUTH_SESSION_DAYS || 8);
    res.setHeader('Set-Cookie', sessionCookie(session, days * 86400));
    res.statusCode = 302;
    res.setHeader('Location', '/?auth=ok');
    res.end();
  } catch (e) {
    res.statusCode = 302; res.setHeader('Location', '/?auth=error'); res.end();
  }
};
