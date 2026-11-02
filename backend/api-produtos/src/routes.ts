import { Router } from 'express'
import { db, parseId, ErroOperacao } from '@geroncio/shared-db'

const routes = Router()

// --- PRODUTOS ---

routes.post('/produtos', async (req, res) => {
  try {
    const { nome, preco, restauranteId, categoria = 'Sem categoria', quantidade = 0 } = req.body

    const parsedRestauranteId = parseId(restauranteId)
    const parsedPreco = Number(preco)

    if (typeof nome !== 'string' || !nome.trim() || preco === null || preco === '' || !Number.isFinite(parsedPreco) || parsedPreco < 0 || parsedPreco > 99_999_999.99 || parsedRestauranteId === null ||
        typeof categoria !== 'string' || !categoria.trim() || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 1_000_000) {
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
        nome: nome.trim(),
        categoria: categoria.trim(),
        quantidade,
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
  const restauranteId = req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) { res.status(400).json({ error: 'restauranteId inválido' }); return }
  const produtos = await db.produto.findMany({
    where: restauranteId ? { restauranteId } : {},
    include: { restaurante: true },
    orderBy: { nome: 'asc' },
  })
  res.json(produtos)
})

// Ajuste de saldo com controle de versão: uma venda simultânea nunca é sobrescrita.
routes.patch('/estoque', async (req, res) => {
  const { ajustes } = req.body
  if (!Array.isArray(ajustes) || ajustes.length === 0 || ajustes.length > 500 ||
      ajustes.some((item) => !item || !Number.isInteger(item.produtoId) || item.produtoId <= 0 ||
        !Number.isInteger(item.quantidade) || item.quantidade < 0 || item.quantidade > 1_000_000 ||
        !Number.isInteger(item.versaoEstoque) || item.versaoEstoque < 0) ||
      new Set(ajustes.map((item) => item.produtoId)).size !== ajustes.length) {
    res.status(400).json({ error: 'Informe produtos distintos, saldo inteiro não negativo e versão do estoque' })
    return
  }
  try {
    const produtos = await db.$transaction(async (tx) => {
      for (const ajuste of [...ajustes].sort((a, b) => a.produtoId - b.produtoId)) {
        const atualizado = await tx.produto.updateMany({
          where: { id: ajuste.produtoId, versaoEstoque: ajuste.versaoEstoque },
          data: { quantidade: ajuste.quantidade, versaoEstoque: { increment: 1 } },
        })
        if (atualizado.count !== 1) {
          throw new ErroOperacao(409, 'O estoque mudou durante a edição. Recarregue os saldos e refaça os ajustes')
        }
      }
      return tx.produto.findMany({ where: { id: { in: ajustes.map((item) => item.produtoId) } }, include: { restaurante: true } })
    })
    res.json(produtos)
  } catch (error: any) {
    if (error instanceof ErroOperacao) { res.status(error.status).json({ error: error.message }); return }
    res.status(500).json({ error: 'Erro ao salvar estoque', detalhe: error.message })
  }
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

  if (typeof nome !== 'string' || !nome.trim() || preco === null || preco === '' || !Number.isFinite(parsedPreco) || parsedPreco < 0 || parsedPreco > 99_999_999.99 || parsedRestauranteId === null) {
    res.status(400).json({ error: 'Nome, preço e restauranteId são obrigatórios.' })
    return
  }

  if (parsedRestauranteId !== produtoExistente.restauranteId) {
    res.status(400).json({ error: 'O restaurante de um produto não pode ser alterado' })
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

  const { nome, preco, restauranteId, categoria } = req.body

  if ((nome !== undefined && (typeof nome !== 'string' || !nome.trim())) ||
      (categoria !== undefined && (typeof categoria !== 'string' || !categoria.trim())) ||
      (preco !== undefined && (preco === null || preco === '' || !Number.isFinite(Number(preco)) || Number(preco) < 0 || Number(preco) > 99_999_999.99)) ||
      (restauranteId !== undefined && Number(restauranteId) !== produtoExistente.restauranteId)) {
    res.status(400).json({ error: 'Nome, categoria ou preço inválido, ou tentativa de alterar o restaurante do produto' })
    return
  }

  const dataToUpdate: Record<string, unknown> = {}
  if (nome !== undefined) dataToUpdate.nome = nome.trim()
  if (categoria !== undefined) dataToUpdate.categoria = categoria.trim()
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
    include: { restaurante: true },
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

  if (await db.itemPedido.count({ where: { produtoId: id } })) {
    res.status(409).json({ error: 'Produto usado em pedidos não pode ser excluído. Ajuste o estoque para zero' })
    return
  }
  await db.produto.delete({ where: { id } })
  res.status(204).send()
})

// --- MAPEAMENTO APP ---

// A api-integracao e o mock procuram o mapeamento por estes identificadores,
// então "iFood", "Uber Eats" ou "99 Food" são gravados como "ifood", "ubereats", "99food".
const PLATAFORMAS: Record<string, string> = {
  ifood: 'ifood',
  rappi: 'rappi',
  ubereats: 'ubereats',
  uber: 'ubereats',
  '99food': '99food',
  '99': '99food',
  keeta: 'keeta',
}

function normalizarPlataforma(valor: unknown) {
  if (typeof valor !== 'string') return null
  return PLATAFORMAS[valor.trim().toLowerCase().replace(/[\s_-]+/g, '')] ?? null
}

// 1. Criar novo mapeamento de produto para plataforma externa
routes.post('/mapeamentos', async (req, res) => {
  try {
    const { produtoId } = req.body
    const plataforma = normalizarPlataforma(req.body.plataforma)
    const idExternoApp = typeof req.body.idExternoApp === 'string' ? req.body.idExternoApp.trim() : ''

    const parsedProdutoId = parseId(produtoId)

    if (!plataforma || !idExternoApp || idExternoApp.length > 100 || parsedProdutoId === null) {
      res.status(400).json({ error: 'Informe produtoId, plataforma (ifood, rappi, ubereats, 99food ou keeta) e o código do produto na plataforma.' })
      return
    }

    const produtoExistente = await db.produto.findUnique({
      where: { id: parsedProdutoId },
    })

    if (!produtoExistente) {
      res.status(404).json({ error: 'Produto informado não existe.' })
      return
    }

    // Um código aponta para um único produto, senão a integração não sabe qual baixar.
    const conflitos = await db.mapeamentoApp.findMany({
      where: {
        plataforma: { equals: plataforma, mode: 'insensitive' },
        OR: [{ idExternoApp }, { produtoId: parsedProdutoId }],
      },
      include: { produto: true },
    })
    const codigoEmUso = conflitos.find((m) => m.idExternoApp === idExternoApp)
    if (codigoEmUso) {
      res.status(409).json({ error: `O código ${idExternoApp} já está ligado a ${codigoEmUso.produto.nome} nesta plataforma.` })
      return
    }
    if (conflitos.length > 0) {
      res.status(409).json({ error: `Este produto já tem o código ${conflitos[0]!.idExternoApp} nesta plataforma. Remova-o antes de cadastrar outro.` })
      return
    }

    const mapeamento = await db.mapeamentoApp.create({
      data: {
        plataforma,
        idExternoApp,
        produto: {
          connect: { id: parsedProdutoId },
        },
      },
    })

    res.status(201).json(mapeamento)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao criar mapeamento', detalhe: (error as Error).message })
  }
})

// 2. Listar os mapeamentos cadastrados (opcionalmente de um restaurante: ?restauranteId=1)
routes.get('/mapeamentos', async (req, res) => {
  const restauranteId = req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) {
    res.status(400).json({ error: 'restauranteId inválido' })
    return
  }
  try {
    const mapeamentos = await db.mapeamentoApp.findMany({
      where: restauranteId ? { produto: { restauranteId } } : {},
      include: { produto: true },
      orderBy: { id: 'asc' },
    })
    res.json(mapeamentos)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao listar mapeamentos', detalhe: (error as Error).message })
  }
})

// 3. Buscar produto pela plataforma e idExternoApp (Usado na tradução de Webhooks)
routes.get('/mapeamentos/buscar', async (req, res) => {
  try {
    const { plataforma, idExternoApp } = req.query

    if (!plataforma || !idExternoApp) {
      res.status(400).json({ error: 'Parâmetros plataforma e idExternoApp são obrigatórios na query.' })
      return
    }

    const mapeamento = await db.mapeamentoApp.findFirst({
      where: {
        plataforma: { equals: normalizarPlataforma(plataforma) ?? String(plataforma), mode: 'insensitive' },
        idExternoApp: String(idExternoApp),
      },
      include: { produto: true },
    })

    if (!mapeamento) {
      res.status(404).json({ error: 'Mapeamento não encontrado para esta plataforma e ID externo.' })
      return
    }

    res.json(mapeamento)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao buscar mapeamento', detalhe: (error as Error).message })
  }
})

// 4. Remover um mapeamento por ID
routes.delete('/mapeamentos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Id inválido' })
      return
    }

    const mapeamentoExistente = await db.mapeamentoApp.findUnique({ where: { id } })
    if (!mapeamentoExistente) {
      res.status(404).json({ error: 'Mapeamento não encontrado' })
      return
    }

    await db.mapeamentoApp.delete({ where: { id } })
    res.status(204).send()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao deletar mapeamento', detalhe: (error as Error).message })
  }
})
export default routes
