# Regras de testes do Gerôncio

Este documento define o contrato de qualidade do projeto para pessoas e agentes de IA. O objetivo é identificar regressões antes de integrar mudanças, mantendo testes confiáveis e comportamentos aprovados pelo responsável pelo produto. Uma suíte verde comprova os cenários cobertos; não garante ausência de bugs no restante do sistema.

Para começar pelo vocabulário e pelos exemplos, leia [Conceitos de testes no Gerôncio](conceitos-de-testes.md).

## Política de evolução acordada em 09/11/2026

1. Concluir o PR #46 com a suíte existente, a correção do bug financeiro reproduzido, a verificação de tipos de todos os testes e relatórios que identifiquem a execução atual. Validar localmente com PostgreSQL isolado no Docker e exigir o CI aprovado antes da integração à develop.
2. Integrar o PR #47 de rotas, revisando o comportamento final e executando os checks e a suíte existente. Preservar as regressões já protegidas.
3. Depois do PR #47, inventariar todas as partes do projeto e ampliar sua cobertura em PRs pequenos por fluxo: backend, frontend, integrações externas, chatbot e mock. O [plano de cobertura](cobertura-testes.md#plano-de-ampliação-após-o-pr-47) orienta essa etapa.

Para cada fluxo, confirmar primeiro os cenários em português com o responsável. Testes unitários, de integração, de interface e E2E devem ser escolhidos conforme o risco e o que precisa ser comprovado. A meta é cobrir os comportamentos relevantes de todas as partes, com lacunas explícitas; não prometer cobertura integral com base apenas na quantidade de testes ou em uma porcentagem de linhas.

A expansão posterior não suspende a suíte atual nem permite ignorar falhas durante a integração dos PRs. Bugs corrigidos devem conservar sua regressão automatizada; comportamentos novos continuam seguindo a aprovação de cenários descrita abaixo.

## Executar

Pré-requisitos: Node.js 24, pnpm 11.24.0, Docker Desktop com containers Linux em execução e dependências do backend instaladas:

```powershell
cd C:\gerencio\backend
pnpm install --frozen-lockfile
cd ..
pnpm test:integracao
```

Depois da instalação inicial, **`pnpm test:integracao`**, na raiz, executa toda a suíte automatizada de integração do backend. `pnpm test` é um alias. Os roteiros `.http`, o exemplo de teste do Create React App no mock e um eventual E2E são verificações distintas; não estão incluídos neste comando.

