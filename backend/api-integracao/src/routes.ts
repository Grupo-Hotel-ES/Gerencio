import { Router, type Request } from 'express'
import { db, type Prisma } from '@geroncio/shared-db'

const routes = Router()

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Plataformas que notificam novos pedidos via webhook. */
type Plataforma = 'ifood' | '99food' | 'keeta' | 'ubereats' | 'rappi'

/** Notificação já normalizada, extraída do corpo do webhook. */
interface NotificacaoPedido {
  eventoId: string
  pedidoIdExterno: string
  lojaIdExterno?: string
  tipo: string
}

/** Item do pedido no formato da plataforma, antes do mapeamento para Produto. */
interface ItemExterno {
  idExterno: string
  quantidade: number
}

/** Pedido já convertido para o formato do Gerencio (ainda com itens externos). */
interface PedidoConvertido {
  nomeCliente: string | null
  preco: number
  metodoPagamento: string
  enderecoDestino: string
  cepDestino: string
  latitude: number | null
  longitude: number | null
  itens: ItemExterno[]
}

/** Contrato que cada plataforma precisa implementar. */
interface AdapterPlataforma {
  /** Valida a autenticidade do webhook (assinatura, token, etc.). */
  validarAssinatura(req: Request): boolean
  /** Extrai do corpo do webhook as notificações de novo pedido (ignora outros eventos). */
  extrairNotificacoes(corpo: any): NotificacaoPedido[]
  /** Faz a requisição à API da plataforma para buscar os dados completos do pedido. */
  buscarPedido(notificacao: NotificacaoPedido): Promise<unknown>
  /** Converte o pedido no formato da plataforma para o formato do Gerencio. */
  converterPedido(pedidoExterno: any): PedidoConvertido
}

// ---------------------------------------------------------------------------
// Adapters por plataforma
// ---------------------------------------------------------------------------

function adapterNaoImplementado(nome: string): AdapterPlataforma {
  const erro = () => {
    throw new Error(`Integração com ${nome} ainda não implementada`)
  }
  return {
    validarAssinatura: () => true, // TODO: validar assinatura do webhook
    extrairNotificacoes: erro,
    buscarPedido: async () => erro(),
    converterPedido: erro,
  }
}

const ADAPTERS: Record<Plataforma, AdapterPlataforma> = {
  ifood: adapterNaoImplementado('iFood'),
  '99food': adapterNaoImplementado('99Food'),
  keeta: adapterNaoImplementado('Keeta'),
  ubereats: adapterNaoImplementado('Uber Eats'),
  rappi: adapterNaoImplementado('Rappi'),
}

function obterAdapter(plataforma: string | undefined): AdapterPlataforma | null {
  if (!plataforma) return null
  return ADAPTERS[plataforma.toLowerCase() as Plataforma] ?? null
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

/** Traduz os itens externos para produtos do Gerencio usando a tabela MapeamentoApp. */
async function mapearItens(plataforma: Plataforma, itens: ItemExterno[]) {
  const mapeamentos = await db.mapeamentoApp.findMany({
    where: { plataforma, idExternoApp: { in: itens.map((item) => item.idExterno) } },
  })
  const produtoPorIdExterno = new Map(mapeamentos.map((m) => [m.idExternoApp, m.produtoId]))

  return itens.map((item) => {
    const produtoId = produtoPorIdExterno.get(item.idExterno)
    if (produtoId === undefined) {
      throw new Error(`Produto externo "${item.idExterno}" sem mapeamento para ${plataforma}`)
    }
    return { produtoId, quantidade: item.quantidade }
  })
}

async function salvarPedido(plataforma: Plataforma, pedido: PedidoConvertido) {
  // TODO: evitar duplicidade (webhooks podem ser reenviados) guardando o id externo do pedido
  const data: Prisma.PedidoCreateInput = {
    nomeCliente: pedido.nomeCliente,
    preco: pedido.preco,
    metodoPagamento: pedido.metodoPagamento,
    app: plataforma,
    enderecoDestino: pedido.enderecoDestino,
    cepDestino: pedido.cepDestino,
    latitude: pedido.latitude,
    longitude: pedido.longitude,
    itens: { create: await mapearItens(plataforma, pedido.itens) },
  }
  return db.pedido.create({ data })
}

async function processarNotificacao(plataforma: Plataforma, adapter: AdapterPlataforma, notificacao: NotificacaoPedido) {
  const pedidoExterno = await adapter.buscarPedido(notificacao)
  const pedido = adapter.converterPedido(pedidoExterno)
  return salvarPedido(plataforma, pedido)
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

// 1. WEBHOOK DE NOVOS PEDIDOS
// URL a ser configurada no painel de cada app: POST /api/webhooks/:plataforma
routes.post('/webhooks/:plataforma', async (req, res) => {
  const plataforma = req.params.plataforma.toLowerCase() as Plataforma
  const adapter = obterAdapter(plataforma)
  if (!adapter) {
    res.status(404).json({ error: `Plataforma não suportada: ${req.params.plataforma}` })
    return
  }

  if (!adapter.validarAssinatura(req)) {
    res.status(401).json({ error: 'Assinatura do webhook inválida' })
    return
  }

  let notificacoes: NotificacaoPedido[]
  try {
    notificacoes = adapter.extrairNotificacoes(req.body)
  } catch (error: any) {
    res.status(400).json({ error: 'Notificação inválida', detalhe: error.message })
    return
  }

  // Responde imediatamente: as plataformas exigem resposta rápida e reenviam em caso de timeout.
  res.status(202).json({ recebidas: notificacoes.length })

  for (const notificacao of notificacoes) {
    try {
      await processarNotificacao(plataforma, adapter, notificacao)
    } catch (error) {
      // TODO: registrar falha para reprocessamento
      console.error(`[${plataforma}] Erro ao processar pedido ${notificacao.pedidoIdExterno}:`, error)
    }
  }
})

export default routes
