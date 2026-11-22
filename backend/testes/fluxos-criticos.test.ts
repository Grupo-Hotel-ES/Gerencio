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
  // Pedidos legados podem ter recebido o link antes da implantação da baixa na entrada.
  const pedido = quantidade === 0 ? { status: 201, dados: await db.pedido.create({ data: {
    restauranteId: restaurante.dados.id, app: 'balcao', metodoPagamento: 'online', preco: 25,
    enderecoDestino: 'Retirada no local', cepDestino: '',
    itens: { create: { produtoId: produto.dados.id, quantidade: 2 } },
  } }) } : await requisitar(apiPedidos, '/api/pedidos', 'POST', {
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

  it('quando lista restaurantes, então retorna os estabelecimentos persistidos', async () => {
    const entrada = dadosRestaurante()
    const criado = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', entrada)
    assert.equal(criado.status, 201)

    const resposta = await requisitar(apiRestaurantes, '/api/restaurantes')
    assert.equal(resposta.status, 200)
    assert.ok(Array.isArray(resposta.dados))

    const encontrado = resposta.dados.find((r: any) => r.id === criado.dados.id)
    assert.ok(encontrado)
    assert.equal(encontrado.cnpj, entrada.cnpj)
    assert.equal(encontrado.nome, entrada.nome)
  })

  it('quando atualiza todos os dados do restaurante via PUT, então substitui os dados antigos e valida erros', async () => {
    const inicial = dadosRestaurante()
    const criado = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', inicial)
    assert.equal(criado.status, 201)
    const id = criado.dados.id

    const atualizacao = {
      cnpj: randomUUID(),
      nome: 'Restaurante Atualizado Total',
      email: 'atualizado@example.invalid',
      telefone: '11988887777',
      cep: '05000000',
      cidade: 'Campinas',
      endereco: 'Avenida Teste, 500',
      taxaEntregaBase: 12.5,
      kmInclusosTaxaBase: 3.5,
      custoPorKmAdicional: 2.5,
      distanciaMaximaKm: 20,
      latitude: -23.55052,
      longitude: -46.633308,
    }

    const respostaPut = await requisitar(apiRestaurantes, `/api/restaurantes/${id}`, 'PUT', atualizacao)
    assert.equal(respostaPut.status, 200)

    const noBanco = await db.restaurante.findUnique({ where: { id } })
    assert.ok(noBanco)
    assert.equal(noBanco.cnpj, atualizacao.cnpj)
    assert.equal(noBanco.nome, atualizacao.nome)
    assert.equal(noBanco.email, atualizacao.email)
    assert.equal(noBanco.telefone, atualizacao.telefone)
    assert.equal(noBanco.cep, atualizacao.cep)
    assert.equal(noBanco.cidade, atualizacao.cidade)
    assert.equal(noBanco.endereco, atualizacao.endereco)
    assert.equal(Number(noBanco.taxaEntregaBase), atualizacao.taxaEntregaBase)
    assert.equal(noBanco.kmInclusosTaxaBase, atualizacao.kmInclusosTaxaBase)
    assert.equal(Number(noBanco.custoPorKmAdicional), atualizacao.custoPorKmAdicional)
    assert.equal(noBanco.distanciaMaximaKm, atualizacao.distanciaMaximaKm)
    assert.equal(noBanco.latitude, atualizacao.latitude)
    assert.equal(noBanco.longitude, atualizacao.longitude)

    const resposta404 = await requisitar(apiRestaurantes, '/api/restaurantes/99999999', 'PUT', atualizacao)
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Restaurante não encontrado')

    const resposta400Id = await requisitar(apiRestaurantes, '/api/restaurantes/invalido', 'PUT', atualizacao)
    assert.equal(resposta400Id.status, 400)
    assert.equal(resposta400Id.dados.error, 'Id inválido')

    const resposta400Dado = await requisitar(apiRestaurantes, `/api/restaurantes/${id}`, 'PUT', {
      ...atualizacao,
      taxaEntregaBase: -1,
    })
    assert.equal(resposta400Dado.status, 400)
    assert.equal(resposta400Dado.dados.error, 'taxaEntregaBase deve ser um número maior ou igual a zero')
  })

  it('quando atualiza parcialmente via PATCH, então altera apenas os campos informados sem resetar os demais', async () => {
    const inicial = dadosRestaurante()
    const criado = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', inicial)
    assert.equal(criado.status, 201)
    const id = criado.dados.id

    const novoTelefone = '11977776666'
    const respostaPatch = await requisitar(apiRestaurantes, `/api/restaurantes/${id}`, 'PATCH', { telefone: novoTelefone })
    assert.equal(respostaPatch.status, 200)

    const noBanco = await db.restaurante.findUnique({ where: { id } })
    assert.ok(noBanco)
    assert.equal(noBanco.telefone, novoTelefone)
    assert.equal(noBanco.nome, inicial.nome)
    assert.equal(noBanco.cnpj, inicial.cnpj)
    assert.equal(noBanco.email, inicial.email)
    assert.equal(noBanco.cidade, inicial.cidade)
    assert.equal(noBanco.endereco, inicial.endereco)
    assert.equal(noBanco.cep, inicial.cep)

    const resposta404 = await requisitar(apiRestaurantes, '/api/restaurantes/99999999', 'PATCH', { telefone: novoTelefone })
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Restaurante não encontrado')

    const resposta400Id = await requisitar(apiRestaurantes, '/api/restaurantes/invalido', 'PATCH', { telefone: novoTelefone })
    assert.equal(resposta400Id.status, 400)
    assert.equal(resposta400Id.dados.error, 'Id inválido')

    const resposta400Entrega = await requisitar(apiRestaurantes, `/api/restaurantes/${id}`, 'PATCH', { custoPorKmAdicional: -10 })
    assert.equal(resposta400Entrega.status, 400)
    assert.equal(resposta400Entrega.dados.error, 'custoPorKmAdicional deve ser um número maior ou igual a zero')
  })

  it('quando deleta o restaurante, então remove o registro e suas credenciais em cascata', async () => {
    const entrada = dadosRestaurante()
    const criado = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', entrada)
    assert.equal(criado.status, 201)
    const id = criado.dados.id as number

    const credencial = await db.credencialPlataforma.create({
      data: {
        restauranteId: id,
        plataforma: 'ifood',
        clientId: 'client_teste_cascade',
        accessToken: 'access_teste',
        refreshToken: 'refresh_teste',
      },
    })
    assert.ok(credencial.id)
    assert.equal(await db.credencialPlataforma.count({ where: { restauranteId: id } }), 1)

    const respostaDelete = await requisitar(apiRestaurantes, `/api/restaurantes/${id}`, 'DELETE')
    assert.equal(respostaDelete.status, 204)
    assert.equal(respostaDelete.dados, null)

    assert.equal(await db.restaurante.count({ where: { id } }), 0)
    assert.equal(await db.credencialPlataforma.count({ where: { restauranteId: id } }), 0)

    const resposta404 = await requisitar(apiRestaurantes, `/api/restaurantes/${id}`, 'DELETE')
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Restaurante não encontrado')

    const resposta400 = await requisitar(apiRestaurantes, '/api/restaurantes/invalido', 'DELETE')
    assert.equal(resposta400.status, 400)
    assert.equal(resposta400.dados.error, 'Id inválido')
  })

  it('quando consulta os produtos do restaurante, então retorna apenas o cardápio daquele estabelecimento', async () => {
    const [resA, resB] = await Promise.all([
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
    ])
    assert.equal(resA.status, 201)
    assert.equal(resB.status, 201)
    const idA = resA.dados.id as number
    const idB = resB.dados.id as number

    const [prodA1, prodA2] = await Promise.all([
      requisitar(apiProdutos, '/produtos', 'POST', {
        restauranteId: idA, nome: 'Burger Gourmet A', preco: '32.00', quantidade: 10, categoria: 'Lanches',
      }),
      requisitar(apiProdutos, '/produtos', 'POST', {
        restauranteId: idA, nome: 'Suco Natural A', preco: '9.00', quantidade: 15, categoria: 'Bebidas',
      }),
    ])
    assert.equal(prodA1.status, 201)
    assert.equal(prodA2.status, 201)

    const prodB = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId: idB, nome: 'Pizza Especial B', preco: '65.00', quantidade: 5, categoria: 'Pizzas',
    })
    assert.equal(prodB.status, 201)

    const consultaA = await requisitar(apiRestaurantes, `/api/restaurantes/${idA}/produtos`)
    assert.equal(consultaA.status, 200)
    assert.ok(Array.isArray(consultaA.dados))
    assert.equal(consultaA.dados.length, 2)

    const idsRetornados = consultaA.dados.map((p: any) => p.id)
    assert.ok(idsRetornados.includes(prodA1.dados.id))
    assert.ok(idsRetornados.includes(prodA2.dados.id))
    assert.ok(!idsRetornados.includes(prodB.dados.id))

    assert.ok(consultaA.dados.every((p: any) => p.restauranteId === idA))

    const resposta404 = await requisitar(apiRestaurantes, '/api/restaurantes/99999999/produtos')
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Restaurante não encontrado')

    const resposta400 = await requisitar(apiRestaurantes, '/api/restaurantes/invalido/produtos')
    assert.equal(resposta400.status, 400)
    assert.equal(resposta400.dados.error, 'Id inválido')
  })
})

