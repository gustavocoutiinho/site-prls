// Auth magic-link: token/sessão assinados (HMAC via crypto nativo) + envio de e-mail (nodemailer/SMTP).
const crypto = require('crypto');
const SECRET = process.env.AUTH_SECRET;
if (!SECRET) {
  // Fail-closed: sem segredo as sessões seriam forjáveis. Melhor o portal não subir do que aceitar login forjado.
  throw new Error('AUTH_SECRET ausente: configure a variável de ambiente no Vercel.');
}
const ALLOWED = (process.env.AUTH_ALLOWED_DOMAINS || 'prls.com.br,minerbz.com.br')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
// Convidados de fora dos domínios acima, e-mail por e-mail (AUTH_ALLOWED_EMAILS, separados por
// vírgula). Existe porque liberar um domínio público inteiro (gmail.com) abriria o portal pro mundo:
// aqui cada endereço é autorizado individualmente.
const ALLOWED_EMAILS = (process.env.AUTH_ALLOWED_EMAILS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString();
}
function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(body).digest());
  return body + '.' + sig;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(b64urlDecode(body));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}

function emailAllowed(email) {
  email = (email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  if (ALLOWED_EMAILS.includes(email)) return true;
  return ALLOWED.includes(email.split('@')[1]);
}
function makeMagic(email) { return sign({ t: 'm', email: email.toLowerCase(), exp: Date.now() + 15 * 60 * 1000 }); }
function makeSession(email) {
  const days = Number(process.env.AUTH_SESSION_DAYS || 8);
  return sign({ t: 's', email: email.toLowerCase(), exp: Date.now() + days * 86400000 });
}
function parseCookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) {
      const k = c.slice(0, i).trim(), v = c.slice(i + 1).trim();
      // cookie malformado (ex.: 'prls_session=%') faria decodeURIComponent lançar URIError e virar 500
      // em TODO endpoint protegido; caímos no valor cru em vez de derrubar.
      try { o[k] = decodeURIComponent(v); } catch (e) { o[k] = v; }
    }
  });
  return o;
}
function sessionFromReq(req) {
  const s = verify(parseCookies(req).prls_session);
  return (s && s.t === 's') ? s : null;
}
function sessionCookie(token, maxAgeSec) {
  return `prls_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

async function sendMagicEmail(email, link) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await t.sendMail({
    from: process.env.AUTH_EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Seu acesso ao PRLS OS',
    text: `Entre no portal PRLS OS: ${link}  (expira em 15 minutos)`,
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:460px;margin:0 auto;padding:8px">
      <div style="font-weight:800;font-size:18px;letter-spacing:-.01em;margin-bottom:6px">PRLS OS</div>
      <div style="color:#555;font-size:13px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:20px">Sistema Operacional</div>
      <p style="font-size:15px;color:#222">Clique no botão para entrar no portal:</p>
      <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#4562FF;color:#fff;padding:13px 26px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px">Entrar no portal</a></p>
      <p style="color:#999;font-size:12.5px;line-height:1.5">O link expira em 15 minutos e só funciona uma vez. Se você não pediu este acesso, ignore este e-mail.</p>
    </div>`,
  });
}

module.exports = { emailAllowed, makeMagic, makeSession, verify, sessionFromReq, sessionCookie, sendMagicEmail, ALLOWED, ALLOWED_EMAILS };
