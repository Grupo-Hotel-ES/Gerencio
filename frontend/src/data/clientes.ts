export type Cliente = {
  id: number;
  nome: string;
  endereco: string;
  telefone: string | null;
  /** Quantidade de pedidos do cliente (só na listagem). */
  pedidos: number;
};

/** Dados digitados no cadastro ou no pedido; telefone vazio fica sem telefone. */
export type DadosCliente = {
  nome: string;
  endereco: string;
  telefone?: string;
};

/** Resumo em uma linha, usado no aviso de cliente já cadastrado. */
export function descreverCliente(cliente: Cliente) {
  return [cliente.nome, cliente.endereco, cliente.telefone].filter(Boolean).join(' • ');
}
