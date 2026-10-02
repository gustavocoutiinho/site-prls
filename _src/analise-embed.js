/* Inteligência financeira PRLS — trimestre Set-Nov 2025.
   Números vindos do arquivo do Gustavo (PRLS_Analise_Financeira_Set-Nov25.xlsx); redação polida em pt-BR. */
window.ANALISE = {
  periodo: 'Setembro a Novembro de 2025',
  resumo: [
    {i:'Faturamento bruto', set:218263, out:203322, nov:234552, tri:656137, leitura:'Cresceu 15% em novembro, mas ainda abaixo da média do portfólio.'},
    {i:'Receita líquida', set:135633, out:131024, nov:152937, tri:419594, leitura:'Representa em média 64% do faturamento bruto.'},
    {i:'Lucro bruto', set:64615, out:68628, nov:74608, tri:207851, leitura:'Margem bruta subiu para 32%, saudável.'},
    {i:'EBITDA', set:39510, out:40218, nov:37240, tri:116968, leitura:'Caiu 7% em novembro mesmo com o faturamento subindo. Alerta.'},
    {i:'Lucro líquido', set:39341, out:39921, nov:36938, tri:116200, leitura:'Média de R$ 38,7 mil por mês.'},
    {i:'Margem líquida', set:0.18, out:0.196, nov:0.157, tri:0.18, pct:true, leitura:'Caindo (18% → 19,6% → 15,7%). Tendência ruim.'},
    {i:'Caixa operacional', set:44309, out:-23479, nov:-17328, tri:3503, leitura:'Queimou caixa em outubro e novembro.'},
    {i:'Saldo em caixa (fim)', set:52202, out:22826, nov:3349, tri:3349, leitura:'Caiu de R$ 52 mil para R$ 3,3 mil em dois meses.'}
  ],
  paradoxo: {
    titulo: 'O paradoxo da PRLS hoje',
    texto: 'A empresa deu R$ 116 mil de lucro no trimestre no papel, mas queimou R$ 14,5 mil de caixa no mesmo período. O saldo em conta caiu de R$ 52 mil para R$ 3,3 mil em dois meses. A razão não está no resultado operacional, está no capital de giro: a empresa comprou R$ 267 mil em produto e vendeu apenas R$ 160 mil em custo, sobrando R$ 107 mil parados em estoque. Somam-se R$ 18 mil de distribuição de lucro e R$ 12 mil de caução em outubro. A PRLS está lucrativa, mas não está gerando caixa livre.'
  },
  dfc: {
    entradas: [
      {n:'Recebimento via Pix', set:59401, out:52588, nov:48116, tri:160105},
      {n:'Recebimento de cartão', set:78365, out:71327, nov:72796, tri:222488},
      {n:'Recebimento do site', set:14000, out:27400, nov:12500, tri:53900}
    ],
    saidas: [
      {n:'Compra de produto (matéria-prima)', set:-61290, out:-109548, nov:-96912, tri:-267750, nota:'Acima do CMV. Virou estoque.'},
      {n:'Despesas variáveis', set:-17709, out:-17959, nov:-15471, tri:-51139},
      {n:'Despesas administrativas', set:-6966, out:-16703, nov:-4848, tri:-28517, nota:'Caução de R$ 12 mil em outubro.'},
      {n:'Despesas com pessoal', set:-9847, out:-7531, nov:-10275, tri:-27653},
      {n:'Marketing', set:-6658, out:-10980, nov:-16080, tri:-33718, nota:'Em expansão acelerada.'},
      {n:'Serviços de terceiros', set:-2500, out:-3360, nov:-3080, tri:-8940},
      {n:'Impostos e devoluções', set:-2180, out:-8416, nov:-3773, tri:-14369}
    ],
    caixaOp: {set:44309, out:-23479, nov:-17328, tri:3503},
    distrib: {set:-10000, out:-5901, nov:-2150, tri:-18051},
    resultadoMes: {set:34311, out:-29375, nov:-19477, tri:-14541},
    saldoAcum: {set:52202, out:22826, nov:3349, tri:3349},
    reconciliacao: [
      {l:'Lucro líquido do trimestre (DRE)', v:116200, e:'Resultado econômico.'},
      {l:'(−) Compra acima do CMV', v:-107166, e:'Comprou mais produto do que vendeu. Virou estoque parado.'},
      {l:'(−) Caução de outubro (não recorrente)', v:-12000, e:'Saída pontual que não volta.'},
      {l:'(−) Distribuição de lucro', v:-18051, e:'Não afeta a DRE, mas drena o caixa.'},
      {l:'(+) Despesas da DRE não pagas em caixa', v:6120, e:'Contas a pagar que sobraram.'},
      {l:'(=) Geração de caixa aproximada', v:-14541, e:'Bate com a queima real do trimestre.', total:true}
    ]
  },
  canais: {
    linhas: [
      {c:'Atendimento (WhatsApp)', set:127575, out:149791, nov:137042, tri:414409, mix:0.63, leitura:'Motor real do negócio.'},
      {c:'Atacado', set:58887, out:31331, nov:51460, tri:141678, mix:0.22, leitura:'Segundo canal. Não é secundário.'},
      {c:'Site (Shopify)', set:29529, out:19539, nov:43597, tri:92665, mix:0.14, leitura:'Só 14% do total. Oportunidade grande.'},
      {c:'Pontos de venda', set:2272, out:2660, nov:2453, tri:7385, mix:0.01, leitura:'Residual. Avaliar se vale manter.'}
    ],
    leitura: 'O briefing descreve a PRLS como 100% online. Os números mostram outra realidade: só 14% do faturamento vem do site, 63% vem do WhatsApp e 22% do atacado. A PRLS não é um e-commerce puro, é uma operação de atendimento digital forte (Instagram + WhatsApp) sustentada por um atacado já relevante. Para crescer o site, a curva mais rápida não é aquisição nova: é migrar parte das conversas do WhatsApp para checkout direto. O atacado precisa virar linha própria, com CAC, margem e meta separados.'
  },
  alertas: [
    {p:'P0', t:'Estoque inchando por sobrecompra', dado:'Comprou R$ 267 mil em produto e vendeu R$ 160 mil em custo. R$ 107 mil viraram estoque parado no trimestre.', acao:'Parar compra nova até o estoque girar. Curva ABC dos SKUs e queimar baixo giro com campanha. Política de compra atrelada ao sell-through.', dono:'Gustavo + Leonardo'},
    {p:'P0', t:'Caixa em R$ 3,3 mil no fim de novembro', dado:'Saldo caiu de R$ 52 mil (fim set) para R$ 3,3 mil (fim nov). Queima de R$ 48 mil em 2 meses.', acao:'Suspender distribuição de lucro até recompor o caixa para pelo menos R$ 60 mil. Reservar sempre 2 meses de despesa fixa.', dono:'Gustavo'},
    {p:'P0', t:'Descontos comendo 25% da receita', dado:'R$ 55 mil por mês em descontos. Maior dedução da DRE depois dos impostos.', acao:'Auditoria de cupons e política de desconto. Travar teto por pedido. Separar desconto estratégico de generalizado.', dono:'Gustavo + Ana Laura'},
    {p:'P1', t:'Marketing acelerando sem retorno proporcional', dado:'Marketing de R$ 7 mil (set) para R$ 16 mil (nov), +128%. Faturamento subiu só de R$ 218 mil para R$ 234 mil.', acao:'Pausar campanhas novas, refinar as atuais. Amarrar investimento a um ROAS mínimo. Verificar se a conversão vem via WhatsApp e não está sendo medida.', dono:'Ana Laura + Miner'},
    {p:'P1', t:'Pessoal subiu 63% em 2 meses', dado:'Despesa com pessoal de R$ 7,4 mil para R$ 12,1 mil de setembro a novembro.', acao:'Revisar a nova contratação e a carga de folha. Cruzar com o plano de crescimento.', dono:'Gustavo + Julio'},
    {p:'P1', t:'Margem líquida caindo', dado:'18,0% (set), 19,6% (out), 15,7% (nov). Queda de 3,9 pontos em um mês.', acao:'Rodar a DRE por canal. Isolar onde a margem está perdendo.', dono:'Julio + Miner'},
    {p:'P2', t:'Site representa só 14% do faturamento', dado:'R$ 30,8 mil por mês em média. Muito abaixo do potencial da audiência no Instagram.', acao:'Migrar parte das conversas do WhatsApp para checkout no site. Ativar Google Shopping e régua de e-mail para recompra.', dono:'Miner'},
    {p:'P2', t:'ICMS pago só em out e nov', dado:'ICMS R$ 0 (set), R$ 6,5 mil (out), R$ 1,4 mil (nov).', acao:'Entender se houve atraso ou competência. Regularizar o cronograma para evitar surpresa tributária.', dono:'Julio + contabilidade'},
    {p:'P2', t:'Trocas e devoluções incoerentes com o Shopify', dado:'A DRE mostra 2,3% do faturamento em trocas. O Shopify mostra 42,7% dos pedidos reembolsados.', acao:'Reconciliar a metodologia. Entender se a DRE está subnotificada ou se o Shopify conta reembolso que depois vira troca.', dono:'Julio + Leonardo'}
  ],
  guia: [
    {t:'DRE vs DFC', d:'A DRE mostra se a empresa ganha dinheiro no papel. O DFC mostra se entra dinheiro no caixa. Muitas empresas dão lucro mas quebram por falta de caixa. Por isso se leem sempre juntos.'},
    {t:'Faturamento bruto', d:'Tudo que a empresa vendeu, sem descontar nada. É o tamanho aparente da operação, não o que fica.'},
    {t:'Impostos e deduções', d:'Tudo que sai antes de virar receita: imposto, trocas, descontos e taxas. Na PRLS, come 37% do faturamento. O vilão é o desconto, com 25%.'},
    {t:'Receita líquida', d:'O que a empresa de fato ganhou. É a base honesta para calcular margem.'},
    {t:'CMV', d:'Custo da mercadoria vendida: só o que saiu do estoque para o cliente. O que você comprou e não vendeu ainda não entra aqui, isso é estoque parado.'},
    {t:'Lucro bruto', d:'Receita líquida menos CMV. Mostra a margem do produto em si.'},
    {t:'Despesas operacionais', d:'Tudo que não é produto: aluguel, folha, marketing, consultoria. É a estrutura.'},
    {t:'EBITDA', d:'Lucro antes de juros, impostos sobre lucro, depreciação e amortização. A melhor medida operacional pura.'},
    {t:'Lucro líquido', d:'O que sobra de tudo, já com despesas financeiras e ajustes.'},
    {t:'Análise vertical (AV)', d:'Cada linha como percentual do faturamento. Ajuda a ver se um item come muito da receita.'},
    {t:'Análise horizontal (AH)', d:'Comparação do mês com o anterior. Ajuda a ver o que cresceu ou caiu fora do normal.'},
    {t:'Capital de giro', d:'Dinheiro para operar: estoque, contas a receber, contas a pagar. Na PRLS, o problema é o estoque inchando porque compra mais do que vende.'},
    {t:'Distribuição de lucro', d:'Dinheiro que o sócio retira. Não aparece na DRE, aparece no DFC. Não deve ser feita se a empresa está queimando caixa.'},
    {t:'Ponto de equilíbrio', d:'Faturamento mínimo para não dar prejuízo. Estava em R$ 117 mil em novembro; a empresa fatura R$ 234 mil, então está acima.'}
  ]
};
