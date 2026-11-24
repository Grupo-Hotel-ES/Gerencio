import { useEffect, useState } from 'react';
import {
  atualizarCacheLeitura,
  lerCacheLeitura,
  montarChaveCache,
  registrarSucessoConexao,
  registrarUsoCacheOffline,
  salvarCacheLeitura,
} from './cache-offline';
import { ErroApi, requisitarApi } from './http';
import { STATUS_ATIVOS, type StatusPedido } from '@/data/pedidos';
import type { NovoPedido, RevisaoCaixa } from './api-pedidos';

const CHAVE_FILA_STORAGE = 'geroncio.fila_offline.v1';
const CHAVE_SEQ_STORAGE = 'geroncio.fila_offline.seq.v1';

const BASE_PEDIDOS = process.env.EXPO_PUBLIC_API_PEDIDOS_URL ?? 'http://localhost:3002/api';
const BASE_PRODUTOS = process.env.EXPO_PUBLIC_API_PRODUTOS_URL ?? 'http://localhost:3004';

export type StatusItemFila = 'pendente' | 'sincronizando' | 'erro_conflito';

export type OperacaoCriarPedidoOffline = {
  idOperacao: string;
  tipo: 'CRIAR_PEDIDO';
  idProvisorio: number;
  dados: NovoPedido;
  /** Preenchida assim que o servidor emite a chave antes do POST /pedidos (idempotência HOT-234). */
  chaveVerificacao?: string;
  /** ID real no servidor caso o POST /pedidos já tenha concluído mas faltou confirmar/avançar status. */
  idServidor?: number;
  versaoServidor?: number;
  /** true quando o caixa já clicou em "Confirmar pedido" na revisão enquanto estava offline. */
  confirmadoNoCaixa: boolean;
  /** Status final caso o pedido tenha avançado na cozinha/entrega enquanto offline. */
  statusDesejado?: StatusPedido;
  criadoEm: string;
  statusFila: StatusItemFila;
  mensagemErro?: string;
};

export type OperacaoVerificacaoOffline = {
  idOperacao: string;
  tipo: 'VERIFICACAO_PEDIDO';
  pedidoId: number;
  acao: 'alterar' | 'confirmar' | 'cancelar';
  versao: number;
  itens: { produtoId: number; quantidade: number }[];
  criadoEm: string;
  statusFila: StatusItemFila;
  mensagemErro?: string;
};

export type OperacaoStatusPedidoOffline = {
  idOperacao: string;
  tipo: 'MUDAR_STATUS_PEDIDO';
  pedidoId: number;
  status: StatusPedido;
  criadoEm: string;
  statusFila: StatusItemFila;
  mensagemErro?: string;
};

export type OperacaoFilaOffline =
  | OperacaoCriarPedidoOffline
  | OperacaoVerificacaoOffline
  | OperacaoStatusPedidoOffline;

export type ResumoFilaOffline = {
  itens: OperacaoFilaOffline[];
  pendentes: number;
  conflitos: number;
  sincronizando: boolean;
};

type ProdutoCache = {
  id: number;
  nome: string;
  preco: string | number;
  categoria: string;
  quantidade: number;
  versaoEstoque: number;
  restauranteId: number;
  restaurante?: { id: number; nome: string };
};

type PedidoApiCache = {
  id: number;
  cliente: { id: number; nomeCliente: string } | null;
  preco: string;
  app: string;
  enderecoDestino: string;
  status: StatusPedido;
  criadoEm: string;
  itens: { produtoId?: number; quantidade: number; produto: { nome: string } }[];
  entrega: { custoEntrega: string; entregador: { nome: string } | null } | null;
  restaurante: { id: number; nome: string } | null;
  metodoPagamento: string;
  pagamentos?: { status: 'pendente' | 'pago' | 'expirado' | 'falhou'; expiraEm: string }[];
};

