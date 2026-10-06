# Consulta paginada Suri, 06/10/2026

A rota GET /contacts estava marcada como obsoleta na documentação oficial e repetia páginas ao receber continuação pelo header. A rota POST /contacts/list é uma consulta de leitura documentada, com filtro de canal e token no corpo. Foi comprovado avanço por 20 páginas de 100 contatos, sem repetição nem saída do canal de atacado. Isso substitui o diagnóstico anterior de impossibilidade de paginação pela API.

A ponte mantém autenticação, filtro e minimização de campos. A ordem é dateCreated asc, limite constante de 100. Um POST usado internamente para consultar não libera métodos de escrita na ponte pública. Não cria contatos, oportunidades, pedidos nem envia mensagens. Testes cobrem o transporte, token longo e escopo por canal.

A confirmação de fim da listagem refere-se aos contatos disponibilizados pela API naquele momento. Não prova completude de mensagens ou atendimentos antigos.

Fonte: https://documenter.getpostman.com/view/17684221/UUxz9mt5#36567385-3347-4752-8e85-ad870a1d9624
