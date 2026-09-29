# Mock Backend — Keeta

Mock local do sistema Keeta, para desenvolver e testar o frontend/backend
do Gerôncio sem depender da API real do Keeta (que exige credenciais,
lojas cadastradas e pedidos de verdade).

Documentação oficial usada como referência:
- API de pedidos: https://api-docs.mykeeta.com/apis/standard/order
- Webhooks: https://api-docs.mykeeta.com/apis/standard/basic/webhooks

## Como rodar

```bash
cd mock_backend/keeta
pnpm install
pnpm dev
```

Sobe em `http://localhost:4001` (configurável via variável de ambiente `PORT`).

## Estrutura de pastas

```
keeta/
├── src/
│   ├── order/
│   │   └── index.ts                       # mock da API: POST /order/get
│   ├── webhooks/
│   │   ├── dispatch.ts                    # helper compartilhado (não é rota)
│   │   ├── oauth2-authorization-code/
│   │   │   └── index.ts                   # gatilho: oauth2AuthorizationCodeNotification
│   │   ├── store-authorization/
│   │   │   └── index.ts                   # gatilho: storeAuthorizationNotification
│   │   ├── store-authorization-removal/
│   │   │   └── index.ts                   # gatilho: storeAuthorizationRemovalNotification
│   │   └── brand-authorization-removal/
│   │       └── index.ts                   # gatilho: brandAuthorizationRemovalNotification
│   ├── store.ts                           # "banco de dados" falso, em memória
│   ├── types.ts                           # tipos TS compartilhados
│   ├── server.ts                          # monta o app Express (sem dar listen)
│   └── index.ts                           # entry point (dá listen na porta)
├── package.json
├── tsconfig.json
└── README.md
```

Cada funcionalidade mockada tem seu próprio `index.ts`, dentro de uma pasta
com o nome da funcionalidade — igual ao padrão já usado no mock do 99
(`websocket_99/`). A diferença é que aqui, em vez de um único socket, temos
várias rotas HTTP independentes, então cada uma ganhou sua própria pastinha.

## Duas categorias de coisa mockada aqui — e por que são diferentes

### 1. API normal (`/order/get`)

Fluxo comum: **seu frontend chama o mock, o mock responde**. Isso é
simulado direto: a rota lê `orderViewId` + `shopId` do corpo da
requisição, busca no `store.ts` (dados em memória) e devolve no mesmo
formato de envelope que o Keeta documenta (`{ code, message, data }`).

```bash
curl -X POST http://localhost:4001/order/get \
  -H "Content-Type: application/json" \
  -d '{"orderViewId": 756823555555859, "shopId": 466663}'
```

Esse `orderViewId`/`shopId` correspondem ao pedido de exemplo que já vem
pré-cadastrado (veja `seedOrder()` em `store.ts`). Qualquer outra
combinação devolve `404` simulando "pedido não encontrado".

### 2. Webhooks (os 4 arquivos dentro de `webhooks/`)

**Um webhook funciona ao contrário de uma API.** Quem liga é o Keeta —
ele chama uma URL do SEU backend quando algo acontece do lado dele (o
merchant autoriza uma loja, revoga a marca, etc). Seu sistema nunca
"pergunta" por isso; ele só fica esperando a notificação chegar.

Por causa disso, **não existe como "mockar o recebimento"** de um
webhook — quem recebe de verdade é o seu próprio backend (`api-restaurantes`,
`api-pedidos`, etc.), não este mock.

O que este mock faz, então, é simular **o Keeta disparando** o evento.
Você chama uma "rota de gatilho" aqui, informando a URL do seu backend
real que deve escutar aquele webhook, e o mock envia pra lá o mesmo
payload (mesmos campos, mesmo formato) que o Keeta mandaria de verdade:

```bash
curl -X POST http://localhost:4001/webhooks/trigger/store-authorization \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "http://localhost:3333/webhooks/store-authorization",
    "shopId": 145541,
    "shopName": "Restaurante Teste"
  }'
```

Isso permite testar o endpoint que **recebe** o webhook no seu backend
(o handler que você escreve lá) sem precisar que o Keeta de verdade
dispare o evento — o que seria impossível em ambiente de desenvolvimento.

`targetUrl` **não é um campo do payload real do Keeta** — ele existe só
nesta rota de gatilho, para o mock saber para onde mandar a simulação.

## Rotas disponíveis

| Rota | Método | O que faz |
| --- | --- | --- |
| `/health` | GET | Confirma que o mock está de pé |
| `/mock/reset` | POST | Restaura os dados de exemplo ao estado inicial |
| `/order/get` | POST | Mock da consulta de pedido (ver seção acima) |
| `/webhooks/trigger/oauth2-authorization-code` | POST | Dispara `oauth2AuthorizationCodeNotification` para `targetUrl` |
| `/webhooks/trigger/store-authorization` | POST | Dispara `storeAuthorizationNotification` para `targetUrl` |
| `/webhooks/trigger/store-authorization-removal` | POST | Dispara `storeAuthorizationRemovalNotification` para `targetUrl` |
| `/webhooks/trigger/brand-authorization-removal` | POST | Dispara `brandAuthorizationRemovalNotification` para `targetUrl` |

## Adicionando um novo pedido de exemplo

Edite `src/store.ts` e chame `store.upsertOrder(...)` com um objeto no
formato `OrderInfo` (definido em `src/types.ts`), ou adicione outra chamada
dentro da função `seed()` para que ele já venha pronto ao iniciar o servidor.

## O que NÃO foi implementado (e por quê)

A documentação do Keeta tem campos usados só em cenários bem específicos
de reembolso parcial (`rebates`, `refundInfos`) e pedidos grandes divididos
(`subOrderInfoList`). Modelamos esses campos como `unknown` em `types.ts`
em vez de detalhar tudo, porque:

1. Não fazem parte do fluxo principal (criar pedido → aceitar → entregar);
2. A doc original já trunca alguns desses campos (`data.orderInfo.products`
   não veio com sub-campos detalhados na versão que temos);
3. Se o frontend precisar simular reembolso/pedido grande no futuro, é
   melhor buscar a doc oficial atualizada e detalhar certinho na hora, em
   vez de chutar um formato agora.

Se você precisar desses campos, adicione a interface certinha em
`types.ts` e povoe em `store.ts` — a estrutura já está pronta para isso.
