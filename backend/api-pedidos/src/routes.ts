import { Router } from 'express'
import {
  db,
  parseId,
  StatusPedido,
  StatusPagamentoEntrega,
  ErroOperacao,
  prepararItensPedido,
  mudarStatusPedido,
  cotarFreteRestaurante,
  calcularValorMotoboy,
} from '@geroncio/shared-db'

const routes = Router()
const incluirPedido = {
  itens: { include: { produto: true } },
  entrega: { include: { entregador: true } },
  restaurante: true,
  // Links de pagamento online (api-pagamentos), do mais recente para o mais antigo
  pagamentos: { select: { status: true, expiraEm: true }, orderBy: { criadoEm: 'desc' } },
} as const

// 1. LISTAR PEDIDOS (opcionalmente filtrando por status e cliente: ?status=novo,em_preparo&clienteId=1)
routes.get('/pedidos', async (req, res) => {
  const filtro = typeof req.query.status === 'string' ? req.query.status.split(',') : []
  const restauranteId = req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) {
    res.status(400).json({ error: 'restauranteId inválido' })
    return
  }
  const status = filtro.filter((s): s is StatusPedido =>
    Object.values(StatusPedido).includes(s as StatusPedido),
  )
  if (status.length !== filtro.length) {
    res.status(400).json({
      error: `status deve ser um de: ${Object.values(StatusPedido).join(', ')}`,
    })
    return
  }

  let clienteId: number | null = null
  if (req.query.clienteId !== undefined) {
    clienteId = parseId(String(req.query.clienteId))
    if (clienteId === null) {
      res.status(400).json({ error: 'clienteId inválido' })
      return
    }
  }

  try {
    const pedidos = await db.pedido.findMany({
      where: {
        ...(status.length > 0 && { status: { in: status } }),
        ...(restauranteId && { restauranteId }),
        ...(clienteId !== null && { clienteId }),
      },
      include: incluirPedido,
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
      include: incluirPedido,
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

// 4. CRIAR PEDIDO (COM CÁLCULO E REGISTRO DA TAXA DE ENTREGA E DISTÂNCIA VIÁRIA PARA WHATSAPP)
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
    valorMotoboy,
    distanciaKm,
    restauranteId,
  } = req.body

  if (
    typeof metodoPagamento !== 'string' ||
    !metodoPagamento.trim() ||
    typeof app !== 'string' ||
    !app.trim() ||
    typeof enderecoDestino !== 'string' ||
    !enderecoDestino.trim() ||
    typeof cepDestino !== 'string'
  ) {
    res.status(400).json({
      error: 'Informe método de pagamento, canal, endereço ou retirada e CEP (vazio para retirada)',
    })
    return
  }

  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'O pedido deve conter ao menos 1 item' })
    return
  }

  if (
    valorMotoboy !== undefined &&
    valorMotoboy !== null &&
    (isNaN(Number(valorMotoboy)) || Number(valorMotoboy) < 0)
  ) {
    res.status(400).json({ error: 'valorMotoboy deve ser um número maior ou igual a zero' })
    return
  }

  try {
    let latitudeFinal = latitude === undefined || latitude === null ? null : Number(latitude)
    let longitudeFinal = longitude === undefined || longitude === null ? null : Number(longitude)
    let custoEntregaFinal =
      custoEntrega === undefined || custoEntrega === null ? undefined : Number(custoEntrega)
    let valorMotoboyFinal =
      valorMotoboy === undefined || valorMotoboy === null ? undefined : Number(valorMotoboy)
    let distanciaKmFinal =
      distanciaKm === undefined || distanciaKm === null ? undefined : Number(distanciaKm)

    const canal = app.trim().toLowerCase()
    const ehWhatsapp = canal === 'whatsapp'
    const ehRetirada = !cepDestino.trim() || enderecoDestino.trim().toLowerCase() === 'retirada no local'

    // Para pedidos de entrega via WhatsApp, calcula automaticamente a distância pelas vias
    // e a taxa segundo as regras do restaurante (nos outros apps, o frete já vem definido pela plataforma).
    if (ehWhatsapp && !ehRetirada && (custoEntregaFinal === undefined || distanciaKmFinal === undefined)) {
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
      valorMotoboyFinal !== undefined ||
      distanciaKmFinal !== undefined

    const pedido = await db.$transaction(async (tx) => {
      const restaurante = restauranteId === undefined ? undefined : parseId(String(restauranteId))
      if (restaurante === null) throw new ErroOperacao(400, 'restauranteId inválido')
      const preparados = await prepararItensPedido(tx, itens, restaurante)
      // Nos pedidos manuais o valor vem do catálogo, sem confiar no total enviado pela tela.
      const total = ['balcao', 'whatsapp'].includes(canal) ? preparados.preco : Number(preco)
      if (!Number.isFinite(Number(total)) || Number(total) < 0 || Number(total) > 99_999_999.99) {
        throw new ErroOperacao(400, 'Preço do pedido inválido')
      }

      let repasseMotoboyCalculado = valorMotoboyFinal
      if (deveCriarEntrega && repasseMotoboyCalculado === undefined) {
        const dadosRestaurante = await tx.restaurante.findUnique({
          where: { id: preparados.restauranteId },
          select: { percentualRepasseMotoboy: true },
        })
        const percentualRepasse = dadosRestaurante?.percentualRepasseMotoboy ?? 100
        const custoBase = custoEntregaFinal !== undefined ? custoEntregaFinal : 0
        repasseMotoboyCalculado = calcularValorMotoboy(custoBase, percentualRepasse)
      }

      return tx.pedido.create({
        data: {
          restauranteId: preparados.restauranteId,
          nomeCliente: nomeCliente || null,
          clienteId: clienteId ? Number(clienteId) : null,
          preco: total,
          metodoPagamento,
          app: canal,
          enderecoDestino,
          cepDestino,
          latitude: latitudeFinal,
          longitude: longitudeFinal,
          itens: {
            create: preparados.itens,
          },
          ...(deveCriarEntrega && {
            entrega: {
              create: {
                ...(entregadorId && { entregadorId: Number(entregadorId) }),
                ...(distanciaKmFinal !== undefined && { distanciaKm: distanciaKmFinal }),
                custoEntrega: custoEntregaFinal !== undefined ? custoEntregaFinal : 0,
                ...(repasseMotoboyCalculado !== undefined && {
                  valorMotoboy: repasseMotoboyCalculado,
                }),
              },
            },
          }),
        },
        include: incluirPedido,
      })
    })
    res.status(201).json(pedido)
  } catch (error: any) {
    if (error instanceof ErroOperacao) {
      res.status(error.status).json({ error: error.message })
      return
    }
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
    const pedido = await db.$transaction(async (tx) => {
      await mudarStatusPedido(tx, id, status)
      return tx.pedido.findUnique({ where: { id }, include: incluirPedido })
    })
    res.json(pedido)
  } catch (error: any) {
    if (error instanceof ErroOperacao) {
      res.status(error.status).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Erro ao atualizar status', detalhe: error.message })
  }
})

