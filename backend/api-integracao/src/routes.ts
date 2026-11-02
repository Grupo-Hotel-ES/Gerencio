import { Router, type Request } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, prepararItensPedido, type Prisma } from '@geroncio/shared-db'

const routes = Router()

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Request com o corpo original preservado pelo express.json (ver server.ts). */
export type RequestComCorpoBruto = Request & { corpoBruto?: Buffer }

/** Plataformas que notificam novos pedidos via webhook ou polling. */
export type Plataforma = 'ifood' | '99food' | 'keeta' | 'ubereats' | 'rappi'

/** Notificação já normalizada, extraída do corpo do webhook ou do poller. */
export interface NotificacaoPedido {
  eventoId: string
  pedidoIdExterno: string
  lojaIdExterno?: string
  tipo: string
  /** Pedido completo, quando a plataforma já o envia no próprio evento (ex.: Rappi). */
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
  /** Valida a autenticidade do webhook/requisição (assinatura, token, etc.). */
  validarAssinatura(req: Request): boolean
  /** Extrai do corpo as notificações de novo pedido (ignora outros eventos). */
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

// iFood: Merchant API v1.0
const ifood: AdapterPlataforma = {
  validarAssinatura(req) {
    return true // Em ambiente de desenvolvimento / mock
  },

  extrairNotificacoes(corpo) {
    const eventos = Array.isArray(corpo) ? corpo : [corpo]
    return eventos
      .filter((e) => e && (e.code === 'PLACED' || e.fullCode === 'PLACED' || e.tipo === 'PLACED'))
      .map((e) => {
        const eventoId = e.id
        const pedidoIdExterno = e.orderId ?? e.pedidoId
        if (eventoId === undefined || eventoId === null || pedidoIdExterno === undefined || pedidoIdExterno === null) {
          throw new Error('Evento iFood sem id ou orderId')
        }
        return {
          eventoId: String(eventoId),
          pedidoIdExterno: String(pedidoIdExterno),
          lojaIdExterno: e.merchantId ? String(e.merchantId) : undefined,
          tipo: e.code ?? e.fullCode ?? e.tipo ?? 'PLACED',
        }
      })
  },

  async buscarPedido(notificacao) {
    const urlBase = process.env.IFOOD_API_URL ?? 'http://localhost:3333'
    const resposta = await fetch(`${urlBase}/v1.0/orders/${notificacao.pedidoIdExterno}`)

    if (!resposta.ok) {
      throw new Error(`Erro ao buscar pedido ${notificacao.pedidoIdExterno} no iFood: status ${resposta.status}`)
    }

    return resposta.json()
  },

  converterPedido(pedidoIFood: any) {
    const cliente = pedidoIFood.customer
    const entrega = pedidoIFood.delivery?.deliveryAddress
    const total = pedidoIFood.total
    const pagamento = pedidoIFood.payments?.methods?.[0]

    const nomeCliente = cliente?.name ?? null

    let enderecoDestino = ''
    if (entrega) {
      if (entrega.formattedAddress) {
        enderecoDestino = entrega.formattedAddress
      } else {
        const partes = [
          entrega.streetName && `${entrega.streetName}, ${entrega.streetNumber ?? 'S/N'}`,
          entrega.neighborhood,
          entrega.city,
        ].filter(Boolean)
        enderecoDestino = partes.join(' - ')
      }
    }

    const cepDestino = entrega?.postalCode ?? ''

    return {
      nomeCliente,
      preco: Number(total?.orderAmount ?? 0),
      metodoPagamento: pagamento?.type === 'ONLINE' ? 'cartao' : 'dinheiro',
      enderecoDestino,
      cepDestino,
      latitude: null,
      longitude: null,
      itens: (pedidoIFood.items ?? []).map((item: any) => ({
        idExterno: String(item.externalCode ?? item.id),
        quantidade: Number(item.quantity),
      })),
    }
  },
}

// Rappi: o webhook de novo pedido envia uma LISTA com os pedidos completos
// ({ order_detail, customer, store }), então não é preciso buscá-los na API.
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
    
    const autenticacao = await authRes.json() as { access_token?: unknown };
    if (typeof autenticacao.access_token !== 'string' || !autenticacao.access_token) {
      throw new Error('Token OAuth do Uber Eats inválido');
    }
    const access_token = autenticacao.access_token;

