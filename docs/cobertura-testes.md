# Cobertura inicial dos testes de integração

Comportamentos desta primeira etapa confirmados pelo responsável pelo projeto neste chat, em 02/11/2026. Base de código: `f7d141b` da develop, antes do commit de padronização.

## Inventário dos fluxos críticos

| Fluxo | Risco | Cobertura nesta etapa |
| --- | --- | --- |
| Cadastro de restaurante | Dados inválidos ou não persistidos | Cadastro e consulta HTTP; ausência de nome sem gravação |
| Produtos e pedidos manuais | Preço adulterado, itens inconsistentes, mistura de restaurantes | Suíte existente de pedidos/estoque preservada |
| Aceite, cancelamento e estoque | Baixa duplicada, saldo negativo, devolução duplicada, gravação parcial | Suíte existente: concorrência de aceites e disputa de saldo, ciclo e ajustes |
| Entrada de webhooks de delivery | Duplicação e falsificação de eventos | Dois POSTs iFood simultâneos; rejeição de assinatura Rappi inválida |
| Processamento posterior do delivery | Pedido duplicado e mapeamento incorreto | Cenário legado chama processador diretamente com adapter simulado; não comprova o fluxo HTTP completo nem a conversão real |
| Pagamento de pedido | Confirmação falsa, dupla baixa, eventos fora de ordem | Seis testes de webhook Stripe com assinatura real e banco real |
| Checkout da assinatura e geração/consulta de links | Valores, reutilização de links e falhas do provedor | Ainda sem cobertura nesta primeira entrega; exige simulador do HTTP externo do Stripe |
| Assinatura/plano expirado | Liberação indevida de acesso | Ainda não existe modelo persistido de assinatura; eventos são apenas registrados no log |
| Login e acesso entre usuários/restaurantes | Exposição de dados e alterações sem permissão | Tela de login existente, mas sem autenticação/autorização real no backend; não coberto |
| Clientes, funcionários e atribuições | Dados pessoais, vínculos e custo de entrega | Rotas existentes; cobertura específica futura |
| Relatório de vendas | Receita e histórico incorretos | Rota existente; cobertura específica futura |
| Frete e rotas de entrega | Cobrança incorreta e alteração indevida de status | Rotas existentes; cobertura futura com geocodificação/roteamento externos simulados |
| Chatbot e API do mock | Sessão de outro cliente, comandos duplicados, perda de eventos | Fora da suíte inicial; exigem ambientes/cenários próprios |

Esta entrega é uma base simples de regressão, não cobertura integral dos fluxos críticos. As decisões de permissões, escopo dos códigos de plataforma, relatórios e exclusão de clientes continuam dependendo da confirmação do responsável.

## Plano de ampliação após o PR #47

Decisão do responsável em 09/11/2026: estabilizar e integrar primeiro o PR #46; em seguida integrar o PR #47; depois ampliar os testes para todas as partes do projeto. A suíte atual deve continuar executando durante essa sequência. Os itens abaixo são um plano, não cobertura já entregue nem aprovação antecipada de cada comportamento.

| Parte | Cobertura a planejar após o PR #47 |
| --- | --- |
| Restaurantes, clientes e funcionários | CRUD, validações, vínculos, isolamento entre restaurantes e efeitos de exclusões |
| Produtos, estoque e pedidos | Complementar as regressões existentes com limites, falhas, transações e transições de status |
| Frete e rotas | Cálculo, seleção/ordem das paradas, exportação, limites e efeitos nos pedidos, conforme o contrato final do PR #47 |
| Pagamentos e assinaturas | Emissão/reutilização de links, consulta, falhas externas e eventos conflitantes; acesso por assinatura quando houver modelo e regra aprovados |
| Plataformas de delivery | Assinaturas, recebimento durável, conversão, mapeamento, reprocessamento e processamento completo |
| Relatórios | Filtros, períodos, agregações e valores financeiros |
| Frontend | Estados de carregamento/erro/vazio, formulários, interações, acessibilidade, responsividade e integração com APIs |
| Chatbot/WhatsApp | Sessões, debounce, confirmação, consulta e limites, com serviços externos controlados |
| Mock das plataformas | Contratos dos payloads, persistência própria e comunicação com o backend |
| Autenticação e permissões | Identidades, vínculos e acessos indevidos quando esses controles estiverem implementados e definidos |
| Fluxos de ponta a ponta | Jornadas prioritárias do usuário após aprovação específica dos cenários e ambiente |

Para cada parte: inventariar o comportamento final, apresentar cenários “quando ..., então ...”, obter a confirmação do responsável, implementar os testes adequados e registrar resultados e lacunas. Entregar em PRs pequenos e revisáveis por fluxo. O número de cenários não substitui essa avaliação de cobertura.

## Dez cenários novos aprovados

