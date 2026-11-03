# Bugs reproduzidos pelos testes

## BUG-TESTE-001 — Evento Stripe de falha regride pagamento confirmado

- Situação: aberto, reproduzido em 02/11/2026; aplicação não corrigida nesta entrega de testes.
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

**Direção de correção:** definir transições monotônicas para pagamento e impedir que eventos atrasados de falha regridam `pago`, com condição atômica no banco. Manter este teste e acrescentar concorrência entre eventos conflitantes quando a correção for implementada.

Executar `pnpm test:integracao` para reproduzir. Não usar `skip`, alterar a expectativa para `falhou` ou esconder o código de saída 1. Esta falha deve impedir a integração à develop enquanto não houver correção aprovada.
