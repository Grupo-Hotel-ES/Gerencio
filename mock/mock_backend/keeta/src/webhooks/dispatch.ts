// src/webhooks/dispatch.ts
//
// Helper compartilhado pelos 4 mocks de webhook (não é uma rota).
//
// CONCEITO IMPORTANTE:
//   Um webhook é uma chamada HTTP que o KEETA faz PARA o backend do
//   restaurante — é o inverso de uma API normal. Por isso não existe
//   "mockar o recebimento" de um webhook: quem recebe é o seu próprio
//   backend real (o `api-restaurantes`, `api-pedidos`, etc.), não o mock.
//
//   O que este mock faz é simular O KEETA DISPARANDO o webhook: você
//   chama uma rota de "gatilho" aqui (ex: POST /webhooks/trigger/store-authorization),
//   informando a URL do SEU backend que deve receber a notificação, e este
//   mock envia um payload realista para lá — exatamente como o Keeta faria.
//
//   Isso permite testar o endpoint que recebe o webhook no seu backend
//   sem precisar que o Keeta de verdade dispare o evento.

import type { WebhookResponse } from '../types.js'

export interface TriggerWebhookInput {
  /** URL do backend do restaurante que vai RECEBER o webhook (ex: http://localhost:3333/webhooks/store-authorization). */
  targetUrl: string
  /** Nome do evento, só para logs no terminal do mock. */
  eventName: string
  /** Corpo (payload) que será enviado, já no formato documentado pelo Keeta. */
  payload: unknown
}

export interface TriggerWebhookResult {
  delivered: boolean
  targetStatus?: number
  targetBody?: unknown
  error?: string
}

/**
 * Envia (via fetch) o payload do webhook para a URL informada, simulando
 * o Keeta chamando o backend do vendor. Não lança exceção — devolve o
 * resultado para a rota decidir como responder ao chamador do mock.
 */
export async function dispatchWebhook({
  targetUrl,
  eventName,
  payload,
}: TriggerWebhookInput): Promise<TriggerWebhookResult> {
  console.log(`[mock-keeta] disparando webhook "${eventName}" para ${targetUrl}`)
  console.log('[mock-keeta] payload:', JSON.stringify(payload, null, 2))

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    let targetBody: unknown
    try {
      targetBody = await response.json()
    } catch {
      targetBody = await response.text()
    }

    return {
      delivered: response.ok,
      targetStatus: response.status,
      targetBody,
    }
  } catch (error) {
    return {
      delivered: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Monta a resposta padrão (envelope code/message) que a rota de gatilho devolve. */
export function triggerResponseBody(result: TriggerWebhookResult): WebhookResponse {
  if (result.delivered) {
    return { code: 0, message: 'Webhook disparado e recebido com sucesso pelo destino.' }
  }
  return {
    code: 1,
    message: result.error
      ? `Falha ao disparar webhook: ${result.error}`
      : `Destino respondeu com status ${result.targetStatus}, esperado 2xx.`,
  }
}
