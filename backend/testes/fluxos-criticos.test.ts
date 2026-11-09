import { segredoStripe } from './ambiente'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import restaurantes from '../api-restaurantes/src/server'
import produtos from '../api-produtos/src/server'
import pedidos from '../api-pedidos/src/server'
import integracao from '../api-integracao/src/server'
import pagamentos from '../api-pagamentos/src/server'
import { db } from '../packages/shared-db/src/index'

const servidores: Server[] = []
let apiRestaurantes: string
let apiProdutos: string
let apiPedidos: string
let apiIntegracao: string
let apiPagamentos: string

before(async () => {
  const enderecos: string[] = []
  for (const app of [restaurantes, produtos, pedidos, integracao, pagamentos]) {
    const servidor = app.listen(0, '127.0.0.1')
    servidores.push(servidor)
    await once(servidor, 'listening')
    enderecos.push(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}`)
  }
  ;[apiRestaurantes, apiProdutos, apiPedidos, apiIntegracao, apiPagamentos] = enderecos as [string, string, string, string, string]
})

after(async () => {
  await Promise.all(servidores.map((servidor) => new Promise<void>((resolve, reject) => {
    servidor.close((erro) => erro ? reject(erro) : resolve())
  })))
  await db.$disconnect()
  // O executor descarta somente o container efêmero desta execução, inclusive em falhas.
})

async function requisitar(base: string, caminho: string, metodo = 'GET', corpo?: unknown, cabecalhos: Record<string, string> = {}) {
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  })
  const dados = resposta.status === 204 ? null : await resposta.json() as any
  return { status: resposta.status, dados }
}

function dadosRestaurante() {
  return {
    nome: 'Restaurante de integração', cnpj: randomUUID(), email: 'teste@example.invalid',
    telefone: '11999999999', cep: '04000000', cidade: 'São Paulo', endereco: 'Rua de teste, 1',
  }
}

async function prepararPagamento(quantidade = 5) {
  const restaurante = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
  assert.equal(restaurante.status, 201, JSON.stringify(restaurante.dados))
  const produto = await requisitar(apiProdutos, '/produtos', 'POST', {
    restauranteId: restaurante.dados.id, nome: 'Espetinho', preco: '12.50', quantidade,
  })
  assert.equal(produto.status, 201, JSON.stringify(produto.dados))
  const pedido = await requisitar(apiPedidos, '/api/pedidos', 'POST', {
    restauranteId: restaurante.dados.id, nomeCliente: 'Cliente de integração',
    app: 'balcao', metodoPagamento: 'online', enderecoDestino: 'Retirada no local', cepDestino: '',
    itens: [{ produtoId: produto.dados.id, quantidade: 2 }],
  })
  assert.equal(pedido.status, 201, JSON.stringify(pedido.dados))
  // Pré-condição do webhook: um link previamente emitido pelo provedor externo.
  // A criação do link não é a operação sob teste nestes cenários.
  const sessaoStripeId = `cs_test_${randomUUID()}`
  const pagamento = await db.pagamentoPedido.create({ data: {
    pedidoId: pedido.dados.id, sessaoStripeId,
    url: `https://checkout.example.invalid/${sessaoStripeId}`, valor: '25.00',
    expiraEm: new Date(Date.now() + 3_600_000),
  } })
  return { pedidoId: pedido.dados.id as number, produtoId: produto.dados.id as number, pagamentoId: pagamento.id, sessaoStripeId }
}

type Cenario = Awaited<ReturnType<typeof prepararPagamento>>

function eventoStripe(cenario: Cenario, tipo = 'checkout.session.completed') {
  return {
    id: `evt_${randomUUID()}`, object: 'event', type: tipo,
    data: { object: {
      id: cenario.sessaoStripeId, object: 'checkout.session', status: 'complete',
      payment_status: tipo === 'checkout.session.async_payment_failed' ? 'unpaid' : 'paid',
      amount_total: 2500, currency: 'brl',
    } },
  }
}

