import { requisitar as requisitarPedidos } from './api-pedidos';
import { type Motoboy, type StatusMotoboy } from '@/data/motoboys';


export type DadosNovoMotoboy = {
  nome: string;
  cpf: string;
  telefone: string;
  email?: string;
  placa?: string;
  status?: StatusMotoboy;
};

export type DadosAtualizarMotoboy = {
  nome: string;
  cpf: string;
  telefone: string;
  email?: string;
  placa?: string;
  status?: StatusMotoboy;
};

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  return requisitarPedidos<T>(caminho, init);
}

/**
 * Lista todos os motoboys cadastrados no sistema, com suporte opcional a filtros de status e busca.
 */
export async function listarMotoboys(filtros?: {
  status?: StatusMotoboy[];
  busca?: string;
}): Promise<Motoboy[]> {
  const params = new URLSearchParams();
  if (filtros?.status && filtros.status.length > 0) {
    params.set('status', filtros.status.join(','));
  }
  if (filtros?.busca && filtros.busca.trim().length > 0) {
    params.set('busca', filtros.busca.trim());
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  return requisitar<Motoboy[]>(`/entregadores${query}`);
}

/**
 * Busca os dados detalhados de um motoboy específico pelo seu ID.
 */
export async function buscarMotoboyPorId(id: number): Promise<Motoboy> {
  return requisitar<Motoboy>(`/entregadores/${id}`);
}

/**
 * Cadastra um novo motoboy no sistema.
 */
export async function criarMotoboy(dados: DadosNovoMotoboy): Promise<Motoboy> {
  return requisitar<Motoboy>('/entregadores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
}

/**
 * Atualiza as informações cadastrais de um motoboy.
 */
export async function atualizarMotoboy(id: number, dados: DadosAtualizarMotoboy): Promise<Motoboy> {
  return requisitar<Motoboy>(`/entregadores/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
}

/**
 * Atualiza rapidamente apenas o status operacional de um motoboy.
 */
export async function atualizarStatusMotoboy(id: number, status: StatusMotoboy): Promise<void> {
  await requisitar(`/entregadores/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

/**
 * Remove um motoboy (ou inativa caso já tenha entregas no histórico).
 */
export async function excluirMotoboy(id: number): Promise<void> {
  await requisitar(`/entregadores/${id}`, {
    method: 'DELETE',
  });
}

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


type FiltrosGanhos = { inicio?: string; fim?: string; statusPagamento?: StatusPagamentoEntrega; restauranteId?: number };
function queryGanhos(filtros?: FiltrosGanhos) {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros ?? {})) {
    if (valor !== undefined) params.set(chave, String(valor));
  }
  return params.size ? '?' + params.toString() : '';
}
export function buscarGanhosMotoboy(id: number, filtros?: FiltrosGanhos) {
  return requisitar<RespostaExtratoMotoboy>('/entregas/motoboy/' + id + '/ganhos' + queryGanhos(filtros));
}
export function buscarResumoGeralMotoboys(filtros?: FiltrosGanhos) {
  return requisitar<RespostaResumoGeralMotoboys>('/entregas/motoboys/resumo' + queryGanhos(filtros));
}
export function atualizarPagamentoEntrega(id: number, statusPagamento: StatusPagamentoEntrega) {
  return requisitar('/entregas/' + id + '/pagamento', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusPagamento }) });
}
export function quitarEntregasMotoboy(id: number, periodo?: { inicio?: string; fim?: string }) {
  return requisitar<{ quantidadeQuitada: number; valorTotalQuitado: number }>('/entregas/motoboy/' + id + '/quitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(periodo ?? {}) });
}
