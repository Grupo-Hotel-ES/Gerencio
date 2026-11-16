import { requisitarApi } from './http';

const BASE_URL = process.env.EXPO_PUBLIC_API_INTEGRACAO_URL ?? 'http://localhost:3005/api';

/** Produto como está cadastrado na plataforma de delivery. */
export type ProdutoNaPlataforma = {
  plataforma: string;
  idExterno: string;
  nome: string;
  categoria: string;
  preco: number;
  quantidade: number;
};

/** Confere se o ID existe no cardápio da plataforma (usado ao vincular). */
export function consultarProdutoNaPlataforma(plataforma: string, idExterno: string) {
  return requisitarApi<ProdutoNaPlataforma>(BASE_URL, `/catalogo/${plataforma}/${encodeURIComponent(idExterno.trim())}`, undefined, 8_000);
}

export type VinculoSincronizado = {
  mapeamentoId: number;
  produtoId: number;
  plataforma: string;
  idExterno: string;
  quantidadeEnviada: number | null;
  sincronizadoEm: string | null;
  erro: string | null;
};

export type SituacaoSincronizacao = {
  vinculos: VinculoSincronizado[];
  /** Unidades em pedidos de plataforma ainda não aceitos, descontadas do saldo enviado. */
  reservas: { produtoId: number; quantidade: number }[];
};

export function consultarSincronizacao() {
  return requisitarApi<SituacaoSincronizacao>(BASE_URL, '/sincronizacao/estoque');
}

/** Reenvia estoque e preço de todos os produtos vinculados. */
export function sincronizarAgora() {
  return requisitarApi<SituacaoSincronizacao>(BASE_URL, '/sincronizacao/estoque', { method: 'POST' }, 30_000);
}