let memoriaFila: OperacaoFilaOffline[] = [];
let memoriaSeq = -1;
let emSincronizacao = false;
const ouvintesFila = new Set<(resumo: ResumoFilaOffline) => void>();

function obterLocalStorage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis.localStorage ?? null)
      : null;
  } catch {
    return null;
  }
}

function carregarFilaInicial(): OperacaoFilaOffline[] {
  const storage = obterLocalStorage();
  if (storage) {
    try {
      const bruto = storage.getItem(CHAVE_FILA_STORAGE);
      if (bruto) {
        const parsed = JSON.parse(bruto);
        if (Array.isArray(parsed)) {
          memoriaFila = parsed;
          return memoriaFila;
        }
      }
    } catch {
      // Usa memória
    }
  }
  return memoriaFila;
}

carregarFilaInicial();

function persistirFila() {
  const storage = obterLocalStorage();
  if (storage) {
    try {
      storage.setItem(CHAVE_FILA_STORAGE, JSON.stringify(memoriaFila));
    } catch {
      // Ignora erro de quota
    }
  }
  notificarFila();
}

function gerarProximoIdProvisorio(): number {
  const storage = obterLocalStorage();
  if (storage) {
    try {
      const salvo = Number(storage.getItem(CHAVE_SEQ_STORAGE));
      if (Number.isInteger(salvo) && salvo < 0) {
        memoriaSeq = salvo - 1;
      }
    } catch {
      // Continua com memoriaSeq
    }
  }
  const id = memoriaSeq;
  memoriaSeq -= 1;
  if (storage) {
    try {
      storage.setItem(CHAVE_SEQ_STORAGE, String(id));
    } catch {
      // Ignora
    }
  }
  return id;
}

export function obterResumoFilaOffline(): ResumoFilaOffline {
  const pendentes = memoriaFila.filter((op) => op.statusFila !== 'erro_conflito').length;
  const conflitos = memoriaFila.filter((op) => op.statusFila === 'erro_conflito').length;
  return {
    itens: [...memoriaFila],
    pendentes,
    conflitos,
    sincronizando: emSincronizacao,
  };
}

function notificarFila() {
  const resumo = obterResumoFilaOffline();
  ouvintesFila.forEach((ouvinte) => {
    ouvinte(resumo);
  });
}

export function inscreverFilaOffline(ouvinte: (resumo: ResumoFilaOffline) => void): () => void {
  ouvintesFila.add(ouvinte);
  return () => {
    ouvintesFila.delete(ouvinte);
  };
}

export function useFilaOffline(): ResumoFilaOffline {
  const [resumo, setResumo] = useState<ResumoFilaOffline>(obterResumoFilaOffline);
  useEffect(() => {
    setResumo(obterResumoFilaOffline());
    return inscreverFilaOffline(setResumo);
  }, []);
  return resumo;
}

/** Limpa toda a fila offline (usado em testes ou ao encerrar sessão). */
export function limparFilaOffline(): void {
  memoriaFila = [];
  memoriaSeq = -1;
  const storage = obterLocalStorage();
  if (storage) {
    try {
      storage.removeItem(CHAVE_FILA_STORAGE);
      storage.removeItem(CHAVE_SEQ_STORAGE);
    } catch {
      // Ignora
    }
  }
  notificarFila();
}

/** Remove uma operação específica (ex.: descartar um item em conflito). */
export function removerOperacaoFilaOffline(idOperacao: string): void {
  memoriaFila = memoriaFila.filter((op) => op.idOperacao !== idOperacao);
  persistirFila();
}

function chaveCacheProdutos() {
  return montarChaveCache(BASE_PRODUTOS, '/produtos');
}

function chaveCacheVerificacoes() {
  return montarChaveCache(BASE_PEDIDOS, '/pedidos?status=em_verificacao');
}

function chaveCachePedidosAtivos() {
  return montarChaveCache(BASE_PEDIDOS, `/pedidos?status=${STATUS_ATIVOS.join(',')}`);
}

