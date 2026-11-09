import { Router } from 'express'
import {
  db,
  parseId,
  StatusPedido,
  ErroOperacao,
  mudarStatusPedido,
  obterCoordenadasEndereco,
  obterCoordenadasRestaurante,
  calcularRotaComParadas,
  resolverRestauranteId,
  type Coordenada,
} from '@geroncio/shared-db'

const routes = Router()

// O link do Google Maps aceita origem, destino e até 9 pontos intermediários
const MAXIMO_PARADAS = 10
const TRANSPORTES = ['moto', 'bicicleta', 'carro'] as const
type Transporte = (typeof TRANSPORTES)[number]
const VELOCIDADE_BICICLETA_KMPH = 15

type EntradaRota = { restauranteId: number; pedidoIds: number[]; transporte: Transporte }

/** Valida o corpo comum às duas rotas. Os ids vêm na ordem de entrega; sem restauranteId, usa o principal. */
async function lerEntrada(corpo: any): Promise<EntradaRota> {
  const informado = corpo?.restauranteId === undefined || corpo?.restauranteId === null ? undefined : parseId(String(corpo.restauranteId))
  if (informado === null) throw new ErroOperacao(400, 'restauranteId inválido')
  const restauranteId = await resolverRestauranteId(informado)

  const pedidoIds = Array.isArray(corpo?.pedidoIds) ? corpo.pedidoIds.map((id: unknown) => parseId(String(id))) : []
  if (pedidoIds.length === 0 || pedidoIds.some((id: number | null) => id === null)) {
    throw new ErroOperacao(400, 'Informe pedidoIds com ao menos um pedido')
  }
  if (new Set(pedidoIds).size !== pedidoIds.length) throw new ErroOperacao(400, 'Há pedidos repetidos na rota')
  if (pedidoIds.length > MAXIMO_PARADAS) {
    throw new ErroOperacao(400, `A rota aceita no máximo ${MAXIMO_PARADAS} paradas (limite do Google Maps)`)
  }

  const transporte = corpo?.transporte ?? 'moto'
  if (!TRANSPORTES.includes(transporte)) {
    throw new ErroOperacao(400, `transporte deve ser um de: ${TRANSPORTES.join(', ')}`)
  }
  return { restauranteId, pedidoIds, transporte }
}

/**
 * Carrega o restaurante e os pedidos da rota, na ordem pedida, com coordenadas.
 * Pedidos sem latitude/longitude são geocodificados agora e salvos.
 */
async function montarParadas({ restauranteId, pedidoIds }: EntradaRota) {
  const restaurante = await db.restaurante.findUnique({ where: { id: restauranteId } })
  if (!restaurante) throw new ErroOperacao(404, 'Restaurante não encontrado')

  const pedidos = await db.pedido.findMany({
    where: { id: { in: pedidoIds } },
    include: { cliente: { select: { nomeCliente: true } } },
  })
  const porId = new Map(pedidos.map((p) => [p.id, p]))

  const origem = await obterCoordenadasRestaurante(restaurante).catch((error: Error) => {
    throw new ErroOperacao(400, error.message)
  })

  const paradas = []
  // Em sequência: o Nominatim público aceita uma consulta por vez
  for (const id of pedidoIds) {
    const pedido = porId.get(id)
    if (!pedido || pedido.restauranteId !== restauranteId) throw new ErroOperacao(404, `Pedido #${id} não encontrado neste restaurante`)
    if (pedido.status !== StatusPedido.pronto) throw new ErroOperacao(409, `Pedido #${id} não está pronto para entrega`)
    if (!pedido.cepDestino.trim()) throw new ErroOperacao(400, `Pedido #${id} é retirada no local`)

    let coordenada: Coordenada
    if (pedido.latitude !== null && pedido.longitude !== null) {
      coordenada = { latitude: pedido.latitude, longitude: pedido.longitude }
    } else {
      const geo = await obterCoordenadasEndereco({
        endereco: pedido.enderecoDestino,
        cep: pedido.cepDestino,
        cidade: restaurante.cidade,
      }).catch(() => {
        throw new ErroOperacao(400, `Endereço do pedido #${id} não localizado no mapa ("${pedido.enderecoDestino}", CEP ${pedido.cepDestino})`)
      })
      coordenada = { latitude: geo.latitude, longitude: geo.longitude }
      await db.pedido.update({ where: { id }, data: coordenada })
    }
    paradas.push({ pedidoId: id, cliente: pedido.cliente?.nomeCliente ?? null, endereco: pedido.enderecoDestino, ...coordenada })
  }

  return {
    origem: { nome: restaurante.nome, endereco: restaurante.endereco, ...origem },
    paradas,
  }
}

/** Link do Google Maps com a rota completa: restaurante → paradas na ordem → última parada. */
function linkGoogleMaps(origem: Coordenada, paradas: Coordenada[], transporte: Transporte) {
  const ponto = (c: Coordenada) => `${c.latitude},${c.longitude}`
  const parametros = new URLSearchParams({
    api: '1',
    origin: ponto(origem),
    destination: ponto(paradas[paradas.length - 1]!),
    // Moto não existe no link do Google Maps: usa o modo carro
    travelmode: transporte === 'bicicleta' ? 'bicycling' : 'driving',
  })
  if (paradas.length > 1) parametros.set('waypoints', paradas.slice(0, -1).map(ponto).join('|'))
  return `https://www.google.com/maps/dir/?${parametros}`
}

function responderErro(res: any, error: any, mensagem: string) {
  if (error instanceof ErroOperacao) {
    res.status(error.status).json({ error: error.message })
    return
  }
  res.status(500).json({ error: mensagem, detalhe: error.message })
}

// ============================================
// ROTAS DE ENTREGA
// ============================================

// 1. CALCULAR ROTA (traçado pelas vias, distância e duração, para o mapa)
routes.post('/rotas/calcular', async (req, res) => {
  try {
    const entrada = await lerEntrada(req.body)
    const { origem, paradas } = await montarParadas(entrada)
    const rota = await calcularRotaComParadas([origem, ...paradas])

    // O OSRM público só tem perfil de carro; para bicicleta, estima pela velocidade média
    const duracaoMinutos = entrada.transporte === 'bicicleta'
      ? Math.max(1, Math.round((rota.distanciaKm / VELOCIDADE_BICICLETA_KMPH) * 60))
      : rota.duracaoMinutos

    res.json({ origem, paradas, ...rota, duracaoMinutos })
  } catch (error: any) {
    responderErro(res, error, 'Erro ao calcular a rota')
  }
})

// 2. EXPORTAR ROTA (link do Google Maps; os pedidos passam para "saiu_para_entrega")
routes.post('/rotas/exportar', async (req, res) => {
  try {
    const entrada = await lerEntrada(req.body)
    const { origem, paradas } = await montarParadas(entrada)
    const url = linkGoogleMaps(origem, paradas, entrada.transporte)

    // Tudo ou nada: se algum pedido mudou de status no meio do caminho, nenhum sai
    await db.$transaction(async (tx) => {
      for (const id of entrada.pedidoIds) await mudarStatusPedido(tx, id, StatusPedido.saiu_para_entrega)
    })

    res.json({ url, pedidoIds: entrada.pedidoIds, status: StatusPedido.saiu_para_entrega })
  } catch (error: any) {
    responderErro(res, error, 'Erro ao exportar a rota')
  }
})

export default routes
