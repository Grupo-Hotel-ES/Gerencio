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

/** Dados demonstrativos fiéis aos protótipos para exibição e testes imediatos */
export const EXTRATO_DEMO_CARLOS: RespostaExtratoMotoboy = {
  entregador: {
    id: 1,
    nome: 'Carlos Motoboy SJC',
    cpf: '123.456.789-00',
    telefone: '(12) 99111-2222',
    email: 'carlos@motoboy.com',
    status: 'disponivel',
  },
  periodo: {
    inicio: '2026-11-01',
    fim: '2026-11-05',
  },
  resumo: {
    totalEntregas: 3,
    entregasPendentes: 2,
    entregasPagas: 1,
    valorPendenteAReceber: 21.5,
    valorJaPago: 12.03,
    valorTotalPeriodo: 33.53,
    taxaTotalCobrada: 36.53,
    distanciaTotalKm: 13.54,
    mediaPorEntrega: 11.18,
  },
  ganhosPorDia: [
    {
      data: '2026-11-05',
      entregas: 3,
      valorPendente: 21.5,
      valorPago: 12.03,
      valorTotal: 33.53,
    },
  ],
  entregas: [
    {
      id: 3,
      pedidoId: 3,
      entregadorId: 1,
      dataHora: '2026-11-05T14:07:00.000Z',
      dia: '2026-11-05',
      distanciaKm: 2.5,
      custoEntrega: 15.0,
      valorMotoboy: 12.0,
      statusPagamento: 'pendente',
      pagoEm: null,
      pedido: {
        id: 3,
        nomeCliente: 'Pedro Henrique (Vila Adyana)',
        app: '99food',
        enderecoDestino: 'Av. Dr. Adhemar de Barros, 500',
        cepDestino: '12245-011',
        status: 'entregue',
        preco: 56.9,
        restauranteId: 1,
      },
    },
    {
      id: 2,
      pedidoId: 2,
      entregadorId: 1,
      dataHora: '2026-11-05T13:42:00.000Z',
      dia: '2026-11-05',
      distanciaKm: 4.24,
      custoEntrega: 11.88,
      valorMotoboy: 9.5,
      statusPagamento: 'pendente',
      pagoEm: null,
      pedido: {
        id: 2,
        nomeCliente: 'Maria Oliveira',
        app: 'ifood',
        enderecoDestino: 'Rua das Flores, 120 • Centro',
        cepDestino: '12245-020',
        status: 'entregue',
        preco: 42.5,
        restauranteId: 1,
      },
    },
    {
      id: 1,
      pedidoId: 1,
      entregadorId: 1,
      dataHora: '2026-11-05T12:18:00.000Z',
      dia: '2026-11-05',
      distanciaKm: 6.8,
      custoEntrega: 12.03,
      valorMotoboy: 12.03,
      statusPagamento: 'pago',
      pagoEm: '2026-11-05T13:00:00.000Z',
      pedido: {
        id: 1,
        nomeCliente: 'Ana Souza',
        app: 'ubereats',
        enderecoDestino: 'Rua Coronel José Monteiro, 240',
        cepDestino: '12245-030',
        status: 'entregue',
        preco: 38.0,
        restauranteId: 1,
      },
    },
  ],
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
  try {
    return await requisitar<RespostaExtratoMotoboy>(
      `/entregas/motoboy/${entregadorId}/ganhos${query ? `?${query}` : ''}`,
    );
  } catch (error) {
    // Retorna fallback demo se a rota não estiver disponível ou falhar
    if (entregadorId === 1) {
      let entregasFiltradas = [...EXTRATO_DEMO_CARLOS.entregas];
      if (filtros?.statusPagamento) {
        entregasFiltradas = entregasFiltradas.filter(
          (e) => e.statusPagamento === filtros.statusPagamento,
        );
      }
      return {
        ...EXTRATO_DEMO_CARLOS,
        periodo: {
          inicio: filtros?.inicio ?? EXTRATO_DEMO_CARLOS.periodo.inicio,
          fim: filtros?.fim ?? EXTRATO_DEMO_CARLOS.periodo.fim,
        },
        entregas: entregasFiltradas,
      };
    }
    throw error;
  }
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
  try {
    return await requisitar<RespostaResumoGeralMotoboys>(
      `/entregas/motoboys/resumo${query ? `?${query}` : ''}`,
    );
  } catch {
    return {
      periodo: {
        inicio: filtros?.inicio ?? '2026-11-01',
        fim: filtros?.fim ?? '2026-11-05',
      },
      totalGeralPendente: 21.5,
      totalGeralPago: 12.03,
      totalGeralPeriodo: 33.53,
      motoboys: [
        {
          entregadorId: 1,
          nome: 'Carlos Motoboy SJC',
          telefone: '(12) 99111-2222',
          email: 'carlos@motoboy.com',
          status: 'disponivel',
          totalEntregas: 3,
          entregasPendentes: 2,
          entregasPagas: 1,
          valorPendenteAReceber: 21.5,
          valorJaPago: 12.03,
          valorTotalPeriodo: 33.53,
          distanciaTotalKm: 13.54,
        },
      ],
    };
  }
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
