import { type Motoboy, type StatusMotoboy } from '@/data/motoboys';

const BASE_URL = process.env.EXPO_PUBLIC_API_PEDIDOS_URL ?? 'http://localhost:3002/api';

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

type RespostaApiErro = {
  error?: string;
  detalhe?: string;
};

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${BASE_URL}${caminho}`, init);

  if (!resposta.ok) {
    let mensagemErro = `Erro na requisição (${resposta.status})`;
    try {
      const corpoErro = (await resposta.json()) as RespostaApiErro;
      if (corpoErro.error) {
        mensagemErro = corpoErro.detalhe ? `${corpoErro.error}: ${corpoErro.detalhe}` : corpoErro.error;
      }
    } catch {
      // Ignora erro de parse de JSON caso resposta não seja JSON
    }
    throw new Error(mensagemErro);
  }

  if (resposta.status === 204) {
    return undefined as unknown as T;
  }

  return resposta.json();
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
