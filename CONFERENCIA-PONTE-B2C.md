# Ponte B2C PRLS

Base recuperada da publicação dpl_5cR3t7Pwh2jYN4zTDWAZ3VddZFKz. Os 63 arquivos de origem foram conferidos por SHA-1 com o manifesto da Vercel. O GitHub estava anterior à publicação; a recuperação preserva o portal atual.

Mudança funcional limitada a api/crm/espelho.js: nome da situação consultado na origem após confirmar pedido de varejo; leitura autenticada de identificadores/nomes de depósitos e listas de preço para diagnóstico. Nenhum depósito ou tabela é selecionado automaticamente. A ponte permanece GET, sem escrita, emissão fiscal ou operação financeira. OAuth e demais integrações preservados.

17 testes Node aprovados, incluindo autenticação, recusa de escrita, isolamento de pedido atacadista e comportamento quando falta escopo de situação. Referência: OpenAPI oficial Bling consultado em 02/10/2026.
