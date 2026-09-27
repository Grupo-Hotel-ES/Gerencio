import { Router, type Request } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, type Prisma } from '@geroncio/shared-db'

const routes = Router()

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Request com o corpo original preservado pelo express.json (ver server.ts). */
export type RequestComCorpoBruto = Request & { corpoBruto?: Buffer }

/** Plataformas que notificam novos pedidos via webhook. */
type Plataforma = 'ifood' | '99food' | 'keeta' | 'ubereats' | 'rappi'

/** Notificação já normalizada, extraída do corpo do webhook. */
interface NotificacaoPedido {
  eventoId: string
  pedidoIdExterno: string
  lojaIdExterno?: string
  tipo: string
  /** Pedido completo, quando a plataforma já o envia no próprio webhook (ex.: Rappi). */
  pedido?: unknown
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

// Rappi: o webhook de novo pedido envia uma LISTA com os pedidos completos
// ({ order_detail, customer, store }), então não é preciso buscá-los na API.
// Valores monetários em reais.
const rappi: AdapterPlataforma = {
  validarAssinatura(req) {
    const segredo = process.env.RAPPI_WEBHOOK_SECRET
    if (!segredo) return true // sem segredo configurado (ambiente de desenvolvimento)

    // Header: t=<timestamp>,sign=<hmac-sha256 de "<t>.<corpo>">
    const header = req.get('Rappi-Signature') ?? ''
    const partes = Object.fromEntries(header.split(',').map((parte) => parte.trim().split('=', 2)))
    const corpo = (req as RequestComCorpoBruto).corpoBruto
    if (!partes.t || !partes.sign || !corpo) return false

    const esperado = createHmac('sha256', segredo).update(`${partes.t}.`).update(corpo).digest()
    const recebido = Buffer.from(partes.sign, 'hex')
    return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
  },

  extrairNotificacoes(corpo) {
    if (!Array.isArray(corpo)) throw new Error('O corpo deve ser uma lista de pedidos')
    return corpo.map((pedido, i) => {
      const orderId = pedido?.order_detail?.order_id
      if (orderId === undefined || orderId === null) throw new Error(`Pedido ${i} sem order_detail.order_id`)
      return {
        eventoId: `rappi-${orderId}`,
        pedidoIdExterno: String(orderId),
        lojaIdExterno: pedido.store?.internal_id !== undefined ? String(pedido.store.internal_id) : undefined,
        tipo: 'NEW_ORDER',
        pedido,
      }
    })
  },

  async buscarPedido(notificacao) {
    // TODO: buscar na API da Rappi quando o webhook não trouxer o pedido completo
    if (!notificacao.pedido) throw new Error(`Pedido ${notificacao.pedidoIdExterno} ausente no webhook`)
    return notificacao.pedido
  },

  converterPedido(pedido) {
    const detalhe = pedido.order_detail
    const entrega = detalhe.delivery_information
    const nomeCliente = [pedido.customer?.first_name, pedido.customer?.last_name].filter(Boolean).join(' ')

    return {
      nomeCliente: nomeCliente || detalhe.billing_information?.name || null,
      preco: Number(detalhe.totals.total_order),
      metodoPagamento: detalhe.payment_method === 'cash' ? 'dinheiro' : 'cartao',
      // Retirada ("pickup") não tem endereço de entrega
      enderecoDestino: entrega?.complete_address ?? '',
      cepDestino: entrega?.postal_code ?? '',
      latitude: null,
      longitude: null,
      itens: detalhe.items.map((item: any) => ({
        idExterno: String(item.sku ?? item.id),
        quantidade: Number(item.quantity),
      })),
    }
  },
}

const ADAPTERS: Record<Plataforma, AdapterPlataforma> = {
  ifood: adapterNaoImplementado('iFood'),
  '99food': adapterNaoImplementado('99Food'),
  keeta: adapterNaoImplementado('Keeta'),
  ubereats: adapterNaoImplementado('Uber Eats'),
  rappi,
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
