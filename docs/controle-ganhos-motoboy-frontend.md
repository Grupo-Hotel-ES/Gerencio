# Guia de Integração Frontend — Controle de Ganhos do Motoboy

Este documento reúne todo o contexto técnico, regras de negócio, contratos das rotas da API e exemplos prontos de tipagem/serviço para quem for implementar a interface de **Controle de Ganhos do Motoboy** no Frontend (`frontend/src/app/(painel)/motoboys.tsx`).

---

## 1. História de Usuário e Fluxo Esperado

> **Como** motoboy,
> **quero** visualizar e acompanhar quanto tenho a receber pelas entregas realizadas,
> **para que** eu possa controlar meus ganhos e saber quanto devo receber em determinado período.

### Fluxo que o Backend já entrega pronto:
1. **Registro de entregas realizadas pelo motoboy:** Toda entrega (`Entrega`) vinculada a um motoboy (`entregadorId`) guarda a data/hora (`dataHora`), distância (`distanciaKm`), taxa cobrada do cliente (`custoEntrega`) e o valor líquido devido ao entregador (`valorMotoboy`).
2. **Percentual de repasse configurável pelo restaurante:** Por padrão, **100%** da taxa de entrega vai para o motoboy (`percentualRepasseMotoboy = 100` na tabela `Restaurante`), mas o restaurante pode configurar qualquer percentual entre `0` e `100` (ex.: `80%`). O `valorMotoboy` é gravado no momento da entrega para preservar o histórico mesmo se o restaurante mudar a porcentagem depois.
3. **Diferenciação entre valores pendentes e pagos:** Cada entrega possui `statusPagamento: 'pendente' | 'pago'` e `pagoEm: string | null`.
4. **Cálculo de resumo, série diária e filtro por período:** A API calcula automaticamente quanto o motoboy tem **a receber (pendente)**, quanto **já foi pago** e o **total no período** (`inicio` e `fim` no formato `AAAA-MM-DD`).

---

## 2. Portas e URLs Base das APIs

| Serviço | Variável no Frontend | URL Padrão Local |
| :--- | :--- | :--- |
| **API de Pedidos e Entregas** | `EXPO_PUBLIC_API_PEDIDOS_URL` | `http://localhost:3002/api` |
| **API de Restaurantes** | `EXPO_PUBLIC_API_RESTAURANTES_URL` | `http://localhost:3003/api` |
| **API de Funcionários (Motoboys)** | `EXPO_PUBLIC_API_FUNCIONARIOS_URL` | `http://localhost:3005` |

> **Dica:** O helper `requisitar<T>(caminho, init)` já existe em `frontend/src/services/api-pedidos.ts` apontando para `http://localhost:3002/api`.

---

## 3. Contratos dos Endpoints (Backend `api-pedidos` e `api-restaurantes`)

### 3.1. Resumo e Extrato de Ganhos de um Motoboy (Principal para a Tela)
- **Rota:** `GET /api/entregas/motoboy/:entregadorId/ganhos`
- **Query Params (todos opcionais):**
  - `inicio` e `fim` (`AAAA-MM-DD`): filtra as entregas pelo período (inclusivo, no fuso `America/Sao_Paulo`). Se omitidos, retorna todo o histórico do motoboy.
  - `statusPagamento` (`pendente` | `pago`): filtra a lista `entregas` retornada (o objeto `resumo` continua trazendo os totais gerais do período para os cards do topo não zerarem ao trocar de aba).
  - `restauranteId` (`number`): filtra por restaurante.
  - `apenasEntregues` (`true` | `false`): se `true`, considera apenas pedidos com status `entregue` (por padrão considera todos os pedidos não cancelados).

#### Exemplo de Resposta (`200 OK`):
```json
{
  "entregador": {
    "id": 1,
    "nome": "Carlos Motoboy SJC",
    "cpf": "123.456.789-00",
    "telefone": "12991112222",
    "email": "carlos@motoboy.com",
    "status": "disponivel"
  },
  "periodo": {
    "inicio": "2026-11-01",
    "fim": "2026-11-05"
  },
  "resumo": {
    "totalEntregas": 3,
    "entregasPendentes": 2,
    "entregasPagas": 1,
    "valorPendenteAReceber": 21.5,
    "valorJaPago": 12.03,
    "valorTotalPeriodo": 33.53,
    "taxaTotalCobrada": 36.53,
    "distanciaTotalKm": 13.54,
    "mediaPorEntrega": 11.18
  },
  "ganhosPorDia": [
    {
      "data": "2026-11-05",
      "entregas": 3,
      "valorPendente": 21.5,
      "valorPago": 12.03,
      "valorTotal": 33.53
    }
  ],
  "entregas": [
    {
      "id": 3,
      "pedidoId": 3,
      "entregadorId": 1,
      "dataHora": "2026-11-05T17:07:41.000Z",
      "dia": "2026-11-05",
      "distanciaKm": 2.5,
      "custoEntrega": 15.0,
      "valorMotoboy": 12.0,
      "statusPagamento": "pendente",
      "pagoEm": null,
      "pedido": {
        "id": 3,
        "nomeCliente": "Pedro Henrique (Vila Adyana)",
        "app": "99food",
        "enderecoDestino": "Av. Dr. Adhemar de Barros, 500",
        "cepDestino": "12245-011",
        "status": "entregue",
        "preco": 56.9,
        "restauranteId": 1
      }
    }
  ]
}
```

