import { db } from '@geroncio/shared-db'
import type { Plataforma } from './routes'

// Envia o estoque e o preço do Gerêncio para cada produto vinculado nas plataformas de delivery.
//
// O Gerêncio é a fonte da verdade depois da vinculação: a cada volta, os valores atuais de cada
// MapeamentoApp são comparados com o último envio e só o que mudou é mandado (pedido novo,
// aceite, cancelamento, ajuste manual, edição de preço ou vínculo novo). Enviar o valor absoluto
// torna o reenvio inofensivo. O estado fica em memória: ao reiniciar a API, tudo é enviado de novo.
//
// A baixa no Gerêncio acontece no aceite. Até lá, os pedidos já pagos nas plataformas (status
// "novo") ficam reservados: as plataformas recebem o saldo menos essa reserva, então a venda num
// app reduz o estoque mostrado em todos os outros assim que o pedido chega.
//
// Produto excluído no Gerêncio (arquivado) continua vinculado e vai com estoque zero: aparece como
// indisponível nas plataformas, sem sumir delas. O caminho inverso fica em aplicarAlteracaoDaPlataforma:
// estoque ou preço mudado no portal da plataforma atualiza o Gerêncio, que repassa a todas.

const INTERVALO_PADRAO_MS = 3_000
const TEMPO_LIMITE_MS = 5_000

export const NOME_PLATAFORMA: Record<Plataforma, string> = {
  ifood: 'iFood',
  rappi: 'Rappi',
  ubereats: 'Uber Eats',
  '99food': '99 Food',
  keeta: 'Keeta',
}

const PLATAFORMAS: Record<string, Plataforma> = {
  ifood: 'ifood', rappi: 'rappi', ubereats: 'ubereats', uber: 'ubereats', '99food': '99food', '99': '99food', keeta: 'keeta',
}

/** Mapeamentos antigos podem ter sido gravados como "IFOOD" ou "Uber Eats". */
export function normalizarPlataforma(valor: string | undefined): Plataforma | null {
  if (!valor) return null
  return PLATAFORMAS[valor.trim().toLowerCase().replace(/[\s_-]+/g, '')] ?? null
}

type Valores = { quantidade: number; precoCentavos: number }

type Estado = {
  produtoId: number
  plataforma: Plataforma
  idExterno: string
  enviado: Valores | null
  sincronizadoEm: Date | null
  erro: string | null
  tentativas: number
  proximaTentativaEm: number
}

const estados = new Map<number, Estado>()
let reservasAtuais = new Map<number, number>()
let forcarTudo = true
let emExecucao = false
let voltaPendente = false

/** URL da API das plataformas (o mock, em desenvolvimento). */
function urlPlataformas() {
  return (process.env.MOCK_API_URL ?? 'http://localhost:3333').replace(/\/$/, '')
}

async function chamarPlataforma(caminho: string, init: RequestInit) {
  const resposta = await fetch(`${urlPlataformas()}${caminho}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  })
  const corpo = await resposta.json().catch(() => null) as { erro?: string } | null
  if (!resposta.ok) throw new Error(corpo?.erro ?? `A plataforma respondeu ${resposta.status}`)
  return corpo
}

const PEDIDO_RESERVADO = { status: 'novo' as const, estoqueBaixado: false, app: { in: Object.keys(NOME_PLATAFORMA) } }

/** Unidades em pedidos de plataforma já pagos que o restaurante ainda não aceitou, por produto. */
async function calcularReservas() {
  const grupos = await db.itemPedido.groupBy({
    by: ['produtoId'],
    where: { pedido: PEDIDO_RESERVADO },
    _sum: { quantidade: true },
  })
  return new Map(grupos.map((grupo) => [grupo.produtoId, grupo._sum.quantidade ?? 0]))
}

async function enviar(plataforma: Plataforma, idExterno: string, valores: Valores) {
  await chamarPlataforma(`/catalogo/${plataforma}/${encodeURIComponent(idExterno)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...valores, origem: 'gerencio' }),
  })
}

function atraso(tentativas: number) {
  // 5 s, 10 s, 20 s ... até um minuto entre tentativas.
  return Math.min(5_000 * 2 ** Math.max(0, tentativas - 1), 60_000)
}

