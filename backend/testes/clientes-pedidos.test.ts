import './ambiente'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import clientes from '../api-clientes/src/server'
import pedidos from '../api-pedidos/src/server'
import { processarNotificacao } from '../api-integracao/src/routes'
import { db } from '../packages/shared-db/src/index'

// Nunca executa contra o banco de desenvolvimento ou produção.
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/ausente')
assert.equal(url.pathname, '/geroncio_validacao_estoque', 'Use exclusivamente o banco geroncio_validacao_estoque')

describe('Cliente do pedido', () => {
  const servidores = [clientes.listen(0, '127.0.0.1'), pedidos.listen(0, '127.0.0.1')]
  let apiClientes = ''
  let apiPedidos = ''
  let restauranteId = 0
  let produtoId = 0
  const eventos: number[] = []
  // Sufixo único: os nomes não colidem com clientes de outros testes
  const sufixo = randomUUID().slice(0, 8)

  before(async () => {
    await Promise.all(servidores.map((servidor) => once(servidor, 'listening')))
    const [enderecoClientes, enderecoPedidos] = servidores.map((servidor) => `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`)
    assert.ok(enderecoClientes, 'A API de clientes deve estar disponível para os cenários')
    assert.ok(enderecoPedidos, 'A API de pedidos deve estar disponível para os cenários')
    apiClientes = enderecoClientes
    apiPedidos = enderecoPedidos
    const restaurante = await db.restaurante.create({ data: {
      nome: 'Restaurante de clientes', cnpj: randomUUID(), email: 'teste@example.invalid',
      telefone: '0', cep: '0', cidade: 'Teste', endereco: 'Teste',
    } })
    restauranteId = restaurante.id
    const produto = await db.produto.create({ data: { nome: 'Espetinho de teste', preco: '12.50', quantidade: 50, restauranteId } })
    produtoId = produto.id
  })

  after(async () => {
    await Promise.all(servidores.map((servidor) => new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()))))
    const clientesDoTeste = await db.pedido.findMany({ where: { restauranteId }, select: { clienteId: true } })
    await db.eventoIntegracao.deleteMany({ where: { id: { in: eventos } } })
    await db.pedido.deleteMany({ where: { restauranteId } })
    await db.cliente.deleteMany({ where: { OR: [
      { id: { in: clientesDoTeste.map((p) => p.clienteId).filter((id): id is number => id !== null) } },
      { nomeCliente: { endsWith: sufixo } },
    ] } })
    await db.restaurante.deleteMany({ where: { id: restauranteId } })
    await db.$disconnect()
  })

  async function requisitar(base: string, caminho: string, metodo = 'GET', corpo?: unknown) {
    const resposta = await fetch(base + caminho, {
      method: metodo, headers: { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const dados = resposta.status === 204 ? null : await resposta.json() as any
    return { status: resposta.status, dados }
  }

  const pedidoBalcao = (cliente: Record<string, unknown>) => requisitar(apiPedidos, '/pedidos', 'POST', {
    ...cliente, app: 'balcao', metodoPagamento: 'dinheiro', enderecoDestino: 'Retirada no balcão', cepDestino: '',
    itens: [{ produtoId, quantidade: 1 }],
  })

  it('quando o pedido traz um cliente novo, então o cliente é cadastrado e o pedido aponta para ele', async () => {
    const nome = `Ana Nova ${sufixo}`
    const resposta = await pedidoBalcao({ cliente: { nome, endereco: 'Rua A, 1', telefone: '11999990000' } })
    assert.equal(resposta.status, 201, JSON.stringify(resposta.dados))
    assert.equal(resposta.dados.cliente.nomeCliente, nome)
    const cliente = await db.cliente.findUniqueOrThrow({ where: { id: resposta.dados.clienteId } })
    assert.deepEqual([cliente.nomeCliente, cliente.endereco, cliente.telefone], [nome, 'Rua A, 1', '11999990000'])
  })

  it('quando o nome e o endereço já existem, com maiúsculas diferentes, então o cadastro existente é reaproveitado', async () => {
    const nome = `Bruno Repetido ${sufixo}`
    const primeiro = await pedidoBalcao({ cliente: { nome, endereco: 'Rua B, 2' } })
    assert.equal(primeiro.status, 201, JSON.stringify(primeiro.dados))
    const segundo = await pedidoBalcao({ cliente: { nome: nome.toUpperCase(), endereco: 'rua b, 2' } })
    assert.equal(segundo.status, 201, JSON.stringify(segundo.dados))
    assert.equal(segundo.dados.clienteId, primeiro.dados.clienteId)
    assert.equal(await db.cliente.count({ where: { nomeCliente: { equals: nome, mode: 'insensitive' } } }), 1)
  })

  it('quando o pedido traz um clienteId que não existe, então a API responde 400', async () => {
    const antes = await db.pedido.count({ where: { restauranteId } })
    const resposta = await pedidoBalcao({ clienteId: 2_000_000_000 })
    assert.equal(resposta.status, 400)
    assert.equal(resposta.dados.error, 'Cliente não encontrado')
    assert.equal(await db.pedido.count({ where: { restauranteId } }), antes)
  })

  it('quando o cliente vem sem endereço, então a API responde 400', async () => {
    const nome = `Carla Sem Endereço ${sufixo}`
    const resposta = await pedidoBalcao({ cliente: { nome } })
    assert.equal(resposta.status, 400)
    assert.equal(await db.cliente.count({ where: { nomeCliente: nome } }), 0)
  })

  it('quando um cliente tem pedidos, então a exclusão é recusada com 409', async () => {
    const pedido = await pedidoBalcao({ cliente: { nome: `Davi Com Pedido ${sufixo}`, endereco: 'Rua D, 4' } })
    assert.equal(pedido.status, 201, JSON.stringify(pedido.dados))
    const resposta = await requisitar(apiClientes, `/clientes/${pedido.dados.clienteId}`, 'DELETE')
    assert.equal(resposta.status, 409)
    assert.ok(await db.cliente.findUnique({ where: { id: pedido.dados.clienteId } }))
  })

  it('quando uma plataforma envia um pedido sem nome do cliente, então o pedido fica sem cliente', async () => {
    const externo = randomUUID()
    await db.mapeamentoApp.create({ data: { plataforma: 'IFOOD', idExternoApp: externo, produtoId } })
    const notificacao = { eventoId: randomUUID(), pedidoIdExterno: randomUUID(), tipo: 'PLACED' }
    const evento = await db.eventoIntegracao.create({ data: { plataforma: 'ifood', ...notificacao, payload: {} } })
    eventos.push(evento.id)
    // Simula apenas o serviço externo; mapeamento e persistência usam o banco real.
    const adapter: Parameters<typeof processarNotificacao>[1] = {
      validarAssinatura: () => true,
      extrairNotificacoes: () => [notificacao],
      buscarPedido: async () => ({}),
      converterPedido: () => ({ nomeCliente: null, preco: 12.5, metodoPagamento: 'pix',
        enderecoDestino: 'Endereço de teste', cepDestino: '00000000', latitude: null, longitude: null,
        itens: [{ idExterno: externo, quantidade: 1 }] }),
    }
    const salvo = await processarNotificacao('ifood', adapter, notificacao, evento.id)
    assert.equal(salvo.clienteId, null)
  })
})
