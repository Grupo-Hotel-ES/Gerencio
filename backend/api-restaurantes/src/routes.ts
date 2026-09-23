import { Router } from 'express'
import { db, parseId } from '@geroncio/shared-db'

const routes = Router()

// ============================================
// RESTAURANTES
// ============================================

// CREATE
routes.post('/restaurantes', async (req, res) => {
  const { cnpj, nome, email, telefone, cep, cidade, endereco } = req.body

  if (!cnpj || !nome || !email || !telefone || !cep || !cidade || !endereco) {
    res.status(400).json({ error: 'Campos obrigatórios ausentes' })
    return
  }

  const restaurante = await db.restaurante.create({
    data: { cnpj, nome, email, telefone, cep, cidade, endereco },
  })
  res.status(201).json(restaurante)
})

// READ (todos)
routes.get('/restaurantes', async (req, res) => {
  const restaurantes = await db.restaurante.findMany()
  res.json(restaurantes)
})

// READ (um)
routes.get('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const restaurante = await db.restaurante.findUnique({
    where: { id },
    include: { produtos: true },
  })

  if (!restaurante) {
    res.status(404).json({ error: 'Restaurante não encontrado' })
    return
  }
  res.json(restaurante)
})

routes.put('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const restauranteExistente = await db.restaurante.findUnique({ where: { id } })
  if (!restauranteExistente) {
    res.status(404).json({ error: 'Restaurante não encontrado' })
    return
  }

  const { cnpj, nome, email, telefone, cep, cidade, endereco } = req.body

  const restauranteAtualizado = await db.restaurante.update({
    where: { id },
    data: { cnpj, nome, email, telefone, cep, cidade, endereco },
  })

  res.json(restauranteAtualizado)
})

routes.patch('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const restauranteExistente = await db.restaurante.findUnique({ where: { id } })
  if (!restauranteExistente) {
    res.status(404).json({ error: 'Restaurante não encontrado' })
    return
  }

  const { cnpj, nome, email, telefone, cep, cidade, endereco } = req.body

  const restauranteAtualizado = await db.restaurante.update({
    where: { id },
    data: {
      ...(cnpj !== undefined && { cnpj }),
      ...(nome !== undefined && { nome }),
      ...(email !== undefined && { email }),
      ...(telefone !== undefined && { telefone }),
      ...(cep !== undefined && { cep }),
      ...(cidade !== undefined && { cidade }),
      ...(endereco !== undefined && { endereco }),
    },
  })

  res.json(restauranteAtualizado)
})

routes.delete('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const restauranteExistente = await db.restaurante.findUnique({ where: { id } })
  if (!restauranteExistente) {
    res.status(404).json({ error: 'Restaurante não encontrado' })
    return
  }

  await db.restaurante.delete({ where: { id } })
  res.status(204).send()
})

// --- CONSULTAR PRODUTOS DO RESTAURANTE ---

routes.get('/restaurantes/:id/produtos', async (req, res) => {
  const restauranteId = parseId(req.params.id)
  if (restauranteId === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const restauranteExistente = await db.restaurante.findUnique({ where: { id: restauranteId } })
  if (!restauranteExistente) {
    res.status(404).json({ error: 'Restaurante não encontrado' })
    return
  }

  const produtos = await db.produto.findMany({
    where: { restauranteId },
  })
  res.json(produtos)
})

export default routes