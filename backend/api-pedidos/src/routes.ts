import { Router } from 'express'
import { db, parseId, StatusPedido, cotarFreteRestaurante } from '@geroncio/shared-db'

const routes = Router()

// 1. LISTAR PEDIDOS (opcionalmente filtrando por status: ?status=novo,em_preparo)
routes.get('/pedidos', async (req, res) => {
  const filtro = typeof req.query.status === 'string' ? req.query.status.split(',') : []
  const status = filtro.filter((s): s is StatusPedido =>
    Object.values(StatusPedido).includes(s as StatusPedido),
  )
  if (status.length !== filtro.length) {
    res.status(400).json({
      error: `status deve ser um de: ${Object.values(StatusPedido).join(', ')}`,
    })
    return
  }

  try {
    const pedidos = await db.pedido.findMany({
      ...(status.length > 0 && { where: { status: { in: status } } }),
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

// 2. COTAÇÃO DE FRETE POR ROTA VIÁRIA (PRÉ-VISUALIZAÇÃO PARA ATENDIMENTO VIA WHATSAPP)
routes.post('/pedidos/cotacao-frete', async (req, res) => {
  const {
    restauranteId,
    enderecoDestino,
    cepDestino,
    cidadeDestino,
    latitude,
    longitude,
  } = req.body

  const idRestaurante = parseId(restauranteId !== undefined ? String(restauranteId) : undefined)
  if (idRestaurante === null) {
    res.status(400).json({ error: 'restauranteId válido é obrigatório' })
    return
  }

  const temCoordenadas =
    latitude !== undefined &&
    latitude !== null &&
    longitude !== undefined &&
    longitude !== null &&
    !isNaN(Number(latitude)) &&
    !isNaN(Number(longitude))

  if (!temCoordenadas && !enderecoDestino && !cepDestino) {
    res.status(400).json({
      error: 'Informe o enderecoDestino e/ou cepDestino (ou latitude e longitude) para calcular a rota',
    })
    return
  }

  try {
    const cotacao = await cotarFreteRestaurante(idRestaurante, {
      enderecoDestino,
      cepDestino,
      cidadeDestino,
      latitude: temCoordenadas ? Number(latitude) : null,
      longitude: temCoordenadas ? Number(longitude) : null,
    })

    res.json(cotacao)
  } catch (error: any) {
    if (error.message === 'Restaurante não encontrado') {
      res.status(404).json({ error: error.message })
      return
    }
    res.status(400).json({
      error: 'Não foi possível calcular a rota e a taxa de entrega',
      detalhe: error.message,
    })
  }
})

// 3. BUSCAR PEDIDO POR ID
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

// 4. CRIAR PEDIDO (COM CÁLCULO E REGISTRO DA TAXA DE ENTREGA E DISTÂNCIA VIÁRIA)
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
    distanciaKm,
    restauranteId,
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
    let latitudeFinal = latitude === undefined || latitude === null ? null : Number(latitude)
    let longitudeFinal = longitude === undefined || longitude === null ? null : Number(longitude)
    let custoEntregaFinal = custoEntrega === undefined || custoEntrega === null ? undefined : Number(custoEntrega)
    let distanciaKmFinal = distanciaKm === undefined || distanciaKm === null ? undefined : Number(distanciaKm)

    const ehWhatsapp = String(app).toLowerCase() === 'whatsapp'

    // Para pedidos via WhatsApp, calcula automaticamente a distância pelas vias e a taxa
    // segundo as regras do restaurante (nos outros apps, o frete já vem definido pela plataforma).
    if (ehWhatsapp && (custoEntregaFinal === undefined || distanciaKmFinal === undefined)) {
      let idRest = restauranteId ? Number(restauranteId) : null

      if (!idRest) {
        const primeiroItem = itens[0] as { produtoId?: number } | undefined
        if (primeiroItem?.produtoId) {
          const produto = await db.produto.findUnique({
            where: { id: Number(primeiroItem.produtoId) },
            select: { restauranteId: true },
          })
          idRest = produto?.restauranteId ?? null
        }
      }

      if (idRest) {
        const cotacao = await cotarFreteRestaurante(idRest, {
          enderecoDestino,
          cepDestino,
          latitude: latitudeFinal,
          longitude: longitudeFinal,
        })

        if (!cotacao.dentroDaAreaEntrega || cotacao.taxaEntrega === null) {
          res.status(400).json({
            error: cotacao.motivoRecusa ?? 'Endereço fora da área de entrega do restaurante',
            distanciaKm: cotacao.distanciaKm,
          })
          return
        }

        if (distanciaKmFinal === undefined) {
          distanciaKmFinal = cotacao.distanciaKm
        }
        if (custoEntregaFinal === undefined) {
          custoEntregaFinal = cotacao.taxaEntrega
        }
        if (latitudeFinal === null) {
          latitudeFinal = cotacao.destino.latitude
        }
        if (longitudeFinal === null) {
          longitudeFinal = cotacao.destino.longitude
        }
      }
    }

    const deveCriarEntrega =
      entregadorId !== undefined ||
      custoEntregaFinal !== undefined ||
      distanciaKmFinal !== undefined

    const pedido = await db.pedido.create({
      data: {
        nomeCliente: nomeCliente || null,
        clienteId: clienteId ? Number(clienteId) : null,
        preco,
        metodoPagamento,
        app,
        enderecoDestino,
        cepDestino,
        latitude: latitudeFinal,
        longitude: longitudeFinal,
        itens: {
          create: itens.map((item: { produtoId: number; quantidade: number }) => ({
            produtoId: Number(item.produtoId),
            quantidade: Number(item.quantidade),
          })),
        },
        ...(deveCriarEntrega && {
          entrega: {
            create: {
              ...(entregadorId && { entregadorId: Number(entregadorId) }),
              ...(distanciaKmFinal !== undefined && { distanciaKm: distanciaKmFinal }),
              custoEntrega: custoEntregaFinal !== undefined ? custoEntregaFinal : 0,
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

// 5. ATUALIZAR STATUS DO PEDIDO
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
        itens: { include: { produto: true } },
        entrega: { include: { entregador: true } },
      },
    })
    res.json(pedido)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar status', detalhe: error.message })
  }
})

// 6. ATRIBUIR / ATUALIZAR ENTREGADOR DO PEDIDO
routes.patch('/pedidos/:id/entregador', async (req, res) => {
  const id = parseId(req.params.id)
  const { entregadorId, custoEntrega, distanciaKm } = req.body

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
        ...(distanciaKm !== undefined && { distanciaKm: Number(distanciaKm) }),
      },
      create: {
        pedidoId: id,
        entregadorId: Number(entregadorId),
        custoEntrega: custoEntrega !== undefined ? Number(custoEntrega) : 0,
        ...(distanciaKm !== undefined && { distanciaKm: Number(distanciaKm) }),
      },
      include: { entregador: true },
    })

    res.json(entrega)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao vincular entregador', detalhe: error.message })
  }
})

// 7. DELETAR PEDIDO
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

// 8. RELATÓRIO DE VENDAS DO PERÍODO
// GET /relatorios/vendas?inicio=AAAA-MM-DD&fim=AAAA-MM-DD (datas no fuso do restaurante, inclusivas)

// Pedidos que já saíram da cozinha contam como concluídos; cancelados e em andamento ficam de fora.
const STATUS_CONCLUIDOS = [StatusPedido.saiu_para_entrega, StatusPedido.entregue]
const FUSO_HORARIO = process.env.FUSO_HORARIO ?? 'America/Sao_Paulo'
const DIA_MS = 24 * 60 * 60 * 1000
const MAX_DIAS = 366
const MAX_ITENS = 5

// O locale en-CA formata a data como AAAA-MM-DD.
const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_HORARIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Converte "AAAA-MM-DD" na meia-noite UTC do dia, ou null se a data não existir. */
function parseDia(valor: unknown): Date | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null
  const data = new Date(`${valor}T00:00:00Z`)
  return !isNaN(data.getTime()) && data.toISOString().startsWith(valor) ? data : null
}

const arredondar = (valor: number) => Math.round(valor * 100) / 100

routes.get('/relatorios/vendas', async (req, res) => {
  const inicio = parseDia(req.query.inicio)
  const fim = parseDia(req.query.fim)

  if (!inicio || !fim || inicio > fim) {
    res.status(400).json({ error: 'inicio e fim são obrigatórios, no formato AAAA-MM-DD, com inicio <= fim' })
    return
  }
  if ((fim.getTime() - inicio.getTime()) / DIA_MS >= MAX_DIAS) {
    res.status(400).json({ error: `O período deve ter no máximo ${MAX_DIAS} dias` })
    return
  }

  const diaInicio = String(req.query.inicio)
  const diaFim = String(req.query.fim)

  try {
    // A busca usa uma margem de um dia para cada lado; o corte exato é feito
    // abaixo, pelo dia de cada pedido no fuso do restaurante.
    const candidatos = await db.pedido.findMany({
      where: {
        status: { in: STATUS_CONCLUIDOS },
        criadoEm: {
          gte: new Date(inicio.getTime() - DIA_MS),
          lt: new Date(fim.getTime() + 2 * DIA_MS),
        },
      },
      include: { itens: { include: { produto: true } } },
    })

    const receitaPorDia = new Map<string, number>()
    for (let dia = inicio.getTime(); dia <= fim.getTime(); dia += DIA_MS) {
      receitaPorDia.set(new Date(dia).toISOString().slice(0, 10), 0)
    }

    const canais = new Map<string, { receita: number; pedidos: number }>()
    const itens = new Map<number, { nome: string; unidades: number; receita: number }>()
    let receitaTotal = 0
    let pedidosConcluidos = 0

    for (const pedido of candidatos) {
      const dia = formatoDia.format(pedido.criadoEm)
      if (dia < diaInicio || dia > diaFim) continue

      const preco = Number(pedido.preco)
      receitaTotal += preco
      pedidosConcluidos += 1
      receitaPorDia.set(dia, (receitaPorDia.get(dia) ?? 0) + preco)

      const canal = canais.get(pedido.app) ?? { receita: 0, pedidos: 0 }
      canal.receita += preco
      canal.pedidos += 1
      canais.set(pedido.app, canal)

      for (const item of pedido.itens) {
        const acumulado = itens.get(item.produtoId) ?? { nome: item.produto.nome, unidades: 0, receita: 0 }
        acumulado.unidades += item.quantidade
        // ItemPedido não guarda o preço da venda, então vale o preço atual do produto.
        acumulado.receita += item.quantidade * Number(item.produto.preco)
        itens.set(item.produtoId, acumulado)
      }
    }

    res.json({
      inicio: diaInicio,
      fim: diaFim,
      receitaTotal: arredondar(receitaTotal),
      pedidosConcluidos,
      ticketMedio: pedidosConcluidos > 0 ? arredondar(receitaTotal / pedidosConcluidos) : 0,
      receitaPorDia: [...receitaPorDia].map(([data, receita]) => ({ data, receita: arredondar(receita) })),
      receitaPorCanal: [...canais]
        .map(([app, canal]) => ({ app, pedidos: canal.pedidos, receita: arredondar(canal.receita) }))
        .sort((a, b) => b.receita - a.receita),
      itensMaisPedidos: [...itens]
        .map(([produtoId, item]) => ({ produtoId, ...item, receita: arredondar(item.receita) }))
        .sort((a, b) => b.unidades - a.unidades || b.receita - a.receita)
        .slice(0, MAX_ITENS),
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao gerar relatório de vendas', detalhe: error.message })
  }
})

export default routes
