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
  entrega: { custoEntrega: string; entregador: { nome: string } | null } | null;
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
    // O cliente paga itens + taxa de entrega (é o valor cobrado no link de pagamento)
    total: Number(pedido.preco) + Number(pedido.entrega?.custoEntrega ?? 0),
    taxaEntrega: Number(pedido.entrega?.custoEntrega ?? 0),
    pagamento: situacaoPagamento(pedido),
    aceitaLinkPagamento: CANAIS_PROPRIOS.includes(pedido.app.toLowerCase()),
  };
}

export async function requisitar<T>(caminho: string, init?: RequestInit, tempoLimiteMs?: number): Promise<T> {
  return requisitarApi<T>(BASE_URL, caminho, init, tempoLimiteMs);
}

/** Pedidos ativos, incluindo os que estão em entrega, do mais recente para o mais antigo. */
export async function listarPedidosAtivos(): Promise<Pedido[]> {
  const pedidos = await requisitar<PedidoApi[]>(`/pedidos?status=${STATUS_ATIVOS.join(',')}`);
  return pedidos.map(converter);
}

/** O restaurante (único) vem dos produtos do pedido. */
export type NovoPedido = {
  nomeCliente: string;
  app: 'balcao' | 'whatsapp';
  metodoPagamento: string;
  enderecoDestino: string;
  cepDestino: string;
  itens: { produtoId: number; quantidade: number }[];
  // Frete já cotado: sem ele, a api-pedidos calcula sozinha ao criar uma entrega
  custoEntrega?: number;
  distanciaKm?: number;
  latitude?: number;
  longitude?: number;
};

/** Cotação de entrega pela rota nas vias (api-pedidos). */
export type CotacaoFrete = {
  taxaEntrega: number | null;
  distanciaKm: number;
  duracaoEstimadaMinutos: number;
  dentroDaAreaEntrega: boolean;
  motivoRecusa?: string;
  destino: { latitude: number; longitude: number };
};

export async function cotarFrete(enderecoDestino: string, cepDestino: string) {
  return requisitar<CotacaoFrete>('/pedidos/cotacao-frete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enderecoDestino, cepDestino }),
  });
}

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
