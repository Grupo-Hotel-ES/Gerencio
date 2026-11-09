# Conceitos de testes no Gerôncio

Este guia é para toda a equipe, incluindo quem trabalha apenas no frontend. Explica o que os testes verificam, como ler os resultados e como participar da definição dos cenários. Para as regras obrigatórias, consulte [regras de testes](regras-de-testes.md); para o inventário atual, consulte [cobertura](cobertura-testes.md).

## O que um teste automatizado responde

Um teste executa uma situação controlada e compara o resultado com um comportamento esperado. Por exemplo: **quando a confirmação de um pagamento chega duas vezes, então o estoque deve ser baixado apenas uma vez**.

O comportamento esperado vem do requisito aprovado pela equipe. Copiar a resposta atual do código para a expectativa pode transformar um bug em regra. Testes aprovados ajudam a detectar regressões nos cenários cobertos; não comprovam que todo o produto está correto.

## Tipos de verificação

| Verificação | O que exercita | Exemplo no projeto |
| --- | --- | --- |
| Teste unitário | Uma unidade pequena, com dependências controladas | Verificar a formatação de uma distância sem HTTP nem banco |
| Teste de integração | Partes reais trabalhando juntas | Enviar um webhook pela API e conferir pagamento, pedido e estoque no PostgreSQL |
| Teste de ponta a ponta (E2E) | Um fluxo pela interface e pelos serviços envolvidos | Selecionar pedidos no painel e conferir a exportação da rota e seus efeitos |
| Verificação de tipos | Compatibilidade estática de tipos TypeScript | Detectar uma propriedade ausente antes de executar o programa |
| Lint | Regras de código e problemas detectáveis por análise estática | Detectar importações não utilizadas e violações de regras de hooks |
| Verificação visual | Apresentação e usabilidade em tamanhos e estados diferentes | Conferir se dez marcadores e a legenda cabem no mapa em uma tela estreita |

A suíte do PR #46 prioriza integração HTTP com PostgreSQL real. Ela não abre o aplicativo, não comprova o visual das telas e não substitui lint ou verificação de tipos. O caso legado que chama diretamente um processador de delivery tem alcance menor que um fluxo completo pela API. Veja a distinção na [cobertura](cobertura-testes.md).

## Anatomia de um cenário: preparar, agir e verificar

Os três passos também são conhecidos como Arrange, Act, Assert (AAA):

1. **Preparar:** criar um restaurante, um produto com cinco unidades e um pedido de duas unidades. Cada cenário deve ter seus próprios dados.
2. **Agir:** enviar a confirmação do pagamento à rota HTTP real.
3. **Verificar:** conferir a resposta e o estado persistido: pagamento `pago`, pedido `em_preparo`, estoque com três unidades e uma única baixa.

Conferir somente o HTTP `200` é insuficiente: a API pode responder sucesso e gravar um estado incorreto. Também é necessário conferir que uma operação recusada não deixou alterações parciais no banco.

Em `backend/testes/fluxos-criticos.test.ts`, `prepararPagamento` prepara as pré-condições, `enviarStripe` faz a ação e `conferirAceite` concentra as verificações do aceite. Esses auxiliares ajudam a ler o cenário sem esconder qual comportamento está em teste.

## Vocabulário usado no código

| Termo | Significado e uso |
| --- | --- |
| Suíte / `describe` | Agrupa cenários relacionados, como “Pagamento de pedido” |
| Cenário / `it` ou `test` | Expressa uma situação e seu resultado esperado |
| Asserção / `assert` | Compara o resultado observado com a expectativa e reprova em caso de diferença |
| Fixture | Dados preparados para iniciar um cenário em um estado conhecido |
| Mock ou simulador | Substituto controlado de uma dependência, como o emissor de um evento Stripe |
| Setup / `before` | Prepara recursos, como servidores HTTP locais, antes da execução |
| Teardown / `after` | Fecha servidores e conexões depois da execução, inclusive em falhas |
| Regressão | Comportamento correto que deixa de funcionar após uma mudança |
| Teste instável (flaky) | Passa e falha sem mudança relevante, por exemplo por depender de tempo ou da ordem dos cenários |
| Relatório TAP | Saída estruturada que registra os testes e seus resultados |
| CI | Integração contínua: automação que executa verificações no GitHub ao receber alterações |

