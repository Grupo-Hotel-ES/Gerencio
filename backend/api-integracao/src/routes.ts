import { Router, type Request } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, type Prisma } from '@geroncio/shared-db'

/*
SOLUÇÃO PROPOSTA PELO GEMINI

import { Router, Request, Response } from 'express';
import crypto from 'crypto';

interface RequestComCorpoBruto extends Request {
    corpoBruto?: Buffer | string;
}
*/

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

/* 
SOLUÇÃO PROPOSTA PELO GEMINI (FEITA NA ETAPA 3)
 
const UBER_CLIENT_SECRET = process.env.UBER_CLIENT_SECRET || 'mock_secret_key';

export const UberEatsAdapter = {
    validarAssinatura: (req: RequestComCorpoBruto): boolean => {
        const signatureHeader = req.get('X-Uber-Signature');
        if (!signatureHeader || !req.corpoBruto) return false;

        const expectedSignature = crypto
            .createHmac('sha256', UBER_CLIENT_SECRET)
            .update(req.corpoBruto)
            .digest('hex');

        try {
            return crypto.timingSafeEqual(
                Buffer.from(signatureHeader),
                Buffer.from(expectedSignature)
            );
        } catch {
            return signatureHeader === expectedSignature;
        }
    },

    extrairNotificacoes: (body: any): string | null => {
        if (body?.event_type === 'orders.notification' && body?.meta?.resource_id) {
            return body.meta.resource_id;
        }
        return null;
    }
};
*/

/*
SOLUÇÃO PROPOSTA PELO GEMINI (FEITA NA ETAPA 4)

const ubereats: AdapterPlataforma = {
  validarAssinatura(req) {
    const segredo = process.env.UBER_WEBHOOK_SECRET;
    if (!segredo) return true; // sem segredo configurado (ambiente de dev)

    const assinatura = req.get('X-Uber-Signature');
    const corpo = (req as RequestComCorpoBruto).corpoBruto;
    if (!assinatura || !corpo) return false;

    const esperado = createHmac('sha256', segredo).update(corpo).digest('hex');
    return assinatura === esperado;
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

    // Chamada à Etapa 1 para obter o token Bearer (usando a base URL do mock)
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

    // Converte o valor de E5 (X * 10^5) para um formato numérico padrão (Reais)
    const precoE5 = order.payment?.payment_detail?.order_total?.net?.amount_e5 || 0;
    const preco = precoE5 / 100000;

    const delivery = order.deliveries?.[0];
    const location = delivery?.location;
    const enderecoDestino = location 
      ? `${location.street_address_line_one || ''} ${location.street_address_line_two || ''}`.trim() 
      : '';

    const itens: ItemExterno[] = order.carts?.flatMap((cart: any) =>
      cart.items?.map((item: any) => ({
        idExterno: String(item.external_data || item.id), // external_data possui o ID mapeado
        quantidade: Number(item.quantity?.amount || 1)
      })) || []
    ) || [];

    return {
      nomeCliente,
      preco,
      metodoPagamento: 'cartao', // Pagamentos via UberEats são sempre online/cartão para a integração
      enderecoDestino,
      cepDestino: location?.postal_code ?? '',
      latitude: location?.latitude ? Number(location.latitude) : null,
      longitude: location?.longitude ? Number(location.longitude) : null,
      itens
    };
  }
};
*/

const ADAPTERS: Record<Plataforma, AdapterPlataforma> = {
  ifood: adapterNaoImplementado('iFood'),
  '99food': adapterNaoImplementado('99Food'),
  keeta: adapterNaoImplementado('Keeta'),
  ubereats: adapterNaoImplementado('Uber Eats'), /* SOLUÇÃO GEMINI: substituir essa linha por ubereats, */
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

/*
SOLUÇÃO PROPOSTA PELO GEMINI

router.post('/webhook/uber', (req: RequestComCorpoBruto, res: Response) => {
    if (!UberEatsAdapter.validarAssinatura(req)) {
        return res.status(401).json({ erro: 'Assinatura X-Uber-Signature inválida ou ausente.' });
    }

    const pedidoId = UberEatsAdapter.extrairNotificacoes(req.body);

    if (!pedidoId) {
        return res.status(400).json({ erro: 'Payload de notificação inválido ou event_type não suportado.' });
    }

    // Engatilhar fila de processamento do pedidoId na API Integração aqui

    return res.status(200).send();
});
*/

export default routes
