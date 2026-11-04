// GET /api/auth/logout -> encerra a sessão.
module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', 'prls_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
};
