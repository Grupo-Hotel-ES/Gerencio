import { db } from './client'

export interface Coordenada {
  latitude: number
  longitude: number
}

export interface ResultadoGeocodificacao extends Coordenada {
  enderecoFormatado?: string
  cidade?: string
  uf?: string
}

export interface ResultadoRotaViaria {
  distanciaKm: number
  distanciaLinhaRetaKm: number
  duracaoMinutos: number
  metodoCalculo: 'rota_viaria' | 'contingencia_haversine'
}

export interface RegrasEntregaRestaurante {
  taxaEntregaBase: number
  kmInclusosTaxaBase: number
  custoPorKmAdicional: number
  distanciaMaximaKm?: number | null
}

export interface ResultadoCalculoTaxa {
  dentroDaAreaEntrega: boolean
  taxaEntrega: number | null
  kmExcedente: number
  motivoRecusa?: string
}

export interface EntradaDestinoCotacao {
  enderecoDestino?: string
  cepDestino?: string
  cidadeDestino?: string
  latitude?: number | null
  longitude?: number | null
}

export interface ResultadoCotacaoFrete {
  restauranteId: number
  nomeRestaurante: string
  origem: Coordenada & { endereco: string; cep: string; cidade: string }
  destino: Coordenada & { enderecoDestino: string; cepDestino: string }
  distanciaKm: number
  distanciaLinhaRetaKm: number
  duracaoEstimadaMinutos: number
  metodoCalculo: 'rota_viaria' | 'contingencia_haversine'
  dentroDaAreaEntrega: boolean
  taxaEntrega: number | null
  kmExcedente: number
  motivoRecusa?: string
  regrasAplicadas: {
    taxaEntregaBase: number
    kmInclusosTaxaBase: number
    custoPorKmAdicional: number
    distanciaMaximaKm: number | null
  }
}

// Constantes inspiradas nos parâmetros empíricos da dissertação (demand-allocation-pocs)
const RAIO_TERRA_KM = 6371
export const FATOR_CORRECAO_VIARIA_TESE = 1.5
const VELOCIDADE_MEDIA_URBANA_KMPH = 15
const TIMEOUT_HTTP_MS = 8000

const OSRM_API_URL = process.env.OSRM_API_URL ?? 'https://router.project-osrm.org'
const NOMINATIM_API_URL = process.env.NOMINATIM_API_URL ?? 'https://nominatim.openstreetmap.org'
const VIACEP_API_URL = process.env.VIACEP_API_URL ?? 'https://viacep.com.br/ws'

