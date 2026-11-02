import { db, ErroOperacao, mudarStatusPedido, StatusPedido } from '@geroncio/shared-db'

// Evolution API (WhatsApp). Dentro do compose é http://evolution-api:8080; a
// chave é a mesma AUTHENTICATION_API_KEY usada pela Evolution e pelo n8n.
const EVOLUTION_URL = (process.env.EVOLUTION_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const EVOLUTION_CHAVE = process.env.AUTHENTICATION_API_KEY
const EVOLUTION_INSTANCIA = process.env.EVOLUTION_INSTANCIA ?? 'geroncio'

/**
 * Chamado uma única vez, quando um link de pagamento passa para "pago":
 * aceita o pedido (novo → em_preparo, com baixa de estoque) e avisa o cliente
 * no WhatsApp. Falhas aqui só vão para o log: o pagamento já está gravado e
 * o restaurante ainda vê "Pago online" no painel.
 */
export async function aoConfirmarPagamento(pedidoId: number) {
  const aceito = await aceitarPedido(pedidoId)
  await avisarCliente(pedidoId, aceito)
}

async function aceitarPedido(pedidoId: number) {
  try {
    const pedido = await db.pedido.findUnique({ where: { id: pedidoId }, select: { status: true } })
    if (pedido?.status !== StatusPedido.novo) return pedido?.status === StatusPedido.em_preparo
    await db.$transaction((tx) => mudarStatusPedido(tx, pedidoId, StatusPedido.em_preparo))
    console.log(`[pagamento] pedido #${pedidoId} pago e aceito automaticamente`)
    return true
  } catch (error: any) {
    // Ex.: estoque insuficiente (409). O pedido fica "novo" para o restaurante decidir.
    const motivo = error instanceof ErroOperacao ? error.message : error?.message
    console.error(`[pagamento] pedido #${pedidoId} pago, mas não foi aceito: ${motivo}`)
    return false
  }
}

async function avisarCliente(pedidoId: number, aceito: boolean) {
  try {
    const pedido = await db.pedido.findUnique({
      where: { id: pedidoId },
      select: { app: true, cliente: { select: { telefone: true } } },
    })
    const telefone = pedido?.cliente?.telefone?.replace(/\D/g, '')
    if (pedido?.app !== 'whatsapp' || !telefone) return
    if (!EVOLUTION_CHAVE) {
      console.warn('[pagamento] AUTHENTICATION_API_KEY ausente: cliente não avisado no WhatsApp')
      return
    }

    const texto = aceito
      ? `Pagamento do pedido #${pedidoId} confirmado! ✅ Seu pedido já está em preparo.`
      : `Pagamento do pedido #${pedidoId} confirmado! ✅ O restaurante já foi avisado.`

    const resposta = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCIA}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_CHAVE },
      body: JSON.stringify({ number: telefone, text: texto }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!resposta.ok) throw new Error(`Evolution respondeu ${resposta.status}`)

    // Registra o aviso na conversa do chatbot, para a LLM saber que o cliente já foi avisado
    const mensagem = JSON.stringify([{ role: 'assistant', content: JSON.stringify({ acao: 'MENSAGEM', dados: { texto } }) }])
    await db.$executeRaw`UPDATE "SessaoChatbot" SET historico = historico || ${mensagem}::jsonb, atualizado_em = now() WHERE telefone = ${telefone}`
  } catch (error: any) {
    console.error(`[pagamento] pedido #${pedidoId}: não foi possível avisar o cliente: ${error?.message}`)
  }
}
