// Análise inteligente dos dados do portal via OpenRouter. Protegido por sessão.
// POST /api/ia  { dados: {...}, pergunta?: "..." }
// - sem pergunta: faz a leitura do desempenho.
// - com pergunta: responde a pergunta sobre os números.
const { analisar } = require('./_lib/ia');
const { sessionFromReq } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!sessionFromReq(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'nao_autenticado' })); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const dados = (body && body.dados) || {};
    const pergunta = ((body && body.pergunta) || '').toString().slice(0, 500);
    const hoje = new Date().toISOString().slice(0, 10);

    const sistema = 'Você é o analista de dados da PRLS, uma loja de calçados que vende por WhatsApp (Suri), site e mídia paga (Meta Ads). TODO número de venda vem do ERP Bling, que já consolida os 4 canais (Pedido Manual, Loja Virtual, Atacado e TikTokShop) — o portal não lê a loja do site, então nunca some venda do site por fora. Fale em português brasileiro, direto e com bom senso de dono de negócio, sem jargão nem enrolação. Hoje é ' + hoje + '. Baseie-se SÓ nos números fornecidos; se faltar um dado importante, diga que falta em vez de inventar. Cite os números concretos. Use frases curtas e, quando fizer sentido, tópicos com "•".';

    const instrucao = pergunta
      ? ('Pergunta do gestor: ' + pergunta)
      : 'Faça uma leitura curta do desempenho: (1) o que foi bem, (2) o que preocupa, (3) a tendência, (4) 2 ou 3 recomendações de ação práticas. No máximo ~12 linhas.';

    const usuario = instrucao + '\n\nDados do portal (JSON):\n' + JSON.stringify(dados).slice(0, 8000);

    const resposta = await analisar(sistema, usuario, pergunta ? 700 : 900);
    res.statusCode = 200;
    res.end(JSON.stringify({ resposta }));
  } catch (e) {
    const status = /ia_nao_configurada/.test(e.message) ? 409 : 500;
    res.statusCode = status;
    res.end(JSON.stringify({ error: e.message, needsSetup: status === 409 }));
  }
};

module.exports.config = { maxDuration: 60 };
