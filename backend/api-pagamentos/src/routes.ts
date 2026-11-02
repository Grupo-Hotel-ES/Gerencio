import { Router, type Request } from 'express'
import Stripe from 'stripe'
import { db, parseId, StatusPagamento } from '@geroncio/shared-db'
import { aoConfirmarPagamento } from './pedido-pago'

export type RequestComCorpoBruto = Request & { corpoBruto?: Buffer }

const routes = Router()

// Sem STRIPE_SECRET_KEY no .env o serviço responde que o Stripe não está
// configurado, e o frontend continua no modo demonstração.
const chaveSecreta = process.env.STRIPE_SECRET_KEY
const segredoWebhook = process.env.STRIPE_WEBHOOK_SECRET
const stripe = chaveSecreta ? new Stripe(chaveSecreta) : null

// Plano único por enquanto: cartão vira assinatura mensal; Pix paga um mês avulso
// (o Pix não permite cobrança recorrente).
const PLANO = {
  nome: 'Gerêncio • Essencial',
  descricao: '1 unidade + 5 usuários, itens ilimitados, fichas técnicas e relatórios completos',
  valorCentavos: Number(process.env.PLANO_VALOR_CENTAVOS) || 14900,
}

// Links de pagamento de pedidos (enviados pelo chatbot no WhatsApp). O Stripe
// aceita validade entre 30 min e 24 h. A URL pública é para onde o cliente volta
// depois de pagar; no celular dele, localhost não funciona.
const VALIDADE_LINK_MINUTOS = Math.min(
  Math.max(Number(process.env.PAGAMENTO_PEDIDO_VALIDADE_MINUTOS) || 60, 30),
  24 * 60,
)
const URL_PUBLICA = (process.env.PAGAMENTOS_URL_PUBLICA ?? `http://localhost:${process.env.PORT || 3006}`).replace(/\/$/, '')

const METODOS = ['cartao', 'pix'] as const
type MetodoPagamento = (typeof METODOS)[number]

