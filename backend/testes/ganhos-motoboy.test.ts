import './ambiente'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import pedidos from '../api-pedidos/src/server'
import restaurantes from '../api-restaurantes/src/server'
import { db } from '../packages/shared-db/src/index'

const servidores: Server[] = []
let apiPedidos: string
let apiRestaurantes: string

before(async () => {
  const enderecos: string[] = []
  for (const app of [pedidos, restaurantes]) {
    const servidor = app.listen(0, '127.0.0.1')
    servidores.push(servidor)
    await once(servidor, 'listening')
    enderecos.push(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`)
  }
  const [enderecoPedidos, enderecoRestaurantes] = enderecos
  assert.ok(enderecoPedidos && enderecoRestaurantes)
  apiPedidos = enderecoPedidos
  apiRestaurantes = enderecoRestaurantes
})

after(async () => {
  await Promise.all(servidores.map((servidor) => new Promise<void>((resolve, reject) => {
    servidor.close((erro) => erro ? reject(erro) : resolve())
  })))
  await db.$disconnect()
  // Os dados únicos são descartados com o container exclusivo do executor.
})

async function requisitar(base: string, caminho: string, metodo = 'GET', corpo?: unknown) {
  const resposta = await fetch(base + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  })
  const dados = await resposta.json() as any
  return { status: resposta.status, dados }
}

async function preparar() {
  // Fixtures de catálogo, cliente e funcionário; as operações sob teste usam HTTP real.
  const restaurante = await db.restaurante.create({ data: {
    nome: 'Restaurante do repasse', cnpj: randomUUID(), email: 'teste@example.invalid',
    telefone: '0', cep: '0', cidade: 'Teste', endereco: 'Rua de teste, 1',
    razaoSocial: 'Cadastro atual preservado', configuracoes: { lojaAberta: true },
  } })
  const produto = await db.produto.create({ data: { restauranteId: restaurante.id, nome: 'Produto de teste', preco: 20, quantidade: 10 } })
  const cliente = await db.cliente.create({ data: { nomeCliente: randomUUID(), endereco: 'Rua do cliente, 2' } })
  const entregador = await db.funcionario.create({ data: {
    nome: 'Entregador de teste', cpf: randomUUID(), telefone: '0', email: 'teste@example.invalid',
  } })
  const regra = await requisitar(apiRestaurantes, `/restaurantes/${restaurante.id}/regras-entrega`, 'PATCH', { percentualRepasseMotoboy: 50 })
  assert.equal(regra.status, 200, JSON.stringify(regra.dados))
  const criado = await requisitar(apiPedidos, '/pedidos', 'POST', {
    restauranteId: restaurante.id, clienteId: cliente.id, app: 'balcao', metodoPagamento: 'dinheiro',
    enderecoDestino: 'Retirada no local', cepDestino: '', custoEntrega: 10, entregadorId: entregador.id,
    itens: [{ produtoId: produto.id, quantidade: 1 }],
  })
  assert.equal(criado.status, 201, JSON.stringify(criado.dados))
  return { restaurante, cliente, entregador, pedido: criado.dados }
}

describe('Conciliação dos ganhos do motoboy com o cadastro atual', () => {
  it('quando o restaurante repassa 50% de uma entrega de R$ 10, então registra R$ 5 e o extrato mostra o cliente cadastrado', async () => {
    const cenario = await preparar()
    assert.equal(Number(cenario.pedido.entrega.valorMotoboy), 5)
    const persistida = await db.entrega.findUniqueOrThrow({ where: { pedidoId: cenario.pedido.id } })
    assert.equal(Number(persistida.valorMotoboy), 5)
    const extrato = await requisitar(apiPedidos, `/entregas/motoboy/${cenario.entregador.id}/ganhos`)
    assert.equal(extrato.status, 200, JSON.stringify(extrato.dados))
    assert.equal(extrato.dados.entregas.length, 1)
    assert.equal(extrato.dados.entregas[0].pedido.nomeCliente, cenario.cliente.nomeCliente)
    assert.equal(extrato.dados.resumo.valorPendenteAReceber, 5)
    const restaurante = await db.restaurante.findUniqueOrThrow({ where: { id: cenario.restaurante.id } })
    assert.equal(restaurante.razaoSocial, 'Cadastro atual preservado')
    assert.deepEqual(restaurante.configuracoes, { lojaAberta: true })
  })

  it('quando o percentual muda depois, então o valor já registrado permanece igual', async () => {
    const cenario = await preparar()
    const alterada = await requisitar(apiRestaurantes, `/restaurantes/${cenario.restaurante.id}/regras-entrega`, 'PATCH', { percentualRepasseMotoboy: 80 })
    assert.equal(alterada.status, 200)
    const atribuida = await requisitar(apiPedidos, `/pedidos/${cenario.pedido.id}/entregador`, 'PATCH', { entregadorId: cenario.entregador.id })
    assert.equal(atribuida.status, 200)
    const entrega = await db.entrega.findUniqueOrThrow({ where: { pedidoId: cenario.pedido.id } })
    assert.equal(Number(entrega.valorMotoboy), 5)
    const extrato = await requisitar(apiPedidos, `/entregas/motoboy/${cenario.entregador.id}/ganhos`)
    assert.equal(extrato.status, 200)
    assert.equal(extrato.dados.resumo.valorTotalPeriodo, 5)
  })

  it('quando uma entrega é quitada, então o extrato a mostra como paga e a quitação em lote não a paga novamente', async () => {
    const cenario = await preparar()
    const pagamento = await requisitar(apiPedidos, `/entregas/${cenario.pedido.entrega.id}/pagamento`, 'PATCH', { statusPagamento: 'pago' })
    assert.equal(pagamento.status, 200)
    const antes = await db.entrega.findUniqueOrThrow({ where: { pedidoId: cenario.pedido.id } })
    assert.equal(antes.statusPagamento, 'pago')
    assert.ok(antes.pagoEm)
    const lote = await requisitar(apiPedidos, `/entregas/motoboy/${cenario.entregador.id}/quitar`, 'POST', {})
    assert.equal(lote.status, 200)
    assert.equal(lote.dados.quantidadeQuitada, 0)
    assert.equal(lote.dados.valorTotalQuitado, 0)
    assert.deepEqual(await db.entrega.findUniqueOrThrow({ where: { pedidoId: cenario.pedido.id } }), antes)
    const extrato = await requisitar(apiPedidos, `/entregas/motoboy/${cenario.entregador.id}/ganhos`)
    assert.equal(extrato.status, 200)
    assert.equal(extrato.dados.resumo.entregasPagas, 1)
    assert.equal(extrato.dados.resumo.valorJaPago, 5)
    assert.equal(extrato.dados.resumo.valorPendenteAReceber, 0)
  })
})
