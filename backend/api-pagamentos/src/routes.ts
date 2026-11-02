import { Router, type Request } from 'express'
import Stripe from 'stripe'

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
// WEBHOOK DO STRIPE
// ============================================

// 4. RECEBER EVENTOS (confirmação do Pix, renovações e falhas do cartão)
routes.post('/webhooks/stripe', (req, res) => {
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

  // Ainda não há modelo de assinatura no banco: por enquanto os eventos só são
  // registrados no log. Ative/desative o plano do restaurante aqui quando houver.
  switch (evento.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      console.log(`[stripe] pagamento confirmado: ${evento.data.object.id}`)
      break
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
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

  res.json({ recebido: true })
})

export default routes
