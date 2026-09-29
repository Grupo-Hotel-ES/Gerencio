/**
 * "Banco de dados" do mock — em memória.
 *
 * Um mock não precisa de PostgreSQL: os dados vivem num Map e somem quando o
 * processo morre. Isso é uma vantagem, não uma limitação — cada vez que você
 * reinicia o mock, começa de um estado limpo e previsível para testar.
 */

import { randomUUID } from 'node:crypto';
import type { ItemPedido, Pedido, StatusPedido } from './types.js';
import { CANAL } from './types.js';

/** Chave = id do pedido. */
const pedidos = new Map<string, Pedido>();

/** Estoque que o Gerôncio sincroniza conosco. Chave = sku. */
const estoque = new Map<string, number>();

// --------------------------------------------------------------------------
// Dados fictícios usados para gerar pedidos aleatórios
// --------------------------------------------------------------------------

const CARDAPIO: Omit<ItemPedido, 'quantidade'>[] = [
  { sku: 'SKU-001', nome: 'Coxinha de frango', precoUnitario: 8.9 },
  { sku: 'SKU-002', nome: 'Pastel de queijo', precoUnitario: 9.5 },
  { sku: 'SKU-003', nome: 'Esfiha de carne', precoUnitario: 7.0 },
  { sku: 'SKU-004', nome: 'Refrigerante lata 350ml', precoUnitario: 6.0 },
  { sku: 'SKU-005', nome: 'Marmita executiva', precoUnitario: 28.9 },
  { sku: 'SKU-006', nome: 'Suco natural 500ml', precoUnitario: 12.0 },
];

const NOMES = [
  'Ana Lima',
  'Bruno Cardoso',
  'Carla Menezes',
  'Diego Tavares',
  'Elisa Moraes',
  'Fábio Rocha',
];

const RUAS = [
  { logradouro: 'Rua Euclides Miragaia', bairro: 'Centro' },
  { logradouro: 'Avenida Cassiano Ricardo', bairro: 'Jardim Aquarius' },
  { logradouro: 'Rua Paraibuna', bairro: 'Vila Ema' },
  { logradouro: 'Avenida Andrômeda', bairro: 'Jardim Satélite' },
];

// --------------------------------------------------------------------------
// Utilitários
// --------------------------------------------------------------------------

function sorteia<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

function inteiroEntre(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Arredonda para 2 casas, evitando o clássico 0.1 + 0.2 = 0.30000000000000004. */
function dinheiro(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// --------------------------------------------------------------------------
// Operações públicas do store
// --------------------------------------------------------------------------

/**
 * Cria um pedido fictício e guarda no store.
 * É o equivalente a "um cliente acabou de fechar o carrinho no app da 99Food".
 */
export function criarPedidoAleatorio(): Pedido {
  const quantidadeDeItens = inteiroEntre(1, 3);
  const itens: ItemPedido[] = [];

  for (let i = 0; i < quantidadeDeItens; i++) {
    const produto = sorteia(CARDAPIO);
    // Evita repetir o mesmo produto duas vezes no pedido.
    if (itens.some((item) => item.sku === produto.sku)) continue;
    itens.push({ ...produto, quantidade: inteiroEntre(1, 3) });
  }

  const rua = sorteia(RUAS);
  const subtotal = dinheiro(
    itens.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0),
  );
  const taxaEntrega = dinheiro(inteiroEntre(500, 1200) / 100);

  const pedido: Pedido = {
    id: `99F-${randomUUID().slice(0, 8).toUpperCase()}`,
    canal: CANAL,
    status: 'PENDENTE',
    criadoEm: new Date().toISOString(),
    cliente: {
      nome: sorteia(NOMES),
      telefone: `(12) 9${inteiroEntre(1000, 9999)}-${inteiroEntre(1000, 9999)}`,
    },
    endereco: {
      logradouro: rua.logradouro,
      numero: String(inteiroEntre(10, 1800)),
      bairro: rua.bairro,
      cidade: 'São José dos Campos',
      uf: 'SP',
      cep: `122${inteiroEntre(10, 99)}-${inteiroEntre(100, 999)}`,
      // Coordenadas aproximadas de São José dos Campos, com uma variação
      // pequena para que cada pedido caia num ponto diferente do mapa.
      latitude: dinheiro(-23.2237 + (Math.random() - 0.5) * 0.08),
      longitude: dinheiro(-45.9009 + (Math.random() - 0.5) * 0.08),
    },
    itens,
    subtotal,
    taxaEntrega,
    total: dinheiro(subtotal + taxaEntrega),
  };

  pedidos.set(pedido.id, pedido);
  return pedido;
}

export function buscarPedido(id: string): Pedido | undefined {
  return pedidos.get(id);
}

export function listarPedidos(status?: StatusPedido): Pedido[] {
  const todos = [...pedidos.values()];
  return status ? todos.filter((p) => p.status === status) : todos;
}

/** Marca o pedido como confirmado (chamado quando chega o acknowledgement). */
export function confirmarPedido(id: string): Pedido | undefined {
  const pedido = pedidos.get(id);
  if (!pedido) return undefined;

  pedido.status = 'CONFIRMADO';
  pedido.confirmadoEm = new Date().toISOString();
  return pedido;
}

export function cancelarPedido(id: string): Pedido | undefined {
  const pedido = pedidos.get(id);
  if (!pedido) return undefined;

  pedido.status = 'CANCELADO';
  return pedido;
}

/** Guarda a quantidade que o Gerôncio informou para um SKU. */
export function atualizarEstoque(sku: string, quantidade: number): void {
  estoque.set(sku, quantidade);
}

export function listarEstoque(): Record<string, number> {
  return Object.fromEntries(estoque);
}

/** Zera tudo. Útil para testes automatizados. */
export function limpar(): void {
  pedidos.clear();
  estoque.clear();
}