---

### 3.2. Visão Geral de Ganhos de Todos os Motoboys (Para a Tabela Principal)
- **Rota:** `GET /api/entregas/motoboys/resumo?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&restauranteId=1`
- **Uso:** Ideal para exibir na tabela geral de motoboys quanto cada entregador tem pendente a receber e quanto já recebeu no período selecionado.

#### Exemplo de Resposta (`200 OK`):
```json
{
  "periodo": {
    "inicio": "2026-11-01",
    "fim": "2026-11-05"
  },
  "totalGeralPendente": 21.5,
  "totalGeralPago": 12.03,
  "totalGeralPeriodo": 33.53,
  "motoboys": [
    {
      "entregadorId": 1,
      "nome": "Carlos Motoboy SJC",
      "telefone": "12991112222",
      "email": "carlos@motoboy.com",
      "status": "disponivel",
      "totalEntregas": 3,
      "entregasPendentes": 2,
      "entregasPagas": 1,
      "valorPendenteAReceber": 21.5,
      "valorJaPago": 12.03,
      "valorTotalPeriodo": 33.53,
      "distanciaTotalKm": 13.54
    }
  ]
}
```

---

### 3.3. Marcar uma Entrega Individual como Paga ou Pendente
- **Rota:** `PATCH /api/entregas/:id/pagamento`
- **Body:**
```json
{
  "statusPagamento": "pago"
}
```
*(Também aceita `"statusPagamento": "pendente"` caso queira desfazer a baixa, e opcionalmente `"valorMotoboy": 15.00` para ajuste manual).*

---

### 3.4. Quitar em Lote Todas as Entregas Pendentes de um Motoboy no Período
- **Rota:** `POST /api/entregas/motoboy/:entregadorId/quitar`
- **Body (opcional — se vazio, quita todas as entregas pendentes do motoboy):**
```json
{
  "inicio": "2026-11-01",
  "fim": "2026-11-05"
}
```
#### Exemplo de Resposta (`200 OK`):
```json
{
  "entregadorId": 1,
  "nomeEntregador": "Carlos Motoboy SJC",
  "inicio": "2026-11-01",
  "fim": "2026-11-05",
  "quantidadeQuitada": 2,
  "valorTotalQuitado": 21.5,
  "pagoEm": "2026-11-05T17:07:41.656Z",
  "entregasIds": [2, 3]
}
```

---

### 3.5. Configurar o Percentual de Repasse da Taxa no Restaurante
- **Rota:** `GET /api/restaurantes/:id/regras-entrega` e `PATCH /api/restaurantes/:id/regras-entrega` (`api-restaurantes`, porta `3003`)
- **Body do PATCH:**
```json
{
  "percentualRepasseMotoboy": 100
}
```

---

## 4. Código Pronto de Serviço para o Frontend (`frontend/src/services/api-motoboys.ts`)

Quem for implementar a tela pode criar o arquivo `frontend/src/services/api-motoboys.ts` com o código abaixo:

