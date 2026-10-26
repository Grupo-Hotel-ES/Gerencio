# AGENTS.md — Gerôncio

Guia para agentes (e pessoas) que forem trabalhar neste repositório. Para a visão de produto, leia o [README.md](README.md).

O Gerôncio centraliza pedidos de várias plataformas de delivery (iFood, Rappi, 99Food, Keeta, Uber Eats) em um painel único, sincroniza estoque e organiza entregas. É um projeto acadêmico de Engenharia de Software (UNIFESP), feito por uma equipe de 8 pessoas.

## Idioma e convenções gerais

- **Tudo em português**: nomes de variáveis, funções, rotas, modelos, comentários, mensagens de erro e commits (`pedidos`, `criadoEm`, `parseId`, `'Pedido não encontrado'`). Termos técnicos consagrados podem ficar em inglês (`health`, `webhook`).
- Siga o estilo do arquivo que estiver editando — densidade de comentários, nomes e idioma do código ao redor.
- TypeScript em todo o projeto (exceto `mock/mock_frontend`, que é JS com Create React App).
- Gerenciador de pacotes: **pnpm**. Cada pasta (`backend/`, `frontend/`, `mock/`) tem seu próprio lockfile; instale dependências dentro da pasta correspondente.
- Não commite `.env`, `node_modules/` nem pastas de ferramentas (`.claude/`, `.cursor/`, `.agents/`), que já estão no `.gitignore`.

## Estrutura

```
.
├── backend/          # Microsserviços Express + Prisma (pnpm workspace)
│   ├── api-clientes/       # :3001  CRUD de clientes
│   ├── api-pedidos/        # :3002  pedidos, status, entregador, relatório de vendas
│   ├── api-restaurantes/   # :3003  CRUD de restaurantes
│   ├── api-produtos/       # :3004  produtos e mapeamentos produto ↔ id externo da plataforma
│   ├── api-integracao/     # :3005  webhooks/polling das plataformas de delivery
│   └── packages/shared-db/ # Prisma schema, migrations e cliente compartilhado
├── frontend/         # App React Native + Expo (expo-router), web e mobile
├── mock/             # Simulador das plataformas de delivery (API + banco + formulário web)
├── testes/           # Arquivos .http / roteiros de teste manual das APIs
└── docs/             # Pitch, swagger da 99Food, modelo do banco
```

## Comandos

Na raiz (atalhos definidos em `package.json`):

| Comando | O que faz |
| --- | --- |
| `pnpm db` | Sobe só o Postgres do backend (Docker, porta 5432) |
| `pnpm backend` | Roda todos os `api-*` em modo watch (`tsx watch`) |
| `pnpm backend:docker` | Sobe Postgres + APIs em containers |
| `pnpm db:migrate` | `prisma migrate dev` no schema compartilhado |
| `pnpm studio` | Prisma Studio do banco principal |
| `pnpm frontend` / `pnpm dev` | Inicia o Expo |
| `pnpm mock` | Sobe banco + API do mock e abre o formulário web |
| `pnpm mock:studio` | Prisma Studio do banco do mock |

Dentro de `backend/`: `pnpm typecheck` (roda `tsc --noEmit` em todos os pacotes), `pnpm db:generate`, `pnpm docker:logs`, `pnpm docker:down`.
Dentro de `frontend/`: `pnpm web`, `pnpm android`, `pnpm ios`, `pnpm lint`.

**Antes de concluir uma mudança**, rode `pnpm typecheck` em `backend/` e/ou `pnpm lint` em `frontend/`. Não há testes automatizados; os testes manuais das rotas ficam em `testes/*.http`.

## Backend

### Padrão de cada serviço

Todo `api-*` tem a mesma forma — copie-a ao criar um serviço novo:

- `src/index.ts` — lê `PORT` (com padrão fixo) e chama `app.listen`.
- `src/server.ts` — Express com `express.json()`, CORS liberado, `GET /health`, rotas montadas em `/api`, 404 e handler de erro.
- `src/routes.ts` — um único `Router` com as rotas numeradas em comentário (`// 1. LISTAR PEDIDOS`).
- `Dockerfile` — build a partir de `backend/` (contexto do workspace), roda `pnpm db:generate` e `pnpm start`.

Ao adicionar um serviço, registre-o também em `backend/docker-compose.yml` e copie o `package.json` dele nos Dockerfiles que fazem `pnpm install --frozen-lockfile`. Hoje o `api-integracao` **não** está no docker-compose — rode-o com `pnpm backend`.

### Estilo das rotas

```ts
routes.get('/pedidos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }
  try {
    // ... db.pedido.findUnique(...)
    if (!pedido) { res.status(404).json({ error: 'Pedido não encontrado' }); return }
    res.json(pedido)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar pedido', detalhe: error.message })
  }
})
```