describe('Catálogo de produtos', () => {
  it('quando lista produtos, então retorna os itens ativos ordenados por nome e filtra por restaurante', async () => {
    const [resA, resB] = await Promise.all([
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
    ])
    assert.equal(resA.status, 201)
    assert.equal(resB.status, 201)
    const idA = resA.dados.id as number
    const idB = resB.dados.id as number

    const [prodA1, prodA2, prodB] = await Promise.all([
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: idA, nome: 'Batata Frita', preco: '15.00', quantidade: 20 }),
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: idA, nome: 'Alface Salada', preco: '12.00', quantidade: 5 }),
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: idB, nome: 'Calzone', preco: '40.00', quantidade: 8 }),
    ])
    assert.equal(prodA1.status, 201)
    assert.equal(prodA2.status, 201)
    assert.equal(prodB.status, 201)

    const prodArquivado = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId: idA, nome: 'Antigo Fora de Linha', preco: '10.00', quantidade: 0,
    })
    assert.equal(prodArquivado.status, 201)
    const arquivamento = await requisitar(apiProdutos, `/produtos/${prodArquivado.dados.id}/arquivar`, 'POST')
    assert.equal(arquivamento.status, 200)

    const listaA = await requisitar(apiProdutos, `/produtos?restauranteId=${idA}`)
    assert.equal(listaA.status, 200)
    assert.ok(Array.isArray(listaA.dados))

    const nomesA = listaA.dados.map((p: any) => p.nome)
    assert.ok(nomesA.includes('Alface Salada'))
    assert.ok(nomesA.includes('Batata Frita'))
    assert.ok(!nomesA.includes('Calzone'))
    assert.ok(!nomesA.includes('Antigo Fora de Linha'), 'Produto arquivado não deve aparecer na listagem')

    const itensA = listaA.dados.filter((p: any) => p.id === prodA1.dados.id || p.id === prodA2.dados.id)
    assert.equal(itensA[0].id, prodA2.dados.id)
    assert.equal(itensA[1].id, prodA1.dados.id)

    const resposta400 = await requisitar(apiProdutos, '/produtos?restauranteId=invalido')
    assert.equal(resposta400.status, 400)
    assert.equal(resposta400.dados.error, 'restauranteId inválido')
  })

  it('quando consulta detalhe do produto por id, então retorna os dados com o restaurante vinculado', async () => {
    const res = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    assert.equal(res.status, 201)
    const restauranteId = res.dados.id as number

    const criado = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Hambúrguer Artesanal', preco: '35.50', quantidade: 15, categoria: 'Burgers',
    })
    assert.equal(criado.status, 201)
    const id = criado.dados.id as number

    const detalhe = await requisitar(apiProdutos, `/produtos/${id}`)
    assert.equal(detalhe.status, 200)
    assert.equal(detalhe.dados.id, id)
    assert.equal(detalhe.dados.nome, 'Hambúrguer Artesanal')
    assert.equal(Number(detalhe.dados.preco), 35.50)
    assert.equal(detalhe.dados.quantidade, 15)
    assert.equal(detalhe.dados.categoria, 'Burgers')
    assert.ok(detalhe.dados.restaurante)
    assert.equal(detalhe.dados.restaurante.id, restauranteId)

    const resposta404 = await requisitar(apiProdutos, '/produtos/99999999')
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Produto não encontrado')

    const resposta400 = await requisitar(apiProdutos, '/produtos/invalido')
    assert.equal(resposta400.status, 400)
    assert.equal(resposta400.dados.error, 'Id inválido')
  })

  it('quando atualiza todos os dados do produto via PUT, então substitui os valores e impede troca de restaurante', async () => {
    const [resA, resB] = await Promise.all([
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
    ])
    assert.equal(resA.status, 201)
    assert.equal(resB.status, 201)
    const idA = resA.dados.id as number
    const idB = resB.dados.id as number

    const criado = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId: idA, nome: 'Prato do Dia', preco: '20.00', quantidade: 10,
    })
    assert.equal(criado.status, 201)
    const id = criado.dados.id as number

    const respostaPut = await requisitar(apiProdutos, `/produtos/${id}`, 'PUT', {
      nome: 'Prato Executivo Especial', preco: '28.50', restauranteId: idA,
    })
    assert.equal(respostaPut.status, 200)
    assert.equal(respostaPut.dados.nome, 'Prato Executivo Especial')
    assert.equal(Number(respostaPut.dados.preco), 28.50)

    const noBanco = await db.produto.findUnique({ where: { id } })
    assert.ok(noBanco)
    assert.equal(noBanco.nome, 'Prato Executivo Especial')
    assert.equal(Number(noBanco.preco), 28.50)

    const tentativaTroca = await requisitar(apiProdutos, `/produtos/${id}`, 'PUT', {
      nome: 'Tentativa Troca', preco: '30.00', restauranteId: idB,
    })
    assert.equal(tentativaTroca.status, 400)
    assert.equal(tentativaTroca.dados.error, 'O restaurante de um produto não pode ser alterado')

    const respostaInvalida = await requisitar(apiProdutos, `/produtos/${id}`, 'PUT', {
      nome: '', preco: -5, restauranteId: idA,
    })
    assert.equal(respostaInvalida.status, 400)
    assert.equal(respostaInvalida.dados.error, 'Nome, preço e restauranteId são obrigatórios.')

    const resposta404 = await requisitar(apiProdutos, '/produtos/99999999', 'PUT', {
      nome: 'Inexistente', preco: '10.00', restauranteId: idA,
    })
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Produto não encontrado')

    const resposta400Id = await requisitar(apiProdutos, '/produtos/invalido', 'PUT', {
      nome: 'Teste', preco: '10.00', restauranteId: idA,
    })
    assert.equal(resposta400Id.status, 400)
    assert.equal(resposta400Id.dados.error, 'Id inválido')
  })

  it('quando atualiza parcialmente via PATCH, então altera apenas os campos informados sem resetar os demais', async () => {
    const res = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    assert.equal(res.status, 201)
    const restauranteId = res.dados.id as number

    const criado = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Pizza de Mussarela', preco: '50.00', quantidade: 8, categoria: 'Pizzas',
    })
    assert.equal(criado.status, 201)
    const id = criado.dados.id as number

    const respostaPatch = await requisitar(apiProdutos, `/produtos/${id}`, 'PATCH', {
      categoria: 'Pizzas Tradicionais', preco: 55.90,
    })
    assert.equal(respostaPatch.status, 200)

    const noBanco = await db.produto.findUnique({ where: { id } })
    assert.ok(noBanco)
    assert.equal(noBanco.categoria, 'Pizzas Tradicionais')
    assert.equal(Number(noBanco.preco), 55.90)
    assert.equal(noBanco.nome, 'Pizza de Mussarela')
    assert.equal(noBanco.quantidade, 8)
    assert.equal(noBanco.restauranteId, restauranteId)

    const tentativaTroca = await requisitar(apiProdutos, `/produtos/${id}`, 'PATCH', {
      restauranteId: 99999999,
    })
    assert.equal(tentativaTroca.status, 400)
    assert.equal(tentativaTroca.dados.error, 'Nome, categoria ou preço inválido, ou tentativa de alterar o restaurante do produto')

    const precoInvalido = await requisitar(apiProdutos, `/produtos/${id}`, 'PATCH', { preco: -10 })
    assert.equal(precoInvalido.status, 400)

    const resposta404 = await requisitar(apiProdutos, '/produtos/99999999', 'PATCH', { nome: 'Inexistente' })
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Produto não encontrado')

    const resposta400Id = await requisitar(apiProdutos, '/produtos/invalido', 'PATCH', { nome: 'Teste' })
    assert.equal(resposta400Id.status, 400)
    assert.equal(resposta400Id.dados.error, 'Id inválido')
  })

  it('quando deleta o produto sem pedidos, então remove do banco; se tiver pedidos, então responde 409', async () => {
    const res = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    assert.equal(res.status, 201)
    const restauranteId = res.dados.id as number

    const semPedidos = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Sobremesa Sem Vendas', preco: '14.00', quantidade: 5,
    })
    assert.equal(semPedidos.status, 201)
    const idSemPedidos = semPedidos.dados.id as number

    const respostaDelete = await requisitar(apiProdutos, `/produtos/${idSemPedidos}`, 'DELETE')
    assert.equal(respostaDelete.status, 204)
    assert.equal(respostaDelete.dados, null)
    assert.equal(await db.produto.count({ where: { id: idSemPedidos } }), 0)

    const comPedidos = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Item Vendido no Balcão', preco: '25.00', quantidade: 10,
    })
    assert.equal(comPedidos.status, 201)
    const idComPedidos = comPedidos.dados.id as number

    const pedidoCriado = await requisitar(apiPedidos, '/api/pedidos', 'POST', {
      restauranteId, nomeCliente: 'Cliente Exclusão', app: 'balcao', metodoPagamento: 'dinheiro',
      enderecoDestino: 'Retirada', cepDestino: '',
      itens: [{ produtoId: idComPedidos, quantidade: 1 }],
    })
    assert.equal(pedidoCriado.status, 201)

    const tentativaDeleteComPedido = await requisitar(apiProdutos, `/produtos/${idComPedidos}`, 'DELETE')
    assert.equal(tentativaDeleteComPedido.status, 409)
    assert.ok(tentativaDeleteComPedido.dados.error.includes('aparece em 1 pedido'))
    assert.equal(await db.produto.count({ where: { id: idComPedidos } }), 1)

    const resposta404 = await requisitar(apiProdutos, '/produtos/99999999', 'DELETE')
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Produto não encontrado')

    const resposta400 = await requisitar(apiProdutos, '/produtos/invalido', 'DELETE')
    assert.equal(resposta400.status, 400)
    assert.equal(resposta400.dados.error, 'Id inválido')
  })

  it('quando arquiva o produto, então define data de arquivamento, incrementa versaoEstoque e bloqueia edições', async () => {
    const res = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    assert.equal(res.status, 201)
    const restauranteId = res.dados.id as number

    const prod = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Bebida de Verão', preco: '8.00', quantidade: 12,
    })
    assert.equal(prod.status, 201)
    const id = prod.dados.id as number
    const versaoInicial = prod.dados.versaoEstoque as number

    const arquivado = await requisitar(apiProdutos, `/produtos/${id}/arquivar`, 'POST')
    assert.equal(arquivado.status, 200)
    assert.ok(arquivado.dados.arquivadoEm)

    const noBanco = await db.produto.findUnique({ where: { id } })
    assert.ok(noBanco?.arquivadoEm)
    assert.equal(noBanco?.versaoEstoque, versaoInicial + 1)

    const tentativaPut = await requisitar(apiProdutos, `/produtos/${id}`, 'PUT', {
      nome: 'Tentativa Novo Nome', preco: '9.00', restauranteId,
    })
    assert.equal(tentativaPut.status, 404)
    assert.equal(tentativaPut.dados.error, 'Produto não encontrado')

    const tentativaPatch = await requisitar(apiProdutos, `/produtos/${id}`, 'PATCH', { preco: 10.00 })
    assert.equal(tentativaPatch.status, 404)
    assert.equal(tentativaPatch.dados.error, 'Produto não encontrado')

    const reArquivar = await requisitar(apiProdutos, `/produtos/${id}/arquivar`, 'POST')
    assert.equal(reArquivar.status, 200)

    const resposta404 = await requisitar(apiProdutos, '/produtos/99999999/arquivar', 'POST')
    assert.equal(resposta404.status, 404)
    assert.equal(resposta404.dados.error, 'Produto não encontrado')

    const resposta400 = await requisitar(apiProdutos, '/produtos/invalido/arquivar', 'POST')
    assert.equal(resposta400.status, 400)
    assert.equal(resposta400.dados.error, 'Id inválido')
  })
})

