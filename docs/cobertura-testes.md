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

Os onze cenários em `backend/testes/pedidos-estoque.test.ts` foram mantidos, com todas as asserções originais. A única alteração nesse arquivo foi acrescentar a validação de ambiente antes das importações dos serviços. O cenário legado que usa um adapter simulado continua identificado como cobertura parcial, não como request spec completo.

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
