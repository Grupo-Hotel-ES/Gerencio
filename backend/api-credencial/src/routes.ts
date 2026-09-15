import { Router } from 'express'
import { db, parseId } from '@geroncio/shared-db'

const routes = Router()

// Listar todas as credenciais
routes.get('/credenciais-plataforma', async (req, res) => {
  const credenciais = await db.credencialPlataforma.findMany({
    include: { restaurante: true },
  })
  res.json(credenciais)
})

// Buscar credencial por ID
routes.get('/credenciais-plataforma/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const credencial = await db.credencialPlataforma.findUnique({
    where: { id },
    include: { restaurante: true },
  })
  if (!credencial) {
    res.status(404).json({ error: 'Credencial não encontrada' })
    return
  }
  res.json(credencial)
})

// Criar credencial
routes.post('/credenciais-plataforma', async (req, res) => {
  const { plataforma, clientId, accessToken, refreshToken, restauranteId } = req.body

  if (!plataforma || !clientId || !accessToken || !refreshToken || !restauranteId) {
    res.status(400).json({
      error: 'plataforma, clientId, accessToken, refreshToken e restauranteId são obrigatórios',
    })
    return
  }

  const credencial = await db.credencialPlataforma.create({
    data: {
      plataforma,
      clientId,
      accessToken,
      refreshToken,
      restauranteId: Number(restauranteId),
    },
  })
  res.status(201).json(credencial)
})

// Atualizar credencial
routes.put('/credenciais-plataforma/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const { plataforma, clientId, accessToken, refreshToken, restauranteId } = req.body

  try {
    const credencial = await db.credencialPlataforma.update({
      where: { id },
      data: {
        plataforma,
        clientId,
        accessToken,
        refreshToken,
        restauranteId: restauranteId ? Number(restauranteId) : undefined,
      },
    })
    res.json(credencial)
  } catch {
    res.status(404).json({ error: 'Credencial não encontrada' })
  }
})

// Deletar credencial
routes.delete('/credenciais-plataforma/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    await db.credencialPlataforma.delete({ where: { id } })
    res.status(204).send()
  } catch {
    res.status(404).json({ error: 'Credencial não encontrada' })
  }
})

export default routes