function lerProdutosDoCache(): ProdutoCache[] {
  return lerCacheLeitura<ProdutoCache[]>(chaveCacheProdutos())?.dados ?? [];
}

/**
 * Aplica uma variação (`deltas`: produtoId -> delta positivo ou negativo) no estoque do cache local.
 * Valida se há saldo suficiente antes de descontar.
 */
function ajustarEstoqueCacheLocal(deltas: Map<number, number>): ProdutoCache[] {
  const produtos = lerProdutosDoCache();
  if (produtos.length === 0) {
    throw new Error('Catálogo de produtos indisponível no cache offline. Conecte-se uma vez para carregar o estoque.');
  }

  const mapaProdutos = new Map(produtos.map((p) => [p.id, p]));
  deltas.forEach((delta, produtoId) => {
    const prod = mapaProdutos.get(produtoId);
    if (!prod) {
      throw new Error(`Produto #${produtoId} não encontrado no catálogo local.`);
    }
    if (prod.quantidade + delta < 0) {
      throw new Error(
        `Estoque insuficiente de ${prod.nome} no modo offline (disponível: ${prod.quantidade} un.).`,
      );
    }
  });

  const atualizados = produtos.map((prod) => {
    const delta = deltas.get(prod.id) ?? 0;
    if (delta === 0) return prod;
    return {
      ...prod,
      quantidade: prod.quantidade + delta,
    };
  });

  salvarCacheLeitura(chaveCacheProdutos(), atualizados);
  return atualizados;
}

/**
 * Cria um pedido em modo offline:
 * 1. Valida e desconta otimisticamente o saldo no cache local de produtos.
 * 2. Grava a revisão provisória no cache de `/pedidos?status=em_verificacao`.
 * 3. Enfileira a operação `CRIAR_PEDIDO` na Outbox para sincronizar quando a internet voltar.
 */
export function criarPedidoOffline(dados: NovoPedido): RevisaoCaixa {
  const deltas = new Map<number, number>();
  for (const item of dados.itens) {
    deltas.set(item.produtoId, (deltas.get(item.produtoId) ?? 0) - item.quantidade);
  }

  const produtosAtualizados = ajustarEstoqueCacheLocal(deltas);
  const mapaProdutos = new Map(produtosAtualizados.map((p) => [p.id, p]));

  const idProvisorio = gerarProximoIdProvisorio();
  const primeiroProduto = produtosAtualizados[0];
  const restauranteId = primeiroProduto?.restauranteId ?? 1;

  let subtotal = 0;
  const itensRevisao = dados.itens.map((item) => {
    const prod = mapaProdutos.get(item.produtoId)!;
    subtotal += Number(prod.preco) * item.quantidade;
    return {
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      produto: { nome: prod.nome },
    };
  });

  const nomeCliente = dados.cliente?.nome ?? 'Cliente (Offline)';
  const revisao: RevisaoCaixa = {
    id: idProvisorio,
    status: 'em_verificacao',
    versaoVerificacao: 0,
    restauranteId,
    cliente: { nomeCliente },
    preco: subtotal.toFixed(2),
    entrega:
      dados.custoEntrega !== undefined
        ? { custoEntrega: Number(dados.custoEntrega).toFixed(2) }
        : null,
    itens: itensRevisao,
  };

  // Adiciona ao cache local de pedidos em verificação
  const chaveVerif = chaveCacheVerificacoes();
  const verificacoesAtuais = lerCacheLeitura<RevisaoCaixa[]>(chaveVerif)?.dados ?? [];
  salvarCacheLeitura(chaveVerif, [revisao, ...verificacoesAtuais]);

  // Adiciona à fila Outbox
  const operacao: OperacaoCriarPedidoOffline = {
    idOperacao: `op-criar-${Math.abs(idProvisorio)}-${Date.now()}`,
    tipo: 'CRIAR_PEDIDO',
    idProvisorio,
    dados,
    confirmadoNoCaixa: false,
    criadoEm: new Date().toISOString(),
    statusFila: 'pendente',
  };

  memoriaFila.push(operacao);
  persistirFila();
  registrarUsoCacheOffline(new Date().toISOString());

  return revisao;
}

