import { requisitarApi } from './http';

const BASE_URL = process.env.EXPO_PUBLIC_API_PRODUTOS_URL ?? 'http://localhost:3004';
const RESTAURANTES_URL = process.env.EXPO_PUBLIC_API_RESTAURANTES_URL ?? 'http://localhost:3003/api';

export type Restaurante = { id: number; nome: string };
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

export function listarRestaurantes() {
  return requisitarApi<Restaurante[]>(RESTAURANTES_URL, '/restaurantes');
}

export async function listarProdutos(restauranteId?: number): Promise<Produto[]> {
  const produtos = await requisitarApi<ProdutoApi[]>(BASE_URL, `/produtos${restauranteId ? `?restauranteId=${restauranteId}` : ''}`);
  return produtos.map(converter);
}

export async function criarProduto(dados: Pick<Produto, 'nome' | 'preco' | 'categoria' | 'quantidade' | 'restauranteId'>) {
  return converter(await requisitarApi<ProdutoApi>(BASE_URL, '/produtos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  }));
}

export async function salvarEstoque(ajustes: { produtoId: number; quantidade: number; versaoEstoque: number }[]) {
  const produtos = await requisitarApi<ProdutoApi[]>(BASE_URL, '/estoque', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ajustes }),
  });
  return produtos.map(converter);
}
