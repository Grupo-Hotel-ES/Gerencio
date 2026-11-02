import { Router } from 'express'
import { db, parseId } from '@geroncio/shared-db'

const routes = Router()

function extrairCamposEntrega(body: Record<string, any>) {
  const {
    latitude,
    longitude,
    taxaEntregaBase,
    kmInclusosTaxaBase,
    custoPorKmAdicional,
    distanciaMaximaKm,
  } = body

  if (taxaEntregaBase !== undefined && (isNaN(Number(taxaEntregaBase)) || Number(taxaEntregaBase) < 0)) {
    return { erro: 'taxaEntregaBase deve ser um número maior ou igual a zero' }
  }
  if (kmInclusosTaxaBase !== undefined && (isNaN(Number(kmInclusosTaxaBase)) || Number(kmInclusosTaxaBase) < 0)) {
    return { erro: 'kmInclusosTaxaBase deve ser um número maior ou igual a zero' }
  }
  if (custoPorKmAdicional !== undefined && (isNaN(Number(custoPorKmAdicional)) || Number(custoPorKmAdicional) < 0)) {
    return { erro: 'custoPorKmAdicional deve ser um número maior ou igual a zero' }
  }
  if (
    distanciaMaximaKm !== undefined &&
    distanciaMaximaKm !== null &&
    (isNaN(Number(distanciaMaximaKm)) || Number(distanciaMaximaKm) <= 0)
  ) {
    return { erro: 'distanciaMaximaKm deve ser um número maior que zero ou null' }
  }
  if (latitude !== undefined && latitude !== null && isNaN(Number(latitude))) {
    return { erro: 'latitude inválida' }
  }
  if (longitude !== undefined && longitude !== null && isNaN(Number(longitude))) {
    return { erro: 'longitude inválida' }
  }

  return {
    dados: {
      ...(latitude !== undefined && { latitude: latitude === null ? null : Number(latitude) }),
      ...(longitude !== undefined && { longitude: longitude === null ? null : Number(longitude) }),
      ...(taxaEntregaBase !== undefined && { taxaEntregaBase: Number(taxaEntregaBase) }),
      ...(kmInclusosTaxaBase !== undefined && { kmInclusosTaxaBase: Number(kmInclusosTaxaBase) }),
      ...(custoPorKmAdicional !== undefined && { custoPorKmAdicional: Number(custoPorKmAdicional) }),
      ...(distanciaMaximaKm !== undefined && {
        distanciaMaximaKm: distanciaMaximaKm === null ? null : Number(distanciaMaximaKm),
      }),
    },
  }
}

// ============================================
// RESTAURANTES
// ============================================

// 1. CRIAR RESTAURANTE
routes.post('/restaurantes', async (req, res) => {
  const { cnpj, nome, email, telefone, cep, cidade, endereco } = req.body

  if (!cnpj || !nome || !email || !telefone || !cep || !cidade || !endereco) {
    res.status(400).json({ error: 'Campos obrigatórios ausentes' })
    return
  }

  const validacaoEntrega = extrairCamposEntrega(req.body)
  if (validacaoEntrega.erro) {
    res.status(400).json({ error: validacaoEntrega.erro })
    return
  }

  try {
    const restaurante = await db.restaurante.create({
      data: {
        cnpj,
        nome,
        email,
        telefone,
        cep,
        cidade,
        endereco,
        ...validacaoEntrega.dados,
      },
    })
    res.status(201).json(restaurante)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao criar restaurante', detalhe: error.message })
  }
})

// 2. LISTAR RESTAURANTES
routes.get('/restaurantes', async (req, res) => {
  try {
    const restaurantes = await db.restaurante.findMany()
    res.json(restaurantes)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar restaurantes', detalhe: error.message })
  }
})

// 3. BUSCAR RESTAURANTE POR ID
routes.get('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const restaurante = await db.restaurante.findUnique({
      where: { id },
      include: { produtos: true },
    })

    if (!restaurante) {
      res.status(404).json({ error: 'Restaurante não encontrado' })
      return
    }
    res.json(restaurante)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar restaurante', detalhe: error.message })
  }
})