/**
 * Executa alteração, confirmação ou cancelamento da revisão do caixa em modo offline.
 */
export function atualizarVerificacaoOffline(
  pedidoId: number,
  acao: 'alterar' | 'confirmar' | 'cancelar',
  versao: number,
  itens: { produtoId: number; quantidade: number }[],
): RevisaoCaixa {
  const chaveVerif = chaveCacheVerificacoes();
  const verificacoes = lerCacheLeitura<RevisaoCaixa[]>(chaveVerif)?.dados ?? [];
  const revisaoAtual = verificacoes.find((r) => r.id === pedidoId);

  const produtos = lerProdutosDoCache();
  const mapaProdutos = new Map(produtos.map((p) => [p.id, p]));

  if (acao === 'alterar') {
    if (!revisaoAtual) {
      throw new Error('Revisão não encontrada no cache local.');
    }
    const deltas = new Map<number, number>();
    for (const itemAntigo of revisaoAtual.itens) {
      deltas.set(itemAntigo.produtoId, (deltas.get(itemAntigo.produtoId) ?? 0) + itemAntigo.quantidade);
    }
    for (const itemNovo of itens) {
      deltas.set(itemNovo.produtoId, (deltas.get(itemNovo.produtoId) ?? 0) - itemNovo.quantidade);
    }

    ajustarEstoqueCacheLocal(deltas);

    let novoSubtotal = 0;
    const novosItensRevisao = itens.map((item) => {
      const prod = mapaProdutos.get(item.produtoId);
      const nome = prod?.nome ?? `Produto #${item.produtoId}`;
      novoSubtotal += Number(prod?.preco ?? 0) * item.quantidade;
      return {
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        produto: { nome },
      };
    });

    const revisaoAtualizada: RevisaoCaixa = {
      ...revisaoAtual,
      versaoVerificacao: revisaoAtual.versaoVerificacao + 1,
      preco: novoSubtotal.toFixed(2),
      itens: novosItensRevisao,
    };

    salvarCacheLeitura(
      chaveVerif,
      verificacoes.map((r) => (r.id === pedidoId ? revisaoAtualizada : r)),
    );

    const opCriar = memoriaFila.find(
      (op): op is OperacaoCriarPedidoOffline =>
        op.tipo === 'CRIAR_PEDIDO' && op.idProvisorio === pedidoId,
    );
    if (opCriar) {
      opCriar.dados = { ...opCriar.dados, itens };
    } else {
      memoriaFila.push({
        idOperacao: `op-verif-${pedidoId}-${Date.now()}`,
        tipo: 'VERIFICACAO_PEDIDO',
        pedidoId,
        acao: 'alterar',
        versao,
        itens,
        criadoEm: new Date().toISOString(),
        statusFila: 'pendente',
      });
    }
    persistirFila();
    return revisaoAtualizada;
  }

  if (acao === 'cancelar') {
    if (revisaoAtual) {
      const deltas = new Map<number, number>();
      for (const item of revisaoAtual.itens) {
        deltas.set(item.produtoId, (deltas.get(item.produtoId) ?? 0) + item.quantidade);
      }
      ajustarEstoqueCacheLocal(deltas);
      salvarCacheLeitura(
        chaveVerif,
        verificacoes.filter((r) => r.id !== pedidoId),
      );
    }

    if (pedidoId < 0) {
      // Pedido provisório que ainda nem foi enviado ao servidor: basta remover da fila!
      memoriaFila = memoriaFila.filter(
        (op) => !(op.tipo === 'CRIAR_PEDIDO' && op.idProvisorio === pedidoId),
      );
    } else {
      memoriaFila.push({
        idOperacao: `op-cancel-verif-${pedidoId}-${Date.now()}`,
        tipo: 'VERIFICACAO_PEDIDO',
        pedidoId,
        acao: 'cancelar',
        versao,
        itens,
        criadoEm: new Date().toISOString(),
        statusFila: 'pendente',
      });
    }
    persistirFila();
    return (
      revisaoAtual ?? {
        id: pedidoId,
        status: 'cancelado',
        versaoVerificacao: versao + 1,
        restauranteId: 1,
        cliente: null,
        preco: '0.00',
        entrega: null,
        itens: [],
      }
    );
  }

  // acao === 'confirmar'
  if (revisaoAtual) {
    salvarCacheLeitura(
      chaveVerif,
      verificacoes.filter((r) => r.id !== pedidoId),
    );
  }

  const opCriar = memoriaFila.find(
    (op): op is OperacaoCriarPedidoOffline =>
      op.tipo === 'CRIAR_PEDIDO' && op.idProvisorio === pedidoId,
  );

  if (opCriar) {
    opCriar.confirmadoNoCaixa = true;
  } else {
    memoriaFila.push({
      idOperacao: `op-confirm-verif-${pedidoId}-${Date.now()}`,
      tipo: 'VERIFICACAO_PEDIDO',
      pedidoId,
      acao: 'confirmar',
      versao,
      itens,
      criadoEm: new Date().toISOString(),
      statusFila: 'pendente',
    });
  }

  // Move o pedido confirmado para o cache local de pedidos ativos (`/pedidos?status=novo,...`)
  const chaveAtivos = chaveCachePedidosAtivos();
  const ativosAtuais = lerCacheLeitura<PedidoApiCache[]>(chaveAtivos)?.dados ?? [];
  const primeiroProd = produtos[0];
  const novoPedidoAtivo: PedidoApiCache = {
    id: pedidoId,
    cliente: {
      id: opCriar?.dados.clienteId ?? 0,
      nomeCliente: revisaoAtual?.cliente?.nomeCliente ?? opCriar?.dados.cliente?.nome ?? 'Cliente Balcão',
    },
    preco: revisaoAtual?.preco ?? '0.00',
    app: opCriar?.dados.app ?? 'balcao',
    enderecoDestino: opCriar?.dados.enderecoDestino ?? 'Retirada no balcão',
    status: 'novo',
    criadoEm: opCriar?.criadoEm ?? new Date().toISOString(),
    itens:
      revisaoAtual?.itens.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        produto: { nome: i.produto.nome },
      })) ?? [],
    entrega: revisaoAtual?.entrega
      ? { custoEntrega: revisaoAtual.entrega.custoEntrega, entregador: null }
      : null,
    restaurante: {
      id: revisaoAtual?.restauranteId ?? primeiroProd?.restauranteId ?? 1,
      nome: primeiroProd?.restaurante?.nome ?? 'Restaurante Local',
    },
    metodoPagamento: opCriar?.dados.metodoPagamento ?? 'dinheiro',
    pagamentos: [],
  };

  salvarCacheLeitura(chaveAtivos, [
    novoPedidoAtivo,
    ...ativosAtuais.filter((p) => p.id !== pedidoId),
  ]);
  persistirFila();

  return {
    ...(revisaoAtual ?? {
      id: pedidoId,
      versaoVerificacao: versao + 1,
      restauranteId: 1,
      cliente: novoPedidoAtivo.cliente,
      preco: novoPedidoAtivo.preco,
      entrega: novoPedidoAtivo.entrega,
      itens: [],
    }),
    status: 'novo',
  };
}