    // O mock monta o resource_href com localhost; em container, troca a origem pela do MOCK_API_URL
    const urlPedido = process.env.MOCK_API_URL
      ? new URL(new URL(resourceHref).pathname, process.env.MOCK_API_URL).toString()
      : resourceHref;

    const pedidoRes = await fetch(urlPedido, {
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
  ifood,
  '99food': adapterNaoImplementado('99Food'),
  keeta: adapterNaoImplementado('Keeta'),
  ubereats,
  rappi,
}

export function obterAdapter(plataforma: string | undefined): AdapterPlataforma | null {
  if (!plataforma) return null
  return ADAPTERS[plataforma.toLowerCase() as Plataforma] ?? null
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

/** Traduz os itens externos para produtos do Gerencio usando a tabela MapeamentoApp. */
async function mapearItens(cliente: Prisma.TransactionClient, plataforma: Plataforma, itens: ItemExterno[]) {
  const mapeamentos = await cliente.mapeamentoApp.findMany({
    where: {
      plataforma: { equals: plataforma, mode: 'insensitive' },
      idExternoApp: { in: itens.map((item) => item.idExterno) },
    },
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

async function salvarPedido(
  plataforma: Plataforma,
  pedidoIdExterno: string,
  pedido: PedidoConvertido,
  eventoIntegracaoId: number,
) {
  return db.$transaction(async (tx) => {
    // O identificador externo também é único no banco. Isso cobre reentregas
    // com outro ID de evento e retomadas após uma queda do processo.
    const existente = await tx.pedido.findFirst({
      where: { app: plataforma, pedidoExternoId: pedidoIdExterno },
    })

    if (existente) {
      await tx.eventoIntegracao.update({
        where: { id: eventoIntegracaoId },
        data: { status: 'processado', processadoEm: new Date(), ultimoErro: null, pedidoId: existente.id },
      })
      return existente
    }

    const preparados = await prepararItensPedido(tx, await mapearItens(tx, plataforma, pedido.itens))
    const data: Prisma.PedidoCreateInput = {
      restaurante: { connect: { id: preparados.restauranteId } },
      pedidoExternoId: pedidoIdExterno,
      nomeCliente: pedido.nomeCliente,
      preco: pedido.preco,
      metodoPagamento: pedido.metodoPagamento,
      app: plataforma,
      enderecoDestino: pedido.enderecoDestino,
      cepDestino: pedido.cepDestino,
      latitude: pedido.latitude,
      longitude: pedido.longitude,
      itens: { create: preparados.itens },
    }
    const salvo = await tx.pedido.create({ data })
    await tx.eventoIntegracao.update({
      where: { id: eventoIntegracaoId },
      data: { status: 'processado', processadoEm: new Date(), ultimoErro: null, pedidoId: salvo.id },
    })
    return salvo
  })
}

export async function processarNotificacao(
  plataforma: Plataforma,
  adapter: AdapterPlataforma,
  notificacao: NotificacaoPedido,
  eventoIntegracaoId: number,
) {
  const pedidoExterno = await adapter.buscarPedido(notificacao)
  const pedido = adapter.converterPedido(pedidoExterno)
  return salvarPedido(plataforma, notificacao.pedidoIdExterno, pedido, eventoIntegracaoId)
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

// WEBHOOK / NOTIFICAÇÃO DE NOVOS PEDIDOS
// POST /api/webhooks/:plataforma
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

  try {
    const resultado = await db.eventoIntegracao.createMany({
      data: notificacoes.map((notificacao) => ({
        plataforma,
        eventoId: notificacao.eventoId,
        pedidoIdExterno: notificacao.pedidoIdExterno,
        lojaIdExterno: notificacao.lojaIdExterno,
        tipo: notificacao.tipo,
        payload: req.body,
      })),
      skipDuplicates: true,
    })
    res.status(202).json({ recebidas: notificacoes.length, novas: resultado.count })
  } catch (error: any) {
    console.error(`[${plataforma}] Erro ao registrar notificação:`, error)
    res.status(500).json({ error: 'Não foi possível registrar a notificação', detalhe: error.message })
  }
})

export default routes
