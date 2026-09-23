import { Router } from 'express'
import { db, parseId } from '@geroncio/shared-db'

const routes = Router()

// --- PRODUTOS ---

routes.post('/produtos', async (req, res) => {
  try {
    const { nome, preco, restauranteId } = req.body

    const parsedRestauranteId = parseId(restauranteId)
    const parsedPreco = Number(preco)

    if (!nome || isNaN(parsedPreco) || parsedRestauranteId === null) {
      res.status(400).json({ error: 'Nome, preço e restauranteId válidos são obrigatórios.' })
      return
    }

    const restauranteExistente = await db.restaurante.findUnique({
      where: { id: parsedRestauranteId },
    })

    if (!restauranteExistente) {
      res.status(404).json({ error: 'Restaurante informado não existe.' })
      return
    }

    const produto = await db.produto.create({
      data: {
        nome,
        preco: parsedPreco,
        restaurante: {
          connect: { id: parsedRestauranteId },
        },
      },
    })

    res.status(201).json(produto)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao criar produto', detalhe: (error as Error).message })
  }
})

routes.get('/produtos', async (req, res) => {
  const produtos = await db.produto.findMany({
    include: { restaurante: true },
  })
  res.json(produtos)
})

routes.get('/produtos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const produto = await db.produto.findUnique({
    where: { id },
    include: { restaurante: true },
  })

  if (!produto) {
    res.status(404).json({ error: 'Produto não encontrado' })
    return
  }

  res.json(produto)
})

routes.put('/produtos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const produtoExistente = await db.produto.findUnique({ where: { id } })
  if (!produtoExistente) {
    res.status(404).json({ error: 'Produto não encontrado' })
    return
  }

  const { nome, preco, restauranteId } = req.body
  const parsedPreco = Number(preco)
  const parsedRestauranteId = parseId(restauranteId)

  if (!nome || isNaN(parsedPreco) || parsedRestauranteId === null) {
    res.status(400).json({ error: 'Nome, preço e restauranteId são obrigatórios.' })
    return
  }

  const produtoAtualizado = await db.produto.update({
    where: { id },
    data: {
      nome,
      preco: parsedPreco,
      restaurante: {
        connect: { id: parsedRestauranteId },
      },
    },
  })

  res.json(produtoAtualizado)
})

routes.patch('/produtos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const produtoExistente = await db.produto.findUnique({ where: { id } })
  if (!produtoExistente) {
    res.status(404).json({ error: 'Produto não encontrado' })
    return
  }

  const { nome, preco, restauranteId } = req.body

  const dataToUpdate: Record<string, unknown> = {}
  if (nome !== undefined) dataToUpdate.nome = nome
  if (preco !== undefined) dataToUpdate.preco = Number(preco)
  if (restauranteId !== undefined) {
    const parsedRestauranteId = parseId(restauranteId)
    if (parsedRestauranteId === null) {
      res.status(400).json({ error: 'restauranteId inválido' })
      return
    }
    dataToUpdate.restaurante = { connect: { id: parsedRestauranteId } }
  }

  const produtoAtualizado = await db.produto.update({
    where: { id },
    data: dataToUpdate,
  })

  res.json(produtoAtualizado)
})

routes.delete('/produtos/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const produtoExistente = await db.produto.findUnique({ where: { id } })
  if (!produtoExistente) {
    res.status(404).json({ error: 'Produto não encontrado' })
    return
  }

  await db.produto.delete({ where: { id } })
  res.status(204).send()
})

export default routes