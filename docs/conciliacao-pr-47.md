# Conciliação do PR #47 com a develop

Preparação local em 16/11/2026, na branch `codex/conciliar-pr47`.

## Revisões utilizadas

- Develop mais recente buscada nesta sessão: `49299239f837b0143fc4024c0c6136c2a3bac7a8`, merge do PR #53.
- PR #47, branch `castro`: `aef551c77285e07b37101f87ad15c1a433fcaadd`.
- A preparação usa uma união dos históricos, preservando os commits e a autoria do trabalho de Leonardo Castro. Não reescreve a branch `castro`.

O PR #47 implementa **ganhos e repasses dos motoboys**. As referências anteriores que o descreviam como um PR de rotas foram corrigidas na política e no guia da equipe.

## Diferenças resolvidas

| Área | Conciliação |
| --- | --- |
| Schema de restaurante | Preservados os campos atuais de estabelecimento, endereço e configurações, acrescentando o percentual de repasse do PR |
| Criação de pedido | Mantidas as validações e a vinculação/criação do cadastro de clientes da develop, junto do cálculo e registro do repasse |
| Atribuição de entregador | Preservada a atualização de disponibilidade do entregador da develop e o tratamento do valor de repasse do PR |
| Extrato de ganhos | O nome passa a vir de `pedido.cliente.nomeCliente`, pois o campo direto no pedido foi removido na develop. O formato `pedido.nomeCliente` da resposta do extrato foi preservado |
| Regras de entrega e frete | Mantidas as alterações da develop e acrescentados os dados de repasse do PR |

A migration original `20261105121800_adiciona_status_pagamento_entrega` foi preservada, sem editar migrations existentes. O responsável aprovou sua execução exclusivamente no banco temporário do Docker, após apresentação das operações em 16/11/2026.

## Regressões aprovadas pelo responsável

Arquivo: `backend/testes/ganhos-motoboy.test.ts`. Os três cenários foram apresentados e aprovados nesta sessão antes da implementação:

1. Quando o restaurante repassa 50% de uma entrega de R$ 10, então registra R$ 5 e o extrato mostra o cliente cadastrado.
2. Quando o percentual muda depois, então o valor já registrado permanece igual.
3. Quando uma entrega é quitada, então o extrato a mostra como paga e a quitação em lote não a paga novamente.

As operações sob teste usam HTTP real e PostgreSQL real. Prisma prepara somente fixtures e confere os efeitos persistidos. O primeiro cenário também confere que os campos atuais de configurações e razão social permanecem intactos. A suíte anterior não foi removida, filtrada ou afrouxada.

## Validação local

- `pnpm --config.verify-deps-before-run=false test:integracao`, na raiz: **31 testes aprovados**, equivalentes a 30 cenários de comportamento e um agregador legado. Zero falhas, ignorados, pendentes ou cancelados.
- PostgreSQL 16 em container temporário exclusivo: `geroncio-testes-0ad9f6185899`.
- As 15 migrations da união foram aplicadas no banco vazio, incluindo a migration do PR #47 e as migrations posteriores da develop.
- `pnpm typecheck` no backend e `pnpm exec tsc --noEmit -p testes/tsconfig.json`: aprovados.
- A remoção do container foi confirmada por consulta ao Docker após a execução.
- Os relatórios locais estão em `.resultados-testes/integracao.tap` e `execucao-integracao.json`, ignorados pelo Git. A revisão-base é a develop indicada acima com as alterações locais de conciliação.

Essas verificações protegem os cenários existentes e as três regressões aprovadas. Não comprovam cobertura integral dos endpoints novos, dos filtros por período, de quitações concorrentes ou da interface. A expansão de cobertura segue o plano do projeto.

## Descrição sugerida para o PR de conciliação

**Título:** Conciliar ganhos dos motoboys do PR #47 com a develop atual

Integra o trabalho de ganhos e repasses dos motoboys do PR #47 à develop atual, preservando o cadastro de clientes, as configurações de estabelecimento e as funcionalidades já integradas. Resolve os conflitos do schema e da criação de pedidos e adapta o extrato ao relacionamento atual com Cliente, mantendo o formato da resposta esperado pelo frontend.

Inclui três regressões aprovadas para repasse, histórico e quitação, com HTTP/PostgreSQL reais. A suíte local aprovou 31 testes, sem ignorados ou cancelados. A migration original do PR foi mantida. O CI deve validar a revisão publicada antes de qualquer integração à develop.
