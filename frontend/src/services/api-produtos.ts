import { requisitarApi } from './http';

const BASE_URL = process.env.EXPO_PUBLIC_API_PRODUTOS_URL ?? 'http://localhost:3004';

export type Restaurante = { id: number; nome: string; endereco?: string; cidade?: string };
export type Produto = {
  id: number;
  nome: string;
  preco: number;
  categoria: string;
  quantidade: number;
  versaoEstoque: number;
  restauranteId: number;
  restaurante?: Restaurante;
};
type ProdutoApi = Omit<Produto, 'preco'> & { preco: string };
const converter = (produto: ProdutoApi): Produto => ({ ...produto, preco: Number(produto.preco) });

export async function listarProdutos(): Promise<Produto[]> {
  const produtos = await requisitarApi<ProdutoApi[]>(BASE_URL, '/produtos');
  return produtos.map(converter);
}

/**
 * Liga os IDs que o produto tem nas plataformas a um produto do Gerêncio. O estoque e o preço
 * informados passam a valer para todas as plataformas vinculadas.
 */
export async function vincularProduto(dados: Pick<Produto, 'nome' | 'preco' | 'categoria' | 'quantidade'> & {
  vinculos: { plataforma: string; idExternoApp: string }[];
}) {
  return converter(await requisitarApi<ProdutoApi>(BASE_URL, '/produtos/vincular', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  }));
}

/** Quantidade não entra aqui: o saldo só muda por `salvarEstoque`, que confere a versão. */
export async function atualizarProduto(id: number, dados: Pick<Produto, 'nome' | 'categoria' | 'preco'>) {
  return converter(await requisitarApi<ProdutoApi>(BASE_URL, `/produtos/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  }));
}

/**
 * A exclusão pelo painel arquiva o produto: ele sai do estoque e fica indisponível nas plataformas
 * vinculadas, mas continua nos pedidos e relatórios. Repor unidades no portal de uma plataforma
 * traz o produto de volta, por isso ele não é apagado de vez.
 */
export async function excluirProduto(id: number) {
  await requisitarApi<ProdutoApi>(BASE_URL, `/produtos/${id}/arquivar`, { method: 'POST' });
}

/** Código (SKU) que o produto tem em uma plataforma de delivery (tabela MapeamentoApp). */
export type Mapeamento = { id: number; produtoId: number; plataforma: string; idExternoApp: string };

export function listarMapeamentos() {
  return requisitarApi<Mapeamento[]>(BASE_URL, '/mapeamentos');
}

export function criarMapeamento(dados: Omit<Mapeamento, 'id'>) {
  return requisitarApi<Mapeamento>(BASE_URL, '/mapeamentos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  });
}

export async function removerMapeamento(id: number) {
  await requisitarApi<null>(BASE_URL, `/mapeamentos/${id}`, { method: 'DELETE' });
}

export async function salvarEstoque(ajustes: { produtoId: number; quantidade: number; versaoEstoque: number }[]) {
  const produtos = await requisitarApi<ProdutoApi[]>(BASE_URL, '/estoque', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ajustes }),
  });
  return produtos.map(converter);
}
