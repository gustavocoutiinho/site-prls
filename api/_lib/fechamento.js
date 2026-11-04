// Fechamento oficial do mês: o número que o Gustavo registra quando o mês fecha (ex.: "faturamento
// líquido de agosto: R$ 173.973,48"). Quando existe, ele manda no total do mês em TODAS as telas
// (faturamento, overview, série); o valor calculado a partir dos pedidos do Bling segue junto como
// referência (faturamentoBling) e a diferença fica explícita, nunca escondida.
// Registro no KV: fechamento_YYYY-MM = { faturamento, fonte, registrado_em }.
const { getKv, getKvMany } = require('./supa');

// 'YYYY-MM' se o intervalo é exatamente um mês cheio (dia 1 ao último dia), senão null.
function mesCheio(inicio, fim) {
  if (!inicio || !fim || inicio.slice(0, 7) !== fim.slice(0, 7) || inicio.slice(8) !== '01') return null;
  const y = Number(inicio.slice(0, 4)), m = Number(inicio.slice(5, 7));
  const ultimo = new Date(y, m, 0).getDate();
  return Number(fim.slice(8)) === ultimo ? inicio.slice(0, 7) : null;
}

function valido(v) { return v && typeof v.faturamento === 'number' && v.faturamento > 0 ? v : null; }

async function getFechamento(ym) {
  if (!ym) return null;
  const row = await getKv('fechamento_' + ym).catch(() => null);
  return valido(row && row.valor);
}

async function getFechamentos(yms) {
  if (!yms || !yms.length) return {};
  const map = await getKvMany(yms.map((x) => 'fechamento_' + x)).catch(() => ({}));
  const out = {};
  yms.forEach((ym) => { const r = map['fechamento_' + ym]; const v = valido(r && r.valor); if (v) out[ym] = v; });
  return out;
}

// Devolve uma CÓPIA com o faturamento oficial no lugar do calculado. Nunca aplicar em objeto que
// vai pro cache: aplicado duas vezes, o "faturamentoBling" viraria o próprio valor oficial.
function aplica(obj, campo, fech) {
  if (!obj || !fech) return obj;
  const c = JSON.parse(JSON.stringify(obj));
  const bling = Number(c[campo] || 0);
  c.faturamentoBling = bling;
  c[campo] = fech.faturamento;
  c.fechamentoOficial = {
    valor: fech.faturamento,
    fonte: fech.fonte || 'fechamento oficial',
    registrado_em: fech.registrado_em || null,
    diferenca: Math.round((fech.faturamento - bling) * 100) / 100,
  };
  return c;
}

module.exports = { mesCheio, getFechamento, getFechamentos, aplica };
