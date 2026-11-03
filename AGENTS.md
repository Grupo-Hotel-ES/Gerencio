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
│   ├── api-pedidos/        # :3002  pedidos, status, entregador, relatório de vendas, frete e rotas de entrega
│   ├── api-restaurantes/   # :3003  CRUD de restaurantes
│   ├── api-produtos/       # :3004  produtos e mapeamentos produto ↔ id externo da plataforma
│   ├── api-integracao/     # :3005  webhooks/polling das plataformas de delivery
│   ├── api-pagamentos/     # :3006  Stripe Checkout: assinatura do Gerêncio e links de pagamento de pedidos
│   ├── chatbot/            # :5678  n8n (workflows do chatbot)
│   ├── llm/                # :11434 Ollama (LLM do chatbot)
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
| `pnpm backend:docker` | Sobe Postgres + APIs em containers (sem o chatbot) |
| `pnpm chatbot` | Sobe o chatbot: n8n, Evolution API e Ollama |
| `pnpm db:migrate` | `prisma migrate dev` no schema compartilhado |
| `pnpm studio` | Prisma Studio do banco principal |
| `pnpm frontend` / `pnpm dev` | Inicia o Expo |
| `pnpm mock` | Sobe banco + API do mock e abre o formulário web |
| `pnpm mock:studio` | Prisma Studio do banco do mock |

Dentro de `backend/`: `pnpm typecheck` (roda `tsc --noEmit` em todos os pacotes), `pnpm db:generate`, `pnpm docker:logs`, `pnpm docker:down` (derruba tudo, inclusive o chatbot), `pnpm chatbot:up:gpu`, `pnpm chatbot:down`.
Dentro de `frontend/`: `pnpm web`, `pnpm android`, `pnpm ios`, `pnpm lint`.

**Antes de concluir uma mudança**, rode `pnpm typecheck` em `backend/` e/ou `pnpm lint` em `frontend/`. Para mudanças no backend, execute também `pnpm test:integracao` na raiz: usa HTTP real e PostgreSQL em container exclusivo. Os roteiros manuais continuam em `testes/*.http`.

### Regras obrigatórias de testes

- Leia [docs/regras-de-testes.md](docs/regras-de-testes.md) antes de criar ou alterar testes. Use `node:test`, `assert` e `tsx`, já presentes no projeto.
- Apresente as frases `describe` / `it` em português (“quando ..., então ...”) e espere a confirmação do responsável antes de implementar comportamentos novos.
- Não apague, pule (`skip`, `todo`, `only`) ou afrouxe testes/asserções para obter aprovação. Se um teste parecer errado, pare e pergunte.
- Teste a rota HTTP real e o banco de teste real. Simule somente serviços externos; nunca o banco, as regras de negócio ou as permissões sob teste.
- Falha por bug real permanece falhando e deve ser registrada em [docs/bugs-testes.md](docs/bugs-testes.md). Não mude a aplicação ou a expectativa apenas para ocultar o resultado de uma tarefa de diagnóstico.
- Execute pela raiz com `pnpm test:integracao`; nunca use bancos/credenciais de desenvolvimento ou produção. Novas migrations precisam de revisão do responsável antes de executar.
- Preserve os cenários existentes, confira os efeitos no banco e use `Promise.all` para requisições simultâneas. Documente as limitações da cobertura e reporte o resultado real.

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

### Chatbot (n8n)

Os serviços do chatbot (`chatbot`, `evolution-api` e `llm`) ficam no profile `chatbot` do compose, então **não** sobem com `pnpm backend:docker`: rode `pnpm chatbot` na raiz (as APIs precisam estar de pé para o workflow funcionar).

`chatbot/Dockerfile` estende a imagem oficial `n8nio/n8n` com a versão fixada em `ARG N8N_VERSION`. No compose, o serviço `chatbot` expõe o editor em http://localhost:5678 e guarda os dados (workflows, credenciais, chave de criptografia) no volume `geroncio_n8ndata`, usando o SQLite interno. Não aponte o banco interno do n8n para o Postgres do Prisma: as tabelas dele quebrariam o `prisma migrate`. Dentro do compose, os workflows chamam as APIs pelo nome do serviço (`http://api-pedidos:3002/api`).