function urlValida(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  try {
    const url = new URL(valor)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Junta parâmetros à URL de retorno mantendo o placeholder do Stripe sem codificar
function comParametro(url: string, parametro: string) {
  return `${url}${url.includes('?') ? '&' : '?'}${parametro}`
}

/** Leva o status da sessão do Stripe para o PagamentoPedido correspondente (se houver). */
async function sincronizarPagamentoPedido(sessao: Stripe.Checkout.Session) {
  let status: StatusPagamento = StatusPagamento.pendente
  if (sessao.payment_status === 'paid') status = StatusPagamento.pago
  else if (sessao.status === 'expired') status = StatusPagamento.expirado

  // updateMany: sessões da assinatura (sem pedido) simplesmente não casam com nenhuma linha
  const alterados = await db.pagamentoPedido.updateMany({
    where: { sessaoStripeId: sessao.id, status: { not: StatusPagamento.pago } },
    data: { status, ...(status === StatusPagamento.pago && { pagoEm: new Date() }) },
  })

  // Só na primeira vez que vira "pago": o webhook e a página de retorno podem chegar os dois
  if (status === StatusPagamento.pago && alterados.count > 0) {
    const pagamento = await db.pagamentoPedido.findUnique({ where: { sessaoStripeId: sessao.id } })
    if (pagamento) await aoConfirmarPagamento(pagamento.pedidoId)
  }
  return status
}

function paginaRetorno(titulo: string, mensagem: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f6f4; color: #1d1d1b; }
  main { max-width: 360px; padding: 32px 24px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { font-size: 15px; line-height: 1.5; color: #555; margin: 0; }
</style>
</head>
<body><main><h1>${titulo}</h1><p>${mensagem}</p></main></body>
</html>`
}

// ============================================
// PAGAMENTOS
// ============================================

// 1. CONFIGURAÇÃO (o frontend decide entre Stripe e modo demonstração)
routes.get('/pagamentos/config', (req, res) => {
  res.json({
    configurado: stripe !== null,
    plano: { nome: PLANO.nome, valorCentavos: PLANO.valorCentavos },
  })
})

// 2. CRIAR SESSÃO DE CHECKOUT
routes.post('/pagamentos/checkout', async (req, res) => {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe não configurado' })
    return
  }

  const { metodo, email, urlRetorno, estabelecimento, razaoSocial, cnpj, responsavel } = req.body ?? {}

  if (!METODOS.includes(metodo)) {
    res.status(400).json({ error: `Método inválido. Use: ${METODOS.join(', ')}` })
    return
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'E-mail de cobrança inválido' })
    return
  }
  if (!urlValida(urlRetorno)) {
    res.status(400).json({ error: 'URL de retorno inválida' })
    return
  }

  const metadados = {
    estabelecimento: String(estabelecimento ?? ''),
    razaoSocial: String(razaoSocial ?? ''),
    cnpj: String(cnpj ?? ''),
    responsavel: String(responsavel ?? ''),
    metodo: metodo as MetodoPagamento,
  }
  const produto = { name: PLANO.nome, description: PLANO.descricao }

  try {
    const sessao = await stripe.checkout.sessions.create(
      metodo === 'cartao'
        ? {
            mode: 'subscription',
            allowed_payment_method_types: ['card'],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: 'brl',
                  unit_amount: PLANO.valorCentavos,
                  recurring: { interval: 'month' },
                  product_data: produto,
                },
              },
            ],
            subscription_data: { metadata: metadados },
            customer_email: email,
            metadata: metadados,
            locale: 'pt-BR',
            success_url: comParametro(urlRetorno, 'sessao={CHECKOUT_SESSION_ID}'),
            cancel_url: comParametro(urlRetorno, 'cancelado=1'),
          }
        : {
            mode: 'payment',
            allowed_payment_method_types: ['pix'],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: 'brl',
                  unit_amount: PLANO.valorCentavos,
                  product_data: produto,
                },
              },
            ],
            payment_intent_data: { metadata: metadados },
            customer_email: email,
            metadata: metadados,
            locale: 'pt-BR',
            success_url: comParametro(urlRetorno, 'sessao={CHECKOUT_SESSION_ID}'),
            cancel_url: comParametro(urlRetorno, 'cancelado=1'),
          },
    )
    res.status(201).json({ id: sessao.id, url: sessao.url })
  } catch (error: any) {
    res.status(502).json({ error: 'Erro ao criar pagamento no Stripe', detalhe: error.message })
  }
})

// 3. CONSULTAR SESSÃO DE CHECKOUT (usado na volta do Stripe)
routes.get('/pagamentos/checkout/:id', async (req, res) => {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe não configurado' })
    return
  }

  const id = req.params.id
  if (!id.startsWith('cs_')) {
    res.status(400).json({ error: 'Id de sessão inválido' })
    return
  }

  try {
    const sessao = await stripe.checkout.sessions.retrieve(id)
    res.json({
      id: sessao.id,
      // open | complete | expired
      status: sessao.status,
      // paid | unpaid | no_payment_required
      statusPagamento: sessao.payment_status,
      metodo: sessao.metadata?.metodo ?? null,
      valorCentavos: sessao.amount_total,
      email: sessao.customer_details?.email ?? sessao.customer_email,
      estabelecimento: sessao.metadata?.estabelecimento ?? null,
      responsavel: sessao.metadata?.responsavel ?? null,
      criadoEm: new Date(sessao.created * 1000).toISOString(),
    })
  } catch (error: any) {
    if (error?.statusCode === 404) {
      res.status(404).json({ error: 'Sessão de pagamento não encontrada' })
      return
    }
    res.status(502).json({ error: 'Erro ao consultar pagamento no Stripe', detalhe: error.message })
  }
})

// ============================================
// PAGAMENTO DE PEDIDOS
// ============================================

// 4. GERAR LINK DE PAGAMENTO DE UM PEDIDO (cartão ou Pix)
// Reaproveita o link pendente que ainda não expirou. Com clienteId no corpo,
// só gera o link se o pedido for daquele cliente (usado pelo chatbot).
routes.post('/pagamentos/pedidos/:id/link', async (req, res) => {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe não configurado' })
    return
  }

  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const { clienteId } = req.body ?? {}
  if (clienteId !== undefined && clienteId !== null && !Number.isInteger(clienteId)) {
    res.status(400).json({ error: 'clienteId inválido' })
    return
  }

  try {
    const pedido = await db.pedido.findUnique({
      where: { id },
      include: {
        itens: { include: { produto: { select: { nome: true } } } },
        restaurante: { select: { nome: true } },
        pagamentos: { orderBy: { criadoEm: 'desc' } },
      },
    })
    if (!pedido || (clienteId != null && pedido.clienteId !== clienteId)) {
      res.status(404).json({ error: 'Pedido não encontrado' })
      return
    }
    if (pedido.status === 'cancelado') {
      res.status(409).json({ error: 'Pedido cancelado não pode ser pago' })
      return
    }
    if (pedido.pagamentos.some((p) => p.status === StatusPagamento.pago)) {
      res.status(409).json({ error: 'Pedido já está pago' })
      return
    }

    // Folga de 5 min para o cliente não receber um link prestes a expirar
    const limite = new Date(Date.now() + 5 * 60 * 1000)
    const aberto = pedido.pagamentos.find((p) => p.status === StatusPagamento.pendente && p.expiraEm > limite)
    if (aberto) {
      res.json({ ...aberto, reaproveitado: true })
      return
    }

    const valorCentavos = Math.round(Number(pedido.preco) * 100)
    const itens = pedido.itens.map((i) => `${i.quantidade}x ${i.produto.nome}`).join(', ')
    const expiraEm = new Date(Date.now() + VALIDADE_LINK_MINUTOS * 60 * 1000)

    const sessao = await stripe.checkout.sessions.create({
      mode: 'payment',
      allowed_payment_method_types: ['card', 'pix'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: valorCentavos,
            product_data: {
              name: `Pedido #${pedido.id}${pedido.restaurante ? ` • ${pedido.restaurante.nome}` : ''}`,
              ...(itens && { description: itens.slice(0, 500) }),
            },
          },
        },
      ],
      metadata: { pedidoId: String(pedido.id) },
      payment_intent_data: { metadata: { pedidoId: String(pedido.id) } },
      expires_at: Math.floor(expiraEm.getTime() / 1000),
      locale: 'pt-BR',
      success_url: `${URL_PUBLICA}/api/pagamentos/retorno?sessao={CHECKOUT_SESSION_ID}`,
    })

    const pagamento = await db.pagamentoPedido.create({
      data: {
        pedidoId: pedido.id,
        sessaoStripeId: sessao.id,
        url: sessao.url ?? '',
        valor: pedido.preco,
        expiraEm,
      },
    })
    res.status(201).json({ ...pagamento, reaproveitado: false })
  } catch (error: any) {
    res.status(502).json({ error: 'Erro ao gerar link de pagamento', detalhe: error.message })
  }
})