// 4. ATUALIZAR RESTAURANTE (COMPLETO)
routes.put('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const validacaoEntrega = extrairCamposEntrega(req.body)
  if (validacaoEntrega.erro) {
    res.status(400).json({ error: validacaoEntrega.erro })
    return
  }

  try {
    const restauranteExistente = await db.restaurante.findUnique({ where: { id } })
    if (!restauranteExistente) {
      res.status(404).json({ error: 'Restaurante não encontrado' })
      return
    }

    const { cnpj, nome, email, telefone, cep, cidade, endereco } = req.body

    const restauranteAtualizado = await db.restaurante.update({
      where: { id },
      data: {
        cnpj,
        nome,
        email,
        telefone,
        cep,
        cidade,
        endereco,
        ...validacaoEntrega.dados,
      },
    })

    res.json(restauranteAtualizado)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar restaurante', detalhe: error.message })
  }
})

// 5. ATUALIZAR RESTAURANTE (PARCIAL)
routes.patch('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const validacaoEntrega = extrairCamposEntrega(req.body)
  if (validacaoEntrega.erro) {
    res.status(400).json({ error: validacaoEntrega.erro })
    return
  }

  try {
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
        ...validacaoEntrega.dados,
      },
    })

    res.json(restauranteAtualizado)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar restaurante', detalhe: error.message })
  }
})

// 6. CONSULTAR REGRAS DE ENTREGA DO RESTAURANTE
routes.get('/restaurantes/:id/regras-entrega', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const restaurante = await db.restaurante.findUnique({ where: { id } })
    if (!restaurante) {
      res.status(404).json({ error: 'Restaurante não encontrado' })
      return
    }

    res.json({
      restauranteId: restaurante.id,
      nome: restaurante.nome,
      cep: restaurante.cep,
      cidade: restaurante.cidade,
      endereco: restaurante.endereco,
      latitude: restaurante.latitude,
      longitude: restaurante.longitude,
      taxaEntregaBase: Number(restaurante.taxaEntregaBase),
      kmInclusosTaxaBase: restaurante.kmInclusosTaxaBase,
      custoPorKmAdicional: Number(restaurante.custoPorKmAdicional),
      distanciaMaximaKm: restaurante.distanciaMaximaKm,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao consultar regras de entrega', detalhe: error.message })
  }
})

// 7. ATUALIZAR REGRAS DE ENTREGA DO RESTAURANTE
routes.patch('/restaurantes/:id/regras-entrega', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const validacaoEntrega = extrairCamposEntrega(req.body)
  if (validacaoEntrega.erro) {
    res.status(400).json({ error: validacaoEntrega.erro })
    return
  }

  if (!validacaoEntrega.dados || Object.keys(validacaoEntrega.dados).length === 0) {
    res.status(400).json({
      error:
        'Informe ao menos um campo para atualizar (taxaEntregaBase, kmInclusosTaxaBase, custoPorKmAdicional, distanciaMaximaKm, latitude, longitude)',
    })
    return
  }

  try {
    const restauranteExistente = await db.restaurante.findUnique({ where: { id } })
    if (!restauranteExistente) {
      res.status(404).json({ error: 'Restaurante não encontrado' })
      return
    }

    const atualizado = await db.restaurante.update({
      where: { id },
      data: validacaoEntrega.dados,
    })

    res.json({
      restauranteId: atualizado.id,
      nome: atualizado.nome,
      cep: atualizado.cep,
      cidade: atualizado.cidade,
      endereco: atualizado.endereco,
      latitude: atualizado.latitude,
      longitude: atualizado.longitude,
      taxaEntregaBase: Number(atualizado.taxaEntregaBase),
      kmInclusosTaxaBase: atualizado.kmInclusosTaxaBase,
      custoPorKmAdicional: Number(atualizado.custoPorKmAdicional),
      distanciaMaximaKm: atualizado.distanciaMaximaKm,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar regras de entrega', detalhe: error.message })
  }
})

// 8. DELETAR RESTAURANTE
routes.delete('/restaurantes/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const restauranteExistente = await db.restaurante.findUnique({ where: { id } })
    if (!restauranteExistente) {
      res.status(404).json({ error: 'Restaurante não encontrado' })
      return
    }

    await db.restaurante.delete({ where: { id } })
    res.status(204).send()
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao deletar restaurante', detalhe: error.message })
  }
})

// 9. CONSULTAR PRODUTOS DO RESTAURANTE
routes.get('/restaurantes/:id/produtos', async (req, res) => {
  const restauranteId = parseId(req.params.id)
  if (restauranteId === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const restauranteExistente = await db.restaurante.findUnique({ where: { id: restauranteId } })
    if (!restauranteExistente) {
      res.status(404).json({ error: 'Restaurante não encontrado' })
      return
    }

    const produtos = await db.produto.findMany({
      where: { restauranteId },
    })
    res.json(produtos)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao consultar produtos do restaurante', detalhe: error.message })
  }
})

export default routes