Se o pnpm tentar recriar o `node_modules` da raiz e parar por ausência de terminal interativo, após instalar as dependências fixadas do backend use `pnpm --config.verify-deps-before-run=false test:integracao`. Essa [opção do pnpm](https://pnpm.io/settings#verifydepsbeforerun) evita somente a checagem/reinstalação automática de dependências naquele comando. O executor, a descoberta de todos os testes e as proteções de ambiente permanecem iguais. Não é necessário alterar configurações globais.

O executor:

1. Descobre todos os arquivos `backend/testes/**/*.test.ts`, incluindo os antigos.
2. Recusa uma suíte vazia e marcações comuns de `skip`, `only` e `todo`.
3. Cria um container novo de PostgreSQL 16, com nome exclusivo, dados temporários, senha aleatória e porta aleatória publicada apenas em `127.0.0.1`.
4. Usa o banco `geroncio_validacao_estoque`, sem reutilizar bancos ou volumes de desenvolvimento/produção.
5. Aplica as migrations existentes nesse banco vazio e gera o Prisma Client. Não cria migrations nem executa seeds de aplicação.
6. Inicia os Express reais em portas locais disponíveis e executa os testes. Arquivos rodam em sequência; os testes de corrida usam `Promise.all` explicitamente.
7. Exibe o resultado e grava `.resultados-testes/integracao.tap`, mesmo quando uma asserção falha.
8. Descarta somente o container criado por esta execução, inclusive quando os testes falham.

Antes da preparação, o executor remove o TAP anterior. O arquivo `.resultados-testes/execucao-integracao.json` registra a revisão Git, se havia alterações locais, o horário, o container, o resultado e o código de saída, inclusive em falhas de preparação. O CI guarda ambos como artefatos. A ausência de um TAP novo significa que não há relatório de cenários dessa tentativa.

Código de saída `0` significa sucesso; qualquer falha de preparação, teste ou limpeza produz código diferente de zero. Teste cancelado, ignorado ou pendente também reprova a execução. Se o processo for encerrado à força pelo sistema operacional, a limpeza pode não ocorrer; o nome do container de teste aparece no início da saída para identificação, sem afetar os containers do projeto.

`backend/testes/ambiente.ts` valida ambiente, destino, porta e credenciais temporárias antes de carregar os serviços. Não execute arquivos isolados contornando essa validação. A `.env` local não determina o banco de teste: o executor fornece a URL isolada aos processos filhos.

## Comportamentos antes da implementação

- Antes de escrever um teste de negócio novo, apresentar ao responsável as frases `describe` / `it` em português, com a forma **"quando ..., então ..."**.
- Esperar confirmação ou correção. O comportamento existente no código não é automaticamente o comportamento correto.
- Registrar a aprovação e as decisões relevantes no documento de cobertura. Se houver dúvida durante a implementação, interromper o cenário afetado e perguntar.
- Considerar, para cada fluxo, caminho feliz, erros esperados, repetição, concorrência, limites e acesso indevido. Registrar explicitamente o que ainda não possui contrato aprovado ou implementação.
- E2E de navegador exige aprovação própria. A primeira etapa usa testes de integração HTTP.

## O que um teste de integração deve executar

- Usar `describe` e `it` de `node:test`, `assert` de `node:assert/strict` e TypeScript executado por `tsx`, ferramentas já utilizadas pelo projeto.
- Entrar pela rota HTTP real com `fetch`. O código de roteamento, validação, regras de negócio, Prisma, constraints e transações deve ser o mesmo da aplicação.
- Conferir a resposta **e os efeitos persistidos**: linhas criadas, estado do pedido, saldo, versão, pagamento e ausência de gravações parciais.
- Criar dados únicos por cenário. É permitido usar Prisma para preparar uma pré-condição ou consultar o resultado, nunca para substituir a operação que o teste deveria chamar pela API.
- Exemplo: preparar um `PagamentoPedido` pendente é uma fixture válida para testar seu webhook; testar a criação do link exige chamar a rota de criação e simular somente a resposta HTTP do Stripe.
- Simular apenas sistemas externos: Stripe, plataformas de delivery, geocodificação, WhatsApp ou e-mail. Usar credenciais fictícias e servidores locais/controlados. Nunca efetuar cobranças, enviar mensagens reais ou utilizar dados pessoais reais.
- A verificação da assinatura permanece real. Nos testes Stripe, o emissor externo é simulado por um payload assinado com segredo exclusivo de teste; a rota usa o SDK real para verificar a assinatura.
- Não mockar banco, `PrismaClient`, repositórios, validações, policies ou a regra sob teste.
- Quando autenticação e permissões forem implementadas, criar identidades e vínculos reais de teste. Um header inventado ou um simples filtro por `restauranteId` não comprova autorização.

## Concorrência e independência

- Para duas requisições simultâneas, iniciar ambas antes de aguardar, com `Promise.all`.
- Verificar o efeito final no banco. Duas respostas de sucesso podem ser válidas para uma repetição idempotente, desde que o efeito ocorra uma só vez.
- Operações distintas com saldo suficiente devem poder ter dois efeitos legítimos. Não confundir idempotência com proibição de compras iguais.
- Para corridas que dependem de uma ordem específica, acrescentar sincronização controlada no ambiente de teste; `Promise.all` sozinho não prova todos os possíveis intercalamentos.
- Não depender da ordem entre cenários, de IDs fixos, de dados preexistentes ou de esperas arbitrárias. Sempre aguardar a conclusão das requisições e usar limites de tempo.
- Fechar servidores e conexões mesmo quando uma asserção falhar. Limpezas devem atingir exclusivamente dados/containers de teste.

## Integridade dos testes

1. **Proibido apagar, pular, marcar como pendente ou afrouxar um teste para torná-lo verde.** Isso inclui `skip`, `todo`, `only`, filtros que ocultam cenários, remoção de asserções, aceitação indiscriminada de status e captura de erro sem reprovar.
2. Não transformar um bug conhecido em comportamento esperado sem decisão explícita do responsável.
3. Se um teste parecer incorreto, parar e perguntar. Uma alteração legítima de requisito deve registrar quem aprovou, por quê e quais cenários continuam protegidos.
4. Cada bug corrigido deve manter um teste de regressão que reproduz o problema original. A correção altera a aplicação; a expectativa aprovada permanece.
5. Falha por bug real permanece falhando e entra em `docs/bugs-testes.md`, com reprodução, esperado, observado e impacto.
6. Falhas de infraestrutura ou do próprio teste devem ser identificadas como tal e corrigidas sem enfraquecer a regra. Reexecutar um teste até obter verde não substitui investigar instabilidade.
7. Mudanças de código devem vir acompanhadas da revisão dos testes afetados. Manter os testes existentes mesmo quando uma funcionalidade é refatorada.
8. Novas migrations devem ser apresentadas e revisadas pelo responsável antes de qualquer execução. Nunca editar migrations já commitadas nem apagar duplicados automaticamente para viabilizar constraints.

O verificador de marcações do executor é uma proteção adicional e não substitui revisão humana: ele não detecta toda forma possível de enfraquecer ou remover uma asserção.

## Rotina de entrega e revisão

- Após alterações no backend: executar `pnpm test:integracao` na raiz e `pnpm typecheck` no backend. Para os testes novos: `pnpm exec tsc --noEmit -p testes/tsconfig.json` no backend.
- Após alterações no frontend: executar também `pnpm lint` no frontend e as verificações aplicáveis à mudança.
- Informar comando, revisão analisada, resultado e limitações. Distinguir "passou", "falhou" e "não executado".
- Nunca anunciar tudo verde quando existe teste falhando ou quando o ambiente impediu sua execução.
- Em uma entrega de diagnóstico, é permitido registrar o commit na branch de trabalho com o teste reproduzindo o bug e o relatório explícito. Isso não autoriza integrar uma regressão à `develop`.
- Antes de integrar uma PR, revisar mudanças nos testes e exigir a verificação **"Integração com PostgreSQL real"** aprovada.

O workflow `.github/workflows/testes.yml` executa os testes em PRs e em pushes de `lucas`, `develop` e `main`, além de guardar o relatório. Não utiliza `continue-on-error`. O administrador do repositório precisa tornar essa verificação obrigatória nas regras de proteção de `develop`/`main`: o arquivo do workflow, sozinho, não impede um merge manual. Essa configuração remota não foi alterada nesta entrega.

## Referências

- [Node.js: executor de testes e describe/it](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [Docker: execução de containers](https://docs.docker.com/reference/cli/docker/container/run/)
- [Cobertura inicial e comportamentos aprovados](cobertura-testes.md)
- [Bugs reproduzidos pela suíte](bugs-testes.md)