```text
describe "Cadastro de restaurante"
  it "quando os dados obrigatórios são válidos, então cadastra e permite consultar o restaurante"
  it "quando falta o nome, então responde 400 sem gravar"

describe "Webhook de delivery"
  it "quando dois webhooks iFood iguais chegam simultaneamente, então persiste um único evento"
  it "quando o webhook Rappi tem assinatura inválida, então responde 401 sem gravar"

describe "Pagamento de pedido"
  it "quando o Stripe confirma o pagamento, então marca como pago, aceita o pedido e baixa o estoque"
  it "quando a confirmação é enviada duas vezes simultaneamente, então baixa o estoque apenas uma vez"
  it "quando a assinatura Stripe é inválida, então responde 400 sem alterar pagamento, pedido ou estoque"
  it "quando o pagamento falha, então registra a falha sem aceitar o pedido nem baixar estoque"
  it "quando o pagamento é confirmado sem estoque, então preserva o pagamento como pago e mantém o pedido novo"
  it "quando chega uma falha atrasada após a confirmação, então preserva o pagamento como pago"
```

Implementação: `backend/testes/fluxos-criticos.test.ts`. As pré-condições são cadastradas pelas APIs de restaurantes, produtos e pedidos; o registro de um link pendente é uma fixture Prisma. Nenhum pagamento real é feito. Os testes não exercitam o envio de WhatsApp, pois os pedidos usados são de balcão.

Os onze cenários em `backend/testes/pedidos-estoque.test.ts` foram mantidos, com todas as asserções de negócio originais. Foram acrescentadas a validação de ambiente antes das importações e as verificações de disponibilidade das URLs das APIs para a checagem de tipos. O cenário legado que usa um adapter simulado continua identificado como cobertura parcial, não como request spec completo.

## Cliente do pedido (aprovados em 09/11/2026)

```text
describe "Cliente do pedido"
  it "quando o pedido traz um cliente novo, então o cliente é cadastrado e o pedido aponta para ele"
  it "quando o nome e o endereço já existem, com maiúsculas diferentes, então o cadastro existente é reaproveitado"
  it "quando o pedido traz um clienteId que não existe, então a API responde 400"
  it "quando o cliente vem sem endereço, então a API responde 400"
  it "quando um cliente tem pedidos, então a exclusão é recusada com 409"
  it "quando uma plataforma envia um pedido sem nome do cliente, então o pedido fica sem cliente"
```

Implementação: `backend/testes/clientes-pedidos.test.ts`, pelas APIs de clientes e de pedidos; o cenário da plataforma usa o mesmo adapter simulado do teste legado do iFood. Resultado local: 28 testes no resumo do Node, todos aprovados. Lacunas: o aviso "Já há um cliente com esse nome/endereço" do formulário do painel e o envio do telefone pelo chatbot não têm teste automatizado.

## Resultado da execução local

- Data: 02/11/2026.
- Comando: `pnpm test:integracao` na raiz.
- Ambiente: Node.js 24, PostgreSQL 16 em container temporário e 11 migrations existentes aplicadas no banco de teste vazio.
- Cenários de comportamento: **20 passaram e 1 falhou**, de 21.
- O resumo do Node informa **22 testes, 21 aprovados, 1 reprovado**, porque também conta o teste agregador dos onze cenários legados.
- Ignorados, pendentes e cancelados: **zero**.
- `pnpm typecheck` no backend: passou.
- `pnpm exec tsc --noEmit -p testes/tsconfig.json`: passou.
- Bug reproduzido: **BUG-TESTE-001**, descrito em `bugs-testes.md`.

O comando retorna código 1 enquanto esse bug existir. O relatório TAP detalhado fica em `.resultados-testes/integracao.tap` e é recriado a cada execução. A execução remota do GitHub Actions só ocorrerá após enviar o commit; não está validada por esta execução local.

## Revalidação após o rebase em 09/11/2026

A revisão `42ed2c9` da `lucas`, baseada na develop `609a74a`, executou a suíte completa com PostgreSQL 16 em container exclusivo do Docker. Foram aplicadas as 11 migrations existentes, e o container foi removido ao final.

O resultado confirmou **20 cenários aprovados e 1 reprovado**, sem ignorados, pendentes ou cancelados. O Node incluiu o agregador legado no resumo: 22 testes, 21 aprovados e 1 reprovado. A única falha foi o BUG-TESTE-001, sobre a falha Stripe atrasada, com `falhou !== pago`.

O pnpm parou antes da execução por exigir confirmação interativa ao recriar o `node_modules` da raiz. O mesmo executor foi chamado diretamente com `node scripts/testar-integracao.mjs`, sem filtros nem alteração da suíte. Veja ambiente, comandos e evidências na [análise do PR #46](analise-pr-46.md#nova-execução-após-disponibilizar-o-docker).

## Resultado após as correções em 09/11/2026

Depois de corrigir o BUG-TESTE-001, incluir todos os testes na checagem de tipos e ajustar os relatórios, a suíte completa passou: **21 cenários de comportamento aprovados**, correspondendo a 22 testes no resumo do Node com o agregador legado. Zero falhas, ignorados, pendentes e cancelados. As asserções de negócio existentes foram preservadas. O PostgreSQL temporário foi removido ao final.

Comando local: `pnpm --config.verify-deps-before-run=false test:integracao`, com dependências do backend previamente instaladas. Também passaram `pnpm typecheck` e `pnpm exec tsc --noEmit -p testes/tsconfig.json` no backend. Uma falha controlada de preparação confirmou que não há reutilização do TAP anterior. O registro JSON identifica a revisão-base e as alterações locais dessa validação; o CI deve confirmar a revisão publicada.
