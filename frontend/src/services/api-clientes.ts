import type { Cliente, DadosCliente } from '@/data/clientes';
import { requisitarApi } from './http';

const BASE_URL = process.env.EXPO_PUBLIC_API_CLIENTES_URL ?? 'http://localhost:3001/api';

/** Cliente no formato devolvido pela api-clientes. */
type ClienteApi = {
  id: number;
  nomeCliente: string;
  endereco: string;
  telefone: string | null;
  _count?: { pedidos: number };
};

function converter(cliente: ClienteApi): Cliente {
  return {
    id: cliente.id,
    nome: cliente.nomeCliente,
    endereco: cliente.endereco,
    telefone: cliente.telefone,
    pedidos: cliente._count?.pedidos ?? 0,
  };
}

function corpo(dados: DadosCliente) {
  return JSON.stringify({ nomeCliente: dados.nome.trim(), endereco: dados.endereco.trim(), telefone: dados.telefone?.trim() ?? '' });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Clientes em ordem alfabética, com a quantidade de pedidos. */
export async function listarClientes(): Promise<Cliente[]> {
  const clientes = await requisitarApi<ClienteApi[]>(BASE_URL, '/clientes');
  return clientes.map(converter);
}

/** Clientes com o mesmo nome OU o mesmo endereço (sem diferenciar maiúsculas). */
export async function buscarClientesSemelhantes(filtro: { nome?: string; endereco?: string }): Promise<Cliente[]> {
  const parametros = new URLSearchParams();
  if (filtro.nome?.trim()) parametros.set('nome', filtro.nome.trim());
  if (filtro.endereco?.trim()) parametros.set('endereco', filtro.endereco.trim());
  if (!parametros.toString()) return [];
  const clientes = await requisitarApi<ClienteApi[]>(BASE_URL, `/clientes?${parametros}`);
  return clientes.map(converter);
}

export async function criarCliente(dados: DadosCliente): Promise<Cliente> {
  return converter(await requisitarApi<ClienteApi>(BASE_URL, '/clientes', { method: 'POST', headers: JSON_HEADERS, body: corpo(dados) }));
}

export async function atualizarCliente(id: number, dados: DadosCliente): Promise<Cliente> {
  return converter(await requisitarApi<ClienteApi>(BASE_URL, `/clientes/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: corpo(dados) }));
}

export async function excluirCliente(id: number): Promise<void> {
  await requisitarApi<null>(BASE_URL, `/clientes/${id}`, { method: 'DELETE' });
}
