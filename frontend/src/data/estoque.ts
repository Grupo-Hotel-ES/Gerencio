export type ProdutoEstoque = {
  id: number;
  nome: string;
  categoria: string;
  /** Quantidade do último estoque salvo e enviado aos canais. */
  publicado: number;
  /** Quantidade em edição na tela. */
  quantidade: number;
};

export const CANAIS_CONECTADOS = ['WhatsApp', 'iFood', '99 Food', 'Uber Eats', 'Rappi', 'Keeta'];

/** Plataformas em que o produto pode ter um código próprio. O `id` é o valor gravado no MapeamentoApp. */
export const PLATAFORMAS_DELIVERY = [
  { id: 'ifood', nome: 'iFood' },
  { id: 'rappi', nome: 'Rappi' },
  { id: 'ubereats', nome: 'Uber Eats' },
  { id: '99food', nome: '99 Food' },
  { id: 'keeta', nome: 'Keeta' },
] as const;

// Dados demonstrativos, iguais aos do protótipo: a api-produtos ainda não guarda quantidade nem categoria.
export const ESTOQUE_DEMO: ProdutoEstoque[] = [
  { id: 1, nome: 'Hambúrguer da casa', categoria: 'Lanches', publicado: 18, quantidade: 16 },
  { id: 2, nome: 'Executivo de frango', categoria: 'Pratos', publicado: 24, quantidade: 24 },
  { id: 3, nome: 'Salada da estação', categoria: 'Pratos', publicado: 12, quantidade: 12 },
  { id: 4, nome: 'Batata pequena', categoria: 'Acompanhamentos', publicado: 30, quantidade: 28 },
  { id: 5, nome: 'Refrigerante lata', categoria: 'Bebidas', publicado: 48, quantidade: 48 },
  { id: 6, nome: 'Suco natural', categoria: 'Bebidas', publicado: 0, quantidade: 0 },
];

export const ULTIMA_SINCRONIZACAO_DEMO = '12:38';
