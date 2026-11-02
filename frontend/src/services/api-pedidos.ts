import {
  formatarHora,
  type SituacaoPagamento,
  STATUS_ATIVOS,
  type Pedido,
  type StatusAtivo,
  type StatusPedido,
} from '@/data/pedidos';
import { requisitarApi } from './http';

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
  restaurante: { id: number; nome: string } | null;
  metodoPagamento: string;
  pagamentos?: { status: 'pendente' | 'pago' | 'expirado' | 'falhou'; expiraEm: string }[];
};

const METODOS: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', online: 'Online' };
const CANAIS_PROPRIOS = ['whatsapp', 'balcao'];

function situacaoPagamento(pedido: PedidoApi): SituacaoPagamento {
  const pagamentos = pedido.pagamentos ?? [];
  if (pagamentos.some((p) => p.status === 'pago')) return { tipo: 'pago', rotulo: 'Pago online' };
  // Sem webhook, o status pode continuar "pendente" depois de vencer: confere a validade também
  if (pagamentos.some((p) => p.status === 'pendente' && new Date(p.expiraEm) > new Date())) {
    return { tipo: 'aguardando', rotulo: 'Aguardando pagamento' };
  }
  if (pedido.metodoPagamento === 'online') return { tipo: 'online_pendente', rotulo: 'Pagamento online pendente' };
  return { tipo: 'na_entrega', rotulo: `Pagamento: ${METODOS[pedido.metodoPagamento] ?? pedido.metodoPagamento}` };
}

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
    restaurante: pedido.restaurante?.nome ?? 'Restaurante não identificado',
    canal: nomeDoCanal(pedido.app),
    cliente: pedido.nomeCliente ?? 'Cliente não identificado',
    horario: formatarHora(new Date(pedido.criadoEm)),
    itens: pedido.itens.map((item) => `${item.quantidade}× ${item.produto.nome}`),
    entrega: entregador
      ? `Entrega própria • ${entregador}`
      : `Entrega • ${pedido.enderecoDestino}`,
    status: pedido.status as StatusAtivo,
    total: Number(pedido.preco),
    pagamento: situacaoPagamento(pedido),
    aceitaLinkPagamento: CANAIS_PROPRIOS.includes(pedido.app.toLowerCase()),
  };
}

export async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  return requisitarApi<T>(BASE_URL, caminho, init);
}

/** Pedidos ativos, incluindo os que estão em entrega, do mais recente para o mais antigo. */
export async function listarPedidosAtivos(restauranteId?: number): Promise<Pedido[]> {
  const pedidos = await requisitar<PedidoApi[]>(`/pedidos?status=${STATUS_ATIVOS.join(',')}${restauranteId ? `&restauranteId=${restauranteId}` : ''}`);
  return pedidos.map(converter);
}

export type NovoPedido = {
  restauranteId: number;
  nomeCliente: string;
  app: 'balcao' | 'whatsapp';
  metodoPagamento: string;
  enderecoDestino: string;
  cepDestino: string;
  itens: { produtoId: number; quantidade: number }[];
};

export async function criarPedido(dados: NovoPedido): Promise<void> {
  await requisitar('/pedidos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  });
}

export async function atualizarStatus(numero: number, status: StatusPedido): Promise<void> {
  await requisitar(`/pedidos/${numero}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}
