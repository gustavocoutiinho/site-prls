// Consulta documentada de contatos. POST de leitura, sem criar ou alterar contatos.
function opcoesListagem(continuacao) {
  if (continuacao != null && (typeof continuacao !== 'string' || continuacao.length > 60000)) {
    throw new Error('Continuação inválida');
  }
  const body = { limit: 100, channelId: 'wp685312314657220', orderBy: 'dateCreated', orderType: 'asc' };
  if (continuacao) body.continuationToken = continuacao;
  return { method: 'POST', body: JSON.stringify(body) };
}
module.exports = { opcoesListagem };
