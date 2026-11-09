# Bugs reproduzidos pelos testes

## BUG-TESTE-001 — Evento Stripe de falha regride pagamento confirmado

- Situação: corrigido em 09/11/2026, com validação local completa no PostgreSQL isolado em Docker. A expectativa do teste de regressão foi preservada.
- Reproduzido novamente em 09/11/2026, após o rebase da `lucas` sobre a develop, na revisão `42ed2c9`, com PostgreSQL 16 em Docker. A suíte completa terminou com 20 cenários aprovados e este cenário reprovado (`falhou !== pago`); nenhum cenário foi ignorado. A aplicação e as asserções permaneceram inalteradas.
- Prioridade: alta, por inconsistência no estado financeiro.
- Teste: `Pagamento de pedido > quando chega uma falha atrasada após a confirmação, então preserva o pagamento como pago`, em `backend/testes/fluxos-criticos.test.ts`.
- Rota: `POST /api/webhooks/stripe`.
- Código relacionado: tratamento de `checkout.session.async_payment_failed` em `backend/api-pagamentos/src/routes.ts`.

### Reprodução

1. Criar restaurante, produto com 5 unidades e pedido de 2 unidades pelas APIs reais.
2. Preparar um `PagamentoPedido` pendente, representando um link já emitido.
3. Enviar `checkout.session.completed` assinado, com `payment_status: paid`.
4. Conferir pagamento `pago`, pedido `em_preparo` e saldo 3.
5. Enviar `checkout.session.async_payment_failed` assinado para a mesma sessão.

**Esperado aprovado:** pagamento permanece `pago`, conserva `pagoEm` e não altera novamente o estoque.

**Observado:** a rota responde 200 e altera o status para `falhou`, apesar de conservar `pagoEm`, pedido aceito e estoque já baixado. A asserção compara `falhou` com `pago` e reprova.

**Causa identificada:** o `updateMany` do evento de falha filtra somente `sessaoStripeId`, sem impedir regressão de um pagamento já confirmado.

**Impacto:** o painel pode informar falha para um pedido já pago e aceito. A reprodução não comprova cobrança duplicada; comprova inconsistência do estado persistido.

**Correção aplicada:** o `updateMany` da falha agora exige `status != pago` na própria condição de atualização. Um evento de falha atrasado não altera um pagamento já confirmado. O teste de regressão existente passou sem mudança de expectativa. A ampliação com cenários adicionais de eventos conflitantes fica no plano posterior ao PR #47.

**Validação da correção:** em 09/11/2026, a suíte completa aprovou os 21 cenários de comportamento (22 testes contando o agregador legado), sem falhas, ignorados, pendentes ou cancelados. `pnpm typecheck` e a checagem de tipos de todos os arquivos de testes também passaram. O container temporário foi descartado pelo executor.

Executar `pnpm test:integracao` para proteger esse comportamento. Não usar `skip`, alterar a expectativa para `falhou` ou esconder códigos de erro caso haja regressão.
