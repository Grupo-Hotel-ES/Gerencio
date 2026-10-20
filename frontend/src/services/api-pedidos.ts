import {
  formatarHora,
  STATUS_ATIVOS,
  type Pedido,
  type StatusAtivo,
  type StatusPedido,
} from '@/data/pedidos';

const BASE_URL = process.env.EXPO_PUBLIC_API_PEDIDOS_URL ?? 'http://localhost:3002/api';

/** Pedido no formato devolvido pela api-pedidos. */
type PedidoApi = {
  id: number;
  nomeCliente: string | null;
  preco: string;
  app: string;
  enderecoDestino: string;
  status: StatusPedido;
  criadoEm: string;
  itens: { quantidade: number; produto: { nome: string } }[];
  entrega: { entregador: { nome: string } | null } | null;
};

// O campo `app` chega como identificador da plataforma (ex.: "ubereats").
const CANAIS: Record<string, string> = {
  ifood: 'iFood',
  rappi: 'Rappi',
  '99food': '99 Food',
  keeta: 'Keeta',
  ubereats: 'Uber Eats',
  whatsapp: 'WhatsApp',
  balcao: 'Balcão',
};

export function nomeDoCanal(app: string) {
  return CANAIS[app.toLowerCase().replace(/\s/g, '')] ?? app;
}

function converter(pedido: PedidoApi): Pedido {
  const entregador = pedido.entrega?.entregador?.nome;
  return {
    numero: pedido.id,
    canal: nomeDoCanal(pedido.app),
    cliente: pedido.nomeCliente ?? 'Cliente não identificado',
    horario: formatarHora(new Date(pedido.criadoEm)),
    itens: pedido.itens.map((item) => `${item.quantidade}× ${item.produto.nome}`),
    entrega: entregador
      ? `Entrega própria • ${entregador}`
      : `Entrega • ${pedido.enderecoDestino}`,
    status: pedido.status as StatusAtivo,
    total: Number(pedido.preco),
  };
}

export async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${BASE_URL}${caminho}`, init);
  if (!resposta.ok) {
    throw new Error(`api-pedidos respondeu ${resposta.status}`);
  }
  return resposta.json();
}

/** Pedidos da fila (novos, em preparo e prontos), do mais recente para o mais antigo. */
export async function listarPedidosAtivos(): Promise<Pedido[]> {
  const pedidos = await requisitar<PedidoApi[]>(`/pedidos?status=${STATUS_ATIVOS.join(',')}`);
  return pedidos.map(converter);
}

export async function atualizarStatus(numero: number, status: StatusPedido): Promise<void> {
  await requisitar(`/pedidos/${numero}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}
