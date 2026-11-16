import { Router } from 'express'
import { db, parseId, ErroOperacao, resolverRestauranteId } from '@geroncio/shared-db'

const routes = Router()

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

const NOME_PLATAFORMA: Record<string, string> = {
  ifood: 'iFood',
  rappi: 'Rappi',
  ubereats: 'Uber Eats',
  '99food': '99 Food',
  keeta: 'Keeta',
}

const NOME_CANAL: Record<string, string> = { ...NOME_PLATAFORMA, balcao: 'Balcão', whatsapp: 'WhatsApp' }

const ROTULO_STATUS: Record<string, string> = {
  novo: 'novo', em_preparo: 'em preparo', pronto: 'pronto', saiu_para_entrega: 'saiu para entrega', entregue: 'entregue', cancelado: 'cancelado',
}

function normalizarPlataforma(valor: unknown) {
  if (typeof valor !== 'string') return null
  return PLATAFORMAS[valor.trim().toLowerCase().replace(/[\s_-]+/g, '')] ?? null
}

// --- PRODUTOS ---

routes.post('/produtos', async (req, res) => {
  try {
    const { nome, preco, restauranteId, categoria = 'Sem categoria', quantidade = 0 } = req.body

    // App de um restaurante só: sem restauranteId, o produto vai para o restaurante principal
    const parsedRestauranteId = restauranteId === undefined || restauranteId === null || restauranteId === ''
      ? await resolverRestauranteId()
      : parseId(String(restauranteId))
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

// VINCULAR PRODUTO: o restaurante cadastra o produto em cada plataforma de delivery, que gera um ID
// para ele. Aqui esses IDs são ligados a um único produto do Gerêncio, com o estoque e o preço que
// valem para todas as plataformas. A api-integracao envia esses valores para as plataformas vinculadas.
routes.post('/produtos/vincular', async (req, res) => {
  const { nome, categoria, preco, quantidade, vinculos } = req.body
  const parsedPreco = typeof preco === 'string' ? Number(preco.replace(',', '.')) : Number(preco)

  if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 100 ||
      (categoria !== undefined && categoria !== null && typeof categoria !== 'string') ||
      preco === null || preco === undefined || preco === '' || !Number.isFinite(parsedPreco) || parsedPreco < 0 || parsedPreco > 99_999_999.99 ||
      !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 1_000_000) {
    res.status(400).json({ error: 'Informe nome, preço válido e quantidade inteira entre zero e 1.000.000.' })
    return
  }
  if (!Array.isArray(vinculos) || vinculos.length === 0 || vinculos.length > Object.keys(NOME_PLATAFORMA).length) {
    res.status(400).json({ error: 'Selecione ao menos uma plataforma e informe o ID do produto nela.' })
    return
  }
  const lista = vinculos.map((vinculo: any) => ({
    plataforma: normalizarPlataforma(vinculo?.plataforma),
    idExternoApp: typeof vinculo?.idExternoApp === 'string' ? vinculo.idExternoApp.trim() : '',
  }))
  const invalido = lista.find((v) => !v.plataforma || !v.idExternoApp || v.idExternoApp.length > 100)
  if (invalido) {
    res.status(400).json({ error: invalido.plataforma
      ? `Informe o ID do produto no ${NOME_PLATAFORMA[invalido.plataforma]}.`
      : 'Plataforma inválida. Use ifood, rappi, ubereats, 99food ou keeta.' })
    return
  }
  if (new Set(lista.map((v) => v.plataforma)).size !== lista.length) {
    res.status(400).json({ error: 'Cada plataforma pode aparecer uma vez só no vínculo.' })
    return
  }

  try {
    const restauranteId = await resolverRestauranteId()
    const produto = await db.$transaction(async (tx) => {
      // Um ID de plataforma aponta para um único produto, senão a integração não sabe qual baixar.
      const existentes = await tx.mapeamentoApp.findMany({
        where: { OR: lista.map((v) => ({ plataforma: { equals: v.plataforma!, mode: 'insensitive' as const }, idExternoApp: v.idExternoApp })) },
        include: { produto: true },
      })
      const emUso = existentes.find((m) => !m.produto.arquivadoEm)
      if (emUso) {
        const plataforma = normalizarPlataforma(emUso.plataforma) ?? emUso.plataforma
        throw new ErroOperacao(409, `O ID ${emUso.idExternoApp} do ${NOME_PLATAFORMA[plataforma] ?? plataforma} já está vinculado a ${emUso.produto.nome}.`)
      }
      // IDs que eram de produtos excluídos passam para o produto novo.
      if (existentes.length > 0) await tx.mapeamentoApp.deleteMany({ where: { id: { in: existentes.map((m) => m.id) } } })
      return tx.produto.create({
        data: {
          nome: nome.trim(),
          categoria: typeof categoria === 'string' && categoria.trim() ? categoria.trim() : 'Sem categoria',
          preco: parsedPreco,
          quantidade,
          restaurante: { connect: { id: restauranteId } },
          mapeamentos: { create: lista.map((v) => ({ plataforma: v.plataforma!, idExternoApp: v.idExternoApp })) },
        },
        include: { restaurante: true, mapeamentos: true },
      })
    })
    res.status(201).json(produto)
  } catch (error: any) {
    if (error instanceof ErroOperacao) { res.status(error.status).json({ error: error.message }); return }
    res.status(500).json({ error: 'Erro ao vincular produto', detalhe: error.message })
  }
})

routes.get('/produtos', async (req, res) => {
  const restauranteId = req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) { res.status(400).json({ error: 'restauranteId inválido' }); return }
  // Produtos arquivados saíram do estoque; continuam só nos pedidos e relatórios.
  const produtos = await db.produto.findMany({
    where: { arquivadoEm: null, ...(restauranteId ? { restauranteId } : {}) },
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
          where: { id: ajuste.produtoId, versaoEstoque: ajuste.versaoEstoque, arquivadoEm: null },
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
  if (!produtoExistente || produtoExistente.arquivadoEm) {
    res.status(404).json({ error: 'Produto não encontrado' })
    return
  }

  const { nome, preco, restauranteId } = req.body
  const parsedPreco = Number(preco)
  const parsedRestauranteId = restauranteId === undefined ? produtoExistente.restauranteId : parseId(String(restauranteId))

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
  if (!produtoExistente || produtoExistente.arquivadoEm) {
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

  // Os pedidos guardam o histórico de vendas (Relatórios), então o produto deles não pode sumir.
  // Entregues e cancelados não aparecem na fila do painel, por isso a mensagem diz quais são.
  const filtroPedidos = { itens: { some: { produtoId: id } } }
  const total = await db.pedido.count({ where: filtroPedidos })
  if (total > 0) {
    const pedidos = await db.pedido.findMany({ where: filtroPedidos, select: { id: true, status: true, app: true }, orderBy: { id: 'desc' }, take: 5 })
    const lista = pedidos.map((p) => `#${p.id} (${ROTULO_STATUS[p.status] ?? p.status}, ${NOME_CANAL[p.app.toLowerCase()] ?? p.app})`).join(', ')
    res.status(409).json({
      error: `${produtoExistente.nome} aparece em ${total === 1 ? '1 pedido' : `${total} pedidos`}: ${lista}${total > pedidos.length ? ' e outros' : ''}. ` +
        'Para não apagar o histórico de vendas, ele não pode ser apagado de vez. Arquive-o para tirá-lo do estoque.',
    })
    return
  }
  await db.produto.delete({ where: { id } })
  res.status(204).send()
})

// ARQUIVAR PRODUTO: é a exclusão feita pelo painel. Ele some da lista de estoque, do cardápio do
// WhatsApp e de novos pedidos, mas continua nos pedidos antigos e nos relatórios. Os vínculos com as
// plataformas ficam: o sincronizador manda estoque zero, então ele aparece como indisponível nelas,
// e se o restaurante repuser unidades no portal de uma plataforma, ele volta ao estoque do Gerêncio.
routes.post('/produtos/:id/arquivar', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const produto = await db.$transaction(async (tx) => {
      const existente = await tx.produto.findUnique({ where: { id } })
      if (!existente) throw new ErroOperacao(404, 'Produto não encontrado')
      if (existente.arquivadoEm) return existente
      // A versão muda para que um ajuste de saldo aberto em outra aba seja recusado.
      return tx.produto.update({ where: { id }, data: { arquivadoEm: new Date(), versaoEstoque: { increment: 1 } } })
    })
    res.json(produto)
  } catch (error: any) {
    if (error instanceof ErroOperacao) { res.status(error.status).json({ error: error.message }); return }
    res.status(500).json({ error: 'Erro ao arquivar produto', detalhe: error.message })
  }
})

// --- MAPEAMENTO APP ---

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

    if (!produtoExistente || produtoExistente.arquivadoEm) {
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
    if (codigoEmUso && !codigoEmUso.produto.arquivadoEm) {
      res.status(409).json({ error: `O código ${idExternoApp} já está ligado a ${codigoEmUso.produto.nome} nesta plataforma.` })
      return
    }
    const codigoAtual = conflitos.find((m) => m.produtoId === parsedProdutoId)
    if (codigoAtual) {
      res.status(409).json({ error: `Este produto já tem o código ${codigoAtual.idExternoApp} nesta plataforma. Remova-o antes de cadastrar outro.` })
      return
    }

    // Um código que era de um produto excluído passa para este.
    const mapeamento = await db.$transaction(async (tx) => {
      if (codigoEmUso) await tx.mapeamentoApp.delete({ where: { id: codigoEmUso.id } })
      return tx.mapeamentoApp.create({
        data: {
          plataforma,
          idExternoApp,
          produto: {
            connect: { id: parsedProdutoId },
          },
        },
      })
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
