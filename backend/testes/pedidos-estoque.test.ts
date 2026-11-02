import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import pedidos from '../api-pedidos/src/server'
import produtos from '../api-produtos/src/server'
import { processarNotificacao } from '../api-integracao/src/routes'
import { db } from '../packages/shared-db/src/index'

// Nunca executa contra o banco de desenvolvimento ou produção.
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/ausente')
assert.equal(url.pathname, '/geroncio_validacao_estoque', 'Use exclusivamente o banco geroncio_validacao_estoque')

test('Pedidos e estoque pelas APIs, com PostgreSQL real', async (t) => {
  const servidores = [pedidos.listen(0, '127.0.0.1'), produtos.listen(0, '127.0.0.1')]
  await Promise.all(servidores.map((servidor) => once(servidor, 'listening')))
  const [apiPedidos, apiProdutos] = servidores.map((servidor) => `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`)
  const restaurantes: number[] = []
  const eventos: number[] = []
  t.after(async () => {
    await Promise.all(servidores.map((servidor) => new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()))))
    await db.eventoIntegracao.deleteMany({ where: { id: { in: eventos } } })
    await db.pedido.deleteMany({ where: { restauranteId: { in: restaurantes } } })
    await db.restaurante.deleteMany({ where: { id: { in: restaurantes } } })
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
  for (let i = 0; i < 2; i++) {
    const restaurante = await db.restaurante.create({ data: {
      nome: `Restaurante de validação ${i}`, cnpj: randomUUID(), email: 'teste@example.invalid',
      telefone: '0', cep: '0', cidade: 'Teste', endereco: 'Teste',
    } })
    restaurantes.push(restaurante.id)
  }
  async function produto(quantidade: number, restauranteId = restaurantes[0]) {
    const resposta = await requisitar(apiProdutos, '/produtos', 'POST', { nome: 'Espetinho de teste', preco: '12.50', quantidade, restauranteId })
    assert.equal(resposta.status, 201, JSON.stringify(resposta.dados))
    return resposta.dados as { id: number; quantidade: number; versaoEstoque: number }
  }
  async function pedido(itens: { produtoId: number; quantidade: number }[]) {
    return requisitar(apiPedidos, '/api/pedidos', 'POST', {
      nomeCliente: 'Cliente de teste', restauranteId: restaurantes[0], app: 'balcao', metodoPagamento: 'dinheiro',
      enderecoDestino: 'Retirada no balcão', cepDestino: '', preco: 0.01, itens,
    })
  }
  const mudar = (id: number, status: string) => requisitar(apiPedidos, `/api/pedidos/${id}/status`, 'PATCH', { status })
  const saldo = (id: number) => db.produto.findUniqueOrThrow({ where: { id } })

  await t.test('Manual: calcula total no servidor, agrupa itens e filtra restaurante', async () => {
    const p = await produto(10)
    const resposta = await pedido([{ produtoId: p.id, quantidade: 1 }, { produtoId: p.id, quantidade: 2 }])
    assert.equal(resposta.status, 201)
    assert.equal(Number(resposta.dados.preco), 37.5)
    assert.equal(resposta.dados.itens.length, 1)
    assert.equal(resposta.dados.itens[0].quantidade, 3)
    assert.equal(resposta.dados.restaurante.id, restaurantes[0])
    assert.equal((await saldo(p.id)).quantidade, 10)
    const lista = await requisitar(apiPedidos, `/api/pedidos?restauranteId=${restaurantes[1]}`)
    assert.deepEqual(lista.dados, [])
  })
  await t.test('Recusa produtos de restaurantes diferentes e quantidades inválidas', async () => {
    const a = await produto(10)
    const b = await produto(10, restaurantes[1])
    assert.equal((await pedido([{ produtoId: a.id, quantidade: 1 }, { produtoId: b.id, quantidade: 1 }])).status, 400)
    for (const quantidade of [0, -1, 1.5]) assert.equal((await pedido([{ produtoId: a.id, quantidade }])).status, 400)
  })
  await t.test('Aceite e cancelamento repetidos descontam e devolvem somente uma vez', async () => {
    const p = await produto(10)
    const { dados } = await pedido([{ produtoId: p.id, quantidade: 3 }])
    assert.equal((await mudar(dados.id, 'em_preparo')).status, 200)
    assert.equal((await mudar(dados.id, 'em_preparo')).status, 200)
    assert.equal((await saldo(p.id)).quantidade, 7)
    assert.equal((await requisitar(apiPedidos, `/api/pedidos/${dados.id}`, 'DELETE')).status, 409)
    assert.equal((await mudar(dados.id, 'cancelado')).status, 200)
    assert.equal((await mudar(dados.id, 'cancelado')).status, 200)
    assert.equal((await saldo(p.id)).quantidade, 10)
    assert.equal((await mudar(dados.id, 'em_preparo')).status, 409)
  })
  await t.test('Estoque insuficiente reverte todos os itens e mantém pedido novo', async () => {
    const a = await produto(5)
    const b = await produto(0)
    const { dados } = await pedido([{ produtoId: a.id, quantidade: 2 }, { produtoId: b.id, quantidade: 1 }])
    assert.equal((await mudar(dados.id, 'em_preparo')).status, 409)
    assert.equal((await saldo(a.id)).quantidade, 5)
    assert.equal((await saldo(a.id)).versaoEstoque, 0)
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: dados.id } })).status, 'novo')
  })
  await t.test('Dois pedidos concorrentes não consomem as mesmas unidades', async () => {
    const p = await produto(3)
    const a = await pedido([{ produtoId: p.id, quantidade: 2 }])
    const b = await pedido([{ produtoId: p.id, quantidade: 2 }])
    const respostas = await Promise.all([mudar(a.dados.id, 'em_preparo'), mudar(b.dados.id, 'em_preparo')])
    assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409], JSON.stringify(respostas))
    assert.equal((await saldo(p.id)).quantidade, 1)
  })
  await t.test('Aceites simultâneos do mesmo pedido não duplicam a baixa', async () => {
    const p = await produto(5)
    const { dados } = await pedido([{ produtoId: p.id, quantidade: 2 }])
    const respostas = await Promise.all([mudar(dados.id, 'em_preparo'), mudar(dados.id, 'em_preparo')])
    assert.ok(respostas.every((r) => [200, 409].includes(r.status)), JSON.stringify(respostas))
    assert.ok(respostas.some((r) => r.status === 200))
    assert.equal((await saldo(p.id)).quantidade, 3)
  })
  await t.test('Ajuste antigo não sobrescreve venda; lote com conflito é revertido', async () => {
    const a = await produto(5)
    const b = await produto(5)
    const { dados } = await pedido([{ produtoId: b.id, quantidade: 2 }])
    await mudar(dados.id, 'em_preparo')
    const resposta = await requisitar(apiProdutos, '/estoque', 'PATCH', { ajustes: [
      { produtoId: a.id, quantidade: 10, versaoEstoque: 0 },
      { produtoId: b.id, quantidade: 10, versaoEstoque: 0 },
    ] })
    assert.equal(resposta.status, 409)
    assert.equal((await saldo(a.id)).quantidade, 5)
    assert.equal((await saldo(b.id)).quantidade, 3)
    const salvo = await requisitar(apiProdutos, '/estoque', 'PATCH', { ajustes: [{ produtoId: a.id, quantidade: 10, versaoEstoque: 0 }] })
    assert.equal(salvo.status, 200)
    assert.equal((await saldo(a.id)).quantidade, 10)
    assert.equal((await saldo(a.id)).versaoEstoque, 1)
  })
  await t.test('Fluxo completo preserva a baixa e recusa cancelamento após saída', async () => {
    const p = await produto(5)
    const { dados } = await pedido([{ produtoId: p.id, quantidade: 1 }])
    assert.equal((await mudar(dados.id, 'entregue')).status, 409)
    for (const status of ['em_preparo', 'pronto', 'saiu_para_entrega']) assert.equal((await mudar(dados.id, status)).status, 200)
    assert.equal((await mudar(dados.id, 'cancelado')).status, 409)
    assert.equal((await mudar(dados.id, 'entregue')).status, 200)
    assert.equal((await saldo(p.id)).quantidade, 4)
    assert.equal((await requisitar(apiProdutos, `/produtos/${p.id}`, 'DELETE')).status, 409)
  })
  await t.test('Cancelar um pedido novo não adiciona unidades ao saldo', async () => {
    const p = await produto(5)
    const { dados } = await pedido([{ produtoId: p.id, quantidade: 1 }])
    assert.equal((await mudar(dados.id, 'cancelado')).status, 200)
    assert.equal((await saldo(p.id)).quantidade, 5)
  })
  await t.test('Recusa saldo negativo e produtos repetidos no ajuste', async () => {
    const p = await produto(5)
    const ajuste = { produtoId: p.id, quantidade: 2, versaoEstoque: 0 }
    assert.equal((await requisitar(apiProdutos, '/estoque', 'PATCH', { ajustes: [{ ...ajuste, quantidade: -1 }] })).status, 400)
    assert.equal((await requisitar(apiProdutos, '/estoque', 'PATCH', { ajustes: [ajuste, ajuste] })).status, 400)
    assert.equal((await saldo(p.id)).quantidade, 5)
  })
  await t.test('Integração identifica o restaurante e reprocessar evento não duplica pedido nem baixa', async () => {
    const p = await produto(5)
    const externo = randomUUID()
    await db.mapeamentoApp.create({ data: { plataforma: 'IFOOD', idExternoApp: externo, produtoId: p.id } })
    const notificacao = { eventoId: randomUUID(), pedidoIdExterno: randomUUID(), tipo: 'PLACED' }
    const evento = await db.eventoIntegracao.create({ data: { plataforma: 'ifood', ...notificacao, payload: {} } })
    eventos.push(evento.id)
    // Simula apenas o serviço externo; mapeamento, persistência e estoque usam o banco real.
    const adapter: Parameters<typeof processarNotificacao>[1] = {
      validarAssinatura: () => true,
      extrairNotificacoes: () => [notificacao],
      buscarPedido: async () => ({}),
      converterPedido: () => ({ nomeCliente: 'Cliente iFood', preco: 25, metodoPagamento: 'pix',
        enderecoDestino: 'Endereço de teste', cepDestino: '00000000', latitude: null, longitude: null,
        itens: [{ idExterno: externo, quantidade: 1 }, { idExterno: externo, quantidade: 1 }] }),
    }
    const salvo = await processarNotificacao('ifood', adapter, notificacao, evento.id)
    assert.equal(salvo.restauranteId, restaurantes[0])
    assert.equal((await saldo(p.id)).quantidade, 5)
    assert.equal((await mudar(salvo.id, 'em_preparo')).status, 200)
    const repetido = await processarNotificacao('ifood', adapter, notificacao, evento.id)
    assert.equal(repetido.id, salvo.id)
    assert.equal((await saldo(p.id)).quantidade, 3)
    assert.equal(await db.pedido.count({ where: { app: 'ifood', pedidoExternoId: notificacao.pedidoIdExterno } }), 1)
  })
})
