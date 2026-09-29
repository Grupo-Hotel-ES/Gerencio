// src/webhooks/store-authorization/index.ts
//
// Mock do webhook: POST storeAuthorizationNotification (Event ID: 1301)
// Doc oficial: https://api-docs.mykeeta.com/apis/standard/basic/webhooks/storeauthorizationnotification.md
//
// QUANDO O KEETA DISPARA ISSO NA VIDA REAL:
//   Quando o merchant adiciona uma loja nova à lista de lojas autorizadas
//   de uma marca já existente (ex: ele abriu uma segunda filial e vinculou
//   ela ao mesmo app). opType é sempre 0 nesse evento.
//
// ROTA DE GATILHO DESTE MOCK:
//   POST /webhooks/trigger/store-authorization
//   Body: {
//     "targetUrl": "http://localhost:3333/webhooks/store-authorization",
//     "shopId": 145541,          // opcional, usa um valor de exemplo se omitido
//     "shopName": "Loja Centro"  // opcional
//   }

import { Router, type Request, type Response } from 'express'
import { dispatchWebhook, triggerResponseBody } from '../dispatch.js'
import type { StoreAuthorizationPayload } from '../../types.js'

const router = Router()

router.post('/webhooks/trigger/store-authorization', async (req: Request, res: Response) => {
  const { targetUrl, shopId, shopName, authId } = req.body as {
    targetUrl?: string
    shopId?: number
    shopName?: string
    authId?: string
  }

  if (!targetUrl) {
    return res.status(400).json({ code: 400, message: 'Campo "targetUrl" é obrigatório.' })
  }

  const payload: StoreAuthorizationPayload = {
    appId: 3762772727,
    shopId: shopId ?? 145541,
    shopName: shopName ?? 'Downtown Store',
    authId: authId ?? 'auth_20240324_001',
    createTime: Date.now(),
    opType: 0,
  }

  const result = await dispatchWebhook({
    targetUrl,
    eventName: 'storeAuthorizationNotification',
    payload,
  })

  const status = result.delivered ? 200 : 502
  return res.status(status).json({ ...triggerResponseBody(result), debug: result })
})

export default router