function mensagemErro(erro: unknown) {
  if (erro instanceof Error && (erro.name === 'TimeoutError' || erro.message === 'fetch failed')) {
    return 'Plataforma indisponível no momento'
  }
  return erro instanceof Error ? erro.message : String(erro)
}

/** Uma volta da sincronização. Pode ser chamada a qualquer momento; voltas simultâneas são ignoradas. */
export async function sincronizarEstoque() {
  if (emExecucao) return
  emExecucao = true
  const forcar = forcarTudo
  forcarTudo = false
  try {
    const mapeamentos = await db.mapeamentoApp.findMany({
      include: { produto: { select: { quantidade: true, preco: true, arquivadoEm: true } } },
      orderBy: { id: 'asc' },
    })
    const reservas = await calcularReservas()
    reservasAtuais = reservas

    // Vínculo removido no Gerêncio. Se o ID passou para outro produto, a plataforma continua vinculada.
    // Desvínculo manual: a plataforma volta a controlar o saldo. Produto apagado: fica indisponível lá.
    const atuais = new Set(mapeamentos.map((m) => m.id))
    const destinos = new Set(mapeamentos.map((m) => `${normalizarPlataforma(m.plataforma)}:${m.idExternoApp}`))
    for (const [id, estado] of estados) {
      if (atuais.has(id)) continue
      estados.delete(id)
      if (destinos.has(`${estado.plataforma}:${estado.idExterno}`)) continue
      const produtoExiste = await db.produto.count({ where: { id: estado.produtoId } }) > 0
      const caminho = `/catalogo/${estado.plataforma}/${encodeURIComponent(estado.idExterno)}/vinculo${produtoExiste ? '' : '?zerarEstoque=1'}`
      await chamarPlataforma(caminho, { method: 'DELETE' }).catch(() => undefined)
    }

    const agora = Date.now()
    for (const mapeamento of mapeamentos) {
      const plataforma = normalizarPlataforma(mapeamento.plataforma)
      if (!plataforma) continue
      const desejado: Valores = {
        quantidade: mapeamento.produto.arquivadoEm
          ? 0
          : Math.max(0, mapeamento.produto.quantidade - (reservas.get(mapeamento.produtoId) ?? 0)),
        precoCentavos: mapeamento.produto.preco.mul(100).round().toNumber(),
      }
      const anterior = estados.get(mapeamento.id)
      const mesmoDestino = anterior?.plataforma === plataforma && anterior.idExterno === mapeamento.idExternoApp
      const jaEnviado = mesmoDestino && anterior.enviado?.quantidade === desejado.quantidade &&
        anterior.enviado.precoCentavos === desejado.precoCentavos
      if (jaEnviado && !forcar) continue
      if (mesmoDestino && anterior.erro && anterior.proximaTentativaEm > agora && !forcar) continue

      const estado: Estado = mesmoDestino ? anterior : {
        produtoId: mapeamento.produtoId, plataforma, idExterno: mapeamento.idExternoApp,
        enviado: null, sincronizadoEm: null, erro: null, tentativas: 0, proximaTentativaEm: 0,
      }
      estados.set(mapeamento.id, estado)
      try {
        await enviar(plataforma, mapeamento.idExternoApp, desejado)
        Object.assign(estado, { enviado: desejado, sincronizadoEm: new Date(), erro: null, tentativas: 0, proximaTentativaEm: 0 })
      } catch (erro) {
        const mensagem = mensagemErro(erro)
        if (estado.erro !== mensagem) {
          console.error(`[estoque] Falha ao sincronizar ${mapeamento.idExternoApp} no ${NOME_PLATAFORMA[plataforma]}: ${mensagem}`)
        }
        estado.tentativas += 1
        Object.assign(estado, { enviado: null, erro: mensagem, proximaTentativaEm: Date.now() + atraso(estado.tentativas) })
      }
    }
  } finally {
    emExecucao = false
    if (voltaPendente) {
      voltaPendente = false
      setImmediate(sincronizarLogo)
    }
  }
}

