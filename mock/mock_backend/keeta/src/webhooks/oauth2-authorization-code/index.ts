// src/webhooks/oauth2-authorization-code/index.ts
//
// Mock do webhook: POST oauth2AuthorizationCodeNotification (Event ID: 1)
// Doc oficial: https://api-docs.mykeeta.com/apis/standard/basic/webhooks/oauth2authorizationcodenotification.md
//
// QUANDO O KEETA DISPARA ISSO NA VIDA REAL:
//   Quando um merchant (dono de loja) termina o processo de autorização
//   (fluxo tipo OAuth2) no painel do Keeta. O Keeta manda um "code" de
//   uso único que o backend do vendor precisa trocar por um access token
//   em até 10 minutos.
//
// ROTA DE GATILHO DESTE MOCK:
//   POST /webhooks/trigger/oauth2-authorization-code
//   Body: { "targetUrl": "http://localhost:3333/webhooks/oauth2-authorization-code" }
//
//   targetUrl = endereço do SEU backend real que vai receber a notificação.
//   Se você não passar targetUrl, o mock não sabe para onde mandar — por
//   isso esse campo é obrigatório na chamada ao mock (ele não existe no
//   payload real do Keeta; é só para o simulador saber o destino).

import { Router, type Request, type Response } from 'express'
import { dispatchWebhook, triggerResponseBody } from '../dispatch.js'
import type { Oauth2AuthorizationCodePayload } from '../../types.js'

const router = Router()

router.post('/webhooks/trigger/oauth2-authorization-code', async (req: Request, res: Response) => {
  const { targetUrl } = req.body as { targetUrl?: string }

  if (!targetUrl) {
    return res.status(400).json({ code: 400, message: 'Campo "targetUrl" é obrigatório.' })
  }

  const payload: Oauth2AuthorizationCodePayload = {
    code: '99bf245fb49d4c319d31f64ac983c654',
    state: req.body.state, // opcional, repassado se o chamador quiser simular
    appId: 1933049627,
    timestamp: Date.now(),
    // Assinatura fake — na vida real o Keeta calcula um HMAC de verdade
    // sobre o payload usando uma chave secreta combinada com o vendor.
    // Aqui só preenchemos com um valor de exemplo para não quebrar
    // validações de "campo presente" no backend que está sendo testado.
    sig: '831b9c1741991f747042c75e3864b52c13ffbef68ea5f82a591643f57d24d610',
  }

  const result = await dispatchWebhook({
    targetUrl,
    eventName: 'oauth2AuthorizationCodeNotification',
    payload,
  })

  const status = result.delivered ? 200 : 502
  return res.status(status).json({ ...triggerResponseBody(result), debug: result })
})

export default router