// 5. LISTAR PAGAMENTOS DE UM PEDIDO
routes.get('/pagamentos/pedidos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const pagamentos = await db.pagamentoPedido.findMany({
      where: { pedidoId: id },
      orderBy: { criadoEm: 'desc' },
    })
    res.json({ pago: pagamentos.some((p) => p.status === StatusPagamento.pago), pagamentos })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar pagamentos', detalhe: error.message })
  }
})

// 6. PÁGINA DE RETORNO (para onde o Stripe manda o cliente depois de pagar)
routes.get('/pagamentos/retorno', async (req, res) => {
  const id = String(req.query.sessao ?? '')
  if (!stripe || !id.startsWith('cs_')) {
    res.status(400).type('html').send(paginaRetorno('Link inválido', 'Não encontramos este pagamento.'))
    return
  }

  try {
    // Também sincroniza aqui, para funcionar mesmo sem o webhook configurado
    const status = await sincronizarPagamentoPedido(await stripe.checkout.sessions.retrieve(id))
    if (status === StatusPagamento.pago) {
      res.type('html').send(paginaRetorno('Pagamento confirmado!', 'Recebemos o seu pagamento. Pode voltar para o WhatsApp.'))
    } else {
      res.type('html').send(paginaRetorno(
        'Pagamento em processamento',
        'Assim que o banco confirmar, o restaurante é avisado. Se pagou com Pix, isso leva poucos segundos.',
      ))
    }
  } catch (error: any) {
    res.status(502).type('html').send(paginaRetorno('Algo deu errado', 'Não foi possível consultar o pagamento agora.'))
  }
})

// ============================================
// WEBHOOK DO STRIPE
// ============================================

// 7. RECEBER EVENTOS (pagamento de pedidos, confirmação do Pix, renovações e falhas do cartão)
routes.post('/webhooks/stripe', async (req, res) => {
  if (!stripe || !segredoWebhook) {
    res.status(503).json({ error: 'Webhook do Stripe não configurado' })
    return
  }

  const assinatura = req.header('stripe-signature')
  const corpo = (req as RequestComCorpoBruto).corpoBruto
  if (!assinatura || !corpo) {
    res.status(400).json({ error: 'Assinatura ausente' })
    return
  }

  let evento: Stripe.Event
  try {
    evento = stripe.webhooks.constructEvent(corpo, assinatura, segredoWebhook)
  } catch (error: any) {
    res.status(400).json({ error: 'Assinatura inválida', detalhe: error.message })
    return
  }

  // Pagamentos de pedidos vão para o banco. A assinatura ainda não tem modelo:
  // por enquanto esses eventos só são registrados no log.
  try {
    switch (evento.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.expired':
        await sincronizarPagamentoPedido(evento.data.object)
        console.log(`[stripe] ${evento.type}: ${evento.data.object.id}`)
        break
      case 'checkout.session.async_payment_failed':
        await db.pagamentoPedido.updateMany({
          where: { sessaoStripeId: evento.data.object.id },
          data: { status: StatusPagamento.falhou },
        })
        console.log(`[stripe] pagamento não concluído: ${evento.data.object.id}`)
        break
      case 'invoice.paid':
        console.log(`[stripe] mensalidade paga: ${evento.data.object.id}`)
        break
      case 'invoice.payment_failed':
        console.log(`[stripe] mensalidade recusada: ${evento.data.object.id}`)
        break
      case 'customer.subscription.deleted':
        console.log(`[stripe] assinatura cancelada: ${evento.data.object.id}`)
        break
    }
  } catch (error: any) {
    // 500 faz o Stripe reenviar o evento mais tarde
    res.status(500).json({ error: 'Erro ao processar evento', detalhe: error.message })
    return
  }

  res.json({ recebido: true })
})

export default routes