- Valide a entrada no início e responda `400` com `{ error }`; use `parseId` para ids de rota.
- Erros sempre no formato `{ error: string, detalhe?: string }`.
- `res.status(...).json(...)` seguido de `return` (não `return res...`).
- Valores de enum validados contra `Object.values(StatusPedido)` etc.
- Estilo de código: aspas simples, sem ponto e vírgula, 2 espaços.

### Banco de dados (`packages/shared-db`)

- Prisma 5.22, PostgreSQL (imagem PostGIS). Importe sempre de `@geroncio/shared-db`: `import { db, parseId, StatusPedido } from '@geroncio/shared-db'`. Não instancie `PrismaClient` nos serviços.
- Modelos em camelCase no código, colunas em snake_case via `@map` — mantenha esse padrão em campos novos.
- Para mudar o schema: edite `prisma/schema.prisma` e rode `pnpm db:migrate` com um nome descritivo em português (ex.: `adiciona_nome_cliente`). Nunca edite migrations já commitadas.
- `Decimal` (preços) chega ao frontend como **string** no JSON; converta com `Number(...)`.
- Status de pedido: `novo → em_preparo → pronto → saiu_para_entrega → entregue` (ou `cancelado`).
- Variáveis de ambiente ficam em `backend/.env` (carregado por `--env-file-if-exists`). `DATABASE_URL` padrão: `postgresql://geroncio:geroncio_dev@localhost:5432/geroncio`.

### Integração com plataformas

O `api-integracao` recebe `POST /api/webhooks/:plataforma` (`ifood`, `99food`, `keeta`, `ubereats`, `rappi`), valida assinatura HMAC quando há segredo configurado (`RAPPI_WEBHOOK_SECRET`, `UBER_WEBHOOK_SECRET`...), normaliza o evento e cria o `Pedido` usando `MapeamentoApp` para traduzir ids externos em `Produto`. URLs externas vêm de env (`MOCK_API_URL`, `IFOOD_API_URL`), com padrão apontando para o mock em `localhost:3333`.

## Mock (`mock/`)

Simula o "mundo externo": o formulário web (`mock_frontend`, :3000) monta pedidos; a `mock_api` (:3333) grava no **banco próprio do mock** (Postgres em :5433, Prisma 7 com `@prisma/adapter-pg`) e dispara webhooks/polling para o `api-integracao`. Cada plataforma tem seu módulo em `mock_backend/<plataforma>/index.ts`, que monta o payload no formato real da plataforma (ver `docs/99food/swagger.yaml`).

- O cliente Prisma do mock é gerado em `mock/src/generated/prisma` — não edite à mão; rode `pnpm db:generate` em `mock/`.
- O mock e o backend são bancos **separados**; não misture schemas.
- O cardápio do formulário vem da `api-produtos`, então o backend precisa estar de pé.

## Frontend (`frontend/`)

- **Expo SDK 57** + expo-router + React Native 0.86 + React 19. As APIs do Expo mudaram: consulte https://docs.expo.dev/versions/v57.0.0/ antes de escrever código (ver `frontend/AGENTS.md`).
- Rotas em `src/app/`. As páginas do painel ficam no grupo `(painel)/` (`index` = pedidos, `estoque`, `relatorios`), com layout de sidebar + top bar em `(painel)/_layout.tsx`.
- Componentes do painel em `src/components/dashboard/` (`ui.tsx` tem os primitivos e o mapa de ícones `ICONES`, com nomes SF Symbols / Material por plataforma).
- **Cores e espaçamentos só via tokens**: `useCores()` (`src/hooks/use-cores.ts`) e `Espacamento`/`Raio` de `src/constants/tokens.ts`. Não use cores hex soltas nos componentes. Os tokens espelham `src/design-system/variables/*.json` (exportados do Figma); se mudar um, mude o outro.
- Os protótipos de cada tela (web e mobile) estão em `src/design-system/prototypes/` — use-os como referência visual ao implementar uma página.
- Chamadas HTTP em `src/services/api-*.ts`. A URL base vem de `EXPO_PUBLIC_API_*_URL` com fallback para `localhost`. Cada serviço converte o formato da API para o tipo da UI (em `src/data/`).
- O layout é responsivo: com largura ≥ 960 aparece a sidebar; abaixo disso, a navegação compacta.
- Estilo de código: aspas simples, com ponto e vírgula, `StyleSheet.create` no fim do arquivo.

## Git

- Fluxo: cada integrante trabalha em sua branch (`cahu`, `fraga`, `okita`...), abre PR para `develop`, e `develop` vai para `main`.
- Mensagens de commit curtas, no imperativo (`Add página Relatório`, `Create dashboard page`). Português ou inglês são aceitos; seja consistente dentro de uma mesma PR.
- Não faça commit, push ou PR sem pedido explícito.