```ts
import { requisitar } from './api-pedidos';

export type StatusPagamentoEntrega = 'pendente' | 'pago';

export type ResumoGanhosMotoboy = {
  totalEntregas: number;
  entregasPendentes: number;
  entregasPagas: number;
  valorPendenteAReceber: number;
  valorJaPago: number;
  valorTotalPeriodo: number;
  taxaTotalCobrada: number;
  distanciaTotalKm: number;
  mediaPorEntrega: number;
};

export type GanhoDiarioMotoboy = {
  data: string;
  entregas: number;
  valorPendente: number;
  valorPago: number;
  valorTotal: number;
};

export type EntregaMotoboyItem = {
  id: number;
  pedidoId: number;
  entregadorId: number | null;
  dataHora: string;
  dia: string;
  distanciaKm: number | null;
  custoEntrega: number;
  valorMotoboy: number;
  statusPagamento: StatusPagamentoEntrega;
  pagoEm: string | null;
  pedido: {
    id: number;
    nomeCliente: string | null;
    app: string;
    enderecoDestino: string;
    cepDestino: string;
    status: string;
    preco: number;
    restauranteId: number | null;
  };
};

export type RespostaExtratoMotoboy = {
  entregador: {
    id: number;
    nome: string;
    cpf: string;
    telefone: string;
    email: string;
    status: 'disponivel' | 'em_entrega' | 'inativo' | null;
  };
  periodo: {
    inicio: string | null;
    fim: string | null;
  };
  resumo: ResumoGanhosMotoboy;
  ganhosPorDia: GanhoDiarioMotoboy[];
  entregas: EntregaMotoboyItem[];
};

export type RespostaResumoGeralMotoboys = {
  periodo: { inicio: string | null; fim: string | null };
  totalGeralPendente: number;
  totalGeralPago: number;
  totalGeralPeriodo: number;
  motoboys: {
    entregadorId: number;
    nome: string;
    telefone: string;
    email: string;
    status: 'disponivel' | 'em_entrega' | 'inativo' | null;
    totalEntregas: number;
    entregasPendentes: number;
    entregasPagas: number;
    valorPendenteAReceber: number;
    valorJaPago: number;
    valorTotalPeriodo: number;
    distanciaTotalKm: number;
  }[];
};

export async function buscarGanhosMotoboy(
  entregadorId: number,
  filtros?: {
    inicio?: string;
    fim?: string;
    statusPagamento?: StatusPagamentoEntrega;
    restauranteId?: number;
  },
): Promise<RespostaExtratoMotoboy> {
  const params = new URLSearchParams();
  if (filtros?.inicio) params.set('inicio', filtros.inicio);
  if (filtros?.fim) params.set('fim', filtros.fim);
  if (filtros?.statusPagamento) params.set('statusPagamento', filtros.statusPagamento);
  if (filtros?.restauranteId) params.set('restauranteId', String(filtros.restauranteId));

  const query = params.toString();
  return requisitar<RespostaExtratoMotoboy>(
    `/entregas/motoboy/${entregadorId}/ganhos${query ? `?${query}` : ''}`,
  );
}

export async function buscarResumoGeralMotoboys(filtros?: {
  inicio?: string;
  fim?: string;
  restauranteId?: number;
}): Promise<RespostaResumoGeralMotoboys> {
  const params = new URLSearchParams();
  if (filtros?.inicio) params.set('inicio', filtros.inicio);
  if (filtros?.fim) params.set('fim', filtros.fim);
  if (filtros?.restauranteId) params.set('restauranteId', String(filtros.restauranteId));

  const query = params.toString();
  return requisitar<RespostaResumoGeralMotoboys>(
    `/entregas/motoboys/resumo${query ? `?${query}` : ''}`,
  );
}

export async function atualizarPagamentoEntrega(
  entregaId: number,
  statusPagamento: StatusPagamentoEntrega,
): Promise<void> {
  await requisitar(`/entregas/${entregaId}/pagamento`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusPagamento }),
  });
}

export async function quitarEntregasMotoboy(
  entregadorId: number,
  periodo?: { inicio?: string; fim?: string },
) {
  return requisitar<{
    entregadorId: number;
    nomeEntregador: string;
    quantidadeQuitada: number;
    valorTotalQuitado: number;
    pagoEm: string | null;
    entregasIds: number[];
  }>(`/entregas/motoboy/${entregadorId}/quitar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(periodo ?? {}),
  });
}
```

---

## 5. Sugestão de Componentes na Tela `frontend/src/app/(painel)/motoboys.tsx`

Seguindo o Design System do projeto (`useCores()`, `Espacamento`, `Raio` e componentes de `@/components/dashboard/ui` e `@/components/dashboard/pagina`):
1. **Seleção de Motoboy e Filtro de Período:**
   - Na linha de cada motoboy na tabela, adicionar um botão **`Ver ganhos`** (ou selecionar o motoboy ao clicar).
   - No painel de ganhos do motoboy selecionado, incluir atalhos de período usando `<Chip />` (**Hoje**, **Últimos 7 dias**, **Este mês**, **Personalizado**) e dois `<TextInput />` para `inicio` (`AAAA-MM-DD`) e `fim` (`AAAA-MM-DD`).
2. **Cards de Resumo de Ganhos (`<Grade>` + `<CartaoResumo>`):**
   - **A receber (Pendente):** `formatarMoeda(resumo.valorPendenteAReceber)` com detalhe `${resumo.entregasPendentes} entregas pendentes` (destaque com `cores.statusPreparando`).
   - **Já recebido (Pago):** `formatarMoeda(resumo.valorJaPago)` com detalhe `${resumo.entregasPagas} entregas pagas` (destaque com `cores.statusEntregue`).
   - **Total no período:** `formatarMoeda(resumo.valorTotalPeriodo)` com detalhe `${resumo.totalEntregas} entregas (${resumo.distanciaTotalKm} km)`.
   - **Média por entrega:** `formatarMoeda(resumo.mediaPorEntrega)`.
3. **Lista / Extrato de Entregas do Motoboy:**
   - Filtros com `<Chip />` para **Todas**, **Pendentes** (`statusPagamento = 'pendente'`) e **Pagas** (`statusPagamento = 'pago'`).
   - Cada linha mostra: `#pedidoId`, data/hora, cliente/endereço, distância (`distanciaKm km`), valor do motoboy (`R$ valorMotoboy`), `<Etiqueta />` indicando **Pendente** ou **Pago**, e botão individual para alternar entre **Marcar pago** / **Reabrir**, além de um botão primário no topo **"Quitar pendentes do período"** (`quitarEntregasMotoboy`).