A LLM do chatbot roda no serviço `llm` (`backend/llm/`, Ollama com a versão em `ARG OLLAMA_VERSION`), na porta 11434. O modelo é escolhido por `OLLAMA_MODEL` no `backend/.env` (padrão `qwen3.5:4b`) e baixado na subida do container para o volume `geroncio_ollama`; o healthcheck só fica `healthy` quando o modelo está pronto. Dentro do compose, a URL é `http://llm:11434`. Para usar GPU NVIDIA (precisa do `nvidia-container-toolkit`), suba com `pnpm chatbot:up:gpu` em `backend/`.

O atendimento pelo WhatsApp é o workflow `chatbot/workflows/atendimento-whatsapp.json`. A Evolution API (instância `geroncio`, QR code em http://localhost:8080/manager) envia `MESSAGES_UPSERT` para `http://chatbot:5678/webhook/whatsapp`, e o workflow funciona como orquestrador:

- **Debounce**: cada mensagem entra em `MensagemChatbot`, e depois de 4 s só a execução da mensagem mais recente do telefone segue, com todas as mensagens pendentes juntas.
- **Sessão**: histórico, cliente, pedido pendente e último pedido ficam em `SessaoChatbot` (Prisma), lidos e gravados pelo nó Postgres.
- **Loop**: a LLM responde sempre um JSON `{ "acao", "dados" }`, restrito pelo `format` do Ollama. O orquestrador executa a ação, devolve o resultado como mensagem `--- RESULTADO <AÇÃO> ---` e chama a LLM de novo, até `MENSAGEM` (que envia pelo WhatsApp e encerra) ou até 6 passos.
- **Ações**: `MENSAGEM`, `CARDAPIO`, `RESUMIR_PEDIDO` (valida ids, calcula o subtotal com os preços do banco e cota o frete em `POST /api/pedidos/cotacao-frete`; o total inclui a entrega; pagamento `dinheiro`, `pix`, `cartao` ou `online`), `CONFIRMAR_PEDIDO` (só depois de o cliente responder ao resumo; envia o frete já cotado em `custoEntrega`/`distanciaKm`/`latitude`/`longitude`, então a `api-pedidos` não recalcula), `CONSULTAR_PEDIDO` (só pedidos do próprio cliente) e `LINK_PAGAMENTO` (gera o link do Stripe na `api-pagamentos`, só para pedidos do próprio cliente).
- **Link de pagamento**: a URL do Stripe não passa pela LLM. O nó "Resultado do link" guarda em `linkPagamento` e o "Enviar WhatsApp" anexa o link ao fim da próxima `MENSAGEM`. Para criar uma ação, inclua-a no `enum` e nas instruções de "Preparar chamada" e numa saída do Switch "Ação".

O restaurante atendido vem de `CHATBOT_RESTAURANTE_ID` (padrão 1). Depois de editar o JSON (ou exportá-lo do editor), rode `sh chatbot/importar-workflow.sh` em `backend/`: o script cria as credenciais (Postgres e Evolution, a partir do `.env`), importa, publica e reinicia o n8n.

### Pagamentos (Stripe)

O `api-pagamentos` cria sessões do **Stripe Checkout** para a assinatura (tela `assinatura/pagamento` do frontend): cartão vira assinatura mensal (`mode: 'subscription'`) e Pix paga um mês avulso (`mode: 'payment'`). O preço é montado inline (`price_data`, `PLANO_VALOR_CENTAVOS`, padrão 14900), então não é preciso criar produto no painel do Stripe. Os dados do cartão são digitados só na página do Stripe.

- Para ativar, preencha `STRIPE_SECRET_KEY` (e `STRIPE_WEBHOOK_SECRET`) no `backend/.env`. Sem a chave, `GET /api/pagamentos/config` responde `configurado: false` e o frontend fica em modo demonstração.
- O Pix precisa estar habilitado em *Settings → Payment methods* da conta Stripe (conta brasileira).
- **Links de pedidos**: `POST /api/pagamentos/pedidos/:id/link` (corpo opcional `{ clienteId }`) cria uma sessão de pagamento avulso (cartão ou Pix) cobrando `Pedido.preco` (itens) + `Entrega.custoEntrega` (frete), em duas linhas no Stripe; um link aberto com valor diferente é encerrado e refeito, e grava em `PagamentoPedido`. Enquanto houver um link pendente e válido, devolve o mesmo. `GET /api/pagamentos/pedidos/:id` lista os pagamentos e diz se o pedido está pago. Depois de pagar, o cliente cai em `GET /api/pagamentos/retorno`, que também sincroniza o status. Para isso abrir no celular do cliente, `PAGAMENTOS_URL_PUBLICA` precisa ser uma URL pública. A validade do link vem de `PAGAMENTO_PEDIDO_VALIDADE_MINUTOS` (padrão 60; o Stripe aceita de 30 a 1440).
- **Pagamento confirmado** (webhook ou página de retorno, uma única vez por link): `src/pedido-pago.ts` aceita o pedido sozinho (`novo → em_preparo`, com baixa de estoque; se falhar, ex. sem estoque, o pedido fica `novo`) e, em pedidos do WhatsApp, avisa o cliente pela Evolution API (`EVOLUTION_URL`, `EVOLUTION_INSTANCIA`, `AUTHENTICATION_API_KEY`) e registra o aviso no histórico da `SessaoChatbot`.
- No painel, a `api-pedidos` devolve `pagamentos` (status e validade) em cada pedido, e o cartão mostra a situação do pagamento. Pedidos de WhatsApp e balcão têm o botão "Gerar link de pagamento", que mostra o link como QR Code (`components/dashboard/qr-code.tsx`, desenhado com Views a partir da lib `qrcode`). O botão só aparece com o Stripe configurado.
- Webhook: `POST /api/webhooks/stripe` (assinatura validada com `STRIPE_WEBHOOK_SECRET`). Em desenvolvimento: `stripe listen --forward-to localhost:3006/api/webhooks/stripe`. Atualiza o `PagamentoPedido` (pago, expirado, falhou); os eventos da assinatura ainda só vão para o log, porque não há modelo de assinatura no banco.
- No frontend, a URL vem de `EXPO_PUBLIC_API_PAGAMENTOS_URL`. No celular, o Stripe volta para a página web definida em `EXPO_PUBLIC_URL_RETORNO_PAGAMENTO`, e o app consulta o status ao fechar o navegador.

### Rotas de entrega (`api-pedidos/src/rotas-entrega.ts`)

A tela `rotas` do painel monta a rota com os pedidos `pronto` que têm entrega (retiradas ficam de fora), na ordem escolhida, saindo do restaurante.

- `POST /api/rotas/calcular` (`{ restauranteId, pedidoIds, transporte }`, ids na ordem de entrega): geocodifica os pedidos sem coordenadas (Nominatim, e salva em `Pedido.latitude/longitude`) e calcula a rota pelas vias no OSRM (`calcularRotaComParadas` em `shared-db/src/calculo-frete.ts`), devolvendo distância, duração e o traçado.
- `POST /api/rotas/exportar`: devolve o link do Google Maps (`/maps/dir/?api=1`, com coordenadas) e passa todos os pedidos para `saiu_para_entrega` numa transação (tudo ou nada). Máximo de 10 paradas, o limite de pontos do link.
- No frontend, o mapa é o OpenStreetMap com Leaflet (`components/dashboard/mapa-osm/`): `iframe` na web (`index.web.tsx`) e `react-native-webview` no app (`index.tsx`), com o mesmo HTML (`html.ts`). O link exportado aparece como QR Code e pode ser copiado (`expo-clipboard`).

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