/**
 * Atualiza o status de um pedido ativo em modo offline (ex.: Novo -> Preparando -> Pronto -> Entregue ou Cancelado).
 */
export function atualizarStatusPedidoOffline(pedidoId: number, novoStatus: StatusPedido): void {
  const chaveAtivos = chaveCachePedidosAtivos();
  const ativosAtuais = lerCacheLeitura<PedidoApiCache[]>(chaveAtivos)?.dados ?? [];
  const pedidoNoCache = ativosAtuais.find((p) => p.id === pedidoId);

  // Se o pedido for cancelado offline, devolve as unidades ao estoque local
  if (novoStatus === 'cancelado' && pedidoNoCache && pedidoNoCache.status !== 'cancelado') {
    const produtos = lerProdutosDoCache();
    const mapaPorNome = new Map(produtos.map((p) => [p.nome, p.id]));
    const deltas = new Map<number, number>();
    for (const item of pedidoNoCache.itens) {
      const prodId = item.produtoId ?? mapaPorNome.get(item.produto.nome);
      if (prodId !== undefined) {
        deltas.set(prodId, (deltas.get(prodId) ?? 0) + item.quantidade);
      }
    }
    if (deltas.size > 0) {
      ajustarEstoqueCacheLocal(deltas);
    }
  }

  // Atualiza ou remove (se entregue/cancelado) da fila de pedidos ativos em cache
  const permaneceAtivo = (STATUS_ATIVOS as readonly string[]).includes(novoStatus);
  if (permaneceAtivo) {
    atualizarCacheLeitura<PedidoApiCache[]>(chaveAtivos, (lista) =>
      lista.map((p) => (p.id === pedidoId ? { ...p, status: novoStatus } : p)),
    );
  } else {
    atualizarCacheLeitura<PedidoApiCache[]>(chaveAtivos, (lista) =>
      lista.filter((p) => p.id !== pedidoId),
    );
  }

  const opCriar = memoriaFila.find(
    (op): op is OperacaoCriarPedidoOffline =>
      op.tipo === 'CRIAR_PEDIDO' && op.idProvisorio === pedidoId,
  );

  if (opCriar) {
    if (novoStatus === 'cancelado' && !opCriar.idServidor) {
      // Pedido provisório criado e cancelado ainda offline: remove da fila para não enviar
      memoriaFila = memoriaFila.filter((op) => op !== opCriar);
    } else {
      opCriar.statusDesejado = novoStatus;
    }
  } else {
    memoriaFila.push({
      idOperacao: `op-status-${pedidoId}-${Date.now()}`,
      tipo: 'MUDAR_STATUS_PEDIDO',
      pedidoId,
      status: novoStatus,
      criadoEm: new Date().toISOString(),
      statusFila: 'pendente',
    });
  }

  persistirFila();
}

