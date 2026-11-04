// GET /api/auth/me -> estado da sessão (usado pelo gate da tela).
const { sessionFromReq } = require('../_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const s = sessionFromReq(req);
  res.statusCode = 200;
  res.end(JSON.stringify({ authenticated: !!s, email: s ? s.email : null }));
};
