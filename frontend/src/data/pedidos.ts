import type { CoresTema } from '@/constants/tokens';

/** Status do pedido na api-pedidos (enum `StatusPedido` do backend). */
export type StatusPedido =
  | 'novo'
  | 'em_preparo'
  | 'pronto'
  | 'saiu_para_entrega'
  | 'entregue'
  | 'cancelado';

/** Status que aparecem na fila do dashboard. */
export const STATUS_ATIVOS = ['novo', 'em_preparo', 'pronto', 'saiu_para_entrega'] as const satisfies StatusPedido[];
export type StatusAtivo = (typeof STATUS_ATIVOS)[number];

export type Pedido = {
  numero: number;
  restaurante: string;
  canal: string;
  cliente: string;
  horario: string;
  itens: string[];
  entrega: string;
  status: StatusAtivo;
  total: number;
};

export const STATUS: Record<
  StatusAtivo,
  { rotulo: string; cor: keyof CoresTema; acao: string; proximo: StatusPedido }
> = {
  novo: { rotulo: 'Novo', cor: 'statusNovo', acao: 'Aceitar pedido', proximo: 'em_preparo' },
  em_preparo: {
    rotulo: 'Preparando',
    cor: 'statusPreparando',
    acao: 'Marcar como pronto',
    proximo: 'pronto',
  },
  pronto: {
    rotulo: 'Pronto',
    cor: 'statusPronto',
    acao: 'Confirmar saída',
    proximo: 'saiu_para_entrega',
  },
  saiu_para_entrega: {
    rotulo: 'Em entrega',
    cor: 'statusNovo',
    acao: 'Confirmar entrega',
    proximo: 'entregue',
  },
};

export function formatarReais(valor: number, casas = 2) {
  const numero = valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
  return `R$ ${numero}`;
}

export function formatarHora(data: Date) {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
