import { db } from '@geroncio/shared-db'
import { obterAdapter, processarNotificacao, type Plataforma } from './routes'

const TAMANHO_LOTE = 20
const MAX_TENTATIVAS = 10
const INTERVALO_PADRAO_MS = 5_000
const TEMPO_DE_POSSE_MS = 2 * 60_000

let emExecucao = false

function atrasoPara(tentativa: number) {
  // 5 s, 10 s, 20 s ... até cinco minutos entre tentativas.
  return Math.min(5_000 * 2 ** Math.max(0, tentativa - 1), 5 * 60_000)
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message : String(erro)
}

/**
 * Processa eventos já persistidos. O claim com updateMany permite mais de uma
 * instância da API sem que ambas trabalhem no mesmo evento ao mesmo tempo.
 */
export async function processarEventosPendentes() {
  if (emExecucao) return
  emExecucao = true

  try {
    const agora = new Date()
    const posseExpiradaEm = new Date(agora.getTime() - TEMPO_DE_POSSE_MS)
    const eventos = await db.eventoIntegracao.findMany({
      where: {
        OR: [
          { status: { in: ['pendente', 'falhou'] }, proximaTentativaEm: { lte: agora } },
          { status: 'processando', processamentoIniciadoEm: { lt: posseExpiradaEm } },
        ],
      },
      orderBy: { criadoEm: 'asc' },
      take: TAMANHO_LOTE,
    })

    for (const evento of eventos) {
      const inicioProcessamento = new Date()
      const posseAnteriorExpiradaEm = new Date(inicioProcessamento.getTime() - TEMPO_DE_POSSE_MS)
      const claim = await db.eventoIntegracao.updateMany({
        where: {
          id: evento.id,
          OR: [
            { status: { in: ['pendente', 'falhou'] }, proximaTentativaEm: { lte: inicioProcessamento } },
            { status: 'processando', processamentoIniciadoEm: { lt: posseAnteriorExpiradaEm } },
          ],
        },
        data: {
          status: 'processando',
          tentativas: { increment: 1 },
          processamentoIniciadoEm: inicioProcessamento,
        },
      })
      if (claim.count === 0) continue

      const tentativa = evento.tentativas + 1
      const plataforma = evento.plataforma as Plataforma
      const adapter = obterAdapter(plataforma)

      try {
        if (!adapter) throw new Error(`Plataforma não suportada: ${evento.plataforma}`)
        // Rappi e Uber Eats mandam dados do pedido no próprio webhook (o pedido completo ou o
        // resource_href). Eles só existem no payload gravado, então a notificação é extraída de novo.
        const original = adapter.extrairNotificacoes(evento.payload)
          .find((notificacao) => notificacao.pedidoIdExterno === evento.pedidoIdExterno)
        await processarNotificacao(plataforma, adapter, {
          eventoId: evento.eventoId,
          pedidoIdExterno: evento.pedidoIdExterno,
          lojaIdExterno: evento.lojaIdExterno ?? undefined,
          tipo: evento.tipo,
          pedido: original?.pedido,
        }, evento.id)
      } catch (erro) {
        const esgotouTentativas = tentativa >= MAX_TENTATIVAS
        const mensagem = mensagemErro(erro)
        const resultado = await db.eventoIntegracao.updateMany({
          // Não sobrescreve a tentativa de outra instância que tenha retomado
          // este evento depois de a posse expirar.
          where: {
            id: evento.id,
            status: 'processando',
            processamentoIniciadoEm: inicioProcessamento,
          },
          data: {
            status: esgotouTentativas ? 'erro' : 'falhou',
            ultimoErro: mensagem,
            proximaTentativaEm: new Date(Date.now() + atrasoPara(tentativa)),
            processamentoIniciadoEm: null,
          },
        })
        if (resultado.count > 0) {
          console.error(`[${plataforma}] Erro ao processar pedido ${evento.pedidoIdExterno}: ${mensagem}`)
        }
      }
    }
  } finally {
    emExecucao = false
  }
}

/** Inicia a leitura periódica da fila e devolve uma função para interrompê-la. */
export function iniciarProcessadorEventos() {
  const configurado = Number(process.env.INTERVALO_PROCESSADOR_EVENTOS_MS)
  const intervalo = Number.isFinite(configurado) && configurado > 0 ? configurado : INTERVALO_PADRAO_MS
  const executar = () => {
    void processarEventosPendentes().catch((erro) => {
      console.error('[integracao] Erro no processador de eventos:', erro)
    })
  }

  executar()
  const timer = setInterval(executar, intervalo)
  timer.unref()
  return () => clearInterval(timer)
}
