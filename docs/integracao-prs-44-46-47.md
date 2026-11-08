# Integração dos PRs 44, 46 e 47

Escopo confirmado pelo responsável em 08/11/2026: somente os três PRs abertos. Base: develop f7d141b. Branch: codex/integracao-prs-44-46-47.

## Contribuições e conflitos

- PR 44 (snaba, 1a7cd64): histórico incorporado. Os conflitos add/add de rota-mapa.tsx, rota-resumo.tsx e data/rotas.ts foram resolvidos preservando integralmente a versão da develop, que já contém cálculo real, mapa e exportação. A versão demonstrativa não substitui essa implementação. Não há diferença final no frontend em relação à develop.
- PR 46 (lucas, f22efc7): preservados executor, regras e todos os testes existentes.
- PR 47 (castro, aef551c): incorporados ganhos, percentual de repasse, extratos, quitação, documentação e migration. O conflito de imports em api-pedidos foi resolvido mantendo StatusEntregador e StatusPagamentoEntrega, necessários às duas funcionalidades.

## Correção da quitação

O lote antes respondia com todas as candidatas, mesmo quando outra requisição já as tinha quitado. Agora UPDATE condicional com RETURNING contabiliza somente linhas efetivamente atualizadas, com os respectivos valores persistidos. Cada entrega aparece em apenas uma resposta concorrente. Não há transferência de dinheiro externo nesta rota: ela registra a quitação.

Três comportamentos aprovados pelo responsável e implementados como testes HTTP com banco real:

- Quando existem entregas pendentes, então informa somente as entregas efetivamente quitadas e seu valor.
- Quando duas quitações chegam simultaneamente, então cada entrega é contabilizada como quitada em apenas uma resposta.
- Quando o lote é repetido, então retorna zero novas quitações.

## Validação em 08/11/2026

- Migration do PR 47 aprovada pelo responsável e executada exclusivamente no banco temporário de testes. Nenhuma migration nova foi criada ou aplicada ao banco de desenvolvimento.
- pnpm typecheck (backend): passou.
- pnpm exec tsc --noEmit -p testes/tsconfig.json (backend): passou.
- pnpm test:integracao: 23 cenários passaram e 1 falhou; o Node conta também o agregador legado (25 testes, 24 aprovados, 1 reprovado). Os três cenários novos passaram. Nenhum teste ignorado.
- Falha preservada: BUG-TESTE-001, evento Stripe de falha atrasada regride pagamento confirmado, descrito em bugs-testes.md.
- pnpm lint (frontend): quatro erros preexistentes: duas aspas não escapadas em assinatura/pagamento.tsx:590; atualização síncrona de estado em efeito em motoboys.tsx:70 e top-bar.tsx:25. Também três avisos de imports sem uso em configuracoes.tsx e perfil.tsx.

## Limites e pendências

Esta consolidação resolve os conflitos e a contabilização concorrente do lote. A autenticação/autorização do backend continua ausente, inclusive para os endpoints financeiros. Não se deve considerar o sistema pronto para exposição pública. A tela de ganhos proposta no documento do PR 47 continua sendo trabalho futuro; este PR incorpora o backend apresentado pelo autor.

O PR consolidado deve permanecer em rascunho até resolver o bug Stripe e as verificações pendentes. Os PRs originais continuam abertos para preservar suas discussões; este documento não autoriza encerrá-los automaticamente.
