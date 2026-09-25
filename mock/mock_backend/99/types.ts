/**
 * Tipos (contratos de dados) do mock da 99Food.
 *
 * Este arquivo é o "contrato" entre o mock e o Gerôncio: define exatamente
 * o formato dos dados que trafegam entre os dois. Quem for implementar o
 * lado do Gerôncio deve ler este arquivo para saber o que esperar.
 */

/** Identificador do canal. Fixo, já que este mock representa só a 99Food. */
export const CANAL = '99FOOD' as const;
export type Canal = typeof CANAL;

/**
 * Ciclo de vida de um pedido dentro do mock:
 *
 *   PENDENTE  -> criado, notificado, mas o Gerôncio ainda não confirmou
 *   CONFIRMADO -> o Gerôncio buscou os detalhes e mandou o acknowledgement
 *   CANCELADO  -> cancelado (pelo cliente ou por timeout)
 */
export type StatusPedido = 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO';

/** Um item dentro do pedido. */
export interface ItemPedido {
  /** Código do produto no catálogo do restaurante (Stock Keeping Unit). */
  sku: string;
  nome: string;
  quantidade: number;
  /** Em reais. Ex: 8.9 */
  precoUnitario: number;
  /** Observação do cliente para este item. Ex: "sem cebola" */
  observacao?: string;
}

export interface EnderecoEntrega {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  /** Coordenadas — o Gerôncio usa isso para alocação de entregador e rota. */
  latitude: number;
  longitude: number;
}

export interface Cliente {
  nome: string;
  telefone: string;
}

/** Representação completa de um pedido (o que o Gerôncio recebe no GET). */
export interface Pedido {
  id: string;
  canal: Canal;
  status: StatusPedido;
  /** ISO 8601. Ex: "2026-09-20T14:32:10.000Z" */
  criadoEm: string;
  confirmadoEm?: string;
  cliente: Cliente;
  endereco: EnderecoEntrega;
  itens: ItemPedido[];
  /** Soma dos itens, sem frete. */
  subtotal: number;
  taxaEntrega: number;
  total: number;
}

/**
 * Mensagem enviada pelo WebSocket quando um pedido novo entra.
 *
 * Repare que ela NÃO carrega o pedido inteiro — só o ID. Isso é proposital e
 * espelha como as plataformas reais funcionam: a notificação serve apenas
 * como um "aviso", e o consumidor busca os detalhes depois (ver o guia).
 */
export interface NotificacaoNovoPedido {
  tipo: 'NOVO_PEDIDO';
  canal: Canal;
  pedidoId: string;
  emitidoEm: string;
}

/** Corpo esperado no acknowledgement enviado pelo Gerôncio. */
export interface AcknowledgementBody {
  /** Se o restaurante aceitou ou recusou o pedido. */
  aceito: boolean;
  /** Obrigatório quando `aceito` for false. */
  motivoRecusa?: string;
}

/** Corpo esperado na atualização de estoque vinda do Gerôncio. */
export interface AtualizacaoEstoqueBody {
  /** Quantidade disponível agora. Use 0 para marcar como esgotado. */
  quantidadeDisponivel: number;
}

/** Formato padrão de erro devolvido pela API. */
export interface ErroApi {
  erro: string;
  mensagem: string;
}