function enviarStripe(evento: ReturnType<typeof eventoStripe>, segredo = segredoStripe) {
  const tempo = Math.floor(Date.now() / 1000)
  const assinatura = createHmac('sha256', segredo).update(`${tempo}.${JSON.stringify(evento)}`).digest('hex')
  // O emissor Stripe é simulado; validação de assinatura e processamento são os reais.
  return requisitar(apiPagamentos, '/api/webhooks/stripe', 'POST', evento, {
    'stripe-signature': `t=${tempo},v1=${assinatura}`,
  })
}

async function estado(cenario: Cenario) {
  const [pagamento, pedido, produto] = await Promise.all([
    db.pagamentoPedido.findUniqueOrThrow({ where: { id: cenario.pagamentoId } }),
    db.pedido.findUniqueOrThrow({ where: { id: cenario.pedidoId } }),
    db.produto.findUniqueOrThrow({ where: { id: cenario.produtoId } }),
  ])
  return { pagamento, pedido, produto }
}

function conferirAceite(dados: Awaited<ReturnType<typeof estado>>) {
  assert.equal(dados.pagamento.status, 'pago')
  assert.ok(dados.pagamento.pagoEm)
  assert.equal(dados.pedido.status, 'em_preparo')
  assert.equal(dados.pedido.estoqueBaixado, true)
  assert.equal(dados.produto.quantidade, 3)
  assert.equal(dados.produto.versaoEstoque, 1)
}

describe('Cadastro de restaurante', () => {
  it('quando os dados obrigatórios são válidos, então cadastra e permite consultar o restaurante', async () => {
    const entrada = dadosRestaurante()
    const criado = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', entrada)
    assert.equal(criado.status, 201)
    const consulta = await requisitar(apiRestaurantes, `/api/restaurantes/${criado.dados.id}`)
    assert.equal(consulta.status, 200)
    assert.equal(consulta.dados.cnpj, entrada.cnpj)
    assert.equal(consulta.dados.nome, entrada.nome)
    assert.equal(await db.restaurante.count({ where: { cnpj: entrada.cnpj } }), 1)
  })

  it('quando falta o nome, então responde 400 sem gravar', async () => {
    const { nome: _nome, ...entrada } = dadosRestaurante()
    const resposta = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', entrada)
    assert.equal(resposta.status, 400)
    assert.equal(resposta.dados.error, 'Campos obrigatórios ausentes')
    assert.equal(await db.restaurante.count({ where: { cnpj: entrada.cnpj } }), 0)
  })
})

describe('Webhook de delivery', () => {
  it('quando dois webhooks iFood iguais chegam simultaneamente, então persiste um único evento', async () => {
    const evento = { id: randomUUID(), orderId: randomUUID(), merchantId: randomUUID(), code: 'PLACED' }
    const respostas = await Promise.all([
      requisitar(apiIntegracao, '/api/webhooks/ifood', 'POST', [evento]),
      requisitar(apiIntegracao, '/api/webhooks/ifood', 'POST', [evento]),
    ])
    assert.deepEqual(respostas.map((r) => r.status), [202, 202])
    assert.equal(respostas.reduce((total, r) => total + r.dados.novas, 0), 1)
    const eventos = await db.eventoIntegracao.findMany({ where: { plataforma: 'ifood', eventoId: evento.id } })
    assert.equal(eventos.length, 1)
    assert.equal(eventos[0]!.pedidoIdExterno, evento.orderId)
    assert.equal(eventos[0]!.status, 'pendente')
    // Este teste cobre o recebimento durável, não o processamento posterior do pedido.
    assert.equal(await db.pedido.count({ where: { pedidoExternoId: evento.orderId } }), 0)
  })

  it('quando o webhook Rappi tem assinatura inválida, então responde 401 sem gravar', async () => {
    const orderId = randomUUID()
    const resposta = await requisitar(apiIntegracao, '/api/webhooks/rappi', 'POST', [
      { order_detail: { order_id: orderId } },
    ], { 'Rappi-Signature': 't=1,sign=0000' })
    assert.equal(resposta.status, 401)
    assert.equal(resposta.dados.error, 'Assinatura do webhook inválida')
    assert.equal(await db.eventoIntegracao.count({ where: { pedidoIdExterno: orderId } }), 0)
    assert.equal(await db.pedido.count({ where: { pedidoExternoId: orderId } }), 0)
  })
})

