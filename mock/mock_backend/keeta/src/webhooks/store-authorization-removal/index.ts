// src/webhooks/store-authorization-removal/index.ts
//
// Mock do webhook: POST storeAuthorizationRemovalNotification (Event ID: 1302)
// Doc oficial: https://api-docs.mykeeta.com/apis/standard/basic/webhooks/storeauthorizationremovalnotification.md
//
// QUANDO O KEETA DISPARA ISSO NA VIDA REAL:
//   Quando o merchant remove uma ou mais lojas de uma autorização de marca
//   já existente (mas sem revogar a marca inteira — isso é o próximo
//   webhook, brand-authorization-removal). opType é sempre 2 nesse evento.
//
// ROTA DE GATILHO DESTE MOCK:
//   POST /webhooks/trigger/store-authorization-removal
//   Body: {
//     "targetUrl": "http://localhost:3333/webhooks/store-authorization-removal",
//     "shopId": 145541,
//     "shopName": "Loja Centro"
//   }

import { Router, type Request, type Response } from 'express'
import { dispatchWebhook, triggerResponseBody } from '../dispatch.js'
import type { StoreAuthorizationRemovalPayload } from '../../types.js'

const router = Router()

router.post('/webhooks/trigger/store-authorization-removal', async (req: Request, res: Response) => {
  const { targetUrl, shopId, shopName, authId } = req.body as {
    targetUrl?: string
    shopId?: number
    shopName?: string
    authId?: string
  }

  if (!targetUrl) {
    return res.status(400).json({ code: 400, message: 'Campo "targetUrl" é obrigatório.' })
  }

  const payload: StoreAuthorizationRemovalPayload = {
    appId: '3762772727',
    shopId: shopId ?? 145541,
    shopName: shopName ?? 'Downtown Store',
    authId: authId ?? 'auth_20240324_002',
    createTime: Date.now(),
    opType: 2,
  }

  const result = await dispatchWebhook({
    targetUrl,
    eventName: 'storeAuthorizationRemovalNotification',
    payload,
  })

  const status = result.delivered ? 200 : 502
  return res.status(status).json({ ...triggerResponseBody(result), debug: result })
})

export default router
