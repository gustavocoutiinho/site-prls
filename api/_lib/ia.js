// Motor de IA do portal. Em vez de guardar a chave do OpenRouter aqui, chama a Edge Function
// prls-ia do minercrm (que já tem OPENROUTER_API_KEY nos secrets). Autentica com a service key
// que o portal já usa — sem nova credencial. Modelo: gemini-2.5-flash-lite (pago, não treina).
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

async function analisar(sistema, usuario, maxTokens) {
  if (!SUPA_URL || !SUPA_KEY) throw new Error('ia_nao_configurada');
  const r = await fetch(`${SUPA_URL}/functions/v1/prls-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sistema, usuario, maxTokens: maxTokens || 900 }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error('ia ' + r.status);
  if (j && j.error === 'sem_chave') throw new Error('ia_nao_configurada');
  if (j && j.error) throw new Error(j.error + (j.detail ? ' ' + j.detail : ''));
  return (j && j.resposta) || '';
}

module.exports = { analisar };
