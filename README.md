# PRLS OS — Portal (SaaS)

Portal operacional da PRLS no ar em **https://prls.vercel.app** (projeto Vercel `prls-os-site`).

Redesenhado em jul/2026: de documento single-page (mono b&w) para **app navegável** (sidebar + páginas) com o **KV Miner** (preto `#0A0A0B`, Hudson `#4562FF`, VisbyCF + Behind The Nineties), tema dark/claro com toggle.

## Estrutura

- `index.html` — o app compilado (autocontido, fontes KV embutidas em base64). **Não editar à mão** (megabytes de base64). É gerado pelo compilador.
- `_src/prls-os.template.html` — o template editável (com marcador `/*FONTFACES*/`). **Edite aqui.**
- `_src/fonts/` — fontes reais do KV (VisbyCF Light/Regular/Medium/DemiBold/ExtraBold + Behind The Nineties Bd).
- `_src/compile.py` — injeta as fontes e gera `index.html`.
- `marca.html`, `clientes.html`, `calendario.html`, `rotina-vendas.html`, `automacao.html`, `financeiro.html` — páginas antigas (estilo documento mono) **preservadas**. Ainda não incorporadas ao novo app. Acessíveis por `/marca`, `/clientes`, etc. (cleanUrls).
- `vercel.json` — `cleanUrls: true`.

## Editar e deployar

```bash
cd _src && python3 compile.py     # edita template -> gera ../index.html
cd .. && vercel deploy --prod --yes
```

## Navegação do app

12 telas em 5 categorias na sidebar. Cada tela é **Processo** (fluxograma/diagrama) ou **Painel** (dados). Hash routing (`#/m01`, `#/dashboard`).

- Visão Geral: Dashboard (mapa macro)
- Produto: M01 Criação · M02 Cadastro
- Marketing: M03 Lançamento · M05 Conteúdo · M04 Mídia Paga · M09 Benchmark · M10 Playbook
- Vendas: M06 Vendas & OTE · M11 Segmentação CRM
- Governança: M07 Governança M1 · M08 Squad & RACI

## Fontes de dado (regra dura desde 31/08/2026)

**Venda no portal = Bling, e só Bling.** A integração com a loja do site (Shopify) foi removida
inteira: rotas `api/shopify*`, `api/_lib/shopify.js`, o bloco "Funil · site / Estoque · site" do
Tático e as env vars `SHOPIFY_*` do projeto Vercel. Motivo: o pedido do site já cai no Bling, então
ler as duas pontas cruzava a mesma venda duas vezes. Os 4 canais (Pedido Manual, Loja Virtual,
ATACADO, TikTokShop) vêm somados do próprio ERP.

Fontes vivas hoje: **Bling** (venda, pedido, cliente, produto, canal, vendedora), **Meta Ads**
(investimento) e **Suri** (conversas do WhatsApp). Mais nada.

Se um dia a loja precisar voltar, é integração nova: recriar o custom app no admin do Shopify e as
env vars. O snapshot antigo segue guardado no KV (`shopify_YYYY-MM`), ninguém apagou, só não é lido.

## Atualizar

O botão **↻ Atualizar tudo** existe em toda tela de painel e atualiza o portal INTEIRO (não só a
tela aberta): limpa o cache do navegador e refaz cada painel com `force=1`, o que também derruba o
cache do servidor (KV). Os painéis disparam escalonados (300ms) pra não pressionar o Bling.
Painel novo precisa se registrar: `window.__regPainel('Nome', function(force){ ... })` e
`window.__bindRefresh(botão)`.

## Time de vendas

Vendedoras ativas: **Natasha** e **Alyssa** (Laís saiu em 08/2026). Quem sai some dos cards e do
input de meta, mas as vendas antigas continuam no faturamento e aparecem agrupadas no card "Fora do
time atual" — assim o placar segue fechando com o Faturado. Trocar o time = editar `METAS`/`METAS_VX`,
`chaveVend` e as listas `ordem` no template (e `api/metas.js` no servidor).

## Acesso

Login por magic link. Autorizados por domínio em `AUTH_ALLOWED_DOMAINS` (prls.com.br, minerbz.com.br)
e, para convidados de fora, e-mail por e-mail em `AUTH_ALLOWED_EMAILS`. Nunca liberar um domínio
público inteiro (gmail.com abriria o portal pro mundo).

## Pendente

- Incorporar as 6 páginas antigas (Marca, ICP, Calendário, Rotina, Automação, Financeiro) ao app no estilo KV. Hoje elas seguem preservadas no estilo antigo, acessíveis por URL mas fora do menu novo.
- Conteúdo: o Dashboard mostra "Módulos mapeados: 07" (valor herdado do original), mas há 11 módulos. Confirmar com o dono antes de corrigir.
