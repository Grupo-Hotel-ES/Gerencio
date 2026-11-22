# Verificação do pedido e estoque compartilhado

O restaurante usa o mesmo saldo para o caixa e as integrações. Digitar itens no caixa só monta o carrinho. Ao clicar em **Verificar pedido**, o caixa envia as quantidades ao servidor. Em uma transação, o servidor verifica o saldo, debita os itens e grava um pedido em verificação. Se faltar algum produto, a transação inteira é revertida e o atendente pode corrigir o carrinho.

## Conferência no balcão

1. Confira com o cliente o número do pedido, os itens reservados e o total. A chave emitida para a primeira verificação permite repetir a solicitação após perder a resposta e obter o mesmo ID.
2. Para retomar a conferência depois de fechar o painel, abra **Abertos · Em verificação** e selecione o número do pedido. As unidades continuam reservadas.
3. Para trocar produtos, altere as quantidades e selecione **Verificar alterações**. O banco devolve as unidades retiradas e debita as acrescentadas na mesma transação. Se uma troca falhar, continua valendo a última composição gravada. Se outro caixa já tiver editado a revisão, retome a versão atual antes de tentar de novo.
4. **Confirmar pedido** encaminha o mesmo ID para a fila de novos pedidos. **Cancelar pedido e devolver itens** encerra a revisão, remove o pedido e repõe as unidades da última versão gravada. A chave de verificação usada permanece registrada para que um reenvio antigo não recrie o pedido.

## Delivery e pagamentos

Quando a integração processa uma notificação e grava o pedido externo, o débito ocorre na transação de criação. A plataforma e o ID externo identificam o pedido mesmo quando o evento é reenviado. O aceite de um pedido já debitado mantém o saldo. Pedidos anteriores à mudança que ainda aguardam baixa continuam cobertos pela baixa no aceite. Durante a revisão do caixa, a API exige a confirmação antes de gerar um link de pagamento.

O saldo reflete os pedidos que chegaram ao banco do restaurante. Um pedido conhecido apenas pela nuvem durante uma desconexão ainda não aparece no caixa local.

## Política de testes do fluxo

Esta política complementa as [regras gerais de testes](regras-de-testes.md). Para alterações na criação, retomada, edição, confirmação ou cancelamento, valide as rotas HTTP com PostgreSQL exclusivo de testes. Confira o ID, a versão, o estado do pedido, as linhas de itens e o saldo após cada operação.

| Cenário obrigatório | Resultado a conferir |
| --- | --- |
| Dois envios simultâneos com a mesma chave | As duas respostas identificam o mesmo pedido e há um único débito. |
| Dois pedidos distintos disputam a última unidade | Apenas um é gravado. O outro recebe conflito e o saldo nunca fica negativo. |
| Falta um produto na criação ou na troca | Nenhum item sofre débito parcial. Uma revisão existente conserva a composição, o saldo e a versão anteriores. |
| Retomar após reabrir o caixa | O ID consta na lista de revisões e a leitura preserva o estoque. |
| Dois caixas alteram a mesma versão | Apenas uma alteração é efetivada. O segundo caixa recebe conflito. |
| Confirmar a revisão e aceitar o pedido | O mesmo ID avança e a versão do estoque não aumenta por um segundo débito. |
| Cancelar e repetir a solicitação de criação | As unidades voltam uma vez. A revisão é apagada e a chave usada impede recriação. |
| Reprocessar um pedido externo | O mesmo ID externo na mesma plataforma leva ao mesmo pedido e preserva o saldo. |

Na raiz, execute `pnpm test:integracao` com Docker disponível. Para concorrência, dispare as operações com `Promise.all`. Para alterações do painel, confira também no navegador a falta de estoque, a indicação da reserva, a retomada após recarregar e os comandos de alterar, confirmar e cancelar. Registre no PR as verificações executadas, suas falhas e as que ficaram pendentes. Informe o impacto da migration e em qual banco ela foi validada.