describe('Mapeamento de catálogo para delivery', () => {
  it('quando cria mapeamento com plataforma em formato livre (ex: "Uber Eats"), então normaliza a chave, persiste no banco e responde 201', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    assert.equal(rest.status, 201)
    const restauranteId = rest.dados.id as number

    const prod = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Hambúrguer Artesanal', preco: '32.00', quantidade: 10,
    })
    assert.equal(prod.status, 201)
    const produtoId = prod.dados.id as number

    const resUber = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: 'Uber Eats', idExternoApp: 'UBER-BURGER-01',
    })
    assert.equal(resUber.status, 201)
    assert.equal(resUber.dados.plataforma, 'ubereats')
    assert.equal(resUber.dados.idExternoApp, 'UBER-BURGER-01')
    assert.equal(resUber.dados.produtoId, produtoId)

    const noBancoUber = await db.mapeamentoApp.findUnique({ where: { id: resUber.dados.id } })
    assert.ok(noBancoUber)
    assert.equal(noBancoUber?.plataforma, 'ubereats')

    const res99 = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: '99 Food', idExternoApp: '99-BURGER-01',
    })
    assert.equal(res99.status, 201)
    assert.equal(res99.dados.plataforma, '99food')
  })

  it('quando tenta mapear código já vinculado a outro produto ativo na mesma plataforma, então responde 409 com mensagem de conflito', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    const restauranteId = rest.dados.id as number

    const [prodA, prodB] = await Promise.all([
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId, nome: 'Pizza Calabresa', preco: '45.00', quantidade: 5 }),
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId, nome: 'Pizza Mussarela', preco: '42.00', quantidade: 5 }),
    ])
    assert.equal(prodA.status, 201)
    assert.equal(prodB.status, 201)

    const mapA = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: prodA.dados.id, plataforma: 'ifood', idExternoApp: 'SKU-PIZZA-IF-1',
    })
    assert.equal(mapA.status, 201)

    const mapB = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: prodB.dados.id, plataforma: 'ifood', idExternoApp: 'SKU-PIZZA-IF-1',
    })
    assert.equal(mapB.status, 409)
    assert.ok(mapB.dados.error.includes('já está ligado a Pizza Calabresa'))

    const total = await db.mapeamentoApp.count({
      where: { plataforma: 'ifood', idExternoApp: 'SKU-PIZZA-IF-1' },
    })
    assert.equal(total, 1)
  })

  it('quando tenta cadastrar um segundo código da mesma plataforma para o mesmo produto, então responde 409', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    const prod = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId: rest.dados.id, nome: 'Refrigerante Lata', preco: '6.00', quantidade: 50,
    })
    assert.equal(prod.status, 201)
    const produtoId = prod.dados.id as number

    const map1 = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: 'rappi', idExternoApp: 'REFRI-RAPPI-1',
    })
    assert.equal(map1.status, 201)

    const map2 = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: 'rappi', idExternoApp: 'REFRI-RAPPI-2',
    })
    assert.equal(map2.status, 409)
    assert.ok(map2.dados.error.includes('Este produto já tem o código REFRI-RAPPI-1 nesta plataforma'))

    const total = await db.mapeamentoApp.count({
      where: { produtoId, plataforma: 'rappi' },
    })
    assert.equal(total, 1)
  })

  it('quando cadastra código que pertencia a produto arquivado, então reatribui o código ao novo produto e remove o mapeamento anterior', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    const restauranteId = rest.dados.id as number

    const prodAntigo = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Sobremesa Antiga', preco: '12.00', quantidade: 0,
    })
    assert.equal(prodAntigo.status, 201)
    const idAntigo = prodAntigo.dados.id as number

    const mapAntigo = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: idAntigo, plataforma: 'keeta', idExternoApp: 'DOCE-KEETA-UNICO',
    })
    assert.equal(mapAntigo.status, 201)
    const mapAntigoId = mapAntigo.dados.id as number

    const arquivar = await requisitar(apiProdutos, `/produtos/${idAntigo}/arquivar`, 'POST')
    assert.equal(arquivar.status, 200)

    const prodNovo = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId, nome: 'Sobremesa Nova', preco: '14.00', quantidade: 10,
    })
    assert.equal(prodNovo.status, 201)
    const idNovo = prodNovo.dados.id as number

    const mapNovo = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: idNovo, plataforma: 'keeta', idExternoApp: 'DOCE-KEETA-UNICO',
    })
    assert.equal(mapNovo.status, 201)
    assert.equal(mapNovo.dados.produtoId, idNovo)

    const antigoNoBanco = await db.mapeamentoApp.findUnique({ where: { id: mapAntigoId } })
    assert.equal(antigoNoBanco, null)

    const ativoNoBanco = await db.mapeamentoApp.findFirst({
      where: { plataforma: 'keeta', idExternoApp: 'DOCE-KEETA-UNICO' },
    })
    assert.equal(ativoNoBanco?.produtoId, idNovo)
  })

  it('quando informa produto inexistente, arquivado ou dados inválidos, então responde 404 ou 400 sem gravar', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    const prod = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId: rest.dados.id, nome: 'Prato Para Teste De Erro', preco: '20.00', quantidade: 1,
    })
    assert.equal(prod.status, 201)
    const produtoId = prod.dados.id as number

    const resp404Inexistente = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: 9999999, plataforma: 'ifood', idExternoApp: 'EXT-1',
    })
    assert.equal(resp404Inexistente.status, 404)
    assert.equal(resp404Inexistente.dados.error, 'Produto informado não existe.')

    await requisitar(apiProdutos, `/produtos/${produtoId}/arquivar`, 'POST')
    const resp404Arquivado = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: 'ifood', idExternoApp: 'EXT-1',
    })
    assert.equal(resp404Arquivado.status, 404)
    assert.equal(resp404Arquivado.dados.error, 'Produto informado não existe.')

    const resp400Plataforma = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: 'plataforma_desconhecida', idExternoApp: 'EXT-1',
    })
    assert.equal(resp400Plataforma.status, 400)

    const resp400SemId = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId, plataforma: 'ifood', idExternoApp: '',
    })
    assert.equal(resp400SemId.status, 400)

    const resp400IdInvalido = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: 'abc', plataforma: 'ifood', idExternoApp: 'EXT-1',
    })
    assert.equal(resp400IdInvalido.status, 400)
  })

  it('quando lista mapeamentos com filtro por restauranteId, então retorna apenas os vínculos de produtos daquele restaurante', async () => {
    const [restA, restB] = await Promise.all([
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
      requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante()),
    ])
    const idA = restA.dados.id as number
    const idB = restB.dados.id as number

    const [prodA, prodB] = await Promise.all([
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: idA, nome: 'Item Rest A', preco: '10.00', quantidade: 5 }),
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: idB, nome: 'Item Rest B', preco: '15.00', quantidade: 5 }),
    ])

    const skuA = `SKU-A-${randomUUID().slice(0, 8)}`
    const skuB = `SKU-B-${randomUUID().slice(0, 8)}`
    await Promise.all([
      requisitar(apiProdutos, '/mapeamentos', 'POST', { produtoId: prodA.dados.id, plataforma: 'ifood', idExternoApp: skuA }),
      requisitar(apiProdutos, '/mapeamentos', 'POST', { produtoId: prodB.dados.id, plataforma: 'ifood', idExternoApp: skuB }),
    ])

    const listaA = await requisitar(apiProdutos, `/mapeamentos?restauranteId=${idA}`)
    assert.equal(listaA.status, 200)
    assert.ok(listaA.dados.some((m: { idExternoApp: string }) => m.idExternoApp === skuA))
    assert.ok(!listaA.dados.some((m: { idExternoApp: string }) => m.idExternoApp === skuB))

    const listaInvalida = await requisitar(apiProdutos, '/mapeamentos?restauranteId=invalido')
    assert.equal(listaInvalida.status, 400)
    assert.equal(listaInvalida.dados.error, 'restauranteId inválido')
  })

  it('quando busca mapeamento por plataforma e código externo, então retorna 200 com os dados do produto vinculado', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    const prod = await requisitar(apiProdutos, '/produtos', 'POST', {
      restauranteId: rest.dados.id, nome: 'Suco de Laranja', preco: '8.50', quantidade: 15,
    })
    const sku = `SUCO-${randomUUID().slice(0, 8)}`
    await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: prod.dados.id, plataforma: 'ifood', idExternoApp: sku,
    })

    const buscaSucesso = await requisitar(apiProdutos, `/mapeamentos/buscar?plataforma=iFood&idExternoApp=${sku}`)
    assert.equal(buscaSucesso.status, 200)
    assert.equal(buscaSucesso.dados.idExternoApp, sku)
    assert.equal(buscaSucesso.dados.produto.id, prod.dados.id)
    assert.equal(buscaSucesso.dados.produto.nome, 'Suco de Laranja')

    const busca404 = await requisitar(apiProdutos, `/mapeamentos/buscar?plataforma=ifood&idExternoApp=SKU_INEXISTENTE_${randomUUID()}`)
    assert.equal(busca404.status, 404)
    assert.equal(busca404.dados.error, 'Mapeamento não encontrado para esta plataforma e ID externo.')

    const busca400 = await requisitar(apiProdutos, '/mapeamentos/buscar?plataforma=ifood')
    assert.equal(busca400.status, 400)
  })

  it('quando deleta mapeamento por id, então remove do banco com 204 e libera o código para reuso', async () => {
    const rest = await requisitar(apiRestaurantes, '/api/restaurantes', 'POST', dadosRestaurante())
    const [prod1, prod2] = await Promise.all([
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: rest.dados.id, nome: 'Produto Um', preco: '10.00', quantidade: 5 }),
      requisitar(apiProdutos, '/produtos', 'POST', { restauranteId: rest.dados.id, nome: 'Produto Dois', preco: '12.00', quantidade: 5 }),
    ])
    const sku = `UBER-LIBERAR-${randomUUID().slice(0, 8)}`
    const mapa = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: prod1.dados.id, plataforma: 'ubereats', idExternoApp: sku,
    })
    assert.equal(mapa.status, 201)
    const mapId = mapa.dados.id as number

    const del = await requisitar(apiProdutos, `/mapeamentos/${mapId}`, 'DELETE')
    assert.equal(del.status, 204)
    assert.equal(del.dados, null)

    const existeNoBanco = await db.mapeamentoApp.findUnique({ where: { id: mapId } })
    assert.equal(existeNoBanco, null)

    const reuso = await requisitar(apiProdutos, '/mapeamentos', 'POST', {
      produtoId: prod2.dados.id, plataforma: 'ubereats', idExternoApp: sku,
    })
    assert.equal(reuso.status, 201)
    assert.equal(reuso.dados.produtoId, prod2.dados.id)

    const del404 = await requisitar(apiProdutos, '/mapeamentos/99999999', 'DELETE')
    assert.equal(del404.status, 404)

    const del400 = await requisitar(apiProdutos, '/mapeamentos/invalido', 'DELETE')
    assert.equal(del400.status, 400)
  })

  it('quando cadastra produto vinculado a múltiplos canais simultâneos via POST /produtos/vincular, então persiste o produto e todos os mapeamentos em transação única', async () => {
    const skuIfood = `MULTI-IF-${randomUUID().slice(0, 8)}`
    const skuRappi = `MULTI-RP-${randomUUID().slice(0, 8)}`
    const sku99 = `MULTI-99-${randomUUID().slice(0, 8)}`

    const res = await requisitar(apiProdutos, '/produtos/vincular', 'POST', {
      nome: 'Combo Executivo',
      categoria: 'Almoço',
      preco: '39.90',
      quantidade: 25,
      vinculos: [
        { plataforma: 'iFood', idExternoApp: skuIfood },
        { plataforma: 'Rappi', idExternoApp: skuRappi },
        { plataforma: '99 Food', idExternoApp: sku99 },
      ],
    })
    assert.equal(res.status, 201)
    assert.equal(res.dados.nome, 'Combo Executivo')
    assert.equal(res.dados.categoria, 'Almoço')
    assert.equal(Number(res.dados.preco), 39.9)
    assert.equal(res.dados.quantidade, 25)
    assert.equal(res.dados.mapeamentos.length, 3)

    const plataformasVinculadas = res.dados.mapeamentos.map((m: { plataforma: string }) => m.plataforma).sort()
    assert.deepEqual(plataformasVinculadas, ['99food', 'ifood', 'rappi'])

    const noBanco = await db.produto.findUnique({
      where: { id: res.dados.id },
      include: { mapeamentos: true },
    })
    assert.ok(noBanco)
    assert.equal(noBanco?.mapeamentos.length, 3)
  })

  it('quando tenta vincular com plataformas repetidas ou código em conflito, então responde 400 ou 409 sem criar o produto', async () => {
    const skuDuplicado = `CONF-SKU-${randomUUID().slice(0, 8)}`

    const resDuplicadoNoArray = await requisitar(apiProdutos, '/produtos/vincular', 'POST', {
      nome: 'Item Plataforma Dupla',
      preco: '20.00',
      quantidade: 5,
      vinculos: [
        { plataforma: 'ifood', idExternoApp: 'COD-1' },
        { plataforma: 'iFood', idExternoApp: 'COD-2' },
      ],
    })
    assert.equal(resDuplicadoNoArray.status, 400)
    assert.equal(resDuplicadoNoArray.dados.error, 'Cada plataforma pode aparecer uma vez só no vínculo.')

    const primeiro = await requisitar(apiProdutos, '/produtos/vincular', 'POST', {
      nome: 'Produto Base Conflito',
      preco: '15.00',
      quantidade: 10,
      vinculos: [{ plataforma: 'rappi', idExternoApp: skuDuplicado }],
    })
    assert.equal(primeiro.status, 201)

    const segundoConflito = await requisitar(apiProdutos, '/produtos/vincular', 'POST', {
      nome: 'Produto Tentativa Repetida',
      preco: '18.00',
      quantidade: 10,
      vinculos: [{ plataforma: 'rappi', idExternoApp: skuDuplicado }],
    })
    assert.equal(segundoConflito.status, 409)
    assert.ok(segundoConflito.dados.error.includes('já está vinculado a Produto Base Conflito'))

    const contagem = await db.produto.count({ where: { nome: 'Produto Tentativa Repetida' } })
    assert.equal(contagem, 0)
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
    assert.equal(dados.pedido.estoqueBaixado, true)
    assert.equal(dados.produto.quantidade, 3)
    assert.equal(dados.produto.versaoEstoque, 1)
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