/** Faz uma volta agora; se uma já estiver em andamento, outra começa assim que ela terminar. */
function sincronizarLogo() {
  if (emExecucao) { voltaPendente = true; return }
  void sincronizarEstoque().catch((erro) => console.error('[estoque] Erro na sincronização com as plataformas:', erro))
}

/**
 * Estoque ou preço mudado no portal de uma plataforma, num produto vinculado. O valor digitado lá é
 * o disponível para venda, então o saldo do Gerêncio passa a ser esse valor mais as unidades
 * reservadas em pedidos ainda não aceitos. Um produto excluído no Gerêncio volta ao estoque quando
 * recebe unidades. Devolve null se o ID não estiver vinculado a nenhum produto.
 */
export async function aplicarAlteracaoDaPlataforma(
  plataforma: Plataforma,
  idExterno: string,
  valores: { quantidade?: number; precoCentavos?: number },
) {
  const resultado = await db.$transaction(async (tx) => {
    const mapeamento = await tx.mapeamentoApp.findFirst({
      where: { plataforma: { equals: plataforma, mode: 'insensitive' }, idExternoApp: idExterno },
      include: { produto: true },
    })
    if (!mapeamento) return null
    const { produto } = mapeamento
    const restaurado = Boolean(produto.arquivadoEm) && (valores.quantidade ?? 0) > 0
    let quantidade = produto.quantidade
    if (valores.quantidade !== undefined) {
      const reserva = await tx.itemPedido.aggregate({
        where: { produtoId: produto.id, pedido: PEDIDO_RESERVADO },
        _sum: { quantidade: true },
      })
      quantidade = valores.quantidade + (reserva._sum.quantidade ?? 0)
    }
    const atualizado = await tx.produto.update({
      where: { id: produto.id },
      data: {
        // A versão muda para que um ajuste de saldo aberto no painel seja recusado em vez de sobrescrever.
        ...(valores.quantidade !== undefined && { quantidade, versaoEstoque: { increment: 1 } }),
        ...(valores.precoCentavos !== undefined && { preco: (valores.precoCentavos / 100).toFixed(2) }),
        ...(restaurado && { arquivadoEm: null }),
      },
    })
    return { produto: atualizado, restaurado }
  })
  // Repassa às outras plataformas sem esperar a próxima volta.
  if (resultado) sincronizarLogo()
  return resultado
}

/** Reenvia todos os produtos vinculados na próxima volta (botão "Sincronizar agora"). */
export async function sincronizarTudoAgora() {
  forcarTudo = true
  // Uma volta em andamento não reenvia tudo; espera ela terminar para fazer a forçada.
  for (let espera = 0; emExecucao && espera < 50; espera++) await new Promise((resolve) => setTimeout(resolve, 100))
  await sincronizarEstoque()
}

/** Situação de cada vínculo e as reservas por produto, para a página de Estoque. */
export function situacaoSincronizacao() {
  return {
    vinculos: [...estados.entries()].map(([mapeamentoId, estado]) => ({
      mapeamentoId,
      produtoId: estado.produtoId,
      plataforma: estado.plataforma,
      idExterno: estado.idExterno,
      quantidadeEnviada: estado.enviado?.quantidade ?? null,
      sincronizadoEm: estado.sincronizadoEm,
      erro: estado.erro,
      proximaTentativaEm: estado.erro ? new Date(estado.proximaTentativaEm) : null,
    })),
    reservas: [...reservasAtuais.entries()].map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
  }
}

/** Inicia a sincronização periódica e devolve uma função para interrompê-la. */
export function iniciarSincronizadorEstoque() {
  const configurado = Number(process.env.INTERVALO_SINCRONIZACAO_ESTOQUE_MS)
  const intervalo = Number.isFinite(configurado) && configurado > 0 ? configurado : INTERVALO_PADRAO_MS
  const executar = () => {
    void sincronizarEstoque().catch((erro) => {
      console.error('[estoque] Erro na sincronização com as plataformas:', erro)
    })
  }
  executar()
  const timer = setInterval(executar, intervalo)
  timer.unref()
  return () => clearInterval(timer)
}