O executor nativo do [Node.js](https://nodejs.org/docs/latest-v24.x/api/test.html) fornece `describe`, `it`, `test` e os hooks. No projeto, `tsx` executa os arquivos TypeScript e `node:assert/strict` fornece as asserções. Não é necessário introduzir outro framework para usar a suíte atual.

## Fixture não é o mesmo que simular a regra

Para testar o recebimento de uma confirmação Stripe, o PR prepara um `PagamentoPedido` pendente diretamente no banco. Essa é uma fixture: representa um link já emitido. A operação sob teste continua entrando pela rota de webhook, passando pela verificação real de assinatura e pelas regras reais da aplicação.

Esse cenário **não cobre a criação do link de pagamento**. Para testar essa criação, seria necessário chamar a rota que emite o link e controlar a comunicação HTTP externa com o Stripe.

Os dados fictícios do frontend também têm um papel válido: permitem desenvolver os estados visuais antes da integração. Exibir uma lista fictícia não comprova que a API aceita ou devolve os dados esperados. A equipe precisa distinguir a demonstração visual da validação da integração.

Nas integrações desta suíte, somente os sistemas externos são simulados. O PostgreSQL, o Prisma, as transações, as validações e a regra sob teste são reais. Essa é uma escolha do projeto para encontrar problemas que um banco simulado poderia esconder.

## Por que o banco de teste é separado

Testes criam, alteram e excluem dados. O executor usa um container PostgreSQL exclusivo por execução, com credenciais e porta temporárias, e aplica as migrations existentes em um banco vazio. O ambiente é descartado ao final.

O arquivo `backend/testes/ambiente.ts` confere o destino antes de carregar os serviços. Não execute os testes apontando manualmente para um banco de desenvolvimento ou produção nem remova essas verificações. O uso de um banco isolado em container é explicado também na [documentação de testes de integração do Prisma](https://www.prisma.io/docs/orm/prisma-client/testing/integration-testing).

## Repetição, concorrência e ordem dos eventos

| Conceito | Pergunta | Exemplo de resultado esperado |
| --- | --- | --- |
| Idempotência | Repetir a mesma operação repete o efeito? | Duas notificações do mesmo pagamento baixam estoque uma única vez |
| Concorrência | Operações que chegam juntas preservam as regras? | Dois pedidos disputando as últimas unidades não deixam saldo negativo |
| Atomicidade | Uma operação pode ficar pela metade? | Se falta estoque de um item, o aceite não desconta os outros itens |
| Ordem dos eventos | Um evento antigo pode desfazer um estado já confirmado? | Uma falha atrasada não transforma um pagamento pago em falho |

Nos testes de concorrência, `Promise.all` inicia as requisições sem aguardar uma antes da outra. Depois é necessário conferir o estado final do banco. Isso exercita concorrência, mas não força todas as ordens possíveis de execução. Uma corrida específica pode exigir sincronização controlada no teste.

O último exemplo é o **BUG-TESTE-001**: a suíte original do PR #46 detectou regressão de `pago` para `falhou`. A expectativa correta deve continuar exigindo `pago`; corrigir esse caso significa corrigir a aplicação. A reprodução e o impacto estão em [bugs de testes](bugs-testes.md).

## Como ler um resultado

| Resultado | Como interpretar | Próximo passo |
| --- | --- | --- |
| Passou | As asserções executadas daquele cenário foram satisfeitas | Revisar também o alcance e a qualidade das asserções |
| Falhou em uma asserção | O observado divergiu do esperado | Investigar requisito, aplicação e preparação do cenário |
| Falhou na preparação | Os cenários podem nem ter começado | Resolver Docker, instalação, conexão ou migrations; não anunciar aprovação dos testes |
| Ignorado, pendente ou filtrado | Parte da verificação não foi executada | O projeto reprova a execução; preservar a suíte completa |
| Não executado | Não há resultado dessa revisão naquele ambiente | Registrar a limitação e executar em ambiente adequado |

O relatório do Node pode contar testes agregadores além dos cenários. Na execução histórica do PR #46 houve 21 cenários de comportamento, dos quais 20 passaram e um falhou. O resumo indicou 22 testes, com 21 aprovados e um reprovado, porque incluiu o agregador dos onze cenários legados. Isso não é porcentagem de cobertura de código.

Não interprete o arquivo `.resultados-testes/integracao.tap` sem conferir a execução que o produziu. Um relatório antigo não comprova o estado da branch atual. Diferencie sempre a falha histórica do PR e uma reprodução nova após o rebase.

## Conflito de Git e falha de teste são problemas diferentes

Um conflito de Git significa que o histórico ou as alterações de arquivos precisam ser conciliados. Uma falha de teste significa que o cenário executado não satisfez a expectativa, ou que sua preparação falhou. É possível fazer rebase sem conflitos e continuar com um bug na aplicação.

O rebase da `lucas` reaplica seu trabalho sobre a versão mais recente da `develop`. Ele muda a identidade do commit reaplicado e exige nova validação; não corrige automaticamente o problema financeiro detectado no PR #46. Resolver esse problema deve preservar o cenário que o revelou.

## Como executar e participar

Pré-requisitos: Node.js 24, pnpm 11.24.0, Docker com containers Linux ativo e dependências fixadas do backend instaladas. A partir da raiz do repositório:

```powershell
Set-Location backend
pnpm install --frozen-lockfile
Set-Location ..
pnpm test:integracao
```

O comando descobre a suíte completa, prepara o banco e gera o Prisma Client. Em seguida, confira os tipos:

```powershell
Set-Location backend
pnpm typecheck
pnpm exec tsc --noEmit -p testes/tsconfig.json
Set-Location ..
```

O `tsconfig` de testes inclui `**/*.ts` dentro de `backend/testes/`, abrangendo os cenários novos, o ambiente e os testes legados. Novos arquivos TypeScript nessa pasta também entram na verificação de tipos.

O relatório de integração fica em `.resultados-testes/integracao.tap`. O workflow `.github/workflows/testes.yml` executa a suíte em PRs e em pushes nas branches configuradas. A proteção de `develop` e `main` precisa exigir o check no GitHub: criar o workflow não configura essa proteção automaticamente.

Para propor um cenário novo, escreva primeiro uma frase **“quando ..., então ...”**, confirme-a com o responsável conforme as [regras](regras-de-testes.md) e defina o que será observado. Inclua sucesso, entradas inválidas, repetição, concorrência e limites quando se aplicarem. Ao entregar, informe a revisão, os comandos, o resultado real e as lacunas de cobertura.

A sequência acordada é estabilizar o PR #46, integrar o PR #47 de rotas e então ampliar a cobertura de todas as partes em PRs pequenos. Consulte a [política de evolução](regras-de-testes.md#política-de-evolução-acordada-em-09112026) e o [plano de cobertura](cobertura-testes.md#plano-de-ampliação-após-o-pr-47).
