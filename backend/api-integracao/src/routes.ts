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
    validarAssinatura: () => true,
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
    if (!segredo) return true 

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

const ubereats: AdapterPlataforma = {
  validarAssinatura(req) {
    const segredo = process.env.UBER_WEBHOOK_SECRET;
    if (!segredo) return true;

    const assinatura = req.get('X-Uber-Signature');
    const corpo = (req as RequestComCorpoBruto).corpoBruto;
    if (!assinatura || !corpo) return false;

    const esperado = createHmac('sha256', segredo).update(corpo).digest();
    const assinaturaBuffer = Buffer.from(assinatura, 'hex');

    return assinaturaBuffer.length === esperado.length && timingSafeEqual(assinaturaBuffer, esperado);
  },

  extrairNotificacoes(corpo) {
    if (corpo?.event_type !== 'orders.notification' || !corpo?.meta?.resource_id) {
      return [];
    }
    
    return [{
      eventoId: String(corpo.event_id),
      pedidoIdExterno: String(corpo.meta.resource_id),
      tipo: String(corpo.event_type),
      pedido: { resource_href: corpo.resource_href }
    }];
  },

  async buscarPedido(notificacao) {
    const resourceHref = (notificacao.pedido as any)?.resource_href;
    if (!resourceHref) {
      throw new Error(`resource_href ausente na notificação do pedido ${notificacao.pedidoIdExterno}`);
    }

    const mockUrl = process.env.MOCK_API_URL ?? 'http://localhost:3333';
    const authRes = await fetch(`${mockUrl}/oauth/v2/token`, { method: 'POST' });
    if (!authRes.ok) throw new Error('Falha ao obter token OAuth do Uber Eats');
    
    const { access_token } = await authRes.json();

    const pedidoRes = await fetch(resourceHref, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (!pedidoRes.ok) {
      throw new Error(`Erro ao buscar pedido no Uber Eats: ${pedidoRes.statusText}`);
    }

    return pedidoRes.json();
  },

  converterPedido(pedidoExterno) {
    const order = pedidoExterno.order || pedidoExterno;
    const customer = order.customers?.[0];
    const nomeCliente = customer ? `${customer.name?.first_name || ''} ${customer.name?.last_name || ''}`.trim() : null;

    const precoE5 = order.payment?.payment_detail?.order_total?.net?.amount_e5 || 0;
    const preco = precoE5 / 100000;

    const delivery = order.deliveries?.[0];
    const location = delivery?.location;
    const enderecoDestino = location 
      ? `${location.street_address_line_one || ''} ${location.street_address_line_two || ''}`.trim() 
      : '';

    const itens: ItemExterno[] = order.carts?.flatMap((cart: any) =>
      cart.items?.map((item: any) => ({
        idExterno: String(item.external_data || item.id),
        quantidade: Number(item.quantity?.amount || 1)
      })) || []
    ) || [];

    return {
      nomeCliente,
      preco,
      metodoPagamento: 'cartao',
      enderecoDestino,
      cepDestino: location?.postal_code ?? '',
      latitude: location?.latitude ? Number(location.latitude) : null,
      longitude: location?.longitude ? Number(location.longitude) : null,
      itens
    };
  }
};

const ADAPTERS: Record<Plataforma, AdapterPlataforma> = {
  ifood: adapterNaoImplementado('iFood'),
  '99food': adapterNaoImplementado('99Food'),
  keeta: adapterNaoImplementado('Keeta'),
  ubereats,
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

  res.status(202).json({ recebidas: notificacoes.length })

  for (const notificacao of notificacoes) {
    try {
      await processarNotificacao(plataforma, adapter, notificacao)
    } catch (error) {
      console.error(`[${plataforma}] Erro ao processar pedido ${notificacao.pedidoIdExterno}:`, error)
    }
  }
})

export default routes