describe('Pagamento de pedido', () => {
  it('quando o Stripe confirma o pagamento, então marca como pago, aceita o pedido e baixa o estoque', async () => {
    const cenario = await prepararPagamento()
    const resposta = await enviarStripe(eventoStripe(cenario))
    assert.equal(resposta.status, 200)
    assert.equal(resposta.dados.recebido, true)
    conferirAceite(await estado(cenario))
  })

  it('quando a confirmação é enviada duas vezes simultaneamente, então baixa o estoque apenas uma vez', async () => {
    const cenario = await prepararPagamento()
    const evento = eventoStripe(cenario)
    const respostas = await Promise.all([enviarStripe(evento), enviarStripe(evento)])
    assert.deepEqual(respostas.map((r) => r.status), [200, 200])
    conferirAceite(await estado(cenario))
    assert.equal(await db.pagamentoPedido.count({ where: { pedidoId: cenario.pedidoId } }), 1)
    assert.equal(await db.itemPedido.count({ where: { pedidoId: cenario.pedidoId } }), 1)
  })

  it('quando a assinatura Stripe é inválida, então responde 400 sem alterar pagamento, pedido ou estoque', async () => {
    const cenario = await prepararPagamento()
    const antes = await estado(cenario)
    const resposta = await enviarStripe(eventoStripe(cenario), 'segredo_incorreto')
    assert.equal(resposta.status, 400)
    assert.equal(resposta.dados.error, 'Assinatura inválida')
    assert.deepEqual(await estado(cenario), antes)
  })

  it('quando o pagamento falha, então registra a falha sem aceitar o pedido nem baixar estoque', async () => {
    const cenario = await prepararPagamento()
    const resposta = await enviarStripe(eventoStripe(cenario, 'checkout.session.async_payment_failed'))
    assert.equal(resposta.status, 200)
    const dados = await estado(cenario)
    assert.equal(dados.pagamento.status, 'falhou')
    assert.equal(dados.pagamento.pagoEm, null)
    assert.equal(dados.pedido.status, 'novo')
    assert.equal(dados.pedido.estoqueBaixado, false)
    assert.equal(dados.produto.quantidade, 5)
    assert.equal(dados.produto.versaoEstoque, 0)
  })

  it('quando o pagamento é confirmado sem estoque, então preserva o pagamento como pago e mantém o pedido novo', async () => {
    const cenario = await prepararPagamento(0)
    const resposta = await enviarStripe(eventoStripe(cenario))
    assert.equal(resposta.status, 200)
    const dados = await estado(cenario)
    assert.equal(dados.pagamento.status, 'pago')
    assert.ok(dados.pagamento.pagoEm)
    assert.equal(dados.pedido.status, 'novo')
    assert.equal(dados.pedido.estoqueBaixado, false)
    assert.equal(dados.produto.quantidade, 0)
    assert.equal(dados.produto.versaoEstoque, 0)
  })

  it('quando chega uma falha atrasada após a confirmação, então preserva o pagamento como pago', async () => {
    const cenario = await prepararPagamento()
    assert.equal((await enviarStripe(eventoStripe(cenario))).status, 200)
    const confirmado = await estado(cenario)
    conferirAceite(confirmado)
    assert.equal((await enviarStripe(eventoStripe(cenario, 'checkout.session.async_payment_failed'))).status, 200)
    const depois = await estado(cenario)
    assert.deepEqual(depois.pagamento.pagoEm, confirmado.pagamento.pagoEm)
    assert.equal(depois.pedido.status, 'em_preparo')
    assert.equal(depois.produto.quantidade, 3)
    assert.equal(depois.produto.versaoEstoque, 1)
    assert.equal(depois.pagamento.status, 'pago', 'Uma falha atrasada não pode desfazer a confirmação do pagamento')
  })
})