// 6. ATRIBUIR / ATUALIZAR ENTREGADOR DO PEDIDO
routes.patch('/pedidos/:id/entregador', async (req, res) => {
  const id = parseId(req.params.id)
  const { entregadorId, custoEntrega, valorMotoboy, distanciaKm } = req.body
  const idEntregador = parseId(entregadorId !== undefined ? String(entregadorId) : undefined)

  if (id === null || idEntregador === null) {
    res.status(400).json({ error: 'Id do pedido e entregadorId válidos são obrigatórios' })
    return
  }

  if (
    custoEntrega !== undefined &&
    custoEntrega !== null &&
    (isNaN(Number(custoEntrega)) || Number(custoEntrega) < 0)
  ) {
    res.status(400).json({ error: 'custoEntrega deve ser um número maior ou igual a zero' })
    return
  }

  if (
    valorMotoboy !== undefined &&
    valorMotoboy !== null &&
    (isNaN(Number(valorMotoboy)) || Number(valorMotoboy) < 0)
  ) {
    res.status(400).json({ error: 'valorMotoboy deve ser um número maior ou igual a zero' })
    return
  }

  try {
    const [pedido, entregador] = await Promise.all([
      db.pedido.findUnique({
        where: { id },
        include: { entrega: true, restaurante: true },
      }),
      db.funcionario.findUnique({ where: { id: idEntregador } }),
    ])

    if (!pedido) {
      res.status(404).json({ error: 'Pedido não encontrado' })
      return
    }
    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    const percentualRepasse = pedido.restaurante?.percentualRepasseMotoboy ?? 100
    const custoEntregaEfetivo =
      custoEntrega !== undefined && custoEntrega !== null
        ? Number(custoEntrega)
        : pedido.entrega
          ? Number(pedido.entrega.custoEntrega)
          : 0

    let valorMotoboyEfetivo: number
    if (valorMotoboy !== undefined && valorMotoboy !== null) {
      valorMotoboyEfetivo = Number(valorMotoboy)
    } else if (
      custoEntrega !== undefined ||
      !pedido.entrega ||
      pedido.entrega.valorMotoboy === null
    ) {
      valorMotoboyEfetivo = calcularValorMotoboy(custoEntregaEfetivo, percentualRepasse)
    } else {
      valorMotoboyEfetivo = Number(pedido.entrega.valorMotoboy)
    }

    const entrega = await db.entrega.upsert({
      where: { pedidoId: id },
      update: {
        entregadorId: idEntregador,
        ...(custoEntrega !== undefined && custoEntrega !== null && { custoEntrega: custoEntregaEfetivo }),
        valorMotoboy: valorMotoboyEfetivo,
        ...(distanciaKm !== undefined && distanciaKm !== null && { distanciaKm: Number(distanciaKm) }),
      },
      create: {
        pedidoId: id,
        entregadorId: idEntregador,
        custoEntrega: custoEntregaEfetivo,
        valorMotoboy: valorMotoboyEfetivo,
        ...(distanciaKm !== undefined && distanciaKm !== null && { distanciaKm: Number(distanciaKm) }),
      },
      include: { entregador: true, pedido: true },
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

    // Pedidos aceitos precisam ser cancelados antes de apagar, para devolver o estoque.
    const removido = await db.pedido.deleteMany({ where: { id, estoqueBaixado: false } })
    if (removido.count === 0) {
      res.status(409).json({
        error: 'Cancele o pedido antes de excluir. Pedidos entregues devem ser preservados',
      })
      return
    }
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

/** Obtém o valor devido ao motoboy em uma entrega (usa valorMotoboy gravado ou fallback para custoEntrega). */
function obterValorMotoboyEntrega(entrega: {
  valorMotoboy: unknown
  custoEntrega: unknown
}): number {
  if (entrega.valorMotoboy !== null && entrega.valorMotoboy !== undefined) {
    return Number(entrega.valorMotoboy)
  }
  return Number(entrega.custoEntrega)
}

// 8. ATUALIZAR STATUS DE PAGAMENTO DE UMA ENTREGA AO MOTOBOY (pendente | pago)
routes.patch('/entregas/:id/pagamento', async (req, res) => {
  const id = parseId(req.params.id)
  const { statusPagamento, valorMotoboy } = req.body

  if (id === null) {
    res.status(400).json({ error: 'Id da entrega inválido' })
    return
  }

  if (!Object.values(StatusPagamentoEntrega).includes(statusPagamento)) {
    res.status(400).json({
      error: `statusPagamento deve ser um de: ${Object.values(StatusPagamentoEntrega).join(', ')}`,
    })
    return
  }

  if (
    valorMotoboy !== undefined &&
    valorMotoboy !== null &&
    (isNaN(Number(valorMotoboy)) || Number(valorMotoboy) < 0)
  ) {
    res.status(400).json({ error: 'valorMotoboy deve ser um número maior ou igual a zero' })
    return
  }

  try {
    const entregaExistente = await db.entrega.findUnique({ where: { id } })
    if (!entregaExistente) {
      res.status(404).json({ error: 'Entrega não encontrada' })
      return
    }

    const pagoEm = statusPagamento === StatusPagamentoEntrega.pago ? new Date() : null

    const entregaAtualizada = await db.entrega.update({
      where: { id },
      data: {
        statusPagamento,
        pagoEm,
        ...(valorMotoboy !== undefined &&
          valorMotoboy !== null && { valorMotoboy: Number(valorMotoboy) }),
      },
      include: {
        entregador: true,
        pedido: true,
      },
    })

    res.json(entregaAtualizada)
  } catch (error: any) {
    res.status(500).json({
      error: 'Erro ao atualizar status de pagamento da entrega',
      detalhe: error.message,
    })
  }
})

// 9. QUITAR EM LOTE ENTREGAS PENDENTES DE UM MOTOBOY (OPCIONALMENTE FILTRANDO POR PERÍODO)
routes.post('/entregas/motoboy/:entregadorId/quitar', async (req, res) => {
  const entregadorId = parseId(req.params.entregadorId)
  if (entregadorId === null) {
    res.status(400).json({ error: 'entregadorId inválido' })
    return
  }

  const { inicio: inicioRaw, fim: fimRaw, apenasEntregues } = req.body ?? {}

  let inicio: Date | null = null
  let fim: Date | null = null
  const temFiltroPeriodo = inicioRaw !== undefined || fimRaw !== undefined

  if (temFiltroPeriodo) {
    inicio = parseDia(inicioRaw)
    fim = parseDia(fimRaw)
    if (!inicio || !fim || inicio > fim) {
      res.status(400).json({
        error: 'Quando informados, inicio e fim devem estar no formato AAAA-MM-DD, com inicio <= fim',
      })
      return
    }
    if ((fim.getTime() - inicio.getTime()) / DIA_MS >= MAX_DIAS) {
      res.status(400).json({ error: `O período deve ter no máximo ${MAX_DIAS} dias` })
      return
    }
  }

  try {
    const entregador = await db.funcionario.findUnique({ where: { id: entregadorId } })
    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    const candidatas = await db.entrega.findMany({
      where: {
        entregadorId,
        statusPagamento: StatusPagamentoEntrega.pendente,
        pedido: {
          status:
            apenasEntregues === true
              ? StatusPedido.entregue
              : { not: StatusPedido.cancelado },
        },
        ...(inicio &&
          fim && {
            dataHora: {
              gte: new Date(inicio.getTime() - DIA_MS),
              lt: new Date(fim.getTime() + 2 * DIA_MS),
            },
          }),
      },
      include: { pedido: true },
      orderBy: { dataHora: 'asc' },
    })

    const diaInicio = temFiltroPeriodo ? String(inicioRaw) : null
    const diaFim = temFiltroPeriodo ? String(fimRaw) : null

    const entregasParaQuitar = candidatas.filter((entrega) => {
      if (!diaInicio || !diaFim) return true
      const dia = formatoDia.format(entrega.dataHora)
      return dia >= diaInicio && dia <= diaFim
    })

    const agora = new Date()
    const entregasIds = entregasParaQuitar.map((e) => e.id)
    const valorTotalQuitado = arredondar(
      entregasParaQuitar.reduce((acc, e) => acc + obterValorMotoboyEntrega(e), 0),
    )

    if (entregasIds.length > 0) {
      await db.entrega.updateMany({
        where: {
          id: { in: entregasIds },
          statusPagamento: StatusPagamentoEntrega.pendente,
        },
        data: {
          statusPagamento: StatusPagamentoEntrega.pago,
          pagoEm: agora,
        },
      })
    }

    res.json({
      entregadorId: entregador.id,
      nomeEntregador: entregador.nome,
      inicio: diaInicio,
      fim: diaFim,
      quantidadeQuitada: entregasIds.length,
      valorTotalQuitado,
      pagoEm: entregasIds.length > 0 ? agora : null,
      entregasIds,
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Erro ao quitar entregas pendentes do motoboy',
      detalhe: error.message,
    })
  }
})

// 10. RELATÓRIO DE VENDAS DO PERÍODO
routes.get('/relatorios/vendas', async (req, res) => {
  const inicio = parseDia(req.query.inicio)
  const fim = parseDia(req.query.fim)
  const restauranteId = req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) {
    res.status(400).json({ error: 'restauranteId inválido' })
    return
  }

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
        ...(restauranteId && { restauranteId }),
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