const CAMINHO_STATUS: StatusPedido[] = ['novo', 'em_preparo', 'pronto', 'saiu_para_entrega', 'entregue'];

function calcularPassosStatus(atual: StatusPedido, desejado: StatusPedido): StatusPedido[] {
  if (atual === desejado) return [];
  if (desejado === 'cancelado') return ['cancelado'];
  const idxAtual = CAMINHO_STATUS.indexOf(atual);
  const idxDesejado = CAMINHO_STATUS.indexOf(desejado);
  if (idxAtual === -1 || idxDesejado === -1 || idxDesejado <= idxAtual) return [desejado];
  return CAMINHO_STATUS.slice(idxAtual + 1, idxDesejado + 1);
}

/**
 * Reenvia em ordem cronológica todas as operações da fila Outbox para o backend.
 * Usa a chave de verificação (HOT-234) para garantir idempotência e nunca duplicar débito de estoque.
 */
export async function sincronizarFilaOffline(): Promise<{
  sincronizados: number;
  conflitos: number;
  restantes: number;
}> {
  if (emSincronizacao) {
    const r = obterResumoFilaOffline();
    return { sincronizados: 0, conflitos: r.conflitos, restantes: r.pendentes };
  }

  const pendentes = memoriaFila.filter((op) => op.statusFila !== 'erro_conflito');
  if (pendentes.length === 0) {
    return { sincronizados: 0, conflitos: obterResumoFilaOffline().conflitos, restantes: 0 };
  }

  emSincronizacao = true;
  notificarFila();

  let sincronizados = 0;

  try {
    for (const op of [...pendentes]) {
      op.statusFila = 'sincronizando';
      notificarFila();

      try {
        if (op.tipo === 'CRIAR_PEDIDO') {
          // 1. Garante chave de idempotência do servidor antes de criar
          if (!op.chaveVerificacao) {
            const respChave = await requisitarApi<{ chave: string }>(
              BASE_PEDIDOS,
              '/verificacoes/chave',
              { method: 'POST' },
            );
            op.chaveVerificacao = respChave.chave;
            persistirFila();
          }

          // 2. Cria o pedido em verificação no servidor (se ainda não foi criado)
          if (!op.idServidor) {
            const criado = await requisitarApi<RevisaoCaixa>(BASE_PEDIDOS, '/pedidos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...op.dados,
                chaveVerificacao: op.chaveVerificacao,
              }),
            });
            op.idServidor = criado.id;
            op.versaoServidor = criado.versaoVerificacao;
            persistirFila();
          }

          // 3. Se o caixa já confirmou a revisão offline, confirma no servidor
          if (op.confirmadoNoCaixa) {
            await requisitarApi<RevisaoCaixa>(
              BASE_PEDIDOS,
              `/pedidos/${op.idServidor}/verificacao`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  acao: 'confirmar',
                  versao: op.versaoServidor ?? 0,
                  itens: op.dados.itens,
                }),
              },
            );
          }

          // 4. Se o status avançou na cozinha/entrega enquanto offline, aplica as transições
          if (op.confirmadoNoCaixa && op.statusDesejado && op.statusDesejado !== 'novo') {
            const passos = calcularPassosStatus('novo', op.statusDesejado);
            for (const passo of passos) {
              await requisitarApi(BASE_PEDIDOS, `/pedidos/${op.idServidor}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: passo }),
              });
            }
          }
        } else if (op.tipo === 'VERIFICACAO_PEDIDO') {
          await requisitarApi<RevisaoCaixa>(
            BASE_PEDIDOS,
            `/pedidos/${op.pedidoId}/verificacao`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                acao: op.acao,
                versao: op.versao,
                itens: op.itens,
              }),
            },
          );
        } else if (op.tipo === 'MUDAR_STATUS_PEDIDO') {
          await requisitarApi(BASE_PEDIDOS, `/pedidos/${op.pedidoId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: op.status }),
          });
        }

        // Sucesso: remove operação concluída da fila
        memoriaFila = memoriaFila.filter((item) => item.idOperacao !== op.idOperacao);
        sincronizados += 1;
        persistirFila();
      } catch (erro) {
        if (erro instanceof ErroApi && erro.status >= 400 && erro.status < 500) {
          // Conflito de negócio (ex.: 409 Estoque insuficiente): marca o item sem travar os demais
          op.statusFila = 'erro_conflito';
          op.mensagemErro = erro.message;
          persistirFila();
        } else {
          // Falha de rede: interrompe o lote e mantém como pendente para a próxima tentativa
          op.statusFila = 'pendente';
          persistirFila();
          break;
        }
      }
    }

    if (sincronizados > 0) {
      registrarSucessoConexao();
    }
  } finally {
    emSincronizacao = false;
    notificarFila();
  }

  const resumoFinal = obterResumoFilaOffline();
  return {
    sincronizados,
    conflitos: resumoFinal.conflitos,
    restantes: resumoFinal.pendentes,
  };
}

// Dispara a sincronização automaticamente quando o navegador recupera a conexão
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    void sincronizarFilaOffline();
  });
}
