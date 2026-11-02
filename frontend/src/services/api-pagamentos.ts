import { requisitarApi } from './http';

const BASE_URL = process.env.EXPO_PUBLIC_API_PAGAMENTOS_URL ?? 'http://localhost:3006/api';

export type MetodoPagamento = 'cartao' | 'pix';

export type ConfigPagamento = {
  configurado: boolean;
  plano: { nome: string; valorCentavos: number };
};

export type DadosCheckout = {
  metodo: MetodoPagamento;
  email: string;
  urlRetorno: string;
  estabelecimento: string;
  razaoSocial: string;
  cnpj: string;
  responsavel: string;
};

/** Sessão do Stripe Checkout no formato devolvido pela api-pagamentos. */
export type SessaoCheckout = {
  id: string;
  status: 'open' | 'complete' | 'expired' | null;
  statusPagamento: 'paid' | 'unpaid' | 'no_payment_required';
  metodo: MetodoPagamento | null;
  valorCentavos: number | null;
  email: string | null;
  estabelecimento: string | null;
  responsavel: string | null;
  criadoEm: string;
};

export type ResultadoPagamento = 'sucesso' | 'aguardando' | 'falha';

/** Sem resposta da API, a tela segue no modo demonstração. */
export async function buscarConfigPagamento(): Promise<ConfigPagamento | null> {
  try {
    return await requisitarApi<ConfigPagamento>(BASE_URL, '/pagamentos/config');
  } catch {
    return null;
  }
}

export function criarCheckout(dados: DadosCheckout) {
  return requisitarApi<{ id: string; url: string }>(BASE_URL, '/pagamentos/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
}

export function consultarCheckout(id: string) {
  return requisitarApi<SessaoCheckout>(BASE_URL, `/pagamentos/checkout/${encodeURIComponent(id)}`);
}

/** Link de pagamento de um pedido (tabela PagamentoPedido). `valor` chega como string. */
export type LinkPagamentoPedido = {
  id: number;
  pedidoId: number;
  url: string;
  valor: string;
  status: 'pendente' | 'pago' | 'expirado' | 'falhou';
  expiraEm: string;
  reaproveitado: boolean;
};

/** Gera (ou reaproveita, se ainda válido) o link de pagamento de cartão ou Pix do pedido. */
export function gerarLinkPagamentoPedido(numero: number) {
  return requisitarApi<LinkPagamentoPedido>(BASE_URL, `/pagamentos/pedidos/${numero}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/** Traduz o estado da sessão para a etapa exibida na tela. */
export function resultadoDaSessao(sessao: SessaoCheckout): ResultadoPagamento {
  if (sessao.statusPagamento === 'paid' || sessao.statusPagamento === 'no_payment_required') return 'sucesso';
  if (sessao.status === 'expired') return 'falha';
  return 'aguardando';
}
