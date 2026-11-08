import { Router } from 'express'
import {
  db,
  Prisma,
  parseId,
  StatusPedido,
  StatusEntregador,
  StatusPagamentoEntrega,
  TipoFuncionario,
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
    // Canais próprios: o restaurante entrega e cobra o frete. Nos apps, o frete já vem da plataforma.
    const ehCanalProprio = ['whatsapp', 'balcao'].includes(canal)
    const ehRetirada = !cepDestino.trim() || enderecoDestino.trim().toLowerCase() === 'retirada no local'

    // Para entregas dos canais próprios, calcula a distância pelas vias e a taxa segundo as
    // regras do restaurante, a menos que o frete já venha cotado (chatbot, formulário do painel).
    if (ehCanalProprio && !ehRetirada && (custoEntregaFinal === undefined || distanciaKmFinal === undefined)) {
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
        }).catch((error: Error) => {
          throw new ErroOperacao(400, `Não foi possível calcular o frete: ${error.message}`)
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

    // Sincroniza status do entregador se houver entrega vinculada
    if (pedido?.entrega?.entregadorId) {
      if (status === StatusPedido.saiu_para_entrega) {
        await db.funcionario.update({
          where: { id: pedido.entrega.entregadorId },
          data: { status: StatusEntregador.em_entrega },
        }).catch(() => {})
      } else if (status === StatusPedido.entregue || status === StatusPedido.cancelado) {
        const entregasPendentes = await db.entrega.count({
          where: {
            entregadorId: pedido.entrega.entregadorId,
            pedido: { status: StatusPedido.saiu_para_entrega },
          },
        })
        if (entregasPendentes === 0) {
          await db.funcionario.update({
            where: { id: pedido.entrega.entregadorId },
            data: { status: StatusEntregador.disponivel },
          }).catch(() => {})
        }
      }
    }

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

    if (pedido.status === StatusPedido.saiu_para_entrega) {
      await db.funcionario.update({
        where: { id: Number(entregadorId) },
        data: { status: StatusEntregador.em_entrega },
      }).catch(() => {})
    }

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

// ============================================
// CONTROLE DE GANHOS DO MOTOBOY E RELATÓRIOS
// ============================================

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
    const candidatasIds = entregasParaQuitar.map((e) => e.id)
    // RETURNING informa apenas as linhas alteradas por esta requisição, mesmo sob concorrência.
    const quitadas = candidatasIds.length === 0 ? [] : await db.$queryRaw<
      { id: number; valor: Prisma.Decimal }[]
    >(Prisma.sql`
      UPDATE "Entrega"
      SET "status_pagamento" = 'pago', "pago_em" = ${agora}
      WHERE "id" IN (${Prisma.join(candidatasIds)})
        AND "entregador_id" = ${entregadorId}
        AND "status_pagamento" = 'pendente'
      RETURNING "id", COALESCE("valor_motoboy", "custo_entrega") AS "valor"
    `)
    const entregasIds = quitadas.map((e) => e.id).sort((a, b) => a - b)
    const valorTotalQuitado = arredondar(quitadas.reduce((acc, e) => acc + Number(e.valor), 0))

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

// 10. CONSULTAR RESUMO E EXTRATO DE GANHOS DE UM MOTOBOY POR PERÍODO
// GET /entregas/motoboy/:entregadorId/ganhos?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&statusPagamento=pendente|pago&restauranteId=1
routes.get('/entregas/motoboy/:entregadorId/ganhos', async (req, res) => {
  const entregadorId = parseId(req.params.entregadorId)
  if (entregadorId === null) {
    res.status(400).json({ error: 'entregadorId inválido' })
    return
  }

  const inicioRaw = req.query.inicio
  const fimRaw = req.query.fim
  const temFiltroPeriodo = inicioRaw !== undefined || fimRaw !== undefined

  let inicio: Date | null = null
  let fim: Date | null = null

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

  const statusPagamentoFiltro = req.query.statusPagamento
  if (
    statusPagamentoFiltro !== undefined &&
    !Object.values(StatusPagamentoEntrega).includes(statusPagamentoFiltro as StatusPagamentoEntrega)
  ) {
    res.status(400).json({
      error: `statusPagamento deve ser um de: ${Object.values(StatusPagamentoEntrega).join(', ')}`,
    })
    return
  }

  const restauranteId =
    req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) {
    res.status(400).json({ error: 'restauranteId inválido' })
    return
  }

  const apenasEntregues = req.query.apenasEntregues === 'true'

  try {
    const entregador = await db.funcionario.findUnique({ where: { id: entregadorId } })
    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    const candidatas = await db.entrega.findMany({
      where: {
        entregadorId,
        pedido: {
          ...(restauranteId && { restauranteId }),
          status: apenasEntregues
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
      include: {
        pedido: true,
      },
      orderBy: { dataHora: 'desc' },
    })

    const diaInicio = temFiltroPeriodo ? String(inicioRaw) : null
    const diaFim = temFiltroPeriodo ? String(fimRaw) : null

    const entregasNoPeriodo = candidatas.filter((entrega) => {
      if (!diaInicio || !diaFim) return true
      const dia = formatoDia.format(entrega.dataHora)
      return dia >= diaInicio && dia <= diaFim
    })

    const mapaGanhosPorDia = new Map<
      string,
      { entregas: number; valorPendente: number; valorPago: number; valorTotal: number }
    >()

    if (inicio && fim) {
      for (let d = inicio.getTime(); d <= fim.getTime(); d += DIA_MS) {
        const chaveDia = new Date(d).toISOString().slice(0, 10)
        mapaGanhosPorDia.set(chaveDia, {
          entregas: 0,
          valorPendente: 0,
          valorPago: 0,
          valorTotal: 0,
        })
      }
    }

    let entregasPendentes = 0
    let entregasPagas = 0
    let valorPendenteAReceber = 0
    let valorJaPago = 0
    let taxaTotalCobrada = 0
    let distanciaTotalKm = 0

    for (const entrega of entregasNoPeriodo) {
      const dia = formatoDia.format(entrega.dataHora)
      const valorMotoboy = obterValorMotoboyEntrega(entrega)
      const custoEntrega = Number(entrega.custoEntrega)
      const distancia = entrega.distanciaKm ?? 0

      taxaTotalCobrada += custoEntrega
      distanciaTotalKm += distancia

      const acumuladoDia = mapaGanhosPorDia.get(dia) ?? {
        entregas: 0,
        valorPendente: 0,
        valorPago: 0,
        valorTotal: 0,
      }
      acumuladoDia.entregas += 1
      acumuladoDia.valorTotal += valorMotoboy

      if (entrega.statusPagamento === StatusPagamentoEntrega.pago) {
        entregasPagas += 1
        valorJaPago += valorMotoboy
        acumuladoDia.valorPago += valorMotoboy
      } else {
        entregasPendentes += 1
        valorPendenteAReceber += valorMotoboy
        acumuladoDia.valorPendente += valorMotoboy
      }

      mapaGanhosPorDia.set(dia, acumuladoDia)
    }

    const totalEntregas = entregasNoPeriodo.length
    const valorTotalPeriodo = valorPendenteAReceber + valorJaPago

    const entregasFiltradasLista = statusPagamentoFiltro
      ? entregasNoPeriodo.filter((e) => e.statusPagamento === statusPagamentoFiltro)
      : entregasNoPeriodo

    const ganhosPorDia = [...mapaGanhosPorDia.entries()]
      .sort(([diaA], [diaB]) => diaA.localeCompare(diaB))
      .map(([data, item]) => ({
        data,
        entregas: item.entregas,
        valorPendente: arredondar(item.valorPendente),
        valorPago: arredondar(item.valorPago),
        valorTotal: arredondar(item.valorTotal),
      }))

    res.json({
      entregador: {
        id: entregador.id,
        nome: entregador.nome,
        cpf: entregador.cpf,
        telefone: entregador.telefone,
        email: entregador.email,
        status: entregador.status,
      },
      periodo: {
        inicio: diaInicio,
        fim: diaFim,
      },
      resumo: {
        totalEntregas,
        entregasPendentes,
        entregasPagas,
        valorPendenteAReceber: arredondar(valorPendenteAReceber),
        valorJaPago: arredondar(valorJaPago),
        valorTotalPeriodo: arredondar(valorTotalPeriodo),
        taxaTotalCobrada: arredondar(taxaTotalCobrada),
        distanciaTotalKm: arredondar(distanciaTotalKm),
        mediaPorEntrega: totalEntregas > 0 ? arredondar(valorTotalPeriodo / totalEntregas) : 0,
      },
      ganhosPorDia,
      entregas: entregasFiltradasLista.map((entrega) => ({
        id: entrega.id,
        pedidoId: entrega.pedidoId,
        entregadorId: entrega.entregadorId,
        dataHora: entrega.dataHora,
        dia: formatoDia.format(entrega.dataHora),
        distanciaKm: entrega.distanciaKm,
        custoEntrega: arredondar(Number(entrega.custoEntrega)),
        valorMotoboy: arredondar(obterValorMotoboyEntrega(entrega)),
        statusPagamento: entrega.statusPagamento,
        pagoEm: entrega.pagoEm,
        pedido: {
          id: entrega.pedido.id,
          nomeCliente: entrega.pedido.nomeCliente,
          app: entrega.pedido.app,
          enderecoDestino: entrega.pedido.enderecoDestino,
          cepDestino: entrega.pedido.cepDestino,
          status: entrega.pedido.status,
          preco: arredondar(Number(entrega.pedido.preco)),
          restauranteId: entrega.pedido.restauranteId,
        },
      })),
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Erro ao consultar ganhos do motoboy',
      detalhe: error.message,
    })
  }
})

// 11. RESUMO GERAL DE GANHOS DE TODOS OS MOTOBOYS (POR PERÍODO OPCIONAL)
// GET /entregas/motoboys/resumo?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&restauranteId=1
routes.get('/entregas/motoboys/resumo', async (req, res) => {
  const inicioRaw = req.query.inicio
  const fimRaw = req.query.fim
  const temFiltroPeriodo = inicioRaw !== undefined || fimRaw !== undefined

  let inicio: Date | null = null
  let fim: Date | null = null

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

  const restauranteId =
    req.query.restauranteId === undefined ? undefined : parseId(String(req.query.restauranteId))
  if (restauranteId === null) {
    res.status(400).json({ error: 'restauranteId inválido' })
    return
  }

  try {
    const motoboys = await db.funcionario.findMany({
      where: { tipo: TipoFuncionario.ENTREGADOR },
      orderBy: { id: 'asc' },
    })

    const entregas = await db.entrega.findMany({
      where: {
        entregadorId: { not: null },
        pedido: {
          ...(restauranteId && { restauranteId }),
          status: { not: StatusPedido.cancelado },
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
    })

    const diaInicio = temFiltroPeriodo ? String(inicioRaw) : null
    const diaFim = temFiltroPeriodo ? String(fimRaw) : null

    const entregasNoPeriodo = entregas.filter((entrega) => {
      if (!diaInicio || !diaFim) return true
      const dia = formatoDia.format(entrega.dataHora)
      return dia >= diaInicio && dia <= diaFim
    })

    const mapaPorMotoboy = new Map<
      number,
      {
        totalEntregas: number
        entregasPendentes: number
        entregasPagas: number
        valorPendenteAReceber: number
        valorJaPago: number
        distanciaTotalKm: number
      }
    >()

    for (const entrega of entregasNoPeriodo) {
      if (!entrega.entregadorId) continue
      const atual = mapaPorMotoboy.get(entrega.entregadorId) ?? {
        totalEntregas: 0,
        entregasPendentes: 0,
        entregasPagas: 0,
        valorPendenteAReceber: 0,
        valorJaPago: 0,
        distanciaTotalKm: 0,
      }

      const valorMotoboy = obterValorMotoboyEntrega(entrega)
      atual.totalEntregas += 1
      atual.distanciaTotalKm += entrega.distanciaKm ?? 0

      if (entrega.statusPagamento === StatusPagamentoEntrega.pago) {
        atual.entregasPagas += 1
        atual.valorJaPago += valorMotoboy
      } else {
        atual.entregasPendentes += 1
        atual.valorPendenteAReceber += valorMotoboy
      }

      mapaPorMotoboy.set(entrega.entregadorId, atual)
    }

    const listaMotoboys = motoboys.map((m) => {
      const dados = mapaPorMotoboy.get(m.id) ?? {
        totalEntregas: 0,
        entregasPendentes: 0,
        entregasPagas: 0,
        valorPendenteAReceber: 0,
        valorJaPago: 0,
        distanciaTotalKm: 0,
      }
      const valorTotalPeriodo = dados.valorPendenteAReceber + dados.valorJaPago
      return {
        entregadorId: m.id,
        nome: m.nome,
        telefone: m.telefone,
        email: m.email,
        status: m.status,
        totalEntregas: dados.totalEntregas,
        entregasPendentes: dados.entregasPendentes,
        entregasPagas: dados.entregasPagas,
        valorPendenteAReceber: arredondar(dados.valorPendenteAReceber),
        valorJaPago: arredondar(dados.valorJaPago),
        valorTotalPeriodo: arredondar(valorTotalPeriodo),
        distanciaTotalKm: arredondar(dados.distanciaTotalKm),
      }
    })

    const totalGeralPendente = arredondar(
      listaMotoboys.reduce((acc, m) => acc + m.valorPendenteAReceber, 0),
    )
    const totalGeralPago = arredondar(
      listaMotoboys.reduce((acc, m) => acc + m.valorJaPago, 0),
    )

    res.json({
      periodo: { inicio: diaInicio, fim: diaFim },
      totalGeralPendente,
      totalGeralPago,
      totalGeralPeriodo: arredondar(totalGeralPendente + totalGeralPago),
      motoboys: listaMotoboys,
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Erro ao consultar resumo geral de ganhos dos motoboys',
      detalhe: error.message,
    })
  }
})

// 12. RELATÓRIO DE VENDAS DO PERÍODO
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

// ============================================
// ENTREGADORES (MOTOBOYS)
// ============================================

// 8. LISTAR ENTREGADORES
routes.get('/entregadores', async (req, res) => {
  const filtro = typeof req.query.status === 'string' ? req.query.status.split(',') : []
  const status = filtro.filter((s): s is StatusEntregador =>
    Object.values(StatusEntregador).includes(s as StatusEntregador),
  )

  if (status.length !== filtro.length) {
    res.status(400).json({
      error: `status deve ser um de: ${Object.values(StatusEntregador).join(', ')}`,
    })
    return
  }

  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : ''

  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)

  try {
    const entregadores = await db.funcionario.findMany({
      where: {
        tipo: TipoFuncionario.ENTREGADOR,
        ...(status.length > 0 && { status: { in: status } }),
        ...(busca && {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { telefone: { contains: busca } },
            { cpf: { contains: busca } },
            { placa: { contains: busca, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        entregas: {
          where: {
            dataHora: { gte: inicioDoDia },
          },
          select: { id: true },
        },
      },
      orderBy: { nome: 'asc' },
    })

    const resultado = entregadores.map((e) => ({
      id: e.id,
      nome: e.nome,
      cpf: e.cpf,
      telefone: e.telefone,
      email: e.email,
      placa: e.placa ?? undefined,
      status: e.status ?? StatusEntregador.disponivel,
      entregasHoje: e.entregas.length,
    }))

    res.json(resultado)
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar entregadores', detalhe: error.message })
  }
})

// 9. BUSCAR ENTREGADOR POR ID
routes.get('/entregadores/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)

  try {
    const entregador = await db.funcionario.findFirst({
      where: { id, tipo: TipoFuncionario.ENTREGADOR },
      include: {
        entregas: {
          where: {
            dataHora: { gte: inicioDoDia },
          },
          select: { id: true },
        },
      },
    })

    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    res.json({
      id: entregador.id,
      nome: entregador.nome,
      cpf: entregador.cpf,
      telefone: entregador.telefone,
      email: entregador.email,
      placa: entregador.placa ?? undefined,
      status: entregador.status ?? StatusEntregador.disponivel,
      entregasHoje: entregador.entregas.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar entregador', detalhe: error.message })
  }
})

// 10. CRIAR ENTREGADOR
routes.post('/entregadores', async (req, res) => {
  const { nome, cpf, telefone, email, placa, status } = req.body

  if (!nome || !cpf || !telefone) {
    res.status(400).json({ error: 'Campos obrigatórios ausentes (nome, cpf, telefone)' })
    return
  }

  let statusFinal: StatusEntregador = StatusEntregador.disponivel
  if (status) {
    if (!Object.values(StatusEntregador).includes(status)) {
      res.status(400).json({
        error: `status inválido. Deve ser um de: ${Object.values(StatusEntregador).join(', ')}`,
      })
      return
    }
    statusFinal = status
  }

  try {
    const cpfLimpo = String(cpf).trim()
    const existente = await db.funcionario.findUnique({ where: { cpf: cpfLimpo } })
    if (existente) {
      res.status(409).json({ error: 'Já existe um funcionário cadastrado com este CPF' })
      return
    }

    const novo = await db.funcionario.create({
      data: {
        nome: String(nome).trim(),
        cpf: cpfLimpo,
        telefone: String(telefone).trim(),
        email: email ? String(email).trim() : '',
        placa: placa ? String(placa).trim() : null,
        tipo: TipoFuncionario.ENTREGADOR,
        status: statusFinal,
      },
    })

    res.status(201).json({
      id: novo.id,
      nome: novo.nome,
      cpf: novo.cpf,
      telefone: novo.telefone,
      email: novo.email,
      placa: novo.placa ?? undefined,
      status: novo.status ?? StatusEntregador.disponivel,
      entregasHoje: 0,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao cadastrar entregador', detalhe: error.message })
  }
})

// 11. ATUALIZAR ENTREGADOR
routes.put('/entregadores/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const { nome, cpf, telefone, email, placa, status } = req.body

  if (!nome || !cpf || !telefone) {
    res.status(400).json({ error: 'Campos obrigatórios ausentes (nome, cpf, telefone)' })
    return
  }

  if (status && !Object.values(StatusEntregador).includes(status)) {
    res.status(400).json({
      error: `status inválido. Deve ser um de: ${Object.values(StatusEntregador).join(', ')}`,
    })
    return
  }

  try {
    const entregador = await db.funcionario.findFirst({
      where: { id, tipo: TipoFuncionario.ENTREGADOR },
    })
    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    const cpfLimpo = String(cpf).trim()
    if (cpfLimpo !== entregador.cpf) {
      const outro = await db.funcionario.findUnique({ where: { cpf: cpfLimpo } })
      if (outro && outro.id !== id) {
        res.status(409).json({ error: 'Outro funcionário já possui este CPF' })
        return
      }
    }

    const inicioDoDia = new Date()
    inicioDoDia.setHours(0, 0, 0, 0)

    const atualizado = await db.funcionario.update({
      where: { id },
      data: {
        nome: String(nome).trim(),
        cpf: cpfLimpo,
        telefone: String(telefone).trim(),
        email: email !== undefined ? String(email).trim() : entregador.email,
        placa: placa !== undefined ? (placa ? String(placa).trim() : null) : entregador.placa,
        ...(status && { status }),
      },
      include: {
        entregas: {
          where: { dataHora: { gte: inicioDoDia } },
          select: { id: true },
        },
      },
    })

    res.json({
      id: atualizado.id,
      nome: atualizado.nome,
      cpf: atualizado.cpf,
      telefone: atualizado.telefone,
      email: atualizado.email,
      placa: atualizado.placa ?? undefined,
      status: atualizado.status ?? StatusEntregador.disponivel,
      entregasHoje: atualizado.entregas.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar entregador', detalhe: error.message })
  }
})

// 12. ATUALIZAR STATUS DO ENTREGADOR
routes.patch('/entregadores/:id/status', async (req, res) => {
  const id = parseId(req.params.id)
  const { status } = req.body

  if (id === null || !status) {
    res.status(400).json({ error: 'Id e status são obrigatórios' })
    return
  }

  if (!Object.values(StatusEntregador).includes(status)) {
    res.status(400).json({
      error: `status inválido. Deve ser um de: ${Object.values(StatusEntregador).join(', ')}`,
    })
    return
  }

  try {
    const entregador = await db.funcionario.findFirst({
      where: { id, tipo: TipoFuncionario.ENTREGADOR },
    })
    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    const atualizado = await db.funcionario.update({
      where: { id },
      data: { status },
    })

    res.json({
      id: atualizado.id,
      status: atualizado.status,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao atualizar status do entregador', detalhe: error.message })
  }
})

// 13. DELETAR ENTREGADOR
routes.delete('/entregadores/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  try {
    const entregador = await db.funcionario.findFirst({
      where: { id, tipo: TipoFuncionario.ENTREGADOR },
    })
    if (!entregador) {
      res.status(404).json({ error: 'Entregador não encontrado' })
      return
    }

    const totalEntregas = await db.entrega.count({ where: { entregadorId: id } })
    if (totalEntregas > 0) {
      await db.funcionario.update({
        where: { id },
        data: { status: StatusEntregador.inativo },
      })
      res.status(200).json({
        mensagem: 'Entregador inativado pois possui entregas registradas no histórico',
        status: StatusEntregador.inativo,
      })
      return
    }

    await db.funcionario.delete({ where: { id } })
    res.status(204).send()
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao deletar entregador', detalhe: error.message })
  }
})

export default routes