export function arredondar2Casas(valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Calcula a distância em quilômetros entre dois pontos usando a fórmula de Haversine.
 * Permite aplicar um fator de correção de tortuosidade urbana (padrão 1.0 = linha reta; 1.5 = estimativa viária da tese).
 */
export function calcularDistanciaHaversineKm(
  origem: Coordenada,
  destino: Coordenada,
  fatorCorrecao = 1.0,
): number {
  const paraRadianos = (graus: number) => (graus * Math.PI) / 180

  const phi1 = paraRadianos(origem.latitude)
  const phi2 = paraRadianos(destino.latitude)
  const deltaPhi = paraRadianos(destino.latitude - origem.latitude)
  const deltaLambda = paraRadianos(destino.longitude - origem.longitude)

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2

  const distancia = 2 * RAIO_TERRA_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return fatorCorrecao * distancia
}

interface DadosViaCep {
  cep?: string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean
}

async function consultarViaCep(cep: string): Promise<DadosViaCep | null> {
  const cepLimpo = cep.replace(/\D/g, '')
  if (cepLimpo.length !== 8) return null

  try {
    const res = await fetch(`${VIACEP_API_URL}/${cepLimpo}/json/`, {
      signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
    })
    if (!res.ok) return null
    const dados = (await res.json()) as DadosViaCep
    if (dados.erro) return null
    return dados
  } catch {
    return null
  }
}

interface ItemNominatim {
  lat: string
  lon: string
  display_name?: string
}

async function buscarNoNominatim(consulta: string): Promise<ResultadoGeocodificacao | null> {
  const texto = consulta.trim()
  if (!texto) return null

  try {
    const url = `${NOMINATIM_API_URL}/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(texto)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Geroncio-Delivery-UNIFESP/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
    })
    if (!res.ok) return null

    const resultados = (await res.json()) as ItemNominatim[]
    const primeiro = Array.isArray(resultados) ? resultados[0] : undefined
    if (!primeiro) return null

    const latitude = Number(primeiro.lat)
    const longitude = Number(primeiro.lon)
    if (isNaN(latitude) || isNaN(longitude)) return null

    return {
      latitude,
      longitude,
      enderecoFormatado: primeiro.display_name,
    }
  } catch {
    return null
  }
}

/**
 * Converte um endereço e/ou CEP em coordenadas geográficas (latitude e longitude).
 * Combina ViaCEP (para enriquecer logradouro, bairro, cidade e UF) + Nominatim (OpenStreetMap).
 */
export async function obterCoordenadasEndereco(opcoes: {
  endereco?: string
  cep?: string
  cidade?: string
}): Promise<ResultadoGeocodificacao> {
  const endereco = opcoes.endereco?.trim() ?? ''
  const cep = opcoes.cep?.trim() ?? ''
  const cidadeInformada = opcoes.cidade?.trim() ?? ''

  const viaCep = cep ? await consultarViaCep(cep) : null
  const cidade = cidadeInformada || viaCep?.localidade || ''
  const uf = viaCep?.uf || ''
  const logradouroViaCep = viaCep?.logradouro || ''
  const bairroViaCep = viaCep?.bairro || ''

  // Extrai possível número predial do endereço informado (ex: "Av. Andrômeda, 1500" -> "1500")
  const matchNumero = endereco.match(/\b(\d{1,5})\b/)
  const numeroPredial = matchNumero ? matchNumero[1] : ''

  const tentativas: string[] = []

  if (endereco && cidade && uf) {
    tentativas.push(`${endereco}, ${cidade}, ${uf}, Brasil`)
  }
  if (logradouroViaCep && numeroPredial && cidade) {
    tentativas.push(`${logradouroViaCep}, ${numeroPredial}, ${cidade}, ${uf}, Brasil`)
  }
  if (endereco && cidade) {
    tentativas.push(`${endereco}, ${cidade}, Brasil`)
  }
  if (logradouroViaCep && bairroViaCep && cidade) {
    tentativas.push(`${logradouroViaCep}, ${bairroViaCep}, ${cidade}, ${uf}, Brasil`)
  }
  if (logradouroViaCep && cidade) {
    tentativas.push(`${logradouroViaCep}, ${cidade}, ${uf}, Brasil`)
  }
  if (endereco) {
    tentativas.push(`${endereco}, Brasil`)
  }
  const cepFormatado = cep.replace(/\D/g, '')
  if (cepFormatado.length === 8) {
    tentativas.push(`${cepFormatado}, ${cidade}, Brasil`)
  }

  // Remove consultas duplicadas mantendo a ordem de especificidade
  const consultasUnicas = [...new Set(tentativas.map((t) => t.replace(/\s+,/g, ',').trim()))]

  for (const consulta of consultasUnicas) {
    const encontrado = await buscarNoNominatim(consulta)
    if (encontrado) {
      return {
        ...encontrado,
        cidade: cidade || undefined,
        uf: uf || undefined,
      }
    }
  }

  throw new Error(
    `Não foi possível localizar as coordenadas para o endereço "${endereco}" (CEP: "${cep}")`,
  )
}

interface RespostaOsrm {
  code?: string
  routes?: Array<{
    distance: number // em metros
    duration: number // em segundos
  }>
}

/**
 * Calcula a distância real em quilômetros percorrendo as vias disponíveis (OSRM / OpenStreetMap).
 * Caso o serviço externo esteja indisponível, utiliza como contingência a distância Haversine
 * ajustada pelo fator empírico de malha viária da dissertação (1.5x).
 */
export async function calcularRotaPelasVias(
  origem: Coordenada,
  destino: Coordenada,
): Promise<ResultadoRotaViaria> {
  const distanciaLinhaRetaKm = arredondar2Casas(calcularDistanciaHaversineKm(origem, destino, 1.0))

  try {
    const coordenadasUrl = `${origem.longitude},${origem.latitude};${destino.longitude},${destino.latitude}`
    const url = `${OSRM_API_URL}/route/v1/driving/${coordenadasUrl}?overview=false`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Geroncio-Delivery-UNIFESP/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
    })

    if (res.ok) {
      const dados = (await res.json()) as RespostaOsrm
      const rota = dados.routes?.[0]
      if (dados.code === 'Ok' && rota && typeof rota.distance === 'number') {
        const distanciaKm = arredondar2Casas(rota.distance / 1000)
        const duracaoMinutos = Math.max(1, Math.round(rota.duration / 60))
        return {
          distanciaKm,
          distanciaLinhaRetaKm,
          duracaoMinutos,
          metodoCalculo: 'rota_viaria',
        }
      }
    }
  } catch {
    // Em caso de falha de rede no servidor OSRM, prossegue para o fallback da dissertação
  }

  const distanciaEstimadaKm = arredondar2Casas(
    calcularDistanciaHaversineKm(origem, destino, FATOR_CORRECAO_VIARIA_TESE),
  )
  const duracaoEstimadaMin = Math.max(
    1,
    Math.round((distanciaEstimadaKm / VELOCIDADE_MEDIA_URBANA_KMPH) * 60),
  )

  return {
    distanciaKm: distanciaEstimadaKm,
    distanciaLinhaRetaKm,
    duracaoMinutos: duracaoEstimadaMin,
    metodoCalculo: 'contingencia_haversine',
  }
}

/**
 * Aplica as regras de entrega definidas pelo restaurante sobre a distância calculada pelas vias.
 * Baseado na equação da tese: taxa = taxaEntregaBase + custoPorKmAdicional * max(0, distanciaKm - kmInclusosTaxaBase)
 */
export function calcularTaxaEntregaRestaurante(
  distanciaKm: number,
  regras: RegrasEntregaRestaurante,
): ResultadoCalculoTaxa {
  const kmExcedente = arredondar2Casas(Math.max(0, distanciaKm - regras.kmInclusosTaxaBase))

  if (
    regras.distanciaMaximaKm !== undefined &&
    regras.distanciaMaximaKm !== null &&
    distanciaKm > regras.distanciaMaximaKm
  ) {
    return {
      dentroDaAreaEntrega: false,
      taxaEntrega: null,
      kmExcedente,
      motivoRecusa: `A distância da rota (${distanciaKm} km) ultrapassa o limite máximo de entrega do restaurante (${regras.distanciaMaximaKm} km)`,
    }
  }

  const valorBruto = regras.taxaEntregaBase + regras.custoPorKmAdicional * kmExcedente

  return {
    dentroDaAreaEntrega: true,
    taxaEntrega: arredondar2Casas(valorBruto),
    kmExcedente,
  }
}

/**
 * Coordenadas do restaurante (origem das entregas). Geocodifica pelo endereço na primeira vez
 * e salva latitude/longitude no cadastro para as próximas consultas.
 */
export async function obterCoordenadasRestaurante(restaurante: {
  id: number
  endereco: string
  cep: string
  cidade: string
  latitude: number | null
  longitude: number | null
}): Promise<Coordenada> {
  if (restaurante.latitude !== null && restaurante.longitude !== null) {
    return { latitude: restaurante.latitude, longitude: restaurante.longitude }
  }

  if (!restaurante.endereco.trim() && !restaurante.cep.trim()) {
    throw new Error(
      'Endereço do restaurante não cadastrado. Preencha o endereço em Configurações → Estabelecimento',
    )
  }

  // Mensagem própria: o problema é o cadastro do restaurante, não o endereço do cliente
  const geo = await obterCoordenadasEndereco({
    endereco: restaurante.endereco,
    cep: restaurante.cep,
    cidade: restaurante.cidade,
  }).catch(() => {
    throw new Error(
      `Endereço do restaurante não localizado no mapa ("${restaurante.endereco}", CEP "${restaurante.cep}"). Corrija o cadastro ou informe latitude e longitude nas regras de entrega`,
    )
  })
  const coordenada = { latitude: geo.latitude, longitude: geo.longitude }
  await db.restaurante.update({ where: { id: restaurante.id }, data: coordenada })
  return coordenada
}

export interface ResultadoRotaComParadas {
  distanciaKm: number
  duracaoMinutos: number
  /** Traçado da rota como [latitude, longitude], na ordem do percurso. */
  geometria: Array<[number, number]>
  metodoCalculo: 'rota_viaria' | 'contingencia_haversine'
}

interface RespostaOsrmComGeometria {
  code?: string
  routes?: Array<{ distance: number; duration: number; geometry?: { coordinates: Array<[number, number]> } }>
}

/**
 * Rota pelas vias passando por todos os pontos na ordem informada (OSRM, perfil de carro).
 * Sem OSRM, liga os pontos em linha reta e estima com o fator viário da dissertação.
 */
export async function calcularRotaComParadas(pontos: Coordenada[]): Promise<ResultadoRotaComParadas> {
  if (pontos.length < 2) throw new Error('A rota precisa de ao menos dois pontos')

  try {
    const coordenadasUrl = pontos.map((p) => `${p.longitude},${p.latitude}`).join(';')
    const res = await fetch(`${OSRM_API_URL}/route/v1/driving/${coordenadasUrl}?overview=full&geometries=geojson`, {
      headers: { 'User-Agent': 'Geroncio-Delivery-UNIFESP/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
    })
    if (res.ok) {
      const dados = (await res.json()) as RespostaOsrmComGeometria
      const rota = dados.routes?.[0]
      if (dados.code === 'Ok' && rota && rota.geometry) {
        return {
          distanciaKm: arredondar2Casas(rota.distance / 1000),
          duracaoMinutos: Math.max(1, Math.round(rota.duration / 60)),
          // O GeoJSON vem como [longitude, latitude]
          geometria: rota.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
          metodoCalculo: 'rota_viaria',
        }
      }
    }
  } catch {
    // Falha de rede no OSRM: segue para a estimativa
  }

  let distanciaKm = 0
  for (let i = 0; i < pontos.length - 1; i++) {
    distanciaKm += calcularDistanciaHaversineKm(pontos[i]!, pontos[i + 1]!, FATOR_CORRECAO_VIARIA_TESE)
  }
  distanciaKm = arredondar2Casas(distanciaKm)
  return {
    distanciaKm,
    duracaoMinutos: Math.max(1, Math.round((distanciaKm / VELOCIDADE_MEDIA_URBANA_KMPH) * 60)),
    geometria: pontos.map((p) => [p.latitude, p.longitude]),
    metodoCalculo: 'contingencia_haversine',
  }
}

/**
 * Fluxo completo de cotação de entrega para um restaurante e um endereço de destino:
 * 1. Identifica o endereço/coordenadas do restaurante (e salva em cache no banco se ainda não tinha lat/lon).
 * 2. Identifica/geocodifica o endereço de entrega do cliente.
 * 3. Calcula a distância da rota pelas vias disponíveis (e a distância em linha reta para comparação).
 * 4. Aplica as regras de cobrança configuradas pelo restaurante.
 */
export async function cotarFreteRestaurante(
  restauranteId: number,
  destino: EntradaDestinoCotacao,
): Promise<ResultadoCotacaoFrete> {
  const restaurante = await db.restaurante.findUnique({ where: { id: restauranteId } })
  if (!restaurante) {
    throw new Error('Restaurante não encontrado')
  }

  // 1. Coordenadas de origem (Restaurante)
  const coordOrigem = await obterCoordenadasRestaurante(restaurante)

  // 2. Coordenadas de destino (Cliente)
  let coordDestino: Coordenada
  if (
    destino.latitude !== undefined &&
    destino.latitude !== null &&
    destino.longitude !== undefined &&
    destino.longitude !== null &&
    !isNaN(Number(destino.latitude)) &&
    !isNaN(Number(destino.longitude))
  ) {
    coordDestino = {
      latitude: Number(destino.latitude),
      longitude: Number(destino.longitude),
    }
  } else {
    const geoDestino = await obterCoordenadasEndereco({
      endereco: destino.enderecoDestino,
      cep: destino.cepDestino,
      cidade: destino.cidadeDestino || restaurante.cidade,
    })
    coordDestino = { latitude: geoDestino.latitude, longitude: geoDestino.longitude }
  }

  // 3. Rota pelas vias disponíveis
  const rota = await calcularRotaPelasVias(coordOrigem, coordDestino)

  // 4. Regras de cobrança do restaurante
  const regras = {
    taxaEntregaBase: Number(restaurante.taxaEntregaBase),
    kmInclusosTaxaBase: restaurante.kmInclusosTaxaBase,
    custoPorKmAdicional: Number(restaurante.custoPorKmAdicional),
    distanciaMaximaKm: restaurante.distanciaMaximaKm,
  }

  const calculoTaxa = calcularTaxaEntregaRestaurante(rota.distanciaKm, regras)

  return {
    restauranteId: restaurante.id,
    nomeRestaurante: restaurante.nome,
    origem: {
      ...coordOrigem,
      endereco: restaurante.endereco,
      cep: restaurante.cep,
      cidade: restaurante.cidade,
    },
    destino: {
      ...coordDestino,
      enderecoDestino: destino.enderecoDestino ?? '',
      cepDestino: destino.cepDestino ?? '',
    },
    distanciaKm: rota.distanciaKm,
    distanciaLinhaRetaKm: rota.distanciaLinhaRetaKm,
    duracaoEstimadaMinutos: rota.duracaoMinutos,
    metodoCalculo: rota.metodoCalculo,
    dentroDaAreaEntrega: calculoTaxa.dentroDaAreaEntrega,
    taxaEntrega: calculoTaxa.taxaEntrega,
    kmExcedente: calculoTaxa.kmExcedente,
    ...(calculoTaxa.motivoRecusa && { motivoRecusa: calculoTaxa.motivoRecusa }),
    regrasAplicadas: regras,
  }
}

