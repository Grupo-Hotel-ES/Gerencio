import { Router } from 'express'
import { db, parseId, StatusPedido } from '@geroncio/shared-db'

const routes = Router()

// 1. LISTAR TODOS OS PEDIDOS
routes.get('/pedidos', async (req, res) => {
  try {
    const pedidos = await db.pedido.findMany({
      include: {
        itens: { include: { produto: true } },
        entrega: { include: { entregador: true } },
      },
      orderBy: { id: 'desc' },
    })
    res.json(pedidos)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar pedidos', detalhe: error.message })
  }
})

// 2. BUSCAR PEDIDO POR ID
routes.get('/pedidos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const pedido = await db.pedido.findUnique({
      where: { id },
      include: {
        itens: { include: { produto: true } },
        entrega: { include: { entregador: true } },
      },
    })
    if (!pedido) {
      res.status(404).json({ error: 'Pedido não encontrado' })
      return
    }
    res.json(pedido)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar pedido', detalhe: error.message })
  }
})

// 3. CRIAR PEDIDO
routes.post('/pedidos', async (req, res) => {
  const {
    nomeCliente,
    clienteId,
    preco,
    metodoPagamento,
    app,
    enderecoDestino,
    cepDestino,
    latitude,
    longitude,
    itens,
    entregadorId,
    custoEntrega,
  } = req.body

  if (preco === undefined || !metodoPagamento || !app || !enderecoDestino || !cepDestino) {
    res.status(400).json({ error: 'Campos obrigatórios ausentes (preco, metodoPagamento, app, enderecoDestino, cepDestino)' })
    return
  }

  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'O pedido deve conter ao menos 1 item' })
    return
  }

  try {
    const pedido = await db.pedido.create({
      data: {
        nomeCliente: nomeCliente || null,
        clienteId: clienteId ? Number(clienteId) : null,
        preco,
        metodoPagamento,
        app,
        enderecoDestino,
        cepDestino,
        latitude: latitude === undefined ? null : Number(latitude),
        longitude: longitude === undefined ? null : Number(longitude),
        itens: {
          create: itens.map((item: { produtoId: number; quantidade: number }) => ({
            produtoId: Number(item.produtoId),
            quantidade: Number(item.quantidade),
          })),
        },
        ...(entregadorId && {
          entrega: {
            create: {
              entregadorId: Number(entregadorId),
              custoEntrega: custoEntrega ? Number(custoEntrega) : 0,
            },
          },
        }),
      },
      include: {
        itens: { include: { produto: true } },
        entrega: { include: { entregador: true } },
      },
    })
    res.status(201).json(pedido)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao criar pedido', detalhe: error.message })
  }
})

// 4. ATUALIZAR STATUS DO PEDIDO
routes.patch('/pedidos/:id/status', async (req, res) => {
  const id = parseId(req.params.id)
  const { status } = req.body

  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }
  if (!Object.values(StatusPedido).includes(status)) {
    res.status(400).json({
      error: `status deve ser um de: ${Object.values(StatusPedido).join(', ')}`,
    })
    return
  }

  try {
    const existente = await db.pedido.findUnique({ where: { id } })
    if (!existente) {
      res.status(404).json({ error: 'Pedido não encontrado' })
      return
    }

    const pedido = await db.pedido.update({
      where: { id },
      data: { status },
      include: {
        itens: true,
        entrega: { include: { entregador: true } },
      },
    })
    res.json(pedido)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar status', detalhe: error.message })
  }
})

// 5. ATRIBUIR / ATUALIZAR ENTREGADOR DO PEDIDO
routes.patch('/pedidos/:id/entregador', async (req, res) => {
  const id = parseId(req.params.id)
  const { entregadorId, custoEntrega } = req.body

  if (id === null || !entregadorId) {
    res.status(400).json({ error: 'Id do pedido e entregadorId são obrigatórios' })
    return
  }

  try {
    const pedido = await db.pedido.findUnique({ where: { id } })
    if (!pedido) {
      res.status(404).json({ error: 'Pedido não encontrado' })
      return
    }

    const entrega = await db.entrega.upsert({
      where: { pedidoId: id },
      update: {
        entregadorId: Number(entregadorId),
        ...(custoEntrega !== undefined && { custoEntrega: Number(custoEntrega) }),
      },
      create: {
        pedidoId: id,
        entregadorId: Number(entregadorId),
        custoEntrega: custoEntrega ? Number(custoEntrega) : 0,
      },
      include: { entregador: true },
    })

    res.json(entrega)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao vincular entregador', detalhe: error.message })
  }
})

// 6. DELETAR PEDIDO
routes.delete('/pedidos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const existente = await db.pedido.findUnique({ where: { id } })
    if (!existente) {
      res.status(404).json({ error: 'Pedido não encontrado' })
      return
    }

    await db.pedido.delete({ where: { id } })
    res.status(204).send()
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao deletar pedido', detalhe: error.message })
  }
})

export default routes